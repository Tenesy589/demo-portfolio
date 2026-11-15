"""Generates a realistic synthetic CRM: churn depends on the features (so the
model has real signal to learn), revenue has growth + seasonality (so the
forecast has something to find)."""

import logging
from datetime import UTC, datetime, timedelta

import numpy as np
from sqlalchemy import insert, select

from app.db import SyncSession, sync_engine
from app.models import Customer, Order, User
from app.security import hash_password
from app.services import ml

log = logging.getLogger("seed")
rng = np.random.default_rng(7)

FIRST = "Olena Taras Maria Andrii Sofia Dmytro Anna Ivan Kateryna Mykola Emma Liam Noah Olivia Ava Lucas Mia Hiro Yuki Carlos".split()
LAST = "Shevchenko Kovalenko Bondarenko Tkachenko Smith Johnson Garcia Müller Rossi Tanaka Silva Novak Dubois Kowalski".split()
COMPANY_A = "Blue Nova Swift Bright Iron Quantum Green Polar Silver Rapid Atlas Vertex".split()
COMPANY_B = "Labs Systems Logistics Foods Health Media Robotics Energy Retail Studio Bank Cloud".split()
REGIONS = ["Europe", "North America", "Asia", "LATAM", "Africa"]
PRODUCTS = {"Analytics Pro": 490, "API Access": 190, "Seats Add-on": 90, "Premium Support": 290, "Data Export": 60, "Onboarding": 990}


def seed(n_customers: int = 800) -> None:
    with SyncSession() as s:
        if s.scalar(select(User).limit(1)):
            log.info("Seed already applied")
            return

        s.add_all(
            [
                User(email="admin@insight.dev", name="Admin Adams", role="admin", hashed_password=hash_password("admin1234")),
                User(email="manager@insight.dev", name="Maria Manager", role="manager", hashed_password=hash_password("manager1234")),
                User(email="viewer@insight.dev", name="Victor Viewer", role="viewer", hashed_password=hash_password("viewer1234")),
            ]
        )

        now = datetime.now(UTC)
        segment = rng.choice(["SMB", "MidMarket", "Enterprise"], n_customers, p=[0.6, 0.3, 0.1])
        plan = np.where(segment == "Enterprise", "enterprise", rng.choice(["basic", "pro"], n_customers, p=[0.55, 0.45]))
        spend = np.round(rng.lognormal(5.5, 0.6, n_customers) * np.select([segment == "Enterprise", segment == "MidMarket"], [6, 2.5], 1), 2)
        tenure = rng.integers(1, 48, n_customers)
        tickets = rng.poisson(2.5, n_customers)
        last_login = rng.exponential(10, n_customers).astype(int)
        nps = np.clip(rng.normal(7, 2, n_customers).round(), 0, 10).astype(int)

        # Ground-truth churn propensity — logistic in the features + noise.
        logit = -1.2 + 0.35 * tickets + 0.06 * last_login - 0.35 * (nps - 7) - 0.04 * tenure - 0.0004 * spend + rng.normal(0, 0.6, n_customers)
        churn = rng.random(n_customers) < 1 / (1 + np.exp(-logit))
        lead = rng.random(n_customers) < 0.08
        status = np.where(lead, "lead", np.where(churn, "churned", "active"))

        rows = []
        for i in range(n_customers):
            first, last = rng.choice(FIRST), rng.choice(LAST)
            company = f"{rng.choice(COMPANY_A)} {rng.choice(COMPANY_B)}"
            rows.append(
                {
                    "name": f"{first} {last}",
                    "email": f"{first.lower()}.{last.lower()}{i}@{company.replace(' ', '').lower()}.com",
                    "company": company,
                    "region": str(rng.choice(REGIONS, p=[0.35, 0.3, 0.2, 0.1, 0.05])),
                    "segment": str(segment[i]),
                    "status": str(status[i]),
                    "plan": str(plan[i]),
                    "monthly_spend": float(spend[i]),
                    "tenure_months": int(tenure[i]),
                    "support_tickets": int(tickets[i]),
                    "last_login_days": int(last_login[i]),
                    "nps": int(nps[i]),
                    "contacts": [{"name": f"{first} {last}", "email": f"{first.lower()}@example.com", "phone": f"+380 67 {rng.integers(100, 999)} {rng.integers(1000, 9999)}", "role": "Decision maker"}],
                    "created_at": now - timedelta(days=int(tenure[i] * 30)),
                }
            )
        ids = s.scalars(insert(Customer).returning(Customer.id), rows).all()

        # Orders: growth trend + Q4 seasonality; churned customers stop ordering.
        orders = []
        names, prices = list(PRODUCTS), np.array(list(PRODUCTS.values()))
        for cid, row in zip(ids, rows):
            if row["status"] == "lead":
                continue
            months_active = row["tenure_months"] if row["status"] == "active" else max(1, row["tenure_months"] // 2)
            for m in range(min(months_active, 24)):
                date = now - timedelta(days=30 * m + int(rng.integers(0, 28)))
                season = 1 + 0.25 * np.cos(2 * np.pi * (date.month - 11) / 12)
                growth = 1 + 0.03 * (24 - m)
                for _ in range(rng.poisson(1.2 * season * growth)):
                    p = int(rng.integers(len(names)))
                    orders.append({"customer_id": cid, "product": names[p], "amount": float(round(prices[p] * rng.uniform(0.8, 1.3), 2)), "created_at": date})
        s.execute(insert(Order), orders)
        s.commit()
        log.info("Seeded %d customers, %d orders", len(rows), len(orders))

    with sync_engine.connect() as conn:
        metrics = ml.train(ml.load_training_data(conn))
    log.info("Initial churn model: %s (ROC-AUC %.3f)", metrics["model"], metrics["test_roc_auc"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed()
