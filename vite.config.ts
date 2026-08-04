import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // Tauri sets TAURI_ENV_PLATFORM during `tauri build` — use '/' for the
  // desktop bundle, GitHub Pages sub-path for the web deploy.
  base: process.env.TAURI_ENV_PLATFORM ? '/' : '/map-editor-json-tool/',
  plugins: [react()],
  // Stamped at build time so the About dialog can report when this binary was
  // produced — the version alone doesn't say that.
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
