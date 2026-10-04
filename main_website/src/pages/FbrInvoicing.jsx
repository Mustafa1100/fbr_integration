import { Link } from 'react-router-dom'
import {
  ArrowRight,
  FilePlus2,
  FileSpreadsheet,
  FlaskConical,
  FolderLock,
  History,
  ListChecks,
  Printer,
  RefreshCcw,
} from 'lucide-react'
import PageHero from '../components/PageHero'
import SectionHead from '../components/SectionHead'
import Reveal from '../components/Reveal'
import FbrFlow from '../components/FbrFlow'
import Faq from '../components/Faq'
import CtaBand from '../components/CtaBand'
import { fbrFaqs } from '../data/faqs'

const features = [
  {
    icon: FileSpreadsheet,
    title: 'Bulk CSV or Excel upload',
    text: 'Export from your POS, upload the file once, and every invoice in it is validated and submitted.',
  },
  {
    icon: FilePlus2,
    title: 'Manual invoices',
    text: 'Need to issue one invoice right now? Enter it by hand with a built-in HS code picker.',
  },
  {
    icon: ListChecks,
    title: 'Pre-submission validation',
    text: 'Missing buyer details, wrong rates and bad HS codes are flagged before FBR ever sees them.',
  },
  {
    icon: Printer,
    title: 'QR receipts',
    text: 'Print a receipt with the FBR invoice number and QR code, or all of a customer’s receipts as one PDF.',
  },
  {
    icon: RefreshCcw,
    title: 'One-click retry',
    text: 'Fix a rejected invoice and resubmit it, or retry a whole failed file in one go.',
  },
  {
    icon: History,
    title: 'Searchable history',
    text: 'Find any invoice by POS number, customer, CNIC or NTN, or FBR invoice number.',
  },
  {
    icon: FlaskConical,
    title: 'Sandbox to production',
    text: 'Sandbox scenarios SN001–SN028 are supported, so you can finish FBR’s testing and go live with confidence.',
  },
  {
    icon: FolderLock,
    title: 'Complete audit trail',
    text: 'Every request and FBR response is stored. Deletions are soft, so nothing is ever erased.',
  },
]

const columns = [
  { name: 'pos_invoice_no', req: true },
  { name: 'invoice_date', req: true, hint: 'YYYY-MM-DD' },
  { name: 'product_description', req: true },
  { name: 'hs_code', req: true },
  { name: 'quantity', req: true },
  { name: 'unit_price', req: true },
  { name: 'buyer_ntn_cnic' },
  { name: 'buyer_name' },
  { name: 'rate' },
  { name: 'uom' },
  { name: 'sale_type' },
  { name: 'scenario_id' },
]

const onboarding = [
  {
    title: 'Be registered',
    text: 'Your business needs an NTN and STRN and an IRIS login. Not there yet? We can help with that too.',
  },
  {
    title: 'Get a sandbox token',
    text: 'Request it in IRIS under Digital Invoicing. PRAL provisions it and whitelists your static IP. We guide you through it.',
  },
  {
    title: 'Pass scenario testing',
    text: 'Run the FBR scenarios that apply to your business, from SN001 to SN028, and confirm each result.',
  },
  {
    title: 'Go live',
    text: 'Request your production token, switch the environment, and start issuing real invoices.',
  },
]

export default function FbrInvoicing() {
  return (
    <>
      <PageHero
        eyebrow="Flagship service"
        title={
          <>
            FBR Digital Invoicing, <em>without the friction</em>
          </>
        }
        lead="Report every sale to FBR through the PRAL Digital Invoicing API, from a bulk upload or a single invoice, and give customers a QR-coded receipt."
      >
        <div className="page-hero__cta">
          <Link to="/contact" className="btn btn--gold btn--lg">
            Get set up <ArrowRight size={18} />
          </Link>
          <a href="#how-it-works" className="btn btn--outline-light btn--lg">
            See how it works
          </a>
        </div>
      </PageHero>

      <section className="section" id="how-it-works">
        <div className="container">
          <SectionHead
            eyebrow="How it works"
            title={
              <>
                Four steps from sale <em>to receipt</em>
              </>
            }
            lead="Pick a step to see what it looks like. Everything shown uses sample data."
          />
          <Reveal>
            <FbrFlow tone="light" />
          </Reveal>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <SectionHead
            eyebrow="Features"
            title={
              <>
                Everything you need to <em>invoice compliantly</em>
              </>
            }
          />
          <div className="features">
            {features.map((f, i) => {
              const Icon = f.icon
              return (
                <Reveal key={f.title} delay={(i % 4) * 70} className="feature">
                  <span className="feature__icon">
                    <Icon size={22} />
                  </span>
                  <h3 className="h4">{f.title}</h3>
                  <p>{f.text}</p>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <section className="section section--dark spotlight">
        <div className="spotlight__glow" aria-hidden="true" />
        <div className="container split">
          <Reveal className="split__copy">
            <span className="eyebrow eyebrow--light">The CSV template</span>
            <h2 className="h2">
              One row per product line. <em>We do the rest.</em>
            </h2>
            <p className="lead lead--light">
              Rows that share a POS invoice number become a single invoice. Only six columns are
              required, and the optional ones fall back to sensible defaults. A ready-made template
              and a column guide in English, Urdu and Sindhi are built into the app.
            </p>
          </Reveal>
          <Reveal delay={120} className="split__visual">
            <div className="cols">
              <div className="cols__bar">
                <span />
                <span />
                <span />
                <b>sales-template.csv</b>
              </div>
              <ul>
                {columns.map((c) => (
                  <li key={c.name} className={c.req ? 'is-req' : ''}>
                    <code>{c.name}</code>
                    {c.hint && <em>{c.hint}</em>}
                    <span>{c.req ? 'required' : 'optional'}</span>
                  </li>
                ))}
              </ul>
              <p className="cols__more">Plus optional buyer address, discount and tax columns.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container container--narrow">
          <SectionHead
            eyebrow="Going live"
            title={
              <>
                From zero to production, <em>with us alongside</em>
              </>
            }
            lead="FBR’s onboarding has a few gates. We walk you through each one so you’re never guessing."
          />
          <ol className="roadmap">
            {onboarding.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 90} className="roadmap__item">
                <span className="roadmap__dot roadmap__dot--n">{i + 1}</span>
                <div>
                  <h3 className="h3">{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container container--narrow">
          <SectionHead eyebrow="FAQ" title={<>Digital invoicing, <em>answered</em></>} />
          <Reveal>
            <Faq items={fbrFaqs} />
          </Reveal>
        </div>
      </section>

      <CtaBand
        title="Start invoicing the FBR way"
        lead="Tell us about your business and we’ll set up your account, connect it to FBR’s sandbox and get you testing."
      />
    </>
  )
}
