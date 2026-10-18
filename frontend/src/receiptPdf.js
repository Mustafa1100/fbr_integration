// "Download PDF" for receipts: renders each receipt at the A4-landscape print
// width, captures it as an image and saves them as one A4 landscape PDF —
// no print dialog, so the result doesn't depend on which "printer" (e.g.
// Microsoft Print to PDF, which turns landscape pages sideways) is picked.
// Every receipt starts on a new page. The libraries are loaded on first use,
// so they don't weigh down page loads.

const PAGE_W_MM = 297 // A4 landscape
const PAGE_H_MM = 210
const MARGIN_MM = 10 // same margin as printing (see @page in styles.css)
const CONTENT_W_MM = PAGE_W_MM - 2 * MARGIN_MM
const CONTENT_H_MM = PAGE_H_MM - 2 * MARGIN_MM
const PX_PER_MM = 96 / 25.4
const RENDER_SCALE = 2.5 // sharp text when printed / zoomed
// Up to this much taller than a page, shrink to fit one page rather than
// split onto a second (beyond it the text would get too small).
const FIT_TOLERANCE = 1.35

// A filename-safe version of some text.
function safeName(value) {
  return String(value || '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
}

export function receiptFileName(inv) {
  const id = safeName(inv.pos_invoice_no) || safeName(inv.fbr_invoice_number) || String(inv.id)
  return `Sales-Tax-Invoice-${id}.pdf`
}

// One buyer: "Tax-Receipts-<buyer>.pdf"; otherwise "Tax-Receipts-<count>.pdf".
export function receiptsFileName(invoices) {
  const buyers = [...new Set(invoices.map((i) => i.buyer_name))]
  const tag = buyers.length === 1 ? safeName(buyers[0]) : ''
  return `Tax-Receipts-${tag || `${invoices.length}-invoices`}.pdf`
}

// Render a copy off-screen at exactly the printable width, styled as when
// printing (no card border / shadow / padding), and capture it.
async function capture(html2canvas, receiptEl) {
  const holder = document.createElement('div')
  holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${Math.round(
    CONTENT_W_MM * PX_PER_MM
  )}px;background:#fff;`
  const copy = receiptEl.cloneNode(true)
  copy.classList.add('receipt-pdf')
  holder.appendChild(copy)
  document.body.appendChild(holder)
  try {
    return await html2canvas(copy, {
      scale: RENDER_SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })
  } finally {
    holder.remove()
  }
}

const jpeg = (canvas) => canvas.toDataURL('image/jpeg', 0.9)

// Add one captured receipt, starting on a new page (except the very first).
function addReceipt(pdf, canvas, isFirst) {
  const newPage = (first) => !first && pdf.addPage('a4', 'landscape')
  const fullH = (canvas.height * CONTENT_W_MM) / canvas.width // mm at full width

  // Fits, or only a little too tall: one page, shrunk just enough to fit
  // and centred across the width.
  if (fullH <= CONTENT_H_MM * FIT_TOLERANCE) {
    newPage(isFirst)
    const k = Math.min(1, CONTENT_H_MM / fullH)
    const w = CONTENT_W_MM * k
    pdf.addImage(jpeg(canvas), 'JPEG', MARGIN_MM + (CONTENT_W_MM - w) / 2, MARGIN_MM, w, fullH * k)
    return
  }

  // A long receipt (many products): full width, continued on further
  // pages, sliced at page-height steps.
  const mmPerPx = CONTENT_W_MM / canvas.width
  const sliceH = Math.floor(CONTENT_H_MM / mmPerPx)
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const h = Math.min(sliceH, canvas.height - y)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = h
    slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
    newPage(isFirst && page === 0)
    pdf.addImage(jpeg(slice), 'JPEG', MARGIN_MM, MARGIN_MM, CONTENT_W_MM, h * mmPerPx)
  }
}

// Several receipts into one PDF, each on its own page(s). onProgress(done,
// total) is called after each receipt so a long batch can show progress.
export async function downloadReceiptsPdf(receiptEls, fileName, onProgress) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  await document.fonts.ready
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  for (let i = 0; i < receiptEls.length; i++) {
    // One at a time, so only one big canvas is in memory.
    addReceipt(pdf, await capture(html2canvas, receiptEls[i]), i === 0)
    onProgress?.(i + 1, receiptEls.length)
  }
  pdf.save(fileName)
}

export function downloadReceiptPdf(receiptEl, fileName) {
  return downloadReceiptsPdf([receiptEl], fileName)
}
