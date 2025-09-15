import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the React client. This proxies API requests
// during development to the backend running on port 3000. When you run
// `npm run build` in the client directory, the static assets will be
// generated in `dist/` and served by the Express server defined in
// server.js.

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});