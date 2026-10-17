const TOKEN_KEY = 'pos_admin_token'
const ADMIN_KEY = 'pos_admin'

// In dev, Vite's proxy forwards /api to pos_backend (see vite.config.js), so
// this stays empty. Production builds set VITE_API_URL to the API's origin.
export const API_BASE = import.meta.env.VITE_API_URL || ''

export const getToken = () => localStorage.getItem(TOKEN_KEY)

export function getAdmin() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_KEY)) || null
  } catch {
    return null
  }
}

export function storeSession(data) {
  localStorage.setItem(TOKEN_KEY, data.token)
  localStorage.setItem(
    ADMIN_KEY,
    JSON.stringify({
      email: data.email,
      full_name: data.full_name,
      username_domain: data.username_domain,
    })
  )
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ADMIN_KEY)
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'

  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // A 401 on a request that carried a token means the session ended; a 401
  // without one is a failed login and should show its own message.
  if (resp.status === 401 && token) {
    clearSession()
    window.location.href = '/login?session=expired'
    throw new Error('Session expired')
  }

  if (!resp.ok) {
    let message = `Request failed (${resp.status})`
    try {
      const data = await resp.json()
      if (typeof data.detail === 'string') message = data.detail
      else if (Array.isArray(data.detail)) {
        message = data.detail.map((d) => d.msg.replace(/^Value error, /, '')).join('; ')
      }
    } catch {
      /* keep default message */
    }
    throw new Error(message)
  }
  return resp.json()
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
}

export const money = (n) =>
  Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })

// Dates are always shown in Pakistan time, wherever the admin is.
const TIME_ZONE = 'Asia/Karachi'

export const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: TIME_ZONE,
      })
    : 'N/A'

export const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: TIME_ZONE,
      })
    : 'Never'

export const STATUS_LABEL = {
  none: 'No plan',
  active: 'Active',
  expiring: 'Expiring soon',
  expired: 'Expired',
  cancelled: 'Cancelled',
}
