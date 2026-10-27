// Added total rows ("adjustments", Invoice Settings -> Totals): a named
// amount added to or taken off the last row of the totals box, given in PKR
// or as a % of the total before adjustments. Receipt only — never sent to FBR.

const round2 = (v) => Math.round(v * 100) / 100

// Each adjustment with its PKR `amount` (always positive) and `signed`
// amount (negative when subtracting), for a given total before adjustments.
export function adjustmentAmounts(base, adjustments) {
  return (adjustments || []).map((a) => {
    const value = Number(a.value) || 0
    const amount = round2(a.kind === 'pct' ? (base * value) / 100 : value)
    return { ...a, amount, signed: a.sign === 'subtract' ? -amount : amount }
  })
}

// "Income Tax" / "Income Tax (1%)"
export function adjustmentLabel(a) {
  return a.kind === 'pct' ? `${a.label} (${Number(a.value) || 0}%)` : a.label
}
