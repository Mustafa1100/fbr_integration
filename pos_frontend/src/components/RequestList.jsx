import { useCallback, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, formatDateTime, money } from '../api.js'
import Modal from './Modal.jsx'

const STATUS_LABEL = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Replaced by a newer request',
}
const STATUS_TONE = { pending: 'expiring', approved: 'active', rejected: 'expired', withdrawn: '' }

// The client's suggested tax treatment, when they gave one.
const suggestion = (r) =>
  r.proposed_pct_code ? (
    <div className="muted small">
      Suggested: PCT {r.proposed_pct_code}, {r.proposed_tax_rate ?? 0}% tax
    </div>
  ) : null

function describe(r) {
  if (r.action === 'delete') return <>Delete <strong>{r.current_name || r.code}</strong></>
  if (r.action === 'add') {
    return (
      <>
        Add new item{' '}
        <strong>
          {r.name}, Rs {money(r.price)}
        </strong>
        {suggestion(r)}
      </>
    )
  }
  // Once decided, "current" is the item as it is now, so only the ask is shown.
  if (r.status !== 'pending' || r.current_price === null) {
    return (
      <>
        Change to{' '}
        <strong>
          {r.name}, Rs {money(r.price)}
        </strong>
        {suggestion(r)}
      </>
    )
  }
  const current = `${r.current_name}, Rs ${money(r.current_price)}`
  return (
    <>
      Change <span className="muted">{current}</span> to{' '}
      <strong>
        {r.name}, Rs {money(r.price)}
      </strong>
      {suggestion(r)}
    </>
  )
}

// Clients' requests to add, change or delete items. Pending ones can be approved
// or rejected here; the client's computer applies the decision at its next
// sync. `clientId` narrows it to one client.
export default function RequestList({ clientId, status = 'pending', showClient = false, onDecided, emptyText }) {
  const [requests, setRequests] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  // The request being rejected, while its reason is typed.
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  // The add/edit request being approved, with the tax fields being set.
  const [approving, setApproving] = useState(null)

  const load = useCallback(() => {
    const params = new URLSearchParams({ status })
    if (clientId) params.set('client_id', clientId)
    api
      .get(`/api/admin/item-requests?${params}`)
      .then(setRequests)
      .catch((err) => setError(err.message))
  }, [clientId, status])
  useEffect(load, [load])

  // Approving a new item or a change also sets its tax rate and PCT code, so
  // it opens a form; a deletion has nothing to set and is approved at once.
  function startApproval(request) {
    if (request.action === 'delete') {
      decide(request, 'approve')
      return
    }
    setApproving({
      request,
      tax_rate: request.suggested_tax_rate ?? 0,
      pct_code: request.suggested_pct_code ?? '',
      third_schedule: !!request.suggested_third_schedule,
    })
  }

  async function decide(request, action, fields = {}) {
    setRejecting(null)
    setApproving(null)
    setError('')
    setBusyId(request.id)
    try {
      await api.post(`/api/admin/item-requests/${request.id}/${action}`, fields)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
      load()
      onDecided?.()
      // Updates the waiting count on the menu.
      window.dispatchEvent(new Event('requests-changed'))
    }
  }

  if (!requests) return error ? <div className="alert error">{error}</div> : null
  if (!requests.length && emptyText === null) return null

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="table-card inner">
        <table className="stack-table">
          <thead>
            <tr>
              {showClient && <th>Client</th>}
              <th>Item</th>
              <th>Request</th>
              <th>Sent</th>
              <th>{status === 'pending' ? '' : 'Decision'}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                {showClient && (
                  <td data-label="Client">
                    <Link to={`/clients/${r.client_id}`}>{r.client_business_name || r.client_username}</Link>
                  </td>
                )}
                <td className="mono" data-label="Item">{r.code}</td>
                <td data-label="Request">{describe(r)}</td>
                <td data-label="Sent">{formatDateTime(r.created_at)}</td>
                <td className="actions">
                  {r.status === 'pending' ? (
                    <div className="decide">
                      <button type="button" className="btn small" disabled={busyId === r.id} onClick={() => startApproval(r)}>
                        <Check size={15} /> Approve
                      </button>
                      <button
                        type="button"
                        className="btn danger small"
                        disabled={busyId === r.id}
                        onClick={() => {
                          setReason('')
                          setRejecting(r)
                        }}
                      >
                        <X size={15} /> Reject
                      </button>
                    </div>
                  ) : (
                    <div className="decision">
                      <span className={`badge ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status] || r.status}</span>
                      {r.decided_by && <span className="muted small">by {r.decided_by}</span>}
                      {r.admin_note && <div className="muted small">{r.admin_note}</div>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!requests.length && (
              <tr>
                <td colSpan={showClient ? 5 : 4} className="muted empty">
                  {emptyText || 'Nothing here.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {approving && (
        <Modal
          title={approving.request.action === 'add' ? 'Approve new item' : 'Approve change'}
          onClose={() => setApproving(null)}
          width={500}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault()
              decide(approving.request, 'approve', {
                tax_rate: Number(approving.tax_rate) || 0,
                pct_code: approving.pct_code,
                third_schedule: approving.third_schedule,
              })
            }}
          >
            <div className="approve-summary">
              <div>
                <span className="muted small">Client</span>
                <div>{approving.request.client_business_name || approving.request.client_username || 'N/A'}</div>
              </div>
              <div>
                <span className="muted small">Item</span>
                <div>
                  <span className="mono">{approving.request.code}</span> · {approving.request.name}
                </div>
              </div>
              <div>
                <span className="muted small">Price</span>
                <div>Rs {money(approving.request.price)}</div>
              </div>
            </div>
            <p className="muted">
              Set how this item is reported to FBR. These are filled in from{' '}
              {approving.request.proposed_pct_code
                ? "the client's suggestion"
                : approving.request.action === 'add'
                  ? "the client's defaults"
                  : 'the item as it is now'}
              ; check them before approving.
            </p>
            <div className="form-grid two">
              <label>
                Tax rate %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={approving.tax_rate}
                  onChange={(e) => setApproving({ ...approving, tax_rate: e.target.value })}
                  required
                  autoFocus
                />
              </label>
              <label>
                PCT code
                <input
                  value={approving.pct_code}
                  onChange={(e) => setApproving({ ...approving, pct_code: e.target.value })}
                  maxLength={8}
                  required
                />
              </label>
              <label className="check span-2">
                <input
                  type="checkbox"
                  checked={approving.third_schedule}
                  onChange={(e) => setApproving({ ...approving, third_schedule: e.target.checked })}
                />
                3rd Schedule item
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setApproving(null)}>
                Cancel
              </button>
              <button type="submit" className="btn">
                <Check size={15} /> Approve
              </button>
            </div>
          </form>
        </Modal>
      )}

      {rejecting && (
        <Modal title="Reject request" onClose={() => setRejecting(null)} width={460}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault()
              decide(rejecting, 'reject', { note: reason })
            }}
          >
            <p className="muted">
              {rejecting.client_business_name || 'The client'} will see this reason on their
              computer next to the request.
            </p>
            <label>
              Reason (optional)
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
            </label>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setRejecting(null)}>
                Cancel
              </button>
              <button type="submit" className="btn danger">
                Reject request
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
