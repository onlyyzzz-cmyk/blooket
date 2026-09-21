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
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', provider: 'Alibaba', tier: 'balanced', supportsImages: true, supportsWebSearch: false },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', provider: 'OpenAI', tier: 'powerful', supportsImages: false, supportsWebSearch: false },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', provider: 'OpenAI', tier: 'fast', supportsImages: false, supportsWebSearch: false },
  { id: 'groq/compound', name: 'Compound', provider: 'Groq', tier: 'powerful', supportsImages: false, supportsWebSearch: true },
  { id: 'groq/compound-mini', name: 'Compound Mini', provider: 'Groq', tier: 'fast', supportsImages: false, supportsWebSearch: true },
];

try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* Data storage is best effort. */ }
try { fs.mkdirSync(path.join(dataDir, 'community'), { recursive: true }); } catch { /* Best effort. */ }

// ==================== COMMUNITY, MODERATION & FORMS ====================
// Community: a shared chat room. Mods/admins get badges and can mute/ban
// members and delete messages. Forms: report a member or apply for a
// moderator/admin position. Applications are stored for review.
const communityFile = path.join(dataDir, 'community', 'community.json');
const formsFile = path.join(dataDir, 'community', 'forms.json');
let inMemoryCommunity = { messages: [], members: {} };
let inMemoryForms = { reports: [], applications: [], bugs: [] };

const BADGES = {
  admin: { label: 'Admin', color: '#e11d48' },
  moderator: { label: 'Mod', color: '#6366f1' },
  member: { label: 'Member', color: '#64748b' },
};

// Usernames/ids listed here are site admins. Add your Clerk user id or name.
const ADMIN_IDS = (process.env.ADMIN_IDS || 'owner').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);

function loadCommunity() {
  try {
    const parsed = JSON.parse(fs.readFileSync(communityFile, 'utf8'));
    if (parsed && Array.isArray(parsed.messages) && typeof parsed.members === 'object') return parsed;
  } catch { /* First run or unreadable file — start fresh. */ }
  return inMemoryCommunity;
}

function saveCommunity(state) {
  inMemoryCommunity = state;
  try {
    fs.writeFileSync(communityFile, JSON.stringify(state));
  } catch (error) {
    console.error('Community file unavailable; using in-memory state:', error.message);
  }
}

function loadForms() {
  try {
    const parsed = JSON.parse(fs.readFileSync(formsFile, 'utf8'));
    if (parsed && Array.isArray(parsed.reports) && Array.isArray(parsed.applications)) return parsed;
  } catch { /* First run — start fresh. */ }
  return inMemoryForms;
}

function saveForms(state) {
  inMemoryForms = state;
  try {
    fs.writeFileSync(formsFile, JSON.stringify(state));
  } catch (error) {
    console.error('Forms file unavailable; using in-memory state:', error.message);
  }
}

function memberRole(memberId) {
  const state = loadCommunity();
  const stored = state.members?.[memberId]?.role;
  if (stored === 'admin' || stored === 'moderator') return stored;
  if (ADMIN_IDS.includes(String(memberId).toLowerCase())) return 'admin';
  return 'member';
}

function publicMessage(message, role) {
  return { id: message.id, userId: message.userId, name: message.name, text: message.text, created: message.created, role };
}

function sanitizeText(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

// ---- AI application reviewer + result email ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function triageBug(bug) {
  // The AI triages bug reports into severity/category so the team can prioritize.
  const prompt = `You are triaging a bug report for AITutor, an AI tutoring website for students.
Where the bug happened: ${bug.where || 'not specified'}
Bug description: ${bug.description}

Respond with ONLY a JSON object, no other text:
{"severity":"critical"|"high"|"medium"|"low","category":"chat"|"calculator"|"community"|"auth"|"pages"|"other","summary":"one-sentence plain-language summary","note":"one sentence of helpful context for the developer"}`;
  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 250,
      });
      const raw = completion.choices[0]?.message?.content || '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (['critical', 'high', 'medium', 'low'].includes(parsed.severity)) {
          return {
            severity: parsed.severity,
            category: sanitizeText(parsed.category, 20) || 'other',
            summary: sanitizeText(parsed.summary, 200),
            note: sanitizeText(parsed.note, 300),
            triagedBy: 'ai',
          };
        }
      }
    } catch (error) {
      console.error('AI bug triage failed:', error.message);
    }
  }
  return { severity: 'medium', category: 'other', summary: sanitizeText(bug.description, 100), note: 'Triaged automatically without AI — review manually.', triagedBy: 'fallback' };
}

async function reviewApplication(application) {
  // The AI reviewer scores the application and returns a decision + feedback.
  // Falls back to a simple heuristic when Groq is not configured.
  const prompt = `You are reviewing an application for the "${application.position}" position on AITutor, a free AI tutoring site for students.
Applicant name: ${application.name}
Timezone: ${application.timezone || 'not provided'}
Moderation experience: ${application.experience}
Why they want the position: ${application.why}

Decide if they would be a safe, responsible moderator for a student community.
Respond with ONLY a JSON object, no other text:
{"decision":"approved"|"rejected","score":0-100,"feedback":"2-3 sentence friendly explanation for the applicant"}`;
  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 300,
      });
      const raw = completion.choices[0]?.message?.content || '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (['approved', 'rejected'].includes(parsed.decision)) {
          return {
            decision: parsed.decision,
            score: Math.min(Math.max(Number(parsed.score) || 0, 0), 100),
            feedback: sanitizeText(parsed.feedback, 600),
            reviewer: 'ai',
          };
        }
      }
    } catch (error) {
      console.error('AI review failed:', error.message);
    }
  }
  // Heuristic fallback: thoughtful applications with some experience get approved.
  const wordCount = (application.experience + ' ' + application.why).split(/\s+/).filter(Boolean).length;
  const approved = wordCount >= 25;
  return {
    decision: approved ? 'approved' : 'rejected',
    score: Math.min(wordCount * 2, 70),
    feedback: approved
      ? 'Thanks for applying! Your experience looks like a great fit for our community. Welcome aboard.'
      : 'Thanks for applying! We would love a bit more detail about your moderation experience before we can approve you. Feel free to apply again with more information.',
    reviewer: 'fallback',
  };
}

async function sendResultEmail(to, application, review) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !EMAIL_RE.test(to)) return { emailed: false, reason: key ? 'invalid email' : 'RESEND_API_KEY not set' };
  const from = process.env.RESEND_FROM || 'AITutor <onboarding@resend.dev>';
  const approved = review.decision === 'approved';
  const subject = approved
    ? `Your AITutor ${application.position} application was approved! 🎉`
    : `Your AITutor ${application.position} application result`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f7fb;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e5e7eb">
<h2 style="margin:0 0 8px;color:${approved ? '#059669' : '#64748b'}">${approved ? '🎉 Approved!' : 'Application review'}</h2>
<p style="color:#334155;font-size:15px;line-height:1.6">Hi ${application.name},</p>
<p style="color:#334155;font-size:15px;line-height:1.6">Our AI reviewer scored your ${application.position} application <strong>${review.score}/100</strong> and ${approved ? 'approved it' : 'was not able to approve it this time'}.</p>
<div style="background:#f6f7fb;border-radius:12px;padding:16px;margin:16px 0;color:#334155;font-size:14px;line-height:1.6">${review.feedback}</div>
${approved ? '<p style="color:#334155;font-size:15px;line-height:1.6"><strong>You now have access to the moderation tools</strong> in the AITutor community. Head to <a href="" style="color:#6366f1">the community</a> and sign in with the same Clerk account you used to apply — your Mod badge and tools are already waiting.</p>' : '<p style="color:#334155;font-size:15px;line-height:1.6">You are still welcome in the community, and you can apply again any time.</p>'}
<p style="color:#94a3b8;font-size:12px;margin-top:24px">AITutor — Learn anything, faster.</p>
</div></body></html>`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Resend email failed:', response.status, detail.slice(0, 200));
      return { emailed: false, reason: `Resend returned ${response.status}` };
    }
    return { emailed: true };
  } catch (error) {
    console.error('Resend email failed:', error.message);
    return { emailed: false, reason: error.message };
  }
}

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

// Trim an AI answer toward the 250-word micro-lesson limit without cutting mid-sentence.
// Words are only removed up to the last sentence end, so the lesson still reads naturally.
const MAX_ANSWER_WORDS = 240;

function limitToWords(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/);
  if (words.length <= MAX_ANSWER_WORDS) return trimmed;
  let kept = words.slice(0, MAX_ANSWER_WORDS).join(' ');
  // Walk back to the last sentence-ending punctuation so we never cut a sentence in half.
  const lastStop = Math.max(kept.lastIndexOf('. '), kept.lastIndexOf('! '), kept.lastIndexOf('? '));
  if (lastStop > kept.length * 0.5) kept = kept.slice(0, lastStop + 1);
  return kept.trim();
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

// Questions matching these hints need fresh, real-world information, so they are
// routed to Groq's Compound model, which has built-in web search.
const WEB_SEARCH_HINTS = /\b(latest|breaking|news|today|current|currently|recent|recently|this (week|month|year)|who won|weather|forecast|stock price|release date|search (for|the web)|look up|population of|2025|2026)\b/i;
const WEB_SEARCH_NOTE = '\n\nUse web search to look up current information before answering. Keep the usual answer-first format, and list the source links you used at the end under "Sources:".';

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
  if (url.pathname === '/api/config' && req.method === 'GET') {
    sendJson(res, 200, {
      clerkPublishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || '',
    }, headers);
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

  if (url.pathname === '/api/community' && req.method === 'GET') {
    const state = loadCommunity();
    const now = Date.now();
    const messages = state.messages
      .slice(-150)
      .filter((message) => {
        const member = state.members[message.userId];
        if (!member) return true;
        if (member.banned) return false;
        if (member.mutedUntil && member.mutedUntil > now) {
          // Muted members' messages stay hidden only while the mute is active.
          return message.created < member.mutedFrom;
        }
        return true;
      })
      .map((message) => publicMessage(message, memberRole(message.userId)));
    sendJson(res, 200, { messages, badges: BADGES }, headers);
    return true;
  }

  if (url.pathname === '/api/community' && req.method === 'POST') {
    const body = await readBody(req);
    const userId = sanitizeText(body.userId, 64);
    const name = sanitizeText(body.name, 32);
    const text = sanitizeText(body.text, 500);
    if (!userId || !name || !text) return sendError(res, 400, 'Name and a message are required.');
    const state = loadCommunity();
    const member = state.members[userId] || (state.members[userId] = { role: memberRole(userId) });
    const now = Date.now();
    if (member.banned) return sendError(res, 403, 'You are banned from the community. Contact an admin.');
    if (member.mutedUntil && member.mutedUntil > now) {
      const minutes = Math.ceil((member.mutedUntil - now) / 60000);
      return sendError(res, 403, `You are muted for ${minutes} more minute(s).`);
    }
    const message = { id: randomUUID().slice(0, 12), userId, name, text, created: now };
    state.members[userId] = { ...member, name, lastSeen: now };
    state.messages = [...state.messages, message].slice(-500);
    saveCommunity(state);
    sendJson(res, 200, { message: publicMessage(message, memberRole(userId)) }, headers);
    return true;
  }

  if (url.pathname === '/api/community/moderate' && req.method === 'POST') {
    const body = await readBody(req);
    const modId = sanitizeText(body.moderatorId, 64);
    const action = sanitizeText(body.action, 20);
    if (memberRole(modId) === 'member') return sendError(res, 403, 'Only mods and admins can moderate.');
    const state = loadCommunity();
    const target = state.members[body.targetId] || (state.members[body.targetId] = {});
    const now = Date.now();
    if (action === 'mute') {
      const minutes = Math.min(Math.max(Number(body.minutes) || 10, 1), 60 * 24 * 7);
      target.mutedUntil = now + minutes * 60000;
      target.mutedFrom = now;
    } else if (action === 'unmute') {
      delete target.mutedUntil;
      delete target.mutedFrom;
    } else if (action === 'ban') {
      target.banned = true;
    } else if (action === 'unban') {
      delete target.banned;
    } else if (action === 'delete-message') {
      state.messages = state.messages.filter((message) => message.id !== body.messageId);
    } else if (action === 'grant' && memberRole(modId) === 'admin') {
      if (!['admin', 'moderator', 'member'].includes(body.role)) return sendError(res, 400, 'Invalid role.');
      target.role = body.role;
    } else {
      return sendError(res, 400, 'Unknown moderation action.');
    }
    state.members[body.targetId] = target;
    saveCommunity(state);
    sendJson(res, 200, { ok: true }, headers);
    return true;
  }

  if (url.pathname === '/api/forms' && req.method === 'POST') {
    const body = await readBody(req);
    const kind = body.kind === 'report' ? 'report' : body.kind === 'application' ? 'application' : body.kind === 'bug' ? 'bug' : '';
    if (!kind) return sendError(res, 400, 'Unknown form type.');
    const state = loadForms();
    const now = Math.floor(Date.now() / 1000);
    if (kind === 'bug') {
      // Bug reports are triaged by the AI so the team sees severity at a glance.
      const description = sanitizeText(body.description, 2000);
      const where = sanitizeText(body.where, 120);
      if (!description) return sendError(res, 400, 'Please describe the bug.');
      const entry = { id: randomUUID().slice(0, 12), kind, description, where, contact: sanitizeText(body.contact, 80), created: now, status: 'open' };
      try {
        entry.triage = await triageBug(entry);
      } catch (error) {
        console.error('Bug triage failed:', error.message);
        entry.triage = { severity: 'unknown', category: 'other', summary: description.slice(0, 80), note: 'Automatic triage unavailable — review manually.' };
      }
      state.bugs = [entry, ...state.bugs].slice(0, 300);
      saveForms(state);
      sendJson(res, 200, { ok: true, entry: { ...entry, description: undefined }, triage: entry.triage }, headers);
      return true;
    }
    if (kind === 'report') {
      const who = sanitizeText(body.memberName, 60);
      const reason = sanitizeText(body.reason, 1000);
      if (!who || !reason) return sendError(res, 400, 'Member name and reason are required.');
      const entry = { id: randomUUID().slice(0, 12), kind, memberName: who, reason, contact: sanitizeText(body.contact, 80), created: now, status: 'pending' };
      state.reports = [entry, ...state.reports].slice(0, 300);
      saveForms(state);
      sendJson(res, 200, { ok: true, entry }, headers);
      return true;
    }
    // Applications require a Clerk sign-in: we need a real account + email so the
    // AI reviewer can email the result and approved mods keep their powers tied
    // to their account instead of a disposable name.
    const applicantId = sanitizeText(body.userId, 64);
    const email = sanitizeText(body.email, 120).toLowerCase();
    const name = sanitizeText(body.name, 60);
    const position = ['moderator', 'admin'].includes(body.position) ? body.position : 'moderator';
    const why = sanitizeText(body.why, 1500);
    const experience = sanitizeText(body.experience, 1500);
    if (!applicantId || !email) return sendError(res, 401, 'Please sign up or sign in first — applications are tied to your AITutor account.');
    if (!EMAIL_RE.test(email)) return sendError(res, 400, 'A valid email address is required so we can send you the result.');
    if (!name || !why || !experience) return sendError(res, 400, 'Name, experience, and motivation are required.');
    const existing = state.applications.find((entry) => entry.userId === applicantId && entry.status === 'approved');
    if (existing) return sendError(res, 409, 'You already have an approved application on this account.');
    const entry = { id: randomUUID().slice(0, 12), kind, userId: applicantId, email, name, position, why, experience, timezone: sanitizeText(body.timezone, 40), created: now, status: 'pending' };
    try {
      const review = await reviewApplication(entry);
      entry.review = review;
      entry.status = review.decision;
      state.applications = [entry, ...state.applications].slice(0, 300);
      saveForms(state);
      if (review.decision === 'approved') {
        // Approved applicants get their mod tools immediately.
        const community = loadCommunity();
        community.members[applicantId] = { ...(community.members[applicantId] || {}), role: position === 'admin' ? 'admin' : 'moderator', email };
        saveCommunity(community);
      }
      const emailResult = await sendResultEmail(email, entry, review);
      sendJson(res, 200, { ok: true, entry: { ...entry, why: undefined, experience: undefined }, review: { decision: review.decision, score: review.score, feedback: review.feedback }, email: emailResult }, headers);
    } catch (error) {
      console.error('Application review failed:', error);
      sendError(res, 502, 'The AI reviewer could not process your application. Please try again.');
    }
    return true;
  }

  if (url.pathname === '/api/forms' && req.method === 'GET') {
    // Listing submitted forms is an admin/mod-only review view.
    const reviewerId = url.searchParams.get('reviewerId') || '';
    if (memberRole(sanitizeText(reviewerId, 64)) === 'member') return sendError(res, 403, 'Only mods and admins can review forms.');
    const state = loadForms();
    sendJson(res, 200, { reports: state.reports, applications: state.applications, bugs: state.bugs || [] }, headers);
    return true;
  }

  if (url.pathname === '/api/tutor' && req.method === 'POST') {
    if (rateLimit(req, res)) return true;
    try {
      const body = await readBody(req);
      const cleanPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (!cleanPrompt && !body.image) return sendError(res, 400, 'Add a question or upload a homework image first.');
      if (!groq) return sendError(res, 503, 'Groq is not configured yet. Add GROQ_API_KEY in your environment.');

      let chosenModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
      const hasImage = typeof body.image === 'string' && body.image.startsWith('data:image/');
      const modelInfo = AVAILABLE_MODELS.find((model) => model.id === chosenModel);
      if (hasImage && !modelInfo?.supportsImages) {
        return sendError(res, 400, 'This model cannot view images. Switch to Qwen 3.8 27B and send the photo again.');
      }
      // Web search: the student can force it with the 🌐 toggle, or it turns on
      // automatically when the question clearly needs current information.
      // Forcing it only works on the Compound models — anything else gets the
      // same switch-model guidance as unsupported photos.
      const explicitSearch = body.webSearch === true && !hasImage;
      if (explicitSearch && modelInfo && modelInfo.supportsWebSearch === false) {
        return sendError(res, 400, 'Web search needs the Compound model. Open the model picker, switch to Compound (or Compound Mini), and send again.');
      }
      const wantsWebSearch = (explicitSearch || WEB_SEARCH_HINTS.test(cleanPrompt)) && !hasImage;
      // compound-mini performs the search: the full Compound model is currently
      // rejected by Groq with 413 (request too large) on this account.
      if (wantsWebSearch && !(modelInfo && modelInfo.supportsWebSearch)) {
        chosenModel = 'groq/compound-mini';
      }
      const userContent = [{ type: 'text', text: `${TUTOR_PROMPT}\n\nThe student is focusing on ${body.subject || 'General'}.${wantsWebSearch ? WEB_SEARCH_NOTE : ''}\n\nStudent question: ${cleanPrompt || 'Please read and explain the attached homework image.'}` }];
      if (hasImage) userContent.push({ type: 'image_url', image_url: { url: body.image } });

      const messages = Array.isArray(body.history)
        ? body.history.slice(-6).filter((turn) => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string').map((turn) => ({ role: turn.role, content: turn.content }))
        : [];
      messages.push({ role: 'user', content: userContent });
      let completion;
      try {
        completion = await groq.chat.completions.create({ model: chosenModel, messages, temperature: 0.35, max_tokens: 700 });
      } catch (searchError) {
        // Web search can pull in more content than the context allows (Groq 413).
        // Fall back to the requested model without search so the student still
        // gets an answer instead of an error.
        if (!wantsWebSearch) throw searchError;
        console.error('Web search failed, retrying without it:', searchError instanceof Error ? searchError.message : searchError);
        const fallbackContent = [{ type: 'text', text: `${TUTOR_PROMPT}\n\nThe student is focusing on ${body.subject || 'General'}.\n\nStudent question: ${cleanPrompt || 'Please read and explain the attached homework image.'}` }];
        if (hasImage) fallbackContent.push({ type: 'image_url', image_url: { url: body.image } });
        messages[messages.length - 1] = { role: 'user', content: fallbackContent };
        const fallbackModel = modelInfo ? modelInfo.id : DEFAULT_MODEL;
        completion = await groq.chat.completions.create({ model: fallbackModel, messages, temperature: 0.35, max_tokens: 700 });
        sendJson(res, 200, { answer: limitToWords(completion.choices[0]?.message?.content || 'I could not create an explanation this time.'), webSearch: false, webSearchFailed: true }, headers);
        return true;
      }
      const answer = completion.choices[0]?.message?.content;
      const limitedAnswer = typeof answer === 'string' ? limitToWords(answer) : 'I could not create an explanation this time.';
      sendJson(res, 200, { answer: limitedAnswer, webSearch: wantsWebSearch }, headers);
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
  try {
    let html = fs.readFileSync(filePath, 'utf8');
    if (html.includes('__CLERK_PUBLISHABLE_KEY__')) {
      const clerkKey = process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || '';
      html = html.split('__CLERK_PUBLISHABLE_KEY__').join(clerkKey);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body style="font-family:sans-serif;padding:40px"><h2>Frontend files are missing.</h2><p>The <code>public/</code> folder could not be found. Make sure the full repository is deployed.</p></body></html>');
  }
}

function serveStatic(res, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safePath = path.normalize(requested);
  if (safePath.startsWith('..') || path.isAbsolute(safePath)) return sendError(res, 403, 'Forbidden.');
  const filePath = path.join(publicPath, safePath);
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) throw new Error('Not a file');
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html' || ext === '.htm') {
      sendHtmlFile(res, filePath);
      return;
    }
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
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
        : pathname === '/sign-up' || pathname === '/sign-up.html' ? 'sign-up.html'
        : pathname === '/community' || pathname === '/community.html' ? 'community.html'
        : pathname === '/forms' || pathname === '/forms.html' ? 'forms.html'
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
