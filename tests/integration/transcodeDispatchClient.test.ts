/**
 * The web container's push to the worker's dispatch endpoint.
 *
 * The worker claims the row and answers before it starts any work, so a
 * healthy push returns immediately. The contract that matters here is what
 * happens when it does not: a worker that accepts the connection and then goes
 * quiet must not hold the administrator's finalize request open behind it, so
 * the push carries its own ceiling and reports a timeout as a dispatch failure
 * rather than waiting for something upstream to give up first.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4191');
process.env.INTERNAL_EVENT_SECRET = 'c'.repeat(48);

let createTranscodeDispatchClient: typeof import('../../src/services/transcodeDispatchClient').createTranscodeDispatchClient;
let TranscodeDispatchError: typeof import('../../src/services/transcodeDispatchClient').TranscodeDispatchError;

let server: http.Server;
/** Held open so the request never gets an answer, the way a wedged worker behaves. */
const heldResponses: http.ServerResponse[] = [];
let answerImmediatelyWith: number | null = null;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();

  server = http.createServer((_req, res) => {
    if (answerImmediatelyWith !== null) {
      res.writeHead(answerImmediatelyWith, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: true }));
      return;
    }
    heldResponses.push(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.WORKER_INTERNAL_URL = `http://127.0.0.1:${port}`;

  const mod = await import('../../src/services/transcodeDispatchClient');
  createTranscodeDispatchClient = mod.createTranscodeDispatchClient;
  TranscodeDispatchError = mod.TranscodeDispatchError;
});

afterAll(async () => {
  for (const res of heldResponses) {
    try { res.end(); } catch { /* already gone */ }
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  cleanupTestDb(dbPath);
});

describe('transcode dispatch push', () => {
  it('gives up on a worker that never answers, instead of waiting indefinitely', async () => {
    answerImmediatelyWith = null;
    const DISPATCH_TIMEOUT_MS = 150;
    const client = createTranscodeDispatchClient({ timeoutMs: DISPATCH_TIMEOUT_MS });
    // Monotonic: this is an elapsed interval, and a wall clock is free to jump.
    // A host that steps its time inside the interval hands back a duration
    // short by that step, or a negative one, and the failure that arrives says
    // the dispatcher waited too long when it did nothing of the sort.
    const started = performance.now();

    await expect(client.dispatch('mediajob_wedged'))
      .rejects.toThrow(new RegExp(`timed out after ${DISPATCH_TIMEOUT_MS}ms`));
    // The ceiling is what ends the call, not the caller losing patience.
    // budget-is-the-contract: the bound is a multiple of the client's own
    // timeout rather than a fixed millisecond figure, so it states that
    // relationship instead of how fast the machine that wrote it happened to be,
    // and it follows the budget if the budget ever moves.
    expect(performance.now() - started).toBeLessThan(DISPATCH_TIMEOUT_MS * 20);
  });

  it('raises the timeout as a dispatch failure, so the caller handles it like any other', async () => {
    answerImmediatelyWith = null;
    const client = createTranscodeDispatchClient({ timeoutMs: 150 });
    await expect(client.dispatch('mediajob_wedged_2')).rejects.toBeInstanceOf(TranscodeDispatchError);
  });

  it('returns normally when the worker accepts the job', async () => {
    answerImmediatelyWith = 202;
    const client = createTranscodeDispatchClient({ timeoutMs: 2000 });
    await expect(client.dispatch('mediajob_accepted')).resolves.toBeUndefined();
  });
});
