"""Response models. These double as the API contract mirrored in ``frontend/src/api/types.ts``."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class Gate(BaseModel):
    id: str
    label: str
    closes_at: str  # HH:MM UK local time on the day before delivery
    description: str


class Window(BaseModel):
    start: datetime
    end: datetime


class Summary(BaseModel):
    hours: int
    mae_mw: float | None = None
    rmse_mw: float | None = None
    bias_mw: float | None = None
    nmae_pct: float | None = None
    error_p10_mw: float | None = None
    error_p50_mw: float | None = None
    error_p90_mw: float | None = None
    mean_actual_mw: float | None = None
    mean_forecast_mw: float | None = None


class RatioBand(BaseModel):
    p10: float
    p50: float
    p90: float


class Quality(BaseModel):
    actual_half_hours: int
    missing_actual_half_hours: int
    forecast_publishes: int
    off_schedule_publishes: list[datetime]


class Snapshot(BaseModel):
    fetched_at: datetime | None = None
    source: str | None = None


class Meta(BaseModel):
    first_decision_day: date
    last_decision_day: date
    delivery_days: list[date]
    gates: list[Gate]
    default_gate: str
    snapshot: Snapshot
    quality: Quality


class DecisionHour(BaseModel):
    start_time: datetime
    publish_time: datetime
    horizon_h: float
    forecast_mw: float
    firm_mw: float
    expected_mw: float
    upper_mw: float
    actual_mw: float | None
    error_mw: float | None


class ActualPoint(BaseModel):
    start_time: datetime
    actual_mw: float


class ForecastPoint(BaseModel):
    start_time: datetime
    forecast_mw: float


class Vintage(BaseModel):
    publish_time: datetime
    used: bool
    points: list[ForecastPoint]


class DecisionTotals(BaseModel):
    forecast_mwh: float
    firm_mwh: float
    expected_mwh: float
    upper_mwh: float
    actual_mwh: float | None
    peak_forecast_mw: float
    trough_forecast_mw: float


class Decision(BaseModel):
    delivery_day: date
    gate: Gate
    decision_time: datetime
    window: Window
    publish_times_used: list[datetime]
    band: RatioBand
    totals: DecisionTotals
    accuracy: Summary
    hours: list[DecisionHour]
    actuals_half_hourly: list[ActualPoint]
    vintages: list[Vintage]


class DailyRow(BaseModel):
    delivery_day: date
    mae_mw: float
    bias_mw: float
    forecast_mwh: float
    actual_mwh: float
    hours: int


class HourOfDayRow(BaseModel):
    hour: int
    mae_mw: float
    bias_mw: float


class LevelRow(BaseModel):
    from_mw: float
    to_mw: float | None
    mae_mw: float
    bias_mw: float
    hours: int


class HistogramBin(BaseModel):
    from_mw: float
    to_mw: float
    hours: int


class GateComparison(BaseModel):
    gate: Gate
    summary: Summary


class BiasAdjusted(BaseModel):
    window_days: int
    lag_days: int
    baseline: Summary
    adjusted: Summary


class Accuracy(BaseModel):
    gate: Gate
    first_day: date
    last_day: date
    summary: Summary
    band: RatioBand
    bias_adjusted: BiasAdjusted
    gate_comparison: list[GateComparison]
    daily: list[DailyRow]
    by_hour: list[HourOfDayRow]
    by_level: list[LevelRow]
    histogram: list[HistogramBin]
    worst_days: list[DailyRow]


class HorizonRow(BaseModel):
    horizon_h: float
    hours: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None


class SeriesPoint(BaseModel):
    start_time: datetime
    publish_time: datetime
    horizon_h: float
    forecast_mw: float
    actual_mw: float | None
    error_mw: float | None


class Series(BaseModel):
    horizon_h: float
    window: Window
    summary: Summary
    points: list[SeriesPoint]
    actuals_half_hourly: list[ActualPoint]
