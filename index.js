import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Groq from 'groq-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || process.env.API_PORT || 8787);
const publicPath = path.join(__dirname, 'public');
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'api', 'data');
const chatsFile = path.join(dataDir, 'chats.json');
let inMemoryChats = [];
let chatStorageUnavailable = false;
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const VALID_SUBJECTS = ['Math', 'English', 'Science', 'History', 'General'];
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';
const AVAILABLE_MODELS = [
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', provider: 'Alibaba', tier: 'balanced', supportsImages: true },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', provider: 'OpenAI', tier: 'powerful', supportsImages: false },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', provider: 'OpenAI', tier: 'fast', supportsImages: false },
  { id: 'groq/compound', name: 'Compound', provider: 'Groq', tier: 'powerful', supportsImages: false },
  { id: 'groq/compound-mini', name: 'Compound Mini', provider: 'Groq', tier: 'fast', supportsImages: false },
];

try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* Data storage is best effort. */ }

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

const rateLimits = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) if (now > entry.resetAt) rateLimits.delete(ip);
}, 5 * 60 * 1000);

function loadChats() {
  if (chatStorageUnavailable) return inMemoryChats;
  try {
    const parsed = JSON.parse(fs.readFileSync(chatsFile, 'utf8'));
    if (Array.isArray(parsed)) {
      inMemoryChats = parsed;
      return parsed;
    }
  } catch (error) {
    // Bonto can temporarily provide a read-only or reset filesystem. Keep the
    // current session usable instead of making the API appear to save and lose chats.
  }
  return inMemoryChats;
}

function saveChats(chats) {
  const snapshot = chats.slice(-200);
  inMemoryChats = snapshot;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(chatsFile, JSON.stringify(snapshot));
    chatStorageUnavailable = false;
  } catch (error) {
    chatStorageUnavailable = true;
    console.error('Chat file unavailable; using in-memory history:', error.message);
  }
}

function chatSummary(chat) {
  const first = chat.messages?.[0] ?? {};
  const preview = typeof first.content === 'string'
    ? first.content
    : Array.isArray(first.content)
      ? first.content.find((part) => part.type === 'text')?.text ?? ''
      : '';
  return {
    id: chat.id,
    title: chat.title || preview.slice(0, 60) || 'Untitled chat',
    subject: chat.subject || 'Math',
    created: chat.created,
    updated: chat.updated,
  };
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message }, { 'Access-Control-Allow-Origin': '*' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 8 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Request body is too large.'));
      }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

function rateLimit(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW };
    rateLimits.set(ip, entry);
  }
  entry.count += 1;
  if (entry.count <= RATE_LIMIT) return false;
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
  sendJson(res, 429, { error: `Too many requests. Try again in ${retryAfter} seconds.` }, {
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': String(retryAfter),
    'Access-Control-Allow-Origin': '*',
  });
  return true;
}

const TUTOR_PROMPT = `You are AI Tutor — a world-class tutor for students from PK through AP/IB/honors/college level. You are an expert in Math (counting, arithmetic, algebra, geometry, calculus, statistics, combinatorics), English/Language Arts, Science, History, and General topics.

CRITICAL RULES:
1. ANSWER FIRST. Give the direct answer clearly at the top. No preamble, no filler.
2. NEVER repeat or restate the student's question in your reply — do not echo "Student question:" or rewrite what they asked. Jump straight into the answer.
2. Then SHOW WORK step by step.
4. ADAPT to the student's level.
5. PLAIN TEXT ONLY. Never use LaTeX, dollar signs, backslash commands, or special math notation.
6. For counting/combinatorics, show systematic listing, groups, patterns, combinations (nCr), and permutations (nPr).
7. For division, show fraction form AND decimal form.
8. End with a PRACTICE section: one similar problem at the same difficulty for the student to try.
9. Write one focused micro-lesson. Keep every response under 250 words so it is easy to read.
10. Keep answers concise but complete.`;

async function handleApi(req, res, url) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return true;
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, configured: Boolean(groq), model: DEFAULT_MODEL }, headers);
    return true;
  }
  if (url.pathname === '/api/models' && req.method === 'GET') {
    sendJson(res, 200, { models: AVAILABLE_MODELS }, headers);
    return true;
  }

  const chatMatch = url.pathname.match(/^\/api\/chats(?:\/([^/]+))?$/);
  if (chatMatch) {
    const id = chatMatch[1] || url.searchParams.get('id') || undefined;
    try {
      if (req.method === 'GET' && !id) {
        const chats = loadChats().sort((a, b) => b.updated - a.updated);
        sendJson(res, 200, { chats: chats.map(chatSummary) }, headers);
        return true;
      }
      if (req.method === 'GET' && id) {
        const chat = loadChats().find((item) => item.id === id);
        if (!chat) return sendError(res, 404, 'Chat not found.');
        sendJson(res, 200, { chat }, headers);
        return true;
      }
      if (req.method === 'POST' && !id) {
        const body = await readBody(req);
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const clean = messages
          .filter((turn) => turn && ['user', 'assistant'].includes(turn.role) && (typeof turn.content === 'string' || Array.isArray(turn.content)))
          .slice(0, 80);
        if (!clean.length) return sendError(res, 400, 'A chat needs at least one message.');
        const now = Math.floor(Date.now() / 1000);
        const chat = {
          id: randomUUID().slice(0, 12),
          subject: VALID_SUBJECTS.includes(body.subject) ? body.subject : 'Math',
          messages: clean,
          created: now,
          updated: now,
        };
        chat.title = chatSummary(chat).title;
        const chats = loadChats();
        chats.push(chat);
        saveChats(chats);
        sendJson(res, 200, { chat }, headers);
        return true;
      }
      if (req.method === 'POST' && id) {
        const body = await readBody(req);
        const chats = loadChats();
        const chat = chats.find((item) => item.id === id);
        if (!chat) return sendError(res, 404, 'Chat not found.');
        if (body.add && ['user', 'assistant'].includes(body.add.role) && body.add.content != null) {
          chat.messages = [...chat.messages, { role: body.add.role, content: body.add.content }].slice(-80);
        }
        if (typeof body.title === 'string' && body.title.trim()) chat.title = body.title.trim().slice(0, 80);
        if (VALID_SUBJECTS.includes(body.subject)) chat.subject = body.subject;
        chat.updated = Math.floor(Date.now() / 1000);
        saveChats(chats);
        sendJson(res, 200, { chat }, headers);
        return true;
      }
      if (req.method === 'DELETE' && id) {
        const chats = loadChats();
        const remaining = chats.filter((item) => item.id !== id);
        if (remaining.length === chats.length) return sendError(res, 404, 'Chat not found.');
        saveChats(remaining);
        sendJson(res, 200, { ok: true }, headers);
        return true;
      }
      return sendError(res, 405, 'Method not allowed.');
    } catch (error) {
      console.error('Chat API error:', error);
      return sendError(res, 500, 'Could not process the chat request.');
    }
  }

  if (url.pathname === '/api/tutor' && req.method === 'POST') {
    if (rateLimit(req, res)) return true;
    try {
      const body = await readBody(req);
      const cleanPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (!cleanPrompt && !body.image) return sendError(res, 400, 'Add a question or upload a homework image first.');
      if (!groq) return sendError(res, 503, 'Groq is not configured yet. Add GROQ_API_KEY in your environment.');

      const chosenModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
      const modelInfo = AVAILABLE_MODELS.find((model) => model.id === chosenModel);
      const userContent = [{ type: 'text', text: `${TUTOR_PROMPT}\n\nThe student is focusing on ${body.subject || 'General'}.\n\nStudent question: ${cleanPrompt || 'Please read and explain the attached homework image.'}` }];
      const hasImage = typeof body.image === 'string' && body.image.startsWith('data:image/');
      if (hasImage && !modelInfo?.supportsImages) {
        return sendError(res, 400, 'This model cannot view images. Switch to Qwen 3.8 27B and send the photo again.');
      }
      if (hasImage) userContent.push({ type: 'image_url', image_url: { url: body.image } });

      const messages = Array.isArray(body.history)
        ? body.history.slice(-6).filter((turn) => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string').map((turn) => ({ role: turn.role, content: turn.content }))
        : [];
      messages.push({ role: 'user', content: userContent });
      const completion = await groq.chat.completions.create({ model: chosenModel, messages, temperature: 0.35, max_tokens: 700 });
      const answer = completion.choices[0]?.message?.content;
      const limitedAnswer = typeof answer === 'string'
        ? answer.trim().split(/\s+/).slice(0, 240).join(' ')
        : 'I could not create an explanation this time.';
      sendJson(res, 200, { answer: limitedAnswer }, headers);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Tutor request failed:', message);
      return sendError(res, 502, `The tutor could not reach Groq right now. (${message})`);
    }
  }
  return false;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendHtmlFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body style="font-family:sans-serif;padding:40px"><h2>Frontend files are missing.</h2><p>The <code>public/</code> folder could not be found. Make sure the full repository is deployed.</p></body></html>');
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => { if (!res.headersSent) sendError(res, 500, 'Could not read the page.'); res.end(); });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  stream.pipe(res);
}

function serveStatic(res, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safePath = path.normalize(requested);
  if (safePath.startsWith('..') || path.isAbsolute(safePath)) return sendError(res, 403, 'Forbidden.');
  const filePath = path.join(publicPath, safePath);
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) throw new Error('Not a file');
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => { if (!res.headersSent) sendError(res, 500, 'Could not read the file.'); res.end(); });
    res.writeHead(200, { 'Content-Type': contentType });
    stream.pipe(res);
  } catch {
    const fallback = path.join(
      publicPath,
      pathname === '/chats' || pathname === '/chats.html' ? 'chats.html'
        : pathname === '/terms' || pathname === '/terms.html' ? 'terms.html'
        : pathname === '/privacy' || pathname === '/privacy.html' ? 'privacy.html'
        : pathname === '/updates' || pathname === '/updates.html' ? 'updates.html'
        : 'index.html',
    );
    sendHtmlFile(res, fallback);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (!handled) sendError(res, 404, 'API route not found.');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendError(res, 405, 'Method not allowed.');
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    console.error('Request failed:', error);
    if (!res.headersSent) sendError(res, 500, 'Server error. Please try again.');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`AI Tutor server listening on 0.0.0.0:${port}`);
  console.log(`Serving static files from: ${publicPath} (exists: ${fs.existsSync(path.join(publicPath, 'index.html'))})`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
