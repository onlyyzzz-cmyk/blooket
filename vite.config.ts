import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'extensionless-chats-route',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === '/chats' || request.url?.startsWith('/chats?')) request.url = request.url.replace('/chats', '/chats.html');
        next();
      });
    },
  }],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
