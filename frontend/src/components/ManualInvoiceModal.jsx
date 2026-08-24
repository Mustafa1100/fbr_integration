import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, ReceiptText } from 'lucide-react'
import { api } from '../api'
import { SALE_TYPE_VALUES } from '../data/columnGuide'
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
]

function csvField(value) {
  const s = String(value ?? '').trim()
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCsv(form) {
  const row = CSV_COLUMNS.map((c) => csvField(form[c]))
  return `${CSV_COLUMNS.join(',')}\n${row.join(',')}\n`
}

function emptyForm() {
  return {
    pos_invoice_no: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    buyer_ntn_cnic: '',
    buyer_name: '',
    buyer_province: '',
    buyer_address: '',
    buyer_registration_type: 'Unregistered',
    product_description: '',
    hs_code: '',
    rate: '18%',
    uom: 'Numbers, pieces, units',
    quantity: '',
    unit_price: '',
    sale_type: 'Goods at standard rate (default)',
    scenario_id: '',
    fixed_notified_value: '',
    sro_schedule_no: '',
    sro_item_serial_no: '',
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

// One product line, entered by hand instead of uploaded as a file — reuses
// the exact same upload pipeline as a bulk CSV/Excel file: build a one-row
// CSV client-side and POST it through POST /api/uploads, so it gets 100% of
// the existing validation, FBR submission, and error messages for free.
export default function ManualInvoiceModal({ onClose, onSubmitted, isProduction, scenarios }) {
  const [form, setForm] = useState(emptyForm)
  const [provinces, setProvinces] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/reference/provinces').then(setProvinces).catch(() => {})
  }, [])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const showFixedValueFields = form.sale_type === '3rd Schedule Goods'

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const csv = buildCsv(form)
      const filename = `manual-${form.pos_invoice_no || Date.now()}.csv`
      const formData = new FormData()
      formData.append('file', new Blob([csv], { type: 'text/csv' }), filename)
      const result = await api.upload('/api/uploads', formData)
      onSubmitted(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Enter a single invoice" onClose={() => !busy && onClose()} width={720}>
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
              value={form.pos_invoice_no}
              onChange={set('pos_invoice_no')}
              placeholder="POS-1001"
              required
            />
          </div>
          <div className="field">
            <label>
              Invoice date
              <Req />
            </label>
            <input type="date" value={form.invoice_date} onChange={set('invoice_date')} required />
          </div>
          {!isProduction && scenarios?.length > 0 && (
            <div className="field">
              <label>Sandbox scenario</label>
              <select value={form.scenario_id} onChange={set('scenario_id')}>
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
            <select value={form.buyer_registration_type} onChange={set('buyer_registration_type')}>
              <option value="Unregistered">Unregistered</option>
              <option value="Registered">Registered</option>
            </select>
          </div>
          <div className="field">
            <label>
              Buyer NTN / CNIC{' '}
              <span className="hint">
                {form.buyer_registration_type === 'Registered' ? '(required for a registered buyer)' : '(optional)'}
              </span>
            </label>
            <input value={form.buyer_ntn_cnic} onChange={set('buyer_ntn_cnic')} placeholder="1234567" />
          </div>
          <div className="field">
            <label>Buyer name</label>
            <input
              value={form.buyer_name}
              onChange={set('buyer_name')}
              placeholder="Walk-in Customer"
            />
          </div>
          <div className="field">
            <label>Province</label>
            <select value={form.buyer_province} onChange={set('buyer_province')}>
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
            <input value={form.buyer_address} onChange={set('buyer_address')} placeholder="Karachi" />
          </div>
        </div>

        <h3 className="section-title">Product</h3>
        <div className="form-grid">
          <div className="field">
            <label>
              Description
              <Req />
            </label>
            <input
              value={form.product_description}
              onChange={set('product_description')}
              placeholder="Laptop Computer 15 inch"
              required
            />
          </div>
          <div className="field">
            <label>HS code</label>
            <input value={form.hs_code} onChange={set('hs_code')} placeholder="8471.3010" />
          </div>
          <div className="field">
            <label>Sale type</label>
            <select value={form.sale_type} onChange={set('sale_type')}>
              {SALE_TYPE_VALUES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Rate</label>
            <input value={form.rate} onChange={set('rate')} placeholder="18%" />
          </div>
          <div className="field">
            <label>UOM</label>
            <input value={form.uom} onChange={set('uom')} placeholder="Numbers, pieces, units" />
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
              value={form.quantity}
              onChange={set('quantity')}
              placeholder="2"
              required
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
              value={form.unit_price}
              onChange={set('unit_price')}
              placeholder="150000"
              required
            />
          </div>
        </div>

        {showFixedValueFields && (
          <>
            <h3 className="section-title">3rd Schedule / retail-price details</h3>
            <p className="muted" style={{ margin: '0 0 12px' }}>
              Only needed for "3rd Schedule Goods" — the sale is taxed on this notified value
              instead of the sale price above.
            </p>
            <div className="form-grid">
              <div className="field">
                <label>Fixed / notified value</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={form.fixed_notified_value}
                  onChange={set('fixed_notified_value')}
                  placeholder="1000"
                />
              </div>
              <div className="field">
                <label>SRO schedule no.</label>
                <input value={form.sro_schedule_no} onChange={set('sro_schedule_no')} />
              </div>
              <div className="field">
                <label>SRO item serial no.</label>
                <input value={form.sro_item_serial_no} onChange={set('sro_item_serial_no')} />
              </div>
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
