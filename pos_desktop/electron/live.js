// The live connection to the server (server-sent events). While the PC is
// online it stays open, and the server says "changed" the moment an admin
// changes something for this client — a cancelled or renewed plan, settings,
// items. `onChange` then fetches the update. Nothing is polled.
//
// Offline, it retries with a growing pause (2 s up to 1 min). Each time it
// connects it also calls `onChange`, to catch up on anything missed while it
// was away.

const FIRST_RETRY_MS = 2000
const LONGEST_RETRY_MS = 60_000
// The server sends a keep-alive every 25 s; this long without anything means
// the connection is dead even if the network did not say so.
const SILENCE_LIMIT_MS = 70_000
// Rejected login (password reset, deactivated): onChange lets the account
// code deal with it; no point hammering the server meanwhile.
const AFTER_REJECTION_MS = 5 * 60_000

export function createLiveChannel({ getConnection, onChange, onStatus = () => {} }) {
  // Each start gets a new generation; a loop from an older one just ends.
  let generation = 0
  let running = false
  let controller = null
  let wake = null

  const pause = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      wake = () => {
        clearTimeout(timer)
        resolve()
      }
    })

  async function listen(connection) {
    const abort = new AbortController()
    controller = abort
    let silence = null
    const resetSilence = () => {
      clearTimeout(silence)
      silence = setTimeout(() => abort.abort(), SILENCE_LIMIT_MS)
    }
    try {
      resetSilence()
      const url = `${String(connection.serverUrl).replace(/\/+$/, '')}/api/pos/events`
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${connection.token}`, Accept: 'text/event-stream' },
        signal: abort.signal,
      })
      if (resp.status === 401 || resp.status === 403) return 'rejected'
      if (!resp.ok || !resp.body) return 'failed'

      onStatus('connected')
      onChange('connected')
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        resetSilence()
        buffer += decoder.decode(value, { stream: true })
        let end
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (/^event: changed$/m.test(block)) onChange('changed')
        }
      }
      return 'closed'
    } catch {
      return 'failed'
    } finally {
      clearTimeout(silence)
      if (controller === abort) controller = null
      onStatus('disconnected')
    }
  }

  async function loop(mine) {
    const current = () => running && generation === mine
    let retry = FIRST_RETRY_MS
    while (current()) {
      const connection = getConnection()
      if (!connection) break
      const started = Date.now()
      const outcome = await listen(connection)
      if (!current()) break
      if (outcome === 'rejected') {
        onChange('rejected')
        await pause(AFTER_REJECTION_MS)
        continue
      }
      // A connection that lasted a while was healthy: retry quickly.
      if (Date.now() - started > LONGEST_RETRY_MS) retry = FIRST_RETRY_MS
      await pause(retry)
      retry = Math.min(retry * 2, LONGEST_RETRY_MS)
    }
    if (generation === mine) running = false
  }

  return {
    start() {
      if (running) return
      running = true
      generation += 1
      loop(generation)
    },
    stop() {
      running = false
      controller?.abort()
      wake?.()
    },
    restart() {
      this.stop()
      this.start()
    },
    isRunning: () => running,
  }
}
