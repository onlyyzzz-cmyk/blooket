(function () {
  'use strict';

  // Full-page sign-up: wait for the auth helper, then mount Clerk's SignUp
  // component. If the key is missing or Clerk fails, show a clear message.
  var mount = document.getElementById('clerk-signup');
  if (!mount) return;

  function showMessage(text) {
    mount.innerHTML = '<p class="doc-updated">' + text + '</p>';
  }

  var auth = window.AITutorAuth;
  if (!auth) { showMessage('Sign-up is unavailable right now. Please refresh.'); return; }

  fetch('/api/config').then(function (response) { return response.json(); }).catch(function () { return {}; }).then(function (config) {
    window.__AITUTOR_CONFIG__ = config || {};
    if (!config || !config.clerkPublishableKey) {
      showMessage('Sign-up is not configured yet. Add VITE_CLERK_PUBLISHABLE_KEY to the environment.');
      return;
    }
    auth.load().then(function (clerk) {
      if (!clerk) {
        showMessage('Could not load sign-up (' + (auth.status().error || 'unknown error') + '). Please try again.');
        return;
      }
      if (clerk.user) {
        // Send signed-in users back to where they were headed (default: chats).
        var returnTo = '/chats';
        try {
          var stored = sessionStorage.getItem('aitutor-return-to');
          if (stored && stored.charAt(0) === '/') returnTo = stored;
          sessionStorage.removeItem('aitutor-return-to');
        } catch (error) { /* private mode */ }
        window.location.href = returnTo;
        return;
      }
      clerk.mountSignUp(mount);
    });
  });
})();
