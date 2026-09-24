import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ReceiptText,
  RefreshCw,
  QrCode,
  AlertCircle,
  Search,
  ShieldCheck,
  Loader2,
  Check,
  Trash2,
  Printer,
  FileSpreadsheet,
} from 'lucide-react'
import { api } from '../../api'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import SearchHelp from '../../components/SearchHelp'
import TableLoader from '../../components/TableLoader'
import usePageTitle from '../../hooks/usePageTitle'

// User-facing wording: "Test" (sandbox / simulated) vs "Live" (real FBR).
const MODE_LABELS = { mock: 'Test', sandbox: 'Test', production: 'Live' }
const ENV_OPTIONS = [
  { value: 'production', label: 'Live' },
  { value: 'sandbox', label: 'Test' },
  { value: 'all', label: 'All (Test + Live)' },
]

// Mirrors the server rule: a test invoice can always be deleted; a live one
// only if it failed — a live invoice FBR accepted is a real tax record.
const canDelete = (inv) => inv.fbr_env !== 'production' || inv.status === 'failed'

export default function Invoices() {
  usePageTitle('Invoices History')
  const [searchParams] = useSearchParams()
  const uploadId = searchParams.get('upload')
  const [invoices, setInvoices] = useState([])
  const [total, setTotal] = useState(0)
  // How many of the current results have a receipt to print (submitted to FBR).
  const [printable, setPrintable] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  // Deep links (e.g. "View failed invoices" on Submission History) can preselect a status.
  const [statusFilter, setStatusFilter] = useState(() => {
    const wanted = searchParams.get('status')
    return ['submitted', 'failed', 'draft'].includes(wanted) ? wanted : 'all'
  })
  // Default to Live; a deep-link from an upload shows everything in it.
  const [envFilter, setEnvFilter] = useState(uploadId ? 'all' : 'production')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canProd, setCanProd] = useState(false)
  const [selected, setSelected] = useState(() => new Set()) // ids of ticked test invoices
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  useEffect(() => {
    setPage(1)
  }, [uploadId])

  async function refresh() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (uploadId) params.set('upload_id', uploadId)
    if (q.trim()) params.set('q', q.trim())
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (envFilter !== 'all') params.set('fbr_env', envFilter)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    const resp = await api.getRaw(`/api/invoices?${params}`)
    const rows = await resp.json()
    setInvoices(rows)
    // Drop selections for rows that are no longer in the list (deleted one by
    // one, moved off the page) so the selected count stays honest.
    const present = new Set(rows.map((r) => r.id))
    setSelected((prev) => new Set([...prev].filter((id) => present.has(id))))
    const count = Number(resp.headers.get('x-total-count') || 0)
    setTotal(count)
    setLoading(false)
    // Only submitted invoices have a receipt: with the "all" view that needs its own
    // count (a one-row request — we only want the total from the header).
    if (statusFilter === 'all') {
      const p = new URLSearchParams(params)
      p.set('status', 'submitted')
      p.set('page', '1')
      p.set('page_size', '1')
      const r = await api.getRaw(`/api/invoices?${p}`)
      setPrintable(Number(r.headers.get('x-total-count') || 0))
    } else {
      setPrintable(statusFilter === 'submitted' ? count : 0)
    }
  }

  useEffect(() => {
    // A different page/filter is a different set of rows — start a fresh selection.
    setSelected(new Set())
    refresh().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, q, statusFilter, envFilter, dateFrom, dateTo, uploadId])

  useEffect(() => {
    api
      .get('/api/settings/fbr')
      .then((s) => setCanProd(!!s.can_submit_production))
      .catch(() => {})
  }, [])

  async function retry(inv) {
    setError('')
    try {
      await api.post(`/api/invoices/${inv.id}/submit`)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const [confirmPromoteInvoice, setConfirmPromoteInvoice] = useState(null)
  const [promoting, setPromoting] = useState(false)

  async function confirmPromote() {
    setPromoting(true)
    setError('')
    try {
      await api.post(`/api/invoices/${confirmPromoteInvoice.id}/promote`)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setPromoting(false)
      setConfirmPromoteInvoice(null)
    }
  }

  const [confirmPaidInvoice, setConfirmPaidInvoice] = useState(null)
  const [markingPaid, setMarkingPaid] = useState(false)

  const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    setDeleting(true)
    setError('')
    try {
      await api.delete(`/api/invoices/${confirmDeleteInvoice.id}`)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
      setConfirmDeleteInvoice(null)
    }
  }

  const selectable = invoices.filter(canDelete)
  const allSelected = selectable.length > 0 && selectable.every((inv) => selected.has(inv.id))
  const someSelected = selected.size > 0 && !allSelected
  const selectedInvoices = invoices.filter((inv) => selected.has(inv.id))
  const selectedSubmitted = selectedInvoices.filter((inv) => inv.status === 'submitted').length
  const selectedNotSubmitted = selectedInvoices.length - selectedSubmitted

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((inv) => inv.id)))
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    setError('')
    try {
      const { deleted, skipped } = await api.post('/api/invoices/bulk-delete', {
        ids: [...selected],
      })
      setSelected(new Set())
      if (skipped.length > 0) {
        setError(
          `${skipped.length} invoice${skipped.length === 1 ? '' : 's'} could not be deleted: ${skipped[0].reason}`
        )
      }
      // Emptied the whole page — step back instead of showing an empty one.
      if (page > 1 && deleted.length >= invoices.length) setPage(page - 1)
      else await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBulkDeleting(false)
      setConfirmBulkDelete(false)
    }
  }

  async function setPaid(inv, isPaid) {
    setError('')
    try {
      await api.patch(`/api/invoices/${inv.id}/paid`, { is_paid: isPaid })
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  // Marking paid asks for confirmation (it's an attestation the tax was
  // actually paid/submitted) — undoing an accidental mark doesn't need it.
  async function confirmMarkPaid() {
    setMarkingPaid(true)
    await setPaid(confirmPaidInvoice, true)
    setMarkingPaid(false)
    setConfirmPaidInvoice(null)
  }

  // "Print receipts" carries the current search/filters to the print page (opened
  // in a new tab so this page keeps its filters). Only submitted invoices have a
  // receipt, so it's offered for the "all" and "submitted" views.
  const printParams = new URLSearchParams()
  if (uploadId) printParams.set('upload_id', uploadId)
  if (q.trim()) printParams.set('q', q.trim())
  if (envFilter !== 'all') printParams.set('fbr_env', envFilter)
  if (dateFrom) printParams.set('date_from', dateFrom)
  if (dateTo) printParams.set('date_to', dateTo)
  const showPrintAll =
    total > 0 && printable !== null && (statusFilter === 'all' || statusFilter === 'submitted')

  // Same gating as "Print receipts" — only submitted invoices are real,
  // FBR-issued records, so the export (like the receipts) is limited to
  // those, regardless of the current status filter.
  const showExportAll = showPrintAll

  async function exportExcel() {
    setExporting(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (uploadId) params.set('upload_id', uploadId)
      if (q.trim()) params.set('q', q.trim())
      params.set('status', 'submitted')
      if (envFilter !== 'all') params.set('fbr_env', envFilter)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      const resp = await api.getRaw(`/api/invoices/export?${params}`)
      const blob = await resp.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `invoices_export_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      setError(err.message)
    } finally {
      setExporting(false)
    }
  }

  const filtersActive =
    q.trim() !== '' || statusFilter !== 'all' || dateFrom !== '' || dateTo !== ''
  const showDiscountCol = invoices.some((inv) => inv.total_discount > 0)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ReceiptText size={22} /> Invoices History <span className="muted">({total})</span>{' '}
            {uploadId && <span className="muted">(upload #{uploadId})</span>}
          </h1>
          <p className="page-sub">Review invoice receipts and their FBR invoice numbers.</p>
        </div>
        <div className="page-actions">
          {showExportAll &&
            (printable > 0 ? (
              <button
                type="button"
                className="btn btn-secondary has-tip has-tip-below"
                onClick={exportExcel}
                disabled={exporting}
                data-tip="Download every submitted invoice in these results as a CSV file (opens in Excel)"
                aria-label="Export to Excel"
              >
                {exporting ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <FileSpreadsheet size={16} />
                )}
                Export to Excel ({printable})
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary has-tip has-tip-below"
                disabled
                data-tip="None of these invoices has been submitted to FBR, so there's nothing to export"
                aria-label="Export to Excel — nothing to export"
              >
                <FileSpreadsheet size={16} /> Export to Excel (0)
              </button>
            ))}
          {showPrintAll &&
            (printable > 0 ? (
              <Link
                className="btn btn-secondary has-tip has-tip-below"
                to={`/invoices/print?${printParams}`}
                target="_blank"
                rel="noopener"
                data-tip="Print, or save as one PDF, every submitted invoice in these results"
                aria-label="Print receipts for all results"
              >
                <Printer size={16} /> Print receipts ({printable})
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-secondary has-tip has-tip-below"
                disabled
                data-tip="None of these invoices has been submitted to FBR, so there are no receipts to print"
                aria-label="Print receipts — nothing to print"
              >
                <Printer size={16} /> Print receipts (0)
              </button>
            ))}
          <select
            value={envFilter}
            onChange={(e) => {
              setEnvFilter(e.target.value)
              setPage(1)
            }}
            aria-label="Show invoices for"
          >
            {ENV_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div className="input-wrap" style={{ flex: '1 1 340px', maxWidth: 440 }}>
            <Search size={15} />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search POS no., customer, CNIC/NTN, FBR no…"
            />
          </div>
          <SearchHelp />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            style={{ maxWidth: 200 }}
          >
            <option value="all">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="failed">Failed</option>
            <option value="draft">Draft</option>
          </select>
          <div className="row-actions" style={{ marginLeft: 'auto', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label className="row-actions" style={{ gap: '0.4rem' }}>
              <span className="muted">From</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setPage(1)
                }}
              />
            </label>
            <label className="row-actions" style={{ gap: '0.4rem' }}>
              <span className="muted">To</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setPage(1)
                }}
              />
            </label>
            {filtersActive && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setQInput('')
                  setQ('')
                  setStatusFilter('all')
                  setDateFrom('')
                  setDateTo('')
                  setPage(1)
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {loading && <TableLoader label="invoices" />}

      {!loading && invoices.length === 0 && (
        <div className="table-card">
          <div className="empty-state">
            <ReceiptText size={40} />
            <div className="title">{filtersActive ? 'No matching invoices' : 'No invoices yet'}</div>
            <div className="hint">
              {filtersActive ? (
                'Try a different search term, status, or date range.'
              ) : (
                <>
                  <Link to="/uploads">Generate an invoice</Link> to create some.
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && invoices.length > 0 && (
        <>
          {selected.size > 0 && (
            <div className="bulk-bar">
              <span className="strong">
                {selected.size} invoice{selected.size === 1 ? '' : 's'} selected
              </span>
              <div className="row-actions" style={{ marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setConfirmBulkDelete(true)}
                >
                  <Trash2 size={14} /> Delete selected
                </button>
              </div>
            </div>
          )}
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th className="select-col">
                    <input
                      type="checkbox"
                      className="select-check"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected
                      }}
                      disabled={selectable.length === 0}
                      onChange={toggleAll}
                      aria-label="Select all deletable invoices on this page"
                      title={
                        selectable.length === 0
                          ? 'Live invoices that FBR accepted can’t be deleted'
                          : 'Select all deletable invoices on this page'
                      }
                    />
                  </th>
                  <th>#</th>
                  <th>POS No.</th>
                  <th>Mode</th>
                  <th>Date</th>
                  <th>Buyer</th>
                  <th>Excl. ST</th>
                  {showDiscountCol && <th>Discount</th>}
                  <th>Tax</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Paid</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => (
                  <tr key={inv.id} className={selected.has(inv.id) ? 'row-selected' : undefined}>
                    <td className="select-col">
                      {canDelete(inv) && (
                        <input
                          type="checkbox"
                          className="select-check"
                          checked={selected.has(inv.id)}
                          onChange={() => toggleOne(inv.id)}
                          aria-label={`Select invoice ${inv.pos_invoice_no}`}
                        />
                      )}
                    </td>
                    <td>
                      <Link to={`/invoices/${inv.id}`}>
                        <span className="strong">{(page - 1) * pageSize + idx + 1}</span>
                      </Link>
                    </td>
                    <td>{inv.pos_invoice_no}</td>
                    <td>
                      <span
                        className={`badge ${inv.fbr_env === 'production' ? 'submitted' : 'draft'}`}
                      >
                        {MODE_LABELS[inv.fbr_env] || inv.fbr_env}
                      </span>
                    </td>
                    <td>{inv.invoice_date}</td>
                    <td>{inv.buyer_name}</td>
                    <td>{inv.total_excl.toLocaleString()}</td>
                    {showDiscountCol && (
                      <td>
                        {inv.total_discount > 0 ? `−${inv.total_discount.toLocaleString()}` : '—'}
                      </td>
                    )}
                    <td>{inv.total_tax.toLocaleString()}</td>
                    <td>{inv.grand_total.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${inv.status}`}>{inv.status}</span>
                    </td>
                    <td>
                      {inv.status === 'submitted' && inv.fbr_env === 'production' ? (
                        <button
                          type="button"
                          className={`btn btn-sm ${inv.is_paid ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() =>
                            inv.is_paid ? setPaid(inv, false) : setConfirmPaidInvoice(inv)
                          }
                        >
                          {inv.is_paid ? 'Paid' : 'Mark paid'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {inv.status !== 'submitted' ? (
                          <button
                            className="btn btn-secondary btn-sm has-tip"
                            onClick={() => retry(inv)}
                            data-tip="Retry submission"
                            aria-label="Retry submission"
                          >
                            <RefreshCw size={14} />
                          </button>
                        ) : (
                          <Link
                            className="btn btn-primary btn-sm has-tip"
                            to={`/invoices/${inv.id}`}
                            data-tip="View receipt"
                            aria-label="View receipt"
                          >
                            <QrCode size={14} />
                          </Link>
                        )}
                        {canProd &&
                          inv.status === 'submitted' &&
                          inv.fbr_env !== 'production' && (
                            <button
                              className="btn btn-secondary btn-sm has-tip"
                              onClick={() => setConfirmPromoteInvoice(inv)}
                              data-tip="Submit to FBR"
                              aria-label="Submit to FBR"
                            >
                              <Check size={14} />
                            </button>
                          )}
                        {canDelete(inv) && (
                          <button
                            className="btn btn-ghost btn-sm has-tip"
                            onClick={() => setConfirmDeleteInvoice(inv)}
                            data-tip="Delete"
                            aria-label="Delete invoice"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
            itemLabel="invoices"
          />
        </>
      )}

      {confirmPromoteInvoice && (
        <Modal
          title="Submit this invoice to FBR?"
          onClose={() => !promoting && setConfirmPromoteInvoice(null)}
          width={460}
        >
          <div className="alert info" style={{ marginTop: 0 }}>
            <Check size={17} />
            <span>
              Invoice{' '}
              <strong className="mono">
                {confirmPromoteInvoice.fbr_invoice_number || confirmPromoteInvoice.pos_invoice_no}
              </strong>{' '}
              ({confirmPromoteInvoice.buyer_name}) will be submitted to <strong>FBR</strong> as a
              real, permanent tax record. This replaces its test result.
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmPromoteInvoice(null)}
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

      {confirmPaidInvoice && (
        <Modal
          title="Mark invoice as paid?"
          onClose={() => !markingPaid && setConfirmPaidInvoice(null)}
          width={440}
        >
          <div className="alert info" style={{ marginTop: 0 }}>
            <ShieldCheck size={17} />
            <span>
              By confirming, you're stating that invoice{' '}
              <strong className="mono">
                {confirmPaidInvoice.fbr_invoice_number || confirmPaidInvoice.pos_invoice_no}
              </strong>{' '}
              ({confirmPaidInvoice.buyer_name}) has actually been paid and its sales tax has been
              submitted to FBR.
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmPaidInvoice(null)}
              disabled={markingPaid}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={confirmMarkPaid} disabled={markingPaid}>
              {markingPaid ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
              Confirm, mark as paid
            </button>
          </div>
        </Modal>
      )}

      {confirmBulkDelete && (
        <Modal
          title={`Delete ${selected.size} invoice${selected.size === 1 ? '' : 's'}?`}
          onClose={() => !bulkDeleting && setConfirmBulkDelete(false)}
          width={460}
        >
          <div className="alert info" style={{ marginTop: 0 }}>
            <Trash2 size={17} />
            <span>
              {selected.size === 1 ? 'This invoice' : `These ${selected.size} invoices`}
              {selectedSubmitted > 0 && selectedNotSubmitted > 0 && (
                <>
                  {' '}
                  ({selectedSubmitted} submitted, {selectedNotSubmitted} failed)
                </>
              )}{' '}
              will be removed from your history. Live invoices that FBR accepted are never
              affected.
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmBulkDelete(false)}
              disabled={bulkDeleting}
            >
              Cancel
            </button>
            <button className="btn btn-danger" onClick={bulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
              Delete {selected.size}
            </button>
          </div>
        </Modal>
      )}

      {confirmDeleteInvoice && (
        <Modal
          title="Delete this invoice?"
          onClose={() => !deleting && setConfirmDeleteInvoice(null)}
          width={440}
        >
          <div className="alert info" style={{ marginTop: 0 }}>
            <Trash2 size={17} />
            <span>
              Invoice{' '}
              <strong className="mono">
                {confirmDeleteInvoice.fbr_invoice_number || confirmDeleteInvoice.pos_invoice_no}
              </strong>{' '}
              ({confirmDeleteInvoice.buyer_name}) will be removed from your history.
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmDeleteInvoice(null)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
              Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
