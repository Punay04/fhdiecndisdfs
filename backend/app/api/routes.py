from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app import schemas, services
from app.market import GatePreset, resolve_gate

router = APIRouter()

GateParam = Annotated[
    str | None,
    Query(description="Gate preset id (epex, n2ex) or a custom HH:MM UK decision time"),
]


def _gate(value: str | None) -> GatePreset:
    try:
        return resolve_gate(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/meta")
def meta() -> schemas.Meta:
    return services.get_meta()


@router.get("/decision")
def decision(delivery_date: date, gate: GateParam = None) -> schemas.Decision:
    """The forecast a trader would have bid on for one delivery day, with its uncertainty."""
    try:
        return services.get_decision(delivery_date, _gate(gate))
    except services.NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/accuracy")
def accuracy(
    gate: GateParam = None,
    first_day: Annotated[date | None, Query(alias="from")] = None,
    last_day: Annotated[date | None, Query(alias="to")] = None,
) -> schemas.Accuracy:
    """How accurate the gate-closure forecast was across the pilot (or a sub-range of it)."""
    try:
        return services.get_accuracy(_gate(gate), first_day, last_day)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/horizon")
def horizon() -> list[schemas.HorizonRow]:
    """Forecast accuracy against minimum lead time, over every pilot delivery hour."""
    return services.get_horizon_curve()


@router.get("/series")
def series(
    horizon_h: Annotated[float, Query(ge=0, le=48)] = 0,
    start: datetime | None = None,
    end: datetime | None = None,
) -> schemas.Series:
    """Actual vs the latest forecast published at least ``horizon_h`` hours ahead."""
    try:
        return services.get_series(horizon_h, start, end)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
