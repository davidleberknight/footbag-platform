/**
 * Adapter-misconfig integration suite.
 *
 * Locks in the failure-mode contract that the existing happy-path tests
 * (which inject a Sharp-backed fake fetch) cannot exercise:
 *
 *   1. Image worker reachable but returns 503 (the actual May 2026
 *      regression: imageWorker.ts did not import dotenv, so the spawned
 *      worker process never saw INTERNAL_EVENT_SECRET and rejected every
 *      authenticated upload with `{"error":"INTERNAL_EVENT_SECRET not
 *      configured"}`). Web layer must surface this as 503 + the
 *      unavailable page, not as a misleading 500 in 503 clothing.
 *
 *   2. Image worker unreachable (ECONNREFUSED). Same observable contract.
 *
 *   3. Non-ImageProcessingError thrown from the adapter (programmer
 *      bug class). Falls through to the generic 500 handler; the page
 *      must show "500", not "503".
 *
 * Verifies Bug A (dynamic statusCode in the unavailable template) and
 * Bug B (controllers route ImageProcessingError through 503) together.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { expectLoggedError } from '../setup-env';
import request from '../fixtures/supertestWithOrigin';
import sharp from 'sharp';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedTier1Member } from '../fixtures/personas';
import { completeOnboarding } from '../fixtures/factories';

const { dbPath } = setTestEnv('3099');

let createApp: Awaited<ReturnType<typeof importApp>>;
let ownerCookie: string;
let ownerSlug: string;

// Deferred (dynamic) imports for adapter modules so setTestEnv's env
// mutations land before src/config/env.ts freezes. Matches the pattern
// in tests/integration/avatar.routes.test.ts.
let adapterMod: typeof import('../../src/adapters/imageProcessingAdapter');
let ImageProcessingError: typeof import('../../src/adapters/imageProcessingAdapter').ImageProcessingError;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const persona = seedTier1Member(db, { slug: 'misconfig_owner' });
  completeOnboarding(db, persona.memberId);
  ownerCookie = persona.cookieHeader;
  ownerSlug = persona.slug;
  db.close();
  createApp = await importApp();
  adapterMod = await import('../../src/adapters/imageProcessingAdapter');
  ImageProcessingError = adapterMod.ImageProcessingError;
});

afterAll(() => {
  adapterMod?.resetImageProcessingAdapterForTests();
  cleanupTestDb(dbPath);
});

async function tinyJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).jpeg().toBuffer();
}

describe('Adapter misconfig: avatar upload surfaces 503 truthfully', () => {
  it('image worker reachable but returns 503 -> web returns 503 + unavailable page', async () => {
    expectLoggedError('avatar upload: image worker unavailable');
    // Mirrors the production wire shape: HTTP fetch to the worker, worker
    // replies with 503 + JSON body. createHttpImageAdapter converts to
    // ImageProcessingError; the controller must surface it as a 503 page.
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: 'INTERNAL_EVENT_SECRET not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    adapterMod.setImageProcessingAdapterForTests(
      adapterMod.createHttpImageAdapter({
        baseUrl: 'http://test-injected',
        internalSecret: 'test-secret',
        fetchImpl: fakeFetch,
      }),
    );

    const res = await request(createApp())
      .post(`/members/${ownerSlug}/avatar`)
      .set('Cookie', ownerCookie)
      .attach('avatar', await tinyJpeg(), 'a.jpg');

    expect(res.status).toBe(503);
    expect(res.text).toContain('Service Unavailable');
    // Bug A: the rendered status code must match the HTTP status.
    expect(res.text).toMatch(/<div class="error-code">503<\/div>/);
  });

  it('image worker unreachable (ECONNREFUSED) -> 503 + unavailable page', async () => {
    expectLoggedError('avatar upload: image worker unavailable');
    const fakeFetch: typeof fetch = async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:4001');
      throw err;
    };
    adapterMod.setImageProcessingAdapterForTests(
      adapterMod.createHttpImageAdapter({
        baseUrl: 'http://test-injected',
        internalSecret: 'test-secret',
        fetchImpl: fakeFetch,
      }),
    );

    const res = await request(createApp())
      .post(`/members/${ownerSlug}/avatar`)
      .set('Cookie', ownerCookie)
      .attach('avatar', await tinyJpeg(), 'a.jpg');

    expect(res.status).toBe(503);
    expect(res.text).toMatch(/<div class="error-code">503<\/div>/);
  });

  it('generic non-ImageProcessingError from adapter -> 500 + page shows "500"', async () => {
    expectLoggedError('avatar upload error');
    expectLoggedError('unhandled error');
    // A bug in the adapter or service (not a worker availability problem)
    // should still produce a friendly error page, and the page MUST report
    // "500", not "503". This is the Bug A regression test: the template
    // used to hardcode "503" regardless of HTTP status.
    const buggyAdapter: import('../../src/adapters/imageProcessingAdapter').ImageProcessingAdapter = {
      processAvatar: async () => {
        throw new Error('synthetic non-IPE failure');
      },
      processPhoto: async () => {
        throw new Error('synthetic non-IPE failure');
      },
    };
    adapterMod.setImageProcessingAdapterForTests(buggyAdapter);

    const res = await request(createApp())
      .post(`/members/${ownerSlug}/avatar`)
      .set('Cookie', ownerCookie)
      .attach('avatar', await tinyJpeg(), 'a.jpg');

    expect(res.status).toBe(500);
    expect(res.text).toMatch(/<div class="error-code">500<\/div>/);
  });

  it('ImageProcessingError class is exported for catch-site narrowing', () => {
    // Lightweight surface check so the import path the controllers use
    // stays load-bearing in the type system (a rename elsewhere would
    // break this assertion before the bug catch sites silently widen).
    const err = new ImageProcessingError('synthetic', 503);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ImageProcessingError');
    expect(err.status).toBe(503);
  });
});
