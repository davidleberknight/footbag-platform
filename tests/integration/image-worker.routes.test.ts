/**
 * Integration tests for the image worker HTTP boundary.
 *
 * Boots the worker Express app via supertest (no real port), exercises the
 * /process/avatar wire format and the /health probe, and verifies the
 * concurrency semaphore returns 503 when the in-flight cap is exhausted.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { createImageWorkerApp } from '../../src/imageWorker';
import { processAvatar, processPhoto } from '../../src/lib/imageProcessing';

async function makeJpeg(width = 50, height = 50): Promise<Buffer> {
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
    const jpeg = await makeJpeg(120, 90);

    const res = await request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .send(jpeg);

    expect(res.status).toBe(200);
    expect(res.body.widthPx).toBe(120);
    expect(res.body.heightPx).toBe(90);
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
      .send(Buffer.from('this is not an image'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unrecognized image type/);
  });

  it('rejects empty body with 400', async () => {
    const app = createImageWorkerApp();
    const res = await request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(0));
    expect(res.status).toBe(400);
  });

  it('returns 413 for payload over 5 MB', async () => {
    const app = createImageWorkerApp();
    const oversized = Buffer.alloc(6 * 1024 * 1024, 0xff);
    const res = await request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
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
      .send(jpeg)
      .then((r) => r);

    // Wait until the first request has acquired the semaphore slot.
    await acquired;

    const secondRes = await request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
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
      .send(jpeg)
      .then((r) => r);
    await acquired;

    const secondP = request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
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
      .send(jpeg)
      .then((r) => r);
    await acquired;

    const surplus = await Promise.all(
      [0, 1, 2].map(() =>
        request(app)
          .post('/process/avatar')
          .set('Content-Type', 'application/octet-stream')
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
      .send(jpeg)
      .then((r) => r);
    await acquired;

    const secondP = request(app)
      .post('/process/avatar')
      .set('Content-Type', 'application/octet-stream')
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
    const jpeg = await makeJpeg(120, 90);

    const res = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
      .send(jpeg);

    expect(res.status).toBe(200);
    expect(res.body.widthPx).toBe(120);
    expect(res.body.heightPx).toBe(90);
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
      .send(Buffer.from('this is not an image'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unrecognized image type/);
  });

  it('rejects empty body with 400', async () => {
    const app = createImageWorkerApp();
    const res = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(0));
    expect(res.status).toBe(400);
  });

  it('returns 413 for payload over 25 MB', async () => {
    const app = createImageWorkerApp();
    const oversized = Buffer.alloc(26 * 1024 * 1024, 0xff);
    const res = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
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
      .send(jpeg)
      .then((r) => r);
    await acquired;

    const photoRes = await request(app)
      .post('/process/photo')
      .set('Content-Type', 'application/octet-stream')
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

  function makeStubS3Storage(initial: Record<string, Buffer> = {}): {
    get(key: string): Promise<Buffer>;
    put(key: string, data: Buffer): Promise<void>;
    puts: Array<{ key: string; bytes: number }>;
  } {
    const objects = new Map<string, Buffer>(Object.entries(initial));
    const puts: Array<{ key: string; bytes: number }> = [];
    return {
      async get(key: string) {
        const buf = objects.get(key);
        if (!buf) throw new Error(`NoSuchKey: ${key}`);
        return buf;
      },
      async put(key: string, data: Buffer) {
        objects.set(key, data);
        puts.push({ key, bytes: data.length });
      },
      puts,
    };
  }

  it('returns 503 when no S3 storage is configured', async () => {
    const app = createImageWorkerApp({ s3StorageClient: null });
    const res = await request(app)
      .post('/process/video-from-storage')
      .send({ sourceKey: 'a', outputKey: 'b' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/s3 storage not configured/);
  });

  it('returns 400 when sourceKey is missing or empty', async () => {
    const s3 = makeStubS3Storage();
    const app = createImageWorkerApp({ s3StorageClient: s3 });
    const res = await request(app)
      .post('/process/video-from-storage')
      .send({ outputKey: 'b' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sourceKey required/);
  });

  it('returns 400 when outputKey is missing or empty', async () => {
    const s3 = makeStubS3Storage();
    const app = createImageWorkerApp({ s3StorageClient: s3 });
    const res = await request(app)
      .post('/process/video-from-storage')
      .send({ sourceKey: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/outputKey required/);
  });

  it('returns 502 when S3 GET fails', async () => {
    const s3 = makeStubS3Storage();
    const app = createImageWorkerApp({ s3StorageClient: s3 });
    const res = await request(app)
      .post('/process/video-from-storage')
      .send({ sourceKey: 'pending/missing.mp4', outputKey: 'out.mp4' });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/s3 get failed/);
  });

  it('returns 400 when source object is empty', async () => {
    const s3 = makeStubS3Storage({ 'pending/empty.mp4': Buffer.alloc(0) });
    const app = createImageWorkerApp({ s3StorageClient: s3 });
    const res = await request(app)
      .post('/process/video-from-storage')
      .send({ sourceKey: 'pending/empty.mp4', outputKey: 'out.mp4' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/);
  });

  it('returns 413 when source object exceeds videoMaxBytes', async () => {
    const oversized = Buffer.alloc(1025);
    oversized.write('ftyp', 4, 'ascii');
    oversized.write('isom', 8, 'ascii');
    const s3 = makeStubS3Storage({ 'pending/big.mp4': oversized });
    const app = createImageWorkerApp({
      s3StorageClient: s3,
      videoMaxBytes: 1024,
    });
    const res = await request(app)
      .post('/process/video-from-storage')
      .send({ sourceKey: 'pending/big.mp4', outputKey: 'out.mp4' });
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/exceeds videoMaxBytes/);
  });

  it('returns 400 when source bytes do not match a known video magic', async () => {
    const s3 = makeStubS3Storage({ 'pending/garbage': Buffer.from('not a video at all') });
    const app = createImageWorkerApp({ s3StorageClient: s3 });
    const res = await request(app)
      .post('/process/video-from-storage')
      .send({ sourceKey: 'pending/garbage', outputKey: 'out.mp4' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unrecognized video format/);
  });

  it('happy path: GETs source, runs transcode, PUTs output, returns metadata only', async () => {
    const source = makeFakeMp4();
    const s3 = makeStubS3Storage({ 'pending/job-x/source.mp4': source });
    const app = createImageWorkerApp({
      s3StorageClient: s3,
      transcodeVideoImpl: async (_data) => ({
        bytes: Buffer.from('transcoded-bytes-here'),
        outputFormat: 'mp4',
      }),
    });
    const res = await request(app)
      .post('/process/video-from-storage')
      .send({
        sourceKey: 'pending/job-x/source.mp4',
        outputKey: 'system_member/detached/media_xyz-video.mp4',
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.outputKey).toBe('system_member/detached/media_xyz-video.mp4');
    expect(res.body.outputFormat).toBe('mp4');
    expect(res.body.outputBytes).toBe('transcoded-bytes-here'.length);
    expect(s3.puts).toHaveLength(1);
    expect(s3.puts[0].key).toBe('system_member/detached/media_xyz-video.mp4');
    expect(s3.puts[0].bytes).toBe('transcoded-bytes-here'.length);
  });

  it('passes env-derived libx264 tuning into the transcode call', async () => {
    const source = makeFakeMp4();
    const s3 = makeStubS3Storage({ 'pending/job-tune/source.mp4': source });
    let captured: unknown = null;
    const app = createImageWorkerApp({
      s3StorageClient: s3,
      videoTuning: { preset: 'veryfast', threads: 1, rcLookahead: 10 },
      transcodeVideoImpl: async (_data, tuning) => {
        captured = tuning;
        return { bytes: Buffer.from('x'), outputFormat: 'mp4' };
      },
    });
    const res = await request(app)
      .post('/process/video-from-storage')
      .send({ sourceKey: 'pending/job-tune/source.mp4', outputKey: 'out.mp4' });
    expect(res.status).toBe(200);
    expect(captured).toEqual({ preset: 'veryfast', threads: 1, rcLookahead: 10 });
  });

  it('propagates 500 when the transcode implementation throws', async () => {
    const s3 = makeStubS3Storage({ 'pending/job-fail/source.mp4': makeFakeMp4() });
    const app = createImageWorkerApp({
      s3StorageClient: s3,
      transcodeVideoImpl: async () => {
        throw new Error('ffmpeg exited with code null: kaboom');
      },
    });
    const res = await request(app)
      .post('/process/video-from-storage')
      .send({ sourceKey: 'pending/job-fail/source.mp4', outputKey: 'out.mp4' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/ffmpeg exited/);
  });
});
