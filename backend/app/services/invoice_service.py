"""Builds the FBR DI API JSON payload from a database invoice and
drives the submit flow using the owning user's FBR settings."""

import json
import re

from sqlalchemy.orm import Session

from app.fbr import client
from app.models import FbrSettings, Invoice

# The rate string can carry a percentage, a fixed rupee amount per unit, or
# both (see compute_sales_tax). "18%", "1.43%" -> percentage of the sale
# value; "Rs.3", "Rs 200", "rupees 60 per kilogram" -> amount per unit.
_RATE_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_RATE_PER_UNIT_RE = re.compile(r"(?:rs\.?|rupees)\s*(\d+(?:\.\d+)?)", re.IGNORECASE)


def build_payload(invoice: Invoice, fbr: FbrSettings) -> dict:
    payload = {
        "invoiceType": invoice.invoice_type,
        "invoiceDate": invoice.invoice_date.isoformat(),
        "sellerNTNCNIC": fbr.seller_ntn_cnic,
        "sellerBusinessName": fbr.seller_business_name,
        "sellerProvince": fbr.seller_province,
        "sellerAddress": fbr.seller_address,
        "buyerNTNCNIC": invoice.buyer_ntn_cnic,
        "buyerBusinessName": invoice.buyer_name,
        "buyerProvince": invoice.buyer_province,
        "buyerAddress": invoice.buyer_address,
        "buyerRegistrationType": invoice.buyer_registration_type,
        "invoiceRefNo": invoice.invoice_ref_no,
        "items": [
            {
                "hsCode": item.hs_code,
                "productDescription": item.product_description,
                "rate": item.rate,
                "uoM": item.uom,
                "quantity": item.quantity,
                # Explicit CSV total_values wins; otherwise derive it from
                # the line (sale value + taxes − discount).
                "totalValues": round(item.total_values or item.total_value, 2),
                "valueSalesExcludingST": round(item.value_excl_st, 2),
                "fixedNotifiedValueOrRetailPrice": item.fixed_notified_value,
                "salesTaxApplicable": round(item.sales_tax, 2),
                "salesTaxWithheldAtSource": item.st_withheld,
                # "Goods at Reduced Rate" rejects a literal 0 here as "extra
                # tax provided" (error 0091) — confirmed live 2026-08-17 —
                # even though other sale types accept numeric 0 fine and
                # PRAL's own spec table calls this field numeric. Matches
                # PRAL's own SN028 sample, which uses "" for this sale type.
                "extraTax": (
                    ""
                    if item.sale_type == "Goods at Reduced Rate" and not item.extra_tax
                    else float(item.extra_tax or 0)
                ),
                "furtherTax": item.further_tax,
                "sroScheduleNo": item.sro_schedule_no,
                "fedPayable": item.fed_payable,
                "discount": item.discount,
                "saleType": item.sale_type,
                "sroItemSerialNo": item.sro_item_serial_no,
            }
            for item in invoice.items
        ],
    }
    if fbr.is_sandbox:
        payload["scenarioId"] = invoice.scenario_id
    return payload


def compute_sales_tax(value_excl_st: float, rate: str, quantity: float = 1.0) -> float:
    """Derive sales tax from the rate string, covering the three shapes FBR
    uses across the sandbox scenarios:

      - percentage of the sale value:  "18%", "1.43%", "0%"  (also "Exempt" -> 0)
      - fixed rupees per unit:         "Rs.3", "Rs 200"      -> amount x quantity
      - both together:                 "18% along with rupees 60 per kilogram"
                                       -> 18% of value  +  60 x quantity

    A rate with no number in it (e.g. "Exempt") yields 0.
    """
    rate = (rate or "").strip()
    tax = 0.0
    pct = _RATE_PERCENT_RE.search(rate)
    if pct:
        tax += value_excl_st * float(pct.group(1)) / 100
    per_unit = _RATE_PER_UNIT_RE.search(rate)
    if per_unit:
        tax += float(per_unit.group(1)) * quantity
    return round(tax, 2)


def submit(db: Session, invoice: Invoice, fbr: FbrSettings) -> dict:
    payload = build_payload(invoice, fbr)
    try:
        response = client.post_invoice(payload, fbr)
    except client.FBRError as exc:
        response = {
            "validationResponse": {
                "statusCode": "99",
                "status": "Error",
                "error": str(exc),
            }
        }
    invoice.fbr_response = json.dumps(response, indent=2)
    if client.is_valid(response) and response.get("invoiceNumber"):
        invoice.status = "submitted"
        invoice.fbr_invoice_number = response["invoiceNumber"]
        invoice.fbr_dated = response.get("dated", "")
    else:
        invoice.status = "failed"
    db.commit()
    return response
