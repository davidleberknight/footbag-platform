/**
 * Admin curator video upload — live status page.
 *
 * Opens an EventSource on the per-job /events SSE endpoint and updates the
 * server-rendered status section as state events arrive. Without JS the page
 * still works on first paint; refresh to re-poll. With JS, no polling — every
 * update is push-driven from the worker via web's /ipc/job-events bus.
 */
(function () {
  'use strict';

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function setSectionState(section, state, mediaId, errorMessage) {
    section.dataset.state = state || '';
    var html = '';
    if (state === 'pending_upload') {
      html = '<p>Waiting for the browser to finish uploading source bytes to S3.</p>';
    } else if (state === 'pending_transcode') {
      html = '<p>Upload complete. Waiting for the worker to start transcoding.</p>';
    } else if (state === 'processing') {
      html = '<p>Transcoding now. This usually takes one to three minutes for a typical curator clip.</p>';
    } else if (state === 'succeeded') {
      var link = mediaId
        ? ' <a href="/admin/curator/media/' + encodeURIComponent(mediaId) + '/edit">Open the new media item.</a>'
        : '';
      html =
        '<p class="form-success-banner" role="status">Transcode succeeded.' + link + '</p>';
    } else if (state === 'failed') {
      var msgPart = errorMessage ? ': ' + escapeHtml(errorMessage) : '';
      html =
        '<p class="form-error-banner" role="alert">Transcode failed' +
        msgPart +
        '. Re-upload the file to try again.</p>' +
        '<p><a href="/admin/curator/upload">Back to upload</a></p>';
    } else if (state === 'abandoned') {
      html =
        '<p class="form-error-banner" role="alert">The upload session expired before finalizing. Re-upload to try again.</p>' +
        '<p><a href="/admin/curator/upload">Back to upload</a></p>';
    }
    if (html) section.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function init() {
    var hint = $('[data-events-url]');
    var section = $('[data-job-status]');
    if (!hint || !section) return;
    var url = hint.getAttribute('data-events-url');
    if (!url || typeof EventSource === 'undefined') return;

    var src = new EventSource(url, { withCredentials: true });
    src.addEventListener('state', function (ev) {
      var data = null;
      try { data = JSON.parse(ev.data); } catch (e) { return; }
      if (!data || typeof data.state !== 'string') return;
      setSectionState(section, data.state, data.mediaId, data.errorMessage);
      if (data.state === 'succeeded' || data.state === 'failed' || data.state === 'abandoned') {
        // Terminal: stop reconnecting. EventSource auto-reconnects on close
        // unless we close from the client side.
        src.close();
      }
    });
    src.addEventListener('heartbeat', function () { /* keep connection warm */ });
    src.onerror = function () {
      // Browser will retry automatically by default; nothing to do here.
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
