import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { api, formatDayTime, money, onChanged } from '../api.js'
import Pagination, { PAGE_SIZES } from '../components/Pagination.jsx'

const BLANK = { code: '', name: '', price: 0 }

const REQUEST_STATUS = {
  queued: { label: 'Not sent yet', tone: 'queued' },
  pending: { label: 'Waiting for approval', tone: 'queued' },
  approved: { label: 'Approved', tone: 'fiscalized' },
  rejected: { label: 'Rejected', tone: 'failed' },
}
const isOpen = (request) => request.status === 'queued' || request.status === 'pending'

const describe = (request) => {
  if (request.action === 'delete') return 'Delete the item'
  const tax = request.pct_code ? ` · PCT ${request.pct_code}, ${request.tax_rate ?? 0}%` : ''
  const what = `"${request.name}" at Rs ${money(request.price)}${tax}`
  return request.action === 'add' ? `Add ${what}` : `Change to ${what}`
}

// The user's items, as approved by the provider. Adding, changing or deleting
// one is a request the provider approves; nothing changes here until then.
// The PCT code and tax rate in a request are only a suggestion.
export default function Catalog({ settings }) {
  const [items, setItems] = useState([])
  const [requests, setRequests] = useState([])
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(() => {
    api.listItems('').then(setItems).catch((err) => setError(err.message))
    api.itemRequests().then(setRequests).catch(() => setRequests([]))
  }, [])
  // Reload when a background sync brings in the server's copy or decisions.
  useEffect(() => {
    load()
    return onChanged(load)
  }, [load])

  const openRequest = (code) => requests.find((r) => r.code === code && isOpen(r))

  // Items only: sends what is waiting here and brings down the server's
  // list and the provider's decisions on requests.
  async function refreshItems() {
    setError('')
    setNotice('')
    setRefreshing(true)
    try {
      const result = await api.syncItems()
      if (result.synced) setNotice('Items are up to date.')
      else setError(result.error || 'Could not refresh the items.')
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
      load()
    }
  }

  const requested = () =>
    setNotice(
      'Your request has been sent to your provider. Your items change once they approve it.'
    )

  async function save(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api.saveItem(editing)
      setEditing(null)
      requested()
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(item) {
    if (!window.confirm(`Ask your provider to delete "${item.name}"? It stays until they approve.`)) return
    setError('')
    setNotice('')
    try {
      await api.deleteItem(item.id)
      requested()
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const set = (patch) => setEditing({ ...editing, ...patch })

  // The whole catalog is loaded (the sale screen needs it anyway); the table
  // shows one page of it. Deleting the last row of the last page steps back.
  const lastPage = Math.max(Math.ceil(items.length / pageSize) - 1, 0)
  const shownPage = Math.min(page, lastPage)
  const visible = items.slice(shownPage * pageSize, (shownPage + 1) * pageSize)
  const recent = requests.slice(0, 10)

  return (
    <div className="page">
      <div className="page-head">
        <h1>Items</h1>
        <div className="inline">
          <button
            type="button"
            className="btn ghost"
            onClick={refreshItems}
            disabled={refreshing}
            title="Get the latest items and your provider's decisions"
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setError('')
              // A new item starts from the defaults the provider set.
              setEditing({
                ...BLANK,
                pct_code: settings.default_pct_code,
                tax_rate: settings.default_tax_rate,
              })
            }}
          >
            <Plus size={16} /> Request new item
          </button>
        </div>
      </div>
      <p className="muted">
        Whatever you sell or charge for: products, services, consultations, procedures. Adding,
        changing or deleting an item is sent to your provider for approval. Your items are backed
        up to your account.
      </p>
      {error && !editing && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <div className="card table-card">
        <table>
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
            {visible.map((item) => {
              const open = openRequest(item.code)
              return (
                <tr key={item.id}>
                  <td className="mono">{item.code}</td>
                  <td>
                    {item.name}
                    {!!item.third_schedule && <span className="badge slate">3rd Schedule</span>}
                    {open && (
                      <span className="badge queued" title={describe(open)}>
                        {open.action === 'delete' ? 'Deletion requested' : 'Change requested'}
                      </span>
                    )}
                  </td>
                  <td className="num">{money(item.price)}</td>
                  <td className="num">{item.tax_rate}%</td>
                  <td className="mono">{item.pct_code || 'N/A'}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Request a change"
                      onClick={() => {
                        setError('')
                        setEditing({
                          id: item.id,
                          code: item.code,
                          name: item.name,
                          price: item.price,
                          pct_code: item.pct_code,
                          tax_rate: item.tax_rate,
                        })
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Request deletion"
                      onClick={() => remove(item)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )
            })}
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
      <p className="muted small">
        Your provider confirms the PCT code and tax rate of every item. If one is wrong, request a
        change with the correct values.
      </p>

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

      {recent.length > 0 && (
        <section className="card table-card">
          <div className="card-title">Your requests</div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Request</th>
                <th>Sent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((request) => {
                const status = REQUEST_STATUS[request.status] || { label: request.status, tone: '' }
                return (
                  <tr key={request.uid}>
                    <td className="mono">{request.code}</td>
                    <td>{describe(request)}</td>
                    <td>{formatDayTime(request.created_at)}</td>
                    <td>
                      <span className={`badge ${status.tone}`}>{status.label}</span>
                      {request.admin_note && <div className="muted small">{request.admin_note}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {editing && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={save}>
            <div className="modal-head">
              <h3>{editing.id ? 'Request a change' : 'Request a new item'}</h3>
              <button type="button" className="icon-btn" onClick={() => setEditing(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {error && <div className="alert error">{error}</div>}
            <div className="alert warn">
              {editing.id
                ? 'Your provider must approve this change. Until then the item keeps its current name and price.'
                : 'Your provider must approve this item before it can be sold.'}
            </div>
            <div className="form-grid two">
              <label>
                Code
                <input
                  value={editing.code}
                  onChange={(e) => set({ code: e.target.value })}
                  disabled={!!editing.id}
                  maxLength={50}
                  autoFocus={!editing.id}
                />
              </label>
              <label>
                Price{settings.prices_include_tax ? ' (including tax)' : ' (before tax)'}
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editing.price}
                  onChange={(e) => set({ price: e.target.value })}
                />
              </label>
              <label className="span-2">
                Name
                <input
                  value={editing.name}
                  onChange={(e) => set({ name: e.target.value })}
                  maxLength={150}
                  autoFocus={!!editing.id}
                />
              </label>
              <label>
                PCT code
                <input
                  value={editing.pct_code}
                  onChange={(e) => set({ pct_code: e.target.value })}
                  maxLength={8}
                  inputMode="numeric"
                  required
                />
              </label>
              <label>
                Tax rate %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={editing.tax_rate}
                  onChange={(e) => set({ tax_rate: e.target.value })}
                  required
                />
              </label>
            </div>
            <p className="muted small">
              Your provider checks the PCT code and tax rate when approving and may correct them.
              {editing.id && ' The code cannot be changed once an item exists.'}
            </p>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn">
                Send request
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
