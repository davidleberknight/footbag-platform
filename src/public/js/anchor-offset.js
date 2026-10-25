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
 * The header can also grow after the browser has jumped to a section address,
 * most often when the webfont arrives with wider letters than the fallback and
 * the nav wraps onto another row. The browser keeps the target where it was,
 * so the grown header covers it; this lands the target again, unless the
 * reader has already moved the page themselves.
 *
 * Without this script the stylesheet's per-width fallback values apply.
 */
(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;

  // The gap left between the header's bottom edge and the target.
  var GAP_PX = 8;
  var lastHeight = 0;
  var readerMoved = false;

  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (type) {
    window.addEventListener(type, function () { readerMoved = true; }, { once: true, passive: true });
  });

  function relandTarget() {
    if (readerMoved || !location.hash) return;
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
  }

  function update() {
    var height = Math.ceil(header.getBoundingClientRect().height);
    if (height === lastHeight) return;
    var grew = lastHeight > 0;
    lastHeight = height;
    document.documentElement.style.setProperty('--anchor-offset', (height + GAP_PX) + 'px');
    if (grew) relandTarget();
  }

  update();
  if ('ResizeObserver' in window) {
    new ResizeObserver(update).observe(header);
  } else {
    window.addEventListener('resize', update);
  }
})();
