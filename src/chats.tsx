import React, { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  appendToChat, askTutor, ChatSummary, createChat, deleteChat,
  errorMessage, formatDate, getChat, listChats, Subject, Turn,
} from './api';
import './styles.css';

const subjects: { label: Exclude<Subject, 'All'>; icon: string }[] = [
  { label: 'Math', icon: '∑' },
  { label: 'English', icon: 'Aa' },
  { label: 'Science', icon: '⚗' },
  { label: 'History', icon: '🏛' },
];

/** Simple markdown-to-HTML for bold, italic, headers, lists, code */
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<strong style="font-size:14px;display:block;margin:12px 0 6px">$1</strong>')
    .replace(/^## (.+)$/gm, '<strong style="font-size:15px;display:block;margin:14px 0 6px">$1</strong>')
    .replace(/^# (.+)$/gm, '<strong style="font-size:16px;display:block;margin:16px 0 8px">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="step"><span class="step-num">$1</span><span>$2</span></div>')
    .replace(/^- (.+)$/gm, '<div class="bullet">• $1</div>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
  return html;
}

function ChatsApp() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeSubject, setActiveSubject] = useState<Exclude<Subject, 'All'>>('Math');
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<string>();
  const [imageName, setImageName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshChats = useCallback(async () => {
    try { setChats(await listChats()); } catch { /* leave list as-is */ }
  }, []);

  useEffect(() => { refreshChats(); }, [refreshChats]);

  useEffect(() => {
    const raw = sessionStorage.getItem('ai-tutor-pending');
    if (!raw) return;
    sessionStorage.removeItem('ai-tutor-pending');
    try {
      const pending = JSON.parse(raw) as { prompt?: string; image?: string; subject?: Exclude<Subject, 'All'> };
      if (pending.subject) setActiveSubject(pending.subject);
      if (pending.image) { setImage(pending.image); setImageName('Photo'); }
      if (pending.prompt) setPrompt(pending.prompt);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, isLoading]);

  const startNewSession = () => {
    setActiveId(null); setTurns([]); setPrompt(''); setImage(undefined); setImageName(''); setError('');
  };

  const openSession = async (id: string) => {
    setError('');
    try {
      const chat = await getChat(id);
      if (!chat) { setError('That chat could not be loaded.'); return; }
      setActiveId(chat.id);
      setTurns(chat.messages.filter((t) => typeof t.content === 'string'));
      setActiveSubject(chat.subject);
    } catch { setError('Could not load that chat.'); }
  };

  const removeSession = async (id: string) => {
    try {
      await deleteChat(id);
      if (activeId === id) startNewSession();
      refreshChats();
    } catch { setError('Could not delete that chat.'); }
  };

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Images must be smaller than 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setImage(String(reader.result)); setImageName(file.name); setError(''); };
    reader.readAsDataURL(file);
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt && !image) { setError('Type a question or add a photo.'); return; }
    setIsLoading(true); setError('');

    const userTurn: Turn = { role: 'user', content: cleanPrompt || 'Please read and explain the attached homework image.' };
    const history = turns.slice(-6);
    setTurns((current) => [...current, userTurn]);
    setPrompt(''); setImage(undefined); setImageName('');

    const result = await askTutor({ prompt: cleanPrompt, image, subject: activeSubject, history });

    if ('error' in result) {
      setError(errorMessage(result, 'Could not connect to the tutor.'));
      setTurns((current) => current.slice(0, -1));
      setIsLoading(false);
      return;
    }

    const answerTurn: Turn = { role: 'assistant', content: result.answer };
    const fullTurns = [...turns, userTurn, answerTurn];
    setTurns(fullTurns);

    try {
      if (activeId) {
        await appendToChat(activeId, userTurn);
        await appendToChat(activeId, answerTurn);
      } else {
        const created = await createChat(activeSubject, fullTurns);
        if (created) setActiveId(created.id);
      }
      refreshChats();
    } catch { /* ignore save errors */ }
    setIsLoading(false);
  };

  const activeChat = chats.find((c) => c.id === activeId) ?? null;

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <aside className="chat-sidebar">
        <div className="sidebar-top">
          <a href="/" className="sidebar-logo">
            <span className="logo-icon">✦</span>
            <span className="logo-text">AITutor</span>
          </a>
          <button className="new-chat-btn" onClick={startNewSession}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Chat
          </button>
        </div>
        <div className="sidebar-chats">
          {chats.length === 0 && <p className="empty-chats">No chats yet. Ask a question to get started.</p>}
          {chats.map((chat) => (
            <div key={chat.id} className={`chat-item ${chat.id === activeId ? 'active' : ''}`}>
              <button className="chat-item-btn" onClick={() => openSession(chat.id)}>
                <span className="chat-item-text">{chat.title}</span>
                <span className="chat-item-time">{formatDate(chat.updated)}</span>
              </button>
              <button className="chat-item-delete" onClick={() => removeSession(chat.id)} title="Delete">✕</button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="chat-main">
        <div className="chat-header">
          <div className="chat-header-left">
            <h2>{activeChat ? activeChat.title : 'New Chat'}</h2>
          </div>
          <div className="subject-chips small">
            {subjects.map((s) => (
              <button key={s.label} className={`chip ${activeSubject === s.label ? 'active' : ''}`}
                onClick={() => setActiveSubject(s.label)}>
                <span className="chip-icon">{s.icon}</span>{s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="chat-messages" ref={logRef}>
          {turns.length === 0 && !isLoading && (
            <div className="chat-empty-state">
              <div className="empty-icon">✦</div>
              <h3>Ask me anything</h3>
              <p>Math, English, Science, or History — I'll break it down step by step.</p>
            </div>
          )}

          {turns.map((turn, i) => (
            <div key={i} className={`msg ${turn.role}`}>
              <div className="msg-avatar">{turn.role === 'user' ? 'You' : 'AI'}</div>
              <div className="msg-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.content) }} />
            </div>
          ))}

          {isLoading && (
            <div className="msg assistant">
              <div className="msg-avatar">AI</div>
              <div className="msg-body thinking">
                <span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
              </div>
            </div>
          )}
        </div>

        {error && <div className="chat-error">{error}</div>}

        <form className="chat-input-bar" onSubmit={sendMessage}>
          {image && (
            <div className="input-bar-preview">
              <img src={image} alt="" className="input-bar-thumb" />
              <button type="button" onClick={() => { setImage(undefined); setImageName(''); }}>✕</button>
            </div>
          )}
          <div className="input-bar-row">
            <input ref={fileInput} type="file" accept="image/*" onChange={handleImage} hidden />
            <button type="button" className="input-bar-tool" onClick={() => fileInput.current?.click()} title="Upload photo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask a question..."
              rows={1}
              className="input-bar-textarea"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <button type="submit" className="input-bar-send" disabled={isLoading || (!prompt.trim() && !image)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChatsApp />
  </React.StrictMode>,
);
