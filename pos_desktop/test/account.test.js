import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { beforeEach, test } from 'node:test'
import { createAccount } from '../electron/account.js'
import { verifyLicence } from '../electron/licence.js'
import { openStore } from '../electron/db.js'
import { PortalError } from '../electron/portal.js'
import { createPos } from '../electron/pos.js'

const DAY = 24 * 60 * 60 * 1000
const START = new Date('2026-10-13T10:00:00Z').getTime()

let clock
let store
let portal
let account
let answer

// The server's signing key, for this test run only.
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' })
const b64url = (data) => Buffer.from(data).toString('base64url')
// Signs like the server (PyJWT, EdDSA).
function signLicence(claims) {
  const head = b64url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }))
  const body = b64url(JSON.stringify(claims))
  return `${head}.${body}.${b64url(sign(null, Buffer.from(`${head}.${body}`), privateKey))}`
}

// What the portal sends for login and sync (see pos_backend sync_payload and
// licence.issue), the licence derived from the subscription like the server.
function payload(overrides = {}) {
  const data = {
    username: 'kashif@pos.compliance.pk',
    config: {
      business_name: 'KASHIF CLINIC',
      ntn: '1694266-3',
      mode: 'demo',
      environment: 'test',
      pos_id: '822992',
      default_pct_code: '98151000',
    },
    subscription: {
      status: 'active',
      plan_name: 'Monthly',
      expires_at: new Date(START + 30 * DAY).toISOString(),
    },
    server_time: new Date(clock).toISOString(),
    ...overrides,
  }
  if (!('licence' in overrides)) {
    const issued = Date.parse(data.server_time)
    const end = data.subscription.expires_at ? Date.parse(data.subscription.expires_at) : null
    data.licence = signLicence({
      usr: data.username,
      status: data.subscription.status,
      plan: data.subscription.plan_name,
      plan_ends_at: data.subscription.expires_at,
      issued_at: data.server_time,
      valid_until: new Date(end === null ? issued : Math.min(end, issued + 30 * DAY)).toISOString(),
      active: true,
    })
  }
  return data
}

// The server's side of the data sync (see pos_backend routers/pos.py): it
// keeps the items and the invoice counter, and decides the tax fields.
let server

const newAccount = (forStore) =>
  createAccount({
    store: forStore,
    portal,
    now: () => new Date(clock),
    protect: (text) => `locked:${text}`,
    unprotect: (text) => text.replace(/^locked:/, ''),
    verifyLicence: (token) => verifyLicence(token, PUBLIC_PEM),
  })

beforeEach(() => {
  clock = START
  store = openStore(':memory:')
  answer = () => payload()
  server = { items: new Map(), requests: new Map(), usin_seq: 0, invoices: new Map(), rejectInvoices: new Set() }
  portal = {
    calls: [],
    async login(serverUrl, username, password) {
      portal.calls.push(['login', serverUrl, username, password])
      if (password !== 'right') throw new PortalError('Invalid username or password', 401)
      return { token: 'device-token', ...answer() }
    },
    async sync(serverUrl, token) {
      portal.calls.push(['sync', serverUrl, token])
      return answer()
    },
    // Behaves like pos_backend: uploads never change the catalog; requests
    // wait for an admin (see decide below).
    async syncData(serverUrl, token, body) {
      portal.calls.push(['syncData', body])
      for (const request of body.requests || []) {
        if (server.requests.has(request.uid)) continue
        for (const other of server.requests.values()) {
          if (other.code === request.code && other.status === 'pending') other.status = 'withdrawn'
        }
        server.requests.set(request.uid, { ...request, status: 'pending', admin_note: '' })
      }
      server.usin_seq = Math.max(server.usin_seq, body.usin_seq)
      // Invoice backup (see pos_backend app/invoices.py): an accepted invoice
      // is never turned back; a bad one is reported and skipped.
      const saved = []
      const errors = []
      for (const invoice of body.invoices || []) {
        if (server.rejectInvoices.has(invoice.usin)) {
          errors.push({ usin: invoice.usin, error: 'bad' })
          continue
        }
        const kept = server.invoices.get(invoice.usin)
        if (!(kept?.status === 'fiscalized' && invoice.status !== 'fiscalized')) {
          server.invoices.set(invoice.usin, structuredClone(invoice))
        }
        saved.push(invoice.usin)
      }
      return {
        items: [...server.items.values()],
        requests: [...server.requests.values()],
        usin_seq: server.usin_seq,
        invoices_saved: saved,
        invoice_errors: errors,
      }
    },
    // Pages of 2, to exercise paging.
    async restoreInvoices(serverUrl, token, afterId = 0) {
      portal.calls.push(['restoreInvoices', afterId])
      const all = [...server.invoices.values()]
      const page = all.slice(afterId, afterId + 2)
      return { invoices: page, next_after_id: afterId + 2 < all.length ? afterId + 2 : null }
    },
  }
  account = newAccount(store)
})

const signIn = () =>
  account.login({ serverUrl: 'https://api.example', username: ' Kashif@POS.compliance.pk ', password: 'right' })

const sale = {
  payment_mode: 1,
  lines: [{ item_code: 'CONS', item_name: 'Consultation', quantity: 1, unit_price: 2000, tax_rate: 0 }],
}

test('before signing in nothing can be issued', () => {
  const state = account.state()
  assert.equal(state.signedIn, false)
  assert.equal(state.license.reason, 'signed_out')
  assert.throws(() => account.assertLicensed(), /Sign in/)
})

test('signing in downloads the settings and the subscription', async () => {
  const state = await signIn()
  assert.equal(state.signedIn, true)
  assert.equal(state.username, 'kashif@pos.compliance.pk')
  assert.equal(state.planName, 'Monthly')
  assert.equal(state.daysLeft, 30)
  assert.equal(state.license.allowed, true)
  // The username is normalised before it is sent.
  assert.deepEqual(portal.calls[0], ['login', 'https://api.example', 'kashif@pos.compliance.pk', 'right'])

  const settings = store.getSettings()
  assert.equal(settings.business_name, 'KASHIF CLINIC')
  assert.equal(settings.pos_id, '822992')
  assert.equal(settings.default_pct_code, '98151000')
  // The token is stored through the protector, never as plain text.
  assert.equal(store.getMeta('account').token, 'locked:device-token')
})

test('a wrong password signs nobody in', async () => {
  await assert.rejects(
    account.login({ serverUrl: 'https://api.example', username: 'x', password: 'wrong' }),
    /Invalid username or password/
  )
  assert.equal(account.state().signedIn, false)
})

test('the portal cannot overwrite printing settings, nor the PC the portal ones', async () => {
  store.saveSettings({ printer: 'EPSON TM-T20', paper_width: 58 })
  answer = () => payload({ config: { business_name: 'From portal', printer: 'HACKED', paper_width: 80 } })
  await signIn()
  const settings = store.getSettings()
  assert.equal(settings.business_name, 'From portal')
  assert.equal(settings.printer, 'EPSON TM-T20')
  assert.equal(settings.paper_width, 58)
})

test('refresh picks up changes made in the portal', async () => {
  await signIn()
  answer = () =>
    payload({
      config: { business_name: 'KASHIF CLINIC', mode: 'fbr', environment: 'live', pos_id: '201826' },
      subscription: { status: 'active', plan_name: 'Yearly', expires_at: new Date(START + 365 * DAY).toISOString() },
    })
  const state = await account.sync()
  assert.equal(state.synced, true)
  assert.equal(state.planName, 'Yearly')
  assert.deepEqual(
    portal.calls.findLast((call) => call[0] === 'sync'),
    ['sync', 'https://api.example', 'device-token']
  )
  const settings = store.getSettings()
  assert.deepEqual([settings.mode, settings.environment, settings.pos_id], ['fbr', 'live', '201826'])
})

test('offline, the cached subscription keeps working and still expires on time', async () => {
  await signIn()
  portal.sync = async () => {
    throw new PortalError('Could not reach the server. Check the internet connection.')
  }

  clock = START + 29 * DAY
  let state = await account.sync()
  assert.equal(state.synced, false)
  assert.equal(state.signedIn, true)
  assert.equal(state.license.allowed, true)

  clock = START + 30 * DAY + 1000
  state = account.state()
  assert.equal(state.license.reason, 'expired')
  assert.match(state.license.message, /expired on 12 Nov 2026/)
})

test('an expired subscription blocks new sales and returns but not what is already queued', async () => {
  await signIn()
  const pos = createPos({ store, now: () => new Date(clock), assertLicensed: account.assertLicensed })
  const sold = await pos.createSale(sale)
  assert.equal(sold.status, 'fiscalized')

  clock = START + 31 * DAY
  await assert.rejects(pos.createSale(sale), /subscription expired/i)
  await assert.rejects(pos.createReturn(sold.id), /subscription expired/i)
  assert.equal(store.listInvoices().total, 1)
  // Renewing in the portal and refreshing unlocks it again.
  answer = () =>
    payload({ subscription: { status: 'active', plan_name: 'Monthly', expires_at: new Date(clock + 30 * DAY).toISOString() } })
  await account.sync()
  assert.equal((await pos.createSale(sale)).status, 'fiscalized')
})

test('an account with no plan cannot issue invoices', async () => {
  answer = () => payload({ subscription: { status: 'none', plan_name: '', expires_at: null } })
  const state = await signIn()
  assert.equal(state.license.reason, 'no_plan')
  assert.equal(state.daysLeft, null)
})

test('setting the clock back does not extend the subscription', async () => {
  await signIn()
  clock = START + 20 * DAY
  assert.equal(account.license().allowed, true)

  clock = START + 10 * DAY
  assert.equal(account.license().reason, 'clock')
  // A small correction (time zone, daylight saving) is tolerated.
  clock = START + 20 * DAY - 3 * 60 * 60 * 1000
  assert.equal(account.license().allowed, true)
})

test('a PC clock behind the server is caught at sign-in', async () => {
  answer = () => payload({ server_time: new Date(START + 60 * DAY).toISOString() })
  const state = await signIn()
  assert.equal(state.license.reason, 'clock')
})

test('a reset password signs the app out at the next refresh', async () => {
  await signIn()
  portal.sync = async () => {
    throw new PortalError('This login is no longer valid — sign in again', 401)
  }
  const state = await account.sync()
  assert.equal(state.signedIn, false)
  assert.match(state.syncError, /signed out/)
  // Local data survives signing out.
  assert.equal(store.getSettings().business_name, 'KASHIF CLINIC')
})

test('a deactivated account is locked but stays signed in', async () => {
  await signIn()
  portal.sync = async () => {
    throw new PortalError('This account has been deactivated. Contact your provider.', 403)
  }
  const state = await account.sync()
  assert.equal(state.signedIn, true)
  assert.equal(state.license.reason, 'deactivated')

  // Reactivated in the portal: the next refresh unlocks it.
  portal.sync = async () => answer()
  assert.equal((await account.sync()).license.allowed, true)
})

test('signing out locks the app and keeps the invoices', async () => {
  await signIn()
  const pos = createPos({ store, now: () => new Date(clock), assertLicensed: account.assertLicensed })
  await pos.createSale(sale)
  assert.equal(account.logout().signedIn, false)
  await assert.rejects(pos.createSale(sale), /Sign in/)
  assert.equal(store.listInvoices().total, 1)
})

// ── Items: the server's catalog, changed only by approved requests ────────

const itemNamed = (name, from = store) => from.listItems().find((item) => item.name === name)
const serverItem = (code, name, price, extra = {}) =>
  server.items.set(code, { code, name, price, tax_rate: 5, pct_code: '98151000', third_schedule: false, ...extra })

// The admin's side of a request, as the portal does it.
function decide(uid, status, note = '') {
  const request = server.requests.get(uid)
  request.status = status
  request.admin_note = note
  if (status !== 'approved') return
  if (request.action === 'delete') server.items.delete(request.code)
  else if (request.action === 'add') serverItem(request.code, request.name, request.price)
  else Object.assign(server.items.get(request.code), { name: request.name, price: request.price })
}

test('the catalog comes from the server, tax fields included', async () => {
  serverItem('CONS', 'General consultation', 2000, { tax_rate: 15, pct_code: '98170000' })
  await signIn()
  const item = itemNamed('General consultation')
  assert.deepEqual([item.code, item.price, item.tax_rate, item.pct_code], ['CONS', 2000, 15, '98170000'])
})

test('adding an item is a request; it appears only once approved', async () => {
  await signIn()
  const uid = store.addItemRequest({ code: 'FUP', action: 'add', name: 'Follow-up visit', price: 1000 })
  assert.deepEqual(store.listItems(), [])
  await account.syncData()
  assert.deepEqual(store.listItems(), [])
  assert.equal(store.listItemRequests()[0].status, 'pending')
  // Nothing about tax is ever uploaded.
  const sent = portal.calls.findLast((call) => call[0] === 'syncData')[1]
  assert.deepEqual(Object.keys(sent).sort(), ['invoices', 'requests', 'usin_seq'])
  assert.deepEqual(Object.keys(sent.requests[0]).sort(), ['action', 'code', 'name', 'pct_code', 'price', 'tax_rate', 'uid'])

  decide(uid, 'approved')
  await account.syncData()
  assert.equal(itemNamed('Follow-up visit').price, 1000)
  assert.equal(store.listItemRequests()[0].status, 'approved')
})

test('changing an item is a request, applied only once approved', async () => {
  serverItem('ECG', 'ECG', 1500, { tax_rate: 15 })
  await signIn()
  const uid = store.addItemRequest({ code: 'ECG', action: 'edit', name: 'ECG (12 lead)', price: 1800 })
  await account.syncData()
  assert.equal(itemNamed('ECG').price, 1500)

  decide(uid, 'approved')
  await account.syncData()
  const item = itemNamed('ECG (12 lead)')
  assert.deepEqual([item.price, item.tax_rate], [1800, 15])
})

test('a rejected request leaves the item and shows the reason', async () => {
  serverItem('LAB', 'Lab test', 500)
  await signIn()
  const uid = store.addItemRequest({ code: 'LAB', action: 'delete' })
  await account.syncData()
  decide(uid, 'rejected', 'Still offered at the clinic')
  await account.syncData()
  assert.ok(itemNamed('Lab test'))
  const [request] = store.listItemRequests()
  assert.deepEqual([request.status, request.admin_note], ['rejected', 'Still offered at the clinic'])
})

test('an approved deletion removes the item, and admin changes come down', async () => {
  serverItem('OLD', 'Old service', 10)
  serverItem('KEEP', 'Kept service', 20)
  await signIn()
  const uid = store.addItemRequest({ code: 'OLD', action: 'delete' })
  await account.syncData()
  assert.deepEqual(store.listItems().map((item) => item.code), ['KEEP', 'OLD'])
  decide(uid, 'approved')
  await account.syncData()
  assert.deepEqual(store.listItems().map((item) => item.code), ['KEEP'])

  serverItem('NEW', 'Added by admin', 99, { tax_rate: 15 })
  server.items.get('KEEP').tax_rate = 15
  await account.syncData()
  assert.deepEqual(store.listItems().map((item) => [item.code, item.tax_rate]), [['NEW', 15], ['KEEP', 15]])
})

test('requests made offline wait, and only the newest per item is sent', async () => {
  serverItem('FUP', 'Follow-up', 1000)
  await signIn()
  const working = portal.syncData
  portal.syncData = async () => {
    throw new PortalError('Could not reach the server. Check the internet connection.')
  }
  store.addItemRequest({ code: 'FUP', action: 'edit', name: 'Follow-up visit', price: 1100 })
  const newest = store.addItemRequest({ code: 'FUP', action: 'edit', name: 'Follow-up visit', price: 1200 })
  assert.equal((await account.syncData()).synced, false)
  assert.deepEqual(store.listItemRequests().map((r) => [r.uid, r.status]), [[newest, 'queued']])
  // Offline does not stop sales once set up.
  assert.equal(account.license().allowed, true)

  portal.syncData = working
  await account.syncData()
  assert.deepEqual([...server.requests.keys()], [newest])
  const third = store.addItemRequest({ code: 'FUP', action: 'delete' })
  await account.syncData()
  assert.equal(server.requests.get(newest).status, 'withdrawn')
  assert.deepEqual(store.listItemRequests().map((r) => [r.uid, r.status]), [[third, 'pending']])
})

test('a replacement PC gets the items back and continues the invoice numbers', async () => {
  serverItem('CONS', 'General consultation', 2000)
  await signIn()
  const pos = createPos({ store, now: () => new Date(clock), assertLicensed: account.assertLicensed })
  for (let i = 0; i < 3; i += 1) await pos.createSale(sale)
  await account.syncData()
  assert.equal(server.usin_seq, 3)

  const newStore = openStore(':memory:')
  const newPc = newAccount(newStore)
  const state = await newPc.login({ serverUrl: 'https://api.example', username: 'kashif@pos.compliance.pk', password: 'right' })
  assert.equal(state.license.allowed, true)
  assert.equal(itemNamed('General consultation', newStore).price, 2000)
  const newPos = createPos({ store: newStore, now: () => new Date(clock), assertLicensed: newPc.assertLicensed })
  assert.equal((await newPos.createSale(sale)).usin, '000004')
})

// ── Invoice backup ────────────────────────────────────────────────────────

const posFor = (forStore, forAccount) =>
  createPos({ store: forStore, now: () => new Date(clock), assertLicensed: forAccount.assertLicensed })

test('invoices are backed up, and backed up again when they change', async () => {
  await signIn()
  const pos = posFor(store, account)
  const first = await pos.createSale(sale)
  await pos.createSale(sale)
  await account.syncData()
  assert.deepEqual([...server.invoices.keys()], ['000001', '000002'])
  const copy = server.invoices.get('000001')
  assert.equal(copy.status, 'fiscalized')
  assert.equal(copy.items[0].item_code, 'CONS')
  assert.equal('rev' in copy, false)
  assert.equal(account.state().backupPending, 0)
  assert.equal(account.state().lastBackupAt, new Date(clock).toISOString())

  // Nothing changed: nothing is sent again.
  await account.syncData()
  assert.deepEqual(portal.calls.findLast((call) => call[0] === 'syncData')[1].invoices, [])

  store.updateInvoice(first.id, { last_error: 'changed later' })
  assert.equal(account.state().backupPending, 1)
  await account.syncData()
  assert.equal(server.invoices.get('000001').last_error, 'changed later')
  assert.equal(account.state().backupPending, 0)
})

test('offline, invoices wait and are backed up when the server is back', async () => {
  await signIn()
  const working = portal.syncData
  portal.syncData = async () => {
    throw new PortalError('Could not reach the server. Check the internet connection.')
  }
  await posFor(store, account).createSale(sale)
  assert.equal((await account.syncData()).synced, false)
  assert.equal(account.state().backupPending, 1)
  portal.syncData = working
  await account.syncData()
  assert.equal(account.state().backupPending, 0)
  assert.ok(server.invoices.has('000001'))
})

test('an invoice the server turns down stays due without holding up the rest', async () => {
  await signIn()
  server.rejectInvoices.add('000001')
  const pos = posFor(store, account)
  await pos.createSale(sale)
  await pos.createSale(sale)
  await account.syncData()
  assert.deepEqual([...server.invoices.keys()], ['000002'])
  assert.equal(account.state().backupPending, 1)
  server.rejectInvoices.clear()
  await account.syncData()
  assert.equal(account.state().backupPending, 0)
})

test('an invoice changed while its upload was on the way stays due', () => {
  const id = store.insertInvoice(
    { invoice_type: 1, created_at: '2026-10-15 10:00:00', payment_mode: 1, status: 'queued' },
    []
  )
  const batch = store.invoicesToBackUp()
  store.updateInvoice(id, { status: 'fiscalized' })
  store.markBackedUp(batch)
  assert.equal(store.backupPending(), 1)
  store.markBackedUp(store.invoicesToBackUp())
  assert.equal(store.backupPending(), 0)
})

test('a new PC gets the invoice history, holding back ones FBR never confirmed', async () => {
  await signIn()
  const pos = posFor(store, account)
  const first = await pos.createSale(sale)
  await pos.createSale(sale)
  const third = await pos.createSale(sale)
  await pos.createReturn(first.id)
  // The old PC never heard back from FBR's component about this one.
  store.updateInvoice(third.id, { status: 'queued', fbr_invoice_number: '' })
  await account.syncData()
  assert.equal(server.invoices.size, 4)

  const newStore = openStore(':memory:')
  const newPc = newAccount(newStore)
  await newPc.login({ serverUrl: 'https://api.example', username: 'kashif@pos.compliance.pk', password: 'right' })
  const { rows, total } = newStore.listInvoices()
  assert.equal(total, 4)
  assert.deepEqual(rows.map((r) => r.usin), ['000004', '000003', '000002', '000001'])
  const restoredFirst = newStore.getInvoice(rows.find((r) => r.usin === '000001').id)
  assert.equal(restoredFirst.status, 'fiscalized')
  assert.equal(restoredFirst.fbr_invoice_number, first.fbr_invoice_number)
  assert.equal(restoredFirst.items.length, 1)
  // The return is known, so the sale cannot be returned twice.
  assert.ok(newStore.findReturn('000001'))

  // Not sent again on its own: a person checks first.
  const held = rows.find((r) => r.usin === '000003')
  assert.equal(held.status, 'unconfirmed')
  assert.match(held.last_error, /another computer/)
  assert.deepEqual(newStore.queuedIds(), [])
  // Restored invoices are not uploaded back.
  assert.equal(newPc.state().backupPending, 0)

  // Downloaded once per sign-in, not at every sync.
  const pages = portal.calls.filter((call) => call[0] === 'restoreInvoices').length
  await newPc.syncData()
  assert.equal(portal.calls.filter((call) => call[0] === 'restoreInvoices').length, pages)
  // Numbering continues after the old PC's invoices.
  assert.equal((await posFor(newStore, newPc).createSale(sale)).usin, '000005')
})

test('a failed history download is tried again and does not block selling', async () => {
  const working = portal.restoreInvoices
  portal.restoreInvoices = async () => {
    throw new PortalError('Could not reach the server. Check the internet connection.')
  }
  const state = await signIn()
  assert.equal(state.license.allowed, true)
  portal.restoreInvoices = working
  server.invoices.set('000001', {
    usin: '000001', invoice_type: 1, created_at: '2026-10-14 09:00:00', payment_mode: 1,
    status: 'fiscalized', fbr_invoice_number: 'FBR1', items: [],
  })
  assert.equal((await account.syncData()).synced, true)
  assert.equal(store.listInvoices().total, 1)
})

test('a new PC cannot issue invoices until its numbering has been downloaded', async () => {
  const working = portal.syncData
  portal.syncData = async () => {
    throw new PortalError('Could not reach the server. Check the internet connection.')
  }
  const state = await signIn()
  assert.equal(state.license.reason, 'not_synced')
  const pos = createPos({ store, now: () => new Date(clock), assertLicensed: account.assertLicensed })
  await assert.rejects(pos.createSale(sale), /Setup is not finished/)
  portal.syncData = working
  assert.equal((await account.sync()).license.allowed, true)
})

test('items typed in before approvals existed become add requests', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const file = path.join(os.tmpdir(), `pos-migrate-${process.pid}-${Date.now()}.db`)
  const old = new DatabaseSync(file)
  old.exec(`CREATE TABLE items (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0, tax_rate REAL NOT NULL DEFAULT 0, pct_code TEXT NOT NULL DEFAULT '',
    third_schedule INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0);
    INSERT INTO items (code, name, price, dirty) VALUES ('SYNCED', 'Uploaded before', 100, 0), ('NEWONE', 'Not uploaded yet', 50, 3);`)
  old.close()
  const migrated = openStore(file)
  assert.deepEqual(migrated.listItems().map((item) => item.code), ['SYNCED'])
  assert.deepEqual(
    migrated.queuedRequests().map((r) => [r.action, r.code, r.name, r.price]),
    [['add', 'NEWONE', 'Not uploaded yet', 50]]
  )
  migrated.close()
  fs.rmSync(file, { force: true })
})
test('a request carries the suggested PCT code and tax rate', async () => {
  await signIn()
  store.addItemRequest({ code: 'LAB', action: 'add', name: 'Lab test', price: 800, pct_code: '98160000', tax_rate: 15 })
  await account.syncData()
  const sent = portal.calls.findLast((call) => call[0] === 'syncData')[1].requests[0]
  assert.deepEqual([sent.pct_code, sent.tax_rate], ['98160000', 15])
  const [request] = store.listItemRequests()
  assert.deepEqual([request.pct_code, request.tax_rate, request.status], ['98160000', 15, 'pending'])
})
test('a cancelled subscription locks the app at the next refresh', async () => {
  await signIn()
  const pos = createPos({ store, now: () => new Date(clock), assertLicensed: account.assertLicensed })
  assert.equal((await pos.createSale(sale)).status, 'fiscalized')

  // Cancelled in the portal: the server now reports it so, ending today.
  answer = () =>
    payload({ subscription: { status: 'cancelled', plan_name: 'Monthly', expires_at: new Date(clock).toISOString() } })
  const state = await account.sync()
  assert.equal(state.license.reason, 'cancelled')
  assert.match(state.license.message, /cancelled/)
  await assert.rejects(pos.createSale(sale), /cancelled/)

  // A new plan assigned in the portal unlocks it again.
  answer = () => payload()
  assert.equal((await account.sync()).license.allowed, true)
})

// ── Signed licence ────────────────────────────────────────────────────────

test('a licence edited on the PC is worthless', async () => {
  await signIn()
  assert.equal(account.license().allowed, true)
  const stored = store.getMeta('account')
  const [head, body, sig] = stored.licence.split('.')
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
  claims.plan_ends_at = claims.valid_until = '2099-01-01T00:00:00.000Z'
  store.setMeta('account', { ...stored, licence: `${head}.${b64url(JSON.stringify(claims))}.${sig}` })
  assert.equal(account.license().reason, 'no_licence')
  // Changing the plain copy of the end date does nothing either.
  store.setMeta('account', { ...stored, expires_at: '2099-01-01T00:00:00.000Z' })
  clock = START + 31 * DAY
  assert.equal(account.license().reason, 'expired')
})

test('a licence not signed by the server is ignored at sync', async () => {
  await signIn()
  answer = () => payload({ licence: 'not.a.licence' })
  await account.sync()
  // The earlier genuine licence stays in force.
  assert.equal(account.license().allowed, true)
})

test('after 30 days without reaching the server the PC stops issuing invoices', async () => {
  answer = () =>
    payload({ subscription: { status: 'active', plan_name: 'Yearly', expires_at: new Date(START + 365 * DAY).toISOString() } })
  await signIn()
  portal.sync = async () => {
    throw new PortalError('Could not reach the server. Check the internet connection.')
  }
  clock = START + 29 * DAY
  assert.equal((await account.sync()).license.allowed, true)
  clock = START + 30 * DAY + 1000
  const state = account.state()
  assert.equal(state.license.reason, 'offline_too_long')
  assert.match(state.license.message, /30 days/)

  // Back online: a fresh licence, another 30 days.
  portal.sync = async () => answer()
  assert.equal((await account.sync()).license.allowed, true)
})
