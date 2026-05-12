// Delegated submit-confirm handler.
//
// CSP ('script-src-attr: none') bans inline event-handler attributes. Forms
// that want a "are you sure?" confirmation declare data-confirm="<message>";
// this listener fires on bubbled submit, asks the user, and calls
// preventDefault() if they decline.
//
// Convention: forms using this helper carry class="inline-form" so they
// flow with surrounding text. The class is defined in style.css.
(function () {
  'use strict';
  document.addEventListener(
    'submit',
    function (event) {
      var form = event.target;
      if (!form || form.tagName !== 'FORM') return;
      var message = form.getAttribute('data-confirm');
      if (!message) return;
      if (!window.confirm(message)) {
        event.preventDefault();
      }
    },
    true, // capture phase: runs before any form's own onsubmit (there should be none)
  );
})();
