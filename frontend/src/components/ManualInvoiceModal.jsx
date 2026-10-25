import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Calculator, Loader2, Pencil, Plus, ReceiptText, Trash2, X } from 'lucide-react'
import { api } from '../api'
import Modal from './Modal'
import UnitPriceCalculator from './UnitPriceCalculator'
import { isPackPriced, packLine } from '../packPricing'

// Column order doesn't matter to the backend (it parses by header name), but
// keeping it explicit and matching csv_processor.ALL_COLUMNS makes the
// generated file easy to eyeball if something goes wrong.
const CSV_COLUMNS = [
  'pos_invoice_no',
  'invoice_date',
  'buyer_ntn_cnic',
  'buyer_name',
  'buyer_province',
  'buyer_address',
  'buyer_registration_type',
  'product_description',
  'hs_code',
  'rate',
  'uom',
  'quantity',
  'unit_price',
  'sale_type',
  'scenario_id',
  'fixed_notified_value',
  'sro_schedule_no',
  'sro_item_serial_no',
  'invoice_ref_no',
  'sales_tax',
  'sales_tax_withheld_at_source',
  'extra_tax',
  'further_tax',
  'fed_payable',
  'discount',
  'total_values',
  'advance_tax',
]

function csvField(value) {
  const s = String(value ?? '').trim()
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// One CSV row per product line; every row repeats the shared invoice / buyer
// fields, so rows sharing pos_invoice_no become one invoice with many items.
// Pack-priced lines also carry these (kept on the line for the receipt).
const PACK_CSV_COLUMNS = ['pack_qty', 'pack_price', 'pack_name']

function buildCsv(header, items) {
  // Plus the user's custom field columns (product values, keyed by field key).
  const customKeys = [...new Set(items.flatMap((it) => Object.keys(it.custom_fields || {})))]
  // Pack columns only when a line is pack-priced — any other invoice is
  // sent exactly as before.
  const packKeys = items.some((it) => it.pack_qty !== undefined) ? PACK_CSV_COLUMNS : []
  const columns = [...CSV_COLUMNS, ...packKeys, ...customKeys]
  const rows = items.map((item) => {
    const merged = { ...header, ...item, ...item.custom_fields }
    return columns.map((c) => csvField(merged[c])).join(',')
  })
  return `${columns.join(',')}\n${rows.join('\n')}\n`
}

function emptyHeader() {
  return {
    pos_invoice_no: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    invoice_ref_no: '',
    buyer_ntn_cnic: '',
    buyer_name: '',
    buyer_province: '',
    buyer_address: '',
    buyer_registration_type: 'Unregistered',
  }
}

function emptyItem() {
  return {
    product_id: '',
    // This line's unit price — the product's saved price when picked, but
    // can be changed (or calculated) for this invoice only, after "Edit".
    unit_price: '',
    unit_price_editing: false,
    packs: '',
    // Pack-priced products only (admin-enabled): quantity entered as packs
    // (in `packs`) or as KG (in `kg`), and this line's price per pack.
    qty_mode: 'packs',
    kg: '',
    pack_price: '',
    // Line amounts (LINE_FIELDS), pre-filled from the product's per-pack
    // amount × packs until the user types their own (then *_edited pins it).
    ...Object.fromEntries(LINE_FIELDS.flatMap((f) => [[f, ''], [`${f}_edited`, false]])),
  }
}

// Amounts entered (or adjusted) per invoice line rather than taken from the
// product as-is. advance_tax is §236 advance income tax — a receipt figure
// kept per line and summed onto the invoice.
const LINE_FIELDS = ['discount', 'further_tax', 'advance_tax']

// The line's unit price: its own if set, else the product's saved one.
function lineUnitPrice(it, product) {
  return it.unit_price !== '' && it.unit_price != null ? Number(it.unit_price) : product.unit_price
}

function itemIsComplete(it) {
  // qty_mode is only ever 'kg' on a pack-priced line; every other line is
  // checked exactly as before (packs > 0).
  return (
    it.product_id !== '' &&
    (Number(it.packs) > 0 || (it.qty_mode === 'kg' && Number(it.kg) > 0))
  )
}

// ── Pack-priced lines (admin-enabled per user) ──────────────────────────
// The line's price per pack: its own if changed, else the product's.
function linePackPrice(it, product) {
  return it.pack_price !== '' && it.pack_price != null ? Number(it.pack_price) : product.pack_price
}

// Packs / KG / value / unit price for a pack-priced line, or null for any
// other line (which then takes exactly the old path).
function packInfo(it, product, packOn) {
  if (!isPackPriced(product, packOn)) return null
  return packLine({
    mode: it.qty_mode,
    amount: it.qty_mode === 'kg' ? it.kg : it.packs,
    packSize: product.pack_size,
    packPrice: linePackPrice(it, product),
  })
}

// "Maund" -> "Maunds", but "Mounds" stays "Mounds" (no "Moundss").
function plural(name) {
  return /s$/i.test(name) ? name : `${name}s`
}

// Packs on the line — for scaling the product's per-pack charges.
function linePacks(it, product, packOn) {
  const pk = packInfo(it, product, packOn)
  return pk ? pk.packs : it.packs
}

// FBR quantity is in the product's UOM: packs × pack size (2 × 50 KG = 100).
// Rounded to 4dp so float noise (3 × 0.1) never reaches the payload.
function lineQuantity(product, packs) {
  return Math.round(Number(packs) * product.pack_size * 10000) / 10000
}

// A product's per-pack amount scaled to the line; '' stays '' (= auto / 0).
// Before a pack count is entered it shows the amount for a single pack,
// rather than amount × 0.
function perPack(amount, packs) {
  if (amount == null || amount === 0) return ''
  const n = Number(packs) > 0 ? Number(packs) : 1
  return Math.round(amount * n * 100) / 100
}

// The CSV row for one line: the saved product's FBR fields and per-pack
// charges × packs, plus this line's own discount / further tax / advance tax.
// A pack-priced line sends the KG quantity and a unit price that lands
// exactly on packs × price per pack (see packPricing.js); others as before.
function toCsvItem(it, product, packOn = false) {
  const pk = packInfo(it, product, packOn)
  const packs = pk ? pk.packs : it.packs
  return {
    sales_tax: perPack(product.sales_tax, packs),
    total_values: perPack(product.total_values, packs),
    fed_payable: perPack(product.fed_payable, packs),
    extra_tax: perPack(product.extra_tax, packs),
    sales_tax_withheld_at_source: perPack(product.st_withheld, packs),
    ...Object.fromEntries(LINE_FIELDS.map((f) => [f, it[f]])),
    product_description: product.description,
    hs_code: product.hs_code,
    rate: product.rate,
    uom: product.uom,
    quantity: pk ? pk.quantity : lineQuantity(product, it.packs),
    unit_price: pk ? pk.unitPrice : lineUnitPrice(it, product),
    sale_type: product.sale_type,
    fixed_notified_value: product.fixed_notified_value || '',
    sro_schedule_no: product.sro_schedule_no,
    sro_item_serial_no: product.sro_item_serial_no,
    custom_fields: product.custom_fields || {},
    // Only on pack-priced lines (absent otherwise, so nothing changes).
    ...(pk
      ? { pack_qty: pk.packs, pack_price: linePackPrice(it, product), pack_name: product.pack_name || '' }
      : {}),
  }
}

// Small red asterisk marker for a required field's label.
function Req() {
  return (
    <span style={{ color: 'var(--red-600)' }} aria-label="required">
      {' '}
      *
    </span>
  )
}

function NumField({ label, hint, value, onChange, placeholder = '0' }) {
  return (
    <div className="field">
      <label>
        {label} {hint && <span className="hint">{hint}</span>}
      </label>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  )
}

// Enter one invoice by hand — one or more product lines. Reuses the exact same
// upload pipeline: build a CSV client-side (one row per product, all sharing
// the pos_invoice_no) and POST it through POST /api/uploads, so it gets 100%
// of the existing validation, FBR submission, and error messages for free.
export default function ManualInvoiceModal({ onClose, onSubmitted, target = 'sandbox', scenarios }) {
  const isProduction = target === 'production'
  const [header, setHeader] = useState(emptyHeader)
  const [items, setItems] = useState([])
  const [draft, setDraft] = useState(emptyItem)
  const [editIndex, setEditIndex] = useState(null) // null = adding a new line
  const [provinces, setProvinces] = useState([])
  const [products, setProducts] = useState(null) // null = still loading
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [calcOpen, setCalcOpen] = useState(false) // unit-price calculator for the line
  const [packPricing, setPackPricing] = useState(false) // admin-enabled per user
  // Maunds or KG — remembered for the next line of this invoice, so a lot
  // typed in KG isn't silently read as maunds on the following line.
  const [lastQtyMode, setLastQtyMode] = useState('packs')
  const formRef = useRef(null)

  useEffect(() => {
    api.get('/api/reference/provinces').then(setProvinces).catch(() => {})
    api
      .get('/api/settings/fbr')
      .then((s) => setPackPricing(!!s.pack_pricing))
      .catch(() => {})
    api
      .get('/api/products')
      .then(setProducts)
      .catch((e) => {
        setProducts([])
        setError(e.message)
      })
  }, [])

  const productById = (id) => products?.find((p) => String(p.id) === String(id))
  const setH = (key) => (e) => setHeader({ ...header, [key]: e.target.value })
  const draftProduct = productById(draft.product_id)
  // Is the line being entered a pack-priced one (e.g. per Maund)?
  const draftPack = isPackPriced(draftProduct, packPricing)
  const draftPackInfo = packInfo(draft, draftProduct, packPricing)
  const packName = draftProduct?.pack_name || 'pack'
  const packNames = plural(packName)

  // Picking a product or changing packs re-fills the line amounts
  // (LINE_FIELDS) from the product, unless the user has typed their own.
  const setD = (key) => (e) => {
    const next = { ...draft, [key]: e.target.value }
    if (LINE_FIELDS.includes(key)) {
      next[`${key}_edited`] = e.target.value !== ''
    } else if (key !== 'unit_price' && key !== 'pack_price') {
      const product = productById(next.product_id)
      // A different product brings its own saved prices, locked again; a
      // pack-priced one starts in whichever unit (packs / KG) was used last.
      if (key === 'product_id') {
        next.unit_price = product ? String(product.unit_price) : ''
        next.unit_price_editing = false
        const packed = isPackPriced(product, packPricing)
        next.pack_price = packed ? String(product.pack_price) : ''
        next.qty_mode = packed ? lastQtyMode : 'packs'
        next.kg = ''
        if (packed && lastQtyMode === 'kg') next.packs = ''
      }
      const packs = product ? linePacks(next, product, packPricing) : next.packs
      for (const f of LINE_FIELDS) {
        if (!next[`${f}_edited`]) next[f] = product ? perPack(product[f], packs) : ''
      }
    }
    setDraft(next)
  }

  // Switch a pack-priced line between entering packs and entering KG. The
  // number typed stays as it is — clicking KG after typing 31339 means
  // "31,339 KG", not "convert 31,339 Maunds to KG".
  function setQtyMode(mode) {
    if (mode === draft.qty_mode || !draftProduct) return
    setLastQtyMode(mode)
    const typed = draft.qty_mode === 'kg' ? draft.kg : draft.packs
    const next = { ...draft, qty_mode: mode }
    if (mode === 'kg') next.kg = typed
    else next.packs = typed
    // The line's charges follow the (re-read) quantity, unless typed by hand.
    const packs = linePacks(next, draftProduct, packPricing)
    for (const f of LINE_FIELDS) {
      if (!next[`${f}_edited`]) next[f] = perPack(draftProduct[f], packs)
    }
    setDraft(next)
  }

  // FBR takes one scenarioId per invoice — like a CSV upload, the first
  // line's product decides it (blank = the account default).
  const scenarioLines = editIndex === null && itemIsComplete(draft) ? [...items, draft] : items
  const lineScenarios = scenarioLines.map((it) => productById(it.product_id)?.scenario_id || '')
  const invoiceScenario = lineScenarios[0] ?? ''
  const mixedScenarios = new Set(lineScenarios).size > 1
  const scenarioLabel = (code) => {
    if (!code) return 'account default'
    const s = scenarios?.find((x) => x.code === code)
    return s ? `${code} — ${s.name}` : code
  }

  function resetDraft() {
    setDraft(emptyItem())
    setEditIndex(null)
  }

  function saveProduct() {
    if (!itemIsComplete(draft)) {
      setError('Pick a product and enter the number of packs before saving.')
      return
    }
    setError('')
    if (editIndex === null) {
      setItems([...items, draft])
    } else {
      setItems(items.map((it, i) => (i === editIndex ? draft : it)))
    }
    resetDraft()
  }

  function editProduct(i) {
    setDraft({ ...items[i] })
    setEditIndex(i)
    setError('')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function removeProduct(i) {
    setItems(items.filter((_, idx) => idx !== i))
    if (editIndex === i) resetDraft()
    else if (editIndex !== null && i < editIndex) setEditIndex(editIndex - 1)
  }

  async function submit(e) {
    e.preventDefault()
    // Fold in a complete-but-unsaved draft (only when adding, not editing).
    const finalItems =
      editIndex === null && itemIsComplete(draft) ? [...items, draft] : items
    if (finalItems.length === 0) {
      setError('Add at least one product.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const csvItems = finalItems.map((it) => toCsvItem(it, productById(it.product_id), packPricing))
      const scenario_id = isProduction ? '' : invoiceScenario
      const csv = buildCsv({ ...header, scenario_id }, csvItems)
      const filename = `manual-${header.pos_invoice_no || Date.now()}.csv`
      const formData = new FormData()
      formData.append('file', new Blob([csv], { type: 'text/csv' }), filename)
      formData.append('target', target)
      const result = await api.upload('/api/uploads', formData)
      onSubmitted(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const nfmt = (v) => (v === '' || v == null ? '—' : Number(v).toLocaleString())
  // Packs to 5 decimals (1,079.73422, as on the factory's sheet); money to 2.
  const fmt5 = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 5 })
  const money = (v) =>
    Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <>
    <Modal title="Enter a single invoice" onClose={() => !busy && onClose()} width={900}>
      <form onSubmit={submit}>
        {error && (
          <div className="alert error">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}

        <h3 className="section-title" style={{ marginTop: 0 }}>
          Invoice
        </h3>
        <div className="form-grid">
          <div className="field">
            <label>
              POS invoice no.
              <Req />
            </label>
            <input
              value={header.pos_invoice_no}
              onChange={setH('pos_invoice_no')}
              placeholder="POS-1001"
              required
            />
          </div>
          <div className="field">
            <label>
              Invoice date
              <Req />
            </label>
            <input
              type="date"
              value={header.invoice_date}
              onChange={setH('invoice_date')}
              required
            />
          </div>
          <div className="field">
            <label>
              Invoice ref. no. <span className="hint">(optional)</span>
            </label>
            <input
              value={header.invoice_ref_no}
              onChange={setH('invoice_ref_no')}
              placeholder="Original invoice this one relates to"
            />
          </div>
          {!isProduction && (
            <div className="field">
              <label>
                Test scenario <span className="hint">(from the first product)</span>
              </label>
              <input value={scenarioLines.length ? scenarioLabel(invoiceScenario) : '—'} readOnly />
            </div>
          )}
        </div>

        <h3 className="section-title">Buyer</h3>
        <div className="form-grid">
          <div className="field">
            <label>Registration type</label>
            <select
              value={header.buyer_registration_type}
              onChange={setH('buyer_registration_type')}
            >
              <option value="Unregistered">Unregistered</option>
              <option value="Registered">Registered</option>
            </select>
          </div>
          <div className="field">
            <label>
              Buyer NTN / CNIC{' '}
              <span className="hint">
                {header.buyer_registration_type === 'Registered'
                  ? '(required for a registered buyer)'
                  : '(optional)'}
              </span>
            </label>
            <input
              value={header.buyer_ntn_cnic}
              onChange={setH('buyer_ntn_cnic')}
              placeholder="1234567"
            />
          </div>
          <div className="field">
            <label>Buyer name</label>
            <input
              value={header.buyer_name}
              onChange={setH('buyer_name')}
              placeholder="Walk-in Customer"
            />
          </div>
          <div className="field">
            <label>Province</label>
            <select value={header.buyer_province} onChange={setH('buyer_province')}>
              <option value="">Select…</option>
              {provinces.map((p) => {
                const name = p.stateProvinceDesc
                  .toLowerCase()
                  .replace(/\b\w/g, (c) => c.toUpperCase())
                return (
                  <option key={p.stateProvinceCode} value={name}>
                    {name}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="field">
            <label>Address</label>
            <input
              value={header.buyer_address}
              onChange={setH('buyer_address')}
              placeholder="Karachi"
            />
          </div>
        </div>

        {/* ── Product entry form ─────────────────────────────────────── */}
        <div
          ref={formRef}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
            marginTop: 8,
            background: editIndex !== null ? 'var(--slate-50, #f7f9fb)' : undefined,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h3 className="section-title" style={{ margin: 0 }}>
              {editIndex === null ? 'Add a product' : `Editing product ${editIndex + 1}`}
            </h3>
            {editIndex !== null && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={resetDraft}
              >
                <X size={14} /> Cancel edit
              </button>
            )}
          </div>

          {products?.length === 0 && (
            <div className="alert info">
              <AlertCircle size={17} />
              <span>
                You haven&apos;t saved any products yet. Add them on the{' '}
                <Link to="/products">Products</Link> page first.
              </span>
            </div>
          )}

          <div className="form-grid">
            <div className="field">
              <label>
                Product
                <Req />
              </label>
              <select value={draft.product_id} onChange={setD('product_id')} disabled={!products?.length}>
                <option value="">{products === null ? 'Loading…' : 'Select a product…'}</option>
                {products?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.description} ({nfmt(p.pack_size)} {p.uom})
                  </option>
                ))}
              </select>
            </div>
            {draftPack ? (
              // Pack-priced product: enter the quantity in packs or in KG.
              // The label names the unit being typed, so it can't be mixed up.
              <div className="field">
                <label>
                  Quantity in {draft.qty_mode === 'kg' ? draftProduct.uom : packNames}
                  <Req />
                </label>
                <div className="input-with-buttons">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={draft.qty_mode === 'kg' ? draft.kg : draft.packs}
                    onChange={setD(draft.qty_mode === 'kg' ? 'kg' : 'packs')}
                  />
                  <div className="seg-toggle" role="group" aria-label="Enter quantity in">
                    <button
                      type="button"
                      className={draft.qty_mode !== 'kg' ? 'active' : undefined}
                      onClick={() => setQtyMode('packs')}
                    >
                      {packNames}
                    </button>
                    <button
                      type="button"
                      className={draft.qty_mode === 'kg' ? 'active' : undefined}
                      onClick={() => setQtyMode('kg')}
                    >
                      {draftProduct.uom}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="field">
                <label>
                  Packs
                  <Req />
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={draft.packs}
                  onChange={setD('packs')}
                  placeholder="2"
                />
              </div>
            )}
          </div>

          {draftProduct && (
            <p className="muted" style={{ margin: '0 0 12px' }}>
              {draftProduct.hs_code} · {draftProduct.rate} · {draftProduct.sale_type}
              {!isProduction && draftProduct.scenario_id && ` · ${draftProduct.scenario_id}`}
              {draftPack && draftPackInfo && (
                <>
                  <br />
                  {fmt5(draftPackInfo.packs)} {packNames} ={' '}
                  <b>
                    {nfmt(draftPackInfo.quantity)} {draftProduct.uom}
                  </b>{' '}
                  (sent to FBR) · {fmt5(draftPackInfo.packs)} × Rs {nfmt(linePackPrice(draft, draftProduct))} ={' '}
                  <b>Rs {money(draftPackInfo.value)}</b> before tax
                </>
              )}
              {!draftPack && Number(draft.packs) > 0 && (
                <>
                  <br />
                  FBR quantity: {nfmt(draft.packs)} × {nfmt(draftProduct.pack_size)} ={' '}
                  <b>
                    {nfmt(lineQuantity(draftProduct, draft.packs))} {draftProduct.uom}
                  </b>{' '}
                  × Rs {nfmt(lineUnitPrice(draft, draftProduct))} ={' '}
                  <b>
                    Rs{' '}
                    {nfmt(
                      Math.round(
                        lineQuantity(draftProduct, draft.packs) * lineUnitPrice(draft, draftProduct) * 100
                      ) / 100
                    )}
                  </b>{' '}
                  before tax
                </>
              )}
            </p>
          )}

          {draftProduct && (
            <div className="form-grid">
              {draftPack ? (
                // Pack-priced: the price per pack (e.g. per Maund) — locked
                // until Edit, like the unit price on other lines.
                <div className="field">
                  <label>
                    Price per {packName}{' '}
                    <span className="hint">(excl. tax — this invoice only)</span>
                  </label>
                  <div className="input-with-buttons">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={draft.pack_price}
                      onChange={setD('pack_price')}
                      readOnly={!draft.unit_price_editing}
                      className={draft.unit_price_editing ? undefined : 'input-locked'}
                      aria-readonly={!draft.unit_price_editing}
                    />
                    {draft.unit_price_editing ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => setCalcOpen(true)}
                        title={`Work the price per ${packName} out from a price including tax`}
                      >
                        <Calculator size={14} /> Calculate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary has-tip"
                        onClick={() => setDraft({ ...draft, unit_price_editing: true })}
                        data-tip="Edit"
                        aria-label={`Edit price per ${packName}`}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>
                  {draft.unit_price_editing && (
                    <div className="hint" style={{ marginTop: 4, fontSize: '0.78rem' }}>
                      Product&apos;s saved price: Rs {draftProduct.pack_price} per {packName}.{' '}
                      <button
                        type="button"
                        className="link-button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            pack_price: String(draftProduct.pack_price),
                            unit_price_editing: false,
                          })
                        }
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>
              ) : (
              <div className="field">
                <label>
                  Unit price{' '}
                  <span className="hint">(per {draftProduct.uom}, excl. tax — this invoice only)</span>
                </label>
                {/* Locked to the product's price until "Edit"; then editable
                    with the calculator. */}
                <div className="input-with-buttons">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={draft.unit_price}
                    onChange={setD('unit_price')}
                    readOnly={!draft.unit_price_editing}
                    className={draft.unit_price_editing ? undefined : 'input-locked'}
                    aria-readonly={!draft.unit_price_editing}
                  />
                  {draft.unit_price_editing ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setCalcOpen(true)}
                      title="Work the unit price out from the price of one product including tax"
                    >
                      <Calculator size={14} /> Calculate
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary has-tip"
                      onClick={() => setDraft({ ...draft, unit_price_editing: true })}
                      data-tip="Edit"
                      aria-label="Edit unit price"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </div>
                {draft.unit_price_editing && (
                  <div className="hint" style={{ marginTop: 4, fontSize: '0.78rem' }}>
                    Product&apos;s saved price: Rs {draftProduct.unit_price}.{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          unit_price: String(draftProduct.unit_price),
                          unit_price_editing: false,
                        })
                      }
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
              )}
              <NumField
                label="Discount"
                hint="(for this line)"
                value={draft.discount}
                onChange={setD('discount')}
              />
              <NumField
                label="Further tax"
                hint="(for this line)"
                value={draft.further_tax}
                onChange={setD('further_tax')}
              />
              <NumField
                label="Advance tax"
                hint="(for this line)"
                value={draft.advance_tax}
                onChange={setD('advance_tax')}
              />
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={saveProduct}
            style={{ marginTop: 8 }}
          >
            {editIndex === null ? <Plus size={14} /> : <Pencil size={14} />}
            {editIndex === null ? 'Save product' : 'Update product'}
          </button>
        </div>

        {/* ── Added products ────────────────────────────────────────── */}
        {items.length > 0 && (
          <>
            <h3 className="section-title">Products on this invoice ({items.length})</h3>
            <div className="table-card" style={{ marginBottom: 14 }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>HS code</th>
                    <th>Packs</th>
                    <th>FBR qty</th>
                    <th>Unit price</th>
                    {!isProduction && <th>Scenario</th>}
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const p = productById(it.product_id)
                    const pk = packInfo(it, p, packPricing) // null unless pack-priced
                    return (
                    <tr key={i} style={{ background: editIndex === i ? 'var(--slate-50, #f7f9fb)' : undefined }}>
                      <td>{i + 1}</td>
                      <td>
                        <span className="strong">{p.description}</span>
                      </td>
                      <td className="mono">{p.hs_code}</td>
                      <td>
                        {pk ? `${fmt5(pk.packs)} ${plural(p.pack_name || 'pack')}` : nfmt(it.packs)}
                      </td>
                      <td>
                        {nfmt(pk ? pk.quantity : lineQuantity(p, it.packs))} {p.uom}
                      </td>
                      <td>
                        {pk
                          ? `${nfmt(linePackPrice(it, p))} / ${p.pack_name || 'pack'}`
                          : nfmt(lineUnitPrice(it, p))}
                      </td>
                      {!isProduction && <td className="mono">{p.scenario_id || '—'}</td>}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm has-tip"
                          onClick={() => editProduct(i)}
                          data-tip="Edit"
                          aria-label="Edit product"
                        >
                          <Pencil size={14} />
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-danger btn-sm has-tip"
                          onClick={() => removeProduct(i)}
                          data-tip="Remove"
                          aria-label="Remove product"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!isProduction && mixedScenarios && (
          <div className="alert info">
            <AlertCircle size={17} />
            <span>
              These products have different test scenarios. That&apos;s fine — the invoice still goes
              through — but FBR records only one scenario per invoice, so it will be tagged{' '}
              <b>{scenarioLabel(invoiceScenario)}</b> (the first product&apos;s), same as a CSV upload. If
              you need sandbox credit for the other scenarios, submit those products on their own
              invoice.
            </span>
          </div>
        )}

        <button className="btn btn-primary" disabled={busy} style={{ width: '100%', marginTop: 6 }}>
          {busy ? <Loader2 size={16} className="spin" /> : <ReceiptText size={16} />}
          {busy ? 'Submitting…' : 'Submit invoice'}
        </button>
      </form>
    </Modal>
    {/* After the form so it opens on top of it (a separate <form>, not nested). */}
    {calcOpen && draftProduct && (
      <UnitPriceCalculator
        // Pack-priced: works out the price per pack (a quantity of 1 pack).
        quantity={draftPack ? 1 : draftProduct.pack_size}
        rate={draftProduct.rate}
        unitLabel={draftPack ? packName : draftProduct.uom}
        source="the saved product"
        onUse={(price) => {
          setDraft(
            draftPack
              ? { ...draft, pack_price: String(Math.round(Number(price) * 100) / 100) }
              : { ...draft, unit_price: price }
          )
          setCalcOpen(false)
        }}
        onClose={() => setCalcOpen(false)}
      />
    )}
    </>
  )
}
