import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Libraries every page needs, in their own long-lived chunk: a
            // deploy that only changes FlyPool's code doesn't make returning
            // visitors download React again. (The animation library is NOT
            // listed - it stays in the lazily loaded login animation chunk.)
            {
              name: 'vendor',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler|cookie|set-cookie-parser|axios)[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    // Forward /api requests to the Express server during development.
    // The browser then sees the API on the same origin as the React app,
    // so the httpOnly auth cookie works without any CORS trouble.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
