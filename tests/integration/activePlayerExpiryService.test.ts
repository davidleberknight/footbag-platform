/**
 * Integration tests for the SYS_Check_Active_Player_Expiry daily worker
 * (runDailyPass). Exercises against a real SQLite database; verifies outbox
 * enqueues, applyExpiry ledger writes, and per-gating-branch suppression of
 * sends.
 *
 * Test isolation: `active_player_grants` is append-only (no DELETE allowed
 * by trigger), so leftover rows from prior tests would otherwise pollute
 * each test's candidate set. Two mitigations together provide isolation:
 *  - each test uses a unique calendar year for `now`, separating its time
 *    window from sibling tests;
 *  - assertions are scoped to the test's own member id (outbox, reminder-
 *    sent, latest-grant lookups all filter by member_id), so service-level
 *    counter values that aggregate across the DB are not asserted directly.
 *
 * Adversarial coverage: idempotency under same-day reruns, a renewal
 * generating a fresh reminder cycle, tier-filter at the view, unsubscribe /
 * bounced / missing-email gating.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertActivePlayerGrant,
  createMemberAtTier,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3090');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let expirySvc: typeof import('../../src/services/activePlayerExpiryService');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  expirySvc = await import('../../src/services/activePlayerExpiryService');
});

afterAll(() => cleanupTestDb(dbPath));

let _testYear = 2050;
function nextNow(monthDay = '06-15T12:00:00.000Z'): Date {
  const year = _testYear++;
  return new Date(`${year}-${monthDay}`);
}

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `apes-${_seq.toString().padStart(4, '0')}`;
}

interface SeedOpts {
  id?: string;
  slug?: string;
  expires_at?: string;
  tier?: 'tier0' | 'tier1' | 'tier2' | 'tier3';
  email_status?: 'ok' | 'bounced' | 'complained' | 'suppressed';
  login_email?: string | null;
  subscribe_status?: 'subscribed' | 'unsubscribed';
}

function seedMember(opts: SeedOpts = {}): { id: string; slug: string } {
  const id   = opts.id   ?? nextId();
  const slug = opts.slug ?? `apes_user_${_seq}`;
  const db = new BetterSqlite3(dbPath);
  try {
    if (opts.tier && opts.tier !== 'tier0') {
      createMemberAtTier(db, { id, slug, tier: opts.tier });
    } else {
      insertMember(db, { id, slug });
    }
    if (opts.expires_at) {
      insertActivePlayerGrant(db, {
        member_id: id,
        change_type: 'grant',
        new_active_player_expires_at: opts.expires_at,
        reason_code: 'official_event_attendance',
      });
    }
    if (opts.email_status && opts.email_status !== 'ok') {
      db.prepare('UPDATE members SET email_status = ? WHERE id = ?').run(opts.email_status, id);
    }
    if (opts.login_email === null) {
      db.prepare(`
        UPDATE members
        SET login_email = NULL,
            login_email_normalized = NULL,
            email_verified_at = NULL,
            password_hash = NULL,
            password_changed_at = NULL,
            personal_data_purged_at = ?
        WHERE id = ?
      `).run('2025-01-01T00:00:00.000Z', id);
    }
    if (opts.subscribe_status) {
      db.prepare(`
        INSERT INTO mailing_list_subscriptions (
          id, created_at, created_by, updated_at, updated_by, version,
          mailing_list_id, member_id, status, status_updated_at
        ) VALUES (?, ?, 'system', ?, 'system', 1, ?, ?, ?, ?)
      `).run(
        `mls-${id}`,
        '2025-01-01T00:00:00.000Z',
        '2025-01-01T00:00:00.000Z',
        'active-player-reminders',
        id,
        opts.subscribe_status,
        '2025-01-01T00:00:00.000Z',
      );
    }
  } finally {
    db.close();
  }
  return { id, slug };
}

function isoDayOffset(base: Date, days: number, hourUtc = 12): string {
  const t = base.getTime() + days * MS_PER_DAY;
  const d = new Date(t);
  return new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    hourUtc, 0, 0, 0,
  )).toISOString();
}

function readOutboxForMember(memberId: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const r = db.prepare('SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id = ?').get(memberId) as { n: number };
    return r.n;
  } finally {
    db.close();
  }
}

function readOutboxRowForMember(memberId: string): { subject: string; body_text: string; idempotency_key: string | null; mailing_list_id: string | null } | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT subject, body_text, idempotency_key, mailing_list_id FROM outbox_emails WHERE recipient_member_id = ? ORDER BY created_at DESC LIMIT 1').get(memberId) as { subject: string; body_text: string; idempotency_key: string | null; mailing_list_id: string | null } | undefined;
  } finally {
    db.close();
  }
}

function readReminderSentCountForMember(memberId: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const r = db.prepare('SELECT COUNT(*) AS n FROM active_player_reminder_sent WHERE member_id = ?').get(memberId) as { n: number };
    return r.n;
  } finally {
    db.close();
  }
}

function readLatestGrantChangeType(memberId: string): string | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const r = db.prepare(`
      SELECT change_type FROM active_player_grants
      WHERE member_id = ? ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(memberId) as { change_type: string } | undefined;
    return r?.change_type;
  } finally {
    db.close();
  }
}

describe('runDailyPass — reminder enqueue per offset', () => {
  it('Tier 0 expiring at T-30 enqueues a days_1 reminder', () => {
    const now = nextNow();
    const m = seedMember({ expires_at: isoDayOffset(now, 30) });

    expirySvc.runDailyPass({ now });

    expect(readOutboxForMember(m.id)).toBe(1);
    expect(readReminderSentCountForMember(m.id)).toBe(1);
    const row = readOutboxRowForMember(m.id)!;
    expect(row.mailing_list_id).toBe('active-player-reminders');
    expect(row.idempotency_key).toContain(`ap-reminder:${m.id}:`);
    expect(row.subject).toMatch(/Active Player/);
    expect(row.body_text).toMatch(/vouched|qualifying event|club/);
  });

  it('Tier 0 expiring at T-7 enqueues a days_2 reminder', () => {
    const now = nextNow();
    const m = seedMember({ expires_at: isoDayOffset(now, 7) });

    expirySvc.runDailyPass({ now });

    expect(readOutboxForMember(m.id)).toBe(1);
    expect(readReminderSentCountForMember(m.id)).toBe(1);
  });

  it('Tier 0 expiring today (T+0) enqueues a day_of reminder with the day-of subject', () => {
    const now = nextNow();
    const m = seedMember({ expires_at: isoDayOffset(now, 0, 14) });

    expirySvc.runDailyPass({ now });

    expect(readOutboxForMember(m.id)).toBe(1);
    const row = readOutboxRowForMember(m.id)!;
    expect(row.subject).toMatch(/expires today/);
  });

  it('Tier 0 between offsets (T-15) sends no reminder', () => {
    const now = nextNow();
    const m = seedMember({ expires_at: isoDayOffset(now, 15) });

    expirySvc.runDailyPass({ now });

    expect(readOutboxForMember(m.id)).toBe(0);
    expect(readReminderSentCountForMember(m.id)).toBe(0);
  });
});

describe('runDailyPass — expiry ledger', () => {
  it('lapsed Tier 0 (T-1) gets an expire ledger row', () => {
    const now = nextNow();
    const m = seedMember({ expires_at: isoDayOffset(now, -1) });

    expirySvc.runDailyPass({ now });

    expect(readLatestGrantChangeType(m.id)).toBe('expire');
  });

  it('re-running the worker after expire is a no-op (idempotent on the latest grant)', () => {
    const now = nextNow();
    const m = seedMember({ expires_at: isoDayOffset(now, -3) });

    expirySvc.runDailyPass({ now });
    expirySvc.runDailyPass({ now });

    // Only one expire row should ever land for this grant.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const count = db.prepare(`
      SELECT COUNT(*) AS n FROM active_player_grants
      WHERE member_id = ? AND change_type = 'expire'
    `).get(m.id) as { n: number };
    db.close();
    expect(count.n).toBe(1);
  });
});

describe('runDailyPass — tier filtering', () => {
  it('Tier 1+ members are not in the candidate set even with a stray AP grant', () => {
    const now = nextNow();
    const id = `m-t1-filter-${_testYear}`;
    const db = new BetterSqlite3(dbPath);
    createMemberAtTier(db, { id, slug: `m_t1_filter_${_testYear}`, tier: 'tier1' });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: isoDayOffset(now, 30),
      reason_code: 'official_event_attendance',
    });
    db.close();

    expirySvc.runDailyPass({ now });

    expect(readOutboxForMember(id)).toBe(0);
    expect(readReminderSentCountForMember(id)).toBe(0);
  });
});

describe('runDailyPass — email / subscription gating', () => {
  it('explicit unsubscribed status blocks the reminder', () => {
    const now = nextNow();
    const m = seedMember({
      expires_at: isoDayOffset(now, 30),
      subscribe_status: 'unsubscribed',
    });

    expirySvc.runDailyPass({ now });

    expect(readOutboxForMember(m.id)).toBe(0);
    expect(readReminderSentCountForMember(m.id)).toBe(0);
  });

  it('email_status=bounced blocks the reminder', () => {
    const now = nextNow();
    const m = seedMember({
      expires_at: isoDayOffset(now, 30),
      email_status: 'bounced',
    });

    expirySvc.runDailyPass({ now });

    expect(readOutboxForMember(m.id)).toBe(0);
    expect(readReminderSentCountForMember(m.id)).toBe(0);
  });

  it('null login_email (purged account) blocks the reminder', () => {
    const now = nextNow();
    const m = seedMember({
      expires_at: isoDayOffset(now, 30),
      login_email: null,
    });

    expirySvc.runDailyPass({ now });

    expect(readOutboxForMember(m.id)).toBe(0);
    expect(readReminderSentCountForMember(m.id)).toBe(0);
  });

  it('absence of mailing_list_subscriptions row = subscribed by default', () => {
    const now = nextNow();
    const m = seedMember({ expires_at: isoDayOffset(now, 7) });

    expirySvc.runDailyPass({ now });

    expect(readOutboxForMember(m.id)).toBe(1);
  });
});

describe('runDailyPass — idempotency across runs', () => {
  it('two same-day passes enqueue only one reminder per offset', () => {
    const now = nextNow();
    const m = seedMember({ expires_at: isoDayOffset(now, 30) });

    expirySvc.runDailyPass({ now });
    expirySvc.runDailyPass({ now });

    expect(readReminderSentCountForMember(m.id)).toBe(1);
    expect(readOutboxForMember(m.id)).toBe(1);
  });

  it('a renewal (new grant with later expiry) generates a fresh reminder cycle', () => {
    const now = nextNow();
    const m = seedMember({ expires_at: isoDayOffset(now, 7) });

    expirySvc.runDailyPass({ now });
    expect(readOutboxForMember(m.id)).toBe(1);

    const db = new BetterSqlite3(dbPath);
    insertActivePlayerGrant(db, {
      member_id: m.id,
      change_type: 'extend',
      old_active_player_expires_at: isoDayOffset(now, 7),
      new_active_player_expires_at: isoDayOffset(now, 30),
      reason_code: 'official_event_attendance',
    });
    db.close();

    expirySvc.runDailyPass({ now });
    expect(readReminderSentCountForMember(m.id)).toBe(2);
    expect(readOutboxForMember(m.id)).toBe(2);
  });
});

describe('runDailyPass — return shape (counter contract)', () => {
  it('returns the RunDailyPassResult shape with all expected counter keys', () => {
    const now = nextNow();
    const r = expirySvc.runDailyPass({ now });
    expect(r).toMatchObject({
      candidates_scanned:       expect.any(Number),
      reminders_enqueued:       expect.any(Number),
      expiry_rows_applied:      expect.any(Number),
      skipped_outside_window:   expect.any(Number),
      skipped_non_tier0:        expect.any(Number),
      skipped_unsubscribed:     expect.any(Number),
      skipped_email_suppressed: expect.any(Number),
      skipped_already_sent:     expect.any(Number),
      skipped_missing_email:    expect.any(Number),
    });
  });
});
