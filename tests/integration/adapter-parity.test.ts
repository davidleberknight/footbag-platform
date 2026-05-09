/**
 * Dev↔staging adapter parity contract.
 *
 * The JwtSigningAdapter, SesAdapter, and MediaStorageAdapter interfaces are
 * the only seam between dev and staging. Both implementations must produce
 * observable outputs with identical structure so the service layer above is
 * free of environment-specific branching. These tests exercise both sides of
 * each seam with injected fake clients standing in for real AWS.
 *
 * Live-AWS parity (kms:Sign, ses:SendEmail actually reaching AWS) is covered
 * in tests/smoke/staging-readiness.test.ts, which is gated behind
 * RUN_STAGING_SMOKE=1 and excluded from the default npm test run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  GetPublicKeyCommand,
  SignCommand,
  type KMSClient,
} from '@aws-sdk/client-kms';
import { SendEmailCommand, type SESClient } from '@aws-sdk/client-ses';
import {
  createLocalJwtAdapter,
  createKmsJwtAdapter,
} from '../../src/adapters/jwtSigningAdapter';
import {
  createStubSesAdapter,
  createLiveSesAdapter,
} from '../../src/adapters/sesAdapter';
import {
  createStubSafeBrowsingAdapter,
  createLiveSafeBrowsingAdapter,
} from '../../src/adapters/safeBrowsingAdapter';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import {
  createLocalMediaStorageAdapter,
  createS3MediaStorageAdapter,
  type MediaStorageAdapter,
} from '../../src/adapters/mediaStorageAdapter';
import {
  createHttpImageAdapter,
  ImageProcessingError,
} from '../../src/adapters/imageProcessingAdapter';
import {
  createHttpVideoTranscodingAdapter,
  VideoTranscodingError,
} from '../../src/adapters/videoTranscodingAdapter';
import sharp from 'sharp';
import { processAvatar } from '../../src/lib/imageProcessing';
import { spawnSync } from 'node:child_process';
import {
  detectVideoFormat,
  transcodeCuratorVideo,
} from '../../src/lib/videoProcessing';

const ffmpegAvailable =
  spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

// Shared shared-secret used by the auth header on web↔image-worker IPC.
const TEST_INTERNAL_SECRET = 'test-internal-event-secret';

// Minimal MediaStorageAdapter test double for adapter-construction tests that
// don't exercise real presigning. Returns deterministic dummy URLs so the
// from-storage wire-shape test can assert what got sent to the worker.
function makeFakeMediaStorage(opts: {
  presignedGet?: (key: string, ttl: number) => Promise<string>;
  presignedPut?: (key: string, contentType: string, ttl: number) => Promise<string>;
} = {}): MediaStorageAdapter {
  return {
    put: async () => {},
    get: async () => Buffer.alloc(0),
    delete: async () => {},
    constructURL: (key) => `/media-store/${key}`,
    exists: async () => false,
    generatePresignedPutUrl: opts.presignedPut ?? (async (key) =>
      `https://fake-presign.example/${key}?put=1`),
    generatePresignedGetUrl: opts.presignedGet ?? (async (key) =>
      `https://fake-presign.example/${key}?get=1`),
  };
}

function makeFakeKmsClient(): KMSClient {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const fake = {
    send: async (cmd: unknown): Promise<unknown> => {
      if (cmd instanceof GetPublicKeyCommand) {
        return { PublicKey: new Uint8Array(publicKey) };
      }
      if (cmd instanceof SignCommand) {
        const message = Buffer.from(cmd.input.Message as Uint8Array);
        const sig = crypto.sign('sha256', message, privateKey);
        return { Signature: new Uint8Array(sig) };
      }
      throw new Error('unexpected KMS command');
    },
  };
  return fake as unknown as KMSClient;
}

function makeFakeSesClient(): { client: SESClient; captured: SendEmailCommand[] } {
  const captured: SendEmailCommand[] = [];
  const fake = {
    send: async (cmd: unknown): Promise<unknown> => {
      if (cmd instanceof SendEmailCommand) {
        captured.push(cmd);
        return { MessageId: `fake-${captured.length}` };
      }
      throw new Error('unexpected SES command');
    },
  };
  return { client: fake as unknown as SESClient, captured };
}

interface CapturedFetchCall {
  url: string;
  init: RequestInit | undefined;
}

function makeFakeSafeBrowsingFetch(
  responseBody: object,
  status = 200,
): { fetch: typeof fetch; captured: CapturedFetchCall[] } {
  const captured: CapturedFetchCall[] = [];
  const fake: typeof fetch = async (input, init) => {
    captured.push({ url: String(input), init });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch: fake, captured };
}

function b64urlDecodeJson(seg: string): Record<string, unknown> {
  const pad = seg.length % 4 === 0 ? '' : '='.repeat(4 - (seg.length % 4));
  const base64 = seg.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

describe('adapter-parity: JwtSigningAdapter (Local vs. KMS wire format)', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jwt-parity-'));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  function makePair() {
    const local = createLocalJwtAdapter({
      keypairPath: path.join(tmpDir, 'keypair.pem'),
      kid: 'local-parity-kid',
    });
    const kms = createKmsJwtAdapter({
      keyId: 'arn:aws:kms:us-east-1:000000000000:key/parity-test',
      kmsClient: makeFakeKmsClient(),
    });
    return { local, kms };
  }

  it('both produce three dot-separated base64url segments', async () => {
    const { local, kms } = makePair();
    const claims = { sub: 'm-1', passwordVersion: 1 };
    const tokens = [await local.signJwt(claims), await kms.signJwt(claims)];
    for (const token of tokens) {
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
      for (const seg of parts) {
        expect(seg).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    }
  });

  it('both emit headers with alg=RS256, typ=JWT, non-empty kid', async () => {
    const { local, kms } = makePair();
    const claims = { sub: 'm-1', passwordVersion: 1 };
    for (const token of [await local.signJwt(claims), await kms.signJwt(claims)]) {
      const header = b64urlDecodeJson(token.split('.')[0]);
      expect(header.alg).toBe('RS256');
      expect(header.typ).toBe('JWT');
      expect(typeof header.kid).toBe('string');
      expect((header.kid as string).length).toBeGreaterThan(0);
    }
  });

  it('both embed sub, passwordVersion, iat, exp in the payload', async () => {
    const { local, kms } = makePair();
    const claims = { sub: 'm-99', passwordVersion: 42 };
    for (const token of [await local.signJwt(claims), await kms.signJwt(claims)]) {
      const payload = b64urlDecodeJson(token.split('.')[1]);
      expect(payload.sub).toBe('m-99');
      expect(payload.passwordVersion).toBe(42);
      expect(typeof payload.iat).toBe('number');
      expect(typeof payload.exp).toBe('number');
      expect(payload.exp as number).toBeGreaterThan(payload.iat as number);
    }
  });

  it('both round-trip their own signatures through verifyJwt', async () => {
    const { local, kms } = makePair();
    const claims = { sub: 'm-1', passwordVersion: 1 };
    const localClaims = await local.verifyJwt(await local.signJwt(claims));
    const kmsClaims = await kms.verifyJwt(await kms.signJwt(claims));
    expect(localClaims).not.toBeNull();
    expect(kmsClaims).not.toBeNull();
    expect(localClaims!.sub).toBe('m-1');
    expect(kmsClaims!.sub).toBe('m-1');
  });

  it('both reject tokens with mismatched signatures', async () => {
    const { local, kms } = makePair();
    const claims = { sub: 'm-1', passwordVersion: 1 };
    const localTok = await local.signJwt(claims);
    const kmsTok = await kms.signJwt(claims);
    // Swapping signatures across signers must fail: different keypairs.
    const [lh, lp] = localTok.split('.');
    const [, , ks] = kmsTok.split('.');
    const crossed = `${lh}.${lp}.${ks}`;
    expect(await local.verifyJwt(crossed)).toBeNull();
  });
});

describe('adapter-parity: SesAdapter (Stub vs. Live interface)', () => {
  it('both return { messageId, deliveredAt } on successful send', async () => {
    const stub = createStubSesAdapter();
    const fakeSes = makeFakeSesClient();
    const live = createLiveSesAdapter({
      fromIdentity: 'noreply@footbag.org',
      sesClient: fakeSes.client,
    });

    const msg = { to: 'user@example.com', subject: 'Hi', bodyText: 'Body' };
    for (const result of [await stub.sendEmail(msg), await live.sendEmail(msg)]) {
      expect(typeof result.messageId).toBe('string');
      expect(result.messageId.length).toBeGreaterThan(0);
      expect(typeof result.deliveredAt).toBe('string');
      expect(Number.isNaN(new Date(result.deliveredAt).getTime())).toBe(false);
    }
  });

  it('both honor the optional per-message from override', async () => {
    const stub = createStubSesAdapter();
    const fakeSes = makeFakeSesClient();
    const live = createLiveSesAdapter({
      fromIdentity: 'default@footbag.org',
      sesClient: fakeSes.client,
    });

    const msg = {
      to: 'u@example.com',
      subject: 'Hi',
      bodyText: 'B',
      from: 'override@footbag.org',
    };
    await stub.sendEmail(msg);
    await live.sendEmail(msg);

    expect(stub.sentMessages[0].from).toBe('override@footbag.org');
    expect(fakeSes.captured[0].input.Source).toBe('override@footbag.org');
  });

  it('both apply the default sender when the message omits from', async () => {
    const stub = createStubSesAdapter();
    const fakeSes = makeFakeSesClient();
    const live = createLiveSesAdapter({
      fromIdentity: 'default@footbag.org',
      sesClient: fakeSes.client,
    });

    const msg = { to: 'u@example.com', subject: 'S', bodyText: 'B' };
    await stub.sendEmail(msg);
    await live.sendEmail(msg);

    // Stub records the original msg (with no from). Live applies the default.
    expect(stub.sentMessages[0].from).toBeUndefined();
    expect(fakeSes.captured[0].input.Source).toBe('default@footbag.org');
  });
});

describe('adapter-parity: SafeBrowsingAdapter (Stub vs. Live interface)', () => {
  it('both return { safe: true, threatTypes: [] } when the URL is not flagged', async () => {
    const stub = createStubSafeBrowsingAdapter();
    const fakeFetch = makeFakeSafeBrowsingFetch({}); // empty matches array
    const live = createLiveSafeBrowsingAdapter({
      apiKey: 'test-key',
      fetchClient: fakeFetch.fetch,
    });

    for (const result of [
      await stub.lookup('https://example.com/'),
      await live.lookup('https://example.com/'),
    ]) {
      expect(result.safe).toBe(true);
      expect(result.threatTypes).toEqual([]);
    }
  });

  it('both return { safe: false, threatTypes } when a match is reported', async () => {
    const stub = createStubSafeBrowsingAdapter();
    stub.addThreat('https://malware.example/', 'MALWARE');
    const fakeFetch = makeFakeSafeBrowsingFetch({
      matches: [{ threatType: 'MALWARE', threat: { url: 'https://malware.example/' } }],
    });
    const live = createLiveSafeBrowsingAdapter({
      apiKey: 'test-key',
      fetchClient: fakeFetch.fetch,
    });

    const stubResult = await stub.lookup('https://malware.example/');
    const liveResult = await live.lookup('https://malware.example/');

    for (const result of [stubResult, liveResult]) {
      expect(result.safe).toBe(false);
      expect(result.threatTypes.length).toBeGreaterThan(0);
      expect(result.threatTypes).toContain('MALWARE');
    }
  });

  it('live adapter posts the threatMatches:find request shape Google v4 expects', async () => {
    const fakeFetch = makeFakeSafeBrowsingFetch({});
    const live = createLiveSafeBrowsingAdapter({
      apiKey: 'test-key',
      fetchClient: fakeFetch.fetch,
    });

    await live.lookup('https://example.com/path');

    expect(fakeFetch.captured).toHaveLength(1);
    const call = fakeFetch.captured[0];
    expect(call.url).toContain('safebrowsing.googleapis.com/v4/threatMatches:find');
    expect(call.url).toContain('key=test-key');
    expect(call.init?.method).toBe('POST');
    const body = JSON.parse(String(call.init?.body));
    expect(body).toHaveProperty('client.clientId');
    expect(body.threatInfo.threatTypes).toContain('MALWARE');
    expect(body.threatInfo.threatEntries[0].url).toBe('https://example.com/path');
  });

  it('live adapter throws on non-2xx HTTP responses (no silent safe-mark)', async () => {
    const fakeFetch = makeFakeSafeBrowsingFetch({ error: 'rate limited' }, 429);
    const live = createLiveSafeBrowsingAdapter({
      apiKey: 'test-key',
      fetchClient: fakeFetch.fetch,
    });
    await expect(live.lookup('https://example.com/')).rejects.toThrow(/HTTP 429/);
  });

  it('stub failNext throws on the next call and clears after one use', async () => {
    const stub = createStubSafeBrowsingAdapter();
    stub.failNext(new Error('boom'));
    await expect(stub.lookup('https://example.com/')).rejects.toThrow('boom');
    // Second call recovers.
    const after = await stub.lookup('https://example.com/');
    expect(after.safe).toBe(true);
  });
});

describe('adapter-parity: MediaStorageAdapter contract', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-parity-'));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('local adapter satisfies put/exists/delete/constructURL', async () => {
    const adapter: MediaStorageAdapter = createLocalMediaStorageAdapter({
      baseDir: tmpDir,
    });
    const key = 'avatars/parity-test.bin';
    expect(await adapter.exists(key)).toBe(false);
    await adapter.put(key, Buffer.from('parity-data'));
    expect(await adapter.exists(key)).toBe(true);
    expect(adapter.constructURL(key)).toContain(key);
    await adapter.delete(key);
    expect(await adapter.exists(key)).toBe(false);
  });

  it('delete is idempotent for a missing key', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir: tmpDir });
    await expect(adapter.delete('never/written.bin')).resolves.toBeUndefined();
  });

  it('local adapter get round-trips bytes written via put', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir: tmpDir });
    const key = 'pending/job1/source.mp4';
    const payload = Buffer.from('fake-mp4-bytes');
    await adapter.put(key, payload);
    const fetched = await adapter.get(key);
    expect(fetched.equals(payload)).toBe(true);
  });

  it('local generatePresignedPutUrl returns a stub URL with content-type and TTL', async () => {
    const adapter = createLocalMediaStorageAdapter({ baseDir: tmpDir });
    const url = await adapter.generatePresignedPutUrl(
      'pending/job1/source.mp4',
      'video/mp4',
      900,
    );
    expect(url).toContain('/_local-presigned-put/pending/job1/source.mp4');
    expect(url).toContain('X-Amz-Algorithm=LOCAL-STUB');
    expect(url).toContain('X-Amz-Expires=900');
    expect(url).toContain('Content-Type=video%2Fmp4');
  });
});

interface FakeS3State {
  client: S3Client;
  puts: PutObjectCommand[];
  gets: GetObjectCommand[];
  deletes: DeleteObjectCommand[];
  heads: HeadObjectCommand[];
  store: Map<string, Buffer>;
}

function makeFakeS3Client(): FakeS3State {
  const puts: PutObjectCommand[] = [];
  const gets: GetObjectCommand[] = [];
  const deletes: DeleteObjectCommand[] = [];
  const heads: HeadObjectCommand[] = [];
  const store = new Map<string, Buffer>();
  const fake = {
    send: async (cmd: unknown): Promise<unknown> => {
      if (cmd instanceof PutObjectCommand) {
        puts.push(cmd);
        const body = cmd.input.Body as Buffer | Uint8Array;
        store.set(
          `${cmd.input.Bucket}/${cmd.input.Key}`,
          Buffer.isBuffer(body) ? body : Buffer.from(body),
        );
        return {};
      }
      if (cmd instanceof GetObjectCommand) {
        gets.push(cmd);
        const lookupKey = `${cmd.input.Bucket}/${cmd.input.Key}`;
        const data = store.get(lookupKey);
        if (!data) {
          const err = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          throw err;
        }
        return { Body: Readable.from([data]) };
      }
      if (cmd instanceof DeleteObjectCommand) {
        deletes.push(cmd);
        store.delete(`${cmd.input.Bucket}/${cmd.input.Key}`);
        return {};
      }
      if (cmd instanceof HeadObjectCommand) {
        heads.push(cmd);
        const lookupKey = `${cmd.input.Bucket}/${cmd.input.Key}`;
        if (store.has(lookupKey)) return {};
        const err = new Error('Not Found');
        err.name = 'NotFound';
        throw err;
      }
      throw new Error('unexpected S3 command');
    },
  };
  return {
    client: fake as unknown as S3Client,
    puts,
    gets,
    deletes,
    heads,
    store,
  };
}

describe('adapter-parity: MediaStorageAdapter S3 contract', () => {
  it('s3 adapter satisfies put/exists/delete/constructURL round-trip', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    const key = 'avatars/m-1/thumb.jpg';
    expect(await adapter.exists(key)).toBe(false);
    await adapter.put(key, Buffer.from('round-trip-bytes'));
    expect(await adapter.exists(key)).toBe(true);
    expect(adapter.constructURL(key)).toBe('/media-store/avatars/m-1/thumb.jpg');
    await adapter.delete(key);
    expect(await adapter.exists(key)).toBe(false);
  });

  it('s3 delete is idempotent for a missing key', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    await expect(adapter.delete('never/written.bin')).resolves.toBeUndefined();
    expect(fake.deletes).toHaveLength(1);
  });

  it('s3 put sends Cache-Control: immutable + ContentType: image/jpeg', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    await adapter.put('avatars/m-2/display.jpg', Buffer.from('bytes'));
    expect(fake.puts).toHaveLength(1);
    const input = fake.puts[0].input;
    expect(input.Bucket).toBe('parity-bucket');
    expect(input.Key).toBe('avatars/m-2/display.jpg');
    expect(input.ContentType).toBe('image/jpeg');
    expect(input.CacheControl).toBe('public, max-age=31536000, immutable');
  });

  it('s3 exists returns false on NotFound', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    expect(await adapter.exists('avatars/missing.jpg')).toBe(false);
    expect(fake.heads).toHaveLength(1);
  });

  it('s3 exists rethrows non-NotFound errors', async () => {
    const accessDeniedClient = {
      send: async () => {
        const err = new Error('Access Denied');
        err.name = 'AccessDenied';
        throw err;
      },
    } as unknown as S3Client;
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: accessDeniedClient,
    });
    await expect(adapter.exists('avatars/x.jpg')).rejects.toMatchObject({
      name: 'AccessDenied',
    });
  });

  it('s3 constructURL returns /media-store/{key} (parity with local)', () => {
    const localAdapter = createLocalMediaStorageAdapter({ baseDir: '/tmp' });
    const s3Adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: makeFakeS3Client().client,
    });
    const key = 'avatars/m-3/thumb.jpg';
    expect(localAdapter.constructURL(key)).toBe('/media-store/avatars/m-3/thumb.jpg');
    expect(s3Adapter.constructURL(key)).toBe('/media-store/avatars/m-3/thumb.jpg');
  });

  it('s3 get streams body to a Buffer matching what put stored', async () => {
    const fake = makeFakeS3Client();
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: fake.client,
    });
    const payload = Buffer.from('source-mp4-bytes');
    await adapter.put('pending/job1/source.mp4', payload);
    const fetched = await adapter.get('pending/job1/source.mp4');
    expect(fetched.equals(payload)).toBe(true);
    expect(fake.gets).toHaveLength(1);
    expect(fake.gets[0].input.Bucket).toBe('parity-bucket');
    expect(fake.gets[0].input.Key).toBe('pending/job1/source.mp4');
  });

  it('s3 generatePresignedPutUrl emits a SigV4 query string with bound ContentType and TTL', async () => {
    // Real S3Client with fake credentials; getSignedUrl signs locally without
    // calling AWS. The fake `send`-only client used elsewhere can't satisfy
    // the SDK's credential resolver, so the presign path uses a real client.
    // requestChecksumCalculation: 'WHEN_REQUIRED' matches the production
    // adapter's client construction; default 'WHEN_SUPPORTED' would inject
    // x-amz-checksum-crc32 of an empty body, which the browser cannot match.
    const realClient = new S3Client({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKIAFAKEACCESSKEY', secretAccessKey: 'fakesecret' },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
    const adapter = createS3MediaStorageAdapter({
      bucket: 'parity-bucket',
      s3Client: realClient,
    });
    const url = await adapter.generatePresignedPutUrl(
      'pending/job1/source.mp4',
      'video/mp4',
      900,
    );
    expect(url).toMatch(/^https:\/\/parity-bucket\.s3\.us-east-1\.amazonaws\.com\/pending\/job1\/source\.mp4\?/);
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(url).toContain('X-Amz-Expires=900');
    // ContentType binding via signableHeaders: shows up in X-Amz-SignedHeaders.
    expect(url).toMatch(/X-Amz-SignedHeaders=[^&]*content-type/);
    // No SDK auto-checksum should appear: it would block browser uploads.
    expect(url).not.toContain('x-amz-checksum-crc32');
    expect(url).not.toContain('x-amz-sdk-checksum-algorithm');
  });
});

describe('adapter-parity: ImageProcessingAdapter contract', () => {
  async function makeJpeg(width = 50, height = 50): Promise<Buffer> {
    return sharp({
      create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg()
      .toBuffer();
  }

  function makeProcessingFakeFetch(): {
    fetchImpl: typeof fetch;
    calls: Array<{ url: string; method: string; contentType: string; bodyLen: number }>;
  } {
    const calls: Array<{ url: string; method: string; contentType: string; bodyLen: number }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const contentType = headers['Content-Type'] ?? headers['content-type'] ?? '';
      const body = init?.body as Buffer | Uint8Array;
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      calls.push({ url, method, contentType, bodyLen: buf.length });
      const processed = await processAvatar(buf);
      return new Response(
        JSON.stringify({
          thumb: processed.thumb.toString('base64'),
          display: processed.display.toString('base64'),
          widthPx: processed.widthPx,
          heightPx: processed.heightPx,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    return { fetchImpl, calls };
  }

  it('round-trips real JPEG bytes through the HTTP boundary', async () => {
    const { fetchImpl, calls } = makeProcessingFakeFetch();
    const adapter = createHttpImageAdapter({ internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    const jpeg = await makeJpeg(100, 80);

    const result = await adapter.processAvatar(jpeg);

    expect(result.widthPx).toBe(100);
    expect(result.heightPx).toBe(80);
    expect(Buffer.isBuffer(result.thumb)).toBe(true);
    expect(Buffer.isBuffer(result.display)).toBe(true);
    expect(result.thumb.length).toBeGreaterThan(0);
    expect(result.display.length).toBeGreaterThan(0);

    // Decode the returned thumb back through Sharp and confirm dimensions.
    const thumbMeta = await sharp(result.thumb).metadata();
    expect(thumbMeta.width).toBe(300);
    expect(thumbMeta.height).toBe(300);
    expect(thumbMeta.format).toBe('jpeg');

    const displayMeta = await sharp(result.display).metadata();
    expect(displayMeta.format).toBe('jpeg');
    expect(displayMeta.width).toBeLessThanOrEqual(800);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://fake/process/avatar');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].contentType).toBe('application/octet-stream');
    expect(calls[0].bodyLen).toBe(jpeg.length);
  });

  it('strips a trailing slash from baseUrl', async () => {
    const { fetchImpl, calls } = makeProcessingFakeFetch();
    const adapter = createHttpImageAdapter({ internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake/', fetchImpl });
    await adapter.processAvatar(await makeJpeg());
    expect(calls[0].url).toBe('http://fake/process/avatar');
  });

  it('throws ImageProcessingError on 400 with image-type message', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'unrecognized image type' }), { status: 400 });
    const adapter = createHttpImageAdapter({ internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.processAvatar(Buffer.from('not-an-image'))).rejects.toMatchObject({
      name: 'ImageProcessingError',
      status: 400,
    });
    await expect(adapter.processAvatar(Buffer.from('not-an-image'))).rejects.toThrow(
      /image type/,
    );
  });

  it('throws ImageProcessingError on 503', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'busy' }), { status: 503 });
    const adapter = createHttpImageAdapter({ internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.processAvatar(await makeJpeg())).rejects.toMatchObject({
      name: 'ImageProcessingError',
      status: 503,
    });
  });

  it('throws on timeout', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const adapter = createHttpImageAdapter({
      internalSecret: TEST_INTERNAL_SECRET,
      baseUrl: 'http://fake',
      fetchImpl,
      timeoutMs: 50,
    });
    const err = await adapter.processAvatar(await makeJpeg()).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(ImageProcessingError);
    expect((err as Error).message).toMatch(/timed out/);
  });

  it('wraps fetch transport errors as ImageProcessingError', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const adapter = createHttpImageAdapter({ internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.processAvatar(await makeJpeg())).rejects.toMatchObject({
      name: 'ImageProcessingError',
    });
    await expect(adapter.processAvatar(await makeJpeg())).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe('adapter-parity: VideoTranscodingAdapter contract', () => {
  function makeTinyMp4(): Buffer {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-parity-'));
    const outPath = path.join(tmpDir, 'tiny.mp4');
    try {
      const r = spawnSync(
        'ffmpeg',
        [
          '-f', 'lavfi',
          '-i', 'color=c=blue:s=64x64:d=0.2:r=10',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-y',
          outPath,
        ],
        { stdio: 'ignore' },
      );
      if (r.status !== 0) throw new Error('ffmpeg synth failed');
      return fs.readFileSync(outPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  function makeTranscodingFakeFetch(): {
    fetchImpl: typeof fetch;
    calls: Array<{ url: string; method: string; contentType: string; bodyLen: number }>;
  } {
    const calls: Array<{ url: string; method: string; contentType: string; bodyLen: number }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const contentType = headers['Content-Type'] ?? headers['content-type'] ?? '';
      const body = init?.body as Buffer | Uint8Array;
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      calls.push({ url, method, contentType, bodyLen: buf.length });
      // Run the real ffmpeg pipeline inline so the bytes round-tripping
      // through the adapter are real mp4. Mirrors the Sharp parity test.
      const result = await transcodeCuratorVideo(buf);
      return new Response(
        JSON.stringify({
          bytes: result.bytes.toString('base64'),
          outputFormat: result.outputFormat,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    return { fetchImpl, calls };
  }

  it.skipIf(!ffmpegAvailable)(
    'round-trips real mp4 bytes through the HTTP boundary',
    async () => {
      const { fetchImpl, calls } = makeTranscodingFakeFetch();
      const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
      const mp4 = makeTinyMp4();

      const result = await adapter.transcode(mp4);

      expect(Buffer.isBuffer(result.bytes)).toBe(true);
      expect(result.bytes.length).toBeGreaterThan(0);
      expect(result.outputFormat).toBe('mp4');
      expect(detectVideoFormat(result.bytes)).toBe('mp4');

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('http://fake/process/video');
      expect(calls[0].method).toBe('POST');
      expect(calls[0].contentType).toBe('application/octet-stream');
      expect(calls[0].bodyLen).toBe(mp4.length);
    },
  );

  it.skipIf(!ffmpegAvailable)(
    'strips a trailing slash from baseUrl',
    async () => {
      const { fetchImpl, calls } = makeTranscodingFakeFetch();
      const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake/', fetchImpl });
      await adapter.transcode(makeTinyMp4());
      expect(calls[0].url).toBe('http://fake/process/video');
    },
  );

  it('throws VideoTranscodingError on 400 with rejected-video message', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'unrecognized video format' }), { status: 400 });
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcode(Buffer.from('not-a-video'))).rejects.toMatchObject({
      name: 'VideoTranscodingError',
      status: 400,
    });
    await expect(adapter.transcode(Buffer.from('not-a-video'))).rejects.toThrow(/rejected video/);
  });

  it('throws VideoTranscodingError on 503', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'busy' }), { status: 503 });
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcode(Buffer.from('payload'))).rejects.toMatchObject({
      name: 'VideoTranscodingError',
      status: 503,
    });
  });

  it('throws on timeout', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const adapter = createHttpVideoTranscodingAdapter({
      mediaStorage: makeFakeMediaStorage(),
      internalSecret: TEST_INTERNAL_SECRET,
      baseUrl: 'http://fake',
      fetchImpl,
      timeoutMs: 50,
    });
    const err = await adapter.transcode(Buffer.from('payload')).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(VideoTranscodingError);
    expect((err as Error).message).toMatch(/timed out/);
  });

  it('wraps fetch transport errors as VideoTranscodingError', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcode(Buffer.from('payload'))).rejects.toMatchObject({
      name: 'VideoTranscodingError',
    });
    await expect(adapter.transcode(Buffer.from('payload'))).rejects.toThrow(/ECONNREFUSED/);
  });

  // ── transcodeFromStorage method ────────────────────────────────────────
  // The from-storage variant presigns the S3 GET (source) + PUT (output) on
  // the web side and ships opaque URLs to the image worker. Bytes never
  // traverse the dispatching process; the image worker holds no AWS creds.
  // SEC-D02 / SEC-A17.

  it('transcodeFromStorage: presigns sourceKey/outputKey, POSTs URLs + auth header', async () => {
    const calls: Array<{ url: string; method: string; contentType: string; secret: string; body: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const contentType = headers['Content-Type'] ?? headers['content-type'] ?? '';
      const secret = headers['x-internal-secret'] ?? headers['X-Internal-Secret'] ?? '';
      const body = typeof init?.body === 'string' ? init.body : '';
      calls.push({ url, method, contentType, secret, body });
      return new Response(
        JSON.stringify({
          ok: true,
          outputKey: 'system_member/detached/media_xxx-video.mp4',
          outputFormat: 'mp4',
          outputBytes: 12345,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    // Capture the keys the adapter tries to presign so we can assert it
    // forwarded the caller's keys to the storage adapter (vs. some other
    // value being injected upstream).
    const presignedKeys: { gets: string[]; puts: Array<{ key: string; ct: string }> } = {
      gets: [],
      puts: [],
    };
    const mediaStorage = makeFakeMediaStorage({
      presignedGet: async (key) => {
        presignedKeys.gets.push(key);
        return `https://fake-presign.example/${key}?get=1`;
      },
      presignedPut: async (key, ct) => {
        presignedKeys.puts.push({ key, ct });
        return `https://fake-presign.example/${key}?put=1`;
      },
    });
    const adapter = createHttpVideoTranscodingAdapter({
      mediaStorage,
      internalSecret: TEST_INTERNAL_SECRET,
      baseUrl: 'http://fake',
      fetchImpl,
    });
    const result = await adapter.transcodeFromStorage(
      'pending/job-x/source.mp4',
      'system_member/detached/media_xxx-video.mp4',
    );
    expect(result.outputKey).toBe('system_member/detached/media_xxx-video.mp4');
    expect(result.outputFormat).toBe('mp4');
    expect(result.outputBytes).toBe(12345);

    // Caller's keys reached the storage adapter for presigning.
    expect(presignedKeys.gets).toEqual(['pending/job-x/source.mp4']);
    expect(presignedKeys.puts).toEqual([
      { key: 'system_member/detached/media_xxx-video.mp4', ct: 'video/mp4' },
    ]);

    // Worker received URLs + auth header, not the raw keys.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://fake/process/video-from-storage');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].contentType).toBe('application/json');
    expect(calls[0].secret).toBe(TEST_INTERNAL_SECRET);
    const parsed = JSON.parse(calls[0].body) as {
      sourceUrl?: string;
      putUrl?: string;
      putContentType?: string;
      sourceKey?: string;
      outputKey?: string;
    };
    expect(parsed.sourceUrl).toBe('https://fake-presign.example/pending/job-x/source.mp4?get=1');
    expect(parsed.putUrl).toBe('https://fake-presign.example/system_member/detached/media_xxx-video.mp4?put=1');
    expect(parsed.putContentType).toBe('video/mp4');
    expect(parsed.outputKey).toBe('system_member/detached/media_xxx-video.mp4');
    // Old wire shape must NOT be present (regression guard for SEC-A17).
    expect(parsed.sourceKey).toBeUndefined();
  });

  it('transcodeFromStorage + transcode: every image-worker call carries x-internal-secret', async () => {
    const seenSecrets: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seenSecrets.push(headers['x-internal-secret'] ?? '');
      return new Response(
        JSON.stringify({
          ok: true,
          outputKey: 'k',
          outputFormat: 'mp4',
          outputBytes: 0,
          bytes: '',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const adapter = createHttpVideoTranscodingAdapter({
      mediaStorage: makeFakeMediaStorage(),
      internalSecret: TEST_INTERNAL_SECRET,
      baseUrl: 'http://fake',
      fetchImpl,
    });
    await adapter.transcode(Buffer.from('payload')).catch(() => {});
    await adapter.transcodeFromStorage('a', 'b').catch(() => {});
    expect(seenSecrets).toHaveLength(2);
    for (const s of seenSecrets) {
      expect(s).toBe(TEST_INTERNAL_SECRET);
    }
  });

  it('transcodeFromStorage: throws VideoTranscodingError on 400 with rejected-job message', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'unrecognized video format' }), { status: 400 });
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toMatchObject({
      name: 'VideoTranscodingError',
      status: 400,
    });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toThrow(/rejected job/);
  });

  it('transcodeFromStorage: throws VideoTranscodingError on 413 (oversized source)', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'source object exceeds videoMaxBytes' }), { status: 413 });
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toMatchObject({
      name: 'VideoTranscodingError',
      status: 413,
    });
  });

  it('transcodeFromStorage: throws VideoTranscodingError on 502 (s3 get failed)', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 's3 get failed: NoSuchKey' }), { status: 502 });
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toMatchObject({
      name: 'VideoTranscodingError',
      status: 502,
    });
  });

  it('transcodeFromStorage: wraps fetch transport errors', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const adapter = createHttpVideoTranscodingAdapter({ mediaStorage: makeFakeMediaStorage(), internalSecret: TEST_INTERNAL_SECRET, baseUrl: 'http://fake', fetchImpl });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toThrow(/ECONNREFUSED/);
  });

  it('transcodeFromStorage: throws on timeout', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const adapter = createHttpVideoTranscodingAdapter({
      mediaStorage: makeFakeMediaStorage(),
      internalSecret: TEST_INTERNAL_SECRET,
      baseUrl: 'http://fake',
      fetchImpl,
      timeoutMs: 50,
    });
    await expect(adapter.transcodeFromStorage('a', 'b')).rejects.toThrow(/timed out/);
  });
});
