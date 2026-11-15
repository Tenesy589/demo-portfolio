"""Analytics on top of pandas. Functions take a sync SQLAlchemy connection so
they can run in a worker thread via `AsyncSession.run_sync` without blocking
the event loop."""

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sqlalchemy import Connection, text

ORDERS_SQL = text(
    """
    SELECT o.created_at, o.amount, o.product, o.customer_id, c.region, c.segment
    FROM orders o JOIN customers c ON c.id = o.customer_id
    """
)


def _orders(conn: Connection) -> pd.DataFrame:
    df = pd.read_sql(ORDERS_SQL, conn, parse_dates=["created_at"])
    df["created_at"] = df["created_at"].dt.tz_localize(None)
    df["month"] = df["created_at"].dt.to_period("M")
    return df


def _complete(monthly: pd.Series | pd.DataFrame):
    """Drop the first and the current month — both are partial and would skew trends."""
    current = pd.Timestamp.now().to_period("M")
    return monthly.iloc[1:][monthly.index[1:] < current]


def kpis(conn: Connection) -> dict:
    df = _orders(conn)
    customers = pd.read_sql(text("SELECT status FROM customers"), conn)
    monthly = _complete(df.groupby("month")["amount"].sum())
    last, prev = (monthly.iloc[-1], monthly.iloc[-2]) if len(monthly) > 1 else (monthly.sum(), 0)
    paying = customers[customers.status != "lead"]
    return {
        "revenue_total": round(float(df.amount.sum()), 2),
        "revenue_last_month": round(float(last), 2),
        "revenue_growth_pct": round(float((last - prev) / prev * 100), 1) if prev else None,
        "orders": int(len(df)),
        "avg_order_value": round(float(df.amount.mean()), 2) if len(df) else 0,
        "active_customers": int((customers.status == "active").sum()),
        "churn_rate_pct": round(float((paying.status == "churned").mean() * 100), 1) if len(paying) else 0,
    }


def monthly_revenue(conn: Connection) -> list[dict]:
    df = _orders(conn)
    m = _complete(df.groupby("month").agg(revenue=("amount", "sum"), orders=("amount", "size"), customers=("customer_id", "nunique")))
    m["rolling_avg_3m"] = m["revenue"].rolling(3, min_periods=1).mean()
    m.index = m.index.astype(str)
    return m.round(2).reset_index(names="month").to_dict("records")


def breakdown(conn: Connection, by: str) -> list[dict]:
    df = _orders(conn)
    g = df.groupby(by).agg(revenue=("amount", "sum"), orders=("amount", "size")).sort_values("revenue", ascending=False)
    g["share_pct"] = g["revenue"] / g["revenue"].sum() * 100
    return g.round(2).reset_index(names="name").to_dict("records")


def cohorts(conn: Connection, months: int = 12) -> dict:
    """Classic retention matrix: % of each signup cohort still ordering N months later."""
    df = _orders(conn)
    first = df.groupby("customer_id")["month"].min().rename("cohort")
    df = df.join(first, on="customer_id")
    df["age"] = (df["month"] - df["cohort"]).apply(lambda d: d.n)
    counts = df.groupby(["cohort", "age"])["customer_id"].nunique().unstack(fill_value=0)
    retention = counts.div(counts[0], axis=0).mul(100).round(1)
    retention = retention.iloc[-months:, :months]
    return {
        "cohorts": [str(c) for c in retention.index],
        "ages": [int(a) for a in retention.columns],
        "sizes": [int(s) for s in counts.loc[retention.index, 0]],
        "matrix": retention.replace({np.nan: None}).values.tolist(),
    }


def forecast(conn: Connection, horizon: int = 6) -> dict:
    """Linear trend + yearly seasonality (Fourier terms) fit with scikit-learn."""
    m = _complete(_orders(conn).groupby("month")["amount"].sum())

    def features(t: np.ndarray, month_of_year: np.ndarray) -> np.ndarray:
        angle = 2 * np.pi * month_of_year / 12
        return np.column_stack([t, np.sin(angle), np.cos(angle)])

    t = np.arange(len(m))
    model = LinearRegression().fit(features(t, m.index.month.values), m.values)
    residual_std = float(np.std(m.values - model.predict(features(t, m.index.month.values))))

    future = pd.period_range(m.index[-1] + 1, periods=horizon, freq="M")
    pred = model.predict(features(np.arange(len(m), len(m) + horizon), future.month.values))
    return {
        "history": [{"month": str(k), "revenue": round(float(v), 2)} for k, v in m.items()],
        "forecast": [
            {"month": str(k), "revenue": round(float(v), 2), "low": round(float(v - 1.96 * residual_std), 2), "high": round(float(v + 1.96 * residual_std), 2)}
            for k, v in zip(future, pred)
        ],
        "r2": round(float(model.score(features(t, m.index.month.values), m.values)), 3),
    }


def profile_csv(path: str) -> dict:
    """Automatic EDA for an arbitrary CSV."""
    df = pd.read_csv(path)
    numeric = df.select_dtypes("number")
    corr_pairs = []
    if numeric.shape[1] > 1:
        corr = numeric.corr().abs()
        upper = corr.where(np.triu(np.ones(corr.shape, dtype=bool), k=1)).stack().sort_values(ascending=False)
        corr_pairs = [{"a": a, "b": b, "r": round(float(r), 3)} for (a, b), r in upper.head(5).items()]
    return {
        "rows": int(len(df)),
        "columns": [
            {
                "name": col,
                "dtype": str(df[col].dtype),
                "nulls": int(df[col].isna().sum()),
                "unique": int(df[col].nunique()),
                **({"min": float(df[col].min()), "max": float(df[col].max()), "mean": round(float(df[col].mean()), 3)} if col in numeric else {}),
                **({"top": df[col].value_counts().head(3).to_dict()} if col not in numeric else {}),
            }
            for col in df.columns
        ],
        "top_correlations": corr_pairs,
        "duplicate_rows": int(df.duplicated().sum()),
    }
