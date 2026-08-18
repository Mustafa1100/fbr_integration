// Mirrors backend/app/auth.py::password_strength() exactly, so the live
// meter always agrees with what POST /api/auth/set-password will accept.
//
// Uses Unicode property escapes (not [A-Z]/[a-z]/[0-9] ranges) to match
// Python's Unicode-aware str.isupper()/islower()/isdigit()/isalnum() — an
// ASCII-only regex would both wrongly flag accented/non-Latin letters as
// "special characters" and wrongly miss them as upper/lowercase, silently
// diverging from what the server actually accepts. [...password] (not
// password.length) iterates by Unicode code point so multi-byte characters
// (e.g. emoji) count as one character on both sides, matching Python's len().
export function passwordStrength(password) {
  const chars = [...password]
  const lengthOk = chars.length >= 8
  const checks = {
    length: lengthOk,
    length12: chars.length >= 12,
    upper: chars.some((c) => /\p{Lu}/u.test(c)),
    lower: chars.some((c) => /\p{Ll}/u.test(c)),
    digit: chars.some((c) => /\p{Nd}/u.test(c)),
    special: chars.some((c) => !/[\p{L}\p{N}]/u.test(c)),
  }
  const score = [checks.length12, checks.upper, checks.lower, checks.digit, checks.special].filter(
    Boolean
  ).length

  let label
  if (!lengthOk || score <= 1) label = 'weak'
  else if (score <= 3) label = 'medium'
  else label = 'strong'

  return { label, score, checks }
}
