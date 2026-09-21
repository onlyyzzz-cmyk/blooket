// Templo — Discord template sharing site.
// Zero-dependency Node server: static files + JSON API for templates.
// Templates carry a name, bio, Discord template link, tags, and like/copy
// counters. Auth is Clerk (browser-side); the owner id comes from the client.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || process.env.API_PORT || 8787);
const publicPath = path.join(__dirname, 'public');
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const templatesFile = path.join(dataDir, 'templates.json');
let inMemoryTemplates = [];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* Best effort. */ }

function loadTemplates() {
  try {
    const parsed = JSON.parse(fs.readFileSync(templatesFile, 'utf8'));
    if (Array.isArray(parsed)) { inMemoryTemplates = parsed; return parsed; }
  } catch { /* First run — start fresh. */ }
  return inMemoryTemplates;
}

function saveTemplates(templates) {
  inMemoryTemplates = templates;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(templatesFile, JSON.stringify(templates));
  } catch (error) {
    console.error('Template file unavailable; using in-memory state:', error.message);
  }
}

function sanitizeText(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function validTemplateLink(value) {
  const link = String(value ?? '').trim();
  return /^https:\/\/(discord|discordapp)\.com\/template\/[A-Za-z0-9]+/.test(link) || /^https:\/\/(?:[a-z0-9-]+\.)?discord\.com\/template\//.test(link)
    ? link
    : '';
}

function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'template';
}

// ---- Public shape ----
function publicTemplate(template, viewerId) {
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    bio: template.bio,
    link: template.link,
    tags: template.tags,
    guildName: template.guildName || '',
    iconText: (template.name || 'T').slice(0, 1).toUpperCase(),
    ownerId: template.ownerId,
    ownerName: template.ownerName || 'Anonymous',
    ownerAvatar: template.ownerAvatar || '',
    likes: template.likedBy.length,
    copies: template.copies,
    liked: viewerId ? template.likedBy.includes(viewerId) : false,
    created: template.created,
    updated: template.updated,
  };
}

function findTemplate(id) {
  return loadTemplates().find((template) => template.id === id || template.slug === id);
}

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

const rateLimits = new Map();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) if (now > entry.resetAt) rateLimits.delete(ip);
}, 5 * 60 * 1000);

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
    'Retry-After': String(retryAfter),
    'Access-Control-Allow-Origin': '*',
  });
  return true;
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) { req.destroy(); reject(new Error('Request body is too large.')); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return true;
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, service: 'templo' }, headers);
    return true;
  }

  if (url.pathname === '/api/config' && req.method === 'GET') {
    sendJson(res, 200, {
      clerkPublishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || '',
    }, headers);
    return true;
  }

  // ---- Templates collection ----
  if (url.pathname === '/api/templates' && req.method === 'GET') {
    const viewerId = url.searchParams.get('viewerId') || '';
    const search = (url.searchParams.get('search') || '').toLowerCase().trim();
    const tag = (url.searchParams.get('tag') || '').toLowerCase().trim();
    const sort = url.searchParams.get('sort') || 'new';
    const mine = url.searchParams.get('mine') === '1' && viewerId;

    let templates = loadTemplates();
    if (mine) templates = templates.filter((template) => template.ownerId === viewerId);
    if (search) {
      templates = templates.filter((template) =>
        template.name.toLowerCase().includes(search)
        || template.bio.toLowerCase().includes(search)
        || template.tags.some((entry) => entry.includes(search))
        || (template.guildName || '').toLowerCase().includes(search));
    }
    if (tag) templates = templates.filter((template) => template.tags.includes(tag));
    templates = templates.slice().sort((a, b) => {
      if (sort === 'top') return (b.likes ?? b.likedBy.length) - (a.likes ?? a.likedBy.length) || b.copies - a.copies;
      if (sort === 'copies') return b.copies - a.copies;
      return b.created - a.created;
    });
    sendJson(res, 200, {
      templates: templates.slice(0, 200).map((template) => publicTemplate(template, viewerId)),
    }, headers);
    return true;
  }

  if (url.pathname === '/api/templates' && req.method === 'POST') {
    if (rateLimit(req, res)) return true;
    const body = await readBody(req);
    const ownerId = sanitizeText(body.ownerId, 64);
    if (!ownerId) return sendError(res, 401, 'Sign in with Discord-linked Clerk to publish a template.');
    const name = sanitizeText(body.name, 60);
    const bio = sanitizeText(body.bio, 300);
    const link = validTemplateLink(body.link);
    const guildName = sanitizeText(body.guildName, 60);
    const tags = Array.isArray(body.tags)
      ? [...new Set(body.tags.map((entry) => sanitizeText(entry, 20).toLowerCase()).filter(Boolean))].slice(0, 6)
      : [];
    if (!name) return sendError(res, 400, 'Give your template a name.');
    if (!link) return sendError(res, 400, 'The template link must look like https://discord.com/template/XXXXXX.');
    const templates = loadTemplates();
    const now = Date.now();
    const template = {
      id: randomUUID().slice(0, 12),
      slug: slugify(name) + '-' + randomUUID().slice(0, 4),
      name, bio, link, tags, guildName,
      ownerId,
      ownerName: sanitizeText(body.ownerName, 40) || 'Anonymous',
      ownerAvatar: sanitizeText(body.ownerAvatar, 200),
      likedBy: [],
      copies: 0,
      created: now,
      updated: now,
    };
    templates.push(template);
    saveTemplates(templates);
    sendJson(res, 200, { ok: true, template: publicTemplate(template, ownerId) }, headers);
    return true;
  }

  // ---- Single template: edit / delete / like / copy ----
  const templateMatch = url.pathname.match(/^\/api\/templates\/([^/]+)\/?$/);
  if (templateMatch) {
    const id = templateMatch[1];
    if (req.method === 'GET') {
      const template = findTemplate(id);
      if (!template) return sendError(res, 404, 'Template not found.');
      const viewerId = url.searchParams.get('viewerId') || '';
      sendJson(res, 200, { template: publicTemplate(template, viewerId) }, headers);
      return true;
    }
    const body = await readBody(req);
    const userId = sanitizeText(body.userId, 64);
    const templates = loadTemplates();
    const template = templates.find((entry) => entry.id === id || entry.slug === id);
    if (!template) return sendError(res, 404, 'Template not found.');

    if (req.method === 'PATCH') {
      if (template.ownerId !== userId) return sendError(res, 403, 'Only the owner can edit this template.');
      if (body.name !== undefined) {
        const name = sanitizeText(body.name, 60);
        if (!name) return sendError(res, 400, 'Give your template a name.');
        template.name = name;
      }
      if (body.bio !== undefined) template.bio = sanitizeText(body.bio, 300);
      if (body.link !== undefined) {
        const link = validTemplateLink(body.link);
        if (!link) return sendError(res, 400, 'The template link must look like https://discord.com/template/XXXXXX.');
        template.link = link;
      }
      if (body.guildName !== undefined) template.guildName = sanitizeText(body.guildName, 60);
      if (body.tags !== undefined) {
        template.tags = Array.isArray(body.tags)
          ? [...new Set(body.tags.map((entry) => sanitizeText(entry, 20).toLowerCase()).filter(Boolean))].slice(0, 6)
          : [];
      }
      template.updated = Date.now();
      saveTemplates(templates);
      sendJson(res, 200, { ok: true, template: publicTemplate(template, userId) }, headers);
      return true;
    }

    if (req.method === 'DELETE') {
      if (template.ownerId !== userId) return sendError(res, 403, 'Only the owner can delete this template.');
      saveTemplates(templates.filter((entry) => entry !== template));
      sendJson(res, 200, { ok: true }, headers);
      return true;
    }

    if (req.method === 'POST' && body.action === 'like') {
      const index = template.likedBy.indexOf(userId);
      if (!userId) return sendError(res, 401, 'Sign in to like templates.');
      if (index === -1) template.likedBy.push(userId);
      else template.likedBy = template.likedBy.filter((entry) => entry !== userId);
      saveTemplates(templates);
      sendJson(res, 200, { ok: true, likes: template.likedBy.length, liked: index === -1 }, headers);
      return true;
    }

    if (req.method === 'POST' && body.action === 'copy') {
      template.copies += 1;
      saveTemplates(templates);
      sendJson(res, 200, { ok: true, copies: template.copies }, headers);
      return true;
    }

    return sendError(res, 400, 'Unknown action.');
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
  '.webp': 'image/webp',
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
    res.end('<!doctype html><html><body style="font-family:sans-serif;padding:40px"><h2>Site files are missing.</h2><p>The <code>public/</code> folder could not be found. Make sure the full repository is deployed.</p></body></html>');
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
    if (ext === '.html' || ext === '.htm') return sendHtmlFile(res, filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => { if (!res.headersSent) sendError(res, 500, 'Could not read the file.'); res.end(); });
    res.writeHead(200, { 'Content-Type': contentType });
    stream.pipe(res);
  } catch {
    const routes = {
      '/dashboard': 'dashboard.html',
      '/sign-up': 'sign-up.html',
    };
    const fallback = routes[pathname] || 'index.html';
    sendHtmlFile(res, path.join(publicPath, fallback));
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
  console.log(`Templo server listening on 0.0.0.0:${port}`);
  console.log(`Serving static files from: ${publicPath} (exists: ${fs.existsSync(path.join(publicPath, 'index.html'))})`);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
