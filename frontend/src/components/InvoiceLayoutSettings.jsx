import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Columns3,
  Eye,
  ListPlus,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  Sigma,
  Trash2,
} from 'lucide-react'
import { api } from '../api'
import Modal from './Modal'
import ReceiptDocument from './ReceiptDocument'

const CUSTOM_PREFIX = 'cf:'

// "Trader Price" -> "trader_price": the suggested CSV column name.
function slugify(label) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return /^[a-z]/.test(slug) ? slug : slug ? `f_${slug}`.slice(0, 40) : ''
}

// Mirror of the backend's normalize(): drop columns of removed custom fields,
// append new ones (visible), and keep labels current. A column's `heading` is
// the user's rename ('' = none); `label` is what prints: heading, else the
// default_label (built-in name / custom field name).
function syncColumns(columns, fields) {
  const labels = Object.fromEntries(fields.map((f) => [CUSTOM_PREFIX + f.key, f.label]))
  const kept = columns.filter((c) => !c.key.startsWith(CUSTOM_PREFIX) || labels[c.key] !== undefined)
  const have = new Set(kept.map((c) => c.key))
  const added = fields
    .filter((f) => f.key && !have.has(CUSTOM_PREFIX + f.key))
    .map((f) => ({ key: CUSTOM_PREFIX + f.key, visible: true, heading: '' }))
  return [...kept, ...added].map((c) => {
    const defaultLabel = c.key.startsWith(CUSTOM_PREFIX)
      ? labels[c.key] || c.key.slice(3)
      : c.default_label
    return { ...c, default_label: defaultLabel, label: c.heading.trim() || defaultLabel }
  })
}

// Server layout -> editing state (each row's rename split out as `heading`).
function toEditable(layout) {
  const editable = (rows) =>
    rows.map((r) => ({ ...r, heading: r.label !== r.default_label ? r.label : '' }))
  return { ...layout, columns: editable(layout.columns), totals: editable(layout.totals) }
}

// Editing state -> what the API stores (an empty label = the default name).
const forSave = (rows) =>
  rows.map(({ key, visible, heading }) => ({ key, visible, label: heading.trim() }))

// Totals rows print `heading || default_label`; columns get this via syncColumns.
const withLabels = (rows) => rows.map((r) => ({ ...r, label: r.heading.trim() || r.default_label }))

// A list of rows (invoice columns, totals) to tick, rename and reorder.
// `fixed` rows (the first / last totals) can be renamed but not hidden or
// moved, and nothing can be moved past them.
function RowList({ rows, onChange, describe }) {
  const set = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const lo = rows[0]?.fixed ? 1 : 0
  const hi = rows[rows.length - 1]?.fixed ? rows.length - 2 : rows.length - 1
  function move(i, delta) {
    const j = i + delta
    if (j < lo || j > hi) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="table-card">
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td style={{ width: 32 }}>
                <input
                  type="checkbox"
                  className="select-check"
                  checked={r.visible}
                  disabled={r.fixed}
                  aria-label={`Show ${r.label}`}
                  onChange={() => set(i, { visible: !r.visible })}
                />
              </td>
              <td>
                {/* The name that prints; blank = the default name. */}
                <input
                  value={r.heading}
                  placeholder={r.default_label || '(unnamed field)'}
                  aria-label={`Name for ${r.default_label}`}
                  maxLength={60}
                  disabled={!r.visible}
                  onChange={(e) => set(i, { heading: e.target.value })}
                />
                <div className="hint" style={{ marginTop: 3, fontSize: '0.75rem' }}>
                  {r.heading.trim() && <>Original: {r.default_label} </>}
                  {describe?.(r)}
                </div>
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {r.fixed ? (
                  <span className="badge draft">{i === 0 ? 'always first' : 'always last'}</span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => move(i, -1)}
                      disabled={i <= lo}
                      aria-label="Move up"
                    >
                      <ArrowUp size={14} />
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => move(i, 1)}
                      disabled={i >= hi}
                      aria-label="Move down"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const SAMPLE_VALUES = { text: 'Sample', number: '4650', date: '2026-10-17', yes_no: 'Yes' }

// A stand-in QR so the preview shows where the real one will print.
const SAMPLE_QR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25" shape-rendering="crispEdges">' +
      '<rect width="25" height="25" fill="#fff"/>' +
      '<path d="M1 1h7v7H1zM17 1h7v7h-7zM1 17h7v7H1z" fill="#111"/>' +
      '<path d="M3 3h3v3H3zM19 3h3v3h-3zM3 19h3v3H3z" fill="#fff"/>' +
      '<path d="M10 2h2v2h-2zM13 5h2v3h-2zM10 10h5v2h-5zM17 11h3v2h-3zM11 15h2v4h-2zM15 17h4v2h-4zM20 20h3v3h-3zM14 21h3v2h-3z" fill="#111"/>' +
      '</svg>'
  )

function sampleInvoice(layout, seller) {
  const custom = Object.fromEntries(
    layout.custom_fields.filter((f) => f.key).map((f) => [f.key, SAMPLE_VALUES[f.type] || 'Sample'])
  )
  const line = (description, hs, qty, uom, price, rate, tax, discount = 0) => ({
    product_description: description,
    hs_code: hs,
    quantity: qty,
    uom,
    unit_price: price,
    rate,
    value_excl_st: qty * price,
    sales_tax: tax,
    further_tax: 0,
    fed_payable: 0,
    extra_tax: 0,
    discount,
    total_value: qty * price - discount + tax,
    fixed_notified_value: 0,
    sale_type: 'Goods at standard rate (default)',
    custom_fields: custom,
  })
  const items = [
    line('Sample product A', '3102.1000', 50, 'KG', 94, 'Exempt', 0, 200),
    line('Sample product B', '3105.3000', 2, 'Bag', 1000, '18%', 360),
  ]
  return {
    layout,
    seller: {
      business_name: seller?.seller_business_name || 'Your Business Name',
      ntn: seller?.seller_ntn || '1234567',
      ntn_cnic: seller?.seller_ntn_cnic || '1234512345671',
      strns: seller?.strns?.length ? [seller.strns[0]] : [{ strn: '3277876241802' }],
      address: seller?.seller_address || 'Business address',
      province: seller?.seller_province || 'Sindh',
      email: 'you@example.com',
    },
    invoice_type: 'Sale Invoice',
    invoice_date: '2026-10-17',
    pos_invoice_no: 'POS-1001',
    buyer_name: 'Sample Buyer',
    buyer_ntn_cnic: '4210112345671',
    buyer_registration_type: 'Unregistered',
    buyer_address: 'Buyer address',
    buyer_province: 'Sindh',
    fbr_invoice_number: '1234512345671DI1SAMPLE',
    qr: SAMPLE_QR,
    items,
    total_tax: 360,
    advance_tax: 0,
  }
}

export default function InvoiceLayoutSettings() {
  const [layout, setLayout] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [savedKeys, setSavedKeys] = useState(new Set()) // custom field keys already saved
  const [seller, setSeller] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [confirm, setConfirm] = useState(null) // null | 'save' | 'reset'
  const [savedFields, setSavedFields] = useState([])

  function load(data) {
    setLayout(toEditable(data.layout))
    setCatalog(data.catalog)
    setSavedFields(data.layout.custom_fields)
    setSavedKeys(new Set(data.layout.custom_fields.map((f) => f.key)))
  }

  useEffect(() => {
    api
      .get('/api/settings/invoice-layout')
      .then(load)
      .catch((e) => setError(e.message))
    api.get('/api/settings/fbr').then(setSeller).catch(() => {})
  }, [])

  if (!layout)
    return error ? (
      <div className="alert error">
        <AlertCircle size={17} />
        <span>{error}</span>
      </div>
    ) : (
      <div className="loading">
        <Loader2 size={18} className="spin" /> Loading…
      </div>
    )

  const update = (patch) => {
    setNotice('')
    setLayout((prev) => {
      const next = { ...prev, ...patch }
      return { ...next, columns: syncColumns(next.columns, next.custom_fields) }
    })
  }

  function setField(i, patch) {
    const fields = layout.custom_fields.map((f, idx) => {
      if (idx !== i) return f
      const next = { ...f, ...patch }
      // A new field's column name follows its name until edited by hand.
      if ('label' in patch && !savedKeys.has(f.key) && !f.keyEdited) next.key = slugify(patch.label)
      if ('key' in patch) next.keyEdited = true
      return next
    })
    update({ custom_fields: fields })
  }

  async function put(body, message) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      load(await api.put('/api/settings/invoice-layout', body))
      setNotice(message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  function save() {
    return put(
      {
        ...layout,
        custom_fields: layout.custom_fields.map(({ key, label, type }) => ({ key, label, type })),
        columns: forSave(layout.columns),
        totals: forSave(layout.totals),
      },
      'Invoice settings saved. They apply to every receipt, including past invoices.'
    )
  }

  // Back to the default columns, names, details and logo/QR positions. The
  // saved custom fields stay — removing those is a separate, explicit step.
  function reset() {
    return put({ custom_fields: savedFields }, 'Invoice settings reset to default.')
  }

  return (
    <>
      <div className="row-actions" style={{ gap: 8, marginBottom: '1.5rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirm('reset')} disabled={busy}>
          <RotateCcw size={16} /> Reset to default
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setShowPreview(true)}>
          <Eye size={16} /> Preview invoice
        </button>
        <button className="btn btn-primary" onClick={() => setConfirm('save')} disabled={busy}>
          <Save size={16} /> Save invoice settings
        </button>
      </div>

      {confirm && (
        <Modal
          title={confirm === 'save' ? 'Save invoice settings?' : 'Reset invoice settings?'}
          onClose={() => !busy && setConfirm(null)}
          width={460}
        >
          <div className="alert info" style={{ marginTop: 0 }}>
            <AlertCircle size={17} />
            <span>
              {confirm === 'save' ? (
                <>
                  These settings will apply to <strong>every receipt</strong>, including invoices
                  you&apos;ve already submitted, the next time they&apos;re viewed or printed.
                </>
              ) : (
                <>
                  Columns, column names, details to print and the logo / QR positions go back to the
                  default. Your saved custom fields are kept; any unsaved changes are lost.
                </>
              )}
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </button>
            <button
              className={`btn ${confirm === 'save' ? 'btn-primary' : 'btn-danger'}`}
              onClick={confirm === 'save' ? save : reset}
              disabled={busy}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : confirm === 'save' ? (
                <Save size={16} />
              ) : (
                <RotateCcw size={16} />
              )}
              {confirm === 'save' ? 'Save' : 'Reset to default'}
            </button>
          </div>
        </Modal>
      )}

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="alert ok">
          <CheckCircle2 size={17} />
          <span>{notice}</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          <ListPlus size={17} /> Custom fields
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Extra details per product, e.g. a trade price. Each field appears on the product form, as
          a column in the CSV / Excel template (under its column name), and as a column you can show
          on the invoice. They print on your receipt only — nothing extra is sent to FBR.
        </p>
        {layout.custom_fields.length > 0 && (
          <div className="table-card" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>CSV column name</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {layout.custom_fields.map((f, i) => {
                  const locked = savedKeys.has(f.key)
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          value={f.label}
                          onChange={(e) => setField(i, { label: e.target.value })}
                          placeholder="Trader Price"
                        />
                      </td>
                      <td>
                        <input
                          className="mono"
                          value={f.key}
                          onChange={(e) => setField(i, { key: e.target.value.toLowerCase() })}
                          placeholder="trade_price"
                          disabled={locked}
                          title={
                            locked
                              ? "Can't be renamed once saved — existing values are stored under it"
                              : undefined
                          }
                        />
                      </td>
                      <td>
                        <select value={f.type} onChange={(e) => setField(i, { type: e.target.value })}>
                          {catalog.field_types.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm has-tip"
                          data-tip="Remove field"
                          aria-label="Remove field"
                          onClick={() =>
                            update({ custom_fields: layout.custom_fields.filter((_, idx) => idx !== i) })
                          }
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
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            update({ custom_fields: [...layout.custom_fields, { label: '', key: '', type: 'text' }] })
          }
        >
          <Plus size={14} /> Add field
        </button>
      </div>

      <div className="form-grid" style={{ gap: '0 1.5rem', alignItems: 'start' }}>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            <Columns3 size={17} /> Invoice columns
          </h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Tick the columns to print, rename a heading by typing over it, and use the arrows to set
            the order (top = leftmost). Clear a heading to go back to its original name.
          </p>
          <RowList
            rows={layout.columns}
            onChange={(columns) => update({ columns })}
            describe={(c) => (
              <>
                {c.key.startsWith(CUSTOM_PREFIX) && <span className="badge info">custom</span>}
                {c.key === 'discount' && <> Only shown when an invoice has a discount.</>}
              </>
            )}
          />
        </div>

        <div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>
              <Sigma size={17} /> Totals
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              The box under the products. Rename, reorder or hide the rows in between; the taxes
              exclusive value is always first and the taxes inclusive value always last (in bold).
              A hidden row still counts towards the inclusive value.
            </p>
            <RowList rows={layout.totals} onChange={(totals) => update({ totals: withLabels(totals) })} />
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>
              <Eye size={17} /> Details to print
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Business name, invoice type, date, buyer name and the FBR invoice number always print.
            </p>
            {catalog.header_fields.map((h) => (
              <label key={h.key} className="check-row">
                <input
                  type="checkbox"
                  className="select-check"
                  checked={layout.header[h.key]}
                  onChange={() => update({ header: { ...layout.header, [h.key]: !layout.header[h.key] } })}
                />
                {h.label}
              </label>
            ))}
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>
              <MapPin size={17} /> FBR logo &amp; QR code
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              FBR requires both on every receipt, so they can be moved but not hidden. They always
              sit together.
            </p>
            <div className="field">
              <label>Logo &amp; QR position</label>
              <select
                value={layout.logo_position}
                onChange={(e) => update({ logo_position: e.target.value, qr_position: e.target.value })}
              >
                {catalog.positions.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {showPreview && (
        <Modal title="Invoice preview" onClose={() => setShowPreview(false)} width="min(1400px, 96vw)">
          <p className="muted" style={{ marginTop: 0 }}>
            Sample data, using your current settings (including any you haven&apos;t saved yet).
          </p>
          <ReceiptDocument inv={sampleInvoice(layout, seller)} />
        </Modal>
      )}
    </>
  )
}
