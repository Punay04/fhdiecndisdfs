"""Thin client for the Elexon BMRS Insights API (no API key required).

Only the two datasets this product relies on are wrapped:

* ``FUELHH``  - half-hourly outturn generation by fuel type (we keep ``WIND``).
* ``WINDFOR`` - hourly national wind generation forecast, re-published several times a day.

Both ``/stream`` endpoints accept inclusive ``From``/``To`` bounds. Requests are split into
week-long chunks to keep responses small, and transient failures are retried with backoff.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import httpx

log = logging.getLogger(__name__)

CHUNK = timedelta(days=7)


@dataclass(frozen=True)
class ActualRecord:
    start_time: datetime
    settlement_date: date
    settlement_period: int
    generation_mw: float
    publish_time: datetime


@dataclass(frozen=True)
class ForecastRecord:
    publish_time: datetime
    start_time: datetime
    generation_mw: float


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _iso_z(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


class ElexonClient:
    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = 30.0,
        max_retries: int = 3,
        backoff_s: float = 1.0,
        http: httpx.Client | None = None,
    ) -> None:
        self._http = http or httpx.Client(base_url=base_url, timeout=timeout)
        self._max_retries = max_retries
        self._backoff_s = backoff_s

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> ElexonClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _get(self, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
        for attempt in range(1, self._max_retries + 1):
            try:
                response = self._http.get(path, params=params)
                response.raise_for_status()
                payload = response.json()
                # /stream returns a bare list; other endpoints wrap rows in {"data": [...]}.
                return payload if isinstance(payload, list) else payload.get("data", [])
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                retryable = not isinstance(exc, httpx.HTTPStatusError) or (
                    exc.response.status_code >= 500
                )
                if not retryable or attempt == self._max_retries:
                    raise
                wait = self._backoff_s * 2 ** (attempt - 1)
                log.warning("Elexon request failed (%s), retrying in %.1fs", exc, wait)
                time.sleep(wait)
        raise AssertionError("unreachable")

    def fetch_wind_actuals(self, first_day: date, last_day: date) -> list[ActualRecord]:
        """Half-hourly WIND outturn for settlement dates ``first_day..last_day`` inclusive."""
        records: list[ActualRecord] = []
        for chunk_start, chunk_end in _date_chunks(first_day, last_day):
            rows = self._get(
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": chunk_start.isoformat(),
                    "settlementDateTo": chunk_end.isoformat(),
                    "fuelType": "WIND",
                },
            )
            records.extend(
                ActualRecord(
                    start_time=_parse_ts(row["startTime"]),
                    settlement_date=date.fromisoformat(row["settlementDate"]),
                    settlement_period=int(row["settlementPeriod"]),
                    generation_mw=float(row["generation"]),
                    publish_time=_parse_ts(row["publishTime"]),
                )
                for row in rows
                if row.get("fuelType") == "WIND"
            )
        return records

    def fetch_wind_forecasts(
        self, published_from: datetime, published_to: datetime
    ) -> list[ForecastRecord]:
        """Every WINDFOR forecast row published in ``[published_from, published_to]``."""
        seen: set[tuple[datetime, datetime]] = set()
        records: list[ForecastRecord] = []
        for chunk_start, chunk_end in _datetime_chunks(published_from, published_to):
            rows = self._get(
                "/datasets/WINDFOR/stream",
                {
                    "publishDateTimeFrom": _iso_z(chunk_start),
                    "publishDateTimeTo": _iso_z(chunk_end),
                },
            )
            for row in rows:
                record = ForecastRecord(
                    publish_time=_parse_ts(row["publishTime"]),
                    start_time=_parse_ts(row["startTime"]),
                    generation_mw=float(row["generation"]),
                )
                # Inclusive bounds mean a publish on a chunk boundary is returned twice.
                key = (record.publish_time, record.start_time)
                if key not in seen:
                    seen.add(key)
                    records.append(record)
        return records


def _date_chunks(first: date, last: date) -> Iterator[tuple[date, date]]:
    current = first
    while current <= last:
        chunk_end = min(current + CHUNK - timedelta(days=1), last)
        yield current, chunk_end
        current = chunk_end + timedelta(days=1)


def _datetime_chunks(start: datetime, end: datetime) -> Iterator[tuple[datetime, datetime]]:
    current = start
    while current <= end:
        chunk_end = min(current + CHUNK, end)
        yield current, chunk_end
        if chunk_end == end:
            break
        current = chunk_end
