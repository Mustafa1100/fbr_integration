"""Endpoints the desktop app calls."""

from datetime import timedelta
from typing import Literal

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.auth import check_credentials, create_client_token, get_current_client
from app.database import get_db
from app.invoices import invoice_out, store_uploads
from app.models import Client, Invoice, ItemRequest, utcnow
from app import licence, live
from app.serializers import client_items, request_out, sync_payload

router = APIRouter(prefix="/api/pos", tags=["pos"])


class LoginIn(BaseModel):
    username: str
    password: str


class RequestIn(BaseModel):
    """A request, made on the computer, to add, change or delete an item. The
    computer never changes the catalog itself; an admin decides."""

    uid: str = Field(min_length=1, max_length=64)
    code: str = Field(min_length=1, max_length=50)
    action: Literal["add", "edit", "delete"]
    name: str = Field(default="", max_length=150)
    price: float = Field(default=0, ge=0)
    # Suggested tax treatment; the admin confirms or changes it.
    tax_rate: float | None = Field(default=None, ge=0, le=100)
    pct_code: str | None = Field(default=None, max_length=8)

    @field_validator("code", "name")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("pct_code")
    @classmethod
    def _strip_pct(cls, value: str | None) -> str | None:
        return (value.strip() or None) if value is not None else None


class DataSyncIn(BaseModel):
    # The highest invoice sequence number this computer has used.
    usin_seq: int = Field(default=0, ge=0)
    requests: list[RequestIn] = Field(default_factory=list, max_length=1000)
    # Items added directly by older desktop versions. No longer accepted:
    # adding an item is a request too.
    changes: list[dict] = Field(default_factory=list, max_length=5000)
    # Invoices made or changed since the last upload (backup). Checked one by
    # one in app.invoices, so a single bad one cannot block the others.
    invoices: list[dict] = Field(default_factory=list, max_length=500)


# How far back decided requests are reported to the computer.
REQUEST_HISTORY_DAYS = 60

@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    username = body.username.strip().lower()
    client = db.query(Client).filter(Client.username == username).first()
    if not check_credentials(body.password, client.password_hash if client else None):
        raise HTTPException(401, "Invalid username or password")
    if not client.is_active:
        raise HTTPException(403, "This account has been deactivated. Contact your provider.")
    client.last_login_at = client.last_sync_at = utcnow()
    db.commit()
    return {"token": create_client_token(client), **sync_payload(client), "licence": licence.issue(client)}


@router.get("/sync")
def sync(client: Client = Depends(get_current_client), db: Session = Depends(get_db)):
    """Current settings, subscription and a freshly signed licence. Called at
    start-up, every few hours, when the server announces a change, and when
    the user presses Refresh."""
    client.last_sync_at = utcnow()
    db.commit()
    return {**sync_payload(client), "licence": licence.issue(client)}


@router.post("/data/sync")
def sync_data(
    body: DataSyncIn,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Two-way sync of the client's own data, so a replacement computer gets
    it back: files the item requests made on the computer, and answers with
    the full item list, the state of its requests and the invoice counter to
    continue from."""
    live = {item.code: item for item in client.items if not item.is_deleted}
    known = {
        r.uid
        for r in db.query(ItemRequest.uid).filter(
            ItemRequest.client_id == client.id,
            ItemRequest.uid.in_([r.uid for r in body.requests] or [""]),
        )
    }
    for incoming in body.requests:
        if incoming.uid in known:
            continue  # re-sent after a lost answer
        known.add(incoming.uid)
        if incoming.action != "delete" and not incoming.name:
            raise HTTPException(422, f'The request for "{incoming.code}" needs a name')
        item = live.get(incoming.code)
        req = ItemRequest(
            client_id=client.id,
            uid=incoming.uid,
            item_id=item.id if item else None,
            code=incoming.code,
            action=incoming.action,
            name=incoming.name,
            price=incoming.price,
            proposed_tax_rate=incoming.tax_rate if incoming.action != "delete" else None,
            proposed_pct_code=incoming.pct_code if incoming.action != "delete" else None,
        )
        problem = ""
        if incoming.action == "add" and item is not None:
            problem = f'An item with the code "{incoming.code}" already exists.'
        elif incoming.action != "add" and item is None:
            problem = "This item no longer exists."
        if problem:
            req.status = "rejected"
            req.admin_note = problem
            req.decided_at = utcnow()
        else:
            # A newer request for the same code replaces an undecided one.
            db.query(ItemRequest).filter(
                ItemRequest.client_id == client.id,
                ItemRequest.code == incoming.code,
                ItemRequest.status == "pending",
            ).update({"status": "withdrawn", "decided_at": utcnow()})
        db.add(req)

    # Only ever moves forward, whichever computer reports it.
    client.usin_seq = max(client.usin_seq, body.usin_seq)
    saved, errors = store_uploads(db, client, body.invoices)
    client.last_backup_at = utcnow()
    db.commit()

    since = utcnow() - timedelta(days=REQUEST_HISTORY_DAYS)
    requests = (
        db.query(ItemRequest)
        .filter(
            ItemRequest.client_id == client.id,
            or_(ItemRequest.status == "pending", ItemRequest.created_at >= since),
        )
        .order_by(ItemRequest.created_at.desc())
        .limit(200)
        .all()
    )
    return {
        "items": client_items(client),
        "requests": [request_out(r) for r in requests],
        "usin_seq": client.usin_seq,
        # The computer marks these as backed up; the errors stay pending.
        "invoices_saved": saved,
        "invoice_errors": errors,
    }


@router.get("/invoices")
def restore_invoices(
    after_id: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """The client's invoice history, oldest first, a page at a time. A new or
    replacement computer downloads it after signing in."""
    rows = (
        db.query(Invoice)
        .options(selectinload(Invoice.lines))
        .filter(Invoice.client_id == client.id, Invoice.id > after_id)
        .order_by(Invoice.id)
        .limit(limit)
        .all()
    )
    return {
        "invoices": [invoice_out(r) for r in rows],
        "next_after_id": rows[-1].id if len(rows) == limit else None,
    }

# A comment line every so often keeps proxies and load balancers from closing
# an idle connection, and lets the PC notice a dead one.
KEEPALIVE_SECONDS = 25


@router.get("/events")
async def events(request: Request, client: Client = Depends(get_current_client)):
    """Live channel to the desktop app (server-sent events). The PC keeps it
    open while online; "changed" means: sync now."""
    client_id = client.id

    async def stream():
        queue, unsubscribe = live.subscribe(client_id)
        try:
            yield "event: ready\ndata: {}\n\n"
            while not await request.is_disconnected():
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=KEEPALIVE_SECONDS)
                    yield f"event: {event}\ndata: {{}}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            unsubscribe()

    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return StreamingResponse(stream(), media_type="text/event-stream", headers=headers)