/**
 * Mailing-list administration: creating, editing and archiving a list, reading
 * its subscriber analytics, and the exceptional manual adjustment of one
 * member's subscription.
 *
 * Contract verified:
 *   - a created list is subscription-backed, filed under a slug derived from its
 *     name, and never carries a group
 *   - the slug and the status are not editable fields: the slug is the reference
 *     every subscription and archived send holds, and the status moves only
 *     through archiving
 *   - archiving preserves every subscription and is idempotent, and a write that
 *     moves nothing writes no audit row
 *   - subscriber counts are per-list and per-status, and a list with no
 *     subscribers still appears
 *   - a manual adjustment carries a mandatory reason, is limited to the statuses
 *     an administrator may decide, and is refused on a group-backed list whose
 *     membership is the group roster
 *   - every write that lands appends exactly one audit row naming the actor
 *
 * The audit ledger is append-only and cannot be cleared between cases, so every
 * assertion about it is scoped to the list the case created.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMailingList,
  insertMailingListSubscription,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3092');

const ADMIN  = 'ml_admin';
const MEMBER = 'ml_member';
const OTHER  = 'ml_other';

/** The lists the schema seeds, which the tests neither create nor remove. */
const SEEDED_LISTS = [
  'admin-alerts', 'all-members', 'newsletter', 'board-announcements',
  'event-notifications', 'technical-updates', 'active-player-reminders',
];

let testDb: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/mailingListService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let errors: typeof import('../../src/services/serviceErrors');

interface AuditRow {
  action_type: string;
  actor_member_id: string | null;
  actor_type: string;
  entity_id: string;
  reason_text: string | null;
  metadata_json: string;
}

/** Every audit row this action wrote about one list, oldest first. */
function auditFor(entityId: string, actionType?: string): AuditRow[] {
  const rows = testDb.prepare(`
    SELECT action_type, actor_member_id, actor_type, entity_id, reason_text, metadata_json
    FROM audit_entries
    WHERE entity_type = 'mailing_list' AND entity_id = ?
    ORDER BY created_at, id
  `).all(entityId) as AuditRow[];
  return actionType ? rows.filter((r) => r.action_type === actionType) : rows;
}

function listRow(slug: string): Record<string, unknown> | undefined {
  return testDb.prepare('SELECT * FROM mailing_lists WHERE slug = ?').get(slug) as
    Record<string, unknown> | undefined;
}

function subscriptionStatus(slug: string, memberId: string): string | undefined {
  const row = testDb.prepare(
    'SELECT status FROM mailing_list_subscriptions WHERE mailing_list_id = ? AND member_id = ?',
  ).get(slug, memberId) as { status: string } | undefined;
  return row?.status;
}

beforeAll(async () => {
  testDb = createTestDb(dbPath);

  insertMember(testDb, { id: ADMIN,  slug: 'ml_admin',  login_email: 'ml-admin@example.com',  is_admin: 1 });
  insertMember(testDb, { id: MEMBER, slug: 'ml_member', login_email: 'ml-member@example.com' });
  insertMember(testDb, { id: OTHER,  slug: 'ml_other',  login_email: 'ml-other@example.com' });

  await importApp();
  svc    = await import('../../src/services/mailingListService');
  errors = await import('../../src/services/serviceErrors');
});

afterAll(() => {
  testDb.close();
  cleanupTestDb(dbPath);
});

// Subscriptions and test-created lists are cleared between cases so counts read
// only what the case seeded. The seeded core lists stay: they are part of the
// schema every environment builds.
beforeEach(() => {
  testDb.prepare('DELETE FROM mailing_list_subscriptions').run();
  testDb.prepare(
    `DELETE FROM mailing_lists WHERE slug NOT IN (${SEEDED_LISTS.map(() => '?').join(',')})`,
  ).run(...SEEDED_LISTS);
});

describe('creating a mailing list', () => {
  it('files the list under a slug derived from its name and audits the creation', () => {
    const slug = svc.mailingListService.createList(
      { name: 'Regional News', description: 'Regional updates', isMemberManageable: true },
      ADMIN,
    );

    expect(slug).toBe('regional-news');
    const row = listRow(slug);
    expect(row).toBeDefined();
    expect(row!.name).toBe('Regional News');
    expect(row!.description).toBe('Regional updates');
    expect(row!.status).toBe('active');
    expect(row!.is_member_manageable).toBe(1);

    const rows = auditFor(slug, 'mailing_list.created');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_member_id).toBe(ADMIN);
    expect(rows[0]!.actor_type).toBe('admin');
  });

  it('creates a subscription-backed list that names no group', () => {
    const slug = svc.mailingListService.createList({ name: 'Project Alpha' }, ADMIN);
    const row = listRow(slug)!;
    expect(row.recipient_source).toBe('subscription');
    expect(row.source_group_id).toBeNull();
    // A general list's senders are the administrators, so composing to it is
    // not restricted to a configured population.
    expect(row.restricted_sending).toBe(0);
  });

  it('stores the from-identity and subject prefix as given', () => {
    const slug = svc.mailingListService.createList(
      { name: 'Sanctioning', fromIdentity: 'sanctioning@footbag.org', subjectPrefix: 'IFPA' },
      ADMIN,
    );
    const row = listRow(slug)!;
    expect(row.from_identity).toBe('sanctioning@footbag.org');
    expect(row.subject_prefix).toBe('IFPA');
  });

  it('treats an empty from-identity as the default sender rather than an empty address', () => {
    const slug = svc.mailingListService.createList({ name: 'Plain List', fromIdentity: '  ' }, ADMIN);
    expect(listRow(slug)!.from_identity).toBeNull();
  });

  it('refuses a list with no name and creates nothing', () => {
    expect(() => svc.mailingListService.createList({ name: '   ' }, ADMIN))
      .toThrow(errors.ValidationError);
    expect(svc.mailingListService.listMailingLists().map((l) => l.slug).sort())
      .toEqual([...SEEDED_LISTS].sort());
  });

  it('refuses a name that would yield an empty slug', () => {
    let caught: unknown;
    try {
      svc.mailingListService.createList({ name: '???' }, ADMIN);
    } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(errors.ValidationError);
    expect((caught as { fieldErrors?: Record<string, string> }).fieldErrors?.name).toBeTruthy();
  });

  it('refuses a from-identity that is not an email address', () => {
    let caught: unknown;
    try {
      svc.mailingListService.createList({ name: 'Bad Sender', fromIdentity: 'not-an-address' }, ADMIN);
    } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(errors.ValidationError);
    expect((caught as { fieldErrors?: Record<string, string> }).fieldErrors?.fromIdentity).toBeTruthy();
  });

  it('refuses a subject prefix longer than the cap', () => {
    let caught: unknown;
    try {
      svc.mailingListService.createList({ name: 'Long Prefix', subjectPrefix: 'x'.repeat(33) }, ADMIN);
    } catch (err) { caught = err; }
    expect(caught).toBeInstanceOf(errors.ValidationError);
    expect((caught as { fieldErrors?: Record<string, string> }).fieldErrors?.subjectPrefix).toBeTruthy();
  });

  it('refuses a second list with a name already in use, leaving one creation on the ledger', () => {
    const slug = svc.mailingListService.createList({ name: 'Duplicate Name' }, ADMIN);

    expect(() => svc.mailingListService.createList({ name: 'Duplicate Name' }, ADMIN))
      .toThrow(errors.ConflictError);
    expect(auditFor(slug, 'mailing_list.created')).toHaveLength(1);
  });
});

describe('editing a mailing list', () => {
  it('records exactly the fields that changed', () => {
    const slug = svc.mailingListService.createList(
      { name: 'Editable', description: 'before', isMemberManageable: true },
      ADMIN,
    );

    svc.mailingListService.updateList(
      slug, { name: 'Editable', description: 'after', isMemberManageable: true }, ADMIN,
    );

    const rows = auditFor(slug, 'mailing_list.updated');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.metadata_json).changedFields).toEqual(['description']);
    expect(listRow(slug)!.description).toBe('after');
  });

  it('leaves the slug and the status alone', () => {
    const slug = svc.mailingListService.createList({ name: 'Stable Slug' }, ADMIN);
    svc.mailingListService.updateList(slug, { name: 'Renamed Entirely' }, ADMIN);

    const row = listRow(slug)!;
    expect(row.slug).toBe('stable-slug');
    expect(row.name).toBe('Renamed Entirely');
    expect(row.status).toBe('active');
  });

  it('refuses an unknown list', () => {
    expect(() => svc.mailingListService.updateList('no-such-list', { name: 'Anything' }, ADMIN))
      .toThrow(errors.NotFoundError);
  });

  it('refuses a rename onto a name another list already holds', () => {
    svc.mailingListService.createList({ name: 'First List' }, ADMIN);
    const second = svc.mailingListService.createList({ name: 'Second List' }, ADMIN);

    expect(() => svc.mailingListService.updateList(second, { name: 'First List' }, ADMIN))
      .toThrow(errors.ConflictError);
    expect(listRow(second)!.name).toBe('Second List');
    expect(auditFor(second, 'mailing_list.updated')).toHaveLength(0);
  });
});

describe('archiving a mailing list', () => {
  it('archives an active list, keeps its subscriptions, and audits it once', () => {
    const slug = svc.mailingListService.createList({ name: 'To Archive' }, ADMIN);
    insertMailingListSubscription(testDb, { member_id: MEMBER, list_slug: slug });

    const outcome = svc.mailingListService.archiveList(slug, ADMIN);

    expect(outcome).toEqual({ status: 'archived' });
    expect(listRow(slug)!.status).toBe('archived');
    expect(subscriptionStatus(slug, MEMBER)).toBe('subscribed');
    expect(auditFor(slug, 'mailing_list.archived')).toHaveLength(1);
  });

  it('reports a second archive as a no-op and writes no second audit row', () => {
    const slug = svc.mailingListService.createList({ name: 'Twice Archived' }, ADMIN);
    svc.mailingListService.archiveList(slug, ADMIN);

    const outcome = svc.mailingListService.archiveList(slug, ADMIN);

    expect(outcome).toEqual({ status: 'noop', reason: 'already_archived' });
    expect(auditFor(slug, 'mailing_list.archived')).toHaveLength(1);
  });

  it('refuses an unknown list', () => {
    expect(() => svc.mailingListService.archiveList('no-such-list', ADMIN))
      .toThrow(errors.NotFoundError);
  });
});

describe('reading the lists and their subscriber analytics', () => {
  it('counts each list\'s subscribers by status without borrowing another list\'s', () => {
    const counted = svc.mailingListService.createList({ name: 'Counted' }, ADMIN);
    const neighbour = svc.mailingListService.createList({ name: 'Neighbour' }, ADMIN);

    insertMailingListSubscription(testDb, { member_id: MEMBER, list_slug: counted, status: 'subscribed' });
    insertMailingListSubscription(testDb, { member_id: OTHER,  list_slug: counted, status: 'bounced' });
    insertMailingListSubscription(testDb, { member_id: ADMIN,  list_slug: counted, status: 'unsubscribed' });
    insertMailingListSubscription(testDb, { member_id: MEMBER, list_slug: neighbour, status: 'complained' });

    const summary = svc.mailingListService.getMailingList(counted)!;
    expect(summary.counts).toEqual({
      subscribed: 1, unsubscribed: 1, bounced: 1, complained: 0, suppressed: 0, total: 3,
    });

    const neighbourSummary = svc.mailingListService.getMailingList(neighbour)!;
    expect(neighbourSummary.counts.complained).toBe(1);
    expect(neighbourSummary.counts.total).toBe(1);
  });

  it('includes a list that has no subscribers at all', () => {
    const slug = svc.mailingListService.createList({ name: 'Nobody Yet' }, ADMIN);
    const found = svc.mailingListService.listMailingLists().find((l) => l.slug === slug);

    expect(found).toBeDefined();
    expect(found!.counts.total).toBe(0);
  });

  it('returns null for a slug no list holds', () => {
    expect(svc.mailingListService.getMailingList('no-such-list')).toBeNull();
  });

  it('reports a group-backed list as group-backed', () => {
    insertMailingList(testDb, {
      slug: 'group-backed', name: 'Group Backed',
      recipient_source: 'group', source_group_id: 'group_1',
    });
    const summary = svc.mailingListService.getMailingList('group-backed')!;
    expect(summary.isGroupBacked).toBe(true);
    expect(summary.sourceGroupId).toBe('group_1');
  });
});

describe('adjusting a subscription on a member\'s behalf', () => {
  it('releases a bounced address and records the reason against the actor', () => {
    const slug = svc.mailingListService.createList({ name: 'Adjustable' }, ADMIN);
    insertMailingListSubscription(testDb, { member_id: MEMBER, list_slug: slug, status: 'bounced' });

    const outcome = svc.mailingListService.adjustSubscription(
      slug, MEMBER, 'subscribed', 'Member confirmed the mailbox is working again', ADMIN,
    );

    expect(outcome).toEqual({ status: 'adjusted' });
    expect(subscriptionStatus(slug, MEMBER)).toBe('subscribed');

    const rows = auditFor(slug, 'mailing_list.subscription_adjusted');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_member_id).toBe(ADMIN);
    expect(rows[0]!.reason_text).toBe('Member confirmed the mailbox is working again');
    expect(JSON.parse(rows[0]!.metadata_json).memberId).toBe(MEMBER);
  });

  it('refuses an adjustment with no reason', () => {
    const slug = svc.mailingListService.createList({ name: 'Needs Reason' }, ADMIN);
    insertMailingListSubscription(testDb, { member_id: MEMBER, list_slug: slug, status: 'bounced' });

    expect(() => svc.mailingListService.adjustSubscription(slug, MEMBER, 'subscribed', '   ', ADMIN))
      .toThrow(errors.ValidationError);
    expect(subscriptionStatus(slug, MEMBER)).toBe('bounced');
  });

  it('refuses a reason longer than the cap', () => {
    const slug = svc.mailingListService.createList({ name: 'Long Reason' }, ADMIN);
    insertMailingListSubscription(testDb, { member_id: MEMBER, list_slug: slug, status: 'bounced' });

    expect(() => svc.mailingListService.adjustSubscription(
      slug, MEMBER, 'subscribed', 'x'.repeat(501), ADMIN,
    )).toThrow(errors.ValidationError);
    expect(subscriptionStatus(slug, MEMBER)).toBe('bounced');
  });

  it('refuses to set a status the provider owns rather than an administrator', () => {
    const slug = svc.mailingListService.createList({ name: 'Provider Status' }, ADMIN);
    insertMailingListSubscription(testDb, { member_id: MEMBER, list_slug: slug, status: 'subscribed' });

    expect(() => svc.mailingListService.adjustSubscription(
      slug, MEMBER, 'bounced', 'Trying to mark it bounced', ADMIN,
    )).toThrow(errors.ValidationError);
    expect(subscriptionStatus(slug, MEMBER)).toBe('subscribed');
  });

  it('reports a member who holds no row on the list as a no-op', () => {
    const slug = svc.mailingListService.createList({ name: 'No Row' }, ADMIN);

    const outcome = svc.mailingListService.adjustSubscription(
      slug, MEMBER, 'subscribed', 'Nothing to move', ADMIN,
    );

    expect(outcome).toEqual({ status: 'noop', reason: 'unchanged' });
    expect(auditFor(slug, 'mailing_list.subscription_adjusted')).toHaveLength(0);
  });

  it('refuses an adjustment on a group-backed list, where the roster is the membership', () => {
    insertMailingList(testDb, {
      slug: 'committee-list', name: 'Committee List',
      recipient_source: 'group', source_group_id: 'group_2',
    });
    insertMailingListSubscription(testDb, { member_id: MEMBER, list_slug: 'committee-list', status: 'subscribed' });

    expect(() => svc.mailingListService.adjustSubscription(
      'committee-list', MEMBER, 'unsubscribed', 'Asked to leave', ADMIN,
    )).toThrow(errors.ValidationError);
    expect(subscriptionStatus('committee-list', MEMBER)).toBe('subscribed');
  });

  it('refuses an unknown list', () => {
    expect(() => svc.mailingListService.adjustSubscription(
      'no-such-list', MEMBER, 'subscribed', 'Anything', ADMIN,
    )).toThrow(errors.NotFoundError);
  });
});
