/**
 * Content-hash fingerprints for static assets under `src/public`, so each emitted
 * URL is `/<path>?v=<hash>` and changes only when the file's bytes change. Mirrors
 * the `?v={media_id}` versioning used for media URLs: paired with the immutable
 * Cache-Control set on versioned requests and the static-asset CloudFront cache
 * policy (query string in the cache key for every static-asset path), a changed
 * file is a fresh edge entry, so a deploy self-cache-busts with no manual
 * invalidation.
 *
 * Fonts and images pulled in from inside the stylesheet via `url(...)` cannot call
 * the template `asset` helper, so `renderStylesheet()` rewrites each reference to
 * carry the same `?v=<hash>` token and the served bytes are versioned too. The
 * stylesheet's own token is the hash of those rewritten bytes, so changing a font
 * also busts the stylesheet URL.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'src', 'public');

// The stylesheet is special-cased: its version token is the hash of its rewritten
// bytes (font URLs versioned), not the raw file, so a font change busts it too.
const STYLESHEET_PATH = 'css/style.css';

// Hashes are computed on first use and memoized: the files do not change while
// the process runs (a deploy starts a fresh process). The empty string marks a
// missing file so it is not re-read on every render.
const hashCache = new Map<string, string>();

// The rewritten stylesheet (and its content hash), computed once on first use.
let stylesheetCache: { css: string; version: string } | null = null;

function fingerprint(relPath: string): string | null {
  const cached = hashCache.get(relPath);
  if (cached !== undefined) return cached === '' ? null : cached;
  let hash = '';
  try {
    hash = createHash('sha256').update(readFileSync(path.join(PUBLIC_DIR, relPath))).digest('hex').slice(0, 10);
  } catch {
    hash = '';
  }
  hashCache.set(relPath, hash);
  return hash === '' ? null : hash;
}

/**
 * Reads the stylesheet and rewrites each absolute `url(/...)` (fonts, and any
 * image) to carry a `?v=<hash>` token, so assets the CSS pulls in cache-bust like
 * the ones templates reference. The returned `version` is the hash of the
 * rewritten bytes. Computed once and memoized; returns empty strings when the
 * stylesheet is missing, so the page still renders.
 */
export function renderStylesheet(): { css: string; version: string } {
  if (stylesheetCache) return stylesheetCache;
  let raw: string;
  try {
    raw = readFileSync(path.join(PUBLIC_DIR, STYLESHEET_PATH), 'utf8');
  } catch {
    stylesheetCache = { css: '', version: '' };
    return stylesheetCache;
  }
  const css = raw.replace(/url\((['"]?)(\/[^)'"]+)\1\)/g, (_match, quote: string, ref: string) => {
    return `url(${quote}${assetUrl(ref)}${quote})`;
  });
  const version = createHash('sha256').update(css).digest('hex').slice(0, 10);
  stylesheetCache = { css, version };
  return stylesheetCache;
}

/**
 * `/css/style.css` -> `/css/style.css?v=<hash>`. Returns the bare path when the
 * asset is missing, so a page still renders (just without a version token).
 */
export function assetUrl(relPath: string): string {
  const clean = relPath.replace(/^\/+/, '');
  if (clean === STYLESHEET_PATH) {
    const { version } = renderStylesheet();
    return version ? `/${clean}?v=${version}` : `/${clean}`;
  }
  const hash = fingerprint(clean);
  return hash ? `/${clean}?v=${hash}` : `/${clean}`;
}

/** Drops memoized hashes so a changed file is re-read. For tests only. */
export function clearAssetVersionCache(): void {
  hashCache.clear();
  stylesheetCache = null;
}
