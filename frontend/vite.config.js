import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Prepare the lazy-loaded editor before the first room opens in development.
  optimizeDeps: {
    include: ['monaco-editor', '@monaco-editor/react'],
  },
})
