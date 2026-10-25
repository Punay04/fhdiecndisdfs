from datetime import UTC, date, datetime, time

import pytest

from app.market import (
    GATE_PRESETS,
    decision_time,
    delivery_day_of,
    delivery_window,
    pilot_delivery_days,
    resolve_gate,
)


def test_winter_delivery_window_is_23_to_23_utc() -> None:
    start, end = delivery_window(date(2026, 1, 15))
    assert start == datetime(2026, 1, 14, 23, tzinfo=UTC)
    assert end == datetime(2026, 1, 15, 23, tzinfo=UTC)


def test_summer_delivery_window_shifts_with_bst() -> None:
    start, end = delivery_window(date(2026, 6, 15))
    assert start == datetime(2026, 6, 14, 22, tzinfo=UTC)
    assert end == datetime(2026, 6, 15, 22, tzinfo=UTC)


def test_clock_change_day_is_23_hours() -> None:
    start, end = delivery_window(date(2026, 3, 29))
    assert (end - start).total_seconds() == 23 * 3600


def test_decision_time_is_gate_closure_on_previous_day() -> None:
    assert decision_time(date(2026, 1, 16), GATE_PRESETS["epex"]) == datetime(
        2026, 1, 15, 9, 20, tzinfo=UTC
    )
    assert decision_time(date(2026, 1, 16), GATE_PRESETS["n2ex"]) == datetime(
        2026, 1, 15, 9, 50, tzinfo=UTC
    )


@pytest.mark.parametrize(
    ("ts", "expected"),
    [
        (datetime(2026, 1, 15, 22, 30, tzinfo=UTC), date(2026, 1, 15)),
        (datetime(2026, 1, 15, 23, 0, tzinfo=UTC), date(2026, 1, 16)),
        (datetime(2026, 1, 16, 0, 0, tzinfo=UTC), date(2026, 1, 16)),
    ],
)
def test_delivery_day_of(ts: datetime, expected: date) -> None:
    assert delivery_day_of(ts) == expected


def test_resolve_gate_accepts_presets_and_custom_times() -> None:
    assert resolve_gate(None).id == "epex"
    assert resolve_gate("n2ex").closes_at == time(9, 50)
    assert resolve_gate("10:15").closes_at == time(10, 15)
    with pytest.raises(ValueError):
        resolve_gate("25:00")


def test_pilot_covers_january_decisions() -> None:
    days = pilot_delivery_days()
    assert len(days) == 31
    assert days[0] == date(2026, 1, 2)
    assert days[-1] == date(2026, 2, 1)
