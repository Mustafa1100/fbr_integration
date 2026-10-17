import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Printer, X } from 'lucide-react'
import QRCode from 'qrcode'
import { paymentLabel } from '../../shared/calc.js'
import { api, money } from '../api.js'
import fbrLogo from '../assets/fbr-pos.png'

// FBR asks for QR version 2 (25×25). Fall back to automatic sizing if a
// number ever turns out too long for it, rather than printing no code at all.
async function makeQr(text) {
  const options = { errorCorrectionLevel: 'M', margin: 2, width: 168 }
  try {
    return await QRCode.toDataURL(text, { ...options, version: 2 })
  } catch {
    return QRCode.toDataURL(text, options)
  }
}

// The receipt as printed on the roll. One invoice from GET invoices:get.
export function ReceiptPaper({ inv, settings, qr }) {
  const isReturn = inv.invoice_type === 3
  const fiscalized = inv.status === 'fiscalized'
  const demo = fiscalized && inv.mode === 'demo'
  const test = fiscalized && inv.mode === 'fbr' && inv.environment !== 'live'
  const hasBuyer = inv.buyer_name || inv.buyer_ntn || inv.buyer_cnic || inv.buyer_phone

  return (
    <div className="receipt-paper" style={{ width: `${settings.paper_width || 80}mm` }}>
      <div className="rc-center">
        <div className="rc-title">{settings.business_name || 'Business name not set'}</div>
        {settings.address && <div>{settings.address}</div>}
        {settings.phone && <div>Phone: {settings.phone}</div>}
        {settings.ntn && <div>NTN: {settings.ntn}</div>}
        {settings.strn && <div>STRN: {settings.strn}</div>}
      </div>

      {(demo || test) && (
        <div className="rc-flag">
          {demo ? 'DEMO — NOT SENT TO FBR' : 'TEST INVOICE — NOT A VALID RECEIPT'}
        </div>
      )}
      {isReturn && <div className="rc-flag">RETURN / CREDIT NOTE</div>}

      <div className="rc-rule" />
      <div className="rc-row">
        <span>Invoice</span>
        <span>{inv.usin}</span>
      </div>
      {isReturn && (
        <div className="rc-row">
          <span>Against invoice</span>
          <span>{inv.ref_usin}</span>
        </div>
      )}
      <div className="rc-row">
        <span>Date</span>
        <span>{inv.created_at}</span>
      </div>
      <div className="rc-row">
        <span>Payment</span>
        <span>{paymentLabel(inv.payment_mode)}</span>
      </div>
      {inv.pos_id && (
        <div className="rc-row">
          <span>POS ID</span>
          <span>{inv.pos_id}</span>
        </div>
      )}
      {hasBuyer && (
        <>
          <div className="rc-rule" />
          {inv.buyer_name && <div>Buyer: {inv.buyer_name}</div>}
          {inv.buyer_ntn && <div>NTN: {inv.buyer_ntn}</div>}
          {inv.buyer_cnic && <div>CNIC: {inv.buyer_cnic}</div>}
          {inv.buyer_phone && <div>Phone: {inv.buyer_phone}</div>}
        </>
      )}

      <div className="rc-rule" />
      {inv.items.map((it) => (
        <div key={it.id} className="rc-item">
          <div>{it.item_name}</div>
          <div className="rc-row">
            <span>
              {it.quantity} × {money(it.unit_price)}
              {it.tax_rate > 0 && ` · tax ${it.tax_rate}%`}
            </span>
            <span>{money(it.total_amount)}</span>
          </div>
        </div>
      ))}

      <div className="rc-rule" />
      <div className="rc-row">
        <span>Sale value (excl. tax)</span>
        <span>{money(inv.total_sale_value)}</span>
      </div>
      {inv.total_discount > 0 && (
        <div className="rc-row">
          <span>Discount included</span>
          <span>{money(inv.total_discount)}</span>
        </div>
      )}
      <div className="rc-row">
        <span>Tax</span>
        <span>{money(inv.total_tax + inv.total_further_tax)}</span>
      </div>
      <div className="rc-row rc-total">
        <span>{isReturn ? 'Refund total' : 'Total'}</span>
        <span>Rs {money(inv.total_bill)}</span>
      </div>

      <div className="rc-rule" />
      {fiscalized ? (
        <div className="rc-fbr">
          {!demo && <img className="rc-logo" src={fbrLogo} alt="FBR POS invoicing system" />}
          {qr && <img className="rc-qr" src={qr} alt="QR code of the FBR invoice number" />}
          <div className="rc-fbr-number">
            <div>FBR Invoice Number</div>
            <strong>{inv.fbr_invoice_number}</strong>
          </div>
        </div>
      ) : (
        <div className="rc-flag">
          NOT YET REGISTERED WITH FBR
          <br />
          no FBR invoice number
        </div>
      )}

      {settings.receipt_footer && <div className="rc-center rc-footer">{settings.receipt_footer}</div>}
      <div className="rc-credit">Invoice generated with compliance.pk</div>
    </div>
  )
}

// Everything a receipt needs: the invoice, the business settings and its QR.
function useReceipt(invoiceId) {
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([api.getInvoice(invoiceId), api.getSettings()])
      .then(async ([inv, settings]) => {
        const qr = inv.status === 'fiscalized' ? await makeQr(inv.fbr_invoice_number) : ''
        if (!cancelled) setReceipt({ inv, settings, qr })
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [invoiceId])

  return { receipt, loadError: error }
}

// Saves an invoice's receipt as a PDF without opening it, for the download
// button on the Invoices list. It renders the receipt out of sight — one copy
// for the print stylesheet, one to measure — saves, then reports back through
// onDone({ name, file }) or onError(message).
export function ReceiptSaver({ invoiceId, onDone, onError }) {
  const { receipt, loadError } = useReceipt(invoiceId)
  const measureRef = useRef(null)

  useEffect(() => {
    if (loadError) onError(loadError)
  }, [loadError, onError])

  useEffect(() => {
    if (!receipt) return undefined
    let cancelled = false
    ;(async () => {
      try {
        // The logo and QR must have loaded, or they would be missing from
        // the PDF and the measured height would be short.
        const images = document.querySelectorAll('.print-root img, .receipt-measure img')
        await Promise.all([...images].map((img) => img.decode().catch(() => {})))
        if (cancelled) return
        const paper = measureRef.current.querySelector('.receipt-paper')
        const result = await api.saveReceiptPdf({
          usin: receipt.inv.usin,
          heightPx: paper.getBoundingClientRect().height,
        })
        if (!cancelled) onDone(result)
      } catch (err) {
        if (!cancelled) onError(err.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [receipt, onDone, onError])

  if (!receipt) return null
  return createPortal(
    <>
      <div className="receipt-measure" ref={measureRef} aria-hidden="true">
        <ReceiptPaper {...receipt} />
      </div>
      <div className="print-root">
        <ReceiptPaper {...receipt} />
      </div>
    </>,
    document.body
  )
}

export default function ReceiptModal({ invoiceId, onClose }) {
  const { receipt, loadError } = useReceipt(invoiceId)
  const { inv, settings, qr } = receipt || {}
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const previewRef = useRef(null)

  useEffect(() => {
    if (loadError) setError(loadError)
  }, [loadError])

  async function print() {
    setError('')
    try {
      await api.printReceipt()
    } catch (err) {
      setError(err.message)
    }
  }

  // The PDF page is cut to the receipt's size, measured from the preview.
  async function savePdf() {
    setError('')
    setSaved(null)
    setSaving(true)
    try {
      const paper = previewRef.current.querySelector('.receipt-paper')
      setSaved(
        await api.saveReceiptPdf({
          usin: inv.usin,
          heightPx: paper.getBoundingClientRect().height,
        })
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const ready = !!receipt
  return (
    <div className="modal-backdrop">
      <div className="modal receipt-modal">
        <div className="modal-head">
          <h3>Receipt</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {error && <div className="alert error">{error}</div>}
        {ready && inv.status !== 'fiscalized' && (
          <div className="alert warn">
            {inv.status === 'queued' &&
              'The FBR service could not be reached. This invoice is queued and will be sent again automatically.'}
            {inv.status === 'unconfirmed' &&
              'The FBR service did not answer, so it is not known whether it received this invoice. Check it on the Invoices page before sending it again.'}
            {inv.status === 'failed' && `FBR did not accept this invoice: ${inv.last_error}`}
          </div>
        )}
        {saved && (
          <div className="alert success saved-note">
            <span>
              Saved to Downloads as <strong>{saved.name}</strong>
            </span>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => api.revealReceipt(saved.file).catch((err) => setError(err.message))}
            >
              Show in folder
            </button>
          </div>
        )}
        <div className="receipt-preview" ref={previewRef}>
          {ready && <ReceiptPaper inv={inv} settings={settings} qr={qr} />}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn ghost" onClick={savePdf} disabled={!ready || saving}>
            <Download size={16} /> {saving ? 'Saving…' : 'Save PDF'}
          </button>
          <button type="button" className="btn" onClick={print} disabled={!ready}>
            <Printer size={16} /> Print
          </button>
        </div>
      </div>
      {/* The copy the print stylesheet shows; the page itself is hidden in print. */}
      {ready &&
        createPortal(
          <div className="print-root">
            <ReceiptPaper inv={inv} settings={settings} qr={qr} />
          </div>,
          document.body
        )}
    </div>
  )
}
