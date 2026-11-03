(function () {
  'use strict';
  // The legal name is recorded as two parts, so the full name the display-name
  // and profile-URL defaults are built from is assembled here the same way the
  // server assembles it: given names first, either part allowed to be empty.
  var givenNamesInput = document.getElementById('givenNames');
  var familyNameInput = document.getElementById('familyName');
  var displayNameInput = document.getElementById('displayName');
  var slugInput = document.getElementById('slug');
  if (!familyNameInput || !displayNameInput || !slugInput) return;

  var lastAutoDisplay = '';
  var lastAutoSlug = '';

  // The site's one folding rule (fold-token.js), so "Zoë Müller" suggests
  // "zoe_muller", exactly what the server stores. Until its letter table is in,
  // nothing is suggested and the server folds on submit instead, so a preview is
  // never a token the server would store differently.
  var fold = window.footbagFold;
  function slugPreview(text) {
    return fold && fold.isLoaded() ? fold.slugify(text) : '';
  }
  var note = fold ? fold.attachNote(slugInput, slugInput) : null;

  function fullName() {
    var given = givenNamesInput ? givenNamesInput.value.trim() : '';
    var family = familyNameInput.value.trim();
    return given && family ? given + ' ' + family : given || family;
  }

  function effectiveDisplayName() {
    return displayNameInput.value.trim() || fullName();
  }

  function updateDisplayName() {
    var current = displayNameInput.value;
    if (current !== '' && current !== lastAutoDisplay) return;
    var generated = fullName();
    displayNameInput.value = generated;
    lastAutoDisplay = generated;
  }

  function updateSlug() {
    var current = slugInput.value;
    if (current !== '' && current !== lastAutoSlug) return;
    if (!fold || !fold.isLoaded()) return;
    var generated = slugPreview(effectiveDisplayName());
    slugInput.value = generated;
    lastAutoSlug = generated;
    if (note) note.clear();
  }

  function updateBoth() {
    updateDisplayName();
    updateSlug();
  }

  if (givenNamesInput) givenNamesInput.addEventListener('blur', updateBoth);
  familyNameInput.addEventListener('blur', updateBoth);

  displayNameInput.addEventListener('blur', function () {
    updateSlug();
  });

  // A typed profile URL is folded the way the server will store it, and the line
  // under the field says what changed and why. Capitals alone change silently,
  // and a value that needs no folding clears any earlier line. Returns whether
  // the field was changed.
  function foldTyped() {
    if (!note || !fold.isLoaded()) return false;
    var typed = slugInput.value.trim();
    // Letters with no a to z form are refused by the server, never folded away,
    // so the value is left as typed for that refusal to name.
    if (fold.hasUnconvertible(typed)) {
      note.clear();
      return false;
    }
    var folded = typed === '' || typed === lastAutoSlug ? '' : slugPreview(typed);
    if (!folded || folded === typed.toLowerCase()) {
      note.clear();
      return false;
    }
    slugInput.value = folded;
    note.set('Your profile URL will be ' + folded + '. A profile URL uses only the letters a to z, digits and underscores, so accented letters become plain ones and other characters become underscores.');
    return true;
  }

  slugInput.addEventListener('blur', foldTyped);

  // Enter submits without leaving the field, so the fold happens here too: the
  // member sees the folded URL and submits again, as without a script.
  var form = slugInput.closest('form');
  if (form) {
    form.addEventListener('submit', function (e) {
      if (foldTyped()) {
        e.preventDefault();
        slugInput.focus();
      }
    });
  }

  // The table may arrive after the name fields were filled.
  if (fold) fold.ready.then(function (ok) { if (ok) updateSlug(); });
})();
