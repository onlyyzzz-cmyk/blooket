(function () {
  'use strict';

  var subjects = ['Math', 'English', 'Science', 'History', 'General'];
  var iconPaths = {
    math: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    english: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    science: '<path d="M9 3h6"/><path d="M10 3v7.4a2 2 0 0 1-.6 1.4L5 15.2V17h14v-1.8l-4.4-3.4a2 2 0 0 1-.6-1.4V3"/><path d="M7 17l2 4"/><path d="M17 17l-2 4"/>',
    history: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    general: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="8" y2="12.01"/><line x1="12" y1="12" x2="12" y2="12.01"/><line x1="16" y1="12" x2="16" y2="12.01"/><line x1="8" y1="16" x2="8" y2="16.01"/><line x1="12" y1="16" x2="12" y2="16.01"/><line x1="16" y1="16" x2="16" y2="16.01"/>',
  };
  var toolIcon = function (name, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + iconPaths[name] + '</svg>';
  };
  var subjectIcon = function (name) {
    var key = name.toLowerCase();
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (iconPaths[key] || iconPaths.general) + '</svg>';
  };
  var escapeHtml = function (value) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var Api = window.AITutorApi;
  var Calculator = window.AITutorCalculator;

  function markdown(text) {
    return escapeHtml(text)
      .replace(/^### (.+)$/gm, '<strong>$1</strong>')
      .replace(/^## (.+)$/gm, '<strong>$1</strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
      .replace(/^(\d+)\. (.+)$/gm, '<div class="step"><span class="step-num">$1</span><span>$2</span></div>')
      .replace(/^- (.+)$/gm, '<div class="bullet">• $1</div>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }


  function newSessionId() {
    return (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID()
      : 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function mount() {
    var root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = '<div class="chat-layout"><aside class="chat-sidebar"><div class="sidebar-top"><a href="/" class="sidebar-logo"><span class="logo-icon">✦</span><span class="logo-text">AITutor</span></a><button class="new-chat-btn">＋ New Chat</button></div><div class="sidebar-chats"><p class="empty-chats">Loading chats…</p></div></aside><main class="chat-main"><div class="chat-header"><div class="chat-title-group"><h2>New Chat</h2><span class="session-chip" aria-label="Current chat session"></span></div><div class="header-right"><div class="subject-chips small">' + subjects.map(function (s) { return '<button class="chip" data-subject="' + s + '">' + subjectIcon(s) + ' ' + s + '</button>'; }).join('') + '</div><div class="model-switcher"><button class="model-trigger">◉ <span class="model-name">Qwen 3.8 27B</span>⌄</button><div class="model-dropdown" hidden></div></div></div></div><div class="chat-messages"><div class="chat-empty-state"><div class="empty-icon">✦</div><h3>Ask me anything</h3><p>Math, English, Science, History, or General — I\'ll break it down step by step.</p><div class="empty-suggestions"><button class="suggestion-chip">12 / 9 = ?</button><button class="suggestion-chip">Explain photosynthesis</button><button class="suggestion-chip">Counting</button><button class="suggestion-chip">WWI causes</button></div></div></div><div class="chat-error" hidden></div><form class="chat-input-bar"><div class="input-bar-preview" hidden><img class="input-bar-thumb" alt="Uploaded"><span class="image-name"></span><button type="button">✕</button></div><div class="input-bar-calc" hidden><div class=\"calculator\"><div class=\"calc-header\"><div class=\"calc-mode-tabs\"><button type=\"button\" class=\"calc-tab active\" data-mode=\"basic\">Calc</button><button type=\"button\" class=\"calc-tab\" data-mode=\"convert\">Convert</button></div><span class=\"calc-title\">AI Calc</span></div><div class=\"calc-panels\"><div class=\"calc-panel\" data-panel=\"calc\"><div class=\"calc-display\"><div class=\"calc-expr\">0</div><div class=\"calc-result\"></div></div><div class=\"calc-keys-sci\"><button type=\"button\" class=\"calc-key op\" data-key=\"√(\">√</button><button type=\"button\" class=\"calc-key op\" data-key=\"sin(\">sin</button><button type=\"button\" class=\"calc-key op\" data-key=\"cos(\">cos</button><button type=\"button\" class=\"calc-key op\" data-key=\"tan(\">tan</button><button type=\"button\" class=\"calc-key op\" data-key=\"log(\">log</button><button type=\"button\" class=\"calc-key op\" data-key=\"ln(\">ln</button><button type=\"button\" class=\"calc-key op\" data-key=\"π\">π</button><button type=\"button\" class=\"calc-key op\" data-key=\"^\">^</button></div><div class=\"calc-keys\"><button type=\"button\" class=\"calc-key clear\" data-key=\"C\">C</button><button type=\"button\" class=\"calc-key op\" data-key=\"( )\">( )</button><button type=\"button\" class=\"calc-key op\" data-key=\"%\">%</button><button type=\"button\" class=\"calc-key op\" data-key=\"÷\">÷</button><button type=\"button\" class=\"calc-key\" data-key=\"7\">7</button><button type=\"button\" class=\"calc-key\" data-key=\"8\">8</button><button type=\"button\" class=\"calc-key\" data-key=\"9\">9</button><button type=\"button\" class=\"calc-key op\" data-key=\"×\">×</button><button type=\"button\" class=\"calc-key\" data-key=\"4\">4</button><button type=\"button\" class=\"calc-key\" data-key=\"5\">5</button><button type=\"button\" class=\"calc-key\" data-key=\"6\">6</button><button type=\"button\" class=\"calc-key op\" data-key=\"−\">−</button><button type=\"button\" class=\"calc-key\" data-key=\"1\">1</button><button type=\"button\" class=\"calc-key\" data-key=\"2\">2</button><button type=\"button\" class=\"calc-key\" data-key=\"3\">3</button><button type=\"button\" class=\"calc-key op\" data-key=\"+\">+</button><button type=\"button\" class=\"calc-key\" data-key=\"0\">0</button><button type=\"button\" class=\"calc-key\" data-key=\".\">.</button><button type=\"button\" class=\"calc-key op\" data-key=\"⌫\">⌫</button><button type=\"button\" class=\"calc-key equals\" data-key=\"=\">=</button></div></div><div class=\"calc-panel\" data-panel=\"convert\" hidden><div class=\"converter\"><div class=\"converter-cats\"><button type=\"button\" class=\"converter-cat active\" data-cat=\"length\">Length</button><button type=\"button\" class=\"converter-cat\" data-cat=\"weight\">Weight</button><button type=\"button\" class=\"converter-cat\" data-cat=\"temp\">Temp</button><button type=\"button\" class=\"converter-cat\" data-cat=\"data\">Data</button></div><div class=\"converter-body\"></div></div></div></div><button type=\"button\" class=\"calc-insert-btn\">Insert into message ↓</button></div></div><div class="input-bar-row">    <input class="chat-file" type="file" accept="image/*" hidden><button type="button" class="input-bar-tool chat-camera" title="Take a photo or upload">' + toolIcon('camera', 18) + '</button><button type="button" class="input-bar-tool chat-calc" title="Calculator">' + toolIcon('calculator', 18) + '</button><textarea class="input-bar-textarea" rows="1" placeholder="Ask a question..."></textarea><button class="input-bar-send" type="submit">➤</button></div></form></main></div>';

    var messages = root.querySelector('.chat-messages');
    var errorBox = root.querySelector('.chat-error');
    var input = root.querySelector('.input-bar-textarea');
    var form = root.querySelector('.chat-input-bar');
    var fileInput = root.querySelector('.chat-file');
    var preview = root.querySelector('.input-bar-preview');
    var previewImage = preview.querySelector('img');
    var calc = root.querySelector('.input-bar-calc');
    var calcInstance = null;
    root.querySelector('.chat-calc').addEventListener('click', function () {
      calc.hidden = !calc.hidden;
      if (!calc.hidden) {
        if (!calcInstance) calcInstance = Calculator.create(calc, { textarea: input });
        calcInstance.press('C');
      }
    });
    var chatList = root.querySelector('.sidebar-chats');
    var turns = [];
    var activeId = null;
    var routeParams = new URLSearchParams(window.location.search);
    var requestedSession = routeParams.get('session');
    var pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('ai-tutor-pending') || 'null'); } catch (e) { pending = null; }
    // Safari private mode and embedded previews may block sessionStorage. The home page
    // also puts the text in the URL, so the handoff still works in those environments.
    if (!pending) {
      var routePrompt = routeParams.get('prompt');
      var routeSubject = routeParams.get('subject');
      if (routePrompt || routeSubject) pending = { prompt: routePrompt || '', subject: routeSubject || 'General', image: '' };
    }
    if (pending) {
      try { sessionStorage.removeItem('ai-tutor-pending'); } catch (e) { /* private-mode storage may be read-only */ }
    }
    var sessionChip = root.querySelector('.session-chip');
    var updateSessionUrl = function (id) {
      sessionChip.textContent = 'Session ' + id.slice(0, 8);
      window.history.replaceState(null, '', '/chats?session=' + encodeURIComponent(id));
    };
    var sessionId = requestedSession || newSessionId();
    updateSessionUrl(sessionId);
    var activeSubject = pending && subjects.indexOf(pending.subject) !== -1 ? pending.subject : 'General';
    var image = pending && pending.image ? pending.image : '';
    if (pending && pending.prompt) {
      input.value = pending.prompt;
      input.focus();
    }
    var models = Api.DEFAULT_MODELS;
    var selectedModel = models[0].id;
    var localChatsKey = 'ai-tutor-local-chats';
    var readLocalChats = function () {
      try {
        var saved = JSON.parse(localStorage.getItem(localChatsKey) || '[]');
        return Array.isArray(saved) ? saved : [];
      } catch (e) { return []; }
    };
    var writeLocalChats = function (chats) {
      try { localStorage.setItem(localChatsKey, JSON.stringify(chats.slice(-50))); } catch (e) { /* storage is optional */ }
    };
    var cacheChat = function (chat) {
      if (!chat || !chat.id) return;
      var chats = readLocalChats().filter(function (item) { return item.id !== chat.id; });
      writeLocalChats(chats.concat([chat]));
    };
    var getLocalChat = function (id) {
      return readLocalChats().find(function (chat) { return chat.id === id; }) || null;
    };
    var mergeWithLocalChat = function (chat, id) {
      var local = getLocalChat(id) || getLocalChat('local-' + id);
      if (!chat) return local;
      return local && Array.isArray(local.messages) && local.messages.length > (chat.messages || []).length ? local : chat;
    };
    var showError = function (message) { errorBox.textContent = message; errorBox.hidden = !message; };
    var renderMessages = function (loading) {
      messages.innerHTML = turns.length === 0 && !loading
        ? '<div class="chat-empty-state"><div class="empty-icon">✦</div><h3>Ask me anything</h3><p>Math, English, Science, History, or General — I will break it down step by step.</p></div>'
        : turns.map(function (turn) {
            return '<div class="msg ' + turn.role + '"><div class="msg-avatar">' + (turn.role === 'user' ? 'You' : 'AI') + '</div><div class="msg-body">' + markdown(turn.content) + '</div></div>';
          }).join('') + (loading ? '<div class="msg assistant"><div class="msg-avatar">AI</div><div class="msg-body thinking">•••</div></div>' : '');
      messages.scrollTop = messages.scrollHeight;
    };
    var renderChats = function (chats) {
      chatList.innerHTML = chats.length
        ? chats.map(function (chat) {
            return '<div class="chat-item ' + (chat.id === activeId ? 'active' : '') + '"><button class="chat-item-btn" data-open="' + chat.id + '"><span class="chat-item-text">' + escapeHtml(chat.title) + '</span><span class="chat-item-time">' + Api.formatDate(chat.updated) + '</span></button><button class="chat-item-delete" data-delete="' + chat.id + '">✕</button></div>';
          }).join('')
        : '<p class="empty-chats">No chats yet.</p>';
    };
    var refreshChats = function () {
      return Api.listChats().then(function (serverChats) {
        var localChats = readLocalChats();
        var merged = serverChats.slice();
        localChats.forEach(function (local) {
          if (!merged.some(function (chat) { return chat.id === local.id; })) {
            merged.push({ id: local.id, title: local.title, subject: local.subject, created: local.created, updated: local.updated });
          }
        });
        merged.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
        renderChats(merged);
      });
    };

    refreshChats().then(function () {
      if (!requestedSession) return;
      return Api.getChat(requestedSession).then(function (existing) {
        existing = mergeWithLocalChat(existing, requestedSession);
        if (!existing) return;
        activeId = existing.id;
        updateSessionUrl(existing.id);
        turns = existing.messages.filter(function (turn) { return typeof turn.content === 'string'; });
        activeSubject = existing.subject;
        root.querySelector('h2').textContent = existing.title;
        renderMessages();
      });
    });

    Api.listModels().then(function (available) {
      models = available.length ? available : Api.DEFAULT_MODELS;
      selectedModel = models[0].id;
      var dropdown = root.querySelector('.model-dropdown');
      dropdown.innerHTML = '<div class="model-dropdown-label">Select Model</div>' + models.map(function (model) {
        return '<button class="model-option" data-model="' + model.id + '"><span>' + model.name + '</span><small>' + model.provider + ' · ' + model.tier + (model.supportsImages ? ' · 📷' : '') + '</small></button>';
      }).join('');
    });

    root.querySelectorAll('[data-subject]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.subject === activeSubject);
      button.addEventListener('click', function () {
        activeSubject = button.dataset.subject;
        root.querySelectorAll('[data-subject]').forEach(function (b) { b.classList.toggle('active', b === button); });
      });
    });
    if (image) {
      previewImage.src = image;
      preview.hidden = false;
    }
    root.querySelectorAll('.suggestion-chip').forEach(function (button) {
      button.addEventListener('click', function () {
        var text = button.textContent;
        input.value = text === 'Counting' ? 'How many ways to arrange 5 books?' : text === 'WWI causes' ? 'What caused World War I?' : text;
        input.focus();
      });
    });
    root.querySelector('.new-chat-btn').addEventListener('click', function () {
      activeId = null; turns = []; input.value = '';
      root.querySelector('h2').textContent = 'New Chat';
      updateSessionUrl(newSessionId());
      renderMessages();
    });
    root.querySelector('.chat-camera').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return showError('Choose an image smaller than 5 MB.');
      var reader = new FileReader();
      reader.onload = function () { image = String(reader.result); previewImage.src = image; preview.hidden = false; };
      reader.readAsDataURL(file);
    });
    preview.querySelector('button').addEventListener('click', function () { image = ''; preview.hidden = true; });
    root.querySelector('.model-trigger').addEventListener('click', function () {
      var dropdown = root.querySelector('.model-dropdown');
      dropdown.hidden = !dropdown.hidden;
    });
    root.addEventListener('click', function (event) {
      var target = event.target;
      var modelButton = target.closest('[data-model]');
      if (modelButton) {
        selectedModel = modelButton.dataset.model || selectedModel;
        root.querySelector('.model-name').textContent = (models.find(function (m) { return m.id === selectedModel; }) || {}).name || selectedModel;
        root.querySelector('.model-dropdown').hidden = true;
      }
      var open = target.closest('[data-open]');
      if (open) {
        Api.getChat(open.dataset.open || '').then(function (chat) {
          chat = mergeWithLocalChat(chat, open.dataset.open || '');
          if (!chat) return;
          activeId = chat.id;
          updateSessionUrl(chat.id);
          turns = chat.messages.filter(function (turn) { return typeof turn.content === 'string'; });
          activeSubject = chat.subject;
          root.querySelector('h2').textContent = chat.title;
          renderMessages();
        });
      }
      var remove = target.closest('[data-delete]');
      if (remove) {
        Api.deleteChat(remove.dataset.delete || '').then(function () {
          if (activeId === remove.dataset.delete) { activeId = null; turns = []; renderMessages(); }
          refreshChats();
        });
      }
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var prompt = input.value.trim() || (pending ? pending.prompt || '' : '');
      var pendingImage = pending ? pending.image || '' : '';
      var pendingSubject = pending ? pending.subject || '' : '';
      if (!prompt && !image && !pendingImage) return showError('Type a question or add a photo.');
      showError('');
      if (pendingSubject && subjects.indexOf(pendingSubject) !== -1) {
        activeSubject = pendingSubject;
        root.querySelectorAll('[data-subject]').forEach(function (b) { b.classList.toggle('active', b.dataset.subject === activeSubject); });
      }
      pending = null;
      var userTurn = { role: 'user', content: prompt || 'Please read and explain the attached homework image.' };
      var history = turns.slice(-6);
      turns = turns.concat([userTurn]);
      input.value = '';
      var sentImage = image || pendingImage || previewImage.src;
      image = '';
      preview.hidden = true;
      renderMessages(true);
      Api.askTutor({ prompt: prompt, image: sentImage, subject: activeSubject, model: selectedModel, history: history }).then(function (result) {
        if (result.error) {
          turns = turns.slice(0, -1);
          renderMessages();
          showError(Api.errorMessage(result, 'Could not connect to the tutor.'));
          return;
        }
        var answer = { role: 'assistant', content: result.answer };
        turns = turns.concat([answer]);
        renderMessages();
        var finish = function () { refreshChats(); };
        if (activeId && activeId.indexOf('local-') !== 0) {
          var cached = { id: activeId, title: turns[0].content.slice(0, 60), subject: activeSubject, messages: turns.slice(), updated: Math.floor(Date.now() / 1000) };
          cacheChat(cached);
          Api.appendToChat(activeId, userTurn)
            .then(function () { return Api.appendToChat(activeId, answer); })
            .catch(function () {
              // Local history is already cached; keep the chat usable without showing a server warning.
            })
            .then(finish);
        } else {
          Api.createChat(activeSubject, turns).then(function (created) {
            var chat = created || {
              id: 'local-' + sessionId,
              title: turns[0].content.slice(0, 60),
              subject: activeSubject,
              messages: turns.slice(),
              created: Math.floor(Date.now() / 1000),
              updated: Math.floor(Date.now() / 1000),
            };
            activeId = chat.id;
            cacheChat(chat);
            updateSessionUrl(chat.id);
            finish();
          });
        }
      });
    });
  }

  mount();
})();
