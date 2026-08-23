import { Server, ShieldCheck, Info } from 'lucide-react'
import usePageTitle from '../../hooks/usePageTitle'

const HOSTING = [
  { label: 'Hosting provider', value: 'Fly.io, Inc.' },
  { label: 'App name', value: 'fbr-integration-api' },
  { label: 'Region / hosting server country', value: 'Singapore (sin)' },
]

const WHITELISTED_IPS = [
  {
    ip: '209.71.80.81',
    kind: 'Production',
    note: 'Static app-scoped egress IP the backend uses for all outbound calls to gw.fbr.gov.pk. This is the one submitted to PRAL as the production/live IP.',
  },
  {
    ip: '153.117.41.186',
    kind: 'Local testing',
    note: "A developer's local static IP, whitelisted separately for testing directly against FBR outside of the deployed server.",
  },
]

export default function ServerInfo() {
  usePageTitle('Server / IP Info')
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Server size={22} /> Server / IP Info
          </h1>
          <p className="page-sub">
            Hosting and IP whitelisting details submitted to PRAL under IRIS → API Integration →
            IP Whitelisting — kept here so any admin can reference them without digging through
            chat history.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem' }}>
          <Server size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
          Hosting details
        </h3>
        <div
          className="muted"
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.88rem' }}
        >
          {HOSTING.map((row) => (
            <span key={row.label}>
              <strong>{row.label}:</strong> {row.value}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem' }}>
          <ShieldCheck size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
          Whitelisted IPs
        </h3>
        {WHITELISTED_IPS.map((row) => (
          <div key={row.ip} style={{ margin: '0 0 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge info mono">{row.ip}</span>
              <span className="strong">{row.kind}</span>
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-2)', fontSize: '0.86rem' }}>
              {row.note}
            </p>
          </div>
        ))}
      </div>

      <div className="alert info">
        <Info size={17} />
        <span>
          PRAL accepts or rejects submitted IPs within 2 working hours of submission. Check the
          Status column on IRIS&apos;s own IP Whitelisting screen to confirm current
          Pending/Approved/Rejected state — this page is a static reference, not a live sync with
          IRIS.
        </span>
      </div>
    </>
  )
}
