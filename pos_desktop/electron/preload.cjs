// Sandboxed preload — CommonJS because Electron does not load ESM preloads in
// a sandboxed renderer. Exposes only the app's own IPC channels.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pos', {
  invoke: (channel, ...args) => {
    if (typeof channel !== 'string' || !channel.startsWith('pos:')) {
      return Promise.reject(new Error('Unknown channel'))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  onChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('pos:changed', listener)
    return () => ipcRenderer.removeListener('pos:changed', listener)
  },
})
