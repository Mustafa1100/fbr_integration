// Cotton lint ("Cotton ginners" sale type): the registered buyer (the spinner)
// withholds the full sales tax and pays it to FBR, so each line must send
// salesTaxWithheldAtSource equal to its sales tax. FBR accepts only 0 or the
// exact tax (error 0008), so this repeats the server's maths to the paisa:
// value = round_money(quantity × unit price), tax = value × rate%, both rounded
// half-up to 2 decimals (invoice_service.round_money / compute_sales_tax).

export const COTTON_GINNERS = 'Cotton ginners'

export function isCottonGinner(saleType) {
  return saleType === COTTON_GINNERS
}

// A number rounded half-up to whole paisa, as Python's
// Decimal(str(x)).quantize(Decimal('0.01'), ROUND_HALF_UP). JS String() and
// Python str() both give the shortest round-trip digits, so this works on the
// same decimal digits the server sees. Returns a BigInt of paisa.
function toPaisa(x) {
  const s = String(x)
  if (/e/i.test(s)) return BigInt(Math.round(x * 100)) // tiny/huge values only
  const negative = s.startsWith('-')
  const [whole, frac = ''] = s.replace('-', '').split('.')
  let paisa = BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2))
  if ((frac[2] || '0') >= '5') paisa += 1n
  return negative ? -paisa : paisa
}

// The sales tax the server will work out for this line, or null when the
// rate isn't a plain percentage such as "18%" (cotton lint always is).
export function serverSalesTax(quantity, unitPrice, rate) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(rate || '')
  if (!m) return null
  const value = toPaisa(Number(quantity) * Number(unitPrice))
  const [whole, frac = ''] = m[1].split('.')
  const pct = BigInt(whole + frac)
  const den = 100n * 10n ** BigInt(frac.length)
  const num = value * pct
  const tax = num >= 0n ? (2n * num + den) / (2n * den) : -((-2n * num + den) / (2n * den))
  return Number(tax) / 100
}
