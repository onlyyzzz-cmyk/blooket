import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Groq from 'groq-sdk';

/* ---- Crash protection ---- */
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (server kept alive):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept alive):', err);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 8787);
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'api', 'data');
try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* ignore */ }
const chatsFile = path.join(dataDir, 'chats.json');
const VALID_SUBJECTS = ['Math', 'English', 'Science', 'History', 'General'];

const AVAILABLE_MODELS = [
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', provider: 'Alibaba', tier: 'balanced', supportsImages: true },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', provider: 'OpenAI', tier: 'powerful', supportsImages: false },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', provider: 'OpenAI', tier: 'fast', supportsImages: false },
  { id: 'groq/compound', name: 'Compound', provider: 'Groq', tier: 'powerful', supportsImages: false },
  { id: 'groq/compound-mini', name: 'Compound Mini', provider: 'Groq', tier: 'fast', supportsImages: false },
];
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';

app.use(express.json({ limit: '8mb' }));

/* ---- Rate Limiting ---- */
const rateLimits = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT = 20; // requests per window
const RATE_WINDOW = 60 * 1000; // 1 minute

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW };
    rateLimits.set(ip, entry);
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: `Too many requests. Try again in ${retryAfter} seconds.` });
  }
  next();
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(ip);
  }
}, 5 * 60 * 1000);

/* ---- Chat storage helpers ---- */
function loadChats() {
  try {
    const raw = fs.readFileSync(chatsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveChats(chats) {
  try { fs.writeFileSync(chatsFile, JSON.stringify(chats.slice(-200))); }
  catch (err) { console.error('Failed to save chats:', err); }
}

function chatSummary(chat) {
  const first = chat.messages?.[0] ?? {};
  const preview = typeof first.content === 'string'
    ? first.content
    : (Array.isArray(first.content)
      ? (first.content.find((p) => p.type === 'text')?.text ?? '')
      : '');
  return {
    id: chat.id,
    title: chat.title || preview.slice(0, 60) || 'Untitled chat',
    subject: chat.subject || 'Math',
    created: chat.created,
    updated: chat.updated,
  };
}

/* ---- Health ---- */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(groq), model: DEFAULT_MODEL });
});

/* ---- Models ---- */
app.get('/api/models', (_req, res) => {
  res.json({ models: AVAILABLE_MODELS });
});

/* ---- Chat sessions ---- */
app.get('/api/chats', (_req, res) => {
  try {
    const chats = loadChats().sort((a, b) => b.updated - a.updated);
    res.json({ chats: chats.map(chatSummary) });
  } catch (err) {
    console.error('GET /api/chats error:', err);
    res.status(500).json({ error: 'Could not load chats.' });
  }
});

app.get('/api/chats/:id', (req, res) => {
  try {
    const chat = loadChats().find((c) => c.id === req.params.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found.' });
    res.json({ chat });
  } catch (err) {
    console.error('GET /api/chats/:id error:', err);
    res.status(500).json({ error: 'Could not load chat.' });
  }
});

app.post('/api/chats', (req, res) => {
  try {
    const body = req.body ?? {};
    const chats = loadChats();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const clean = messages
      .filter((t) => t && ['user', 'assistant'].includes(t.role) && (typeof t.content === 'string' || Array.isArray(t.content)))
      .slice(0, 80);
    if (!clean.length) return res.status(400).json({ error: 'A chat needs at least one message.' });
    const now = Math.floor(Date.now() / 1000);
    const chat = {
      id: randomUUID().slice(0, 12),
      subject: VALID_SUBJECTS.includes(body.subject) ? body.subject : 'Math',
      messages: clean, created: now, updated: now,
    };
    chat.title = chatSummary(chat).title;
    chats.push(chat);
    saveChats(chats);
    res.json({ chat });
  } catch (err) {
    console.error('POST /api/chats error:', err);
    res.status(500).json({ error: 'Could not create chat.' });
  }
});

app.post('/api/chats/:id', (req, res) => {
  try {
    const chats = loadChats();
    const chat = chats.find((c) => c.id === req.params.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found.' });
    const body = req.body ?? {};
    if (body.add && ['user', 'assistant'].includes(body.add.role) && body.add.content != null) {
      chat.messages = [...chat.messages, { role: body.add.role, content: body.add.content }].slice(-80);
    }
    if (typeof body.title === 'string' && body.title.trim()) chat.title = body.title.trim().slice(0, 80);
    if (VALID_SUBJECTS.includes(body.subject)) chat.subject = body.subject;
    chat.updated = Math.floor(Date.now() / 1000);
    saveChats(chats);
    res.json({ chat });
  } catch (err) {
    console.error('POST /api/chats/:id error:', err);
    res.status(500).json({ error: 'Could not update chat.' });
  }
});

app.delete('/api/chats/:id', (req, res) => {
  try {
    const chats = loadChats();
    const remaining = chats.filter((c) => c.id !== req.params.id);
    if (remaining.length === chats.length) return res.status(404).json({ error: 'Chat not found.' });
    saveChats(remaining);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/chats/:id error:', err);
    res.status(500).json({ error: 'Could not delete chat.' });
  }
});

/* ---- Tutor ---- */
const TUTOR_PROMPT = `You are AI Tutor — a world-class tutor for students from PK through AP/IB/honors/college level. You are an expert in Math (counting, arithmetic, algebra, geometry, calculus, statistics, combinatorics), English/Language Arts, Science, History, and General topics.

CRITICAL RULES:
1. ANSWER FIRST. Give the direct answer clearly at the top. No preamble, no "Let me help you with that", no filler.
2. Then SHOW WORK step by step. For math: show each calculation. For counting: list items, use groups, show patterns. For science: explain concepts. For English: analyze. For history: give context.
3. ADAPT to the student's level:
   - PK-2nd grade: Simple words, very encouraging, use counting objects, small numbers
   - 3rd-5th grade: Friendly tone, show work with small numbers
   - 6th-8th grade: Academic but accessible, show algebraic thinking
   - High school: Full academic vocabulary, complete solutions
   - AP/IB/Honors/College: Rigorous terminology, full proofs, all intermediate steps, cite theorems
4. PLAIN TEXT ONLY. Use these conventions:
   - Fractions: 3/4
   - Exponents: x^2
   - Square roots: sqrt(9) = 3
   - Multiplication: x * y or ·
   - Division: 12 / 9 = 4/3 = 1.333...
   - Inequalities: x > 5, x <= 10
5. NEVER use LaTeX, dollar signs, backslash commands, or special math notation.
6. For counting/combinatorics: use systematic listing, tree diagrams described in text, combinations (nCr), permutations (nPr), and explain the counting principle.
7. For division: always show fraction form AND decimal form. Example: 12 / 9 = 4/3 = 1.333... (repeating)
8. End with a PRACTICE section: one similar problem at the same difficulty for the student to try.
9. Keep answers concise but complete. No apologies, no excessive preamble.`;

app.post('/api/tutor', rateLimiter, async (req, res) => {
  try {
    const { prompt, image, history, subject, model } = req.body ?? {};
    const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';
    if (!cleanPrompt && !image) return res.status(400).json({ error: 'Add a question or upload a homework image first.' });
    if (!groq) return res.status(503).json({ error: 'Groq is not configured yet. Add GROQ_API_KEY in your environment.' });

    const subjectHint = subject ? ` The student is focusing on ${subject}.` : '';
    const userContent = [{ type: 'text', text: TUTOR_PROMPT + subjectHint + '\n\nStudent question: ' + (cleanPrompt || 'Please read and explain the attached homework image.') }];

    const chosenModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_MODEL;

    // Only attach image if the model supports it
    const modelInfo = AVAILABLE_MODELS.find((m) => m.id === chosenModel);
    const imageAttached = typeof image === 'string' && image.startsWith('data:image/');
    if (imageAttached && modelInfo?.supportsImages) {
      userContent.push({ type: 'image_url', image_url: { url: image } });
    } else if (imageAttached && !modelInfo?.supportsImages) {
      // Image attached but model doesn't support it — append as text description
      userContent[0].text += '\n\n[Note: The student attached a homework image, but the selected model does not support images. Please answer based on the text description above.]';
    }

    const messages = Array.isArray(history)
      ? history.slice(-6).filter((t) => t && ['user', 'assistant'].includes(t.role) && typeof t.content === 'string').map((t) => ({ role: t.role, content: t.content }))
      : [];
    messages.push({ role: 'user', content: userContent });

    const completion = await groq.chat.completions.create({ model: chosenModel, messages, temperature: 0.35, max_tokens: 1200 });
    const answer = completion.choices[0]?.message?.content;
    return res.json({ answer: typeof answer === 'string' ? answer : 'I could not create an explanation this time.' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Tutor request failed:', msg);
    return res.status(502).json({ error: `The tutor could not reach Groq right now. (${msg})` });
  }
});

/* ---- Express error middleware ---- */
app.use((err, _req, res, _next) => {
  console.error('Express error:', err);
  if (!res.headersSent) res.status(500).json({ error: 'Server error. Please try again.' });
});

/* ---- Static files & SPA fallback ---- */
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

/* ---- Start server ---- */
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`AI Tutor API listening on 0.0.0.0:${port}`);
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

setInterval(() => {
  http.get(`http://localhost:${port}/api/health`, () => {}).on('error', () => {});
}, 30_000);
