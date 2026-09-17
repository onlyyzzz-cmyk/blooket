import { errorMessage, Subject } from './api';
import './styles.css';

type AppSubject = Exclude<Subject, 'All'>;
const subjects: { label: AppSubject; icon: string }[] = [
  { label: 'Math', icon: 'math' }, { label: 'English', icon: 'english' },
  { label: 'Science', icon: 'science' }, { label: 'History', icon: 'history' },
  { label: 'General', icon: 'general' },
];

const icon = (name: string, size = 18) => {
  const paths: Record<string, string> = {
    math: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    english: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    science: '<path d="M9 3h6"/><path d="M10 3v7.4a2 2 0 0 1-.6 1.4L5 15.2V17h14v-1.8l-4.4-3.4a2 2 0 0 1-.6-1.4V3"/><path d="M7 17l2 4"/><path d="M17 17l-2 4"/>',
    history: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    general: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.general}</svg>`;
};

function mascot(): string {
  return '<div class="ai-tutor-float" aria-hidden="true"><div class="ai-tutor-mascot"><div class="ai-tutor-eyes"><div class="ai-tutor-eye"><span></span></div><div class="ai-tutor-eye"><span></span></div></div></div><span class="ai-tutor-label">AI Tutor</span></div>';
}

function calculator(): string {
  return '<div class="mini-calculator"><input class="mini-calc-input" placeholder="2 + 2 * 3" aria-label="Calculator expression"><button class="mini-calc-run" type="button">Calculate</button><output class="mini-calc-result"></output></div>';
}

function mountMascot(): void {
  document.addEventListener('mousemove', (event) => {
    document.querySelectorAll<HTMLElement>('.ai-tutor-eye').forEach((eye) => {
      const rect = eye.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy) || 1;
      eye.querySelector<HTMLElement>('span')!.style.transform = `translate(${(dx / distance) * 1.5}px, ${(dy / distance) * 1.5}px)`;
    });
  });
}

function mountCalculator(container: HTMLElement, textarea: HTMLTextAreaElement): void {
  container.innerHTML = calculator();
  const input = container.querySelector<HTMLInputElement>('.mini-calc-input')!;
  const output = container.querySelector<HTMLOutputElement>('.mini-calc-result')!;
  container.querySelector<HTMLButtonElement>('.mini-calc-run')!.addEventListener('click', () => {
    try {
      if (!/^[0-9+*/().%\s-]+$/.test(input.value)) throw new Error('Use numbers and operators only');
      const value = Function(`"use strict"; return (${input.value})`)();
      output.textContent = Number.isFinite(value) ? String(value) : 'Invalid result';
      textarea.value = textarea.value ? `${textarea.value} ${output.textContent}` : output.textContent;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (error) { output.textContent = error instanceof Error ? error.message : 'Invalid expression'; }
  });
}

function mount(): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `${mascot()}
    <div class="landing">
      <header class="landing-header"><a href="/" class="landing-logo"><span class="logo-icon">✦</span><span class="logo-text">AITutor</span></a><a href="/chats.html" class="header-chats-link">${icon('general', 16)} My Chats</a></header>
      <section class="landing-hero"><h1>Your AI Homework Helper</h1><p class="landing-subtitle">Snap a photo or type your question. Get clear, step-by-step answers in seconds.</p></section>
      <div class="subject-chips stagger-in">${subjects.map((s) => `<button class="chip" data-subject="${s.label}">${icon(s.icon, 14)}${s.label}</button>`).join('')}</div>
      <form class="input-card" id="landing-form"><div class="input-card-inner"><div class="image-preview-bar" hidden><img class="image-thumb" alt="Uploaded"><span class="image-name"></span><button type="button" class="image-remove">✕</button></div><div class="input-card-calc" hidden></div><textarea class="input-textarea" rows="3" placeholder="Ask anything... e.g. Solve for x: 2x + 5 = 15"></textarea><div class="input-actions"><div class="input-tools"><input id="homework-image" type="file" accept="image/*" capture="environment" hidden><button type="button" class="tool-btn camera-btn" title="Take a photo or upload">${icon('general', 20)}</button><button type="button" class="tool-btn calc-toggle" title="Calculator">⌗</button></div><button type="submit" class="send-btn">Solve <span class="btn-arrow">→</span></button></div></div><p class="input-error" hidden></p></form>
      <section class="features stagger-in"><div class="feature hover-3d"><div class="feature-icon-wrap">◉</div><h3>Camera Input</h3><p>Snap a photo of any homework problem and get instant help.</p></div><div class="feature hover-3d"><div class="feature-icon-wrap">⌗</div><h3>Calculator ×2</h3><p>Scientific calculator and unit conversion tools for everyday study.</p></div><div class="feature hover-3d"><div class="feature-icon-wrap">✦</div><h3>All Subjects</h3><p>Math, English, Science, History, and General topics in one tutor.</p></div></section>
      <section class="partnerships stagger-in"><div class="partnerships-heading"><div><p class="partnerships-kicker"><span class="kicker-dot"></span> The learning ecosystem</p><h2>Better together.</h2><p class="partnerships-intro">AITutor fits into the tools students already love — connecting explanations, practice, and progress in one calm place.</p></div><div class="partnerships-orbit">✦</div></div><div class="partnerships-cta"><span>Building something that helps students learn?</span><a href="mailto:partners@aitutor.app" class="partnerships-link">Become a partner <span>→</span></a></div></section>
      <footer class="landing-footer">AITutor — Learn anything, faster.</footer>
    </div>`;

  mountMascot();
  let selectedSubject: AppSubject = 'General';
  const form = root.querySelector<HTMLFormElement>('#landing-form')!;
  const textarea = root.querySelector<HTMLTextAreaElement>('.input-textarea')!;
  const error = root.querySelector<HTMLElement>('.input-error')!;
  let image = '';
  let imageName = '';
  root.querySelectorAll<HTMLButtonElement>('[data-subject]').forEach((button) => button.addEventListener('click', () => {
    selectedSubject = button.dataset.subject as AppSubject;
    root.querySelectorAll('[data-subject]').forEach((item) => item.classList.toggle('active', item === button));
    textarea.focus();
  }));
  root.querySelector<HTMLButtonElement>('.camera-btn')!.addEventListener('click', () => root.querySelector<HTMLInputElement>('#homework-image')!.click());
  root.querySelector<HTMLInputElement>('#homework-image')!.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { error.textContent = 'Choose an image smaller than 5 MB.'; error.hidden = false; return; }
    const reader = new FileReader();
    reader.onload = () => { image = String(reader.result); imageName = file.name; const preview = root.querySelector<HTMLElement>('.image-preview-bar')!; preview.hidden = false; preview.querySelector<HTMLImageElement>('img')!.src = image; preview.querySelector<HTMLElement>('.image-name')!.textContent = imageName; };
    reader.readAsDataURL(file);
  });
  root.querySelector<HTMLButtonElement>('.image-remove')!.addEventListener('click', () => { image = ''; imageName = ''; root.querySelector<HTMLElement>('.image-preview-bar')!.hidden = true; });
  const calc = root.querySelector<HTMLElement>('.input-card-calc')!;
  root.querySelector<HTMLButtonElement>('.calc-toggle')!.addEventListener('click', () => { calc.hidden = !calc.hidden; if (!calc.hidden) mountCalculator(calc, textarea); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!textarea.value.trim() && !image) { error.textContent = 'Type a question or add a photo.'; error.hidden = false; return; }
    sessionStorage.setItem('ai-tutor-pending', JSON.stringify({ prompt: textarea.value.trim(), image, subject: selectedSubject }));
    window.location.href = '/chats.html';
  });
  void errorMessage;
}

mount();
