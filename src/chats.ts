import { appendToChat, askTutor, ChatSummary, createChat, deleteChat, errorMessage, formatDate, getChat, listChats, listModels, AiModel, DEFAULT_MODELS, Subject, Turn } from './api';
import './styles.css';

type ChatSubject = Exclude<Subject, 'All'>;
const subjects: ChatSubject[] = ['Math', 'English', 'Science', 'History', 'General'];
const subjectIcon = (name: string) => name === 'Math' ? '∕' : name === 'English' ? 'T' : name === 'Science' ? '⚗' : name === 'History' ? '◷' : 'i';
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function markdown(text: string): string {
  return escapeHtml(text).replace(/^### (.+)$/gm, '<strong>$1</strong>').replace(/^## (.+)$/gm, '<strong>$1</strong>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>').replace(/^(\d+)\. (.+)$/gm, '<div class="step"><span class="step-num">$1</span><span>$2</span></div>').replace(/^- (.+)$/gm, '<div class="bullet">• $1</div>').replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
}
function calcMarkup(): string { return '<div class="mini-calculator"><input class="mini-calc-input" placeholder="2 + 2 * 3"><button class="mini-calc-run" type="button">Calculate</button><output class="mini-calc-result"></output></div>'; }

async function mount(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `<div class="chat-layout"><aside class="chat-sidebar"><div class="sidebar-top"><a href="/" class="sidebar-logo"><span class="logo-icon">✦</span><span class="logo-text">AITutor</span></a><button class="new-chat-btn">＋ New Chat</button></div><div class="sidebar-chats"><p class="empty-chats">Loading chats…</p></div></aside><main class="chat-main"><div class="chat-header"><h2>New Chat</h2><div class="header-right"><div class="subject-chips small">${subjects.map((s) => `<button class="chip" data-subject="${s}">${subjectIcon(s)} ${s}</button>`).join('')}</div><div class="model-switcher"><button class="model-trigger">◉ <span class="model-name">Qwen 3.8 27B</span>⌄</button><div class="model-dropdown" hidden></div></div></div></div><div class="chat-messages"><div class="chat-empty-state"><div class="empty-icon">✦</div><h3>Ask me anything</h3><p>Math, English, Science, History, or General — I'll break it down step by step.</p><div class="empty-suggestions"><button class="suggestion-chip">12 / 9 = ?</button><button class="suggestion-chip">Explain photosynthesis</button><button class="suggestion-chip">Counting</button><button class="suggestion-chip">WWI causes</button></div></div></div><div class="chat-error" hidden></div><form class="chat-input-bar"><div class="input-bar-preview" hidden><img class="input-bar-thumb" alt="Uploaded"><span class="image-name"></span><button type="button">✕</button></div><div class="input-bar-calc" hidden></div><div class="input-bar-row"><input class="chat-file" type="file" accept="image/*" capture="environment" hidden><button type="button" class="input-bar-tool chat-camera">⌾</button><button type="button" class="input-bar-tool chat-calc">⌗</button><textarea class="input-bar-textarea" rows="1" placeholder="Ask a question..."></textarea><button class="input-bar-send" type="submit">➤</button></div></form></main></div>`;

  const messages = root.querySelector<HTMLElement>('.chat-messages')!;
  const errorBox = root.querySelector<HTMLElement>('.chat-error')!;
  const input = root.querySelector<HTMLTextAreaElement>('.input-bar-textarea')!;
  const form = root.querySelector<HTMLFormElement>('.chat-input-bar')!;
  const fileInput = root.querySelector<HTMLInputElement>('.chat-file')!;
  const preview = root.querySelector<HTMLElement>('.input-bar-preview')!;
  const previewImage = preview.querySelector<HTMLImageElement>('img')!;
  const calc = root.querySelector<HTMLElement>('.input-bar-calc')!;
  const chatList = root.querySelector<HTMLElement>('.sidebar-chats')!;
  let turns: Turn[] = [];
  let activeId: string | null = null;
  let activeSubject: ChatSubject = 'General';
  let image = '';
  let models: AiModel[] = DEFAULT_MODELS;
  let selectedModel = DEFAULT_MODELS[0].id;

  const showError = (message: string) => { errorBox.textContent = message; errorBox.hidden = !message; };
  const renderMessages = (loading = false) => {
    messages.innerHTML = turns.length === 0 && !loading ? '<div class="chat-empty-state"><div class="empty-icon">✦</div><h3>Ask me anything</h3><p>Math, English, Science, History, or General — I will break it down step by step.</p></div>' : `${turns.map((turn) => `<div class="msg ${turn.role}"><div class="msg-avatar">${turn.role === 'user' ? 'You' : 'AI'}</div><div class="msg-body">${markdown(turn.content)}</div></div>`).join('')}${loading ? '<div class="msg assistant"><div class="msg-avatar">AI</div><div class="msg-body thinking">•••</div></div>' : ''}`;
    messages.scrollTop = messages.scrollHeight;
  };
  const renderChats = (chats: ChatSummary[]) => { chatList.innerHTML = chats.length ? chats.map((chat) => `<div class="chat-item ${chat.id === activeId ? 'active' : ''}"><button class="chat-item-btn" data-open="${chat.id}"><span class="chat-item-text">${escapeHtml(chat.title)}</span><span class="chat-item-time">${formatDate(chat.updated)}</span></button><button class="chat-item-delete" data-delete="${chat.id}">✕</button></div>`).join('') : '<p class="empty-chats">No chats yet.</p>'; };
  const refreshChats = async () => renderChats(await listChats());
  await refreshChats();
  listModels().then((available) => { models = available.length ? available : DEFAULT_MODELS; const dropdown = root.querySelector<HTMLElement>('.model-dropdown')!; dropdown.innerHTML = `<div class="model-dropdown-label">Select Model</div>${models.map((model) => `<button class="model-option" data-model="${model.id}"><span>${model.name}</span><small>${model.provider} · ${model.tier}${model.supportsImages ? ' · 📷' : ''}</small></button>`).join('')}`; });

  root.querySelectorAll<HTMLButtonElement>('[data-subject]').forEach((button) => button.addEventListener('click', () => { activeSubject = button.dataset.subject as ChatSubject; root.querySelectorAll('[data-subject]').forEach((b) => b.classList.toggle('active', b === button)); }));
  root.querySelectorAll<HTMLButtonElement>('.suggestion-chip').forEach((button) => button.addEventListener('click', () => { input.value = button.textContent === 'Counting' ? 'How many ways to arrange 5 books?' : button.textContent === 'WWI causes' ? 'What caused World War I?' : button.textContent || ''; input.focus(); }));
  root.querySelector<HTMLButtonElement>('.new-chat-btn')!.addEventListener('click', () => { activeId = null; turns = []; input.value = ''; renderMessages(); });
  root.querySelector<HTMLButtonElement>('.chat-camera')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (!file) return; if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return showError('Choose an image smaller than 5 MB.'); const reader = new FileReader(); reader.onload = () => { image = String(reader.result); previewImage.src = image; preview.hidden = false; }; reader.readAsDataURL(file); });
  preview.querySelector('button')!.addEventListener('click', () => { image = ''; preview.hidden = true; });
  root.querySelector<HTMLButtonElement>('.chat-calc')!.addEventListener('click', () => { calc.hidden = !calc.hidden; if (!calc.hidden) { calc.innerHTML = calcMarkup(); calc.querySelector<HTMLButtonElement>('.mini-calc-run')!.addEventListener('click', () => { const raw = calc.querySelector<HTMLInputElement>('.mini-calc-input')!.value; try { if (!/^[0-9+*/().%\s-]+$/.test(raw)) throw new Error('Numbers and operators only'); calc.querySelector('output')!.textContent = String(Function(`return (${raw})`)()); } catch { calc.querySelector('output')!.textContent = 'Invalid expression'; } }); } });
  root.querySelector<HTMLButtonElement>('.model-trigger')!.addEventListener('click', () => { const dropdown = root.querySelector<HTMLElement>('.model-dropdown')!; dropdown.hidden = !dropdown.hidden; });
  root.addEventListener('click', async (event) => { const target = event.target as HTMLElement; const modelButton = target.closest<HTMLButtonElement>('[data-model]'); if (modelButton) { selectedModel = modelButton.dataset.model || selectedModel; root.querySelector('.model-name')!.textContent = models.find((model) => model.id === selectedModel)?.name || selectedModel; root.querySelector<HTMLElement>('.model-dropdown')!.hidden = true; } const open = target.closest<HTMLButtonElement>('[data-open]'); if (open) { const chat = await getChat(open.dataset.open || ''); if (chat) { activeId = chat.id; turns = chat.messages.filter((turn) => typeof turn.content === 'string'); activeSubject = chat.subject; renderMessages(); } } const remove = target.closest<HTMLButtonElement>('[data-delete]'); if (remove) { await deleteChat(remove.dataset.delete || ''); if (activeId === remove.dataset.delete) { activeId = null; turns = []; renderMessages(); } refreshChats(); } });
  form.addEventListener('submit', async (event) => { event.preventDefault(); const prompt = input.value.trim(); if (!prompt && !image) return showError('Type a question or add a photo.'); showError(''); const userTurn: Turn = { role: 'user', content: prompt || 'Please read and explain the attached homework image.' }; const history = turns.slice(-6); turns = [...turns, userTurn]; input.value = ''; image = ''; preview.hidden = true; renderMessages(true); const result = await askTutor({ prompt, image: previewImage.src, subject: activeSubject, model: selectedModel, history }); if ('error' in result) { turns = turns.slice(0, -1); renderMessages(); showError(errorMessage(result, 'Could not connect to the tutor.')); return; } const answer: Turn = { role: 'assistant', content: result.answer }; turns = [...turns, answer]; renderMessages(); if (activeId) { await appendToChat(activeId, userTurn); await appendToChat(activeId, answer); } else { const created = await createChat(activeSubject, turns); if (created) activeId = created.id; } refreshChats(); });
}

void mount();
