"""Official per-scenario sample invoice items — extracted verbatim from
PRAL's "DI Scenarios Description for Sandbox Testing" v1.11
(see docs/DI Scenarios JSON for Sandbox Testing.pdf in the repo root).

Each entry is derived from FBR's own worked example for that scenario —
the hsCode/rate/uoM/saleType combination is guaranteed internally
consistent, which is exactly what's fragile when composing a test invoice
by hand. A couple of source samples had a blank productDescription or a
string-typed amount ('205000.00'); those are normalized here, everything
else (hsCode, rate, uoM, saleType, quantity) is verbatim from the PDF.

Some scenarios (3rd Schedule / retail-reduced-rate goods — SN008, SN027,
SN028) price the sale via fixedNotifiedValueOrRetailPrice instead of
valueSalesExcludingST, which is legitimately 0 for these — FBR computes
and cross-checks the tax from the fixed value, not the sale value (spec
error 0090/0102). That 0 is preserved here rather than padded, and
fixedNotifiedValueOrRetailPrice / sroScheduleNo / sroItemSerialNo are
carried through verbatim where the official sample sets them.
"""

SCENARIO_NAMES: dict[str, str] = {
    "SN001": "Sale of Standard Rate Goods to Registered Buyers",
    "SN002": "Sale of Standard Rate Goods to Unregistered Buyers",
    "SN003": "Sale of Steel (Melted and Re-Rolled)",
    "SN004": "Sale of Steel Scrap by Ship Breakers",
    "SN005": "Sale of Reduced Rate Goods",
    "SN006": "Sale of Exempt Goods",
    "SN007": "Sale of Zero-Rated Goods",
    "SN008": "Sale of 3rd Schedule Goods",
    "SN009": "Purchase from Registered Cotton Ginners",
    "SN010": "Sale of Telecom Services by Mobile Operators",
    "SN011": "Sale of Steel through Toll Manufacturing",
    "SN012": "Sale of Petroleum Products",
    "SN013": "Sale of Electricity to Retailers",
    "SN014": "Sale of Gas to CNG Stations",
    "SN015": "Sale of Mobile Phones",
    "SN016": "Processing / Conversion of Goods",
    "SN017": "Sale of Goods Where FED Is Charged in ST Mode",
    "SN018": "Sale of Services Where FED Is Charged in ST Mode",
    "SN019": "Sale of Services (as per ICT Ordinance)",
    "SN020": "Sale of Electric Vehicles",
    "SN021": "Sale of Cement / Concrete Block",
    "SN022": "Sale of Potassium Chlorate",
    "SN023": "Sale of CNG",
    "SN024": "Sale of Goods Listed in SRO 297(I)/2023",
    "SN025": "Drugs Sold at Fixed ST Rate (Eighth Schedule Table 1, Sr. 81)",
    "SN026": "Sale of Goods at Standard Rate to End Consumers by Retailers",
    "SN027": "Sale of 3rd Schedule Goods to End Consumers by Retailers",
    "SN028": "Sale of Goods at Reduced Rate to End Consumers by Retailers",
}

# code -> single representative item, field names as in the DI API JSON.
SCENARIO_SAMPLE_ITEMS: dict[str, dict] = {
    "SN001": {"hsCode": "0101.2100", "productDescription": "test", "rate": "18%", "uoM": "Numbers, pieces, units", "quantity": 400.0, "valueSalesExcludingST": 1000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Goods at standard rate (default)", "buyerRegistrationType": "Registered"},
    "SN002": {"hsCode": "0101.2100", "productDescription": "test", "rate": "18%", "uoM": "Numbers, pieces, units", "quantity": 400.0, "valueSalesExcludingST": 1000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Goods at standard rate (default)", "buyerRegistrationType": "Unregistered"},
    "SN003": {"hsCode": "7214.1010", "productDescription": "Test product", "rate": "18%", "uoM": "MT", "quantity": 1.0, "valueSalesExcludingST": 205000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Steel melting and re-rolling", "buyerRegistrationType": "Unregistered"},
    "SN004": {"hsCode": "7204.1010", "productDescription": "Test product", "rate": "18%", "uoM": "MT", "quantity": 1.0, "valueSalesExcludingST": 175000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Ship breaking", "buyerRegistrationType": "Unregistered"},
    "SN005": {"hsCode": "0102.2930", "productDescription": "product Description41", "rate": "1%", "uoM": "Numbers, pieces, units", "quantity": 1.0, "valueSalesExcludingST": 1000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "EIGHTH SCHEDULE Table 1", "sroItemSerialNo": "82", "saleType": "Goods at Reduced Rate", "buyerRegistrationType": "Unregistered"},
    "SN006": {"hsCode": "0102.2930", "productDescription": "product Description41", "rate": "Exempt", "uoM": "Numbers, pieces, units", "quantity": 1.0, "valueSalesExcludingST": 10.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "6th Schd Table I", "sroItemSerialNo": "100", "saleType": "Exempt goods", "buyerRegistrationType": "Registered"},
    "SN007": {"hsCode": "0101.2100", "productDescription": "test", "rate": "0%", "uoM": "Numbers, pieces, units", "quantity": 100.0, "valueSalesExcludingST": 100.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "327(I)/2008", "sroItemSerialNo": "1", "saleType": "Goods at zero-rate", "buyerRegistrationType": "Unregistered"},
    "SN008": {"hsCode": "0101.2100", "productDescription": "test", "rate": "18%", "uoM": "Numbers, pieces, units", "quantity": 100.0, "valueSalesExcludingST": 0, "fixedNotifiedValueOrRetailPrice": 1000.0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "3rd Schedule Goods", "buyerRegistrationType": "Unregistered"},
    "SN009": {"hsCode": "0101.2100", "productDescription": "test", "rate": "18%", "uoM": "Numbers, pieces, units", "quantity": 1, "valueSalesExcludingST": 2500.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Cotton ginners", "buyerRegistrationType": "Registered"},
    "SN010": {"hsCode": "0101.2100", "productDescription": "test", "rate": "17%", "uoM": "Numbers, pieces, units", "quantity": 1000.0, "valueSalesExcludingST": 100.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Telecommunication services", "buyerRegistrationType": "Unregistered"},
    "SN011": {"hsCode": "7214.9990", "productDescription": "Test product", "rate": "18%", "uoM": "MT", "quantity": 1.0, "valueSalesExcludingST": 205000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Toll Manufacturing", "buyerRegistrationType": "Unregistered"},
    "SN012": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "1.43%", "uoM": "Numbers, pieces, units", "quantity": 123.0, "valueSalesExcludingST": 100.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "1450(I)/2021", "sroItemSerialNo": "4", "saleType": "Petroleum Products", "buyerRegistrationType": "Unregistered"},
    "SN013": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "5%", "uoM": "Numbers, pieces, units", "quantity": 123.0, "valueSalesExcludingST": 1000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "1450(I)/2021", "sroItemSerialNo": "4", "saleType": "Electricity Supply to Retailers", "buyerRegistrationType": "Unregistered"},
    "SN014": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "18%", "uoM": "Numbers, pieces, units", "quantity": 123.0, "valueSalesExcludingST": 1000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Gas to CNG stations", "buyerRegistrationType": "Unregistered"},
    "SN015": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "18%", "uoM": "Numbers, pieces, units", "quantity": 123.0, "valueSalesExcludingST": 1234.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "NINTH SCHEDULE", "sroItemSerialNo": "1(A)", "saleType": "Mobile Phones", "buyerRegistrationType": "Unregistered"},
    "SN016": {"hsCode": "0101.2100", "productDescription": "test", "rate": "5%", "uoM": "Numbers, pieces, units", "quantity": 1.0, "valueSalesExcludingST": 100.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Processing/Conversion of Goods", "buyerRegistrationType": "Unregistered"},
    "SN017": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "8%", "uoM": "Numbers, pieces, units", "quantity": 1.0, "valueSalesExcludingST": 100.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Goods (FED in ST Mode)", "buyerRegistrationType": "Unregistered"},
    "SN018": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "8%", "uoM": "Numbers, pieces, units", "quantity": 20.0, "valueSalesExcludingST": 1000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Services (FED in ST Mode)", "buyerRegistrationType": "Unregistered"},
    "SN019": {"hsCode": "0101.2900", "productDescription": "TEST", "rate": "5%", "uoM": "Numbers, pieces, units", "quantity": 1.0, "valueSalesExcludingST": 100.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "ICTO TABLE I", "sroItemSerialNo": "1(ii)(ii)(a)", "saleType": "Services", "buyerRegistrationType": "Unregistered"},
    "SN020": {"hsCode": "0101.2900", "productDescription": "TEST", "rate": "1%", "uoM": "Numbers, pieces, units", "quantity": 122.0, "valueSalesExcludingST": 1000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "6th Schd Table III", "sroItemSerialNo": "20", "saleType": "Electric Vehicle", "buyerRegistrationType": "Unregistered"},
    "SN021": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "Rs.3", "uoM": "Numbers, pieces, units", "quantity": 12.0, "valueSalesExcludingST": 123.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Cement /Concrete Block", "buyerRegistrationType": "Unregistered"},
    "SN022": {"hsCode": "3104.2000", "productDescription": "TEST", "rate": "18% along with rupees 60 per kilogram", "uoM": "KG", "quantity": 1.0, "valueSalesExcludingST": 100.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "EIGHTH SCHEDULE Table 1", "sroItemSerialNo": "56", "saleType": "Potassium Chlorate", "buyerRegistrationType": "Unregistered"},
    "SN023": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "Rs.200", "uoM": "Numbers, pieces, units", "quantity": 123.0, "valueSalesExcludingST": 234.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "581(1)/2024", "sroItemSerialNo": "Region-I", "saleType": "CNG Sales", "buyerRegistrationType": "Unregistered"},
    "SN024": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "25%", "uoM": "Numbers, pieces, units", "quantity": 123.0, "valueSalesExcludingST": 1000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "297(I)/2023-Table-I", "sroItemSerialNo": "12", "saleType": "Goods as per SRO.297(|)/2023", "buyerRegistrationType": "Unregistered"},
    "SN025": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "0%", "uoM": "Numbers, pieces, units", "quantity": 1.0, "valueSalesExcludingST": 100.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "EIGHTH SCHEDULE Table 1", "sroItemSerialNo": "81", "saleType": "Non-Adjustable Supplies", "buyerRegistrationType": "Unregistered"},
    "SN026": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "18%", "uoM": "Numbers, pieces, units", "quantity": 123.0, "valueSalesExcludingST": 1000.0, "fixedNotifiedValueOrRetailPrice": 0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "Goods at standard rate (default)", "buyerRegistrationType": "Registered"},
    "SN027": {"hsCode": "0101.2100", "productDescription": "test", "rate": "18%", "uoM": "Numbers, pieces, units", "quantity": 1.0, "valueSalesExcludingST": 0, "fixedNotifiedValueOrRetailPrice": 100.0, "sroScheduleNo": "", "sroItemSerialNo": "", "saleType": "3rd Schedule Goods", "buyerRegistrationType": "Registered"},
    "SN028": {"hsCode": "0101.2100", "productDescription": "TEST", "rate": "1%", "uoM": "Numbers, pieces, units", "quantity": 1, "valueSalesExcludingST": 0, "fixedNotifiedValueOrRetailPrice": 100.0, "sroScheduleNo": "EIGHTH SCHEDULE Table 1", "sroItemSerialNo": "70", "saleType": "Goods at Reduced Rate", "buyerRegistrationType": "Registered"},
}
