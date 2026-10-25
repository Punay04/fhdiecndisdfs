import pandas as pd

from app.data.store import prepare_actuals, prepare_forecasts
from tests.conftest import ts


def test_forecasts_drop_negative_horizons_and_compute_horizon(raw_forecasts) -> None:
    forecasts = prepare_forecasts(raw_forecasts)
    assert (forecasts["horizon_h"] >= 0).all()
    row = forecasts[
        (forecasts["publish_time"] == ts("2026-01-15T07:30"))
        & (forecasts["start_time"] == ts("2026-01-16T00:00"))
    ]
    assert row["horizon_h"].item() == 16.5


def test_hourly_actual_is_mean_of_two_half_hours(raw_actuals) -> None:
    _, hourly = prepare_actuals(raw_actuals)
    assert len(hourly) == 24
    assert (hourly["actual_mw"] == 1600.0).all()


def test_incomplete_hour_is_left_missing(raw_actuals) -> None:
    _, hourly = prepare_actuals(raw_actuals.iloc[1:])
    first = hourly.iloc[0]
    assert first["start_time"] == ts("2026-01-15T23:00")
    assert pd.isna(first["actual_mw"])


def test_revised_actual_keeps_latest_publish(raw_actuals) -> None:
    revision = raw_actuals.iloc[[0]].assign(
        generation_mw=9999.0, publish_time=ts("2026-01-17T00:00")
    )
    half_hourly, _ = prepare_actuals(pd.concat([raw_actuals, revision]))
    assert len(half_hourly) == len(raw_actuals)
    assert half_hourly.iloc[0]["actual_mw"] == 9999.0
