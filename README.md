# AI Tutor

AI Tutor is a calm, focused study workspace for turning difficult homework into clear explanations. It supports typed questions, homework photos, chat history, subject filters, and Groq-powered tutoring.

## Stack

- **Node.js** runs the entire app in `index.js` — the API, static frontend, and extensionless `/chats` route in one process. No build step.
- The frontend is plain HTML/CSS/JavaScript in `public/` (no bundler, no TypeScript compile).
- **Python 3** offers an equivalent API in `api/app.py` using only the standard library, for hosts that prefer Python.
- **Groq** provides the tutoring responses through the server-side `GROQ_API_KEY`.
- Chat history is stored in `api/data/chats.json`.

## Local development

Install the Node dependencies, then run the app:

```bash
npm install
npm start
```

That's it — one process serves the frontend, the API, and the `/chats` route on the configured `PORT` (default 8787). For API-only development, run `npm run api` to start the Python API on port 8000 instead.

Useful commands:

```bash
npm run typecheck   # syntax-checks index.js
python3 -m py_compile api/app.py
```

The API exposes:

- `GET /api/health`
- `GET /api/models`
- `POST /api/tutor`
- `GET|POST|DELETE /api/chats`

## Environment

Required for live tutoring:

- `GROQ_API_KEY` — add this in Freebuff Settings → Environment.

The API remains usable without the key for health and model checks, but tutoring requests return a clear configuration error.

## Production

### Bonto (recommended — one service for everything)

The app runs as a single Node.js service via `node index.js`. No build step is needed — static files are served straight from `public/`.

1. Create a project on [bonto.dev](https://bonto.dev) (or connect via Git push-to-deploy).
2. Set the start command to `npm start` and add `GROQ_API_KEY` in the Bonto dashboard.
3. Deploy — the app goes live at `https://yourapp.bonto.run`.

### Cloudflare Workers (alternative)

The repository includes `wrangler.jsonc` for Cloudflare Workers deploys: static assets are served from `public/` and `/api/*` is proxied to the externally hosted Python API.

For Cloudflare, set the `API_BASE` variable (in the Workers dashboard or `wrangler.jsonc` vars) to the public URL of the machine running `python3 api/app.py`, with `GROQ_API_KEY` configured on that API host. Alternatively, deploy the Python API separately on any host and set `AI_TUTOR_API_URL` in the frontend host when it is on a different origin.
