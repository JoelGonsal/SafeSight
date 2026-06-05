import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/workers': 'http://127.0.0.1:8000',
      '/violations': 'http://127.0.0.1:8000',
      '/process_frame': 'http://127.0.0.1:8000',
      '/cameras': 'http://127.0.0.1:8000',
    }
  }
})
