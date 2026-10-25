from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.analytics import metrics


def frame(forecast: list[float], actual: list[float], day: date = date(2026, 1, 16)):
    start = pd.Timestamp("2026-01-15T23:00", tz="UTC")
    return pd.DataFrame(
        {
            "start_time": pd.date_range(start, periods=len(forecast), freq="h"),
            "delivery_day": day,
            "forecast_mw": forecast,
            "actual_mw": actual,
        }
    ).assign(error_mw=lambda df: df["forecast_mw"] - df["actual_mw"])


def test_summary_core_metrics() -> None:
    stats = metrics.summary(frame([110, 90, 130, 100], [100, 100, 100, 100]))
    assert stats["hours"] == 4
    assert stats["mae_mw"] == pytest.approx(12.5)
    assert stats["bias_mw"] == pytest.approx(7.5)
    assert stats["rmse_mw"] == pytest.approx(np.sqrt((100 + 100 + 900 + 0) / 4))
    assert stats["nmae_pct"] == pytest.approx(12.5)


def test_summary_ignores_hours_without_actuals() -> None:
    stats = metrics.summary(frame([110, 500], [100, np.nan]))
    assert stats["hours"] == 1
    assert stats["mae_mw"] == pytest.approx(10)


def test_summary_of_nothing() -> None:
    assert metrics.summary(frame([], [])) == {"hours": 0}


def test_ratio_quantiles_scale_with_forecast() -> None:
    q = metrics.ratio_quantiles(frame([1000.0] * 11, [float(v) for v in range(500, 1600, 100)]))
    assert q["p50"] == pytest.approx(1.0)
    assert q["p10"] == pytest.approx(0.6)


def test_daily_energy_and_error() -> None:
    result = metrics.daily(frame([100.0] * 24, [80.0] * 24))
    row = result.iloc[0]
    assert row["forecast_mwh"] == 2400
    assert row["actual_mwh"] == 1920
    assert row["bias_mw"] == 20


def test_hour_of_day_uses_uk_local_time() -> None:
    result = metrics.by_hour_of_day(frame([100.0, 100.0], [90.0, 80.0]))
    assert result["hour"].tolist() == [0, 23]


def test_error_histogram_counts_every_hour() -> None:
    result = metrics.error_histogram(frame([0, 600, 1200], [0, 0, 0]), bin_mw=500)
    assert result["hours"].sum() == 3


def test_forecast_level_bins_are_open_ended() -> None:
    result = metrics.by_forecast_level(frame([1000, 25000], [900, 20000]))
    assert np.isnan(result["to_mw"].iloc[-1])
    assert result["hours"].sum() == 2


def test_trailing_bias_uses_only_settled_days() -> None:
    days = [date(2026, 1, d) for d in range(2, 9)]
    joined = pd.concat(
        frame([100.0 + 10 * i], [100.0], day=day) for i, day in enumerate(days)
    ).reset_index(drop=True)
    adjusted = metrics.trailing_bias_adjusted(joined, window_days=7, lag_days=2)
    # Delivery day Jan 6 is decided on Jan 5, when Jan 2-4 (biases 0, 10, 20) are settled.
    first = adjusted.iloc[0]
    assert first["delivery_day"] == date(2026, 1, 6)
    assert first["correction_mw"] == pytest.approx(10)
    assert first["error_mw"] == pytest.approx(40 - 10)
