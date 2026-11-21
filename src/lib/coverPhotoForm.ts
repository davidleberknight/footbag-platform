/**
 * The controller half of an event's or a club's cover photo: reading the
 * form that carries it and wording what became of it.
 *
 * The create forms and the Cover Photo forms are multipart, read through the
 * shared multipart reader under the Share Media per-photo size limit. A create
 * form still parses its text fields with its own schema; one posted urlencoded,
 * with no file, is read as before.
 */
import type { Request } from 'express';
import { logger } from '../config/logger';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import { readMultipart } from './multipartForm';
import { photoMaxBytes, photoTooLargeMessage } from '../services/curatorMediaService';
import type { CoverPhotoChange, CoverPhotoFile } from '../services/entityCoverPhoto';

/** The file input's name on every form that carries a cover photo. */
export const COVER_PHOTO_FIELD = 'cover_photo';

/** Said when the server is sent the Cover Photo form with no file chosen. */
export const COVER_PHOTO_MISSING_MESSAGE = 'Choose a photo to upload.';

/** Said in place of an upload's own refusal when the image worker is down. */
export const COVER_PHOTO_UNAVAILABLE_MESSAGE = 'Photo processing is temporarily unavailable.';

export interface CoverForm {
  /**
   * The multipart text fields, for the form's own schema; null when the form
   * was posted urlencoded, whose body the controller parses as it always has.
   */
  fields: Record<string, string> | null;
  /** The chosen photo; null when none was chosen. */
  file: CoverPhotoFile | null;
  /** Set when the chosen photo was over the size limit and was not read. */
  tooLargeMessage: string | null;
}

/**
 * Read a form that may carry a cover photo. A multipart body is read through
 * the shared reader; any other body is the urlencoded one the body parser
 * already read, and carries no photo. An untouched file input sends a part
 * with no file name, which counts as no photo chosen.
 */
export function readCoverForm(
  req: Request,
  opts: { isAdmin: boolean; maxTextFields: number },
  onDone: (form: CoverForm) => void,
  onError: (err: Error) => void,
): void {
  if (!req.is('multipart/form-data')) {
    onDone({ fields: null, file: null, tooLargeMessage: null });
    return;
  }
  const maxBytes = photoMaxBytes(opts.isAdmin);
  readMultipart(
    req,
    { limits: { fileSize: maxBytes, files: 1, fields: opts.maxTextFields }, fileFields: [COVER_PHOTO_FIELD] },
    (parsed) => {
      const file = (parsed.files[COVER_PHOTO_FIELD] ?? []).find((f) => f.filename.length > 0) ?? null;
      onDone({
        fields: parsed.fields,
        file: file ? { buffer: file.buffer, filename: file.filename } : null,
        tooLargeMessage: parsed.limitExceeded ? photoTooLargeMessage(maxBytes) : null,
      });
    },
    onError,
  );
}

/**
 * Attempt the cover photo of an entity just created, and return what to add to
 * the creation's success message: nothing when the photo was saved or none was
 * chosen, otherwise the sentence naming the upload's own refusal and where to
 * add the photo later. The entity stays created whatever happens here.
 */
export async function coverNoteAfterCreate(
  form: CoverForm,
  upload: (file: CoverPhotoFile) => Promise<CoverPhotoChange>,
  laterPlace: string,
): Promise<string> {
  let reason = form.tooLargeMessage;
  if (!reason && form.file) {
    try {
      const result = await upload(form.file);
      if (result.branch === 'refused') reason = result.message;
    } catch (err) {
      if (!(err instanceof ImageProcessingError)) throw err;
      logger.error('cover photo at creation: image worker unavailable', { error: err.message, status: err.status });
      reason = COVER_PHOTO_UNAVAILABLE_MESSAGE;
    }
  }
  if (!reason) return '';
  return ` The cover photo could not be saved: ${reason.replace(/\.\s*$/, '')}. Add it from ${laterPlace}.`;
}
