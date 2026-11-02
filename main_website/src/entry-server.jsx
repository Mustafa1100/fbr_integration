// Server-side entry used only at build time by scripts/prerender.js to turn
// each route into static HTML. Not shipped to the browser.
import React from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App'

export function render(url) {
  return renderToString(
    <React.StrictMode>
      <StaticRouter location={url} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </StaticRouter>
    </React.StrictMode>,
  )
}
