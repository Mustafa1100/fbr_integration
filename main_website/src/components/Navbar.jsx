import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ArrowRight, Menu, X } from 'lucide-react'
import Logo from './Logo'
import useScrolled from '../hooks/useScrolled'
import { navLinks, site } from '../data/site'

export default function Navbar() {
  const scrolled = useScrolled()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className={`nav${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      {/* backdrop-filter lives on this inner bar, not on <header>: it creates a CSS
          containing block for position:fixed descendants, which would otherwise
          confine .nav__sheet's "fixed to the viewport" sizing to the header's own
          (short) box instead of the full screen. */}
      <div className="nav__bar">
        <div className="container nav__inner">
          <Logo variant="dark" />

          <nav className="nav__links" aria-label="Main">
            {navLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className="nav__link">
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="nav__actions">
            {site.appUrl && (
              <a href={site.appUrl} className="nav__login">
                Client login
              </a>
            )}
            <Link to="/contact" className="btn btn--primary btn--sm">
              Get started <ArrowRight size={16} />
            </Link>
          </div>

          <button
            type="button"
            className="nav__toggle"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <div className="nav__sheet" aria-hidden={!open}>
        <nav className="container nav__sheet-links" aria-label="Mobile">
          {navLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="nav__sheet-link">
              {l.label}
            </NavLink>
          ))}
          <div className="nav__sheet-cta">
            <Link to="/contact" className="btn btn--primary btn--lg">
              Get started <ArrowRight size={18} />
            </Link>
            {site.appUrl && (
              <a href={site.appUrl} className="btn btn--ghost btn--lg">
                Client login
              </a>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
