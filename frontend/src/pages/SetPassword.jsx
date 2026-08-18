import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ScrollText,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getStoredUser, storeSession } from '../api'
import { passwordStrength } from '../passwordStrength'

const REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters' },
  { key: 'length12', label: '12+ characters' },
  { key: 'upper', label: 'An uppercase letter' },
  { key: 'lower', label: 'A lowercase letter' },
  { key: 'digit', label: 'A number' },
  { key: 'special', label: 'A special character' },
]

const LABEL_TEXT = { weak: 'Weak', medium: 'Medium', strong: 'Strong' }

export default function SetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const user = getStoredUser()

  const strength = useMemo(() => passwordStrength(newPassword), [newPassword])
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword
  const canSubmit = strength.label === 'strong' && confirmPassword === newPassword && newPassword.length > 0

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setBusy(true)
    try {
      const data = await api.post('/api/auth/set-password', {
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      storeSession(data)
      navigate(data.role === 'admin' ? '/admin' : '/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="centered-page">
      <div className="card set-password-card">
        <div className="brand-row" style={{ marginBottom: 22 }}>
          <div className="logo-mark">
            <ScrollText size={20} />
          </div>
          <div className="logo-text" style={{ color: 'var(--text)' }}>
            <div className="t1" style={{ color: 'var(--text)' }}>
              FBR Invoicing
            </div>
            <div className="t2" style={{ color: 'var(--muted)' }}>
              Digital · PRAL
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
          Set your password
        </h2>
        <p className="muted" style={{ margin: '4px 0 20px' }}>
          {user?.full_name ? `Welcome, ${user.full_name}. ` : ''}
          Your administrator gave you a temporary password — choose your own strong password to
          continue.
        </p>

        {error && (
          <div className="alert error">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit}>
          <div className="field">
            <label>New password</label>
            <div className="input-wrap with-toggle">
              <Lock size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Choose a strong password"
                autoFocus
                required
              />
              <button
                type="button"
                className="input-toggle"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {newPassword.length > 0 && (
            <>
              <div className="strength-meter">
                <div className={`strength-bar ${strength.label}`}>
                  <span className="seg" />
                  <span className="seg" />
                  <span className="seg" />
                </div>
                <span className={`strength-label ${strength.label}`}>{LABEL_TEXT[strength.label]}</span>
              </div>
              <ul className="req-checklist">
                {REQUIREMENTS.map((r) => {
                  const met = strength.checks[r.key]
                  return (
                    <li key={r.key} className={met ? 'met' : ''}>
                      {met ? <Check size={14} /> : <X size={14} />}
                      {r.label}
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label>Confirm password</label>
            <div className="input-wrap">
              <KeyRound size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Type it again"
                required
              />
            </div>
            {mismatch && <p className="field-error">Passwords don&apos;t match</p>}
          </div>

          <button className="btn btn-primary" disabled={busy || !canSubmit} style={{ width: '100%', marginTop: 4 }}>
            {busy ? <Loader2 size={17} className="spin" /> : <KeyRound size={17} />}
            {busy ? 'Saving…' : 'Set password & continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
