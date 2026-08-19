import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FlaskConical,
  Download,
  ListChecks,
  ExternalLink,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { API_BASE, api, getToken } from '../../api'

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some((v) => v !== '')) rows.push(row)
  }
  if (!rows.length) return []
  const header = rows[0]
  return rows
    .slice(1)
    .map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ''])))
}

// Activity/sector combos that resolve to the same 6-scenario "retail chain"
// set (SN001, SN002, SN008, SN026, SN027, SN028) — the baseline every
// distributor/wholesaler selling to retailers must pass, confirmed live
// against the real sandbox. One click loads them without hunting through
// the dropdowns below.
const QUICK_PRESETS = [
  {
    label: 'Distributor · Wholesale / Retails',
    activity: 'Distributor',
    sector: 'Wholesale / Retails',
  },
  {
    label: 'Wholesaler · Wholesale / Retails',
    activity: 'Wholesaler',
    sector: 'Wholesale / Retails',
  },
]

function guidanceFor(row) {
  if (!row) return []
  const notes = []
  notes.push(
    row.buyer_registration_type === 'Registered'
      ? 'Requires a Registered buyer — buyer_ntn_cnic must be filled in.'
      : 'Requires an Unregistered buyer — leave buyer_ntn_cnic blank.'
  )
  if (row.sale_type === '3rd Schedule Goods') {
    notes.push(
      'sale_type is "3rd Schedule Goods" — tax is computed off fixed_notified_value, not quantity × unit_price. Leave fixed_notified_value and unit_price (intentionally 0) as pre-filled.'
    )
  } else if (row.sale_type === 'Goods at Reduced Rate') {
    notes.push(
      'sale_type is "Goods at Reduced Rate" — tax is computed off the actual sale value, not fixed_notified_value (shown for reference only). The app already works around two FBR sandbox quirks for this sale type automatically — nothing extra to change.'
    )
  } else {
    notes.push(
      `sale_type is "${row.sale_type}" — leave hs_code, rate, uom, and sale_type pre-filled; they already match FBR's own official sample for this scenario.`
    )
  }
  notes.push(
    'Change pos_invoice_no to something unique and invoice_date to today, then have this business\'s own account upload the file from their Uploads page while FBR Settings are set to Sandbox.'
  )
  return notes
}

export default function ScenarioGuide() {
  const [options, setOptions] = useState({ activities: [], sectors: [] })
  const [activity, setActivity] = useState('')
  const [sector, setSector] = useState('')
  const [scenarios, setScenarios] = useState(null)
  const [rows, setRows] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/reference/business-activities')
      .then(setOptions)
      .catch((e) => setError(e.message))
  }, [])

  async function loadScenarios(a, s) {
    if (!a || !s) return
    setBusy(true)
    setError('')
    setScenarios(null)
    setRows({})
    try {
      const data = await api.get(
        `/api/reference/applicable-scenarios?activity=${encodeURIComponent(a)}&sector=${encodeURIComponent(s)}`
      )
      setScenarios(data.scenarios)
      const entries = await Promise.all(
        data.scenarios.map(async ({ code }) => {
          try {
            const text = await api.get(`/api/uploads/template?scenario=${code}`)
            const parsed = parseCsv(text)
            return [code, parsed[0] || null]
          } catch {
            return [code, null]
          }
        })
      )
      setRows(Object.fromEntries(entries))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function applyPreset(p) {
    setActivity(p.activity)
    setSector(p.sector)
    loadScenarios(p.activity, p.sector)
  }

  async function downloadTemplate(code) {
    const resp = await fetch(`${API_BASE}/api/uploads/template?scenario=${code}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const blob = await resp.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `fbr_template_${code}.csv`
    a.click()
    URL.revokeObjectURL(objectUrl)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <FlaskConical size={22} /> Scenario Testing Guide
          </h1>
          <p className="page-sub">
            Step-by-step walkthrough for passing every FBR sandbox scenario a business needs
            before PRAL issues them a production token.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem' }}>
          <ListChecks size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
          Before testing scenarios
        </h3>
        <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text-2)', fontSize: '0.88rem', lineHeight: 1.8 }}>
          <li>
            The business gets a <strong>sandbox token</strong> from IRIS (Digital Invoicing
            section) and confirms their seller NTN, business name, province, and address there.
          </li>
          <li>
            You configure that sandbox token and seller profile on their{' '}
            <Link to="/admin">FBR Settings</Link> page (set environment to Sandbox).
          </li>
          <li>
            Pick their business activity and sector below to see exactly which scenarios FBR
            requires them to pass.
          </li>
          <li>
            For each required scenario: download its template, apply the notes shown, and have
            <em> that business&apos;s own account</em> upload it from their Uploads page — sandbox
            submissions go out under their configured token.
          </li>
          <li>
            Once every required scenario shows &quot;submitted&quot;, confirm in IRIS&apos;s own
            &quot;Eligible Scenarios&quot; tracker (Environment Details) that all are marked
            Successful — that&apos;s what unlocks their production token.
          </li>
        </ol>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>
          <FlaskConical size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
          Quick start — the required 6
        </h3>
        <p className="muted" style={{ margin: '0 0 14px' }}>
          SN001, SN002, SN008, SN026, SN027, SN028 — the baseline every distributor/wholesaler
          selling to retailers must pass at any cost, confirmed live against the real sandbox.
          One click loads all 6 with templates and per-scenario notes, no dropdowns needed.
        </p>
        <div className="row-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
          {QUICK_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => applyPreset(p)}
            >
              <FlaskConical size={14} /> {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem' }}>Or pick manually</h3>
        <div className="form-grid">
          <div className="field">
            <label>Business activity</label>
            <select
              value={activity}
              onChange={(e) => {
                setActivity(e.target.value)
                loadScenarios(e.target.value, sector)
              }}
            >
              <option value="">Choose…</option>
              {options.activities.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Sector</label>
            <select
              value={sector}
              onChange={(e) => {
                setSector(e.target.value)
                loadScenarios(activity, e.target.value)
              }}
            >
              <option value="">Choose…</option>
              {options.sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <span>{error}</span>
        </div>
      )}

      {busy && (
        <div className="loading">
          <Loader2 size={18} className="spin" /> Loading required scenarios…
        </div>
      )}

      {scenarios && !busy && (
        <>
          <h2 className="section-title">
            <CheckCircle2 size={17} />
            {scenarios.length} required scenario{scenarios.length === 1 ? '' : 's'} for{' '}
            {activity} · {sector}
          </h2>

          {scenarios.map((s, idx) => {
            const row = rows[s.code]
            return (
              <div className="card" key={s.code} style={{ marginBottom: '1.1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="badge info">Step {idx + 1}</span>
                      <span className="strong" style={{ fontSize: '1rem' }}>
                        {s.code}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-2)', fontSize: '0.9rem' }}>
                      {s.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => downloadTemplate(s.code)}
                  >
                    <Download size={14} /> Download template
                  </button>
                </div>

                {row && (
                  <>
                    <div
                      className="muted"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px 18px',
                        margin: '14px 0',
                        fontSize: '0.82rem',
                      }}
                    >
                      <span>
                        <strong>sale_type:</strong> {row.sale_type}
                      </span>
                      <span>
                        <strong>rate:</strong> {row.rate}
                      </span>
                      <span>
                        <strong>hs_code:</strong> {row.hs_code}
                      </span>
                      <span>
                        <strong>buyer_registration_type:</strong> {row.buyer_registration_type}
                      </span>
                      {Number(row.fixed_notified_value) > 0 && (
                        <span>
                          <strong>fixed_notified_value:</strong> {row.fixed_notified_value}
                        </span>
                      )}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.86rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
                      {guidanceFor(row).map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )
          })}

          <div className="alert info">
            <ExternalLink size={17} />
            <span>
              After all of the above show &quot;submitted&quot; in Invoices, check IRIS&apos;s own
              Environment Details page (Successful Scenarios count) to confirm FBR agrees — that
              tracker is the source of truth for when a production token becomes available.
            </span>
          </div>
        </>
      )}
    </>
  )
}
