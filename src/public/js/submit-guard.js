// Delegated double-submit guard for state-changing forms.
//
// A fast double click on a submit button sends the form twice, and the browser
// shows the second response, which is often a refusal for an action that in
// fact succeeded. Once a POST form submits, this listener refuses any further
// submit of that form and disables its submit controls. It is a convenience
// layer only: the page works without it, and a back button, a second tab or a
// network retry still resubmits, so the server stays responsible for treating
// a repeat as a no-op.
//
// Bubble phase, so it runs after delete-confirm.js (capture phase) and after a
// form's own listener: a submit something earlier cancelled, a declined
// confirm or a script-driven upload, is left untouched.
(function () {
  'use strict';

  var FORM_MARK = 'data-submit-guard-pending';
  var CONTROL_MARK = 'data-submit-guard-disabled';

  function isSubmitControl(el) {
    var tag = el.tagName;
    if (tag === 'BUTTON') return el.type === 'submit';
    if (tag === 'INPUT') return el.type === 'submit' || el.type === 'image';
    return false;
  }

  function submitMethod(form, submitter) {
    var method = submitter && submitter.getAttribute('formmethod');
    return String(method || form.getAttribute('method') || 'get').toLowerCase();
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || form.tagName !== 'FORM') return;
    if (event.defaultPrevented) return;
    if (submitMethod(form, event.submitter) !== 'post') return;

    if (form.hasAttribute(FORM_MARK)) {
      event.preventDefault();
      return;
    }
    form.setAttribute(FORM_MARK, '');

    // Deferred: a control disabled inside the submit event is left out of the
    // submission, so the pressed button's name and value would be lost.
    setTimeout(function () {
      var controls = form.elements;
      for (var i = 0; i < controls.length; i++) {
        var el = controls[i];
        if (!isSubmitControl(el) || el.disabled) continue;
        el.disabled = true;
        el.setAttribute(CONTROL_MARK, '');
      }
    }, 0);
  });

  // A page restored from the back-forward cache keeps the disabled state it
  // left with, so the member would come back to a form they cannot submit.
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    var forms = document.querySelectorAll('form[' + FORM_MARK + ']');
    for (var i = 0; i < forms.length; i++) forms[i].removeAttribute(FORM_MARK);
    var controls = document.querySelectorAll('[' + CONTROL_MARK + ']');
    for (var j = 0; j < controls.length; j++) {
      controls[j].disabled = false;
      controls[j].removeAttribute(CONTROL_MARK);
    }
  });
})();
