import React, { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  appendToChat,
  askTutor,
  ChatSummary,
  createChat,
  deleteChat,
  errorMessage,
  formatDate,
  getChat,
  listChats,
  readJson,
  Subject,
  Turn,
} from './api';
import './styles.css';

const subjects: { label: Exclude<Subject, 'All'>; icon: string; color: string }[] = [
  { label: 'Math', icon: '∑', color: 'lavender' },
  { label: 'English', icon: 'Aa', color: 'peach' },
  { label: 'Science', icon: '✦', color: 'mint' },
  { label: 'History', icon: '◷', color: 'butter' },
];

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

  const refreshChats = useCallback(async () => {
    try { setChats(await listChats()); } catch { /* leave list as-is */ }
  }, []);

  useEffect(() => { refreshChats(); }, [refreshChats]);

  // Pick up a question handed over from the home page composer.
  useEffect(() => {
    const raw = sessionStorage.getItem('ai-tutor-pending');
    if (!raw) return;
    sessionStorage.removeItem('ai-tutor-pending');
    try {
      const pending = JSON.parse(raw) as { prompt?: string; image?: string; subject?: Exclude<Subject, 'All'> };
      if (pending.subject) setActiveSubject(pending.subject);
      if (pending.image) { setImage(pending.image); setImageName('Homework photo'); }
      if (pending.prompt) setPrompt(pending.prompt);
    } catch { /* ignore malformed handoff */ }
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
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
    } catch {
      setError('Could not load that chat.');
    }
  };

  const removeSession = async (id: string) => {
    try {
      await deleteChat(id);
      if (activeId === id) startNewSession();
      refreshChats();
    } catch {
      setError('Could not delete that chat.');
    }
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
    if (!cleanPrompt && !image) { setError('Write a question or add a photo to get started.'); return; }
    setIsLoading(true); setError('');

    const userTurn: Turn = { role: 'user', content: cleanPrompt || 'Please read and explain the attached homework image.' };
    const history = turns.slice(-6);
    setTurns((current) => [...current, userTurn]);
    setPrompt(''); setImage(undefined); setImageName('');

    const result = await askTutor({
      prompt: cleanPrompt,
      image,
      subject: activeSubject,
      history,
    });

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
    } catch {
      setError('Saved your answer, but could not sync the chat list.');
    }
    setIsLoading(false);
  };

  const activeChat = chats.find((chat) => chat.id === activeId) ?? null;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" style={{ textDecoration: 'none' }}><div className="brand-mark">✦</div><span>ai tutor</span></a>
      <button className="new-session" onClick={startNewSession}><span>＋</span> New session</button>
      <nav className="nav-list" aria-label="Chat navigation">
        <a className="nav-item" href="/"><span>⌂</span> Home</a>
        <button className="nav-item active"><span>↺</span> Chats <small>{chats.length}</small></button>
      </nav>
      <div className="sidebar-chats">
        {chats.length === 0 && <p className="sidebar-chats-empty">Your chats will appear here.</p>}
        {chats.map((chat) => (
          <button key={chat.id} className={`sidebar-chat ${chat.id === activeId ? 'active' : ''}`} onClick={() => openSession(chat.id)}>
            <span className={`history-dot ${chat.subject.toLowerCase()}`} />
            <span className="sidebar-chat-title">{chat.title}</span>
            <span className="sidebar-chat-date">{formatDate(chat.updated)}</span>
          </button>
        ))}
      </div>
      <div className="sidebar-bottom"><div className="tip-card"><span className="tip-icon">✺</span><strong>Small steps,<br />big progress.</strong><p>Ask follow-ups whenever you need.</p></div></div>
    </aside>

    <main className="main-content chats-main">
      <header className="topbar">
        <div className="breadcrumb">Workspace <span>/</span> <strong>Chats</strong>{activeChat ? <span className="breadcrumb-chat"> / {activeChat.title}</span> : null}</div>
        <div className="top-actions"><button className="icon-button" aria-label="Notifications">♧<i /></button><button className="help-button">?</button></div>
      </header>

      <section className="chat-stage">
        <div className="chat-head">
          <div>
            <p className="section-kicker">{activeId ? 'CONTINUING CHAT' : 'NEW SESSION'}</p>
            <h2>{activeChat ? activeChat.title : 'What are you curious about?'}</h2>
          </div>
          <div className="subject-pills">
            {subjects.map((subject) => (
              <button key={subject.label} className={`subject-pill ${subject.color} ${activeSubject === subject.label ? 'selected' : ''}`} onClick={() => setActiveSubject(subject.label)}>{subject.label}</button>
            ))}
          </div>
        </div>

        <div className="chat-log" ref={logRef}>
          {turns.length === 0 && (
            <div className="chat-welcome">
              <div className="brand-mark big">✦</div>
              <h3>Start the conversation</h3>
              <p>Ask a math problem, get essay feedback, or explore a history topic. Your tutor explains step by step.</p>
            </div>
          )}
          {turns.map((turn, index) => (
            <div key={index} className={`chat-turn ${turn.role}`}>
              <span className="chat-role">{turn.role === 'user' ? 'You' : 'Tutor'}</span>
              <p>{turn.content}</p>
            </div>
          ))}
          {isLoading && <div className="chat-turn assistant"><span className="chat-role">Tutor</span><p><span className="loader dark" /> Thinking...</p></div>}
        </div>

        <form className="chat-composer" onSubmit={sendMessage}>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={turns.length ? 'Ask a follow-up...' : 'Explain a concept, solve a problem, or help me understand...'} rows={3} />
          {image && <div className="image-preview"><img src={image} alt="Homework preview" /><span>{imageName}</span><button type="button" onClick={() => { setImage(undefined); setImageName(''); }}>×</button></div>}
          <div className="composer-footer">
            <div className="composer-tools">
              <input ref={fileInput} type="file" accept="image/*" onChange={handleImage} hidden />
              <button type="button" className="attach-button" onClick={() => fileInput.current?.click()}>⌇ <span>Add photo</span></button>
              <span className="hint">PNG, JPG up to 5MB</span>
            </div>
            <button className="ask-button" disabled={isLoading}>{isLoading ? <><span className="loader" /> Thinking...</> : <>Send <span>→</span></>}</button>
          </div>
        </form>
        {error && <p className="error-message">{error}</p>}
      </section>
    </main>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChatsApp />
  </React.StrictMode>,
);
