import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  Copy,
  History,
  KeyRound,
  Loader2,
  Mail,
  ReceiptText,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react'
import { api } from '../../api'
import usePageTitle from '../../hooks/usePageTitle'
import Modal from '../../components/Modal'
import PlanPanel, { PlanBadge } from '../../components/PlanPanel'
import StatValue from '../../components/StatValue'
import TempPasswordModal from '../../components/TempPasswordModal'
import UserFbrSettings from './UserFbrSettings'
import { fmtDate } from '../../planDates'

// What each confirm pop-up says and does.
const CONFIRM = {
  reset: {
    title: 'Reset password?',
    text: (u) =>
      `${u.email}'s current session ends immediately — they'll need the new temporary password to sign in.`,
    button: 'Reset password',
    danger: false,
  },
  deactivate: {
    title: 'Deactivate account?',
    text: (u) => `${u.full_name} won't be able to sign in until you activate the account again.`,
    button: 'Deactivate',
    danger: true,
  },
  activate: {
    title: 'Activate account?',
    text: (u) => `${u.full_name} will be able to sign in again.`,
    button: 'Activate',
    danger: false,
  },
  delete: {
    title: 'Delete account?',
    text: (u) => `Delete ${u.email}? Their invoices and data are kept, but they can no longer sign in.`,
    button: 'Delete',
    danger: true,
  },
}

const TABS = [
  { key: 'plan', label: 'Plan' },
  { key: 'fbr', label: 'FBR settings' },
  { key: 'activity', label: 'Invoices & uploads' },
]

function CopyEmail({ email }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      type="button"
      className={`icon-btn${copied ? ' done' : ''}`}
      onClick={copy}
      data-tip={copied ? 'Copied' : 'Copy email'}
      aria-label="Copy email"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

export default function UserProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'plan'
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null) // key of CONFIRM
  const [busy, setBusy] = useState(false)
  const [tempPassword, setTempPassword] = useState(null)
  usePageTitle(user ? user.full_name : 'User')

  const load = useCallback(
    () =>
      api
        .get(`/api/admin/users/${userId}`)
        .then(setUser)
        .catch((e) => setError(e.message)),
    [userId]
  )

  useEffect(() => {
    load()
  }, [load])

  async function runConfirmed() {
    setBusy(true)
    setError('')
    try {
      if (confirm === 'reset') {
        const r = await api.post(`/api/admin/users/${user.id}/reset-password`)
        setTempPassword({ email: r.email, temp_password: r.temp_password, mode: 'reset' })
        await load()
      } else if (confirm === 'deactivate' || confirm === 'activate') {
        await api.patch(`/api/admin/users/${user.id}`, { is_active: confirm === 'activate' })
        await load()
      } else if (confirm === 'delete') {
        await api.delete(`/api/admin/users/${user.id}`)
        navigate('/admin/users')
        return
      }
      setConfirm(null)
    } catch (err) {
      setError(err.message)
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    return error ? (
      <>
        <Link to="/admin/users" className="back-link">
          <ArrowLeft size={15} /> Users
        </Link>
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      </>
    ) : (
      <div className="loading">
        <Loader2 size={18} className="spin" /> Loading…
      </div>
    )
  }

  const c = confirm && CONFIRM[confirm]

  return (
    <>
      <Link to="/admin/users" className="back-link">
        <ArrowLeft size={15} /> Users
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{user.full_name}</h1>
          <div className="profile-meta">
            <span>
              <Mail size={14} /> {user.email} <CopyEmail email={user.email} />
            </span>
            <span>
              <CalendarDays size={14} /> Created {fmtDate(user.created_at)}
            </span>
            <span className={`badge ${user.is_active ? 'submitted' : 'failed'}`}>
              {user.is_active ? 'active' : 'deactivated'}
            </span>
            {user.must_change_password && (
              <span className="badge warn" title="Still signing in with the temporary password">
                temp password
              </span>
            )}
          </div>
        </div>
        <div className="page-actions">
          <button
            className="icon-btn lg"
            data-tip="Reset password"
            aria-label="Reset password"
            onClick={() => setConfirm('reset')}
          >
            <KeyRound size={17} />
          </button>
          <button
            className="icon-btn lg"
            data-tip={user.is_active ? 'Deactivate account' : 'Activate account'}
            aria-label={user.is_active ? 'Deactivate account' : 'Activate account'}
            onClick={() => setConfirm(user.is_active ? 'deactivate' : 'activate')}
          >
            {user.is_active ? <UserX size={17} /> : <UserCheck size={17} />}
          </button>
          <button
            className="icon-btn lg danger"
            data-tip="Delete account"
            aria-label="Delete account"
            onClick={() => setConfirm('delete')}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="profile-tabs" role="tablist">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`profile-tab${tab === key ? ' active' : ''}`}
            onClick={() => setSearchParams(key === 'plan' ? {} : { tab: key }, { replace: true })}
          >
            {label}
            {key === 'plan' && <PlanBadge plan={user.plan} />}
          </button>
        ))}
      </div>

      {tab === 'plan' && (
        <div className="card profile-plan">
          <PlanPanel userId={user.id} onChanged={load} />
        </div>
      )}
      {tab === 'fbr' && <UserFbrSettings embedded userId={user.id} />}
      {tab === 'activity' && (
      <div className="stat-grid profile-stats">
        <Link className="stat-card stat-link" to={`/admin/invoices?user=${user.id}`}>
          <div className="stat-icon tint-amber">
            <ReceiptText size={20} />
          </div>
          <div>
            <StatValue value={user.invoice_count} />
            <div className="stat-label">Invoices</div>
          </div>
        </Link>
        <Link className="stat-card stat-link" to={`/admin/uploads?user=${user.id}`}>
          <div className="stat-icon tint-slate">
            <History size={20} />
          </div>
          <div>
            <StatValue value={user.upload_count} />
            <div className="stat-label">Uploads</div>
          </div>
        </Link>
      </div>
      )}

      {c && (
        <Modal title={c.title} onClose={() => !busy && setConfirm(null)} width={400}>
          <p className="muted" style={{ margin: '0 0 20px' }}>
            {c.text(user)}
          </p>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </button>
            <button className={`btn ${c.danger ? 'btn-danger' : 'btn-primary'}`} onClick={runConfirmed} disabled={busy}>
              {busy ? 'Working…' : c.button}
            </button>
          </div>
        </Modal>
      )}

      {tempPassword && <TempPasswordModal account={tempPassword} onClose={() => setTempPassword(null)} />}
    </>
  )
}
