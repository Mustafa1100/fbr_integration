// Client for the admin portal's API (pos_backend): sign in, and download the
// account's settings and subscription.

const TIMEOUT_MS = 15000

// status 0 means the portal could not be reached at all (offline, wrong
// address); anything else is the HTTP status of its answer.
export class PortalError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.status = status
  }
}

async function call(serverUrl, path, { method = 'GET', token, body } = {}) {
  const url = `${String(serverUrl || '').trim().replace(/\/+$/, '')}${path}`
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'

  let resp
  try {
    resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new PortalError('Could not reach the server. Check the internet connection.')
  }

  let data = null
  try {
    data = await resp.json()
  } catch {
    // non-JSON answer, handled below
  }
  if (!resp.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : `Server error (${resp.status})`
    throw new PortalError(detail, resp.status)
  }
  if (!data) throw new PortalError('The server sent an answer that could not be read.', resp.status)
  return data
}

export const login = (serverUrl, username, password) =>
  call(serverUrl, '/api/pos/login', { method: 'POST', body: { username, password } })

export const sync = (serverUrl, token) => call(serverUrl, '/api/pos/sync', { token })

// Uploads item requests, the invoice counter and invoices to back up; answers
// with the full item list, the counter to continue from and which invoices
// were saved.
export const syncData = (serverUrl, token, body) =>
  call(serverUrl, '/api/pos/data/sync', { method: 'POST', token, body })

// One page of the account's backed-up invoices, oldest first.
export const restoreInvoices = (serverUrl, token, afterId = 0) =>
  call(serverUrl, `/api/pos/invoices?after_id=${Number(afterId) || 0}&limit=500`, { token })
