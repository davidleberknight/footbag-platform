/**
 * The Share Media form's enhancements. The form works without this script;
 * with it:
 *   - each chosen photo gets its own caption box (`caption_for:<place>`, its
 *     place in the selection from 0), replacing the one caption that otherwise
 *     serves them all;
 *   - a selection over the configured count, size per photo or total is
 *     refused in the browser with the same numbers the server holds to;
 *   - a gallery named in the form shows the address and hashtags it will be
 *     saved with as the name and hashtags are typed, folded by the site's one
 *     rule (fold-token.js), and the shown preview is recorded in the hidden
 *     `galleryPreview` field. The server saves only a preview it would make
 *     itself; any other, or none, brings the form back to confirm.
 */
(function () {
  'use strict';

  var form = document.querySelector('form[data-share-form]');
  var dataEl = document.getElementById('share-media-data');
  if (!form || !dataEl) return;
  var data;
  try {
    data = JSON.parse(dataEl.textContent || '{}');
  } catch (e) {
    return;
  }

  var MB = 1024 * 1024;
  var filesInput = form.querySelector('[data-share-files]');
  var sharedCaption = form.querySelector('[data-share-shared-caption]');
  var captionsBox = form.querySelector('[data-share-captions]');
  var nameInput = form.querySelector('[data-share-gallery-name]');
  var slugInput = form.querySelector('[data-share-gallery-slug]');
  var previewBox = form.querySelector('[data-share-preview]');
  var tokenInput = form.querySelector('[data-share-preview-token]');

  // ── Photos: per-file captions and the browser-side limits ──────────────
  function hint(text) {
    var p = document.createElement('p');
    p.className = 'form-hint';
    p.textContent = text;
    return p;
  }

  function limitRefusal(files) {
    if (files.length > data.maxFiles) return 'Choose at most ' + data.maxFiles + ' photos at a time.';
    var total = 0;
    for (var i = 0; i < files.length; i++) {
      if (files[i].size > data.fileBytes) {
        return files[i].name + ' is larger than ' + Math.floor(data.fileBytes / MB) + ' MB.';
      }
      total += files[i].size;
    }
    if (total > data.totalBytes) {
      return 'Those photos come to more than ' + Math.floor(data.totalBytes / MB) + ' MB together. Share them in smaller groups.';
    }
    return '';
  }

  function onFilesChosen() {
    var files = filesInput.files || [];
    filesInput.setCustomValidity(limitRefusal(files));
    filesInput.reportValidity();

    captionsBox.textContent = '';
    var sharedText = sharedCaption ? sharedCaption.querySelector('textarea') : null;
    if (files.length === 0) {
      if (sharedCaption) sharedCaption.hidden = false;
      if (sharedText) sharedText.disabled = false;
      return;
    }
    // One box per photo replaces the shared one, which then sends nothing.
    if (sharedCaption) sharedCaption.hidden = true;
    if (sharedText) sharedText.disabled = true;
    for (var i = 0; i < files.length; i++) {
      var field = document.createElement('div');
      field.className = 'form-field';
      var id = 'share-caption-' + i;
      var label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = 'Caption for ' + files[i].name + ' (optional, up to 500 characters):';
      var box = document.createElement('textarea');
      box.id = id;
      // Keyed by the photo's place in the selection, which is the order the
      // browser sends the files in and the server counts every part by, a
      // dropped one included. A file name cannot key it: a phone browser sends
      // every photo as image.jpg.
      box.name = 'caption_for:' + i;
      box.maxLength = 500;
      box.rows = 2;
      if (sharedText && sharedText.value) box.value = sharedText.value;
      field.appendChild(label);
      field.appendChild(box);
      captionsBox.appendChild(field);
    }
  }

  if (filesInput && captionsBox) filesInput.addEventListener('change', onFilesChosen);

  // The photo limits hold only while Photos is the tab sent; a refusal left on
  // the hidden file input would otherwise block a video link's Share unseen.
  form.querySelectorAll('input[name="mediaType"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (!filesInput) return;
      if (!radio.checked) return;
      filesInput.setCustomValidity(radio.value === 'photo' ? limitRefusal(filesInput.files || []) : '');
    });
  });

  // ── Gallery preview ────────────────────────────────────────────────────
  var fold = window.footbagFold;

  // The hashtags as the submit will send them. With the chip field, the named
  // input holds only the finished chips; a hashtag still being typed sits in
  // the chip field's own text box until it becomes a chip, and the chip script
  // adds it on submit, split at each '#' and each folded into one lowercase
  // token the way it folds any chip, so it counts here in that same form. Text
  // the chip script would refuse (letters with no a to z form) is not sent, so
  // it does not count.
  function tagsText() {
    var field = form.querySelector('input[name="tags"]');
    var raw = field ? field.value : '';
    var typing = form.querySelector('.tag-chip-input-field');
    if (fold && typing) fold.splitHashtags(typing.value).forEach(function (piece) {
      var pending = piece.replace(/^#+/, '');
      if (fold.hasUnconvertible(pending)) return;
      var token = fold.slugify(pending);
      if (token) raw += ' #' + token;
    });
    return raw.trim();
  }

  // The hashtags by the site's one rule: each '#' starts one, and words typed
  // without one stay one hashtag.
  function typedTags() {
    var raw = tagsText();
    var seen = {};
    var out = [];
    fold.splitHashtags(raw).forEach(function (t) {
      if (!t) return;
      var tag = fold.typedTagForDisplay(t);
      var key = tag.toLowerCase();
      if (!tag || seen[key]) return;
      seen[key] = true;
      out.push(tag);
    });
    return out;
  }

  // The address is the page's prefix (a member's `gallery_<slug>_`, the
  // curator's `gallery_`) and the name, or the curator's Advanced address,
  // folded by the one rule.
  function galleryId(source, attempt) {
    var slug = fold.slugify(source).slice(0, 60).replace(/_+$/, '');
    if (!slug) return '';
    return data.galleryIdPrefix + slug + (attempt > 0 ? '_' + (attempt + 1) : '');
  }

  // An empty preview takes no room, so the form's spacing holds until there is
  // something to show.
  function render(lines) {
    previewBox.textContent = '';
    lines.forEach(function (line) { previewBox.appendChild(hint(line)); });
    previewBox.hidden = lines.length === 0;
  }

  // The server knows every gallery address, this script only the member's own.
  // A preview the server rendered (the confirm round) is the one to send, so it
  // is left alone until the name or the hashtags change.
  var serverToken = tokenInput ? tokenInput.value : '';
  var serverInputs = serverToken ? currentInputs() : '';
  function currentInputs() {
    return (nameInput ? nameInput.value.trim() : '') + '\n' + tagsText()
      + '\n' + (slugInput ? slugInput.value.trim() : '');
  }

  function updatePreview() {
    if (!nameInput || !previewBox || !tokenInput || !fold || !fold.isLoaded()) return;
    if (serverToken && currentInputs() === serverInputs) return;
    serverToken = '';
    var name = nameInput.value.trim();
    tokenInput.value = '';
    if (!name) {
      render([]);
      return;
    }
    // A name (or Advanced address) with letters that have no a to z form, or
    // of symbols only, makes no address; the server refuses it with the same
    // sentence.
    var typedSlug = slugInput ? slugInput.value.trim() : '';
    var source = typedSlug || name;
    var id = fold.hasUnconvertible(source) ? '' : galleryId(source, 0);
    if (!id) {
      render([typedSlug
        ? "A gallery's address needs a word in the letters a to z."
        : "A gallery's address is made from its name, so the name needs a word in the letters a to z."]);
      return;
    }
    // The Personal Gallery's own address is left for the server to refuse.
    if (data.personalGalleryId && id === data.personalGalleryId) {
      render([]);
      return;
    }
    // A member's address already taken takes the next `_2`; the curator's is
    // refused. The server knows every gallery and settles the rest.
    if (data.takenRefused && data.takenIds.indexOf(id) !== -1) {
      render(['Another gallery already has the address /media/' + id + '. Choose another name, or another address under Advanced.']);
      return;
    }
    var attempt = 0;
    while (!data.takenRefused && data.takenIds.indexOf(id) !== -1 && attempt < 100) {
      attempt += 1;
      id = galleryId(source, attempt);
    }
    var tags = typedTags();
    var madeFromName = tags.length === 0;
    if (madeFromName) tags = [fold.typedTagForDisplay(name)];
    // The automatic hashtag (`#by_<slug>` or `#curated`) leads, as the server's preview has it.
    var all = [data.automaticTag].concat(tags);
    render([
      'Its hashtags: ' + all.join(' ') + (madeFromName ? ' (made from the name, because no hashtags are given above)' : ''),
      'Its address: /media/' + id + ' (it stays the same if you rename the gallery)',
    ]);
    tokenInput.value = [id].concat(all).join(' ');
  }

  // The hashtags field may be a chip field whose value changes without an
  // input event of its own, so any edit in the form refreshes the preview.
  function schedule() { setTimeout(updatePreview, 0); }
  if (fold && nameInput) {
    fold.ready.then(function () {
      form.addEventListener('input', schedule);
      form.addEventListener('click', schedule);
      form.addEventListener('keyup', schedule);
      updatePreview();
    });
  }
})();
