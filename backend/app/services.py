"""Compose the pure analytics into API responses.

Routes stay thin (parsing and HTTP errors); analytics stay pure (DataFrames in, out). This
module is where the two meet, and where per-gate results are cached: the snapshot is
immutable for the lifetime of the process, so caching by gate id is safe.
"""

from __future__ import annotations

import math
from datetime import date, datetime
from functools import lru_cache
from typing import Any

import pandas as pd

from app import schemas
from app.analytics import metrics
from app.analytics.selection import (
    forecast_vintages,
    forecasts_at_decision,
    forecasts_at_horizon,
    with_actuals,
)
from app.data.store import Dataset, get_dataset, quality_report
from app.market import (
    DEFAULT_GATE,
    GATE_PRESETS,
    PILOT_FIRST_DECISION_DAY,
    PILOT_LAST_DECISION_DAY,
    GatePreset,
    decision_time,
    delivery_window,
    pilot_delivery_days,
    resolve_gate,
)

WORST_DAYS = 5


class NotFoundError(LookupError):
    pass


def _clean(value: Any) -> Any:
    """Make a DataFrame cell JSON-friendly: numpy -> python, NaN -> None, MW to 2 dp."""
    if hasattr(value, "item") and not isinstance(value, pd.Timestamp):
        value = value.item()
    if isinstance(value, float):
        return None if math.isnan(value) else round(value, 2)
    return value


def records(df: pd.DataFrame) -> list[dict[str, Any]]:
    return [{k: _clean(v) for k, v in row.items()} for row in df.to_dict("records")]


def gate_schema(gate: GatePreset) -> schemas.Gate:
    return schemas.Gate(
        id=gate.id,
        label=gate.label,
        closes_at=gate.closes_at.strftime("%H:%M"),
        description=gate.description,
    )


def summary_schema(joined: pd.DataFrame) -> schemas.Summary:
    return schemas.Summary(**{k: _clean(v) for k, v in metrics.summary(joined).items()})


def pilot_window() -> tuple[datetime, datetime]:
    days = pilot_delivery_days()
    return delivery_window(days[0])[0], delivery_window(days[-1])[1]


@lru_cache(maxsize=32)
def _pilot_joined(gate_id: str) -> pd.DataFrame:
    dataset = get_dataset()
    selected = forecasts_at_decision(
        dataset.forecasts, resolve_gate(gate_id), pilot_delivery_days()
    )
    return with_actuals(selected, dataset.actuals_hourly)


@lru_cache(maxsize=32)
def _pilot_band(gate_id: str) -> schemas.RatioBand:
    return schemas.RatioBand(**metrics.ratio_quantiles(_pilot_joined(gate_id)))


def get_meta() -> schemas.Meta:
    dataset = get_dataset()
    return schemas.Meta(
        first_decision_day=PILOT_FIRST_DECISION_DAY,
        last_decision_day=PILOT_LAST_DECISION_DAY,
        delivery_days=pilot_delivery_days(),
        gates=[gate_schema(g) for g in GATE_PRESETS.values()],
        default_gate=DEFAULT_GATE,
        snapshot=schemas.Snapshot(**{k: dataset.meta.get(k) for k in ("fetched_at", "source")}),
        quality=schemas.Quality(**quality_report(dataset)),
    )


def get_decision(day: date, gate: GatePreset) -> schemas.Decision:
    if day not in pilot_delivery_days():
        raise NotFoundError(f"{day} is not a delivery day in the January 2026 pilot")
    dataset = get_dataset()
    start, end = delivery_window(day)
    joined = _pilot_joined(gate.id)
    day_rows = joined[joined["delivery_day"] == day]
    if day_rows.empty:
        raise NotFoundError(f"No forecast was published before the {gate.label} gate for {day}")

    band = _pilot_band(gate.id)
    day_rows = day_rows.assign(
        firm_mw=day_rows["forecast_mw"] * band.p10,
        expected_mw=day_rows["forecast_mw"] * band.p50,
        upper_mw=day_rows["forecast_mw"] * band.p90,
    )
    has_all_actuals = day_rows["actual_mw"].notna().all()
    totals = schemas.DecisionTotals(
        forecast_mwh=day_rows["forecast_mw"].sum(),
        firm_mwh=day_rows["firm_mw"].sum(),
        expected_mwh=day_rows["expected_mw"].sum(),
        upper_mwh=day_rows["upper_mw"].sum(),
        actual_mwh=day_rows["actual_mw"].sum() if has_all_actuals else None,
        peak_forecast_mw=day_rows["forecast_mw"].max(),
        trough_forecast_mw=day_rows["forecast_mw"].min(),
    )

    half_hourly = dataset.actuals_hh[
        (dataset.actuals_hh["start_time"] >= start) & (dataset.actuals_hh["start_time"] < end)
    ]
    used = set(day_rows["publish_time"])
    vintages = [
        schemas.Vintage(
            publish_time=publish_time,
            used=publish_time in used,
            points=records(group[["start_time", "forecast_mw"]]),
        )
        for publish_time, group in forecast_vintages(dataset.forecasts, day).groupby("publish_time")
    ]
    columns = list(schemas.DecisionHour.model_fields)
    return schemas.Decision(
        delivery_day=day,
        gate=gate_schema(gate),
        decision_time=decision_time(day, gate),
        window=schemas.Window(start=start, end=end),
        publish_times_used=sorted(used),
        band=band,
        totals=totals,
        accuracy=summary_schema(day_rows),
        hours=records(day_rows[columns]),
        actuals_half_hourly=records(half_hourly[["start_time", "actual_mw"]]),
        vintages=vintages,
    )


def get_accuracy(
    gate: GatePreset, first_day: date | None = None, last_day: date | None = None
) -> schemas.Accuracy:
    days = pilot_delivery_days()
    first_day = first_day or days[0]
    last_day = last_day or days[-1]
    if first_day > last_day:
        raise ValueError("'from' must not be after 'to'")

    def in_range(df: pd.DataFrame) -> pd.DataFrame:
        return df[(df["delivery_day"] >= first_day) & (df["delivery_day"] <= last_day)]

    # Bias adjustment needs history from before the range, so compute on the whole pilot.
    adjusted = in_range(metrics.trailing_bias_adjusted(_pilot_joined(gate.id)))
    joined = in_range(_pilot_joined(gate.id))
    daily = metrics.daily(joined)
    baseline = joined[joined["delivery_day"].isin(adjusted["delivery_day"].unique())]

    return schemas.Accuracy(
        gate=gate_schema(gate),
        first_day=first_day,
        last_day=last_day,
        summary=summary_schema(joined),
        band=schemas.RatioBand(**metrics.ratio_quantiles(joined)),
        bias_adjusted=schemas.BiasAdjusted(
            window_days=7,
            lag_days=2,
            baseline=summary_schema(baseline),
            adjusted=summary_schema(adjusted),
        ),
        gate_comparison=[
            schemas.GateComparison(
                gate=gate_schema(preset), summary=summary_schema(in_range(_pilot_joined(preset.id)))
            )
            for preset in GATE_PRESETS.values()
        ],
        daily=records(daily),
        by_hour=records(metrics.by_hour_of_day(joined)),
        by_level=records(metrics.by_forecast_level(joined)),
        histogram=records(metrics.error_histogram(joined)),
        worst_days=records(daily.nlargest(WORST_DAYS, "mae_mw")),
    )


@lru_cache(maxsize=1)
def get_horizon_curve() -> list[schemas.HorizonRow]:
    dataset = get_dataset()
    start, end = pilot_window()
    curve = metrics.horizon_curve(dataset.forecasts, dataset.actuals_hourly, start, end)
    return [schemas.HorizonRow(**row) for row in records(curve)]


def get_series(
    horizon_h: float, start: datetime | None = None, end: datetime | None = None
) -> schemas.Series:
    pilot_start, pilot_end = pilot_window()
    start = start or pilot_start
    end = end or pilot_end
    if start >= end:
        raise ValueError("'start' must be before 'end'")
    dataset: Dataset = get_dataset()
    joined = with_actuals(
        forecasts_at_horizon(dataset.forecasts, horizon_h, start, end), dataset.actuals_hourly
    )
    half_hourly = dataset.actuals_hh[
        (dataset.actuals_hh["start_time"] >= start) & (dataset.actuals_hh["start_time"] < end)
    ]
    return schemas.Series(
        horizon_h=horizon_h,
        window=schemas.Window(start=start, end=end),
        summary=summary_schema(joined),
        points=records(joined[list(schemas.SeriesPoint.model_fields)]),
        actuals_half_hourly=records(half_hourly[["start_time", "actual_mw"]]),
    )
