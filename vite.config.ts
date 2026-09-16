import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const port = Number(process.env.PORT) || 3000;
const apiPort = Number(process.env.API_PORT) || 8787;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        chats: resolve(__dirname, 'chats.html'),
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port,
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
});
