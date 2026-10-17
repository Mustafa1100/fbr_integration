// Checks a licence signed by the server (an Ed25519 JWT, as PyJWT writes it).
// Only the server holds the private key, so a licence edited on this PC
// fails the check and is treated as no licence at all.
import { createPublicKey, verify } from 'node:crypto'

const fromBase64Url = (text) => Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

// Returns the licence's contents, or null if it is missing, malformed or not
// signed by the server's key.
export function verifyLicence(token, publicKeyPem) {
  if (typeof token !== 'string' || !publicKeyPem) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const header = JSON.parse(fromBase64Url(parts[0]).toString('utf8'))
    if (header.alg !== 'EdDSA') return null
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`)
    const ok = verify(null, signed, createPublicKey(publicKeyPem), fromBase64Url(parts[2]))
    return ok ? JSON.parse(fromBase64Url(parts[1]).toString('utf8')) : null
  } catch {
    return null
  }
}
