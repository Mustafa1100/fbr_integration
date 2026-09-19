import { useState } from 'react'
import { Info } from 'lucide-react'
import Modal from './Modal'

// The small (i) next to the invoice search box: says exactly what the box
// looks at. Keep it in step with query_invoices() in backend/app/routers/invoices.py.
const FIELDS = [
  {
    name: 'POS invoice number',
    what: 'The invoice number from your POS or CSV file.',
    example: 'POS-1001',
  },
  {
    name: 'Customer (buyer) name',
    what: 'Any part of the name. Capital letters don’t matter.',
    example: 'alpha traders',
  },
  {
    name: 'Buyer CNIC or NTN',
    what: 'The buyer’s CNIC or NTN, whole or in part. Dashes and spaces don’t matter, so both spellings find the same invoice.',
    example: '12345-1234567-1  or  1234512345671',
  },
  {
    name: 'FBR invoice number',
    what: 'The whole number, or any part of it — including just the beginning. FBR numbers start with the seller’s own CNIC/NTN, so typing the start of that matches your invoices.',
    example: '9999999999999DIABC123XYZ456,  99999  or  ABC123',
  },
]

export default function SearchHelp() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm has-tip"
        onClick={() => setOpen(true)}
        data-tip="What can I search?"
        aria-label="What can I search for?"
      >
        <Info size={16} />
      </button>

      {open && (
        <Modal title="What you can search" onClose={() => setOpen(false)} width={540}>
          <p className="muted" style={{ marginTop: 0 }}>
            One box searches all of these at once — type any part of one:
          </p>
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            {FIELDS.map((f) => (
              <div key={f.name}>
                <strong>{f.name}</strong>
                <div className="muted" style={{ margin: '2px 0 4px' }}>
                  {f.what}
                </div>
                <div>
                  e.g. <code>{f.example}</code>
                </div>
              </div>
            ))}
          </div>
          <div className="alert info" style={{ marginBottom: 0 }}>
            <Info size={17} />
            <span>
              The search looks inside what you have selected — the <strong>Live / Test</strong>{' '}
              choice at the top, the status and the dates. If an invoice isn’t showing up, check
              those first. It doesn’t search item names, amounts or the seller’s details.
            </span>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={() => setOpen(false)}>
              Got it
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
