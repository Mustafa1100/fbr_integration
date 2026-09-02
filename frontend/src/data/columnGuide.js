// Shared reference data for the Column Guide pages (user: production-only,
// admin: production + sandbox). Keep this the single source of truth so the
// two pages never drift apart.
//
// Content is trilingual (English, Urdu, Sindhi). Column names (pos_invoice_no,
// hs_code, ...) and sale_type values (e.g. "Goods at standard rate (default)")
// are literal field names / data values sent to FBR and are never translated
// — only the explanatory prose is.
//
// Translation note: the English text is the source of truth, written and
// reviewed alongside the app itself. The Urdu and Sindhi text was produced
// by an AI translation pass, not a native speaker or tax professional —
// treat it as a solid first draft. Given this is compliance-facing content
// (it tells people which fields FBR requires), have a native speaker check
// it before relying on it operationally, especially the Sindhi, which is a
// far less-resourced language for machine translation than Urdu.

export const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
  { code: 'sd', label: 'سنڌي', dir: 'rtl' },
]

export const COLUMN_META = [
  { name: 'pos_invoice_no', required: true, sandboxOnly: false },
  { name: 'invoice_date', required: true, sandboxOnly: false },
  { name: 'buyer_ntn_cnic', required: false, sandboxOnly: false },
  { name: 'buyer_name', required: false, sandboxOnly: false },
  { name: 'buyer_province', required: false, sandboxOnly: false },
  { name: 'buyer_address', required: false, sandboxOnly: false },
  { name: 'buyer_registration_type', required: false, sandboxOnly: false },
  { name: 'product_description', required: true, sandboxOnly: false },
  // FBR cross-checks the HS code against rate + sale_type and rejects a
  // missing one — the upload pipeline enforces it as required.
  { name: 'hs_code', required: true, sandboxOnly: false },
  { name: 'rate', required: false, sandboxOnly: false },
  { name: 'uom', required: false, sandboxOnly: false },
  { name: 'quantity', required: true, sandboxOnly: false },
  { name: 'unit_price', required: true, sandboxOnly: false },
  { name: 'sale_type', required: false, sandboxOnly: false },
  { name: 'scenario_id', required: false, sandboxOnly: true },
  { name: 'fixed_notified_value', required: false, sandboxOnly: false },
  { name: 'sro_schedule_no', required: false, sandboxOnly: false },
  { name: 'sro_item_serial_no', required: false, sandboxOnly: false },
  { name: 'invoice_ref_no', required: false, sandboxOnly: false },
  { name: 'sales_tax', required: false, sandboxOnly: false },
  { name: 'sales_tax_withheld_at_source', required: false, sandboxOnly: false },
  { name: 'extra_tax', required: false, sandboxOnly: false },
  { name: 'further_tax', required: false, sandboxOnly: false },
  { name: 'fed_payable', required: false, sandboxOnly: false },
  { name: 'discount', required: false, sandboxOnly: false },
  { name: 'total_values', required: false, sandboxOnly: false },
  { name: 'advance_tax', required: false, sandboxOnly: false },
]

export const SALE_TYPE_VALUES = [
  'Goods at standard rate (default)',
  'Goods at Reduced Rate',
  'Goods at zero-rate',
  'Exempt goods',
  '3rd Schedule Goods',
  'Services',
  'Telecommunication services',
  'Services (FED in ST Mode)',
  'Goods (FED in ST Mode)',
  'Toll Manufacturing',
  'Processing/Conversion of Goods',
  'Steel melting and re-rolling',
  'Ship breaking',
  'Cotton ginners',
  'Cement /Concrete Block',
  'Potassium Chlorate',
  'Petroleum Products',
  'Gas to CNG stations',
  'CNG Sales',
  'Electricity Supply to Retailers',
  'Mobile Phones',
  'Electric Vehicle',
  'Non-Adjustable Supplies',
  'Goods as per SRO.297(I)/2023',
]

const EN_COLUMNS = {
  pos_invoice_no: {
    meaning: 'Your own POS/register invoice number.',
    production:
      'Rows that share the same value become one invoice with multiple line items. Use a fresh number per real sale — never reuse one across different sales.',
    sandbox:
      'Use a distinct value per scenario you test, e.g. "SN001-TEST-1" — makes it easy to find which invoice belongs to which scenario in the Invoices list.',
  },
  invoice_date: {
    meaning: 'Date of the sale, format YYYY-MM-DD.',
    production:
      'Use the real date the sale happened. If you edit the file in Excel/Numbers/Google Sheets, double-check this cell afterwards — spreadsheet apps love to silently reformat dates (e.g. 2026-08-17 → 8/17/2026), which FBR will reject.',
    sandbox: "Any valid date works — the downloaded template pre-fills today's date.",
  },
  buyer_ntn_cnic: {
    meaning: "Buyer's NTN or CNIC number.",
    production:
      'Required when buyer_registration_type is "Registered" — leave blank for an unregistered walk-in customer.',
    sandbox:
      'For a "Registered" scenario, use a real-looking NTN (e.g. the sample buyer FBR\'s docs use). For an "Unregistered" scenario, leave blank.',
  },
  buyer_name: {
    meaning: "Buyer's business or customer name.",
    production: 'Falls back to "Walk-in Customer" if left blank.',
    sandbox: 'Any name works — it has no effect on whether FBR accepts the scenario.',
  },
  buyer_province: {
    meaning: "Buyer's province.",
    production: 'Falls back to your own seller province (from FBR Settings) if left blank.',
    sandbox: 'Any valid province works for testing.',
  },
  buyer_address: {
    meaning: "Buyer's address.",
    production: 'Free text — used on the printed receipt and in the FBR submission.',
    sandbox: 'Any text works for testing.',
  },
  buyer_registration_type: {
    meaning: '"Registered" or "Unregistered".',
    production:
      "Must match the buyer's actual status on FBR IRIS. Falls back to \"Unregistered\" if left blank — getting this wrong for a real registered buyer is a common cause of rejected invoices.",
    sandbox:
      'Several scenarios specifically require one or the other (e.g. SN001 = Registered buyer, SN002 = Unregistered) — check the scenario\'s official description before changing this.',
  },
  product_description: {
    meaning: 'What was sold.',
    production: 'Plain text description of the product or item.',
    sandbox: 'Any text works for testing.',
  },
  hs_code: {
    meaning: 'HS (Harmonized System) tariff code for the product, e.g. 8471.3010.',
    production:
      'Required — FBR cross-checks this against the rate and sale_type, and a wrong code is a common rejection reason. Unsure of the code? Use "Enter a single invoice" and search by product name in the HS code field — it looks up FBR\'s own registered code list.',
    sandbox:
      'Leave the scenario template\'s pre-filled value as-is — it\'s already a code FBR\'s validator accepts for that scenario\'s rate/sale_type combination.',
  },
  rate: {
    meaning:
      'Sales tax rate as text. Usually a percentage ("18%", "1%", "Exempt"), but it can also be a fixed rupee amount per unit ("Rs.3", "Rs 200"), or both ("18% along with rupees 60 per kilogram").',
    production:
      'Defaults to "18%" if left blank. Must be a rate FBR actually allows for that hs_code/sale_type combination. The app reads it to work out the tax: a percentage is applied to the sale value; a "Rs." / "rupees … per unit" amount is multiplied by quantity; if the text has both, the two are added. If your rate does not follow one of those shapes, put the tax amount in the sales_tax column yourself.',
    sandbox:
      'Leave the scenario template\'s pre-filled rate as-is — it matches FBR\'s own official sample for that scenario (including the fixed-per-unit rates in SN021, SN022 and SN023).',
  },
  uom: {
    meaning: 'Unit of measure, e.g. "Numbers, pieces, units", "KG", "Litre".',
    production: 'Must be one of the unit values FBR accepts for that HS code.',
    sandbox: 'Leave the scenario template\'s pre-filled value as-is.',
  },
  quantity: {
    meaning: 'Number of units sold.',
    production: 'Must be a positive number.',
    sandbox: 'The template pre-fills a valid quantity for the scenario — safe to change to any positive number.',
  },
  unit_price: {
    meaning: 'Price per unit, excluding sales tax.',
    production:
      'Drives the line\'s sale value (quantity × unit_price). Exception: for sale_type "3rd Schedule Goods", leave this at 0 — the sale is priced off fixed_notified_value instead (see below).',
    sandbox:
      'For SN008/SN027 ("3rd Schedule Goods") the template pre-fills this as 0 on purpose — don\'t change it, the sale is priced off fixed_notified_value instead.',
  },
  sale_type: {
    meaning: 'The FBR sale category this line falls under — see the reference table below.',
    production:
      'Defaults to "Goods at standard rate (default)" if left blank. This is the single most important column for getting tax calculated correctly — pick the category that genuinely matches what\'s being sold.',
    sandbox: 'Leave the scenario template\'s pre-filled value as-is — each scenario expects a specific sale_type.',
  },
  scenario_id: {
    meaning: 'Which sandbox test scenario (SN001–SN028) this row was for.',
    production:
      "Never sent to FBR in production at all — real invoices aren't tagged with a scenario. Safe to leave blank once you're live.",
    sandbox:
      'Required for sandbox submissions — tells FBR which scenario you\'re proving out. Must match one of the 28 official codes (SN001–SN028).',
  },
  fixed_notified_value: {
    meaning: 'Government-notified / fixed retail price for the product, per unit (e.g. the MRP printed on one pack).',
    production:
      'Only matters for sale_type "3rd Schedule Goods" — enter the per-unit MRP and the app multiplies it by quantity to get the line\'s tax basis, instead of your actual sale price. Leave blank for every other sale type, including "Goods at Reduced Rate".',
    sandbox:
      'Pre-filled by the SN008/SN027 templates — leave as-is unless you know the real notified value you want to test with.',
  },
  sro_schedule_no: {
    meaning: 'The SRO (Statutory Regulatory Order) schedule your product is listed under.',
    production:
      'Only needed when a specific SRO applies to the product (e.g. reduced-rate items under the Eighth Schedule). Leave blank otherwise.',
    sandbox: 'Pre-filled by the SN028 template — leave as-is.',
  },
  sro_item_serial_no: {
    meaning: 'The serial number of the product within that SRO schedule.',
    production: 'Pairs with sro_schedule_no — only needed together with it.',
    sandbox: 'Pre-filled by the SN028 template — leave as-is.',
  },
  invoice_ref_no: {
    meaning: 'Reference to an earlier invoice this row relates to (e.g. the original invoice a debit/credit note adjusts).',
    production:
      'Leave blank for an ordinary sale. Set it only when the document points back to a previously issued invoice.',
    sandbox:
      "PRAL's samples leave this blank or use a placeholder like \"SI-20250421-001\" — leave blank unless the scenario you're testing calls for it.",
  },
  sales_tax: {
    meaning: 'Sales tax amount for the line, in rupees — overrides the figure the app would work out from rate.',
    production:
      'Leave blank to let the app calculate it (quantity × unit_price × rate, or off fixed_notified_value for 3rd Schedule Goods). Fill it only when your POS/ERP already computed the exact amount and FBR must receive that number unchanged — even a one-paisa rounding difference from FBR\'s own calculation can otherwise be rejected.',
    sandbox:
      'Leave blank for the scenario templates — they rely on the calculated value. Set it only if you are deliberately testing a specific tax amount.',
  },
  sales_tax_withheld_at_source: {
    meaning: 'Sales tax withheld by the buyer at source, in rupees (PRAL salesTaxWithheldAtSource).',
    production:
      'Blank / 0 for an ordinary sale. Fill it when the buyer is a withholding agent who has held back part of the tax — the figure comes from the buyer, it is not calculated here.',
    sandbox: 'Only a few scenarios use a non-zero value (e.g. SN005, SN012, SN013) — otherwise leave blank.',
  },
  extra_tax: {
    meaning: 'Extra tax on the line, in rupees (PRAL extraTax) — applies to certain specified goods.',
    production:
      'Blank / 0 unless the product genuinely attracts extra tax (some regulated categories, e.g. mobile phones). Enter the rupee amount the rules give.',
    sandbox: 'Leave blank unless the scenario under test specifically exercises extra tax.',
  },
  further_tax: {
    meaning: 'Further tax for supplying to an unregistered buyer, in rupees (PRAL furtherTax).',
    production:
      'Blank / 0 for a registered buyer. For an unregistered buyer, further tax (commonly 4%) often applies — enter the rupee amount; it is added to the invoice total.',
    sandbox: 'Used by a few scenarios (e.g. SN005, SN006). Leave blank where the sample does not set it.',
  },
  fed_payable: {
    meaning: 'Federal Excise Duty payable on the line, in rupees (PRAL fedPayable).',
    production:
      'Blank / 0 unless the goods or services carry FED collected in sales-tax mode (e.g. the "… (FED in ST Mode)" sale types). Enter the FED amount; it is added to the invoice total.',
    sandbox: 'Relevant to SN017 / SN018 and similar — leave blank for scenarios that do not involve FED.',
  },
  discount: {
    meaning: 'Discount given on the line, in rupees (PRAL discount).',
    production:
      'Blank / 0 if there was no discount. Otherwise enter the rupee discount for the line — it is subtracted from the line total. Note the sale value and tax are still taken from quantity × unit_price; the discount does not by itself reduce the taxable amount unless your unit_price already reflects it.',
    sandbox: 'Leave blank unless you are specifically testing a discounted line.',
  },
  total_values: {
    meaning: 'The whole-line total including taxes and less discount, in rupees (PRAL totalValues).',
    production:
      'Leave blank — the app adds it up for you (sale value + sales tax + further tax + FED − discount). Set it only when an upstream system produced a specific figure that FBR must receive unchanged.',
    sandbox: 'Leave blank for the scenario templates.',
  },
  advance_tax: {
    meaning: 'Advance income tax (§236) collected on the invoice, in rupees.',
    production:
      'Blank / 0 if none. Otherwise enter the advance income tax for the line — it is shown on the receipt after the sales tax and added into the grand total. Rows sharing a pos_invoice_no are added together into one invoice total.',
    sandbox: 'Leave blank.',
  },
}

const EN_SALE_TYPES = {
  'Goods at standard rate (default)':
    'Ordinary goods taxed at the standard rate. Use this unless another category below applies.',
  'Goods at Reduced Rate':
    'Goods taxed at a government-notified reduced rate (Eighth Schedule). Taxed off the actual sale value — cite the SRO in sro_schedule_no / sro_item_serial_no.',
  'Goods at zero-rate': 'Zero-rated goods (0% sales tax) — e.g. exports or specific zero-rated categories.',
  'Exempt goods': 'Goods legally exempt from sales tax entirely.',
  '3rd Schedule Goods':
    'Retail-price-scheme goods — tax is charged on the government-notified retail price (fixed_notified_value), not your actual sale price.',
  Services: 'Sale of a service rather than a physical good.',
  'Telecommunication services': 'Telecom-sector service sales.',
  'Services (FED in ST Mode)': 'Services subject to Federal Excise Duty, collected in sales-tax mode.',
  'Goods (FED in ST Mode)': 'Goods subject to Federal Excise Duty, collected in sales-tax mode.',
  'Toll Manufacturing': 'Processing/manufacturing goods owned by someone else, for a fee.',
  'Processing/Conversion of Goods': 'Converting or processing goods on behalf of another party.',
  'Steel melting and re-rolling': 'Steel-sector melting/re-rolling operations.',
  'Ship breaking': 'Ship-breaking sector sales.',
  'Cotton ginners': 'Cotton-ginning sector sales.',
  'Cement /Concrete Block': 'Cement or concrete block sector sales.',
  'Potassium Chlorate': 'Potassium chlorate sales — a specifically regulated product.',
  'Petroleum Products': 'Petroleum product sales — a specifically regulated category.',
  'Gas to CNG stations': 'Gas supplied to CNG stations.',
  'CNG Sales': 'Compressed natural gas sales.',
  'Electricity Supply to Retailers': 'Electricity supplied to retailers.',
  'Mobile Phones': 'Mobile phone sales — a specifically regulated category.',
  'Electric Vehicle': 'Electric vehicle sales.',
  'Non-Adjustable Supplies': 'Supplies where input tax adjustment is not allowed.',
  'Goods as per SRO.297(I)/2023': 'Goods specifically covered by SRO.297(I)/2023.',
}

const EN_UI = {
  title: 'Column Guide',
  subtitleAdmin:
    'What every column in the upload file means — covering both sandbox scenario testing and real production invoices, since you manage the whole rollout for each business.',
  subtitleUser:
    'What every column in the upload file means for a real sale — this is your production reference, for the invoices you upload every day.',
  sandboxNoteStrong: 'scenario_id is sandbox-only.',
  sandboxNoteRest:
    "In production your invoices aren't tagged with a test scenario at all — FBR just receives the real sale details. Everything else in the file maps to what actually happened in the transaction, in both environments.",
  colColumn: 'Column',
  colRequired: 'Required',
  colWhatItIs: 'What it is',
  colInSandbox: 'In sandbox testing',
  colInProduction: 'In production',
  badgeRequired: 'required',
  badgeOptional: 'optional',
  saleTypeSectionTitle: 'Sale type reference',
  saleTypeIntro:
    'Valid values for the sale_type column and what each one means. Pick whichever genuinely matches what you sold — most everyday sales are "Goods at standard rate (default)".',
  colSaleTypeValue: 'sale_type value',
  colMeaning: 'Meaning',
  warningStrong: 'Editing your file in Excel, Numbers, or Google Sheets?',
  warningRest:
    'These apps silently reformat cells that "look like" dates, decimals, or percentages — e.g. 2026-08-17 → 8/17/2026, 0101.2100 → 101.21, 18% → 0.18. If an upload fails with an odd value mismatch, open the file in a plain text editor first to check for this before re-uploading.',
  downloadPdf: 'Download PDF',
  language: 'Language',
}

const UR_COLUMNS = {
  pos_invoice_no: {
    meaning: 'آپ کے اپنے POS/رجسٹر کا انوائس نمبر۔',
    production:
      'جن قطاروں میں یہ ویلیو ایک جیسی ہو وہ ایک ہی انوائس میں کئی آئٹمز کے طور پر شامل ہو جاتی ہیں۔ ہر اصل سیل کے لیے نیا نمبر استعمال کریں — مختلف سیلز کے لیے ایک ہی نمبر دوبارہ کبھی استعمال نہ کریں۔',
    sandbox:
      'ہر ٹیسٹ کیے جانے والے سینیریو کے لیے الگ ویلیو استعمال کریں، مثلاً "SN001-TEST-1" — اس سے Invoices کی فہرست میں یہ معلوم کرنا آسان ہو جاتا ہے کہ کون سا انوائس کس سینیریو سے تعلق رکھتا ہے۔',
  },
  invoice_date: {
    meaning: 'سیل کی تاریخ، فارمیٹ YYYY-MM-DD۔',
    production:
      'سیل کی اصل تاریخ استعمال کریں۔ اگر آپ فائل کو Excel/Numbers/Google Sheets میں ایڈٹ کرتے ہیں تو بعد میں اس سیل کو ضرور چیک کریں — یہ ایپس تاریخوں کو خاموشی سے دوبارہ فارمیٹ کر دیتی ہیں (مثلاً 2026-08-17 → 8/17/2026)، جسے FBR مسترد کر دے گا۔',
    sandbox: 'کوئی بھی درست تاریخ چل جائے گی — ڈاؤن لوڈ کردہ ٹیمپلیٹ میں آج کی تاریخ پہلے سے بھری ہوتی ہے۔',
  },
  buyer_ntn_cnic: {
    meaning: 'خریدار کا NTN یا CNIC نمبر۔',
    production:
      'جب buyer_registration_type "Registered" ہو تو یہ لازمی ہے — غیر رجسٹرڈ (walk-in) کسٹمر کے لیے خالی چھوڑ دیں۔',
    sandbox:
      '"Registered" سینیریو کے لیے حقیقی جیسا دکھنے والا NTN استعمال کریں (جیسا کہ FBR کی دستاویزات میں نمونہ خریدار استعمال ہوتا ہے)۔ "Unregistered" سینیریو کے لیے خالی چھوڑ دیں۔',
  },
  buyer_name: {
    meaning: 'خریدار کے کاروبار یا کسٹمر کا نام۔',
    production: '"Walk-in Customer" خود بخود لاگو ہو جاتا ہے اگر خالی چھوڑ دیا جائے۔',
    sandbox: 'کوئی بھی نام چل جائے گا — اس سے یہ متاثر نہیں ہوتا کہ FBR سینیریو کو قبول کرتا ہے یا نہیں۔',
  },
  buyer_province: {
    meaning: 'خریدار کا صوبہ۔',
    production: 'اگر خالی چھوڑا جائے تو آپ کے اپنے سیلر صوبے (FBR Settings سے) پر واپس چلا جاتا ہے۔',
    sandbox: 'ٹیسٹنگ کے لیے کوئی بھی درست صوبہ چل جائے گا۔',
  },
  buyer_address: {
    meaning: 'خریدار کا پتہ۔',
    production: 'آزاد متن — پرنٹ شدہ رسید اور FBR جمع کرانے میں استعمال ہوتا ہے۔',
    sandbox: 'ٹیسٹنگ کے لیے کوئی بھی متن چل جائے گا۔',
  },
  buyer_registration_type: {
    meaning: '"Registered" یا "Unregistered"۔',
    production:
      'یہ FBR IRIS پر خریدار کی اصل حیثیت سے میل کھانا چاہیے۔ خالی چھوڑنے پر "Unregistered" پر واپس چلا جاتا ہے — کسی حقیقی رجسٹرڈ خریدار کے لیے اسے غلط سیٹ کرنا انوائس مسترد ہونے کی ایک عام وجہ ہے۔',
    sandbox:
      'کئی سینیریوز خاص طور پر ان میں سے کسی ایک کا تقاضا کرتے ہیں (مثلاً SN001 = رجسٹرڈ خریدار، SN002 = غیر رجسٹرڈ) — اسے تبدیل کرنے سے پہلے سینیریو کی سرکاری تفصیل چیک کریں۔',
  },
  product_description: {
    meaning: 'کیا بیچا گیا۔',
    production: 'پروڈکٹ یا آئٹم کی سادہ متنی تفصیل۔',
    sandbox: 'ٹیسٹنگ کے لیے کوئی بھی متن چل جائے گا۔',
  },
  hs_code: {
    meaning: 'پروڈکٹ کے لیے HS (Harmonized System) ٹیرف کوڈ، مثلاً 8471.3010۔',
    production:
      'لازمی — جو کچھ آپ واقعی بیچتے ہیں اس کے لیے درست کوڈ استعمال کریں۔ FBR اسے rate اور sale_type کے ساتھ کراس چیک کرتا ہے، اور غلط یا خالی کوڈ مسترد ہونے کی ایک عام وجہ ہے۔',
    sandbox:
      'سینیریو ٹیمپلیٹ میں پہلے سے موجود ویلیو کو ویسے ہی رہنے دیں — یہ پہلے سے ہی وہ کوڈ ہے جسے FBR کا validator اس سینیریو کے rate/sale_type امتزاج کے لیے قبول کرتا ہے۔',
  },
  rate: {
    meaning:
      'سیلز ٹیکس کی شرح بطور متن۔ عام طور پر فیصد ("18%"، "1%"، "Exempt")، لیکن یہ فی یونٹ مقررہ روپیہ رقم بھی ہو سکتی ہے ("Rs.3"، "Rs 200")، یا دونوں ("18% along with rupees 60 per kilogram")۔',
    production:
      '"18%" پہلے سے طے شدہ ہے اگر خالی چھوڑا جائے۔ یہ ایسی شرح ہونی چاہیے جسے FBR اس hs_code/sale_type امتزاج کے لیے حقیقتاً قبول کرتا ہو۔ ایپ ٹیکس نکالنے کے لیے اسے پڑھتی ہے: فیصد سیل ویلیو پر لگتا ہے؛ "Rs." / "rupees … per unit" رقم کو quantity سے ضرب دیا جاتا ہے؛ اگر متن میں دونوں ہوں تو دونوں جمع کر دیے جاتے ہیں۔ اگر آپ کی شرح ان میں سے کسی شکل کی نہ ہو تو ٹیکس کی رقم خود sales_tax کالم میں درج کریں۔',
    sandbox:
      'سینیریو ٹیمپلیٹ کی پہلے سے موجود شرح کو ویسے ہی رہنے دیں — یہ اس سینیریو کے لیے FBR کے اپنے سرکاری نمونے سے میل کھاتی ہے (بشمول SN021، SN022 اور SN023 میں فی یونٹ مقررہ شرحیں)۔',
  },
  uom: {
    meaning: 'پیمائش کی اکائی، مثلاً "Numbers, pieces, units"، "KG"، "Litre"۔',
    production: 'اس ویلیو میں سے ایک ہونی چاہیے جسے FBR اس HS کوڈ کے لیے قبول کرتا ہے۔',
    sandbox: 'سینیریو ٹیمپلیٹ کی پہلے سے موجود ویلیو کو ویسے ہی رہنے دیں۔',
  },
  quantity: {
    meaning: 'بیچی گئی اکائیوں کی تعداد۔',
    production: 'ایک مثبت نمبر ہونا چاہیے۔',
    sandbox: 'ٹیمپلیٹ سینیریو کے لیے ایک درست مقدار پہلے سے بھر دیتا ہے — اسے کسی بھی مثبت نمبر میں بدلنا محفوظ ہے۔',
  },
  unit_price: {
    meaning: 'فی یونٹ قیمت، سیلز ٹیکس کے بغیر۔',
    production:
      'یہ لائن کی سیل ویلیو (quantity × unit_price) طے کرتا ہے۔ استثنا: sale_type "3rd Schedule Goods" کے لیے، اسے 0 پر چھوڑ دیں — سیل کی قیمت اس کے بجائے fixed_notified_value سے طے ہوتی ہے (نیچے دیکھیں)۔',
    sandbox:
      'SN008/SN027 ("3rd Schedule Goods") کے لیے ٹیمپلیٹ جان بوجھ کر اسے 0 پہلے سے بھرتا ہے — اسے تبدیل نہ کریں، سیل کی قیمت اس کے بجائے fixed_notified_value سے طے ہوتی ہے۔',
  },
  sale_type: {
    meaning: 'FBR کی سیل کیٹیگری جس میں یہ لائن آتی ہے — نیچے دی گئی حوالہ جاتی جدول دیکھیں۔',
    production:
      '"Goods at standard rate (default)" پہلے سے طے شدہ ہے اگر خالی چھوڑا جائے۔ ٹیکس کو درست طریقے سے calculate کرنے کے لیے یہ سب سے اہم کالم ہے — وہ کیٹیگری منتخب کریں جو واقعی اس چیز سے میل کھاتی ہو جو بیچی جا رہی ہے۔',
    sandbox: 'سینیریو ٹیمپلیٹ کی پہلے سے موجود ویلیو کو ویسے ہی رہنے دیں — ہر سینیریو ایک مخصوص sale_type کی توقع رکھتا ہے۔',
  },
  scenario_id: {
    meaning: 'یہ قطار کس سینڈ باکس ٹیسٹ سینیریو (SN001–SN028) کے لیے تھی۔',
    production:
      'پروڈکشن میں FBR کو کبھی بھیجا ہی نہیں جاتا — اصل انوائسز پر کوئی سینیریو ٹیگ نہیں ہوتا۔ لائیو ہونے کے بعد اسے خالی چھوڑنا محفوظ ہے۔',
    sandbox:
      'سینڈ باکس جمع کرانے کے لیے لازمی ہے — یہ FBR کو بتاتا ہے کہ آپ کون سا سینیریو ثابت کر رہے ہیں۔ یہ 28 سرکاری کوڈز (SN001–SN028) میں سے کسی ایک سے میل کھانا چاہیے۔',
  },
  fixed_notified_value: {
    meaning: 'پروڈکٹ کے لیے حکومت کی جانب سے نوٹیفائیڈ/فکسڈ ریٹیل قیمت۔',
    production:
      'صرف sale_type "3rd Schedule Goods" کے لیے اہم ہے — ٹیکس آپ کی اصل سیل قیمت کے بجائے اس ویلیو پر calculate ہوتا ہے۔ ہر دوسرے sale_type کے لیے، بشمول "Goods at Reduced Rate"، خالی چھوڑ دیں۔',
    sandbox:
      'SN008/SN027 ٹیمپلیٹس کی طرف سے پہلے سے بھرا جاتا ہے — اسے ویسے ہی رہنے دیں جب تک آپ اصل نوٹیفائیڈ ویلیو نہیں جانتے جس کے ساتھ ٹیسٹ کرنا چاہتے ہیں۔',
  },
  sro_schedule_no: {
    meaning: 'وہ SRO (Statutory Regulatory Order) شیڈول جس کے تحت آپ کی پروڈکٹ درج ہے۔',
    production:
      'صرف اس وقت درکار ہے جب کوئی مخصوص SRO پروڈکٹ پر لاگو ہوتا ہو (مثلاً Eighth Schedule کے تحت کم شرح والے آئٹمز)۔ ورنہ خالی چھوڑ دیں۔',
    sandbox: 'SN028 ٹیمپلیٹ کی طرف سے پہلے سے بھرا جاتا ہے — اسے ویسے ہی رہنے دیں۔',
  },
  sro_item_serial_no: {
    meaning: 'اس SRO شیڈول کے اندر پروڈکٹ کا سیریل نمبر۔',
    production: 'sro_schedule_no کے ساتھ جوڑا بنتا ہے — صرف اس کے ساتھ ہی درکار ہے۔',
    sandbox: 'SN028 ٹیمپلیٹ کی طرف سے پہلے سے بھرا جاتا ہے — اسے ویسے ہی رہنے دیں۔',
  },
  invoice_ref_no: {
    meaning: 'کسی پہلے کے انوائس کا حوالہ جس سے یہ قطار متعلق ہے (مثلاً وہ اصل انوائس جسے ڈیبٹ/کریڈٹ نوٹ ایڈجسٹ کرتا ہے)۔',
    production:
      'عام سیل کے لیے خالی چھوڑ دیں۔ اسے صرف تب بھریں جب دستاویز کسی پہلے جاری کردہ انوائس کی طرف اشارہ کرے۔',
    sandbox:
      'PRAL کے نمونے اسے خالی چھوڑتے ہیں یا "SI-20250421-001" جیسا placeholder استعمال کرتے ہیں — جب تک زیرِ آزمائش سینیریو اس کا تقاضا نہ کرے، خالی چھوڑ دیں۔',
  },
  sales_tax: {
    meaning: 'لائن کے لیے سیلز ٹیکس کی رقم، روپوں میں — یہ اس رقم کو override کرتی ہے جو ایپ rate سے نکالتی۔',
    production:
      'خالی چھوڑ دیں تاکہ ایپ خود حساب کرے (quantity × unit_price × rate، یا "3rd Schedule Goods" کے لیے fixed_notified_value سے)۔ اسے صرف تب بھریں جب آپ کے POS/ERP نے پہلے ہی درست رقم نکال لی ہو اور FBR کو وہی عدد بغیر تبدیلی کے ملنا چاہیے — ورنہ FBR کے اپنے حساب سے ایک پیسے کا فرق بھی مسترد ہو سکتا ہے۔',
    sandbox:
      'سینیریو ٹیمپلیٹس کے لیے خالی چھوڑ دیں — وہ calculated ویلیو پر انحصار کرتے ہیں۔ اسے صرف تب سیٹ کریں جب آپ جان بوجھ کر کوئی مخصوص ٹیکس رقم ٹیسٹ کر رہے ہوں۔',
  },
  sales_tax_withheld_at_source: {
    meaning: 'خریدار کی جانب سے source پر روکا گیا سیلز ٹیکس، روپوں میں (PRAL salesTaxWithheldAtSource)۔',
    production:
      'عام سیل کے لیے خالی / 0۔ اسے تب بھریں جب خریدار withholding agent ہو اور اس نے ٹیکس کا کچھ حصہ روک لیا ہو — یہ عدد خریدار سے آتا ہے، یہاں حساب نہیں ہوتا۔',
    sandbox: 'صرف چند سینیریوز غیر صفر ویلیو استعمال کرتے ہیں (مثلاً SN005، SN012، SN013) — ورنہ خالی چھوڑ دیں۔',
  },
  extra_tax: {
    meaning: 'لائن پر اضافی ٹیکس، روپوں میں (PRAL extraTax) — بعض مخصوص اشیاء پر لاگو ہوتا ہے۔',
    production:
      'خالی / 0 جب تک پروڈکٹ واقعی اضافی ٹیکس نہ رکھتی ہو (کچھ ریگولیٹڈ کیٹیگریز، مثلاً موبائل فون)۔ قواعد کے مطابق روپے کی رقم درج کریں۔',
    sandbox: 'جب تک زیرِ آزمائش سینیریو خاص طور پر اضافی ٹیکس نہ آزمائے، خالی چھوڑ دیں۔',
  },
  further_tax: {
    meaning: 'غیر رجسٹرڈ خریدار کو سپلائی پر فردر ٹیکس، روپوں میں (PRAL furtherTax)۔',
    production:
      'رجسٹرڈ خریدار کے لیے خالی / 0۔ غیر رجسٹرڈ خریدار کے لیے فردر ٹیکس (عام طور پر 4%) اکثر لاگو ہوتا ہے — روپے کی رقم درج کریں؛ یہ انوائس کے کل میں شامل ہو جاتی ہے۔',
    sandbox: 'چند سینیریوز استعمال کرتے ہیں (مثلاً SN005، SN006)۔ جہاں نمونہ اسے سیٹ نہ کرے وہاں خالی چھوڑ دیں۔',
  },
  fed_payable: {
    meaning: 'لائن پر واجب الادا فیڈرل ایکسائز ڈیوٹی، روپوں میں (PRAL fedPayable)۔',
    production:
      'خالی / 0 جب تک اشیاء یا خدمات سیلز ٹیکس موڈ میں وصول ہونے والی FED نہ رکھتی ہوں (مثلاً "… (FED in ST Mode)" سیل ٹائپس)۔ FED کی رقم درج کریں؛ یہ انوائس کے کل میں شامل ہو جاتی ہے۔',
    sandbox: 'SN017 / SN018 اور اسی طرح کے لیے متعلقہ — جن سینیریوز میں FED شامل نہ ہو ان کے لیے خالی چھوڑ دیں۔',
  },
  discount: {
    meaning: 'لائن پر دی گئی رعایت، روپوں میں (PRAL discount)۔',
    production:
      'اگر کوئی رعایت نہ تھی تو خالی / 0۔ ورنہ لائن کے لیے روپے کی رعایت درج کریں — یہ لائن کے کل میں سے منہا ہو جاتی ہے۔ نوٹ: سیل ویلیو اور ٹیکس اب بھی quantity × unit_price سے لیے جاتے ہیں؛ رعایت خود بخود قابلِ ٹیکس رقم کم نہیں کرتی جب تک آپ کی unit_price میں یہ پہلے سے شامل نہ ہو۔',
    sandbox: 'جب تک آپ خاص طور پر رعایت والی لائن ٹیسٹ نہ کر رہے ہوں، خالی چھوڑ دیں۔',
  },
  total_values: {
    meaning: 'ٹیکس سمیت اور رعایت منہا کر کے پوری لائن کا کل، روپوں میں (PRAL totalValues)۔',
    production:
      'خالی چھوڑ دیں — ایپ آپ کے لیے جوڑ دیتی ہے (سیل ویلیو + سیلز ٹیکس + فردر ٹیکس + FED − رعایت)۔ اسے صرف تب سیٹ کریں جب کسی upstream سسٹم نے کوئی مخصوص عدد نکالا ہو جو FBR کو بغیر تبدیلی کے ملنا چاہیے۔',
    sandbox: 'سینیریو ٹیمپلیٹس کے لیے خالی چھوڑ دیں۔',
  },
  advance_tax: {
    meaning: 'انوائس پر وصول کیا گیا ایڈوانس انکم ٹیکس (§236)، روپوں میں۔',
    production:
      'اگر نہ ہو تو خالی / 0۔ ورنہ لائن کے لیے ایڈوانس انکم ٹیکس درج کریں — یہ رسید میں سیلز ٹیکس کے بعد دکھایا جاتا ہے اور گرینڈ ٹوٹل میں شامل ہو جاتا ہے۔ ایک ہی pos_invoice_no والی قطاریں جمع ہو کر ایک انوائس ٹوٹل بنتی ہیں۔',
    sandbox: 'خالی چھوڑ دیں۔',
  },
}

const UR_SALE_TYPES = {
  'Goods at standard rate (default)':
    'عام اشیاء جن پر معیاری شرح سے ٹیکس لاگو ہوتا ہے۔ اسے استعمال کریں جب تک نیچے دی گئی کوئی اور کیٹیگری لاگو نہ ہو۔',
  'Goods at Reduced Rate':
    'ایسی اشیاء جن پر حکومت کی نوٹیفائیڈ کم شرح سے ٹیکس لگتا ہے (Eighth Schedule)۔ اصل سیل ویلیو پر ٹیکس لگتا ہے — sro_schedule_no / sro_item_serial_no میں SRO کا حوالہ دیں۔',
  'Goods at zero-rate': 'زیرو ریٹڈ اشیاء (0% سیلز ٹیکس) — مثلاً برآمدات یا مخصوص زیرو ریٹڈ کیٹیگریز۔',
  'Exempt goods': 'ایسی اشیاء جو قانونی طور پر سیلز ٹیکس سے مکمل طور پر مستثنیٰ ہیں۔',
  '3rd Schedule Goods':
    'ریٹیل پرائس اسکیم کی اشیاء — ٹیکس حکومت کی نوٹیفائیڈ ریٹیل قیمت (fixed_notified_value) پر لاگو ہوتا ہے، آپ کی اصل سیل قیمت پر نہیں۔',
  Services: 'کسی جسمانی چیز کے بجائے کسی سروس کی فروخت۔',
  'Telecommunication services': 'ٹیلی کام سیکٹر کی سروس سیلز۔',
  'Services (FED in ST Mode)': 'وہ سروسز جن پر فیڈرل ایکسائز ڈیوٹی لاگو ہوتی ہے، جو سیلز ٹیکس موڈ میں وصول کی جاتی ہے۔',
  'Goods (FED in ST Mode)': 'وہ اشیاء جن پر فیڈرل ایکسائز ڈیوٹی لاگو ہوتی ہے، جو سیلز ٹیکس موڈ میں وصول کی جاتی ہے۔',
  'Toll Manufacturing': 'کسی اور کی ملکیتی اشیاء کو فیس کے عوض پراسیس/تیار کرنا۔',
  'Processing/Conversion of Goods': 'کسی دوسرے فریق کی جانب سے اشیاء کو تبدیل یا پراسیس کرنا۔',
  'Steel melting and re-rolling': 'اسٹیل سیکٹر کی میلٹنگ/ری رولنگ سرگرمیاں۔',
  'Ship breaking': 'شپ بریکنگ سیکٹر کی سیلز۔',
  'Cotton ginners': 'کاٹن جننگ سیکٹر کی سیلز۔',
  'Cement /Concrete Block': 'سیمنٹ یا کنکریٹ بلاک سیکٹر کی سیلز۔',
  'Potassium Chlorate': 'پوٹاشیم کلوریٹ کی سیلز — ایک خاص طور پر ریگولیٹڈ پروڈکٹ۔',
  'Petroleum Products': 'پیٹرولیم پروڈکٹس کی سیلز — ایک خاص طور پر ریگولیٹڈ کیٹیگری۔',
  'Gas to CNG stations': 'CNG اسٹیشنز کو فراہم کی جانے والی گیس۔',
  'CNG Sales': 'کمپریسڈ نیچرل گیس کی سیلز۔',
  'Electricity Supply to Retailers': 'ریٹیلرز کو فراہم کی جانے والی بجلی۔',
  'Mobile Phones': 'موبائل فون کی سیلز — ایک خاص طور پر ریگولیٹڈ کیٹیگری۔',
  'Electric Vehicle': 'الیکٹرک گاڑیوں کی سیلز۔',
  'Non-Adjustable Supplies': 'وہ سپلائیز جہاں ان پٹ ٹیکس ایڈجسٹمنٹ کی اجازت نہیں۔',
  'Goods as per SRO.297(I)/2023': 'وہ اشیاء جو خاص طور پر SRO.297(I)/2023 کے تحت آتی ہیں۔',
}

const UR_UI = {
  title: 'کالم گائیڈ',
  subtitleAdmin:
    'ہر کالم اپ لوڈ فائل میں کیا مطلب رکھتا ہے — سینڈ باکس سینیریو ٹیسٹنگ اور اصل پروڈکشن انوائسز دونوں کا احاطہ کرتے ہوئے، کیونکہ آپ ہر کاروبار کے پورے رول آؤٹ کا انتظام کرتے ہیں۔',
  subtitleUser:
    'ایک اصل سیل کے لیے اپ لوڈ فائل میں ہر کالم کا کیا مطلب ہے — یہ آپ کا پروڈکشن حوالہ ہے، ان انوائسز کے لیے جو آپ ہر روز اپ لوڈ کرتے ہیں۔',
  sandboxNoteStrong: 'scenario_id صرف سینڈ باکس کے لیے ہے۔',
  sandboxNoteRest:
    'پروڈکشن میں آپ کے انوائسز پر کوئی ٹیسٹ سینیریو بالکل ٹیگ نہیں ہوتا — FBR کو صرف اصل سیل کی تفصیلات موصول ہوتی ہیں۔ باقی سب کچھ فائل میں اس سے میل کھاتا ہے جو ٹرانزیکشن میں واقعی ہوا، دونوں ماحول میں۔',
  colColumn: 'کالم',
  colRequired: 'لازمی؟',
  colWhatItIs: 'یہ کیا ہے',
  colInSandbox: 'سینڈ باکس ٹیسٹنگ میں',
  colInProduction: 'پروڈکشن میں',
  badgeRequired: 'لازمی',
  badgeOptional: 'اختیاری',
  saleTypeSectionTitle: 'سیل ٹائپ حوالہ',
  saleTypeIntro:
    'sale_type کالم کے لیے درست ویلیوز اور ہر ایک کا کیا مطلب ہے۔ وہی منتخب کریں جو واقعی اس چیز سے میل کھاتی ہو جو آپ نے بیچی — زیادہ تر روزمرہ سیلز "Goods at standard rate (default)" ہوتی ہیں۔',
  colSaleTypeValue: 'sale_type ویلیو',
  colMeaning: 'مطلب',
  warningStrong: 'اپنی فائل کو Excel، Numbers، یا Google Sheets میں ایڈٹ کر رہے ہیں؟',
  warningRest:
    'یہ ایپس ایسے سیلز کو خاموشی سے دوبارہ فارمیٹ کر دیتی ہیں جو تاریخوں، اعشاریوں، یا فیصد جیسے "نظر آتے" ہیں — مثلاً 2026-08-17 → 8/17/2026، 0101.2100 → 101.21، 18% → 0.18۔ اگر کسی عجیب ویلیو کے فرق کی وجہ سے اپ لوڈ ناکام ہو جائے تو دوبارہ اپ لوڈ کرنے سے پہلے فائل کو ایک سادہ ٹیکسٹ ایڈیٹر میں کھول کر یہ چیک کریں۔',
  downloadPdf: 'پی ڈی ایف ڈاؤن لوڈ کریں',
  language: 'زبان',
}

const SD_COLUMNS = {
  pos_invoice_no: {
    meaning: 'توهان جو پنهنجو POS/رجسٽر انوائس نمبر.',
    production:
      'جن قطارن ۾ هيءَ ويليو هڪجهڙي هجي، اُهي هڪ ئي انوائس ۾ گھڻن آئٽمن جي صورت ۾ شامل ٿي وڃن ٿيون. هر حقيقي وڪري لاءِ نئون نمبر استعمال ڪريو — مختلف وڪرين لاءِ ساڳيو نمبر ٻيهر استعمال نه ڪريو.',
    sandbox:
      'هر ٽيسٽ ڪيل سيناريو لاءِ الڳ ويليو استعمال ڪريو، مثال طور "SN001-TEST-1" — ان سان Invoices جي لسٽ ۾ اهو معلوم ڪرڻ آسان ٿي وڃي ٿو ته ڪهڙو انوائس ڪهڙي سيناريو سان تعلق رکي ٿو.',
  },
  invoice_date: {
    meaning: 'وڪري جي تاريخ، فارميٽ YYYY-MM-DD.',
    production:
      'وڪري جي حقيقي تاريخ استعمال ڪريو. جيڪڏهن توهان فائل کي Excel/Numbers/Google Sheets ۾ ايڊٽ ڪريو ٿا ته پوءِ هن سيل کي ضرور چيڪ ڪريو — اهي ايپس تاريخن کي خاموشيءَ سان ٻيهر فارميٽ ڪري ڇڏينديون آهن (مثال طور 2026-08-17 → 8/17/2026)، جنهن کي FBR رد ڪري ڇڏيندو.',
    sandbox: 'ڪا به صحيح تاريخ هلي ويندي — ڊائون لوڊ ڪيل ٽيمپليٽ ۾ اڄ جي تاريخ اڳ ۾ ئي ڀري وئي آهي.',
  },
  buyer_ntn_cnic: {
    meaning: 'خريدار جو NTN يا CNIC نمبر.',
    production:
      'ضروري آهي جڏهن buyer_registration_type "Registered" هجي — غير رجسٽرڊ (walk-in) گراهڪ لاءِ خالي ڇڏي ڏيو.',
    sandbox:
      '"Registered" سيناريو لاءِ حقيقي نظر ايندڙ NTN استعمال ڪريو (جيئن FBR جي دستاويزن ۾ نمونو خريدار استعمال ٿئي ٿو). "Unregistered" سيناريو لاءِ خالي ڇڏي ڏيو.',
  },
  buyer_name: {
    meaning: 'خريدار جي ڪاروبار يا گراهڪ جو نالو.',
    production: '"Walk-in Customer" پاڻ مرادو لاڳو ٿي ويندو جيڪڏهن خالي ڇڏيو.',
    sandbox: 'ڪوبه نالو هلي ويندو — ان سان اهو متاثر نه ٿيندو ته FBR سيناريو قبول ڪري ٿو يا نه.',
  },
  buyer_province: {
    meaning: 'خريدار جو صوبو.',
    production: 'جيڪڏهن خالي ڇڏيو وڃي ته توهان جي پنهنجي سيلر صوبي (FBR Settings مان) تي واپس هليو ويندو.',
    sandbox: 'ٽيسٽنگ لاءِ ڪوبه صحيح صوبو هلي ويندو.',
  },
  buyer_address: {
    meaning: 'خريدار جو پتو.',
    production: 'آزاد متن — ڇپيل رسيد ۽ FBR ڏانهن موڪليل درخواست ۾ استعمال ٿئي ٿو.',
    sandbox: 'ٽيسٽنگ لاءِ ڪوبه متن هلي ويندو.',
  },
  buyer_registration_type: {
    meaning: '"Registered" يا "Unregistered".',
    production:
      'هيءَ FBR IRIS تي خريدار جي حقيقي حيثيت سان ملڻ گهرجي. خالي ڇڏڻ تي "Unregistered" تي واپس هليو ويندو — ڪنهن حقيقي رجسٽرڊ خريدار لاءِ هيءَ غلط سيٽ ڪرڻ انوائس رد ٿيڻ جو هڪ عام سبب آهي.',
    sandbox:
      'ڪيترائي سيناريو خاص طور تي انهن مان هڪ جو تقاضا ڪن ٿا (مثال طور SN001 = رجسٽرڊ خريدار، SN002 = غير رجسٽرڊ) — ان کي تبديل ڪرڻ کان اڳ سيناريو جي سرڪاري تفصيل چيڪ ڪريو.',
  },
  product_description: {
    meaning: 'ڇا وڪرو ٿيو.',
    production: 'پراڊڪٽ يا آئٽم جي سادي متني تفصيل.',
    sandbox: 'ٽيسٽنگ لاءِ ڪوبه متن هلي ويندو.',
  },
  hs_code: {
    meaning: 'پراڊڪٽ لاءِ HS (Harmonized System) ٽيرف ڪوڊ، مثال طور 8471.3010.',
    production:
      'لازمي — جيڪو توهان حقيقت ۾ وڪرو ڪريو ٿا ان لاءِ صحيح ڪوڊ استعمال ڪريو. FBR ان کي rate ۽ sale_type سان ڪراس چيڪ ڪري ٿو، ۽ غلط يا خالي ڪوڊ رد ٿيڻ جو هڪ عام سبب آهي.',
    sandbox:
      'سيناريو ٽيمپليٽ ۾ اڳ ۾ ئي موجود ويليو کي ائين ئي رهڻ ڏيو — اهو اڳ ۾ ئي اهو ڪوڊ آهي جنهن کي FBR جو validator ان سيناريو جي rate/sale_type ميلاپ لاءِ قبول ڪري ٿو.',
  },
  rate: {
    meaning:
      'سيلز ٽيڪس جي شرح متن طور. عام طور تي سيڪڙو ("18%"، "1%"، "Exempt")، پر هيءَ في يونٽ مقرر ٿيل رپئي رقم به ٿي سگهي ٿي ("Rs.3"، "Rs 200")، يا ٻئي ("18% along with rupees 60 per kilogram").',
    production:
      '"18%" اڳ ۾ ئي طئي ٿيل آهي جيڪڏهن خالي ڇڏيو وڃي. هيءَ اهڙي شرح هجڻ گهرجي جنهن کي FBR ان hs_code/sale_type ميلاپ لاءِ حقيقت ۾ قبول ڪري ٿو. ايپ ٽيڪس ڪڍڻ لاءِ ان کي پڙهي ٿي: سيڪڙو سيل ويليو تي لاڳو ٿئي ٿو؛ "Rs." / "rupees … per unit" رقم کي quantity سان ضرب ڏنو وڃي ٿو؛ جيڪڏهن متن ۾ ٻئي هجن ته ٻئي گڏي ڏنا وڃن ٿا. جيڪڏهن توهان جي شرح انهن مان ڪنهن شڪل جي نه هجي ته ٽيڪس جي رقم پاڻ sales_tax ڪالم ۾ داخل ڪريو.',
    sandbox:
      'سيناريو ٽيمپليٽ جي اڳ ۾ ئي موجود شرح کي ائين ئي رهڻ ڏيو — اها ان سيناريو لاءِ FBR جي پنهنجي سرڪاري نموني سان ملي ٿي (بشمول SN021، SN022 ۽ SN023 ۾ في يونٽ مقرر ٿيل شرحون).',
  },
  uom: {
    meaning: 'ماپ جو يونٽ، مثال طور "Numbers, pieces, units"، "KG"، "Litre".',
    production: 'هيءَ انهن يونٽ ويلن مان هڪ هجڻ گهرجي جن کي FBR ان HS ڪوڊ لاءِ قبول ڪري ٿو.',
    sandbox: 'سيناريو ٽيمپليٽ جي اڳ ۾ ئي موجود ويليو کي ائين ئي رهڻ ڏيو.',
  },
  quantity: {
    meaning: 'وڪريل يونٽن جو تعداد.',
    production: 'هڪ مثبت نمبر هجڻ گهرجي.',
    sandbox: 'ٽيمپليٽ سيناريو لاءِ هڪ صحيح مقدار اڳ ۾ ئي ڀري ٿو — ان کي ڪنهن به مثبت نمبر ۾ تبديل ڪرڻ محفوظ آهي.',
  },
  unit_price: {
    meaning: 'في يونٽ قيمت، سيلز ٽيڪس کان سواءِ.',
    production:
      'هيءَ لائن جي وڪري ويليو (quantity × unit_price) طئي ڪري ٿي. استثنا: sale_type "3rd Schedule Goods" لاءِ، ان کي 0 تي ڇڏي ڏيو — وڪري جي قيمت ان جي بدران fixed_notified_value مان طئي ٿئي ٿي (هيٺ ڏسو).',
    sandbox:
      'SN008/SN027 ("3rd Schedule Goods") لاءِ ٽيمپليٽ ڄاڻي واڻي ان کي 0 اڳ ۾ ئي ڀري ٿو — ان کي تبديل نه ڪريو، وڪري جي قيمت ان جي بدران fixed_notified_value مان طئي ٿئي ٿي.',
  },
  sale_type: {
    meaning: 'FBR جي وڪري ڪيٽيگري جنهن ۾ هيءَ لائن اچي ٿي — هيٺ ڏنل حوالي واري جدول ڏسو.',
    production:
      '"Goods at standard rate (default)" اڳ ۾ ئي طئي ٿيل آهي جيڪڏهن خالي ڇڏيو وڃي. ٽيڪس کي صحيح طريقي سان حساب ڪرڻ لاءِ هيءَ سڀ کان اهم ڪالم آهي — اها ڪيٽيگري چونڊيو جيڪا حقيقت ۾ ان شيءِ سان ملي ٿي جيڪا وڪرو ٿي رهي آهي.',
    sandbox: 'سيناريو ٽيمپليٽ جي اڳ ۾ ئي موجود ويليو کي ائين ئي رهڻ ڏيو — هر سيناريو هڪ مخصوص sale_type جي اميد رکي ٿو.',
  },
  scenario_id: {
    meaning: 'هيءَ قطار ڪهڙي سينڊ باڪس ٽيسٽ سيناريو (SN001–SN028) لاءِ هئي.',
    production:
      'پيداواري (پروڊڪشن) ۾ FBR ڏانهن ڪڏهن به موڪليو ئي نه ويندو آهي — حقيقي انوائسز تي ڪوبه سيناريو ٽيگ نه ٿيندو آهي. لائيو ٿيڻ کان پوءِ ان کي خالي ڇڏڻ محفوظ آهي.',
    sandbox:
      'سينڊ باڪس ڏانهن موڪلڻ لاءِ ضروري آهي — هيءَ FBR کي ٻڌائي ٿي ته توهان ڪهڙو سيناريو ثابت ڪري رهيا آهيو. هيءَ 28 سرڪاري ڪوڊز (SN001–SN028) مان هڪ سان ملڻ گهرجي.',
  },
  fixed_notified_value: {
    meaning: 'پراڊڪٽ لاءِ حڪومت پاران نوٽيفائيڊ/مقرر ٿيل رٽيل قيمت.',
    production:
      'صرف sale_type "3rd Schedule Goods" لاءِ اهم آهي — ٽيڪس توهان جي حقيقي وڪري قيمت جي بدران هن ويليو تي حساب ٿئي ٿو. هر ٻئي sale_type لاءِ، جنهن ۾ "Goods at Reduced Rate" به شامل آهي، خالي ڇڏي ڏيو.',
    sandbox:
      'SN008/SN027 ٽيمپليٽس پاران اڳ ۾ ئي ڀريل آهي — ان کي ائين ئي رهڻ ڏيو جيستائين توهان اها حقيقي نوٽيفائيڊ ويليو نٿا ڄاڻو جنهن سان توهان ٽيسٽ ڪرڻ چاهيو ٿا.',
  },
  sro_schedule_no: {
    meaning: 'اهو SRO (Statutory Regulatory Order) شيڊول جنهن هيٺ توهان جي پراڊڪٽ داخل آهي.',
    production:
      'صرف ان وقت گهربل آهي جڏهن ڪو مخصوص SRO پراڊڪٽ تي لاڳو ٿئي (مثال طور Eighth Schedule هيٺ گھٽ شرح وارا آئٽم). ٻي صورت ۾ خالي ڇڏيو.',
    sandbox: 'SN028 ٽيمپليٽ پاران اڳ ۾ ئي ڀريل آهي — ان کي ائين ئي رهڻ ڏيو.',
  },
  sro_item_serial_no: {
    meaning: 'ان SRO شيڊول اندر پراڊڪٽ جو سيريل نمبر.',
    production: 'sro_schedule_no سان جوڙو ٺاهي ٿو — صرف ان سان گڏ ئي گهربل آهي.',
    sandbox: 'SN028 ٽيمپليٽ پاران اڳ ۾ ئي ڀريل آهي — ان کي ائين ئي رهڻ ڏيو.',
  },
  invoice_ref_no: {
    meaning: 'ڪنهن اڳئين انوائس جو حوالو جنهن سان هيءَ قطار لاڳاپيل آهي (مثال طور اهو اصل انوائس جنهن کي ڊيبٽ/ڪريڊٽ نوٽ ايڊجسٽ ڪري ٿو).',
    production:
      'عام وڪري لاءِ خالي ڇڏي ڏيو. ان کي صرف تڏهن سيٽ ڪريو جڏهن دستاويز ڪنهن اڳ ۾ جاري ٿيل انوائس ڏانهن اشارو ڪري.',
    sandbox:
      'PRAL جا نمونا ان کي خالي ڇڏين ٿا يا "SI-20250421-001" جهڙو placeholder استعمال ڪن ٿا — جيستائين پرکبل سيناريو ان جو تقاضو نه ڪري، خالي ڇڏي ڏيو.',
  },
  sales_tax: {
    meaning: 'لائن لاءِ سيلز ٽيڪس جي رقم، رپين ۾ — هيءَ ان انگ کي override ڪري ٿي جيڪو ايپ rate مان ڪڍي ها.',
    production:
      'خالي ڇڏي ڏيو ته جيئن ايپ پاڻ حساب ڪري (quantity × unit_price × rate، يا "3rd Schedule Goods" لاءِ fixed_notified_value مان). ان کي صرف تڏهن ڀريو جڏهن توهان جي POS/ERP اڳ ۾ ئي صحيح رقم ڪڍي ورتي هجي ۽ FBR کي ساڳيو انگ بغير تبديليءَ جي ملڻ گهرجي — نه ته FBR جي پنهنجي حساب کان هڪ پئسي جو فرق به رد ٿي سگهي ٿو.',
    sandbox:
      'سيناريو ٽيمپليٽس لاءِ خالي ڇڏي ڏيو — اهي calculated ويليو تي ڀاڙين ٿا. ان کي صرف تڏهن سيٽ ڪريو جڏهن توهان ڄاڻي واڻي ڪا مخصوص ٽيڪس رقم پرکي رهيا آهيو.',
  },
  sales_tax_withheld_at_source: {
    meaning: 'خريدار پاران source تي روڪيل سيلز ٽيڪس، رپين ۾ (PRAL salesTaxWithheldAtSource).',
    production:
      'عام وڪري لاءِ خالي / 0. ان کي تڏهن ڀريو جڏهن خريدار withholding agent هجي ۽ ٽيڪس جو ڪجهه حصو روڪي ورتو هجي — هيءُ انگ خريدار کان اچي ٿو، هتي حساب نٿو ٿئي.',
    sandbox: 'صرف ڪجهه سيناريو غير صفر ويليو استعمال ڪن ٿا (مثال طور SN005، SN012، SN013) — نه ته خالي ڇڏي ڏيو.',
  },
  extra_tax: {
    meaning: 'لائن تي اضافي ٽيڪس، رپين ۾ (PRAL extraTax) — ڪجهه مخصوص شين تي لاڳو ٿئي ٿو.',
    production:
      'خالي / 0 جيستائين پراڊڪٽ واقعي اضافي ٽيڪس نه رکي (ڪجهه ريگيوليٽ ٿيل ڪيٽيگريون، مثال طور موبائل فون). قاعدن مطابق رپئي جي رقم داخل ڪريو.',
    sandbox: 'جيستائين پرکبل سيناريو خاص طور تي اضافي ٽيڪس نه پرکي، خالي ڇڏي ڏيو.',
  },
  further_tax: {
    meaning: 'غير رجسٽرڊ خريدار کي سپلائي تي فردر ٽيڪس، رپين ۾ (PRAL furtherTax).',
    production:
      'رجسٽرڊ خريدار لاءِ خالي / 0. غير رجسٽرڊ خريدار لاءِ فردر ٽيڪس (عام طور تي 4%) اڪثر لاڳو ٿئي ٿو — رپئي جي رقم داخل ڪريو؛ اها انوائس جي ڪل ۾ شامل ٿي وڃي ٿي.',
    sandbox: 'ڪجهه سيناريو استعمال ڪن ٿا (مثال طور SN005، SN006). جتي نمونو ان کي سيٽ نه ڪري اتي خالي ڇڏي ڏيو.',
  },
  fed_payable: {
    meaning: 'لائن تي واجب الادا فيڊرل ايڪسائيز ڊيوٽي، رپين ۾ (PRAL fedPayable).',
    production:
      'خالي / 0 جيستائين شيون يا خدمتون سيلز ٽيڪس موڊ ۾ وصول ٿيندڙ FED نه رکن (مثال طور "… (FED in ST Mode)" سيل ٽائيپس). FED جي رقم داخل ڪريو؛ اها انوائس جي ڪل ۾ شامل ٿي وڃي ٿي.',
    sandbox: 'SN017 / SN018 ۽ اهڙن لاءِ لاڳاپيل — جن سيناريوز ۾ FED شامل نه هجي انهن لاءِ خالي ڇڏي ڏيو.',
  },
  discount: {
    meaning: 'لائن تي ڏنل رعايت، رپين ۾ (PRAL discount).',
    production:
      'جيڪڏهن ڪا رعايت نه هئي ته خالي / 0. نه ته لائن لاءِ رپئي جي رعايت داخل ڪريو — اها لائن جي ڪل مان ڪٽجي وڃي ٿي. نوٽ: سيل ويليو ۽ ٽيڪس اڃا به quantity × unit_price مان ورتا وڃن ٿا؛ رعايت پاڻ مرادو قابلِ ٽيڪس رقم گھٽ نٿي ڪري جيستائين توهان جي unit_price ۾ اها اڳ ۾ شامل نه هجي.',
    sandbox: 'جيستائين توهان خاص طور تي رعايت واري لائن نه پرکي رهيا آهيو، خالي ڇڏي ڏيو.',
  },
  total_values: {
    meaning: 'ٽيڪس سميت ۽ رعايت ڪٽي پوري لائن جو ڪل، رپين ۾ (PRAL totalValues).',
    production:
      'خالي ڇڏي ڏيو — ايپ توهان لاءِ جوڙ ڪري ٿي (سيل ويليو + سيلز ٽيڪس + فردر ٽيڪس + FED − رعايت). ان کي صرف تڏهن سيٽ ڪريو جڏهن ڪنهن upstream سسٽم ڪو مخصوص انگ ڪڍيو هجي جيڪو FBR کي بغير تبديليءَ جي ملڻ گهرجي.',
    sandbox: 'سيناريو ٽيمپليٽس لاءِ خالي ڇڏي ڏيو.',
  },
  advance_tax: {
    meaning: 'انوائس تي وصول ٿيل ايڊوانس انڪم ٽيڪس (§236)، رپين ۾.',
    production:
      'جيڪڏهن ڪونهي ته خالي / 0. نه ته لائن لاءِ ايڊوانس انڪم ٽيڪس داخل ڪريو — اهو رسيد ۾ سيلز ٽيڪس کان پوءِ ڏيکاريو وڃي ٿو ۽ گرينڊ ٽوٽل ۾ شامل ٿي وڃي ٿو. ساڳي pos_invoice_no واريون قطارون گڏجي هڪ انوائس ٽوٽل ٺاهين ٿيون.',
    sandbox: 'خالي ڇڏي ڏيو.',
  },
}

const SD_SALE_TYPES = {
  'Goods at standard rate (default)':
    'عام شيون جن تي معياري شرح سان ٽيڪس لڳي ٿو. ان کي استعمال ڪريو جيستائين هيٺ ڏنل ٻي ڪا ڪيٽيگري لاڳو نه ٿئي.',
  'Goods at Reduced Rate':
    'اهڙيون شيون جن تي حڪومت جي نوٽيفائيڊ گھٽ شرح سان ٽيڪس لڳي ٿو (Eighth Schedule). حقيقي وڪري ويليو تي ٽيڪس لڳي ٿو — sro_schedule_no / sro_item_serial_no ۾ SRO جو حوالو ڏيو.',
  'Goods at zero-rate': 'زيرو ريٽيڊ شيون (0% سيلز ٽيڪس) — مثال طور برآمدون يا مخصوص زيرو ريٽيڊ ڪيٽيگريون.',
  'Exempt goods': 'اهڙيون شيون جيڪي قانوني طور تي سيلز ٽيڪس کان مڪمل طور تي آجيون آهن.',
  '3rd Schedule Goods':
    'رٽيل پرائس اسڪيم جون شيون — ٽيڪس حڪومت جي نوٽيفائيڊ رٽيل قيمت (fixed_notified_value) تي لڳي ٿو، توهان جي حقيقي وڪري قيمت تي نه.',
  Services: 'ڪنهن حقيقي شيءِ جي بدران ڪنهن سروس جي وڪري.',
  'Telecommunication services': 'ٽيلي ڪام شعبي جي سروس وڪري.',
  'Services (FED in ST Mode)': 'اهڙيون سروسون جن تي فيڊرل ايڪسائيز ڊيوٽي لاڳو ٿئي ٿي، جيڪا سيلز ٽيڪس موڊ ۾ حاصل ڪئي وڃي ٿي.',
  'Goods (FED in ST Mode)': 'اهڙيون شيون جن تي فيڊرل ايڪسائيز ڊيوٽي لاڳو ٿئي ٿي، جيڪا سيلز ٽيڪس موڊ ۾ حاصل ڪئي وڃي ٿي.',
  'Toll Manufacturing': 'ڪنهن ٻئي جي ملڪيت وارين شين کي في جي عيوض پروسيس/تيار ڪرڻ.',
  'Processing/Conversion of Goods': 'ڪنهن ٻئي پارٽي طرفان شين کي تبديل يا پروسيس ڪرڻ.',
  'Steel melting and re-rolling': 'اسٽيل شعبي جي ميلٽنگ/ري رولنگ سرگرميون.',
  'Ship breaking': 'شپ بريڪنگ شعبي جي وڪري.',
  'Cotton ginners': 'ڪپهه جي جننگ شعبي جي وڪري.',
  'Cement /Concrete Block': 'سيمينٽ يا ڪنڪريٽ بلاڪ شعبي جي وڪري.',
  'Potassium Chlorate': 'پوٽاشيم ڪلوريٽ جي وڪري — هڪ خاص طور تي ريگيوليٽ ٿيل پراڊڪٽ.',
  'Petroleum Products': 'پيٽروليم پراڊڪٽس جي وڪري — هڪ خاص طور تي ريگيوليٽ ٿيل ڪيٽيگري.',
  'Gas to CNG stations': 'CNG اسٽيشنن کي ڏني ويندڙ گئس.',
  'CNG Sales': 'ڪمپريسڊ نيچرل گئس جي وڪري.',
  'Electricity Supply to Retailers': 'رٽيلرن کي ڏني ويندڙ بجلي.',
  'Mobile Phones': 'موبائل فون جي وڪري — هڪ خاص طور تي ريگيوليٽ ٿيل ڪيٽيگري.',
  'Electric Vehicle': 'بجلياتي گاڏين جي وڪري.',
  'Non-Adjustable Supplies': 'اهڙيون سپلايون جتي ان پٽ ٽيڪس جي ترتيب جي اجازت ناهي.',
  'Goods as per SRO.297(I)/2023': 'اهڙيون شيون جيڪي خاص طور تي SRO.297(I)/2023 هيٺ اچن ٿيون.',
}

const SD_UI = {
  title: 'ڪالم گائيڊ',
  subtitleAdmin:
    'هر ڪالم اپ لوڊ فائل ۾ ڇا مطلب رکي ٿو — سينڊ باڪس سيناريو ٽيسٽنگ ۽ حقيقي پيداواري انوائسز ٻنهي کي شامل ڪندي، ڇاڪاڻ ته توهان هر ڪاروبار جي پوري رول آئوٽ جو انتظام ڪريو ٿا.',
  subtitleUser:
    'هڪ حقيقي وڪري لاءِ اپ لوڊ فائل ۾ هر ڪالم جو ڇا مطلب آهي — هيءَ توهان جو پيداواري حوالو آهي، انهن انوائسز لاءِ جيڪي توهان هر ڏينهن اپ لوڊ ڪريو ٿا.',
  sandboxNoteStrong: 'scenario_id صرف سينڊ باڪس لاءِ آهي.',
  sandboxNoteRest:
    'پيداواري (پروڊڪشن) ۾ توهان جي انوائسز تي ڪوبه ٽيسٽ سيناريو بلڪل ٽيگ نه ٿيندو آهي — FBR کي صرف حقيقي وڪري جي تفصيل ملي ٿي. باقي سڀ ڪجهه فائل ۾ ان سان ملي ٿو جيڪو ٽرانزيڪشن ۾ حقيقت ۾ ٿيو، ٻنهي ماحول ۾.',
  colColumn: 'ڪالم',
  colRequired: 'ضروري؟',
  colWhatItIs: 'هيءَ ڇا آهي',
  colInSandbox: 'سينڊ باڪس ٽيسٽنگ ۾',
  colInProduction: 'پيداواري ۾',
  badgeRequired: 'ضروري',
  badgeOptional: 'اختياري',
  saleTypeSectionTitle: 'وڪري جي قسم جو حوالو',
  saleTypeIntro:
    'sale_type ڪالم لاءِ صحيح ويلون ۽ هر هڪ جو ڇا مطلب آهي. اها چونڊيو جيڪا حقيقت ۾ ان شيءِ سان ملي ٿي جيڪا توهان وڪرو ڪئي — گھڻيون روزاني وڪريون "Goods at standard rate (default)" هونديون آهن.',
  colSaleTypeValue: 'sale_type ويليو',
  colMeaning: 'مطلب',
  warningStrong: 'پنهنجي فائل کي Excel، Numbers، يا Google Sheets ۾ ايڊٽ ڪري رهيا آهيو؟',
  warningRest:
    'هي ايپس اهڙن سيلن کي خاموشيءَ سان ٻيهر فارميٽ ڪري ڇڏينديون آهن جيڪي تاريخن، عشارين، يا سيڪڙي وانگر "نظر اچن ٿا" — مثال طور 2026-08-17 → 8/17/2026، 0101.2100 → 101.21، 18% → 0.18. جيڪڏهن ڪنهن عجيب ويليو جي فرق سببان اپ لوڊ ناڪام ٿئي ته ٻيهر اپ لوڊ ڪرڻ کان اڳ فائل کي هڪ سادي ٽيڪسٽ ايڊيٽر ۾ کولي اهو چيڪ ڪريو.',
  downloadPdf: 'پي ڊي ايف ڊائون لوڊ ڪريو',
  language: 'ٻولي',
}

export const COLUMN_GUIDE_TEXT = {
  en: { ui: EN_UI, columns: EN_COLUMNS, saleTypes: EN_SALE_TYPES },
  ur: { ui: UR_UI, columns: UR_COLUMNS, saleTypes: UR_SALE_TYPES },
  sd: { ui: SD_UI, columns: SD_COLUMNS, saleTypes: SD_SALE_TYPES },
}
