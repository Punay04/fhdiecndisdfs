// Mirrors backend/app/schemas.py. Timestamps are ISO-8601 UTC strings, days are YYYY-MM-DD.

export interface Gate {
  id: string;
  label: string;
  closes_at: string;
  description: string;
}

export interface Window {
  start: string;
  end: string;
}

export interface Summary {
  hours: number;
  mae_mw?: number | null;
  rmse_mw?: number | null;
  bias_mw?: number | null;
  nmae_pct?: number | null;
  error_p10_mw?: number | null;
  error_p50_mw?: number | null;
  error_p90_mw?: number | null;
  mean_actual_mw?: number | null;
  mean_forecast_mw?: number | null;
}

export interface RatioBand {
  p10: number;
  p50: number;
  p90: number;
}

export interface Meta {
  first_decision_day: string;
  last_decision_day: string;
  delivery_days: string[];
  gates: Gate[];
  default_gate: string;
  snapshot: { fetched_at: string | null; source: string | null };
  quality: {
    actual_half_hours: number;
    missing_actual_half_hours: number;
    forecast_publishes: number;
    off_schedule_publishes: string[];
  };
}

export interface DecisionHour {
  start_time: string;
  publish_time: string;
  horizon_h: number;
  forecast_mw: number;
  firm_mw: number;
  expected_mw: number;
  upper_mw: number;
  actual_mw: number | null;
  error_mw: number | null;
}

export interface ActualPoint {
  start_time: string;
  actual_mw: number;
}

export interface Vintage {
  publish_time: string;
  used: boolean;
  points: { start_time: string; forecast_mw: number }[];
}

export interface Decision {
  delivery_day: string;
  gate: Gate;
  decision_time: string;
  window: Window;
  publish_times_used: string[];
  band: RatioBand;
  totals: {
    forecast_mwh: number;
    firm_mwh: number;
    expected_mwh: number;
    upper_mwh: number;
    actual_mwh: number | null;
    peak_forecast_mw: number;
    trough_forecast_mw: number;
  };
  accuracy: Summary;
  hours: DecisionHour[];
  actuals_half_hourly: ActualPoint[];
  vintages: Vintage[];
}

export interface DailyRow {
  delivery_day: string;
  mae_mw: number;
  bias_mw: number;
  forecast_mwh: number;
  actual_mwh: number;
  hours: number;
}

export interface Accuracy {
  gate: Gate;
  first_day: string;
  last_day: string;
  summary: Summary;
  band: RatioBand;
  bias_adjusted: { window_days: number; lag_days: number; baseline: Summary; adjusted: Summary };
  gate_comparison: { gate: Gate; summary: Summary }[];
  daily: DailyRow[];
  by_hour: { hour: number; mae_mw: number; bias_mw: number }[];
  by_level: { from_mw: number; to_mw: number | null; mae_mw: number; bias_mw: number; hours: number }[];
  histogram: { from_mw: number; to_mw: number; hours: number }[];
  worst_days: DailyRow[];
}

export interface HorizonRow {
  horizon_h: number;
  hours: number;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
}

export interface SeriesPoint {
  start_time: string;
  publish_time: string;
  horizon_h: number;
  forecast_mw: number;
  actual_mw: number | null;
  error_mw: number | null;
}

export interface Series {
  horizon_h: number;
  window: Window;
  summary: Summary;
  points: SeriesPoint[];
  actuals_half_hourly: ActualPoint[];
}
