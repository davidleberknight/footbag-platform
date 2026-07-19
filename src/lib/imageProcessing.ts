import sharp from 'sharp';

const THUMB_SIZE = 300;
const DISPLAY_WIDTH = 800;
const JPEG_QUALITY = 85;

// Bound Sharp's decode memory so the image worker cannot be OOM-killed by a
// decompression-bomb upload: Sharp's footprint is pixels times bytes-per-pixel,
// not file size, and the upload byte caps do not bound decoded dimensions.
// 4096 x 4096 keeps the worst-case simultaneous footprint within the image
// container's memory limit: up to IMAGE_MAX_CONCURRENT uploads each decode
// their thumbnail and display variants in parallel (2 x 2 = 4 decodes at
// 4 bytes/pixel, about 268 MB), leaving headroom for the runtime, in-flight
// upload buffers, and a co-resident video transcode.
const MAX_INPUT_PIXELS = 4096 * 4096;
const SHARP_OPTS = { limitInputPixels: MAX_INPUT_PIXELS } as const;

// Below this on either edge the thumbnail (300x300) and display (800px)
// variants are heavily upscaled and look poor; above this aspect ratio the
// square avatar crop discards most of the image.
const MIN_INPUT_EDGE = 200;
const MAX_ASPECT_RATIO = 4;

// Thrown when an upload is rejected for a client-fixable reason (too small,
// too large, or an extreme aspect ratio). The image worker maps this to an
// HTTP 400 so the upload services surface it as a clear inline form error
// rather than a generic "service unavailable".
export class ImageRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageRejectedError';
  }
}

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export interface ProcessedImage {
  thumb: Buffer;
  display: Buffer;
  widthPx: number;
  heightPx: number;
}

export function detectImageType(data: Buffer): 'image/jpeg' | 'image/png' | null {
  if (data.length < 4) return null;
  if (data.subarray(0, 3).equals(JPEG_MAGIC)) return 'image/jpeg';
  if (data.subarray(0, 4).equals(PNG_MAGIC)) return 'image/png';
  return null;
}

/**
 * Content type of the display and thumbnail renditions processAvatar and
 * processPhoto emit: both re-encode to JPEG, so every stored *-display.jpg /
 * *-thumb.jpg object is served as image/jpeg. Recorded in media_items.mime_type
 * for photo rows, so the served content type is a real column rather than
 * inferred from the key extension.
 */
export const RENDITION_IMAGE_MIME = 'image/jpeg';

/**
 * Security: re-encodes the image through sharp, which strips all
 * EXIF/ICC/XMP metadata and eliminates any embedded malicious content.
 * The original bytes are never written to disk.
 */
export async function processAvatar(data: Buffer): Promise<ProcessedImage> {
  const metadata = await sharp(data).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error('Unable to read image dimensions');
  }
  if (width < MIN_INPUT_EDGE || height < MIN_INPUT_EDGE) {
    throw new ImageRejectedError(`Image is too small; please upload at least ${MIN_INPUT_EDGE} by ${MIN_INPUT_EDGE} pixels`);
  }
  if (Math.max(width / height, height / width) > MAX_ASPECT_RATIO) {
    throw new ImageRejectedError(`Image is too long and thin; the longest side may be at most ${MAX_ASPECT_RATIO} times the shortest`);
  }
  if (width * height > MAX_INPUT_PIXELS) {
    throw new ImageRejectedError('Image resolution is too high; the maximum is about 16.8 megapixels (4096 by 4096 pixels)');
  }

  const [thumb, display] = await Promise.all([
    sharp(data, SHARP_OPTS)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .rotate()
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),

    sharp(data, SHARP_OPTS)
      .resize(DISPLAY_WIDTH, undefined, { fit: 'inside', withoutEnlargement: true })
      .rotate()
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),
  ]);

  return { thumb, display, widthPx: width, heightPx: height };
}

/**
 * Process a raw upload buffer into two JPEG variants for a hero/curator photo.
 *
 * Differs from processAvatar in that the thumb is aspect-preserving
 * (longest-edge 300px, fit:'inside') instead of a 300x300 cover-crop.
 * Used by the admin curator upload path where preserving the photo's
 * aspect matters (event photos, illustrations, etc.).
 */
export async function processPhoto(data: Buffer): Promise<ProcessedImage> {
  const metadata = await sharp(data).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error('Unable to read image dimensions');
  }
  if (width < MIN_INPUT_EDGE || height < MIN_INPUT_EDGE) {
    throw new ImageRejectedError(`Image is too small; please upload at least ${MIN_INPUT_EDGE} by ${MIN_INPUT_EDGE} pixels`);
  }
  if (Math.max(width / height, height / width) > MAX_ASPECT_RATIO) {
    throw new ImageRejectedError(`Image is too long and thin; the longest side may be at most ${MAX_ASPECT_RATIO} times the shortest`);
  }
  if (width * height > MAX_INPUT_PIXELS) {
    throw new ImageRejectedError('Image resolution is too high; the maximum is about 16.8 megapixels (4096 by 4096 pixels)');
  }

  const [thumb, display] = await Promise.all([
    sharp(data, SHARP_OPTS)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
      .rotate()
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),

    sharp(data, SHARP_OPTS)
      .resize(DISPLAY_WIDTH, undefined, { fit: 'inside', withoutEnlargement: true })
      .rotate()
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),
  ]);

  return { thumb, display, widthPx: width, heightPx: height };
}
