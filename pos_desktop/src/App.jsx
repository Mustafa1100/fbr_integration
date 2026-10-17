import { useCallback, useEffect, useState } from 'react'
import { FilePlus, FileText, LayoutDashboard, Package, Settings as SettingsIcon } from 'lucide-react'
import { api, formatDay, onChanged } from './api.js'
import shield from './assets/shield.png'
import Billing from './pages/Billing.jsx'
import Catalog from './pages/Catalog.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Invoices from './pages/Invoices.jsx'
import Login from './pages/Login.jsx'
import Settings from './pages/Settings.jsx'

const SERVICE_POLL_MS = 30_000
// Start warning this many days before the subscription runs out.
const RENEWAL_WARNING_DAYS = 7

// The app always opens on the first page, Generate invoices.
const PAGES = [
  { id: 'billing', label: 'Generate invoices', icon: FilePlus },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'catalog', label: 'Items', icon: Package },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

export default function App() {
  const [page, setPage] = useState(PAGES[0].id)
  const [account, setAccount] = useState(null)
  const [settings, setSettings] = useState(null)
  const [service, setService] = useState(null)
  const [stats, setStats] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    const [a, s, st] = await Promise.all([api.accountState(), api.getSettings(), api.todayStats()])
    setAccount(a)
    setSettings(s)
    setStats(st)
  }, [])

  useEffect(() => {
    refresh()
    return onChanged(refresh)
  }, [refresh])

  const signedIn = account?.signedIn
  const mode = settings?.mode
  const serviceUrl = settings?.service_url
  useEffect(() => {
    if (!signedIn || mode !== 'fbr') {
      setService(null)
      return undefined
    }
    let cancelled = false
    const check = () => api.checkService(serviceUrl).then((r) => !cancelled && setService(r))
    check()
    const timer = setInterval(check, SERVICE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [signedIn, mode, serviceUrl])

  if (!account || !settings) return null
  if (!account.signedIn) return <Login onSignedIn={refresh} />

  // Settings and subscription from the portal (Settings page, locked banner).
  async function refreshFromPortal() {
    setRefreshing(true)
    try {
      await api.syncAccount()
    } finally {
      setRefreshing(false)
      refresh()
    }
  }

  const { license } = account
  let status = { tone: 'amber', text: 'Demo mode', hint: 'Nothing is sent to FBR' }
  if (mode === 'fbr') {
    if (!service) status = { tone: 'slate', text: 'Checking FBR service…', hint: '' }
    else if (service.ok) {
      status = {
        tone: 'green',
        text: 'FBR service connected',
        hint: settings.environment === 'live' ? 'Live' : 'Test component',
      }
    } else status = { tone: 'red', text: 'FBR service not responding', hint: 'Sales will be queued' }
  }

  const expiringSoon =
    license.allowed && account.daysLeft !== null && account.daysLeft <= RENEWAL_WARNING_DAYS

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img className="brand-mark" src={shield} alt="" />
          <div>
            <div className="t1">Compliance</div>
            <div className="t2">Pakistan</div>
            {/* The client's business, as set in the portal. */}
            <div className="t3" title={settings.business_name || undefined}>
              {settings.business_name || 'Point of sale'}
            </div>
          </div>
        </div>
        <nav>
          {PAGES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
              title={label}
              aria-label={label}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === 'invoices' && stats?.queued > 0 && (
                <span className="nav-count">{stats.queued}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer" title={[status.text, status.hint].filter(Boolean).join(' · ')}>
          <div className={`status-dot ${status.tone}`} />
          <div>
            <div className="status-text">{status.text}</div>
            {status.hint && <div className="status-hint">{status.hint}</div>}
          </div>
        </div>
      </aside>

      <main className="content">
        {!license.allowed && (
          <div className="banner locked">
            <span>{license.message}</span>
            <button type="button" className="btn small" onClick={refreshFromPortal} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        )}
        {expiringSoon && (
          <div className="banner">
            <span>
              Your subscription ends on {formatDay(account.expiresAt)}
              {account.daysLeft <= 1 ? ' (today or tomorrow)' : ` (${account.daysLeft} days left)`}.
              Contact your provider to renew.
            </span>
          </div>
        )}
        {page === 'billing' && <Billing settings={settings} locked={!license.allowed} onSold={refresh} />}
        {page === 'dashboard' && <Dashboard />}
        {page === 'invoices' && <Invoices stats={stats} locked={!license.allowed} onChange={refresh} />}
        {page === 'catalog' && <Catalog settings={settings} />}
        {page === 'settings' && (
          <Settings
            settings={settings}
            account={account}
            service={service}
            refreshing={refreshing}
            onRefresh={refreshFromPortal}
            onSaved={refresh}
          />
        )}
      </main>
    </div>
  )
}
