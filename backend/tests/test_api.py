import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def test_meta_lists_pilot_days_and_gates(client: TestClient) -> None:
    body = client.get("/api/meta").json()
    assert body["delivery_days"][0] == "2026-01-02"
    assert body["delivery_days"][-1] == "2026-02-01"
    assert {g["id"] for g in body["gates"]} == {"epex", "n2ex"}
    assert body["quality"]["missing_actual_half_hours"] == 0


def test_decision_day(client: TestClient) -> None:
    body = client.get("/api/decision", params={"delivery_date": "2026-01-16"}).json()
    assert body["decision_time"] == "2026-01-15T09:20:00Z"
    assert body["publish_times_used"] == ["2026-01-15T07:30:00Z"]
    assert len(body["hours"]) == 24
    hour = next(h for h in body["hours"] if h["start_time"] == "2026-01-16T00:00:00Z")
    assert hour["forecast_mw"] == 7398.0
    assert hour["firm_mw"] < hour["expected_mw"] < hour["upper_mw"]
    assert len(body["actuals_half_hourly"]) == 48
    assert any(v["used"] for v in body["vintages"])


def test_decision_with_custom_gate(client: TestClient) -> None:
    body = client.get(
        "/api/decision", params={"delivery_date": "2026-01-16", "gate": "10:00"}
    ).json()
    assert body["publish_times_used"] == ["2026-01-15T09:30:00Z"]


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"delivery_date": "2026-03-01"}, 404),
        ({"delivery_date": "2026-01-16", "gate": "nope"}, 422),
        ({"delivery_date": "not-a-date"}, 422),
    ],
)
def test_decision_errors(client: TestClient, params: dict, status: int) -> None:
    assert client.get("/api/decision", params=params).status_code == status


def test_accuracy_full_pilot(client: TestClient) -> None:
    body = client.get("/api/accuracy").json()
    assert body["summary"]["hours"] == 31 * 24
    assert len(body["daily"]) == 31
    assert len(body["by_hour"]) == 24
    assert len(body["worst_days"]) == 5
    assert sum(b["hours"] for b in body["histogram"]) == 31 * 24
    adjusted = body["bias_adjusted"]
    assert adjusted["adjusted"]["hours"] == adjusted["baseline"]["hours"]


def test_accuracy_sub_range_and_validation(client: TestClient) -> None:
    body = client.get("/api/accuracy", params={"from": "2026-01-10", "to": "2026-01-12"}).json()
    assert body["summary"]["hours"] == 3 * 24
    bad = client.get("/api/accuracy", params={"from": "2026-01-12", "to": "2026-01-10"})
    assert bad.status_code == 422


def test_horizon_curve_error_grows_with_lead_time(client: TestClient) -> None:
    rows = client.get("/api/horizon").json()
    assert rows[0]["horizon_h"] == 0
    assert rows[-1]["mae_mw"] > rows[0]["mae_mw"]


def test_series_respects_window_and_horizon(client: TestClient) -> None:
    body = client.get(
        "/api/series",
        params={"horizon_h": 24, "start": "2026-01-10T00:00:00Z", "end": "2026-01-11T00:00:00Z"},
    ).json()
    assert len(body["points"]) == 24
    assert all(p["horizon_h"] >= 24 for p in body["points"])
    assert client.get("/api/series", params={"horizon_h": 72}).status_code == 422
