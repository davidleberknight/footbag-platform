// Video facade: replace a thumbnail placeholder with an inline player on click.
// Privacy- and performance-friendly: no third-party requests until the user
// opts in. Supports three platforms via the data-platform attribute on the
// facade element: youtube, vimeo, s3. The element should be an anchor so
// no-JS users still get a fallback navigation.
(function () {
  'use strict';

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

  function activate(facade) {
    var platform = facade.getAttribute('data-platform') || 'youtube';
    var label    = facade.getAttribute('aria-label') || 'Video player';
    var embedUrl = facade.getAttribute('data-embed-url');
    var ytId     = facade.getAttribute('data-youtube-id');
    var videoSrc = facade.getAttribute('data-video-src');

    var replacement;
    if (platform === 'youtube') {
      // Prefer an explicit data-embed-url when provided (gallery tiles); fall
      // back to constructing the URL from data-youtube-id (the home hero
      // facade uses the id-only attribute).
      var ytSrc = embedUrl
        || (ytId ? 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(ytId) + '?rel=0' : null);
      if (!ytSrc) return;
      // YouTube needs an explicit autoplay parameter even when the iframe
      // load is triggered by a user gesture. Append it if absent.
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

    facade.replaceWith(replacement);
  }

  function init() {
    var facades = document.querySelectorAll('.video-facade');
    for (var i = 0; i < facades.length; i++) {
      facades[i].addEventListener('click', function (e) {
        e.preventDefault();
        activate(this);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
