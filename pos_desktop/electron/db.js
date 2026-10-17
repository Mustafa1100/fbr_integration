// Local SQLite store — every invoice and FBR reply is kept on the POS computer.
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  pct_code TEXT NOT NULL DEFAULT '',
  third_schedule INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  on_server INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS item_requests (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  action TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  tax_rate REAL,
  pct_code TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  decided_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  usin TEXT NOT NULL UNIQUE,
  ref_usin TEXT NOT NULL DEFAULT '',
  invoice_type INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  buyer_name TEXT NOT NULL DEFAULT '',
  buyer_ntn TEXT NOT NULL DEFAULT '',
  buyer_cnic TEXT NOT NULL DEFAULT '',
  buyer_phone TEXT NOT NULL DEFAULT '',
  payment_mode INTEGER NOT NULL DEFAULT 1,
  total_quantity REAL NOT NULL DEFAULT 0,
  total_sale_value REAL NOT NULL DEFAULT 0,
  total_tax REAL NOT NULL DEFAULT 0,
  total_discount REAL NOT NULL DEFAULT 0,
  total_further_tax REAL NOT NULL DEFAULT 0,
  total_bill REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  fbr_invoice_number TEXT NOT NULL DEFAULT '',
  fbr_code TEXT NOT NULL DEFAULT '',
  fbr_response TEXT NOT NULL DEFAULT '',
  fiscalized_at TEXT NOT NULL DEFAULT '',
  pos_id TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  pct_code TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  tax_rate REAL NOT NULL,
  sale_value REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  further_tax REAL NOT NULL DEFAULT 0,
  tax_charged REAL NOT NULL,
  total_amount REAL NOT NULL,
  invoice_type INTEGER NOT NULL DEFAULT 1
);
`

// The business profile. Nothing here is specific to one kind of business: a
// clinic, a shop and a restaurant differ only in these values and the catalog.
// Everything down to default_pct_code is managed in the admin portal and
// downloaded (see account.js); only the printing settings are set on this PC.
export const DEFAULT_SETTINGS = {
  business_name: '',
  ntn: '',
  strn: '',
  address: '',
  phone: '',
  // demo: nothing is sent anywhere. fbr: invoices go to the fiscal component.
  mode: 'demo',
  // test | live — which fiscal component (and POS ID) is installed on this PC.
  environment: 'test',
  pos_id: '',
  service_url: 'http://localhost:8524',
  usin_prefix: '',
  prices_include_tax: false,
  default_tax_rate: 0,
  default_pct_code: '',
  printer: '',
  silent_print: false,
  paper_width: 80,
  receipt_footer: 'Thank you',
}
export const LOCAL_SETTING_KEYS = ['printer', 'silent_print', 'paper_width', 'receipt_footer']
export const PORTAL_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter(
  (key) => !LOCAL_SETTING_KEYS.includes(key)
)

const INVOICE_COLUMNS = [
  'usin', 'ref_usin', 'invoice_type', 'created_at', 'buyer_name', 'buyer_ntn', 'buyer_cnic',
  'buyer_phone', 'payment_mode', 'total_quantity', 'total_sale_value', 'total_tax',
  'total_discount', 'total_further_tax', 'total_bill', 'status', 'fbr_invoice_number',
  'fbr_code', 'fbr_response', 'fiscalized_at', 'pos_id', 'mode', 'environment', 'attempts',
  'last_error',
]
const ITEM_COLUMNS = [
  'item_code', 'item_name', 'pct_code', 'quantity', 'unit_price', 'tax_rate', 'sale_value',
  'discount', 'further_tax', 'tax_charged', 'total_amount', 'invoice_type',
]
const TEXT_ITEM_COLUMNS = ['item_code', 'item_name', 'pct_code']

export function openStore(file) {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)

  // Databases from before items were synced to the server: add the tracking
  // columns, and mark every existing item for upload so none is left behind.
  const itemColumns = db.prepare('PRAGMA table_info(items)').all().map((c) => c.name)
  if (!itemColumns.includes('dirty')) {
    db.exec(`
      ALTER TABLE items ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE items ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
      UPDATE items SET dirty = 1;
      INSERT INTO settings (key, value) VALUES ('meta:item_rev', '1') ON CONFLICT(key) DO NOTHING;
    `)
  }
  // Databases from before item changes needed approval: an item that had
  // already been uploaded is one the server knows.
  if (!db.prepare('PRAGMA table_info(items)').all().some((c) => c.name === 'on_server')) {
    db.exec(`
      ALTER TABLE items ADD COLUMN on_server INTEGER NOT NULL DEFAULT 0;
      UPDATE items SET on_server = CASE WHEN dirty = 0 THEN 1 ELSE 0 END;
    `)
  }
  // Invoice backup to the server. rev goes up on every change; an invoice
  // waits for backup while rev > backed_up_rev. Databases from before backup
  // existed get rev 1 / backed_up_rev 0, so their whole history goes up.
  // restored: downloaded from the server (made on another computer).
  const invoiceColumns = db.prepare('PRAGMA table_info(invoices)').all().map((c) => c.name)
  if (!invoiceColumns.includes('rev')) {
    db.exec(`
      ALTER TABLE invoices ADD COLUMN rev INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE invoices ADD COLUMN backed_up_rev INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE invoices ADD COLUMN restored INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_invoices_backup ON invoices(backed_up_rev, rev);
    `)
  }
  // Requests from before the tax rate and PCT code could be suggested.
  const requestColumns = db.prepare('PRAGMA table_info(item_requests)').all().map((c) => c.name)
  if (!requestColumns.includes('pct_code')) {
    db.exec('ALTER TABLE item_requests ADD COLUMN tax_rate REAL; ALTER TABLE item_requests ADD COLUMN pct_code TEXT;')
  }
  // Items typed in here before adding one needed approval, and not uploaded
  // yet: each becomes an add request, so nothing that was entered is lost.
  const unsent = db.prepare('SELECT code, name, price FROM items WHERE on_server = 0').all()
  if (unsent.length) {
    const now = new Date().toISOString()
    const insert = db.prepare(
      "INSERT INTO item_requests (uid, code, action, name, price, created_at) VALUES (?, ?, 'add', ?, ?, ?)"
    )
    for (const item of unsent) insert.run(randomUUID(), item.code, item.name, item.price, now)
    db.prepare('DELETE FROM items WHERE on_server = 0').run()
  }

  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      db.exec('COMMIT')
      return result
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  const readSetting = (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? JSON.parse(row.value) : undefined
  }
  const writeSetting = (key, value) =>
    db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, JSON.stringify(value))

  function getSettings() {
    const settings = { ...DEFAULT_SETTINGS }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const stored = readSetting(key)
      if (stored !== undefined) settings[key] = stored
    }
    return settings
  }

  function saveSettings(patch, keys = Object.keys(DEFAULT_SETTINGS)) {
    transaction(() => {
      for (const key of keys) {
        if (patch[key] !== undefined) writeSetting(key, patch[key])
      }
    })
    return getSettings()
  }

  // App state that is not a setting (the signed-in account). Namespaced so it
  // can never collide with a settings key.
  const getMeta = (key) => readSetting(`meta:${key}`) ?? null
  function setMeta(key, value) {
    if (value === null) db.prepare('DELETE FROM settings WHERE key = ?').run(`meta:${key}`)
    else writeSetting(`meta:${key}`, value)
  }

  // ── Items ──────────────────────────────────────────────────────────────
  // A copy of the catalog on the server. This PC never changes it: adding,
  // changing or deleting an item is a request (item_requests below) that an
  // admin approves, and the result arrives with the next sync.

  function listItems(search = '') {
    const like = `%${search.trim()}%`
    return db
      .prepare(
        'SELECT * FROM items WHERE deleted = 0 AND (name LIKE ? OR code LIKE ?) ' +
          'ORDER BY name COLLATE NOCASE'
      )
      .all(like, like)
  }

  const getItem = (id) => db.prepare('SELECT * FROM items WHERE id = ?').get(id) || null
  const findItemByCode = (code) =>
    db.prepare('SELECT * FROM items WHERE code = ? AND deleted = 0').get(code) || null

  // Replaces the catalog with the server's list after a sync.
  function applyServerItems(serverItems) {
    transaction(() => {
      const onServer = new Set()
      for (const item of serverItems) {
        onServer.add(item.code)
        const values = [
          item.name, item.price, item.tax_rate, item.pct_code, item.third_schedule ? 1 : 0,
        ]
        const local = db.prepare('SELECT id FROM items WHERE code = ?').get(item.code)
        if (local) {
          db.prepare(
            'UPDATE items SET name = ?, price = ?, tax_rate = ?, pct_code = ?, ' +
              'third_schedule = ?, deleted = 0, dirty = 0, on_server = 1 WHERE id = ?'
          ).run(...values, local.id)
        } else {
          db.prepare(
            'INSERT INTO items (name, price, tax_rate, pct_code, third_schedule, code, on_server) ' +
              'VALUES (?, ?, ?, ?, ?, ?, 1)'
          ).run(...values, item.code)
        }
      }
      for (const row of db.prepare('SELECT id, code FROM items').all()) {
        if (!onServer.has(row.code)) db.prepare('DELETE FROM items WHERE id = ?').run(row.id)
      }
    })
  }
  // ── Requests to add, change or delete an item ─────────────────────────
  // status: queued (not sent yet) -> pending -> approved | rejected, or
  // withdrawn when a newer request for the same item replaces it.

  // Inside a transaction already (see addItemRequest for the public one).
  // tax_rate and pct_code are only the user's suggestion; the provider decides.
  function insertRequest({ code, action, name = '', price = 0, tax_rate = null, pct_code = null }) {
    // Only the latest request for an item counts. One not sent yet is
    // dropped here; one already sent is withdrawn by the server.
    db.prepare(
      "UPDATE item_requests SET status = 'withdrawn' WHERE code = ? AND status = 'queued'"
    ).run(code)
    const uid = randomUUID()
    db.prepare(
      'INSERT INTO item_requests (uid, code, action, name, price, tax_rate, pct_code, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(uid, code, action, name, price, tax_rate, pct_code, new Date().toISOString())
    return uid
  }

  const addItemRequest = (request) => transaction(() => insertRequest(request))

  const queuedRequests = () =>
    db
      .prepare(
        "SELECT uid, code, action, name, price, tax_rate, pct_code FROM item_requests WHERE status = 'queued' ORDER BY id"
      )
      .all()

  // Takes the server's word on every request it reports, including ones made
  // on another computer of the same account.
  function applyServerRequests(requests) {
    transaction(() => {
      for (const r of requests) {
        const known = db.prepare('SELECT id FROM item_requests WHERE uid = ?').get(r.uid)
        if (known) {
          db.prepare(
            'UPDATE item_requests SET status = ?, admin_note = ?, decided_at = ? WHERE id = ?'
          ).run(r.status, r.admin_note || '', r.decided_at || '', known.id)
        } else {
          db.prepare(
            'INSERT INTO item_requests (uid, code, action, name, price, tax_rate, pct_code, status, admin_note, created_at, decided_at) ' +
              'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(
            r.uid, r.code, r.action, r.name || '', r.price || 0, r.proposed_tax_rate ?? null,
            r.proposed_pct_code ?? null, r.status, r.admin_note || '', r.created_at || '', r.decided_at || ''
          )
        }
      }
    })
  }

  const listItemRequests = (limit = 20) =>
    db
      .prepare("SELECT * FROM item_requests WHERE status != 'withdrawn' ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(limit)

  // ── Invoice counter ────────────────────────────────────────────────────
  const getUsinSeq = () => readSetting('usin_seq') || 0
  // Only ever forward: a replacement PC continues after the numbers the
  // server knows were used, so none is reported to FBR twice.
  function raiseUsinSeq(seq) {
    if (Number(seq) > getUsinSeq()) writeSetting('usin_seq', Number(seq))
  }

  // Reserves the next USIN and stores the invoice in one transaction, so a
  // number is never handed out twice or lost to a half-written invoice.
  function insertInvoice(invoice, items) {
    return transaction(() => {
      const seq = (readSetting('usin_seq') || 0) + 1
      writeSetting('usin_seq', seq)
      const row = {
        ...invoice,
        usin: `${readSetting('usin_prefix') || ''}${String(seq).padStart(6, '0')}`,
      }
      const cols = INVOICE_COLUMNS.filter((c) => row[c] !== undefined)
      const info = db
        .prepare(
          `INSERT INTO invoices (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
        )
        .run(...cols.map((c) => row[c]))
      const id = Number(info.lastInsertRowid)
      const insertItem = db.prepare(
        `INSERT INTO invoice_items (invoice_id, ${ITEM_COLUMNS.join(', ')}) ` +
          `VALUES (?, ${ITEM_COLUMNS.map(() => '?').join(', ')})`
      )
      for (const it of items) insertItem.run(id, ...ITEM_COLUMNS.map((c) => it[c]))
      return id
    })
  }

  // Every change makes the invoice due for backup again.
  function updateInvoice(id, fields) {
    const cols = INVOICE_COLUMNS.filter((c) => fields[c] !== undefined)
    if (!cols.length) return
    db.prepare(
      `UPDATE invoices SET ${cols.map((c) => `${c} = ?`).join(', ')}, rev = rev + 1 WHERE id = ?`
    ).run(...cols.map((c) => fields[c]), id)
  }

  // ── Backup to the server ───────────────────────────────────────────────
  const itemsOf = (id) =>
    db.prepare(`SELECT ${ITEM_COLUMNS.join(', ')} FROM invoice_items WHERE invoice_id = ? ORDER BY id`).all(id)

  // The oldest invoices not yet backed up in their current state, ready to
  // upload: the invoice fields, its lines, and the rev being sent.
  function invoicesToBackUp(limit = 200) {
    return db
      .prepare(`SELECT id, rev, ${INVOICE_COLUMNS.join(', ')} FROM invoices WHERE rev > backed_up_rev ORDER BY id LIMIT ?`)
      .all(limit)
      .map(({ id, ...invoice }) => ({ ...invoice, items: itemsOf(id) }))
  }

  // The server saved these. An invoice changed again while the upload was
  // on its way has a higher rev, so it stays due.
  function markBackedUp(sent) {
    transaction(() => {
      const mark = db.prepare('UPDATE invoices SET backed_up_rev = MAX(backed_up_rev, ?) WHERE usin = ?')
      for (const { usin, rev } of sent) mark.run(rev, usin)
    })
  }

  const backupPending = () =>
    db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE rev > backed_up_rev').get().n

  // History downloaded from the server on a new or replacement computer.
  // Invoices already here are left alone. One the other computer had not
  // got a fiscal number for is never sent from here on its own: it may have
  // reached FBR from there, so a person checks first (Send again).
  function restoreInvoices(invoices) {
    let added = 0
    transaction(() => {
      const exists = db.prepare('SELECT 1 FROM invoices WHERE usin = ?')
      const insertItem = db.prepare(
        `INSERT INTO invoice_items (invoice_id, ${ITEM_COLUMNS.join(', ')}) ` +
          `VALUES (?, ${ITEM_COLUMNS.map(() => '?').join(', ')})`
      )
      for (const invoice of invoices) {
        if (exists.get(invoice.usin)) continue
        const row = { ...invoice }
        if (row.status === 'queued') {
          row.status = 'unconfirmed'
          row.last_error =
            'Made on another computer and not confirmed by FBR there. Check it in FBR before sending it again.'
        }
        const cols = INVOICE_COLUMNS.filter((c) => row[c] !== undefined && row[c] !== null)
        const info = db
          .prepare(
            `INSERT INTO invoices (${cols.join(', ')}, rev, backed_up_rev, restored) ` +
              `VALUES (${cols.map(() => '?').join(', ')}, 1, 1, 1)`
          )
          .run(...cols.map((c) => row[c]))
        const id = Number(info.lastInsertRowid)
        for (const it of invoice.items || []) {
          insertItem.run(id, ...ITEM_COLUMNS.map((c) => it[c] ?? (TEXT_ITEM_COLUMNS.includes(c) ? '' : 0)))
        }
        added += 1
      }
    })
    return added
  }

  function getInvoice(id) {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id)
    if (!invoice) return null
    const items = db
      .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id')
      .all(id)
    return { ...invoice, items }
  }

  function listInvoices({ status = '', search = '', limit = 50, offset = 0 } = {}) {
    const where = []
    const params = []
    if (status) {
      where.push('status = ?')
      params.push(status)
    }
    if (search.trim()) {
      where.push('(usin LIKE ? OR fbr_invoice_number LIKE ? OR buyer_name LIKE ?)')
      const like = `%${search.trim()}%`
      params.push(like, like, like)
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = db.prepare(`SELECT COUNT(*) AS n FROM invoices ${clause}`).get(...params).n
    const rows = db
      .prepare(`SELECT * FROM invoices ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset)
    return { rows, total }
  }

  const queuedIds = () =>
    db.prepare("SELECT id FROM invoices WHERE status = 'queued' ORDER BY id").all().map((r) => r.id)

  // A return that FBR rejected doesn't count — the sale can be returned again.
  const findReturn = (usin) =>
    db.prepare("SELECT id FROM invoices WHERE ref_usin = ? AND status != 'failed'").get(usin)

  // Sales count positive and credit notes negative, so the day nets out.
  function dayStats(day) {
    const like = `${day}%`
    const totals = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN invoice_type = 3 THEN 0 ELSE 1 END), 0) AS sales,
           COALESCE(SUM(CASE WHEN invoice_type = 3 THEN 1 ELSE 0 END), 0) AS returns,
           COALESCE(SUM(CASE WHEN invoice_type = 3 THEN 0 ELSE total_bill END), 0) AS sales_bill,
           COALESCE(SUM(CASE WHEN invoice_type = 3 THEN total_bill ELSE 0 END), 0) AS returns_bill,
           COALESCE(SUM(CASE WHEN invoice_type = 3 THEN -total_bill ELSE total_bill END), 0) AS total_bill,
           COALESCE(SUM(CASE WHEN invoice_type = 3 THEN -total_tax ELSE total_tax END), 0) AS total_tax
         FROM invoices WHERE status = 'fiscalized' AND created_at LIKE ?`
      )
      .get(like)
    const count = (status) =>
      db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE status = ?').get(status).n
    return {
      ...totals,
      queued: count('queued'),
      failed: count('failed'),
      unconfirmed: count('unconfirmed'),
    }
  }

  // ── Dashboard ──────────────────────────────────────────────────────────
  // Accepted invoices only (what FBR has a number for); returns count
  // negative. Invoice times are Pakistan time text, so a day is a prefix.
  // from/to: 'YYYY-MM-DD' inclusive, or null for all time. bucket: the
  // created_at prefix length to group the trend by (13 hour, 10 day, 7 month).
  function dashboard({ from = null, to = null, bucket = 10 } = {}) {
    const where = ["i.status = 'fiscalized'"]
    const params = []
    if (from) {
      where.push('i.created_at >= ?')
      params.push(`${from} 00:00:00`)
    }
    if (to) {
      where.push('i.created_at <= ?')
      params.push(`${to} 23:59:59`)
    }
    const clause = `WHERE ${where.join(' AND ')}`
    const sign = 'CASE WHEN i.invoice_type = 3 THEN -1 ELSE 1 END'
    const totals = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN i.invoice_type = 3 THEN 0 ELSE 1 END), 0) AS sales,
           COALESCE(SUM(CASE WHEN i.invoice_type = 3 THEN 1 ELSE 0 END), 0) AS returns,
           COALESCE(SUM(CASE WHEN i.invoice_type = 3 THEN 0 ELSE i.total_bill END), 0) AS sales_bill,
           COALESCE(SUM(CASE WHEN i.invoice_type = 3 THEN i.total_bill ELSE 0 END), 0) AS returns_bill,
           COALESCE(SUM(${sign} * i.total_bill), 0) AS net,
           COALESCE(SUM(${sign} * i.total_tax), 0) AS tax
         FROM invoices i ${clause}`
      )
      .get(...params)
    const trend = db
      .prepare(
        `SELECT substr(i.created_at, 1, ${Number(bucket)}) AS bucket,
           SUM(CASE WHEN i.invoice_type = 3 THEN 0 ELSE 1 END) AS sales,
           SUM(CASE WHEN i.invoice_type = 3 THEN 0 ELSE i.total_bill END) AS sales_bill,
           SUM(CASE WHEN i.invoice_type = 3 THEN i.total_bill ELSE 0 END) AS returns_bill,
           SUM(${sign} * i.total_bill) AS net
         FROM invoices i ${clause} GROUP BY bucket ORDER BY bucket`
      )
      .all(...params)
    const topItems = db
      .prepare(
        `SELECT it.item_code AS code, MAX(it.item_name) AS name,
           SUM(${sign} * it.quantity) AS quantity, SUM(${sign} * it.total_amount) AS amount
         FROM invoice_items it JOIN invoices i ON i.id = it.invoice_id ${clause}
         GROUP BY it.item_code HAVING amount > 0 ORDER BY amount DESC LIMIT 6`
      )
      .all(...params)
    const hours = db
      .prepare(
        `SELECT CAST(substr(i.created_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS sales
         FROM invoices i ${clause} AND i.invoice_type != 3 GROUP BY hour`
      )
      .all(...params)
    const allTime = db
      .prepare(
        `SELECT COALESCE(SUM(${sign} * i.total_bill), 0) AS net, COUNT(*) AS invoices,
           MIN(substr(i.created_at, 1, 10)) AS first_day
         FROM invoices i WHERE i.status = 'fiscalized'`
      )
      .get()
    return { totals, trend, topItems, hours, allTime }
  }

  return {
    dashboard,
    getSettings, saveSettings, getMeta, setMeta, listItems, getItem, findItemByCode,
    applyServerItems, addItemRequest, queuedRequests, applyServerRequests,
    listItemRequests, getUsinSeq, raiseUsinSeq, insertInvoice, updateInvoice,
    getInvoice, listInvoices, queuedIds, findReturn, dayStats,
    invoicesToBackUp, markBackedUp, backupPending, restoreInvoices,
    close: () => db.close(),
  }
}
