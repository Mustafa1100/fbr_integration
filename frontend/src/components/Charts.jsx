// Lightweight, dependency-free SVG charts styled with the app's own design
// tokens — no charting library needed for two simple views.

const DAY_LABEL = (iso) => {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function TrendChart({ data, height = 180 }) {
  const width = 640
  const padL = 34
  const padB = 26
  const padT = 10
  const padR = 10
  const chartW = width - padL - padR
  const chartH = height - padT - padB
  const n = data.length
  const maxVal = Math.max(1, ...data.map((d) => d.total))
  const barGap = 6
  const barW = Math.max(2, chartW / n - barGap)

  const yTicks = 4
  const yGridValues = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round((maxVal / yTicks) * i)
  )

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="Invoices submitted per day, last 14 days"
    >
      {yGridValues.map((v) => {
        const y = padT + chartH - (v / maxVal) * chartH
        return (
          <g key={v}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="9" fill="var(--muted)">
              {v}
            </text>
          </g>
        )
      })}

      {data.map((d, i) => {
        const x = padL + i * (barW + barGap) + barGap / 2
        const submittedH = (d.submitted / maxVal) * chartH
        const failedH = (d.failed / maxVal) * chartH
        const otherH = ((d.total - d.submitted - d.failed) / maxVal) * chartH
        let yCursor = padT + chartH
        const showLabel = n <= 8 || i === 0 || i === n - 1 || i % 3 === 0
        return (
          <g key={d.date}>
            <title>
              {d.date}: {d.total} invoice{d.total === 1 ? '' : 's'} ({d.submitted} submitted
              {d.failed ? `, ${d.failed} failed` : ''})
            </title>
            {otherH > 0 && (
              <rect
                x={x}
                y={(yCursor -= otherH)}
                width={barW}
                height={otherH}
                rx="2"
                style={{ fill: 'var(--border-strong)' }}
              />
            )}
            {failedH > 0 && (
              <rect
                x={x}
                y={(yCursor -= failedH)}
                width={barW}
                height={failedH}
                rx="2"
                style={{ fill: 'var(--red-600)' }}
              />
            )}
            {submittedH > 0 && (
              <rect
                x={x}
                y={(yCursor -= submittedH)}
                width={barW}
                height={submittedH}
                rx="2"
                style={{ fill: 'var(--brand-500)' }}
              />
            )}
            {d.total === 0 && (
              <rect
                x={x}
                y={padT + chartH - 2}
                width={barW}
                height="2"
                rx="1"
                style={{ fill: 'var(--border-strong)' }}
              />
            )}
            {showLabel && (
              <text
                x={x + barW / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize="9"
                fill="var(--muted)"
              >
                {DAY_LABEL(d.date)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function DonutChart({ segments, size = 140, strokeWidth = 20 }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const r = (size - strokeWidth) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Invoice status breakdown">
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke="var(--slate-50)"
          strokeWidth={strokeWidth}
        />
        {total === 0 ? null : (
          <g transform={`rotate(-90 ${c} ${c})`}>
            {segments
              .filter((s) => s.value > 0)
              .map((s) => {
                const frac = s.value / total
                const dash = frac * circumference
                const el = (
                  <circle
                    key={s.label}
                    cx={c}
                    cy={c}
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                    strokeLinecap={segments.filter((x) => x.value > 0).length > 1 ? 'butt' : 'round'}
                  >
                    <title>
                      {s.label}: {s.value} ({Math.round(frac * 100)}%)
                    </title>
                  </circle>
                )
                offset += dash
                return el
              })}
          </g>
        )}
        <text
          x={c}
          y={c - 3}
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          style={{ fill: 'var(--text)' }}
        >
          {total}
        </text>
        <text x={c} y={c + 14} textAnchor="middle" fontSize="9" style={{ fill: 'var(--muted)' }}>
          invoices
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem' }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: s.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: 'var(--text-2)' }}>{s.label}</span>
            <span className="strong" style={{ marginLeft: 'auto' }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
