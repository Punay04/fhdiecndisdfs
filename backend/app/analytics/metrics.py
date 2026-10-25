"""Accuracy statistics for forecast-vs-actual frames produced by :mod:`selection`.

Every function takes a frame with ``start_time``, ``forecast_mw``, ``actual_mw`` and
``error_mw`` (forecast - actual, so positive means wind was over-forecast). Hours without
an actual are ignored. Energy figures assume hourly rows: MW x 1h = MWh.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd

from app.analytics.selection import forecasts_at_horizon, with_actuals
from app.market import UK

QUANTILES = (0.1, 0.5, 0.9)
DEFAULT_HORIZONS_H = (0, 1, 2, 4, 6, 8, 12, 16, 20, 24, 30, 36, 42, 48)
FORECAST_LEVEL_EDGES_MW = (0, 4000, 8000, 12000, 16000, 20000, np.inf)


def _scored(joined: pd.DataFrame) -> pd.DataFrame:
    return joined.dropna(subset=["actual_mw", "forecast_mw"])


def summary(joined: pd.DataFrame) -> dict[str, float | int | None]:
    scored = _scored(joined)
    if scored.empty:
        return {"hours": 0}
    error = scored["error_mw"]
    mean_actual = scored["actual_mw"].mean()
    p10, p50, p90 = error.quantile(QUANTILES)
    return {
        "hours": len(scored),
        "mae_mw": error.abs().mean(),
        "rmse_mw": float(np.sqrt((error**2).mean())),
        "bias_mw": error.mean(),
        "nmae_pct": 100 * error.abs().mean() / mean_actual if mean_actual else None,
        "error_p10_mw": p10,
        "error_p50_mw": p50,
        "error_p90_mw": p90,
        "mean_actual_mw": mean_actual,
        "mean_forecast_mw": scored["forecast_mw"].mean(),
    }


def ratio_quantiles(joined: pd.DataFrame) -> dict[str, float]:
    """Quantiles of actual / forecast.

    Multiplying a forecast by these gives an uncertainty band that widens with the forecast
    level, which matches how the error behaves. ``p10`` is the "firm" multiplier: actual wind
    came in at or above ``forecast * p10`` in 9 of 10 hours.
    """
    scored = _scored(joined)
    scored = scored[scored["forecast_mw"] > 0]
    ratio = scored["actual_mw"] / scored["forecast_mw"]
    p10, p50, p90 = ratio.quantile(QUANTILES)
    return {"p10": p10, "p50": p50, "p90": p90}


def daily(joined: pd.DataFrame) -> pd.DataFrame:
    scored = _scored(joined).assign(abs_error=lambda df: df["error_mw"].abs())
    return (
        scored.groupby("delivery_day")
        .agg(
            mae_mw=("abs_error", "mean"),
            bias_mw=("error_mw", "mean"),
            forecast_mwh=("forecast_mw", "sum"),
            actual_mwh=("actual_mw", "sum"),
            hours=("error_mw", "size"),
        )
        .reset_index()
    )


def by_hour_of_day(joined: pd.DataFrame) -> pd.DataFrame:
    scored = _scored(joined)
    hour = scored["start_time"].dt.tz_convert(UK).dt.hour.rename("hour")
    return (
        scored.assign(abs_error=scored["error_mw"].abs())
        .groupby(hour)
        .agg(mae_mw=("abs_error", "mean"), bias_mw=("error_mw", "mean"))
        .reset_index()
    )


def by_forecast_level(joined: pd.DataFrame) -> pd.DataFrame:
    scored = _scored(joined)
    level = pd.cut(scored["forecast_mw"], FORECAST_LEVEL_EDGES_MW, right=False)
    grouped = (
        scored.assign(abs_error=scored["error_mw"].abs())
        .groupby(level, observed=True)
        .agg(
            mae_mw=("abs_error", "mean"),
            bias_mw=("error_mw", "mean"),
            hours=("error_mw", "size"),
        )
    )
    return grouped.assign(
        from_mw=[interval.left for interval in grouped.index],
        to_mw=[
            np.nan if np.isinf(interval.right) else interval.right for interval in grouped.index
        ],
    ).reset_index(drop=True)


def error_histogram(joined: pd.DataFrame, bin_mw: int = 500) -> pd.DataFrame:
    error = _scored(joined)["error_mw"]
    if error.empty:
        return pd.DataFrame(columns=["from_mw", "to_mw", "hours"])
    lo = np.floor(error.min() / bin_mw) * bin_mw
    hi = np.ceil(error.max() / bin_mw) * bin_mw + bin_mw
    counts, edges = np.histogram(error, bins=np.arange(lo, hi, bin_mw))
    return pd.DataFrame({"from_mw": edges[:-1], "to_mw": edges[1:], "hours": counts})


def horizon_curve(
    forecasts: pd.DataFrame,
    actuals_hourly: pd.DataFrame,
    start: datetime,
    end: datetime,
    horizons_h: tuple[float, ...] = DEFAULT_HORIZONS_H,
) -> pd.DataFrame:
    """Accuracy over the same target hours as the minimum forecast lead time grows."""
    rows = []
    for horizon in horizons_h:
        joined = with_actuals(forecasts_at_horizon(forecasts, horizon, start, end), actuals_hourly)
        stats = summary(joined)
        rows.append(
            {
                "horizon_h": horizon,
                "hours": stats["hours"],
                "mae_mw": stats.get("mae_mw"),
                "rmse_mw": stats.get("rmse_mw"),
                "bias_mw": stats.get("bias_mw"),
            }
        )
    return pd.DataFrame(rows)


def trailing_bias_adjusted(
    joined: pd.DataFrame, window_days: int = 7, lag_days: int = 2
) -> pd.DataFrame:
    """Subtract the mean error of recent, fully-settled delivery days from each forecast.

    For delivery day D the decision is taken on D-1, when day D-2 is the latest complete day,
    so ``lag_days=2`` keeps the correction free of look-ahead. Days without enough history
    (fewer than 3 days in the window) are left out.
    """
    daily_bias = daily(joined).set_index("delivery_day")["bias_mw"]
    daily_bias.index = pd.to_datetime(daily_bias.index)
    trailing = (
        daily_bias.asfreq("D").shift(lag_days).rolling(window_days, min_periods=3).mean().dropna()
    )
    correction = pd.Series(trailing.to_numpy(), index=trailing.index.date)
    adjusted = joined.assign(correction_mw=joined["delivery_day"].map(correction)).dropna(
        subset=["correction_mw"]
    )
    return adjusted.assign(
        forecast_mw=adjusted["forecast_mw"] - adjusted["correction_mw"],
        error_mw=adjusted["error_mw"] - adjusted["correction_mw"],
    )
