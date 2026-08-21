// Mirrors backend/app/auth.py::password_strength() exactly — the only real
// requirement is length. [...password] (not password.length) iterates by
// Unicode code point so multi-byte characters count as one, matching
// Python's len().
export const MIN_PASSWORD_LENGTH = 8

export function passwordStrength(password) {
  const length = [...password].length
  return { ok: length >= MIN_PASSWORD_LENGTH, length }
}
