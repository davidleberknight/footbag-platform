/**
 * Integration tests for the image worker HTTP boundary.
 *
 * Boots the worker Express app via supertest (no real port), exercises the
 * /process/avatar wire format and the /health probe, and verifies the
 * concurrency semaphore returns 503 when the in-flight cap is exhausted.
 */
import { describe, it, expect } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import sharp from 'sharp';
import { createImageWorkerApp } from '../../src/imageWorker';
import { processAvatar, processPhoto } from '../../src/lib/imageProcessing';

// Tests pass this secret on `x-internal-secret` so /process/* routes admit the
// request. setup-env.ts also defaults INTERNAL_EVENT_SECRET to this value
// process-wide; the literal here is only for the explicit `internalSecret`
// override path used by some tests.
const TEST_SECRET = 'test-internal-event-secret';

async function makeJpeg(width = 256, height = 256): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 80, g: 120, b: 160 } },
  })
    .jpeg()
    .toBuffer();
}

describe('GET /health', () => {
  it('returns 200 with status:ok', async () => {
    const app = createImageWorkerApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /process/avatar', () => {
  it('returns processed thumb + display + dimensions for a valid JPEG', async () => {
    const app = createImageWorkerApp();
    const jpeg = await makeJpeg(320, 240);

    const res = await request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg);

    expect(res.status).toBe(200);
    expect(res.body.widthPx).toBe(320);
    expect(res.body.heightPx).toBe(240);
    expect(typeof res.body.thumb).toBe('string');
    expect(typeof res.body.display).toBe('string');

    const thumb = Buffer.from(res.body.thumb, 'base64');
    const display = Buffer.from(res.body.display, 'base64');
    const thumbMeta = await sharp(thumb).metadata();
    const displayMeta = await sharp(display).metadata();
    expect(thumbMeta.format).toBe('jpeg');
    expect(thumbMeta.width).toBe(300);
    expect(thumbMeta.height).toBe(300);
    expect(displayMeta.format).toBe('jpeg');
  });

  it('rejects non-image body with 400', async () => {
    const app = createImageWorkerApp();
    const res = await request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(Buffer.from('this is not an image'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unrecognized image type/);
  });

  it('rejects empty body with 400', async () => {
    const app = createImageWorkerApp();
    const res = await request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(Buffer.alloc(0));
    expect(res.status).toBe(400);
  });

  it('returns 413 for payload over 5 MB', async () => {
    const app = createImageWorkerApp();
    const oversized = Buffer.alloc(6 * 1024 * 1024, 0xff);
    const res = await request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(oversized);
    expect(res.status).toBe(413);
  });

  it('returns 503 when concurrency cap is exhausted', async () => {
    let firstAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => {
      firstAcquired = resolve;
    });
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });

    const app = createImageWorkerApp({
      maxConcurrent: 1,
      semaphoreWaitMs: 200,
      processAvatarImpl: async (data) => {
        firstAcquired();
        await blocker;
        return processAvatar(data);
      },
    });

    const jpeg = await makeJpeg();
    // Fire first request; .then() triggers supertest's .end(). Don't await yet.
    const firstP = request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg)
      .then((r) => r);

    // Wait until the first request has acquired the semaphore slot.
    await acquired;

    const secondRes = await request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg);
    expect(secondRes.status).toBe(503);
    expect(secondRes.headers['retry-after']).toBe('1');

    release();
    const firstRes = await firstP;
    expect(firstRes.status).toBe(200);
  });

  it('returns 500 when the processing impl throws', async () => {
    const app = createImageWorkerApp({
      processAvatarImpl: async () => {
        throw new Error('sharp blew up');
      },
    });
    const res = await request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(await makeJpeg());
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/sharp blew up/);
  });

  it('admits up to maxConcurrent requests in parallel without queueing', async () => {
    let inFlightPeak = 0;
    let inFlight = 0;
    const app = createImageWorkerApp({
      maxConcurrent: 2,
      semaphoreWaitMs: 200,
      processAvatarImpl: async (data) => {
        inFlight++;
        if (inFlight > inFlightPeak) inFlightPeak = inFlight;
        await new Promise((r) => setTimeout(r, 30));
        try {
          return await processAvatar(data);
        } finally {
          inFlight--;
        }
      },
    });

    const jpeg = await makeJpeg();
    const fire = () =>
      request(app)
        .post('/process/avatar')
        .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
        .send(jpeg);
    const [a, b] = await Promise.all([fire(), fire()]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(inFlightPeak).toBe(2);
  });

  it('queued requests acquire the slot when a holder releases before timeout', async () => {
    let firstAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => {
      firstAcquired = resolve;
    });
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });

    let callCount = 0;
    const app = createImageWorkerApp({
      maxConcurrent: 1,
      semaphoreWaitMs: 1000,
      processAvatarImpl: async (data) => {
        callCount++;
        if (callCount === 1) {
          firstAcquired();
          await blocker;
        }
        return processAvatar(data);
      },
    });

    const jpeg = await makeJpeg();
    const firstP = request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg)
      .then((r) => r);
    await acquired;

    const secondP = request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg)
      .then((r) => r);

    await new Promise((r) => setTimeout(r, 50));
    release();

    const [firstRes, secondRes] = await Promise.all([firstP, secondP]);
    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
  });

  it('returns 503 for every surplus request that arrives while the cap is held', async () => {
    let firstAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => {
      firstAcquired = resolve;
    });
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });

    const app = createImageWorkerApp({
      maxConcurrent: 1,
      semaphoreWaitMs: 100,
      processAvatarImpl: async (data) => {
        firstAcquired();
        await blocker;
        return processAvatar(data);
      },
    });

    const jpeg = await makeJpeg();
    const firstP = request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg)
      .then((r) => r);
    await acquired;

    const surplus = await Promise.all(
      [0, 1, 2].map(() =>
        request(app)
          .post('/process/avatar')
          .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
          .send(jpeg),
      ),
    );

    for (const res of surplus) {
      expect(res.status).toBe(503);
      expect(res.headers['retry-after']).toBe('1');
    }

    release();
    const firstRes = await firstP;
    expect(firstRes.status).toBe(200);
  });

  it('releases the slot to queued waiters when the holder throws', async () => {
    let firstAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => {
      firstAcquired = resolve;
    });
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });

    let callCount = 0;
    const app = createImageWorkerApp({
      maxConcurrent: 1,
      semaphoreWaitMs: 1000,
      processAvatarImpl: async (data) => {
        callCount++;
        if (callCount === 1) {
          firstAcquired();
          await blocker;
          throw new Error('holder failed mid-process');
        }
        return processAvatar(data);
      },
    });

    const jpeg = await makeJpeg();
    const firstP = request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg)
      .then((r) => r);
    await acquired;

    const secondP = request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg)
      .then((r) => r);
    await new Promise((r) => setTimeout(r, 50));

    release();

    const [firstRes, secondRes] = await Promise.all([firstP, secondP]);
    expect(firstRes.status).toBe(500);
    expect(secondRes.status).toBe(200);
  });
});

describe('POST /process/photo', () => {
  it('returns processed thumb + display + dimensions for a valid JPEG', async () => {
    const app = createImageWorkerApp();
    const jpeg = await makeJpeg(320, 240);

    const res = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg);

    expect(res.status).toBe(200);
    expect(res.body.widthPx).toBe(320);
    expect(res.body.heightPx).toBe(240);
    expect(typeof res.body.thumb).toBe('string');
    expect(typeof res.body.display).toBe('string');
  });

  it('produces an aspect-preserving thumb (not a cover-crop)', async () => {
    const app = createImageWorkerApp();
    // 1000x500 input — a cover-crop thumb would be 300x300; a longest-edge
    // thumb preserves the 2:1 aspect → 300x150.
    const jpeg = await makeJpeg(1000, 500);
    const res = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg);
    expect(res.status).toBe(200);

    const thumb = Buffer.from(res.body.thumb, 'base64');
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(150);
  });

  it('rejects non-image body with 400', async () => {
    const app = createImageWorkerApp();
    const res = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(Buffer.from('this is not an image'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unrecognized image type/);
  });

  it('rejects empty body with 400', async () => {
    const app = createImageWorkerApp();
    const res = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(Buffer.alloc(0));
    expect(res.status).toBe(400);
  });

  it('returns 413 for payload over 25 MB', async () => {
    const app = createImageWorkerApp();
    const oversized = Buffer.alloc(26 * 1024 * 1024, 0xff);
    const res = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(oversized);
    expect(res.status).toBe(413);
  });

  it('returns 500 when the processing impl throws', async () => {
    const app = createImageWorkerApp({
      processPhotoImpl: async () => {
        throw new Error('sharp blew up');
      },
    });
    const res = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(await makeJpeg());
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/sharp blew up/);
  });

  it('shares the semaphore with /process/avatar (busy avatar slot blocks photo)', async () => {
    let firstAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => {
      firstAcquired = resolve;
    });
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });

    const app = createImageWorkerApp({
      maxConcurrent: 1,
      semaphoreWaitMs: 100,
      processAvatarImpl: async (data) => {
        firstAcquired();
        await blocker;
        return processAvatar(data);
      },
    });

    const jpeg = await makeJpeg();
    const avatarP = request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg)
      .then((r) => r);
    await acquired;

    const photoRes = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg);
    expect(photoRes.status).toBe(503);

    release();
    const avatarRes = await avatarP;
    expect(avatarRes.status).toBe(200);
  });

  it('processPhotoImpl test seam is honored', async () => {
    let invoked = false;
    const app = createImageWorkerApp({
      processPhotoImpl: async (data) => {
        invoked = true;
        return processPhoto(data);
      },
    });
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
      .set('x-internal-secret', TEST_SECRET)
      .send(jpeg);
    expect(res.status).toBe(200);
    expect(invoked).toBe(true);
  });
});

describe('POST /process/video-from-storage', () => {
  // Minimal valid mp4 magic so detectVideoFormat accepts the source bytes.
  function makeFakeMp4(): Buffer {
    const buf = Buffer.alloc(32);
    buf.write('ftyp', 4, 'ascii');
    buf.write('isom', 8, 'ascii');
    return buf;
  }

  // The image worker GETs the source URL and PUTs the output URL via fetch
  // (no AWS SDK in the worker). The fake fetch maps source URLs to source
  // bytes, records PUT bodies, and supports custom error injection.
  function makeFakeFetch(opts: {
    sources?: Record<string, Buffer>;
    putResponseStatus?: number;
    sourceResponseStatus?: number; // override 200 → 5xx for failure paths
    sourceContentLength?: string;  // override the response Content-Length
  } = {}): {
    fetchImpl: typeof fetch;
    puts: Array<{ url: string; bytes: number; contentType: string }>;
  } {
    const sources = new Map<string, Buffer>(Object.entries(opts.sources ?? {}));
    const puts: Array<{ url: string; bytes: number; contentType: string }> = [];
    const fetchImpl: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'PUT') {
        if ((opts.putResponseStatus ?? 200) >= 400) {
          return new Response('upload denied', { status: opts.putResponseStatus! });
        }
        const body = init?.body as Uint8Array | Buffer | string | undefined;
        const headers = (init?.headers ?? {}) as Record<string, string>;
        const ct = headers['Content-Type'] ?? headers['content-type'] ?? '';
        const buf =
          body instanceof Uint8Array ? Buffer.from(body) :
          typeof body === 'string' ? Buffer.from(body) : Buffer.alloc(0);
        puts.push({ url, bytes: buf.length, contentType: ct });
        return new Response('', { status: 200 });
      }
      // GET path
      if ((opts.sourceResponseStatus ?? 200) >= 400) {
        return new Response('not found', { status: opts.sourceResponseStatus! });
      }
      const buf = sources.get(url);
      if (!buf) return new Response('not found', { status: 404 });
      const headers = new Headers();
      headers.set('content-length',
        opts.sourceContentLength ?? String(buf.length));
      return new Response(buf as unknown as BodyInit, { status: 200, headers });
    }) as typeof fetch;
    return { fetchImpl, puts };
  }

  const SOURCE_URL = 'https://test-bucket.s3.amazonaws.com/pending/job-x/source.mp4?X-Amz-Algorithm=...';
  const PUT_URL = 'https://test-bucket.s3.amazonaws.com/system_member/detached/media_xyz-video.mp4?X-Amz-Algorithm=...';

  it('returns 400 when sourceUrl is missing or not http(s)', async () => {
    const app = createImageWorkerApp({ internalSecret: TEST_SECRET });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ putUrl: PUT_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sourceUrl required/);
  });

  it('returns 400 when sourceUrl is a local-stub URL (rejects non-http schemes)', async () => {
    const app = createImageWorkerApp({ internalSecret: TEST_SECRET });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({
        sourceUrl: '/_local-presigned-get/foo?X-Amz-Algorithm=LOCAL-STUB',
        putUrl: PUT_URL,
        putContentType: 'video/mp4',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sourceUrl required/);
  });

  it('returns 400 when putUrl is missing or not http(s)', async () => {
    const app = createImageWorkerApp({ internalSecret: TEST_SECRET });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/putUrl required/);
  });

  it('returns 400 when putContentType is missing', async () => {
    const app = createImageWorkerApp({ internalSecret: TEST_SECRET });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putUrl: PUT_URL });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/putContentType required/);
  });

  it('returns 502 when source GET returns non-OK', async () => {
    const { fetchImpl } = makeFakeFetch({ sourceResponseStatus: 403 });
    const app = createImageWorkerApp({ internalSecret: TEST_SECRET, fetchImpl });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putUrl: PUT_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/s3 get failed: 403/);
  });

  it('returns 502 when fetch throws on the source GET', async () => {
    const fetchImpl: typeof fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const app = createImageWorkerApp({ internalSecret: TEST_SECRET, fetchImpl });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putUrl: PUT_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/s3 get failed: ECONNREFUSED/);
  });

  it('returns 400 when source object is empty', async () => {
    const { fetchImpl } = makeFakeFetch({ sources: { [SOURCE_URL]: Buffer.alloc(0) } });
    const app = createImageWorkerApp({ internalSecret: TEST_SECRET, fetchImpl });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putUrl: PUT_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/);
  });

  it('returns 413 when Content-Length advertises oversize before download', async () => {
    const { fetchImpl } = makeFakeFetch({
      sources: { [SOURCE_URL]: makeFakeMp4() },
      sourceContentLength: '99999999', // far exceeds default videoMaxBytes
    });
    const app = createImageWorkerApp({
      internalSecret: TEST_SECRET,
      fetchImpl,
      videoMaxBytes: 1024,
    });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putUrl: PUT_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/exceeds videoMaxBytes/);
  });

  it('returns 413 when downloaded buffer exceeds videoMaxBytes (no Content-Length)', async () => {
    const oversized = Buffer.alloc(1025);
    oversized.write('ftyp', 4, 'ascii');
    oversized.write('isom', 8, 'ascii');
    const { fetchImpl } = makeFakeFetch({
      sources: { [SOURCE_URL]: oversized },
      sourceContentLength: '', // empty → falls through to post-read buffer check
    });
    const app = createImageWorkerApp({
      internalSecret: TEST_SECRET,
      fetchImpl,
      videoMaxBytes: 1024,
    });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putUrl: PUT_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/exceeds videoMaxBytes/);
  });

  it('returns 400 when source bytes do not match a known video magic', async () => {
    const { fetchImpl } = makeFakeFetch({
      sources: { [SOURCE_URL]: Buffer.from('not a video at all') },
    });
    const app = createImageWorkerApp({ internalSecret: TEST_SECRET, fetchImpl });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putUrl: PUT_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unrecognized video format/);
  });

  it('happy path: GETs source, transcodes, PUTs to putUrl, returns metadata', async () => {
    const source = makeFakeMp4();
    const { fetchImpl, puts } = makeFakeFetch({ sources: { [SOURCE_URL]: source } });
    const app = createImageWorkerApp({
      internalSecret: TEST_SECRET,
      fetchImpl,
      transcodeVideoImpl: async (_data) => ({
        bytes: Buffer.from('transcoded-bytes-here'),
        outputFormat: 'mp4',
      }),
    });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({
        sourceUrl: SOURCE_URL,
        putUrl: PUT_URL,
        putContentType: 'video/mp4',
        outputKey: 'system_member/detached/media_xyz-video.mp4',
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.outputKey).toBe('system_member/detached/media_xyz-video.mp4');
    expect(res.body.outputFormat).toBe('mp4');
    expect(res.body.outputBytes).toBe('transcoded-bytes-here'.length);
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toBe(PUT_URL);
    expect(puts[0].contentType).toBe('video/mp4');
    expect(puts[0].bytes).toBe('transcoded-bytes-here'.length);
  });

  it('returns 500 when the PUT to putUrl fails', async () => {
    const { fetchImpl } = makeFakeFetch({
      sources: { [SOURCE_URL]: makeFakeMp4() },
      putResponseStatus: 403,
    });
    const app = createImageWorkerApp({
      internalSecret: TEST_SECRET,
      fetchImpl,
      transcodeVideoImpl: async () => ({
        bytes: Buffer.from('transcoded'),
        outputFormat: 'mp4',
      }),
    });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putUrl: PUT_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/s3 put failed: 403/);
  });

  it('passes env-derived libx264 tuning into the transcode call', async () => {
    const { fetchImpl } = makeFakeFetch({ sources: { [SOURCE_URL]: makeFakeMp4() } });
    let captured: unknown = null;
    const app = createImageWorkerApp({
      internalSecret: TEST_SECRET,
      fetchImpl,
      videoTuning: { preset: 'veryfast', threads: 1, rcLookahead: 10 },
      transcodeVideoImpl: async (_data, tuning) => {
        captured = tuning;
        return { bytes: Buffer.from('x'), outputFormat: 'mp4' };
      },
    });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putUrl: PUT_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(200);
    expect(captured).toEqual({ preset: 'veryfast', threads: 1, rcLookahead: 10 });
  });

  it('propagates 500 when the transcode implementation throws', async () => {
    const { fetchImpl } = makeFakeFetch({ sources: { [SOURCE_URL]: makeFakeMp4() } });
    const app = createImageWorkerApp({
      internalSecret: TEST_SECRET,
      fetchImpl,
      transcodeVideoImpl: async () => {
        throw new Error('ffmpeg exited with code null: kaboom');
      },
    });
    const res = await request(app)
      .post('/process/video-from-storage')
      .set('x-internal-secret', TEST_SECRET)
      .send({ sourceUrl: SOURCE_URL, putUrl: PUT_URL, putContentType: 'video/mp4' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/ffmpeg exited/);
  });
});

describe('Auth gate (x-internal-secret) on /process/*', () => {
  const ROUTES: Array<['avatar' | 'photo' | 'video' | 'video-from-storage', () => Promise<Buffer> | Buffer | object, string]> = [
    ['avatar', async () => makeJpeg(), 'application/octet-stream'],
    ['photo', async () => makeJpeg(), 'application/octet-stream'],
    ['video', () => Buffer.from('payload-bytes'), 'application/octet-stream'],
    ['video-from-storage', () => ({ sourceUrl: 'https://x', putUrl: 'https://y', putContentType: 'video/mp4' }), 'application/json'],
  ];

  for (const [route, makeBody, contentType] of ROUTES) {
    it(`/process/${route}: returns 401 when x-internal-secret is missing`, async () => {
      const app = createImageWorkerApp({ internalSecret: TEST_SECRET });
      const body = await makeBody();
      const req = request(app).post(`/process/${route}`).set('Content-Type', contentType);
      const res = await (Buffer.isBuffer(body) ? req.send(body) : req.send(body as object));
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/);
    });

    it(`/process/${route}: returns 401 when x-internal-secret is wrong`, async () => {
      const app = createImageWorkerApp({ internalSecret: TEST_SECRET });
      const body = await makeBody();
      const req = request(app)
        .post(`/process/${route}`)
        .set('Content-Type', contentType)
        .set('x-internal-secret', 'WRONG');
      const res = await (Buffer.isBuffer(body) ? req.send(body) : req.send(body as object));
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/);
    });

    it(`/process/${route}: returns 503 when INTERNAL_EVENT_SECRET is unconfigured`, async () => {
      // Override to empty string so the worker cannot construct a valid check.
      const app = createImageWorkerApp({ internalSecret: '' });
      const body = await makeBody();
      const req = request(app)
        .post(`/process/${route}`)
        .set('Content-Type', contentType)
        .set('x-internal-secret', TEST_SECRET);
      const res = await (Buffer.isBuffer(body) ? req.send(body) : req.send(body as object));
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/INTERNAL_EVENT_SECRET not configured/);
    });
  }

  it('/health is not gated by the secret (liveness probe must work without it)', async () => {
    const app = createImageWorkerApp({ internalSecret: TEST_SECRET });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
