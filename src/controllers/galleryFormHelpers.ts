// Shared form-helpers for gallery routes. Used by both the member
// gallery routes (curatorMediaService.createGallery / updateGallery for
// owner-edited galleries) and the admin curator gallery routes
// (FH-owned). Lives outside both controllers so the multipart parser +
// external-link plumbing don't drift between them.
import type { Request } from 'express';
import Busboy from 'busboy';
import { config } from '../config/env';
import { PHOTO_MAX_BYTES } from '../services/curatorMediaService';
import type { CuratorGalleryExternalLinkInput } from '../services/curatorMediaService';

const MAX_FILES_PER_GALLERY_SUBMIT = 3;

export interface ParsedGalleryMultipart {
  fields: Record<string, string>;
  photoFiles: Array<{ buffer: Buffer; filename: string }>;
  limitExceeded: boolean;
}

// Generic multipart parser for the gallery create + update flow. Both
// the member-owned and FH-owned paths share this so behavior stays in
// lockstep.
export function parseGalleryMultipart(
  req: Request,
  onDone: (result: ParsedGalleryMultipart) => void,
  onError: (err: Error) => void,
): void {
  const fields: Record<string, string> = {};
  const photoFiles: Array<{ buffer: Buffer; filename: string }> = [];
  let limitExceeded = false;

  const busboy = Busboy({
    headers: req.headers,
    limits: { fileSize: PHOTO_MAX_BYTES, files: MAX_FILES_PER_GALLERY_SUBMIT, fields: 32 },
  });

  busboy.on('field', (name, val) => {
    fields[name] = val;
  });

  busboy.on('file', (name, stream, info) => {
    if (name !== 'photoFiles') {
      stream.resume();
      return;
    }
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.on('limit', () => {
      limitExceeded = true;
    });
    stream.on('end', () => {
      const filename = info?.filename ?? '';
      if (!limitExceeded && filename.length > 0) {
        photoFiles.push({
          buffer: Buffer.concat(chunks),
          filename,
        });
      }
    });
  });

  busboy.on('finish', () => onDone({ fields, photoFiles, limitExceeded }));
  busboy.on('error', onError);

  req.pipe(busboy);
}

// Parses externalLinkLabel<i> + externalLinkUrl<i> form fields into the
// service-input shape. i ranges 0..(galleryMaxExternalLinks - 1). Empty
// pairs are dropped (the form may submit blanks for unfilled slots).
export function parseExternalLinkInputs(
  fields: Record<string, unknown>,
): CuratorGalleryExternalLinkInput[] {
  const out: CuratorGalleryExternalLinkInput[] = [];
  for (let i = 0; i < config.galleryMaxExternalLinks; i++) {
    const label = String(fields[`externalLinkLabel${i}`] ?? '');
    const url = String(fields[`externalLinkUrl${i}`] ?? '');
    if (!label.trim() && !url.trim()) continue;
    out.push({ label, url });
  }
  return out;
}

