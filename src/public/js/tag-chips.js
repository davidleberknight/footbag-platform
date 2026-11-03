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
  // the tag is kept as typed, its spaces made underscores as the rule makes
  // them, and the server folds the rest on save, so a chip never shows a token
  // the server would store differently.
  function canFold() {
    return !!(window.footbagFold && window.footbagFold.isLoaded());
  }
  function tagBody(raw) {
    var stripped = String(raw).trim().replace(/^#+/, '');
    return canFold() ? window.footbagFold.slugify(stripped) : stripped.replace(/\s+/g, '_');
  }

  // The hashtags in a text, by the site's one rule (fold-token.js): what was
  // typed until it is committed is one hashtag, and each '#' starts a new one.
  // The rule needs no letter table, so it holds before the table arrives.
  function splitHashtags(text) {
    return window.footbagFold.splitHashtags(text);
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

    // Keyboard events on the text input. Enter and Tab commit what is in the
    // box; a space is part of the hashtag being typed and commits nothing.
    textInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (splitHashtags(textInput.value).length > 0) {
          var left = commitText(container, textInput, hidden, textInput.value);
          textInput.value = left;
          // Tab still leaves a box holding a refused hashtag, so it never traps focus.
          if (e.key === 'Enter' || left === '') e.preventDefault();
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
      // A '#' typed after other text ends that hashtag: the text before it
      // becomes a chip at once and the box keeps the '#', ready for the next.
      // A pasted list becomes chips the same way, its last hashtag left in the box.
      var typed = textInput.value;
      var at = typed.lastIndexOf('#');
      if (at > 0 && typed.slice(0, at).trim().length > 0) {
        var kept = commitText(container, textInput, hidden, typed.slice(0, at));
        textInput.value = (kept ? kept + ' ' : '') + typed.slice(at);
      }
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

    // Flush any uncommitted text into chips when the form submits, so a tag
    // typed but not yet turned into a chip (e.g. typed then "Browse" clicked
    // without pressing Enter) is still included in the submitted value.
    var form = original.closest('form');
    if (form) {
      form.addEventListener('submit', function () {
        textInput.value = commitText(container, textInput, hidden, textInput.value);
      });
    }
  }

  function parseTokens(value) {
    return splitHashtags(value);
  }

  // Commits every hashtag in the text as a chip and returns the ones that could
  // not be added (letters with no a to z form, the chip limit reached), for the
  // box to keep so the member can change them.
  function commitText(container, textInput, hidden, text) {
    var pieces = splitHashtags(text);
    var left = [];
    for (var i = 0; i < pieces.length; i++) {
      if (!commitTag(container, textInput, hidden, pieces[i])) left.push(pieces[i]);
    }
    return left.join(' ');
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

  // Adds one hashtag as a chip; true when the field now carries it.
  function commitTag(container, textInput, hidden, typed) {
    // A hashtag with letters the rule cannot convert is refused, as the server
    // refuses it: no chip, the text stays for the member to change, and the line
    // under the field says why.
    var asTyped = String(typed).trim().replace(/^#+/, '');
    if (canFold() && window.footbagFold.hasUnconvertible(asTyped)) {
      if (container.foldNote) container.foldNote.set('#' + asTyped + ' cannot be used: a hashtag needs letters a to z or digits, and these letters have no a to z form.');
      return false;
    }

    // Folded by the site's one rule, the form the server stores.
    var token = tagBody(typed);
    if (token.length === 0) return false;

    var existing = container.querySelectorAll('.tag-chip-input-chip');
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].getAttribute('data-tag') === token) {
        textInput.value = '';
        return true;
      }
    }
    if (existing.length >= MAX_CHIPS) {
      if (container.foldNote) container.foldNote.set('At most ' + MAX_CHIPS + ' hashtags can be added at once.');
      return false;
    }

    var chip = addChip(container, textInput, hidden, token);
    showFoldNote(container, typed, token);
    textInput.value = '';
    hideDropdown(container.querySelector('.tag-chip-autocomplete'));
    if (container.hasAttribute('data-tag-entry')) offerStandardTag(container, textInput, hidden, token, chip);
    return true;
  }

  // A freeform hashtag whose words match a public event's or club's name gets
  // a one-click swap for that event's or club's standard hashtag. It only
  // offers: the typed hashtag stays unless the member presses Use It.
  function offerStandardTag(container, textInput, hidden, token, chip) {
    if (/^(event|club|player|by|set|concept)_/.test(token)) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/tags/suggest?didYouMean=' + encodeURIComponent(token));
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      // An answer arriving after its chip was removed offers nothing: the
      // member no longer has the hashtag it would swap.
      if (!container.contains(chip)) return;
      var hit;
      try { hit = JSON.parse(xhr.responseText)[0]; } catch (e) { return; }
      if (!hit || !hit.normalized) return;
      var box = document.createElement('p');
      box.className = 'form-hint';
      box.setAttribute('data-did-you-mean', token);
      box.appendChild(document.createTextNode('Did you mean ' + hit.display + ' (' + hit.name + ')? '));
      var use = document.createElement('button');
      use.type = 'button';
      use.className = 'btn btn-outline btn-sm';
      use.textContent = 'Use It';
      use.addEventListener('click', function () {
        var chips = container.querySelectorAll('.tag-chip-input-chip');
        for (var i = 0; i < chips.length; i++) {
          if (chips[i].getAttribute('data-tag') === token) removeChip(container, chips[i], hidden);
        }
        commitTag(container, textInput, hidden, hit.normalized);
        if (box.parentNode) box.parentNode.removeChild(box);
      });
      box.appendChild(use);
      container.parentNode.insertBefore(box, container.nextSibling);
    };
    xhr.send();
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
    return chip;
  }

  function removeChip(container, chip, hidden) {
    // An offer to swap this hashtag goes with it.
    var offer = container.parentNode.querySelector('[data-did-you-mean="' + chip.getAttribute('data-tag') + '"]');
    if (offer) offer.parentNode.removeChild(offer);
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
      // An event's or club's hashtag found by a word of its name says which one.
      if (results[j].kind === 'event' || results[j].kind === 'club') {
        var kind = document.createElement('span');
        kind.className = 'tag-chip-autocomplete-count';
        kind.textContent = (results[j].kind === 'event' ? 'Event: ' : 'Club: ') + results[j].name + ' ';
        li.appendChild(kind);
        li.appendChild(document.createTextNode(results[j].display));
      } else {
        li.textContent = results[j].display;
      }
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
