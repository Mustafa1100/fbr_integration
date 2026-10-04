import Reveal from './Reveal'
import mark from '../assets/mark-reverse.png'

// Dark inner-page banner with the brand mark as a large watermark.
export default function PageHero({ eyebrow, title, lead, children }) {
  return (
    <section className="page-hero">
      <img className="page-hero__mark" src={mark} alt="" aria-hidden="true" />
      <div className="container page-hero__inner">
        <Reveal>
          {eyebrow && <span className="eyebrow eyebrow--light">{eyebrow}</span>}
          <h1 className="h1 page-hero__title">{title}</h1>
          {lead && <p className="lead lead--light">{lead}</p>}
          {children}
        </Reveal>
      </div>
    </section>
  )
}
