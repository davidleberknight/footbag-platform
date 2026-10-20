/**
 * Admin curator video upload — live status page.
 *
 * Opens an EventSource on the per-job /events SSE endpoint and updates the
 * server-rendered status section as state events arrive. Without JS the page
 * still works on first paint; refresh to re-poll. With JS, no polling — every
 * update is push-driven from the worker via web's /ipc/job-events bus.
 *
 * In-progress states are redrawn here as plain status lines. A terminal state
 * (succeeded, failed, abandoned) is an outcome, and outcomes are drawn only by
 * the server's shared notice, so the script reloads the page for it instead of
 * writing a second copy of that markup. A page that arrives already terminal
 * has nothing left to wait for and opens no stream, which also keeps the reload
 * from looping.
 */
(function () {
  'use strict';

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function setSectionState(section, state, errorMessage) {
    section.dataset.state = state || '';
    var html = '';
    if (state === 'pending_upload') {
      html = '<p>Waiting for the browser to finish uploading source bytes to S3.</p>';
    } else if (state === 'pending_transcode') {
      html = '<p>Upload complete. Waiting for the worker to start transcoding.</p>';
    } else if (state === 'processing') {
      html = '<p>Transcoding now. This usually takes one to three minutes for a typical curator clip.</p>';
    } else if (state === 'retrying') {
      var retryPart = errorMessage ? ': ' + escapeHtml(errorMessage) : '';
      html = '<p>Transcode hit a temporary error' + retryPart + '. Retrying now.</p>';
    }
    if (html) section.innerHTML = html;
  }

  function isTerminal(state) {
    return state === 'succeeded' || state === 'failed' || state === 'abandoned';
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
    if (isTerminal(section.dataset.state)) return;
    var url = hint.getAttribute('data-events-url');
    if (!url || typeof EventSource === 'undefined') return;

    var src = new EventSource(url, { withCredentials: true });
    src.addEventListener('state', function (ev) {
      var data = null;
      try { data = JSON.parse(ev.data); } catch (e) { return; }
      if (!data || typeof data.state !== 'string') return;
      if (isTerminal(data.state)) {
        // Close first: EventSource reconnects on its own unless the client
        // closes it, and the reloaded page draws the outcome.
        src.close();
        window.location.reload();
        return;
      }
      setSectionState(section, data.state, data.errorMessage);
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
