(function () {
  'use strict';
  var toggle = document.querySelector('[data-name-change-toggle]');
  var fields = document.querySelector('[data-name-change-fields]');
  if (!toggle || !fields) return;

  function update() {
    fields.style.display = toggle.checked ? '' : 'none';
  }

  toggle.addEventListener('change', update);
  if (!toggle.checked) fields.style.display = 'none';
})();
