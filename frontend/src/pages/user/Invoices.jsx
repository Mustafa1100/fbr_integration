import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ReceiptText, RefreshCw, QrCode, AlertCircle, Search } from 'lucide-react'
import { api } from '../../api'
import PaginationBar from '../../components/PaginationBar'
import TableLoader from '../../components/TableLoader'

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
    const resp = await api.getRaw(`/api/invoices?${params}`)
    setInvoices(await resp.json())
    setTotal(Number(resp.headers.get('x-total-count') || 0))
    setLoading(false)
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, q, statusFilter, uploadId])

  async function retry(inv) {
    setError('')
    try {
      await api.post(`/api/invoices/${inv.id}/submit`)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function togglePaid(inv) {
    setError('')
    try {
      await api.patch(`/api/invoices/${inv.id}/paid`, { is_paid: !inv.is_paid })
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const filtersActive = q.trim() !== '' || statusFilter !== 'all'

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ReceiptText size={22} /> Invoices <span className="muted">({total})</span>{' '}
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
                'Try a different search term or status filter.'
              ) : (
                <>
                  <Link to="/uploads">Upload a CSV</Link> to create some.
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
                  <th>Date</th>
                  <th>Buyer</th>
                  <th>Scenario</th>
                  <th>Excl. ST</th>
                  <th>Tax</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Paid</th>
                  <th>FBR Invoice No.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link to={`/invoices/${inv.id}`}>
                        <span className="strong">{inv.id}</span>
                      </Link>
                    </td>
                    <td>{inv.pos_invoice_no}</td>
                    <td>{inv.invoice_date}</td>
                    <td>{inv.buyer_name}</td>
                    <td>{inv.scenario_id}</td>
                    <td>{inv.total_excl.toLocaleString()}</td>
                    <td>{inv.total_tax.toLocaleString()}</td>
                    <td>{inv.grand_total.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${inv.status}`}>{inv.status}</span>
                    </td>
                    <td>
                      {inv.status === 'submitted' ? (
                        <button
                          type="button"
                          className={`btn btn-sm ${inv.is_paid ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => togglePaid(inv)}
                        >
                          {inv.is_paid ? 'Paid' : 'Mark paid'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="mono">{inv.fbr_invoice_number || '—'}</td>
                    <td>
                      <div className="row-actions">
                        {inv.status !== 'submitted' ? (
                          <button className="btn btn-secondary btn-sm" onClick={() => retry(inv)}>
                            <RefreshCw size={14} /> Retry
                          </button>
                        ) : (
                          <Link className="btn btn-ghost btn-sm" to={`/invoices/${inv.id}`}>
                            <QrCode size={14} /> Receipt
                          </Link>
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
    </>
  )
}
