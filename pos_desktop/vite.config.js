import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The packaged app is one local page, so it gets a strict CSP. It is added at
// build time only: the dev server's React refresh needs inline scripts.
const contentSecurityPolicy = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content:
          "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:",
      },
      injectTo: 'head-prepend',
    },
  ],
}

export default defineConfig({
  // Relative asset paths — the packaged app loads index.html from disk.
  base: './',
  plugins: [react(), contentSecurityPolicy],
  server: {
    port: 5183,
    strictPort: true,
    // Watching the installer output keeps its folders open, which makes
    // `npm run dist` fail with EPERM while `npm run dev` is running.
    watch: { ignored: ['**/release/**'] },
  },
})
