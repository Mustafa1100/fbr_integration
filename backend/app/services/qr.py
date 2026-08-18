"""QR code for the printed invoice.

SRO 69(I)/2025 requires the FBR invoice number and a QR code on every
issued invoice. The QR encodes the FBR-assigned invoice number.
"""

import base64
import io

import qrcode


def qr_data_uri(fbr_invoice_number: str) -> str:
    img = qrcode.make(fbr_invoice_number, box_size=6, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{encoded}"
