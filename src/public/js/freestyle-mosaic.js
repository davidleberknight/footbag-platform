// Freestyle foundations mosaic: click-to-play, never autoplay. Each cell rests
// on its poster; clicking a cell toggles play/pause for that cell only, and
// starting one cell pauses any other that was playing, so the page never runs
// twelve video decoders at once. The video keeps loop/muted/playsinline, so a
// started cell loops silently until clicked again.
//
// Progressive enhancement: without JS the cells simply rest on their posters
// (no autoplay in the markup), so the page is calm and functional regardless.
(function () {
  'use strict';

  var toggles = document.querySelectorAll('.tricks-mosaic-toggle');
  if (!toggles.length) return;

  function rest(btn) {
    var video = btn.querySelector('video');
    if (video && !video.paused) video.pause();
    btn.classList.remove('is-playing');
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Play ' + btn.getAttribute('data-trick'));
  }

  function start(btn) {
    // Single active cell: pause every other cell before this one plays.
    for (var i = 0; i < toggles.length; i++) {
      if (toggles[i] !== btn) rest(toggles[i]);
    }
    var video = btn.querySelector('video');
    if (!video) return;
    var played = video.play();
    if (played && typeof played.catch === 'function') {
      played.catch(function () { rest(btn); });
    }
    btn.classList.add('is-playing');
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', 'Pause ' + btn.getAttribute('data-trick'));
  }

  for (var j = 0; j < toggles.length; j++) {
    toggles[j].addEventListener('click', function () {
      var video = this.querySelector('video');
      if (video && video.paused) {
        start(this);
      } else {
        rest(this);
      }
    });
  }
})();
