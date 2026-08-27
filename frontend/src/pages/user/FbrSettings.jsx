import { useEffect, useState } from 'react'
import { api, storeSession } from '../../api'
import usePageTitle from '../../hooks/usePageTitle'
import PasswordRequirement from '../../components/PasswordRequirement'
import { passwordStrength } from '../../passwordStrength'
import {
  Settings,
  Globe,
  Building2,
  Info,
  Loader2,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react'

const ENV_LABELS = {
  mock: 'Mock (simulated responses)',
  sandbox: 'Sandbox (PRAL scenario testing)',
  production: 'Production (live invoicing)',
}

function ChangePasswordTab() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword
  const canSubmit =
    currentPassword.length > 0 &&
    passwordStrength(newPassword).ok &&
    confirmPassword === newPassword

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const data = await api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      // The old token is invalidated by this change — silently swap in the
      // fresh one the server just issued instead of forcing a re-login.
      storeSession(data)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice('Password changed successfully.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 460, margin: '0 auto' }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        <KeyRound size={17} /> Change password
      </h2>

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

      <form onSubmit={submit}>
        <div className="field">
          <label>Current password</label>
          <div className="input-wrap with-toggle">
            <Lock size={16} />
            <input
              type={show ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="input-toggle"
              onClick={() => setShow((v) => !v)}
              tabIndex={-1}
              aria-label={show ? 'Hide passwords' : 'Show passwords'}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="field">
          <label>New password</label>
          <div className="input-wrap">
            <KeyRound size={16} />
            <input
              type={show ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <PasswordRequirement password={newPassword} />
        </div>

        <div className="field">
          <label>Confirm new password</label>
          <div className="input-wrap">
            <KeyRound size={16} />
            <input
              type={show ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {mismatch && <p className="field-error">Passwords don&apos;t match</p>}
        </div>

        <button className="btn btn-primary" disabled={busy || !canSubmit} style={{ width: '100%' }}>
          {busy ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />}
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}

export default function FbrSettings() {
  usePageTitle('Settings')
  const [tab, setTab] = useState('fbr')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/settings/fbr')
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings size={22} /> Settings
          </h1>
          <p className="page-sub">Your account settings and FBR / PRAL digital invoicing configuration.</p>
        </div>
      </div>

      <div className="row-actions" style={{ gap: 8, marginBottom: '1.5rem' }}>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'fbr' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('fbr')}
        >
          <Globe size={14} /> FBR Settings
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'password' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('password')}
        >
          <KeyRound size={14} /> Change Password
        </button>
      </div>

      {tab === 'fbr' && (
        <>
          {error && (
            <div className="alert error">
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          )}
          {!data && !error && (
            <div className="loading">
              <Loader2 size={18} className="spin" /> Loading…
            </div>
          )}
          {data && (
            <>
              <div className="alert info">
                <Info size={17} />
                <span>
                  These settings are managed by your administrator. Contact them if the
                  environment, token, or seller details need to change.
                </span>
              </div>

              <div className="card">
                <h2 className="section-title" style={{ marginTop: 0 }}>
                  <Globe size={17} /> Environment
                </h2>
                <div className="form-grid">
                  <div className="field">
                    <label>FBR environment</label>
                    <div>{ENV_LABELS[data.fbr_env] || data.fbr_env}</div>
                  </div>
                  <div className="field">
                    <label>Bearer token</label>
                    <div>
                      <span className={`badge ${data.has_token ? 'submitted mono' : 'failed'}`}>
                        {data.has_token ? `configured · ${data.token_preview}` : 'not set'}
                      </span>
                    </div>
                  </div>
                </div>

                <h2 className="section-title">
                  <Building2 size={17} /> Seller profile
                </h2>
                <p className="muted">These details appear on every invoice you submit.</p>
                <div className="form-grid">
                  <div className="field">
                    <label>CNIC</label>
                    <div>{data.seller_ntn_cnic || '—'}</div>
                  </div>
                  <div className="field">
                    <label>NTN</label>
                    <div>{data.seller_ntn || '—'}</div>
                  </div>
                  <div className="field">
                    <label>Business name</label>
                    <div>{data.seller_business_name || '—'}</div>
                  </div>
                  <div className="field">
                    <label>Province</label>
                    <div>{data.seller_province || '—'}</div>
                  </div>
                  <div className="field">
                    <label>Address</label>
                    <div>{data.seller_address || '—'}</div>
                  </div>
                  <div className="field">
                    <label>Default sandbox scenario</label>
                    <div>{data.default_scenario || '—'}</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'password' && <ChangePasswordTab />}
    </>
  )
}
