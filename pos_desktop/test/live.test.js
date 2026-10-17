import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, test } from 'node:test'
import { createLiveChannel } from '../electron/live.js'

// A stand-in for GET /api/pos/events.
let server
let serverUrl
let streams = []
let status = 200
const requests = []

before(async () => {
  server = http.createServer((req, res) => {
    requests.push(req.headers.authorization)
    if (status !== 200) {
      res.statusCode = status
      res.end('{}')
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('event: ready\ndata: {}\n\n')
    streams.push(res)
    req.on('close', () => {
      streams = streams.filter((s) => s !== res)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  serverUrl = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(check, timeout = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (check()) return true
    await sleep(20)
  }
  return false
}
const send = (event) => streams.forEach((res) => res.write(`event: ${event}\ndata: {}\n\n`))

test('reacts to changes pushed by the server, and catches up on connect', async () => {
  const seen = []
  const live = createLiveChannel({
    getConnection: () => ({ serverUrl, token: 'device-token' }),
    onChange: (why) => seen.push(why),
  })
  live.start()
  assert.ok(await until(() => streams.length === 1))
  assert.equal(requests.at(-1), 'Bearer device-token')
  assert.ok(await until(() => seen.includes('connected')))

  send('changed')
  assert.ok(await until(() => seen.filter((w) => w === 'changed').length === 1))
  // A keep-alive comment is not a change.
  streams.forEach((res) => res.write(': keep-alive\n\n'))
  await sleep(100)
  assert.equal(seen.filter((w) => w === 'changed').length, 1)

  live.stop()
  assert.ok(await until(() => streams.length === 0))
})

test('reconnects by itself when the connection drops', async () => {
  const seen = []
  const live = createLiveChannel({
    getConnection: () => ({ serverUrl, token: 't' }),
    onChange: (why) => seen.push(why),
  })
  live.start()
  assert.ok(await until(() => streams.length === 1))
  streams.forEach((res) => res.destroy())
  // Back after the first short pause, and it catches up again on connect.
  assert.ok(await until(() => streams.length === 1, 6000))
  assert.ok(await until(() => seen.filter((w) => w === 'connected').length === 2))
  send('changed')
  assert.ok(await until(() => seen.includes('changed')))
  live.stop()
  assert.ok(await until(() => streams.length === 0))
})

test('a rejected login is reported once, not retried in a hurry', async () => {
  status = 401
  const seen = []
  const before = requests.length
  const live = createLiveChannel({
    getConnection: () => ({ serverUrl, token: 'old' }),
    onChange: (why) => seen.push(why),
  })
  live.start()
  assert.ok(await until(() => seen.includes('rejected')))
  await sleep(500)
  assert.equal(requests.length - before, 1)
  live.stop()
  status = 200
})

test('nothing happens without a signed-in account, and restart starts afresh', async () => {
  let connection = null
  const seen = []
  const live = createLiveChannel({ getConnection: () => connection, onChange: (why) => seen.push(why) })
  live.start()
  await sleep(100)
  assert.equal(streams.length, 0)
  assert.equal(live.isRunning(), false)

  connection = { serverUrl, token: 'new' }
  live.restart()
  live.restart()
  assert.ok(await until(() => streams.length >= 1))
  await sleep(300)
  // Only one connection, even after two restarts in a row.
  assert.equal(streams.length, 1)
  live.stop()
  assert.ok(await until(() => streams.length === 0))
})
