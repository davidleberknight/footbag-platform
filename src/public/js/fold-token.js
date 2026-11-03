/**
 * The site's one folding rule, for scripts that preview a slug or a hashtag before the
 * form is sent. It is the same rule the server applies (src/services/slugify.ts) and reads
 * the same table, the Unicode CLDR Latin-ASCII transform in /js/latin-ascii.json, so a
 * preview always shows what the server will store. The server folds again on submit, so
 * a page without this script still stores the folded value.
 *
 * Load it before the scripts that use it, with the table's versioned address:
 *   <script src="/js/fold-token.js?v=.." data-table-src="/js/latin-ascii.json?v=.." defer>
 * and call window.footbagFold.ready.then(...) before folding.
 */
(function () {
  'use strict';

  var map = null;
  var COMBINING_MARK = /\p{Mn}/gu;

  function useTable(table) {
    map = table;
  }

  // Accents removed, then each character mapped through the table; lowercase;
  // apostrophes deleted; any other run outside a to z and 0 to 9 becomes one
  // underscore, trimmed from both ends.
  function slugify(text) {
    var unaccented = String(text).normalize('NFD').replace(COMBINING_MARK, '').normalize('NFC');
    var ascii = '';
    for (var ch of unaccented) {
      ascii += (map && Object.prototype.hasOwnProperty.call(map, ch)) ? map[ch] : ch;
    }
    return ascii
      .toLowerCase()
      .replace(/'/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // Whether text holds a letter or digit with no a to z form even after the
  // table (a word in Han or Cyrillic script, say). The server refuses such a
  // hashtag or slug rather than folding part of it away, and so does a preview.
  function hasUnconvertible(text) {
    var unaccented = String(text).normalize('NFD').replace(COMBINING_MARK, '').normalize('NFC');
    for (var ch of unaccented) {
      var mapped = (map && Object.prototype.hasOwnProperty.call(map, ch)) ? map[ch] : ch;
      if (/[^A-Za-z0-9]/.test(mapped) && /[\p{L}\p{N}]/u.test(mapped)) return true;
    }
    return false;
  }

  // A typed hashtag in its stored form: leading '#' dropped, folded, '#' restored;
  // empty when nothing is left.
  function typedTag(raw) {
    var body = slugify(String(raw).trim().replace(/^#+/, ''));
    return body ? '#' + body : '';
  }

  // True once the letter table is in. Without it a preview could show a token the
  // server folds differently, so callers write nothing until it is, and leave the
  // folding to the server if it never arrives.
  function isLoaded() {
    return map !== null;
  }

  // The line under a field that says what folding did. It is created empty when
  // the page loads, directly under `after`, and named in the input's
  // aria-describedby, so a screen reader announces the text when it is set and
  // reads it again when the field is revisited.
  function attachNote(input, after) {
    var note = document.createElement('p');
    note.className = 'form-hint';
    note.id = (input.id || 'field') + '-fold-note';
    note.setAttribute('data-fold-note', '');
    note.setAttribute('aria-live', 'polite');
    after.parentNode.insertBefore(note, after.nextSibling);
    var described = input.getAttribute('aria-describedby');
    input.setAttribute('aria-describedby', described ? described + ' ' + note.id : note.id);
    return {
      set: function (text) { note.textContent = text; },
      clear: function () { note.textContent = ''; },
    };
  }

  var script = typeof document !== 'undefined' ? document.currentScript : null;
  var tableSrc = script ? script.getAttribute('data-table-src') : null;
  var ready = tableSrc && typeof fetch === 'function'
    ? fetch(tableSrc)
      .then(function (res) { return res.json(); })
      .then(function (doc) { useTable(doc.map); return true; })
      .catch(function () { return false; })
    : Promise.resolve(isLoaded());

  window.footbagFold = {
    ready: ready, isLoaded: isLoaded, slugify: slugify, typedTag: typedTag, hasUnconvertible: hasUnconvertible,
    useTable: useTable, attachNote: attachNote,
  };
})();
