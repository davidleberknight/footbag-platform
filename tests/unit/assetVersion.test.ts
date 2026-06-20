/**
 * Static-asset fingerprinting: `assetUrl` appends a content-hash `?v=` token so a
 * changed file emits a new immutable URL (self-cache-busting on deploy).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { assetUrl, clearAssetVersionCache } from '../../src/lib/assetVersion';

beforeEach(() => clearAssetVersionCache());

function expectedHash(rel: string): string {
  const bytes = readFileSync(path.join(process.cwd(), 'src', 'public', rel));
  return createHash('sha256').update(bytes).digest('hex').slice(0, 10);
}

describe('assetUrl', () => {
  it('appends a content-hash version token to a real asset', () => {
    expect(assetUrl('css/style.css')).toBe(`/css/style.css?v=${expectedHash('css/style.css')}`);
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
});
