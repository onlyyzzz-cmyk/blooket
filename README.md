# AI Tutor

AI Tutor is a calm, focused study workspace for turning difficult homework into clear explanations. It supports typed questions and homework photos, remembers recent sessions locally, and lets students browse by Math, English, Science, or History.

## What is included

- Modern responsive framework-free TypeScript dashboard
- Text questions and image upload (PNG/JPG, up to 5 MB)
- Groq-powered explanations through a framework-free Node HTTP server
- Follow-up prompts and locally persisted learning history
- Subject filters and a thoughtful empty state
- API key kept out of the browser

## Run locally

1. Install Node.js 18+.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root. Do not commit it:

   ```env
   GROQ_API_KEY=your_groq_api_key_here
   API_PORT=8787
   ```

   Create a key in the [Groq console](https://console.groq.com/keys). The server reads it only from `process.env`.

4. Start the app:

   ```bash
   npm run dev
   ```

   Vite builds the framework-free TypeScript UI into `dist/`. The Node server in `index.js` serves those static files and the `/api` routes from the same origin. The Python files in `api/` remain available for Python-oriented hosting adapters.

## Scripts

- `npm run dev` — builds the Vite frontend, then serves it with Node from `index.js`
- `npm run build` — creates the production frontend bundle in `dist/`
- `npm run typecheck` — checks the frontend TypeScript
- `npm start` — builds and starts the Node static/API server
- `npm run preview` — serves the existing `dist/` build with Node
- `vercel.json` + `api/*.js` — optional Vercel serverless adapter for production API hosting

## API

`POST /api/tutor` accepts `{ "prompt": string, "image": string }`. The image is an in-memory data URL and is never saved by the app. `GET /api/health` reports whether the server sees a configured Groq key without revealing it.

The frontend uses same-origin `/api` routes by default, which works with the Node server, Vite’s proxy, and the Python route adapters. If the API is hosted separately, set the non-secret `VITE_API_URL` build variable; the frontend will use that base URL while keeping the same `/api/health`, `/api/models`, `/api/chats`, and `/api/tutor` contract.

## Production hosting

The Freebuff deployment for `aitutor.freebuff.app` is a static Vite deployment, so it can serve the TypeScript UI but cannot execute `index.js` or the Python files in `api/`. The root `api/*.js` files and `vercel.json` provide a no-Express Vercel serverless adapter for `/api/health`, `/api/models`, and `/api/tutor`; deploy that API to a function-capable host with `GROQ_API_KEY`, then set `VITE_API_URL` to its public URL before rebuilding the static frontend. Never put `GROQ_API_KEY` in Vite client variables.

## Safety and learning approach

AI Tutor is designed to explain reasoning, surface common mistakes, and offer practice—not just return answer keys. Responses can still be imperfect, so students should check important work with a teacher, textbook, or trusted source.
