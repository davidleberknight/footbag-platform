(function () {
  'use strict';
  var cityInput = document.getElementById('city');
  var slugInput = document.getElementById('slug');
  if (!cityInput || !slugInput) return;

  var lastAutoSlug = '';

  // The site's one folding rule (fold-token.js), so "Zürich" suggests "zurich",
  // exactly what the server stores. Until its letter table is in, nothing is
  // suggested and the server folds on submit instead.
  var fold = window.footbagFold;
  function slugPreview(text) {
    return fold && fold.isLoaded() ? fold.slugify(text) : '';
  }
  // The line sits directly under the hashtag field, after its "#club_" group.
  var note = fold ? fold.attachNote(slugInput, slugInput.parentNode) : null;

  function suggestFromCity() {
    var current = slugInput.value;
    if (current !== '' && current !== lastAutoSlug) return;
    if (!fold || !fold.isLoaded()) return;
    var generated = slugPreview(cityInput.value);
    slugInput.value = generated;
    lastAutoSlug = generated;
    if (note) note.clear();
  }
  cityInput.addEventListener('blur', suggestFromCity);

  // A typed hashtag is folded the way the server will store it, and the line
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
    note.set('Your club hashtag will be #club_' + folded + '. A club hashtag uses only the letters a to z, digits and underscores, so accented letters become plain ones and other characters become underscores.');
    return true;
  }

  slugInput.addEventListener('blur', foldTyped);

  // Enter submits without leaving the field, so the fold happens here too: the
  // creator sees the folded hashtag and submits again, as without a script.
  var form = slugInput.closest('form');
  if (form) {
    form.addEventListener('submit', function (e) {
      if (foldTyped()) {
        e.preventDefault();
        slugInput.focus();
      }
    });
  }

  if (fold) fold.ready.then(function (ok) { if (ok) suggestFromCity(); });
})();
