import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/workflow': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
      '/api/chat': {
        target: 'http://localhost:8002',
        changeOrigin: true,
      },
    },
  },
});
