// Client for the FBR Software Fiscal Component (IMS) — the service FBR installs
// on the POS computer. Per FBR's technical specification:
//   GET  {base}/api/IMSFiscal/Get                      -> ["Service is responding"]
//   POST {base}/api/IMSFiscal/GetInvoiceNumberByModel  -> fiscal invoice number
// The component uploads to FBR on its own; this app only talks to localhost.

export const DEFAULT_SERVICE_URL = 'http://localhost:8524'
const SUCCESS_CODE = '100'

// Failures before a connection exists — the invoice certainly did not arrive.
const NOT_SENT_CODES = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT',
])

// The request produced no usable answer. The component does not de-duplicate
// by USIN (sandbox-verified: posting the same USIN twice yields two fiscal
// numbers), so the two kinds of failure must be told apart:
//   ambiguous = false: it never connected, so resending is safe.
//   ambiguous = true:  it may have been received (timeout, dropped connection,
//                      5xx, unreadable reply); resending could register the
//                      sale twice, so a person has to decide.
export class TransportError extends Error {
  constructor(message, ambiguous = false) {
    super(message)
    this.ambiguous = ambiguous
  }
}

const baseUrl = (url) => (url || DEFAULT_SERVICE_URL).trim().replace(/\/+$/, '')

async function request(url, options, timeoutMs) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    const code = err.cause?.code
    if (NOT_SENT_CODES.has(code) || err.cause?.message === 'bad port') {
      throw new TransportError(
        `FBR fiscal service is not reachable (${code || 'bad port'}). Check that it is installed and running.`
      )
    }
    const reason =
      err.name === 'TimeoutError'
        ? `no reply within ${Math.round(timeoutMs / 1000)}s`
        : code || err.cause?.message || err.message
    throw new TransportError(`No answer from the FBR fiscal service (${reason}).`, true)
  }
}

export async function checkService(serviceUrl, timeoutMs = 4000) {
  try {
    const resp = await request(`${baseUrl(serviceUrl)}/api/IMSFiscal/Get`, {}, timeoutMs)
    const text = (await resp.text()).trim()
    if (!resp.ok) return { ok: false, message: `FBR fiscal service returned HTTP ${resp.status}.` }
    return { ok: true, message: text.replace(/^[\["\s]+|[\]"\s]+$/g, '') || 'Service is responding' }
  } catch (err) {
    return { ok: false, message: err.message }
  }
}

export function buildPayload(inv, posId) {
  const text = (v) => (v ? String(v) : null)
  return {
    InvoiceNumber: '',
    POSID: Number(posId),
    USIN: inv.usin,
    DateTime: inv.created_at,
    BuyerNTN: text(inv.buyer_ntn),
    BuyerCNIC: text(inv.buyer_cnic),
    BuyerName: text(inv.buyer_name),
    BuyerPhoneNumber: text(inv.buyer_phone),
    TotalBillAmount: inv.total_bill,
    TotalQuantity: inv.total_quantity,
    TotalSaleValue: inv.total_sale_value,
    TotalTaxCharged: inv.total_tax,
    Discount: inv.total_discount,
    FurtherTax: inv.total_further_tax,
    PaymentMode: inv.payment_mode,
    RefUSIN: text(inv.ref_usin),
    InvoiceType: inv.invoice_type,
    Items: inv.items.map((it) => ({
      ItemCode: it.item_code,
      ItemName: it.item_name,
      Quantity: it.quantity,
      PCTCode: it.pct_code,
      TaxRate: it.tax_rate,
      SaleValue: it.sale_value,
      TotalAmount: it.total_amount,
      TaxCharged: it.tax_charged,
      Discount: it.discount,
      FurtherTax: it.further_tax,
      InvoiceType: it.invoice_type,
      RefUSIN: text(inv.ref_usin),
    })),
  }
}

// The spec shows two response shapes — {"InvoiceNumber":"…","Code":"100",…}
// and a string-escaped {\"FBRInvoiceNumber\":11000120181112000369,…} whose
// number is unquoted and too large for a JS double. So the invoice number is
// lifted out of the raw text instead of trusting JSON.parse with it.
// Seen from the real component: numbers are alphanumeric and the sandbox adds
// a suffix ("822992FJGO42433293*test*"); a rejection is HTTP 200 with
// InvoiceNumber "Not Available", Code 402 (validation) or 401 (bad data).
export function parseResponse(raw) {
  let body = String(raw ?? '').trim()
  for (let i = 0; i < 2 && body.startsWith('"'); i += 1) {
    try {
      body = String(JSON.parse(body)).trim()
    } catch {
      break
    }
  }
  if (body.includes('\\"')) body = body.replace(/\\"/g, '"')

  const field = (name) =>
    body.match(new RegExp(`"${name}"\\s*:\\s*(?:"([^"]*)"|([^,}\\s]+))`, 'i'))
  const value = (name) => {
    const m = field(name)
    const v = m ? (m[1] ?? m[2]) : ''
    return v === 'null' ? '' : v
  }

  let errors = value('Errors')
  try {
    const parsed = JSON.parse(body)
    if (parsed && parsed.Errors && typeof parsed.Errors !== 'string') {
      errors = JSON.stringify(parsed.Errors)
    }
  } catch {
    // fall back to the regex-extracted fields above
  }

  const code = value('Code')
  const invoiceNumber = value('InvoiceNumber') || value('FBRInvoiceNumber')
  const response = value('Response')
  if (!code && !invoiceNumber && !response && !errors) {
    throw new TransportError(
      `FBR fiscal service sent a reply that could not be read: ${body.slice(0, 200) || '(empty)'}`,
      true
    )
  }
  const accepted =
    code === SUCCESS_CODE && invoiceNumber !== '' && !/^not available$/i.test(invoiceNumber)
  return {
    accepted,
    invoiceNumber: accepted ? invoiceNumber : '',
    code,
    message: [response, errors].filter(Boolean).join(' — ') || `FBR returned code ${code || '?'}`,
    raw: body,
  }
}

export async function submitInvoice(payload, { serviceUrl, timeoutMs = 20000 } = {}) {
  const resp = await request(
    `${baseUrl(serviceUrl)}/api/IMSFiscal/GetInvoiceNumberByModel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    timeoutMs
  )
  const text = await resp.text()
  if (resp.status >= 500) {
    throw new TransportError(`FBR fiscal service returned HTTP ${resp.status}.`, true)
  }
  if (!resp.ok) {
    return {
      accepted: false,
      invoiceNumber: '',
      code: String(resp.status),
      message: `FBR fiscal service rejected the request (HTTP ${resp.status}). ${text.slice(0, 300)}`,
      raw: text,
    }
  }
  return parseResponse(text)
}

// Demo mode: lets the app be used end to end before a POS ID exists. The
// number is clearly not an FBR one and nothing leaves the computer.
export function mockSubmit(payload) {
  const invoiceNumber = `DEMO${Date.now()}${Math.floor(Math.random() * 90 + 10)}`
  return {
    accepted: true,
    invoiceNumber,
    code: SUCCESS_CODE,
    message: 'Demo mode — not sent to FBR.',
    raw: JSON.stringify({ InvoiceNumber: invoiceNumber, Code: SUCCESS_CODE, USIN: payload.USIN }),
  }
}
