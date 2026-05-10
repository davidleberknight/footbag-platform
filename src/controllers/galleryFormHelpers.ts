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
import {
  getImageProcessingAdapter,
  type ImageProcessingAdapter,
} from '../adapters/imageProcessingAdapter';

// Lazy image-processor for `buildSvc()` callers. The underlying singleton
// throws "INTERNAL_EVENT_SECRET not configured; cannot reach image worker"
// at first resolution if the secret is unset; pre-resolving it inside
// `buildSvc()` (used to be `imageProcessor: getImageProcessingAdapter()`)
// surfaces that throw on every route, including read paths like the
// gallery list which never touch the worker. Returning this thin wrapper
// instead defers resolution to the first actual call (avatar/photo
// upload), so dev environments without the secret can serve list and
// read pages.
export function lazyImageProcessor(): ImageProcessingAdapter {
  return {
    processAvatar: (data) => getImageProcessingAdapter().processAvatar(data),
    processPhoto: (data) => getImageProcessingAdapter().processPhoto(data),
  };
}

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

export interface ExternalLinkSlot {
  index: number;
  label: string;
  url: string;
  labelError?: string;
  urlError?: string;
  // Set when the persisted row was rejected by the runtime boot scan
  // (Safe Browsing match). Populated on the GET edit path when `existing[i]`
  // carries `quarantineReason`. The template renders a warning badge so the
  // operator sees the row is not publicly visible.
  quarantineReason?: string;
}

// Builds the array the form template iterates to render label+URL inputs.
// On a clean GET, `existing` is the gallery's persisted links; on POST
// validation failure, `submitted` is the user's last-typed values so the
// form preserves their input.
export function buildExternalLinkSlots(
  submitted: CuratorGalleryExternalLinkInput[] | null,
  existing: Array<{ label: string; url: string; quarantineReason?: string | null }>,
  fieldErrors?: Record<string, string>,
): ExternalLinkSlot[] {
  const slots: ExternalLinkSlot[] = [];
  for (let i = 0; i < config.galleryMaxExternalLinks; i++) {
    const src = submitted ? submitted[i] : existing[i];
    const slot: ExternalLinkSlot = {
      index: i,
      label: src?.label ?? '',
      url: src?.url ?? '',
      labelError: fieldErrors?.[`externalLinks[${i}].label`],
      urlError: fieldErrors?.[`externalLinks[${i}].url`],
    };
    // Quarantine state only applies on the GET-edit path (existing rows).
    // On POST submit (`submitted` non-null), the user is replacing the
    // value; surfacing a stale quarantine warning would be confusing.
    if (!submitted) {
      const persisted = existing[i] as { quarantineReason?: string | null } | undefined;
      if (persisted?.quarantineReason) {
        slot.quarantineReason = persisted.quarantineReason;
      }
    }
    slots.push(slot);
  }
  return slots;
}
