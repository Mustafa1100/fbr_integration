import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Users as UsersIcon,
  ShieldCheck,
  UserPlus,
  ShieldPlus,
  UserCheck,
  UserX,
  Trash2,
  AlertCircle,
  KeyRound,
  Search,
  StickyNote,
  ChevronRight,
  CalendarCheck,
  CalendarClock,
  CalendarX2,
  CalendarOff,
  CalendarDays,
} from 'lucide-react'
import { api } from '../api'
import usePageTitle from '../hooks/usePageTitle'
import Modal from './Modal'
import PaginationBar from './PaginationBar'
import TableLoader from './TableLoader'
import { PlanBadge } from './PlanPanel'
import TempPasswordModal from './TempPasswordModal'
import { addMonths, daysBetween, fmtDate, fmtMoney, planText, todayPk } from '../planDates'
import StatValue from './StatValue'

const emptyForm = () => ({
  email: '',
  full_name: '',
  start_date: todayPk(),
  plan_months: '',
  initial_fee: '',
  admin_note: '',
})
const PLAN_FILTERS = ['all', 'active', 'expiring', 'expired', 'none']
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
  const [searchParams] = useSearchParams()
  const [planFilter, setPlanFilter] = useState(() => {
    const p = searchParams.get('plan')
    return PLAN_FILTERS.includes(p) ? p : 'all'
  })
  const navigate = useNavigate()
  const [invoicesByEmail, setInvoicesByEmail] = useState({})
  const [form, setForm] = useState(emptyForm)
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const [error, setError] = useState('')
  const [createdAccount, setCreatedAccount] = useState(null) // { email, temp_password }
  const [loading, setLoading] = useState(true)
  const [userStats, setUserStats] = useState(null)

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
    if (!isAdmin && planFilter !== 'all') params.set('plan', planFilter)
    const resp = await api.getRaw(`/api/admin/users?${params}`)
    const items = await resp.json()
    setAccounts(items)
    setTotal(Number(resp.headers.get('x-total-count') || items.length))
    setLoading(false)
    if (!isAdmin) {
      api.get('/api/admin/stats/users').then(setUserStats).catch(() => {})
      const s = await api.get('/api/admin/stats')
      setInvoicesByEmail(Object.fromEntries(s.invoices_per_user.map((x) => [x.email, x.count])))
    }
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, page, pageSize, q, statusFilter, planFilter])

  function openModal() {
    setForm(emptyForm())
    setFormError('')
    setShowModal(true)
  }

  async function createAccount(e) {
    e.preventDefault()
    setFormError('')
    setCreating(true)
    try {
      const body = isAdmin
        ? { email: form.email, full_name: form.full_name, role }
        : {
            email: form.email,
            full_name: form.full_name,
            role,
            start_date: form.start_date,
            plan_months: Number(form.plan_months),
            initial_fee: Number(form.initial_fee) || 0,
            admin_note: form.admin_note,
          }
      const created = await api.post('/api/admin/users', body)
      setShowModal(false)
      setCreatedAccount({ email: created.email, temp_password: created.temp_password, mode: 'created' })
      setPage(1)
      await refresh()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
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

  async function resetPassword(user) {
    if (
      !window.confirm(
        `Reset ${user.email}'s password? Their current session ends immediately — they'll need the new temporary code to sign in.`
      )
    )
      return
    setError('')
    try {
      const result = await api.post(`/api/admin/users/${user.id}/reset-password`)
      setCreatedAccount({ email: result.email, temp_password: result.temp_password, mode: 'reset' })
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const Icon = isAdmin ? ShieldCheck : UsersIcon
  const filtersActive = q.trim() !== '' || statusFilter !== 'all' || planFilter !== 'all'
  const months = Math.floor(Number(form.plan_months) || 0)
  const newPlanEnd = !isAdmin && form.start_date && months > 0 ? addMonths(form.start_date, months) : null
  const newPlanLeft = newPlanEnd ? daysBetween(todayPk(), newPlanEnd) : null

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

      {!isAdmin && userStats && (
        <UsersStats
          stats={userStats}
          planFilter={planFilter}
          onPlanFilter={(p) => {
            setPlanFilter(planFilter === p ? 'all' : p)
            setPage(1)
          }}
        />
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
          {!isAdmin && (
            <select
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value)
                setPage(1)
              }}
              style={{ maxWidth: 190 }}
            >
              <option value="all">All plans</option>
              <option value="active">Plan active</option>
              <option value="expiring">Ending in 7 days</option>
              <option value="expired">Plan expired</option>
              <option value="none">No plan set</option>
            </select>
          )}
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
                  {!isAdmin && <th>Plan</th>}
                  {!isAdmin && <th>Invoices</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((u) => (
                  <tr
                    key={u.id}
                    className={isAdmin ? undefined : 'row-link'}
                    onClick={isAdmin ? undefined : () => navigate(`/admin/users/${u.id}`)}
                  >
                    <td>
                      {isAdmin ? (
                        <span className="strong">{u.full_name}</span>
                      ) : (
                        <Link className="strong" to={`/admin/users/${u.id}`} onClick={(e) => e.stopPropagation()}>
                          {u.full_name}
                        </Link>
                      )}
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
                    {!isAdmin && (
                      <td>
                        <div className="plan-cell">
                          <div className="row-actions">
                            <PlanBadge plan={u.plan} />
                            {u.plan?.extended && <span className="badge info">extended</span>}
                            {u.admin_note && (
                              <span className="muted" title={u.admin_note} style={{ cursor: 'help' }}>
                                <StickyNote size={14} />
                              </span>
                            )}
                          </div>
                          <span className="muted small">{planText(u.plan)}</span>
                        </div>
                      </td>
                    )}
                    {!isAdmin && <td>{invoicesByEmail[u.email] ?? 0}</td>}
                    <td>
                      {!isAdmin ? (
                        <Link
                          className="btn btn-secondary btn-sm"
                          to={`/admin/users/${u.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open <ChevronRight size={14} />
                        </Link>
                      ) : (
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => resetPassword(u)}>
                          <KeyRound size={14} /> Reset password
                        </button>
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
                      )}
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
            {!isAdmin && (
              <div className="create-plan">
                <h4>Plan</h4>
                <div className="plan-form-grid">
                  <div className="field">
                    <label>Account start date</label>
                    <input
                      type="date"
                      value={form.start_date}
                      max={todayPk()}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Plan length (months)</label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={form.plan_months}
                      onChange={(e) => setForm({ ...form, plan_months: e.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Initial fee (PKR)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={form.initial_fee}
                      onChange={(e) => setForm({ ...form, initial_fee: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
                {newPlanEnd &&
                  (newPlanLeft <= 0 ? (
                    <div className="alert warn">
                      <AlertCircle size={17} />
                      <span>
                        With these dates the plan ended on <strong>{fmtDate(newPlanEnd)}</strong>. This user
                        will be blocked as soon as they sign in. You can renew or extend it from the Plan
                        button afterwards.
                      </span>
                    </div>
                  ) : (
                    <p className="muted small" style={{ margin: '0 0 12px' }}>
                      Plan ends on <strong>{fmtDate(newPlanEnd)}</strong> ({newPlanLeft} days from today).
                    </p>
                  ))}
                <div className="field">
                  <label>
                    Admin note <span className="hint">(only admins see this)</span>
                  </label>
                  <textarea
                    className="create-note"
                    rows={2}
                    maxLength={2000}
                    value={form.admin_note}
                    onChange={(e) => setForm({ ...form, admin_note: e.target.value })}
                    placeholder="Write a note…"
                  />
                </div>
              </div>
            )}
            <p className="muted" style={{ margin: '0 0 14px', fontSize: '0.8rem' }}>
              <KeyRound size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              A 6-character temporary password will be generated automatically — you&apos;ll see it
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
        <TempPasswordModal
          account={createdAccount}
          label={isAdmin ? 'Admin' : 'User'}
          onClose={() => setCreatedAccount(null)}
        />
      )}
    </>
  )
}

// Revenue (plan fees received) and plan counts at the top of the Users page.
// Clicking a plan card filters the table below; clicking it again clears it.
function UsersStats({ stats, planFilter, onPlanFilter }) {
  const plans = [
    { key: 'active', label: 'Plan active', icon: CalendarCheck, tint: 'tint-green' },
    { key: 'expiring', label: 'Ending soon', icon: CalendarClock, tint: 'tint-amber' },
    { key: 'expired', label: 'Plan expired', icon: CalendarX2, tint: 'tint-red' },
    { key: 'none', label: 'No plan set', icon: CalendarOff, tint: 'tint-slate' },
  ]
  return (
    <div className="stat-grid users-stats">
      <div className="stat-card" title={`All plan fees received: ${stats.payments} payments`}>
        <div className="stat-icon tint-green">
          <span className="stat-icon-text">Rs</span>
        </div>
        <div>
          <StatValue value={fmtMoney(stats.total_revenue)} />
          <div className="stat-label">Total revenue</div>
        </div>
      </div>
      <div className="stat-card" title={`This year: ${fmtMoney(stats.revenue_this_year)}`}>
        <div className="stat-icon tint-blue">
          <CalendarDays size={20} />
        </div>
        <div>
          <StatValue value={fmtMoney(stats.revenue_this_month)} />
          <div className="stat-label">This month</div>
        </div>
      </div>
      {plans.map(({ key, label, icon: Icon, tint }) => (
        <button
          type="button"
          key={key}
          className={`stat-card stat-click${planFilter === key ? ' selected' : ''}`}
          onClick={() => onPlanFilter(key)}
          title={planFilter === key ? 'Show all users' : `Show only: ${label.toLowerCase()}`}
        >
          <div className={`stat-icon ${tint}`}>
            <Icon size={20} />
          </div>
          <div>
            <StatValue value={stats.plans[key]} />
            <div className="stat-label">{label}</div>
          </div>
        </button>
      ))}
    </div>
  )
}
