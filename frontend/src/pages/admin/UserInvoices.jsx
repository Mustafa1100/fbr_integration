import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ReceiptText, QrCode, AlertCircle, Search } from 'lucide-react'
import { api } from '../../api'
import UserPicker from '../../components/UserPicker'
import PaginationBar from '../../components/PaginationBar'
import TableLoader from '../../components/TableLoader'
import usePageTitle from '../../hooks/usePageTitle'

export default function UserInvoices() {
  usePageTitle('Invoices')
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = searchParams.get('user') || ''
  const uploadId = searchParams.get('upload') || ''
  const [invoices, setInvoices] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [envFilter, setEnvFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  useEffect(() => {
    setPage(1)
    setQInput('')
    setQ('')
    setStatusFilter('all')
    setDateFrom('')
    setDateTo('')
  }, [userId, uploadId])

  useEffect(() => {
    if (!userId) {
      setInvoices(null)
      return
    }
    setInvoices(null)
    setError('')
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (uploadId) params.set('upload_id', uploadId)
    if (q.trim()) params.set('q', q.trim())
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (envFilter !== 'all') params.set('fbr_env', envFilter)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    api
      .getRaw(`/api/admin/users/${userId}/invoices?${params}`)
      .then(async (resp) => {
        setInvoices(await resp.json())
        setTotal(Number(resp.headers.get('x-total-count') || 0))
      })
      .catch((e) => setError(e.message))
  }, [userId, uploadId, page, pageSize, q, statusFilter, envFilter, dateFrom, dateTo])

  function pickUser(id) {
    setSearchParams(id ? { user: id } : {})
  }

  const filtersActive =
    q.trim() !== '' || statusFilter !== 'all' || dateFrom !== '' || dateTo !== ''

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ReceiptText size={22} /> Invoices{' '}
            {uploadId && <span className="muted">(upload #{uploadId})</span>}
          </h1>
          <p className="page-sub">
            Pick a user to see all their invoices and open any receipt — the same information
            they see on their own Invoices page.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <UserPicker value={userId} onChange={pickUser} />
      </div>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {!userId && (
        <div className="table-card">
          <div className="empty-state">
            <ReceiptText size={40} />
            <div className="title">No user selected</div>
            <div className="hint">Choose a user above to see their invoices.</div>
          </div>
        </div>
      )}

      {userId && (
        <>
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
              <select
                value={envFilter}
                onChange={(e) => {
                  setEnvFilter(e.target.value)
                  setPage(1)
                }}
                style={{ maxWidth: 160 }}
              >
                <option value="all">All environments</option>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
                <option value="mock">Mock</option>
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

          {!invoices && !error && <TableLoader label="invoices" />}

          {invoices && invoices.length === 0 && (
            <div className="table-card">
              <div className="empty-state">
                <ReceiptText size={40} />
                <div className="title">
                  {filtersActive ? 'No matching invoices' : 'No invoices yet'}
                </div>
                <div className="hint">
                  {filtersActive
                    ? 'Try a different search term, status, or date range.'
                    : "This user hasn't submitted any invoices."}
                </div>
              </div>
            </div>
          )}

          {invoices && invoices.length > 0 && (
            <>
              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>POS No.</th>
                      <th>Env</th>
                      <th>Date</th>
                      <th>Buyer</th>
                      <th>Scenario</th>
                      <th>Excl. ST</th>
                      <th>Tax</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Paid</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <span className="strong">{inv.id}</span>
                        </td>
                        <td>{inv.pos_invoice_no}</td>
                        <td>
                          <span
                            className={`badge ${inv.fbr_env === 'production' ? 'submitted' : 'draft'}`}
                          >
                            {inv.fbr_env}
                          </span>
                        </td>
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
                            <span className={`badge ${inv.is_paid ? 'submitted' : 'draft'}`}>
                              {inv.is_paid ? 'paid' : 'unpaid'}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <Link
                            className="btn btn-ghost btn-sm"
                            to={`/admin/invoices/${userId}/${inv.id}`}
                          >
                            <QrCode size={14} /> Receipt
                          </Link>
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
      )}
    </>
  )
}
