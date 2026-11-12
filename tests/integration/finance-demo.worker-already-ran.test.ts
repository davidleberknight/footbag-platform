/**
 * The finance persona seeded onto a stack whose worker has already run.
 *
 * Every deployed stack is in this state: the worker ran its daily jobs on its
 * first tick of the day, and sent the Treasurer digest some days before. A
 * persona seed on such a stack must still leave the Financial Reports page
 * showing the seeded money as the newest report, and a Treasurer digest that
 * carries it, delivered through the stub mail provider, beside the worker's
 * own earlier digest rather than in place of it.
 *
 * The seed is run through the seed command, in process, exactly as the
 * deploy and the local launcher run it.
 */
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4895');
process.env.FOOTBAG_ENV = 'development';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';
import { runPersonaCommand } from '../fixtures/personaCommand';

const DAY_MS = 86_400_000;
const noReap = async () => ({ reclaimedIds: [] as string[] });
const TREASURER = 'ifpa-treasurer@footbag.org';

interface RunRow { id: string; job_name: string; started_at: string; details_json: string | null }

function rows<T>(sql: string, ...params: unknown[]): T[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

const runsOf = (job: string) => rows<RunRow>(
  'SELECT id, job_name, started_at, details_json FROM system_job_runs WHERE job_name = ? ORDER BY started_at, id',
  job,
);

let seedStartedAt: string;
let seedCode: number;
let seedOut: string;
let workerRunIds: Set<string>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // A serving administrator, as on every running stack, so the worker's
  // administrator-loss sweep has nothing to report.
  insertMember(db, {
    id: 'war_admin', slug: 'war_admin', login_email: 'war-admin@example.com',
    is_admin: 1, last_login_at: new Date().toISOString(),
  });
  db.close();

  // The worker two days ago (every job, the digest included), and again a
  // minute ago (the daily jobs; the digest is not due again for a month).
  const { runDueJobs } = await import('../../src/services/jobRegistry');
  await runDueJobs({ now: new Date(Date.now() - 2 * DAY_MS), reapExpiredMediaJobs: noReap });
  await runDueJobs({ now: new Date(Date.now() - 60_000), reapExpiredMediaJobs: noReap });
  workerRunIds = new Set(rows<{ id: string }>('SELECT id FROM system_job_runs').map((r) => r.id));
  expect(runsOf('SYS_Reconciliation_Digest'), 'the worker sent one digest, two days ago').toHaveLength(1);
  expect(runsOf('SYS_Reconcile_Payments_Nightly'), 'and ran the nightly pass twice').toHaveLength(2);

  seedStartedAt = new Date().toISOString();
  ({ code: seedCode, out: seedOut } = await runPersonaCommand('personaSeedRunner', dbPath));
}, 180_000);

afterAll(() => cleanupTestDb(dbPath));

describe('seeding the finance persona after the worker has run', () => {
  it('exits cleanly and says the journey ran', () => {
    // Defect: the seed command fails, or hides that the demo has no report, on the stack's normal state.
    expect(seedCode, seedOut).toBe(0);
    expect(seedOut).toContain('finance journey: reconciliation and digest ran at');
  });

  it('makes a report of the seeded money the newest, ahead of the worker\'s own', () => {
    // Defect: the Treasurer opens Financial Reports and the newest report shows zeros.
    const nightly = runsOf('SYS_Reconcile_Payments_Nightly');
    const newest = nightly[nightly.length - 1];
    expect(workerRunIds.has(newest.id), 'the newest report is not one the worker ran').toBe(false);
    expect(newest.started_at > seedStartedAt, 'it ran after the seed').toBe(true);
    const report = JSON.parse(newest.details_json!) as {
      totals: { categoryLabel: string; currency: string; count: number; grossDisplay: string; netDisplay: string }[];
      carriedForward: { id: string; resolutionNotes: string | null }[];
    };
    // Only the finance seed pays in euros or pays an event fee; its seven days hold
    // Ben's 30.00 and Eli's 15.00 donations, and four Worlds fees with 20.00 returned.
    expect(report.totals).toContainEqual(expect.objectContaining(
      { categoryLabel: 'Donation', currency: 'EUR', count: 2, grossDisplay: '45.00 EUR', netDisplay: '45.00 EUR' }));
    expect(report.totals).toContainEqual(expect.objectContaining(
      { categoryLabel: 'Event registration', currency: 'USD', count: 4, grossDisplay: '195.00 USD', netDisplay: '175.00 USD' }));
    expect(report.carriedForward.map((c) => c.id), 'the explained rehearsal charge is carried forward')
      .toEqual(['recon_persona_fin_rehearsal']);
  });

  it('queues exactly one digest today, carrying the seeded totals, and the mail provider delivers it', async () => {
    // Defect: the Treasurer opens the outbox and finds no digest, or two.
    const today = new Date().toISOString().slice(0, 10);
    const digests = rows<{ id: string; recipient_email: string }>(
      `SELECT id, recipient_email FROM outbox_emails WHERE idempotency_key GLOB 'reconciliation-digest:*'`,
    );
    const todays = rows<{ id: string }>(
      'SELECT id FROM outbox_emails WHERE idempotency_key = ?', `reconciliation-digest:${today}`,
    );
    expect(todays, "one digest under today's key").toHaveLength(1);
    expect(digests.filter((d) => d.id !== todays[0].id), "the worker's earlier digest is a different day's")
      .toHaveLength(1);

    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    const { getStubSesAdapterForTests } = await import('../../src/adapters/sesAdapter');
    await operationsPlatformService.runEmailWorker();
    const sent = getStubSesAdapterForTests()!.sentMessages.filter((m) => m.to === TREASURER);
    const withSeededMoney = sent.filter((m) =>
      m.bodyText.includes('Donation in EUR: 2 payments, 45.00 EUR received, 0.00 EUR returned, 45.00 EUR net.'));
    expect(withSeededMoney, 'the delivered digest carries the seeded totals').toHaveLength(1);
  });
});
