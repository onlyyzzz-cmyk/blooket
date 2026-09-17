import Groq from 'groq-sdk';

const DEFAULT_MODEL = 'qwen/qwen3.8-27b';
const IMAGE_MODELS = new Set(['qwen/qwen3.8-27b']);
const SYSTEM_PROMPT = `You are AI Tutor, a clear and encouraging tutor for PK through college-level students.
Answer first, then show the work step by step. Adapt the explanation to the student's level.
Use plain text and basic markdown only: never use LaTeX, dollar signs, or backslash commands.
For math, show every calculation. For division, show both fraction and decimal forms.
Always finish with a Practice section containing one similar problem.`;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Groq is not configured yet. Add GROQ_API_KEY to the server environment.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const image = typeof body.image === 'string' ? body.image : '';
  if (!prompt && !image) return res.status(400).json({ error: 'Add a question or upload a homework image first.' });

  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
  const content = [{
    type: 'text',
    text: `${SYSTEM_PROMPT}\n\nSubject: ${body.subject || 'General'}\nStudent request: ${prompt || 'Explain the attached homework image.'}`,
  }];
  if (image.startsWith('data:image/') && IMAGE_MODELS.has(model)) {
    content.push({ type: 'image_url', image_url: { url: image } });
  }

  const history = Array.isArray(body.history)
    ? body.history.slice(-6).filter((turn) => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string')
      .map((turn) => ({ role: turn.role, content: turn.content }))
    : [];
  history.push({ role: 'user', content });

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({ model, messages: history, temperature: 0.35, max_tokens: 1200 });
    const answer = completion.choices?.[0]?.message?.content;
    return res.status(200).json({ answer: typeof answer === 'string' && answer.trim() ? answer : 'I could not create an explanation this time.' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown provider error';
    console.error('Tutor request failed:', detail);
    return res.status(502).json({ error: 'The tutor could not reach Groq right now. Check the server key and model.' });
  }
}
