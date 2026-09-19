(function () {
  'use strict';

  // The update log's "Sign up" link should open the Clerk sign-up modal,
  // matching the header buttons. Without auth/Clerk it stays a normal link
  // to the full-page /sign-up flow.
  var link = document.getElementById('updates-signup-link');
  if (!link) return;

  var auth = window.AITutorAuth;
  if (!auth) return; // no helper loaded → keep the plain /sign-up link

  link.addEventListener('click', function (event) {
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      auth.openSignUp().then(function (opened) {
        if (!opened) window.location.href = '/sign-up'; // Modal unavailable → full-page sign-up.
      });
    }
  });
})();
