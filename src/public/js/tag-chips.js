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

    // Container wraps chips + text input
    var container = document.createElement('div');
    container.className = 'tag-chip-input-container';
    container.setAttribute('role', 'listbox');

    // Text input for typing new tags
    var textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'tag-chip-input-field';
    textInput.placeholder = placeholder;
    textInput.setAttribute('autocomplete', 'off');
    textInput.setAttribute('aria-label', 'Add tag');

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

    var tokens = parseTokens(hidden.value);
    for (var t = 0; t < tokens.length; t++) {
      addChip(container, textInput, hidden, tokens[t]);
    }

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
  }

  function parseTokens(value) {
    return value.trim().split(/\s+/).filter(function (t) { return t.length > 0; });
  }

  function syncHidden(container, hidden) {
    var chips = container.querySelectorAll('.tag-chip-input-chip');
    var vals = [];
    for (var i = 0; i < chips.length; i++) {
      vals.push(chips[i].getAttribute('data-tag'));
    }
    hidden.value = vals.join(' ');
  }

  function commitTag(container, textInput, hidden, token) {
    token = token.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_|_$/g, '').replace(/__+/g, '_');
    if (token.length === 0) return;

    var existing = container.querySelectorAll('.tag-chip-input-chip');
    if (existing.length >= 30) return;
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].getAttribute('data-tag') === token) {
        textInput.value = '';
        return;
      }
    }

    addChip(container, textInput, hidden, token);
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
  }

  function fetchSuggestions(query, dropdown, container, textInput, hidden) {
    var url = '/tags/suggest?q=' + encodeURIComponent(query);
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
