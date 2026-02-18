import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || '.ngrok-free.app,.ngrok.io')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

// Konfiguracja Vite
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // nasłuchiwanie na 0.0.0.0
    allowedHosts,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      },
      '/v1': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      },
      // Proxy Swagger UI served by the local Express server so that
      // navigating to /docs in dev returns Swagger instead of SPA index.
      // This also ensures X-Frame-Options SAMEORIGIN applies correctly.
      '/docs': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
