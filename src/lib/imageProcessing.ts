import sharp from 'sharp';

// The two thumbnail renditions have different jobs, so they take different
// bounds. An avatar is a face in a fixed circular frame 120 CSS pixels across,
// so it is cropped to a square and 300 covers that frame on a high-density
// screen. A photo thumbnail keeps its own shape and is cropped to whatever
// frame it lands in by CSS, so its bound is the longest edge, and it is sized
// for the gallery tile: tiles are at least 220 CSS pixels and grow to the full
// column width on a phone, at two to three device pixels per CSS pixel.
const AVATAR_THUMB_SIZE = 300;
const PHOTO_THUMB_SIZE = 600;
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
// Every sharp() construction takes these, including the metadata probes: the
// probe decodes enough of the input to answer, so a probe without the limit
// would be the one unbounded decode on the path, reached before any of the
// dimension checks below can reject the image.
const MAX_INPUT_PIXELS = 4096 * 4096;

// A malformed or adversarial input can make a decode pathologically slow
// without exceeding any size limit, which would otherwise tie up a worker slot
// until the request itself gives up. Bounding the operation makes that failure
// fast and local instead.
const SHARP_TIMEOUT_SECONDS = 30;

const SHARP_OPTS = { limitInputPixels: MAX_INPUT_PIXELS } as const;

// Below this on either edge the rendition variants are heavily upscaled and
// look poor; above this aspect ratio the square avatar crop discards most of
// the image.
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

// The client-facing wording for an over-sized image. Two places can decide an
// image is too big: the decoder refuses it while reading the header, and the
// explicit dimension check below. Both say the same thing to the uploader.
const TOO_MANY_PIXELS_MESSAGE =
  'Image resolution is too high; the maximum is about 16.8 megapixels (4096 by 4096 pixels)';

/**
 * Read image dimensions with the same decode ceiling the rendition pipelines
 * use. The ceiling has to apply here too, because this is the first decode of
 * the input and an unbounded one would defeat the limit the later checks are
 * trying to enforce. When the decoder rejects the input for that reason it
 * raises a bare error, which would reach the uploader as a server fault, so it
 * is translated into the same rejection the explicit size check produces.
 */
async function readImageMetadata(data: Buffer) {
  try {
    return await sharp(data, SHARP_OPTS).metadata();
  } catch (err) {
    if (err instanceof Error && /pixel limit/i.test(err.message)) {
      throw new ImageRejectedError(TOO_MANY_PIXELS_MESSAGE);
    }
    throw err;
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
  const metadata = await readImageMetadata(data);
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
    throw new ImageRejectedError(TOO_MANY_PIXELS_MESSAGE);
  }

  const [thumb, display] = await Promise.all([
    sharp(data, SHARP_OPTS)
      .timeout({ seconds: SHARP_TIMEOUT_SECONDS })
      .resize(AVATAR_THUMB_SIZE, AVATAR_THUMB_SIZE, { fit: 'cover' })
      .rotate()
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),

    sharp(data, SHARP_OPTS)
      .timeout({ seconds: SHARP_TIMEOUT_SECONDS })
      .resize(DISPLAY_WIDTH, undefined, { fit: 'inside', withoutEnlargement: true })
      .rotate()
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),
  ]);

  return { thumb, display, widthPx: width, heightPx: height };
}

/**
 * Process a raw upload buffer into two JPEG variants for a photo: member
 * uploads, curator uploads, and the poster that accompanies a curator video.
 *
 * The thumb keeps the source aspect ratio bounded on its longest edge, rather
 * than taking processAvatar's square crop, because its consumers disagree
 * about shape. A gallery tile is square and crops in CSS; the admin curator
 * list and the gallery-editor picker render the natural shape, since their job
 * is letting someone recognise which photo is which. One aspect-preserving
 * rendition serves both, and a stored crop would serve only the first.
 *
 * The Python curator seeding script produces the same rendition for curated
 * media and follows the same two rules, so a thumbnail is the same shape and
 * bound whichever side produced it.
 */
export async function processPhoto(data: Buffer): Promise<ProcessedImage> {
  const metadata = await readImageMetadata(data);
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
    throw new ImageRejectedError(TOO_MANY_PIXELS_MESSAGE);
  }

  const [thumb, display] = await Promise.all([
    sharp(data, SHARP_OPTS)
      .timeout({ seconds: SHARP_TIMEOUT_SECONDS })
      .resize(PHOTO_THUMB_SIZE, PHOTO_THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
      .rotate()
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),

    sharp(data, SHARP_OPTS)
      .timeout({ seconds: SHARP_TIMEOUT_SECONDS })
      .resize(DISPLAY_WIDTH, undefined, { fit: 'inside', withoutEnlargement: true })
      .rotate()
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer(),
  ]);

  return { thumb, display, widthPx: width, heightPx: height };
}
