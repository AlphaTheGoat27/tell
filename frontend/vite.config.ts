import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(),],
  server: {
    // Lets the frontend call fetch('/api/...') during `npm run dev` without
    // any per-developer .env setup -- proxied straight to the local FastAPI
    // server. In production, set VITE_API_BASE_URL to the deployed API URL.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})