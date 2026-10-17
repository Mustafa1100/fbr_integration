// Which server the app talks to, and the public key it checks licences with.
//
// Both are fixed in the app on purpose and never asked on the sign-in screen:
// the server is what says how long a subscription runs, so a user who could
// point the app at a server of their own could grant themselves one.
//
// The installed app (packaged) always uses PRODUCTION. Running from source
// (npm run dev) uses DEVELOPMENT, unless POS_USE_PRODUCTION=1 is set to try
// the source against the live server.

export const PRODUCTION = {
  // pos_backend on Fly.io, under our own domain (DNS only in Cloudflare; Fly
  // serves the certificate). The Fly address compliance-pos-api.fly.dev
  // reaches the same server.
  portalUrl: 'https://api.pos.compliance.pk',
  // Public half of the production LICENCE_PRIVATE_KEY (Fly secret; kept in
  // pos_backend/.licence_key.production.pem, never committed).
  licencePublicKey: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAvgyMsXzPFzyXfYjQq7qGIsHRQM3+Jt+S6Ueq+LWV8Xs=
-----END PUBLIC KEY-----`,
}

export const DEVELOPMENT = {
  portalUrl: 'http://localhost:8100',
  // The development key from pos_backend/.licence_key.pem.
  licencePublicKey: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAoIVDCQTobG+HfhdYHOCyNjecJM5VPUgSpzHOkejrDdE=
-----END PUBLIC KEY-----`,
}

export function serverConfig({ packaged, env = {} }) {
  if (packaged || env.POS_USE_PRODUCTION === '1') return PRODUCTION
  return { ...DEVELOPMENT, portalUrl: env.POS_PORTAL_URL || DEVELOPMENT.portalUrl }
}
