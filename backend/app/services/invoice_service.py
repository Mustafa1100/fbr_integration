"""Builds the FBR DI API JSON payload from a database invoice and
drives the submit flow using the owning user's FBR settings."""

import json

from sqlalchemy.orm import Session

from app.fbr import client
from app.models import FbrSettings, Invoice


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
                "totalValues": round(item.total_value, 2),
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


def compute_sales_tax(value_excl_st: float, rate: str) -> float:
    """Derive sales tax from the rate string ("18%", "Exempt", "0%")."""
    rate = rate.strip()
    if rate.endswith("%"):
        try:
            return round(value_excl_st * float(rate[:-1]) / 100, 2)
        except ValueError:
            return 0.0
    return 0.0


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
