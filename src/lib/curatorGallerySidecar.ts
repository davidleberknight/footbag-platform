// Sidecar JSON file model for FH-owned named-gallery definitions.
// Distinct from the URL-reference sidecar in `curatorUrlSidecar.ts`:
// gallery sidecars declare a `member_galleries` row plus its criteria-
// tag and exclude-tag sets (one file per gallery), while URL-ref
// sidecars declare a single `media_items` row plus its tag set.
//
// The 2 existing sidecars in `/curated/galleries/` are the canonical
// example shape and validation target. Admin gallery edit + create +
// delete operations on FH-owned galleries write/remove these sidecars
// after the DB transaction commits. The Python seeder
// (`scripts/seed_fh_curator.py::_load_named_gallery_sidecars`) reads
// the same files on a fresh seed so /curated/galleries/ is the source
// of truth in git for FH gallery definitions.
//
// Member-owned galleries do NOT use sidecars: their state lives only
// in the DB. The post-commit sidecar write is conditional on the
// gallery being FH-owned; the seeder's orphan-cleanup pass is scoped
// to `owner_member_id = fh_id` so member rows are never touched.

import { promises as fs } from 'fs';
import path from 'path';

export type GallerySortOrderValue = 'upload_desc' | 'upload_asc' | 'caption_asc';

export const GALLERY_SORT_ORDER_VALUES: readonly GallerySortOrderValue[] = [
  'upload_desc',
  'upload_asc',
  'caption_asc',
];

export const GALLERY_NAME_MAX_LEN = 150;
export const GALLERY_DESCRIPTION_MAX_LEN = 1000;

const GALLERY_ID_RE = /^gallery_[a-z0-9_]+$/;

export interface GallerySidecarData {
  id: string;
  name: string;
  description: string;
  sortOrder: GallerySortOrderValue;
  criteriaTags: string[];
  excludeTags: string[];
}

export class GallerySidecarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GallerySidecarValidationError';
  }
}

// Mirrors `_load_named_gallery_sidecars` in `scripts/seed_fh_curator.py`
// field-for-field. Cross-language drift here would silently corrupt the
// seed — a sidecar accepted on one side must be loadable on the other.
export function validateGallerySidecarData(data: GallerySidecarData): void {
  if (!data || typeof data !== 'object') {
    throw new GallerySidecarValidationError('sidecar must be a JSON object');
  }
  if (typeof data.id !== 'string' || !GALLERY_ID_RE.test(data.id)) {
    throw new GallerySidecarValidationError(
      `id must match ${GALLERY_ID_RE.source}; got ${JSON.stringify(data.id)}`,
    );
  }
  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new GallerySidecarValidationError('name is required and must be non-empty');
  }
  if (data.name.length > GALLERY_NAME_MAX_LEN) {
    throw new GallerySidecarValidationError(
      `name must be ${GALLERY_NAME_MAX_LEN} characters or fewer`,
    );
  }
  if (typeof data.description !== 'string') {
    throw new GallerySidecarValidationError('description must be a string');
  }
  if (data.description.length > GALLERY_DESCRIPTION_MAX_LEN) {
    throw new GallerySidecarValidationError(
      `description must be ${GALLERY_DESCRIPTION_MAX_LEN} characters or fewer`,
    );
  }
  if (!GALLERY_SORT_ORDER_VALUES.includes(data.sortOrder)) {
    throw new GallerySidecarValidationError(
      `sortOrder must be one of ${JSON.stringify(GALLERY_SORT_ORDER_VALUES)}; got ${JSON.stringify(data.sortOrder)}`,
    );
  }
  if (!Array.isArray(data.criteriaTags) || data.criteriaTags.length === 0) {
    throw new GallerySidecarValidationError('criteriaTags must be a non-empty array');
  }
  if (!Array.isArray(data.excludeTags)) {
    throw new GallerySidecarValidationError('excludeTags must be an array');
  }
  for (const [label, tags] of [
    ['criteriaTags', data.criteriaTags],
    ['excludeTags', data.excludeTags],
  ] as const) {
    const seen = new Set<string>();
    for (const tag of tags) {
      if (typeof tag !== 'string' || !tag.startsWith('#')) {
        throw new GallerySidecarValidationError(
          `every ${label} entry must be a '#'-prefixed string; got ${JSON.stringify(tag)}`,
        );
      }
      if (tag !== tag.toLowerCase()) {
        throw new GallerySidecarValidationError(
          `tag ${JSON.stringify(tag)} in ${label} must be lowercase`,
        );
      }
      if (seen.has(tag)) {
        throw new GallerySidecarValidationError(
          `duplicate ${label} entry ${JSON.stringify(tag)}`,
        );
      }
      seen.add(tag);
    }
  }
  const criteriaSet = new Set(data.criteriaTags);
  const overlap = data.excludeTags.filter((t) => criteriaSet.has(t));
  if (overlap.length > 0) {
    throw new GallerySidecarValidationError(
      `tag(s) appear in both criteriaTags and excludeTags: ${JSON.stringify(overlap.sort())}`,
    );
  }
}

// Filename rule: <slug>.json where <slug> = id with the 'gallery_' prefix
// stripped. So `gallery_curated_freestyle_tricks` lives at
// `/curated/galleries/curated_freestyle_tricks.json`. Matches the
// Python seeder's expectation.
export function deriveGallerySidecarPath(curatedRoot: string, id: string): string {
  if (!GALLERY_ID_RE.test(id)) {
    throw new GallerySidecarValidationError(
      `id must match ${GALLERY_ID_RE.source}; got ${JSON.stringify(id)}`,
    );
  }
  const slug = id.slice('gallery_'.length);
  return path.join(curatedRoot, 'galleries', `${slug}.json`);
}

// Two-space JSON with trailing newline. Field order is fixed (id, name,
// description, sortOrder, criteriaTags, excludeTags) so files written
// by the admin UI diff cleanly against the existing sidecars in
// /curated/galleries/.
export function formatGallerySidecarJson(data: GallerySidecarData): string {
  const ordered: Record<string, unknown> = {
    id: data.id,
    name: data.name,
    description: data.description,
    sortOrder: data.sortOrder,
    criteriaTags: data.criteriaTags,
    excludeTags: data.excludeTags,
  };
  return JSON.stringify(ordered, null, 2) + '\n';
}

export interface WriteGallerySidecarResult {
  filePath: string;
  overwritten: boolean;
}

// Atomic write: temp file + rename. Creates `${curatedRoot}/galleries/`
// if it doesn't exist (gallery sidecars all live in one directory, so
// the lib owns that mkdir rather than pushing it on the caller).
export async function writeGallerySidecarFile(
  curatedRoot: string,
  data: GallerySidecarData,
): Promise<WriteGallerySidecarResult> {
  validateGallerySidecarData(data);
  const filePath = deriveGallerySidecarPath(curatedRoot, data.id);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  let overwritten = false;
  try {
    await fs.access(filePath);
    overwritten = true;
  } catch {
    // file does not exist yet
  }

  const json = formatGallerySidecarJson(data);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, json, { encoding: 'utf-8' });
  await fs.rename(tmpPath, filePath);
  return { filePath, overwritten };
}

// Reads a sidecar JSON file and validates it. Throws
// GallerySidecarValidationError on schema violation; any I/O error
// (ENOENT, permission denied) propagates as-is.
export async function readGallerySidecarFile(
  filePath: string,
): Promise<GallerySidecarData> {
  const raw = await fs.readFile(filePath, { encoding: 'utf-8' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new GallerySidecarValidationError(
      `${path.basename(filePath)}: malformed JSON: ${(err as Error).message}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GallerySidecarValidationError(
      `${path.basename(filePath)}: sidecar must be a JSON object`,
    );
  }
  const data = parsed as GallerySidecarData;
  validateGallerySidecarData(data);
  return data;
}

// ENOENT-tolerant unlink so callers can use it as best-effort cleanup
// after a DB delete commits.
export async function deleteGallerySidecarFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return;
    throw err;
  }
}
