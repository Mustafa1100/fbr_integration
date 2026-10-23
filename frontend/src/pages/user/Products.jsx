import { useEffect, useState } from 'react'
import { AlertCircle, Calculator, Loader2, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../api'
import { SALE_TYPE_VALUES } from '../../data/columnGuide'
import HsCodePicker from '../../components/HsCodePicker'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import TableLoader from '../../components/TableLoader'
import usePageTitle from '../../hooks/usePageTitle'

// Per-pack amounts. Blank sales_tax / total_values = auto-calculate (null);
// blank for the rest = 0.
const CHARGE_FIELDS = [
  'sales_tax',
  'discount',
  'further_tax',
  'fed_payable',
  'extra_tax',
  'st_withheld',
  'total_values',
  'advance_tax',
]
const AUTO_FIELDS = ['sales_tax', 'total_values']

function emptyProduct() {
  return {
    description: '',
    hs_code: '',
    uom: '',
    pack_size: '',
    unit_price: '',
    rate: '',
    sale_type: 'Goods at standard rate (default)',
    scenario_id: '',
    fixed_notified_value: '',
    sro_schedule_no: '',
    sro_item_serial_no: '',
    ...Object.fromEntries(CHARGE_FIELDS.map((f) => [f, ''])),
  }
}

function NumField({ label, hint, value, onChange, placeholder = '0' }) {
  return (
    <div className="field">
      <label>
        {label} {hint && <span className="hint">{hint}</span>}
      </label>
      <input type="number" step="any" min="0" value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  )
}

function Req() {
  return (
    <span style={{ color: 'var(--red-600)' }} aria-label="required">
      {' '}
      *
    </span>
  )
}

const nfmt = (v) => Number(v || 0).toLocaleString()
// One input for a custom field (Settings → Invoice Settings), by its type.
function CustomFieldInput({ field, value, onChange }) {
  const handle = (e) => onChange(e.target.value)
  if (field.type === 'yes_no')
    return (
      <select value={value} onChange={handle}>
        <option value="">—</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    )
  if (field.type === 'number')
    return <input type="number" step="any" value={value} onChange={handle} placeholder="0" />
  if (field.type === 'date') return <input type="date" value={value} onChange={handle} />
  return <input value={value} onChange={handle} />
}

function ProductModal({ product, uoms, scenarios, customFields, onClose, onSaved }) {
  const isEdit = !!product.id
  const [form, setForm] = useState(() => ({
    ...emptyProduct(),
    ...product,
    custom_fields: product.custom_fields || {},
    fixed_notified_value: product.fixed_notified_value || '',
    // Show 0 / null amounts as blank so the "auto" / "0" placeholders read right.
    ...Object.fromEntries(CHARGE_FIELDS.map((f) => [f, product[f] || ''])),
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [calcOpen, setCalcOpen] = useState(false) // optional unit-price calculator
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const unitLabel = form.uom || 'unit'
  const showFixedValueFields =
    form.sale_type === '3rd Schedule Goods' ||
    (form.rate.trim() !== '' && !/18\s*%/.test(form.rate))

  async function save(e) {
    e.preventDefault()
    if (!form.hs_code.trim()) {
      setError('Pick an HS code.')
      return
    }
    setError('')
    setBusy(true)
    const body = {
      ...form,
      pack_size: Number(form.pack_size),
      unit_price: Number(form.unit_price),
      fixed_notified_value: Number(form.fixed_notified_value || 0),
      ...Object.fromEntries(
        CHARGE_FIELDS.map((f) => [
          f,
          form[f] === '' ? (AUTO_FIELDS.includes(f) ? null : 0) : Number(form[f]),
        ])
      ),
    }
    delete body.id
    delete body.created_at
    try {
      const saved = isEdit
        ? await api.put(`/api/products/${product.id}`, body)
        : await api.post('/api/products', body)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <Modal title={isEdit ? 'Edit product' : 'Add a product'} onClose={() => !busy && onClose()} width={760}>
      <form onSubmit={save}>
        {error && (
          <div className="alert error">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}
        <div className="form-grid">
          <div className="field">
            <label>
              Description
              <Req />
            </label>
            <input value={form.description} onChange={set('description')} placeholder="Product name and size" required />
          </div>
          <div className="field">
            <label>
              HS code
              <Req />
            </label>
            <HsCodePicker value={form.hs_code} onChange={(v) => setForm({ ...form, hs_code: v })} />
          </div>
          <div className="field">
            <label>
              UOM
              <Req />
            </label>
            {/* Free text; the datalist only suggests FBR's known UOM names. */}
            <input
              value={form.uom}
              onChange={set('uom')}
              list="uom-suggestions"
              placeholder="e.g. KG, Numbers, pieces, units"
              required
            />
            <datalist id="uom-suggestions">
              {uoms.map((u) => (
                <option key={u.uoM_ID} value={u.description} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>
              Quantity <span className="hint">({unitLabel} in a single product)</span>
              <Req />
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={form.pack_size}
              onChange={set('pack_size')}
              placeholder="0"
              required
            />
          </div>
          <div className="field">
            <label>
              Unit price <span className="hint">(per {unitLabel}, excl. sales tax)</span>
              <Req />
            </label>
            <div className="row-actions" style={{ gap: 6 }}>
              <input
                type="number"
                step="any"
                min="0"
                value={form.unit_price}
                onChange={set('unit_price')}
                placeholder="0"
                required
              />
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setCalcOpen(true)}
                title="Work the unit price out from the price of one product including tax"
                style={{ whiteSpace: 'nowrap' }}
              >
                <Calculator size={14} /> Calculate
              </button>
            </div>
          </div>
          <div className="field">
            <label>
              Rate
              <Req />
            </label>
            <input value={form.rate} onChange={set('rate')} placeholder="e.g. 18%, 5%, Exempt" required />
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
            <label>
              Test scenario <span className="hint">(sandbox only)</span>
            </label>
            <select value={form.scenario_id} onChange={set('scenario_id')}>
              <option value="">Use account default…</option>
              {scenarios.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {customFields.length > 0 && (
          <div className="form-grid">
            {customFields.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <CustomFieldInput
                  field={f}
                  value={form.custom_fields[f.key] ?? ''}
                  onChange={(v) => setForm({ ...form, custom_fields: { ...form.custom_fields, [f.key]: v } })}
                />
              </div>
            ))}
          </div>
        )}

        {form.pack_size > 0 && form.unit_price !== '' && (
          <p className="muted" style={{ margin: '4px 0 12px' }}>
            A single product = {nfmt(form.pack_size)} {unitLabel} × Rs {nfmt(form.unit_price)} ={' '}
            <b>Rs {nfmt(Number(form.pack_size) * Number(form.unit_price))}</b> before tax.
          </p>
        )}

        <h4 className="section-title" style={{ fontSize: '0.85rem', marginTop: 14 }}>
          Other taxes &amp; charges <span className="hint">(for a single product)</span>
        </h4>
        <p className="muted" style={{ margin: '0 0 12px' }}>
          All optional. Enter the amounts for one product — on the invoice they&apos;re multiplied by
          the number of products sold. A blank <code>sales tax</code> or <code>total value</code> is
          worked out automatically, everything else defaults to 0. Discount and advance tax can still be
          changed on each invoice.
        </p>
        <div className="form-grid">
          <NumField
            label="Sales tax"
            hint="(blank = auto-calculate)"
            value={form.sales_tax}
            onChange={set('sales_tax')}
            placeholder="auto"
          />
          <NumField label="Discount" value={form.discount} onChange={set('discount')} />
          <NumField label="Further tax" value={form.further_tax} onChange={set('further_tax')} />
          <NumField label="FED payable" value={form.fed_payable} onChange={set('fed_payable')} />
          <NumField label="Extra tax" value={form.extra_tax} onChange={set('extra_tax')} />
          <NumField
            label="Sales tax withheld at source"
            value={form.st_withheld}
            onChange={set('st_withheld')}
          />
          <NumField
            label="Total value"
            hint="(blank = auto-calculate)"
            value={form.total_values}
            onChange={set('total_values')}
            placeholder="auto"
          />
          <NumField label="Advance tax" value={form.advance_tax} onChange={set('advance_tax')} />
        </div>

        {showFixedValueFields && (
          <>
            <h4 className="section-title" style={{ fontSize: '0.85rem', marginTop: 14 }}>
              Retail price / SRO details
            </h4>
            <p className="muted" style={{ margin: '0 0 12px' }}>
              Fixed / notified value is for "3rd Schedule Goods" (taxed on that value instead of the sale
              price). An SRO / schedule no. is mandatory whenever the rate isn't 18%.
            </p>
            <div className="form-grid">
              <div className="field">
                <label>
                  Fixed / notified value <span className="hint">(per {form.uom})</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={form.fixed_notified_value}
                  onChange={set('fixed_notified_value')}
                  placeholder="0"
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
          {busy ? <Loader2 size={16} className="spin" /> : isEdit ? <Pencil size={16} /> : <Plus size={16} />}
          {busy ? 'Saving…' : isEdit ? 'Update product' : 'Save product'}
        </button>
      </form>
    </Modal>
    {/* After the form so it opens on top of it (a separate <form>, not nested). */}
    {calcOpen && (
      <UnitPriceCalculator
        quantity={form.pack_size}
        rate={form.rate}
        unitLabel={unitLabel}
        onUse={(unitPrice) => {
          setForm({ ...form, unit_price: unitPrice })
          setCalcOpen(false)
        }}
        onClose={() => setCalcOpen(false)}
      />
    )}
    </>
  )
}

export default function Products() {
  usePageTitle('Products')
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uoms, setUoms] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [customFields, setCustomFields] = useState([])
  const [editing, setEditing] = useState(null) // null | {} (new) | product
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function refresh() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      const resp = await api.getRaw(`/api/products?${params}`)
      const rows = await resp.json()
      const count = Number(resp.headers.get('x-total-count') || 0)
      // Deleting the last product on a page leaves it empty — step back one.
      if (rows.length === 0 && page > 1) {
        setPage(page - 1)
        return
      }
      setProducts(rows)
      setTotal(count)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize])

  useEffect(() => {
    api.get('/api/reference/uoms').then(setUoms).catch(() => {})
    api.get('/api/uploads/scenario-catalog').then(setScenarios).catch(() => {})
    api
      .get('/api/settings/invoice-layout')
      .then((d) => setCustomFields(d.layout.custom_fields))
      .catch(() => {})
  }, [])

  async function remove(p) {
    try {
      await api.delete(`/api/products/${p.id}`)
      setConfirmDelete(null)
      refresh()
    } catch (e) {
      setError(e.message)
      setConfirmDelete(null)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Package size={22} /> Products
          </h1>
          <p className="page-sub">
            Save each product once with its FBR details and the quantity in a single product (e.g. 50 KG
            in one bag). On a single invoice you just pick the product and enter how many you sold — FBR
            gets that number × the product&apos;s quantity.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus size={16} /> Add product
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {loading && <TableLoader label="products" />}

      {!loading && products.length === 0 && (
        <div className="table-card">
          <div className="empty-state">
            <Package size={40} />
            <div className="title">No products yet</div>
            <div className="hint">Add your first product to use it on single invoices.</div>
          </div>
        </div>
      )}

      {!loading && products.length > 0 && (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>HS code</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Rate</th>
                <th>Sale type</th>
                <th>Scenario</th>
                {customFields.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="strong">{p.description}</span>
                  </td>
                  <td className="mono">{p.hs_code}</td>
                  <td>
                    {nfmt(p.pack_size)} {p.uom}
                  </td>
                  <td>
                    Rs {nfmt(p.unit_price)} / {p.uom}
                  </td>
                  <td>{p.rate}</td>
                  <td>{p.sale_type}</td>
                  <td className="mono">{p.scenario_id || '—'}</td>
                  {customFields.map((f) => {
                    const v = p.custom_fields?.[f.key]
                    return <td key={f.key}>{v == null || v === '' ? '—' : f.type === 'number' ? nfmt(v) : v}</td>
                  })}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm has-tip"
                      onClick={() => setEditing(p)}
                      data-tip="Edit"
                      aria-label="Edit product"
                    >
                      <Pencil size={14} />
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm has-tip"
                      onClick={() => setConfirmDelete(p)}
                      data-tip="Delete"
                      aria-label="Delete product"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > 0 && (
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n)
            setPage(1)
          }}
          itemLabel="products"
        />
      )}

      {editing && (
        <ProductModal
          product={editing}
          uoms={uoms}
          scenarios={scenarios}
          customFields={customFields}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}

      {confirmDelete && (
        <Modal title="Delete product?" onClose={() => setConfirmDelete(null)} width={400}>
          <p className="muted" style={{ margin: '0 0 20px' }}>
            <b>{confirmDelete.description}</b> will no longer appear in the invoice dropdown. Invoices
            already submitted are not affected.
          </p>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={() => remove(confirmDelete)}>
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
