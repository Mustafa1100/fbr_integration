import Reveal from './Reveal'

// tone="light" is for use on dark sections.
export default function SectionHead({ eyebrow, title, lead, align = 'center', tone = 'dark', children }) {
  return (
    <Reveal className={`section-head section-head--${align} section-head--${tone}`}>
      {eyebrow && <span className={`eyebrow${tone === 'light' ? ' eyebrow--light' : ''}`}>{eyebrow}</span>}
      <h2 className="h2">{title}</h2>
      {lead && <p className="lead">{lead}</p>}
      {children}
    </Reveal>
  )
}
