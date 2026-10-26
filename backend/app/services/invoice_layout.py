"""Per-user invoice (receipt) layout: custom fields, column order/visibility,
which header details print, and where the FBR logo / QR code sit.

Stored as JSON on FbrSettings.invoice_layout and always read through
``layout_for`` so callers get a complete, normalized layout — anything
missing or stale in the stored JSON falls back to the defaults below.

Custom fields are user-defined extra values per product line (e.g.
"Trader Price" / trade_price). Each one is a product field, an extra column
in the CSV template / upload (named by its key), and an invoice column.
They are receipt-only: never sent to FBR.
"""

import json
import re
from datetime import date

from fastapi import HTTPException

# Built-in receipt table columns, in their default order.
BUILTIN_COLUMNS = {
    "index": "#",
    "description": "Description",
    "hs_code": "HS Code",
    "quantity": "Qty",
    "uom": "UOM",
    "unit_price": "Unit Price",
    "rate": "Rate",
    "excl_st": "Excl. ST",
    "discount": "Discount",
    "sales_tax": "Sales Tax",
    "further_tax": "Further Tax",
    "fed_payable": "FED Payable",
    "extra_tax": "Extra Tax",
    "sale_type": "Sale Type",
    "line_total": "Line Total",
    # §236 advance income tax per line, and the line total including it.
    "advance_tax": "Advance Tax",
    "total_incl_adv": "Total",
    # Pack pricing users only (see PACK_COLUMNS): weight in packs and price
    # per pack. Renameable like any column.
    "pack_qty": "Weight in Maunds",
    "pack_price": "Price per Maund",
}
# Columns that exist only for users an admin enabled pack pricing for; for
# everyone else they're left out of the layout entirely.
PACK_COLUMNS = {"pack_qty", "pack_price"}
# What the receipt showed before layouts existed.
DEFAULT_VISIBLE_COLUMNS = {
    "index",
    "description",
    "hs_code",
    "quantity",
    "uom",
    "unit_price",
    "rate",
    "excl_st",
    "discount",
    "sales_tax",
    "advance_tax",
    "total_incl_adv",
    "pack_qty",
    "pack_price",
}

# Totals box. These two are fixed: exclusive value first, inclusive last.
FIXED_TOTALS = {
    "total_excl": "Total Taxes Exclusive Value",
    "total_incl": "Total Taxes Inclusive Value",
}
# Rows between them — reorderable, renameable, can be hidden. Only figures
# that are part of the inclusive total, so the box always adds up.
TOTAL_ROWS = {
    "discount": "Discount",
    "sales_tax": "Total Sales Tax Amount",
    "further_tax": "Total Further Tax Amount",
    "fed_payable": "Total FED Payable",
    "advance_tax": "Advance Income Tax",
}
DEFAULT_VISIBLE_TOTALS = {"discount", "sales_tax", "further_tax", "advance_tax"}

# Header details that can be hidden. The business name, invoice type, date,
# buyer name, FBR invoice number, logo and QR code always print (FBR
# requires the last three on a Digital Invoicing receipt).
HEADER_FIELDS = {
    "seller_ntn": "Seller NTN",
    "seller_cnic": "Seller CNIC",
    "seller_strn": "Seller STRN",
    "seller_address": "Seller address",
    "seller_email": "Seller email",
    "pos_invoice_no": "Invoice no.",
    "buyer_ntn_cnic": "Buyer NTN / CNIC",
    "buyer_registration_type": "Buyer registration type",
    "buyer_address": "Buyer address",
}
# Header details that exist only for users with pack pricing (they're the
# only ones who can enter them); left out of everyone else's layout.
PACK_HEADER_FIELDS = {
    "buyer_strn": "Buyer STRN",
}


def _header_fields(pack_pricing: bool) -> dict:
    return {**HEADER_FIELDS, **(PACK_HEADER_FIELDS if pack_pricing else {})}

# The FBR logo and QR code always sit together, in one of these places.
POSITIONS = {
    "top-right": "Top right",
    "bottom-left": "Bottom left",
}

FIELD_TYPES = {"text": "Text", "number": "Number", "date": "Date", "yes_no": "Yes / No"}

MAX_CUSTOM_FIELDS = 20
CUSTOM_PREFIX = "cf:"
_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,39}$")


def _reserved_keys() -> set[str]:
    # Imported lazily — csv_processor imports this module.
    from app.services.csv_processor import ALL_COLUMNS

    return set(ALL_COLUMNS) | set(BUILTIN_COLUMNS) | {"pack_name", "buyer_strn"}


def _clean_custom_fields(raw, strict: bool) -> list[dict]:
    """Validated custom field definitions. ``strict`` raises a 400 on the
    first problem (saving); otherwise bad entries are dropped (reading)."""

    def fail(msg):
        if strict:
            raise HTTPException(400, msg)

    fields, seen = [], set()
    reserved = _reserved_keys()
    for f in raw if isinstance(raw, list) else []:
        if not isinstance(f, dict):
            continue
        label = str(f.get("label", "")).strip()[:60]
        key = str(f.get("key", "")).strip().lower()
        ftype = f.get("type", "text")
        if not label:
            fail("Every custom field needs a name.")
            continue
        if not _KEY_RE.match(key):
            fail(
                f"'{key}' isn't a valid column name for '{label}' — use lowercase letters, "
                "digits and underscores, starting with a letter (e.g. trade_price)."
            )
            continue
        if key in reserved:
            fail(f"'{key}' is already a built-in column — pick another column name.")
            continue
        if key in seen:
            fail(f"Two custom fields use the column name '{key}'.")
            continue
        if ftype not in FIELD_TYPES:
            fail(f"Unknown field type '{ftype}'.")
            continue
        seen.add(key)
        fields.append({"key": key, "label": label, "type": ftype})
    if len(fields) > MAX_CUSTOM_FIELDS:
        fail(f"At most {MAX_CUSTOM_FIELDS} custom fields.")
        fields = fields[:MAX_CUSTOM_FIELDS]
    return fields


def normalize(raw: dict | None, strict: bool = False, pack_pricing: bool = False) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    custom = _clean_custom_fields(raw.get("custom_fields"), strict)
    # The pack columns exist only for users with pack pricing enabled.
    builtins = {k: v for k, v in BUILTIN_COLUMNS.items() if pack_pricing or k not in PACK_COLUMNS}
    labels = {**builtins, **{CUSTOM_PREFIX + f["key"]: f["label"] for f in custom}}
    columns = _ordered_rows(
        raw.get("columns"),
        labels,
        lambda key: key in DEFAULT_VISIBLE_COLUMNS or key.startswith(CUSTOM_PREFIX),
    )
    # When they first appear, put the pack columns right after the KG
    # quantity rather than at the end; a saved order is kept as it is.
    saved_keys = {c.get("key") for c in raw.get("columns") or [] if isinstance(c, dict)}
    new_pack = [c for c in columns if c["key"] in PACK_COLUMNS and c["key"] not in saved_keys]
    if new_pack and any(c["key"] == "quantity" for c in columns):
        columns = [c for c in columns if c not in new_pack]
        at = next(i for i, c in enumerate(columns) if c["key"] == "quantity") + 1
        columns[at:at] = new_pack

    # Totals: the exclusive value is always first and the inclusive value
    # always last (both always shown, renameable); the rest in between.
    middle = _ordered_rows(
        [t for t in raw.get("totals") or [] if isinstance(t, dict) and t.get("key") not in FIXED_TOTALS],
        TOTAL_ROWS,
        lambda key: key in DEFAULT_VISIBLE_TOTALS,
    )
    fixed = {
        r["key"]: r
        for r in _ordered_rows(
            [t for t in raw.get("totals") or [] if isinstance(t, dict) and t.get("key") in FIXED_TOTALS],
            FIXED_TOTALS,
            lambda key: True,
        )
    }
    totals = [
        {**fixed["total_excl"], "visible": True, "fixed": True},
        *middle,
        {**fixed["total_incl"], "visible": True, "fixed": True},
    ]

    header_raw = raw.get("header") if isinstance(raw.get("header"), dict) else {}
    header = {k: bool(header_raw.get(k, True)) for k in _header_fields(pack_pricing)}

    # One position for both; qr_position mirrors it (the receipt reads both).
    # An older layout with any other corner falls back to top-right.
    position = raw.get("logo_position")
    if position not in POSITIONS:
        if strict and position is not None:
            raise HTTPException(400, f"logo_position must be one of: {', '.join(POSITIONS)}")
        position = "top-right"

    return {
        "custom_fields": custom,
        "columns": columns,
        "totals": totals,
        "header": header,
        "logo_position": position,
        "qr_position": position,
    }


def _ordered_rows(saved, labels: dict, default_visible) -> list[dict]:
    """Saved order first (unknown / removed keys dropped), then anything new
    appended at its default visibility. Each row may carry its own label;
    default_label is the built-in (or custom field) name it falls back to."""
    rows, seen = [], set()
    for r in saved if isinstance(saved, list) else []:
        key = r.get("key") if isinstance(r, dict) else None
        if key in labels and key not in seen:
            seen.add(key)
            heading = str(r.get("label") or "").strip()[:60]
            rows.append({"key": key, "visible": bool(r.get("visible", True)), "label": heading})
    for key in labels:
        if key not in seen:
            rows.append({"key": key, "visible": default_visible(key), "label": ""})
    for r in rows:
        r["default_label"] = labels[r["key"]]
        r["label"] = r["label"] or r["default_label"]
    return rows


def _rows_storage(rows: list[dict]) -> list[dict]:
    # A label is stored only when renamed, so default names keep following
    # the built-in / field name.
    return [
        {
            "key": r["key"],
            "visible": r["visible"],
            **({"label": r["label"]} if r["label"] != r["default_label"] else {}),
        }
        for r in rows
    ]


def layout_for(fbr) -> dict:
    try:
        raw = json.loads(fbr.invoice_layout or "{}")
    except (TypeError, ValueError):
        raw = {}
    return normalize(raw, pack_pricing=bool(getattr(fbr, "pack_pricing", False)))


def to_storage(layout: dict) -> str:
    """Only what can't be derived."""
    return json.dumps(
        {
            "custom_fields": layout["custom_fields"],
            "columns": _rows_storage(layout["columns"]),
            "totals": _rows_storage(layout["totals"]),
            "header": layout["header"],
            "logo_position": layout["logo_position"],
            "qr_position": layout["qr_position"],
        }
    )


def catalog(pack_pricing: bool = False) -> dict:
    """Labels for the settings screen."""
    return {
        "header_fields": [{"key": k, "label": v} for k, v in _header_fields(pack_pricing).items()],
        "positions": [{"key": k, "label": v} for k, v in POSITIONS.items()],
        "field_types": [{"key": k, "label": v} for k, v in FIELD_TYPES.items()],
    }


_YES = {"yes", "y", "true", "1"}
_NO = {"no", "n", "false", "0"}


def clean_value(field: dict, value) -> str:
    """One custom field value -> its stored string form ('' = blank).
    Raises ValueError with a user-facing message if it doesn't fit the type."""
    text = "" if value is None else str(value).strip()
    if not text:
        return ""
    ftype = field["type"]
    if ftype == "number":
        try:
            number = float(text.replace(",", ""))
        except ValueError:
            raise ValueError(f"'{field['label']}' must be a number (got '{text}').")
        # Plain decimal, no float noise or exponent: 16222.86 stays 16222.86.
        return f"{number:.6f}".rstrip("0").rstrip(".")
    if ftype == "date":
        try:
            return date.fromisoformat(text[:10]).isoformat()
        except ValueError:
            raise ValueError(f"'{field['label']}' must be a date as YYYY-MM-DD (got '{text}').")
    if ftype == "yes_no":
        lowered = text.lower()
        if lowered in _YES:
            return "Yes"
        if lowered in _NO:
            return "No"
        raise ValueError(f"'{field['label']}' must be Yes or No (got '{text}').")
    return text[:300]


def clean_values(fields: list[dict], values: dict | None) -> dict:
    """Custom field values keyed by field key — unknown keys and blanks
    dropped. Raises ValueError on a value that doesn't fit its type."""
    values = values or {}
    out = {}
    for f in fields:
        cleaned = clean_value(f, values.get(f["key"]))
        if cleaned:
            out[f["key"]] = cleaned
    return out


def load_values(raw: str | None) -> dict:
    try:
        value = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}
