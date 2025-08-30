import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'

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
    allowedHosts: [
      '.ngrok-free.app', // akceptuj wszystkie domeny ngrok
      '.ngrok.io'        // na wszelki wypadek starsze domeny ngrok
    ],
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
      }
    }
  }
})
