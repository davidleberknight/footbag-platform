(function () {
  'use strict';
  var cityInput = document.getElementById('city');
  var slugInput = document.getElementById('slug');
  if (!cityInput || !slugInput) return;

  var lastAutoSlug = '';

  // Mirrors the server's tag slug rule: letters with no decomposed form are
  // mapped first, then accents are stripped, so "Zürich" suggests "zurich"
  // rather than "z_rich". The suggestion is saved as typed, so it must match.
  var PRE_NFD_MAP = { 'Ł': 'L', 'ł': 'l', 'Ø': 'O', 'ø': 'o', 'Đ': 'D', 'đ': 'd' };

  function slugPreview(text) {
    var s = text.replace(/[ŁłØøĐđ]/g, function (ch) { return PRE_NFD_MAP[ch]; });
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s
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
