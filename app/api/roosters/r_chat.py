"""Chat: your chats, one conversation, sending (with an Idempotency-Key: a retry on bad wifi never sends twice),
reading, groups, and "Meld dit bericht". The rules are in chat.py. Like friends, everything here needs a signed-in
account (deps.verified)."""
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from . import chat, db, redisx
from .deps import Ctx, etag_json, verified

router = APIRouter(prefix="/api/v1/chats", tags=["chat"])


@router.get("")
def list_chats(request: Request, ctx: Ctx = Depends(verified)):
    """Pinned first, then the newest message first; `unread` in total for the tab badge."""
    return etag_json(request, chat.list_for(ctx.uid))


class DirectIn(BaseModel):
    user_id: int


@router.post("/direct")
def direct(body: DirectIn, ctx: Ctx = Depends(verified)):
    """The one-to-one chat with a friend (made the first time you open it)."""
    redisx.rate_limit(f"chat-open:{ctx.uid}", 120, 3600)
    with db.tx() as c:
        chat_id = chat.open_direct(c, ctx.uid, body.user_id)
    return {"chat": chat.chat_out(ctx.uid, chat_id)}


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    user_ids: list[int] = Field(min_length=1, max_length=chat.MAX_GROUP)


@router.post("", status_code=201)
def new_group(body: GroupIn, ctx: Ctx = Depends(verified)):
    redisx.rate_limit(f"chat-group:{ctx.uid}", 20, 3600)
    with db.tx() as c:
        chat_id = chat.create_group(c, ctx.uid, body.name, body.user_ids)
    return {"chat": chat.chat_out(ctx.uid, chat_id)}


@router.get("/{chat_id}")
def get_chat(chat_id: int, request: Request, ctx: Ctx = Depends(verified)):
    """Who's in it, and how far each of them read."""
    return etag_json(request, {"chat": chat.chat_out(ctx.uid, chat_id)})


class ChatPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    pinned: bool | None = None
    push: bool | None = None


@router.patch("/{chat_id}")
def edit_chat(chat_id: int, body: ChatPatch, ctx: Ctx = Depends(verified)):
    """Rename a group; pin a chat or turn its bell (push for every message) on, only for you."""
    with db.tx() as c:
        chat.edit(c, ctx.uid, chat_id, body.name, body.pinned, body.push)
    return {"chat": chat.chat_out(ctx.uid, chat_id)}


class MembersIn(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=chat.MAX_GROUP)


@router.post("/{chat_id}/members")
def add_members(chat_id: int, body: MembersIn, ctx: Ctx = Depends(verified)):
    with db.tx() as c:
        chat.add_members(c, ctx.uid, chat_id, body.user_ids)
    return {"chat": chat.chat_out(ctx.uid, chat_id)}


@router.delete("/{chat_id}/members/me", status_code=204)
def leave(chat_id: int, ctx: Ctx = Depends(verified)):
    with db.tx() as c:
        chat.leave(c, ctx.uid, chat_id)
    return Response(status_code=204)


@router.get("/{chat_id}/messages")
def messages(chat_id: int, request: Request, after: int = 0, before: int = 0, limit: int = chat.PAGE,
             ctx: Ctx = Depends(verified)):
    """Oldest first. `after`: only what's new (the app asks every few seconds while the chat is open: mostly an
    empty "not modified"); `before`: the page above."""
    return etag_json(request, chat.messages(ctx.uid, chat_id, after, before, limit))


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router.post("/{chat_id}/messages", status_code=201)
def send(chat_id: int, body: MessageIn, ctx: Ctx = Depends(verified)):
    redisx.rate_limit(f"chat-send:{ctx.uid}", 40, 60)
    with db.tx() as c:
        return {"message": chat.send(c, ctx.uid, chat_id, body.body)}


@router.delete("/{chat_id}/messages/{message_id}", status_code=204)
def take_back(chat_id: int, message_id: int, ctx: Ctx = Depends(verified)):
    """Your own message, gone for everyone."""
    with db.tx() as c:
        chat.take_back(c, ctx.uid, chat_id, message_id)
    return Response(status_code=204)


class ReadIn(BaseModel):
    up_to_id: int = Field(ge=0)


@router.post("/{chat_id}/read", status_code=204)
def read(chat_id: int, body: ReadIn, ctx: Ctx = Depends(verified)):
    chat.mark_read(ctx.uid, chat_id, body.up_to_id)
    return Response(status_code=204)


class ReportIn(BaseModel):
    reason: Literal["spam", "mean", "unsafe", "other"]
    note: str | None = Field(None, max_length=300)
    block: bool = False


@router.post("/messages/{message_id}/report")
def report(message_id: int, body: ReportIn, ctx: Ctx = Depends(verified)):
    """"Meld dit bericht": the moderators see it (admin API), the writer doesn't. `block` also blocks the writer."""
    redisx.rate_limit(f"chat-report:{ctx.uid}", 30, 3600)
    with db.tx() as c:
        return chat.report(c, ctx.uid, message_id, body.reason, body.note, body.block)
