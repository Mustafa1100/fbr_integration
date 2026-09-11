import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Pencil, Plus, ReceiptText, Trash2, X } from 'lucide-react'
import { api } from '../api'
import { SALE_TYPE_VALUES } from '../data/columnGuide'
import HsCodePicker from './HsCodePicker'
import Modal from './Modal'

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
function buildCsv(header, items) {
  const rows = items.map((item) => {
    const merged = { ...header, ...item }
    return CSV_COLUMNS.map((c) => csvField(merged[c])).join(',')
  })
  return `${CSV_COLUMNS.join(',')}\n${rows.join('\n')}\n`
}

function emptyHeader() {
  return {
    pos_invoice_no: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    invoice_ref_no: '',
    scenario_id: '',
    buyer_ntn_cnic: '',
    buyer_name: '',
    buyer_province: '',
    buyer_address: '',
    buyer_registration_type: 'Unregistered',
  }
}

function emptyItem() {
  return {
    product_description: '',
    hs_code: '',
    rate: '18%',
    uom: 'Numbers, pieces, units',
    quantity: '',
    unit_price: '',
    sale_type: 'Goods at standard rate (default)',
    fixed_notified_value: '',
    sro_schedule_no: '',
    sro_item_serial_no: '',
    // Optional amounts — blank means "let the app work it out" for
    // sales_tax / total_values, and 0 for the rest.
    sales_tax: '',
    sales_tax_withheld_at_source: '',
    extra_tax: '',
    further_tax: '',
    fed_payable: '',
    discount: '',
    total_values: '',
    // §236 advance income tax — a receipt figure; per-line values are summed
    // onto the invoice.
    advance_tax: '',
  }
}

function itemIsComplete(it) {
  return (
    it.product_description.trim() !== '' &&
    it.hs_code.trim() !== '' &&
    it.quantity !== '' &&
    it.unit_price !== ''
  )
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const formRef = useRef(null)

  useEffect(() => {
    api.get('/api/reference/provinces').then(setProvinces).catch(() => {})
  }, [])

  const setH = (key) => (e) => setHeader({ ...header, [key]: e.target.value })
  const setD = (key) => (e) => setDraft({ ...draft, [key]: e.target.value })
  const showFixedValueFields =
    draft.sale_type === '3rd Schedule Goods' || !/18\s*%/.test(draft.rate || '')

  function resetDraft() {
    setDraft(emptyItem())
    setEditIndex(null)
  }

  function saveProduct() {
    if (!itemIsComplete(draft)) {
      setError('Fill the product description, HS code, quantity and unit price before saving.')
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
      const csv = buildCsv(header, finalItems)
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

  return (
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
          {!isProduction && scenarios?.length > 0 && (
            <div className="field">
              <label>Test scenario</label>
              <select value={header.scenario_id} onChange={setH('scenario_id')}>
                <option value="">Use account default…</option>
                {scenarios.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
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

          <div className="form-grid">
            <div className="field">
              <label>
                Description
                <Req />
              </label>
              <input
                value={draft.product_description}
                onChange={setD('product_description')}
                placeholder="Laptop Computer 15 inch"
              />
            </div>
            <div className="field">
              <label>
                HS code
                <Req />
              </label>
              <HsCodePicker
                value={draft.hs_code}
                onChange={(v) => setDraft({ ...draft, hs_code: v })}
              />
            </div>
            <div className="field">
              <label>Sale type</label>
              <select value={draft.sale_type} onChange={setD('sale_type')}>
                {SALE_TYPE_VALUES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Rate</label>
              <input value={draft.rate} onChange={setD('rate')} placeholder="18%" />
            </div>
            <div className="field">
              <label>UOM</label>
              <input value={draft.uom} onChange={setD('uom')} placeholder="Numbers, pieces, units" />
            </div>
            <div className="field">
              <label>
                Quantity
                <Req />
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={draft.quantity}
                onChange={setD('quantity')}
                placeholder="2"
              />
            </div>
            <div className="field">
              <label>
                Unit price
                <Req />
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={draft.unit_price}
                onChange={setD('unit_price')}
                placeholder="150000"
              />
            </div>
          </div>

          <h4 className="section-title" style={{ fontSize: '0.85rem', marginTop: 14 }}>
            Other taxes &amp; charges
          </h4>
          <p className="muted" style={{ margin: '0 0 12px' }}>
            All optional. Leave blank unless the sale actually carries these — a blank{' '}
            <code>sales tax</code> is worked out from the rate, everything else defaults to 0.
          </p>
          <div className="form-grid">
            <NumField
              label="Sales tax"
              hint="(blank = auto-calculate)"
              value={draft.sales_tax}
              onChange={setD('sales_tax')}
              placeholder="auto"
            />
            <NumField label="Discount" value={draft.discount} onChange={setD('discount')} />
            <NumField label="Further tax" value={draft.further_tax} onChange={setD('further_tax')} />
            <NumField label="FED payable" value={draft.fed_payable} onChange={setD('fed_payable')} />
            <NumField label="Extra tax" value={draft.extra_tax} onChange={setD('extra_tax')} />
            <NumField
              label="Sales tax withheld at source"
              value={draft.sales_tax_withheld_at_source}
              onChange={setD('sales_tax_withheld_at_source')}
            />
            <NumField
              label="Total value"
              hint="(blank = auto-calculate)"
              value={draft.total_values}
              onChange={setD('total_values')}
              placeholder="auto"
            />
            <NumField label="Advance tax" value={draft.advance_tax} onChange={setD('advance_tax')} />
          </div>

          {showFixedValueFields && (
            <>
              <h4 className="section-title" style={{ fontSize: '0.85rem', marginTop: 14 }}>
                Retail price / SRO details
              </h4>
              <p className="muted" style={{ margin: '0 0 12px' }}>
                Fixed / notified value is for "3rd Schedule Goods" (taxed on that value instead of the
                sale price). An SRO / schedule no. is mandatory whenever the rate isn't 18%.
              </p>
              <div className="form-grid">
                <NumField
                  label="Fixed / notified value"
                  hint="(per unit — e.g. the MRP on one pack)"
                  value={draft.fixed_notified_value}
                  onChange={setD('fixed_notified_value')}
                  placeholder="1000"
                />
                <div className="field">
                  <label>SRO schedule no.</label>
                  <input value={draft.sro_schedule_no} onChange={setD('sro_schedule_no')} />
                </div>
                <div className="field">
                  <label>SRO item serial no.</label>
                  <input value={draft.sro_item_serial_no} onChange={setD('sro_item_serial_no')} />
                </div>
              </div>
            </>
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
                    <th>Description</th>
                    <th>HS code</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Sale type</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} style={{ background: editIndex === i ? 'var(--slate-50, #f7f9fb)' : undefined }}>
                      <td>{i + 1}</td>
                      <td>
                        <span className="strong">{it.product_description}</span>
                      </td>
                      <td className="mono">{it.hs_code}</td>
                      <td>{nfmt(it.quantity)}</td>
                      <td>{nfmt(it.unit_price)}</td>
                      <td>{it.sale_type}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <button className="btn btn-primary" disabled={busy} style={{ width: '100%', marginTop: 6 }}>
          {busy ? <Loader2 size={16} className="spin" /> : <ReceiptText size={16} />}
          {busy ? 'Submitting…' : 'Submit invoice'}
        </button>
      </form>
    </Modal>
  )
}
