import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CreditCard, FileText, KeyRound, Package, Settings, XCircle } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, formatDate, formatDateTime, money, STATUS_LABEL } from '../api.js'
import ClientInvoices from '../components/ClientInvoices.jsx'
import ClientItems from '../components/ClientItems.jsx'
import CredentialsModal from '../components/CredentialsModal.jsx'

const TABS = [
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'items', label: 'Items', icon: Package },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function ClientDetail() {
  const { id } = useParams()
  // The open tab lives in the address (?tab=invoices), so a reload or a
  // shared link opens the same tab.
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : TABS[0].id
  const openTab = (next) => setParams(next === TABS[0].id ? {} : { tab: next }, { replace: true })
  const [client, setClient] = useState(null)
  const [form, setForm] = useState(null)
  const [plans, setPlans] = useState([])
  const [credentials, setCredentials] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  // Settings edited but not saved yet; they survive switching tabs.
  const [dirty, setDirty] = useState(false)

  // Server state in, editable copy out: the form mirrors what was loaded.
  const load = useCallback((data) => {
    setClient(data)
    setDirty(false)
    setForm({
      contact_name: data.contact_name,
      contact_phone: data.contact_phone,
      notes: data.notes,
      is_active: data.is_active,
      config: { ...data.config },
    })
  }, [])

  useEffect(() => {
    api.get(`/api/admin/clients/${id}`).then(load).catch((err) => setError(err.message))
    api.get('/api/admin/plans').then(setPlans).catch((err) => setError(err.message))
  }, [id, load])

  if (!client || !form) return error ? <div className="alert error">{error}</div> : null

  const set = (patch) => {
    setSaved(false)
    setDirty(true)
    setForm({ ...form, ...patch })
  }
  const setConfig = (patch) => set({ config: { ...form.config, ...patch } })
  const text = (field) => ({
    value: form.config[field] ?? '',
    onChange: (e) => setConfig({ [field]: e.target.value }),
  })

  async function run(action) {
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err.message)
    }
  }

  const save = (event) => {
    event.preventDefault()
    run(async () => {
      load(
        await api.put(`/api/admin/clients/${id}`, {
          ...form,
          config: { ...form.config, default_tax_rate: Number(form.config.default_tax_rate) || 0 },
        })
      )
      setSaved(true)
    })
  }

  const toggleActive = () => {
    const question = client.is_active
      ? `Deactivate ${client.username}? The desktop app stops working at its next refresh.`
      : `Reactivate ${client.username}?`
    if (!window.confirm(question)) return
    run(async () =>
      load(await api.put(`/api/admin/clients/${id}`, { ...form, is_active: !client.is_active }))
    )
  }

  const resetPassword = () => {
    const ok = window.confirm(
      `Issue a new password for ${client.username}? The current one stops working and the ` +
        'desktop app is signed out at its next refresh.'
    )
    if (ok) run(async () => setCredentials(await api.post(`/api/admin/clients/${id}/reset-password`)))
  }

  // Only one plan runs at a time: while one runs, it has to be cancelled
  // before another can be assigned (the server refuses it too).
  const running = ['active', 'expiring'].includes(client.subscription_status)
  const current = running ? client.subscriptions[0] : null
  const past = running ? client.subscriptions.slice(1) : client.subscriptions
  const daysLeft = current ? Math.max(Math.ceil((new Date(current.expires_at) - new Date()) / 86400000), 0) : 0
  const assign = (plan) => {
    const what = `${plan.name} plan (${plan.months} ${plan.months === 1 ? 'month' : 'months'}, Rs ${money(plan.price)})`
    if (!window.confirm(`Give ${client.username} the ${what}, starting today?`)) return
    // setClient, not load: unsaved edits in the Settings tab stay.
    run(async () => setClient(await api.post(`/api/admin/clients/${id}/subscriptions`, { plan_id: plan.id })))
  }

  const cancelSubscription = () => {
    const ok = window.confirm(
      `Cancel ${client.username}'s ${client.plan_name} plan now? Their desktop app stops issuing ` +
        'invoices within a few minutes if it is online, or as soon as it next connects.'
    )
    if (ok) run(async () => setClient(await api.post(`/api/admin/clients/${id}/subscriptions/cancel`)))
  }

  // How a past plan ended. "Replaced" only appears on plans from before a
  // running plan had to be cancelled first.
  const howEnded = (sub) => {
    if (sub.end_reason === 'cancelled') return ['Cancelled', 'cancelled']
    if (sub.end_reason === 'replaced') return ['Replaced', '']
    return ['Expired', 'expired']
  }
  return (
    <div className="page">
      <Link to="/clients" className="back-link">
        <ArrowLeft size={15} /> Clients
      </Link>
      <div className="page-head">
        <div>
          <h1 className="mono">{client.username}</h1>
          <div className="muted">
            Created {formatDate(client.created_at)} · Last seen {formatDateTime(client.last_sync_at)} ·
            Last backup {formatDateTime(client.last_backup_at)} · {client.usin_seq} invoices numbered so far
          </div>
        </div>
        <div className="inline">
          <button type="button" className="btn ghost" onClick={resetPassword}>
            <KeyRound size={16} /> Reset password
          </button>
          <button type="button" className={`btn ${client.is_active ? 'danger' : ''}`} onClick={toggleActive}>
            {client.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!client.is_active && (
        <div className="alert warn">This account is deactivated. The desktop app cannot be used.</div>
      )}

      <nav className="page-tabs" role="tablist" aria-label="Client sections">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            type="button"
            role="tab"
            aria-selected={tab === tabId}
            className={`page-tab ${tab === tabId ? 'active' : ''}`}
            onClick={() => openTab(tabId)}
          >
            <Icon size={16} />
            {label}
            {tabId === 'subscription' && (
              <span className={`badge tab-badge ${client.subscription_status}`}>
                {STATUS_LABEL[client.subscription_status]}
              </span>
            )}
            {tabId === 'items' && <span className="tab-count">{client.items.length}</span>}
            {tabId === 'settings' && dirty && (
              <span className="tab-dot" title="Unsaved changes" aria-label="Unsaved changes" />
            )}
          </button>
        ))}
      </nav>

      {tab === 'subscription' && (
        <section className="card">
          <div className="page-head">
            <h2>Current plan</h2>
            {running && (
              <button type="button" className="btn danger" onClick={cancelSubscription}>
                <XCircle size={16} /> Cancel subscription
              </button>
            )}
          </div>

          {current ? (
            <div className="current-plan">
              <div className="current-plan-main">
                <span className={`badge ${client.subscription_status}`}>
                  {STATUS_LABEL[client.subscription_status]}
                </span>
                <strong>{current.plan_name}</strong>
                <span className="muted">
                  {current.plan_months} {current.plan_months === 1 ? 'month' : 'months'} · Rs {money(current.price)}
                </span>
              </div>
              <dl className="facts">
                <div className="fact">
                  <dt>Started</dt>
                  <dd>{formatDate(current.starts_at)}</dd>
                </div>
                <div className="fact">
                  <dt>Runs until</dt>
                  <dd>
                    <strong>{formatDate(current.expires_at)}</strong> ({daysLeft} {daysLeft === 1 ? 'day' : 'days'} left)
                  </dd>
                </div>
                <div className="fact">
                  <dt>Assigned by</dt>
                  <dd>{current.created_by || 'N/A'}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <>
              <p className="muted">
                {client.subscription_status === 'none'
                  ? 'No plan has been assigned yet. The desktop app cannot issue invoices until one is.'
                  : `No plan is running (the last one ${client.subscription_status === 'cancelled' ? 'was cancelled' : 'expired'} on ${formatDate(client.expires_at)}). The desktop app cannot issue invoices. Choose a plan to start it today.`}
              </p>
              <div className="plan-buttons">
                {plans.map((plan) => (
                  <button key={plan.id} type="button" className="plan-button" onClick={() => assign(plan)}>
                    <strong>{plan.name}</strong>
                    <span>
                      {plan.months} {plan.months === 1 ? 'month' : 'months'}
                    </span>
                    <span className="plan-price">Rs {money(plan.price)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {running && (
            <p className="muted small">
              Only one plan runs at a time. To put the client on a different plan, cancel this one
              first; the new plan then starts on the day it is assigned.
            </p>
          )}

          {past.length > 0 && (
            <>
              <h3>Past plans</h3>
              <div className="table-card inner">
                <table className="stack-table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Paid period</th>
                      <th>Ended</th>
                      <th className="num">Price</th>
                      <th>Assigned by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.map((sub) => {
                      const [label, tone] = howEnded(sub)
                      const early = sub.end_reason && sub.expires_at < sub.planned_expires_at
                      return (
                        <tr key={sub.id}>
                          <td data-label="Plan">{sub.plan_name}</td>
                          <td data-label="Paid period">
                            {formatDate(sub.starts_at)} – {formatDate(sub.planned_expires_at)}
                          </td>
                          <td data-label="Ended">
                            <span className={`badge ${tone}`}>{label}</span>
                            {formatDate(sub.expires_at)}
                            {early && <span className="muted small"> (early)</span>}
                          </td>
                          <td className="num" data-label="Price">{money(sub.price)}</td>
                          <td data-label="Assigned by">{sub.created_by}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'invoices' && <ClientInvoices clientId={id} />}

      {tab === 'items' && (
        <ClientItems
          clientId={id}
          items={client.items}
          defaults={client.config}
          // Only the item list is refreshed, so unsaved edits in the Settings
          // tab are not thrown away.
          onChanged={() =>
            run(async () => {
              const fresh = await api.get(`/api/admin/clients/${id}`)
              setClient((current) => ({ ...current, items: fresh.items }))
            })
          }
        />
      )}

      {tab === 'settings' && (
        <form className="card form-stack" onSubmit={save}>
          <div className="page-head">
            <h2>Business and FBR settings</h2>
            <button type="submit" className="btn">
              {saved ? 'Saved' : 'Save settings'}
            </button>
          </div>
          <p className="muted">
            The desktop app downloads these at sign-in and whenever it refreshes. They cannot be
            changed on the POS computer.
          </p>

          <h3>Business (printed on receipts)</h3>
          <div className="form-grid two">
            <label>
              Business name
              <input {...text('business_name')} />
            </label>
            <label>
              Phone
              <input {...text('phone')} />
            </label>
            <label>
              NTN
              <input {...text('ntn')} />
            </label>
            <label>
              STRN (if registered for sales tax)
              <input {...text('strn')} />
            </label>
            <label className="span-2">
              Address
              <input {...text('address')} />
            </label>
          </div>

          <h3>FBR connection</h3>
          <div className="form-grid two">
            <label>
              Mode
              <select value={form.config.mode} onChange={(e) => setConfig({ mode: e.target.value })}>
                <option value="demo">Demo — nothing is sent to FBR</option>
                <option value="fbr">FBR — send every invoice to the fiscal component</option>
              </select>
            </label>
            <label>
              Fiscal component installed on the POS computer
              <select
                value={form.config.environment}
                onChange={(e) => setConfig({ environment: e.target.value })}
              >
                <option value="test">Test (sandbox)</option>
                <option value="live">Live (production)</option>
              </select>
            </label>
            <label>
              POS ID (registration number from FBR)
              <input {...text('pos_id')} inputMode="numeric" />
            </label>
            <label>
              Fiscal service address
              <input {...text('service_url')} />
            </label>
          </div>

          <h3>Invoices and tax</h3>
          <div className="form-grid two">
            <label>
              Invoice number prefix
              <input {...text('usin_prefix')} maxLength={20} />
            </label>
            <label>
              Item prices
              <select
                value={form.config.prices_include_tax ? 'yes' : 'no'}
                onChange={(e) => setConfig({ prices_include_tax: e.target.value === 'yes' })}
              >
                <option value="no">Do not include tax (tax is added on top)</option>
                <option value="yes">Already include tax</option>
              </select>
            </label>
            <label>
              Default tax rate %
              <input type="number" min="0" max="100" step="any" {...text('default_tax_rate')} />
            </label>
            <label>
              Default PCT code
              <input {...text('default_pct_code')} maxLength={8} />
            </label>
          </div>

          <h3>Contact (admin only, not sent to the desktop app)</h3>
          <div className="form-grid two">
            <label>
              Contact person
              <input value={form.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
            </label>
            <label>
              Contact phone
              <input value={form.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} />
            </label>
            <label className="span-2">
              Notes
              <input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
            </label>
          </div>
        </form>
      )}

      {credentials && (
        <CredentialsModal
          title="New password issued"
          username={credentials.username}
          password={credentials.password}
          onDone={() => setCredentials(null)}
        />
      )}
    </div>
  )
}
