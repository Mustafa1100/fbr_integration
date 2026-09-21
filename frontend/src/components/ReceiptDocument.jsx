// The printable tax receipt itself — one invoice. Shared by the single receipt
// page (ReceiptView, which adds the toolbar and actions) and the "print receipts"
// page, which stacks many of these into one PDF. `inv` is the invoice detail from
// GET /api/invoices/:id (or one entry of GET /api/invoices/receipts).
// strnChoice: which STRN to print when the seller has several (index as string).
export default function ReceiptDocument({ inv, strnChoice = '' }) {
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
  //    Tax on a 3rd Schedule line is still computed on the notified price,
  //    not this figure — hence the * note.
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
    return { ...it, displayExcl: excl, displayDiscount: discount, displayTotal: total }
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

  const usesFixedValue = items.some((it) => it.fixed_notified_value > 0)
  const totalDiscount = items.reduce((sum, it) => sum + it.displayDiscount, 0)
  const showDiscountCol = totalDiscount > 0
  const displayTotalExcl = items.reduce((sum, it) => sum + it.displayExcl, 0)
  const displayGrandTotal = items.reduce((sum, it) => sum + it.displayTotal, 0)

  return (
    <div className="card receipt">
      <div className="receipt-head">
        <div>
          <h2>{inv.seller.business_name || 'Seller business name not set'}</h2>
          <p>
            {inv.seller.ntn && (
              <>
                NTN: {inv.seller.ntn}
                <br />
              </>
            )}
            CNIC: {inv.seller.ntn_cnic || '—'}
            <br />
            {displayStrn && (
              <>
                STRN: {displayStrn}
                <br />
              </>
            )}
            {inv.seller.address}, {inv.seller.province}
            {inv.seller.email && (
              <>
                <br />
                Email: {inv.seller.email}
              </>
            )}
          </p>
          <p>
            <strong>Date:</strong> {inv.invoice_date}
            {inv.pos_invoice_no && (
              <>
                <br />
                <strong>Invoice:</strong> {inv.pos_invoice_no}
              </>
            )}
          </p>
        </div>
        <div className="fbr-box">
          <img
            className="fbr-logo"
            src="/fbr_logo.png"
            alt="FBR Digital Invoicing System"
          />
          {inv.qr ? (
            <div className="fbr-verify">
              <img src={inv.qr} alt="FBR QR code" />
              <div className="fbr-number">
                FBR Invoice No.
                <br />
                <span className="mono">{inv.fbr_invoice_number}</span>
              </div>
            </div>
          ) : (
            <div className="warn">
              NOT SUBMITTED TO FBR
              <br />
              (no invoice number / QR)
            </div>
          )}
        </div>
      </div>

      <p>
        <strong>Buyer:</strong> {inv.buyer_name}
        {inv.buyer_ntn_cnic && <> — NTN/CNIC: {inv.buyer_ntn_cnic}</>}
      </p>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>HS code</th>
              <th>Qty</th>
              <th>UOM</th>
              <th>Unit price</th>
              <th>Rate</th>
              <th>Excl. ST</th>
              {showDiscountCol && <th>Discount</th>}
              <th>Sales tax</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>
                  <span className="strong">{it.product_description}</span>
                </td>
                <td className="mono">{it.hs_code}</td>
                <td>{it.quantity}</td>
                <td>{it.uom}</td>
                <td>{it.unit_price.toLocaleString()}</td>
                <td>{it.rate}</td>
                <td>
                  {it.displayExcl.toLocaleString()}
                  {it.fixed_notified_value > 0 && <sup>*</sup>}
                </td>
                {showDiscountCol && (
                  <td>
                    {it.displayDiscount > 0 ? `−${it.displayDiscount.toLocaleString()}` : '—'}
                  </td>
                )}
                <td>{it.sales_tax.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {usesFixedValue && (
        <p className="muted" style={{ marginTop: 8, fontSize: '0.78rem' }}>
          * 3rd Schedule item — taxed on the government-notified retail price, not the sale
          value.
        </p>
      )}

      <div className="totals">
        <div className="totals-box">
          <div className="trow">
            <span>{showDiscountCol ? 'Subtotal (excl. ST)' : 'Total (excl. ST)'}</span>
            <span>{displayTotalExcl.toLocaleString()}</span>
          </div>
          {showDiscountCol && (
            <div className="trow">
              <span>Discount</span>
              <span>−{totalDiscount.toLocaleString()}</span>
            </div>
          )}
          <div className="trow">
            <span>Sales tax</span>
            <span>{inv.total_tax.toLocaleString()}</span>
          </div>
          <div className="trow">
            <span>Advance tax</span>
            <span>{(inv.advance_tax || 0).toLocaleString()}</span>
          </div>
          <div className="trow grand">
            <span>Grand total</span>
            <span>{(displayGrandTotal + (inv.advance_tax || 0)).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
