import { useState } from 'react'
import { Check } from 'lucide-react'
import Modal from './Modal'

// Shared by the product form (Products) and invoice lines (single invoice):
// work out a unit price from what one whole product sells for, tax included.

const money = (v) =>
  Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// The percentage in a rate like "18%" or "5 %"; 0 for Exempt, 0% or a fixed
// "Rs …" per-unit rate (nothing to take off a percentage-free price).
export function ratePercent(rate) {
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(rate || '')
  return m ? Number(m[1]) : 0
}

// Unit price (per UOM, excl. tax) from the tax-inclusive price of one whole
// product: price ÷ (1 + rate) ÷ quantity, e.g. 1,800 ÷ 1.18 ÷ 37.324 = 40.869781.
// Kept to 6 decimals so the product's value comes back to the paisa.
export function derivedUnitPrice(inclPrice, quantity, rate) {
  const price = Number(inclPrice)
  const qty = Number(quantity)
  if (inclPrice === '' || !(price >= 0) || !(qty > 0)) return null
  const unit = price / (1 + ratePercent(rate) / 100) / qty
  return String(Math.round(unit * 1e6) / 1e6)
}

// Small optional pop-up. quantity / rate come from where it's opened;
// `source` names that place for the "fill these in first" note.
export default function UnitPriceCalculator({
  quantity,
  rate,
  unitLabel,
  onUse,
  onClose,
  source = 'the product form',
}) {
  const [price, setPrice] = useState('')
  const pct = ratePercent(rate)
  // Both are required: without a rate an empty field would silently count as
  // "no tax" and give a wrong (too high) unit price.
  const missing = [
    !(Number(quantity) > 0) && 'Quantity',
    !(rate || '').trim() && 'Rate',
  ].filter(Boolean)
  const unit = missing.length ? null : derivedUnitPrice(price, quantity, rate)

  return (
    <Modal title="Calculate unit price" onClose={onClose} width={420}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (unit != null) onUse(unit)
        }}
      >
        <div className="calc-help">
          <p>
            Enter the <b>full selling price of one product, including sales tax</b>
            {Number(quantity) > 0 && (
              <>
                {' '}
                (the price of one whole {quantity} {unitLabel} product)
              </>
            )}
            . The unit price is worked out from it:
          </p>
          <ol>
            <li>
              {pct > 0 ? (
                <>
                  The <b>{pct}% sales tax</b> (this product&apos;s rate) is taken off: price ÷{' '}
                  {1 + pct / 100}.
                </>
              ) : (rate || '').trim() ? (
                <>
                  <b>No tax is taken off</b> — the rate is <b>{rate}</b>, which isn&apos;t a percentage.
                </>
              ) : (
                <>The sales tax at this product&apos;s rate is taken off.</>
              )}
            </li>
            <li>
              The rest is divided by the <b>quantity in one product</b>
              {Number(quantity) > 0 ? (
                <>
                  {' '}
                  (<b>
                    {quantity} {unitLabel}
                  </b>
                  )
                </>
              ) : null}{' '}
              to give the <b>price per {unitLabel}</b>, excluding tax.
            </li>
          </ol>
          <p className="calc-note">
            <b>Note:</b> the <b>Quantity</b> and <b>Rate</b> on {source} must be filled in first — the
            calculation uses both.
          </p>
          {missing.length > 0 && (
            <p className="calc-warn">
              Missing on {source}: {missing.join(' and ')}. Close this, fill{' '}
              {missing.length > 1 ? 'them' : 'it'} in, then open Calculate again.
            </p>
          )}
        </div>

        <div className="field">
          <label>Price of one product, incl. tax (Rs)</label>
          <input
            type="number"
            step="any"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            autoFocus
          />
        </div>

        {unit != null && (
          <div className="calc-result">
            <div className="calc-result-value">
              Rs {unit} <span>per {unitLabel}</span>
            </div>
            <div className="calc-result-working">
              {pct > 0
                ? `${money(price)} ÷ ${1 + pct / 100} ÷ ${quantity} = ${unit}`
                : `${money(price)} ÷ ${quantity} = ${unit}`}
            </div>
          </div>
        )}

        <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={unit == null}>
            <Check size={16} /> Use this price
          </button>
        </div>
      </form>
    </Modal>
  )
}
