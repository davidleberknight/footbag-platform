// Sidecar JSON file model for curator URL-reference media (YouTube /
// Vimeo). Distinct from the file-paired sidecar schema in
// `curatorSidecar.ts`: URL-ref sidecars are standalone (no source
// binary), and carry platform metadata used by the seeder
// (`scripts/seed_fh_curator.py::_seed_one_sidecar`) to populate
// `media_items` rows.
//
// The 94 existing sidecars in `/curated/freestyle_tricks/` are the
// canonical example shape and validation target. Admin URL-ref upload
// + edit operations write these sidecars; never the DB. The seeder
// regenerates DB rows from sidecars on each run, so /curated/ is the
// source of truth that lives in git.

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export interface UrlSidecarData {
  videoUrl: string;
  videoPlatform: 'youtube' | 'vimeo';
  title: string | null;
  creator?: string | null;
  sourceId?: string | null;
  tier?: string | null;
  thumbnailUrl?: string | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
  externalUrl?: string | null;
  tags: string[];
}

export class UrlSidecarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlSidecarValidationError';
  }
}

// Mirrors the seeder's `_seed_one_sidecar` validation rules so a sidecar
// written here is loadable by the seeder without any further fixups.
export function validateUrlSidecarData(data: UrlSidecarData): void {
  if (!data.videoUrl || typeof data.videoUrl !== 'string') {
    throw new UrlSidecarValidationError('videoUrl is required.');
  }
  if (data.videoPlatform !== 'youtube' && data.videoPlatform !== 'vimeo') {
    throw new UrlSidecarValidationError(
      `videoPlatform must be "youtube" or "vimeo": got ${JSON.stringify(data.videoPlatform)}.`,
    );
  }

  // Platform-conditional thumbnailUrl rule (DD §6.8 + seeder enforcement).
  if (data.videoPlatform === 'youtube') {
    if (data.thumbnailUrl != null && data.thumbnailUrl !== '') {
      throw new UrlSidecarValidationError(
        'thumbnailUrl must NOT appear in a youtube sidecar; the gallery service derives it from the video id.',
      );
    }
  } else {
    if (!data.thumbnailUrl || !data.thumbnailUrl.startsWith('https://')) {
      throw new UrlSidecarValidationError(
        'vimeo sidecars must include thumbnailUrl as an https:// URL (Vimeo thumbnails are not derivable).',
      );
    }
  }

  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    throw new UrlSidecarValidationError('tags must be a non-empty array.');
  }
  for (const tag of data.tags) {
    if (typeof tag !== 'string' || !tag.startsWith('#')) {
      throw new UrlSidecarValidationError(`tag must start with '#': got ${JSON.stringify(tag)}.`);
    }
    if (tag !== tag.toLowerCase()) {
      throw new UrlSidecarValidationError(`tag must be lowercase: got ${JSON.stringify(tag)}.`);
    }
    if (tag === '#curated') {
      throw new UrlSidecarValidationError(
        '#curated must NOT appear in sidecar tags; the seeder auto-prepends it at write time.',
      );
    }
  }
}

// Filename pattern: `<primary-slug>_<sha1(videoUrl)[:8]>.meta.json`. Mirrors
// the existing 94 sidecars (`around-the-world_037d1575.meta.json`).
// Same URL → same filename → re-uploads overwrite cleanly (idempotent).
export function deriveUrlSidecarFilename(primarySlug: string, videoUrl: string): string {
  if (!primarySlug || !/^[a-z0-9-]+$/.test(primarySlug)) {
    throw new UrlSidecarValidationError(
      `primarySlug must be lowercase letters, digits, or hyphens: got ${JSON.stringify(primarySlug)}.`,
    );
  }
  const hash = createHash('sha1').update(videoUrl).digest('hex').slice(0, 8);
  return `${primarySlug}_${hash}.meta.json`;
}

// Deterministic `media_items.id` for a URL-reference row, keyed on
// (videoPlatform, videoUrl). MUST stay identical to the Python seeder's
// `_url_ref_media_id` (scripts/seed_fh_curator.py): `media_<sha1("{platform}|{url}")[:24]>`.
// This formula is the cross-tool idempotency contract: the admin upload path
// and the pre-go-live seeder derive the same id from the same (platform, url),
// so a standalone seeder run upserts the same row instead of creating a
// duplicate. A unit test pins it against the seeder's output.
export function urlRefMediaId(videoPlatform: string, videoUrl: string): string {
  const hash = createHash('sha1').update(`${videoPlatform}|${videoUrl}`).digest('hex').slice(0, 24);
  return `media_${hash}`;
}

// Two-space JSON with trailing newline, matching the existing sidecar
// formatting so file diffs in git stay clean. Field order mirrors the
// existing 94 sidecars: videoUrl, videoPlatform, title, creator,
// sourceId, tier, thumbnailUrl, startSeconds, endSeconds, tags.
export function formatUrlSidecarJson(data: UrlSidecarData): string {
  const ordered: Record<string, unknown> = {
    videoUrl: data.videoUrl,
    videoPlatform: data.videoPlatform,
  };
  if (data.title != null) ordered.title = data.title;
  if (data.creator != null) ordered.creator = data.creator;
  if (data.sourceId != null) ordered.sourceId = data.sourceId;
  if (data.tier != null) ordered.tier = data.tier;
  if (data.thumbnailUrl != null && data.videoPlatform === 'vimeo') {
    ordered.thumbnailUrl = data.thumbnailUrl;
  }
  if (data.startSeconds != null) ordered.startSeconds = data.startSeconds;
  if (data.endSeconds != null) ordered.endSeconds = data.endSeconds;
  if (data.externalUrl != null) ordered.externalUrl = data.externalUrl;
  ordered.tags = data.tags;
  return JSON.stringify(ordered, null, 2) + '\n';
}

export interface WriteUrlSidecarResult {
  filePath: string;
  filename: string;
  overwritten: boolean;
}

// Atomic write: temp file + rename. The directory must already exist
// (caller is responsible for ensuring `/curated/{category}/` is real,
// since category names are operator-controlled).
export async function writeUrlSidecarFile(
  baseDir: string,
  filename: string,
  json: string,
): Promise<WriteUrlSidecarResult> {
  const filePath = path.join(baseDir, filename);
  let overwritten = false;
  try {
    await fs.access(filePath);
    overwritten = true;
  } catch {
    // file does not exist; that's fine
  }
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, json, { encoding: 'utf-8' });
  await fs.rename(tmpPath, filePath);
  return { filePath, filename, overwritten };
}

// Reads a sidecar JSON file and validates it against the same rules
// the seeder enforces. Throws UrlSidecarValidationError on schema
// violation (caller is expected to map this to ValidationError at the
// service boundary so the controller renders 422). Reads via fs/promises;
// any I/O error (ENOENT, permission denied) propagates as-is.
export async function readUrlSidecarFile(filePath: string): Promise<UrlSidecarData> {
  const raw = await fs.readFile(filePath, { encoding: 'utf-8' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new UrlSidecarValidationError(
      `${path.basename(filePath)}: malformed JSON: ${(err as Error).message}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UrlSidecarValidationError(
      `${path.basename(filePath)}: sidecar must be a JSON object.`,
    );
  }
  const data = parsed as UrlSidecarData;
  validateUrlSidecarData(data);
  return data;
}

// Unlink a sidecar file. ENOENT-tolerant so callers can use it as part
// of best-effort cleanup after a DB delete commits.
export async function deleteUrlSidecarFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return;
    throw err;
  }
}

// Locates the sidecar file that produced a given media_items row, by
// matching the row's (video_platform, video_url) against sidecars on
// disk. Returns null for rows that are not URL-ref-backed (photo, s3
// video) or when no sidecar can be located.
//
// Resolution strategy: the seeder's filename rule is
// `<primarySlug>_<sha1(videoUrl)[:8]>.meta.json` (see
// deriveUrlSidecarFilename). Glob `<curatedRootDir>/<category>/*_<hash8>.meta.json`
// across all categories, parse each candidate, and return the first
// whose videoUrl + videoPlatform match the row. The verify step
// defends against the slim risk of an 8-char hash collision and
// against stale files left behind by manual edits.
export async function resolveSidecarForRow(
  curatedRootDir: string,
  row: { video_platform: string | null; video_url: string | null },
): Promise<string | null> {
  if (row.video_platform !== 'youtube' && row.video_platform !== 'vimeo') return null;
  if (!row.video_url) return null;
  const hash8 = createHash('sha1').update(row.video_url).digest('hex').slice(0, 8);

  let categories: string[];
  try {
    const entries = await fs.readdir(curatedRootDir, { withFileTypes: true });
    categories = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return null;
  }

  for (const category of categories) {
    const dir = path.join(curatedRootDir, category);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }
    const candidates = files.filter(
      (f) => f.endsWith(`_${hash8}.meta.json`),
    );
    for (const filename of candidates) {
      const filePath = path.join(dir, filename);
      try {
        const data = await readUrlSidecarFile(filePath);
        if (data.videoUrl === row.video_url && data.videoPlatform === row.video_platform) {
          return filePath;
        }
      } catch {
        // malformed candidate; skip and keep searching
      }
    }
  }

  return null;
}
