import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Fail instead of silently switching ports: a taken port means a dev server is still running.
    strictPort: true,
    // The app always calls relative `/api/...` URLs: proxied to Quarkus in dev, same origin in production.
    proxy: {
      '/api': process.env.BACKEND_URL ?? 'http://localhost:4720',
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
