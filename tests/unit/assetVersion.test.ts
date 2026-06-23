/**
 * Static-asset fingerprinting: `assetUrl` appends a content-hash `?v=` token so a
 * changed file emits a new immutable URL (self-cache-busting on deploy). The
 * stylesheet is special: its token is the hash of its rewritten bytes (each font
 * url() carries its own token), so changing a font busts the stylesheet URL too.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { assetUrl, renderStylesheet, clearAssetVersionCache } from '../../src/lib/assetVersion';

beforeEach(() => clearAssetVersionCache());

function expectedHash(rel: string): string {
  const bytes = readFileSync(path.join(process.cwd(), 'src', 'public', rel));
  return createHash('sha256').update(bytes).digest('hex').slice(0, 10);
}

describe('assetUrl', () => {
  it('appends a content-hash version token to a real asset', () => {
    expect(assetUrl('js/video-facade.js')).toBe(`/js/video-facade.js?v=${expectedHash('js/video-facade.js')}`);
  });

  it('strips a leading slash from the relative path', () => {
    expect(assetUrl('/js/video-facade.js')).toBe(`/js/video-facade.js?v=${expectedHash('js/video-facade.js')}`);
  });

  it('returns the bare path for a missing asset', () => {
    expect(assetUrl('css/does-not-exist.css')).toBe('/css/does-not-exist.css');
  });

  it('gives different files different hashes', () => {
    const css = assetUrl('css/style.css').split('?v=')[1];
    const js = assetUrl('js/video-facade.js').split('?v=')[1];
    expect(css).toBeTruthy();
    expect(js).toBeTruthy();
    expect(css).not.toBe(js);
  });

  it('tokens the stylesheet with the hash of its rewritten bytes, not the raw file', () => {
    expect(assetUrl('css/style.css')).toBe(`/css/style.css?v=${renderStylesheet().version}`);
    // Rewriting font url() to carry a ?v= token changes the bytes, so the
    // stylesheet token differs from the raw-file hash and a font change busts it.
    expect(renderStylesheet().version).not.toBe(expectedHash('css/style.css'));
  });
});

describe('renderStylesheet', () => {
  it('rewrites every font url() reference to carry a version token', () => {
    const { css } = renderStylesheet();
    for (const font of ['Inter-Regular', 'Inter-Medium', 'Inter-SemiBold', 'Inter-Bold']) {
      expect(css).toMatch(new RegExp(`url\\("/fonts/${font}\\.woff2\\?v=[0-9a-f]{10}"\\)`));
      expect(css).not.toContain(`url("/fonts/${font}.woff2")`);
    }
  });

  it('produces a ten-character hex version token', () => {
    expect(renderStylesheet().version).toMatch(/^[0-9a-f]{10}$/);
  });
});
