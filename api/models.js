const models = [
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', provider: 'Alibaba', tier: 'balanced', supportsImages: true },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', provider: 'OpenAI', tier: 'powerful', supportsImages: false },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', provider: 'OpenAI', tier: 'fast', supportsImages: false },
  { id: 'groq/compound', name: 'Compound', provider: 'Groq', tier: 'powerful', supportsImages: false },
  { id: 'groq/compound-mini', name: 'Compound Mini', provider: 'Groq', tier: 'fast', supportsImages: false },
];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  return res.status(200).json({ models });
}
