// On an edit page the player search belongs to the edit form, whose first
// submit button is Save, so Enter anywhere in that form saves. In the search
// box itself Enter means search: this presses the Search button instead.
// Without JavaScript, Enter there saves the item unchanged and the Search
// button still searches.
(function () {
  var input = document.getElementById('find-members-q');
  var button = document.querySelector('[data-member-search-submit]');
  if (!input || !button) return;
  input.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    button.click();
  });
})();
