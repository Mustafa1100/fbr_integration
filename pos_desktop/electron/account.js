// The signed-in account: portal login, downloaded settings and the
// subscription lock. Kept free of Electron so it runs under plain Node in
// the tests.
//
// What the PC may do is decided by a licence the server signs (see
// pos_backend/app/licence.py) and this code verifies. It is enforced here, so
// the app keeps working without internet and still stops on the right day; a
// licence edited on the PC fails verification. A licence is good until the
// plan ends or for 30 days without contacting the server, whichever is first.
import { PORTAL_SETTING_KEYS } from './db.js'
import * as portalClient from './portal.js'

const ACCOUNT_KEY = 'account'
const DAY_MS = 24 * 60 * 60 * 1000
// Setting the PC's date back must not extend a subscription. The latest time
// the app has seen is remembered, and a clock more than a day behind it locks
// the app. A day of slack absorbs time-zone and daylight-saving corrections.
const CLOCK_SLACK_MS = DAY_MS
// Invoices per backup upload, and uploads per sync (5,000 invoices); a longer
// backlog continues at the next sync.
const BACKUP_BATCH = 200
const MAX_BACKUP_ROUNDS = 25

const formatDay = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi',
  })

export function createAccount({
  store,
  portal = portalClient,
  now = () => new Date(),
  // Token encryption at rest; the main process passes Electron's safeStorage.
  protect = (text) => text,
  unprotect = (text) => text,
  // Checks the server's signature; returns the licence contents or null.
  verifyLicence = () => null,
}) {
  const read = () => store.getMeta(ACCOUNT_KEY)
  const write = (account) => store.setMeta(ACCOUNT_KEY, account)

  // Takes a login/sync answer: applies the settings and returns the account
  // record to store.
  function absorb(account, data) {
    store.saveSettings(data.config || {}, PORTAL_SETTING_KEYS)
    const serverTime = Date.parse(data.server_time) || 0
    return {
      ...account,
      username: data.username,
      active: true,
      plan_name: data.subscription?.plan_name || '',
      expires_at: data.subscription?.expires_at || null,
      subscription_status: data.subscription?.status || '',
      // Kept only if genuine; an earlier valid licence beats a broken one.
      licence: verifyLicence(data.licence) ? data.licence : account.licence || null,
      last_sync_at: now().toISOString(),
      clock_mark: Math.max(account.clock_mark || 0, serverTime, now().getTime()),
    }
  }

  // Whether invoices may be issued and printed right now, and if not, why.
  function license() {
    const account = read()
    if (!account) {
      return { allowed: false, reason: 'signed_out', message: 'Sign in to use the app.' }
    }
    if (!account.active) {
      return {
        allowed: false,
        reason: 'deactivated',
        message: 'This account has been deactivated. Contact your provider.',
      }
    }
    const time = now().getTime()
    if (time < (account.clock_mark || 0) - CLOCK_SLACK_MS) {
      return {
        allowed: false,
        reason: 'clock',
        message:
          "This computer's date is earlier than when the app was last used. Correct the date " +
          'and time, then press Refresh.',
      }
    }
    // Advance the mark, but not on every call — once a minute is plenty.
    if (time - (account.clock_mark || 0) > 60_000) write({ ...account, clock_mark: time })
    if (!account.data_synced) {
      // Until the server has said which invoice numbers are already used, a
      // new or replacement PC could repeat numbers reported to FBR.
      return {
        allowed: false,
        reason: 'not_synced',
        message:
          'Setup is not finished: your items and invoice numbering have not been downloaded ' +
          'yet. Connect to the internet and press Refresh.',
      }
    }
    // From here on only the signed licence counts, never the plain copy.
    const licence = verifyLicence(account.licence)
    if (!licence) {
      return {
        allowed: false,
        reason: 'no_licence',
        message:
          'This computer does not have a valid licence. Connect to the internet and press ' +
          'Refresh.',
      }
    }
    if (licence.active === false) {
      return {
        allowed: false,
        reason: 'deactivated',
        message: 'This account has been deactivated. Contact your provider.',
      }
    }
    // The licence's own date, from the server's clock, also bounds the PC's.
    if (time < Date.parse(licence.issued_at) - CLOCK_SLACK_MS) {
      return {
        allowed: false,
        reason: 'clock',
        message:
          "This computer's date is earlier than when the app was last used. Correct the date " +
          'and time, then press Refresh.',
      }
    }
    if (licence.status === 'cancelled') {
      return {
        allowed: false,
        reason: 'cancelled',
        message: 'Your subscription has been cancelled. Contact your provider to continue.',
      }
    }
    if (!licence.plan_ends_at) {
      return {
        allowed: false,
        reason: 'no_plan',
        message: 'No subscription is active on this account yet. Contact your provider.',
      }
    }
    if (time >= Date.parse(licence.plan_ends_at)) {
      return {
        allowed: false,
        reason: 'expired',
        message:
          `Your subscription expired on ${formatDay(licence.plan_ends_at)}. Renew it to issue ` +
          'and print invoices again.',
      }
    }
    if (time >= Date.parse(licence.valid_until)) {
      return {
        allowed: false,
        reason: 'offline_too_long',
        message:
          'This computer has not been online for 30 days. Connect to the internet to keep ' +
          'issuing invoices.',
      }
    }
    return { allowed: true, reason: '', message: '' }
  }

  function state() {
    const account = read()
    if (!account) return { signedIn: false, license: license() }
    const expires = account.expires_at ? Date.parse(account.expires_at) : null
    return {
      signedIn: true,
      username: account.username,
      serverUrl: account.server_url,
      planName: account.plan_name,
      expiresAt: account.expires_at,
      subscriptionStatus: account.subscription_status || '',
      daysLeft: expires === null ? null : Math.ceil((expires - now().getTime()) / DAY_MS),
      lastSyncAt: account.last_sync_at,
      // Invoice backup: when it last reached the server, and what still waits.
      lastBackupAt: store.getMeta('last_backup_at'),
      backupPending: store.backupPending(),
      license: license(),
    }
  }

  // Brings the server's copy down and sends what waits here: item requests
  // made on this PC go up, the full item list comes back (with the tax
  // fields the provider controls) along with decisions on requests, and the
  // invoice counter is moved up to whatever the server knows has been used.
  // Safe to call at any time; offline it does nothing and requests wait.
  //
  // Invoices made or changed here are backed up in the same call, oldest
  // first, a batch at a time; each stays due until the server confirms it.
  // After signing in, the account's invoice history is downloaded once, so a
  // replacement PC has the invoices made on the old one.
  async function syncData() {
    const account = read()
    if (!account) return { synced: false }
    const token = unprotect(account.token)
    try {
      let batch
      let rounds = 0
      do {
        batch = store.invoicesToBackUp(BACKUP_BATCH)
        const data = await portal.syncData(account.server_url, token, {
          usin_seq: store.getUsinSeq(),
          // Requests to add, change or delete items; an admin decides them.
          requests: store.queuedRequests(),
          invoices: batch.map(({ rev, ...invoice }) => invoice),
        })
        store.applyServerItems(data.items || [])
        store.applyServerRequests(data.requests || [])
        store.raiseUsinSeq(data.usin_seq)
        const saved = new Set(data.invoices_saved || [])
        store.markBackedUp(batch.filter((inv) => saved.has(inv.usin)))
        // Stop when nothing was taken, so a rejected invoice can't loop.
        if (!saved.size) break
        rounds += 1
      } while (batch.length === BACKUP_BATCH && rounds < MAX_BACKUP_ROUNDS)
      store.setMeta('last_backup_at', now().toISOString())
      // Re-read: license() may have advanced the clock mark meanwhile.
      const current = read()
      if (current && !current.data_synced) write({ ...current, data_synced: true })
    } catch (err) {
      return { synced: false, error: err.message }
    }
    try {
      await restoreHistory(token)
    } catch (err) {
      // Not needed to sell; tried again at the next sync.
      return { synced: true, restoreError: err.message }
    }
    return { synced: true }
  }

  async function restoreHistory(token) {
    const account = read()
    if (!account || account.invoices_restored) return
    let afterId = 0
    do {
      const page = await portal.restoreInvoices(account.server_url, token, afterId)
      store.restoreInvoices(page.invoices || [])
      afterId = page.next_after_id
    } while (afterId)
    const current = read()
    if (current) write({ ...current, invoices_restored: true })
  }

  async function login({ serverUrl, username, password }) {
    const data = await portal.login(serverUrl, String(username).trim().toLowerCase(), password)
    write(absorb({ server_url: serverUrl, token: protect(data.token) }, data))
    await syncData()
    return state()
  }

  // Downloads the latest settings and subscription, then syncs the user's
  // data. Being offline is not an error: the cached values stay in force.
  async function sync() {
    const account = read()
    if (!account) return { ...state(), synced: false }
    try {
      const data = await portal.sync(account.server_url, unprotect(account.token))
      write(absorb(account, data))
      await syncData()
      return { ...state(), synced: true }
    } catch (err) {
      if (err.status === 401) {
        // Password was reset or the login ended: sign out, keep local data.
        write(null)
        return { ...state(), synced: false, syncError: 'You have been signed out. Sign in again.' }
      }
      if (err.status === 403) write({ ...account, active: false })
      return { ...state(), synced: false, syncError: err.message }
    }
  }

  const logout = () => {
    write(null)
    return state()
  }

  function assertLicensed() {
    const check = license()
    if (!check.allowed) throw new Error(check.message)
  }

  // What the live channel needs to connect, while someone is signed in.
  function connection() {
    const account = read()
    return account ? { serverUrl: account.server_url, token: unprotect(account.token) } : null
  }

  return { state, login, sync, syncData, logout, license, assertLicensed, connection }
}
