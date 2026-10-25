from datetime import UTC, date, datetime

import httpx
import pytest

from app.elexon.client import ElexonClient, _date_chunks


def make_client(handler) -> ElexonClient:
    http = httpx.Client(base_url="https://example.test", transport=httpx.MockTransport(handler))
    return ElexonClient("https://example.test", http=http, backoff_s=0)


def test_date_chunks_cover_range_without_overlap() -> None:
    chunks = list(_date_chunks(date(2026, 1, 1), date(2026, 1, 16)))
    assert chunks == [
        (date(2026, 1, 1), date(2026, 1, 7)),
        (date(2026, 1, 8), date(2026, 1, 14)),
        (date(2026, 1, 15), date(2026, 1, 16)),
    ]


def test_fetch_wind_actuals_parses_and_filters_fuel_type() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/datasets/FUELHH/stream"
        assert request.url.params["fuelType"] == "WIND"
        return httpx.Response(
            200,
            json=[
                {
                    "dataset": "FUELHH",
                    "publishTime": "2026-01-02T00:00:00Z",
                    "startTime": "2026-01-01T23:30:00Z",
                    "settlementDate": "2026-01-01",
                    "settlementPeriod": 48,
                    "fuelType": "WIND",
                    "generation": 15538,
                },
                {
                    "dataset": "FUELHH",
                    "publishTime": "2026-01-02T00:00:00Z",
                    "startTime": "2026-01-01T23:30:00Z",
                    "settlementDate": "2026-01-01",
                    "settlementPeriod": 48,
                    "fuelType": "CCGT",
                    "generation": 9000,
                },
            ],
        )

    with make_client(handler) as client:
        records = client.fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))

    assert len(records) == 1
    assert records[0].start_time == datetime(2026, 1, 1, 23, 30, tzinfo=UTC)
    assert records[0].generation_mw == 15538.0


def test_fetch_wind_forecasts_dedupes_chunk_boundaries() -> None:
    row = {
        "dataset": "WINDFOR",
        "publishTime": "2026-01-08T00:00:00Z",
        "startTime": "2026-01-08T03:00:00Z",
        "generation": 7000,
    }

    with make_client(lambda request: httpx.Response(200, json=[row])) as client:
        records = client.fetch_wind_forecasts(
            datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 1, 15, tzinfo=UTC)
        )

    assert len(records) == 1


def test_retries_server_errors_then_succeeds() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503) if calls["n"] < 3 else httpx.Response(200, json=[])

    with make_client(handler) as client:
        assert client.fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1)) == []
    assert calls["n"] == 3


def test_client_errors_are_not_retried() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, json={"error": "bad request"})

    with make_client(handler) as client, pytest.raises(httpx.HTTPStatusError):
        client.fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))
    assert calls["n"] == 1
