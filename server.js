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
const port = Number(process.env.API_PORT || 8787);
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'api', 'data');
try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* ignore */ }
const chatsFile = path.join(dataDir, 'chats.json');
const VALID_SUBJECTS = ['Math', 'English', 'Science', 'History'];
const GROQ_MODEL = 'qwen/qwen3.8-27b';

app.use(express.json({ limit: '8mb' }));

function loadChats() {
  try {
    const raw = fs.readFileSync(chatsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveChats(chats) {
  try {
    fs.writeFileSync(chatsFile, JSON.stringify(chats.slice(-200)));
  } catch (err) {
    console.error('Failed to save chats:', err);
  }
}

function chatSummary(chat) {
  const first = chat.messages?.[0] ?? {};
  const preview = typeof first.content === 'string'
    ? first.content
    : (Array.isArray(first.content)
      ? (first.content.find((part) => part.type === 'text')?.text ?? '')
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
  res.json({ ok: true, configured: Boolean(groq), model: GROQ_MODEL });
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
      messages: clean,
      created: now,
      updated: now,
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

/* ---- Tutor (Groq) ---- */
const TUTOR_PROMPT = 'You are AI Tutor, a warm expert teacher. Help the student learn instead of only giving an answer. Identify the subject, explain the reasoning in clear steps, call out common mistakes, and end with one short practice question. Use Markdown. Student request: ';

app.post('/api/tutor', async (req, res) => {
  try {
    const { prompt, image, history, subject } = req.body ?? {};
    const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';

    if (!cleanPrompt && !image) {
      return res.status(400).json({ error: 'Add a question or upload a homework image first.' });
    }
    if (!groq) {
      return res.status(503).json({ error: 'Groq is not configured yet. Add GROQ_API_KEY in your environment.' });
    }

    const systemText = TUTOR_PROMPT
      + (cleanPrompt || 'Please read and explain the attached homework image.')
      + (subject ? ` The student is focusing on ${subject}.` : '');

    const userContent = [{ type: 'text', text: systemText }];
    if (typeof image === 'string' && image.startsWith('data:image/')) {
      userContent.push({ type: 'image_url', image_url: { url: image } });
    }

    const messages = Array.isArray(history)
      ? history.slice(-6)
          .filter((t) => t && ['user', 'assistant'].includes(t.role) && typeof t.content === 'string')
          .map((t) => ({ role: t.role, content: t.content }))
      : [];
    messages.push({ role: 'user', content: userContent });

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      temperature: 0.35,
      max_tokens: 1200,
    });
    const answer = completion.choices[0]?.message?.content;
    return res.json({ answer: typeof answer === 'string' ? answer : 'I could not create an explanation this time.' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Tutor request failed:', msg);
    return res.status(502).json({ error: `The tutor could not reach Groq right now. (${msg})` });
  }
});

/* ---- Express error middleware (catches everything) ---- */
app.use((err, _req, res, _next) => {
  console.error('Express error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

/* ---- Static files & SPA fallback ---- */
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`AI Tutor API listening on 0.0.0.0:${port}`);
});

/* Keep connections alive through the proxy */
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

/* Self-ping every 30s to prevent idle process cleanup */
setInterval(() => {
  http.get(`http://localhost:${port}/api/health`, () => {}).on('error', () => {});
}, 30_000);
