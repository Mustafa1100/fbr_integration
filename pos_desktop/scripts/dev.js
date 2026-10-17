// Starts the Vite dev server, then Electron pointed at it.
import { spawn } from 'node:child_process'
import electron from 'electron'
import { createServer } from 'vite'

const server = await createServer()
await server.listen()
const url = server.resolvedUrls.local[0]

// Shells started by VS Code can carry ELECTRON_RUN_AS_NODE, which makes
// electron.exe behave as plain Node and never open a window.
const env = { ...process.env, VITE_DEV_SERVER_URL: url }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, ['.'], { stdio: 'inherit', env })
child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
