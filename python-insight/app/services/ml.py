"""Churn model: trains two candidate pipelines, keeps the better one by
cross-validated ROC-AUC, and explains individual predictions."""

import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_score, recall_score, roc_auc_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sqlalchemy import Connection, text

from app.config import settings

NUMERIC = ["monthly_spend", "tenure_months", "support_tickets", "last_login_days", "nps"]
CATEGORICAL = ["segment", "plan"]


def _pipeline(estimator) -> Pipeline:
    pre = ColumnTransformer([("num", StandardScaler(), NUMERIC), ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL)])
    return Pipeline([("pre", pre), ("clf", estimator)])


def load_training_data(conn: Connection) -> pd.DataFrame:
    return pd.read_sql(text(f"SELECT {', '.join(NUMERIC + CATEGORICAL)}, status FROM customers WHERE status != 'lead'"), conn)


def train(df: pd.DataFrame, progress: Callable[[int, str], None] = lambda *_: None) -> dict:
    X, y = df[NUMERIC + CATEGORICAL], (df["status"] == "churned").astype(int)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

    # n_jobs=1: parallelism comes from Celery worker processes; nested thread pools oversubscribe CPUs in containers.
    candidates = {
        "logistic_regression": _pipeline(LogisticRegression(max_iter=1000, class_weight="balanced")),
        "random_forest": _pipeline(RandomForestClassifier(n_estimators=300, max_depth=8, class_weight="balanced", n_jobs=1, random_state=42)),
    }
    scores = {}
    for i, (name, pipe) in enumerate(candidates.items()):
        progress(10 + i * 35, f"Cross-validating {name}")
        scores[name] = float(cross_val_score(pipe, X_train, y_train, cv=5, scoring="roc_auc").mean())
        time.sleep(0.5)  # makes progress visible in the demo UI

    best = max(scores, key=scores.get)
    progress(85, f"Fitting {best} on full training set")
    model = candidates[best].fit(X_train, y_train)

    proba = model.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    metrics = {
        "model": best,
        "cv_roc_auc": {k: round(v, 4) for k, v in scores.items()},
        "test_roc_auc": round(float(roc_auc_score(y_test, proba)), 4),
        "precision": round(float(precision_score(y_test, pred)), 4),
        "recall": round(float(recall_score(y_test, pred)), 4),
        "train_size": int(len(X_train)),
        "test_size": int(len(X_test)),
        "churn_rate": round(float(y.mean()), 4),
        "trained_at": datetime.now(UTC).isoformat(),
    }
    artifact = {"model": model, "metrics": metrics, "medians": X[NUMERIC].median().to_dict()}
    settings.model_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = settings.model_path.with_suffix(".tmp")
    joblib.dump(artifact, tmp)
    tmp.replace(settings.model_path)  # atomic swap — API never reads a half-written file
    progress(100, "Done")
    return metrics


class ModelRegistry:
    """Lazily (re)loads the artifact when the worker writes a new version."""

    def __init__(self, path: Path):
        self.path, self._mtime, self._artifact = path, 0.0, None

    def get(self) -> dict | None:
        if not self.path.exists():
            return None
        mtime = self.path.stat().st_mtime
        if mtime != self._mtime:
            self._artifact, self._mtime = joblib.load(self.path), mtime
        return self._artifact


registry = ModelRegistry(settings.model_path)


def risk_label(p: float) -> str:
    return "high" if p >= 0.6 else "medium" if p >= 0.3 else "low"


def predict(rows: pd.DataFrame) -> np.ndarray:
    artifact = registry.get()
    if artifact is None:
        raise LookupError("Model not trained yet")
    return artifact["model"].predict_proba(rows[NUMERIC + CATEGORICAL])[:, 1]


def explain(row: dict) -> list[dict]:
    """Model-agnostic local explanation: how much does the probability drop
    if this feature were 'typical' (dataset median)?"""
    artifact = registry.get()
    base_df = pd.DataFrame([row])
    base = float(artifact["model"].predict_proba(base_df[NUMERIC + CATEGORICAL])[0, 1])
    drivers = []
    for feature in NUMERIC:
        what_if = base_df.copy()
        what_if[feature] = artifact["medians"][feature]
        delta = base - float(artifact["model"].predict_proba(what_if[NUMERIC + CATEGORICAL])[0, 1])
        drivers.append({"feature": feature, "value": row[feature], "typical": artifact["medians"][feature], "impact": round(delta, 4)})
    return sorted(drivers, key=lambda d: abs(d["impact"]), reverse=True)
