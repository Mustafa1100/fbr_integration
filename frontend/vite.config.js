import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Backend runs on :8000 in dev — the app calls /api/* everywhere.
      '/api': 'http://localhost:8000',
    },
  },
})
