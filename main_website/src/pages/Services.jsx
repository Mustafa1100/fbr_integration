import { Link } from 'react-router-dom'
import { ArrowRight, CircleDot, Clock, MessageSquarePlus, Sparkles } from 'lucide-react'
import PageHero from '../components/PageHero'
import SectionHead from '../components/SectionHead'
import ServiceCard from '../components/ServiceCard'
import Reveal from '../components/Reveal'
import CtaBand from '../components/CtaBand'
import { services } from '../data/services'

const roadmap = [
  {
    icon: Sparkles,
    stage: 'Now',
    title: 'FBR Digital Invoicing',
    text: 'Bulk and manual invoicing through PRAL, validation, QR receipts and a complete submission history.',
    active: true,
  },
  {
    icon: CircleDot,
    stage: 'Next',
    title: 'Tax registration, returns and payroll tax',
    text: 'NTN and STRN registration, sales and income tax returns, and withholding and salary tax.',
  },
  {
    icon: Clock,
    stage: 'Later',
    title: 'Provincial, SECP and the unified calendar',
    text: 'Provincial sales tax, corporate filings, and a single calendar with reminders across every authority.',
  },
]

export default function Services() {
  const [featured, ...others] = services
  return (
    <>
      <PageHero
        eyebrow="Services"
        title={
          <>
            Every filing, <em>one platform</em>
          </>
        }
        lead="We’re building the complete compliance stack for Pakistani businesses, starting with the FBR obligation that touches every sale you make."
      />

      <section className="section">
        <div className="container">
          <ServiceCard service={featured} featured className="scard--wide" />
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <SectionHead
            eyebrow="What’s coming"
            title={
              <>
                The rest of your <em>compliance calendar</em>
              </>
            }
            lead="Each service below joins the same platform, so your invoices, filings and deadlines stay in one place."
          />
          <div className="grid-3">
            {others.map((s, i) => (
              <ServiceCard key={s.slug} service={s} delay={(i % 3) * 80} />
            ))}
            <Reveal delay={160} className="scard scard--ask">
              <Link to="/contact" className="scard__inner">
                <span className="scard__icon">
                  <MessageSquarePlus size={24} />
                </span>
                <h3 className="h3 scard__title">Need something else?</h3>
                <p className="scard__text">
                  Your obligations are unique. Tell us what you’re dealing with and it helps shape
                  what we build next.
                </p>
                <span className="scard__link">
                  Tell us what you need <ArrowRight size={18} />
                </span>
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container container--narrow">
          <SectionHead
            eyebrow="Roadmap"
            title={
              <>
                Where we are, <em>and where we’re heading</em>
              </>
            }
            lead="An indicative order of work. Tell us what matters most to your business and it shapes what we build next."
          />
          <ol className="roadmap">
            {roadmap.map((r, i) => {
              const Icon = r.icon
              return (
                <Reveal as="li" key={r.stage} delay={i * 100} className={`roadmap__item${r.active ? ' is-active' : ''}`}>
                  <span className="roadmap__dot">
                    <Icon size={18} />
                  </span>
                  <div>
                    <span className="roadmap__stage">{r.stage}</span>
                    <h3 className="h3">{r.title}</h3>
                    <p>{r.text}</p>
                  </div>
                </Reveal>
              )
            })}
          </ol>
          <Reveal className="center">
            <Link to="/contact" className="btn btn--primary btn--lg">
              Tell us what you need <ArrowRight size={18} />
            </Link>
          </Reveal>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
