import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  ReceiptText,
  RotateCw,
  Square,
} from 'lucide-react'
import { api, ApiError } from '../api'
import Modal from './Modal'

// Pacing. Invoices go to FBR one at a time with a short pause between them —
// sending a whole file in a tight burst is what trips FBR's rate limiting.
// The pause is adaptive: it starts small, doubles (up to a cap) when FBR says
// it is busy, and eases back down once calls succeed again, so a healthy
// connection never waits longer than BASE_DELAY_MS per invoice.
const BASE_DELAY_MS = 350
const BACKOFF_MIN_MS = 800
const MAX_DELAY_MS = 3000
const MAX_TRIES = 3 // one invoice: the first attempt + up to 2 automatic retries

// Submits the invoices of one Submission History row, one by one, through the
// single-invoice endpoint — so each result is rolled up into the file's
// counters as it lands and the user sees real progress.
//   mode="submit": a file that was just uploaded (invoices are drafts) —
//                  starts straight away.
//   mode="retry":  failed / not-yet-submitted invoices of an existing file —
//                  asks for confirmation first.
//   mode="promote": the invoices of a test file that passed, sent on to FBR
//                  as real records ("Submit this batch to FBR") — asks first.
// `simulated` = the account runs in mock mode (no FBR connection), so there
// is nothing to protect and no pause is added.
export default function SubmitBatchModal({ upload, mode: initialMode, simulated = false, onClose }) {
  // State, because a finished promote can hand over to "retry" for its failures.
  const [mode, setMode] = useState(initialMode)
  const isSubmit = mode === 'submit'
  const isPromote = mode === 'promote'
  const [phase, setPhase] = useState(initialMode === 'submit' ? 'running' : 'confirm') // 'confirm' | 'running' | 'done'
  const [queue, setQueue] = useState(null) // invoices still to submit, null while loading
  const [runTotal, setRunTotal] = useState(0)
  const [stats, setStats] = useState({ processed: 0, passed: 0, failedAgain: 0, retried: 0 })
  const [final, setFinal] = useState(null) // the upload as the server now counts it
  const [stopped, setStopped] = useState(false)
  const [runLive, setRunLive] = useState(null) // were this run's invoices going to production?
  // After a promote, "retry" covers only that run's failed *live* invoices — not
  // an older failure in the same file that never left the test environment.
  const [liveOnly, setLiveOnly] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const stopRef = useRef(false)
  const startedRef = useRef(false)
  const changedRef = useRef(false)

  async function loadQueue(forMode = mode, only = liveOnly) {
    setQueue(null)
    setError('')
    try {
      // The lists come newest-first; submit in file order.
      if (forMode === 'promote') {
        // Only what passed its test — a failed test invoice never goes live.
        const passed = await api.get(
          `/api/invoices?upload_id=${upload.id}&status=submitted&fbr_env=test`
        )
        setQueue([...passed].reverse())
      } else {
        // Not-yet-submitted first, then the ones that failed.
        const [drafts, failed] = await Promise.all([
          api.get(`/api/invoices?upload_id=${upload.id}&status=draft`),
          api.get(`/api/invoices?upload_id=${upload.id}&status=failed`),
        ])
        const scoped = only ? failed.filter((inv) => inv.fbr_env === 'production') : failed
        setQueue([...[...drafts].reverse(), ...[...scoped].reverse()])
      }
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

  // A fresh upload starts on its own once its invoices are loaded. The ref
  // guards against React StrictMode's double-mount (and the queue reloads
  // that happen during/after a run) starting it twice.
  useEffect(() => {
    if (!isSubmit || startedRef.current || queue === null) return
    startedRef.current = true
    if (queue.length === 0) setPhase('confirm')
    else run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue])

  // Stop-aware pause: wakes early when the user hits Stop.
  function pause(ms) {
    return new Promise((resolve) => {
      const end = Date.now() + ms
      const tick = () => (stopRef.current || Date.now() >= end ? resolve() : setTimeout(tick, 100))
      tick()
    })
  }

  async function submitOne(id, attempt) {
    // A promote that FBR rejects leaves the invoice failed on production, so
    // any retry of it goes through /submit (which targets the invoice's own env).
    const firstPromote = isPromote && attempt === 1
    try {
      return await api.post(`/api/invoices/${id}/${firstPromote ? 'promote' : 'submit'}`)
    } catch (e) {
      // No answer from our own API. Anything but a definite 4xx is worth a
      // retry — except a promote whose outcome is unknown: sending it again
      // blind could double-submit. The final counts come from the server.
      const definite = e instanceof ApiError && e.status < 500
      return { status: 'failed', transient: !definite && !firstPromote }
    }
  }

  async function run() {
    const todo = queue
    stopRef.current = false
    setStopped(false)
    setNote('')
    setError('')
    setFinal(null)
    setRunLive(isPromote || todo.some((inv) => inv.fbr_env === 'production'))
    setRunTotal(todo.length)
    setStats({ processed: 0, passed: 0, failedAgain: 0, retried: 0 })
    setPhase('running')

    let delay = simulated ? 0 : BASE_DELAY_MS
    const tally = { processed: 0, passed: 0, failedAgain: 0, retried: 0 }
    for (let i = 0; i < todo.length; i++) {
      if (stopRef.current) break
      let result
      let backedOff = false
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        result = await submitOne(todo[i].id, attempt)
        if (result.status === 'submitted' || !result.transient) break
        if (attempt === MAX_TRIES || stopRef.current) break
        // FBR was busy / unreachable — that says nothing about this invoice.
        // Slow down, wait, and send the same one again.
        backedOff = true
        tally.retried += 1
        delay = simulated ? 0 : Math.min(Math.max(delay * 2, BACKOFF_MIN_MS), MAX_DELAY_MS)
        const wait = result.retry_after
          ? Math.min(result.retry_after * 1000, MAX_DELAY_MS)
          : delay
        setNote('FBR is busy — pausing briefly, then trying again…')
        await pause(wait)
        setNote('')
        setStats({ ...tally })
      }

      if (result.status === 'submitted') tally.passed += 1
      else tally.failedAgain += 1
      tally.processed += 1
      changedRef.current = true
      setStats({ ...tally })

      // Ease back toward the base pace after a clean call.
      if (!backedOff && delay > BASE_DELAY_MS) delay = Math.max(BASE_DELAY_MS, Math.round(delay * 0.7))
      if (i < todo.length - 1 && delay > 0) await pause(delay)
    }

    setStopped(stopRef.current && tally.processed < todo.length)
    try {
      setFinal(await api.get(`/api/uploads/${upload.id}`))
    } catch (e) {
      setError(e.message)
    }
    // What's still failing/pending now, for the "retry" button.
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
  const preparing = phase === 'running' && runTotal === 0
  const pendingCount = queue?.filter((inv) => inv.status === 'draft').length ?? 0
  const failedCount = queue?.filter((inv) => inv.status === 'failed').length ?? 0
  const stillOpen = queue?.length ?? 0
  // Going to FBR production? Judged from the invoices themselves (a "Test" batch
  // can hold failed live invoices), and held steady for the length of a run.
  const isLive =
    isPromote ||
    (runLive ??
      (queue?.length
        ? queue.some((inv) => inv.fbr_env === 'production')
        : upload.fbr_env === 'production'))
  const passLabel = isLive ? 'Submitted' : 'Passed'
  const failLabel = isSubmit || isPromote ? 'Failed' : 'Failed again'

  // Until the invoice list loads, fall back on what the history row says.
  const resumeOnly = queue
    ? failedCount === 0 && pendingCount > 0
    : upload.status === 'processing' && !upload.invoices_failed
  const title = isPromote
    ? 'Submit this batch to FBR'
    : isSubmit
      ? isLive
        ? 'Submitting to FBR'
        : 'Running your test'
      : resumeOnly
        ? 'Resume submission'
        : 'Retry failed invoices'

  // A promote leaves its failures as failed live invoices — retry them as such.
  async function retryFailedInstead() {
    setMode('retry')
    setLiveOnly(true)
    setRunLive(true) // these are the failed live invoices — say so before the list loads
    setPhase('confirm')
    await loadQueue('retry', true)
  }

  return (
    <Modal title={title} onClose={requestClose} width={560}>
      <p className="muted" style={{ marginTop: 0 }}>
        <strong>{upload.filename}</strong>{' '}
        <span className={`badge ${isLive ? 'submitted' : 'draft'}`}>
          {isPromote ? 'Test → Live' : isLive ? 'Live' : 'Test'}
        </span>
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
            {isPromote ? <Check size={17} /> : <RotateCw size={17} />}
            <span>
              {queue === null ? (
                error ? (
                  'Could not load the invoices.'
                ) : (
                  'Checking which invoices are left…'
                )
              ) : queue.length === 0 ? (
                isPromote ? (
                  'There are no test-passed invoices left to submit to FBR.'
                ) : (
                  'There are no failed or unsubmitted invoices left in this file.'
                )
              ) : isPromote ? (
                <>
                  <strong>{queue.length}</strong> test-passed invoice{queue.length === 1 ? '' : 's'}{' '}
                  will be submitted to <strong>FBR</strong> as real, permanent tax records. This
                  replaces their test results.
                </>
              ) : (
                <>
                  <strong>{queue.length}</strong> invoice{queue.length === 1 ? '' : 's'}
                  {failedCount > 0 && pendingCount > 0 && (
                    <>
                      {' '}
                      ({failedCount} failed, {pendingCount} not submitted yet)
                    </>
                  )}{' '}
                  {isLive ? (
                    <>
                      will be sent to <strong>FBR</strong> as real, permanent tax records.
                    </>
                  ) : (
                    'will be run through the test.'
                  )}{' '}
                  Invoices that already went through are not touched.
                </>
              )}
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={requestClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={run} disabled={!queue || queue.length === 0}>
              {isPromote ? <Check size={16} /> : <RotateCw size={16} />}{' '}
              {isPromote
                ? `Confirm, submit ${queue?.length || ''} to FBR`
                : failedCount === 0 && pendingCount > 0
                  ? `Resume ${pendingCount}`
                  : `Retry ${queue?.length || ''} failed`}
            </button>
          </div>
        </>
      )}

      {preparing && (
        <p className="muted">
          <Loader2 size={15} className="spin" style={{ verticalAlign: '-3px' }} /> Preparing your
          invoices…
        </p>
      )}

      {phase !== 'confirm' && !preparing && (
        <>
          <div
            className="retry-progress"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
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
              <div className="retry-stat-label">{passLabel}</div>
            </div>
            <div className="retry-stat bad">
              <div className="retry-stat-value">{stats.failedAgain}</div>
              <div className="retry-stat-label">{failLabel}</div>
            </div>
            <div className="retry-stat warn">
              <div className="retry-stat-value">{remaining}</div>
              <div className="retry-stat-label">Remaining</div>
            </div>
          </div>
        </>
      )}

      {phase === 'running' && !preparing && (
        <div className="row-actions" style={{ justifyContent: 'space-between', marginTop: 18 }}>
          <span className="muted">
            <Loader2 size={15} className="spin" style={{ verticalAlign: '-3px' }} />{' '}
            {note || (isSubmit || isPromote ? 'Submitting' : 'Retrying') + ' — keep this window open…'}
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
                ? `Stopped — ${remaining} invoice${remaining === 1 ? ' was' : 's were'} not submitted. You can resume them any time from Submission History.`
                : stats.failedAgain === 0
                  ? `All ${stats.passed} invoice${stats.passed === 1 ? '' : 's'} ${isLive ? 'were submitted to FBR' : 'passed the test'}.`
                  : `${stats.passed} ${isLive ? 'submitted' : 'passed'}, ${stats.failedAgain} failed. Connection and rate-limit errors usually clear up — you can retry the rest.`}
              {stats.retried > 0 && (
                <>
                  {' '}
                  FBR was busy {stats.retried} time{stats.retried === 1 ? '' : 's'}; those calls
                  were paused and retried automatically.
                </>
              )}
            </span>
          </div>

          {final && (
            <>
              <div className="retry-final-title">
                Final result for this file
                <span
                  className={`badge ${
                    final.status === 'completed'
                      ? 'submitted'
                      : final.status === 'processing'
                        ? 'info'
                        : 'warn'
                  }`}
                  style={{ marginLeft: 8 }}
                >
                  {final.status === 'processing' ? 'in progress' : final.status.replaceAll('_', ' ')}
                </span>
              </div>
              <div className="retry-stats three">
                <div className="retry-stat">
                  <div className="retry-stat-value">{final.invoices_created}</div>
                  <div className="retry-stat-label">Invoices</div>
                </div>
                <div className="retry-stat ok">
                  <div className="retry-stat-value">{final.invoices_submitted}</div>
                  <div className="retry-stat-label">{passLabel}</div>
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
            {isPromote && stats.failedAgain > 0 && (
              <button className="btn btn-secondary" onClick={retryFailedInstead}>
                <RotateCw size={16} /> Retry {stats.failedAgain} failed
              </button>
            )}
            {stillOpen > 0 && (
              <button className="btn btn-secondary" onClick={() => setPhase('confirm')}>
                <RotateCw size={16} />{' '}
                {isPromote
                  ? `Submit the remaining ${stillOpen}`
                  : failedCount === 0
                    ? `Resume ${stillOpen}`
                    : `Retry ${stillOpen} still failed`}
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
