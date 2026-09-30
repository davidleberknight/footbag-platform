# write-tests: code shapes

Contents: unit test; integration test; one response per page; `logger.error()` opt-in; load-dependent refusal.

## Unit test

No database. Import the function and assert.

```typescript
import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/services/slugify';

describe('slugify', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(slugify('John Doe')).toBe('john_doe');
  });
});
```

## Integration test

New files use the shared helpers from `tests/fixtures/testDb.ts`, which set `FOOTBAG_DB_PATH` before any import and remove the WAL sidecars afterwards.

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertEvent } from '../fixtures/factories';

const { dbPath } = setTestEnv('3050');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertEvent(db, { status: 'completed', title: 'Spring Classic', start_date: '2025-06-01', end_date: '2025-06-03' });
  insertEvent(db, { status: 'draft', title: 'Unannounced Open', start_date: '2025-08-01', end_date: '2025-08-03' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /events/year/:year', () => {
  // Defect caught: a completed event is missing from its year's archive, or an
  // unpublished draft is shown to the public.
  it('lists the year\'s completed events and never a draft', async () => {
    const res = await request(createApp()).get('/events/year/2025');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Spring Classic');
    expect(res.text).not.toContain('Unannounced Open');
  });
});
```

Both titles are seeded rows, not template copy, so the assertions tie the render to the data, and the draft makes the case a branch asserted on both sides. The status sits in the case that checks the body. A signed-in request carries a cookie built with `createTestSessionJwt` from the factories.

## One response per page

A read-only suite asserting many things about one page shares one response per path. Seed in `beforeAll`, and never write inside a case: seed both states up front, or move the write-then-read case to its own file with plain requests (or mark the file `cachedGet-writes:` with the reason).

```typescript
import { cachedGet } from '../fixtures/cachedGet';

const page = cachedGet(() => createApp());

it('...', async () => {
  const res = await page('/freestyle/concepts');
  // ... assertions against the shared response
});
```

## `logger.error()` opt-in

A test that deliberately drives an error path producing `logger.error()` calls `expectLoggedError(pattern)` from `tests/setup-env.ts` before the action. The pattern (a substring or RegExp matched against the message) names the expected line, never a catch-all.

```typescript
import { expectLoggedError } from '../setup-env';

it('outbox failure returns 503 and writes an audit row', async () => {
  expectLoggedError('audit: auth.register_notification_failed');
  // ... action that throws inside the catch block
});
```

## Load-dependent refusal

A query 100,000 characters long is refused at the HTTP layer either with a status or by the server destroying the socket, and which one lands depends on machine load. The contract is "refused at the HTTP layer, never a 5xx", so the test accepts both (`oversizedRequest` is a helper local to `tests/integration/freestyle.search-adversarial.routes.test.ts`):

```typescript
const outcome = await oversizedRequest(path, q);
if (outcome.kind === 'connection-refused') continue;
expect(outcome.status, `${path} must not 5xx on ${q.length} chars`).toBeLessThan(500);
```

For a timing bound, measure the reference in the same run and compare, as `tests/integration/security.login-timing.test.ts` does.
