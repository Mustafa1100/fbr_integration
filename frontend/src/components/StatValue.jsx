// The big number on a dashboard card. Long amounts (e.g. 92,361,966.06)
// shrink to fit the card instead of spilling out; short ones stay full size.
// --len (the number of characters) drives the font size in styles.css.
export default function StatValue({ value }) {
  const text = String(value ?? '')
  return (
    <div className="stat-value" style={{ '--len': Math.max(text.length, 1) }} title={text}>
      {text}
    </div>
  )
}
