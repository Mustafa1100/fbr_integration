import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CalendarX2, Loader2, Moon } from 'lucide-react'
import { api } from '../api'
import Modal from './Modal'
import { fmtDate, fmtMoney, plural } from '../planDates'

// Three short lists on the admin dashboard: users whose plan ends within
// 7 days, users whose plan has expired, and users with no recent invoices.
export function AttentionLists() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/admin/stats/attention').then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="alert error">{error}</div>
  if (!data) {
    return (
      <div className="loading">
        <Loader2 size={16} className="spin" /> Loading users…
      </div>
    )
  }

  return (
    <div className="attention-grid">
      <AttentionCard
        icon={CalendarClock}
        tint="tint-amber"
        title="Plans ending in 7 days"
        block={data.expiring}
        empty="No plans ending this week."
        more="/admin/users?plan=expiring"
        right={(u) => (
          <span className="badge warn">{u.days_left === 1 ? 'tomorrow' : `${u.days_left} days`}</span>
        )}
        sub={(u) => `Ends ${fmtDate(u.ends_on)}`}
      />
      <AttentionCard
        icon={CalendarX2}
        tint="tint-red"
        title="Plans expired"
        block={data.expired}
        empty="No expired plans."
        more="/admin/users?plan=expired"
        right={(u) => (
          <span className="badge failed">
            {u.days_left === 0 ? 'today' : `${plural(-u.days_left, 'day')} ago`}
          </span>
        )}
        sub={(u) => `Expired ${fmtDate(u.ends_on)}`}
      />
      <AttentionCard
        icon={Moon}
        tint="tint-slate"
        title={`No invoices in ${data.idle_days} days`}
        block={data.idle}
        empty="Everyone has made an invoice recently."
        right={(u) =>
          u.last_invoice_at ? (
            <span className="badge draft">{daysAgo(u.last_invoice_at)}</span>
          ) : (
            <span className="badge draft">never</span>
          )
        }
        sub={(u) => (u.last_invoice_at ? `Last invoice ${fmtDate(u.last_invoice_at)}` : 'No invoices yet')}
      />
    </div>
  )
}

function daysAgo(iso) {
  const then = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
  const days = Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000))
  return days === 0 ? 'today' : `${plural(days, 'day')} ago`
}

function AttentionCard({ icon: Icon, tint, title, block, empty, more, right, sub }) {
  const hidden = block.total - block.users.length
  return (
    <div className="card attention-card">
      <div className="attention-head">
        <span className={`attention-icon ${tint}`}>
          <Icon size={16} />
        </span>
        <h3>{title}</h3>
        <span className="attention-count">{block.total}</span>
      </div>
      {block.users.length === 0 ? (
        <p className="muted small attention-empty">{empty}</p>
      ) : (
        <ul className="attention-list">
          {block.users.map((u) => (
            <li key={u.id}>
              <Link to={`/admin/users/${u.id}`} className="attention-user">
                <span className="attention-name">{u.full_name}</span>
                <span className="muted small">{sub(u)}</span>
              </Link>
              {right(u)}
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 &&
        (more ? (
          <Link to={more} className="attention-more">
            View all {block.total}
          </Link>
        ) : (
          <p className="muted small attention-more">+ {hidden} more</p>
        ))}
    </div>
  )
}

const ENV_LABEL = { production: 'Live', sandbox: 'Test', mock: 'Mock' }

// Money totals are slow to add up on a big database, so they only load
// when this pop-up opens.
export function AdvancedStatsModal({ onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/admin/stats/advanced').then(setData).catch((e) => setError(e.message))
  }, [])

  const envs = data
    ? ['production', 'sandbox', 'mock'].filter((e) => data.by_env[e])
    : []

  return (
    <Modal title="Advanced stats" onClose={onClose} width={880}>
      {error && <div className="alert error">{error}</div>}
      {!data && !error && (
        <div className="loading">
          <Loader2 size={18} className="spin" /> Adding up all submitted invoices…
        </div>
      )}
      {data && envs.length === 0 && <p className="muted">No submitted invoices yet.</p>}
      {data && envs.length > 0 && (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Totals of all invoices submitted to FBR, for every user.
          </p>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Invoices</th>
                  <th>Sales value (excl. tax)</th>
                  <th>Total tax</th>
                  <th>Total incl. tax</th>
                </tr>
              </thead>
              <tbody>
                {envs.map((e) => {
                  const r = data.by_env[e]
                  return (
                    <tr key={e}>
                      <td>
                        <span className={`badge ${e === 'production' ? 'submitted' : 'draft'}`}>{ENV_LABEL[e] || e}</span>
                      </td>
                      <td>{r.invoices.toLocaleString()}</td>
                      <td className="nowrap">{fmtMoney(r.sales_value_excl)}</td>
                      <td className="nowrap strong">{fmtMoney(r.tax)}</td>
                      <td className="nowrap">{fmtMoney(r.grand_total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
