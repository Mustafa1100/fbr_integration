import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  UploadCloud,
  CopyCheck,
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
  BookOpenText,
  PencilLine,
} from 'lucide-react'
import { api } from '../../api'
import ManualInvoiceModal from '../../components/ManualInvoiceModal'
import PaginationBar from '../../components/PaginationBar'
import TableLoader from '../../components/TableLoader'
import usePageTitle from '../../hooks/usePageTitle'

const ENV_LABELS = { mock: 'Mock', sandbox: 'Sandbox', production: 'Production' }

export default function Uploads() {
  usePageTitle('Generate Invoices')
  const [tab, setTab] = useState('submit') // 'submit' | 'history'
  const [uploads, setUploads] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [histEnv, setHistEnv] = useState('all') // 'all' | 'sandbox' | 'production'
  const [listLoading, setListLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [scenarioPick, setScenarioPick] = useState('')
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [fbrEnv, setFbrEnv] = useState(null)
  const [canProd, setCanProd] = useState(false)
  const [submitTarget, setSubmitTarget] = useState('sandbox') // 'sandbox' | 'production'
  const [showManualModal, setShowManualModal] = useState(false)
  const fileRef = useRef()
  const isProdTarget = submitTarget === 'production'

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
    if (histEnv !== 'all') params.set('fbr_env', histEnv)
    const resp = await api.getRaw(`/api/uploads?${params}`)
    setUploads(await resp.json())
    setTotal(Number(resp.headers.get('x-total-count') || 0))
    setListLoading(false)
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, q, statusFilter, histEnv])

  useEffect(() => {
    api.get('/api/uploads/scenario-catalog').then(setScenarios).catch(() => {})
    api
      .get('/api/settings/fbr')
      .then((s) => {
        setFbrEnv(s.fbr_env)
        setCanProd(!!s.can_submit_production)
        if (s.fbr_env === 'production' && s.can_submit_production) setSubmitTarget('production')
      })
      .catch(() => {})
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
      formData.append('target', submitTarget)
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
    const path = scenario
      ? `/api/uploads/template?scenario=${scenario}`
      : `/api/uploads/template?target=${submitTarget}`
    const resp = await api.getRaw(path)
    const blob = await resp.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = scenario ? `fbr_template_${scenario}.csv` : 'fbr_invoice_template.csv'
    a.click()
    URL.revokeObjectURL(objectUrl)
  }

  function handleManualSubmitted(result) {
    setShowManualModal(false)
    setLastResult(result)
    if (page === 1) refresh()
    else setPage(1)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CopyCheck size={22} /> Generate Invoices
          </h1>
          <p className="page-sub">
            Upload your POS product sales as a CSV or Excel file — rows with the same{' '}
            <code>pos_invoice_no</code> become one invoice, each invoice is submitted to FBR, and
            you get a tax receipt with the FBR invoice number and QR code.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={() => downloadTemplate()}>
            <Download size={16} /> Download template
          </button>
          <Link to="/columns" className="btn btn-secondary">
            <BookOpenText size={16} /> Column guide
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="row-actions" style={{ gap: 8, marginBottom: '1.5rem' }}>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'submit' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('submit')}
        >
          <UploadCloud size={14} /> Submit Invoices
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('history')}
        >
          <History size={14} /> Submission History ({total})
        </button>
      </div>

      {tab === 'submit' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Submit to</label>
              <div className="row-actions" style={{ gap: 8 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${!isProdTarget ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSubmitTarget('sandbox')}
                >
                  <FlaskConical size={14} /> Sandbox test
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${isProdTarget ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => canProd && setSubmitTarget('production')}
                  disabled={!canProd}
                  title={canProd ? undefined : 'Your account is not enabled for production submission'}
                >
                  <ReceiptText size={14} /> Production
                </button>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                {isProdTarget
                  ? 'These invoices are submitted straight to FBR production — real, permanent tax records.'
                  : `Test submission${fbrEnv === 'mock' ? ' (simulated — no FBR credentials configured)' : ' against the FBR sandbox'}. Nothing here is a live tax record; promote an invoice from Invoices History once it looks right.`}
              </p>
            </div>
          </div>

          {!isProdTarget && scenarios.length > 0 && (
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
                CSV or Excel file <span className="hint">(.csv or .xlsx)</span>
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
                  accept=".csv,.xlsx"
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
                      <strong>Click to choose a file</strong> or drag and drop your CSV/Excel file here
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="row-actions" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 size={16} className="spin" /> Processing…
                  </>
                ) : (
                  <>
                    <UploadCloud size={16} /> Upload &amp; submit to{' '}
                    {isProdTarget ? 'production' : 'sandbox'}
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowManualModal(true)}
              >
                <PencilLine size={16} /> Enter a single invoice
              </button>
            </div>
          </form>

          {lastResult && (
            <div className={`alert ${lastResult.status === 'failed' ? 'error' : 'ok'}`}>
              {lastResult.status === 'failed' ? (
                <>
                  <AlertCircle size={17} />
                  <span>Submission failed: {lastResult.error}</span>
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
        </>
      )}

      {tab === 'history' && (
        <>
          <div className="row-actions" style={{ gap: 8, marginBottom: '1rem' }}>
            {['all', 'sandbox', 'production'].map((e) => (
              <button
                key={e}
                type="button"
                className={`btn btn-sm ${histEnv === e ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setHistEnv(e)
                  setPage(1)
                }}
              >
                {e === 'all' ? 'All' : ENV_LABELS[e]}
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
                  {q.trim() || statusFilter !== 'all' ? 'No matching submissions' : 'No submissions yet'}
                </div>
                <div className="hint">
                  {q.trim() || statusFilter !== 'all'
                    ? 'Try a different search term or status filter.'
                    : 'Submit a file or a single invoice to see its history here.'}
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
                      <th>Env</th>
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
                        <td>
                          <span
                            className={`badge ${u.fbr_env === 'production' ? 'submitted' : 'draft'}`}
                          >
                            {ENV_LABELS[u.fbr_env] || u.fbr_env}
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
                itemLabel="submissions"
              />
            </>
          )}
        </>
      )}

      {showManualModal && (
        <ManualInvoiceModal
          onClose={() => setShowManualModal(false)}
          onSubmitted={handleManualSubmitted}
          target={submitTarget}
          scenarios={scenarios}
        />
      )}
    </>
  )
}
