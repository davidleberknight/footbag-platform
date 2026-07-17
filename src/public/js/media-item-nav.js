// Keyboard and touch navigation for the single-item media viewer. Reads the
// prev/next/back URLs the server already rendered as data attributes on
// .gallery-item-detail and follows them on Left/Right arrows, Escape, and
// horizontal swipe. Pure progressive enhancement: the visible pager links
// work without this script.
(function () {
  'use strict';

  var el = document.querySelector('.gallery-item-detail');
  if (!el) return;

  var prevHref = el.getAttribute('data-prev-href');
  var nextHref = el.getAttribute('data-next-href');
  var backHref = el.getAttribute('data-back-href');

  function go(url) {
    if (url) window.location.assign(url);
  }

  document.addEventListener('keydown', function (e) {
    // Never hijack keys while the visitor is typing in a field.
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    // While a clip is fullscreen, arrows and Escape belong to the player /
    // fullscreen exit, not to item navigation.
    if (document.fullscreenElement) return;
    if (e.key === 'ArrowLeft') go(prevHref);
    else if (e.key === 'ArrowRight') go(nextHref);
    else if (e.key === 'Escape') go(backHref);
  });

  // Fullscreen the masked wrapper (video plus correction mask together), never
  // the bare <video>, so the burnt-in caption stays covered in fullscreen.
  var fsBtn = document.querySelector('.caption-mask-fullscreen');
  if (fsBtn) {
    fsBtn.addEventListener('click', function () {
      var wrap = fsBtn.closest('.gallery-item-media--masked');
      if (!wrap) return;
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
      } else if (wrap.requestFullscreen) {
        wrap.requestFullscreen().catch(function () {});
      }
    });
  }

  // Horizontal swipe: drag left reveals the next item, drag right the previous.
  var startX = null;
  var startY = null;
  el.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { startX = null; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', function (e) {
    if (startX === null) return;
    var touch = e.changedTouches[0];
    var dx = touch.clientX - startX;
    var dy = touch.clientY - startY;
    startX = null;
    // Require a deliberate, mostly-horizontal gesture.
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) go(nextHref);
    else go(prevHref);
  }, { passive: true });
})();
