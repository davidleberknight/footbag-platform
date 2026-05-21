// Video facade: click-to-play with a single-active-player invariant.
// On activation we replace the facade anchor with a YouTube/Vimeo iframe
// or a native <video>. Activating any other facade tears down the prior
// player first, so the page never holds more than one live decoder or
// embed iframe -- the resource ceiling that triggers tab freezes when
// galleries accumulate players.
//
// Progressive enhancement: every facade is a real <a href="..."> in the
// template, so without JS, click opens the platform watch page (or the
// raw .mp4 for s3) in a new tab. Modified clicks (cmd/ctrl/shift/alt,
// non-primary buttons) fall through to the anchor here too.
(function () {
  'use strict';

  // At most one player is active per page.
  //   host    : the live <iframe> or <video>
  //   restore : the original facade anchor, detached, ready to swap back
  var active = null;

  function buildIframe(src, title) {
    var iframe = document.createElement('iframe');
    iframe.setAttribute('src', src);
    iframe.setAttribute('title', title || 'Video player');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.className = 'video-facade-iframe';
    return iframe;
  }

  function buildVideo(src) {
    var video = document.createElement('video');
    video.setAttribute('src', src);
    video.setAttribute('controls', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('preload', 'metadata');
    video.className = 'video-facade-video';
    return video;
  }

  function teardown() {
    if (!active) return;
    var node = active.host;
    var restore = active.restore;
    try {
      if (node.tagName === 'VIDEO') {
        // Release the decoder synchronously rather than waiting for GC.
        try { node.pause(); } catch (e) {}
        node.removeAttribute('src');
        try { node.load(); } catch (e) {}
      } else if (node.tagName === 'IFRAME') {
        // about:blank forces YouTube/Vimeo to release their player
        // resources; bare removal leaves them lingering and is a known
        // memory-leak path for embedded players.
        try { node.setAttribute('src', 'about:blank'); } catch (e) {}
      }
    } finally {
      if (node.parentNode) node.replaceWith(restore);
      active = null;
    }
  }

  function activate(facade) {
    var platform = facade.getAttribute('data-platform') || 'youtube';
    var label    = facade.getAttribute('aria-label') || 'Video player';
    var embedUrl = facade.getAttribute('data-embed-url');
    var ytId     = facade.getAttribute('data-youtube-id');
    var videoSrc = facade.getAttribute('data-video-src');

    var replacement;
    if (platform === 'youtube') {
      var ytSrc = embedUrl
        || (ytId ? 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(ytId) + '?rel=0' : null);
      if (!ytSrc) return;
      if (ytSrc.indexOf('autoplay=') === -1) {
        ytSrc += (ytSrc.indexOf('?') === -1 ? '?' : '&') + 'autoplay=1';
      }
      replacement = buildIframe(ytSrc, label);
    } else if (platform === 'vimeo') {
      if (!embedUrl) return;
      var vimeoSrc = embedUrl;
      if (vimeoSrc.indexOf('autoplay=') === -1) {
        vimeoSrc += (vimeoSrc.indexOf('?') === -1 ? '?' : '&') + 'autoplay=1';
      }
      replacement = buildIframe(vimeoSrc, label);
    } else if (platform === 's3') {
      if (!videoSrc) return;
      replacement = buildVideo(videoSrc);
    } else {
      return;
    }

    teardown();
    active = { host: replacement, restore: facade };
    facade.replaceWith(replacement);
    try { replacement.focus(); } catch (e) {}
  }

  function onClick(e) {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    // Modified clicks open-in-new-tab / save-link; let the anchor work.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target;
    while (t && t.nodeType === 1 && !(t.classList && t.classList.contains('video-facade'))) {
      t = t.parentNode;
    }
    if (!t || t.nodeType !== 1) return;
    e.preventDefault();
    activate(t);
  }

  document.addEventListener('click', onClick);
  // Free decoder/iframe resources when the user navigates away. pagehide
  // is the bfcache-friendly counterpart to unload; both fire reliably.
  window.addEventListener('pagehide', teardown);
})();
