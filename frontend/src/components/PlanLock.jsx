import { ExternalLink, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fmtDate } from '../planDates'

const CONTACT_URL = 'https://compliance.pk/contact'

// Menu names, so the card can say which page is locked.
const PAGE_NAMES = [
  ['/invoices/print', 'Print Receipts'],
  ['/invoices/', 'This invoice'],
  ['/invoices', 'Invoices History'],
  ['/uploads', 'Generate Invoices'],
  ['/products', 'Products'],
  ['/customers', 'Customers'],
  ['/columns', 'Column Guide'],
  ['/settings', 'Settings'],
]

function pageName(pathname) {
  const hit = PAGE_NAMES.find(([prefix]) => pathname.startsWith(prefix))
  return hit ? hit[1] : 'This page'
}

// Shown instead of a page while the plan is expired. The blurred
// background is a placeholder — the real page (and its data) never loads.
export function PlanLockedPage({ plan, pathname = '' }) {
  return (
    <div className="plan-locked">
      <div className="plan-locked-bg" aria-hidden="true">
        <div className="pl-title" />
        <div className="pl-sub" />
        <div className="pl-card">
          {Array.from({ length: 7 }, (_, i) => (
            <div className="pl-row" key={i}>
              <span style={{ width: '18%' }} />
              <span style={{ width: '30%' }} />
              <span style={{ width: '14%' }} />
              <span style={{ width: '20%' }} />
            </div>
          ))}
        </div>
      </div>

      <div className="plan-locked-wrap">
        <div className="plan-locked-content" role="alert">
          <div className="plan-locked-icon">
            <Lock size={24} />
          </div>
          <h2>{pageName(pathname)} is locked</h2>
          <p>
            Your plan expired{plan?.ends_on ? ` on ${fmtDate(plan.ends_on)}` : ''}.
            <br />
            Please contact your administrator to renew the plan.
          </p>
          <a className="btn btn-primary" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
            Contact us to renew <ExternalLink size={15} />
          </a>
          <div>
            <Link to="/dashboard" className="plan-locked-back">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
