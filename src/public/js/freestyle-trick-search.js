/*
 * Progressive-enhancement typeahead for the freestyle trick search.
 *
 * The form already works without JS (a plain GET to /freestyle/search renders
 * server-side results). When JS is present this live-renders matches from the
 * suggest endpoint into the same results region as the user types. All result
 * text is inserted via textContent, never innerHTML, so trick names and aliases
 * cannot inject markup.
 */
(function () {
  'use strict';

  var form = document.querySelector('[data-trick-search-form]');
  if (!form) return;
  var input = form.querySelector('[data-trick-search-input]');
  var results = document.querySelector('[data-trick-search-results]');
  var url = form.getAttribute('data-suggest-url');
  if (!input || !results || !url) return;

  var MIN_LENGTH = 2;
  var DEBOUNCE_MS = 150;
  var timer = null;
  var lastQuery = null;

  function render(items, query) {
    results.textContent = '';
    if (!items.length) {
      var none = document.createElement('p');
      none.className = 'text-muted';
      none.textContent = 'No tricks or family pages found matching "' + query + '".';
      results.appendChild(none);
      return;
    }
    var list = document.createElement('div');
    list.className = 'member-search-results';
    items.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'member-search-result';

      var link = document.createElement('a');
      link.href = it.href;
      link.textContent = it.name;
      row.appendChild(link);

      // Every suggestion carries a type discriminator; family results also carry
      // a badge label. Branch on the type, not on whether the label is present.
      if (it.type === 'family') {
        var kind = document.createElement('span');
        kind.className = 'badge';
        kind.textContent = it.typeLabel;
        row.appendChild(kind);
      }
      if (it.adds) {
        var adds = document.createElement('span');
        adds.className = 'text-muted';
        adds.textContent = it.adds + ' ADD';
        row.appendChild(adds);
      }
      if (it.matchedAlias) {
        var alias = document.createElement('span');
        alias.className = 'text-muted';
        alias.textContent = 'also: ' + it.matchedAlias;
        row.appendChild(alias);
      }
      list.appendChild(row);
    });
    results.appendChild(list);
  }

  function runQuery() {
    var q = input.value.trim();
    if (q.length < MIN_LENGTH) {
      results.textContent = '';
      lastQuery = null;
      return;
    }
    if (q === lastQuery) return;
    lastQuery = q;
    fetch(url + '?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (items) {
        // Ignore stale responses if the field changed while in flight.
        if (input.value.trim() === q) render(items, q);
      })
      .catch(function () { /* leave the server-rendered results in place */ });
  }

  input.addEventListener('input', function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(runQuery, DEBOUNCE_MS);
  });
})();
