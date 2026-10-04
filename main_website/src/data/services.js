import {
  ReceiptText,
  Landmark,
  BadgePercent,
  MapPinned,
  Building2,
  CalendarClock,
} from 'lucide-react'

// status: 'flagship' = the service we run today · 'soon' = on the roadmap
export const services = [
  {
    slug: 'fbr-digital-invoicing',
    to: '/services/fbr-digital-invoicing',
    icon: ReceiptText,
    status: 'flagship',
    title: 'FBR Digital Invoicing',
    short:
      'Report every sale to FBR through the PRAL Digital Invoicing API and hand your customer a QR-coded receipt — from a bulk upload or a single invoice.',
    points: [
      'Bulk CSV / Excel upload or manual entry',
      'Validated against FBR rules before submission',
      'FBR invoice number + printable QR receipt',
      'Retry failures, full audit trail',
    ],
  },
  {
    slug: 'tax-registration-returns',
    icon: Landmark,
    status: 'soon',
    title: 'Tax Registration & Returns',
    short:
      'NTN and STRN registration, monthly sales tax returns and annual income tax returns, prepared and filed on IRIS.',
    points: ['NTN / STRN registration', 'Sales tax returns', 'Annual income tax returns'],
  },
  {
    slug: 'withholding-payroll',
    icon: BadgePercent,
    status: 'soon',
    title: 'Withholding & Payroll Tax',
    short:
      'Withholding tax statements, salary tax deductions and payroll-linked filings such as EOBI, handled on schedule.',
    points: ['Withholding statements', 'Salary tax', 'EOBI & social security'],
  },
  {
    slug: 'provincial-sales-tax',
    icon: MapPinned,
    status: 'soon',
    title: 'Provincial Sales Tax',
    short:
      'Registration and returns with the provincial revenue authorities for businesses that sell services.',
    points: ['SRB · PRA · KPRA · BRA', 'Registration', 'Monthly returns'],
  },
  {
    slug: 'secp-corporate-filings',
    icon: Building2,
    status: 'soon',
    title: 'SECP & Corporate Filings',
    short:
      'Company incorporation, annual returns and statutory changes with SECP, without chasing paperwork.',
    points: ['Incorporation', 'Annual returns', 'Director & share changes'],
  },
  {
    slug: 'deadlines-alerts',
    icon: CalendarClock,
    status: 'soon',
    title: 'Deadlines & Alerts',
    short:
      'One calendar for every due date across every authority, with reminders before a penalty becomes possible.',
    points: ['Unified compliance calendar', 'Reminders', 'Regulatory updates'],
  },
]

export const flagship = services[0]
