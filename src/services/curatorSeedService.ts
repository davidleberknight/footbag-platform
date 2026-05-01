import { readdirSync, readFileSync, statSync } from 'fs';
import { join, parse } from 'path';
import { db, media } from '../db/db';
import { readSidecar, type CuratorSidecar } from '../lib/curatorSidecar';
import { CURATED_TAG, type CuratorMediaListItem } from './curatorMediaService';
import { ValidationError } from './serviceErrors';
import { runSqliteRead } from './sqliteRetry';

const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);
const POSTER_SUFFIX_PATTERN = /\.poster$/i;

export interface CuratorMediaServiceForSeed {
  uploadPhoto(input: {
    adminMemberId: string;
    photoBuffer: Buffer;
    sourceFilename: string;
    caption: string | null;
    tags: string[];
  }): Promise<{ mediaId: string; displayUrl: string }>;
  uploadVideo(input: {
    adminMemberId: string;
    videoBuffer: Buffer;
    posterBuffer: Buffer;
    sourceFilename: string;
    caption: string | null;
    tags: string[];
  }): Promise<{ mediaId: string; displayUrl: string }>;
  editMedia(input: {
    adminMemberId: string;
    mediaId: string;
    caption?: string | null;
    tags?: string[];
  }): Promise<{ mediaId: string; updatedAt: string }>;
  deleteMedia(input: { adminMemberId: string; mediaId: string }): Promise<{ mediaId: string }>;
  listMedia(input: { tagFilter?: string; page: number; pageSize: number }): {
    items: CuratorMediaListItem[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface CuratorSeedServiceDeps {
  curatorMediaService: CuratorMediaServiceForSeed;
  // Resolves the system curator member id. Tests inject; default reads DB.
  findSystemMemberId?: () => string | null;
}

export interface CuratorSeedReconcileInput {
  sourceDir: string;
  // Actor recorded in audit entries for created/updated/deleted rows.
  // Typically the system curator member id.
  actorMemberId: string;
}

export interface CuratorSeedReconcileReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  deleted: string[];
  errors: { sourceFilename: string; message: string }[];
}

interface ExistingCuratorRow {
  id: string;
  source_filename: string;
  caption: string | null;
}

export function createCuratorSeedService(deps: CuratorSeedServiceDeps) {
  const { curatorMediaService } = deps;
  const findSystemMemberId = deps.findSystemMemberId ?? defaultFindSystemMemberId;

  function resolveSystemMemberIdOrThrow(): string {
    const id = findSystemMemberId();
    if (!id) {
      throw new Error('Configuration error: no system member row found (is_system=1)');
    }
    return id;
  }

  return {
    async reconcile(input: CuratorSeedReconcileInput): Promise<CuratorSeedReconcileReport> {
      const report: CuratorSeedReconcileReport = {
        created: [],
        updated: [],
        unchanged: [],
        deleted: [],
        errors: [],
      };

      const systemMemberId = resolveSystemMemberIdOrThrow();
      const sourceFiles = enumerateMediaSources(input.sourceDir);
      const presentSet = new Set(sourceFiles.map((f) => f.sourceFilename));
      const existingRows = readExistingCuratorRows(systemMemberId);
      const existingByFilename = new Map<string, ExistingCuratorRow>();
      for (const row of existingRows) {
        if (row.source_filename) existingByFilename.set(row.source_filename, row);
      }

      // Pass 1: orphans (rows whose source_filename no longer exists in the dir)
      for (const row of existingRows) {
        if (!row.source_filename) continue;
        if (presentSet.has(row.source_filename)) continue;
        try {
          await curatorMediaService.deleteMedia({
            adminMemberId: input.actorMemberId,
            mediaId: row.id,
          });
          report.deleted.push(row.source_filename);
        } catch (err) {
          report.errors.push({
            sourceFilename: row.source_filename,
            message: `delete failed: ${(err as Error).message}`,
          });
        }
      }

      // Pass 2: present files (new vs changed vs unchanged)
      for (const file of sourceFiles) {
        try {
          let sidecar: CuratorSidecar;
          try {
            sidecar = readSidecar(input.sourceDir, file.sourceFilename);
          } catch (err) {
            report.errors.push({
              sourceFilename: file.sourceFilename,
              message: `sidecar: ${(err as Error).message}`,
            });
            continue;
          }

          const existing = existingByFilename.get(file.sourceFilename);
          if (existing) {
            // Existing row: compare caption + tags from sidecar against DB.
            // Bytes are not re-checked; operators must delete + re-add to
            // refresh content. Documented limitation for v1.
            const dbTags = readMediaTagsForId(existing.id)
              .filter((t) => t !== CURATED_TAG)
              .sort();
            const sidecarTagsSorted = [...sidecar.tags].sort();
            const captionChanged = existing.caption !== sidecar.caption;
            const tagsChanged = !arraysEqual(dbTags, sidecarTagsSorted);

            if (!captionChanged && !tagsChanged) {
              report.unchanged.push(file.sourceFilename);
              continue;
            }

            await curatorMediaService.editMedia({
              adminMemberId: input.actorMemberId,
              mediaId: existing.id,
              ...(captionChanged && { caption: sidecar.caption }),
              ...(tagsChanged && { tags: sidecar.tags }),
            });
            report.updated.push(file.sourceFilename);
          } else {
            // New file: full upload path.
            await uploadFromFilesystem(input, file, sidecar);
            report.created.push(file.sourceFilename);
          }
        } catch (err) {
          report.errors.push({
            sourceFilename: file.sourceFilename,
            message: (err as Error).message,
          });
        }
      }

      return report;
    },
  };

  async function uploadFromFilesystem(
    input: CuratorSeedReconcileInput,
    file: SourceMediaFile,
    sidecar: CuratorSidecar,
  ): Promise<void> {
    const fullPath = join(input.sourceDir, file.sourceFilename);
    const buffer = readFileSync(fullPath);

    if (file.kind === 'photo') {
      await curatorMediaService.uploadPhoto({
        adminMemberId: input.actorMemberId,
        photoBuffer: buffer,
        sourceFilename: file.sourceFilename,
        caption: sidecar.caption,
        tags: sidecar.tags,
      });
      return;
    }

    // Video: requires sidecar.poster pointing at a sibling poster file.
    if (!sidecar.poster) {
      throw new ValidationError(
        `Video sidecar must specify a "poster" filename: ${file.sourceFilename}`,
      );
    }
    const posterPath = join(input.sourceDir, sidecar.poster);
    const posterBuffer = readFileSync(posterPath);

    await curatorMediaService.uploadVideo({
      adminMemberId: input.actorMemberId,
      videoBuffer: buffer,
      posterBuffer,
      sourceFilename: file.sourceFilename,
      caption: sidecar.caption,
      tags: sidecar.tags,
    });
  }
}

interface SourceMediaFile {
  sourceFilename: string;
  kind: 'photo' | 'video';
}

function enumerateMediaSources(dirPath: string): SourceMediaFile[] {
  const entries = readdirSync(dirPath);
  const files: SourceMediaFile[] = [];
  for (const name of entries) {
    const fullPath = join(dirPath, name);
    if (!statSync(fullPath).isFile()) continue;
    const parsed = parse(name);
    const ext = parsed.ext.toLowerCase();
    // Skip sidecar JSON files and posters (consumed by their parent video).
    if (ext === '.json') continue;
    if (POSTER_SUFFIX_PATTERN.test(parsed.name)) continue;
    if (PHOTO_EXTENSIONS.has(ext)) {
      files.push({ sourceFilename: name, kind: 'photo' });
    } else if (VIDEO_EXTENSIONS.has(ext)) {
      files.push({ sourceFilename: name, kind: 'video' });
    }
    // Other extensions: ignored.
  }
  return files;
}

function readExistingCuratorRows(systemMemberId: string): ExistingCuratorRow[] {
  return runSqliteRead('listCuratorRowsForReconcile', () =>
    db
      .prepare(
        `SELECT id, source_filename, caption
         FROM media_items
         WHERE uploader_member_id = ?
           AND moderation_status = 'active'
           AND source_filename IS NOT NULL`,
      )
      .all(systemMemberId),
  ) as ExistingCuratorRow[];
}

function readMediaTagsForId(mediaId: string): string[] {
  const rows = runSqliteRead('readMediaTagsForId', () =>
    db
      .prepare(
        `SELECT t.tag_normalized
         FROM media_tags mt
         JOIN tags t ON t.id = mt.tag_id
         WHERE mt.media_id = ?`,
      )
      .all(mediaId),
  ) as { tag_normalized: string }[];
  return rows.map((r) => r.tag_normalized);
}

interface SystemMemberRow {
  id: string;
}

function defaultFindSystemMemberId(): string | null {
  const row = runSqliteRead('findSystemMemberIdForSeed', () =>
    media.findSystemMemberId.get(),
  ) as SystemMemberRow | undefined;
  return row?.id ?? null;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
