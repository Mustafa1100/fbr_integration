import { useEffect, useState } from 'react'
import { Table2 } from 'lucide-react'
import { api, money, onChanged } from '../api.js'
import { BarList, HourColumns, TrendChart } from '../components/Charts.jsx'
import StatCard from '../components/StatCard.jsx'

// Sales at a glance, from the invoices on this computer that FBR accepted.
// Returns count against the period they were made in. Pakistan time.

const RANGES = [
  { id: 'today', label: 'Today', period: 'today' },
  { id: '7d', label: '7 days', period: 'in the last 7 days' },
  { id: '30d', label: '30 days', period: 'in the last 30 days' },
  { id: '90d', label: '90 days', period: 'in the last 90 days' },
  { id: '12m', label: '12 months', period: 'in the last 12 months' },
  { id: 'all', label: 'All time', period: 'since the first invoice' },
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Axis label and tooltip title for one bucket of the trend.
function bucketLabels(key, unit) {
  if (unit === 'hour') {
    const h = key.slice(11, 13)
    return { label: `${h}:00`, long: `Today, ${h}:00–${String(Number(h) + 1).padStart(2, '0')}:00` }
  }
  const month = MONTHS[Number(key.slice(5, 7)) - 1]
  if (unit === 'month') return { label: `${month} ${key.slice(2, 4)}`, long: `${month} ${key.slice(0, 4)}` }
  const day = Number(key.slice(8, 10))
  return { label: `${day} ${month}`, long: `${day} ${month} ${key.slice(0, 4)}` }
}

const rs = (n) => `${n < 0 ? '−' : ''}Rs ${money(Math.abs(n))}`

export default function Dashboard() {
  const [range, setRange] = useState('30d')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [asTable, setAsTable] = useState(false)

  useEffect(() => {
    let current = true
    const load = () =>
      api
        .dashboard(range)
        .then((d) => current && setData(d))
        .catch((err) => current && setError(err.message))
    load()
    const stop = onChanged(load) // new sales show up straight away
    return () => {
      current = false
      stop?.()
    }
  }, [range])

  const period = RANGES.find((r) => r.id === range).period
  const t = data?.totals
  const points = (data?.trend || []).map((p) => ({ ...p, ...bucketLabels(p.key, data.unit) }))
  const hasSales = t && (t.sales > 0 || t.returns > 0)
  const average = t && t.sales ? t.sales_bill / t.sales : 0

  return (
    <div className="page dashboard">
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="tabs" role="tablist" aria-label="Period">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              className={`tab ${range === r.id ? 'active' : ''}`}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}

      {data && (
        <>
          <div className="stat-row">
            <StatCard
              tone="feature"
              label="Total of all invoices"
              value={rs(data.allTime.net)}
              note={`${data.allTime.invoices} accepted invoices, all time`}
            />
            <StatCard label="Net sales" value={rs(t.net)} note="Sales minus returns" />
            <StatCard
              label="Invoices"
              value={t.sales}
              exact={`${t.sales} sales · Rs ${money(t.sales_bill)}`}
              note={`Rs ${money(t.sales_bill)} before returns`}
            />
            <StatCard
              label="Returns"
              value={t.returns}
              exact={`${t.returns} returns · ${rs(-t.returns_bill)}`}
              note={t.returns_bill > 0 ? rs(-t.returns_bill) : 'None'}
            />
            <StatCard label="Tax" value={rs(t.tax)} note="Included in the totals" />
            <StatCard label="Average invoice" value={`Rs ${money(average)}`} note="Per sale" />
          </div>

          <section className="card chart-card">
            <div className="chart-head">
              <div>
                <h2>Net sales</h2>
                <p className="muted">
                  {data.unit === 'hour' ? 'By hour' : data.unit === 'day' ? 'By day' : 'By month'}, {period}
                </p>
              </div>
              <button
                type="button"
                className={`btn ghost small ${asTable ? 'active' : ''}`}
                onClick={() => setAsTable(!asTable)}
                aria-pressed={asTable}
              >
                <Table2 size={15} /> {asTable ? 'Show chart' : 'Show table'}
              </button>
            </div>
            {!hasSales ? (
              <p className="muted empty">No accepted invoices {period}.</p>
            ) : asTable ? (
              <div className="table-card inner chart-table">
                <table>
                  <thead>
                    <tr>
                      <th>{data.unit === 'hour' ? 'Hour' : data.unit === 'day' ? 'Day' : 'Month'}</th>
                      <th className="num">Sales</th>
                      <th className="num">Sales amount</th>
                      <th className="num">Returns</th>
                      <th className="num">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...points].reverse().map((p) => (
                      <tr key={p.key}>
                        <td>{p.long}</td>
                        <td className="num">{p.sales}</td>
                        <td className="num">{money(p.sales_bill)}</td>
                        <td className="num">{p.returns_bill ? `−${money(p.returns_bill)}` : '0.00'}</td>
                        <td className="num strong">{rs(p.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <TrendChart points={points} label={`Net sales ${period}`} />
            )}
          </section>

          <div className="chart-pair">
            <section className="card chart-card">
              <div className="chart-head">
                <div>
                  <h2>Top items</h2>
                  <p className="muted">By amount, {period}</p>
                </div>
              </div>
              {data.topItems.length ? (
                <BarList
                  rows={data.topItems.map((item) => ({
                    key: item.code,
                    name: item.name,
                    value: item.amount,
                    display: `Rs ${money(item.amount)}`,
                    tip: `${item.name} · ${+item.quantity.toFixed(2)} sold · Rs ${money(item.amount)}`,
                  }))}
                />
              ) : (
                <p className="muted empty">Nothing sold {period}.</p>
              )}
            </section>

            <section className="card chart-card">
              <div className="chart-head">
                <div>
                  <h2>Busiest hours</h2>
                  <p className="muted">Sales per hour of the day, {period}</p>
                </div>
              </div>
              {t.sales ? <HourColumns hours={data.hours} /> : <p className="muted empty">Nothing sold {period}.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
