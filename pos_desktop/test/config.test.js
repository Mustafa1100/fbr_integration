import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEVELOPMENT, PRODUCTION, serverConfig } from '../electron/config.js'

test('the installed app always uses the production server and key', () => {
  // Even if someone sets the developer variable on a clinic PC.
  const packaged = serverConfig({ packaged: true, env: { POS_PORTAL_URL: 'http://evil.example' } })
  assert.equal(packaged, PRODUCTION)
  assert.match(PRODUCTION.portalUrl, /^https:\/\//)
  assert.notEqual(PRODUCTION.licencePublicKey, DEVELOPMENT.licencePublicKey)
})

test('a run from source uses development, unless asked for production', () => {
  assert.equal(serverConfig({ packaged: false, env: {} }).portalUrl, 'http://localhost:8100')
  assert.equal(serverConfig({ packaged: false, env: { POS_PORTAL_URL: 'http://localhost:8101' } }).portalUrl, 'http://localhost:8101')
  assert.equal(serverConfig({ packaged: false, env: { POS_USE_PRODUCTION: '1' } }), PRODUCTION)
})
