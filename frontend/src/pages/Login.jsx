import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  QrCode,
  ScrollText,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, storeSession } from '../api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api.post('/api/auth/login', { email, password })
      storeSession(data)
      if (data.must_change_password) {
        navigate('/set-password')
      } else {
        navigate(data.role === 'admin' ? '/admin' : '/dashboard')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="brand-row">
          <div className="logo-mark">
            <ScrollText size={20} />
          </div>
          <div className="logo-text">
            <div className="t1">FBR Invoicing</div>
            <div className="t2">Digital · PRAL</div>
          </div>
        </div>

        <h1>FBR digital invoicing, without the paperwork.</h1>
        <p className="lede">
          Upload your point-of-sale data and get FBR-verified tax receipts back in
          seconds — fully integrated with PRAL&apos;s Digital Invoicing API.
        </p>

        <div className="login-features">
          <div className="feature-item">
            <div className="feature-icon">
              <UploadCloud size={19} />
            </div>
            <div>
              <div className="f-title">CSV in, invoices out</div>
              <div className="f-sub">
                Drop in your POS export — every sale becomes a compliant digital invoice.
              </div>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon">
              <ShieldCheck size={19} />
            </div>
            <div>
              <div className="f-title">Submitted to FBR in real time</div>
              <div className="f-sub">
                Each invoice is validated and registered with FBR through PRAL, sandbox or
                production.
              </div>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon">
              <QrCode size={19} />
            </div>
            <div>
              <div className="f-title">QR-coded tax receipts</div>
              <div className="f-sub">
                Print-ready receipts carrying the official FBR invoice number and QR code.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="login-form-wrap">
        <form className="login-card" onSubmit={submit}>
          <h2>Welcome back</h2>
          <p className="sub">Sign in to your dashboard</p>

          {error && (
            <div className="alert error">
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          )}

          <div className="field">
            <label>Email</label>
            <div className="input-wrap">
              <Mail size={16} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="field">
            <label>Password</label>
            <div className="input-wrap with-toggle">
              <Lock size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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

          <button className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 size={17} className="spin" /> : <LogIn size={17} />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="login-footnote">
            Accounts are created by your administrator.
          </p>
        </form>
      </div>
    </div>
  )
}
