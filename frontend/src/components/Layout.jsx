import {
  BookOpenText,
  FlaskConical,
  History,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  ScrollText,
  Settings2,
  ShieldCheck,
  UploadCloud,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearSession, getStoredUser } from '../api'
import Modal from './Modal'

const COLLAPSE_KEY = 'fbr_sidebar_collapsed'

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
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')

  function logout() {
    clearSession()
    navigate('/login')
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  const link = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`

  return (
    <div className="app-shell">
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-mark">
            <ScrollText size={20} />
          </div>
          <div className="logo-text">
            <div className="t1">FBR Invoicing</div>
            <div className="t2">Digital · PRAL</div>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          {!collapsed && <span>Collapse</span>}
        </button>

        <div className="nav-section-label">Menu</div>
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
          </>
        ) : (
          <>
            <NavLink to="/dashboard" className={link} title="Dashboard">
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/uploads" className={link} title="Uploads">
              <UploadCloud size={18} />
              <span>Uploads</span>
            </NavLink>
            <NavLink to="/invoices" className={link} title="Invoices">
              <ReceiptText size={18} />
              <span>Invoices</span>
            </NavLink>
            <NavLink to="/columns" className={link} title="Column Guide">
              <BookOpenText size={18} />
              <span>Column Guide</span>
            </NavLink>
            <NavLink to="/settings" className={link} title="FBR Settings">
              <Settings2 size={18} />
              <span>FBR Settings</span>
            </NavLink>
          </>
        )}

        <div className="sidebar-footer">
          <div className="avatar">{initials(user?.full_name)}</div>
          <div className="user-meta">
            <div className="name">{user?.full_name}</div>
            <div className="role">{user?.role}</div>
          </div>
          <button className="logout-btn" onClick={() => setConfirmLogout(true)} title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <div className="content">
        <div className="page">
          <Outlet />
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
