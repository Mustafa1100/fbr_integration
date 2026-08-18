import { useEffect, useState } from 'react'
import { api } from '../api'

// Shared "pick a user" dropdown for the admin per-user views (uploads,
// invoices) — one fetch of /api/admin/users, reused wherever needed.
export default function UserPicker({ value, onChange, label = 'User' }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/admin/users')
      .then(setUsers)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div className="field" style={{ marginBottom: 0, maxWidth: 380 }}>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a user…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name} — {u.email} ({u.role})
          </option>
        ))}
      </select>
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}
