// Invoice arithmetic shared by the main process (which stores and submits the
// figures) and the renderer (which previews them while the cashier types).

// PaymentMode codes from FBR's fiscal component spec.
export const PAYMENT_MODES = [
  { id: 1, label: 'Cash' },
  { id: 2, label: 'Card' },
  { id: 3, label: 'Gift Voucher' },
  { id: 4, label: 'Loyalty Card' },
  { id: 5, label: 'Mixed' },
  { id: 6, label: 'Cheque' },
]

export const paymentLabel = (id) => PAYMENT_MODES.find((m) => m.id === Number(id))?.label || ''

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// One invoice line. FBR's SaleValue is the amount tax is calculated on, i.e.
// already net of discount — the spec's own sample is 1,298 + 221 tax = 1,519
// with a 380 discount reported alongside rather than subtracted again.
export function computeLine(line, pricesIncludeTax = false) {
  const quantity = Number(line.quantity) || 0
  const unitPrice = Number(line.unit_price) || 0
  const rate = Number(line.tax_rate) || 0
  const gross = round2(unitPrice * quantity)
  const discount = Math.min(Math.max(round2(line.discount || 0), 0), gross)
  const afterDiscount = round2(gross - discount)
  const saleValue = pricesIncludeTax ? round2(afterDiscount / (1 + rate / 100)) : afterDiscount
  const taxCharged = pricesIncludeTax
    ? round2(afterDiscount - saleValue)
    : round2((saleValue * rate) / 100)
  const furtherTax = Math.max(round2(line.further_tax || 0), 0)
  return {
    quantity,
    unit_price: unitPrice,
    tax_rate: rate,
    discount,
    sale_value: saleValue,
    tax_charged: taxCharged,
    further_tax: furtherTax,
    total_amount: round2(saleValue + taxCharged + furtherTax),
  }
}

// Header totals are the sums of the already-rounded lines, so the invoice
// always reconciles with its items.
export function computeTotals(lines) {
  const sum = (key) => round2(lines.reduce((acc, l) => acc + (Number(l[key]) || 0), 0))
  return {
    total_quantity: sum('quantity'),
    total_sale_value: sum('sale_value'),
    total_tax: sum('tax_charged'),
    total_discount: sum('discount'),
    total_further_tax: sum('further_tax'),
    total_bill: sum('total_amount'),
  }
}
