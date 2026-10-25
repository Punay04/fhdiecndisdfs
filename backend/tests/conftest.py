from __future__ import annotations

import pandas as pd
import pytest


def ts(value: str) -> pd.Timestamp:
    return pd.Timestamp(value, tz="UTC")


@pytest.fixture
def raw_forecasts() -> pd.DataFrame:
    """Two publishes on D-1 (07:30 and 09:30) for delivery day 2026-01-16, plus history rows."""
    rows = []
    for publish, level in (("2026-01-15T07:30", 1000.0), ("2026-01-15T09:30", 2000.0)):
        for start in pd.date_range("2026-01-15T05:00", "2026-01-16T23:00", freq="h", tz="UTC"):
            rows.append({"publish_time": ts(publish), "start_time": start, "generation_mw": level})
    return pd.DataFrame(rows)


@pytest.fixture
def raw_actuals() -> pd.DataFrame:
    starts = pd.date_range("2026-01-15T23:00", "2026-01-16T22:30", freq="30min", tz="UTC")
    return pd.DataFrame(
        {
            "start_time": starts,
            "settlement_date": starts.date,
            "settlement_period": range(1, len(starts) + 1),
            "generation_mw": [1500.0 if i % 2 == 0 else 1700.0 for i in range(len(starts))],
            "publish_time": starts + pd.Timedelta(minutes=30),
        }
    )
