import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Contact,
  Download,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { api } from '../../api'
import ImportCustomersModal, { downloadCustomersTemplate } from '../../components/ImportCustomersModal'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import TableLoader from '../../components/TableLoader'
import usePageTitle from '../../hooks/usePageTitle'

// "SINDH" -> "Sindh", as the single-invoice form shows provinces.
export const provinceName = (p) =>
  p.stateProvinceDesc.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

function emptyCustomer() {
  return {
    name: '',
    ntn_cnic: '',
    registration_type: 'Unregistered',
    province: '',
    address: '',
    strn: '',
  }
}

function CustomerModal({ customer, provinces, packPricing, onClose, onSaved }) {
  const isEdit = !!customer.id
  const [form, setForm] = useState({ ...emptyCustomer(), ...customer })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  // FBR registration check for the NTN / CNIC: '' | 'checking' | 'Registered'
  // | 'Unregistered' | 'unknown'. Sets the registration type when FBR answers.
  const [check, setCheck] = useState('')
  const checkedFor = useRef('')

  async function checkRegistration() {
    const number = form.ntn_cnic.replace(/\D/g, '')
    if (![7, 8, 9, 13].includes(number.length)) {
      setCheck('')
      return
    }
    if (number === checkedFor.current) return
    checkedFor.current = number
    setCheck('checking')
    try {
      const { registration_type: type } = await api.get(
        `/api/customers/registration-type?number=${number}`
      )
      if (checkedFor.current !== number) return // number changed meanwhile
      if (type) {
        setForm((f) => ({ ...f, registration_type: type }))
        setCheck(type)
      } else {
        setCheck('unknown')
      }
    } catch {
      if (checkedFor.current === number) setCheck('unknown')
    }
  }

  // FBR said one type but the user picked the other: ask before saving.
  const [confirmType, setConfirmType] = useState(false)
  const fbrSaid = check === 'Registered' || check === 'Unregistered' ? check : ''

  async function save(e, confirmed = false) {
    e?.preventDefault()
    if (!confirmed && fbrSaid && fbrSaid !== form.registration_type) {
      setConfirmType(true)
      return
    }
    setConfirmType(false)
    setError('')
    setBusy(true)
    const body = {
      name: form.name,
      ntn_cnic: form.ntn_cnic,
      registration_type: form.registration_type,
      province: form.province,
      address: form.address,
      strn: form.strn,
    }
    try {
      const saved = isEdit
        ? await api.put(`/api/customers/${customer.id}`, body)
        : await api.post('/api/customers', body)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Edit customer' : 'Add a customer'} onClose={() => !busy && onClose()} width={640}>
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
              Buyer name <span style={{ color: 'var(--red-600)' }}>*</span>
            </label>
            <input value={form.name} onChange={set('name')} maxLength={200} required autoFocus />
          </div>
          <div className="field">
            <label>Registration type</label>
            <select value={form.registration_type} onChange={set('registration_type')}>
              <option value="Unregistered">Unregistered</option>
              <option value="Registered">Registered</option>
            </select>
          </div>
          <div className="field">
            <label>
              Buyer NTN / CNIC{' '}
              <span className="hint">
                {form.registration_type === 'Registered' ? '(needed for a registered buyer)' : '(optional)'}
              </span>
            </label>
            <input
              value={form.ntn_cnic}
              onChange={(e) => {
                // Numbers only: dashes / spaces are dropped as typed or pasted.
                setForm({ ...form, ntn_cnic: e.target.value.replace(/\D/g, '') })
                checkedFor.current = ''
                setCheck('')
              }}
              onBlur={checkRegistration}
              inputMode="numeric"
              maxLength={13}
              placeholder="Numbers only, no dashes"
            />
            {check && (
              <div className="hint" style={{ marginTop: 4, fontSize: '0.78rem' }}>
                {check === 'checking' && (
                  <>
                    <Loader2 size={12} className="spin" /> Checking with FBR…
                  </>
                )}
                {(check === 'Registered' || check === 'Unregistered') && (
                  <span style={{ color: 'var(--brand-600)' }}>
                    <CheckCircle2 size={12} /> FBR: {check}
                  </span>
                )}
                {check === 'unknown' && <>Couldn&apos;t check with FBR. Choose the registration type yourself.</>}
              </div>
            )}
          </div>
          <div className="field">
            <label>Province</label>
            <select value={form.province} onChange={set('province')}>
              <option value="">Select…</option>
              {provinces.map((p) => (
                <option key={p.stateProvinceCode} value={provinceName(p)}>
                  {provinceName(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Address</label>
            <input value={form.address} onChange={set('address')} maxLength={300} />
          </div>
          {packPricing && (
            <div className="field">
              <label>
                Buyer STRN <span className="hint">(optional)</span>
              </label>
              <input value={form.strn} onChange={set('strn')} maxLength={20} />
            </div>
          )}
        </div>
        {confirmType && fbrSaid && fbrSaid !== form.registration_type && (
          <div className="alert warn">
            <AlertCircle size={17} />
            <span>
              FBR shows this buyer as <b>{fbrSaid}</b>, but you selected{' '}
              <b>{form.registration_type}</b>. Do you want to proceed with{' '}
              {form.registration_type}?{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setForm((f) => ({ ...f, registration_type: fbrSaid }))
                  setConfirmType(false)
                }}
              >
                Change to {fbrSaid}
              </button>
            </span>
          </div>
        )}
        <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {confirmType && fbrSaid && fbrSaid !== form.registration_type ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save(null, true)}>
              {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Proceed with{' '}
              {form.registration_type}
            </button>
          ) : (
            <button className="btn btn-primary" disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save customer
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}

export default function Customers() {
  usePageTitle('Customers')
  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [provinces, setProvinces] = useState([])
  const [packPricing, setPackPricing] = useState(false)
  const [editing, setEditing] = useState(null) // null | {} (new) | customer
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0) // count from the last import, for the message

  async function refresh() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      const resp = await api.getRaw(`/api/customers?${params}`)
      const rows = await resp.json()
      const count = Number(resp.headers.get('x-total-count') || 0)
      // Deleting the last customer on a page leaves it empty — step back one.
      if (rows.length === 0 && page > 1) {
        setPage(page - 1)
        return
      }
      setCustomers(rows)
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
    api.get('/api/reference/provinces').then(setProvinces).catch(() => {})
    api
      .get('/api/settings/fbr')
      .then((s) => setPackPricing(!!s.pack_pricing))
      .catch(() => {})
  }, [])

  async function remove(c) {
    try {
      await api.delete(`/api/customers/${c.id}`)
      setConfirmDelete(null)
      refresh()
    } catch (e) {
      setError(e.message)
      setConfirmDelete(null)
    }
  }

  const dash = (v) => v || '—'

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Contact size={22} /> Customers
          </h1>
          <p className="page-sub">
            Save your buyers once. On a single invoice, pick one to fill in the buyer details.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => downloadCustomersTemplate().catch((e) => setError(e.message))}
          >
            <Download size={16} /> Download template
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setImporting(true)}>
            <UploadCloud size={16} /> Import customers
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus size={16} /> Add customer
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {imported > 0 && (
        <div className="alert ok">
          <CheckCircle2 size={17} />
          <span>
            {imported.toLocaleString()} customer{imported === 1 ? '' : 's'} added.
          </span>
        </div>
      )}

      {importing && (
        <ImportCustomersModal
          onClose={() => setImporting(false)}
          onImported={(n) => {
            setImporting(false)
            setImported(n)
            if (page === 1) refresh()
            else setPage(1)
          }}
        />
      )}

      {loading && <TableLoader label="customers" />}

      {!loading && customers.length === 0 && (
        <div className="table-card">
          <div className="empty-state">
            <Contact size={40} />
            <div className="title">No customers yet</div>
            <div className="hint">Add your first customer to pick it on single invoices.</div>
          </div>
        </div>
      )}

      {!loading && customers.length > 0 && (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Buyer name</th>
                <th>NTN / CNIC</th>
                <th>Registration</th>
                <th>Province</th>
                <th>Address</th>
                {packPricing && <th>STRN</th>}
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="strong">{c.name}</span>
                  </td>
                  <td className="mono">{dash(c.ntn_cnic)}</td>
                  <td>{c.registration_type}</td>
                  <td>{dash(c.province)}</td>
                  <td>{dash(c.address)}</td>
                  {packPricing && <td className="mono">{dash(c.strn)}</td>}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm has-tip"
                      onClick={() => setEditing(c)}
                      data-tip="Edit"
                      aria-label="Edit customer"
                    >
                      <Pencil size={14} />
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm has-tip"
                      onClick={() => setConfirmDelete(c)}
                      data-tip="Delete"
                      aria-label="Delete customer"
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
          itemLabel="customers"
        />
      )}

      {editing && (
        <CustomerModal
          customer={editing}
          provinces={provinces}
          packPricing={packPricing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}

      {confirmDelete && (
        <Modal title="Delete customer?" onClose={() => setConfirmDelete(null)} width={400}>
          <p className="muted" style={{ margin: '0 0 20px' }}>
            <b>{confirmDelete.name}</b> will no longer appear in the single-invoice list. Invoices
            already made are not affected.
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
