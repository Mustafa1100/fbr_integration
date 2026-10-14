// Maps rows from the pharma-distributor POS export ("CMPSALE.csv" —
// S_NO,N_TN,A_N,A_D,R_G,C_NIC,S_NAME,S_PRV,S_ADD,D_PRV,SAL_TYP,INV_TYP,P_IN,
// IN_V,IN_DT,HS_CD,I_NAME,SS_TX,UOM,Q_U,R_T,VL_AUE,ST_VAL,FD_PV,D_S,F_RT,
// EW_HT,EX_TX,FU_TX,T_SAL,SR_SH,IT_SN,W_HT) onto the FBR portal's bulk
// invoice upload columns (see ./targetSchema.js).
//
// Column meanings decoded from sample data (the POS export carries no
// header documentation) and confirmed against the business:
//   IN_V   POS invoice number -> pos_invoice_no, as-is
//   N_TN   buyer identifier, e.g. "E474917-5" -> buyer_ntn_cnic, with the
//          trailing "-<digit>" check-digit suffix stripped ("E474917")
//   A_N    buyer name                 A_D   buyer address/area
//   D_PRV  buyer province             R_G   buyer registration status
//   IN_DT  invoice date (DD-Mon-YY)
//   I_NAME product/item description
//   SS_TX  sales tax rate %           UOM   unit of measure
//   Q_U    quantity                   R_T   *total* line value (not a
//                                            per-unit rate — unit_price is
//                                            derived as R_T / Q_U)
//   D_S    discount amount (PKR), passed straight through
//   W_HT   advance tax rate, as a PERCENT (e.g. 0.5 = 0.5%) — converted to
//          a PKR amount as R_T * W_HT / 100
// HS_CD is often blank in this export, so hs_code is a single value
// applied to every row (see `settings.hsCode`) rather than read per row.
// C_NIC/S_NAME/S_PRV/S_ADD are the seller's own details, which come from
// the account's FBR settings on the portal side, not the CSV — not mapped.
// VL_AUE, ST_VAL, FD_PV, F_RT, EW_HT, EX_TX, FU_TX, T_SAL, SR_SH, IT_SN are
// always 0/blank in this export and have no corresponding target field.

const MONTH_NUM = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export const CMPSALE_REQUIRED_HEADERS = [
  'a_n', 'a_d', 'r_g', 'd_prv', 'in_v', 'in_dt', 'i_name', 'ss_tx', 'uom', 'q_u', 'r_t',
]

export function isCmpsaleFormat(headers) {
  const normalized = new Set(headers.map((h) => (h || '').trim().toLowerCase()))
  return CMPSALE_REQUIRED_HEADERS.every((h) => normalized.has(h))
}

function parseCmpsaleDate(raw) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/.exec((raw || '').trim())
  if (!m) return null
  const [, day, monAbbr, yy] = m
  const key = monAbbr.toLowerCase()
  if (!MONTH_NUM[key]) return null
  const year = 2000 + Number(yy)
  return `${year}-${MONTH_NUM[key]}-${day.padStart(2, '0')}`
}

function titleCase(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const UOM_MAP = {
  pack: 'Packs', packs: 'Packs', pck: 'Packs', box: 'Packs', boxes: 'Packs',
  nos: 'Numbers, pieces, units', pcs: 'Numbers, pieces, units', pc: 'Numbers, pieces, units',
  unit: 'Numbers, pieces, units', units: 'Numbers, pieces, units',
  kg: 'Kilograms', kgs: 'Kilograms',
  ltr: 'Litres', ltrs: 'Litres', litre: 'Litres', litres: 'Litres',
}

function normalizeUom(raw) {
  const key = (raw || '').trim().toLowerCase()
  return UOM_MAP[key] || titleCase(raw) || 'Packs'
}

function normalizeRegistrationType(raw) {
  const key = (raw || '').trim().toLowerCase()
  if (key.startsWith('unreg')) return 'Unregistered'
  if (key.startsWith('reg')) return 'Registered'
  return titleCase(raw) || 'Unregistered'
}

// "E474917-5" -> "E474917": keep everything before the first dash.
function stripCheckDigit(raw) {
  const value = (raw || '').trim()
  if (!value) return ''
  return value.split('-')[0].trim()
}

function roundMoney(n) {
  return Math.round(n * 100) / 100
}

// `settings`: { saleType, scenarioId, sroScheduleNo, sroItemSerialNo, hsCode }
// — all constant for this whole business/product category (FBR scenario
// SN025), not something the POS export carries per row, so they're
// supplied once rather than decoded per line.
export function convertCmpsaleRows(sourceRows, settings) {
  return sourceRows.map((raw, i) => {
    const row = {}
    for (const key of Object.keys(raw)) row[key.trim().toLowerCase()] = raw[key]

    const isoDate = parseCmpsaleDate(row.in_dt)
    const quantity = Number(row.q_u) || 0
    const totalValue = Number(row.r_t) || 0
    const unitPrice = quantity !== 0 ? roundMoney(totalValue / quantity) : totalValue
    const taxRatePct = Number(row.ss_tx) || 0
    const discount = roundMoney(Number(row.d_s) || 0)
    const advanceTaxPct = Number(row.w_ht) || 0
    const advanceTax = roundMoney((totalValue * advanceTaxPct) / 100)

    return {
      _sourceLine: i + 2,
      pos_invoice_no: (row.in_v || '').trim(),
      invoice_date: isoDate || '',
      buyer_ntn_cnic: stripCheckDigit(row.n_tn),
      buyer_name: (row.a_n || '').trim(),
      buyer_province: titleCase(row.d_prv),
      buyer_address: titleCase(row.a_d),
      buyer_registration_type: normalizeRegistrationType(row.r_g),
      product_description: (row.i_name || '').trim(),
      hs_code: settings.hsCode,
      rate: `${taxRatePct}%`,
      uom: normalizeUom(row.uom),
      quantity: quantity || '',
      unit_price: unitPrice || '',
      sale_type: settings.saleType,
      scenario_id: settings.scenarioId,
      fixed_notified_value: '',
      sro_schedule_no: settings.sroScheduleNo,
      sro_item_serial_no: settings.sroItemSerialNo,
      invoice_ref_no: '',
      sales_tax: '0',
      sales_tax_withheld_at_source: '0',
      extra_tax: '0',
      further_tax: '0',
      fed_payable: '0',
      discount: String(discount),
      total_values: '0',
      advance_tax: String(advanceTax),
    }
  })
}

export const DEFAULT_SETTINGS = {
  // FBR scenario SN025 — "Drugs Sold at Fixed ST Rate (Eighth Schedule
  // Table 1, Sr. 81)" — the scenario this whole conversion is built for.
  saleType: 'Non-Adjustable Supplies',
  scenarioId: 'SN025',
  sroScheduleNo: 'EIGHTH SCHEDULE Table 1',
  sroItemSerialNo: '81',
  // The one HS code this business invoices every drug line under.
  hsCode: '3004.1090',
}

// Fields applied uniformly to every row from the settings panel (as
// opposed to per-row fields like discount/advance_tax that come from the
// source data) — shared between the initial conversion and "Apply to all
// rows".
export const SETTINGS_ROW_FIELDS = {
  saleType: 'sale_type',
  scenarioId: 'scenario_id',
  sroScheduleNo: 'sro_schedule_no',
  sroItemSerialNo: 'sro_item_serial_no',
  hsCode: 'hs_code',
}
