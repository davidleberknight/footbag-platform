/**
 * Query-count / N+1 probe for a read path.
 *
 * Every named statement in src/db/db.ts is a lazy getter that re-prepares on
 * each access, and the dynamic query helpers call db.prepare in-body, so the
 * number of db.prepare calls during one request equals the number of statements
 * that request executed. A count that stays constant as the row count grows is
 * the N+1 signal: per-row work would make it scale with the data.
 */
import { vi } from 'vitest';
import type { Express } from 'express';
import request from './supertestWithOrigin';

/** Serve one GET against `app` and return how many db.prepare calls it issued. */
export async function countStatementsForGet(app: Express, url: string): Promise<number> {
  const { db } = await import('../../src/db/db');
  const spy = vi.spyOn(db, 'prepare');
  try {
    await request(app).get(url);
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}
