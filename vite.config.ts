import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const port = Number(process.env.PORT) || 3000;
const apiPort = Number(process.env.API_PORT) || 8787;

/** Strip the crossorigin attribute that Vite adds to <script> and <link> tags —
 *  it causes CORS preflight requests through the Freebuff proxy. */
function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    enforce: 'post' as const,
    transformIndexHtml(html) {
      return html.replace(/\bcrossorigin\b\s*/g, '');
    },
  };
}

export default defineConfig({
  plugins: [stripCrossorigin()],
  build: {
    modulePreload: false,
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
