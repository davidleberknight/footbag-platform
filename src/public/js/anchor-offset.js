/**
 * Deep-link clearance under the sticky site header (progressive enhancement).
 *
 * Every anchored target scrolls to --anchor-offset below the top of the
 * viewport, so the heading a reader followed a link to is not hidden behind
 * the sticky header. The header's height is not fixed: its nav links wrap onto
 * as many rows as the viewport and the link count need. This sets the offset
 * from the header's measured height, and again whenever that height changes,
 * so the clearance stays right however many links the nav carries.
 *
 * Without this script the stylesheet's per-width fallback values apply.
 */
(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;

  // The gap left between the header's bottom edge and the target.
  var GAP_PX = 8;

  function update() {
    var height = Math.ceil(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--anchor-offset', (height + GAP_PX) + 'px');
  }

  update();
  if ('ResizeObserver' in window) {
    new ResizeObserver(update).observe(header);
  } else {
    window.addEventListener('resize', update);
  }
})();
