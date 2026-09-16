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
// RATE LIMITER (no external deps, in-memory)
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

// global: 30 req/min per IP
app.use('/api/', rateLimit({ windowMs: 60000, max: 30 }));

// stricter on lookup: 5 req/min per IP
const lookupLimiter = rateLimit({
  windowMs: 60000,
  max: 5,
  message: 'Lookup rate limit exceeded. Wait a minute.',
});

// cleanup stale entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore) {
    if (now > val.resetAt + 300000) rateLimitStore.delete(key);
  }
}, 300000);

// ─────────────────────────────────────────────
// BROWSER HEADERS (mimic real Chrome client)
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

async function lookupBlooketAnswers(setId) {
  const url = getBlooketUrl(setId);

  console.log(`Fetching answers for Set ID: ${setId}...\n`);
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
      throw new Error(
        'Blooket blocked this server request with Cloudflare (HTTP 403). ' +
        'The set endpoint requires an approved browser session; this is not a valid Set ID error.',
      );
    }
    throw new Error(`Blooket returned HTTP ${response.status}.`);
  }

  let gameData;
  try {
    gameData = await response.json();
  } catch {
    throw new Error('Blooket returned an invalid JSON response.');
  }

  if (!Array.isArray(gameData.questions) || gameData.questions.length === 0) {
    throw new Error('No questions found for this Set ID.');
  }

  return gameData;
}

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
    console.error(error);
    res.status(400).json({ error: error.message || 'Lookup failed.' });
  }
}

app.post('/api/lookup', lookupLimiter, (req, res) => {
  const setId = req.body && (req.body.setId || req.body.gameId);
  return handleLookup(setId, res);
});

app.get('/api/lookup/:setId', lookupLimiter, (req, res) => {
  return handleLookup(req.params.setId, res);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Blooket lookup server listening on port ${port}`);
  });
}

module.exports = { app, getBlooketUrl, lookupBlooketAnswers, rateLimit };
