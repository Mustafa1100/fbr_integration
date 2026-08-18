import { useEffect, useState } from 'react'
import { api } from '../../api'
import { Settings2, Globe, Building2, Info, Loader2, AlertCircle } from 'lucide-react'

const ENV_LABELS = {
  mock: 'Mock (simulated responses)',
  sandbox: 'Sandbox (PRAL scenario testing)',
  production: 'Production (live invoicing)',
}

export default function FbrSettings() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/settings/fbr')
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error)
    return (
      <div className="alert error">
        <AlertCircle size={17} />
        <span>{error}</span>
      </div>
    )
  if (!data)
    return (
      <div className="loading">
        <Loader2 size={18} className="spin" /> Loading…
      </div>
    )

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings2 size={22} /> FBR Settings
          </h1>
          <p className="page-sub">Your account's FBR / PRAL digital invoicing configuration.</p>
        </div>
      </div>

      <div className="alert info">
        <Info size={17} />
        <span>
          These settings are managed by your administrator. Contact them if the environment,
          token, or seller details need to change.
        </span>
      </div>

      <div className="card">
        <h2 className="section-title">
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
            <label>NTN / CNIC</label>
            <div>{data.seller_ntn_cnic || '—'}</div>
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
  )
}
