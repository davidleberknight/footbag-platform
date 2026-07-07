/**
 * Glossary deep-link opener (progressive enhancement).
 *
 * The glossary presents its content as independently collapsible chapters
 * (<details> elements). Content inside a closed <details> is not rendered, so a
 * deep link or in-page anchor to an id inside a collapsed chapter would land on
 * hidden content. When the URL carries a fragment, this opens every <details>
 * ancestor of the target and scrolls to it, on load and whenever the fragment
 * changes. The page works without this script; it only prevents a linked target
 * being left hidden.
 *
 * Scoped to the glossary page via the .glossary-page guard, and inert elsewhere.
 */
(function () {
  if (!document.querySelector('.glossary-page')) return;

  function revealTarget() {
    var hash = window.location.hash;
    if (!hash || hash.length < 2) return;

    var target;
    try {
      target = document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch (e) {
      return;
    }
    if (!target) return;

    var node = target.closest ? target.closest('details') : null;
    while (node) {
      node.open = true;
      var parent = node.parentNode;
      node = parent && parent.closest ? parent.closest('details') : null;
    }

    target.scrollIntoView();
  }

  window.addEventListener('DOMContentLoaded', revealTarget);
  window.addEventListener('hashchange', revealTarget);
})();
