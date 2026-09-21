// Dashboard: browse, search, publish, edit, delete templates.
(function () {
  'use strict';

  var grid = document.getElementById('dash-grid');
  var searchInput = document.getElementById('dash-search');
  var sortSelect = document.getElementById('dash-sort');
  var mineSelect = document.getElementById('dash-mine');
  var newBtn = document.getElementById('dash-new');
  var notice = document.getElementById('dash-notice');
  var dashSub = document.getElementById('dash-sub');
  if (!grid) return;

  var backdrop = document.getElementById('editor-backdrop');
  var form = document.getElementById('editor-form');
  var editorTitle = document.getElementById('editor-title');
  var editorSub = document.getElementById('editor-sub');
  var editorNote = document.getElementById('editor-note');
  var submitBtn = document.getElementById('editor-submit');
  var cancelBtn = document.getElementById('editor-cancel');

  var editingId = null; // null = create
  var searchTimer = null;

  function user() { return window.Templo.currentUser(); }

  function showNotice(text) {
    if (!notice) return;
    notice.textContent = text;
    notice.hidden = false;
  }

  function requireSignIn() {
    var current = user();
    if (current) return current;
    showNotice('Sign in to publish, like, and manage your templates. Browsing stays free.');
    window.Templo.toast('Sign in to do that');
    return null;
  }

  function onLike(template, btn) {
    if (!requireSignIn()) return;
    fetch('/api/templates/' + template.id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'like', userId: user().id }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { window.Templo.toast(data.error); return; }
        template.likes = data.likes;
        template.liked = data.liked;
        btn.classList.toggle('liked', data.liked);
        btn.innerHTML = (data.liked ? '❤️' : '🤍') + ' <span>' + data.likes + '</span>';
      })
      .catch(function () { window.Templo.toast('Could not save your like.'); });
  }

  function onUse(template) {
    fetch('/api/templates/' + template.id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'copy', userId: user() ? user().id : '' }),
    }).catch(function () { /* best effort */ });
  }

  function onDelete(template) {
    if (!requireSignIn()) return;
    if (!window.confirm('Delete "' + template.name + '"? This cannot be undone.')) return;
    fetch('/api/templates/' + template.id, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user().id }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { window.Templo.toast(data.error); return; }
        window.Templo.toast('Template deleted');
        load();
      })
      .catch(function () { window.Templo.toast('Could not delete the template.'); });
  }

  function onEdit(template) {
    editingId = template.id;
    editorTitle.textContent = 'Edit template';
    editorSub.textContent = 'Update your template details.';
    form.elements.name.value = template.name;
    form.elements.bio.value = template.bio || '';
    form.elements.link.value = template.link;
    form.elements.guildName.value = template.guildName || '';
    form.elements.tags.value = (template.tags || []).join(', ');
    submitBtn.textContent = 'Save changes';
    editorNote.hidden = true;
    backdrop.hidden = false;
  }

  function openCreate() {
    var current = requireSignIn();
    if (!current) return;
    editingId = null;
    editorTitle.textContent = 'Publish a template';
    editorSub.textContent = 'Share your Discord server template with the community.';
    form.reset();
    submitBtn.textContent = 'Publish';
    editorNote.hidden = true;
    backdrop.hidden = false;
    form.elements.name.focus();
  }

  function closeModal() { backdrop.hidden = true; }

  function submitForm(event) {
    event.preventDefault();
    var current = requireSignIn();
    if (!current) { closeModal(); return; }
    editorNote.hidden = true;

    var tags = form.elements.tags.value.split(',').map(function (entry) { return entry.trim(); }).filter(Boolean).slice(0, 6);
    var payload = {
      userId: current.id,
      name: form.elements.name.value,
      bio: form.elements.bio.value,
      link: form.elements.link.value,
      guildName: form.elements.guildName.value,
      tags: tags,
    };
    var isEdit = Boolean(editingId);
    var request = isEdit
      ? fetch('/api/templates/' + editingId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({}, payload, { ownerId: current.id, ownerName: current.name, ownerAvatar: current.avatar })),
        });

    submitBtn.disabled = true;
    request
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (outcome) {
        submitBtn.disabled = false;
        if (outcome.ok && outcome.data.ok) {
          closeModal();
          window.Templo.toast(isEdit ? 'Template updated' : 'Template published 🎉');
          load();
        } else {
          editorNote.textContent = outcome.data.error || 'Something went wrong. Please try again.';
          editorNote.className = 'form-note error';
          editorNote.hidden = false;
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        editorNote.textContent = 'Could not reach the server. Please try again.';
        editorNote.className = 'form-note error';
        editorNote.hidden = false;
      });
  }

  function query() {
    var params = new URLSearchParams();
    var current = user();
    if (current) params.set('viewerId', current.id);
    if (searchInput && searchInput.value.trim()) params.set('search', searchInput.value.trim());
    if (sortSelect) params.set('sort', sortSelect.value);
    if (mineSelect && mineSelect.value === '1' && current) params.set('mine', '1');
    return params.toString();
  }

  function render(templates) {
    grid.innerHTML = '';
    if (!templates.length) {
      var empty = window.Templo.el('div', 'empty');
      if (mineSelect && mineSelect.value === '1') {
        empty.innerHTML = '<div class="e-icon">📦</div><h3>You have no templates yet</h3><p>Publish your first one with the “New template” button — it takes under a minute.</p>';
      } else {
        empty.innerHTML = '<div class="e-icon">🔍</div><h3>No templates found</h3><p>Try a different search, or publish the template everyone is missing.</p>';
      }
      grid.appendChild(empty);
      return;
    }
    templates.forEach(function (template) {
      var current = user();
      template.isOwner = Boolean(current && template.ownerId === current.id);
      grid.appendChild(window.Templo.templateCard(template, { onLike: onLike, onUse: onUse, onEdit: onEdit, onDelete: onDelete }));
    });
  }

  function load() {
    fetch('/api/templates?' + query())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) { showNotice(data.error); return; }
        render(data.templates || []);
      })
      .catch(function () {
        grid.innerHTML = '';
        var empty = window.Templo.el('div', 'empty');
        empty.innerHTML = '<div class="e-icon">⚠️</div><h3>Could not load templates</h3><p>The server may be restarting. Please refresh in a moment.</p>';
        grid.appendChild(empty);
      });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(load, 250);
    });
  }
  if (sortSelect) sortSelect.addEventListener('change', load);
  if (mineSelect) mineSelect.addEventListener('change', function () {
    if (mineSelect.value === '1') requireSignIn();
    load();
  });
  if (newBtn) newBtn.addEventListener('click', openCreate);
  if (form) form.addEventListener('submit', submitForm);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', function (event) { if (event.target === backdrop) closeModal(); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && backdrop && !backdrop.hidden) closeModal(); });

  // Re-render when auth resolves so "My templates" + owner tools appear.
  var auth = window.TemploAuth || window.AITutorAuth;
  if (auth) {
    auth.load().then(function () { load(); });
  }
  load();
})();
