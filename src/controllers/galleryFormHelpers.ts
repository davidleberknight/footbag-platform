// The multipart parser shared by the member-owned and FH-owned gallery forms,
// kept in one place so it cannot drift between them.
import type { Request } from 'express';
import { PHOTO_MAX_BYTES } from '../services/curatorMediaService';
import { readMultipart, type MultipartFile } from '../lib/multipartForm';

const MAX_FILES_PER_GALLERY_SUBMIT = 3;

export interface ParsedGalleryMultipart {
  fields: Record<string, string>;
  photoFiles: MultipartFile[];
  limitExceeded: boolean;
  // A part that carried bytes but no filename header (malformed upload).
  droppedNamelessFile: boolean;
}

// Multipart parser for the gallery create + update flow. Both the
// member-owned and FH-owned paths share this so behavior stays in lockstep.
// A part sent without a filename is the untouched file input and is skipped.
export function parseGalleryMultipart(
  req: Request,
  onDone: (result: ParsedGalleryMultipart) => void,
  onError: (err: Error) => void,
): void {
  readMultipart(
    req,
    {
      limits: { fileSize: PHOTO_MAX_BYTES, files: MAX_FILES_PER_GALLERY_SUBMIT, fields: 32 },
      fileFields: ['photoFiles'],
    },
    ({ fields, files, limitExceeded, droppedNamelessFile }) => onDone({
      fields,
      photoFiles: limitExceeded ? [] : (files.photoFiles ?? []).filter((f) => f.filename.length > 0),
      limitExceeded,
      droppedNamelessFile,
    }),
    onError,
  );
}

