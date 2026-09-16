import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { errorMessage, Subject } from './api';

const subjects: { label: Exclude<Subject, 'All'>; icon: string }[] = [
  { label: 'Math', icon: '∑' },
  { label: 'English', icon: 'Aa' },
  { label: 'Science', icon: '⚗' },
  { label: 'History', icon: '🏛' },
];

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<string>();
  const [imageName, setImageName] = useState('');
  const [activeSubject, setActiveSubject] = useState<Exclude<Subject, 'All'>>('Math');
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
        prompt: cleanPrompt,
        image,
        subject: activeSubject,
      }));
      window.location.href = '/chats.html';
    } catch {
      setIsSending(false);
      setError(errorMessage({}, 'Could not start the chat. Please try again.'));
    }
  };

  return (
    <div className="landing">
      {/* Header */}
      <header className="landing-header">
        <a href="/" className="landing-logo">
          <span className="logo-icon">✦</span>
          <span className="logo-text">AITutor</span>
        </a>
        <a href="/chats.html" className="header-chats-link">My Chats</a>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <h1>
          Your AI Homework Helper
        </h1>
        <p className="landing-subtitle">
          Snap a photo or type your question. Get clear, step-by-step answers in seconds.
        </p>
      </section>

      {/* Subject chips */}
      <div className="subject-chips">
        {subjects.map((s) => (
          <button
            key={s.label}
            className={`chip ${activeSubject === s.label ? 'active' : ''}`}
            onClick={() => { setActiveSubject(s.label); textareaRef.current?.focus(); }}
          >
            <span className="chip-icon">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Main input card */}
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
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
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

      {/* Features */}
      <section className="features">
        <div className="feature">
          <div className="feature-icon">📸</div>
          <h3>Photo Input</h3>
          <p>Snap a picture of any homework problem and get instant help.</p>
        </div>
        <div className="feature">
          <div className="feature-icon">📝</div>
          <h3>Step by Step</h3>
          <p>Clear explanations with the answer first, then how to solve it.</p>
        </div>
        <div className="feature">
          <div className="feature-icon">🎓</div>
          <h3>All Subjects</h3>
          <p>Math, English, Science, History — one tutor for everything.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <span>AITutor — Learn anything, faster.</span>
      </footer>
    </div>
  );
}
