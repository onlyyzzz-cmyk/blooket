(function () {
  'use strict';

  // Clerk JS integration (script/browser build). The script build exposes
  // window.Clerk as a ready-made singleton: initialize with Clerk.load().
  // The @clerk/ui bundle sets window.__internal_ClerkUICtor, which the
  // components need for rendering. The publishable key is injected
  // server-side into the page (and mirrored via /api/config).

  var state = { clerk: null, user: null, ready: null, error: '' };

  function publishableKey() {
    if (window.__AITUTOR_CONFIG__ && window.__AITUTOR_CONFIG__.clerkPublishableKey) {
      return window.__AITUTOR_CONFIG__.clerkPublishableKey;
    }
    var script = document.querySelector('script[data-clerk-publishable-key]');
    if (script) {
      var value = script.getAttribute('data-clerk-publishable-key');
      if (value && value.indexOf('__') === -1) return value;
    }
    return '';
  }

  function clerkDomain(key) {
    try {
      // pk_test_<base64 domain>$ → decode the third underscore-separated part.
      return atob(key.split('_')[2]).slice(0, -1);
    } catch (error) {
      return '';
    }
  }

  function loadScript(src, attributes) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') { resolve(); return; }
        existing.addEventListener('load', function () { existing.dataset.loaded = '1'; resolve(); });
        existing.addEventListener('error', reject);
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      // The clerk-js browser bundle builds its singleton at evaluation time
      // and reads the key from this attribute on its own script tag.
      if (attributes) {
        Object.keys(attributes).forEach(function (name) { script.setAttribute(name, attributes[name]); });
      }
      script.onload = function () { script.dataset.loaded = '1'; resolve(); };
      script.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(script);
    });
  }

  function load() {
    if (state.ready) return state.ready;
    state.ready = (async function () {
      var key = publishableKey();
      if (!key) { state.error = 'No publishable key configured'; console.warn('[AITutorAuth]', state.error); return null; }
      var domain = clerkDomain(key);
      if (!domain) { state.error = 'Could not derive Clerk domain from key'; console.warn('[AITutorAuth]', state.error); return null; }
      try {
        await loadScript('https://' + domain + '/npm/@clerk/ui@1/dist/ui.browser.js');
        await loadScript('https://' + domain + '/npm/@clerk/clerk-js@6/dist/clerk.browser.js', { 'data-clerk-publishable-key': key });
        var clerk = window.Clerk;
        if (!clerk || typeof clerk.load !== 'function') {
          state.error = 'Clerk singleton unavailable after script load';
          console.warn('[AITutorAuth]', state.error);
          return null;
        }
        await clerk.load({
          ui: { ClerkUI: window.__internal_ClerkUICtor },
        });
        state.clerk = clerk;
        state.user = clerk.user || null;
        return clerk;
      } catch (error) {
        state.error = (error && error.message) || String(error);
        console.warn('[AITutorAuth] Clerk failed to load:', state.error);
        return null;
      }
    })();
    return state.ready;
  }

  function openSignUp() {
    return load().then(function (clerk) {
      if (clerk && clerk.user) { window.location.href = '/chats'; return true; }
      if (clerk && typeof clerk.openSignUp === 'function') { clerk.openSignUp(); return true; }
      return false;
    });
  }

  function openSignIn() {
    return load().then(function (clerk) {
      if (clerk && clerk.openSignIn) { clerk.openSignIn(); return true; }
      return false;
    });
  }

  function mountUserButton(element) {
    return load().then(function (clerk) {
      if (clerk && element) { clerk.mountUserButton(element); return true; }
      return false;
    });
  }

  window.AITutorAuth = {
    load: load,
    user: function () { return state.user; },
    openSignUp: openSignUp,
    openSignIn: openSignIn,
    mountUserButton: mountUserButton,
    status: function () { return { loaded: Boolean(state.clerk), user: Boolean(state.user), error: state.error }; },
  };
})();
