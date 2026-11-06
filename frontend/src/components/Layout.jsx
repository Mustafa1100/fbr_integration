import {
  BookOpenText,
  CopyCheck,
  FlaskConical,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Package,
  Contact,
  ReceiptText,
  Server,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, clearSession, getStoredUser, PLAN_EVENT, storePlan } from '../api'
import { PlanLockedPage } from './PlanLock'
import Modal from './Modal'
import markReverse from '../assets/mark-reverse.png'
import mark from '../assets/mark.png'

const COLLAPSE_KEY = 'fbr_sidebar_collapsed'
const MOBILE_QUERY = '(max-width: 768px)'

function initials(name = '') {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?'
  )
}

export default function Layout() {
  const user = getStoredUser()
  const navigate = useNavigate()
  const location = useLocation()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [plan, setPlan] = useState(() => user?.plan || null)
  const isBusinessUser = user?.role === 'user'
  const locked = isBusinessUser && plan?.status === 'expired'

  useEffect(() => {
    const onPlan = (e) => setPlan(e.detail)
    window.addEventListener(PLAN_EVENT, onPlan)
    return () => window.removeEventListener(PLAN_EVENT, onPlan)
  }, [])

  // Re-check the plan on every page change, so a renewal or extension
  // unlocks the screens (and an expiry locks them) without signing in again.
  useEffect(() => {
    if (!isBusinessUser) return
    api
      .get('/api/auth/me')
      .then((me) => {
        if (JSON.stringify(me.plan) !== JSON.stringify(getStoredUser()?.plan)) storePlan(me.plan)
      })
      .catch(() => {})
  }, [location.pathname, isBusinessUser])

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // Picking a nav link should close the drawer instead of leaving it open
  // over the newly-navigated page.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  function logout() {
    clearSession()
    navigate('/login')
  }

  // One button, two jobs depending on viewport: collapses/expands the
  // icon-only desktop sidebar, or opens/closes the mobile slide-over.
  function toggleSidebar() {
    if (isMobile) {
      setMobileOpen((v) => !v)
      return
    }
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  const link = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`
  // The mobile drawer always shows full labels — the desktop "collapsed"
  // icon-only look doesn't apply once the sidebar is off-canvas.
  const sidebarClass = `sidebar${collapsed && !isMobile ? ' collapsed' : ''}${
    mobileOpen ? ' mobile-open' : ''
  }`

  return (
    <div className="app-shell">
      <aside className={sidebarClass}>
        <div className="sidebar-logo">
          <img className="brand-mark" src={markReverse} alt="" />
          <div className="logo-text">
            <div className="t1">
              Compliance<b>.pk</b>
            </div>
            <div className="t2">Digital Invoicing</div>
          </div>
        </div>

        {user?.role === 'admin' ? (
          <>
            <NavLink to="/admin" end className={link} title="Dashboard">
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/admin/users" className={link} title="Users">
              <Users size={18} />
              <span>Users</span>
            </NavLink>
            <NavLink to="/admin/admins" className={link} title="Admins">
              <ShieldCheck size={18} />
              <span>Admins</span>
            </NavLink>
            <NavLink to="/admin/uploads" className={link} title="Upload History">
              <History size={18} />
              <span>Upload History</span>
            </NavLink>
            <NavLink to="/admin/invoices" className={link} title="Invoices">
              <ReceiptText size={18} />
              <span>Invoices</span>
            </NavLink>
            <NavLink to="/admin/scenarios" className={link} title="Scenario Testing Guide">
              <FlaskConical size={18} />
              <span>Scenario Testing Guide</span>
            </NavLink>
            <NavLink to="/admin/columns" className={link} title="Column Guide">
              <BookOpenText size={18} />
              <span>Column Guide</span>
            </NavLink>
            <NavLink to="/admin/server-info" className={link} title="Server / IP Info">
              <Server size={18} />
              <span>Server / IP Info</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/dashboard" className={link} title="Dashboard">
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/uploads" className={link} title="Generate Invoices">
              <CopyCheck size={18} />
              <span>Generate Invoices</span>
              {locked && <Lock size={13} className="nav-lock" />}
            </NavLink>
            <NavLink to="/invoices" className={link} title="Invoices History">
              <ReceiptText size={18} />
              <span>Invoices History</span>
              {locked && <Lock size={13} className="nav-lock" />}
            </NavLink>
            <NavLink to="/products" className={link} title="Products">
              <Package size={18} />
              <span>Products</span>
              {locked && <Lock size={13} className="nav-lock" />}
            </NavLink>
            <NavLink to="/customers" className={link} title="Customers">
              <Contact size={18} />
              <span>Customers</span>
              {locked && <Lock size={13} className="nav-lock" />}
            </NavLink>
            <NavLink to="/columns" className={link} title="Column Guide">
              <BookOpenText size={18} />
              <span>Column Guide</span>
              {locked && <Lock size={13} className="nav-lock" />}
            </NavLink>
            <NavLink to="/settings" className={link} title="Settings">
              <Settings size={18} />
              <span>Settings</span>
              {locked && <Lock size={13} className="nav-lock" />}
            </NavLink>
          </>
        )}

        <div className="sidebar-footer">
          <div className="avatar">{initials(user?.full_name)}</div>
          <div className="user-meta">
            <div className="name">{user?.full_name}</div>
            <div className="role">{user?.role}</div>
          </div>
          <button
            className="logout-btn"
            onClick={() => {
              // Close the mobile drawer first — otherwise it sits on top of
              // (and hides) the confirmation modal.
              setMobileOpen(false)
              setConfirmLogout(true)
            }}
            title="Sign out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

      <div className="content">
        <div className="topbar">
          <div className="topbar-brand">
            <img className="brand-mark" src={mark} alt="" />
            <span>
              Compliance<b>.pk</b>
            </span>
          </div>
          <button
            type="button"
            className="topbar-toggle"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            title={isMobile ? 'Open menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu size={19} />
          </button>
        </div>
        <div className="page">
          {locked && location.pathname !== '/dashboard' ? <PlanLockedPage plan={plan} pathname={location.pathname} /> : <Outlet />}
        </div>
      </div>

      {confirmLogout && (
        <Modal title="Sign out?" onClose={() => setConfirmLogout(false)} width={380}>
          <p className="muted" style={{ margin: '0 0 20px' }}>
            You&apos;ll need to sign in again to get back to your dashboard.
          </p>
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setConfirmLogout(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={logout}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
