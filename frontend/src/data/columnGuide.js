// Shared reference data for the Column Guide pages (user: production-only,
// admin: production + sandbox). Keep this the single source of truth so the
// two pages never drift apart.

export const COLUMNS = [
  {
    name: 'pos_invoice_no',
    required: true,
    sandboxOnly: false,
    meaning: 'Your own POS/register invoice number.',
    production:
      'Rows that share the same value become one invoice with multiple line items. Use a fresh number per real sale — never reuse one across different sales.',
    sandbox:
      'Use a distinct value per scenario you test, e.g. "SN001-TEST-1" — makes it easy to find which invoice belongs to which scenario in the Invoices list.',
  },
  {
    name: 'invoice_date',
    required: true,
    sandboxOnly: false,
    meaning: 'Date of the sale, format YYYY-MM-DD.',
    production:
      'Use the real date the sale happened. If you edit the file in Excel/Numbers/Google Sheets, double-check this cell afterwards — spreadsheet apps love to silently reformat dates (e.g. 2026-08-17 → 8/17/2026), which FBR will reject.',
    sandbox: "Any valid date works — the downloaded template pre-fills today's date.",
  },
  {
    name: 'buyer_ntn_cnic',
    required: false,
    sandboxOnly: false,
    meaning: "Buyer's NTN or CNIC number.",
    production:
      'Required when buyer_registration_type is "Registered" — leave blank for an unregistered walk-in customer.',
    sandbox:
      'For a "Registered" scenario, use a real-looking NTN (e.g. the sample buyer FBR\'s docs use). For an "Unregistered" scenario, leave blank.',
  },
  {
    name: 'buyer_name',
    required: false,
    sandboxOnly: false,
    meaning: "Buyer's business or customer name.",
    production: 'Falls back to "Walk-in Customer" if left blank.',
    sandbox: 'Any name works — it has no effect on whether FBR accepts the scenario.',
  },
  {
    name: 'buyer_province',
    required: false,
    sandboxOnly: false,
    meaning: "Buyer's province.",
    production: 'Falls back to your own seller province (from FBR Settings) if left blank.',
    sandbox: 'Any valid province works for testing.',
  },
  {
    name: 'buyer_address',
    required: false,
    sandboxOnly: false,
    meaning: "Buyer's address.",
    production: 'Free text — used on the printed receipt and in the FBR submission.',
    sandbox: 'Any text works for testing.',
  },
  {
    name: 'buyer_registration_type',
    required: false,
    sandboxOnly: false,
    meaning: '"Registered" or "Unregistered".',
    production:
      "Must match the buyer's actual status on FBR IRIS. Falls back to \"Unregistered\" if left blank — getting this wrong for a real registered buyer is a common cause of rejected invoices.",
    sandbox:
      'Several scenarios specifically require one or the other (e.g. SN001 = Registered buyer, SN002 = Unregistered) — check the scenario\'s official description before changing this.',
  },
  {
    name: 'product_description',
    required: true,
    sandboxOnly: false,
    meaning: 'What was sold.',
    production: 'Plain text description of the product or item.',
    sandbox: 'Any text works for testing.',
  },
  {
    name: 'hs_code',
    required: false,
    sandboxOnly: false,
    meaning: 'HS (Harmonized System) tariff code for the product, e.g. 8471.3010.',
    production:
      'Use the correct code for what you actually sell — FBR cross-checks this against the rate and sale_type, and a wrong code is a common rejection reason.',
    sandbox:
      'Leave the scenario template\'s pre-filled value as-is — it\'s already a code FBR\'s validator accepts for that scenario\'s rate/sale_type combination.',
  },
  {
    name: 'rate',
    required: false,
    sandboxOnly: false,
    meaning: 'Sales tax rate as text, e.g. "18%", "1%", "Exempt".',
    production:
      'Defaults to "18%" if left blank. Must be a rate FBR actually allows for that hs_code/sale_type combination.',
    sandbox: 'Leave the scenario template\'s pre-filled rate as-is — it matches FBR\'s own official sample for that scenario.',
  },
  {
    name: 'uom',
    required: false,
    sandboxOnly: false,
    meaning: 'Unit of measure, e.g. "Numbers, pieces, units", "KG", "Litre".',
    production: 'Must be one of the unit values FBR accepts for that HS code.',
    sandbox: 'Leave the scenario template\'s pre-filled value as-is.',
  },
  {
    name: 'quantity',
    required: true,
    sandboxOnly: false,
    meaning: 'Number of units sold.',
    production: 'Must be a positive number.',
    sandbox: 'The template pre-fills a valid quantity for the scenario — safe to change to any positive number.',
  },
  {
    name: 'unit_price',
    required: true,
    sandboxOnly: false,
    meaning: 'Price per unit, excluding sales tax.',
    production:
      'Drives the line\'s sale value (quantity × unit_price). Exception: for sale_type "3rd Schedule Goods", leave this at 0 — the sale is priced off fixed_notified_value instead (see below).',
    sandbox:
      'For SN008/SN027 ("3rd Schedule Goods") the template pre-fills this as 0 on purpose — don\'t change it, the sale is priced off fixed_notified_value instead.',
  },
  {
    name: 'sale_type',
    required: false,
    sandboxOnly: false,
    meaning: 'The FBR sale category this line falls under — see the reference table below.',
    production:
      'Defaults to "Goods at standard rate (default)" if left blank. This is the single most important column for getting tax calculated correctly — pick the category that genuinely matches what\'s being sold.',
    sandbox: 'Leave the scenario template\'s pre-filled value as-is — each scenario expects a specific sale_type.',
  },
  {
    name: 'scenario_id',
    required: false,
    sandboxOnly: true,
    meaning: 'Which sandbox test scenario (SN001–SN028) this row was for.',
    production:
      "Never sent to FBR in production at all — real invoices aren't tagged with a scenario. Safe to leave blank once you're live.",
    sandbox:
      'Required for sandbox submissions — tells FBR which scenario you\'re proving out. Must match one of the 28 official codes (SN001–SN028).',
  },
  {
    name: 'fixed_notified_value',
    required: false,
    sandboxOnly: false,
    meaning: 'Government-notified / fixed retail price for the product.',
    production:
      'Only matters for sale_type "3rd Schedule Goods" — tax is computed off this value instead of your actual sale price. Leave blank for every other sale type, including "Goods at Reduced Rate".',
    sandbox: 'Pre-filled by the SN008/SN027 templates — leave as-is unless you know the real notified value you want to test with.',
  },
  {
    name: 'sro_schedule_no',
    required: false,
    sandboxOnly: false,
    meaning: 'The SRO (Statutory Regulatory Order) schedule your product is listed under.',
    production:
      'Only needed when a specific SRO applies to the product (e.g. reduced-rate items under the Eighth Schedule). Leave blank otherwise.',
    sandbox: 'Pre-filled by the SN028 template — leave as-is.',
  },
  {
    name: 'sro_item_serial_no',
    required: false,
    sandboxOnly: false,
    meaning: 'The serial number of the product within that SRO schedule.',
    production: 'Pairs with sro_schedule_no — only needed together with it.',
    sandbox: 'Pre-filled by the SN028 template — leave as-is.',
  },
]

export const SALE_TYPES = [
  ['Goods at standard rate (default)', 'Ordinary goods taxed at the standard rate. Use this unless another category below applies.'],
  ['Goods at Reduced Rate', 'Goods taxed at a government-notified reduced rate (Eighth Schedule). Taxed off the actual sale value — cite the SRO in sro_schedule_no / sro_item_serial_no.'],
  ['Goods at zero-rate', 'Zero-rated goods (0% sales tax) — e.g. exports or specific zero-rated categories.'],
  ['Exempt goods', 'Goods legally exempt from sales tax entirely.'],
  ['3rd Schedule Goods', 'Retail-price-scheme goods — tax is charged on the government-notified retail price (fixed_notified_value), not your actual sale price.'],
  ['Services', 'Sale of a service rather than a physical good.'],
  ['Telecommunication services', 'Telecom-sector service sales.'],
  ['Services (FED in ST Mode)', 'Services subject to Federal Excise Duty, collected in sales-tax mode.'],
  ['Goods (FED in ST Mode)', 'Goods subject to Federal Excise Duty, collected in sales-tax mode.'],
  ['Toll Manufacturing', 'Processing/manufacturing goods owned by someone else, for a fee.'],
  ['Processing/Conversion of Goods', 'Converting or processing goods on behalf of another party.'],
  ['Steel melting and re-rolling', 'Steel-sector melting/re-rolling operations.'],
  ['Ship breaking', 'Ship-breaking sector sales.'],
  ['Cotton ginners', 'Cotton-ginning sector sales.'],
  ['Cement /Concrete Block', 'Cement or concrete block sector sales.'],
  ['Potassium Chlorate', 'Potassium chlorate sales — a specifically regulated product.'],
  ['Petroleum Products', 'Petroleum product sales — a specifically regulated category.'],
  ['Gas to CNG stations', 'Gas supplied to CNG stations.'],
  ['CNG Sales', 'Compressed natural gas sales.'],
  ['Electricity Supply to Retailers', 'Electricity supplied to retailers.'],
  ['Mobile Phones', 'Mobile phone sales — a specifically regulated category.'],
  ['Electric Vehicle', 'Electric vehicle sales.'],
  ['Non-Adjustable Supplies', 'Supplies where input tax adjustment is not allowed.'],
  ['Goods as per SRO.297(I)/2023', 'Goods specifically covered by SRO.297(I)/2023.'],
]
