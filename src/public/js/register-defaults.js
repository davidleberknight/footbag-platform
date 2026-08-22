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

  function slugPreview(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

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
    var generated = slugPreview(effectiveDisplayName());
    slugInput.value = generated;
    lastAutoSlug = generated;
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
})();
