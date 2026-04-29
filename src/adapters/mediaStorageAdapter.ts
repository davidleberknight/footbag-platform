/**
 * MediaStorageAdapter: interface + implementations + singleton getter for the
 * adapters layer. Abstracts media storage between environments. Production
 * uses S3 (`createS3MediaStorageAdapter`); development and pre-cutover
 * staging use the local filesystem (`createLocalMediaStorageAdapter`) with
 * identical key structure. Both implementations return relative `/media/{key}`
 * URLs from `constructURL`. The CloudFront `/media/*` cache behavior routes
 * to the S3 bucket via OAC (with a viewer-request function stripping the
 * prefix so S3 sees the bare key). Services call the interface; the getter
 * returns the configured implementation based on `config.mediaStorageAdapter`.
 *
 * Content-agnostic: the adapter handles photos, system-account video bytes,
 * and posters identically. Per DD §1.5.
 */
import { mkdir, writeFile, unlink, access } from 'node:fs/promises';
import * as path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from '../config/env';

export interface MediaStorageAdapter {
  /** Write data to the given storage key, creating directories as needed. */
  put(key: string, data: Buffer): Promise<void>;

  /** Delete the object at the given storage key. No-op if it does not exist. */
  delete(key: string): Promise<void>;

  /** Return a URL suitable for use in templates (e.g. `/media/{key}` or a CloudFront URL). */
  constructURL(key: string): string;

  /** Check whether an object exists at the given storage key. */
  exists(key: string): Promise<boolean>;
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
    async delete(key: string): Promise<void> {
      const filePath = path.join(baseDir, key);
      try {
        await unlink(filePath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },
    constructURL(key: string): string {
      return `/media/${key}`;
    },
    async exists(key: string): Promise<boolean> {
      try {
        await access(path.join(baseDir, key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function createS3MediaStorageAdapter(opts: {
  bucket: string;
  region?: string;
  s3Client?: S3Client;
}): MediaStorageAdapter {
  const client =
    opts.s3Client ?? new S3Client(opts.region ? { region: opts.region } : {});
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
    async delete(key: string): Promise<void> {
      // S3 DeleteObject is idempotent: it returns success whether or not the
      // key existed. No special-case for a missing key.
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    constructURL(key: string): string {
      return `/media/${key}`;
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
