import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Info, Loader2, Printer, ReceiptText } from 'lucide-react'
import { api } from '../../api'
import ReceiptDocument from '../../components/ReceiptDocument'
import usePageTitle from '../../hooks/usePageTitle'

// Prints many receipts as ONE document — e.g. everything a customer has been
// invoiced, found by searching their name or CNIC on Invoices History. The
// browser's print dialog ("Save as PDF") turns it into a single PDF with one
// receipt per page, exactly as the single-receipt page would print each.
// The filters arrive in the URL (opened from Invoices History) and are passed
// straight to GET /api/invoices/receipts.
const FILTER_KEYS = ['upload_id', 'q', 'fbr_env', 'date_from', 'date_to']

export default function PrintReceipts() {
  const [searchParams] = useSearchParams()
  const [data, setData] = useState(null) // { total, limit, invoices }
  const [error, setError] = useState('')
  // Which STRN to print, when the seller has more than one — applies to every receipt.
  const [strnChoice, setStrnChoice] = useState('')

  const query = new URLSearchParams()
  FILTER_KEYS.forEach((k) => searchParams.get(k) && query.set(k, searchParams.get(k)))
  const queryString = query.toString()

  useEffect(() => {
    setData(null)
    setError('')
    api
      .get(`/api/invoices/receipts?${queryString}`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [queryString])

  const invoices = data?.invoices ?? []
  // The browser proposes the page title as the PDF's file name — make it useful.
  const buyers = [...new Set(invoices.map((i) => i.buyer_name))]
  usePageTitle(
    data && invoices.length
      ? buyers.length === 1
        ? `Tax receipts - ${buyers[0]}`
        : `Tax receipts (${invoices.length})`
      : 'Print receipts'
  )

  const strns = invoices[0]?.seller.strns || []
  const truncated = data && data.total > invoices.length

  return (
    <>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">
            <ReceiptText size={22} /> Print receipts{' '}
            {data && <span className="muted">({invoices.length})</span>}
          </h1>
          <p className="page-sub">
            Every submitted invoice matching your search, one receipt per page.
          </p>
        </div>
        <div className="page-actions">
          <Link
            to="/invoices"
            className="btn btn-hollow has-tip has-tip-below"
            data-tip="Back to invoices"
            aria-label="Back to invoices"
          >
            <ArrowLeft size={16} />
          </Link>
          <button
            className="btn btn-primary"
            onClick={() => window.print()}
            disabled={!invoices.length}
          >
            <Printer size={16} /> Print / Save as PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error no-print">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {!error && !data && (
        <div className="loading no-print">
          <Loader2 size={18} className="spin" /> Loading receipts…
        </div>
      )}

      {data && invoices.length === 0 && (
        <div className="table-card no-print">
          <div className="empty-state">
            <ReceiptText size={40} />
            <div className="title">
              {data.not_submitted > 0 ? 'No receipts to print' : 'No invoices match this search'}
            </div>
            <div className="hint">
              {data.not_submitted > 0 ? (
                <>
                  {data.not_submitted} invoice{data.not_submitted === 1 ? ' matches' : 's match'}{' '}
                  your search, but none has been submitted to FBR (they failed or are still
                  drafts), so there is no receipt to print. Only invoices FBR accepted have one.
                </>
              ) : (
                'Nothing matched your search.'
              )}{' '}
              <Link to="/invoices">Back to invoices</Link>
            </div>
          </div>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="alert info no-print">
          <Info size={17} />
          <span>
            Click <strong>Print / Save as PDF</strong>, then in the print window choose{' '}
            <strong>Save as PDF</strong> as the destination. You get one file with all{' '}
            {invoices.length} receipt{invoices.length === 1 ? '' : 's'}, each on its own page.
          </span>
        </div>
      )}

      {invoices.length > 0 && data.not_submitted > 0 && (
        <div className="alert info no-print">
          <Info size={17} />
          <span>
            {data.not_submitted} other invoice{data.not_submitted === 1 ? '' : 's'} matched your
            search but {data.not_submitted === 1 ? 'was' : 'were'} left out — not submitted to FBR
            (failed or draft), so {data.not_submitted === 1 ? 'it has' : 'they have'} no receipt.
          </span>
        </div>
      )}

      {truncated && (
        <div className="alert error no-print">
          <AlertCircle size={17} />
          <span>
            {data.total} invoices match, but only the first {invoices.length} are shown. Narrow the
            search (for example with a date range) and print the rest separately.
          </span>
        </div>
      )}

      {strns.length > 1 && (
        <div className="strn-picker no-print">
          <label htmlFor="strn-picker">STRN on these receipts</label>
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

      {invoices.map((inv) => (
        <div key={inv.id} className="receipt-sheet">
          <ReceiptDocument inv={inv} strnChoice={strnChoice} />
        </div>
      ))}
    </>
  )
}
