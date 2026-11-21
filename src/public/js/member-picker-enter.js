// A member picker's search box belongs to its host form, whose first submit
// button may be another control, so Enter in the box would press that one.
// In the box Enter means search: this presses the picker's own Search button.
// Without JavaScript the Search button still searches.
(function () {
  var inputs = document.querySelectorAll('[data-member-picker-q]');
  Array.prototype.forEach.call(inputs, function (input) {
    var box = input.closest('.search-box-form');
    var button = box && box.querySelector('[data-member-picker-search]');
    if (!button) return;
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      button.click();
    });
  });
})();
