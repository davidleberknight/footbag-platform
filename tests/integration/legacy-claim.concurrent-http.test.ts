/**
 * Concurrent-request safety on the legacy-claim surface: two genuinely
 * simultaneous HTTP requests must never double-claim a legacy record or leave
 * partial state. These fire real requests with Promise.all against the running
 * app, so they exercise request interleaving at the controller's async
 * boundaries, not just the database unique constraint. The assertions are
 * end-state invariants that hold regardless of which request the event loop
 * happens to run first: exactly one claimant, exactly one grant, exactly one
 * audit row, and no residue for the loser.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertOnboardingTask,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3096');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Scenario (i): one record, two rival claimants reaching it by token confirm.
  insertLegacyMember(db, {
    legacy_member_id: 'LM-race-token', legacy_email: 'race-token@legacy.example.com',
    real_name: 'Race Token', display_name: 'Race Token', is_hof: 1,
  });
  insertHistoricalPerson(db, {
    person_id: 'HP-race-token', person_name: 'Race Token', legacy_member_id: 'LM-race-token',
  });
  for (const id of ['race-m1', 'race-m2']) {
    insertMember(db, {
      id, slug: id.replace(/-/g, '_'), login_email: `${id}@example.com`,
      real_name: 'Race Token', display_name: 'Race Token',
    });
    insertOnboardingTask(db, id, 'personal_details', 'completed');
  }

  // Scenario (ii): one member double-submitting the email-equality fast path.
  insertLegacyMember(db, {
    legacy_member_id: 'LM-race-dbl', legacy_email: 'race-dbl@legacy.example.com',
    real_name: 'Race Double', display_name: 'Race Double', is_hof: 1,
  });
  insertHistoricalPerson(db, {
    person_id: 'HP-race-dbl', person_name: 'Race Double', legacy_member_id: 'LM-race-dbl',
  });
  insertMember(db, {
    id: 'race-dbl', slug: 'race_dbl', login_email: 'race-dbl@legacy.example.com',
    real_name: 'Race Double', display_name: 'Race Double',
  });
  insertOnboardingTask(db, 'race-dbl', 'personal_details', 'completed');

  db.close();
  createApp = await importApp();
}, 30000);

afterAll(() => cleanupTestDb(dbPath));

function cookie(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

function readDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath, { readonly: true });
}

function claimAuditCount(d: BetterSqlite3.Database, memberId: string): number {
  return (d.prepare(
    `SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ? AND action_type = 'claim.legacy_account'`,
  ).get(memberId) as { n: number }).n;
}

function currentTier(d: BetterSqlite3.Database, memberId: string): string {
  return (d.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?')
    .get(memberId) as { tier_status: string }).tier_status;
}

function findSend(memberId: string, identifier: string) {
  return request(createApp())
    .post('/register/wizard/legacy_claim/find')
    .set('Cookie', cookie(memberId))
    .type('form')
    .send({ identifier, 'cf-turnstile-response': 'stub-ok' });
}

async function tokenTo(recipientEmail: string, exclude: Set<string>): Promise<string> {
  const d = readDb();
  try {
    const rows = d.prepare(
      `SELECT body_text FROM outbox_emails WHERE recipient_email = ? ORDER BY created_at`,
    ).all(recipientEmail) as Array<{ body_text: string }>;
    for (const row of rows) {
      const m = row.body_text.match(/claim\/confirm\/([A-Za-z0-9_-]+)/);
      if (m && !exclude.has(m[1])) return m[1];
    }
  } finally {
    d.close();
  }
  throw new Error(`no fresh claim token emailed to ${recipientEmail}`);
}

describe('concurrent legacy-claim requests', () => {
  it('two members racing token-confirm on one record: exactly one wins, no partial state for the loser', async () => {
    // Each member independently finds the record, sending a confirm token to the
    // legacy address; the two tokens are bound to their respective members.
    const seen = new Set<string>();
    await findSend('race-m1', 'race-token@legacy.example.com');
    const token1 = await tokenTo('race-token@legacy.example.com', seen);
    seen.add(token1);
    await findSend('race-m2', 'race-token@legacy.example.com');
    const token2 = await tokenTo('race-token@legacy.example.com', seen);

    const confirm = (memberId: string, token: string) =>
      request(createApp())
        .post('/register/wizard/legacy_claim/claim/confirm')
        .set('Cookie', cookie(memberId))
        .type('form')
        .send({ token });

    const [r1, r2] = await Promise.all([confirm('race-m1', token1), confirm('race-m2', token2)]);

    // One request advances (303), the other is rejected as already-claimed (422).
    expect([r1.status, r2.status].sort()).toEqual([303, 422]);

    const d = readDb();
    try {
      const winner = (d.prepare(
        'SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?',
      ).get('LM-race-token') as { claimed_by_member_id: string | null }).claimed_by_member_id;
      expect(['race-m1', 'race-m2']).toContain(winner);
      const loser = winner === 'race-m1' ? 'race-m2' : 'race-m1';

      expect(claimAuditCount(d, winner)).toBe(1);
      expect(currentTier(d, winner)).toBe('tier2');
      const winnerRow = d.prepare('SELECT legacy_member_id FROM members WHERE id = ?')
        .get(winner) as { legacy_member_id: string | null };
      expect(winnerRow.legacy_member_id).toBe('LM-race-token');

      // The loser holds no claim, no grant, no audit row.
      expect(claimAuditCount(d, loser)).toBe(0);
      expect(currentTier(d, loser)).toBe('tier0');
      const loserRow = d.prepare('SELECT legacy_member_id FROM members WHERE id = ?')
        .get(loser) as { legacy_member_id: string | null };
      expect(loserRow.legacy_member_id).toBeNull();
    } finally {
      d.close();
    }
  });

  it('one member double-submitting the email fast path claims exactly once', async () => {
    const [r1, r2] = await Promise.all([
      findSend('race-dbl', 'race-dbl@legacy.example.com'),
      findSend('race-dbl', 'race-dbl@legacy.example.com'),
    ]);

    // Neither request errors to a 5xx; one advances and the repeat is a no-op or
    // an already-linked re-render, never a crash.
    expect(r1.status).toBeLessThan(500);
    expect(r2.status).toBeLessThan(500);

    const d = readDb();
    try {
      const claimant = (d.prepare(
        'SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?',
      ).get('LM-race-dbl') as { claimed_by_member_id: string | null }).claimed_by_member_id;
      expect(claimant).toBe('race-dbl');
      expect(claimAuditCount(d, 'race-dbl')).toBe(1);
      expect(currentTier(d, 'race-dbl')).toBe('tier2');
    } finally {
      d.close();
    }
  });
});
