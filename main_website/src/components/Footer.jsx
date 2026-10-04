import { Link } from 'react-router-dom'
import { Mail, MapPin } from 'lucide-react'
import Logo from './Logo'
import { services } from '../data/services'
import { navLinks, site } from '../data/site'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <Logo variant="light" />
            <p className="footer__tagline">{site.tagline}</p>
            <p className="footer__blurb">
              FBR digital invoicing today, tax filings and corporate compliance next — all
              from one platform built for Pakistani businesses.
            </p>
          </div>

          <div>
            <h4 className="footer__h">Services</h4>
            <ul>
              {services.slice(0, 4).map((s) => (
                <li key={s.slug}>
                  {s.to ? <Link to={s.to}>{s.title}</Link> : <Link to="/services">{s.title}</Link>}
                </li>
              ))}
              <li>
                <Link to="/services">All services</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="footer__h">Company</h4>
            <ul>
              {navLinks
                .filter((l) => ['/', '/about', '/contact'].includes(l.to))
                .map((l) => (
                  <li key={l.to}>
                    <Link to={l.to}>{l.label}</Link>
                  </li>
                ))}
              {site.appUrl && (
                <li>
                  <a href={site.appUrl}>Client login</a>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h4 className="footer__h">Get in touch</h4>
            <ul>
              <li>
                <a href={`mailto:${site.email}`} className="footer__contact">
                  <Mail size={16} /> {site.email}
                </a>
              </li>
              <li className="footer__contact">
                <MapPin size={16} /> {site.location}
              </li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <span>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </span>
          <span className="footer__legal">
            FBR, PRAL, IRIS, SECP and other names are trademarks of their respective owners and
            are used for identification only.
          </span>
        </div>
      </div>
    </footer>
  )
}
