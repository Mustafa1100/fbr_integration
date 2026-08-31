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
} from 'lucide-react'
import { api } from '../../api'
import Modal from '../../components/Modal'
import PaginationBar from '../../components/PaginationBar'
import TableLoader from '../../components/TableLoader'
import usePageTitle from '../../hooks/usePageTitle'

// User-facing wording: "Test" (sandbox / simulated) vs "Live" (real FBR).
const MODE_LABELS = { mock: 'Test', sandbox: 'Test', production: 'Live' }
const FILTER_LABELS = { all: 'All', sandbox: 'Test', production: 'Live' }

export default function Invoices() {
  usePageTitle('Invoices History')
  const [invoices, setInvoices] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [envFilter, setEnvFilter] = useState('all') // 'all' | 'sandbox' | 'production'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canProd, setCanProd] = useState(false)
  const [searchParams] = useSearchParams()
  const uploadId = searchParams.get('upload')

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
    setInvoices(await resp.json())
    setTotal(Number(resp.headers.get('x-total-count') || 0))
    setLoading(false)
  }

  useEffect(() => {
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

  const filtersActive =
    q.trim() !== '' || statusFilter !== 'all' || dateFrom !== '' || dateTo !== ''

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
      </div>
      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="row-actions" style={{ gap: 8, marginBottom: '1rem' }}>
        {['all', 'sandbox', 'production'].map((e) => (
          <button
            key={e}
            type="button"
            className={`btn btn-sm ${envFilter === e ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setEnvFilter(e)
              setPage(1)
            }}
          >
            {FILTER_LABELS[e]}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div className="input-wrap" style={{ flex: '1 1 240px', maxWidth: 320 }}>
            <Search size={15} />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search by POS no., buyer, FBR invoice no…"
            />
          </div>
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
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>POS No.</th>
                  <th>Mode</th>
                  <th>Date</th>
                  <th>Buyer</th>
                  <th>Excl. ST</th>
                  <th>Tax</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Paid</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => (
                  <tr key={inv.id}>
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
    </>
  )
}
