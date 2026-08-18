"""Client for the FBR/PRAL Digital Invoicing API (DI API v1.12).

Endpoints (per PRAL technical documentation):
  Sandbox:    https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb
              https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb
  Production: same paths without the ``_sb`` suffix.

Auth: ``Authorization: Bearer <token>`` — token issued via the IRIS portal
(Digital Invoicing section), stored per user in FbrSettings. Sandbox and
production tokens are different, and the caller's IP must be whitelisted
by PRAL.
"""

import json
import random
import time

import httpx

from app.fbr.error_codes import action_for
from app.models import FbrSettings

BASE_URL = "https://gw.fbr.gov.pk/di_data/v1/di"
REFERENCE_BASE_URL = "https://gw.fbr.gov.pk/pdi"

TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class FBRError(Exception):
    def __init__(self, message: str, response: dict | None = None):
        super().__init__(message)
        self.response = response or {}


def _endpoint(action: str, fbr: FbrSettings) -> str:
    suffix = "_sb" if fbr.is_sandbox else ""
    return f"{BASE_URL}/{action}{suffix}"


def _headers(fbr: FbrSettings) -> dict:
    if not fbr.fbr_token:
        raise FBRError(
            "No FBR token configured. Get your sandbox token from the IRIS portal "
            "(Digital Invoicing section) and save it in your FBR settings, or use "
            "mock mode."
        )
    return {
        "Authorization": f"Bearer {fbr.fbr_token}",
        "Content-Type": "application/json",
    }


def _mock_response(payload: dict, posted: bool) -> dict:
    """Simulated FBR response so the app works end-to-end without a token."""
    errors = []
    if not payload.get("sellerNTNCNIC"):
        errors.append("Seller NTN/CNIC is required — set it in FBR settings.")
    if not payload.get("items"):
        errors.append("At least one invoice item is required.")
    if payload.get("invoiceType") == "Debit Note" and not payload.get("invoiceRefNo"):
        errors.append("invoiceRefNo (original invoice number) is required for a Debit Note.")
    for idx, item in enumerate(payload.get("items", []), start=1):
        if not item.get("hsCode"):
            errors.append(f"Item {idx}: hsCode is required.")
        if item.get("quantity", 0) <= 0:
            errors.append(f"Item {idx}: quantity must be positive.")

    if errors:
        return {
            "validationResponse": {
                "statusCode": "01",
                "status": "Invalid",
                "error": " ".join(errors),
            }
        }

    # Shape mirrors real FBR invoice numbers, clearly marked as mock.
    invoice_number = f"MOCK{random.randint(100, 999)}DI{int(time.time() * 1000)}"
    response: dict = {
        "dated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "validationResponse": {
            "statusCode": "00",
            "status": "Valid",
            "error": "",
            "invoiceStatuses": [
                {
                    "itemSNo": str(idx),
                    "statusCode": "00",
                    "status": "Valid",
                    "invoiceNo": f"{invoice_number}-{idx}" if posted else None,
                    "errorCode": "",
                    "error": "",
                }
                for idx, _ in enumerate(payload.get("items", []), start=1)
            ],
        },
    }
    if posted:
        response["invoiceNumber"] = invoice_number
    return response


def validate_invoice(payload: dict, fbr: FbrSettings) -> dict:
    """Validate the invoice JSON with FBR without recording it."""
    if fbr.is_mock:
        return _mock_response(payload, posted=False)
    return _call(_endpoint("validateinvoicedata", fbr), payload, fbr)


def post_invoice(payload: dict, fbr: FbrSettings) -> dict:
    """Post the invoice to FBR; on success the response carries ``invoiceNumber``."""
    if fbr.is_mock:
        return _mock_response(payload, posted=True)
    return _call(_endpoint("postinvoicedata", fbr), payload, fbr)


def _call(url: str, payload: dict, fbr: FbrSettings, retries: int = 2) -> dict:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            resp = httpx.post(url, headers=_headers(fbr), json=payload, timeout=TIMEOUT)
            if resp.status_code == 401:
                raise FBRError(
                    "FBR rejected the token (401). Check the token matches the "
                    "environment (sandbox vs production) and that your IP is "
                    "whitelisted by PRAL."
                )
            resp.raise_for_status()
            try:
                return resp.json()
            except json.JSONDecodeError as exc:
                # FBR occasionally returns 200 OK with a malformed/non-JSON
                # body — a gateway glitch, not an invoice rejection. Retry
                # like a transient network failure rather than letting this
                # crash the whole upload with an unhandled 500.
                last_error = exc
                if attempt < retries:
                    time.sleep(2**attempt)
                    continue
                # Full text server-side (no length limit worth guessing at)
                # so the exact break point is always inspectable in the log,
                # even though the user-facing message only shows a preview.
                print(
                    f"[FBR] Non-JSON response from {url}: {exc.msg} at "
                    f"line {exc.lineno} col {exc.colno} (char {exc.pos}). "
                    f"Full response text:\n{resp.text}"
                )
                raise FBRError(
                    "FBR returned a response that failed to parse as JSON, even "
                    f"after retrying — parse error at line {exc.lineno}, column "
                    f"{exc.colno}: {exc.msg}. The full response was logged "
                    f"server-side. Preview: {resp.text[:1500]!r}"
                ) from exc
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(2**attempt)
        except httpx.HTTPStatusError as exc:
            try:
                body = exc.response.json()
            except json.JSONDecodeError:
                body = {"raw": exc.response.text}
            raise FBRError(
                f"FBR returned HTTP {exc.response.status_code}", response=body
            ) from exc
    raise FBRError(f"Could not reach FBR after {retries + 1} attempts: {last_error}")


def is_valid(fbr_response: dict) -> bool:
    """Per spec v1.12 §4.1.5 the outer statusCode can be "00" while
    individual items fail — every item status must be "00" as well."""
    vr = fbr_response.get("validationResponse", {})
    if vr.get("statusCode") != "00":
        return False
    return all(
        item.get("statusCode") == "00" for item in vr.get("invoiceStatuses") or []
    )


def _with_guidance(message: str, error_code: str) -> str:
    hint = action_for(error_code)
    return f"{message} — {hint}" if hint and hint.lower() not in message.lower() else message


def error_text(fbr_response: dict) -> str:
    vr = fbr_response.get("validationResponse", {})
    parts = []
    if vr.get("error"):
        parts.append(_with_guidance(vr["error"], vr.get("errorCode", "")))
    for item_status in vr.get("invoiceStatuses") or []:
        if item_status.get("error"):
            msg = f"Item {item_status.get('itemSNo', '?')}: {item_status['error']}"
            parts.append(_with_guidance(msg, item_status.get("errorCode", "")))
    return " ".join(p for p in parts if p) or "Unknown FBR validation error"
