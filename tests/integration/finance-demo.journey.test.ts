/**
 * The finance persona's journey and its teardown, on a stack that is in use.
 *
 * The journey runs the nightly reconciliation and the Treasurer digest on
 * demand after every persona refresh. Its contract here: a refresh repeated the
 * same day replaces the demo's runs and digest rather than piling them up, and
 * leaves the worker's own runs alone; when the worker already mailed a digest
 * that UTC day the journey sends none and says so, rather than recording a send
 * that mailed nothing; the refresh removes the dashboard card of every issue on
 * a persona's payment along with the issue, and nothing else; and the persona
 * commands refuse, before writing, a database other than the application's.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4896');
process.env.FOOTBAG_ENV = 'development';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { insertAuditEntry, insertMember, insertOutboxEmail, insertPayment } from '../fixtures/factories';
import { supertestFetcher, type Fetcher } from '../fixtures/crawl/core';
import { runPersonaCommand } from '../fixtures/personaCommand';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';
import { seedPersona } from '../../src/testkit/personaFactory';

const DAY_MS = 86_400_000;
const noReap = async () => ({ reclaimedIds: [] as string[] });
const POINTER = 'testkit.finance_demo_run';
const FIN_ADMIN = 'member_persona_finance_admin';
const JOBS = ['SYS_Reconcile_Payments_Nightly', 'SYS_Reconciliation_Digest'];

let fetcher: Fetcher;

function db(readonly = true): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath, { readonly });
}

function rows<T>(sql: string, ...params: unknown[]): T[] {
  const d = db();
  try {
    return d.prepare(sql).all(...params) as T[];
  } finally {
    d.close();
  }
}

interface Pointer { reconciliationRunId: string | null; digestRunId: string | null; digestOutboxId: string | null }

const pointers = () => rows<{ id: string; metadata_json: string }>(
  'SELECT id, metadata_json FROM audit_entries WHERE action_type = ? AND entity_id = ?', POINTER, FIN_ADMIN,
).map((r) => ({ id: r.id, ...(JSON.parse(r.metadata_json) as Pointer) }));

const todaysDigests = () => rows<{ id: string }>(
  'SELECT id FROM outbox_emails WHERE idempotency_key = ?',
  `reconciliation-digest:${new Date().toISOString().slice(0, 10)}`,
);

async function refresh(): Promise<void> {
  const res = await fetcher.post('/dev/personas/refresh', null);
  expect(res.status).toBe(302);
}

beforeAll(async () => {
  const d = createTestDb(dbPath);
  // A serving administrator, so the worker's administrator-loss sweep is quiet.
  insertMember(d, {
    id: 'fdj_admin', slug: 'fdj_admin', login_email: 'fdj-admin@example.com',
    is_admin: 1, last_login_at: new Date().toISOString(),
  });
  d.close();
  // The worker's history, two days old: every job ran, the digest included.
  const { runDueJobs } = await import('../../src/services/jobRegistry');
  await runDueJobs({ now: new Date(Date.now() - 2 * DAY_MS), reapExpiredMediaJobs: noReap });
  const createApp = await importApp();
  fetcher = supertestFetcher(createApp());
  await refresh();
}, 180_000);

afterAll(() => cleanupTestDb(dbPath));

describe('refreshing the personas twice in one day', () => {
  it('replaces the demo\'s runs, digest and pointer, and leaves the worker\'s runs alone', async () => {
    // Defect: a second refresh the same day mails nothing new, piles up demo runs, or deletes the worker's history.
    const [first] = pointers();
    expect(pointers(), 'the first refresh left one pointer').toHaveLength(1);
    expect(first.reconciliationRunId && first.digestRunId && first.digestOutboxId, 'naming two runs and a mail')
      .toBeTruthy();
    const workerRuns = rows<{ id: string; status: string; started_at: string }>(
      `SELECT id, status, started_at FROM system_job_runs WHERE id NOT IN (?, ?) ORDER BY id`,
      first.reconciliationRunId, first.digestRunId,
    );
    expect(workerRuns.length, 'the worker has runs of its own').toBeGreaterThan(0);

    await refresh();

    const after = pointers();
    expect(after, 'one pointer, the new one').toHaveLength(1);
    expect(after[0].id).not.toBe(first.id);
    const gone = rows<{ id: string }>(
      'SELECT id FROM system_job_runs WHERE id IN (?, ?)', first.reconciliationRunId, first.digestRunId,
    );
    expect(gone, "the first journey's runs are gone").toEqual([]);
    expect(rows('SELECT id FROM outbox_emails WHERE id = ?', first.digestOutboxId), "and its digest").toEqual([]);
    expect(todaysDigests().map((r) => r.id), 'one digest today, the new one').toEqual([after[0].digestOutboxId]);
    expect(rows<{ id: string; status: string; started_at: string }>(
      `SELECT id, status, started_at FROM system_job_runs WHERE id IN (${workerRuns.map(() => '?').join(', ')}) ORDER BY id`,
      ...workerRuns.map((r) => r.id),
    ), "the worker's runs are untouched").toEqual(workerRuns);
  }, 120_000);
});

describe('the refresh and the issues the nightly pass raises', () => {
  it('removes the dashboard card of an issue on a persona payment with the issue, and keeps a real member\'s', async () => {
    // Defect: the admin dashboard keeps a card pointing at an issue the refresh deleted.
    const d = db(false);
    const recent = new Date(Date.now() - 3_600_000).toISOString();
    try {
      insertMember(d, { id: 'fdj_real', slug: 'fdj_real', login_email: 'fdj-real@example.com' });
      // Test-mode charges the stand-in provider has no record of, made an hour ago.
      for (const [id, member] of [['pay_fdj_persona', 'member_persona_t2_paid'], ['pay_fdj_real', 'fdj_real']]) {
        insertPayment(d, {
          id, member_id: member, payment_type: 'donation', status: 'succeeded',
          stripe_payment_intent_id: `pi_${id}`, provider_livemode: 0, created_at: recent,
        });
      }
    } finally {
      d.close();
    }
    const { runRegistryJobNow } = await import('../../src/testkit/runRegistryJob');
    expect((await runRegistryJobNow('SYS_Reconcile_Payments_Nightly')).status).toBe('ran');
    const cardFor = (paymentId: string) => rows<{ id: string }>(
      `SELECT w.id FROM work_queue_items w JOIN reconciliation_issues i ON i.id = w.entity_id
        WHERE w.entity_type = 'reconciliation_issue' AND i.payment_id = ?`, paymentId,
    );
    expect(cardFor('pay_fdj_persona'), 'the pass raised a card for the persona payment').toHaveLength(1);
    expect(cardFor('pay_fdj_real'), 'and for the real member\'s').toHaveLength(1);
    const realCard = cardFor('pay_fdj_real')[0].id;

    await refresh();

    const orphans = rows<{ id: string }>(
      `SELECT id FROM work_queue_items WHERE entity_type = 'reconciliation_issue'
        AND entity_id NOT IN (SELECT id FROM reconciliation_issues)`,
    );
    expect(orphans, 'no card points at a deleted issue').toEqual([]);
    expect(rows('SELECT id FROM work_queue_items WHERE id = ?', realCard), "the real member's card stays").toHaveLength(1);
  }, 120_000);

  it('deletes only the unaddressed digest a pointer names, never mail addressed to a member', async () => {
    // Defect: a pointer naming the wrong row makes the refresh delete a member's mail.
    const d = db(false);
    let memberMail: string;
    let planted: string;
    try {
      memberMail = insertOutboxEmail(d, {
        recipient_member_id: 'fdj_admin', idempotency_key: 'reconciliation-digest:2030-01-01',
      });
      planted = insertAuditEntry(d, {
        action_type: POINTER, entity_type: 'member', entity_id: FIN_ADMIN, actor_type: 'system',
        metadata: { reconciliationRunId: null, digestRunId: null, digestOutboxId: memberMail },
      });
    } finally {
      d.close();
    }
    const demoDigest = pointers().find((p) => p.id !== planted)!.digestOutboxId;

    await refresh();

    expect(rows('SELECT id FROM audit_entries WHERE id = ?', planted), 'the planted pointer was torn down').toEqual([]);
    expect(rows('SELECT id FROM outbox_emails WHERE id = ?', demoDigest), "the demo's own digest was").toEqual([]);
    expect(rows('SELECT id FROM outbox_emails WHERE id = ?', memberMail), "the member's mail stays").toHaveLength(1);
  }, 120_000);
});

describe('the persona commands and the application database', () => {
  it('refuses a seed or refresh of another file before writing to it, and applies one to the application database', async () => {
    // Defect: the seeded money lands in one database and its reports in another.
    const otherDir = createScratchDir('finance-journey-other');
    const other = path.join(otherDir, 'footbag.db');
    try {
      createTestDb(other).close();
      const seed = await runPersonaCommand('personaSeedRunner', other, [], dbPath);
      expect(seed.code).toBe(1);
      expect(seed.out).toContain('refused');
      const members = () => {
        const o = new BetterSqlite3(other, { readonly: true });
        try {
          return (o.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number }).n;
        } finally {
          o.close();
        }
      };
      expect(members(), 'nothing was seeded').toBe(0);

      const o = new BetterSqlite3(other);
      o.transaction(() => seedPersona(o, CANONICAL_PERSONAS.find((s) => !s.blockedBy && !s.financeDemo)!))();
      o.close();
      const seededOne = members();
      const refused = await runPersonaCommand('personaRefreshCli', other, ['--apply'], dbPath);
      expect(refused.code).toBe(1);
      expect(refused.out).toContain('refused');
      expect(members(), 'nothing was torn down or rebuilt').toBe(seededOne);
    } finally {
      removeScratch(otherDir);
    }

    const applied = await runPersonaCommand('personaRefreshCli', dbPath, ['--apply']);
    expect(applied.code, applied.out).toBe(0);
    expect(applied.out).toContain('finance journey: reconciliation and digest ran at');
    expect(todaysDigests(), 'still one digest today').toHaveLength(1);
  }, 180_000);
});

describe('a digest the worker already sent today', () => {
  it('is not sent again: the journey reports it, and records no digest run', async () => {
    // Defect: a run row claims a digest went out when the outbox mailed nothing.
    const { runRegistryJobNow } = await import('../../src/testkit/runRegistryJob');
    const { runFinanceDemoJourney } = await import('../../src/testkit/financeDemoJourney');
    // A day of the test's own, at midday, so no midnight can fall between the two.
    const workerTick = new Date('2031-03-04T00:05:00.000Z');
    const midday = new Date('2031-03-04T12:00:00.000Z');
    expect((await runRegistryJobNow('SYS_Reconciliation_Digest', { now: workerTick })).status).toBe('ran');
    const digestsThatDay = () => rows('SELECT id FROM outbox_emails WHERE idempotency_key = ?',
      'reconciliation-digest:2031-03-04');
    expect(digestsThatDay(), "the worker's digest").toHaveLength(1);

    const result = await runFinanceDemoJourney({ now: midday });

    expect(result.status).toBe('digest_already_sent_today');
    expect(result.pointer.reconciliationRunId, 'the report still ran').not.toBeNull();
    expect(result.pointer.digestRunId).toBeNull();
    expect(rows('SELECT id FROM system_job_runs WHERE job_name = ? AND started_at = ?',
      JOBS[1], midday.toISOString()), 'no digest run at midday').toEqual([]);
    expect(digestsThatDay(), 'no second digest').toHaveLength(1);
  }, 120_000);
});
