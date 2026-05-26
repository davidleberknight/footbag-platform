(function () {
  'use strict';
  var realNameInput = document.getElementById('realName');
  var displayNameInput = document.getElementById('displayName');
  var slugInput = document.getElementById('slug');
  if (!realNameInput || !displayNameInput || !slugInput) return;

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

  function effectiveDisplayName() {
    return displayNameInput.value.trim() || realNameInput.value.trim();
  }

  function updateDisplayName() {
    var current = displayNameInput.value;
    if (current !== '' && current !== lastAutoDisplay) return;
    var generated = realNameInput.value.trim();
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

  realNameInput.addEventListener('blur', function () {
    updateDisplayName();
    updateSlug();
  });

  displayNameInput.addEventListener('blur', function () {
    updateSlug();
  });
})();
