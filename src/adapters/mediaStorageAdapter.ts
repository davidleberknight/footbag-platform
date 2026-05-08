/**
 * MediaStorageAdapter: interface + implementations + singleton getter for the
 * adapters layer. Abstracts media storage between environments. Production
 * uses S3 (`createS3MediaStorageAdapter`); development and pre-cutover
 * staging use the local filesystem (`createLocalMediaStorageAdapter`) with
 * identical key structure. Both implementations return relative
 * `/media-store/{key}` URLs from `constructURL`. The CloudFront
 * `/media-store/*` cache behavior routes to the S3 bucket via OAC (with a
 * viewer-request function stripping the prefix so S3 sees the bare key).
 * Services call the interface; the getter returns the configured
 * implementation based on `config.mediaStorageAdapter`.
 *
 * The `/media-store/` URL prefix is dedicated to binary storage and is
 * disjoint from the `/media` user-facing app section (routes `/media`,
 * `/media/:galleryId`, `/media/browse`). Content-agnostic: the adapter
 * handles photos, system-account video bytes, and posters identically.
 * Per DD §1.5.
 */
import { mkdir, writeFile, unlink, access, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env';

export interface MediaStorageAdapter {
  /** Write data to the given storage key, creating directories as needed. */
  put(key: string, data: Buffer): Promise<void>;

  /** Read the object at the given storage key into a Buffer. Throws if missing. */
  get(key: string): Promise<Buffer>;

  /** Delete the object at the given storage key. No-op if it does not exist. */
  delete(key: string): Promise<void>;

  /** Return a URL suitable for use in templates (e.g. `/media-store/{key}` or a CloudFront URL). */
  constructURL(key: string): string;

  /** Check whether an object exists at the given storage key. */
  exists(key: string): Promise<boolean>;

  /**
   * Return a time-bounded signed URL the browser can use to PUT bytes directly
   * to storage. Used by the admin curator video upload flow so large source
   * bytes never traverse nginx or CloudFront. The browser's PUT must send a
   * `Content-Type` header matching the value passed here, since the signature
   * binds it.
   */
  generatePresignedPutUrl(
    key: string,
    contentType: string,
    expirationSeconds: number,
  ): Promise<string>;
}

export function createLocalMediaStorageAdapter(opts: {
  baseDir: string;
}): MediaStorageAdapter {
  const { baseDir } = opts;
  return {
    async put(key: string, data: Buffer): Promise<void> {
      const filePath = path.join(baseDir, key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, data);
    },
    async get(key: string): Promise<Buffer> {
      return readFile(path.join(baseDir, key));
    },
    async delete(key: string): Promise<void> {
      const filePath = path.join(baseDir, key);
      try {
        await unlink(filePath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },
    constructURL(key: string): string {
      return `/media-store/${key}`;
    },
    async exists(key: string): Promise<boolean> {
      try {
        await access(path.join(baseDir, key));
        return true;
      } catch {
        return false;
      }
    },
    // Local dev does not use presigned PUT in production. The async curator
    // video flow is wired only against S3; the local adapter exposes a stub
    // URL shape solely so the interface is satisfied and tests can assert
    // the call site without a real S3 client. The local-mode admin upload
    // path keeps using the existing synchronous multipart submission.
    async generatePresignedPutUrl(
      key: string,
      contentType: string,
      expirationSeconds: number,
    ): Promise<string> {
      const params = new URLSearchParams({
        'X-Amz-Algorithm': 'LOCAL-STUB',
        'X-Amz-Expires': String(expirationSeconds),
        'Content-Type': contentType,
      });
      return `/_local-presigned-put/${key}?${params.toString()}`;
    },
  };
}

export function createS3MediaStorageAdapter(opts: {
  bucket: string;
  region?: string;
  s3Client?: S3Client;
}): MediaStorageAdapter {
  // requestChecksumCalculation: 'WHEN_REQUIRED' suppresses the SDK's default
  // CRC32 of an empty body for presigned PUT URLs. Default 'WHEN_SUPPORTED'
  // adds x-amz-checksum-crc32=AAAAAA== to the signed query string and forces
  // S3 to expect that exact checksum from the upload body. Browser PUTs of
  // arbitrary file bytes can't hit that, and the upload would fail with
  // checksum mismatch. Our normal put() call doesn't depend on auto-checksum
  // either; bucket integrity is covered by S3's stored ETag.
  const client =
    opts.s3Client ??
    new S3Client({
      ...(opts.region ? { region: opts.region } : {}),
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  const bucket = opts.bucket;
  return {
    async put(key: string, data: Buffer): Promise<void> {
      // URL-versioning via `?v={media_id}` makes the bytes-at-this-URL
      // immutable from any cache's point of view; a replacement upload
      // emits a fresh `?v=` and is a distinct cache key.
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: 'image/jpeg',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },
    async get(key: string): Promise<Buffer> {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const stream = res.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },
    async delete(key: string): Promise<void> {
      // S3 DeleteObject is idempotent: it returns success whether or not the
      // key existed. No special-case for a missing key.
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    constructURL(key: string): string {
      return `/media-store/${key}`;
    },
    async exists(key: string): Promise<boolean> {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'NotFound') return false;
        throw err;
      }
    },
    async generatePresignedPutUrl(
      key: string,
      contentType: string,
      expirationSeconds: number,
    ): Promise<string> {
      // Bind Content-Type into the signed canonical request. Without this,
      // the SDK signs only the host header and a malicious uploader could
      // PUT arbitrary content types under the signed key. Browser must send
      // a matching Content-Type or S3 rejects the upload with SignatureMismatch.
      // Size is not bound; the /finalize HEAD enforces the per-type max before
      // the worker is asked to process the object.
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });
      return getSignedUrl(client, command, {
        expiresIn: expirationSeconds,
        signableHeaders: new Set(['content-type']),
      });
    },
  };
}

let singleton: MediaStorageAdapter | null = null;

export function getMediaStorageAdapter(): MediaStorageAdapter {
  if (singleton) return singleton;
  if (config.mediaStorageAdapter === 's3') {
    singleton = createS3MediaStorageAdapter({
      bucket: config.mediaStorageS3Bucket as string,
      region: config.awsRegion,
    });
  } else {
    singleton = createLocalMediaStorageAdapter({ baseDir: config.mediaDir });
  }
  return singleton;
}

export function setMediaStorageAdapterForTests(adapter: MediaStorageAdapter): void {
  singleton = adapter;
}

export function resetMediaStorageAdapterForTests(): void {
  singleton = null;
}
