// Thin wrapper over the IPC bridge exposed by electron/preload.cjs.
async function call(channel, ...args) {
  const res = await window.pos.invoke(`pos:${channel}`, ...args)
  if (!res.ok) throw new Error(res.error)
  return res.data
}

export const api = {
  accountState: () => call('account:state'),
  login: (credentials) => call('account:login', credentials),
  syncAccount: () => call('account:sync'),
  logout: () => call('account:logout'),
  getSettings: () => call('settings:get'),
  saveSettings: (patch) => call('settings:save', patch),
  checkService: (url) => call('service:check', url),
  listItems: (search) => call('items:list', search),
  saveItem: (item) => call('items:save', item),
  deleteItem: (id) => call('items:delete', id),
  syncItems: () => call('items:sync'),
  itemRequests: () => call('items:requests'),
  createInvoice: (input) => call('invoices:create', input),
  listInvoices: (query) => call('invoices:list', query),
  getInvoice: (id) => call('invoices:get', id),
  retryInvoice: (id) => call('invoices:retry', id),
  returnInvoice: (id) => call('invoices:return', id),
  todayStats: () => call('stats:today'),
  dashboard: (range) => call('stats:dashboard', range),
  listPrinters: () => call('printers:list'),
  printReceipt: () => call('print:receipt'),
  saveReceiptPdf: (receipt) => call('receipt:save-pdf', receipt),
  revealReceipt: (file) => call('receipt:reveal', file),
  appInfo: () => call('app:info'),
}

// Fires when invoices or settings change outside the current screen, e.g. the
// background retry fiscalizes a queued invoice.
export const onChanged = (callback) => window.pos.onChanged(callback)

// Dates are always shown in Pakistan time, whatever the PC's time zone.
const TIME_ZONE = 'Asia/Karachi'

export const formatDay = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: TIME_ZONE,
      })
    : 'N/A'

export const formatDayTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: TIME_ZONE,
      })
    : 'Never'

export const money = (n) =>
  Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
