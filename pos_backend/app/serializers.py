"""Response shapes shared by the admin portal and the desktop app."""

import calendar
from datetime import datetime, timedelta

from app.models import Client, Item, ItemRequest, Plan, Subscription, utcnow

# A subscription ending within this many days is flagged in the portal.
EXPIRING_SOON_DAYS = 7
# Pakistan Standard Time is UTC+5 all year (no daylight saving).
PKT_OFFSET = timedelta(hours=5)


def iso(value: datetime | None) -> str | None:
    """Stored values are naive UTC; mark them as such for the clients."""
    return f"{value.isoformat(timespec='seconds')}Z" if value else None


def add_months(start: datetime, months: int) -> datetime:
    """Same day-of-month `months` later, clamped to the month's last day
    (31 January + 1 month = 28/29 February). `start` is naive UTC; the
    calendar is Pakistan's, so a plan bought on 31 January in Pakistan ends
    on 28/29 February in Pakistan."""
    local = start + PKT_OFFSET
    index = local.month - 1 + months
    year = local.year + index // 12
    month = index % 12 + 1
    day = min(local.day, calendar.monthrange(year, month)[1])
    return local.replace(year=year, month=month, day=day) - PKT_OFFSET


def subscription_status(client: Client, now: datetime | None = None) -> str:
    """none | active | expiring | expired | cancelled"""
    now = now or utcnow()
    current = client.current_subscription
    if current is None:
        return "none"
    if current.end_reason == "cancelled":
        return "cancelled"
    expires_at = current.ends_at
    if expires_at <= now:
        return "expired"
    if (expires_at - now).days < EXPIRING_SOON_DAYS:
        return "expiring"
    return "active"


def plan_out(plan: Plan) -> dict:
    return {
        "id": plan.id,
        "months": plan.months,
        "name": plan.name,
        "price": plan.price,
        "updated_at": iso(plan.updated_at),
    }


def subscription_out(sub: Subscription) -> dict:
    return {
        "id": sub.id,
        "plan_months": sub.plan_months,
        "plan_name": sub.plan_name,
        "price": sub.price,
        "starts_at": iso(sub.starts_at),
        # When access actually stopped or stops; the planned expiry separately.
        "expires_at": iso(sub.ends_at),
        "planned_expires_at": iso(sub.expires_at),
        "end_reason": sub.end_reason,
        "note": sub.note,
        "created_by": sub.created_by,
        "created_at": iso(sub.created_at),
    }


def item_out(item: Item) -> dict:
    return {
        "id": item.id,
        "code": item.code,
        "name": item.name,
        "price": item.price,
        "tax_rate": item.tax_rate,
        "pct_code": item.pct_code,
        "third_schedule": item.third_schedule,
        "updated_at": iso(item.updated_at),
    }


def request_out(req: ItemRequest, with_client: bool = False) -> dict:
    item = req.item if req.item and not req.item.is_deleted else None
    out = {
        "id": req.id,
        "uid": req.uid,
        "code": req.code,
        "action": req.action,
        "name": req.name,
        "price": req.price,
        "status": req.status,
        "admin_note": req.admin_note,
        "created_at": iso(req.created_at),
        "decided_at": iso(req.decided_at),
        "decided_by": req.decided_by,
        # What the item is now, to compare against what is asked for.
        "current_name": item.name if item else "",
        "current_price": item.price if item else None,
        "proposed_tax_rate": req.proposed_tax_rate,
        "proposed_pct_code": req.proposed_pct_code,
    }
    if with_client:
        out["client_id"] = req.client_id
        out["client_username"] = req.client.username
        out["client_business_name"] = req.client.business_name
        # What the approve form starts from: the client's suggestion, else
        # the item's tax treatment now, else (new item) the client's defaults.
        out["suggested_tax_rate"] = next(
            v for v in (req.proposed_tax_rate, item.tax_rate if item else None, req.client.default_tax_rate)
            if v is not None
        )
        out["suggested_pct_code"] = (
            req.proposed_pct_code or (item.pct_code if item else "") or req.client.default_pct_code
        )
        out["suggested_third_schedule"] = item.third_schedule if item else False
    return out


def client_items(client: Client) -> list[dict]:
    live = [i for i in client.items if not i.is_deleted]
    return [item_out(i) for i in sorted(live, key=lambda i: i.name.lower())]


def client_config(client: Client) -> dict:
    """The settings the desktop app applies. Keys match its local settings."""
    return {
        "business_name": client.business_name,
        "ntn": client.ntn,
        "strn": client.strn,
        "address": client.address,
        "phone": client.phone,
        "mode": client.fbr_mode,
        "environment": client.fbr_environment,
        "pos_id": client.pos_id,
        "service_url": client.service_url,
        "usin_prefix": client.usin_prefix,
        "prices_include_tax": client.prices_include_tax,
        "default_tax_rate": client.default_tax_rate,
        "default_pct_code": client.default_pct_code,
    }


def client_summary(client: Client) -> dict:
    current = client.current_subscription
    return {
        "id": client.id,
        "username": client.username,
        "business_name": client.business_name,
        "contact_name": client.contact_name,
        "contact_phone": client.contact_phone,
        "is_active": client.is_active,
        "fbr_mode": client.fbr_mode,
        "fbr_environment": client.fbr_environment,
        "pos_id": client.pos_id,
        "subscription_status": subscription_status(client),
        "plan_name": current.plan_name if current else "",
        "expires_at": iso(client.expires_at),
        "last_sync_at": iso(client.last_sync_at),
        "last_backup_at": iso(client.last_backup_at),
        "created_at": iso(client.created_at),
    }


def client_detail(client: Client) -> dict:
    return {
        **client_summary(client),
        "notes": client.notes,
        "config": client_config(client),
        "items": client_items(client),
        # How many invoices this client's computers have numbered so far.
        "usin_seq": client.usin_seq,
        "last_login_at": iso(client.last_login_at),
        "updated_at": iso(client.updated_at),
        # Newest first for the history table.
        "subscriptions": [subscription_out(s) for s in reversed(client.subscriptions)],
    }


def sync_payload(client: Client) -> dict:
    """Everything the desktop app caches: profile, settings and how long the
    subscription runs. It enforces the expiry itself, so it works offline."""
    current = client.current_subscription
    return {
        "username": client.username,
        "config": client_config(client),
        "subscription": {
            "status": subscription_status(client),
            "plan_name": current.plan_name if current else "",
            "expires_at": iso(client.expires_at),
        },
        "server_time": iso(utcnow()),
    }
