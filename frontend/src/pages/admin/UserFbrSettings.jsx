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
  Plus,
  Trash2,
  Hash,
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
  const [tokens, setTokens] = useState({ sandbox: [false, null], production: [false, null] })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function loadSettings(s) {
    setTokens({
      sandbox: [s.has_sandbox_token, s.sandbox_token_preview],
      production: [s.has_production_token, s.production_token_preview],
    })
    setForm({ ...s, sandbox_token: '', production_token: '' })
  }

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/users'),
      api.get(`/api/admin/users/${userId}/fbr-settings`),
      api.get('/api/reference/provinces'),
      api.get('/api/reference/scenarios'),
    ])
      .then(([users, settings, prov, scen]) => {
        setTargetUser(users.find((u) => u.id === Number(userId)) || null)
        loadSettings(settings)
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
      loadSettings(saved)
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

  const strns = form.strns || []
  const setStrn = (i, key) => (e) =>
    setForm({
      ...form,
      strns: strns.map((row, idx) => (idx === i ? { ...row, [key]: e.target.value } : row)),
    })
  const addStrn = () =>
    setForm({ ...form, strns: [...strns, { business_name: '', strn: '' }] })
  const removeStrn = (i) =>
    setForm({ ...form, strns: strns.filter((_, idx) => idx !== i) })
  const tokenField = (which) => {
    const [has, preview] = tokens[which]
    return (
      <div className="field">
        <label>
          {which === 'sandbox' ? 'Sandbox' : 'Production'} token{' '}
          {has ? (
            <span className="badge submitted mono">saved · {preview}</span>
          ) : (
            <span className="badge failed">not set</span>
          )}
        </label>
        <input
          type="password"
          placeholder={has ? 'Leave empty to keep the saved token' : 'Paste the PRAL token'}
          value={form[`${which}_token`]}
          onChange={set(`${which}_token`)}
        />
      </div>
    )
  }

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
            <label>Default environment</label>
            <select value={form.fbr_env} onChange={set('fbr_env')}>
              <option value="mock">Mock (no token needed — simulated responses)</option>
              <option value="sandbox">Sandbox (PRAL scenario testing)</option>
              <option value="production">Production (live invoicing)</option>
            </select>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              The pre-selected target on the Generate Invoices page.
            </p>
          </div>
          <div className="field">
            <label className="row-actions" style={{ gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={!!form.can_submit_production}
                onChange={(e) => setForm({ ...form, can_submit_production: e.target.checked })}
              />
              <span>Allowed to submit to FBR production</span>
            </label>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Lets this user upload directly to production and promote sandbox-tested invoices.
            </p>
          </div>
          {tokenField('sandbox')}
          {tokenField('production')}
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
            <label>CNIC</label>
            <input
              value={form.seller_ntn_cnic}
              onChange={set('seller_ntn_cnic')}
              placeholder="4210112345678"
            />
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Sent to FBR as the seller identifier.
            </p>
          </div>
          <div className="field">
            <label>NTN</label>
            <input
              value={form.seller_ntn}
              onChange={set('seller_ntn')}
              placeholder="1234567"
            />
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Shown on the receipt alongside the CNIC.
            </p>
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

        <h2 className="section-title">
          <Hash size={17} /> STRNs
        </h2>
        <p className="muted">
          Sales Tax Registration Numbers for this seller — shown on the printed receipt,
          not sent to FBR. With one STRN it prints automatically under the CNIC; with
          several, the user picks which to show from a dropdown on the invoice view (the
          list shows the business name only).
        </p>
        {strns.length === 0 && (
          <p className="muted" style={{ marginTop: 0 }}>No STRNs added.</p>
        )}
        {strns.map((row, i) => (
          <div
            key={i}
            className="row-actions"
            style={{ gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}
          >
            <div className="field" style={{ flex: 2, margin: 0 }}>
              <label>Business name</label>
              <input
                value={row.business_name}
                onChange={setStrn(i, 'business_name')}
                placeholder="Trade name for this registration"
              />
            </div>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label>STRN</label>
              <input
                value={row.strn}
                onChange={setStrn(i, 'strn')}
                placeholder="3277876122773"
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => removeStrn(i)}
              aria-label="Remove STRN"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" onClick={addStrn}>
          <Plus size={14} /> Add STRN
        </button>

        <div style={{ marginTop: '1.5rem' }}>
          <button className="btn btn-primary">
            <Save size={16} /> Save settings
          </button>
        </div>
      </form>
    </>
  )
}
