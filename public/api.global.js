(function () {
  'use strict';

  var SUBJECTS = ['Math', 'English', 'Science', 'History', 'General'];
  var DEFAULT_MODELS = [
    { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', provider: 'Alibaba', tier: 'balanced', supportsImages: true },
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', provider: 'OpenAI', tier: 'powerful', supportsImages: false },
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', provider: 'OpenAI', tier: 'fast', supportsImages: false },
    { id: 'groq/compound', name: 'Compound', provider: 'Groq', tier: 'powerful', supportsImages: false },
    { id: 'groq/compound-mini', name: 'Compound Mini', provider: 'Groq', tier: 'fast', supportsImages: false },
  ];

  var configuredApiUrl = (window.AI_TUTOR_API_URL || '').trim().replace(/\/+$/, '');
  var apiPath = function (path) { return configuredApiUrl ? configuredApiUrl + path : path; };

  function parseJsonText(text) {
    if (!text.trim()) return {};
    try {
      var parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }

  function readJson(response) {
    return response.text().then(parseJsonText);
  }

  function isHtmlResponse(text) {
    var trimmed = text.trim().toLowerCase();
    return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<body');
  }

  function errorMessage(data, fallback) {
    var raw = data.error || data.message;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return fallback || 'Something went wrong. Please try again.';
  }

  function formatDate(unix) {
    var date = new Date(unix * 1000);
    var today = new Date();
    var time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return date.toDateString() === today.toDateString()
      ? 'Today, ' + time
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
  }

  function listChats() {
    return fetch(apiPath('/api/chats'), { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) return [];
        return readJson(response).then(function (data) { return Array.isArray(data.chats) ? data.chats : []; });
      })
      .catch(function () { return []; });
  }

  function getChat(id) {
    return fetch(apiPath('/api/chats?id=' + encodeURIComponent(id)), { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) return null;
        return readJson(response).then(function (data) { return data.chat || null; });
      })
      .catch(function () { return null; });
  }

  function createChat(subject, messages) {
    return fetch(apiPath('/api/chats'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: subject, messages: messages }),
    })
      .then(function (response) {
        if (!response.ok) return null;
        return readJson(response).then(function (data) { return data.chat || null; });
      })
      .catch(function () { return null; });
  }

  function appendToChat(id, turn) {
    return fetch(apiPath('/api/chats?id=' + encodeURIComponent(id)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add: turn }),
    }).then(function (response) {
      if (!response.ok) throw new Error('Chat history save failed (' + response.status + ').');
      return readJson(response);
    });
  }

  function deleteChat(id) {
    fetch(apiPath('/api/chats?id=' + encodeURIComponent(id)), {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    }).catch(function () { /* ignore network errors during delete */ });
  }

  function listModels() {
    return fetch(apiPath('/api/models'), { headers: { Accept: 'application/json' } })
      .then(function (response) { return response.text(); })
      .then(function (rawText) {
        if (isHtmlResponse(rawText)) return DEFAULT_MODELS;
        var data = parseJsonText(rawText);
        return Array.isArray(data.models) && data.models.length > 0 ? data.models : DEFAULT_MODELS;
      })
      .catch(function () { return DEFAULT_MODELS; });
  }

  function askTutor(payload) {
    return fetch(apiPath('/api/tutor'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        return response.text().then(function (rawText) {
          if (isHtmlResponse(rawText)) {
            return { error: 'The server is starting up or unavailable. Please wait a moment and try again.' };
          }
          var data = parseJsonText(rawText);
          if (!response.ok) {
            if (response.status === 405 || response.status === 502 || response.status === 503) {
              return { error: 'The AI API is unavailable right now (' + response.status + '). Try again shortly.' };
            }
            return { error: errorMessage(data, 'Server error (' + response.status + '). Please try again.') };
          }
          if (typeof data.answer !== 'string' || !data.answer.trim()) {
            return { error: 'The tutor returned an empty response. Please try again.' };
          }
          return { answer: data.answer };
        });
      })
      .catch(function () { return { error: 'Could not reach the server. Make sure the app is running and try again.' }; });
  }

  window.AITutorApi = {
    listChats: listChats,
    getChat: getChat,
    createChat: createChat,
    appendToChat: appendToChat,
    deleteChat: deleteChat,
    listModels: listModels,
    askTutor: askTutor,
    errorMessage: errorMessage,
    formatDate: formatDate,
    DEFAULT_MODELS: DEFAULT_MODELS,
  };
})();
