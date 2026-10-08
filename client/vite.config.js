import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Forward /api requests to the Express server during development.
    // The browser then sees the API on the same origin as the React app,
    // so the httpOnly auth cookie works without any CORS trouble.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
