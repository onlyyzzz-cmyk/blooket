# AI Tutor

AI Tutor is a calm, focused study workspace for turning difficult homework into clear explanations. It supports typed questions, homework photos, chat history, subject filters, and Groq-powered tutoring.

## Stack

- **Node + Vite** handles the TypeScript frontend and static production build.
- **Python 3** runs the API in `api/app.py` using only the standard library.
- **Groq** provides the tutoring responses through the server-side `GROQ_API_KEY`.
- Chat history is stored in `api/data/chats.json`.

## Local development

Install the Node dependencies, then run the frontend and API in separate terminals:

```bash
npm install
npm run api
npm run dev
```

Vite serves the frontend on its configured preview port and proxies `/api/*` requests to the Python API on port `8000`. The Python API binds to `0.0.0.0` and respects `PORT` when supplied by the hosting environment. Set `GROQ_API_KEY` through the workspace environment; never put it in frontend files.

Useful commands:

```bash
npm run typecheck
npm run build
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

The Node build outputs static frontend assets to `dist/`. The repository includes `wrangler.jsonc` for Cloudflare Workers deploys: static assets are served from `dist/` and `/api/*` is proxied to the externally hosted Python API.

For Cloudflare, set the `API_BASE` variable (in the Workers dashboard or `wrangler.jsonc` vars) to the public URL of the machine running `python3 api/app.py`, with `GROQ_API_KEY` configured on that API host. Alternatively, deploy the Python API separately on any host and set `AI_TUTOR_API_URL` in the frontend host when it is on a different origin.
