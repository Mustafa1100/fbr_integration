import { useEffect, useState } from 'react'
import { ClipboardCheck, CreditCard, LayoutDashboard, LogOut, Menu, Users, X } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, clearSession, getAdmin } from '../api.js'
import shield from '../assets/shield.png'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/requests', label: 'Item requests', icon: ClipboardCheck, count: true },
  { to: '/plans', label: 'Plans & pricing', icon: CreditCard },
]
const COUNT_POLL_MS = 60_000

// On wide screens the menu is a fixed sidebar. On phones and tablets it
// slides in from the left behind a top bar with a menu button.
export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const admin = getAdmin()
  const [waiting, setWaiting] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  // How many item requests wait for a decision, shown on the menu.
  useEffect(() => {
    const load = () =>
      api
        .get('/api/admin/stats')
        .then((s) => setWaiting(s.pending_item_requests))
        .catch(() => {})
    load()
    const timer = setInterval(load, COUNT_POLL_MS)
    window.addEventListener('requests-changed', load)
    return () => {
      clearInterval(timer)
      window.removeEventListener('requests-changed', load)
    }
  }, [location.pathname])

  // Going to another page closes the slide-in menu.
  useEffect(() => setMenuOpen(false), [location.pathname])

  function logout() {
    clearSession()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="icon-btn light" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <img className="topbar-mark" src={shield} alt="" />
        <span className="topbar-title">POS admin</span>
        {waiting > 0 && (
          <NavLink to="/requests" className="nav-count" title="Item requests waiting">
            {waiting}
          </NavLink>
        )}
      </header>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <img className="brand-mark" src={shield} alt="" />
          <div className="grow">
            <div className="t1">Compliance</div>
            <div className="t2">Pakistan</div>
            <div className="t3">POS admin</div>
          </div>
          <button type="button" className="icon-btn light menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <nav>
          {NAV.map(({ to, label, icon: Icon, end, count }) => (
            <NavLink key={to} to={to} end={end} className="nav-item">
              <Icon size={18} />
              <span>{label}</span>
              {count && waiting > 0 && <span className="nav-count">{waiting}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="grow">
            <div className="status-text">{admin?.full_name}</div>
            <div className="status-hint">{admin?.email}</div>
          </div>
          <button type="button" className="icon-btn light" onClick={logout} title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
