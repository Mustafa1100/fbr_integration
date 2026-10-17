import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { dataDir } from '../electron/dataDir.js'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pos-datadir-'))

test('production and development never share a database folder', () => {
  const appData = tmp()
  const prod = dataDir({ appData, appName: 'Compliance Pakistan POS', production: true })
  const dev = dataDir({ appData, appName: 'Compliance Pakistan POS', production: false })
  assert.equal(prod, path.join(appData, 'Compliance Pakistan POS'))
  assert.equal(dev, path.join(appData, 'Compliance Pakistan POS (development)'))
})

test('an old development database is moved out of the production folder once', () => {
  const appData = tmp()
  const standard = path.join(appData, 'POS')
  fs.mkdirSync(standard)
  for (const f of ['pos.db', 'pos.db-wal', 'pos.backup-20261015-1840.db', 'Preferences']) fs.writeFileSync(path.join(standard, f), f)

  const dev = dataDir({ appData, appName: 'POS', production: false })
  assert.deepEqual(fs.readdirSync(dev).sort(), ['pos.backup-20261015-1840.db', 'pos.db', 'pos.db-wal'])
  // Electron's own files stay; no database is left for the installed app.
  assert.deepEqual(fs.readdirSync(standard), ['Preferences'])

  // Later runs leave everything alone, even if the installed app made its own.
  fs.writeFileSync(path.join(standard, 'pos.db'), 'production')
  dataDir({ appData, appName: 'POS', production: false })
  assert.equal(fs.readFileSync(path.join(standard, 'pos.db'), 'utf8'), 'production')
  assert.equal(fs.readFileSync(path.join(dev, 'pos.db'), 'utf8'), 'pos.db')
})
