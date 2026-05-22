(function () {
  'use strict';

  function init() {
    var form = document.getElementById('logout-bridge-form');
    if (!form) return;
    form.submit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
