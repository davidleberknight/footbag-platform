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
import path from 'path';
import os from 'os';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-dispatch-client-${Date.now()}.db`);

process.env.FOOTBAG_DB_PATH = TEST_DB_PATH;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.SESSION_SECRET = 'transcode-dispatch-client-test-secret';
process.env.INTERNAL_EVENT_SECRET = 'c'.repeat(48);

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import { createTestDb } from '../fixtures/testDb';

let createTranscodeDispatchClient: typeof import('../../src/services/transcodeDispatchClient').createTranscodeDispatchClient;
let TranscodeDispatchError: typeof import('../../src/services/transcodeDispatchClient').TranscodeDispatchError;

let server: http.Server;
/** Held open so the request never gets an answer, the way a wedged worker behaves. */
const heldResponses: http.ServerResponse[] = [];
let answerImmediatelyWith: number | null = null;

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
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
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
});

describe('transcode dispatch push', () => {
  it('gives up on a worker that never answers, instead of waiting indefinitely', async () => {
    answerImmediatelyWith = null;
    const client = createTranscodeDispatchClient({ timeoutMs: 150 });
    const started = Date.now();

    await expect(client.dispatch('mediajob_wedged')).rejects.toThrow(/timed out after 150ms/);
    // The ceiling is what ends the call, not the caller losing patience.
    expect(Date.now() - started).toBeLessThan(3000);
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
