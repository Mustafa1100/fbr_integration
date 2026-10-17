// Where the app keeps its database. The installed app (and a source run with
// POS_USE_PRODUCTION=1) uses the standard folder; a development run uses its
// own folder, so test data never meets the production server and the
// production app never opens a development database.
import fs from 'node:fs'
import path from 'node:path'

const DB_FILES = /^pos(\.db(-wal|-shm)?|\.backup-.*\.db)$/

export function dataDir({ appData, appName, production }) {
  const standard = path.join(appData, appName)
  if (production) return standard
  const dev = path.join(appData, `${appName} (development)`)
  moveDatabases(standard, dev)
  return dev
}

// Development databases made before the folders were separated sat in the
// standard folder. Move them (once) to the development folder, so the first
// installed copy on a developer's PC starts with an empty database.
function moveDatabases(from, to) {
  if (fs.existsSync(path.join(to, 'pos.db')) || !fs.existsSync(path.join(from, 'pos.db'))) return
  fs.mkdirSync(to, { recursive: true })
  for (const name of fs.readdirSync(from)) {
    if (DB_FILES.test(name)) fs.renameSync(path.join(from, name), path.join(to, name))
  }
}
