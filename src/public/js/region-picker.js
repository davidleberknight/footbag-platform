(function () {
  'use strict';
  // The server draws the state, province or territory select with the chosen
  // country's entries only, and hides it when there are none, so the form works
  // without this script. Every entry also sits, inert, in a <template> beside
  // the select. When the member changes the country, this copies that country's
  // entries into the select, keeps the pick if it belongs to the new country,
  // shows or hides the field, marks it required where the country requires a
  // pick, and moves focus to it. On load it changes nothing: the server already
  // drew the right state, so nothing on the page moves.
  var region = document.querySelector('[data-region-picker]');
  var country = document.querySelector('[data-country-picker]');
  if (!region || !country) return;
  var field = region.closest('[data-region-field]');
  var template = field && field.querySelector('template[data-region-options]');
  if (!field || !template) return;
  var entries = Array.prototype.slice.call(template.content.querySelectorAll('option'));
  var placeholder = region.options[0];

  function sync() {
    var chosen = country.value.trim().toLowerCase();
    var kept = region.value;
    while (region.options.length > 1) region.remove(1);
    var mine = entries.filter(function (opt) {
      return chosen !== '' && opt.getAttribute('data-country').toLowerCase() === chosen;
    });
    mine.forEach(function (opt) { region.appendChild(opt.cloneNode(true)); });
    region.value = kept;
    if (region.selectedIndex === -1) region.selectedIndex = 0;
    region.required = mine.length > 0 && mine[0].hasAttribute('data-required');
    var wasHidden = field.hidden;
    field.hidden = mine.length === 0;
    if (wasHidden && !field.hidden) region.focus();
    placeholder.selected = region.selectedIndex === 0;
  }

  country.addEventListener('change', sync);
})();
