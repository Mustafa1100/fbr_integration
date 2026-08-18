"""FBR sandbox business scenarios (SN001–SN028) and the applicable-scenario
matrix by business activity and sector.

Source: PRAL "Technical Specification for DI API" v1.12, §9–10
(docs/di-api-v1.12.pdf). Every integrator must pass the scenarios applicable
to their business activity/sector in the sandbox before PRAL issues a
production token. In sandbox submissions ``scenarioId`` is mandatory;
production ignores it.
"""

# §9 — scenario catalogue (official descriptions).
SCENARIOS = {
    "SN001": "Goods at standard rate to registered buyers",
    "SN002": "Goods at standard rate to unregistered buyers",
    "SN003": "Sale of steel (melted and re-rolled)",
    "SN004": "Sale by ship breakers",
    "SN005": "Reduced rate sale (Eighth Schedule)",
    "SN006": "Exempt goods sale",
    "SN007": "Zero rated sale",
    "SN008": "Sale of 3rd Schedule goods",
    "SN009": "Cotton spinners purchase from cotton ginners (textile sector)",
    "SN010": "Telecom services rendered or provided",
    "SN011": "Toll manufacturing sale by steel sector",
    "SN012": "Sale of petroleum products",
    "SN013": "Electricity supply to retailers",
    "SN014": "Sale of gas to CNG stations",
    "SN015": "Sale of mobile phones",
    "SN016": "Processing / conversion of goods",
    "SN017": "Sale of goods where FED is charged in ST mode",
    "SN018": "Services where FED is charged in ST mode",
    "SN019": "Services rendered or provided",
    "SN020": "Sale of electric vehicles",
    "SN021": "Sale of cement / concrete blocks",
    "SN022": "Sale of potassium chlorate",
    "SN023": "Sale of CNG",
    "SN024": "Goods listed in SRO 297(I)/2023",
    "SN025": "Drugs at fixed ST rate (Eighth Schedule serial 81)",
    "SN026": "Sale to end consumers by retailers (standard rate)",
    "SN027": "Sale to end consumers by retailers (3rd Schedule goods)",
    "SN028": "Sale to end consumers by retailers (reduced rate)",
}

# Note (§9): SN026–SN028 apply only to businesses registered as retailers
# in their sales tax profile.

# §10 — applicable scenarios by business activity and sector.
# The general goods set repeats across most activity/sector rows:
_GENERAL = [
    "SN001", "SN002", "SN005", "SN006", "SN007", "SN015",
    "SN016", "SN017", "SN021", "SN022", "SN024",
]
_RETAIL = ["SN026", "SN027", "SN028", "SN008"]

# Sector-specific add-on scenarios.
_SECTOR = {
    "Steel": ["SN003", "SN004", "SN011"],
    "FMCG": ["SN008"],
    "Textile": ["SN009"],
    "Telecom": ["SN010"],
    "Petroleum": ["SN012"],
    "Electricity Distribution": ["SN013"],
    "Gas Distribution": ["SN014"],
    "Services": ["SN018", "SN019"],
    "Automobile": ["SN020"],
    "CNG Stations": ["SN023"],
    "Pharmaceuticals": ["SN025"],
    "Wholesale / Retails": _RETAIL,
    "All Other Sectors": [],
}

SECTORS = list(_SECTOR)


def _dedup(codes: list[str]) -> list[str]:
    return sorted(set(codes))


def applicable_scenarios(activity: str, sector: str) -> list[str]:
    """Scenarios required for an activity/sector combination (spec §10)."""
    extra = _SECTOR.get(sector, [])
    if activity in ("Manufacturer", "Importer", "Exporter", "Other"):
        # Full general set plus the sector add-on — except Manufacturer/Steel
        # and Manufacturer/Pharmaceuticals, which the spec narrows.
        if activity == "Manufacturer" and sector == "Steel":
            return _dedup(_SECTOR["Steel"])
        if activity == "Manufacturer" and sector == "Pharmaceuticals":
            return _dedup(_GENERAL)
        return _dedup(_GENERAL + extra)
    if activity in ("Distributor", "Wholesaler", "Retailer"):
        if sector == "All Other Sectors":
            return _dedup(_GENERAL + _RETAIL)
        if activity == "Retailer" and sector == "Steel":
            return _dedup(_SECTOR["Steel"])
        if sector == "Wholesale / Retails":
            base = [] if activity == "Retailer" else ["SN001", "SN002"]
            return _dedup(base + _RETAIL)
        if activity == "Distributor" and sector == "Steel":
            return _dedup(_SECTOR["Steel"] + _RETAIL)
        if activity == "Wholesaler" and sector == "Steel":
            return _dedup(_SECTOR["Steel"] + _RETAIL)
        return _dedup(extra + _RETAIL)
    if activity == "Service Provider":
        if sector == "All Other Sectors":
            return _dedup(_GENERAL + ["SN018", "SN019"])
        return _dedup(extra + ["SN018", "SN019"])
    return _dedup(_GENERAL)


BUSINESS_ACTIVITIES = [
    "Manufacturer",
    "Importer",
    "Distributor",
    "Wholesaler",
    "Exporter",
    "Retailer",
    "Service Provider",
    "Other",
]

# Scenarios most integrators start with; shown first in the UI.
COMMON_SCENARIOS = ["SN001", "SN002", "SN005", "SN006", "SN007", "SN008", "SN026"]
