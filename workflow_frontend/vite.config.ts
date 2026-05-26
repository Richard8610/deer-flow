import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, proxy all hub + DeerFlow API routes to the hub server.
// In production (k8s), the hub serves the built frontend as static files
// and all these paths are handled natively.
const HUB = process.env.HUB_URL ?? 'http://127.0.0.1:18080';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/login':    { target: HUB, changeOrigin: true },
      '/register': { target: HUB, changeOrigin: true },
      '/logout':   { target: HUB, changeOrigin: true },
      '/me':       { target: HUB, changeOrigin: true },
      '/api':      { target: HUB, changeOrigin: true },
    },
  },
});