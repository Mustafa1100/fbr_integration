import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Receipt as ReceiptIcon,
  ArrowLeft,
  Printer,
  AlertCircle,
  Code2,
  Loader2,
  ShieldCheck,
  Check,
  CheckCheck,
} from 'lucide-react'
import { api } from '../api'
import usePageTitle from '../hooks/usePageTitle'
import Modal from './Modal'
import CreditCardPlus from './CreditCardPlusIcon'

// Shared receipt UI for both the user's own view (/invoices/:id) and the
// admin read-only view (/admin/invoices/:userId/:invoiceId) — same data
// shape from either GET /api/invoices/:id or GET
// /api/admin/users/:userId/invoices/:invoiceId, just a different URL.
// allowMarkPaid: only the user's own view passes this — admin's view stays
// read-only oversight, not on-behalf editing, but still shows the badge.
export default function ReceiptView({ apiUrl, backTo, backLabel, banner, allowMarkPaid = false }) {
  usePageTitle('Tax Receipt')
  const [inv, setInv] = useState(null)
  const [error, setError] = useState('')
  const [showJson, setShowJson] = useState(false)
  const [paidBusy, setPaidBusy] = useState(false)
  const [confirmingPaid, setConfirmingPaid] = useState(false)
  const [canProd, setCanProd] = useState(false)
  const [confirmingPromote, setConfirmingPromote] = useState(false)
  const [promoting, setPromoting] = useState(false)
  // Which STRN to print, when the seller has more than one (index as string).
  const [strnChoice, setStrnChoice] = useState('')
  // One-time advance-tax back-fill (older invoices only).
  const [advTaxOpen, setAdvTaxOpen] = useState(false)
  const [advTaxValue, setAdvTaxValue] = useState('')
  const [advTaxBusy, setAdvTaxBusy] = useState(false)

  useEffect(() => {
    setInv(null)
    setError('')
    api
      .get(apiUrl)
      .then(setInv)
      .catch((e) => setError(e.message))
  }, [apiUrl])

  useEffect(() => {
    if (!allowMarkPaid) return // admin's read-only view can't submit on-behalf
    api
      .get('/api/settings/fbr')
      .then((s) => setCanProd(!!s.can_submit_production))
      .catch(() => {})
  }, [allowMarkPaid])

  async function confirmPromote() {
    setPromoting(true)
    setError('')
    try {
      await api.post(`/api/invoices/${inv.id}/promote`)
      setInv(await api.get(apiUrl))
    } catch (err) {
      setError(err.message)
    } finally {
      setPromoting(false)
      setConfirmingPromote(false)
    }
  }

  async function saveAdvanceTax() {
    setAdvTaxBusy(true)
    setError('')
    try {
      await api.patch(`/api/invoices/${inv.id}/advance-tax`, {
        advance_tax: Number(advTaxValue) || 0,
      })
      setInv(await api.get(apiUrl))
      setAdvTaxOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setAdvTaxBusy(false)
    }
  }

  async function setPaid(isPaid) {
    setPaidBusy(true)
    setError('')
    try {
      const updated = await api.patch(`/api/invoices/${inv.id}/paid`, { is_paid: isPaid })
      setInv({ ...inv, ...updated })
    } catch (err) {
      setError(err.message)
    } finally {
      setPaidBusy(false)
    }
  }

  // Marking paid asks for confirmation (it's an attestation the tax was
  // actually paid/submitted) — undoing an accidental mark doesn't need it.
  async function confirmMarkPaid() {
    await setPaid(true)
    setConfirmingPaid(false)
  }

  if (error)
    return (
      <div className="alert error">
        <AlertCircle size={17} />
        <span>{error}</span>
      </div>
    )
  if (!inv)
    return (
      <div className="loading">
        <Loader2 size={18} className="spin" /> Loading…
      </div>
    )

  // Per line:
  //  - displayTotal is the backend's total_value — an explicit total_values
  //    from the upload when given (so it matches an upstream system to the
  //    paisa), otherwise sale value + taxes − discount.
  //  - displayExcl is the pre-tax, pre-discount value, backed out of the
  //    total so every row reconciles (excl − discount + tax = total). With
  //    no override / no discount this is just value_excl_st.
  //  - A 3rd Schedule line entered with unit_price 0 carries only a
  //    negligible placeholder (0.01) in value_excl_st (see csv_processor.py)
  //    — show the notified retail price there so it doesn't read as "free."
  //    Tax on a 3rd Schedule line is still computed on the notified price,
  //    not this figure — hence the * note.
  const PLACEHOLDER_EXCL = 0.01
  const items = inv.items.map((it) => {
    const discount = it.discount || 0
    const lineTax = it.sales_tax + (it.further_tax || 0) + (it.fed_payable || 0)
    const usePlaceholder =
      it.fixed_notified_value > 0 && it.value_excl_st <= PLACEHOLDER_EXCL
    const computed = Math.max(it.value_excl_st - discount, 0) + lineTax
    const total = usePlaceholder
      ? it.fixed_notified_value + lineTax
      : it.total_value ?? computed
    const excl = usePlaceholder ? it.fixed_notified_value : total - lineTax + discount
    return { ...it, displayExcl: excl, displayDiscount: discount, displayTotal: total }
  })
  // STRN on the receipt: a lone one always prints; with several, only the
  // one the user picks from the dropdown does; with none, nothing shows.
  const strns = inv.seller.strns || []
  const displayStrn =
    strns.length === 1
      ? strns[0].strn
      : strnChoice !== '' && strns[Number(strnChoice)]
        ? strns[Number(strnChoice)].strn
        : ''

  const usesFixedValue = items.some((it) => it.fixed_notified_value > 0)
  const totalDiscount = items.reduce((sum, it) => sum + it.displayDiscount, 0)
  const showDiscountCol = totalDiscount > 0
  const displayTotalExcl = items.reduce((sum, it) => sum + it.displayExcl, 0)
  const displayGrandTotal = items.reduce((sum, it) => sum + it.displayTotal, 0)

  return (
    <>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">
            <ReceiptIcon size={22} /> Tax Receipt{' '}
            <span className={`badge ${inv.status}`}>{inv.status}</span>
            {inv.status === 'submitted' && inv.fbr_env === 'production' && (
              <span className={`badge ${inv.is_paid ? 'submitted' : 'draft'}`}>
                {inv.is_paid ? 'paid' : 'unpaid'}
              </span>
            )}
          </h1>
          <p className="page-sub">Printable tax receipt for this invoice.</p>
        </div>
        <div className="page-actions">
          <Link
            to={backTo}
            className="btn btn-hollow has-tip has-tip-below"
            data-tip={backLabel}
            aria-label={backLabel}
          >
            <ArrowLeft size={16} />
          </Link>
          {allowMarkPaid &&
            canProd &&
            inv.status === 'submitted' &&
            inv.fbr_env !== 'production' && (
              <button
                className="btn btn-hollow has-tip has-tip-below"
                onClick={() => setConfirmingPromote(true)}
                disabled={promoting}
                data-tip="Submit to FBR"
                aria-label="Submit to FBR"
              >
                {promoting ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              </button>
            )}
          {allowMarkPaid && inv.status === 'submitted' && inv.fbr_env === 'production' && (
            <button
              className="btn btn-hollow has-tip has-tip-below"
              onClick={() => (inv.is_paid ? setPaid(false) : setConfirmingPaid(true))}
              disabled={paidBusy}
              data-tip={inv.is_paid ? 'Mark as unpaid' : 'Mark as paid'}
              aria-label={inv.is_paid ? 'Mark as unpaid' : 'Mark as paid'}
            >
              {paidBusy ? <Loader2 size={16} className="spin" /> : <CheckCheck size={16} />}
            </button>
          )}
          {allowMarkPaid && !inv.advance_tax_set && (
            <button
              className="btn btn-hollow has-tip has-tip-below"
              onClick={() => {
                setAdvTaxValue('')
                setAdvTaxOpen(true)
              }}
              data-tip="Add advance tax"
              aria-label="Add advance tax"
            >
              <CreditCardPlus size={16} />
            </button>
          )}
          <button
            className="btn btn-hollow has-tip has-tip-below"
            onClick={() => window.print()}
            data-tip="Print receipt"
            aria-label="Print receipt"
          >
            <Printer size={16} />
          </button>
        </div>
      </div>

      {banner}

      {inv.fbr_error && (
        <div className="alert error no-print">
          <AlertCircle size={17} />
          <span>
            <strong>FBR rejected this invoice:</strong> {inv.fbr_error}
          </span>
        </div>
      )}

      {strns.length > 1 && (
        <div className="strn-picker no-print">
          <label htmlFor="strn-picker">STRN on this receipt</label>
          <select
            id="strn-picker"
            value={strnChoice}
            onChange={(e) => setStrnChoice(e.target.value)}
          >
            <option value="">— none —</option>
            {strns.map((s, i) => (
              <option key={i} value={i}>
                {s.business_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="card receipt">
        <div className="receipt-head">
          <div>
            <h2>{inv.seller.business_name || 'Seller business name not set'}</h2>
            <p>
              {inv.seller.ntn && (
                <>
                  NTN: {inv.seller.ntn}
                  <br />
                </>
              )}
              CNIC: {inv.seller.ntn_cnic || '—'}
              <br />
              {displayStrn && (
                <>
                  STRN: {displayStrn}
                  <br />
                </>
              )}
              {inv.seller.address}, {inv.seller.province}
              {inv.seller.email && (
                <>
                  <br />
                  Email: {inv.seller.email}
                </>
              )}
            </p>
            <p>
              <strong>Date:</strong> {inv.invoice_date}
              {inv.pos_invoice_no && (
                <>
                  <br />
                  <strong>Invoice:</strong> {inv.pos_invoice_no}
                </>
              )}
            </p>
          </div>
          <div className="fbr-box">
            <img
              className="fbr-logo"
              src="/fbr_logo.png"
              alt="FBR Digital Invoicing System"
            />
            {inv.qr ? (
              <div className="fbr-verify">
                <img src={inv.qr} alt="FBR QR code" />
                <div className="fbr-number">
                  FBR Invoice No.
                  <br />
                  <span className="mono">{inv.fbr_invoice_number}</span>
                </div>
              </div>
            ) : (
              <div className="warn">
                NOT SUBMITTED TO FBR
                <br />
                (no invoice number / QR)
              </div>
            )}
          </div>
        </div>

        <p>
          <strong>Buyer:</strong> {inv.buyer_name} ({inv.buyer_registration_type})
          {inv.buyer_ntn_cnic && <> — NTN/CNIC: {inv.buyer_ntn_cnic}</>}
          <br />
          {inv.buyer_address}, {inv.buyer_province}
        </p>

        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>HS code</th>
                <th>Qty</th>
                <th>UOM</th>
                <th>Unit price</th>
                <th>Rate</th>
                <th>Excl. ST</th>
                {showDiscountCol && <th>Discount</th>}
                <th>Sales tax</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>
                    <span className="strong">{it.product_description}</span>
                  </td>
                  <td className="mono">{it.hs_code}</td>
                  <td>{it.quantity}</td>
                  <td>{it.uom}</td>
                  <td>{it.unit_price.toLocaleString()}</td>
                  <td>{it.rate}</td>
                  <td>
                    {it.displayExcl.toLocaleString()}
                    {it.fixed_notified_value > 0 && <sup>*</sup>}
                  </td>
                  {showDiscountCol && (
                    <td>
                      {it.displayDiscount > 0 ? `−${it.displayDiscount.toLocaleString()}` : '—'}
                    </td>
                  )}
                  <td>{it.sales_tax.toLocaleString()}</td>
                  <td>
                    <span className="strong">{it.displayTotal.toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {usesFixedValue && (
          <p className="muted" style={{ marginTop: 8, fontSize: '0.78rem' }}>
            * 3rd Schedule item — taxed on the government-notified retail price, not the sale
            value.
          </p>
        )}

        <div className="totals">
          <div className="totals-box">
            <div className="trow">
              <span>{showDiscountCol ? 'Subtotal (excl. ST)' : 'Total (excl. ST)'}</span>
              <span>{displayTotalExcl.toLocaleString()}</span>
            </div>
            {showDiscountCol && (
              <div className="trow">
                <span>Discount</span>
                <span>−{totalDiscount.toLocaleString()}</span>
              </div>
            )}
            <div className="trow">
              <span>Sales tax</span>
              <span>{inv.total_tax.toLocaleString()}</span>
            </div>
            {inv.advance_tax > 0 && (
              <div className="trow">
                <span>Advance tax</span>
                <span>{inv.advance_tax.toLocaleString()}</span>
              </div>
            )}
            <div className="trow grand">
              <span>Grand total</span>
              <span>{(displayGrandTotal + inv.advance_tax).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="no-print">
        <button className="btn btn-ghost" onClick={() => setShowJson(!showJson)}>
          <Code2 size={16} /> {showJson ? 'Hide' : 'Show'} FBR JSON payload &
          response
        </button>
        {showJson && (
          <>
            <h2 className="section-title">
              <Code2 size={17} /> Payload sent to FBR
            </h2>
            <pre>{JSON.stringify(inv.payload, null, 2)}</pre>
            {inv.fbr_response && (
              <>
                <h2 className="section-title">
                  <Code2 size={17} /> FBR response
                </h2>
                <pre>{JSON.stringify(inv.fbr_response, null, 2)}</pre>
              </>
            )}
          </>
        )}
      </div>

      {confirmingPromote && (
        <Modal
          title="Submit this invoice to FBR?"
          onClose={() => !promoting && setConfirmingPromote(false)}
          width={440}
        >
          <div className="alert info" style={{ marginTop: 0 }}>
            <Check size={17} />
            <span>
              Invoice{' '}
              <strong className="mono">{inv.fbr_invoice_number || inv.pos_invoice_no}</strong> will
              be submitted to <strong>FBR</strong> as a real, permanent tax record. This replaces
              its test result.
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmingPromote(false)}
              disabled={promoting}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmPromote} disabled={promoting}>
              {promoting ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              Confirm, submit to FBR
            </button>
          </div>
        </Modal>
      )}

      {confirmingPaid && (
        <Modal
          title="Mark invoice as paid?"
          onClose={() => !paidBusy && setConfirmingPaid(false)}
          width={440}
        >
          <div className="alert info" style={{ marginTop: 0 }}>
            <ShieldCheck size={17} />
            <span>
              By confirming, you're stating that invoice{' '}
              <strong className="mono">
                {inv.fbr_invoice_number || inv.pos_invoice_no}
              </strong>{' '}
              has actually been paid and its sales tax has been submitted to FBR.
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmingPaid(false)}
              disabled={paidBusy}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmMarkPaid} disabled={paidBusy}>
              {paidBusy ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
              Confirm, mark as paid
            </button>
          </div>
        </Modal>
      )}

      {advTaxOpen && (
        <Modal
          title="Add advance tax"
          onClose={() => !advTaxBusy && setAdvTaxOpen(false)}
          width={440}
        >
          <div className="alert info" style={{ marginTop: 0 }}>
            <CreditCardPlus size={17} />
            <span>
              Enter the advance income tax collected on this invoice.{' '}
              <strong>It can't be changed once saved.</strong>
            </span>
          </div>
          <div className="field">
            <label>Advance tax (Rs.)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={advTaxValue}
              onChange={(e) => setAdvTaxValue(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setAdvTaxOpen(false)}
              disabled={advTaxBusy}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={saveAdvanceTax}
              disabled={advTaxBusy || advTaxValue === '' || Number(advTaxValue) < 0}
            >
              {advTaxBusy ? <Loader2 size={16} className="spin" /> : <CreditCardPlus size={16} />}
              Save
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
