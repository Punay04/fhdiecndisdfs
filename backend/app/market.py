"""GB day-ahead market calendar.

All market rules the analytics depend on live here, so changing an assumption (a gate
closure time, the delivery-day boundary, the pilot window) is a one-line change.

* Delivery day D runs from 23:00 UK time on D-1 to 23:00 UK time on D, matching the GB
  day-ahead auctions (EPEX SPOT GB hourly and Nord Pool N2EX).
* The purchase decision for D is made on D-1, before the auction's gate closure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

UK = ZoneInfo("Europe/London")
DELIVERY_DAY_START = time(23, 0)  # UK local, on the day before delivery

# Purchase decisions made in January 2026 -> delivery days 2 Jan .. 1 Feb 2026.
PILOT_FIRST_DECISION_DAY = date(2026, 1, 1)
PILOT_LAST_DECISION_DAY = date(2026, 1, 31)


@dataclass(frozen=True)
class GatePreset:
    id: str
    label: str
    closes_at: time  # UK local time on D-1
    description: str


GATE_PRESETS: dict[str, GatePreset] = {
    "epex": GatePreset(
        id="epex",
        label="EPEX SPOT GB hourly · 09:20",
        closes_at=time(9, 20),
        description="EPEX SPOT GB day-ahead hourly auction, gate closure 09:20 UK time.",
    ),
    "n2ex": GatePreset(
        id="n2ex",
        label="Nord Pool N2EX · 09:50",
        closes_at=time(9, 50),
        description="Nord Pool N2EX GB day-ahead auction, gate closure 09:50 UK time.",
    ),
}
DEFAULT_GATE = "epex"

_CUSTOM_GATE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def resolve_gate(value: str | None) -> GatePreset:
    """Look up a preset id, or accept a custom ``HH:MM`` UK decision time."""
    value = value or DEFAULT_GATE
    if value in GATE_PRESETS:
        return GATE_PRESETS[value]
    match = _CUSTOM_GATE.match(value)
    if not match:
        raise ValueError(f"Unknown gate {value!r}: use one of {sorted(GATE_PRESETS)} or HH:MM")
    closes_at = time(int(match[1]), int(match[2]))
    return GatePreset(
        id=value,
        label=f"Custom · {value}",
        closes_at=closes_at,
        description=f"Custom decision time, {value} UK time on the day before delivery.",
    )


def delivery_window(delivery_day: date) -> tuple[datetime, datetime]:
    """UTC ``[start, end)`` of a delivery day. 23, 24 or 25 hours long across clock changes."""
    start = datetime.combine(delivery_day - timedelta(days=1), DELIVERY_DAY_START, tzinfo=UK)
    end = datetime.combine(delivery_day, DELIVERY_DAY_START, tzinfo=UK)
    return start.astimezone(UTC), end.astimezone(UTC)


def decision_time(delivery_day: date, gate: GatePreset) -> datetime:
    """UTC instant by which the purchase for ``delivery_day`` must be decided."""
    local = datetime.combine(delivery_day - timedelta(days=1), gate.closes_at, tzinfo=UK)
    return local.astimezone(UTC)


def delivery_day_of(ts: datetime) -> date:
    """The delivery day a UTC timestamp belongs to (23:00 UK rolls over to the next day)."""
    return (ts.astimezone(UK) + timedelta(hours=1)).date()


def pilot_delivery_days() -> list[date]:
    first = PILOT_FIRST_DECISION_DAY + timedelta(days=1)
    count = (PILOT_LAST_DECISION_DAY - PILOT_FIRST_DECISION_DAY).days + 1
    return [first + timedelta(days=i) for i in range(count)]
