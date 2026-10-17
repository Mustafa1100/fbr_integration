import { useCallback, useEffect, useState } from 'react'
import { Download, Printer, RefreshCw, Search, Undo2 } from 'lucide-react'
import { paymentLabel } from '../../shared/calc.js'
import { api, money, onChanged } from '../api.js'
import Pagination, { PAGE_SIZES } from '../components/Pagination.jsx'
import ReceiptModal, { ReceiptSaver } from '../components/Receipt.jsx'
import StatCard from '../components/StatCard.jsx'

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'fiscalized', label: 'Accepted' },
  { id: 'queued', label: 'Queued' },
  { id: 'unconfirmed', label: 'Unconfirmed' },
  { id: 'failed', label: 'Failed' },
]
const STATUS_LABEL = {
  fiscalized: 'Accepted',
  queued: 'Queued',
  unconfirmed: 'Unconfirmed',
  failed: 'Failed',
}

export default function Invoices({ stats, locked, onChange }) {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [data, setData] = useState({ rows: [], total: 0 })
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [receiptId, setReceiptId] = useState(null)
  // Saving a receipt as a PDF straight from the list (see ReceiptSaver).
  const [savingId, setSavingId] = useState(null)
  const [saved, setSaved] = useState(null)

  const startSaving = (id) => {
    setError('')
    setSaved(null)
    setSavingId(id)
  }
  const onSaved = useCallback((result) => {
    setSaved(result)
    setSavingId(null)
  }, [])
  const onSaveFailed = useCallback((message) => {
    setError(message)
    setSavingId(null)
  }, [])

  const load = useCallback(() => {
    api
      .listInvoices({ status, search, limit: pageSize, offset: page * pageSize })
      .then((result) => {
        setData(result)
        // The list can shrink under the current page (a filter, a retry that
        // moves an invoice out of "Queued"): step back to the last real page.
        const lastPage = Math.max(Math.ceil(result.total / pageSize) - 1, 0)
        if (page > lastPage) setPage(lastPage)
      })
      .catch((err) => setError(err.message))
  }, [status, search, page, pageSize])

  useEffect(() => {
    load()
    return onChanged(load)
  }, [load])

  async function act(id, action) {
    setError('')
    setBusyId(id)
    try {
      const invoice = await action(id)
      if (invoice.status !== 'fiscalized') setError(invoice.last_error)
      else if (invoice.id !== id) setReceiptId(invoice.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
      load()
      onChange()
    }
  }

  // FBR's component registers a repeated invoice number as a second sale, so
  // an invoice it may already have received is only resent on a clear yes.
  function retry(inv) {
    if (inv.status === 'unconfirmed') {
      const ok = window.confirm(
        `FBR may already have received invoice ${inv.usin}. ` +
          'Sending it again could register this sale twice. Send it again anyway?'
      )
      if (!ok) return
    }
    act(inv.id, api.retryInvoice)
  }

  function confirmReturn(inv) {
    const ok = window.confirm(
      `Return invoice ${inv.usin} in full (Rs ${money(inv.total_bill)})? ` +
        'A credit note will be sent to FBR. This cannot be undone.'
    )
    if (ok) act(inv.id, api.returnInvoice)
  }

  return (
    <div className="page">
      <h1>Invoices</h1>
      {stats && (
        <div className="stat-row">
          <StatCard
            label="Sales today"
            value={stats.sales}
            exact={`${stats.sales} sales · Rs ${money(stats.sales_bill)}`}
            note={`Rs ${money(stats.sales_bill)}`}
          />
          <StatCard
            label="Returns today"
            value={stats.returns}
            exact={`${stats.returns} returns · Rs ${stats.returns_bill > 0 ? '−' : ''}${money(stats.returns_bill)}`}
            note={`Rs ${stats.returns_bill > 0 ? `−${money(stats.returns_bill)}` : money(0)}`}
          />
          <StatCard label="Net amount today" value={`Rs ${money(stats.total_bill)}`} note="Sales minus returns" />
          <StatCard label="Tax today" value={`Rs ${money(stats.total_tax)}`} />
          <StatCard label="Waiting for FBR" value={stats.queued} />
          <StatCard label="Need attention" value={stats.failed + stats.unconfirmed} />
        </div>
      )}

      <div className="toolbar">
        <div className="tabs">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`tab ${status === f.id ? 'active' : ''}`}
              onClick={() => {
                setStatus(f.id)
                setPage(0)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="search-box">
          <Search size={16} />
          <input
            placeholder="Invoice no., FBR no. or buyer"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
          />
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
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

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Buyer</th>
              <th>Payment</th>
              <th className="num">Total</th>
              <th>Status</th>
              <th>FBR invoice number</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((inv) => (
              <tr key={inv.id}>
                <td className="mono">
                  {inv.usin}
                  {inv.invoice_type === 3 && <span className="badge slate">Return of {inv.ref_usin}</span>}
                  {inv.restored === 1 && (
                    <span className="badge slate" title="Made on another computer, restored from the backup">
                      Restored
                    </span>
                  )}
                </td>
                <td>{inv.created_at}</td>
                <td>{inv.buyer_name || 'N/A'}</td>
                <td>{paymentLabel(inv.payment_mode)}</td>
                <td className={`num ${inv.invoice_type === 3 ? 'negative' : ''}`}>
                  {inv.invoice_type === 3 ? `−${money(inv.total_bill)}` : money(inv.total_bill)}
                </td>
                <td>
                  <span className={`badge ${inv.status}`} title={inv.last_error}>
                    {STATUS_LABEL[inv.status] || inv.status}
                  </span>
                  {inv.mode === 'demo' && <span className="badge amber">Demo</span>}
                </td>
                <td className="mono">{inv.fbr_invoice_number || 'N/A'}</td>
                <td className="actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="View and print receipt"
                    disabled={locked}
                    onClick={() => setReceiptId(inv.id)}
                  >
                    <Printer size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Save receipt as PDF in Downloads"
                    disabled={locked || savingId !== null}
                    onClick={() => startSaving(inv.id)}
                  >
                    <Download size={16} />
                  </button>
                  {inv.status !== 'fiscalized' && (
                    <button
                      type="button"
                      className="icon-btn"
                      title="Send to FBR again"
                      disabled={busyId === inv.id}
                      onClick={() => retry(inv)}
                    >
                      <RefreshCw size={16} />
                    </button>
                  )}
                  {inv.status === 'fiscalized' && inv.invoice_type === 1 && (
                    <button
                      type="button"
                      className="icon-btn"
                      title="Return this invoice"
                      disabled={locked || busyId === inv.id}
                      onClick={() => confirmReturn(inv)}
                    >
                      <Undo2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr>
                <td colSpan={8} className="muted empty">
                  No invoices to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={data.total}
        label="invoices"
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size)
          setPage(0)
        }}
      />

      {receiptId && <ReceiptModal invoiceId={receiptId} onClose={() => setReceiptId(null)} />}
      {savingId !== null && (
        <ReceiptSaver key={savingId} invoiceId={savingId} onDone={onSaved} onError={onSaveFailed} />
      )}
    </div>
  )
}
