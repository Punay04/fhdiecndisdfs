"""Regression checks against the committed Elexon snapshot (values verified on the live API)."""

from datetime import date

from app.analytics.selection import forecast_for_day, forecasts_at_decision
from app.data.store import get_dataset
from app.market import GATE_PRESETS, pilot_delivery_days
from tests.conftest import ts


def test_known_forecast_values_per_gate() -> None:
    forecasts = get_dataset().forecasts
    target = ts("2026-01-16T00:00")
    for gate, publish, value in (
        ("epex", "2026-01-15T07:30", 7398.0),
        ("n2ex", "2026-01-15T09:30", 7472.0),
    ):
        selected = forecast_for_day(forecasts, date(2026, 1, 16), GATE_PRESETS[gate])
        row = selected[selected["start_time"] == target].iloc[0]
        assert row["publish_time"] == ts(publish)
        assert row["forecast_mw"] == value


def test_every_pilot_hour_has_a_forecast_and_actual() -> None:
    dataset = get_dataset()
    selected = forecasts_at_decision(dataset.forecasts, GATE_PRESETS["epex"], pilot_delivery_days())
    assert len(selected) == 31 * 24
    assert selected["start_time"].isin(dataset.actuals_hourly["start_time"]).all()
