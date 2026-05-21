/**
 * Unit tests for the click-to-play video facade enhancement at
 * src/public/js/video-facade.js.
 *
 * The bug the single-active-player invariant prevents:
 *   Each click on a `.video-facade` mounted a new <iframe>/<video> and
 *   left earlier activations playing on the same page. Galleries with
 *   several tiles could accumulate enough live decoders and embed
 *   iframes to freeze or crash the tab. These tests prove that
 *   activating one facade tears down any prior player and restores its
 *   original anchor.
 *
 * happy-dom does not run inside an actual browser, but the file under
 * test only manipulates DOM nodes and event listeners; the invariants
 * we care about (which elements live in document.body at any moment)
 * are fully observable in this realm.
 */
// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "navigation": { "disableChildFrameNavigation": true, "disableMainFrameNavigation": true } } }
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../src/public/js/video-facade.js',
);

beforeAll(() => {
  // The script is a vanilla browser IIFE; evaluate it once so its
  // document-level click listener and window-level pagehide listener
  // attach to the happy-dom globals.
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src)();
});

beforeEach(() => {
  document.body.innerHTML = '';
});

function makeFacade(opts: {
  id: string;
  platform: 'youtube' | 'vimeo' | 's3';
  embedUrl?: string;
  videoSrc?: string;
  href?: string;
}): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'video-facade';
  a.id = opts.id;
  a.setAttribute('data-platform', opts.platform);
  if (opts.embedUrl) a.setAttribute('data-embed-url', opts.embedUrl);
  if (opts.videoSrc) a.setAttribute('data-video-src', opts.videoSrc);
  a.setAttribute('href', opts.href ?? `https://example.com/watch/${opts.id}`);
  a.setAttribute('aria-label', `Play video ${opts.id}`);
  document.body.appendChild(a);
  return a;
}

function activePlayers(): Element[] {
  return Array.from(
    document.querySelectorAll('.video-facade-iframe, .video-facade-video'),
  );
}

describe('video-facade (click-to-play)', () => {
  it('clicking a YouTube facade mounts one iframe in its place', () => {
    const f = makeFacade({
      id: 'f1',
      platform: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abc?rel=0',
    });
    f.click();
    const players = activePlayers();
    expect(players).toHaveLength(1);
    expect(players[0].tagName).toBe('IFRAME');
    expect(players[0].getAttribute('src')).toContain('autoplay=1');
    // Facade anchor is gone from the live DOM.
    expect(document.getElementById('f1')).toBeNull();
  });

  it('clicking an s3 facade mounts a native <video>', () => {
    const f = makeFacade({
      id: 'f1',
      platform: 's3',
      videoSrc: 'https://cdn.example.com/clip.mp4',
    });
    f.click();
    const players = activePlayers();
    expect(players).toHaveLength(1);
    expect(players[0].tagName).toBe('VIDEO');
    expect(players[0].getAttribute('src')).toBe(
      'https://cdn.example.com/clip.mp4',
    );
    expect(players[0].hasAttribute('autoplay')).toBe(true);
    expect(players[0].hasAttribute('controls')).toBe(true);
    expect(players[0].hasAttribute('playsinline')).toBe(true);
  });

  it('activating a second facade tears the first one down (single-active-player)', () => {
    const f1 = makeFacade({
      id: 'f1',
      platform: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/a',
    });
    const f2 = makeFacade({
      id: 'f2',
      platform: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/b',
    });

    f1.click();
    expect(activePlayers()).toHaveLength(1);
    expect(document.getElementById('f1')).toBeNull();
    expect(document.getElementById('f2')).not.toBeNull();

    f2.click();
    // The invariant: still exactly one live player.
    expect(activePlayers()).toHaveLength(1);
    // f1's facade has been restored in place of its iframe.
    expect(document.getElementById('f1')).not.toBeNull();
    expect(document.getElementById('f2')).toBeNull();
  });

  it('teardown of an s3 video calls pause() and clears its src', () => {
    const f1 = makeFacade({
      id: 'f1',
      platform: 's3',
      videoSrc: 'https://cdn.example.com/a.mp4',
    });
    const f2 = makeFacade({
      id: 'f2',
      platform: 's3',
      videoSrc: 'https://cdn.example.com/b.mp4',
    });

    f1.click();
    const v1 = activePlayers()[0] as HTMLVideoElement;
    expect(v1.tagName).toBe('VIDEO');

    let pauseCalls = 0;
    let loadCalls = 0;
    v1.pause = () => {
      pauseCalls += 1;
    };
    v1.load = () => {
      loadCalls += 1;
    };

    f2.click();

    expect(pauseCalls).toBe(1);
    expect(loadCalls).toBe(1);
    // src has been removed before the element was swapped out of the DOM.
    expect(v1.hasAttribute('src')).toBe(false);
  });

  it('teardown of an iframe rewrites its src to about:blank', () => {
    const f1 = makeFacade({
      id: 'f1',
      platform: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/a',
    });
    const f2 = makeFacade({
      id: 'f2',
      platform: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/b',
    });

    f1.click();
    const iframe1 = activePlayers()[0] as HTMLIFrameElement;
    expect(iframe1.tagName).toBe('IFRAME');

    f2.click();

    // The detached iframe should have been pointed at about:blank
    // before being swapped out.
    expect(iframe1.getAttribute('src')).toBe('about:blank');
  });

  it('modified clicks (cmd/ctrl/shift/alt) fall through to the anchor default', () => {
    const f = makeFacade({
      id: 'f1',
      platform: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abc',
    });
    const ev = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    });
    f.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(activePlayers()).toHaveLength(0);
    // Anchor is still in the DOM and unchanged.
    expect(document.getElementById('f1')).toBe(f);
  });

  it('non-primary mouse buttons fall through to the anchor default', () => {
    const f = makeFacade({
      id: 'f1',
      platform: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abc',
    });
    const ev = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 1, // middle-click = open in new tab
    });
    f.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(activePlayers()).toHaveLength(0);
  });

  it('pagehide tears the active player down and restores its facade', () => {
    const f = makeFacade({
      id: 'f1',
      platform: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abc',
    });
    f.click();
    expect(activePlayers()).toHaveLength(1);

    window.dispatchEvent(new Event('pagehide'));

    expect(activePlayers()).toHaveLength(0);
    expect(document.getElementById('f1')).not.toBeNull();
  });

  it('facades added to the DOM after script load are still wired (event delegation)', () => {
    // Simulates any future dynamic gallery load: the delegated listener
    // on document means we don't have to re-scan on DOM mutations.
    const f = makeFacade({
      id: 'late',
      platform: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/late',
    });
    f.click();
    expect(activePlayers()).toHaveLength(1);
  });

  it('an unknown platform is ignored (no player mounted, anchor preserved)', () => {
    const f = makeFacade({
      id: 'weird',
      platform: 'youtube',
    });
    f.setAttribute('data-platform', 'bogus');
    f.click();
    expect(activePlayers()).toHaveLength(0);
    expect(document.getElementById('weird')).toBe(f);
  });
});
