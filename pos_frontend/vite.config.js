import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    // pos_backend in dev: uvicorn app.main:app --port 8100
    proxy: { '/api': 'http://localhost:8100' },
  },
})
