// A figure tile. The value shrinks with the tile's width and, if it still
// doesn't fit, ends in "…"; hovering or focusing the tile shows the exact
// value (`exact`, or the value itself) in a tooltip.
export default function StatCard({ label, value, exact, note, tone = '' }) {
  const full = exact ?? String(value)
  return (
    <div className={`stat ${tone}`} tabIndex={0} data-tip={full} aria-label={`${label}: ${full}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {note && <small className="stat-note">{note}</small>}
    </div>
  )
}
