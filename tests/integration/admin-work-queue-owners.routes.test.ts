/**
 * Setting each work-queue area's owner: POST /admin/work-queue/owners.
 *
 * Any administrator may set any area's owner to a current administrator or to
 * no owner. Each area whose owner changes writes one audit row with the owner
 * before and after; a save that changes nothing writes nothing and says so in
 * the informational tone. A choice that is not a current administrator refuses
 * the whole save, and the re-rendered page still offers a valid way forward.
 * Every queue action returns to the area and category the administrator was
 * working in.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertWorkQueueItem, insertWorkQueueTopicOwner, createTestSessionJwt,
} from '../fixtures/factories';
import { expectCsrfReject } from '../fixtures/expectCsrfReject';
import { flashValueOf } from '../fixtures/flashCookie';
import { outcomeNotice } from '../../src/lib/outcomeNotice';
import { WORK_QUEUE_TOPIC_KEYS } from '../../src/services/workQueueTaskTypes';

const { dbPath } = setTestEnv('4319');

const ADMIN = 'wqo_admin';
const COLLEAGUE = 'wqo_colleague';
const MEMBER = 'wqo_member';
const OWNERS_PATH = '/admin/work-queue/owners';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string, role: 'admin' | 'member' = 'admin'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function owners(): Record<string, string | null> {
  return withDb((db) => Object.fromEntries(
    (db.prepare('SELECT topic, owner_member_id FROM work_queue_topic_owners').all() as Array<{ topic: string; owner_member_id: string | null }>)
      .map((r) => [r.topic, r.owner_member_id]),
  ));
}

function ownerAudits(): Array<{ id: string; actor_member_id: string; entity_type: string; entity_id: string; metadata_json: string }> {
  return withDb((db) => db.prepare(
    `SELECT id, actor_member_id, entity_type, entity_id, metadata_json FROM audit_entries
      WHERE action_type = 'work_queue.topic_owner_changed'`,
  ).all() as Array<{ id: string; actor_member_id: string; entity_type: string; entity_id: string; metadata_json: string }>);
}

/** The audit rows a step added, keyed by area. */
function auditsAddedSince(beforeIds: Set<string>): Record<string, { actor: string; entityType: string; before: unknown; after: unknown }> {
  return Object.fromEntries(ownerAudits().filter((a) => !beforeIds.has(a.id)).map((a) => {
    const meta = JSON.parse(a.metadata_json) as { before: unknown; after: unknown };
    return [a.entity_id, { actor: a.actor_member_id, entityType: a.entity_type, before: meta.before, after: meta.after }];
  }));
}

function auditIds(): Set<string> {
  return new Set(ownerAudits().map((a) => a.id));
}

/** A whole form as the page posts it: every area, '' meaning no owner. */
function ownersBody(choices: Record<string, string> = {}): Record<string, string> {
  return {
    owner_finance: '', owner_membership: '', owner_platform: '', owner_sanctioning: '', owner_freestyle: '',
    category: '', topic: '',
    ...choices,
  };
}

function tone(res: { get(h: string): string[] | string | undefined }): string | undefined {
  const value = flashValueOf(res);
  expect(value?.startsWith('work_queue_outcome:'), 'the outcome rides the work-queue flash').toBe(true);
  return outcomeNotice(value!.slice('work_queue_outcome:'.length))?.tone;
}

function postOwners(body: Record<string, string>, as = ADMIN) {
  return request(createApp()).post(OWNERS_PATH).set('Cookie', cookieFor(as)).type('form').send(body);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN, slug: 'wqo_admin', display_name: 'Owners Admin', login_email: 'wqo-admin@example.com', is_admin: 1 });
  insertMember(db, { id: COLLEAGUE, slug: 'wqo_colleague', display_name: 'Owners Colleague', login_email: 'wqo-colleague@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER, slug: 'wqo_member', display_name: 'Owners Member', login_email: 'wqo-member@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => {
    db.prepare('DELETE FROM work_queue_topic_owners').run();
    db.prepare('DELETE FROM work_queue_items').run();
  });
});

describe('who may set area owners', () => {
  // Defect caught: a signed-out visitor reaches the owners write.
  it('sends a signed-out visitor to log in, writing nothing', async () => {
    const res = await request(createApp()).post(OWNERS_PATH).type('form').send(ownersBody({ owner_finance: ADMIN }));
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
    expect(owners()).toEqual({});
  });

  // Defect caught: a member who is not an administrator assigns areas.
  it('refuses a signed-in member who is not an administrator, writing nothing', async () => {
    const res = await request(createApp()).post(OWNERS_PATH).set('Cookie', cookieFor(MEMBER, 'member'))
      .type('form').send(ownersBody({ owner_finance: MEMBER }));
    expect(res.status).toBe(403);
    expect(owners()).toEqual({});
  });

  // Defect caught: the owners write is mounted outside the cross-site perimeter.
  it('refuses a cross-site post', async () => {
    await expectCsrfReject(createApp(), 'post', OWNERS_PATH, { cookie: cookieFor(ADMIN), body: ownersBody({ owner_finance: ADMIN }) });
    expect(owners()).toEqual({});
  });
});

describe('saving area owners', () => {
  // Defect caught: the page offers an owner choice for an area the save never
  // reads, so choosing that area's owner reports "no change" and keeps none.
  it('saves an owner for every area the form offers', async () => {
    const page = await request(createApp()).get('/admin/work-queue').set('Cookie', cookieFor(ADMIN));
    expect(page.status).toBe(200);
    const fields = [...page.text.matchAll(/<select id="owner_([a-z]+)" name="owner_\1">/g)].map((m) => m[1]!);
    // Every area the registry declares is offered.
    expect(fields.sort()).toEqual([...WORK_QUEUE_TOPIC_KEYS].sort());

    const body: Record<string, string> = { category: '', topic: '' };
    for (const area of fields) body[`owner_${area}`] = ADMIN;
    const res = await postOwners(body);
    expect(res.status).toBe(303);
    expect(tone(res)).toBe('ok');
    expect(owners()).toEqual(Object.fromEntries(fields.map((area) => [area, ADMIN])));
  });

  // Defect caught: an owner change leaves no trail of who moved an area from
  // whom, or an untouched area is recorded as changed.
  it('records each changed area with one audit row naming the owner before and after', async () => {
    const before = auditIds();
    const res = await postOwners(ownersBody({ owner_finance: ADMIN, owner_membership: COLLEAGUE }));

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/work-queue');
    expect(tone(res)).toBe('ok');
    expect(owners()).toEqual({ finance: ADMIN, membership: COLLEAGUE });
    expect(auditsAddedSince(before)).toEqual({
      finance:    { actor: ADMIN, entityType: 'work_queue_topic', before: null, after: ADMIN },
      membership: { actor: ADMIN, entityType: 'work_queue_topic', before: null, after: COLLEAGUE },
    });

    // Any administrator may hand an area on, and clearing an owner is a change.
    const second = auditIds();
    const handOver = await postOwners(ownersBody({ owner_finance: COLLEAGUE }), COLLEAGUE);
    expect(handOver.status).toBe(303);
    expect(owners()).toEqual({ finance: COLLEAGUE, membership: null });
    expect(auditsAddedSince(second)).toEqual({
      finance:    { actor: COLLEAGUE, entityType: 'work_queue_topic', before: ADMIN, after: COLLEAGUE },
      membership: { actor: COLLEAGUE, entityType: 'work_queue_topic', before: COLLEAGUE, after: null },
    });
  });

  // Defect caught: a double submit or a back-button re-post writes a second
  // audit row for a change that already landed, or reports a change it did not make.
  it('a save that changes nothing writes nothing and says so in the informational tone', async () => {
    const body = ownersBody({ owner_finance: ADMIN });
    await postOwners(body);
    const stored = owners();
    const before = auditIds();
    const versions = withDb((db) => db.prepare('SELECT topic, version FROM work_queue_topic_owners').all());

    const again = await postOwners(body);

    expect(again.status).toBe(303);
    expect(tone(again)).toBe('info');
    expect(owners()).toEqual(stored);
    expect(auditsAddedSince(before)).toEqual({});
    expect(withDb((db) => db.prepare('SELECT topic, version FROM work_queue_topic_owners').all())).toEqual(versions);
  });

  // Defect caught: an area is handed to a member who is not an administrator,
  // or to an id that names nobody, or a refused save still lands its valid half.
  it('refuses an owner who is not a current administrator, writing nothing, and the re-rendered form still saves', async () => {
    for (const bad of [MEMBER, 'no-such-member']) {
      const before = auditIds();
      const res = await postOwners(ownersBody({ owner_finance: ADMIN, owner_platform: bad }));
      expect(res.status, bad).toBe(422);
      expect(owners(), bad).toEqual({});
      expect(auditsAddedSince(before), bad).toEqual({});
    }

    // The refusal page offers the form again, with only administrators to pick.
    const refused = await postOwners(ownersBody({ owner_platform: MEMBER }));
    expect(refused.text).toContain(`action="${OWNERS_PATH}"`);
    const platformSelect = /<select id="owner_platform" name="owner_platform">([\s\S]*?)<\/select>/.exec(refused.text);
    expect(platformSelect).not.toBeNull();
    const offered = [...platformSelect![1]!.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    expect(offered.sort()).toEqual(['', ADMIN, COLLEAGUE].sort());

    // Choosing one of the offered administrators instead succeeds.
    const fixed = await postOwners(ownersBody({ owner_platform: COLLEAGUE }));
    expect(fixed.status).toBe(303);
    expect(owners()).toEqual({ platform: COLLEAGUE });
  });
});

describe('returning to the view the administrator was working in', () => {
  // Defect caught: saving owners from a narrowed view drops the reader back
  // onto the whole queue.
  it('returns from an owners save to the same area and category', async () => {
    const res = await postOwners(ownersBody({ owner_finance: ADMIN, topic: 'finance', category: 'payments' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/work-queue?topic=finance&category=payments');
  });

  // Defect caught: acting on an item in a narrowed view loses the area filter,
  // so it is useless after one item.
  it('returns from a claim to the same area and category', async () => {
    const item = withDb((db) => insertWorkQueueItem(db, {
      queue_category: 'payments', task_type: 'reconciliation_discrepancy', entity_type: 'reconciliation_issue', entity_id: 'ri-claim',
    }));
    const res = await request(createApp())
      .post(`/admin/work-queue/${item}/claim`).set('Cookie', cookieFor(ADMIN)).type('form')
      .send({ topic: 'finance', category: 'payments' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/work-queue?topic=finance&category=payments');
  });
});

describe('an owner who lost the administrator role', () => {
  // Defect caught: an owner who is no longer an administrator still reads as
  // owner when the form is saved, so re-choosing them compares equal and the
  // stale row is never replaced.
  it('can be replaced from the form, which shows the area as unowned', async () => {
    withDb((db) => {
      insertMember(db, { id: 'wqo_former', slug: 'wqo_former', display_name: 'Owners Former', login_email: 'wqo-former@example.com', is_admin: 0 });
      insertWorkQueueTopicOwner(db, { topic: 'freestyle', owner_member_id: 'wqo_former' });
    });
    const before = auditIds();
    const res = await postOwners(ownersBody({ owner_freestyle: ADMIN }));
    expect(res.status).toBe(303);
    expect(owners()).toEqual({ freestyle: ADMIN });
    expect(auditsAddedSince(before)).toEqual({
      freestyle: { actor: ADMIN, entityType: 'work_queue_topic', before: 'wqo_former', after: ADMIN },
    });
  });
});
