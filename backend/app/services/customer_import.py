"""Bulk customer import from a CSV / Excel list (Customers page).

    Buyer Name | NTN / CNIC | Registration Type | Province | Address | STRN

Only Buyer Name is required. The whole file is checked first and every
problem is listed; nothing is saved unless the whole file is clean, so a
fixed file can simply be uploaded again.
"""

import io
import re

import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
from sqlalchemy.orm import Session

from app.fbr import reference
from app.models import Customer, FbrSettings, User
from app.services.grid_upload import name_key

MAX_ROWS = 2000
MAX_LISTED = 50
HEADER_SCAN_ROWS = 10
REGISTRATION_TYPES = ("Registered", "Unregistered")

# Heading (as compared by name_key) -> field.
HEADINGS = {
    "buyer name": "name", "name": "name", "customer name": "name", "customer": "name", "buyer": "name",
    "ntn / cnic": "ntn_cnic", "ntn/cnic": "ntn_cnic", "ntn cnic": "ntn_cnic", "ntn or cnic": "ntn_cnic",
    "ntn": "ntn_cnic", "cnic": "ntn_cnic", "ntn / cnic no": "ntn_cnic",
    "registration type": "registration_type", "registration": "registration_type", "type": "registration_type",
    "province": "province", "address": "address", "strn": "strn",
}

# Common short names people use for provinces.
PROVINCE_ALIASES = {
    "kpk": "khyber pakhtunkhwa", "kp": "khyber pakhtunkhwa", "nwfp": "khyber pakhtunkhwa",
    "islamabad": "capital territory", "ict": "capital territory", "islamabad capital territory": "capital territory",
    "federal": "capital territory", "ajk": "azad jammu and kashmir", "azad kashmir": "azad jammu and kashmir",
    "gb": "gilgit baltistan", "gilgit-baltistan": "gilgit baltistan", "baluchistan": "balochistan",
}


def province_names(fbr: FbrSettings) -> list[str]:
    """Province names as the app shows and stores them ("SINDH" -> "Sindh")."""
    try:
        rows = reference.provinces(fbr)
    except Exception:
        rows = reference.MOCK_PROVINCES
    names = []
    for p in rows:
        desc = str(p.get("stateProvinceDesc", "")).strip()
        if desc:
            names.append(re.sub(r"\b\w", lambda m: m.group(0).upper(), desc.lower()))
    return names


def _with_strn(fbr: FbrSettings) -> bool:
    return bool(fbr.pack_pricing)


# ── Template ────────────────────────────────────────────────────────────

TEMPLATE_ROWS = 1000


def template_xlsx(fbr: FbrSettings) -> bytes:
    """Empty Excel list with the headings, dropdowns for Registration Type
    and Province, NTN / CNIC kept as text (no lost leading zeros), and a
    second sheet explaining each column."""
    provinces = province_names(fbr)
    headings = ["Buyer Name", "NTN / CNIC", "Registration Type", "Province", "Address"]
    if _with_strn(fbr):
        headings.append("STRN")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Customers"
    ws.append(headings)
    for c in ws[1]:
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="E8F0FE")
    widths = {"A": 32, "B": 18, "C": 20, "D": 24, "E": 40, "F": 18}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w
    last = TEMPLATE_ROWS + 1
    for r in range(2, last + 1):
        ws.cell(r, 2).number_format = "@"
        if _with_strn(fbr):
            ws.cell(r, 6).number_format = "@"
    reg = DataValidation(type="list", formula1='"Registered,Unregistered"', allow_blank=True)
    reg.add(f"C2:C{last}")
    ws.add_data_validation(reg)
    prov_list = ",".join(provinces)
    if provinces and len(prov_list) < 250:
        prov = DataValidation(type="list", formula1=f'"{prov_list}"', allow_blank=True)
        prov.add(f"D2:D{last}")
        ws.add_data_validation(prov)
    ws.freeze_panes = "A2"

    help_ws = wb.create_sheet("How to fill")
    help_ws.column_dimensions["A"].width = 22
    help_ws.column_dimensions["B"].width = 90
    rows = [
        ("Column", "What to enter"),
        ("Buyer Name", "Required."),
        ("NTN / CNIC", "Optional. Numbers only, e.g. 4120144015589. Dashes and spaces are removed."),
        ("Registration Type", "Registered or Unregistered. Required when an NTN / CNIC is given; "
                              "blank = Unregistered when there is no number."),
        ("Province", "Optional. One of: " + ", ".join(provinces) + "."),
        ("Address", "Optional."),
    ]
    if _with_strn(fbr):
        rows.append(("STRN", "Optional. The buyer's sales tax registration number (shown on receipts)."))
    rows.append(("", ""))
    rows.append(("Note", "Fill the list on the Customers sheet, one customer per row, then use "
                         "Import customers on the Customers page. Nothing is saved until the "
                         "whole file is correct."))
    for r in rows:
        help_ws.append(list(r))
    help_ws["A1"].font = help_ws["B1"].font = Font(bold=True)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── Checking and importing ──────────────────────────────────────────────


def _capped(items: list[str]) -> list[str]:
    if len(items) <= MAX_LISTED:
        return items
    return [*items[:MAX_LISTED], f"…and {len(items) - MAX_LISTED} more."]


def check(db: Session, user: User, fbr: FbrSettings, sheet: list[list[str]] | None) -> dict:
    """Check every row. Returns {"ok", "errors", "customers" (cleaned rows
    ready to save), "summary"}."""
    errors: list[str] = []
    out = {"ok": False, "errors": errors, "customers": [], "summary": {}}
    if not sheet:
        errors.append("The file is empty or couldn't be read. Use the template from the Customers page.")
        return out

    header_at, cols = None, {}
    for i, row in enumerate(sheet[:HEADER_SCAN_ROWS]):
        found = {}
        for ci, cell in enumerate(row):
            field = HEADINGS.get(name_key(cell))
            if field and field not in found:
                found[field] = ci
        if "name" in found:
            header_at, cols = i, found
            break
    if header_at is None:
        errors.append(
            'The first row must have a "Buyer Name" heading. Download the template for the right format.'
        )
        return out

    with_strn = _with_strn(fbr)
    provinces = {name_key(p): p for p in province_names(fbr)}
    customers = []
    rows_seen = 0
    for ri in range(header_at + 1, len(sheet)):
        row = sheet[ri]
        row_no = ri + 1

        def cell(field):
            ci = cols.get(field)
            return (row[ci] if ci is not None and ci < len(row) else "").strip()

        values = {f: cell(f) for f in cols}
        if not any(values.values()):
            continue
        rows_seen += 1
        if rows_seen > MAX_ROWS:
            errors.append(f"The file has more than {MAX_ROWS} customers. Split it into smaller files.")
            break
        problems = []

        name = " ".join(values.get("name", "").split())
        if not name:
            problems.append(f"Row {row_no}: Buyer Name is missing.")
        elif len(name) > 200:
            problems.append(f"Row {row_no}: Buyer Name is too long (max 200 characters).")

        raw_number = values.get("ntn_cnic", "")
        number = re.sub(r"[\s\-]", "", raw_number)
        if number and not (number.isascii() and number.isdigit()):
            problems.append(f'Row {row_no}: NTN / CNIC "{raw_number}" must be numbers only.')
        elif len(number) > 20:
            problems.append(f"Row {row_no}: NTN / CNIC is too long (max 20 digits).")

        reg_text = values.get("registration_type", "")
        reg = next((t for t in REGISTRATION_TYPES if name_key(t) == name_key(reg_text)), None)
        if reg_text and reg is None:
            problems.append(
                f'Row {row_no}: Registration Type "{reg_text}" must be Registered or Unregistered.'
            )
        elif not reg_text and number:
            problems.append(
                f"Row {row_no}: Registration Type is needed when an NTN / CNIC is given "
                "(Registered or Unregistered)."
            )
        reg = reg or "Unregistered"

        prov_text = values.get("province", "")
        key = name_key(prov_text)
        province = provinces.get(PROVINCE_ALIASES.get(key, key), "")
        if prov_text and not province:
            problems.append(
                f'Row {row_no}: Province "{prov_text}" is not a province. '
                f"Use one of: {', '.join(provinces.values())}."
            )

        address = " ".join(values.get("address", "").split())
        if len(address) > 300:
            problems.append(f"Row {row_no}: Address is too long (max 300 characters).")
        strn = values.get("strn", "").strip() if with_strn else ""
        if len(strn) > 20:
            problems.append(f"Row {row_no}: STRN is too long (max 20 characters).")

        if problems:
            errors.extend(problems)
            continue
        customers.append(
            {
                "name": name,
                "ntn_cnic": number,
                "registration_type": reg,
                "province": province,
                "address": address,
                "strn": strn,
            }
        )

    if not errors and not customers:
        errors.append("The file has no customers. Fill in at least one Buyer Name.")
    out["ok"] = not errors
    out["errors"] = _capped(errors)
    out["customers"] = customers
    out["summary"] = {
        "customers": len(customers),
        "registered": sum(c["registration_type"] == "Registered" for c in customers),
        "unregistered": sum(c["registration_type"] == "Unregistered" for c in customers),
    }
    return out


def save(db: Session, user: User, customers: list[dict]) -> int:
    for c in customers:
        db.add(Customer(user_id=user.id, **c))
    db.commit()
    return len(customers)
