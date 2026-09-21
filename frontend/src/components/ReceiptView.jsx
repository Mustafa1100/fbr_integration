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
import ReceiptDocument from './ReceiptDocument'

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

  const strns = inv.seller.strns || []

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

      <ReceiptDocument inv={inv} strnChoice={strnChoice} />

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
