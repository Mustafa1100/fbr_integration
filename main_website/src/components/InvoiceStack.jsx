import { CalendarCheck2, CheckCircle2, ShieldCheck } from 'lucide-react'
import PseudoQr from './PseudoQr'
import mark from '../assets/mark.png'

const items = [
  { name: 'Ceramic mug set', qty: 4, amt: '5,000' },
  { name: 'Green tea 500g', qty: 10, amt: '8,500' },
  { name: 'Gift box', qty: 2, amt: '3,000' },
]

// Hero visual: an illustrative FBR receipt with floating status chips.
export default function InvoiceStack() {
  return (
    <div className="stack" aria-hidden="true">
      <div className="stack__glow" />

      <div className="stack__card">
        <div className="stack__card-head">
          <div className="stack__brand">
            <img src={mark} alt="" />
            <div>
              <strong>Tax Invoice</strong>
              <span>Sample Traders (Pvt) Ltd</span>
            </div>
          </div>
          <span className="pill pill--ok">
            <CheckCircle2 size={14} /> Accepted by FBR
          </span>
        </div>

        <div className="stack__meta">
          <div>
            <span>Invoice</span>
            <b>POS-1042</b>
          </div>
          <div>
            <span>Buyer</span>
            <b>Demo Stores</b>
          </div>
          <div>
            <span>Date</span>
            <b>2026-09-22</b>
          </div>
        </div>

        <table className="stack__table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.qty}</td>
                <td>{r.amt}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="stack__totals">
          <div>
            <span>Value excl. tax</span>
            <b>16,500</b>
          </div>
          <div>
            <span>Sales tax 18%</span>
            <b>2,970</b>
          </div>
          <div className="stack__total">
            <span>Total (PKR)</span>
            <b>19,470</b>
          </div>
        </div>

        <div className="stack__foot">
          <div>
            <span>FBR invoice no.</span>
            <b>SAMPLE-DI-000123</b>
          </div>
          <PseudoQr size={64} seed={11} />
        </div>
      </div>

      <div className="chip chip--a">
        <span className="chip__icon chip__icon--gold">
          <CalendarCheck2 size={18} />
        </span>
        <div>
          <b>Sales tax return</b>
          <span>Ready to file</span>
        </div>
      </div>

      <div className="chip chip--b">
        <span className="chip__icon chip__icon--green">
          <ShieldCheck size={18} />
        </span>
        <div>
          <b>12 of 12 validated</b>
          <span>Batch sent to FBR</span>
        </div>
      </div>

      <p className="stack__caption">Illustrative sample</p>
    </div>
  )
}
