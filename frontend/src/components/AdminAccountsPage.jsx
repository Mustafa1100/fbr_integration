import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users as UsersIcon,
  ShieldCheck,
  UserPlus,
  ShieldPlus,
  UserCheck,
  UserX,
  Trash2,
  AlertCircle,
  Settings2,
  KeyRound,
  Search,
  Copy,
  Check,
} from 'lucide-react'
import { api } from '../api'
import usePageTitle from '../hooks/usePageTitle'
import Modal from './Modal'
import PaginationBar from './PaginationBar'
import TableLoader from './TableLoader'

const emptyForm = { email: '', full_name: '' }
const DEFAULT_PAGE_SIZE = 10

// Shared page shell for the two separate admin-only sidebar tabs — Users
// and Admins. Same account-management logic, scoped to one role each so
// they can live as fully independent nav items/pages.
export default function AdminAccountsPage({ role }) {
  const isAdmin = role === 'admin'
  usePageTitle(isAdmin ? 'Admins' : 'Users')
  const [accounts, setAccounts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // all | active | inactive
  const [invoicesByEmail, setInvoicesByEmail] = useState({})
  const [form, setForm] = useState(emptyForm)
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const [error, setError] = useState('')
  const [createdAccount, setCreatedAccount] = useState(null) // { email, temp_password }
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  // Debounce the search box so it doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  async function refresh() {
    setLoading(true)
    const params = new URLSearchParams({ role, page: String(page), page_size: String(pageSize) })
    if (q.trim()) params.set('q', q.trim())
    if (statusFilter !== 'all') params.set('is_active', statusFilter === 'active' ? 'true' : 'false')
    const resp = await api.getRaw(`/api/admin/users?${params}`)
    const items = await resp.json()
    setAccounts(items)
    setTotal(Number(resp.headers.get('x-total-count') || items.length))
    setLoading(false)
    if (!isAdmin) {
      const s = await api.get('/api/admin/stats')
      setInvoicesByEmail(Object.fromEntries(s.invoices_per_user.map((x) => [x.email, x.count])))
    }
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, page, pageSize, q, statusFilter])

  function openModal() {
    setForm(emptyForm)
    setFormError('')
    setShowModal(true)
  }

  async function createAccount(e) {
    e.preventDefault()
    setFormError('')
    setCreating(true)
    try {
      const created = await api.post('/api/admin/users', { ...form, role })
      setShowModal(false)
      setCreatedAccount({ email: created.email, temp_password: created.temp_password })
      setPage(1)
      await refresh()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
  }

  function copyTempPassword() {
    navigator.clipboard.writeText(createdAccount.temp_password).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
    // If the browser denies clipboard access, the code is still fully
    // visible and selectable in the box above — nothing else to fall back to.
  }

  async function toggleActive(user) {
    setError('')
    try {
      await api.patch(`/api/admin/users/${user.id}`, { is_active: !user.is_active })
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeUser(user) {
    if (!window.confirm(`Delete ${user.email}? (soft delete — data is kept)`)) return
    setError('')
    try {
      await api.delete(`/api/admin/users/${user.id}`)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const Icon = isAdmin ? ShieldCheck : UsersIcon
  const filtersActive = q.trim() !== '' || statusFilter !== 'all'

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Icon size={22} /> {isAdmin ? 'Admins' : 'Users'} <span className="muted">({total})</span>
          </h1>
          <p className="page-sub">
            {isAdmin
              ? 'Create and manage admin accounts — full access to every business.'
              : 'Create and manage business-user accounts and their FBR integration.'}
          </p>
        </div>
        <div className="page-actions">
          <button className={`btn ${isAdmin ? 'btn-secondary' : 'btn-primary'}`} onClick={openModal}>
            {isAdmin ? <ShieldPlus size={16} /> : <UserPlus size={16} />}
            {isAdmin ? 'Create admin' : 'Create user'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div className="input-wrap" style={{ flex: '1 1 240px', maxWidth: 320 }}>
            <Search size={15} />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={`Search ${isAdmin ? 'admins' : 'users'} by name or email…`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            style={{ maxWidth: 180 }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Deactivated only</option>
          </select>
        </div>
      </div>

      {loading && <TableLoader label={isAdmin ? 'admins' : 'users'} />}

      {!loading && accounts.length === 0 && (
        <div className="table-card">
          <div className="empty-state">
            <Icon size={40} />
            <div className="title">
              {filtersActive ? 'No matching accounts' : `No ${isAdmin ? 'admins' : 'users'} yet`}
            </div>
            <div className="hint">
              {filtersActive
                ? 'Try a different search term or status filter.'
                : `Create ${isAdmin ? 'another admin' : 'the first business-user'} account above.`}
            </div>
          </div>
        </div>
      )}

      {!loading && accounts.length > 0 && (
        <>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Created</th>
                  {!isAdmin && <th>Invoices</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="strong">{u.full_name}</span>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <div className="row-actions" style={{ flexWrap: 'wrap' }}>
                        <span className={`badge ${u.is_active ? 'submitted' : 'failed'}`}>
                          {u.is_active ? 'active' : 'deactivated'}
                        </span>
                        {u.must_change_password && (
                          <span className="badge warn" title="Still signing in with the temporary password">
                            temp password
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    {!isAdmin && <td>{invoicesByEmail[u.email] ?? 0}</td>}
                    <td>
                      <div className="row-actions">
                        {!isAdmin && (
                          <Link className="btn btn-secondary btn-sm" to={`/admin/users/${u.id}/fbr-settings`}>
                            <Settings2 size={14} /> FBR
                          </Link>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(u)}>
                          {u.is_active ? (
                            <>
                              <UserX size={14} /> Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck size={14} /> Activate
                            </>
                          )}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => removeUser(u)}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
            itemLabel={isAdmin ? 'admins' : 'users'}
          />
        </>
      )}

      {showModal && (
        <Modal title={isAdmin ? 'Create admin' : 'Create user'} onClose={() => setShowModal(false)}>
          <form onSubmit={createAccount}>
            {formError && (
              <div className="alert error">
                <AlertCircle size={17} />
                <span>{formError}</span>
              </div>
            )}
            {isAdmin && (
              <div className="alert info">
                <ShieldCheck size={17} />
                <span>
                  This account gets full admin access — create, manage, and deactivate any
                  account, and configure every business&apos;s FBR settings.
                </span>
              </div>
            )}
            <div className="field">
              <label>Full name</label>
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: '0.8rem' }}>
              <KeyRound size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              A 6-digit temporary password will be generated automatically — you&apos;ll see it
              once, right after creating the account, to share with them.
            </p>
            <button className="btn btn-primary" disabled={creating} style={{ width: '100%' }}>
              {isAdmin ? <ShieldPlus size={16} /> : <UserPlus size={16} />}{' '}
              {creating ? 'Creating…' : isAdmin ? 'Create admin' : 'Create user'}
            </button>
          </form>
        </Modal>
      )}

      {createdAccount && (
        <Modal
          title={`${isAdmin ? 'Admin' : 'User'} created`}
          onClose={() => setCreatedAccount(null)}
          width={420}
        >
          <p className="muted" style={{ margin: '0 0 16px' }}>
            Share this temporary password with <strong>{createdAccount.email}</strong> — they'll
            be required to set their own on first sign-in. It won&apos;t be shown again.
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 18px',
              borderRadius: 10,
              background: 'var(--slate-50)',
              border: '1px solid var(--border-strong)',
              marginBottom: 18,
            }}
          >
            <span className="mono" style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.12em' }}>
              {createdAccount.temp_password}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={copyTempPassword}>
              {copied ? (
                <>
                  <Check size={14} /> Copied
                </>
              ) : (
                <>
                  <Copy size={14} /> Copy
                </>
              )}
            </button>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => setCreatedAccount(null)}
          >
            Done
          </button>
        </Modal>
      )}
    </>
  )
}
