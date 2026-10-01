/**
 * Every sender that resolves its own recipients reaches a live member and
 * never a member the platform must not mail.
 *
 * The platform sends nothing to a member it has marked deceased, and a
 * broadcast has no business reaching a deleted account, a purged one, or a
 * bouncing or complaining mailbox. Each of those rules is enforced where the
 * sender resolves its recipients, which means one forgotten filter in one
 * statement mails a grieving family. Each row below runs a real sender once
 * against one member in every state and asserts who got an outbox row: the
 * live member must (so no row passes by reaching nobody), and every state the
 * row excludes must not.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertEvent,
  insertWorkQueueItem,
  insertActivePlayerGrant,
} from '../fixtures/factories';
import {
  MEMBER_STATES,
  seedMemberStateMatrix,
  type MemberState,
  type MemberStateMatrix,
} from '../fixtures/memberStates';
import { DAY_MS } from '../fixtures/clock';

const { dbPath } = setTestEnv('4243');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createCommunicationService: typeof import('../../src/services/communicationService').createCommunicationService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createStubSesAdapter: typeof import('../../src/adapters/sesAdapter').createStubSesAdapter;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let workQueueService: typeof import('../../src/services/workQueueService').workQueueService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let runDailyPass: typeof import('../../src/services/activePlayerExpiryService').runDailyPass;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createCommunicationService = (await import('../../src/services/communicationService')).createCommunicationService;
  createStubSesAdapter = (await import('../../src/adapters/sesAdapter')).createStubSesAdapter;
  workQueueService = (await import('../../src/services/workQueueService')).workQueueService;
  runDailyPass = (await import('../../src/services/activePlayerExpiryService')).runDailyPass;
});

afterAll(() => cleanupTestDb(dbPath));

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function outboxCountFor(memberId: string): number {
  return withDb((db) => (db.prepare(
    'SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id = ?',
  ).get(memberId) as { n: number }).n);
}

const BULK_EXCLUDED: MemberState[] = [
  'deceased', 'softDeleted', 'purged', 'unverified', 'bounced', 'complained',
];

interface SenderRow {
  name: string;
  excludes: MemberState[];
  /** Seeds its own matrix, runs the sender once, and returns the matrix. */
  run: (prefix: string) => MemberStateMatrix;
}

const SENDERS: SenderRow[] = [
  {
    name: 'mailing-list broadcast',
    excludes: BULK_EXCLUDED,
    run: (prefix) => {
      const slug = `${prefix}-list`;
      const matrix = withDb((db) => seedMemberStateMatrix(db, { prefix, lists: [slug] }));
      createCommunicationService(createStubSesAdapter()).enqueue({
        audience: { kind: 'list', slug },
        subject: 'List news',
        bodyText: 'body',
        idempotencyKey: `${prefix}-send`,
      });
      return matrix;
    },
  },
  {
    name: 'event-participant broadcast',
    excludes: BULK_EXCLUDED,
    run: (prefix) => {
      const matrix = withDb((db) => {
        const eventId = insertEvent(db);
        return { eventId, matrix: seedMemberStateMatrix(db, { prefix, eventId }) };
      });
      createCommunicationService(createStubSesAdapter()).enqueue({
        audience: { kind: 'event', eventId: matrix.eventId },
        subject: 'Schedule change',
        bodyText: 'body',
        idempotencyKey: `${prefix}-send`,
      });
      return matrix.matrix;
    },
  },
  {
    name: 'administrator work-queue digest',
    excludes: BULK_EXCLUDED,
    run: (prefix) => {
      const matrix = withDb((db) => {
        insertWorkQueueItem(db, {
          queue_category: 'membership',
          task_type: 'member_contact_request',
          entity_type: 'member',
          entity_id: `${prefix}-entity`,
        });
        return seedMemberStateMatrix(db, { prefix, lists: ['admin-alerts'] });
      });
      workQueueService.sendAdminQueueDigests();
      return matrix;
    },
  },
  {
    // The reminder gates on deliverability and subscription rather than on
    // verification, so the unverified member is not part of this row's claim.
    name: 'Active Player expiry reminder',
    excludes: ['deceased', 'softDeleted', 'purged', 'bounced', 'complained'],
    run: (prefix) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * DAY_MS).toISOString();
      const matrix = withDb((db) => {
        const m = seedMemberStateMatrix(db, { prefix });
        for (const state of MEMBER_STATES) {
          insertActivePlayerGrant(db, {
            member_id: m[state],
            change_type: 'grant',
            new_active_player_expires_at: expiresAt,
            reason_code: 'official_event_attendance',
          });
        }
        return m;
      });
      runDailyPass({ now });
      return matrix;
    },
  },
];

describe('member-state mail sweep', () => {
  for (const [i, sender] of SENDERS.entries()) {
    // Defect caught: a sender's recipient statement forgets one member state,
    // so a deceased, deleted, purged or undeliverable member is mailed; or the
    // sender reaches nobody and every exclusion passes vacuously.
    it(`${sender.name}: reaches the live member and none of ${sender.excludes.join(', ')}`, () => {
      const matrix = sender.run(`mss${i}`);
      expect(outboxCountFor(matrix.live), `${sender.name} must reach the live member`).toBe(1);
      const leaked = sender.excludes.filter((state) => outboxCountFor(matrix[state]) > 0);
      expect(leaked, `${sender.name} mailed excluded member states`).toEqual([]);
    });
  }
});
