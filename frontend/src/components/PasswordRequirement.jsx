import { Check, X } from 'lucide-react'
import { MIN_PASSWORD_LENGTH, passwordStrength } from '../passwordStrength'

// The only password rule left, after dropping the old complexity scoring
// (an 8+ character password could satisfy every visible checklist item —
// length, upper, lower, digit — and still get rejected for missing a
// special character, which was just confusing without adding real value).
export default function PasswordRequirement({ password }) {
  if (!password) return null
  const { ok } = passwordStrength(password)
  return (
    <p
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        margin: '8px 0 0',
        fontSize: '0.82rem',
        fontWeight: 500,
        color: ok ? 'var(--brand-600)' : 'var(--muted)',
      }}
    >
      {ok ? <Check size={14} /> : <X size={14} />}
      At least {MIN_PASSWORD_LENGTH} characters
    </p>
  )
}
