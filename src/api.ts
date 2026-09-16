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

/** Read a JSON body defensively — never throws on HTML/empty/error bodies. */
export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
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
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

/** Extract a human-readable error message; never returns 'undefined'. */
export function errorMessage(data: Record<string, unknown>, fallback = 'Something went wrong. Please try again.'): string {
  const raw = data.error;
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
    const response = await fetch('/api/chats');
    if (!response.ok) return [];
    const data = await readJson(response);
    return Array.isArray(data.chats) ? (data.chats as ChatSummary[]) : [];
  } catch { return []; }
}

export async function getChat(id: string): Promise<ChatDetail | null> {
  try {
    const response = await fetch(`/api/chats/${encodeURIComponent(id)}`);
    if (!response.ok) return null;
    const data = await readJson(response);
    return (data.chat as ChatDetail) || null;
  } catch { return null; }
}

export async function createChat(subject: string, messages: Turn[]): Promise<ChatDetail | null> {
  try {
    const response = await fetch('/api/chats', {
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
    await fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add: turn }),
    });
  } catch { /* ignore network errors during save */ }
}

export async function deleteChat(id: string): Promise<void> {
  try {
    await fetch(`/api/chats/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch { /* ignore network errors during delete */ }
}

export type AskResult = { answer: string } | { error: string };

export async function askTutor(payload: {
  prompt: string;
  image?: string;
  subject?: string;
  history?: Turn[];
}): Promise<AskResult> {
  try {
    const response = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      return { error: 'Could not understand the server response. Please try again.' };
    }

    if (!response.ok) {
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
