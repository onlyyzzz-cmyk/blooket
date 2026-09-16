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

function getBlooketUrl(setId) {
  const value = String(setId || '').trim();
  if (!value) throw new Error('A Set ID is required.');

  // The API expects a Blooket path such as /api/set/12345. Do not allow
  // arbitrary hosts to turn this endpoint into an SSRF proxy.
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.hostname !== 'blooket.com' && !url.hostname.endsWith('.blooket.com')) {
      throw new Error('Only blooket.com URLs are allowed.');
    }
    return url;
  }

  // Public set pages are HTML and the old blooket.com/api/set path returns
  // 403. The question-set JSON endpoint is hosted on play.blooket.com.
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
      Accept: 'application/json',
      'User-Agent': 'BlooketLookup/1.0',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 403 && /cloudflare|just a moment/i.test(body)) {
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

      // Some exports only include correctAnswers. Keep those visible rather
      // than returning an empty answer list to the frontend.
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

app.post('/api/lookup', (req, res) => {
  const setId = req.body && (req.body.setId || req.body.gameId);
  return handleLookup(setId, res);
});

app.get('/api/lookup/:setId', (req, res) => {
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

module.exports = { app, getBlooketUrl, lookupBlooketAnswers };
