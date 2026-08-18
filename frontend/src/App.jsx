import { Navigate, Route, Routes } from 'react-router-dom'
import { getStoredUser } from './api'
import Layout from './components/Layout'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminAdmins from './pages/admin/Admins'
import AdminColumnGuide from './pages/admin/ColumnGuide'
import ScenarioGuide from './pages/admin/ScenarioGuide'
import AdminUsers from './pages/admin/Users'
import UserFbrSettings from './pages/admin/UserFbrSettings'
import UserUploads from './pages/admin/UserUploads'
import UserInvoices from './pages/admin/UserInvoices'
import UserInvoiceDetail from './pages/admin/UserInvoiceDetail'
import ColumnGuide from './pages/user/ColumnGuide'
import Dashboard from './pages/user/Dashboard'
import FbrSettings from './pages/user/FbrSettings'
import Invoices from './pages/user/Invoices'
import Receipt from './pages/user/Receipt'
import Uploads from './pages/user/Uploads'

function homeFor(user) {
  return user.role === 'admin' ? '/admin' : '/dashboard'
}

function RequireAuth({ role, children }) {
  const user = getStoredUser()
  if (!user) return <Navigate to="/login" replace />
  // A temporary (admin-issued) password must be replaced before anything
  // else in the app is reachable.
  if (user.must_change_password) return <Navigate to="/set-password" replace />
  if (role && user.role !== role) {
    return <Navigate to={homeFor(user)} replace />
  }
  return children
}

function RequirePendingPasswordChange({ children }) {
  const user = getStoredUser()
  if (!user) return <Navigate to="/login" replace />
  // Already set a real password — nothing to do on this page.
  if (!user.must_change_password) return <Navigate to={homeFor(user)} replace />
  return children
}

export default function App() {
  const user = getStoredUser()
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/set-password"
        element={
          <RequirePendingPasswordChange>
            <SetPassword />
          </RequirePendingPasswordChange>
        }
      />
      <Route
        path="/"
        element={
          user ? (
            <Navigate to={user.must_change_password ? '/set-password' : homeFor(user)} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route element={<Layout />}>
        <Route
          path="/admin"
          element={
            <RequireAuth role="admin">
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAuth role="admin">
              <AdminUsers />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/admins"
          element={
            <RequireAuth role="admin">
              <AdminAdmins />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users/:userId/fbr-settings"
          element={
            <RequireAuth role="admin">
              <UserFbrSettings />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/scenarios"
          element={
            <RequireAuth role="admin">
              <ScenarioGuide />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/columns"
          element={
            <RequireAuth role="admin">
              <AdminColumnGuide />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/uploads"
          element={
            <RequireAuth role="admin">
              <UserUploads />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/invoices"
          element={
            <RequireAuth role="admin">
              <UserInvoices />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/invoices/:userId/:invoiceId"
          element={
            <RequireAuth role="admin">
              <UserInvoiceDetail />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth role="user">
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/uploads"
          element={
            <RequireAuth role="user">
              <Uploads />
            </RequireAuth>
          }
        />
        <Route
          path="/invoices"
          element={
            <RequireAuth role="user">
              <Invoices />
            </RequireAuth>
          }
        />
        <Route
          path="/invoices/:id"
          element={
            <RequireAuth role="user">
              <Receipt />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth role="user">
              <FbrSettings />
            </RequireAuth>
          }
        />
        <Route
          path="/columns"
          element={
            <RequireAuth role="user">
              <ColumnGuide />
            </RequireAuth>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
