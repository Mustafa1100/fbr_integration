import { Eye, Scale, ShieldCheck, Sparkles, Target } from 'lucide-react'
import PageHero from '../components/PageHero'
import SectionHead from '../components/SectionHead'
import Reveal from '../components/Reveal'
import CtaBand from '../components/CtaBand'
import mark from '../assets/mark.png'

const values = [
  {
    icon: ShieldCheck,
    title: 'Accuracy first',
    text: 'A wrong filing costs more than a slow one. We check twice and keep the evidence.',
  },
  {
    icon: Sparkles,
    title: 'Make it simple',
    text: 'Regulation is complicated. Using it shouldn’t be. We hide the complexity, not the facts.',
  },
  {
    icon: Scale,
    title: 'Straight talk',
    text: 'We tell you what applies, what doesn’t, and what it will realistically take.',
  },
  {
    icon: Eye,
    title: 'Nothing hidden',
    text: 'Every action is recorded and visible to you. Your history is yours.',
  },
]

export default function About() {
  return (
    <>
      <PageHero
        eyebrow="About us"
        title={
          <>
            Compliance shouldn’t be <em>a full-time job</em>
          </>
        }
        lead="Compliance Pakistan exists to give every Pakistani business the same clarity and confidence that used to be reserved for those with a whole finance department."
      />

      <section className="section">
        <div className="container split split--center">
          <Reveal className="split__visual about__mark">
            <div className="about__badge">
              <img src={mark} alt="Compliance Pakistan shield mark" />
            </div>
          </Reveal>
          <Reveal delay={100} className="split__copy">
            <span className="eyebrow">Why we exist</span>
            <h2 className="h2">
              One place for <em>every obligation</em>
            </h2>
            <p className="lead">
              A business in Pakistan can answer to FBR, PRAL, a provincial revenue authority,
              SECP and more, each with its own portal, its own forms and its own deadlines. The
              rules keep changing, and the penalties for missing one are real.
            </p>
            <p className="lead">
              We’re building one platform that brings those obligations together. It starts with
              FBR Digital Invoicing, the requirement that touches every sale, and grows to cover
              the rest of the compliance calendar.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <div className="duo">
            <Reveal className="duo__card">
              <span className="duo__icon">
                <Target size={26} />
              </span>
              <h3 className="h3">Our mission</h3>
              <p>
                To take the fear and friction out of compliance, so businesses spend their time
                growing instead of filing.
              </p>
            </Reveal>
            <Reveal delay={100} className="duo__card duo__card--dark">
              <span className="duo__icon">
                <Eye size={26} />
              </span>
              <h3 className="h3">Our vision</h3>
              <p>
                One Platform. Every Compliance. A single home for everything a Pakistani business
                owes its regulators.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="What we stand for"
            title={
              <>
                The principles behind <em>the platform</em>
              </>
            }
          />
          <div className="features features--4">
            {values.map((v, i) => {
              const Icon = v.icon
              return (
                <Reveal key={v.title} delay={i * 80} className="feature">
                  <span className="feature__icon">
                    <Icon size={22} />
                  </span>
                  <h3 className="h4">{v.title}</h3>
                  <p>{v.text}</p>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
