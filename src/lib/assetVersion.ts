/**
 * Content-hash fingerprints for static assets under `src/public`, so each emitted
 * URL is `/<path>?v=<hash>` and changes only when the file's bytes change. Mirrors
 * the `?v={media_id}` versioning used for media URLs: paired with the immutable
 * Cache-Control set on versioned requests and the static-asset CloudFront cache
 * policy (query string in the cache key for `/css/*` `/js/*`), a changed file is a
 * fresh edge entry, so a deploy self-cache-busts with no manual invalidation.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'src', 'public');

// Hashes are computed on first use and memoized: the files do not change while
// the process runs (a deploy starts a fresh process). The empty string marks a
// missing file so it is not re-read on every render.
const hashCache = new Map<string, string>();

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
 * `/css/style.css` -> `/css/style.css?v=<hash>`. Returns the bare path when the
 * asset is missing, so a page still renders (just without a version token).
 */
export function assetUrl(relPath: string): string {
  const clean = relPath.replace(/^\/+/, '');
  const hash = fingerprint(clean);
  return hash ? `/${clean}?v=${hash}` : `/${clean}`;
}

/** Drops memoized hashes so a changed file is re-read. For tests only. */
export function clearAssetVersionCache(): void {
  hashCache.clear();
}
