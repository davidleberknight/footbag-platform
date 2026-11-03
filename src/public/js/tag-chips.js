/**
 * Tag chip input: progressive enhancement for tag text fields.
 *
 * Targets <input> or <textarea> elements with a data-tag-chips attribute.
 * Replaces the plain text field with a chip container where each tag renders
 * as a removable chip. Includes debounced autocomplete via /tags/suggest.
 *
 * Graceful degradation: without this script, the plain text input works
 * as before. The form submits the hidden input's space-separated value.
 */
(function () {
  'use strict';

  var DEBOUNCE_MS = 250;
  var MAX_RESULTS = 8;
  // The server's limit on hashtags per item (TOKEN_RULES.tagsPerItem).
  var MAX_CHIPS = 30;

  // A typed tag's body as it is stored: folded by the site's one rule
  // (fold-token.js), with no leading '#'. Until that rule's letter table is in,
  // the tag is kept as typed (no spaces) and the server folds it on save, so a
  // chip never shows a token the server would store differently.
  function canFold() {
    return !!(window.footbagFold && window.footbagFold.isLoaded());
  }
  function tagBody(raw) {
    var stripped = String(raw).trim().replace(/^#+/, '');
    return canFold() ? window.footbagFold.slugify(stripped) : stripped.replace(/\s+/g, '');
  }

  var inputs = document.querySelectorAll('input[data-tag-chips], textarea[data-tag-chips]');
  if (!inputs.length) return;

  for (var i = 0; i < inputs.length; i++) {
    initChipInput(inputs[i]);
  }

  function initChipInput(original) {
    var name = original.getAttribute('name');
    var placeholder = original.getAttribute('placeholder') || '';

    // Hidden input carries the form value
    var hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = name;
    hidden.value = original.value;

    // Container wraps chips + text input. It holds chips and a field, not
    // options, so it carries no list role of its own.
    var container = document.createElement('div');
    container.className = 'tag-chip-input-container';

    // Text input for typing new tags. It takes over the original field's id and
    // accessible name, so the page's visible <label for> (or its aria-label)
    // names the field the reader actually types into, not the hidden original.
    var textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'tag-chip-input-field';
    textInput.placeholder = placeholder;
    textInput.setAttribute('autocomplete', 'off');
    var originalId = original.getAttribute('id');
    var originalName = original.getAttribute('aria-label');
    if (originalId) {
      original.removeAttribute('id');
      textInput.id = originalId;
    }
    if (originalName) {
      textInput.setAttribute('aria-label', originalName);
    } else if (!originalId) {
      textInput.setAttribute('aria-label', 'Add tag');
    }

    // Autocomplete dropdown
    var dropdown = document.createElement('ul');
    dropdown.className = 'tag-chip-autocomplete';
    dropdown.setAttribute('role', 'listbox');
    dropdown.style.display = 'none';

    container.appendChild(textInput);
    container.appendChild(dropdown);

    // Replace original input
    original.parentNode.insertBefore(hidden, original);
    original.parentNode.insertBefore(container, original);
    original.style.display = 'none';
    original.removeAttribute('name');

    // A field where a member applies tags asks the suggestions to leave out the
    // tags only the platform applies.
    if (original.hasAttribute('data-tag-entry')) container.setAttribute('data-tag-entry', '');

    // The line that says what folding did, directly under the field.
    if (window.footbagFold) container.foldNote = window.footbagFold.attachNote(textInput, container);

    var tokens = parseTokens(hidden.value);
    for (var t = 0; t < tokens.length; t++) {
      var stored = tagBody(tokens[t]);
      if (stored) addChip(container, textInput, hidden, stored);
    }

    // A suggested tag clicked elsewhere on the form (tag-suggestions.js) becomes a chip.
    hidden.addEventListener('tag-chips:add', function (e) {
      e.preventDefault();
      commitTag(container, textInput, hidden, e.detail);
    });

    // Keyboard events on the text input
    textInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') {
        var val = textInput.value.trim().replace(/^#/, '');
        if (val.length > 0) {
          e.preventDefault();
          commitTag(container, textInput, hidden, val);
        } else if (e.key === 'Enter') {
          // Don't submit form on enter in empty chip input
          e.preventDefault();
        }
      } else if (e.key === 'Backspace' && textInput.value === '') {
        var chips = container.querySelectorAll('.tag-chip-input-chip');
        if (chips.length > 0) {
          removeChip(container, chips[chips.length - 1], hidden);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusDropdownItem(dropdown, 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusDropdownItem(dropdown, -1);
      } else if (e.key === 'Escape') {
        hideDropdown(dropdown);
      }
    });

    // Debounced autocomplete fetch
    var timer = null;
    textInput.addEventListener('input', function () {
      clearTimeout(timer);
      var q = textInput.value.trim().replace(/^#/, '');
      if (q.length === 0) {
        hideDropdown(dropdown);
        return;
      }
      timer = setTimeout(function () {
        fetchSuggestions(q, dropdown, container, textInput, hidden);
      }, DEBOUNCE_MS);
    });

    // Hide dropdown on blur (with slight delay for click to register)
    textInput.addEventListener('blur', function () {
      setTimeout(function () { hideDropdown(dropdown); }, 200);
    });

    // Click on container focuses the text input
    container.addEventListener('click', function (e) {
      if (e.target === container) {
        textInput.focus();
      }
    });

    // Flush any uncommitted text into a chip when the form submits, so a tag
    // typed but not yet turned into a chip (e.g. typed then "Browse" clicked
    // without pressing Enter) is still included in the submitted value.
    var form = original.closest('form');
    if (form) {
      form.addEventListener('submit', function () {
        var pending = textInput.value.trim().replace(/^#/, '');
        if (pending.length > 0) {
          commitTag(container, textInput, hidden, pending);
        }
      });
    }
  }

  function parseTokens(value) {
    return value.trim().split(/\s+/).filter(function (t) { return t.length > 0; });
  }

  function syncHidden(container, hidden) {
    var chips = container.querySelectorAll('.tag-chip-input-chip');
    var vals = [];
    for (var i = 0; i < chips.length; i++) {
      vals.push('#' + chips[i].getAttribute('data-tag'));
    }
    hidden.value = vals.join(' ');
  }

  // Says what folding did to the tag just added, under the field, so the member
  // sees the stored tag before saving. It speaks only of a chip actually added;
  // capitals alone are lowered without a line, and a clean tag clears it.
  function showFoldNote(container, typed, token) {
    var note = container.foldNote;
    if (!note) return;
    // Without the letter table nothing was folded here; the server folds on save
    // and its saved message says what changed.
    if (!canFold()) {
      note.clear();
      return;
    }
    var asTyped = String(typed).trim().replace(/^#+/, '');
    if (asTyped.toLowerCase() === token) {
      note.clear();
      return;
    }
    note.set('Added #' + token + ' for the #' + asTyped + ' you typed. Hashtags use only the letters a to z, digits and underscores, so accented letters become plain ones and other characters become underscores.');
  }

  function commitTag(container, textInput, hidden, typed) {
    // A hashtag with letters the rule cannot convert is refused, as the server
    // refuses it: no chip, the text stays for the member to change, and the line
    // under the field says why.
    var asTyped = String(typed).trim().replace(/^#+/, '');
    if (canFold() && window.footbagFold.hasUnconvertible(asTyped)) {
      if (container.foldNote) container.foldNote.set('#' + asTyped + ' cannot be used: a hashtag needs letters a to z or digits, and these letters have no a to z form.');
      return;
    }

    // Folded by the site's one rule, the form the server stores.
    var token = tagBody(typed);
    if (token.length === 0) return;

    var existing = container.querySelectorAll('.tag-chip-input-chip');
    if (existing.length >= MAX_CHIPS) {
      if (container.foldNote) container.foldNote.set('At most ' + MAX_CHIPS + ' hashtags can be added at once.');
      return;
    }
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].getAttribute('data-tag') === token) {
        textInput.value = '';
        return;
      }
    }

    addChip(container, textInput, hidden, token);
    showFoldNote(container, typed, token);
    textInput.value = '';
    hideDropdown(container.querySelector('.tag-chip-autocomplete'));
  }

  function addChip(container, textInput, hidden, token) {
    var chip = document.createElement('span');
    chip.className = 'tag-chip-input-chip';
    chip.setAttribute('data-tag', token);
    chip.textContent = '#' + token;

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'tag-chip-input-chip-remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Remove ' + token);
    removeBtn.addEventListener('click', function () {
      removeChip(container, chip, hidden);
      textInput.focus();
    });

    chip.appendChild(removeBtn);
    container.insertBefore(chip, textInput);
    syncHidden(container, hidden);
  }

  function removeChip(container, chip, hidden) {
    chip.parentNode.removeChild(chip);
    syncHidden(container, hidden);
    // The line spoke of the last chip added; once chips change it is stale.
    if (container.foldNote) container.foldNote.clear();
  }

  function fetchSuggestions(query, dropdown, container, textInput, hidden) {
    var url = '/tags/suggest?q=' + encodeURIComponent(query)
      + (container.hasAttribute('data-tag-entry') ? '&entry=1' : '');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.onload = function () {
      if (xhr.status !== 200) {
        hideDropdown(dropdown);
        return;
      }
      try {
        var results = JSON.parse(xhr.responseText);
        renderDropdown(dropdown, results, container, textInput, hidden);
      } catch (e) {
        hideDropdown(dropdown);
      }
    };
    xhr.onerror = function () { hideDropdown(dropdown); };
    xhr.send();
  }

  function renderDropdown(dropdown, results, container, textInput, hidden) {
    dropdown.innerHTML = '';
    if (!results || results.length === 0) {
      hideDropdown(dropdown);
      return;
    }

    // Filter out tags already added
    var existing = new Set();
    var chips = container.querySelectorAll('.tag-chip-input-chip');
    for (var i = 0; i < chips.length; i++) {
      existing.add('#' + chips[i].getAttribute('data-tag'));
    }

    var shown = 0;
    for (var j = 0; j < results.length && shown < MAX_RESULTS; j++) {
      if (existing.has(results[j].normalized)) continue;

      var li = document.createElement('li');
      li.className = 'tag-chip-autocomplete-item';
      li.setAttribute('role', 'option');
      li.setAttribute('data-normalized', results[j].normalized);
      li.textContent = results[j].display;
      if (results[j].usageCount > 0) {
        var count = document.createElement('span');
        count.className = 'tag-chip-autocomplete-count';
        count.textContent = ' (' + results[j].usageCount + ')';
        li.appendChild(count);
      }

      (function (token) {
        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
          var clean = token.replace(/^#/, '');
          commitTag(container, textInput, hidden, clean);
          textInput.focus();
        });
      })(results[j].normalized);

      dropdown.appendChild(li);
      shown++;
    }

    if (shown > 0) {
      dropdown.style.display = 'block';
    } else {
      hideDropdown(dropdown);
    }
  }

  function hideDropdown(dropdown) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }

  function focusDropdownItem(dropdown, direction) {
    var items = dropdown.querySelectorAll('.tag-chip-autocomplete-item');
    if (items.length === 0) return;

    var current = dropdown.querySelector('.tag-chip-autocomplete-item--active');
    var idx = -1;
    if (current) {
      current.classList.remove('tag-chip-autocomplete-item--active');
      for (var i = 0; i < items.length; i++) {
        if (items[i] === current) { idx = i; break; }
      }
    }

    idx += direction;
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;

    items[idx].classList.add('tag-chip-autocomplete-item--active');
    items[idx].scrollIntoView({ block: 'nearest' });

    // Enter on focused item selects it
    var input = dropdown.parentNode.querySelector('.tag-chip-input-field');
    if (input) {
      input.onkeydown = null;
      input.addEventListener('keydown', function handler(e) {
        if (e.key === 'Enter') {
          var active = dropdown.querySelector('.tag-chip-autocomplete-item--active');
          if (active) {
            e.preventDefault();
            active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            input.removeEventListener('keydown', handler);
          }
        }
      });
    }
  }
})();
