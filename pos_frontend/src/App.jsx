import { Navigate, Route, Routes } from 'react-router-dom'
import { getToken } from './api.js'
import Layout from './components/Layout.jsx'
import ClientDetail from './pages/ClientDetail.jsx'
import Clients from './pages/Clients.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Login from './pages/Login.jsx'
import Plans from './pages/Plans.jsx'
import Requests from './pages/Requests.jsx'

function Protected({ children }) {
  return getToken() ? <Layout>{children}</Layout> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/clients" element={<Protected><Clients /></Protected>} />
      <Route path="/clients/:id" element={<Protected><ClientDetail /></Protected>} />
      <Route path="/plans" element={<Protected><Plans /></Protected>} />
      <Route path="/requests" element={<Protected><Requests /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
