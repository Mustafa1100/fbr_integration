// Plan date maths, matching backend/app/services/plans.py, used for the
// "new end date" previews in the admin pop-ups. The server stays the
// source of truth; these only show what will happen before saving.
// Dates are plain 'YYYY-MM-DD' strings so no time zone can shift them.

function parts(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

function toIso(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function addMonths(iso, months) {
  const { y, m, d } = parts(iso)
  const index = m - 1 + months
  const year = y + Math.floor(index / 12)
  const month = (((index % 12) + 12) % 12) + 1
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return toIso(year, month, Math.min(d, lastDay))
}

export function addDays(iso, days) {
  const { y, m, d } = parts(iso)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

// End date of a chain: start + all months, then + all days.
export function chainEnd(startIso, entries) {
  const months = entries.reduce((s, e) => s + (Number(e.months) || 0), 0)
  const days = entries.reduce((s, e) => s + (Number(e.days) || 0), 0)
  return addDays(addMonths(startIso, months), days)
}

// Today in Pakistan time (UTC+5, no daylight saving).
export function todayPk() {
  const now = new Date(Date.now() + 5 * 3600 * 1000)
  return toIso(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
}

export function daysBetween(fromIso, toIso2) {
  const a = parts(fromIso)
  const b = parts(toIso2)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(iso) {
  if (!iso) return '—'
  const { y, m, d } = parts(iso.slice(0, 10))
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`
}

export function fmtMoney(v) {
  const n = Number(v) || 0
  return `PKR ${n.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// Short text for a plan status, e.g. "Ends 05 Feb 2027 · 92 days left".
export function planText(plan) {
  if (!plan || plan.status === 'none') return 'No plan set'
  const ends = fmtDate(plan.ends_on)
  if (plan.status === 'expired') {
    const ago = -plan.days_left
    return ago === 0 ? `Expired today (${ends})` : `Expired ${plural(ago, 'day')} ago (${ends})`
  }
  return `Ends ${ends} · ${plural(plan.days_left, 'day')} left`
}
