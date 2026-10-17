import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatDate } from '../api.js'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/admin/stats').then(setStats).catch((err) => setError(err.message))
  }, [])

  if (error) return <div className="alert error">{error}</div>
  if (!stats) return null

  const cards = [
    ['Item requests waiting', stats.pending_item_requests, '/requests'],
    ['Clients', stats.clients],
    ['Subscribed', stats.active],
    ['Expiring within 7 days', stats.expiring],
    ['Expired', stats.expired],
    ['No plan yet', stats.no_plan],
  ]

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <div className="stat-row">
        {cards.map(([label, value, to]) =>
          to ? (
            <Link key={label} to={to} className={`stat link ${value > 0 ? 'attention' : ''}`}>
              <span>{label}</span>
              <strong>{value}</strong>
            </Link>
          ) : (
            <div key={label} className="stat">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          )
        )}
      </div>

      <div className="card table-card">
        <div className="card-title">Expiring within 7 days</div>
        <table className="stack-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Business</th>
              <th>Plan</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {stats.expiring_clients.map((c) => (
              <tr key={c.id}>
                <td data-label="Username">
                  <Link to={`/clients/${c.id}`}>{c.username}</Link>
                </td>
                <td data-label="Business">{c.business_name || 'N/A'}</td>
                <td data-label="Plan">{c.plan_name}</td>
                <td data-label="Expires">{formatDate(c.expires_at)}</td>
              </tr>
            ))}
            {!stats.expiring_clients.length && (
              <tr>
                <td colSpan={4} className="muted empty">
                  No subscriptions are about to expire.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
