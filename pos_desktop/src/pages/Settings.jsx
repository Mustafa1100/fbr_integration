import { useEffect, useState } from 'react'
import { LogOut, RefreshCw } from 'lucide-react'
import { api, formatDay, formatDayTime } from '../api.js'

const MODE_LABEL = { demo: 'Demo — nothing is sent to FBR', fbr: 'FBR — every invoice is sent' }
const ENVIRONMENT_LABEL = { test: 'Test (sandbox)', live: 'Live (production)' }

export default function Settings({ settings, account, service, refreshing, onRefresh, onSaved }) {
  const [form, setForm] = useState(settings)
  const [printers, setPrinters] = useState([])
  const [check, setCheck] = useState(null)
  const [checking, setChecking] = useState(false)
  const [info, setInfo] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listPrinters().then(setPrinters).catch(() => setPrinters([]))
    api.appInfo().then(setInfo).catch(() => setInfo(null))
  }, [])

  const set = (patch) => {
    setForm({ ...form, ...patch })
    setSaved(false)
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    try {
      await api.saveSettings({
        printer: form.printer,
        silent_print: !!form.silent_print,
        paper_width: Number(form.paper_width) || 80,
        receipt_footer: form.receipt_footer,
      })
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(err.message)
    }
  }

  async function checkService() {
    setChecking(true)
    setCheck(await api.checkService().catch((err) => ({ ok: false, message: err.message })))
    setChecking(false)
  }

  async function signOut() {
    const ok = window.confirm(
      'Sign out of this computer? Your invoices and items stay on it, but nobody can issue ' +
        'invoices until someone signs in again.'
    )
    if (!ok) return
    await api.logout()
    onSaved()
  }

  const result = check || (settings.mode === 'fbr' ? service : null)
  // Read-only: these are managed in the admin portal.
  const managed = [
    ['Business name', settings.business_name],
    ['Phone', settings.phone],
    ['NTN', settings.ntn],
    ['STRN', settings.strn],
    ['Address', settings.address],
    ['FBR mode', MODE_LABEL[settings.mode]],
    ['Fiscal component', ENVIRONMENT_LABEL[settings.environment]],
    ['POS ID', settings.pos_id],
    ['Fiscal service address', settings.service_url],
    ['Invoice number prefix', settings.usin_prefix],
    ['Item prices', settings.prices_include_tax ? 'Already include tax' : 'Tax is added on top'],
    ['Default tax rate', `${settings.default_tax_rate}%`],
    ['Default PCT code', settings.default_pct_code],
  ]

  return (
    <div className="page settings">
      <h1>Settings</h1>

      <section className="card">
        <div className="page-head">
          <h2>Account</h2>
          <button type="button" className="btn ghost" onClick={signOut}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
        <dl className="facts">
          <div className="fact">
            <dt>Signed in as</dt>
            <dd className="mono">{account.username}</dd>
          </div>
          <div className="fact">
            <dt>Subscription</dt>
            <dd>
              {account.expiresAt ? (
                <>
                  {account.planName} ·{' '}
                  {account.subscriptionStatus === 'cancelled'
                    ? 'cancelled on'
                    : account.license.reason === 'expired'
                      ? 'expired on'
                      : 'runs until'}{' '}
                  <strong>{formatDay(account.expiresAt)}</strong>
                </>
              ) : (
                'None yet'
              )}
            </dd>
          </div>
          <div className="fact">
            <dt>Last refreshed</dt>
            <dd>{formatDayTime(account.lastSyncAt)}</dd>
          </div>
          <div className="fact">
            <dt>Invoice backup</dt>
            <dd>
              {formatDayTime(account.lastBackupAt)}
              {account.backupPending > 0 && (
                <span className="muted">
                  {' '}
                  · {account.backupPending} waiting to upload
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <div className="page-head">
          <h2>Business and FBR settings</h2>
          <button type="button" className="btn ghost" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={16} /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className="muted">
          These are set by your provider. If something here is wrong, ask them to change it, then
          press Refresh.
        </p>
        <dl className="facts">
          {managed.map(([label, value]) => (
            <div key={label} className="fact">
              <dt>{label}</dt>
              <dd>{value || 'N/A'}</dd>
            </div>
          ))}
        </dl>
        <div className="inline">
          <button type="button" className="btn ghost" onClick={checkService} disabled={checking}>
            {checking ? 'Checking…' : 'Check FBR service'}
          </button>
          {result && (
            <span className={`badge ${result.ok ? 'fiscalized' : 'failed'}`}>{result.message}</span>
          )}
        </div>
      </section>

      <form className="card" onSubmit={save}>
        <div className="page-head">
          <h2>Receipt printing</h2>
          <button type="submit" className="btn">
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="form-grid two">
          <label>
            Printer
            <select value={form.printer} onChange={(e) => set({ printer: e.target.value })}>
              <option value="">Windows default printer</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Paper width
            <select value={form.paper_width} onChange={(e) => set({ paper_width: Number(e.target.value) })}>
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </select>
          </label>
          <label className="span-2">
            Footer text
            <input value={form.receipt_footer ?? ''} onChange={(e) => set({ receipt_footer: e.target.value })} />
          </label>
          <label className="check span-2">
            <input
              type="checkbox"
              checked={!!form.silent_print}
              onChange={(e) => set({ silent_print: e.target.checked })}
            />
            Print straight away without showing the Windows print dialog
          </label>
        </div>
      </form>

      {info && (
        <p className="muted">
          Version {info.version} · Data file: <span className="mono">{info.dataFile}</span>
        </p>
      )}
    </div>
  )
}
