import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  UploadCloud,
  ReceiptText,
  CheckCircle2,
  XCircle,
  Banknote,
  Landmark,
  Wallet,
  AlertCircle,
  TrendingUp,
  PieChart,
  Loader2,
} from 'lucide-react'
import { api, getStoredUser } from '../../api'
import { TrendChart, DonutChart } from '../../components/Charts'
import usePageTitle from '../../hooks/usePageTitle'

export default function Dashboard() {
  usePageTitle('Dashboard')
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const user = getStoredUser()

  useEffect(() => {
    api.get('/api/stats').then(setStats).catch((e) => setError(e.message))
  }, [])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <LayoutDashboard size={22} /> Dashboard
          </h1>
          <p className="page-sub">
            {user?.full_name ? `Welcome back, ${user.full_name}. ` : ''}
            Overview of your CSV uploads and FBR invoicing activity.
          </p>
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
            <div className="stat-icon tint-slate">
              <UploadCloud size={20} />
            </div>
            <div>
              <div className="stat-value">{stats.total_uploads}</div>
              <div className="stat-label">CSV uploads</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-amber">
              <ReceiptText size={20} />
            </div>
            <div>
              <div className="stat-value">{stats.total_invoices}</div>
              <div className="stat-label">Invoices</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-green">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="stat-value">{stats.submitted_invoices}</div>
              <div className="stat-label">Submitted to FBR</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-red">
              <XCircle size={20} />
            </div>
            <div>
              <div className="stat-value">{stats.failed_invoices}</div>
              <div className="stat-label">Failed</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-blue">
              <Banknote size={20} />
            </div>
            <div>
              <div className="stat-value">{stats.total_sales_value.toLocaleString()}</div>
              <div className="stat-label">Total sales value</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-blue">
              <Landmark size={20} />
            </div>
            <div>
              <div className="stat-value">{stats.total_tax_collected.toLocaleString()}</div>
              <div className="stat-label">Total tax</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon tint-green">
              <Wallet size={20} />
            </div>
            <div>
              <div className="stat-value">{stats.paid_tax.toLocaleString()}</div>
              <div className="stat-label">Paid tax</div>
            </div>
          </div>
        </div>
      )}

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
    </>
  )
}
