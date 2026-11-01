"""Product-grid uploads: one row per invoice, one column per saved product.

    Date | Invoice No | Buyer Name | <saved product> | <saved product> | ...

Each cell is the number of packs of that product (blank / 0 = not on the
invoice). The buyer is a saved customer (matched by name) and every product
heading is a saved product, so the file carries no FBR fields itself: they
are filled in from the saved records, using exactly the same maths as the
single-invoice form, and the result is fed through the normal upload
pipeline as ordinary rows.

This format is only tried for a file that the normal format would reject
(see csv_processor), and only when its headings are Date / Invoice No /
Buyer Name — so a file in the normal format never reaches this module.
"""

import csv
import io
import math
from dataclasses import dataclass, field
from datetime import date, datetime

import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.models import Customer, FbrSettings, Product, User
from app.services import invoice_layout

DATE_HEADINGS = {"date", "invoice date"}
INVOICE_HEADINGS = {"invoice no", "invoice no.", "invoice number", "invoice #", "inv no", "inv no."}
BUYER_HEADINGS = {"buyer name", "buyer", "customer", "customer name"}
# Columns people keep in their own sheets that carry nothing we need.
IGNORED_HEADINGS = {
    "total", "grand total", "tax value", "total tax", "total qty", "total packs",
    "total pack", "sr", "sr.", "sr no", "sr. no", "sr. no.", "s no", "s.no", "s. no",
}
SKIP_BUYERS = {"total", "grand total"}
# The headings row is normally row 1; a title row or two above it is ignored.
HEADER_SCAN_ROWS = 10
MAX_LISTED = 30
MAX_INVOICE_NO = 60  # Invoice.pos_invoice_no

DATE_FORMATS = (
    "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y",
    "%d-%b-%Y", "%d %b %Y", "%d-%B-%Y", "%d %B %Y", "%d-%b-%y",
)


def name_key(value) -> str:
    """How names are compared: case and extra spaces don't matter."""
    return " ".join(str(value or "").split()).casefold()


# ── Reading the file ────────────────────────────────────────────────────


def sheet_from_csv(content: str) -> list[list[str]] | None:
    try:
        return [[(c or "").strip() for c in row] for row in csv.reader(io.StringIO(content))]
    except csv.Error:
        return None


def sheet_from_excel(raw: bytes) -> list[list[str]] | None:
    from app.services.csv_processor import _excel_cell_to_str

    try:
        wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    except Exception:
        return None
    return [[_excel_cell_to_str(c) for c in row] for row in wb.active.iter_rows()]


def find_header(sheet: list[list[str]] | None) -> int | None:
    """Index of the Date / Invoice No / Buyer Name headings row, or None
    when this isn't a product-grid file (including any file that has the
    normal format's columns)."""
    from app.services.csv_processor import REQUIRED_COLUMNS

    for i, row in enumerate((sheet or [])[:HEADER_SCAN_ROWS]):
        keys = {name_key(c) for c in row}
        if keys & set(REQUIRED_COLUMNS):
            return None
        if keys & DATE_HEADINGS and keys & INVOICE_HEADINGS and keys & BUYER_HEADINGS:
            return i
    return None


def is_grid(sheet) -> bool:
    return find_header(sheet) is not None


def parse_date(text: str) -> date | None:
    text = text.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    try:  # "2026-11-01 00:00:00" and similar
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


# ── Same maths as the single-invoice form (ManualInvoiceModal) ──────────


def _js_round(value: float, dp: int) -> float:
    """Math.round(v * 10^dp) / 10^dp — half up, as the browser rounds."""
    factor = 10**dp
    return math.floor(value * factor + 0.5) / factor


def _num(value) -> str:
    text = repr(float(value))
    return text[:-2] if text.endswith(".0") else text


def _per_pack(amount, packs: float) -> str:
    """A product's per-pack amount scaled to the line; '' = auto / 0."""
    if amount is None or amount == 0:
        return ""
    return _num(_js_round(amount * packs, 2))


def line_row(
    product: Product,
    packs: float,
    customer: Customer,
    invoice_no: str,
    invoice_date: date,
    fbr: FbrSettings,
    target_env: str,
) -> dict[str, str]:
    """One normal-format upload row for ``packs`` of a saved product."""
    pack_priced = bool(fbr.pack_pricing) and product.pack_price is not None
    quantity = _js_round(packs * product.pack_size, 4)
    if pack_priced:
        # packPricing.packLine: a per-UOM price that lands exactly on
        # packs × price per pack.
        value = _js_round(packs * product.pack_price, 2)
        unit_price = f"{value / quantity:.12f}" if quantity > 0 else "0"
    else:
        unit_price = _num(product.unit_price)
    row = {
        "pos_invoice_no": invoice_no,
        "invoice_date": invoice_date.isoformat(),
        "buyer_ntn_cnic": customer.ntn_cnic or "",
        "buyer_name": customer.name,
        "buyer_province": customer.province or "",
        "buyer_address": customer.address or "",
        "buyer_registration_type": customer.registration_type or "Unregistered",
        "product_description": product.description,
        "hs_code": product.hs_code,
        "rate": product.rate,
        "uom": product.uom,
        "quantity": _num(quantity),
        "unit_price": unit_price,
        "sale_type": product.sale_type,
        "scenario_id": (product.scenario_id or "") if target_env != "production" else "",
        "fixed_notified_value": _num(product.fixed_notified_value) if product.fixed_notified_value else "",
        "sro_schedule_no": product.sro_schedule_no or "",
        "sro_item_serial_no": product.sro_item_serial_no or "",
        "sales_tax": _per_pack(product.sales_tax, packs),
        "total_values": _per_pack(product.total_values, packs),
        "fed_payable": _per_pack(product.fed_payable, packs),
        "extra_tax": _per_pack(product.extra_tax, packs),
        "sales_tax_withheld_at_source": _per_pack(product.st_withheld, packs),
        "discount": _per_pack(product.discount, packs),
        "further_tax": _per_pack(product.further_tax, packs),
        "advance_tax": _per_pack(product.advance_tax, packs),
    }
    if fbr.pack_pricing and (customer.strn or "").strip():
        row["buyer_strn"] = customer.strn.strip()
    if pack_priced:
        row["pack_qty"] = _num(packs)
        row["pack_price"] = _num(product.pack_price)
        row["pack_name"] = product.pack_name or ""
    for key, value in invoice_layout.load_values(product.custom_fields).items():
        row[key] = str(value)
    return row


# ── Checking the file ───────────────────────────────────────────────────


@dataclass
class GridResult:
    products: list[str] = field(default_factory=list)
    buyers: list[str] = field(default_factory=list)
    other: list[str] = field(default_factory=list)
    # (sheet row number, normal-format row) — one per product line.
    rows: list[tuple[int, dict]] = field(default_factory=list)
    summary: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not (self.products or self.buyers or self.other)

    def errors_out(self) -> dict:
        return {
            "products": _capped(self.products),
            "buyers": _capped(self.buyers),
            "other": _capped(self.other),
        }

    def error_text(self) -> str:
        errors = self.errors_out()
        parts = ["This file wasn't uploaded. Nothing was sent to FBR."]
        if errors["products"]:
            parts.append("Products not found in your saved Products:")
            parts += [f"• {m}" for m in errors["products"]]
        if errors["buyers"]:
            parts.append("Buyers not found in your saved Customers:")
            parts += [f"• {m}" for m in errors["buyers"]]
        if errors["other"]:
            parts.append("Other problems:")
            parts += [f"• {m}" for m in errors["other"]]
        return "\n".join(parts)


def _capped(items: list[str]) -> list[str]:
    if len(items) <= MAX_LISTED:
        return items
    return [*items[:MAX_LISTED], f"…and {len(items) - MAX_LISTED} more."]


def _rows_label(rows: list[int]) -> str:
    return f"Row {rows[0]}" if len(rows) == 1 else "Rows " + ", ".join(map(str, rows))


def _by_name(records, attr: str) -> dict[str, list]:
    out: dict[str, list] = {}
    for r in records:
        out.setdefault(name_key(getattr(r, attr)), []).append(r)
    return out


def build(
    db: Session,
    user: User,
    fbr: FbrSettings,
    sheet: list[list[str]],
    target_env: str,
) -> GridResult:
    """Check a product-grid sheet against the saved products and customers
    and, when everything is found, turn it into normal-format rows. Every
    problem is collected (not just the first) so the user can fix them all
    at once."""
    res = GridResult()
    h = find_header(sheet)
    if h is None:
        res.other.append("The first row must have Date, Invoice No and Buyer Name headings.")
        return res
    header = sheet[h]

    products = _by_name(
        db.query(Product).filter(Product.user_id == user.id, Product.is_deleted.is_(False)),
        "description",
    )
    customers = _by_name(
        db.query(Customer).filter(Customer.user_id == user.id, Customer.is_deleted.is_(False)),
        "name",
    )

    date_col = inv_col = buyer_col = None
    product_cols: list[tuple[int, str, Product]] = []
    seen: dict[str, str] = {}
    for ci, heading in enumerate(header):
        key = name_key(heading)
        letter = get_column_letter(ci + 1)
        if not key or key in IGNORED_HEADINGS:
            continue
        if key in DATE_HEADINGS and date_col is None:
            date_col = ci
            continue
        if key in INVOICE_HEADINGS and inv_col is None:
            inv_col = ci
            continue
        if key in BUYER_HEADINGS and buyer_col is None:
            buyer_col = ci
            continue
        matches = products.get(key, [])
        if len(matches) == 1:
            if key in seen:
                res.other.append(
                    f'Columns {seen[key]} and {letter} are both "{heading}". '
                    "Keep one column per product."
                )
            else:
                seen[key] = letter
                product_cols.append((ci, letter, matches[0]))
        elif matches:
            res.products.append(
                f'Column {letter}: "{heading}" matches {len(matches)} saved products with '
                "the same name. Rename one on the Products page so each name is used once."
            )
        else:
            res.products.append(
                f'Column {letter}: "{heading}" is not a saved product. Check the spelling, '
                "or add it on the Products page."
            )
    if not product_cols and not res.products:
        res.other.append(
            "No product columns found. After Date, Invoice No and Buyer Name, the first "
            "row should list your saved product names."
        )

    unknown: dict[str, tuple[str, list[int]]] = {}
    ambiguous: dict[str, tuple[str, list[int]]] = {}
    invoice_rows: dict[str, int] = {}
    buyers_used: set[int] = set()
    products_used: set[int] = set()
    total_packs = 0.0
    dates: list[date] = []

    for ri in range(h + 1, len(sheet)):
        row = sheet[ri]
        row_no = ri + 1

        def cell(ci):
            return row[ci].strip() if ci is not None and ci < len(row) else ""

        buyer, inv, date_text = cell(buyer_col), cell(inv_col), cell(date_col)
        if not (buyer or inv or date_text):
            continue  # blank row, or a sub-heading such as "Qty" / "Pack"
        if name_key(buyer) in SKIP_BUYERS:
            continue

        lines: list[tuple[Product, float]] = []
        row_ok = True
        for ci, letter, product in product_cols:
            text = cell(ci).replace(",", "")
            if not text:
                continue
            try:
                packs = float(text)
            except ValueError:
                packs = math.nan
            if not math.isfinite(packs) or packs < 0:
                res.other.append(
                    f'Row {row_no}, column {letter} ({product.description}): "{cell(ci)}" '
                    "is not a number of packs."
                )
                row_ok = False
                continue
            if packs > 0:
                lines.append((product, packs))
        if not lines and row_ok:
            continue  # nothing sold on this row

        customer = None
        if not buyer:
            res.other.append(f"Row {row_no}: Buyer Name is missing.")
            row_ok = False
        else:
            matches = customers.get(name_key(buyer), [])
            if len(matches) == 1:
                customer = matches[0]
            else:
                bucket = ambiguous if matches else unknown
                bucket.setdefault(name_key(buyer), (buyer, []))[1].append(row_no)
                row_ok = False

        if not inv:
            res.other.append(f"Row {row_no}: Invoice No is missing.")
            row_ok = False
        elif len(inv) > MAX_INVOICE_NO:
            res.other.append(f"Row {row_no}: Invoice No is too long (max {MAX_INVOICE_NO} characters).")
            row_ok = False
        elif name_key(inv) in invoice_rows:
            res.other.append(
                f'Rows {invoice_rows[name_key(inv)]} and {row_no}: invoice number "{inv}" is used '
                "twice. Each row is one invoice, so every row needs its own number."
            )
            row_ok = False
        else:
            invoice_rows[name_key(inv)] = row_no

        invoice_date = parse_date(date_text) if date_text else None
        if not date_text:
            res.other.append(f"Row {row_no}: Date is missing.")
            row_ok = False
        elif invoice_date is None:
            res.other.append(
                f'Row {row_no}: "{date_text}" is not a date we can read. '
                "Use a date like 01/11/2026 or 2026-11-01."
            )
            row_ok = False

        if not row_ok:
            continue
        buyers_used.add(customer.id)
        dates.append(invoice_date)
        for product, packs in lines:
            products_used.add(product.id)
            total_packs += packs
            res.rows.append(
                (row_no, line_row(product, packs, customer, inv, invoice_date, fbr, target_env))
            )

    for name, rows in unknown.values():
        res.buyers.append(
            f'{_rows_label(rows)}: "{name}" is not a saved customer. Check the spelling, '
            "or add them on the Customers page."
        )
    for name, rows in ambiguous.values():
        res.buyers.append(
            f'{_rows_label(rows)}: "{name}" matches more than one saved customer. '
            "Rename one on the Customers page so each name is used once."
        )
    if res.ok and not res.rows:
        res.other.append("The file has no packs entered. Enter at least one pack to make an invoice.")

    res.summary = {
        "invoices": len({r["pos_invoice_no"] for _, r in res.rows}),
        "lines": len(res.rows),
        "buyers": len(buyers_used),
        "products": len(products_used),
        "packs": round(total_packs, 5),
        "date_from": min(dates).isoformat() if dates else None,
        "date_to": max(dates).isoformat() if dates else None,
    }
    return res


# ── Template ────────────────────────────────────────────────────────────

TEMPLATE_BLANK_ROWS = 200


def template_xlsx(products: list[Product], buyer_names: list[str]) -> bytes:
    """An Excel template: the fixed headings, then the chosen products'
    exact saved names; optionally one row per saved customer."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Invoices"
    ws.append(["Date", "Invoice No", "Buyer Name", *[p.description for p in products]])
    for name in buyer_names:
        ws.append([None, None, name])
    head_font = Font(bold=True)
    head_fill = PatternFill("solid", fgColor="E8F0FE")
    for c in ws[1]:
        c.font = head_font
        c.fill = head_fill
    ws.column_dimensions["A"].width = 14
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = max(24, min(40, max((len(n) for n in buyer_names), default=0) + 2))
    for i, p in enumerate(products, start=4):
        ws.column_dimensions[get_column_letter(i)].width = max(12, min(40, len(p.description) + 2))
    # Dates show day first; invoice numbers stay text (keeps leading zeros).
    for r in range(2, max(len(buyer_names), TEMPLATE_BLANK_ROWS) + 2):
        ws.cell(r, 1).number_format = "dd/mm/yyyy"
        ws.cell(r, 2).number_format = "@"
    ws.freeze_panes = "D2"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
