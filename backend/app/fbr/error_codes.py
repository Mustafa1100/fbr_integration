"""FBR sales-invoice error codes and remediation guidance, extracted
verbatim from PRAL's "Error Message Guide (Sales)"
(docs/Error Message Guide - (Sales).pdf).

When postinvoicedata/validateinvoicedata return an errorCode we recognize,
we append this Action text to the raw FBR message — it's written for a
developer fixing a payload, not an end taxpayer, but it's the exact
guidance PRAL publishes and saves a lookup through the PDF mid-integration.
Covers "Sales" errors only — Purchase-side codes (cotton ginner buys, etc.)
are a separate table PRAL didn't publish for this doc set and aren't used
by this app, which only ever posts Sale Invoice / Debit Note.
"""

SALES_ERROR_ACTIONS: dict[str, str] = {
    "0002": "Please make sure that if available buyer registration no. is in correct format i.e. CNIC 13 digits, NTN 7 digits (No special characters)",
    "0003": "Please refer to relevant reference API in the technical document for DI API for valid invoice types",
    "0007": "Please refer to relevant reference API in the technical document for DI API for valid sale types",
    "0008": "For cotton ginner sale type, ST withheld at source should either be zero or same as sales tax/fed in ST mode.",
    "0010": "Please provide relevant buyer's name",
    "0012": "Please refer to relevant reference API in the technical document for DI API for valid buyer registration types",
    "0013": "Please refer to relevant reference API in the technical document for DI API for valid sale types",
    "0018": "Please provide valid Sales Tax",
    "0019": "Please refer to relevant reference API in the technical document for DI API for valid HS Code",
    "0020": "Please refer to relevant reference API in the technical document for DI API for valid Rate",
    "0021": "Please provide valid Value of Sales Excl. ST",
    "0022": "Please provide valid ST withheld at Source",
    "0023": "Please provide valid Sales Tax",
    "0026": "Please provide valid Invoice Reference No.",
    "0027": "Please refer to relevant reference API in the technical document for DI API for valid reason",
    "0028": "Please provide remarks against this reason",
    "0029": "Debit note date should be equal or greater from original invoice date",
    "0034": "Debit note can only be added within 180 days of reference invoice date",
    "0035": "Debit Note date must be greater or same as reference invoice date",
    "0042": "Please provide invoice date",
    "0043": "Please provide valid invoice date",
    "0044": "Please refer to relevant reference API in the technical document for DI API for valid HS Code",
    "0046": "Please provide valid rate for selected Sales Type. Please refer to relevant reference API in the technical document for DI API",
    "0050": "For cotton ginner sale type, ST withheld at source should either be zero or same as sales tax/fed in ST mode",
    "0052": "Please refer to relevant reference API in the technical document for DI API for valid HS Code against sale type",
    "0053": "Please verify and provide valid Buyer's registration type",
    "0056": "Please provide registration no. of steel sector buyer",
    "0057": "Please provide valid Invoice Reference No.",
    "0058": "Buyer and Seller Registration number cannot be same",
    "0059": "Minimum price (sale value) is (Sale Value). Please adjust declared price to meet minimum requirement",
    "0060": "Please provide 'SqY' as UoM for Services sale type when rate is 50/SqY or 100/SqY",
    "0061": "Please provide 'Bill of lading' as UoM for Services (Fed in ST Mode) when rate is 200/bill",
    "0062": "Please provide 'MT' as UoM for Steel melting and re-rolling sale type",
    "0067": "These should be less or equal to those of the referenced invoice",
    "0071": "Please verify and provide valid Buyer's NTN",
    "0073": "Please refer to relevant reference API in the technical document for DI API for valid Seller Province",
    "0074": "Please refer to relevant reference API in the technical document for DI API for valid Buyer Province",
    "0077": "Please refer to relevant reference API in the technical document for DI API for valid SRO/Schedule No. for the provided rate",
    "0078": "Please refer to relevant reference API in the technical document for DI API for valid Item Sr. No. for the provided SRO/Schedule No.",
    "0079": "Please refer to relevant reference API in the technical document for DI API for valid rate against the \"Electricity Supply to Retailers\" sale type",
    "0082": "Please provide valid seller registration no. (NTN/CNIC)",
    "0086": "Only EFS license holders who have imported Compressor Scrap in the last 12 months are allowed",
    "0090": "Where sale type is \"3rd Schedule Goods\", Fixed/Notified value or Retail Price is mandatory",
    "0091": "Please verify if provided sale type is for Goods at reduced rate",
    "0093": "Manufacturers cannot add Non-adjustable supplies where SRO/Schedule No. is \"Eighth Schedule Table I\", and Item Sr. No. is \"81\"",
    "0097": "Please provide valid HS Code and UoM \"KG\" where sale type is \"Potassium Chlorate\"",
    "0098": "Quantity is mandatory for sales of goods",
    "0099": "Please refer to relevant reference API in the technical document for DI API for valid UoM against selected HS Codes",
    "0100": "Please add a registered buyer where sale type is \"Cotton Ginner\"",
    "0101": "Please select valid HS Code and Sale Type to add a sale invoice",
    "0102": "Please ensure that the Fixed/Notified Value or Retail Price is used to calculated the Sales Tax Amount for the provided rate",
    "0103": "Please refer to relevant reference API in the technical document for DI API for valid rates against selected Sale Types",
    "0104": "Please ensure that the provided Sale Value is used to calculate the Sales Tax Amount for the provided Rate",
    "0105": "Please ensure that the provided Quantity is used to calculate the Sales Tax Amount for the provided Rate",
    "0108": "Please make sure that if available seller registration no. is in correct format i.e. CNIC 13 digits, NTN 7 digits (No special characters)",
    "0113": "Please provide invoice date in \"YYYY-MM-DD\" format. For example: 2025-05-25",
    "0300": "Numeric values must not be negative, null, empty or string type",
    "0302": "Please provide numeric values with up to 2 decimal places (4 in case of quantity)",
}


def action_for(error_code: str) -> str | None:
    """PRAL's suggested fix for a known errorCode, or None if unrecognized."""
    return SALES_ERROR_ACTIONS.get((error_code or "").strip())
