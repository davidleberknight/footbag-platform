/**
 * Collapsed-region deep-link opener (progressive enhancement).
 *
 * Freestyle Concepts presents its content as independently collapsible chapters
 * (<details> elements), and the Trick Dictionary folds "Reading the Dictionary"
 * into one such disclosure. Content inside a closed <details> is not rendered, so a
 * deep link or in-page anchor to an id inside a collapsed chapter would land on
 * hidden content. When the URL carries a fragment, this opens every <details>
 * ancestor of the target and scrolls to it, on load and whenever the fragment
 * changes. The page works without this script; it only prevents a linked target
 * being left hidden.
 *
 * On the no-JS path, accepted deliberately: revealing a collapsed target cannot be
 * done on the server, because a URL fragment is never sent to it, so the server
 * cannot know which chapter to open. Browsers increasingly close the gap on their
 * own — the HTML specification has them expand a closed <details> when navigation
 * targets something inside it — so this script is a fallback for engines that have
 * not shipped that behaviour rather than the only thing standing between a visitor
 * and the content. Every chapter remains reachable without it by opening the
 * chapter directly; only the deep-linked jump degrades.
 *
 * Scoped to the Concepts / Glossary pages (the .glossary-page guard) and to any
 * page carrying the Reading the Dictionary disclosure; inert elsewhere.
 */
(function () {
  if (!document.querySelector('.glossary-page, #reading-the-dictionary')) return;

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
