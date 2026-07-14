/**
 * The public browse and search list routes read a bounded number of statements
 * that does not scale with the number of rows: one row versus many must execute
 * the same count, so a list read never fans out into a per-row query (N+1). The
 * trick search additionally reads through a LIMIT-bearing statement, so growing
 * the matching set past the page size leaves the count flat.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertClub, insertFreestyleTrick } from '../fixtures/factories';
import { countStatementsForGet } from '../fixtures/queryCount';

const { dbPath } = setTestEnv('3097');

// A generous ceiling: the routes read a handful of statements plus the constant
// request/session overhead. It guards against a route that opens dozens of
// statements per request; the row-count-stability check below is the real N+1
// guard.
const STATEMENT_CEILING = 40;

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function writeDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

async function assertBoundedAndFlat(url: string, seedOne: () => void, seedMany: () => void): Promise<void> {
  const app = createApp();
  seedOne();
  // Warm up so any one-time request-path preparation is not counted against the
  // single-row measurement.
  await countStatementsForGet(app, url);
  const one = await countStatementsForGet(app, url);
  seedMany();
  const many = await countStatementsForGet(app, url);

  expect(many, `${url}: statement count must not scale with rows (N+1)`).toBe(one);
  expect(one, `${url}: statement count should stay bounded`).toBeLessThanOrEqual(STATEMENT_CEILING);
}

describe('public browse/search routes issue a bounded, row-count-independent number of statements', () => {
  it('GET /clubs', async () => {
    await assertBoundedAndFlat(
      '/clubs',
      () => { const d = writeDb(); insertClub(d, { name: 'QC Club 0' }); d.close(); },
      () => {
        const d = writeDb();
        for (let i = 1; i <= 24; i += 1) insertClub(d, { name: `QC Club ${i}` });
        d.close();
      },
    );
  });

  it('GET /freestyle/tricks', async () => {
    await assertBoundedAndFlat(
      '/freestyle/tricks',
      () => { const d = writeDb(); insertFreestyleTrick(d, { slug: 'qc-trick-0', canonical_name: 'qc trick 0' }); d.close(); },
      () => {
        const d = writeDb();
        for (let i = 1; i <= 24; i += 1) insertFreestyleTrick(d, { slug: `qc-trick-${i}`, canonical_name: `qc trick ${i}` });
        d.close();
      },
    );
  });

  it('GET /freestyle/search past the page limit', async () => {
    // Seed matching tricks well past the 50-row page limit so the LIMIT-bearing
    // search statement, not per-row work, is what bounds the read.
    await assertBoundedAndFlat(
      '/freestyle/search?q=zzsearch',
      () => { const d = writeDb(); insertFreestyleTrick(d, { slug: 'zzsearch-0', canonical_name: 'zzsearch match 0' }); d.close(); },
      () => {
        const d = writeDb();
        for (let i = 1; i <= 60; i += 1) insertFreestyleTrick(d, { slug: `zzsearch-${i}`, canonical_name: `zzsearch match ${i}` });
        d.close();
      },
    );
  });
});
