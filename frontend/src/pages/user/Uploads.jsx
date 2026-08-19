import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  UploadCloud,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  History,
  FileText,
  ReceiptText,
  FlaskConical,
  Search,
  X,
} from 'lucide-react'
import { api } from '../../api'
import PaginationBar from '../../components/PaginationBar'
import TableLoader from '../../components/TableLoader'

export default function Uploads() {
  const [uploads, setUploads] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [listLoading, setListLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [scenarioPick, setScenarioPick] = useState('')
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  async function refresh() {
    setListLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (q.trim()) params.set('q', q.trim())
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const resp = await api.getRaw(`/api/uploads?${params}`)
    setUploads(await resp.json())
    setTotal(Number(resp.headers.get('x-total-count') || 0))
    setListLoading(false)
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, q, statusFilter])

  useEffect(() => {
    api.get('/api/uploads/scenario-catalog').then(setScenarios).catch(() => {})
  }, [])

  async function submit(e) {
    e.preventDefault()
    const file = fileRef.current.files[0]
    if (!file) return
    setBusy(true)
    setError('')
    setLastResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await api.upload('/api/uploads', formData)
      setLastResult(result)
      fileRef.current.value = ''
      setFileName('')
      if (page === 1) await refresh()
      else setPage(1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function clearFile(e) {
    e.stopPropagation()
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file || !fileRef.current) return
    const dt = new DataTransfer()
    dt.items.add(file)
    fileRef.current.files = dt.files
    setFileName(file.name)
  }

  async function downloadTemplate(scenario) {
    const path = scenario ? `/api/uploads/template?scenario=${scenario}` : '/api/uploads/template'
    const resp = await api.getRaw(path)
    const blob = await resp.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = scenario ? `fbr_template_${scenario}.csv` : 'fbr_invoice_template.csv'
    a.click()
    URL.revokeObjectURL(objectUrl)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <UploadCloud size={22} /> CSV Uploads
          </h1>
          <p className="page-sub">
            Upload your POS product sales as CSV — rows with the same <code>pos_invoice_no</code>{' '}
            become one invoice, each invoice is submitted to FBR, and you get a tax receipt with
            the FBR invoice number and QR code.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={() => downloadTemplate()}>
            <Download size={16} /> Download CSV template
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {scenarios.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="row-actions" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <FlaskConical size={17} style={{ flexShrink: 0, color: 'var(--muted)' }} />
            <span className="muted" style={{ marginRight: '0.25rem' }}>
              Sandbox scenario testing: download a template pre-filled with FBR&apos;s own
              official example for one scenario —
            </span>
            <select
              value={scenarioPick}
              onChange={(e) => setScenarioPick(e.target.value)}
              style={{ maxWidth: 340 }}
            >
              <option value="">Choose a scenario…</option>
              {scenarios.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!scenarioPick}
              onClick={() => downloadTemplate(scenarioPick)}
            >
              <Download size={14} /> Download
            </button>
          </div>
        </div>
      )}

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label>
            CSV file <span className="hint">(.csv)</span>
          </label>
          <div
            className={`dropzone${fileName ? ' has-file' : ''}${dragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".csv"
              ref={fileRef}
              required
              className="dropzone-input"
              onChange={(e) => setFileName(e.target.files[0]?.name || '')}
            />
            {fileName ? (
              <>
                <FileText size={20} />
                <span className="dropzone-text">
                  <strong>{fileName}</strong>
                </span>
                <button type="button" className="btn btn-ghost btn-sm dropzone-remove" onClick={clearFile}>
                  <X size={14} /> Remove
                </button>
              </>
            ) : (
              <>
                <UploadCloud size={22} />
                <span className="dropzone-text">
                  <strong>Click to choose a file</strong> or drag and drop your CSV here
                </span>
              </>
            )}
          </div>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={16} className="spin" /> Processing…
            </>
          ) : (
            <>
              <UploadCloud size={16} /> Upload &amp; submit to FBR
            </>
          )}
        </button>
      </form>

      {lastResult && (
        <div className={`alert ${lastResult.status === 'failed' ? 'error' : 'ok'}`}>
          {lastResult.status === 'failed' ? (
            <>
              <AlertCircle size={17} />
              <span>Upload failed: {lastResult.error}</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={17} />
              <span>
                Processed {lastResult.total_rows} rows → {lastResult.invoices_created} invoices,{' '}
                {lastResult.invoices_submitted} submitted to FBR
                {lastResult.invoices_failed > 0 && <>, {lastResult.invoices_failed} failed</>}.{' '}
                <Link to="/invoices">View receipts</Link>
              </span>
            </>
          )}
        </div>
      )}

      <h2 className="section-title">
        <History size={17} /> History <span className="muted">({total})</span>
      </h2>

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

      {listLoading && <TableLoader label="uploads" />}

      {!listLoading && uploads.length === 0 && (
        <div className="table-card">
          <div className="empty-state">
            <UploadCloud size={40} />
            <div className="title">
              {q.trim() || statusFilter !== 'all' ? 'No matching uploads' : 'No uploads yet'}
            </div>
            <div className="hint">
              {q.trim() || statusFilter !== 'all'
                ? 'Try a different search term or status filter.'
                : 'Upload a CSV above to submit invoices to FBR.'}
            </div>
          </div>
        </div>
      )}

      {!listLoading && uploads.length > 0 && (
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
                          <Link className="btn btn-ghost btn-sm" to={`/invoices?upload=${u.id}`}>
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
  )
}
