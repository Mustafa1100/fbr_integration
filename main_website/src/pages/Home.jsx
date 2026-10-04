import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Briefcase,
  Check,
  Compass,
  Factory,
  FolderLock,
  Handshake,
  Layers,
  ShoppingBag,
  Store,
  Stethoscope,
  Truck,
  UtensilsCrossed,
} from 'lucide-react'
import Reveal from '../components/Reveal'
import SectionHead from '../components/SectionHead'
import ServiceCard from '../components/ServiceCard'
import InvoiceStack from '../components/InvoiceStack'
import FbrFlow from '../components/FbrFlow'
import CountUp from '../components/CountUp'
import Faq from '../components/Faq'
import CtaBand from '../components/CtaBand'
import { services } from '../data/services'
import { regulators } from '../data/site'
import { homeFaqs } from '../data/faqs'

const why = [
  {
    icon: Layers,
    title: 'One platform, not five portals',
    text: 'Invoicing, filings and deadlines live together, so nothing falls between the cracks of different tools and different advisers.',
  },
  {
    icon: Compass,
    title: 'Built for how Pakistan files',
    text: 'IRIS, PRAL, provincial authorities and SECP each work differently. We already speak all of them.',
  },
  {
    icon: FolderLock,
    title: 'Audit-ready by default',
    text: 'Every request and every response is kept against your account, so answering an auditor is a search, not a scramble.',
  },
  {
    icon: Handshake,
    title: 'Real people behind the software',
    text: 'When a rule is unclear or a filing is rejected, you talk to someone who can fix it, not a ticket queue.',
  },
]

const stats = [
  { n: 28, suffix: '', label: 'FBR sandbox scenarios supported (SN001–SN028)' },
  { n: 100, suffix: '%', label: 'of requests and FBR responses kept for audit' },
  { n: 2, suffix: '', label: 'ways to invoice: bulk upload or one at a time' },
  { n: 1, suffix: '-click', label: 'retry for any invoice FBR rejects' },
]

const audiences = [
  { icon: Store, label: 'Retail & POS' },
  { icon: Factory, label: 'Manufacturers' },
  { icon: Truck, label: 'Distributors' },
  { icon: UtensilsCrossed, label: 'Restaurants' },
  { icon: ShoppingBag, label: 'E-commerce' },
  { icon: Stethoscope, label: 'Pharma & healthcare' },
  { icon: Briefcase, label: 'Service firms' },
]

const steps = [
  {
    title: 'Tell us about your business',
    text: 'Share your NTN, sector and the systems you sell through. We confirm which obligations apply to you.',
  },
  {
    title: 'We set up and connect',
    text: 'Your account is created, connected to FBR’s sandbox and tested with your own data before anything goes live.',
  },
  {
    title: 'You stay compliant',
    text: 'Submit invoices, track filings and get reminders in one place, with people on hand when you need them.',
  },
]

export default function Home() {
  const [featured, ...others] = services

  return (
    <>
      {/* ───────── Hero ───────── */}
      <section className="hero">
        <div className="hero__bg" aria-hidden="true">
          <span className="orb orb--green" />
          <span className="orb orb--gold" />
          <span className="hero__grid" />
        </div>

        <div className="container hero__inner">
          <div className="hero__copy">
            <Reveal>
              <Link to="/services/fbr-digital-invoicing" className="badge">
                <span className="badge__dot" />
                Introducing FBR Digital Invoicing
                <ArrowRight size={15} />
              </Link>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="h1 hero__title">
                One platform.
                <br />
                <span className="grad-text">Every compliance.</span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="lead hero__lead">
                From FBR digital invoicing to tax filings and corporate paperwork, Compliance
                Pakistan takes the forms, the deadlines and the penalties off your plate, so you
                can get on with running your business.
              </p>
            </Reveal>

            <Reveal delay={240} className="hero__cta">
              <Link to="/services/fbr-digital-invoicing" className="btn btn--primary btn--lg">
                Explore FBR Digital Invoicing <ArrowRight size={18} />
              </Link>
              <Link to="/contact" className="btn btn--ghost btn--lg">
                Talk to our team
              </Link>
            </Reveal>

            <Reveal delay={320}>
              <ul className="hero__trust">
                <li>
                  <Check size={16} /> Built for Pakistani businesses
                </li>
                <li>
                  <Check size={16} /> Sandbox-tested before go-live
                </li>
                <li>
                  <Check size={16} /> Audit-ready records
                </li>
              </ul>
            </Reveal>
          </div>

          <Reveal delay={200} className="hero__visual">
            <InvoiceStack />
          </Reveal>
        </div>
      </section>

      {/* ───────── Regulators marquee ───────── */}
      <section className="marquee" aria-label="Authorities we keep you compliant with">
        <p className="marquee__label">Keeping you in step with</p>
        <div className="marquee__track">
          {[0, 1].map((dup) => (
            <ul key={dup} className="marquee__row" aria-hidden={dup === 1}>
              {regulators.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      {/* ───────── Services ───────── */}
      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="Our services"
            title={
              <>
                Everything a Pakistani business owes,{' '}
                <em>in one place</em>
              </>
            }
            lead="We start with FBR digital invoicing and are building out the rest of your compliance calendar alongside it."
          />

          <div className="bento">
            <ServiceCard service={featured} featured className="bento__hero" />
            {others.map((s, i) => (
              <ServiceCard key={s.slug} service={s} delay={(i % 3) * 80} />
            ))}
          </div>
        </div>
      </section>

      {/* ───────── FBR spotlight ───────── */}
      <section className="section section--dark spotlight">
        <div className="spotlight__glow" aria-hidden="true" />
        <div className="container">
          <SectionHead
            eyebrow="Flagship · FBR Digital Invoicing"
            title={
              <>
                From spreadsheet to FBR receipt,{' '}
                <em>in four steps</em>
              </>
            }
            lead="Upload your sales, let us validate and submit them through PRAL, and hand customers a QR-coded receipt."
            tone="light"
          />
          <Reveal>
            <FbrFlow />
          </Reveal>
          <Reveal className="spotlight__more">
            <Link to="/services/fbr-digital-invoicing" className="btn btn--gold btn--lg">
              See everything it does <ArrowRight size={18} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ───────── Why us ───────── */}
      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="Why Compliance Pakistan"
            title={
              <>
                Less paperwork. Fewer penalties.{' '}
                <em>More time for the business.</em>
              </>
            }
          />
          <div className="why">
            {why.map((w, i) => {
              const Icon = w.icon
              return (
                <Reveal key={w.title} delay={i * 80} className="why__card">
                  <span className="why__icon">
                    <Icon size={24} />
                  </span>
                  <h3 className="h3">{w.title}</h3>
                  <p>{w.text}</p>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ───────── Numbers ───────── */}
      <section className="stats">
        <div className="container stats__grid">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 80} className="stats__item">
              <b className="stats__n">
                <CountUp to={s.n} suffix={s.suffix} />
              </b>
              <span>{s.label}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Who it's for ───────── */}
      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="Who it’s for"
            title={
              <>
                If you sell in Pakistan,{' '}
                <em>we’ve got you covered</em>
              </>
            }
            lead="From a single-outlet shop to a multi-branch manufacturer, if you issue invoices and file with the authorities, this is built for you."
          />
          <div className="aud">
            {audiences.map((a, i) => {
              const Icon = a.icon
              return (
                <Reveal key={a.label} delay={i * 50} className="aud__item">
                  <Icon size={22} />
                  <span>{a.label}</span>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ───────── Steps ───────── */}
      <section className="section section--tint">
        <div className="container">
          <SectionHead eyebrow="Getting started" title={<>Up and running in <em>three steps</em></>} />
          <ol className="steps">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 100} className="steps__item">
                <span className="steps__n">{i + 1}</span>
                <h3 className="h3">{s.title}</h3>
                <p>{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section className="section">
        <div className="container container--narrow">
          <SectionHead eyebrow="Questions" title={<>Good questions, <em>straight answers</em></>} />
          <Reveal>
            <Faq items={homeFaqs} />
          </Reveal>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
