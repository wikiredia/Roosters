"""Break requests ("Pauze samen?"): ask friends to spend a shared break together, answer yes / no / another time,
take it back. The rules are in breaks.py. Like friends, everything here needs a signed-in account (deps.verified)."""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from . import breaks, db, redisx, schedule
from .deps import Ctx, parse_day, verified

router = APIRouter(prefix="/api/v1/breaks", tags=["breaks"])


def _answer(ctx: Ctx, rid: int | None = None) -> dict:
    """Every write answers with your whole list (the app replaces its copy), and the request it was about."""
    items = breaks.list_for(ctx.user)
    return {"breaks": items, "break": next((b for b in items if b["id"] == rid), None)}


@router.get("")
def list_breaks(day: str | None = None, ctx: Ctx = Depends(verified)):
    """Requests from and to you, today and the coming two weeks (or one day)."""
    d = parse_day(day, None) if day else None
    return {"breaks": breaks.list_for(ctx.user, d)}


class BreakIn(BaseModel):
    to_ids: list[int] = Field(min_length=1, max_length=12)
    day: str | None = None
    start: int = Field(ge=0, le=24 * 60)
    end: int = Field(ge=0, le=24 * 60)
    mode: Literal["i_come", "you_come", "meet"] = "meet"
    place: str | None = Field(None, max_length=120)
    note: str | None = Field(None, max_length=200)


@router.post("", status_code=201)
def ask(body: BreakIn, ctx: Ctx = Depends(verified)):
    redisx.rate_limit(f"break-request:{ctx.uid}", 30, 3600)
    day = parse_day(body.day, schedule.local_now(ctx.user).date())
    with db.tx() as c:
        rid = breaks.create(c, ctx.user, body.to_ids, day, body.start, body.end, body.mode, body.place, body.note)
    return _answer(ctx, rid)


class RespondIn(BaseModel):
    response: Literal["accepted", "declined"]


@router.post("/{request_id}/respond")
def respond(request_id: int, body: RespondIn, ctx: Ctx = Depends(verified)):
    with db.tx() as c:
        breaks.respond(c, ctx.user, request_id, body.response)
    return _answer(ctx, request_id)


class CounterIn(BaseModel):
    start: int = Field(ge=0, le=24 * 60)
    end: int = Field(ge=0, le=24 * 60)
    place: str | None = Field(None, max_length=120)
    note: str | None = Field(None, max_length=200)


@router.post("/{request_id}/counter", status_code=201)
def counter(request_id: int, body: CounterIn, ctx: Ctx = Depends(verified)):
    """'Ander uur': no to this one, and a new request back at the time you propose."""
    redisx.rate_limit(f"break-request:{ctx.uid}", 30, 3600)
    with db.tx() as c:
        rid = breaks.counter(c, ctx.user, request_id, body.start, body.end, body.place, body.note)
    return _answer(ctx, rid)


@router.post("/{request_id}/cancel")
def cancel(request_id: int, ctx: Ctx = Depends(verified)):
    with db.tx() as c:
        breaks.cancel(c, ctx.user, request_id)
    return _answer(ctx)
