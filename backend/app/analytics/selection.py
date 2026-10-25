"""Which forecast would the trader actually have seen?

Two selection rules, both "latest publish wins" over a filtered set of WINDFOR rows:

* At decision time: for every hour of delivery day D, the latest forecast published at
  or before the gate closure on D-1. This is what the desk really bids on.
* At horizon H: for every target hour T, the latest forecast published at least H hours
  before T. Used to show how accuracy decays with lead time.
"""

from __future__ import annotations

from datetime import date, datetime

import pandas as pd

from app.market import UK, GatePreset, decision_time, delivery_window


def _latest_per_target(candidates: pd.DataFrame) -> pd.DataFrame:
    if candidates.empty:
        return candidates.reset_index(drop=True)
    latest = candidates.loc[candidates.groupby("start_time")["publish_time"].idxmax()]
    return latest.sort_values("start_time").reset_index(drop=True)


def delivery_days_of(start_times: pd.Series) -> pd.Series:
    """Vectorised :func:`app.market.delivery_day_of`."""
    return (start_times.dt.tz_convert(UK) + pd.Timedelta(hours=1)).dt.date


def forecasts_at_decision(
    forecasts: pd.DataFrame, gate: GatePreset, days: list[date] | None = None
) -> pd.DataFrame:
    """Forecast used for each delivery hour, given a gate closure rule.

    Adds ``delivery_day`` and ``decision_time`` columns so callers can show provenance.
    """
    frame = forecasts.assign(delivery_day=delivery_days_of(forecasts["start_time"]))
    if days is not None:
        frame = frame[frame["delivery_day"].isin(days)]
    cutoffs = {day: decision_time(day, gate) for day in frame["delivery_day"].unique()}
    frame = frame.assign(decision_time=frame["delivery_day"].map(cutoffs))
    if not frame.empty:
        frame["decision_time"] = pd.to_datetime(frame["decision_time"], utc=True)
    return _latest_per_target(frame[frame["publish_time"] <= frame["decision_time"]])


def forecast_for_day(forecasts: pd.DataFrame, day: date, gate: GatePreset) -> pd.DataFrame:
    return forecasts_at_decision(forecasts, gate, days=[day])


def forecasts_at_horizon(
    forecasts: pd.DataFrame,
    horizon_h: float,
    start: datetime | None = None,
    end: datetime | None = None,
) -> pd.DataFrame:
    """Latest forecast published at least ``horizon_h`` hours before each target in [start, end)."""
    frame = forecasts[forecasts["horizon_h"] >= horizon_h]
    if start is not None:
        frame = frame[frame["start_time"] >= start]
    if end is not None:
        frame = frame[frame["start_time"] < end]
    return _latest_per_target(frame)


def forecast_vintages(forecasts: pd.DataFrame, day: date) -> pd.DataFrame:
    """Every publish that covered the whole delivery day before it started."""
    start, end = delivery_window(day)
    in_window = forecasts[(forecasts["start_time"] >= start) & (forecasts["start_time"] < end)]
    hours = int((end - start).total_seconds() // 3600)
    coverage = in_window.groupby("publish_time")["start_time"].transform("size")
    return in_window[(coverage == hours) & (in_window["publish_time"] < start)].reset_index(
        drop=True
    )


def with_actuals(selected: pd.DataFrame, actuals_hourly: pd.DataFrame) -> pd.DataFrame:
    """Join hourly actuals and add ``error_mw`` = forecast - actual (positive = over-forecast)."""
    merged = selected.merge(actuals_hourly, on="start_time", how="left")
    return merged.assign(error_mw=merged["forecast_mw"] - merged["actual_mw"])
