window.AITutorAPI = (() => {
  const models = [
    { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', provider: 'Alibaba', tier: 'balanced', supportsImages: true },
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', provider: 'OpenAI', tier: 'powerful', supportsImages: false },
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', provider: 'OpenAI', tier: 'fast', supportsImages: false },
    { id: 'groq/compound', name: 'Compound', provider: 'Groq', tier: 'powerful', supportsImages: false },
    { id: 'groq/compound-mini', name: 'Compound Mini', provider: 'Groq', tier: 'fast', supportsImages: false },
  ];
  const base = (window.AI_TUTOR_API_URL || '').replace(/\/$/, '');
  const path = (value) => `${base}${value}`;
  const json = async (response) => { const text = await response.text(); try { return text ? JSON.parse(text) : {}; } catch { return {}; } };
  const errorMessage = (data, fallback) => typeof data.error === 'string' && data.error.trim() ? data.error : fallback;
  const request = async (url, options = {}) => { const response = await fetch(path(url), options); const data = await json(response); return { response, data }; };
  return {
    models,
    errorMessage,
    formatDate(unix) { const date = new Date(unix * 1000); return date.toDateString() === new Date().toDateString() ? `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`; },
    async listChats() { try { const { response, data } = await request('/api/chats.php'); return response.ok && Array.isArray(data.chats) ? data.chats : []; } catch { return []; } },
    async getChat(id) { try { const { response, data } = await request(`/api/chats.php?id=${encodeURIComponent(id)}`); return response.ok ? data.chat || null : null; } catch { return null; } },
    async createChat(subject, messages) { try { const { response, data } = await request('/api/chats.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, messages }) }); return response.ok ? data.chat || null : null; } catch { return null; } },
    async appendToChat(id, turn) { try { await request(`/api/chats.php?id=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ add: turn }) }); } catch {} },
    async deleteChat(id) { try { await request(`/api/chats.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {} },
    async listModels() { try { const { response, data } = await request('/api/models.php'); return response.ok && Array.isArray(data.models) ? data.models : models; } catch { return models; } },
    async askTutor(payload) { try { const { response, data } = await request('/api/tutor.php', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) return { error: errorMessage(data, `The AI service is unavailable (${response.status}).`) }; return typeof data.answer === 'string' && data.answer.trim() ? { answer: data.answer } : { error: 'The tutor returned an empty response.' }; } catch { return { error: 'Could not reach the AI service. Check the API hosting setup.' }; } },
  };
})();
