import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, Lock, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getStoredUser, storeSession } from '../api'
import usePageTitle from '../hooks/usePageTitle'
import PasswordRequirement from '../components/PasswordRequirement'
import { passwordStrength } from '../passwordStrength'

export default function SetPassword() {
  usePageTitle('Set your password')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const user = getStoredUser()

  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword
  const canSubmit =
    passwordStrength(newPassword).ok && confirmPassword === newPassword && newPassword.length > 0

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
          Your administrator gave you a temporary password — choose your own password (at least
          8 characters) to continue.
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
                placeholder="Choose a password"
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

          <PasswordRequirement password={newPassword} />

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
