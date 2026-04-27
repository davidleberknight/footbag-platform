/**
 * Lazy-prepare contract for src/db/db.ts.
 *
 * The architectural rule: db.prepare() is only ever called inside a getter or
 * a function body, never at module top level. This decouples module load from
 * schema readiness, so importing src/db/db.ts against a not-yet-migrated
 * database does not fail at import time.
 *
 * Tests:
 *   A. Regression — importing src/db/db.ts against an empty (no-schema) DB
 *      does not throw. Pre-fix: throws SqliteError: no such table: events.
 *   B. Invariant — zero db.prepare() calls happen during import. Catches any
 *      future regression that puts a top-level prepare back in the module.
 *   C. Happy path — getter access returns a working Statement.
 *   D. SQL validation — every getter on every exported statement group still
 *      parses against the current schema. Recovers the boot-time validation
 *      that eager prepares used to give for free, including dead-but-defined
 *      statements that no consumer test exercises.
 *
 * Pattern: vi.resetModules() between cases + fresh dynamic import of
 * ../../src/db/db so each case sees its own FOOTBAG_DB_PATH override.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, cleanupTestDb } from '../fixtures/testDb';

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return { ...process.env };
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const k of Object.keys(process.env)) delete process.env[k];
  for (const [k, v] of Object.entries(snap)) {
    if (v !== undefined) process.env[k] = v;
  }
}

function makeEmptyDbPath(tag: string): string {
  const uniq = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const p = path.join(
    process.cwd(),
    `test-db-lazy-${tag}-${Date.now()}-${uniq}.db`,
  );
  // Touch the file so SQLite opens an existing-but-empty DB rather than
  // creating a new one (either way works; this just makes the test explicit
  // about what "empty" means: file exists, contains no tables).
  fs.writeFileSync(p, '');
  return p;
}

describe('db.ts lazy-prepare contract', () => {
  let snap: EnvSnapshot;
  const cleanup: string[] = [];

  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    restoreEnv(snap);
    while (cleanup.length > 0) {
      const p = cleanup.pop();
      if (p !== undefined) cleanupTestDb(p);
    }
  });

  it('A: importing against an empty DB (no schema) does not throw', async () => {
    const dbPath = makeEmptyDbPath('A');
    cleanup.push(dbPath);
    process.env.FOOTBAG_DB_PATH = dbPath;
    await expect(import('../../src/db/db')).resolves.toBeDefined();
  });

  it('B: zero db.prepare() calls happen during import', async () => {
    const dbPath = makeEmptyDbPath('B');
    cleanup.push(dbPath);
    process.env.FOOTBAG_DB_PATH = dbPath;
    const spy = vi.spyOn(BetterSqlite3.prototype, 'prepare');
    await import('../../src/db/db');
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('C: getter access returns a working Statement against a schema-loaded DB', async () => {
    const dbPath = makeEmptyDbPath('C');
    cleanup.push(dbPath);
    const init = createTestDb(dbPath);
    init.close();
    process.env.FOOTBAG_DB_PATH = dbPath;
    const mod = await import('../../src/db/db');
    const rows = mod.publicEvents.listUpcoming.all('2025-01-01');
    expect(Array.isArray(rows)).toBe(true);
  });

  it('D: every getter on every exported statement group parses against the current schema', async () => {
    const dbPath = makeEmptyDbPath('D');
    cleanup.push(dbPath);
    const init = createTestDb(dbPath);
    init.close();
    process.env.FOOTBAG_DB_PATH = dbPath;
    const mod = (await import('../../src/db/db')) as Record<string, unknown>;

    let validated = 0;
    for (const [groupName, group] of Object.entries(mod)) {
      if (group === null || typeof group !== 'object' || Array.isArray(group)) {
        continue;
      }
      for (const key of Object.getOwnPropertyNames(group)) {
        const desc = Object.getOwnPropertyDescriptor(group, key);
        if (desc && typeof desc.get === 'function') {
          expect(
            () => (group as Record<string, unknown>)[key],
            `${groupName}.${key}`,
          ).not.toThrow();
          validated++;
        }
      }
    }
    // Sanity floor — if the rewrite ever silently strips getters, this fails
    // before consumer tests do. Current count is 148; assert >=140 to allow
    // small statement adds/removes without test churn.
    expect(validated).toBeGreaterThanOrEqual(140);
  });
});
