/**
 * One work-queue item's own page: GET /admin/work-queue/:id, and where each
 * action taken from it returns the administrator.
 *
 * The page opens with the type's declared what, why and what to do, and offers
 * the item's actions, or only Return to the Queue while it is parked. A closing
 * action returns to the list in the state the administrator was working in; a
 * non-closing one returns to the page it was taken on. A refusal re-renders the
 * item's page at 422 still carrying that state. Both confirm pages cancel back
 * to the item. A closed or unknown id is not found.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertWorkQueueItem, insertLegacyMember, createTestSessionJwt,
} from '../fixtures/factories';
import { WORK_QUEUE_TASK_TYPES } from '../../src/services/workQueueTaskTypes';

const { dbPath } = setTestEnv('4400');

const ADMIN = 'wqi_admin';
const MEMBER = 'wqi_member';
const REQUESTER = 'wqi_requester';
const LOST_ADMIN = 'wqi_lost_admin';

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

/** Undo the attribute escaping the templates apply, so a link reads as the browser follows it. */
function decodeAttr(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&#x3D;/g, '=').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
}

/** Text as the templates escape it in element content. */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/`/g, '&#x60;').replace(/=/g, '&#x3D;');
}

function hrefsOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => decodeAttr(m[1]));
}

/** The work-queue forms on a page, leaving out the site frame's own (log out). */
function formActionsOf(html: string): string[] {
  return [...html.matchAll(/<form[^>]*action="([^"]*)"/g)]
    .map((m) => decodeAttr(m[1]))
    .filter((action) => action.startsWith('/admin/work-queue'));
}

// The review and resolution notes stop at 500 characters, so one past it is
// the shortest note an administrator can type that is refused.
const NOTE_ONE_PAST_LIMIT = 'x'.repeat(501);

/** The value of one hidden field inside the form posting to `action`. */
function hiddenValueIn(html: string, action: string, name: string): string | undefined {
  const start = html.indexOf(`action="${action}"`);
  if (start < 0) return undefined;
  const form = html.slice(start, html.indexOf('</form>', start));
  const m = form.match(new RegExp(`name="${name}" value="([^"]*)"`));
  return m ? decodeAttr(m[1]) : undefined;
}

function itemPage(id: string, query = '') {
  return request(createApp()).get(`/admin/work-queue/${id}${query}`).set('Cookie', cookieFor(ADMIN));
}

function post(path: string, body: Record<string, string>) {
  return request(createApp()).post(path).set('Cookie', cookieFor(ADMIN)).type('form').send(body);
}

function seedReconciliation(entityId: string): string {
  return withDb((db) => insertWorkQueueItem(db, {
    task_type: 'reconciliation_discrepancy', entity_type: 'reconciliation_issue', entity_id: entityId,
  }));
}

function seedLossAlert(): string {
  return withDb((db) => insertWorkQueueItem(db, {
    task_type: 'admin_loss_recruitment', entity_type: 'member', entity_id: LOST_ADMIN,
  }));
}

function seedLinkHelp(parked = false): string {
  return withDb((db) => insertWorkQueueItem(db, {
    task_type: 'member_link_help_request', entity_type: 'member', entity_id: REQUESTER, created_by: REQUESTER,
    reason_text: JSON.stringify({ statement: 'Those old records are mine.', is_dispute: false }),
    ...(parked
      ? { parked_at: '2026-01-02T00:00:00.000Z', parked_by_member_id: ADMIN, park_reason: 'Waiting on the old site owner.' }
      : {}),
  }));
}

function statusOf(id: string): string {
  return withDb((db) => (db.prepare('SELECT status FROM work_queue_items WHERE id = ?').get(id) as { status: string }).status);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN, slug: 'wqi_admin', display_name: 'Item Admin', login_email: 'wqi-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER, slug: 'wqi_member', display_name: 'Item Member', login_email: 'wqi-member@example.com' });
  insertMember(db, { id: REQUESTER, slug: 'wqi_requester', display_name: 'Item Requester', real_name: 'Item Requester', login_email: 'wqi-requester@example.com' });
  insertMember(db, { id: LOST_ADMIN, slug: 'wqi_lost_admin', display_name: 'Item Lost Admin', login_email: 'wqi-lost@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => db.prepare('DELETE FROM work_queue_items').run());
});

describe('GET /admin/work-queue/:id', () => {
  // Defect caught: a signed-out visitor or a member reads an item's evidence.
  it('sends a signed-out visitor to log in and refuses a member who is not an administrator', async () => {
    const id = seedReconciliation('ri-gate');
    const anon = await request(createApp()).get(`/admin/work-queue/${id}`);
    expect(anon.status).toBe(302);
    expect(anon.headers.location).toMatch(/^\/login/);
    const member = await request(createApp()).get(`/admin/work-queue/${id}`).set('Cookie', cookieFor(MEMBER, 'member'));
    expect(member.status).toBe(403);
  });

  // Defect caught: an item's page opens on another type's brief, or none, so
  // the administrator has to guess what the item asks of them.
  it("opens with the item's own declared what, why and what to do", async () => {
    const recon = seedReconciliation('ri-brief');
    const loss = seedLossAlert();
    for (const [id, type, other] of [
      [recon, 'reconciliation_discrepancy', 'admin_loss_recruitment'],
      [loss, 'admin_loss_recruitment', 'reconciliation_discrepancy'],
    ] as const) {
      const res = await itemPage(id);
      expect(res.status, type).toBe(200);
      const { what, why, todo } = WORK_QUEUE_TASK_TYPES[type].brief;
      for (const line of [what, why, todo]) {
        expect(res.text, `${type} brief`).toContain(`<p>${escapeText(line)}</p>`);
      }
      expect(res.text, `${type} shows no other type's brief`)
        .not.toContain(escapeText(WORK_QUEUE_TASK_TYPES[other].brief.what));
    }
  });

  // Defect caught: the back link drops the view the item was opened from, so
  // every item worked costs the administrator their filters.
  it('leads back to the list in the state it was opened from', async () => {
    const id = seedReconciliation('ri-back');
    const res = await itemPage(id, '?kind=housekeeping&topic=finance&page=2');
    expect(res.status).toBe(200);
    expect(hrefsOf(res.text)).toContain('/admin/work-queue?kind=housekeeping&topic=finance&page=2');
  });

  // Defect caught: a closed item's page still renders its actions, inviting a
  // second decision on a settled matter; or an unknown id renders an empty page.
  it('is not found for a closed item and for an unknown id, while the open item renders', async () => {
    const open = seedReconciliation('ri-open');
    const closed = withDb((db) => insertWorkQueueItem(db, {
      task_type: 'reconciliation_discrepancy', entity_type: 'reconciliation_issue', entity_id: 'ri-closed',
      status: 'resolved', resolved_at: '2026-01-03T00:00:00.000Z', resolved_by_member_id: ADMIN,
    }));
    expect((await itemPage(open)).status).toBe(200);
    expect((await itemPage(closed)).status).toBe(404);
    expect((await itemPage('wq-no-such-item')).status).toBe(404);
  });

  // Defect caught: a parked item offers its decisions, so it is settled while
  // it should be waiting; or an unparked one loses them.
  it('offers only Return to the Queue on a parked item, and the actions on one that is not', async () => {
    const parked = seedLinkHelp(true);
    const parkedRes = await itemPage(parked);
    expect(parkedRes.status).toBe(200);
    expect(formActionsOf(parkedRes.text)).toEqual([`/admin/work-queue/${parked}/unpark`]);

    withDb((db) => db.prepare('DELETE FROM work_queue_items').run());
    const working = seedLinkHelp(false);
    const workingActions = formActionsOf((await itemPage(working)).text);
    expect(workingActions).not.toContain(`/admin/work-queue/${working}/unpark`);
    expect(workingActions).toContain(`/admin/work-queue/${working}/claim`);
    expect(workingActions).toContain(`/admin/work-queue/${working}/link-help/reject`);
    expect(workingActions).toContain(`/admin/work-queue/${working}/park`);
  });

  // Defect caught: the item route registered before the parked page reads
  // "parked" as an item id and answers not-found for the parked listing.
  it('serves the parked listing at its own address, not as an item', async () => {
    const parked = seedLinkHelp(true);
    const res = await request(createApp()).get('/admin/work-queue/parked').set('Cookie', cookieFor(ADMIN));
    expect(res.status).toBe(200);
    expect(formActionsOf(res.text)).toContain(`/admin/work-queue/${parked}/unpark`);
  });
});

describe('where an action returns the administrator', () => {
  // Defect caught: closing an item returns to its own page, which is now not
  // found, or to an unfiltered list.
  it('returns from a closing action to the list in the state it carried', async () => {
    const id = seedLossAlert();
    const page = await itemPage(id, '?kind=team_alert');
    const action = `/admin/work-queue/${id}/dismiss`;
    expect(formActionsOf(page.text)).toContain(action);
    const res = await post(action, {
      note: 'Recruiting started.', kind: hiddenValueIn(page.text, action, 'kind')!,
      topic: '', unclaimed: '', page: '', from: hiddenValueIn(page.text, action, 'from')!,
    });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/work-queue?kind=team_alert');
    expect(statusOf(id)).not.toBe('open');
  });

  // Defect caught: parking from an item's page throws the reader back to the
  // list, away from the item they were working.
  it("returns from a park taken on the item's page to that page, with the list state", async () => {
    const id = seedLinkHelp(false);
    const res = await post(`/admin/work-queue/${id}/park`, {
      note: 'Waiting on the old site owner.', kind: 'waiting', topic: 'membership', unclaimed: '', page: '', from: 'item',
    });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/admin/work-queue/${id}?kind=waiting&topic=membership`);
  });

  // Defect caught: returning an item from the parked listing lands on the
  // working list, so a second parked item needs the listing found again.
  it('returns from Return to the Queue on the parked listing to that listing, and from the item page to the item', async () => {
    const fromList = seedLinkHelp(true);
    const listed = await post(`/admin/work-queue/${fromList}/unpark`, { from: 'parked' });
    expect(listed.status).toBe(303);
    expect(listed.headers.location).toBe('/admin/work-queue/parked');

    withDb((db) => db.prepare('DELETE FROM work_queue_items').run());
    const fromItem = seedLinkHelp(true);
    const page = await itemPage(fromItem, '?kind=waiting');
    const action = `/admin/work-queue/${fromItem}/unpark`;
    const res = await post(action, {
      kind: hiddenValueIn(page.text, action, 'kind')!, topic: '', unclaimed: '', page: '',
      from: hiddenValueIn(page.text, action, 'from')!,
    });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/admin/work-queue/${fromItem}?kind=waiting`);
  });

  // Defect caught: a refused action re-renders the list, or drops the list
  // state, so the corrected resubmission lands somewhere else.
  it("re-renders the item's page at 422 on a refusal, still carrying the list state, and the corrected form closes the item", async () => {
    const id = seedLossAlert();
    const action = `/admin/work-queue/${id}/dismiss`;
    const refused = await post(action, {
      note: NOTE_ONE_PAST_LIMIT, kind: 'team_alert', topic: '', unclaimed: '', page: '', from: 'item',
    });
    expect(refused.status).toBe(422);
    expect(refused.text).toContain('class="work-queue-item"');
    expect(formActionsOf(refused.text)).toContain(action);
    expect(hiddenValueIn(refused.text, action, 'kind')).toBe('team_alert');
    expect(statusOf(id)).toBe('open');

    const retried = await post(action, {
      note: 'Recruiting started.', kind: hiddenValueIn(refused.text, action, 'kind')!,
      topic: '', unclaimed: '', page: '', from: 'item',
    });
    expect(retried.status).toBe(303);
    expect(retried.headers.location).toBe('/admin/work-queue?kind=team_alert');
  });

  // Defect caught: a malformed body on an item that has since closed answers
  // not-found, where every malformed form body is answered as a refusal.
  it('re-renders the list at 422 for a malformed body on an item no longer open', async () => {
    const id = withDb((db) => insertWorkQueueItem(db, {
      task_type: 'admin_loss_recruitment', entity_type: 'member', entity_id: LOST_ADMIN,
      status: 'dismissed', resolved_at: '2026-01-03T00:00:00.000Z', resolved_by_member_id: ADMIN,
    }));
    const res = await request(createApp())
      .post(`/admin/work-queue/${id}/dismiss`).set('Cookie', cookieFor(ADMIN)).type('form')
      .send('note=first&note=second&kind=team_alert&from=item');
    expect(res.status).toBe(422);
    expect(res.text).not.toContain('class="work-queue-item"');
    // The list's kind links, which only the list page carries.
    expect(hrefsOf(res.text)).toContain('/admin/work-queue?kind=team_alert');
  });
});

describe('the confirm pages cancel back to the item', () => {
  // Defect caught: Cancel on a link approval leaves the item the approval was
  // started from, so the administrator loses their place and their filters.
  it('cancels a link approval to the item page, carrying the list state', async () => {
    const id = seedLinkHelp(false);
    withDb((db) => insertLegacyMember(db, {
      legacy_member_id: 'LM-wqi-cancel', real_name: 'Old Requester', display_name: 'Old Requester',
    }));
    const res = await post(`/admin/work-queue/${id}/link-help/approve`, {
      target_legacy_member_id: 'LM-wqi-cancel', target_historical_person_id: '', reason: '',
      kind: 'waiting', topic: 'membership', unclaimed: '', page: '', from: 'item',
    });
    expect(res.status).toBe(200);
    expect(hrefsOf(res.text)).toContain(`/admin/work-queue/${id}?kind=waiting&topic=membership`);
  });

  // Defect caught: Cancel on a revert preview leaves the dispute's item, the
  // one place the administrator can decide it some other way.
  it('cancels a dispute revert to the item page, carrying the list state', async () => {
    const holder = 'wqi_holder';
    const accountId = 'LM-wqi-dispute';
    withDb((db) => {
      insertMember(db, { id: holder, slug: 'wqi_holder', display_name: 'Item Holder', login_email: 'wqi-holder@example.com' });
      insertLegacyMember(db, {
        legacy_member_id: accountId, real_name: 'Disputed Old Account',
        claimed_by_member_id: holder, claimed_at: '2026-01-01T00:00:00.000Z',
      });
      db.prepare('UPDATE members SET legacy_member_id = ? WHERE id = ?').run(accountId, holder);
    });
    const id = withDb((db) => insertWorkQueueItem(db, {
      task_type: 'member_link_help_request', entity_type: 'member', entity_id: REQUESTER, created_by: REQUESTER,
      reason_text: JSON.stringify({
        statement: 'That old account was mine.', is_dispute: true,
        disputed_legacy_member_ids: [accountId], disputed_historical_person_ids: [],
        disputed_record_holders: { [accountId]: holder },
      }),
    }));
    const res = await post(`/admin/work-queue/${id}/link-help/dispute-revert`, {
      disputed_record: `account:${accountId}`, reason: 'Upheld after review.',
      kind: 'waiting', topic: '', unclaimed: '1', page: '', from: 'item',
    });
    expect(res.status).toBe(200);
    expect(hrefsOf(res.text)).toContain(`/admin/work-queue/${id}?kind=waiting&unclaimed=1`);
  });
});
