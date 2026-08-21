import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { History, FileText, ReceiptText, AlertCircle, UploadCloud, Search } from 'lucide-react'
import { api } from '../../api'
import UserPicker from '../../components/UserPicker'
import PaginationBar from '../../components/PaginationBar'
import TableLoader from '../../components/TableLoader'
import usePageTitle from '../../hooks/usePageTitle'

export default function UserUploads() {
  usePageTitle('Upload History')
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = searchParams.get('user') || ''
  const [uploads, setUploads] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
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
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setUploads(null)
      return
    }
    setUploads(null)
    setError('')
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (q.trim()) params.set('q', q.trim())
    if (statusFilter !== 'all') params.set('status', statusFilter)
    api
      .getRaw(`/api/admin/users/${userId}/uploads?${params}`)
      .then(async (resp) => {
        setUploads(await resp.json())
        setTotal(Number(resp.headers.get('x-total-count') || 0))
      })
      .catch((e) => setError(e.message))
  }, [userId, page, pageSize, q, statusFilter])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <History size={22} /> Upload History
          </h1>
          <p className="page-sub">
            Pick a user to see every CSV file they&apos;ve uploaded and its outcome — the same
            history they see on their own Uploads page.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <UserPicker value={userId} onChange={(id) => setSearchParams(id ? { user: id } : {})} />
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
            <UploadCloud size={40} />
            <div className="title">No user selected</div>
            <div className="hint">Choose a user above to see their upload history.</div>
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
                  placeholder="Search by filename…"
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
                <option value="completed">Completed</option>
                <option value="completed_with_errors">Completed with errors</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {!uploads && !error && <TableLoader label="uploads" />}

          {uploads && uploads.length === 0 && (
            <div className="table-card">
              <div className="empty-state">
                <UploadCloud size={40} />
                <div className="title">
                  {q.trim() || statusFilter !== 'all' ? 'No matching uploads' : 'No uploads yet'}
                </div>
                <div className="hint">
                  {q.trim() || statusFilter !== 'all'
                    ? 'Try a different search term or status filter.'
                    : "This user hasn't uploaded a CSV."}
                </div>
              </div>
            </div>
          )}

          {uploads && uploads.length > 0 && (
            <>
              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>File</th>
                      <th>Date</th>
                      <th>Rows</th>
                      <th>Invoices</th>
                      <th>Submitted</th>
                      <th>Failed</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploads.map((u) => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>
                          <span className="strong">
                            <FileText size={14} /> {u.filename}
                          </span>
                        </td>
                        <td>{new Date(u.created_at).toLocaleString()}</td>
                        <td>{u.total_rows}</td>
                        <td>{u.invoices_created}</td>
                        <td>{u.invoices_submitted}</td>
                        <td>{u.invoices_failed}</td>
                        <td>
                          <span
                            className={`badge ${
                              u.status === 'completed'
                                ? 'submitted'
                                : u.status === 'completed_with_errors'
                                  ? 'warn'
                                  : u.status === 'failed'
                                    ? 'failed'
                                    : 'draft'
                            }`}
                          >
                            {u.status.replaceAll('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            {u.invoices_created > 0 && (
                              <Link
                                className="btn btn-ghost btn-sm"
                                to={`/admin/invoices?user=${userId}&upload=${u.id}`}
                              >
                                <ReceiptText size={14} /> invoices
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
                itemLabel="uploads"
              />
            </>
          )}
        </>
      )}
    </>
  )
}
