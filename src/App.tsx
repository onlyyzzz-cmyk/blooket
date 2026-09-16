import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import { askTutor, errorMessage, Subject } from './api';

const subjects: { label: Exclude<Subject, 'All'>; icon: string; color: string }[] = [
  { label: 'Math', icon: '∑', color: 'lavender' },
  { label: 'English', icon: 'Aa', color: 'peach' },
  { label: 'Science', icon: '✦', color: 'mint' },
  { label: 'History', icon: '◷', color: 'butter' },
];

function App() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<string>();
  const [imageName, setImageName] = useState('');
  const [activeSubject, setActiveSubject] = useState<Subject>('All');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Images must be smaller than 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setImage(String(reader.result)); setImageName(file.name); setError(''); };
    reader.readAsDataURL(file);
  };

  // Stash the question in sessionStorage, then move to the chats page where
  // the conversation lives. The chats page picks it up on load.
  const goChat = (event: FormEvent) => {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt && !image) { setError('Write a question or add a photo to get started.'); return; }
    setIsSending(true); setError('');
    try {
      sessionStorage.setItem('ai-tutor-pending', JSON.stringify({
        prompt: cleanPrompt,
        image,
        subject: activeSubject === 'All' ? 'Math' : activeSubject,
      }));
      window.location.href = '/chats.html';
    } catch {
      setIsSending(false);
      setError(errorMessage({}, 'Could not start the chat. Please try again.'));
    }
  };

  const workspaceNote = useMemo(() => activeSubject === 'All' ? '' : `Focusing on ${activeSubject}`, [activeSubject]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">✦</div><span>ai tutor</span></div>
      <a className="new-session" href="/chats.html" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}><span>＋</span> New session</a>
      <nav className="nav-list" aria-label="Main navigation">
        <button className="nav-item active"><span>⌂</span> Home</button>
        <a className="nav-item" href="/chats.html"><span>↺</span> Chats</a>
      </nav>
      <div className="sidebar-bottom"><div className="tip-card"><span className="tip-icon">✺</span><strong>Small steps,<br />big progress.</strong><p>Ask follow-ups whenever you need.</p></div><div className="profile"><div className="avatar">JD</div><div><strong>Jordan Davis</strong><span>Free plan</span></div><button>•••</button></div></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>Home</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notifications">♧<i /></button><button className="help-button">?</button></div></header>
      <section className="hero"><div><p className="eyebrow">GOOD MORNING, JORDAN <span>✦</span></p><h1>What are you curious<br /><em>about today?</em></h1><p className="hero-copy">Your personal study space for clearer thinking,<br />better questions, and real progress.</p></div><div className="hero-art"><div className="sun">✦</div><div className="paper paper-one">∑</div><div className="paper paper-two">Aa</div><div className="orbit" /></div></section>

      <section className="workspace-grid">
        <div className="ask-card"><div className="card-heading"><div><span className="section-kicker">YOUR STUDY SPACE{workspaceNote ? ` — ${workspaceNote.toUpperCase()}` : ''}</span><h2>Ask anything.</h2></div><span className="sparkle">✧</span></div>
          <form onSubmit={goChat}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Explain a concept, solve a problem, or help me understand..." rows={4} />
            {image && <div className="image-preview"><img src={image} alt="Homework preview" /><span>{imageName}</span><button type="button" onClick={() => { setImage(undefined); setImageName(''); }}>×</button></div>}
            <div className="composer-footer"><div className="composer-tools"><input ref={fileInput} type="file" accept="image/*" onChange={handleImage} hidden /><button type="button" className="attach-button" onClick={() => fileInput.current?.click()}>⌇ <span>Add photo</span></button><span className="hint">PNG, JPG up to 5MB</span></div><button className="ask-button" disabled={isSending}>{isSending ? <><span className="loader" /> Starting chat...</> : <>Chat with tutor <span>→</span></>}</button></div>
          </form>
          {error && <p className="error-message">{error}</p>}
          <p className="composer-note">Your question opens a live chat where the tutor explains step by step.</p>
        </div>
        <div className="subject-card"><div className="card-heading"><div><span className="section-kicker">EXPLORE BY SUBJECT</span><h2>Pick a lane.</h2></div><span className="tiny-arrow">↗</span></div><div className="subject-list">{subjects.map((subject) => <button className="subject-row" key={subject.label} onClick={() => { setActiveSubject(subject.label); setPrompt(`Help me with ${subject.label.toLowerCase()}: `); document.querySelector('textarea')?.focus(); }}><span className={`subject-icon ${subject.color}`}>{subject.icon}</span><span>{subject.label}</span><b>→</b></button>)}</div><p className="subject-note">Switch subjects anytime.<br />Your curiosity sets the pace.</p></div>
      </section>

      <footer><span>Made for curious minds.</span><span>AI Tutor <b>✦</b> 2026</span></footer>
    </main>
  </div>;
}

export default App;
