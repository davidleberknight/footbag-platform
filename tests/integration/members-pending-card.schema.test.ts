/**
 * Schema-level tests for members.pending_auto_link_card_json and
 * pending_auto_link_card_dismissed_at columns.
 *
 * Verifies the contract of the persistence shape for the first-login
 * AutoLinkConfirmContent dashboard card:
 *   - both columns default to NULL when not supplied
 *   - JSON payload round-trips unchanged through SQLite
 *   - dismissed_at can be set independently
 *   - both can be cleared back to NULL (e.g., on confirm or revert)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

describe('members pending_auto_link_card columns', () => {
  let db: BetterSqlite3.Database;
  let dbPath: string;
  let memberId: string;

  beforeEach(() => {
    dbPath = path.join(
      process.cwd(),
      `test-mpac-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    db = createTestDb(dbPath);
    memberId = insertMember(db);
  });

  afterEach(() => {
    db.close();
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it('both columns default to NULL on a fresh member', () => {
    const row = db.prepare(
      `SELECT pending_auto_link_card_json, pending_auto_link_card_dismissed_at
         FROM members WHERE id = ?`,
    ).get(memberId) as {
      pending_auto_link_card_json: string | null;
      pending_auto_link_card_dismissed_at: string | null;
    };
    expect(row.pending_auto_link_card_json).toBeNull();
    expect(row.pending_auto_link_card_dismissed_at).toBeNull();
  });

  it('JSON payload round-trips unchanged through SQLite', () => {
    const payload = JSON.stringify({
      personId: 'hp-abc',
      personName: 'A. Player',
      confidence: 'medium',
      matchedVariantNormalized: 'a player',
      declineHref: '/auto-link/decline?token=xyz',
    });
    db.prepare(
      `UPDATE members SET pending_auto_link_card_json = ? WHERE id = ?`,
    ).run(payload, memberId);
    const row = db.prepare(
      `SELECT pending_auto_link_card_json FROM members WHERE id = ?`,
    ).get(memberId) as { pending_auto_link_card_json: string };
    expect(row.pending_auto_link_card_json).toBe(payload);
    expect(JSON.parse(row.pending_auto_link_card_json)).toMatchObject({
      personId: 'hp-abc',
      confidence: 'medium',
    });
  });

  it('dismissed_at can be set without disturbing the card json', () => {
    const payload = '{"confidence":"medium"}';
    const dismissedAt = '2026-05-18T12:00:00.000Z';
    db.prepare(
      `UPDATE members
          SET pending_auto_link_card_json = ?,
              pending_auto_link_card_dismissed_at = ?
        WHERE id = ?`,
    ).run(payload, dismissedAt, memberId);
    const row = db.prepare(
      `SELECT pending_auto_link_card_json, pending_auto_link_card_dismissed_at
         FROM members WHERE id = ?`,
    ).get(memberId) as {
      pending_auto_link_card_json: string;
      pending_auto_link_card_dismissed_at: string;
    };
    expect(row.pending_auto_link_card_json).toBe(payload);
    expect(row.pending_auto_link_card_dismissed_at).toBe(dismissedAt);
  });

  it('both columns can be cleared back to NULL (e.g. on revert)', () => {
    db.prepare(
      `UPDATE members
          SET pending_auto_link_card_json = ?,
              pending_auto_link_card_dismissed_at = ?
        WHERE id = ?`,
    ).run('{"confidence":"medium"}', '2026-05-18T12:00:00.000Z', memberId);
    db.prepare(
      `UPDATE members
          SET pending_auto_link_card_json = NULL,
              pending_auto_link_card_dismissed_at = NULL
        WHERE id = ?`,
    ).run(memberId);
    const row = db.prepare(
      `SELECT pending_auto_link_card_json, pending_auto_link_card_dismissed_at
         FROM members WHERE id = ?`,
    ).get(memberId) as {
      pending_auto_link_card_json: string | null;
      pending_auto_link_card_dismissed_at: string | null;
    };
    expect(row.pending_auto_link_card_json).toBeNull();
    expect(row.pending_auto_link_card_dismissed_at).toBeNull();
  });
});
