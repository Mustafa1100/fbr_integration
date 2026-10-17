"""A client's items, managed from the admin portal. The desktop app's side of
this is the data sync in routers/pos.py."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app import live
from app.auth import get_current_admin
from app.database import get_db
from app.models import Client, Item
from app.serializers import client_items, item_out

router = APIRouter(
    prefix="/api/admin/clients/{client_id}/items",
    tags=["items"],
    dependencies=[Depends(get_current_admin)],
)


class ItemIn(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=150)
    price: float = Field(default=0, ge=0)
    tax_rate: float = Field(default=0, ge=0, le=100)
    # FBR's PCTCode field is 8 characters.
    pct_code: str = Field(default="", max_length=8)
    third_schedule: bool = False

    @field_validator("code", "name", "pct_code")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


def _client(db: Session, client_id: int) -> Client:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Client not found")
    return client


def _find(client: Client, code: str) -> Item | None:
    return next((i for i in client.items if i.code == code), None)


def _apply(item: Item, body: ItemIn) -> None:
    item.code = body.code
    item.name = body.name
    item.price = body.price
    item.tax_rate = body.tax_rate
    item.pct_code = body.pct_code
    item.third_schedule = body.third_schedule
    item.is_deleted = False


@router.get("")
def list_items(client_id: int, db: Session = Depends(get_db)):
    return client_items(_client(db, client_id))


@router.post("", status_code=201)
def create_item(client_id: int, body: ItemIn, db: Session = Depends(get_db)):
    client = _client(db, client_id)
    item = _find(client, body.code)
    if item and not item.is_deleted:
        raise HTTPException(409, f'Another item already uses the code "{body.code}"')
    if item is None:
        item = Item()
        client.items.append(item)
    # A deleted item with this code is brought back with the new details.
    _apply(item, body)
    db.commit()
    live.publish(client.id)
    return item_out(item)


@router.put("/{item_id}")
def update_item(client_id: int, item_id: int, body: ItemIn, db: Session = Depends(get_db)):
    client = _client(db, client_id)
    item = next((i for i in client.items if i.id == item_id and not i.is_deleted), None)
    if not item:
        raise HTTPException(404, "Item not found")
    clash = _find(client, body.code)
    if clash and clash.id != item.id:
        raise HTTPException(409, f'Another item already uses the code "{body.code}"')
    _apply(item, body)
    db.commit()
    live.publish(client.id)
    return item_out(item)


@router.delete("/{item_id}")
def delete_item(client_id: int, item_id: int, db: Session = Depends(get_db)):
    client = _client(db, client_id)
    item = next((i for i in client.items if i.id == item_id and not i.is_deleted), None)
    if not item:
        raise HTTPException(404, "Item not found")
    item.is_deleted = True
    db.commit()
    live.publish(client.id)
    return client_items(client)
