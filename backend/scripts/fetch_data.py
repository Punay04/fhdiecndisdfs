"""Download the pilot dataset from Elexon and write it to ``backend/data``.

Usage (from ``backend/``)::

    python -m scripts.fetch_data

The defaults cover purchase decisions made in January 2026: delivery periods from
2026-01-01 23:00 to 2026-02-01 23:00 UK time, plus a few days of forecast lead-in so the
"latest forecast before gate closure" lookup is never starved at the start of the month.
"""

from __future__ import annotations

import argparse
import json
import logging
from dataclasses import asdict
from datetime import UTC, date, datetime
from pathlib import Path

import pandas as pd

from app.config import get_settings
from app.elexon.client import ElexonClient

ACTUALS_FILE = "fuelhh_wind.csv.gz"
FORECASTS_FILE = "windfor.csv.gz"
META_FILE = "snapshot.json"

DEFAULT_ACTUALS_FROM = date(2026, 1, 1)
DEFAULT_ACTUALS_TO = date(2026, 2, 1)
DEFAULT_PUBLISHED_FROM = datetime(2025, 12, 30, tzinfo=UTC)
DEFAULT_PUBLISHED_TO = datetime(2026, 2, 1, 23, 59, tzinfo=UTC)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--actuals-from", type=date.fromisoformat, default=DEFAULT_ACTUALS_FROM)
    parser.add_argument("--actuals-to", type=date.fromisoformat, default=DEFAULT_ACTUALS_TO)
    parser.add_argument(
        "--published-from", type=datetime.fromisoformat, default=DEFAULT_PUBLISHED_FROM
    )
    parser.add_argument("--published-to", type=datetime.fromisoformat, default=DEFAULT_PUBLISHED_TO)
    parser.add_argument("--out", type=Path, default=get_settings().data_dir)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args.out.mkdir(parents=True, exist_ok=True)

    with ElexonClient(get_settings().elexon_base_url) as client:
        actuals = client.fetch_wind_actuals(args.actuals_from, args.actuals_to)
        forecasts = client.fetch_wind_forecasts(args.published_from, args.published_to)

    actuals_df = pd.DataFrame([asdict(r) for r in actuals]).sort_values("start_time")
    forecasts_df = pd.DataFrame([asdict(r) for r in forecasts]).sort_values(
        ["publish_time", "start_time"]
    )
    actuals_df.to_csv(args.out / ACTUALS_FILE, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    forecasts_df.to_csv(args.out / FORECASTS_FILE, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")

    meta = {
        "fetched_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": "Elexon BMRS Insights API (FUELHH fuelType=WIND, WINDFOR)",
        "actuals": {
            "settlement_dates": [args.actuals_from.isoformat(), args.actuals_to.isoformat()],
            "rows": len(actuals_df),
        },
        "forecasts": {
            "published": [args.published_from.isoformat(), args.published_to.isoformat()],
            "rows": len(forecasts_df),
            "publishes": int(forecasts_df["publish_time"].nunique()),
        },
    }
    (args.out / META_FILE).write_text(json.dumps(meta, indent=2) + "\n")
    logging.info("Wrote %s", json.dumps(meta))


if __name__ == "__main__":
    main()
