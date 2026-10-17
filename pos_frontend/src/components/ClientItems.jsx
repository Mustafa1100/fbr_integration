import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, money } from '../api.js'
import Modal from './Modal.jsx'
import Pagination, { PAGE_SIZES } from './Pagination.jsx'
import RequestList from './RequestList.jsx'

// A client's items. The client can only request changes from their computer;
// here the admin edits directly and is the only one who can set the tax
// rate, PCT code and 3rd Schedule flag.
export default function ClientItems({ clientId, items, defaults, onChanged }) {
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const url = `/api/admin/clients/${clientId}/items`

  const blank = {
    code: '',
    name: '',
    price: 0,
    tax_rate: defaults.default_tax_rate,
    pct_code: defaults.default_pct_code,
    third_schedule: false,
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    const body = {
      ...editing,
      price: Number(editing.price) || 0,
      tax_rate: Number(editing.tax_rate) || 0,
    }
    try {
      if (editing.id) await api.put(`${url}/${editing.id}`, body)
      else await api.post(url, body)
      setEditing(null)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete "${item.name}"? It disappears from the client's computer at its next refresh.`)) return
    setError('')
    try {
      await api.delete(`${url}/${item.id}`)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  const set = (patch) => setEditing({ ...editing, ...patch })
  const lastPage = Math.max(Math.ceil(items.length / pageSize) - 1, 0)
  const shownPage = Math.min(page, lastPage)
  const visible = items.slice(shownPage * pageSize, (shownPage + 1) * pageSize)

  return (
    <section className="card">
      <div className="page-head">
        <h2>Items</h2>
        <button type="button" className="btn ghost" onClick={() => { setError(''); setEditing(blank) }}>
          <Plus size={16} /> Add item
        </button>
      </div>
      <p className="muted">
        The client can only request new items, changes and deletions; they wait here for your
        approval. Only you set the tax rate and PCT code, when approving or by editing an item
        here. Changes reach their computer at its next refresh.
      </p>
      {error && !editing && <div className="alert error">{error}</div>}

      {/* Waiting requests from this client; hidden when there are none. */}
      <RequestList clientId={clientId} onDecided={onChanged} emptyText={null} />

      <div className="table-card inner">
        <table className="stack-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th className="num">Price</th>
              <th className="num">Tax rate</th>
              <th>PCT code</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td className="mono" data-label="Code">{item.code}</td>
                <td data-label="Name">
                  {item.name}
                  {item.third_schedule && <span className="badge spaced">3rd Schedule</span>}
                </td>
                <td className="num" data-label="Price">{money(item.price)}</td>
                <td className="num" data-label="Tax rate">{item.tax_rate}%</td>
                <td className="mono" data-label="PCT code">{item.pct_code || 'N/A'}</td>
                <td className="actions">
                  <button type="button" className="icon-btn" title="Edit" onClick={() => { setError(''); setEditing({ ...item }) }}>
                    <Pencil size={15} />
                  </button>
                  <button type="button" className="icon-btn" title="Delete" onClick={() => remove(item)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={6} className="muted empty">
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={shownPage}
        pageSize={pageSize}
        total={items.length}
        label="items"
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size)
          setPage(0)
        }}
      />

      {editing && (
        <Modal title={editing.id ? 'Edit item' : 'Add item'} onClose={() => setEditing(null)}>
          <form className="form-stack" onSubmit={save}>
            {error && <div className="alert error">{error}</div>}
            <div className="form-grid two">
              <label>
                Code
                <input value={editing.code} onChange={(e) => set({ code: e.target.value })} maxLength={50} required autoFocus />
              </label>
              <label>
                Price
                <input type="number" min="0" step="any" value={editing.price} onChange={(e) => set({ price: e.target.value })} required />
              </label>
              <label className="span-2">
                Name
                <input value={editing.name} onChange={(e) => set({ name: e.target.value })} maxLength={150} required />
              </label>
              <label>
                Tax rate %
                <input type="number" min="0" max="100" step="any" value={editing.tax_rate} onChange={(e) => set({ tax_rate: e.target.value })} required />
              </label>
              <label>
                PCT code
                <input value={editing.pct_code} onChange={(e) => set({ pct_code: e.target.value })} maxLength={8} />
              </label>
              <label className="check span-2">
                <input type="checkbox" checked={!!editing.third_schedule} onChange={(e) => set({ third_schedule: e.target.checked })} />
                3rd Schedule item
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn">
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}
