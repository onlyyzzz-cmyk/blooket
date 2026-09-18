(function () {
  'use strict';

  var subjects = ['Math', 'English', 'Science', 'History', 'General'];
  var subjectIcon = function (name) { return name === 'Math' ? '∕' : name === 'English' ? 'T' : name === 'Science' ? '⚗' : name === 'History' ? '◷' : 'i'; };
  var escapeHtml = function (value) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var Api = window.AITutorApi;

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

  function calcMarkup() {
    return '<div class="mini-calculator"><input class="mini-calc-input" placeholder="2 + 2 * 3"><button class="mini-calc-run" type="button">Calculate</button><output class="mini-calc-result"></output></div>';
  }

  function newSessionId() {
    return (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID()
      : 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function mount() {
    var root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = '<div class="chat-layout"><aside class="chat-sidebar"><div class="sidebar-top"><a href="/" class="sidebar-logo"><span class="logo-icon">✦</span><span class="logo-text">AITutor</span></a><button class="new-chat-btn">＋ New Chat</button></div><div class="sidebar-chats"><p class="empty-chats">Loading chats…</p></div></aside><main class="chat-main"><div class="chat-header"><div class="chat-title-group"><h2>New Chat</h2><span class="session-chip" aria-label="Current chat session"></span></div><div class="header-right"><div class="subject-chips small">' + subjects.map(function (s) { return '<button class="chip" data-subject="' + s + '">' + subjectIcon(s) + ' ' + s + '</button>'; }).join('') + '</div><div class="model-switcher"><button class="model-trigger">◉ <span class="model-name">Qwen 3.8 27B</span>⌄</button><div class="model-dropdown" hidden></div></div></div></div><div class="chat-messages"><div class="chat-empty-state"><div class="empty-icon">✦</div><h3>Ask me anything</h3><p>Math, English, Science, History, or General — I\'ll break it down step by step.</p><div class="empty-suggestions"><button class="suggestion-chip">12 / 9 = ?</button><button class="suggestion-chip">Explain photosynthesis</button><button class="suggestion-chip">Counting</button><button class="suggestion-chip">WWI causes</button></div></div></div><div class="chat-error" hidden></div><form class="chat-input-bar"><div class="input-bar-preview" hidden><img class="input-bar-thumb" alt="Uploaded"><span class="image-name"></span><button type="button">✕</button></div><div class="input-bar-calc" hidden></div><div class="input-bar-row"><input class="chat-file" type="file" accept="image/*" capture="environment" hidden><button type="button" class="input-bar-tool chat-camera">⌾</button><button type="button" class="input-bar-tool chat-calc">⌗</button><textarea class="input-bar-textarea" rows="1" placeholder="Ask a question..."></textarea><button class="input-bar-send" type="submit">➤</button></div></form></main></div>';

    var messages = root.querySelector('.chat-messages');
    var errorBox = root.querySelector('.chat-error');
    var input = root.querySelector('.input-bar-textarea');
    var form = root.querySelector('.chat-input-bar');
    var fileInput = root.querySelector('.chat-file');
    var preview = root.querySelector('.input-bar-preview');
    var previewImage = preview.querySelector('img');
    var calc = root.querySelector('.input-bar-calc');
    var chatList = root.querySelector('.sidebar-chats');
    var turns = [];
    var activeId = null;
    var requestedSession = new URLSearchParams(window.location.search).get('session');
    var sessionChip = root.querySelector('.session-chip');
    var updateSessionUrl = function (id) {
      sessionChip.textContent = 'Session ' + id.slice(0, 8);
      window.history.replaceState(null, '', '/chats?session=' + encodeURIComponent(id));
    };
    var sessionId = requestedSession || newSessionId();
    updateSessionUrl(sessionId);
    var activeSubject = 'General';
    var image = '';
    var models = Api.DEFAULT_MODELS;
    var selectedModel = models[0].id;

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
    var refreshChats = function () { return Api.listChats().then(renderChats); };

    refreshChats().then(function () {
      if (!requestedSession) return;
      return Api.getChat(requestedSession).then(function (existing) {
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
      button.addEventListener('click', function () {
        activeSubject = button.dataset.subject;
        root.querySelectorAll('[data-subject]').forEach(function (b) { b.classList.toggle('active', b === button); });
      });
    });
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
    root.querySelector('.chat-calc').addEventListener('click', function () {
      calc.hidden = !calc.hidden;
      if (!calc.hidden) {
        calc.innerHTML = calcMarkup();
        calc.querySelector('.mini-calc-run').addEventListener('click', function () {
          var raw = calc.querySelector('.mini-calc-input').value;
          try {
            if (!/^[0-9+*/().%\s-]+$/.test(raw)) throw new Error('Numbers and operators only');
            calc.querySelector('output').textContent = String(Function('return (' + raw + ')')());
          } catch (e) { calc.querySelector('output').textContent = 'Invalid expression'; }
        });
      }
    });
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
      var prompt = input.value.trim();
      if (!prompt && !image) return showError('Type a question or add a photo.');
      showError('');
      var userTurn = { role: 'user', content: prompt || 'Please read and explain the attached homework image.' };
      var history = turns.slice(-6);
      turns = turns.concat([userTurn]);
      input.value = '';
      var sentImage = image || previewImage.src;
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
        if (activeId) {
          Api.appendToChat(activeId, userTurn);
          Api.appendToChat(activeId, answer);
          finish();
        } else {
          Api.createChat(activeSubject, turns).then(function (created) {
            if (created) { activeId = created.id; updateSessionUrl(created.id); }
            finish();
          });
        }
      });
    });
  }

  mount();
})();
