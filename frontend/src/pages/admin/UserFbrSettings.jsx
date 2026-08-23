import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Settings2,
  Globe,
  Building2,
  KeyRound,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react'
import { api } from '../../api'
import usePageTitle from '../../hooks/usePageTitle'

export default function UserFbrSettings() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [targetUser, setTargetUser] = useState(null)
  usePageTitle(`FBR Settings — ${targetUser?.full_name || `User #${userId}`}`)
  const [form, setForm] = useState(null)
  const [provinces, setProvinces] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [hasToken, setHasToken] = useState(false)
  const [tokenPreview, setTokenPreview] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/users'),
      api.get(`/api/admin/users/${userId}/fbr-settings`),
      api.get('/api/reference/provinces'),
      api.get('/api/reference/scenarios'),
    ])
      .then(([users, settings, prov, scen]) => {
        setTargetUser(users.find((u) => u.id === Number(userId)) || null)
        setHasToken(settings.has_token)
        setTokenPreview(settings.token_preview)
        setForm({ ...settings, fbr_token: '' })
        setProvinces(prov)
        setScenarios(scen)
      })
      .catch((e) => setError(e.message))
  }, [userId])

  async function save(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    try {
      const saved = await api.put(`/api/admin/users/${userId}/fbr-settings`, form)
      setHasToken(saved.has_token)
      setTokenPreview(saved.token_preview)
      setForm({ ...saved, fbr_token: '' })
      setNotice('FBR settings saved')
    } catch (err) {
      setError(err.message)
    }
  }

  if (error && !form)
    return (
      <div className="alert error">
        <AlertCircle size={17} />
        <span>{error}</span>
      </div>
    )
  if (!form)
    return (
      <div className="loading">
        <Loader2 size={18} className="spin" /> Loading…
      </div>
    )

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings2 size={22} /> FBR Settings — {targetUser?.full_name || `User #${userId}`}
          </h1>
          <p className="page-sub">
            Configure this user's FBR / PRAL digital invoicing connection. They can view these
            settings but cannot change them.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/admin')}>
            <ArrowLeft size={16} /> Back to users
          </button>
        </div>
      </div>

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

      <form className="card" onSubmit={save}>
        <h2 className="section-title">
          <Globe size={17} /> Environment &amp; credentials
        </h2>
        <div className="form-grid">
          <div className="field">
            <label>FBR environment</label>
            <select value={form.fbr_env} onChange={set('fbr_env')}>
              <option value="mock">Mock (no token needed — simulated responses)</option>
              <option value="sandbox">Sandbox (PRAL scenario testing)</option>
              <option value="production">Production (live invoicing)</option>
            </select>
          </div>
          <div className="field">
            <label>
              Bearer token from IRIS portal{' '}
              {hasToken ? (
                <span className="badge submitted mono">saved · {tokenPreview}</span>
              ) : (
                <span className="badge failed">not set</span>
              )}
            </label>
            <input
              type="password"
              placeholder={hasToken ? 'Leave empty to keep the saved token' : 'Paste the PRAL token'}
              value={form.fbr_token}
              onChange={set('fbr_token')}
            />
          </div>
        </div>
        <p className="muted">
          <KeyRound size={14} /> From IRIS → Digital Invoicing. Sandbox and production tokens are
          different, and PRAL must whitelist the server IP — see{' '}
          <Link to="/admin/server-info">Server / IP Info</Link> for the current whitelisted IPs.
        </p>

        <h2 className="section-title">
          <Building2 size={17} /> Seller profile
        </h2>
        <p className="muted">These details appear on every invoice this user submits.</p>
        <div className="form-grid">
          <div className="field">
            <label>NTN / CNIC</label>
            <input value={form.seller_ntn_cnic} onChange={set('seller_ntn_cnic')} placeholder="1234567" />
          </div>
          <div className="field">
            <label>Business name</label>
            <input value={form.seller_business_name} onChange={set('seller_business_name')} />
          </div>
          <div className="field">
            <label>Province</label>
            <select value={form.seller_province} onChange={set('seller_province')}>
              {provinces.map((p) => {
                const name = p.stateProvinceDesc
                  .toLowerCase()
                  .replace(/\b\w/g, (c) => c.toUpperCase())
                return (
                  <option key={p.stateProvinceCode} value={name}>
                    {name}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="field">
            <label>Address</label>
            <input value={form.seller_address} onChange={set('seller_address')} />
          </div>
          <div className="field">
            <label>Default sandbox scenario</label>
            <select value={form.default_scenario} onChange={set('default_scenario')}>
              {scenarios.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.description}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn btn-primary">
          <Save size={16} /> Save settings
        </button>
      </form>
    </>
  )
}
