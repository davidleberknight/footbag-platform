/**
 * Admin curator video upload — direct-to-S3 with progress.
 *
 * Three-step flow (DD §6.8):
 *   1. POST /admin/curator/upload/sign  -> presigned PUT URLs + jobId
 *   2. PUT video and poster directly to S3 (XHR to capture progress)
 *   3. POST /admin/curator/upload/finalize  -> redirect to status page
 *
 * Photo and url-reference uploads use the existing multipart form path
 * unchanged. This script intercepts the form submit only when mediaType=video.
 *
 * Loaded via <script src> (CSP allows 'self'); no inline event handlers.
 */
(function () {
  'use strict';

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function readableSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind || 'info';
  }

  async function fetchJson(url, body) {
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    var text = await res.text();
    var data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    if (!res.ok) {
      var msg = (data && data.error) || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  function putWithProgress(url, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type);
      if (xhr.upload && onProgress) {
        xhr.upload.addEventListener('progress', function (ev) {
          if (ev.lengthComputable) onProgress(ev.loaded, ev.total);
        });
      }
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error('S3 PUT failed: HTTP ' + xhr.status));
      };
      xhr.onerror = function () { reject(new Error('S3 PUT network error')); };
      xhr.send(file);
    });
  }

  function init() {
    var form = $('form[data-async-curator-upload]');
    if (!form) return;
    var statusEl = $('[data-async-status]', form);
    var progressEl = $('[data-async-progress]', form);
    var submitBtn = $('button[type="submit"]', form);

    form.addEventListener('submit', async function (event) {
      var mediaTypeInput = form.querySelector('input[name="mediaType"]:checked');
      var mediaType = mediaTypeInput ? mediaTypeInput.value : '';
      if (mediaType !== 'video') {
        // Photo and url_reference paths still use the legacy multipart submit.
        return;
      }
      event.preventDefault();

      var videoInput = form.querySelector('input[name="mediaFile"]');
      var posterInput = form.querySelector('input[name="poster"]');
      var captionInput = form.querySelector('input[name="caption"]');
      var tagsInput = form.querySelector('input[name="tags"]');

      var videoFile = videoInput && videoInput.files && videoInput.files[0];
      var posterFile = posterInput && posterInput.files && posterInput.files[0];

      if (!videoFile) {
        setStatus(statusEl, 'Pick a video file before uploading.', 'error');
        return;
      }
      if (!posterFile) {
        setStatus(statusEl, 'Pick a poster image before uploading.', 'error');
        return;
      }

      submitBtn && (submitBtn.disabled = true);
      setStatus(statusEl, 'Requesting upload URLs…', 'info');
      if (progressEl) progressEl.value = 0;

      try {
        var sign = await fetchJson('/admin/curator/upload/sign', {
          videoFilename: videoFile.name,
          videoContentType: videoFile.type,
          videoSizeBytes: videoFile.size,
          posterContentType: posterFile.type,
          posterSizeBytes: posterFile.size,
          caption: captionInput ? captionInput.value : '',
          tags: tagsInput ? tagsInput.value : '',
        });

        setStatus(statusEl, 'Uploading video (' + readableSize(videoFile.size) + ')…', 'info');
        var videoLoaded = 0;
        var posterLoaded = 0;
        var totalBytes = videoFile.size + posterFile.size;
        function refreshProgress() {
          if (!progressEl) return;
          progressEl.max = totalBytes;
          progressEl.value = videoLoaded + posterLoaded;
        }

        await Promise.all([
          putWithProgress(sign.videoUrl, videoFile, function (loaded) {
            videoLoaded = loaded;
            refreshProgress();
          }),
          putWithProgress(sign.posterUrl, posterFile, function (loaded) {
            posterLoaded = loaded;
            refreshProgress();
          }),
        ]);

        setStatus(statusEl, 'Upload complete; queueing transcode…', 'info');
        var fin = await fetchJson('/admin/curator/upload/finalize', { jobId: sign.jobId });
        setStatus(statusEl, 'Transcode queued. Redirecting to status page…', 'success');
        window.location.assign(fin.statusUrl);
      } catch (err) {
        setStatus(statusEl, 'Upload failed: ' + (err && err.message ? err.message : String(err)), 'error');
        submitBtn && (submitBtn.disabled = false);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
