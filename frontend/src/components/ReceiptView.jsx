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
} from 'lucide-react'
import { api } from '../api'
import Modal from './Modal'

// Shared receipt UI for both the user's own view (/invoices/:id) and the
// admin read-only view (/admin/invoices/:userId/:invoiceId) — same data
// shape from either GET /api/invoices/:id or GET
// /api/admin/users/:userId/invoices/:invoiceId, just a different URL.
// allowMarkPaid: only the user's own view passes this — admin's view stays
// read-only oversight, not on-behalf editing, but still shows the badge.
export default function ReceiptView({ apiUrl, backTo, backLabel, banner, allowMarkPaid = false }) {
  const [inv, setInv] = useState(null)
  const [error, setError] = useState('')
  const [showJson, setShowJson] = useState(false)
  const [paidBusy, setPaidBusy] = useState(false)
  const [confirmingPaid, setConfirmingPaid] = useState(false)

  useEffect(() => {
    setInv(null)
    setError('')
    api
      .get(apiUrl)
      .then(setInv)
      .catch((e) => setError(e.message))
  }, [apiUrl])

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

  // 3rd Schedule Goods are taxed off fixedNotifiedValueOrRetailPrice, not
  // the sale value — value_excl_st on those items can hold a negligible
  // FBR-workaround placeholder (0.01) rather than a real price (see
  // csv_processor.py). Show the real fixed/notified value as the basis
  // instead, wherever it's set, so the receipt doesn't read as "free."
  const items = inv.items.map((it) => {
    const excl = it.fixed_notified_value > 0 ? it.fixed_notified_value : it.value_excl_st
    return { ...it, displayExcl: excl, displayTotal: excl + it.sales_tax }
  })
  const usesFixedValue = items.some((it) => it.fixed_notified_value > 0)
  const displayTotalExcl = items.reduce((sum, it) => sum + it.displayExcl, 0)
  const displayGrandTotal = displayTotalExcl + inv.total_tax

  return (
    <>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">
            <ReceiptIcon size={22} /> Tax Receipt{' '}
            <span className={`badge ${inv.status}`}>{inv.status}</span>
            {inv.status === 'submitted' && (
              <span className={`badge ${inv.is_paid ? 'submitted' : 'draft'}`}>
                {inv.is_paid ? 'paid' : 'unpaid'}
              </span>
            )}
          </h1>
          <p className="page-sub">Printable tax receipt for this invoice.</p>
        </div>
        <div className="page-actions">
          <Link to={backTo} className="btn btn-secondary">
            <ArrowLeft size={16} /> {backLabel}
          </Link>
          {allowMarkPaid && inv.status === 'submitted' && (
            <button
              className={`btn ${inv.is_paid ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => (inv.is_paid ? setPaid(false) : setConfirmingPaid(true))}
              disabled={paidBusy}
            >
              {paidBusy && <Loader2 size={16} className="spin" />}
              {inv.is_paid ? 'Mark as unpaid' : 'Mark as paid'}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Printer size={16} /> Print receipt
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

      <div className="card receipt">
        <div className="receipt-head">
          <div>
            <h2>{inv.seller.business_name || 'Seller business name not set'}</h2>
            <p>
              NTN: {inv.seller.ntn_cnic || '—'}
              <br />
              {inv.seller.address}, {inv.seller.province}
            </p>
            <p>
              <strong>{inv.invoice_type}</strong> — {inv.invoice_date}
              {inv.pos_invoice_no && (
                <>
                  <br />
                  POS ref: {inv.pos_invoice_no}
                </>
              )}
            </p>
          </div>
          <div className="fbr-box">
            {inv.qr ? (
              <>
                <img src={inv.qr} alt="FBR QR code" />
                <div className="fbr-number">
                  FBR Invoice No.
                  <br />
                  <span className="mono">{inv.fbr_invoice_number}</span>
                </div>
              </>
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
              <span>Total (excl. ST)</span>
              <span>{displayTotalExcl.toLocaleString()}</span>
            </div>
            <div className="trow">
              <span>Sales tax</span>
              <span>{inv.total_tax.toLocaleString()}</span>
            </div>
            <div className="trow grand">
              <span>Grand total</span>
              <span>{displayGrandTotal.toLocaleString()}</span>
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
    </>
  )
}
