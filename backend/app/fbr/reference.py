"""FBR/PRAL reference (lookup) APIs with a small in-memory cache.

These power dropdowns in the UI: provinces, HS codes, units of measure and
sale types. In mock mode (or when the user has no token yet) a useful
built-in subset is returned so the UI works without credentials.
"""

import time

import httpx

from app.fbr.client import REFERENCE_BASE_URL, TIMEOUT
from app.models import FbrSettings

_CACHE: dict[str, tuple[float, list]] = {}
_CACHE_TTL_SECONDS = 24 * 3600

MOCK_PROVINCES = [
    {"stateProvinceCode": 2, "stateProvinceDesc": "BALOCHISTAN"},
    {"stateProvinceCode": 4, "stateProvinceDesc": "AZAD JAMMU AND KASHMIR"},
    {"stateProvinceCode": 5, "stateProvinceDesc": "CAPITAL TERRITORY"},
    {"stateProvinceCode": 6, "stateProvinceDesc": "KHYBER PAKHTUNKHWA"},
    {"stateProvinceCode": 7, "stateProvinceDesc": "PUNJAB"},
    {"stateProvinceCode": 8, "stateProvinceDesc": "SINDH"},
    {"stateProvinceCode": 9, "stateProvinceDesc": "GILGIT BALTISTAN"},
]

MOCK_UOMS = [
    {"uoM_ID": 13, "description": "Numbers, pieces, units"},
    {"uoM_ID": 22, "description": "KG"},
    {"uoM_ID": 25, "description": "Liter"},
    {"uoM_ID": 42, "description": "Meter"},
    {"uoM_ID": 77, "description": "Square Meter"},
    {"uoM_ID": 96, "description": "Metric Ton"},
]

MOCK_HS_CODES = [
    {"hS_CODE": "0101.2100", "description": "PURE-BRED BREEDING ANIMALS (HORSES)"},
    {"hS_CODE": "2710.1210", "description": "MOTOR SPIRIT (PETROL)"},
    {"hS_CODE": "7214.9990", "description": "STEEL BARS AND RODS, OTHER"},
    {"hS_CODE": "8471.3010", "description": "LAPTOP COMPUTERS, NOTEBOOKS"},
    {"hS_CODE": "8517.1219", "description": "MOBILE PHONES / SMARTPHONES, OTHER"},
]

# Official saleType strings, collected from every scenario's worked example in
# PRAL's "DI Scenarios Description for Sandbox Testing" v1.11 — the API takes
# this exact string, not the id (transactioN_TYPE_ID is a UI-only key here).
MOCK_SALE_TYPES = [
    {"transactioN_TYPE_ID": 1, "transactioN_DESC": "Goods at standard rate (default)"},
    {"transactioN_TYPE_ID": 2, "transactioN_DESC": "Goods at Reduced Rate"},
    {"transactioN_TYPE_ID": 3, "transactioN_DESC": "Exempt goods"},
    {"transactioN_TYPE_ID": 4, "transactioN_DESC": "Goods at zero-rate"},
    {"transactioN_TYPE_ID": 5, "transactioN_DESC": "3rd Schedule Goods"},
    {"transactioN_TYPE_ID": 6, "transactioN_DESC": "Cotton ginners"},
    {"transactioN_TYPE_ID": 7, "transactioN_DESC": "Telecommunication services"},
    {"transactioN_TYPE_ID": 8, "transactioN_DESC": "Steel melting and re-rolling"},
    {"transactioN_TYPE_ID": 9, "transactioN_DESC": "Ship breaking"},
    {"transactioN_TYPE_ID": 10, "transactioN_DESC": "Toll Manufacturing"},
    {"transactioN_TYPE_ID": 11, "transactioN_DESC": "Petroleum Products"},
    {"transactioN_TYPE_ID": 12, "transactioN_DESC": "Electricity Supply to Retailers"},
    {"transactioN_TYPE_ID": 13, "transactioN_DESC": "Gas to CNG stations"},
    {"transactioN_TYPE_ID": 14, "transactioN_DESC": "Mobile Phones"},
    {"transactioN_TYPE_ID": 15, "transactioN_DESC": "Processing/Conversion of Goods"},
    {"transactioN_TYPE_ID": 16, "transactioN_DESC": "Goods (FED in ST Mode)"},
    {"transactioN_TYPE_ID": 17, "transactioN_DESC": "Services (FED in ST Mode)"},
    {"transactioN_TYPE_ID": 18, "transactioN_DESC": "Services"},
    {"transactioN_TYPE_ID": 19, "transactioN_DESC": "Electric Vehicle"},
    {"transactioN_TYPE_ID": 20, "transactioN_DESC": "Cement /Concrete Block"},
    {"transactioN_TYPE_ID": 21, "transactioN_DESC": "Potassium Chlorate"},
    {"transactioN_TYPE_ID": 22, "transactioN_DESC": "CNG Sales"},
    {"transactioN_TYPE_ID": 23, "transactioN_DESC": "Goods as per SRO.297(I)/2023"},
    {"transactioN_TYPE_ID": 24, "transactioN_DESC": "Non-Adjustable Supplies"},
]


def _fetch(path: str, mock_data: list, fbr: FbrSettings | None) -> list:
    # PRAL's reference data is the same across environments; use whichever
    # real token the account has (sandbox preferred, else production).
    token = fbr and (fbr.sandbox_token or fbr.production_token)
    if fbr is None or fbr.is_mock or not token:
        return mock_data

    cached = _CACHE.get(path)
    if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get(f"{REFERENCE_BASE_URL}{path}", headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    _CACHE[path] = (time.time(), data)
    return data


def provinces(fbr: FbrSettings | None = None) -> list:
    return _fetch("/v1/provinces", MOCK_PROVINCES, fbr)


def uoms(fbr: FbrSettings | None = None) -> list:
    return _fetch("/v1/uom", MOCK_UOMS, fbr)


def hs_codes(fbr: FbrSettings | None = None) -> list:
    return _fetch("/v1/itemdesccode", MOCK_HS_CODES, fbr)


def sale_types(fbr: FbrSettings | None = None) -> list:
    return _fetch("/v1/transtypecode", MOCK_SALE_TYPES, fbr)
