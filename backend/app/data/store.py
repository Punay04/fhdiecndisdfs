"""Load the committed Elexon snapshot into clean, analysis-ready DataFrames.

Cleaning rules:

* Actuals: keep the most recently published value per half-hour, then build an hourly
  series as the mean of the two half-hours (the MW average over an hourly product).
  Hours with a missing half-hour stay NaN rather than being guessed.
* Forecasts: drop rows whose target time is before the publish time (each WINDFOR
  publish includes a few hours of history), and record the forecast horizon in hours.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import get_settings

ACTUALS_FILE = "fuelhh_wind.csv.gz"
FORECASTS_FILE = "windfor.csv.gz"
META_FILE = "snapshot.json"
SCHEDULED_PUBLISH_MINUTE = 30


@dataclass(frozen=True)
class Dataset:
    actuals_hh: pd.DataFrame  # start_time, actual_mw (half-hourly)
    actuals_hourly: pd.DataFrame  # start_time, actual_mw (hourly mean)
    forecasts: pd.DataFrame  # publish_time, start_time, forecast_mw, horizon_h
    meta: dict[str, Any] = field(default_factory=dict)


def prepare_actuals(raw: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    half_hourly = (
        raw.sort_values("publish_time")
        .drop_duplicates("start_time", keep="last")
        .sort_values("start_time")
        .loc[:, ["start_time", "generation_mw"]]
        .rename(columns={"generation_mw": "actual_mw"})
        .reset_index(drop=True)
    )
    hourly = (
        half_hourly.assign(hour=half_hourly["start_time"].dt.floor("h"))
        .groupby("hour")["actual_mw"]
        .agg(["mean", "count"])
    )
    hourly["actual_mw"] = hourly["mean"].where(hourly["count"] == 2)
    hourly = hourly.rename_axis("start_time").reset_index()[["start_time", "actual_mw"]]
    return half_hourly, hourly


def prepare_forecasts(raw: pd.DataFrame) -> pd.DataFrame:
    forecasts = raw.rename(columns={"generation_mw": "forecast_mw"}).drop_duplicates(
        ["publish_time", "start_time"], keep="last"
    )
    horizon = (forecasts["start_time"] - forecasts["publish_time"]).dt.total_seconds() / 3600
    return (
        forecasts.assign(horizon_h=horizon)
        .loc[lambda df: df["horizon_h"] >= 0]
        .sort_values(["start_time", "publish_time"])
        .reset_index(drop=True)
    )


def quality_report(dataset: Dataset) -> dict[str, Any]:
    """Facts a reviewer should know about the snapshot before trusting the numbers."""
    publishes = dataset.forecasts["publish_time"].drop_duplicates()
    off_schedule = publishes[publishes.dt.minute != SCHEDULED_PUBLISH_MINUTE]
    expected_hh = pd.date_range(
        dataset.actuals_hh["start_time"].min(),
        dataset.actuals_hh["start_time"].max(),
        freq="30min",
    )
    missing_hh = expected_hh.difference(dataset.actuals_hh["start_time"])
    return {
        "actual_half_hours": len(dataset.actuals_hh),
        "missing_actual_half_hours": len(missing_hh),
        "forecast_publishes": len(publishes),
        "off_schedule_publishes": [ts.isoformat() for ts in off_schedule],
    }


def _read_csv(path: Path, time_columns: list[str]) -> pd.DataFrame:
    df = pd.read_csv(path)
    for column in time_columns:
        df[column] = pd.to_datetime(df[column], utc=True)
    return df


def load_dataset(data_dir: Path) -> Dataset:
    actuals_hh, actuals_hourly = prepare_actuals(
        _read_csv(data_dir / ACTUALS_FILE, ["start_time", "publish_time"])
    )
    forecasts = prepare_forecasts(
        _read_csv(data_dir / FORECASTS_FILE, ["publish_time", "start_time"])
    )
    meta_path = data_dir / META_FILE
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    return Dataset(actuals_hh, actuals_hourly, forecasts, meta)


@lru_cache
def get_dataset() -> Dataset:
    return load_dataset(get_settings().data_dir)
