import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  Printer,
  Send,
  UploadCloud,
} from 'lucide-react'
import PseudoQr from './PseudoQr'

const INTERVAL = 5200

const csvRows = [
  ['POS-1001', '2026-09-22', 'Ceramic mug set', '6912.0000', '4', '1250'],
  ['POS-1001', '2026-09-22', 'Green tea 500g', '0902.3000', '10', '850'],
  ['POS-1002', '2026-09-22', 'Gift box', '4819.2000', '2', '1500'],
  ['POS-1003', '2026-09-22', 'Cotton tote bag', '4202.2200', '6', '640'],
]

function UploadPanel() {
  return (
    <div className="panel">
      <div className="panel__bar">
        <span className="panel__file">
          <UploadCloud size={16} /> sales-export.csv
        </span>
        <span className="pill pill--soft">4 rows · 3 invoices</span>
      </div>
      <div className="panel__table-wrap">
        <table className="panel__table">
          <thead>
            <tr>
              <th>pos_invoice_no</th>
              <th>invoice_date</th>
              <th>product_description</th>
              <th>hs_code</th>
              <th>quantity</th>
              <th>unit_price</th>
            </tr>
          </thead>
          <tbody>
            {csvRows.map((r, i) => (
              <tr key={i} style={{ '--i': i }}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel__note">Rows sharing a POS invoice number become one invoice.</p>
    </div>
  )
}

const checks = [
  { ok: true, t: 'Seller profile and FBR token verified' },
  { ok: true, t: 'HS code 0902.3000 found in the FBR catalogue' },
  { ok: true, t: 'Tax rate matches the sale type' },
  { ok: false, t: 'POS-1003: buyer NTN missing — flagged before sending' },
]

function ValidatePanel() {
  return (
    <div className="panel">
      <div className="panel__bar">
        <span className="panel__file">
          <FileCheck2 size={16} /> Pre-submission checks
        </span>
        <span className="pill pill--soft">3 of 4 passed</span>
      </div>
      <ul className="checklist">
        {checks.map((c, i) => (
          <li key={c.t} style={{ '--i': i }} className={c.ok ? 'is-ok' : 'is-warn'}>
            {c.ok ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
            <span>{c.t}</span>
          </li>
        ))}
      </ul>
      <p className="panel__note">Catch problems here, not after FBR has rejected the invoice.</p>
    </div>
  )
}

function SubmitPanel() {
  const rows = [
    ['POS-1001', 'Accepted'],
    ['POS-1002', 'Accepted'],
    ['POS-1003', 'Sending…'],
  ]
  return (
    <div className="panel">
      <div className="panel__bar">
        <span className="panel__file">
          <Send size={16} /> Batch submission
        </span>
        <span className="pill pill--soft">2 of 3</span>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={67} aria-valuemin={0} aria-valuemax={100}>
        <span />
      </div>
      <ul className="checklist checklist--rows">
        {rows.map(([n, s], i) => (
          <li key={n} style={{ '--i': i }} className={s === 'Accepted' ? 'is-ok' : 'is-busy'}>
            <b>{n}</b>
            <span className={`pill ${s === 'Accepted' ? 'pill--ok' : 'pill--busy'}`}>{s}</span>
          </li>
        ))}
      </ul>
      <p className="panel__note">Paced submission with live progress, so FBR is never flooded.</p>
    </div>
  )
}

function ReceiptPanel() {
  return (
    <div className="panel panel--receipt">
      <div className="receipt">
        <div>
          <span className="receipt__label">FBR invoice no.</span>
          <b className="receipt__no">SAMPLE-DI-000123</b>
          <span className="receipt__label">Total (PKR)</span>
          <b className="receipt__total">19,470</b>
          <span className="pill pill--ok">
            <CheckCircle2 size={14} /> Accepted by FBR
          </span>
        </div>
        <PseudoQr size={104} seed={23} />
      </div>
      <div className="receipt__actions">
        <span className="btn btn--primary btn--sm">
          <Printer size={16} /> Print receipt
        </span>
        <span className="btn btn--ghost btn--sm">Print all as PDF</span>
      </div>
    </div>
  )
}

const steps = [
  {
    icon: UploadCloud,
    title: 'Upload',
    text: 'Drop in your POS export as a CSV or Excel file, or key in a single invoice by hand.',
    Panel: UploadPanel,
  },
  {
    icon: FileCheck2,
    title: 'Validate',
    text: 'Each invoice is checked against FBR’s rules before anything is sent.',
    Panel: ValidatePanel,
  },
  {
    icon: Send,
    title: 'Submit',
    text: 'Invoices go to FBR through PRAL in a paced batch, with live progress.',
    Panel: SubmitPanel,
  },
  {
    icon: Printer,
    title: 'Receipt',
    text: 'FBR returns the invoice number; you print a QR-coded receipt.',
    Panel: ReceiptPanel,
  },
]

// tone="light" restyles the stepper for use on a light section.
export default function FbrFlow({ tone = 'dark' }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return undefined
    const id = setTimeout(() => setActive((a) => (a + 1) % steps.length), INTERVAL)
    return () => clearTimeout(id)
  }, [active, paused])

  const { Panel } = steps[active]

  return (
    <div
      className={`flow${tone === 'light' ? ' flow--light' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ol className="flow__steps">
        {steps.map((s, i) => {
          const Icon = s.icon
          return (
            <li key={s.title}>
              <button
                type="button"
                className={`flow__step${i === active ? ' is-active' : ''}${i < active ? ' is-done' : ''}`}
                aria-current={i === active ? 'step' : undefined}
                onClick={() => setActive(i)}
              >
                <span className="flow__num">
                  <Icon size={20} />
                </span>
                <span className="flow__copy">
                  <b>
                    <i>0{i + 1}</i> {s.title}
                  </b>
                  <span>{s.text}</span>
                </span>
                <span
                  className="flow__bar"
                  style={{ '--dur': `${INTERVAL}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                  key={i === active ? `on-${active}` : `off-${i}`}
                />
              </button>
            </li>
          )
        })}
      </ol>

      <div className="flow__stage" aria-live="polite">
        <div className="flow__panel" key={active}>
          <Panel />
        </div>
      </div>
    </div>
  )
}
