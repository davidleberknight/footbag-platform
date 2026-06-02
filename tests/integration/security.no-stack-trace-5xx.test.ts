/**
 * 5xx responses are not an information-disclosure surface. When an unhandled
 * exception bubbles to the global error middleware, the rendered 500 page
 * carries the static service-unavailable view only: no exception message, no
 * V8 stack frames, and no source-file paths. Asserts the staging-safe pentest
 * contract that an error response never leaks internals.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('3098');

let createApp: Awaited<ReturnType<typeof importApp>>;
let clubService: typeof import('../../src/services/clubService').clubService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
  // Imported after setTestEnv so the singleton resolves the test config; this
  // is the same module instance the controller holds, so the spy below lands.
  ({ clubService } = await import('../../src/services/clubService'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => cleanupTestDb(dbPath));

describe('5xx responses -- no stack-trace or path disclosure', () => {
  it('renders the sanitized error page with no internals when a handler throws', async () => {
    // The deliberate failure is logged twice: once by the controller catch
    // (handleControllerError) and once by the global 500 handler. Opt into
    // both so the logger.error guard stays green.
    expectLoggedError('unexpected error in clubs controller');
    expectLoggedError('unhandled error');

    const leakToken = 'STACKLEAK_SENTINEL_7f3a';
    vi.spyOn(clubService, 'getPublicClubsIndexPage').mockImplementation(() => {
      throw new Error(
        `${leakToken}: synthetic failure at /home/footbag/src/services/clubService.ts:42`,
      );
    });

    const app = createApp();
    const res = await request(app).get('/clubs');

    expect(res.status).toBe(500);
    // Proves we reached the sanitized view rather than a raw error dump.
    expect(res.text).toContain('temporarily unavailable');
    // None of the exception internals may appear in the body.
    expect(res.text).not.toContain(leakToken);
    expect(res.text).not.toContain('clubService.ts');
    expect(res.text).not.toContain('/home/footbag/');
    expect(res.text).not.toContain('node_modules');
    expect(res.text).not.toMatch(/\n\s+at\s+/); // V8 stack frame: "    at fn (...)"
  });
});
