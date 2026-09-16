const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const savesDir = path.join(__dirname, 'saves');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// ─────────────────────────────────────────────
// RATE LIMITER
// ─────────────────────────────────────────────
const rateLimitStore = new Map();

function rateLimit({ windowMs = 60000, max = 10, message = 'Too many requests. Slow down.' }) {
  return (req, res, next) => {
    const key = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 0, resetAt: now + windowMs });
    }

    const entry = rateLimitStore.get(key);

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count++;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      return res.status(429).json({
        error: message,
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
    }

    next();
  };
}

app.use('/api/', rateLimit({ windowMs: 60000, max: 30 }));

const lookupLimiter = rateLimit({
  windowMs: 60000,
  max: 5,
  message: 'Lookup rate limit exceeded. Wait a minute.',
});

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore) {
    if (now > val.resetAt + 300000) rateLimitStore.delete(key);
  }
}, 300000);

// ─────────────────────────────────────────────
// BROWSER HEADERS
// ─────────────────────────────────────────────
const BROWSER_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

// ─────────────────────────────────────────────
// PUPPETEER BROWSER (lazy singleton)
// ─────────────────────────────────────────────
let browserInstance = null;

async function getBrowser() {
  if (browserInstance?.connected) return browserInstance;

  const puppeteer = require('puppeteer');

  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: { width: 1920, height: 1080 },
  });

  await browserInstance.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });

  console.log('[puppeteer] browser launched');

  browserInstance.on('disconnected', () => {
    console.log('[puppeteer] browser disconnected');
    browserInstance = null;
  });

  return browserInstance;
}

process.on('SIGINT', async () => {
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});

// ─────────────────────────────────────────────
// PUPPETEER LOOKUP
// ─────────────────────────────────────────────
async function lookupWithPuppeteer(setId) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'media', 'font'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    await page.goto('https://play.blooket.com/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const title = await page.title();
    if (/just a moment|attention required|cloudflare/i.test(title)) {
      console.log('[puppeteer] challenge detected, waiting...');
      await page.waitForFunction(
        () => !/just a moment|attention required|cloudflare/i.test(document.title),
        { timeout: 20000 },
      );
    }

    const gameData = await page.evaluate(async (id) => {
      const res = await fetch(`https://play.blooket.com/api/gamequestionsets?gameId=${id}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }, setId);

    return gameData;
  } finally {
    await page.close();
  }
}

// ─────────────────────────────────────────────
// DIRECT FETCH
// ─────────────────────────────────────────────
function getBlooketUrl(setId) {
  const value = String(setId || '').trim();
  if (!value) throw new Error('A Set ID is required.');

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.hostname !== 'blooket.com' && !url.hostname.endsWith('.blooket.com')) {
      throw new Error('Only blooket.com URLs are allowed.');
    }
    return url;
  }

  if (!value.startsWith('/')) {
    const url = new URL('https://play.blooket.com/api/gamequestionsets');
    url.searchParams.set('gameId', value);
    return url;
  }

  const baseUrl = process.env.BLOOKET_API_BASE_URL || 'https://play.blooket.com';
  return new URL(`${baseUrl.replace(/\/$/, '')}${value}`);
}

async function lookupDirect(setId) {
  const url = getBlooketUrl(setId);

  const response = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      'Origin': 'https://play.blooket.com',
      'Referer': 'https://play.blooket.com/',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 403 && /cloudflare|just a moment|attention required/i.test(body)) {
      const err = new Error('Cloudflare 403 — escalating to browser');
      err.escalate = true;
      throw err;
    }
    throw new Error(`Blooket returned HTTP ${response.status}.`);
  }

  return response.json();
}

async function lookupBlooketAnswers(setId) {
  console.log(`[lookup] Set ID: ${setId}`);

  try {
    const data = await lookupDirect(setId);
    console.log('[lookup] direct fetch success');
    return data;
  } catch (err) {
    if (!err.escalate) throw err;
    console.log('[lookup] direct blocked, launching browser...');
  }

  const data = await lookupWithPuppeteer(setId);
  console.log('[lookup] puppeteer fetch success');
  return data;
}

// ─────────────────────────────────────────────
// NORMALIZATION
// ─────────────────────────────────────────────
function normalizeAnswers(gameData) {
  if (gameData.answers && typeof gameData.answers === 'object') {
    return gameData.answers;
  }

  const questions = Array.isArray(gameData)
    ? gameData
    : Array.isArray(gameData.questions) ? gameData.questions : [];

  return Object.fromEntries(
    questions.map((question, index) => {
      const text = String(question.question ?? question.text ?? question.questionText ?? `Question ${index + 1}`).trim();
      const choices = question.answers || question.choices || [];
      const correct = question.correctAnswers ?? question.correctAnswer ?? [];
      const correctValues = (Array.isArray(correct) ? correct : [correct])
        .filter((answer) => answer !== null && answer !== undefined && String(answer).trim() !== '')
        .map(String);
      const answers = choices.map((answer) => {
        const answerText = typeof answer === 'string'
          ? answer
          : answer.text ?? answer.answer ?? answer.choice ?? '';
        return {
          text: String(answerText),
          correct: correctValues.includes(String(answerText)) || answer.correct === true,
        };
      }).filter((answer) => answer.text.trim());

      for (const answer of correctValues) {
        if (!answers.some((item) => item.text === answer)) {
          answers.push({ text: answer, correct: true });
        }
      }

      return [text, { answers, timeLimit: question.timeLimit }];
    }),
  );
}

function createResult(gameData, source = 'import') {
  const answers = normalizeAnswers(gameData);
  return {
    ...gameData,
    source,
    answers,
    questionCount: Object.keys(answers).length,
    setName: gameData.setName || gameData.name || gameData.title || 'Imported study set',
  };
}

async function handleLookup(setId, res) {
  try {
    const gameData = await lookupBlooketAnswers(setId);
    const result = createResult(gameData, 'blooket');

    await fs.mkdir(savesDir, { recursive: true });
    const filename = `${Date.now()}-${String(setId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    await fs.writeFile(
      path.join(savesDir, filename),
      JSON.stringify(result, null, 2),
      'utf8',
    );

    res.json(result);
  } catch (error) {
    console.error('[lookup error]', error.message);
    res.status(400).json({ error: error.message || 'Lookup failed.' });
  }
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
app.post('/api/lookup', lookupLimiter, (req, res) => {
  const setId = req.body && (req.body.setId || req.body.gameId);
  return handleLookup(setId, res);
});

app.get('/api/lookup/:setId', lookupLimiter, (req, res) => {
  return handleLookup(req.params.setId, res);
});

app.get('/api/health', async (req, res) => {
  res.json({
    ok: true,
    browser: browserInstance?.connected ? 'ready' : 'not launched (will start on demand)',
    rateLimitStore: rateLimitStore.size,
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Blooket lookup server listening on port ${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
  });
}

module.exports = { app, getBlooketUrl, lookupBlooketAnswers, rateLimit, lookupWithPuppeteer };
