from datetime import date

from app.analytics.selection import (
    forecast_for_day,
    forecast_vintages,
    forecasts_at_horizon,
    with_actuals,
)
from app.data.store import prepare_actuals, prepare_forecasts
from app.market import GATE_PRESETS, resolve_gate
from tests.conftest import ts

DAY = date(2026, 1, 16)


def test_epex_gate_uses_the_0730_publish(raw_forecasts) -> None:
    selected = forecast_for_day(prepare_forecasts(raw_forecasts), DAY, GATE_PRESETS["epex"])
    assert len(selected) == 24
    assert set(selected["publish_time"]) == {ts("2026-01-15T07:30")}
    assert selected["start_time"].min() == ts("2026-01-15T23:00")
    assert selected["start_time"].max() == ts("2026-01-16T22:00")


def test_n2ex_gate_picks_up_the_0930_publish(raw_forecasts) -> None:
    selected = forecast_for_day(prepare_forecasts(raw_forecasts), DAY, GATE_PRESETS["n2ex"])
    assert set(selected["publish_time"]) == {ts("2026-01-15T09:30")}
    assert (selected["forecast_mw"] == 2000.0).all()


def test_no_forecast_published_before_gate_gives_empty_result(raw_forecasts) -> None:
    selected = forecast_for_day(prepare_forecasts(raw_forecasts), DAY, resolve_gate("06:00"))
    assert selected.empty


def test_horizon_selection_respects_minimum_lead_time(raw_forecasts) -> None:
    forecasts = prepare_forecasts(raw_forecasts)
    target = ts("2026-01-16T00:00")
    assert forecasts_at_horizon(forecasts, 15, start=target, end=target).empty  # end exclusive

    picked = forecasts_at_horizon(forecasts, 15, start=target)
    first = picked[picked["start_time"] == target].iloc[0]
    assert first["publish_time"] == ts("2026-01-15T07:30")  # 09:30 is only 14.5h ahead

    picked = forecasts_at_horizon(forecasts, 14, start=target)
    assert picked[picked["start_time"] == target].iloc[0]["publish_time"] == ts("2026-01-15T09:30")


def test_vintages_include_every_publish_covering_the_day(raw_forecasts) -> None:
    vintages = forecast_vintages(prepare_forecasts(raw_forecasts), DAY)
    assert vintages["publish_time"].nunique() == 2
    assert len(vintages) == 48


def test_error_is_forecast_minus_actual(raw_forecasts, raw_actuals) -> None:
    _, hourly = prepare_actuals(raw_actuals)
    selected = forecast_for_day(prepare_forecasts(raw_forecasts), DAY, GATE_PRESETS["epex"])
    joined = with_actuals(selected, hourly)
    assert (joined["error_mw"] == 1000.0 - 1600.0).all()
