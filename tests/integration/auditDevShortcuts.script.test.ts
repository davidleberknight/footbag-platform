/**
 * scripts/audit-dev-shortcuts.sh -- the development-residue audit a production
 * deploy runs on the database it ships.
 *
 * Contract: the audit exits non-zero, naming the count that tripped, for every
 * kind of row the persona harness and the developer build leave behind: a
 * persona member, a persona sign-in address on a member or on any of a legacy
 * account's three addresses, a legacy account the harness stamped as test data,
 * and the developer-only fast outbox poll. The system member that owns the
 * curated content, and its fixture legacy account, are permanent production data
 * and never trip it; a database carrying only real-shaped rows passes.
 *
 * Each case builds its own database from the real schema and runs the script
 * against it; nothing reaches the developer database.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { createTestDb } from '../fixtures/testDb';
import { insertLegacyMember, insertMember, insertSystemConfig } from '../fixtures/factories';

const SCRIPT = join(process.cwd(), 'scripts', 'audit-dev-shortcuts.sh');
const scratch = createScratchDir('audit-dev-shortcuts');
afterAll(() => removeScratch(scratch));
let seq = 0;

/** A database holding the permanent system member, its fixture account and an
 *  imported legacy account, plus whatever residue the case adds. */
function auditOf(addResidue: (db: BetterSqlite3.Database) => void) {
  const dbPath = join(scratch, `audit-${++seq}.db`);
  const db = createTestDb(dbPath);
  // The system member carries a persona-shaped id here, so only its flag keeps
  // it out of the count; a look-alike id proves the underscores are literal.
  insertMember(db, { id: 'member_persona_system', is_system: 1 });
  insertMember(db, { id: 'memberXpersonaXlookalike' });
  insertLegacyMember(db, { legacy_member_id: 'STUB_SYSTEM_FIXTURE', import_source: 'system_fixture' });
  insertLegacyMember(db, {
    legacy_member_id: '1001', import_source: 'legacy_site_data', legacy_email: 'player@example.com',
  });
  insertMember(db, { login_email: 'player@example.com' });
  addResidue(db);
  db.close();
  const res = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, FOOTBAG_DB_PATH: dbPath },
    ...SPAWN_GUARD,
  });
  return { status: res.status, out: res.stdout ?? '', err: res.stderr ?? '' };
}

/** The count the audit printed for one labelled query. */
function countFor(err: string, label: string): string | undefined {
  const line = err.split('\n').find((l) => l.trim().startsWith(`${label}:`));
  return line?.trim().split(/\s+/).pop();
}

describe('the development-residue audit', () => {
  // Defect caught: a production database carrying the permanent system member
  // or an imported account is refused, so the go-live load can never ship.
  it('passes a database holding only the system member and imported accounts', () => {
    const r = auditOf(() => {});
    expect(r.status, r.err).toBe(0);
    expect(r.out).toContain('OK: zero dev-shortcut rows present.');
  });

  // Defect caught: a test persona or the developer outbox setting reaches the
  // production database, so a stranger can sign in as a seeded persona, a
  // persona claims a real member's record, or the host polls mail every two
  // seconds.
  it.each([
    ['members.id member_persona_*', (db: BetterSqlite3.Database) => {
      insertMember(db, { id: 'member_persona_alice' });
    }],
    ['members.login_email personas.test', (db: BetterSqlite3.Database) => {
      insertMember(db, { login_email: 'Alice@Personas.Test' });
    }],
    ['legacy_members import_source test', (db: BetterSqlite3.Database) => {
      insertLegacyMember(db, { import_source: 'test', legacy_email: 'twin@example.com' });
    }],
    ['system_config cfg_dev_outbox_poll', (db: BetterSqlite3.Database) => {
      insertSystemConfig(db, {
        id: 'cfg_dev_outbox_poll', config_key: 'outbox_poll_interval_seconds', value_json: '2',
      });
    }],
  ])('refuses a database carrying %s', (label, addResidue) => {
    const r = auditOf(addResidue);
    expect(r.status, r.err).toBe(1);
    expect(countFor(r.err, label), r.err).toBe('1');
    expect(r.err).toContain('FAIL: 1 dev-shortcut row(s) detected');
  });

  // Defect caught: a persona address on a legacy account's second or third
  // address column is missed, so a persona twin's account ships.
  it('refuses a persona address in any of a legacy account\'s three address columns', () => {
    for (const column of ['legacy_email', 'legacy_email2', 'legacy_email3'] as const) {
      // Stamped as imported, so only the address can trip the audit.
      const r = auditOf((db) => {
        insertLegacyMember(db, { import_source: 'legacy_site_data', [column]: 'alice@personas.test' });
      });
      expect(r.status, `${column}\n${r.err}`).toBe(1);
      expect(countFor(r.err, 'legacy_members email personas.test'), column).toBe('1');
    }
  });
});
