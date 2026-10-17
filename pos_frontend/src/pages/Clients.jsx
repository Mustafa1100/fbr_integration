import { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api, formatDate, formatDateTime, getAdmin, money, STATUS_LABEL } from '../api.js'
import CredentialsModal from '../components/CredentialsModal.jsx'
import Modal from '../components/Modal.jsx'
import Pagination, { PAGE_SIZES } from '../components/Pagination.jsx'

const BLANK = { name: '', business_name: '', contact_name: '', contact_phone: '', plan_id: '' }

export default function Clients() {
  const [clients, setClients] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [form, setForm] = useState(null)
  const [created, setCreated] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [plans, setPlans] = useState([])
  const navigate = useNavigate()
  const domain = getAdmin()?.username_domain || 'pos.compliance.pk'

  useEffect(() => {
    api
      .get(`/api/admin/clients?search=${encodeURIComponent(search)}`)
      .then(setClients)
      .catch((err) => setError(err.message))
  }, [search])

  // The plans offered in the New client form.
  useEffect(() => {
    api.get('/api/admin/plans').then(setPlans).catch(() => setPlans([]))
  }, [])

  async function create(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await api.post('/api/admin/clients', {
        name: form.name,
        contact_name: form.contact_name,
        contact_phone: form.contact_phone,
        config: { business_name: form.business_name },
        plan_id: Number(form.plan_id),
      })
      setForm(null)
      setCreated(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const set = (patch) => setForm({ ...form, ...patch })

  // The search returns every match; the table shows one page of them.
  const lastPage = Math.max(Math.ceil(clients.length / pageSize) - 1, 0)
  const shownPage = Math.min(page, lastPage)
  const visible = clients.slice(shownPage * pageSize, (shownPage + 1) * pageSize)

  return (
    <div className="page">
      <div className="page-head">
        <h1>Clients</h1>
        <button type="button" className="btn" onClick={() => { setError(''); setForm(BLANK) }}>
          <Plus size={16} /> New client
        </button>
      </div>
      <div className="search-box">
        <Search size={16} />
        <input
          placeholder="Search by username, business or contact"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
      </div>
      {error && !form && <div className="alert error">{error}</div>}

      <div className="card table-card">
        <table className="stack-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Business</th>
              <th>Plan</th>
              <th>Expires</th>
              <th>Status</th>
              <th>Last seen</th>
              <th>Last backup</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id}>
                <td data-label="Username">
                  <Link to={`/clients/${c.id}`}>{c.username}</Link>
                </td>
                <td data-label="Business">{c.business_name || 'N/A'}</td>
                <td data-label="Plan">{c.plan_name || 'N/A'}</td>
                <td data-label="Expires">{formatDate(c.expires_at)}</td>
                <td data-label="Status">
                  <span className={`badge ${c.subscription_status}`}>
                    {STATUS_LABEL[c.subscription_status]}
                  </span>
                  {!c.is_active && <span className="badge expired">Deactivated</span>}
                </td>
                <td data-label="Last seen">{formatDateTime(c.last_sync_at)}</td>
                <td data-label="Last backup">{formatDateTime(c.last_backup_at)}</td>
              </tr>
            ))}
            {!clients.length && (
              <tr>
                <td colSpan={7} className="muted empty">
                  {search ? 'No clients match your search.' : 'No clients yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={shownPage}
        pageSize={pageSize}
        total={clients.length}
        label="clients"
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size)
          setPage(0)
        }}
      />

      {form && (
        <Modal title="New client" onClose={() => setForm(null)}>
          <form className="form-stack" onSubmit={create}>
            {error && <div className="alert error">{error}</div>}
            <label>
              Username
              <div className="input-suffix">
                <input
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value.toLowerCase() })}
                  placeholder="kashifclinic"
                  required
                  autoFocus
                />
                <span>@{domain}</span>
              </div>
            </label>
            <label>
              Subscription
              <select value={form.plan_id} onChange={(e) => set({ plan_id: e.target.value })} required>
                <option value="" disabled>
                  Choose a plan
                </option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.months} {plan.months === 1 ? 'month' : 'months'} · Rs {money(plan.price)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Business name
              <input value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} />
            </label>
            <div className="form-grid two">
              <label>
                Contact person
                <input value={form.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
              </label>
              <label>
                Contact phone
                <input value={form.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} />
              </label>
            </div>
            <p className="muted">
              A strong password is generated for this login. The plan starts today. FBR settings
              are set on the next screen.
            </p>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Creating…' : 'Create client'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {created && (
        <CredentialsModal
          title="Client created"
          username={created.client.username}
          password={created.password}
          onDone={() => navigate(`/clients/${created.client.id}`)}
        />
      )}
    </div>
  )
}
