"""The desktop licence: a small statement of what a PC may do, signed with
the server's Ed25519 key so it cannot be edited on the PC.

The desktop app checks the signature with the public key built into it and
enforces the licence by itself, so it works offline; a new licence comes with
every sync. It is valid until the plan ends, or for `licence_offline_days`
after it was issued, whichever is sooner — so a PC has to reach the server
now and then, and a cancelled client cannot simply stay offline.
"""

from datetime import timedelta
from functools import lru_cache
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.config import get_settings
from app.models import Client, utcnow
from app.serializers import iso, subscription_status


@lru_cache
def _private_key() -> Ed25519PrivateKey:
    cfg = get_settings()
    if cfg.licence_private_key.strip():
        # Accepts the PEM as is, or on one line with "\n" for the line breaks
        # (handy for hosting secrets such as `fly secrets set`).
        pem = cfg.licence_private_key.strip().replace("\\n", "\n").encode()
    else:
        if cfg.is_production:
            raise RuntimeError("LICENCE_PRIVATE_KEY must be set in production")
        path = Path(cfg.licence_key_file)
        if not path.exists():
            key = Ed25519PrivateKey.generate()
            path.write_bytes(
                key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.PKCS8,
                    serialization.NoEncryption(),
                )
            )
            print(f"[licence] created a development signing key in {path.resolve()}")
        pem = path.read_bytes()
    return serialization.load_pem_private_key(pem, password=None)


def public_key_pem() -> str:
    """The half the desktop app needs, to verify licences."""
    return (
        _private_key()
        .public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )


def issue(client: Client) -> str:
    now = utcnow()
    current = client.current_subscription
    plan_end = client.expires_at
    offline_end = now + timedelta(days=get_settings().licence_offline_days)
    valid_until = min(plan_end, offline_end) if plan_end else now
    payload = {
        "sub": str(client.id),
        "usr": client.username,
        "status": subscription_status(client, now),
        "plan": current.plan_name if current else "",
        "plan_ends_at": iso(plan_end),
        "issued_at": iso(now),
        "valid_until": iso(valid_until),
        "active": client.is_active,
    }
    return jwt.encode(payload, _private_key(), algorithm="EdDSA")
