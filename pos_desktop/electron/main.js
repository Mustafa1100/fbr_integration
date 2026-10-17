import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, safeStorage, shell } from 'electron'
import { createAccount } from './account.js'
import { serverConfig } from './config.js'
import { dataDir } from './dataDir.js'
import { LOCAL_SETTING_KEYS, openStore } from './db.js'
import * as fbr from './fbr.js'
import { verifyLicence } from './licence.js'
import { createLiveChannel } from './live.js'
import { createPos } from './pos.js'

const RETRY_INTERVAL_MS = 60_000
// Changes made in the portal arrive at once over the live connection (see
// live.js). This scheduled licence check is only the standard backstop, for
// a PC that stays open for days with a connection that keeps dropping.
const LICENCE_CHECK_MS = 6 * 60 * 60_000
const devServerUrl = process.env.VITE_DEV_SERVER_URL
// The installed app always uses the production server and key it was built
// with; a run from source uses the development ones (see config.js).
const { portalUrl, licencePublicKey } = serverConfig({ packaged: app.isPackaged, env: process.env })
// Production and development keep separate databases (see dataDir.js). Set
// before anything uses the folder, including the single-instance lock. An
// explicit --user-data-dir (tests, support) wins.
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath(
    'userData',
    dataDir({
      appData: app.getPath('appData'),
      appName: app.getName(),
      production: app.isPackaged || process.env.POS_USE_PRODUCTION === '1',
    })
  )
}

let win = null
let store = null
let pos = null
let account = null
let live = null

// The portal token is kept encrypted with the Windows user's key (DPAPI).
const protect = (text) =>
  safeStorage.isEncryptionAvailable()
    ? `enc:${safeStorage.encryptString(text).toString('base64')}`
    : `raw:${text}`
const unprotect = (stored) =>
  stored.startsWith('enc:')
    ? safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    : stored.slice(4)

// Every handler answers { ok, data } or { ok, error } so the renderer gets the
// plain message instead of Electron's "Error invoking remote method" wrapper.
function handle(channel, fn) {
  ipcMain.handle(`pos:${channel}`, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      return { ok: false, error: err.message || String(err) }
    }
  })
}

const notifyChanged = () => win?.webContents.send('pos:changed')

// What the user may ask for on an item. The tax rate and PCT code are only a
// suggestion: the provider confirms or changes them when approving.
function validateItem(item = {}) {
  const code = String(item.code ?? '').trim()
  const name = String(item.name ?? '').trim()
  const price = Number(item.price)
  const pct = String(item.pct_code ?? '').trim()
  const rate = Number(item.tax_rate)
  if (!code || code.length > 50) throw new Error('Item code is required (50 characters at most).')
  if (!name || name.length > 150) throw new Error('Item name is required (150 characters at most).')
  if (!(price >= 0)) throw new Error('Price cannot be negative.')
  if (!pct) throw new Error('PCT code is required.')
  if (pct.length > 8) throw new Error('PCT code must be 8 characters at most.')
  if (!(rate >= 0 && rate <= 100)) throw new Error('Tax rate must be between 0 and 100.')
  return { id: item.id, code, name, price, pct_code: pct, tax_rate: rate }
}

// Sends item requests, the invoice counter and new or changed invoices
// (backup) to the server in the background. Offline it simply fails quietly;
// everything stays marked and goes up later.
const pushData = () => account.syncData().then(notifyChanged).catch(() => {})

// Fetches settings, licence and items. Runs at start-up, when the server
// announces a change, and on the scheduled check. Calls that arrive while one
// is running are folded into a single follow-up run, so a burst of changes
// costs two requests, and nothing announced mid-run is missed.
let syncing = null
let syncAgain = false
function refreshAccount() {
  if (syncing) {
    syncAgain = true
    return syncing
  }
  syncing = account
    .sync()
    .then((state) => {
      notifyChanged()
      if (!state.signedIn) live?.stop()
    })
    .catch(() => {})
    .finally(() => {
      syncing = null
      if (syncAgain) {
        syncAgain = false
        refreshAccount()
      }
    })
  return syncing
}

function registerHandlers() {
  handle('account:state', () => account.state())
  handle('account:login', async ({ username, password } = {}) => {
    const state = await account.login({ serverUrl: portalUrl, username, password })
    notifyChanged()
    live.restart()
    return state
  })
  handle('account:sync', async () => {
    const state = await account.sync()
    notifyChanged()
    return state
  })
  handle('account:logout', () => {
    const state = account.logout()
    live.stop()
    notifyChanged()
    return state
  })

  handle('settings:get', () => store.getSettings())
  // Business and FBR settings come from the portal; only the printing
  // settings can be changed on this PC.
  handle('settings:save', (patch) => {
    const settings = store.saveSettings(patch || {}, LOCAL_SETTING_KEYS)
    notifyChanged()
    return settings
  })
  handle('service:check', (url) => fbr.checkService(url || store.getSettings().service_url))

  handle('items:list', (search) => store.listItems(search || ''))
  // This PC never changes the catalog: adding, changing or deleting an item
  // is a request the provider approves, and the item list only changes when
  // the approved result comes back from the server.
  handle('items:save', (input) => {
    const item = validateItem(input)
    if (!item.id) {
      if (store.findItemByCode(item.code)) {
        throw new Error(`Another item already uses the code "${item.code}".`)
      }
      store.addItemRequest({ ...item, action: 'add' })
    } else {
      const existing = store.getItem(item.id)
      if (!existing) throw new Error('Item not found.')
      const unchanged = ['name', 'price', 'pct_code', 'tax_rate'].every((key) => existing[key] === item[key])
      if (unchanged) throw new Error('Nothing has changed.')
      store.addItemRequest({ ...item, code: existing.code, action: 'edit' })
    }
    pushData()
    return { requested: true }
  })
  handle('items:delete', (id) => {
    const existing = store.getItem(id)
    if (!existing) throw new Error('Item not found.')
    store.addItemRequest({ code: existing.code, action: 'delete' })
    pushData()
    return { requested: true }
  })
  handle('items:requests', () => store.listItemRequests())
  // The Items page's Refresh: items only (uploads changes made here, brings
  // down the server's list). Settings and subscription are left alone.
  handle('items:sync', async () => {
    const result = await account.syncData()
    notifyChanged()
    return result
  })

  // After every new invoice the counter goes to the server straight away, so
  // a replacement PC knows which numbers are taken.
  handle('invoices:create', async (input) => {
    const invoice = await pos.createSale(input)
    pushData()
    return invoice
  })
  handle('invoices:list', (query) => store.listInvoices(query || {}))
  handle('invoices:get', (id) => store.getInvoice(id))
  handle('invoices:retry', async (id) => {
    const invoice = await pos.submit(id)
    pushData()
    return invoice
  })
  handle('invoices:return', async (id) => {
    const invoice = await pos.createReturn(id)
    pushData()
    return invoice
  })
  handle('stats:today', () => pos.todayStats())
  handle('stats:dashboard', (range) => pos.dashboard(range || '30d'))

  handle('printers:list', async () =>
    (await win.webContents.getPrintersAsync()).map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
    }))
  )
  // Prints whatever the renderer's print stylesheet exposes — the receipt.
  handle('print:receipt', () => {
    account.assertLicensed()
    const settings = store.getSettings()
    const options = {
      silent: !!settings.silent_print,
      printBackground: true,
      margins: { marginType: 'none' },
      // Microns. Roll printers ignore the height and cut after the content.
      pageSize: { width: (Number(settings.paper_width) || 80) * 1000, height: 297000 },
    }
    if (settings.printer) options.deviceName = settings.printer
    return new Promise((resolve, reject) => {
      win.webContents.print(options, (success, reason) => {
        if (success) resolve(true)
        else if (!reason || /cancel/i.test(reason)) resolve(false)
        else reject(new Error(`Printing failed: ${reason}`))
      })
    })
  })

  // Saves the receipt on screen as a PDF in the Windows Downloads folder. The
  // page is cut to the receipt's own size, so it is one page with no blank tail.
  handle('receipt:save-pdf', async ({ usin, heightPx } = {}) => {
    account.assertLicensed()
    const settings = store.getSettings()
    const data = await win.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      // Inches. heightPx is the receipt as rendered, at 96 px to the inch.
      pageSize: {
        width: (Number(settings.paper_width) || 80) / 25.4,
        height: Math.max(Number(heightPx) || 0, 200) / 96 + 0.2,
      },
    })
    const folder = app.getPath('downloads')
    const base = `Receipt-${String(usin ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'invoice'}`
    // Never overwrite an earlier copy: Receipt-X.pdf, Receipt-X (1).pdf, …
    let file = path.join(folder, `${base}.pdf`)
    for (let n = 1; fs.existsSync(file); n += 1) file = path.join(folder, `${base} (${n}).pdf`)
    await fs.promises.writeFile(file, data)
    return { file, name: path.basename(file) }
  })
  handle('receipt:reveal', (file) => {
    const target = path.resolve(String(file))
    if (path.dirname(target) !== app.getPath('downloads') || !fs.existsSync(target)) {
      throw new Error('That receipt is no longer in the Downloads folder.')
    }
    shell.showItemInFolder(target)
  })

  handle('app:info', () => ({ version: app.getVersion(), dataFile: store.file }))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f4f6f9',
    // The installed app has no menu at all (see below). In development the
    // default menu stays hidden until Alt is pressed, for the developer tools.
    autoHideMenuBar: true,
    // The installed app takes its icon from the exe; this is for `npm run dev`.
    ...(app.isPackaged ? {} : { icon: path.join(import.meta.dirname, '..', 'build', 'icon.png') }),
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // Used maximized at the counter.
  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })
  win.on('closed', () => {
    win = null
  })
  // The app is a single local page; anything else opens in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  if (devServerUrl) win.loadURL(devServerUrl)
  else win.loadFile(path.join(import.meta.dirname, '..', 'dist', 'index.html'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    const file = path.join(app.getPath('userData'), 'pos.db')
    store = { ...openStore(file), file }
    account = createAccount({
      store,
      protect,
      unprotect,
      verifyLicence: (token) => verifyLicence(token, licencePublicKey),
    })
    pos = createPos({ store, assertLicensed: account.assertLicensed, findItem: store.findItemByCode })
    registerHandlers()
    if (app.isPackaged) Menu.setApplicationMenu(null)
    createWindow()

    // Licence check at start-up, then changes pushed by the server over the
    // live connection, plus the scheduled check. Offline is fine: the signed
    // licence on the PC stays in force until it runs out.
    live = createLiveChannel({ getConnection: () => account.connection(), onChange: refreshAccount })
    refreshAccount()
    if (account.state().signedIn) live.start()
    setInterval(refreshAccount, LICENCE_CHECK_MS)

    // Invoices that could not reach the fiscal service go out again on their own.
    setInterval(async () => {
      try {
        if (await pos.retryQueued()) {
          notifyChanged()
          pushData() // back up the new status
        }
      } catch (err) {
        console.error('[retry]', err)
      }
    }, RETRY_INTERVAL_MS)
  })

  app.on('window-all-closed', () => {
    store?.close()
    app.quit()
  })
}
