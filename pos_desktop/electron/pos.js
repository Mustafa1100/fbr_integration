// Sale workflow: validate, store, fiscalize, retry. Kept free of Electron so it
// runs under plain Node in the tests.
import { computeLine, computeTotals, round2 } from '../shared/calc.js'
import * as fbrClient from './fbr.js'

// InvoiceType codes from FBR's fiscal component spec.
const SALE = 1
const CREDIT = 3
const THIRD_SCHEDULE_SALE = 11
const THIRD_SCHEDULE_CREDIT = 12

const pad = (n) => String(n).padStart(2, '0')
// Pakistan Standard Time is UTC+5 all year (no daylight saving).
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000
// Pakistan time in the format the spec's sample uses: 2020-01-01 12:00:00.
// Independent of the PC's own time zone, which may be set wrongly.
export const formatDateTime = (date) => {
  const d = new Date(date.getTime() + PKT_OFFSET_MS)
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  )
}

const clean = (v) => String(v ?? '').trim()

// Calendar arithmetic on 'YYYY-MM-DD' strings (no time zone involved).
const dayToUtc = (day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
const utcToDay = (ms) => new Date(ms).toISOString().slice(0, 10)
const addDays = (day, n) => utcToDay(dayToUtc(day) + n * 86400000)
const daysBetween = (a, b) => Math.round((dayToUtc(b) - dayToUtc(a)) / 86400000)
function addMonths(day, n) {
  const d = new Date(dayToUtc(day))
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  return utcToDay(d.getTime())
}

function validateBuyer(buyer = {}) {
  const name = clean(buyer.name)
  const ntn = clean(buyer.ntn)
  // FBR's field is 13 characters, so the CNIC goes without dashes.
  const cnic = clean(buyer.cnic).replace(/\D/g, '')
  const phone = clean(buyer.phone)
  if (name.length > 150) throw new Error('Buyer name is too long (150 characters at most).')
  if (ntn && ntn.length > 9) throw new Error('Buyer NTN must be 9 characters at most, e.g. 1234567-8.')
  if (cnic && cnic.length !== 13) throw new Error('Buyer CNIC must have 13 digits.')
  if (phone.length > 20) throw new Error('Buyer phone number is too long (20 characters at most).')
  return { buyer_name: name, buyer_ntn: ntn, buyer_cnic: cnic, buyer_phone: phone }
}

function validateLines(lines, settings) {
  if (!Array.isArray(lines) || !lines.length) throw new Error('Add at least one item to the invoice.')
  return lines.map((line, idx) => {
    const label = `Item ${idx + 1}`
    const name = clean(line.item_name)
    const code = clean(line.item_code)
    const pct = clean(line.pct_code) || clean(settings.default_pct_code)
    const quantity = Number(line.quantity)
    const price = Number(line.unit_price)
    const rate = Number(line.tax_rate)
    if (!name) throw new Error(`${label}: name is required.`)
    if (name.length > 150) throw new Error(`${label}: name is too long (150 characters at most).`)
    if (!code || code.length > 50) throw new Error(`${label}: item code is required (50 characters at most).`)
    if (!pct) throw new Error(`${label} (${name}): PCT code is required. Set it on the item or as a default in Settings.`)
    if (pct.length > 8) throw new Error(`${label} (${name}): PCT code must be 8 characters at most.`)
    if (!(quantity > 0)) throw new Error(`${label} (${name}): quantity must be more than zero.`)
    if (!(price >= 0)) throw new Error(`${label} (${name}): price cannot be negative.`)
    const discount = Number(line.discount || 0)
    if (!(discount >= 0)) throw new Error(`${label} (${name}): discount cannot be negative.`)
    if (discount > round2(price * quantity)) {
      throw new Error(`${label} (${name}): discount cannot be more than the line amount (Rs ${round2(price * quantity)}).`)
    }
    if (!(rate >= 0 && rate <= 100)) throw new Error(`${label} (${name}): tax rate must be between 0 and 100.`)
    return {
      item_code: code,
      item_name: name,
      pct_code: pct,
      invoice_type: line.third_schedule ? THIRD_SCHEDULE_SALE : SALE,
      ...computeLine(line, settings.prices_include_tax),
    }
  })
}

// Every line must be an approved item. Its name, PCT code, tax rate, 3rd
// Schedule flag and PRICE are taken from the approved item, never from the
// screen; only the quantity and a discount come from the sale.
function fromCatalog(lines, findItem) {
  if (!Array.isArray(lines)) return lines
  return lines.map((line) => {
    const item = findItem(clean(line.item_code))
    if (!item) {
      throw new Error(
        `"${clean(line.item_name) || clean(line.item_code)}" is not one of your approved items. ` +
          'Remove it from the sale, or request it on the Items page.'
      )
    }
    return {
      ...line,
      item_code: item.code,
      item_name: item.name,
      pct_code: item.pct_code,
      tax_rate: item.tax_rate,
      third_schedule: !!item.third_schedule,
      unit_price: item.price,
    }
  })
}

// `assertLicensed` throws when the subscription does not allow new invoices
// (see account.js). Invoices already made keep being sent to FBR regardless:
// those sales happened and still have to be reported.
// `findItem(code)` returns the approved item with that code, or null; when
// given, a sale may only contain approved items (see fromCatalog).
export function createPos({
  store,
  fbr = fbrClient,
  now = () => new Date(),
  assertLicensed = () => {},
  findItem = null,
}) {
  const inFlight = new Set()

  async function submit(id) {
    if (inFlight.has(id)) return store.getInvoice(id)
    const invoice = store.getInvoice(id)
    if (!invoice) throw new Error('Invoice not found.')
    if (invoice.status === 'fiscalized') return invoice

    const settings = store.getSettings()
    const demo = settings.mode !== 'fbr'
    const attempts = invoice.attempts + 1
    if (!demo && !/^\d+$/.test(clean(settings.pos_id))) {
      store.updateInvoice(id, {
        status: 'failed',
        attempts,
        last_error: 'POS ID is not set. Enter the POS registration number in Settings, then retry.',
      })
      return store.getInvoice(id)
    }

    inFlight.add(id)
    try {
      const payload = fbr.buildPayload(invoice, demo ? 0 : clean(settings.pos_id))
      const result = demo
        ? fbr.mockSubmit(payload)
        : await fbr.submitInvoice(payload, { serviceUrl: settings.service_url })
      if (result.accepted) {
        store.updateInvoice(id, {
          status: 'fiscalized',
          fbr_invoice_number: result.invoiceNumber,
          fbr_code: result.code,
          fbr_response: result.raw,
          fiscalized_at: formatDateTime(now()),
          pos_id: demo ? '' : clean(settings.pos_id),
          mode: demo ? 'demo' : 'fbr',
          environment: demo ? '' : settings.environment,
          attempts,
          last_error: '',
        })
      } else {
        store.updateInvoice(id, {
          status: 'failed',
          fbr_code: result.code,
          fbr_response: result.raw,
          attempts,
          last_error: result.message,
        })
      }
    } catch (err) {
      // Never connected: queue it, the retry timer sends it again. Possibly
      // received: hold it as unconfirmed, because FBR's component registers a
      // repeated USIN twice and only a person can decide to resend.
      let status = 'failed'
      if (err instanceof fbr.TransportError) status = err.ambiguous ? 'unconfirmed' : 'queued'
      store.updateInvoice(id, { status, attempts, last_error: err.message || String(err) })
    } finally {
      inFlight.delete(id)
    }
    return store.getInvoice(id)
  }

  async function createSale(input = {}) {
    assertLicensed()
    const settings = store.getSettings()
    const paymentMode = Number(input.payment_mode)
    if (!(paymentMode >= 1 && paymentMode <= 6)) throw new Error('Choose a payment mode.')
    const lines = findItem ? fromCatalog(input.lines, findItem) : input.lines
    const items = validateLines(lines, settings)
    const id = store.insertInvoice(
      {
        invoice_type: SALE,
        created_at: formatDateTime(now()),
        payment_mode: paymentMode,
        status: 'queued',
        ...validateBuyer(input.buyer),
        ...computeTotals(items),
      },
      items
    )
    return submit(id)
  }

  // Full return of a fiscalized sale, reported to FBR as a credit invoice that
  // references the original USIN.
  async function createReturn(id) {
    assertLicensed()
    const original = store.getInvoice(id)
    if (!original) throw new Error('Invoice not found.')
    if (original.invoice_type !== SALE) throw new Error('Only a sale can be returned.')
    if (original.status !== 'fiscalized') {
      throw new Error('Only an invoice that FBR has accepted can be returned.')
    }
    const mode = store.getSettings().mode === 'fbr' ? 'fbr' : 'demo'
    if (original.mode !== mode) {
      throw new Error(
        original.mode === 'demo'
          ? 'This is a demo invoice that FBR never received, so it cannot be returned to FBR.'
          : 'Switch back to FBR mode in Settings to return this invoice.'
      )
    }
    if (store.findReturn(original.usin)) throw new Error('This invoice has already been returned.')

    const items = original.items.map((it) => ({
      ...it,
      invoice_type: it.invoice_type === THIRD_SCHEDULE_SALE ? THIRD_SCHEDULE_CREDIT : CREDIT,
    }))
    const returnId = store.insertInvoice(
      {
        invoice_type: CREDIT,
        ref_usin: original.usin,
        created_at: formatDateTime(now()),
        payment_mode: original.payment_mode,
        status: 'queued',
        buyer_name: original.buyer_name,
        buyer_ntn: original.buyer_ntn,
        buyer_cnic: original.buyer_cnic,
        buyer_phone: original.buyer_phone,
        ...computeTotals(items),
      },
      items
    )
    return submit(returnId)
  }

  // Sends every queued invoice again, oldest first. Returns how many changed.
  async function retryQueued() {
    let changed = 0
    for (const id of store.queuedIds()) {
      const invoice = await submit(id)
      if (invoice.status !== 'queued') changed += 1
    }
    return changed
  }

  const todayStats = () => store.dayStats(formatDateTime(now()).slice(0, 10))

  // Figures and chart series for the Dashboard, for one of DASHBOARD_RANGES,
  // all in Pakistan time. Every hour/day/month of the range is listed, with
  // zeros where nothing was sold, so the trend has no gaps.
  function dashboard(range = '30d') {
    const today = formatDateTime(now()).slice(0, 10)
    const nowHour = Number(formatDateTime(now()).slice(11, 13))
    const allTime = store.dashboard({ from: today, to: today }).allTime
    let from
    let unit
    if (range === 'today') {
      from = today
      unit = 'hour'
    } else if (range === '12m') {
      from = `${addMonths(today, -11).slice(0, 7)}-01`
      unit = 'month'
    } else if (range === 'all') {
      from = allTime.first_day || today
      unit = daysBetween(from, today) > 92 ? 'month' : 'day'
    } else {
      const days = { '7d': 7, '30d': 30, '90d': 90 }[range] || 30
      from = addDays(today, -(days - 1))
      unit = 'day'
    }
    const bucket = { hour: 13, day: 10, month: 7 }[unit]
    const data = store.dashboard({ from: range === 'all' ? null : from, to: today, bucket })
    const found = new Map(data.trend.map((row) => [row.bucket, row]))
    const keys = []
    if (unit === 'hour') {
      for (let h = 0; h <= nowHour; h += 1) keys.push(`${today} ${String(h).padStart(2, '0')}`)
    } else if (unit === 'day') {
      for (let d = from; d <= today; d = addDays(d, 1)) keys.push(d)
    } else {
      for (let m = from.slice(0, 7); m <= today.slice(0, 7); m = addMonths(`${m}-01`, 1).slice(0, 7)) keys.push(m)
    }
    const trend = keys.map((key) => ({
      key,
      sales: 0,
      sales_bill: 0,
      returns_bill: 0,
      net: 0,
      ...found.get(key),
    }))
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      sales: data.hours.find((h) => h.hour === hour)?.sales || 0,
    }))
    return { range, unit, from, to: today, ...data, trend, hours }
  }

  return { createSale, createReturn, submit, retryQueued, todayStats, dashboard }
}
