// Templo shared site script — Clerk auth for the header + card helpers.
(function () {
  'use strict';

  // Rebrand the existing auth helper without touching its Clerk logic.
  if (window.AITutorAuth) { window.TemploAuth = window.AITutorAuth; }

  var cacheBust = 'v1';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function signInClick() {
    var auth = window.TemploAuth || window.AITutorAuth;
    if (auth) {
      auth.openSignIn().then(function (opened) {
        if (!opened) window.location.href = '/sign-up';
      });
    } else {
      window.location.href = '/sign-up';
    }
  }

  function signUpClick() {
    var auth = window.TemploAuth || window.AITutorAuth;
    try { sessionStorage.setItem('templo-return-to', window.location.pathname); } catch (e) { /* ignore */ }
    if (auth) {
      auth.openSignUp({ redirectTo: window.location.pathname }).then(function (opened) {
        if (!opened) window.location.href = '/sign-up';
      });
    } else {
      window.location.href = '/sign-up';
    }
  }

  function buildHeaderUser(container) {
    var auth = window.TemploAuth || window.AITutorAuth;
    container.innerHTML = '';
    if (auth && auth.status().loaded && auth.user()) {
      var btn = el('div', 'header-user-mount');
      container.appendChild(btn);
      auth.mountUserButton(btn);
      return;
    }
    var signIn = el('button', 'btn btn-ghost btn-sm', 'Sign in');
    signIn.addEventListener('click', signInClick);
    var signUp = el('button', 'btn btn-primary btn-sm', 'Sign up');
    signUp.addEventListener('click', signUpClick);
    container.appendChild(signIn);
    container.appendChild(signUp);
  }

  function initHeader() {
    var userSlot = document.querySelector('.header-user');
    if (!userSlot) return;
    buildHeaderUser(userSlot);
    var auth = window.TemploAuth || window.AITutorAuth;
    if (!auth) return;
    auth.load().then(function (clerk) {
      if (clerk) {
        buildHeaderUser(userSlot);
        try {
          clerk.addListener(function () { buildHeaderUser(userSlot); });
        } catch (e) { /* older builds */ }
      }
    });
  }

  // ---- Template card rendering (used by index + dashboard) ----
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function templateCard(template, options) {
    var card = el('article', 'tcard');
    card.dataset.id = template.id;

    var top = el('div', 'tcard-top');
    var icon = el('div', 'tcard-icon', template.iconText || 'T');
    var title = el('div', 'tcard-title');
    title.appendChild(el('h3', null, template.name));
    title.appendChild(el('div', 'by', 'by ' + (template.ownerName || 'Anonymous')));
    top.appendChild(icon);
    top.appendChild(title);
    card.appendChild(top);

    card.appendChild(el('p', 'tcard-bio', template.bio || 'No description yet.'));

    if (template.tags && template.tags.length) {
      var tags = el('div', 'tag-row');
      template.tags.forEach(function (tag) { tags.appendChild(el('span', 'tag', '#' + tag)); });
      card.appendChild(tags);
    }

    var stats = el('div', 'tcard-stats');
    var like = el('button', 'like-btn' + (template.liked ? ' liked' : ''));
    like.type = 'button';
    like.innerHTML = (template.liked ? '❤️' : '🤍') + ' <span>' + template.likes + '</span>';
    like.addEventListener('click', function () { if (options && options.onLike) options.onLike(template, like); });
    stats.appendChild(like);
    stats.appendChild(el('span', 'stat', '📄 ' + template.copies + ' uses'));
    card.appendChild(stats);

    var actions = el('div', 'tcard-actions');
    var use = el('a', 'btn btn-primary btn-sm', 'Use template');
    use.href = template.link;
    use.target = '_blank';
    use.rel = 'noopener noreferrer';
    use.addEventListener('click', function () { if (options && options.onUse) options.onUse(template); });
    actions.appendChild(use);

    if (options && options.onEdit && template.isOwner) {
      var edit = el('button', 'btn btn-ghost btn-sm', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', function () { options.onEdit(template); });
      actions.appendChild(edit);
      var del = el('button', 'btn btn-danger btn-sm', 'Delete');
      del.type = 'button';
      del.addEventListener('click', function () { options.onDelete(template); });
      actions.appendChild(del);
    }
    card.appendChild(actions);
    return card;
  }

  function toast(message) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var node = el('div', 'toast', message);
    document.body.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('show'); });
    setTimeout(function () {
      node.classList.remove('show');
      setTimeout(function () { node.remove(); }, 300);
    }, 2600);
  }

  function currentUser() {
    var auth = window.TemploAuth || window.AITutorAuth;
    if (!auth || !auth.status().loaded || !auth.user()) return null;
    var user = auth.user();
    var email = '';
    try {
      if (typeof user.primaryEmailAddress === 'string') email = user.primaryEmailAddress;
      else if (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress) email = user.primaryEmailAddress.emailAddress;
      else if (Array.isArray(user.emailAddresses) && user.emailAddresses.length) email = user.emailAddresses[0].emailAddress;
    } catch (e) { /* ignore */ }
    return {
      id: user.id,
      name: user.username || user.firstName || email.split('@')[0] || 'Member',
      avatar: (user.imageUrl) || '',
      email: email,
    };
  }

  function signOutIfOwned(container) {
    // Convenience: after sign-out the header re-renders via clerk listener.
    return container;
  }

  function copyLink(template) {
    var url = window.location.origin + '/?t=' + template.slug;
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () { });
  }

  window.Templo = {
    cacheBust: cacheBust,
    el: el,
    escapeHtml: escapeHtml,
    templateCard: templateCard,
    toast: toast,
    currentUser: currentUser,
    copyLink: copyLink,
    initHeader: initHeader,
    signInClick: signInClick,
    signUpClick: signUpClick,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHeader);
  else initHeader();
})();
