import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces/wght.css'
import '@fontsource-variable/fraunces/wght-italic.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/800.css'
import App from './App'
import './styles/base.css'
import './styles/layout.css'
import './styles/sections.css'
import './styles/pages.css'

const app = (
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

// Production pages arrive pre-rendered (scripts/prerender.js), so attach to the
// existing HTML. In dev the root is empty, so render from scratch.
const root = document.getElementById('root')
if (root.hasChildNodes()) hydrateRoot(root, app)
else createRoot(root).render(app)
