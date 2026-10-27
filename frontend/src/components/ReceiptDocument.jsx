// The printable tax receipt itself — one invoice. Shared by the single receipt
// page (ReceiptView, which adds the toolbar and actions), the "print receipts"
// page, which stacks many of these into one PDF, and the Invoice Settings
// preview. `inv` is the invoice detail from GET /api/invoices/:id (or one entry
// of GET /api/invoices/receipts); its `layout` (Settings → Invoice Settings)
// decides the columns, header details and where the FBR logo / QR code sit.
// strnChoice: which STRN to print when the seller has several (index as string).

import { useLayoutEffect, useRef, useState } from 'react'
import mark from '../assets/mark.png'
import { adjustmentAmounts, adjustmentLabel } from '../receiptAdjustments'

// Used only if an invoice arrives without a layout — the pre-layout receipt.
const FALLBACK_LAYOUT = {
  custom_fields: [],
  columns: [
    ['index', '#'],
    ['description', 'Description'],
    ['hs_code', 'HS Code'],
    ['quantity', 'Qty'],
    ['uom', 'UOM'],
    ['unit_price', 'Unit Price'],
    ['rate', 'Rate'],
    ['excl_st', 'Excl. ST'],
    ['discount', 'Discount'],
    ['sales_tax', 'Sales Tax'],
  ].map(([key, label]) => ({ key, label, visible: true })),
  totals: [
    ['total_excl', 'Total Taxes Exclusive Value'],
    ['discount', 'Discount'],
    ['sales_tax', 'Total Sales Tax Amount'],
    ['further_tax', 'Total Further Tax Amount'],
    ['advance_tax', 'Advance Income Tax'],
    ['total_incl', 'Total Taxes Inclusive Value'],
  ].map(([key, label]) => ({ key, label, visible: true })),
  header: {},
  logo_position: 'top-right',
  qr_position: 'top-right',
}

const fmt = (v) => Number(v || 0).toLocaleString()

// Invoices submitted in Test mode get a diagonal "TEST INVOICE" watermark.
const TEST_ENVS = ['mock', 'sandbox']

function customValue(field, value) {
  if (value == null || value === '') return '—'
  return field?.type === 'number' ? fmt(value) : value
}

// A line's advance tax. Invoices created before per-line amounts were kept
// (it.advance_tax == null) only have the invoice total, which still settles
// it exactly when that total is 0 (every line 0) or there's a single line
// (that line has it all). Only a multi-line invoice with a non-zero total
// is unknown — null: Advance Tax shows —, Total shows the line total alone.
function lineAdvanceTax(it, inv) {
  if (it.advance_tax != null) return it.advance_tax
  const total = inv.advance_tax || 0
  if (total === 0) return 0
  if (inv.items.length === 1) return total
  return null
}

// Description (and custom text fields) are exactly as wide as their longest
// text, wrapping only past a cap; the other columns stay on one line and
// share whatever width is left over.
function colClass(key) {
  return key === 'description' || key.startsWith('cf:') ? 'col-wide' : 'col-fit'
}

// One table cell per column key.
function cell(key, it, idx, fieldsByKey) {
  switch (key) {
    case 'index':
      return idx + 1
    case 'description':
      return <span className="strong">{it.product_description}</span>
    case 'hs_code':
      return <span className="mono">{it.hs_code}</span>
    case 'quantity':
      return it.quantity
    case 'uom':
      return it.uom
    case 'unit_price':
      return fmt(it.unit_price)
    case 'rate':
      return it.rate
    case 'excl_st':
      return fmt(it.displayExcl)
    case 'discount':
      return it.displayDiscount > 0 ? `−${fmt(it.displayDiscount)}` : '0'
    case 'sales_tax':
      return fmt(it.sales_tax)
    case 'further_tax':
      return fmt(it.further_tax)
    case 'fed_payable':
      return fmt(it.fed_payable)
    case 'extra_tax':
      return fmt(it.extra_tax)
    case 'sale_type':
      return it.sale_type
    case 'line_total':
      return fmt(it.displayTotal)
    // Pack pricing (only offered to users with it enabled): the weight in
    // packs and price per pack; "—" on any line that isn't pack-priced.
    case 'pack_qty':
      return it.pack_qty == null
        ? '—'
        : Number(it.pack_qty).toLocaleString(undefined, { maximumFractionDigits: 5 })
    case 'pack_price':
      return it.pack_price == null ? '—' : fmt(it.pack_price)
    // Per-line §236 advance tax and the line total including it (see
    // lineAdvanceTax for older invoices).
    case 'advance_tax':
      return it.displayAdvanceTax == null ? '—' : fmt(it.displayAdvanceTax)
    // Unknown advance tax: just the line total, without it.
    case 'total_incl_adv':
      return fmt(Math.round((it.displayTotal + (it.displayAdvanceTax ?? 0)) * 100) / 100)
    default: {
      const fieldKey = key.replace(/^cf:/, '')
      return customValue(fieldsByKey[fieldKey], (it.custom_fields || {})[fieldKey])
    }
  }
}

// One labelled box of the receipt header. rows: [label, value, className?];
// falsy rows (switched off in Invoice Settings) are skipped, blank values show —.
function InfoPanel({ title, rows }) {
  return (
    <div className="info-panel">
      <h3>{title}</h3>
      <dl>
        {rows.filter(Boolean).map(([label, value, className]) => (
          <div className="info-row" key={label}>
            <dt>{label}:</dt>
            <dd className={className}>{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function FbrLogo() {
  return <img className="fbr-logo" src="/fbr_logo.png" alt="FBR Digital Invoicing System" />
}

// The FBR invoice number prints in Invoice Details, not under the QR.
function FbrQr({ inv }) {
  return inv.qr ? (
    <div className="fbr-verify">
      <img src={inv.qr} alt="FBR QR code" />
    </div>
  ) : (
    <div className="warn">
      NOT SUBMITTED TO FBR
      <br />
      (no invoice number / QR)
    </div>
  )
}

// Fit the product table to its width: 0 = as designed; 1 = headings may wrap
// onto two lines; 2 = also tighter cells. Only steps up when the table would
// otherwise overflow (many columns), so a normal layout is untouched.
function useTableFit(deps) {
  const ref = useRef(null)
  const [level, setLevel] = useState(0)
  useLayoutEffect(() => {
    const card = ref.current
    if (!card) return undefined
    const check = () => {
      const overflowing = () => card.querySelector('table').offsetWidth > card.clientWidth + 1
      // Measure from scratch at each width, stepping up only as needed.
      let next = 0
      card.classList.remove('fit-1', 'fit-2')
      while (next < 2 && overflowing()) {
        next += 1
        card.classList.remove('fit-1', 'fit-2')
        card.classList.add(`fit-${next}`)
      }
      setLevel(next)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(card)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return [ref, level]
}

export default function ReceiptDocument({ inv, strnChoice = '' }) {
  const layout = inv.layout || FALLBACK_LAYOUT
  const isTest = TEST_ENVS.includes(inv.fbr_env)
  const [tableCardRef, fitLevel] = useTableFit([inv, layout])
  const show = (key) => layout.header?.[key] !== false
  const fieldsByKey = Object.fromEntries((layout.custom_fields || []).map((f) => [f.key, f]))

  // Per line:
  //  - displayTotal is the backend's total_value — an explicit total_values
  //    from the upload when given (so it matches an upstream system to the
  //    paisa), otherwise sale value + taxes − discount.
  //  - displayExcl is the pre-tax, pre-discount value, backed out of the
  //    total so every row reconciles (excl − discount + tax = total). With
  //    no override / no discount this is just value_excl_st.
  //  - A 3rd Schedule line entered with unit_price 0 carries only a
  //    negligible placeholder (0.01) in value_excl_st (see csv_processor.py)
  //    — show the notified retail price there so it doesn't read as "free."
  const PLACEHOLDER_EXCL = 0.01
  const items = inv.items.map((it) => {
    const discount = it.discount || 0
    const lineTax = it.sales_tax + (it.further_tax || 0) + (it.fed_payable || 0)
    const usePlaceholder =
      it.fixed_notified_value > 0 && it.value_excl_st <= PLACEHOLDER_EXCL
    const computed = Math.max(it.value_excl_st - discount, 0) + lineTax
    const total = usePlaceholder
      ? it.fixed_notified_value + lineTax
      : it.total_value ?? computed
    const excl = usePlaceholder ? it.fixed_notified_value : total - lineTax + discount
    return {
      ...it,
      displayExcl: excl,
      displayDiscount: discount,
      displayTotal: total,
      displayAdvanceTax: lineAdvanceTax(it, inv),
    }
  })
  // STRN on the receipt: a lone one always prints; with several, only the
  // one the user picks from the dropdown does; with none, nothing shows.
  const strns = inv.seller.strns || []
  const displayStrn =
    strns.length === 1
      ? strns[0].strn
      : strnChoice !== '' && strns[Number(strnChoice)]
        ? strns[Number(strnChoice)].strn
        : ''

  const totalDiscount = items.reduce((sum, it) => sum + it.displayDiscount, 0)
  const displayTotalExcl = items.reduce((sum, it) => sum + it.displayExcl, 0)
  const displayGrandTotal = items.reduce((sum, it) => sum + it.displayTotal, 0)
  const sumOf = (field) => items.reduce((sum, it) => sum + (it[field] || 0), 0)
  const advanceTax = inv.advance_tax || 0
  const money = (v) => (Math.round(v * 100) / 100).toLocaleString()

  // Totals box: exclusive value (before discount and taxes) first, inclusive
  // value (everything, incl. advance income tax) last — see invoice_layout.py.
  const totals = layout.totals || FALLBACK_LAYOUT.totals
  const totalValues = {
    total_excl: money(displayTotalExcl),
    discount: totalDiscount > 0 ? `−${money(totalDiscount)}` : '0',
    sales_tax: money(sumOf('sales_tax')),
    further_tax: money(sumOf('further_tax')),
    fed_payable: money(sumOf('fed_payable')),
    advance_tax: money(advanceTax),
  }
  // Added total rows saved with this invoice (single invoices only): each
  // prints in its place in the layout (or just above the last row if since
  // removed from the settings) and changes the last row. % rows are of the
  // total before adjustments. Without any, the box is exactly as before.
  const beforeAdjustments = displayGrandTotal + advanceTax
  const adjustments = adjustmentAmounts(beforeAdjustments, inv.adjustments)
  const adjByKey = Object.fromEntries(adjustments.map((a) => [a.key, a]))
  for (const a of adjustments) {
    totalValues[a.key] = a.sign === 'subtract' ? `−${money(a.amount)}` : money(a.amount)
  }
  totalValues.total_incl = money(
    beforeAdjustments + adjustments.reduce((sum, a) => sum + a.signed, 0)
  )
  const layoutKeys = new Set(totals.map((t) => t.key))
  const totalRows = totals.flatMap((t) => {
    if (String(t.key).startsWith('adj:')) {
      const a = adjByKey[t.key]
      return a ? [{ key: a.key, label: adjustmentLabel(a) }] : []
    }
    if (!t.visible) return []
    if (t.key !== 'total_incl') return [t]
    const orphans = adjustments
      .filter((a) => !layoutKeys.has(a.key))
      .map((a) => ({ key: a.key, label: adjustmentLabel(a) }))
    return [...orphans, t]
  })

  // The discount column only appears when something was discounted.
  const columns = layout.columns.filter(
    (c) => c.visible && (c.key !== 'discount' || totalDiscount > 0)
  )

  // FBR logo and QR code, grouped by the corner each was placed in.
  const corner = (pos) => (
    <>
      {layout.logo_position === pos && <FbrLogo />}
      {layout.qr_position === pos && <FbrQr inv={inv} />}
    </>
  )
  const has = (pos) => layout.logo_position === pos || layout.qr_position === pos

  const address = [inv.seller.address, inv.seller.province].filter(Boolean).join(', ')

  return (
    <div className="card receipt">
      {/* Test mode (simulated / FBR sandbox) — not a real tax record: a faint
          watermark across the page plus a label under the title, so even a
          cropped photo or photocopy of the top shows it. */}
      {isTest && (
        <div className="receipt-watermark" aria-hidden="true">
          TEST INVOICE
        </div>
      )}

      <h1 className="receipt-title">Sales Tax Invoice</h1>
      {isTest && (
        <div className="receipt-test-tag-row">
          <span className="receipt-test-tag">Test — Not valid for tax purposes</span>
        </div>
      )}

      {/* Top row: Invoice Details beside the FBR logo / QR (whichever are
          placed at the top); the business name is in Seller Information. */}
      <div className="receipt-head">
        {has('top-left') && <div className="fbr-box">{corner('top-left')}</div>}
        <InfoPanel
          title="Invoice Details"
          rows={[
            show('pos_invoice_no') && ['Invoice No', inv.pos_invoice_no],
            ['Invoice Type', inv.invoice_type],
            ['Date', inv.invoice_date],
            ['FBR Number', inv.fbr_invoice_number || 'Not submitted', 'mono'],
          ]}
        />
        {has('top-right') && <div className="fbr-box">{corner('top-right')}</div>}
      </div>

      <div className="receipt-info">
        <InfoPanel
          title="Seller Information"
          rows={[
            ['Name', inv.seller.business_name || 'Business name not set'],
            show('seller_ntn') && ['NTN', inv.seller.ntn],
            show('seller_cnic') && ['CNIC', inv.seller.ntn_cnic],
            show('seller_strn') && displayStrn && ['STRN', displayStrn],
            show('seller_address') && ['Address', address],
            show('seller_email') && inv.seller.email && ['Email', inv.seller.email],
          ]}
        />
        <InfoPanel
          title="Buyer Information"
          rows={[
            ['Name', inv.buyer_name],
            show('buyer_ntn_cnic') && ['NTN/CNIC', inv.buyer_ntn_cnic],
            // Only when one was entered (pack pricing users' single invoices)
            // and not unticked under Invoice Settings → Details to print.
            show('buyer_strn') && inv.buyer_strn && ['STRN', inv.buyer_strn],
            show('buyer_registration_type') && ['Reg Type', inv.buyer_registration_type],
            show('buyer_address') && [
              'Address',
              [inv.buyer_address, inv.buyer_province].filter(Boolean).join(', '),
            ],
          ]}
        />
      </div>

      <div className={`table-card${fitLevel ? ` fit-${fitLevel}` : ''}`} ref={tableCardRef}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={colClass(c.key)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                {columns.map((c) => (
                  <td key={c.key} className={colClass(c.key)}>
                    {colClass(c.key) === 'col-wide' ? (
                      <div className="cell-wrap">{cell(c.key, it, idx, fieldsByKey)}</div>
                    ) : (
                      cell(c.key, it, idx, fieldsByKey)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* "Bottom left" puts the FBR logo / QR in this row, left of the totals. */}
      <div className="totals">
        {has('bottom-left') && <div className="fbr-box">{corner('bottom-left')}</div>}
        <div className="totals-box">
          {totalRows.map((t) => (
            <div key={t.key} className={`trow${t.key === 'total_incl' ? ' grand' : ''}`}>
              <span>{t.label}</span>
              <span>{totalValues[t.key]}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="receipt-note">
        This is a system-generated invoice and does not require any signature or stamp.
      </p>
      <p className="receipt-credit">
        <img src={mark} alt="" />
        This invoice is generated with{' '}
        <a href="https://compliance.pk" target="_blank" rel="noopener noreferrer">
          compliance.pk
        </a>
      </p>
    </div>
  )
}
