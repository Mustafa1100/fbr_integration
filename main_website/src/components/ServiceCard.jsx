import { Link } from 'react-router-dom'
import { ArrowRight, Check, CheckCircle2, Loader } from 'lucide-react'
import Reveal from './Reveal'
import mark from '../assets/mark-reverse.png'

export default function ServiceCard({ service, featured = false, delay = 0, className = '' }) {
  const Icon = service.icon
  const live = service.status === 'flagship'

  const body = (
    <>
      {featured && <img className="scard__mark" src={mark} alt="" aria-hidden="true" />}
      <div className="scard__top">
        <span className="scard__icon">
          <Icon size={featured ? 28 : 24} />
        </span>
        <span className={`tag ${live ? 'tag--gold' : 'tag--muted'}`}>
          {live ? 'Flagship service' : 'Coming soon'}
        </span>
      </div>
      <h3 className={featured ? 'h3 scard__title scard__title--lg' : 'h3 scard__title'}>
        {service.title}
      </h3>
      <p className="scard__text">{service.short}</p>
      {(featured || service.points) && (
        <ul className="scard__points">
          {service.points.map((p) => (
            <li key={p}>
              <Check size={16} /> {p}
            </li>
          ))}
        </ul>
      )}
      {featured && (
        <div className="scard__demo" aria-hidden="true">
          <div>
            <b>POS-1040</b>
            <span className="pill pill--ok">
              <CheckCircle2 size={13} /> Accepted by FBR
            </span>
          </div>
          <div>
            <b>POS-1041</b>
            <span className="pill pill--ok">
              <CheckCircle2 size={13} /> Accepted by FBR
            </span>
          </div>
          <div>
            <b>POS-1042</b>
            <span className="pill pill--busy">
              <Loader size={13} /> Sending
            </span>
          </div>
        </div>
      )}
      {service.to && (
        <span className="scard__link">
          {featured ? 'Explore FBR Digital Invoicing' : 'Learn more'} <ArrowRight size={18} />
        </span>
      )}
    </>
  )

  return (
    <Reveal
      delay={delay}
      className={`scard${featured ? ' scard--featured' : ''}${className ? ` ${className}` : ''}`}
    >
      {service.to ? (
        <Link to={service.to} className="scard__inner">
          {body}
        </Link>
      ) : (
        <div className="scard__inner">{body}</div>
      )}
    </Reveal>
  )
}
