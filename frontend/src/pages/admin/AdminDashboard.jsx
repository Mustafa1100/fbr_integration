import StatValue from '../../components/StatValue'
import { useEffect, useState } from 'react'
import { AdvancedStatsModal, AttentionLists } from '../../components/AdminAttention'
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  UploadCloud,
  ReceiptText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  PieChart,
  Loader2,
  UserPlus,
  BarChart3,
} from 'lucide-react'
import { api } from '../../api'
import { TrendChart, DonutChart, BarChart } from '../../components/Charts'
import usePageTitle from '../../hooks/usePageTitle'

const GROWTH_GRANULARITIES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

export default function AdminDashboard() {
  usePageTitle('Admin Dashboard')
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [growth, setGrowth] = useState(null)
  const [granularity, setGranularity] = useState('day')
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    api.get('/api/admin/stats').then(setStats).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    api
      .get(`/api/admin/stats/user-growth?granularity=${granularity}`)
      .then(setGrowth)
      .catch((e) => setError(e.message))
  }, [granularity])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <LayoutDashboard size={22} /> Admin Dashboard
          </h1>
          <p className="page-sub">Overview of users and FBR invoicing activity.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => setShowAdvanced(true)}>
            <BarChart3 size={16} /> Advanced stats
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {!stats && !error && (
        <div className="loading">
          <Loader2 size={18} className="spin" /> Loading dashboard…
        </div>
      )}

      {stats && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon tint-blue">
              <Users size={20} />
            </div>
            <div>
              <StatValue value={stats.total_users} />
              <div className="stat-label">Users ({stats.active_users} active)</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-green">
              <ShieldCheck size={20} />
            </div>
            <div>
              <StatValue value={stats.total_admins} />
              <div className="stat-label">Admins ({stats.total_regular_users} regular users)</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-slate">
              <UploadCloud size={20} />
            </div>
            <div>
              <StatValue value={stats.total_uploads} />
              <div className="stat-label">CSV/Excel uploads</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-amber">
              <ReceiptText size={20} />
            </div>
            <div>
              <StatValue value={stats.total_invoices} />
              <div className="stat-label">Invoices</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-green">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <StatValue value={stats.submitted_invoices} />
              <div className="stat-label">Submitted to FBR</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-red">
              <XCircle size={20} />
            </div>
            <div>
              <StatValue value={stats.failed_invoices} />
              <div className="stat-label">Failed</div>
            </div>
          </div>
        </div>
      )}

      <h2 className="section-title">Needs attention</h2>
      <AttentionLists />

      {stats && (
        <div className="chart-grid">
          <div className="card">
            <h3 style={{ margin: '0 0 4px', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 7 }}>
              <TrendingUp size={16} /> Invoices, last 14 days
            </h3>
            <p className="muted" style={{ margin: '0 0 10px' }}>
              Submitted (green) vs failed (red) per day.
            </p>
            <TrendChart data={stats.invoices_by_day} />
          </div>
          <div className="card">
            <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 7 }}>
              <PieChart size={16} /> Invoice status
            </h3>
            <DonutChart
              segments={[
                { label: 'Submitted', value: stats.submitted_invoices, color: 'var(--brand-500)' },
                { label: 'Failed', value: stats.failed_invoices, color: 'var(--red-600)' },
                { label: 'Draft', value: stats.draft_invoices, color: 'var(--border-strong)' },
              ]}
            />
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div
          className="row-actions"
          style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: 10 }}
        >
          <h3 style={{ margin: 0, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 7 }}>
            <UserPlus size={16} /> Users created
          </h3>
          <div className="row-actions" style={{ gap: 4 }}>
            {GROWTH_GRANULARITIES.map((g) => (
              <button
                key={g.value}
                type="button"
                className={`btn btn-sm ${granularity === g.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setGranularity(g.value)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
        {growth ? (
          <BarChart data={growth} />
        ) : (
          <div className="loading">
            <Loader2 size={16} className="spin" /> Loading…
          </div>
        )}
      </div>
      {showAdvanced && <AdvancedStatsModal onClose={() => setShowAdvanced(false)} />}
    </>
  )
}
