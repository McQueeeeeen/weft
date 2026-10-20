import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const syncServer = process.env.WEFT_SYNC_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: syncServer, ws: true },
      '/health': { target: syncServer },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/ws': { target: syncServer, ws: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
