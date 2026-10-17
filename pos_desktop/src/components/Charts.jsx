// Small hand-built SVG/HTML charts for the Dashboard: no chart library, so
// they work offline and match the app. One series per chart (no legend; the
// card title names it), thin marks, hairline grid, hover tooltips.
import { useEffect, useRef, useState } from 'react'
import { money } from '../api.js'

// Width of an element, kept up to date, so SVG text is drawn at real size
// instead of being scaled with a viewBox.
function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

// 0 / 500 / 1K / 2.5K / 1.2M — axis ticks only; exact values are in tooltips.
export function compact(n) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1e6) return `${sign}${+(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`
  if (abs >= 1e3) return `${sign}${+(abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`
  return `${sign}${Math.round(abs)}`
}

// Round tick values covering [min, max], always including 0.
function ticks(min, max, count = 4) {
  if (max === min) max = min + 1
  const raw = (max - min) / count
  const step = 10 ** Math.floor(Math.log10(raw))
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => s >= raw)
  const start = Math.floor(min / nice) * nice
  const out = []
  for (let v = start; v <= max + nice * 0.001; v += nice) out.push(+v.toFixed(6))
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + nice)
  return out
}

const signedRs = (n) => `${n < 0 ? '−' : ''}Rs ${money(Math.abs(n))}`

// Net sales over time: a 2px line over a light wash, with a crosshair and
// tooltip following the pointer (or the arrow keys).
export function TrendChart({ points, height = 260, label }) {
  const [ref, width] = useWidth()
  const [active, setActive] = useState(null)
  const pad = { top: 16, right: 16, bottom: 28, left: 56 }
  const innerW = Math.max(width - pad.left - pad.right, 10)
  const innerH = height - pad.top - pad.bottom
  const values = points.map((p) => p.net)
  const yTicks = ticks(Math.min(0, ...values), Math.max(0, ...values))
  const yMin = yTicks[0]
  const yMax = yTicks[yTicks.length - 1]
  const x = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v) => pad.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
  // About one x label per 90px, always including the last point.
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 90))))
  const xLabels = points.map((p, i) => i).filter((i) => i % every === 0 || i === points.length - 1)
    .filter((i, k, all) => !(k === all.length - 2 && all[k + 1] - i < every * 0.6))

  const pick = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - box.left - pad.left
    const i = points.length === 1 ? 0 : Math.round((px / innerW) * (points.length - 1))
    setActive(Math.min(Math.max(i, 0), points.length - 1))
  }
  const onKey = (event) => {
    if (event.key === 'ArrowRight') setActive((i) => Math.min((i ?? -1) + 1, points.length - 1))
    else if (event.key === 'ArrowLeft') setActive((i) => Math.max((i ?? points.length) - 1, 0))
    else if (event.key === 'Escape') setActive(null)
    else return
    event.preventDefault()
  }
  const point = active === null ? null : points[active]
  const tipLeft = point ? Math.min(Math.max(x(active), 90), width - 90) : 0

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          onMouseMove={pick}
          onMouseLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'chart-baseline' : 'chart-grid'} x1={pad.left} x2={pad.left + innerW} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {compact(t)}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text
              key={i}
              className="chart-tick"
              x={x(i)}
              y={height - 8}
              textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            >
              {points[i].label}
            </text>
          ))}
          <path className="chart-area" d={area} />
          <path className="chart-line" d={line} />
          {point && (
            <>
              <line className="chart-crosshair" x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} />
              <circle className="chart-dot" cx={x(active)} cy={y(point.net)} r={5} />
            </>
          )}
          {/* Whole plot is the hover target, wider than the line itself. */}
          <rect x={pad.left - 8} y={pad.top} width={innerW + 16} height={innerH} fill="transparent" />
        </svg>
      )}
      {point && (
        <div className="chart-tip" style={{ left: tipLeft, top: 4 }} role="status">
          <div className="chart-tip-title">{point.long}</div>
          <div className="chart-tip-row strong">
            <span>Net</span>
            <span>{signedRs(point.net)}</span>
          </div>
          <div className="chart-tip-row">
            <span>{point.sales} {point.sales === 1 ? 'sale' : 'sales'}</span>
            <span>Rs {money(point.sales_bill)}</span>
          </div>
          {point.returns_bill > 0 && (
            <div className="chart-tip-row">
              <span>Returns</span>
              <span>−Rs {money(point.returns_bill)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Ranked horizontal bars (e.g. top items). Value at the bar's tip; the full
// figures in a tooltip on hover/focus.
export function BarList({ rows }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ol className="bar-list">
      {rows.map((row) => (
        <li key={row.key} className="bar-row" tabIndex={0} data-tip={row.tip} aria-label={row.tip}>
          <span className="bar-name" title={row.name}>{row.name}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max((row.value / max) * 100, 1.5)}%` }} />
            <span className="bar-value">{row.display}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

// Columns for each hour of the day (busiest hours). Hover/focus a column for
// its exact count.
export function HourColumns({ hours, height = 180 }) {
  const used = hours.filter((h) => h.sales > 0).map((h) => h.hour)
  // The working day: at least 8:00–20:00, wider if sales happened outside it.
  const first = Math.min(8, ...used)
  const last = Math.max(20, ...used)
  const shown = hours.filter((h) => h.hour >= first && h.hour <= last)
  const max = Math.max(...shown.map((h) => h.sales), 1)
  const top = ticks(0, max, 3).filter((t) => Number.isInteger(t))
  const yMax = top[top.length - 1] || 1
  const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`
  return (
    <div className="columns" style={{ height }}>
      <div className="columns-axis">
        {[...top].reverse().map((t) => (
          <span key={t}>{compact(t)}</span>
        ))}
      </div>
      <div className="columns-plot">
        {top.map((t) => (
          <span key={t} className="columns-grid" style={{ bottom: `${(t / yMax) * 100}%` }} />
        ))}
        {shown.map((h) => {
          const tip = `${hourLabel(h.hour)}–${hourLabel(h.hour + 1)} · ${h.sales} ${h.sales === 1 ? 'sale' : 'sales'}`
          return (
            <div key={h.hour} className="column" tabIndex={0} data-tip={tip} aria-label={tip}>
              <span className="column-bar" style={{ height: `${(h.sales / yMax) * 100}%` }} />
              <span className="column-label">{(h.hour - first) % 2 === 0 ? String(h.hour).padStart(2, '0') : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
