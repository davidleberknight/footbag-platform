/**
 * Tag suggestions: clicking a suggested tag chip inserts its value into
 * the nearest tag text input. Progressive enhancement; works without JS
 * (buttons are inert without this script).
 */
(function () {
  'use strict';

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.tag-suggestion');
    if (!btn) return;

    var tag = btn.getAttribute('data-tag');
    if (!tag) return;

    // Strip leading '#' for the space-separated input format
    var token = tag.charAt(0) === '#' ? tag.slice(1) : tag;

    // Find the closest tag input: walk up to the form, then find the tags input
    var form = btn.closest('form');
    if (!form) return;
    var input = form.querySelector('input[name="tags"]');
    if (!input) return;

    var current = input.value.trim();
    var tokens = current.length > 0 ? current.split(/\s+/) : [];

    // Don't add duplicates
    if (tokens.indexOf(token) !== -1) return;

    tokens.push(token);
    input.value = tokens.join(' ');
    input.focus();
  });
})();
