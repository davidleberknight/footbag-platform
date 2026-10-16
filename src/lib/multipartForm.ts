/**
 * The one multipart/form-data reader behind every upload form. Each form
 * passes its own limits; the reader owns how parts are collected, so the
 * oversize and nameless-file handling cannot drift between forms.
 *
 * A file part that crosses `limits.fileSize` is dropped and flagged rather
 * than kept truncated: busboy cuts the stream at the ceiling and ends it
 * normally, so a byte count taken from the data alone can never exceed the
 * limit and a truncated file would otherwise pass as a complete one.
 */
import type { Request } from 'express';
import Busboy from 'busboy';

export interface MultipartFile {
  buffer: Buffer;
  // Empty when the browser sent the part without a filename, which is what an
  // untouched file input submits.
  filename: string;
}

export interface ParsedMultipart {
  fields: Record<string, string>;
  // Every file part that arrived whole, by field name, in arrival order.
  files: Record<string, MultipartFile[]>;
  limitExceeded: boolean;
  // A part named as a file field that arrived as a non-empty text value: bytes
  // sent without a filename header, which busboy parses as a field.
  droppedNamelessFile: boolean;
}

export interface MultipartOptions {
  // fileSize is the largest file accepted, in bytes; a part one byte larger
  // is flagged.
  limits: { fileSize: number; files: number; fields: number };
  // File fields to collect; parts under any other name are drained unread.
  // Omitted, every file part is collected.
  fileFields?: readonly string[];
  // Called the moment a file part crosses the size ceiling, with the fields
  // that arrived before it. Parsing stops there and `onDone` is never called,
  // so the caller can refuse without waiting for the rest of the body.
  onLimit?: (fieldsSoFar: Record<string, string>) => void;
}

export function readMultipart(
  req: Request,
  opts: MultipartOptions,
  onDone: (parsed: ParsedMultipart) => void,
  onError: (err: Error) => void,
): void {
  const fields: Record<string, string> = {};
  const files: Record<string, MultipartFile[]> = {};
  let limitExceeded = false;
  let droppedNamelessFile = false;
  let stopped = false;

  const accepts = (name: string): boolean =>
    opts.fileFields === undefined || opts.fileFields.includes(name);

  // Busboy raises its limit when a part reaches its ceiling, not when it passes
  // it, so a file of exactly the maximum size would be flagged. One byte of
  // headroom makes the flag mean what the services' own size checks mean.
  const busboy = Busboy({
    headers: req.headers,
    limits: { ...opts.limits, fileSize: opts.limits.fileSize + 1 },
  });

  busboy.on('field', (name, val) => {
    if (opts.fileFields?.includes(name)) {
      // The normal "no file chosen" submit sends an empty value here and is
      // ignored.
      if (val.length > 0) droppedNamelessFile = true;
      return;
    }
    fields[name] = val;
  });

  busboy.on('file', (name, stream, info) => {
    if (!accepts(name)) {
      stream.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let truncated = false;
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.on('limit', () => {
      truncated = true;
      limitExceeded = true;
      if (opts.onLimit && !stopped) {
        stopped = true;
        req.unpipe(busboy);
        busboy.removeAllListeners();
        stream.resume();
        opts.onLimit({ ...fields });
      }
    });
    stream.on('end', () => {
      if (truncated) return;
      (files[name] ??= []).push({
        buffer: Buffer.concat(chunks),
        filename: typeof info?.filename === 'string' ? info.filename : '',
      });
    });
  });

  busboy.on('finish', () => {
    if (stopped) return;
    onDone({ fields, files, limitExceeded, droppedNamelessFile });
  });
  busboy.on('error', (err: Error) => {
    if (stopped) return;
    onError(err);
  });

  req.pipe(busboy);
}
