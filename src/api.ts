export type Subject = 'All' | 'Math' | 'English' | 'Science' | 'History' | 'General';

export type Turn = { role: 'user' | 'assistant'; content: string };

export type ChatSummary = {
  id: string;
  title: string;
  subject: Exclude<Subject, 'All'>;
  created: number;
  updated: number;
};

export type ChatDetail = ChatSummary & { messages: Turn[] };

export type AiModel = {
  id: string;
  name: string;
  provider: string;
  tier: 'fast' | 'balanced' | 'powerful';
  supportsImages: boolean;
};

export const DEFAULT_MODELS: AiModel[] = [
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', provider: 'Alibaba', tier: 'balanced', supportsImages: true },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', provider: 'OpenAI', tier: 'powerful', supportsImages: false },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', provider: 'OpenAI', tier: 'fast', supportsImages: false },
  { id: 'groq/compound', name: 'Compound', provider: 'Groq', tier: 'powerful', supportsImages: false },
  { id: 'groq/compound-mini', name: 'Compound Mini', provider: 'Groq', tier: 'fast', supportsImages: false },
];

const configuredApiUrl = (typeof window !== 'undefined' ? ((window as Window & { AI_TUTOR_API_URL?: string }).AI_TUTOR_API_URL || '') : '').trim().replace(/\/$/, '');

function apiPath(path: string): string {
  return configuredApiUrl ? `${configuredApiUrl}${path}` : path;
}

/** Read a JSON body defensively — never throws on HTML/empty/error bodies. */
export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  return parseJsonText(text);
}

function parseJsonText(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Check if a response body looks like HTML (server down, SPA catch-all, 502 proxy). */
function isHtmlResponse(body: string): boolean {
  const trimmed = body.trim().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<body');
}

/** Extract a human-readable error message; never returns 'undefined'. */
export function errorMessage(data: Record<string, unknown>, fallback = 'Something went wrong. Please try again.'): string {
  const raw = data.error ?? data.message;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return fallback;
}

export function formatDate(unix: number): string {
  const date = new Date(unix * 1000);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export async function listChats(): Promise<ChatSummary[]> {
  try {
    const response = await fetch(apiPath('/api/chats'), { headers: { Accept: 'application/json' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return [];
    const data = await readJson(response);
    return Array.isArray(data.chats) ? (data.chats as ChatSummary[]) : [];
  } catch { return []; }
}

export async function getChat(id: string): Promise<ChatDetail | null> {
  try {
    const response = await fetch(apiPath(`/api/chats?id=${encodeURIComponent(id)}`), { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const data = await readJson(response);
    return (data.chat as ChatDetail) || null;
  } catch { return null; }
}

export async function createChat(subject: string, messages: Turn[]): Promise<ChatDetail | null> {
  try {
    const response = await fetch(apiPath('/api/chats'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, messages }),
    });
    if (!response.ok) return null;
    const data = await readJson(response);
    return (data.chat as ChatDetail) || null;
  } catch { return null; }
}

export async function appendToChat(id: string, turn: Turn): Promise<void> {
  try {
    await fetch(apiPath(`/api/chats?id=${encodeURIComponent(id)}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add: turn }),
    });
  } catch { /* ignore network errors during save */ }
}

export async function deleteChat(id: string): Promise<void> {
  try {
    await fetch(apiPath(`/api/chats?id=${encodeURIComponent(id)}`), { method: 'DELETE', headers: { Accept: 'application/json' } });
  } catch { /* ignore network errors during delete */ }
}

export async function listModels(): Promise<AiModel[]> {
  try {
    const response = await fetch(apiPath('/api/models'), { headers: { Accept: 'application/json' } });
    const rawText = await response.text();
    if (!response.ok) return [];
    if (isHtmlResponse(rawText)) return [];
    const data = parseJsonText(rawText);
    return Array.isArray(data.models) && data.models.length > 0 ? (data.models as AiModel[]) : DEFAULT_MODELS;
  } catch { return DEFAULT_MODELS; }
}

export type AskResult = { answer: string } | { error: string };

export async function askTutor(payload: {
  prompt: string;
  image?: string;
  subject?: string;
  model?: string;
  history?: Turn[];
}): Promise<AskResult> {
  try {
    const response = await fetch(apiPath('/api/tutor'), {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();

    // Detect server down (HTML returned instead of JSON)
    if (isHtmlResponse(rawText)) {
      return { error: 'The server is starting up or unavailable. Please wait a moment and try again.' };
    }

    let data: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(rawText);
      data = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      const contentType = response.headers.get('content-type') || 'unknown';
      return { error: `The AI service returned an invalid response (${response.status}, ${contentType}). Check that the Node/Python API is running at the same origin.` };
    }

    if (!response.ok) {
      if (response.status === 405 || response.status === 502 || response.status === 503) {
        return { error: `The AI API is unavailable right now (${response.status}). Start the Node/Python API on the configured preview port and try again.` };
      }
      return { error: errorMessage(data, `Server error (${response.status}). Please try again.`) };
    }

    const answer = data.answer;
    if (typeof answer !== 'string' || !answer.trim()) {
      return { error: 'The tutor returned an empty response. Please try again.' };
    }
    return { answer };
  } catch {
    return { error: 'Could not reach the server. Make sure the app is running and try again.' };
  }
}
