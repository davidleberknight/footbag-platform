(function () {
  'use strict';
  var cityInput = document.getElementById('city');
  var slugInput = document.getElementById('slug');
  if (!cityInput || !slugInput) return;

  var lastAutoSlug = '';

  function slugPreview(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .replace(/__+/g, '_');
  }

  cityInput.addEventListener('blur', function () {
    var current = slugInput.value;
    if (current !== '' && current !== lastAutoSlug) return;
    var generated = slugPreview(cityInput.value);
    slugInput.value = generated;
    lastAutoSlug = generated;
  });
})();
