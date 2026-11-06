import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CalendarClock,
  CalendarPlus,
  History,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { api } from '../api'
import Modal from './Modal'
import {
  chainEnd,
  daysBetween,
  fmtDate,
  fmtMoney,
  planText,
  plural,
  todayPk,
} from '../planDates'

const KIND_LABEL = { initial: 'Initial plan', renewal: 'Renewal', extension: 'Extension' }
const STATUS_BADGE = { active: 'submitted', expiring: 'warn', expired: 'failed', none: 'draft' }

export function PlanBadge({ plan }) {
  const status = plan?.status || 'none'
  const label = { active: 'active', expiring: 'ends soon', expired: 'expired', none: 'no plan' }[status]
  return <span className={`badge ${STATUS_BADGE[status]}`}>{label}</span>
}

// What the plan will look like after a change, for the preview line.
function Preview({ start, entries, previousEnd }) {
  if (!start || entries.length === 0) {
    return <div className="plan-preview muted">No entries left — the account goes back to “no plan set”.</div>
  }
  const end = chainEnd(start, entries)
  const today = todayPk()
  const left = daysBetween(today, end)
  return (
    <div className={`plan-preview ${left <= 0 ? 'bad' : 'good'}`}>
      {previousEnd && previousEnd !== end && (
        <>
          Covers {fmtDate(previousEnd)} – {fmtDate(end)}.{' '}
        </>
      )}
      New end date: <strong>{fmtDate(end)}</strong>
      {left <= 0 ? (
        <> — still expired after this (blocked since {fmtDate(end)}).</>
      ) : (
        <> — {plural(left, 'day')} left.</>
      )}
    </div>
  )
}

function EntryForm({ mode, data, entry, onCancel, onSaved }) {
  // mode: set | renew | extend | edit
  const kind = mode === 'set' ? 'initial' : mode === 'renew' ? 'renewal' : mode === 'extend' ? 'extension' : entry.kind
  const isExt = kind === 'extension'
  const defaultStart = (data.created_at || todayPk()).slice(0, 10)
  const [startDate, setStartDate] = useState(defaultStart)
  const [months, setMonths] = useState(entry ? String(entry.months) : '1')
  const [days, setDays] = useState(entry ? String(entry.days) : '15')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [receivedOn, setReceivedOn] = useState(
    entry ? entry.received_on || '' : mode === 'set' ? defaultStart : isExt ? '' : todayPk()
  )
  const [note, setNote] = useState(entry ? entry.note : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const nMonths = Math.max(0, Math.floor(Number(months) || 0))
  const nDays = Math.max(0, Math.floor(Number(days) || 0))
  const mine = isExt ? { months: 0, days: nDays } : { months: nMonths, days: 0 }

  let start = data.plan_start
  let previewEntries = data.entries
  let previousEnd = data.ends_on
  if (mode === 'set') {
    start = startDate
    previewEntries = [mine]
    previousEnd = startDate
  } else if (mode === 'edit') {
    previewEntries = data.entries.map((e) => (e.id === entry.id ? { ...e, ...mine } : e))
    previousEnd = null
  } else {
    previewEntries = [...data.entries, mine]
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const money = isExt ? 0 : Number(amount) || 0
    try {
      let result
      if (mode === 'set') {
        result = await api.post(`/api/admin/users/${data.user_id}/plan`, {
          start_date: startDate,
          months: nMonths,
          amount: money,
          received_on: receivedOn || null,
          note,
        })
      } else if (mode === 'edit') {
        result = await api.patch(`/api/admin/users/${data.user_id}/plan/entries/${entry.id}`, {
          ...mine,
          amount: money,
          received_on: receivedOn || null,
          note,
        })
      } else {
        result = await api.post(`/api/admin/users/${data.user_id}/plan/entries`, {
          kind,
          ...mine,
          amount: money,
          received_on: receivedOn || null,
          note,
        })
      }
      onSaved(result)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const title = {
    set: 'Set plan',
    renew: 'Renew plan',
    extend: 'Give an extension',
    edit: `Edit ${KIND_LABEL[kind].toLowerCase()}`,
  }[mode]

  return (
    <Modal title={title} onClose={() => !saving && onCancel()} width={520}>
    <form onSubmit={save} className="plan-form">
      {mode === 'renew' && (
        <p className="muted small">
          A renewal always continues from the current end date ({fmtDate(data.ends_on)}), even if it
          is paid late.
        </p>
      )}
      {mode === 'extend' && (
        <p className="muted small">
          Free extra days, added after the current end date ({fmtDate(data.ends_on)}). The next
          renewal carries on from the end of the extension.
        </p>
      )}
      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}
      <div className="plan-form-grid">
        {mode === 'set' && (
          <div className="field">
            <label>Plan start date</label>
            <input type="date" value={startDate} max={todayPk()} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
        )}
        {isExt ? (
          <div className="field">
            <label>Extra days</label>
            <input type="number" min="1" max="366" value={days} onChange={(e) => setDays(e.target.value)} required />
          </div>
        ) : (
          <div className="field">
            <label>Months</label>
            <input type="number" min="1" max="120" value={months} onChange={(e) => setMonths(e.target.value)} required />
          </div>
        )}
        {!isExt && (
          <div className="field">
            <label>{kind === 'initial' ? 'Initial fee (PKR)' : 'Amount received (PKR)'}</label>
            <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
        )}
        {!isExt && (
          <div className="field">
            <label>Date received</label>
            <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </div>
        )}
      </div>
      <div className="field">
        <label>{isExt ? 'Reason / note' : 'Note'} <span className="muted">(optional)</span></label>
        <textarea className="create-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </div>
      <Preview start={start} entries={previewEntries} previousEnd={previousEnd} />
      <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={saving}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
    </Modal>
  )
}

function StartDateForm({ data, onCancel, onSaved }) {
  const [start, setStart] = useState(data.plan_start)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      onSaved(await api.patch(`/api/admin/users/${data.user_id}/plan`, { start_date: start }))
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="Change plan start date" onClose={() => !saving && onCancel()} width={460}>
    <form onSubmit={save} className="plan-form">
      <p className="muted small">Moving the start date moves every period after it by the same amount.</p>
      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}
      <div className="field" style={{ maxWidth: 220 }}>
        <label>Start date</label>
        <input type="date" value={start} max={todayPk()} onChange={(e) => setStart(e.target.value)} required />
      </div>
      <Preview start={start} entries={data.entries} previousEnd={null} />
      <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={saving}>
          <Save size={16} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
    </Modal>
  )
}

function DeleteConfirm({ data, entry, onCancel, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const rest = data.entries.filter((e) => e.id !== entry.id)

  async function remove() {
    setSaving(true)
    setError('')
    try {
      onSaved(await api.delete(`/api/admin/users/${data.user_id}/plan/entries/${entry.id}`))
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={`Delete this ${KIND_LABEL[entry.kind].toLowerCase()}?`} onClose={() => !saving && onCancel()} width={440}>
      <p className="muted" style={{ marginTop: 0 }}>
        {KIND_LABEL[entry.kind]} of{' '}
        {entry.kind === 'extension' ? plural(entry.days, 'day') : `${plural(entry.months, 'month')}, ${fmtMoney(entry.amount)}`}{' '}
        ({fmtDate(entry.from)} – {fmtDate(entry.to)}). The deletion is kept in the history.
      </p>
      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}
      <Preview start={data.plan_start} entries={rest} previousEnd={null} />
      <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={remove} disabled={saving}>
          <Trash2 size={16} /> {saving ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  )
}

function AdminNote({ data, onSaved }) {
  const [note, setNote] = useState(data.admin_note)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const changed = note.trim() !== (data.admin_note || '')

  async function save() {
    setSaving(true)
    setError('')
    try {
      onSaved(await api.patch(`/api/admin/users/${data.user_id}/plan`, { admin_note: note }))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="plan-note">
      <label>
        <StickyNote size={14} /> Admin note <span className="muted">(only admins see this)</span>
      </label>
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        placeholder="Write a note…"
      />
      {error && <p className="field-error">{error}</p>}
      {changed && (
        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNote(data.admin_note || '')}>
            Undo
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      )}
    </div>
  )
}

// The whole plan section (summary, note, entries, history and the
// set / renew / extend / edit forms) for one business user.
export default function PlanPanel({ userId, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState({ mode: 'main' })

  useEffect(() => {
    api
      .get(`/api/admin/users/${userId}/plan`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [userId])

  function saved(result) {
    setData(result)
    setView({ mode: 'main' })
    onChanged?.()
  }

  const hasPlan = data && data.entries.length > 0
  const back = () => setView({ mode: 'main' })

  return (
    <div className="plan-panel">
      {error && (
        <div className="alert error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}
      {!data && !error && (
        <div className="loading">
          <Loader2 size={18} className="spin" /> Loading plan…
        </div>
      )}

      {data && ['set', 'renew', 'extend', 'edit'].includes(view.mode) && (
        <EntryForm mode={view.mode} entry={view.entry} data={data} onCancel={back} onSaved={saved} />
      )}
      {data && view.mode === 'start' && <StartDateForm data={data} onCancel={back} onSaved={saved} />}
      {data && view.mode === 'delete' && (
        <DeleteConfirm data={data} entry={view.entry} onCancel={back} onSaved={saved} />
      )}

      {data && (
        <>
          <div className={`plan-summary status-${data.status}`}>
            <div>
              <div className="plan-summary-line">
                <PlanBadge plan={data} /> <strong>{planText(data)}</strong>
              </div>
              <div className="muted small">
                {hasPlan ? (
                  <>
                    Started {fmtDate(data.plan_start)}{' '}
                    <button type="button" className="link-button" onClick={() => setView({ mode: 'start' })}>
                      change
                    </button>{' '}
                    · Total received <strong>{fmtMoney(data.total_received)}</strong>
                  </>
                ) : (
                  <>This account has no plan yet, so it is not restricted. Account created {fmtDate(data.created_at)}.</>
                )}
              </div>
            </div>
            <div className="row-actions">
              {hasPlan ? (
                <>
                  <button className="btn btn-secondary" onClick={() => setView({ mode: 'extend' })}>
                    <CalendarPlus size={16} /> Extend
                  </button>
                  <button className="btn btn-primary" onClick={() => setView({ mode: 'renew' })}>
                    <RefreshCw size={16} /> Renew
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => setView({ mode: 'set' })}>
                  <CalendarClock size={16} /> Set plan
                </button>
              )}
            </div>
          </div>

          <AdminNote key={data.admin_note} data={data} onSaved={saved} />

          {hasPlan && (
            <div className="table-card plan-table">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Period</th>
                    <th>Amount</th>
                    <th>Received</th>
                    <th>Note</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Newest first, initial plan at the bottom. */}
                  {[...data.entries].reverse().map((e) => (
                    <tr key={e.id}>
                      <td>
                        <span className={`badge ${e.kind === 'extension' ? 'info' : 'submitted'}`}>
                          {KIND_LABEL[e.kind]}
                        </span>
                        <div className="muted small">
                          {e.kind === 'extension' ? plural(e.days, 'day') : plural(e.months, 'month')}
                        </div>
                      </td>
                      <td className="nowrap">
                        {fmtDate(e.from)} – {fmtDate(e.to)}
                      </td>
                      <td className="nowrap">{e.kind === 'extension' ? <span className="muted">free</span> : fmtMoney(e.amount)}</td>
                      <td className="nowrap">{fmtDate(e.received_on)}</td>
                      <td className="plan-note-cell">
                        {e.note}
                        {e.created_by && <div className="muted small">by {e.created_by}</div>}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Edit"
                            onClick={() => setView({ mode: 'edit', entry: e })}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            title="Delete"
                            onClick={() => setView({ mode: 'delete', entry: e })}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.log.length > 0 && (
            <details className="plan-log">
              <summary>
                <History size={14} /> Change history ({data.log.length})
              </summary>
              <ul>
                {data.log.map((l, i) => (
                  <li key={i}>
                    <span className="muted small nowrap">
                      {new Date(l.created_at.endsWith('Z') || l.created_at.includes('+') ? l.created_at : `${l.created_at}Z`).toLocaleString()}
                      {l.admin && ` · ${l.admin}`}
                    </span>
                    <div>{l.detail}</div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

