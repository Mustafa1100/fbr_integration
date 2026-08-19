const TOKEN_KEY = 'fbr_token'
const USER_KEY = 'fbr_user'

// In dev, Vite's server proxy forwards /api to localhost:8000 (see
// vite.config.js), so this stays empty and requests use relative paths. In
// production the frontend (Cloudflare Pages) and backend (Fly.io) are on
// different domains, so builds set VITE_API_URL to the backend's origin.
export const API_BASE = import.meta.env.VITE_API_URL || ''

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    // Corrupted/malformed value — fail safe to "logged out" instead of
    // throwing during render, which several routes call this synchronously.
    localStorage.removeItem(USER_KEY)
    return null
  }
}

export function storeSession(data) {
  localStorage.setItem(TOKEN_KEY, data.token)
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      role: data.role,
      full_name: data.full_name,
      email: data.email,
      must_change_password: data.must_change_password,
    })
  )
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body, formData, raw = false } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'

  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: formData ?? (body ? JSON.stringify(body) : undefined),
  })

  if (resp.status === 401) {
    clearSession()
    // ?session=expired lets the login page explain why it just bounced
    // the user here, instead of silently dropping them on the form.
    window.location.href = '/login?session=expired'
    throw new ApiError('Session expired', 401)
  }

  if (!resp.ok) {
    let message = `Request failed (${resp.status})`
    try {
      const data = await resp.json()
      if (typeof data.detail === 'string') message = data.detail
      else if (Array.isArray(data.detail)) message = data.detail.map((d) => d.msg).join('; ')
    } catch {
      /* keep default message */
    }
    throw new ApiError(message, resp.status)
  }

  // Caller wants the Response itself (e.g. to read a pagination header)
  // rather than the parsed body.
  if (raw) return resp

  const contentType = resp.headers.get('content-type') || ''
  return contentType.includes('application/json') ? resp.json() : resp.text()
}

export const api = {
  get: (path) => request(path),
  getRaw: (path) => request(path, { raw: true }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST', formData }),
}
