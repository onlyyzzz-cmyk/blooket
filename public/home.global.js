// Home page: load the newest templates into the grid.
(function () {
  'use strict';

  var grid = document.getElementById('home-grid');
  var countEl = document.getElementById('template-count');
  if (!grid) return;

  function viewerId() {
    var user = window.Templo && window.Templo.currentUser();
    return user ? user.id : '';
  }

  function onLike(template, btn) {
    var user = window.Templo.currentUser();
    if (!user) { window.Templo.signInClick(); return; }
    fetch('/api/templates/' + template.id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'like', userId: user.id }),
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
      body: JSON.stringify({ action: 'copy', userId: viewerId() }),
    }).catch(function () { /* counting is best effort */ });
  }

  function render(templates) {
    grid.innerHTML = '';
    if (!templates.length) {
      var empty = window.Templo.el('div', 'empty');
      empty.innerHTML = '<div class="e-icon">📭</div><h3>No templates yet</h3><p>Be the first to publish one — head to the dashboard and share your server template with everyone.</p>';
      grid.appendChild(empty);
      if (countEl) countEl.textContent = '';
      return;
    }
    templates.forEach(function (template) {
      grid.appendChild(window.Templo.templateCard(template, { onLike: onLike, onUse: onUse }));
    });
    if (countEl) countEl.textContent = templates.length + ' template' + (templates.length === 1 ? '' : 's');
  }

  fetch('/api/templates?viewerId=' + encodeURIComponent(viewerId()))
    .then(function (r) { return r.json(); })
    .then(function (data) { render(data.templates || []); })
    .catch(function () {
      grid.innerHTML = '';
      var empty = window.Templo.el('div', 'empty');
      empty.innerHTML = '<div class="e-icon">⚠️</div><h3>Could not load templates</h3><p>The server may be restarting. Please refresh in a moment.</p>';
      grid.appendChild(empty);
    });

  // Hero sign-up button.
  var heroSignup = document.querySelector('.hero-signup');
  if (heroSignup) heroSignup.addEventListener('click', function () { window.Templo.signUpClick(); });
})();
