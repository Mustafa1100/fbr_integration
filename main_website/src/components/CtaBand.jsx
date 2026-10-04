import { Link } from 'react-router-dom'
import { ArrowRight, Mail } from 'lucide-react'
import Reveal from './Reveal'
import mark from '../assets/mark-reverse.png'
import { site } from '../data/site'

export default function CtaBand({
  title = 'Ready to make compliance the easy part?',
  lead = 'Tell us about your business and we’ll show you what applies, what’s due, and how quickly you can be set up.',
}) {
  return (
    <section className="section cta-section">
      <div className="container">
        <Reveal className="cta">
          <img className="cta__mark" src={mark} alt="" aria-hidden="true" />
          <div className="cta__body">
            <h2 className="h2 cta__title">{title}</h2>
            <p className="lead lead--light">{lead}</p>
          </div>
          <div className="cta__actions">
            <Link to="/contact" className="btn btn--gold btn--lg">
              Talk to our team <ArrowRight size={18} />
            </Link>
            <a href={`mailto:${site.email}`} className="btn btn--outline-light btn--lg">
              <Mail size={18} /> {site.email}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
