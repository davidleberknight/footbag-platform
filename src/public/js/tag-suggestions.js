/**
 * Tag suggestions: clicking a suggested tag chip inserts its value into
 * the nearest tag text input. A chip may carry several space-separated tags
 * (a gallery's chip carries every hashtag of that gallery), and each is added.
 * Progressive enhancement; works without JS (buttons are inert without this
 * script).
 */
(function () {
  'use strict';

  function addTag(input, tag) {
    // Tags keep their leading '#', the form the server stores.
    var token = tag.charAt(0) === '#' ? tag : '#' + tag;

    // A chip field (tag-chips.js) adds the tag as a chip and cancels the event;
    // a plain text field takes the tag appended to its text.
    var handled = !input.dispatchEvent(new CustomEvent('tag-chips:add', { detail: token, cancelable: true }));
    if (handled) return;

    var current = input.value.trim();
    var tokens = current.length > 0 ? current.split(/\s+/) : [];
    var lowered = tokens.map(function (t) { return t.toLowerCase(); });

    // Don't add duplicates; tags match in lowercase.
    if (lowered.indexOf(token.toLowerCase()) !== -1) return;

    tokens.push(token);
    input.value = tokens.join(' ');
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.tag-suggestion');
    if (!btn) return;

    var tags = (btn.getAttribute('data-tag') || '').split(/\s+/).filter(function (t) { return t.length > 0; });
    if (tags.length === 0) return;

    // Find the closest tag input: walk up to the form, then find the tags input
    var form = btn.closest('form');
    if (!form) return;
    var input = form.querySelector('input[name="tags"]');
    if (!input) return;

    tags.forEach(function (tag) { addTag(input, tag); });
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
})();
