# AI Tutor

AI Tutor is a calm, focused study workspace for turning difficult homework into clear explanations. It supports typed questions and homework photos, remembers recent sessions locally, and lets students browse by Math, English, Science, or History.

## What is included

- Modern responsive React + TypeScript dashboard
- Text questions and image upload (PNG/JPG, up to 5 MB)
- Groq-powered explanations through a server-side Express route
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

   Vite serves the UI on port 3000 and the Express API on port 8787. The Vite proxy forwards `/api` requests to Express.

## Scripts

- `npm run dev` — starts the API and Vite together
- `npm run build` — creates the production frontend bundle in `dist/`
- `npm run typecheck` — checks the frontend TypeScript
- `npm start` — starts the managed preview command

## API

`POST /api/tutor` accepts `{ "prompt": string, "image": string }`. The image is an in-memory data URL and is never saved by the app. `GET /api/health` reports whether the server sees a configured Groq key without revealing it.

## Safety and learning approach

AI Tutor is designed to explain reasoning, surface common mistakes, and offer practice—not just return answer keys. Responses can still be imperfect, so students should check important work with a teacher, textbook, or trusted source.
