// Cloudflare Worker for AITutor.
// Static assets in ./dist are served first (assets-first default), so this
// script only runs for requests that do not match a file — /api/* and
// extensionless routes.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy /api/* to the externally hosted Python API (api/app.py).
    // Cloudflare Workers cannot run Python, so set API_BASE to the public
    // URL of the machine/instance running `python3 api/app.py`.
    if (url.pathname.startsWith('/api/')) {
      const base = (env.API_BASE || '').replace(/\/+$/, '');
      if (!base) {
        return Response.json(
          { error: 'API not configured. Set the API_BASE variable to the Python API URL.' },
          { status: 503, headers: { 'Access-Control-Allow-Origin': '*' } },
        );
      }
      const target = base + url.pathname + url.search;
      const headers = new Headers(request.headers);
      headers.delete('host');
      return fetch(target, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      });
    }

    // Extensionless routes (backup in case HTML auto-handling misses them).
    const docRoutes = {
      '/chats': '/chats.html',
      '/terms': '/terms.html',
      '/privacy': '/privacy.html',
      '/updates': '/updates.html',
      '/community': '/community.html',
      '/forms': '/forms.html',
    };
    const barePath = url.pathname.replace(/\/$/, '');
    if (docRoutes[barePath]) {
      return env.ASSETS.fetch(new URL(docRoutes[barePath], url.origin));
    }

    return env.ASSETS.fetch(request);
  },
};
