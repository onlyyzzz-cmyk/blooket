import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { errorMessage, Subject } from './api';

const subjects: { label: Exclude<Subject, 'All'>; icon: string; color: string }[] = [
  { label: 'Math', icon: 'math', color: '#6366f1' },
  { label: 'English', icon: 'english', color: '#f59e0b' },
  { label: 'Science', icon: 'science', color: '#10b981' },
  { label: 'History', icon: 'history', color: '#ef4444' },
  { label: 'General', icon: 'general', color: '#8b5cf6' },
];

function SubjectIcon({ name, size = 18 }: { name: string; size?: number }) {
  const s = size;
  if (name === 'math') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
    </svg>
  );
  if (name === 'english') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>
    </svg>
  );
  if (name === 'science') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6"/><path d="M10 3v7.4a2 2 0 0 1-.6 1.4L5 15.2V17h14v-1.8l-4.4-3.4a2 2 0 0 1-.6-1.4V3"/>
      <path d="M7 17l2 4"/><path d="M17 17l-2 4"/>
    </svg>
  );
  if (name === 'history') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
  // general
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
    </svg>
  );
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<string>();
  const [imageName, setImageName] = useState('');
  const [activeSubject, setActiveSubject] = useState<Exclude<Subject, 'All'>>('General');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Images must be smaller than 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setImage(String(reader.result)); setImageName(file.name); setError(''); };
    reader.readAsDataURL(file);
  };

  const goChat = (event: FormEvent) => {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt && !image) { setError('Type a question or add a photo.'); return; }
    setIsSending(true);
    try {
      sessionStorage.setItem('ai-tutor-pending', JSON.stringify({
        prompt: cleanPrompt, image, subject: activeSubject,
      }));
      window.location.href = '/chats.html';
    } catch {
      setIsSending(false);
      setError(errorMessage({}, 'Could not start the chat. Please try again.'));
    }
  };

  return (
    <div className="landing">
      <header className="landing-header">
        <a href="/" className="landing-logo">
          <span className="logo-icon">✦</span>
          <span className="logo-text">AITutor</span>
        </a>
        <a href="/chats.html" className="header-chats-link">My Chats</a>
      </header>

      <section className="landing-hero">
        <h1>Your AI Homework Helper</h1>
        <p className="landing-subtitle">
          Snap a photo or type your question. Get clear, step-by-step answers in seconds.
        </p>
      </section>

      <div className="subject-chips">
        {subjects.map((s) => (
          <button
            key={s.label}
            className={`chip ${activeSubject === s.label ? 'active' : ''}`}
            onClick={() => { setActiveSubject(s.label); textareaRef.current?.focus(); }}
          >
            <SubjectIcon name={s.icon} size={14} />
            {s.label}
          </button>
        ))}
      </div>

      <form className="input-card" onSubmit={goChat}>
        <div className="input-card-inner">
          {image && (
            <div className="image-preview-bar">
              <img src={image} alt="Uploaded" className="image-thumb" />
              <span className="image-name">{imageName}</span>
              <button type="button" className="image-remove" onClick={() => { setImage(undefined); setImageName(''); }}>✕</button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask anything... e.g. Solve for x: 2x + 5 = 15"
            rows={3}
            className="input-textarea"
          />
          <div className="input-actions">
            <div className="input-tools">
              <input ref={fileInput} type="file" accept="image/*" onChange={handleImage} hidden />
              <button type="button" className="tool-btn" onClick={() => fileInput.current?.click()} title="Upload a photo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
              <span className="tool-hint">Photo or text</span>
            </div>
            <button type="submit" className="send-btn" disabled={isSending}>
              {isSending ? (
                <><span className="btn-loader" /> Thinking...</>
              ) : (
                <>Solve <span className="btn-arrow">→</span></>
              )}
            </button>
          </div>
        </div>
        {error && <p className="input-error">{error}</p>}
      </form>

      <section className="features">
        <div className="feature">
          <div className="feature-icon-wrap"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
          <h3>Photo Input</h3>
          <p>Snap a picture of any homework problem and get instant help.</p>
        </div>
        <div className="feature">
          <div className="feature-icon-wrap"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></div>
          <h3>Step by Step</h3>
          <p>Clear explanations with the answer first, then how to solve it.</p>
        </div>
        <div className="feature">
          <div className="feature-icon-wrap"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/></svg></div>
          <h3>All Subjects</h3>
          <p>Math, English, Science, History, and General topics — one tutor for everything.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <span>AITutor — Learn anything, faster.</span>
      </footer>
    </div>
  );
}
