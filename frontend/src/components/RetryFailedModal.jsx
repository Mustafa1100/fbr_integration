import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  ReceiptText,
  RotateCw,
  Square,
} from 'lucide-react'
import { api } from '../api'
import Modal from './Modal'

// Retries every failed invoice of one Submission History row, one at a time,
// through the same single-invoice endpoint the Invoices page uses — so each
// result is rolled up into the upload's counters as it lands, and the user
// sees real progress instead of a spinner. Failures here are usually a
// dropped connection or FBR rate-limiting, hence "again", not "fix".
export default function RetryFailedModal({ upload, onClose }) {
  const isLive = upload.fbr_env === 'production'
  const [phase, setPhase] = useState('confirm') // 'confirm' | 'running' | 'done'
  const [queue, setQueue] = useState(null) // failed invoices to retry, null while loading
  const [stats, setStats] = useState({ processed: 0, passed: 0, failedAgain: 0 })
  const [final, setFinal] = useState(null) // the upload as the server now counts it
  const [runTotal, setRunTotal] = useState(0)
  const [stopped, setStopped] = useState(false)
  const [error, setError] = useState('')
  const stopRef = useRef(false)
  const changedRef = useRef(false)

  async function loadQueue() {
    setQueue(null)
    setError('')
    try {
      const failed = await api.get(`/api/invoices?upload_id=${upload.id}&status=failed`)
      setQueue([...failed].reverse()) // list is newest-first; retry in file order
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    loadQueue()
    // Leaving the page mid-run stops the loop instead of letting it run on.
    return () => {
      stopRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run() {
    const todo = queue
    stopRef.current = false
    setStopped(false)
    setError('')
    setFinal(null)
    setRunTotal(todo.length)
    setStats({ processed: 0, passed: 0, failedAgain: 0 })
    setPhase('running')

    const tally = { processed: 0, passed: 0, failedAgain: 0 }
    for (const inv of todo) {
      if (stopRef.current) break
      try {
        const result = await api.post(`/api/invoices/${inv.id}/submit`)
        if (result.status === 'submitted') tally.passed += 1
        else tally.failedAgain += 1
      } catch {
        // A request that never reached FBR counts as failed again — it stays
        // retryable, and one bad call must not abandon the rest of the batch.
        tally.failedAgain += 1
      }
      tally.processed += 1
      changedRef.current = true
      setStats({ ...tally })
    }

    setStopped(stopRef.current && tally.processed < todo.length)
    try {
      setFinal(await api.get(`/api/uploads/${upload.id}`))
    } catch (e) {
      setError(e.message)
    }
    // What's still failing now, for the "retry again" button.
    await loadQueue()
    setPhase('done')
  }

  function requestClose() {
    if (phase === 'running') return // stop first — closing mid-call would hide the result
    onClose(changedRef.current)
  }

  // runTotal is this run's snapshot — `queue` is reloaded when a run ends.
  const remaining = Math.max(runTotal - stats.processed, 0)
  const pct = runTotal ? Math.round((stats.processed / runTotal) * 100) : 0
  const stillFailed = queue?.length ?? 0

  return (
    <Modal title="Retry failed invoices" onClose={requestClose} width={560}>
      <p className="muted" style={{ marginTop: 0 }}>
        <strong>{upload.filename}</strong>{' '}
        <span className={`badge ${isLive ? 'submitted' : 'draft'}`}>{isLive ? 'Live' : 'Test'}</span>
      </p>

      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      {phase === 'confirm' && (
        <>
          <div className="alert info" style={{ marginTop: 0 }}>
            <RotateCw size={17} />
            <span>
              {queue === null ? (
                error ? 'Could not load the failed invoices.' : 'Checking which invoices failed…'
              ) : queue.length === 0 ? (
                'There are no failed invoices left in this file.'
              ) : isLive ? (
                <>
                  <strong>{queue.length}</strong> failed invoice{queue.length === 1 ? '' : 's'} will
                  be sent to <strong>FBR</strong> again as real, permanent tax records. Invoices that
                  already went through are not touched.
                </>
              ) : (
                <>
                  <strong>{queue.length}</strong> failed invoice{queue.length === 1 ? '' : 's'} will
                  be run through the test again. Invoices that already passed are not touched.
                </>
              )}
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={requestClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={run} disabled={!queue || queue.length === 0}>
              <RotateCw size={16} /> Retry {queue?.length || ''} failed
            </button>
          </div>
        </>
      )}

      {phase !== 'confirm' && (
        <>
          <div className="retry-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="retry-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <div className="retry-progress-label">
            {stats.processed} of {runTotal} processed · {pct}%
          </div>

          <div className="retry-stats">
            <div className="retry-stat">
              <div className="retry-stat-value">{stats.processed}</div>
              <div className="retry-stat-label">Processed</div>
            </div>
            <div className="retry-stat ok">
              <div className="retry-stat-value">{stats.passed}</div>
              <div className="retry-stat-label">{isLive ? 'Submitted' : 'Passed'}</div>
            </div>
            <div className="retry-stat bad">
              <div className="retry-stat-value">{stats.failedAgain}</div>
              <div className="retry-stat-label">Failed again</div>
            </div>
            <div className="retry-stat warn">
              <div className="retry-stat-value">{remaining}</div>
              <div className="retry-stat-label">Remaining</div>
            </div>
          </div>
        </>
      )}

      {phase === 'running' && (
        <div className="row-actions" style={{ justifyContent: 'space-between', marginTop: 18 }}>
          <span className="muted">
            <Loader2 size={15} className="spin" style={{ verticalAlign: '-3px' }} /> Retrying —
            keep this window open…
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              stopRef.current = true
            }}
          >
            <Square size={13} /> Stop
          </button>
        </div>
      )}

      {phase === 'done' && (
        <>
          <div
            className={`alert ${stats.failedAgain === 0 && !stopped ? 'ok' : 'info'}`}
            style={{ marginTop: 18 }}
          >
            {stats.failedAgain === 0 && !stopped ? (
              <CheckCircle2 size={17} />
            ) : (
              <AlertCircle size={17} />
            )}
            <span>
              {stopped
                ? `Stopped — ${remaining} invoice${remaining === 1 ? ' was' : 's were'} not retried.`
                : stats.failedAgain === 0
                  ? `All ${stats.passed} invoice${stats.passed === 1 ? '' : 's'} went through.`
                  : `${stats.passed} went through, ${stats.failedAgain} failed again. Connection and rate-limit errors usually clear up — you can retry the rest.`}
            </span>
          </div>

          {final && (
            <>
              <div className="retry-final-title">
                Final result for this file
                <span
                  className={`badge ${final.status === 'completed' ? 'submitted' : 'warn'}`}
                  style={{ marginLeft: 8 }}
                >
                  {final.status.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="retry-stats three">
                <div className="retry-stat">
                  <div className="retry-stat-value">{final.invoices_created}</div>
                  <div className="retry-stat-label">Invoices</div>
                </div>
                <div className="retry-stat ok">
                  <div className="retry-stat-value">{final.invoices_submitted}</div>
                  <div className="retry-stat-label">{isLive ? 'Submitted' : 'Passed'}</div>
                </div>
                <div className="retry-stat bad">
                  <div className="retry-stat-value">{final.invoices_failed}</div>
                  <div className="retry-stat-label">Failed</div>
                </div>
              </div>
            </>
          )}

          <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
            <Link className="btn btn-secondary" to={`/invoices?upload=${upload.id}`}>
              <ReceiptText size={16} /> View invoices
            </Link>
            {stillFailed > 0 && (
              <button className="btn btn-secondary" onClick={() => setPhase('confirm')}>
                <RotateCw size={16} /> Retry {stillFailed} still failed
              </button>
            )}
            <button className="btn btn-primary" onClick={requestClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
