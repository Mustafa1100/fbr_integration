"""CSV upload pipeline: parse POS product rows → group into invoices →
submit each to FBR → record results.

CSV format (one row per product/line item; rows sharing the same
``pos_invoice_no`` become one invoice):

    pos_invoice_no,invoice_date,buyer_ntn_cnic,buyer_name,buyer_province,
    buyer_address,buyer_registration_type,product_description,hs_code,
    rate,uom,quantity,unit_price,sale_type,scenario_id,fixed_notified_value,
    sro_schedule_no,sro_item_serial_no,invoice_ref_no,sales_tax,
    sales_tax_withheld_at_source,extra_tax,further_tax,fed_payable,discount,
    total_values

Required per row: pos_invoice_no, invoice_date (YYYY-MM-DD),
product_description, hs_code, quantity, unit_price. Everything else falls
back to sensible defaults / the user's FBR settings.

fixed_notified_value / sro_schedule_no / sro_item_serial_no are optional —
they only matter for retail-reduced-rate goods (FBR scenarios SN008, SN027,
SN028). Only sale_type "3rd Schedule Goods" (SN008, SN027) is actually
*priced and taxed* off the fixed/notified value instead of quantity ×
unit price (spec error 0090/0102 if missing there). "Goods at Reduced Rate"
(SN028) still carries fixed_notified_value/SRO fields for reference, but
tax is computed off the normal sale value — confirmed against FBR's live
sandbox and PRAL's own SN028 sample.

invoice_ref_no plus the per-line amount columns (sales_tax,
sales_tax_withheld_at_source, extra_tax, further_tax, fed_payable, discount,
total_values) map 1:1 to the matching PRAL invoice/item JSON keys. All are
optional: a blank cell (or the column being absent entirely) keeps the
previous behaviour — the amount columns default to 0, and sales_tax /
total_values are derived by the app. They exist so a provider whose POS/ERP
already carries e.g. a discount or withheld tax can pass those figures
straight through instead of losing them.
"""

import csv
import io
from datetime import date, datetime

import openpyxl
from sqlalchemy.orm import Session

from app.fbr.scenario_samples import SCENARIO_NAMES, SCENARIO_SAMPLE_ITEMS
from app.models import FbrSettings, Invoice, InvoiceItem, Upload, User
from app.services import invoice_service

REQUIRED_COLUMNS = [
    "pos_invoice_no",
    "invoice_date",
    "product_description",
    "hs_code",
    "quantity",
    "unit_price",
]

# Item-level amount columns that are optional and, when given, must parse
# as a number. Blank / absent -> 0 (or -> app-derived for sales_tax and
# total_values, see _process_rows).
OPTIONAL_NUMERIC_COLUMNS = [
    "fixed_notified_value",
    "sales_tax",
    "sales_tax_withheld_at_source",
    "extra_tax",
    "further_tax",
    "fed_payable",
    "discount",
    "total_values",
]

ALL_COLUMNS = [
    "pos_invoice_no",
    "invoice_date",
    "buyer_ntn_cnic",
    "buyer_name",
    "buyer_province",
    "buyer_address",
    "buyer_registration_type",
    "product_description",
    "hs_code",
    "rate",
    "uom",
    "quantity",
    "unit_price",
    "sale_type",
    "scenario_id",
    "fixed_notified_value",
    "sro_schedule_no",
    "sro_item_serial_no",
    # Optional — map straight to the matching PRAL JSON keys. Appended after
    # the original columns so an existing template/file keeps every column
    # in the same position.
    "invoice_ref_no",
    "sales_tax",
    "sales_tax_withheld_at_source",
    "extra_tax",
    "further_tax",
    "fed_payable",
    "discount",
    "total_values",
]

TEMPLATE_ROWS = [
    {
        "pos_invoice_no": "POS-1001",
        "invoice_date": "2026-08-15",
        "buyer_ntn_cnic": "1234567",
        "buyer_name": "ABC Traders",
        "buyer_province": "Punjab",
        "buyer_address": "Mall Road, Lahore",
        "buyer_registration_type": "Registered",
        "product_description": "Laptop Computer 15 inch",
        "hs_code": "8471.3010",
        "rate": "18%",
        "uom": "Numbers, pieces, units",
        "quantity": "2",
        "unit_price": "150000",
        "sale_type": "Goods at standard rate (default)",
        "scenario_id": "SN001",
    },
    {
        "pos_invoice_no": "POS-1001",
        "invoice_date": "2026-08-15",
        "buyer_ntn_cnic": "1234567",
        "buyer_name": "ABC Traders",
        "buyer_province": "Punjab",
        "buyer_address": "Mall Road, Lahore",
        "buyer_registration_type": "Registered",
        "product_description": "Wireless Mouse",
        "hs_code": "8471.6020",
        "rate": "18%",
        "uom": "Numbers, pieces, units",
        "quantity": "5",
        "unit_price": "2500",
        "sale_type": "Goods at standard rate (default)",
        "scenario_id": "SN001",
    },
    {
        "pos_invoice_no": "POS-1002",
        "invoice_date": "2026-08-15",
        "buyer_ntn_cnic": "",
        "buyer_name": "Walk-in Customer",
        "buyer_province": "Sindh",
        "buyer_address": "Karachi",
        "buyer_registration_type": "Unregistered",
        "product_description": "Mobile Phone",
        "hs_code": "8517.1219",
        "rate": "18%",
        "uom": "Numbers, pieces, units",
        "quantity": "1",
        "unit_price": "45000",
        "sale_type": "Goods at standard rate (default)",
        "scenario_id": "SN002",
        # Optional amount columns — shown here only to demonstrate the
        # format. Leave them blank when they don't apply.
        "discount": "500",
    },
]


def template_csv(include_scenario: bool = True) -> str:
    """The generic starter template. ``include_scenario=False`` drops the
    scenario_id column entirely — production accounts don't tag invoices
    with a sandbox test scenario at all (see the Column Guide's own
    production-vs-sandbox note), so a production user's only template
    shouldn't carry a column that means nothing for them."""
    fieldnames = ALL_COLUMNS if include_scenario else [c for c in ALL_COLUMNS if c != "scenario_id"]
    rows = TEMPLATE_ROWS
    if not include_scenario:
        rows = [{k: v for k, v in row.items() if k != "scenario_id"} for row in TEMPLATE_ROWS]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def scenario_template_csv(scenario_id: str) -> str | None:
    """A CSV template pre-filled from FBR/PRAL's own worked example for one
    sandbox scenario (SN001–SN028) — same hsCode/rate/uoM/saleType they use
    in the official spec, so a scenario-testing submission doesn't fail on a
    combination FBR considers invalid before the business logic is even
    tested. Returns None for an unrecognized scenario code."""
    item = SCENARIO_SAMPLE_ITEMS.get(scenario_id)
    if not item:
        return None
    quantity = item["quantity"] or 1
    fixed_value = item.get("fixedNotifiedValueOrRetailPrice") or 0
    # 3rd Schedule / retail-reduced-rate goods (SN008, SN027, SN028) price
    # off the fixed/notified value, not quantity × unit price — leave
    # unit_price at 0 for those so csv_processor prices the line correctly.
    if fixed_value > 0:
        unit_price = 0
    else:
        unit_price = round(item["valueSalesExcludingST"] / quantity, 2)
    buyer_registered = item["buyerRegistrationType"] == "Registered"
    row = {
        "pos_invoice_no": f"{scenario_id}-TEST-1",
        "invoice_date": date.today().isoformat(),
        "buyer_ntn_cnic": "1234567" if buyer_registered else "",
        "buyer_name": "Test Registered Buyer" if buyer_registered else "Walk-in Customer",
        "buyer_province": "Sindh",
        "buyer_address": "Karachi",
        "buyer_registration_type": item["buyerRegistrationType"],
        "product_description": item["productDescription"],
        "hs_code": item["hsCode"],
        "rate": item["rate"],
        "uom": item["uoM"],
        "quantity": quantity,
        "unit_price": unit_price,
        "sale_type": item["saleType"],
        "scenario_id": scenario_id,
        "fixed_notified_value": fixed_value or "",
        "sro_schedule_no": item.get("sroScheduleNo") or "",
        "sro_item_serial_no": item.get("sroItemSerialNo") or "",
    }
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=ALL_COLUMNS)
    writer.writeheader()
    writer.writerow(row)
    return buf.getvalue()


def scenario_catalog() -> list[dict]:
    """Scenarios with a ready-made official sample — for the scenario picker."""
    return [
        {"code": code, "name": SCENARIO_NAMES.get(code, code)}
        for code in sorted(SCENARIO_SAMPLE_ITEMS)
    ]


class CsvError(Exception):
    pass


def _row_amount(row: dict, col: str) -> float:
    """One optional numeric cell -> float, treating blank/absent as 0.
    Values are pre-validated as parseable in ``_validate_and_collect``."""
    return round(float(row.get(col) or 0), 2)


def _validate_and_collect(fieldnames: list[str], rows_iter) -> list[dict]:
    """Shared validation core for both CSV and Excel uploads: required
    columns present, then per-row required fields / date format / numeric
    fields. ``rows_iter`` yields (line_no, row) where row is already a
    normalized {lowercased column: stripped string value} dict — the two
    format-specific adapters below are responsible for getting each format
    into that shape before handing rows to this function, so every error
    message here reads identically regardless of which file type produced
    it (and the line number matches the actual spreadsheet/CSV row)."""
    missing = [c for c in REQUIRED_COLUMNS if c not in fieldnames]
    if missing:
        raise CsvError(
            f"Missing required columns: {', '.join(missing)}. "
            "Download the template for the correct format."
        )
    rows = []
    for line_no, row in rows_iter:
        if not any(row.values()):
            continue
        for col in REQUIRED_COLUMNS:
            if not row.get(col):
                raise CsvError(f"Row {line_no}: '{col}' is required.")
        try:
            date.fromisoformat(row["invoice_date"])
        except ValueError:
            raise CsvError(
                f"Row {line_no}: invoice_date must be YYYY-MM-DD "
                f"(got '{row['invoice_date']}')."
            )
        try:
            float(row["quantity"])
            float(row["unit_price"])
            for col in OPTIONAL_NUMERIC_COLUMNS:
                if row.get(col):
                    float(row[col])
        except ValueError:
            raise CsvError(
                f"Row {line_no}: quantity, unit_price, and the optional amount "
                "columns (if given) must be numbers."
            )
        rows.append(row)
    if not rows:
        raise CsvError("The file has no data rows.")
    return rows


def _parse_rows(content: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise CsvError("The CSV file is empty.")
    fieldnames = [f.strip().lower() for f in reader.fieldnames]

    def rows_iter():
        for line_no, raw in enumerate(reader, start=2):
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
            yield line_no, row

    return _validate_and_collect(fieldnames, rows_iter())


def _excel_cell_to_str(cell) -> str:
    """Normalize one openpyxl cell to the same plain-string shape a CSV
    field would have. Excel silently reformats cells that "look like"
    dates or percentages (see the warning on the Column Guide page) —
    handled explicitly here instead of naively str()-ing the raw value,
    which would otherwise turn a "18%" rate cell into "0.18" or an
    invoice_date cell into a Python datetime repr."""
    value = cell.value
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (int, float)):
        if "%" in (cell.number_format or ""):
            pct = round(value * 100, 2)
            return f"{pct:g}%"
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)
    return str(value).strip()


def _parse_excel_rows(raw: bytes) -> list[dict]:
    try:
        wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    except Exception as exc:
        raise CsvError(
            "Could not read the Excel file — make sure it's a valid, "
            "unprotected .xlsx workbook."
        ) from exc
    ws = wb.active
    sheet_rows = ws.iter_rows()
    try:
        header_cells = next(sheet_rows)
    except StopIteration:
        raise CsvError("The Excel file is empty.")
    fieldnames = [str(c.value or "").strip().lower() for c in header_cells]

    def rows_iter():
        for line_no, cells in enumerate(sheet_rows, start=2):
            row = {
                name: _excel_cell_to_str(cell)
                for name, cell in zip(fieldnames, cells)
                if name
            }
            yield line_no, row

    return _validate_and_collect(fieldnames, rows_iter())


def _new_upload(user: User, filename: str) -> Upload:
    return Upload(
        user_id=user.id,
        filename=filename,
        total_rows=0,
        invoices_created=0,
        invoices_submitted=0,
        invoices_failed=0,
    )


def process_upload(
    db: Session, user: User, fbr: FbrSettings, filename: str, content: str
) -> Upload:
    upload = _new_upload(user, filename)
    db.add(upload)
    try:
        rows = _parse_rows(content)
    except CsvError as exc:
        upload.status = "failed"
        upload.error = str(exc)
        db.commit()
        return upload
    return _process_rows(db, user, fbr, upload, rows)


def process_upload_excel(
    db: Session, user: User, fbr: FbrSettings, filename: str, raw: bytes
) -> Upload:
    upload = _new_upload(user, filename)
    db.add(upload)
    try:
        rows = _parse_excel_rows(raw)
    except CsvError as exc:
        upload.status = "failed"
        upload.error = str(exc)
        db.commit()
        return upload
    return _process_rows(db, user, fbr, upload, rows)


def _process_rows(
    db: Session, user: User, fbr: FbrSettings, upload: Upload, rows: list[dict]
) -> Upload:
    upload.total_rows = len(rows)

    # Group rows by POS invoice number, preserving first-seen order.
    groups: dict[str, list[dict]] = {}
    for row in rows:
        groups.setdefault(row["pos_invoice_no"], []).append(row)

    for pos_no, group in groups.items():
        first = group[0]
        invoice = Invoice(
            user_id=user.id,
            upload=upload,
            pos_invoice_no=pos_no,
            invoice_date=date.fromisoformat(first["invoice_date"]),
            invoice_ref_no=first.get("invoice_ref_no", ""),
            scenario_id=first.get("scenario_id") or fbr.default_scenario,
            buyer_ntn_cnic=first.get("buyer_ntn_cnic", ""),
            buyer_name=first.get("buyer_name") or "Walk-in Customer",
            buyer_province=first.get("buyer_province") or fbr.seller_province,
            buyer_address=first.get("buyer_address", ""),
            buyer_registration_type=first.get("buyer_registration_type")
            or "Unregistered",
        )
        for row in group:
            quantity = float(row["quantity"])
            unit_price = float(row["unit_price"])
            value_excl = round(quantity * unit_price, 2)
            rate = row.get("rate") or "18%"
            # fixed_notified_value is entered as a per-unit MRP (what's
            # actually printed on the package) — multiply by quantity so the
            # tax basis reflects the whole line, matching how value_excl
            # (quantity * unit_price) already works for standard-rate goods.
            fixed_notified_value = round(
                float(row.get("fixed_notified_value") or 0) * quantity, 2
            )
            sale_type = row.get("sale_type") or "Goods at standard rate (default)"
            if fixed_notified_value > 0 and value_excl == 0:
                # PRAL's own official samples send valueSalesExcludingST: 0
                # whenever a fixed/notified value is used instead (correct
                # per the spec). In practice FBR's live sandbox validator
                # rejects a literal 0 here as "invalid" (error 0300), a
                # validator bug/doc mismatch on FBR's side — confirmed
                # 2026-08-17 against real sandbox responses. A negligible
                # non-zero placeholder satisfies it without meaningfully
                # affecting the invoice total.
                value_excl = 0.01
            # Only "3rd Schedule Goods" (retail-price-scheme items, e.g.
            # SN008/SN027) are *taxed* off the fixed/notified value — FBR
            # rejects the invoice (error 0102) if salesTaxApplicable doesn't
            # match that basis for those. "Goods at Reduced Rate" (SN028)
            # also carries a fixedNotifiedValueOrRetailPrice for reference,
            # but per PRAL's own official SN028 sample (salesTaxApplicable:
            # 0, matching valueSalesExcludingST: 0, NOT the fixed value of
            # 100) tax is still computed off the sale value for that sale
            # type — confirmed live 2026-08-18 (FBR error: "Provided sales
            # tax amount does not match the calculated sales tax amount...
            # the provided Sale Value is used to calculate the Sales Tax").
            uses_fixed_value_basis = (
                fixed_notified_value > 0 and sale_type == "3rd Schedule Goods"
            )
            tax_base = fixed_notified_value if uses_fixed_value_basis else value_excl
            # Optional amounts a provider's own POS/ERP may already carry.
            # Blank -> 0; sales_tax / total_values blank -> app-derived.
            explicit_tax = row.get("sales_tax")
            sales_tax = (
                round(float(explicit_tax), 2)
                if explicit_tax
                else invoice_service.compute_sales_tax(tax_base, rate, quantity)
            )
            invoice.items.append(
                InvoiceItem(
                    product_description=row["product_description"],
                    hs_code=row["hs_code"],
                    rate=rate,
                    uom=row.get("uom") or "Numbers, pieces, units",
                    quantity=quantity,
                    unit_price=unit_price,
                    value_excl_st=value_excl,
                    sales_tax=sales_tax,
                    st_withheld=_row_amount(row, "sales_tax_withheld_at_source"),
                    extra_tax=_row_amount(row, "extra_tax"),
                    further_tax=_row_amount(row, "further_tax"),
                    fed_payable=_row_amount(row, "fed_payable"),
                    discount=_row_amount(row, "discount"),
                    total_values=_row_amount(row, "total_values"),
                    fixed_notified_value=fixed_notified_value,
                    sro_schedule_no=row.get("sro_schedule_no") or "",
                    sro_item_serial_no=row.get("sro_item_serial_no") or "",
                    sale_type=sale_type,
                )
            )
        db.add(invoice)
        upload.invoices_created += 1
        db.commit()

        invoice_service.submit(db, invoice, fbr)
        if invoice.status == "submitted":
            upload.invoices_submitted += 1
        else:
            upload.invoices_failed += 1
        db.commit()

    upload.status = (
        "completed" if upload.invoices_failed == 0 else "completed_with_errors"
    )
    db.commit()
    return upload
