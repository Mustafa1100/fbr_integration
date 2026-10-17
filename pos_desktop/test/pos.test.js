import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { openStore } from '../electron/db.js'
import { parseResponse } from '../electron/fbr.js'
import { createPos } from '../electron/pos.js'
import { computeLine, computeTotals } from '../shared/calc.js'

// Stand-in for the FBR fiscal component. `reply` decides what each POST gets.
let server
let serviceUrl
let received = []
let reply = () => ({ status: 200, body: {} })

before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      if (req.method === 'GET') {
        res.end('["Service is responding"]')
        return
      }
      const payload = JSON.parse(raw)
      received.push(payload)
      const { status, body, drop } = reply(payload)
      if (drop) {
        req.socket.destroy()
        return
      }
      res.statusCode = status
      res.end(typeof body === 'string' ? body : JSON.stringify(body))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  serviceUrl = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

// Reply shapes below are copied from the real sandbox component.
const accept = (n = '822992FJGO42433293*test*') => () => ({
  status: 200,
  body: { InvoiceNumber: n, Code: '100', Response: 'Fiscal Invoice Number generated successfully.', Errors: null },
})
const reject = (errors) => () => ({
  status: 200,
  body: { InvoiceNumber: 'Not Available', Code: '402', Response: 'Model validation failed.', Errors: errors },
})

// A port nothing listens on, so the connection is refused outright.
async function closedPortUrl() {
  const probe = http.createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address()
  await new Promise((resolve) => probe.close(resolve))
  return `http://127.0.0.1:${port}`
}

let store
let pos
beforeEach(() => {
  received = []
  reply = accept()
  store = openStore(':memory:')
  store.saveSettings({ mode: 'fbr', pos_id: '110014', service_url: serviceUrl, usin_prefix: 'T' })
  pos = createPos({ store, now: () => new Date('2026-10-13T07:00:00Z') }) // 12:00 in Pakistan
})

const sale = (overrides = {}) => ({
  payment_mode: 1,
  lines: [
    { item_code: 'CONS', item_name: 'Consultation', pct_code: '98151000', tax_rate: 0, quantity: 1, unit_price: 2000 },
  ],
  ...overrides,
})

test('only approved items can be sold, with their approved tax details', async () => {
  store.applyServerItems([
    { code: 'CONS', name: 'Consultation', price: 2000, tax_rate: 5, pct_code: '98151000', third_schedule: false },
  ])
  const strict = createPos({ store, now: () => new Date('2026-10-13T07:00:00Z'), findItem: store.findItemByCode })

  // Not an approved item (e.g. typed in): refused, nothing stored or sent.
  await assert.rejects(
    strict.createSale(sale({ lines: [{ item_code: 'MISC', item_name: 'Anything', pct_code: '00000000', tax_rate: 0, quantity: 1, unit_price: 50 }] })),
    /not one of your approved items/
  )
  assert.equal(store.listInvoices().total, 0)
  assert.equal(received.length, 0)

  // Tax details sent from the screen are ignored in favour of the approved ones.
  const invoice = await strict.createSale(sale({
    lines: [{ item_code: 'CONS', item_name: 'Renamed', pct_code: '11111111', tax_rate: 0, quantity: 2, unit_price: 1500 }],
  }))
  const [line] = invoice.items
  assert.equal(line.item_name, 'Consultation')
  assert.equal(line.pct_code, '98151000')
  assert.equal(line.tax_rate, 5)
  // The price is always the approved one; only the quantity is the sale's own.
  assert.equal(line.quantity, 2)
  assert.equal(line.unit_price, 2000)
  assert.equal(received[0].Items[0].PCTCode, '98151000')
})

test('the counter can give a discount, but never more than the line is worth', async () => {
  store.applyServerItems([
    { code: 'CONS', name: 'Consultation', price: 2000, tax_rate: 0, pct_code: '98151000', third_schedule: false },
  ])
  const strict = createPos({ store, now: () => new Date('2026-10-13T07:00:00Z'), findItem: store.findItemByCode })
  const line = (overrides) => ({ item_code: 'CONS', item_name: 'Consultation', quantity: 1, unit_price: 2000, ...overrides })

  const discounted = await strict.createSale(sale({ lines: [line({ discount: 500 })] }))
  assert.equal(discounted.items[0].discount, 500)
  assert.equal(discounted.total_bill, 1500)
  assert.equal(discounted.total_discount, 500)

  await assert.rejects(strict.createSale(sale({ lines: [line({ discount: 2500 })] })), /more than the line amount/)
  await assert.rejects(strict.createSale(sale({ lines: [line({ discount: -10 })] })), /cannot be negative/)
  // Two of them may take a discount up to both together.
  const two = await strict.createSale(sale({ lines: [line({ quantity: 2, discount: 4000 })] }))
  assert.equal(two.total_bill, 0)
})

test('the dashboard totals accepted invoices by Pakistan day, returns netted, gaps filled', async () => {
  let clock = new Date('2026-10-11T05:00:00Z') // 10:00 on 11 Oct in Pakistan
  const dash = createPos({ store, now: () => clock })
  const first = await dash.createSale(sale())
  await dash.createSale(sale())
  clock = new Date('2026-10-13T09:30:00Z') // 14:30 on 13 Oct
  await dash.createSale(sale())
  await dash.createReturn(first.id)
  reply = reject(['bad'])
  await dash.createSale(sale()) // rejected by FBR: not counted

  const week = dash.dashboard('7d')
  assert.equal(week.unit, 'day')
  assert.deepEqual(week.trend.map((p) => p.key), [
    '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13',
  ])
  const day = (key) => week.trend.find((p) => p.key === key)
  assert.deepEqual([day('2026-10-11').sales, day('2026-10-11').net], [2, 4000])
  assert.equal(day('2026-10-12').net, 0)
  assert.deepEqual([day('2026-10-13').sales, day('2026-10-13').net], [1, 0]) // a sale and a return
  assert.equal(week.totals.sales, 3)
  assert.equal(week.totals.returns, 1)
  assert.equal(week.totals.net, 4000)
  assert.equal(week.allTime.net, 4000)
  assert.deepEqual(week.topItems.map((i) => [i.code, i.amount]), [['CONS', 4000]])
  assert.equal(week.hours.find((h) => h.hour === 10).sales, 2)
  assert.equal(week.hours.find((h) => h.hour === 14).sales, 1)

  const today = dash.dashboard('today')
  assert.equal(today.unit, 'hour')
  assert.equal(today.trend.length, 15) // 00:00 to 14:00
  assert.equal(today.totals.net, 0)
  assert.equal(dash.dashboard('12m').trend.length, 12)
})

test("line arithmetic matches the spec's sample invoice", () => {
  // Spec: sale value 1,298 after a 380 discount, 17% tax, total ~1,519.
  const line = computeLine({ quantity: 1, unit_price: 1678, discount: 380, tax_rate: 17 })
  assert.equal(line.sale_value, 1298)
  assert.equal(line.tax_charged, 220.66)
  assert.equal(line.total_amount, 1518.66)
})

test('tax-inclusive prices back the tax out of the price', () => {
  const line = computeLine({ quantity: 2, unit_price: 117, tax_rate: 17 }, true)
  assert.equal(line.sale_value, 200)
  assert.equal(line.tax_charged, 34)
  assert.equal(line.total_amount, 234)
})

test('totals are the sums of the rounded lines', () => {
  const lines = [0.335, 0.335, 0.335].map((p) => computeLine({ quantity: 1, unit_price: p, tax_rate: 17 }))
  const totals = computeTotals(lines)
  assert.equal(totals.total_bill, Number((lines[0].total_amount * 3).toFixed(2)))
  assert.equal(totals.total_quantity, 3)
})

test('reads both response shapes without losing digits', () => {
  const plain = parseResponse(JSON.stringify(accept()().body))
  assert.equal(plain.accepted, true)
  assert.equal(plain.invoiceNumber, '822992FJGO42433293*test*')

  const rejected = parseResponse(JSON.stringify(reject('PCT Code is required')().body))
  assert.equal(rejected.accepted, false)
  assert.equal(rejected.invoiceNumber, '')
  assert.equal(rejected.code, '402')
  assert.equal(rejected.message, 'Model validation failed. — PCT Code is required')

  // Escaped string with an unquoted 20-digit number, as printed in the spec.
  const escaped = parseResponse(
    '{\\"FBRInvoiceNumber\\":11000120181112000369,\\"Response\\":\\"Invoice received successfully\\",\\"Code\\":\\"100\\"}'
  )
  assert.equal(escaped.accepted, true)
  assert.equal(escaped.invoiceNumber, '11000120181112000369')

  const quoted = parseResponse(JSON.stringify(JSON.stringify(accept('123456789012345678901')().body)))
  assert.equal(quoted.invoiceNumber, '123456789012345678901')
})

test('a sale is fiscalized and the payload follows the spec', async () => {
  const invoice = await pos.createSale(
    sale({ buyer: { name: 'Ali', cnic: '12345-1234567-8' }, payment_mode: 2 })
  )
  assert.equal(invoice.status, 'fiscalized')
  assert.equal(invoice.fbr_invoice_number, '822992FJGO42433293*test*')
  assert.equal(invoice.environment, 'test')

  const [payload] = received
  assert.equal(payload.InvoiceNumber, '')
  assert.equal(payload.POSID, 110014)
  assert.equal(payload.USIN, 'T000001')
  assert.equal(payload.DateTime, '2026-10-13 12:00:00')
  assert.equal(payload.BuyerCNIC, '1234512345678')
  assert.equal(payload.BuyerNTN, null)
  assert.equal(payload.PaymentMode, 2)
  assert.equal(payload.InvoiceType, 1)
  assert.equal(payload.RefUSIN, null)
  assert.equal(payload.TotalBillAmount, 2000)
  assert.equal(payload.Items.length, 1)
  assert.equal(payload.Items[0].PCTCode, '98151000')
  assert.equal(payload.Items[0].InvoiceType, 1)
})

test('when the service is down the sale is queued and resent with the same USIN', async () => {
  store.saveSettings({ service_url: await closedPortUrl() })
  const queued = await pos.createSale(sale())
  assert.equal(queued.status, 'queued')
  assert.match(queued.last_error, /not reachable/)
  assert.equal(received.length, 0)

  store.saveSettings({ service_url: serviceUrl })
  assert.equal(await pos.retryQueued(), 1)
  const done = store.getInvoice(queued.id)
  assert.equal(done.status, 'fiscalized')
  assert.equal(done.attempts, 2)
  assert.equal(received[0].USIN, queued.usin)
})

// The component registers a repeated USIN as a second sale, so anything it
// might have received must never be resent without a person deciding to.
for (const [name, failure] of [
  ['a server error', () => ({ status: 503, body: 'busy' })],
  ['a dropped connection', () => ({ drop: true })],
  ['an unreadable reply', () => ({ status: 200, body: '<html>oops</html>' })],
]) {
  test(`${name} leaves the invoice unconfirmed and it is not resent automatically`, async () => {
    reply = failure
    const invoice = await pos.createSale(sale())
    assert.equal(invoice.status, 'unconfirmed')
    assert.equal(received.length, 1)

    reply = accept()
    assert.equal(await pos.retryQueued(), 0)
    assert.equal(received.length, 1)

    const resent = await pos.submit(invoice.id)
    assert.equal(resent.status, 'fiscalized')
    assert.equal(pos.todayStats().unconfirmed, 0)
  })
}

test('a rejection is recorded as failed and is not retried automatically', async () => {
  reply = reject('Invalid Payment Mode')
  const invoice = await pos.createSale(sale())
  assert.equal(invoice.status, 'failed')
  assert.equal(invoice.fbr_code, '402')
  assert.match(invoice.last_error, /Invalid Payment Mode/)
  assert.equal(await pos.retryQueued(), 0)

  // Fixing the cause and retrying by hand reuses the invoice.
  reply = accept()
  const retried = await pos.submit(invoice.id)
  assert.equal(retried.status, 'fiscalized')
  assert.equal(received[1].USIN, invoice.usin)
})

test('FBR mode without a POS ID never calls the service', async () => {
  store.saveSettings({ pos_id: '' })
  const invoice = await pos.createSale(sale())
  assert.equal(invoice.status, 'failed')
  assert.match(invoice.last_error, /POS ID/)
  assert.equal(received.length, 0)
})

test('a return is a credit invoice against the original USIN, once only', async () => {
  const original = await pos.createSale(
    sale({
      lines: [
        { item_code: 'A', item_name: 'Plain', pct_code: '11001010', tax_rate: 17, quantity: 2, unit_price: 100 },
        { item_code: 'B', item_name: 'Scheduled', pct_code: '11001010', tax_rate: 17, quantity: 1, unit_price: 50, third_schedule: true },
      ],
    })
  )
  const credit = await pos.createReturn(original.id)
  assert.equal(credit.status, 'fiscalized')
  assert.equal(credit.usin, 'T000002')

  const payload = received[1]
  assert.equal(payload.InvoiceType, 3)
  assert.equal(payload.RefUSIN, original.usin)
  assert.deepEqual(payload.Items.map((i) => i.InvoiceType), [3, 12])
  assert.equal(payload.Items[0].RefUSIN, original.usin)
  assert.equal(payload.TotalBillAmount, original.total_bill)

  await assert.rejects(pos.createReturn(original.id), /already been returned/)
  await assert.rejects(pos.createReturn(credit.id), /Only a sale/)

  const stats = pos.todayStats()
  assert.equal(stats.sales, 1)
  assert.equal(stats.returns, 1)
  assert.equal(stats.total_bill, 0)
})

test('demo mode works with nothing configured and sends nothing', async () => {
  store.saveSettings({ mode: 'demo', pos_id: '', service_url: await closedPortUrl() })
  const invoice = await pos.createSale(sale())
  assert.equal(invoice.status, 'fiscalized')
  assert.equal(invoice.mode, 'demo')
  assert.match(invoice.fbr_invoice_number, /^DEMO/)
  assert.equal(received.length, 0)
})

test('invalid sales are refused before anything is stored', async () => {
  await assert.rejects(pos.createSale(sale({ lines: [] })), /at least one item/)
  await assert.rejects(
    pos.createSale(sale({ lines: [{ item_code: 'X', item_name: 'No PCT', tax_rate: 0, quantity: 1, unit_price: 1 }] })),
    /PCT code is required/
  )
  await assert.rejects(pos.createSale(sale({ buyer: { cnic: '123' } })), /13 digits/)
  assert.equal(store.listInvoices().total, 0)
})
