import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import './styles.css'

// Scrolling the mouse wheel over a focused number field would change its
// value by accident. Taking focus off the field first lets the page
// scroll as normal and leaves the number untouched.
document.addEventListener(
  'wheel',
  () => {
    const el = document.activeElement
    if (el && el.tagName === 'INPUT' && el.type === 'number') el.blur()
  },
  { passive: true }
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
