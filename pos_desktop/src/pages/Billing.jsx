import { useEffect, useMemo, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import { computeLine, computeTotals, PAYMENT_MODES } from '../../shared/calc.js'
import { api, money, onChanged } from '../api.js'
import ReceiptModal from '../components/Receipt.jsx'

const EMPTY_BUYER = { name: '', ntn: '', cnic: '', phone: '' }
let nextKey = 1

export default function Billing({ settings, locked, onSold }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [buyer, setBuyer] = useState(EMPTY_BUYER)
  const [showBuyer, setShowBuyer] = useState(false)
  const [paymentMode, setPaymentMode] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receiptId, setReceiptId] = useState(null)

  // Also reloads when a background sync brings in items from the server.
  useEffect(() => {
    const load = () =>
      api
        .listItems(search)
        .then((list) => {
          setItems(list)
          // An approved change (e.g. a new price) also updates lines already
          // in the cart, so the screen shows what will be charged.
          setCart((prev) =>
            prev.map((l) => {
              const item = list.find((i) => i.code === l.item_code)
              return item ? { ...l, item_name: item.name, unit_price: item.price, tax_rate: item.tax_rate } : l
            })
          )
        })
        .catch((err) => setError(err.message))
    load()
    return onChanged(load)
  }, [search])

  const lines = useMemo(
    () => cart.map((l) => ({ ...l, ...computeLine(l, settings.prices_include_tax) })),
    [cart, settings.prices_include_tax]
  )
  const totals = useMemo(() => computeTotals(lines), [lines])

  function addItem(item) {
    setCart((prev) => {
      const existing = prev.find((l) => l.item_id === item.id)
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, quantity: Number(l.quantity) + 1 } : l))
      }
      return [
        ...prev,
        {
          key: nextKey++,
          item_id: item.id,
          item_code: item.code,
          item_name: item.name,
          pct_code: item.pct_code,
          tax_rate: item.tax_rate,
          third_schedule: !!item.third_schedule,
          quantity: 1,
          unit_price: item.price,
          discount: 0,
        },
      ]
    })
  }

  const updateLine = (key, patch) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key) => setCart((prev) => prev.filter((l) => l.key !== key))

  async function completeSale() {
    setError('')
    setBusy(true)
    try {
      const invoice = await api.createInvoice({
        lines: cart,
        buyer: showBuyer ? buyer : EMPTY_BUYER,
        payment_mode: paymentMode,
      })
      setCart([])
      setBuyer(EMPTY_BUYER)
      setShowBuyer(false)
      setPaymentMode(1)
      setReceiptId(invoice.id)
      onSold()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="billing">
      <section className="card item-picker">
        <div className="search-box">
          <Search size={16} />
          <input
            placeholder="Search items by name or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="item-grid">
          {items.map((item) => (
            <button key={item.id} type="button" className="item-tile" onClick={() => addItem(item)}>
              <span className="item-name">{item.name}</span>
              <span className="item-price">Rs {money(item.price)}</span>
            </button>
          ))}
          {!items.length && (
            <p className="muted empty">
              {search
                ? 'No items match your search.'
                : 'No items yet. Request them on the Items page; they appear here once approved.'}
            </p>
          )}
        </div>
      </section>

      <section className="card cart">
        <h2>Current sale</h2>
        {error && <div className="alert error">{error}</div>}
        <div className="cart-lines">
          {!lines.length && <p className="muted empty">Pick an item to start the sale.</p>}
          {lines.map((l) => (
            <div key={l.key} className="cart-line">
              <div className="cart-line-top">
                <span className="strong">{l.item_name}</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => removeLine(l.key)}
                  aria-label="Remove line"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="cart-line-fields">
                <label>
                  Qty
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={l.quantity}
                    onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                  />
                </label>
                {/* Fixed: the approved price. Only a discount can be given. */}
                <label>
                  Price
                  <input
                    className="readonly"
                    value={money(l.unit_price)}
                    readOnly
                    tabIndex={-1}
                    title="The approved price. Give a discount instead of changing it."
                  />
                </label>
                <label>
                  Discount
                  <input
                    type="number"
                    min="0"
                    max={Number(l.unit_price) * Number(l.quantity || 0)}
                    step="any"
                    value={l.discount}
                    onChange={(e) => updateLine(l.key, { discount: e.target.value })}
                  />
                </label>
                <div className="line-total">
                  <span className="muted">{l.tax_rate > 0 ? `Tax ${l.tax_rate}%` : 'No tax'}</span>
                  <strong>{money(l.total_amount)}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="cart-footer">
          <label className="check">
            <input
              type="checkbox"
              checked={showBuyer}
              onChange={(e) => setShowBuyer(e.target.checked)}
            />
            Add buyer details
          </label>
          {showBuyer && (
            <div className="form-grid two">
              {[
                ['name', 'Name'],
                ['phone', 'Phone'],
                ['cnic', 'CNIC (13 digits)'],
                ['ntn', 'NTN'],
              ].map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input
                    value={buyer[field]}
                    onChange={(e) => setBuyer({ ...buyer, [field]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          )}

          <label>
            Payment mode
            <select value={paymentMode} onChange={(e) => setPaymentMode(Number(e.target.value))}>
              {PAYMENT_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div className="totals-box">
            <div className="trow">
              <span>Sale value (excl. tax)</span>
              <span>{money(totals.total_sale_value)}</span>
            </div>
            {totals.total_discount > 0 && (
              <div className="trow">
                <span>Discount included</span>
                <span>{money(totals.total_discount)}</span>
              </div>
            )}
            <div className="trow">
              <span>Tax</span>
              <span>{money(totals.total_tax)}</span>
            </div>
            <div className="trow grand">
              <span>Total</span>
              <span>Rs {money(totals.total_bill)}</span>
            </div>
          </div>

          <button
            type="button"
            className="btn large"
            disabled={busy || locked || !cart.length}
            onClick={completeSale}
          >
            {busy ? 'Completing sale…' : 'Complete sale'}
          </button>
        </div>
      </section>

      {receiptId && <ReceiptModal invoiceId={receiptId} onClose={() => setReceiptId(null)} />}
    </div>
  )
}
