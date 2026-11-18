/**
 * Work-queue areas: GET /admin/work-queue, an item's page, the parked page and
 * the Area Owners page.
 *
 * Every task type belongs to one area or is shared by every administrator.
 * Each item's page, and each parked item, names its area and that area's
 * owner, or that it is shared, and marks the areas the viewing administrator
 * owns. An owner who no longer holds the admin role reads as no owner. Plain
 * links narrow the list to the viewer's own areas, to one area, or to the
 * shared items, keeping the kind in view; an unrecognised area shows every
 * area. Ownership orients and never restricts: every item keeps its actions.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertWorkQueueItem, insertWorkQueueTopicOwner, createTestSessionJwt,
} from '../fixtures/factories';
import { WORK_QUEUE_TOPICS } from '../../src/services/workQueueTaskTypes';

const { dbPath } = setTestEnv('4318');

const VIEWER = 'wqa_viewer';
const COLLEAGUE = 'wqa_colleague';
const FORMER = 'wqa_former';
const MEMBER = 'wqa_member';
const VIEWER_NAME = 'Area Viewer';
const COLLEAGUE_NAME = 'Area Colleague';
const FORMER_NAME = 'Former Owner';

type ItemKey = 'finA' | 'finB' | 'mem' | 'plat' | 'flag' | 'report' | 'shared' | 'parked';
const ID = {} as Record<ItemKey, string>;

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string, role: 'admin' | 'member' = 'admin'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

async function page(path: string, viewer = VIEWER): Promise<string> {
  const res = await request(createApp()).get(path).set('Cookie', cookieFor(viewer));
  expect(res.status, path).toBe(200);
  // Handlebars escapes `=` and `&` inside an attribute, which the browser decodes.
  return res.text.replace(/&#x3D;/g, '=').replace(/&amp;/g, '&');
}

/** The items the list shows, found by the Open link each row carries. */
function listedItems(html: string): ItemKey[] {
  const rows = html.split('<div class="admin-queue-row">').slice(1);
  return (Object.keys(ID) as ItemKey[])
    .filter((k) => rows.some((r) => r.includes(`href="/admin/work-queue/${ID[k]}`)))
    .sort();
}

/** The Area fact on an item's page. */
async function areaFact(key: ItemKey): Promise<string> {
  const html = await page(`/admin/work-queue/${ID[key]}`);
  const m = /<dt>Area<\/dt>\s*<dd>([^<]*)<\/dd>/.exec(html);
  expect(m, `${key} names its area`).not.toBeNull();
  return m![1]!;
}

function areaChips(html: string): Array<{ href: string; current: boolean }> {
  const nav = /<nav[^>]*aria-label="Narrow by area or claim"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  expect(nav, 'the area filter links are on the page').not.toBeNull();
  return [...nav![1]!.matchAll(/<a class="tag-chip" href="([^"]*)"( aria-current="page")?>/g)]
    .map((m) => ({ href: m[1]!, current: m[2] !== undefined }));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: VIEWER, slug: 'wqa_viewer', display_name: VIEWER_NAME, login_email: 'wqa-viewer@example.com', is_admin: 1 });
  insertMember(db, { id: COLLEAGUE, slug: 'wqa_colleague', display_name: COLLEAGUE_NAME, login_email: 'wqa-colleague@example.com', is_admin: 1 });
  // Recorded as an area owner while an administrator, and since lost the role.
  insertMember(db, { id: FORMER, slug: 'wqa_former', display_name: FORMER_NAME, login_email: 'wqa-former@example.com', is_admin: 0 });
  insertMember(db, { id: MEMBER, slug: 'wqa_member', display_name: 'Area Member', login_email: 'wqa-member@example.com' });

  insertWorkQueueTopicOwner(db, { topic: 'finance', owner_member_id: VIEWER });
  insertWorkQueueTopicOwner(db, { topic: 'membership', owner_member_id: COLLEAGUE });
  insertWorkQueueTopicOwner(db, { topic: 'platform', owner_member_id: FORMER });

  // Housekeeping: finance's two, platform's one, the flagged media and the shared item.
  ID.finA = insertWorkQueueItem(db, { task_type: 'reconciliation_discrepancy', entity_type: 'reconciliation_issue', entity_id: 'ri-1' });
  ID.finB = insertWorkQueueItem(db, { task_type: 'payout_failed', entity_type: 'stripe_payout', entity_id: 'po-1' });
  ID.plat = insertWorkQueueItem(db, { task_type: 'media_takedown_storage_removal', entity_type: 'media_item', entity_id: 'mi-1' });
  // Moderation: a flagged media item, and a contact-form report of content that
  // breaks the community standards. Neither has an owner set.
  ID.flag = insertWorkQueueItem(db, { task_type: 'media_flag_review', entity_type: 'media_item', entity_id: 'mi-2' });
  ID.shared = insertWorkQueueItem(db, { task_type: 'needs_organizer', entity_type: 'event', entity_id: 'ev-1' });
  // Someone Is Waiting: a contact request and a content report.
  ID.mem = insertWorkQueueItem(db, { task_type: 'member_contact_request', entity_type: 'member', entity_id: MEMBER, created_by: MEMBER });
  ID.report = insertWorkQueueItem(db, { task_type: 'content_report', entity_type: 'member', entity_id: MEMBER, created_by: MEMBER });
  ID.parked = insertWorkQueueItem(db, {
    task_type: 'partial_refund_review', entity_type: 'payment', entity_id: 'pay-1',
    parked_at: '2026-01-01T00:00:00.000Z', parked_by_member_id: COLLEAGUE, park_reason: 'Waiting on the bank.',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('each item names its area and owner', () => {
  // Defect caught: an administrator cannot tell whose area an item is in, or
  // which items are theirs to keep moving, so owned work waits unnoticed and a
  // departed administrator is still shown as the one responsible.
  it('shows the owner and marks the viewer’s own area, reads a former administrator as no owner, and names shared items as no area', async () => {
    const own = await areaFact('finA');
    expect(own).toContain(WORK_QUEUE_TOPICS.finance.label);
    expect(own).toContain(VIEWER_NAME);
    expect(own).toContain('(your area)');

    const theirs = await areaFact('mem');
    expect(theirs).toContain(WORK_QUEUE_TOPICS.membership.label);
    expect(theirs).toContain(COLLEAGUE_NAME);
    expect(theirs).not.toContain('(your area)');

    const lapsed = await areaFact('plat');
    expect(lapsed).toContain(WORK_QUEUE_TOPICS.platform.label);
    expect(lapsed).not.toContain(FORMER_NAME);

    // Defect caught: a moderation item filed as shared or under membership, so
    // the moderation owner never sees it as theirs.
    for (const key of ['flag', 'report'] as const) {
      const line = await areaFact(key);
      expect(line, key).toContain(WORK_QUEUE_TOPICS.moderation.label);
      expect(line, key).not.toContain(WORK_QUEUE_TOPICS.membership.label);
    }

    const shared = await areaFact('shared');
    for (const topic of Object.values(WORK_QUEUE_TOPICS)) {
      expect(shared, `shared item is not filed under ${topic.label}`).not.toContain(topic.label);
    }
    for (const name of [VIEWER_NAME, COLLEAGUE_NAME, FORMER_NAME]) {
      expect(shared).not.toContain(name);
    }
  });

  // Defect caught: setting an item aside hides whose it is.
  it('keeps the area line on a parked item', async () => {
    const html = await page('/admin/work-queue/parked');
    const card = html.split('<div class="card work-queue-item">').slice(1).find((c) => c.includes(ID.parked));
    expect(card, 'the parked item is listed').toBeDefined();
    expect(card).toContain(VIEWER_NAME);
    expect(card).toContain('<span class="badge">Your Area</span>');
  });

  // Defect caught: the owners form offers someone who is not an administrator,
  // or shows a departed administrator as still owning an area.
  it('offers current administrators only on the Area Owners page, with each area’s owner chosen', async () => {
    const html = await page('/admin/work-queue-areas');
    const select = (field: string) => {
      const m = new RegExp(`<select id="${field}" name="${field}">([\\s\\S]*?)</select>`).exec(html);
      expect(m, `${field} select`).not.toBeNull();
      return [...m![1]!.matchAll(/<option value="([^"]*)"( selected)?>/g)].map((o) => ({ value: o[1], selected: o[2] !== undefined }));
    };
    expect(select('owner_finance').filter((o) => o.selected).map((o) => o.value)).toEqual([VIEWER]);
    expect(select('owner_platform').filter((o) => o.selected).map((o) => o.value)).toEqual(['']);
    expect(select('owner_platform').map((o) => o.value).sort()).toEqual(['', COLLEAGUE, VIEWER].sort());
    expect(html).toContain('action="/admin/work-queue-areas"');
  });
});

describe('narrowing the list by area', () => {
  // Defect caught: the filter offers an area nothing can land in, drops one an
  // item can, or loses track of which view the reader is in.
  it('offers All, the viewer’s own areas, each area with task types, the shared items and unclaimed, with All current by default', async () => {
    // With no Team Alert open, the list opens on Someone Is Waiting.
    const chips = areaChips(await page('/admin/work-queue'));
    expect(chips.map((c) => c.href)).toEqual([
      '/admin/work-queue?kind=waiting',
      '/admin/work-queue?kind=waiting&topic=mine',
      '/admin/work-queue?kind=waiting&topic=finance',
      '/admin/work-queue?kind=waiting&topic=membership',
      '/admin/work-queue?kind=waiting&topic=platform',
      '/admin/work-queue?kind=waiting&topic=sanctioning',
      '/admin/work-queue?kind=waiting&topic=moderation',
      '/admin/work-queue?kind=waiting&topic=shared',
      '/admin/work-queue?kind=waiting&unclaimed=1',
    ]);
    expect(chips.filter((c) => c.current).map((c) => c.href)).toEqual(['/admin/work-queue?kind=waiting']);
  });

  // Defect caught: "my areas" shows another administrator's items, or the same
  // list whoever is looking.
  it('shows each administrator only the areas they own under their own view', async () => {
    const mine = await page('/admin/work-queue?kind=housekeeping&topic=mine');
    expect(listedItems(mine)).toEqual(['finA', 'finB']);
    expect(areaChips(mine).filter((c) => c.current).map((c) => c.href))
      .toEqual(['/admin/work-queue?kind=housekeeping&topic=mine']);

    expect(listedItems(await page('/admin/work-queue?kind=waiting&topic=mine', COLLEAGUE))).toEqual(['mem']);
  });

  // Defect caught: one area's view leaks another area's or a shared item, or
  // the shared view shows an item that belongs to an area.
  it('shows one area alone, and the shared items alone, within the kind', async () => {
    expect(listedItems(await page('/admin/work-queue?kind=housekeeping&topic=finance'))).toEqual(['finA', 'finB']);
    // A former administrator's area still has its items; only the owner lapsed.
    expect(listedItems(await page('/admin/work-queue?kind=housekeeping&topic=platform'))).toEqual(['plat']);
    expect(listedItems(await page('/admin/work-queue?kind=housekeeping&topic=moderation'))).toEqual(['flag']);
    expect(listedItems(await page('/admin/work-queue?kind=waiting&topic=moderation'))).toEqual(['report']);
    expect(listedItems(await page('/admin/work-queue?kind=waiting&topic=membership'))).toEqual(['mem']);
    expect(listedItems(await page('/admin/work-queue?kind=housekeeping&topic=shared'))).toEqual(['shared']);
    expect(listedItems(await page('/admin/work-queue?kind=housekeeping&topic=membership'))).toEqual([]);
  });

  // Defect caught: a stale or mistyped link, or an area no task type uses yet,
  // shows an empty list that reads as no work.
  it('shows every area for an area value it does not offer', async () => {
    for (const query of ['?kind=housekeeping&topic=freestyle', '?kind=housekeeping&topic=not_an_area']) {
      const html = await page(`/admin/work-queue${query}`);
      expect(listedItems(html), query).toEqual(['finA', 'finB', 'flag', 'plat', 'shared']);
      expect(areaChips(html).filter((c) => c.current).map((c) => c.href), query)
        .toEqual(['/admin/work-queue?kind=housekeeping']);
    }
  });

  // Defect caught: switching area drops the kind the reader was in.
  it('keeps the kind on the area links', async () => {
    const html = await page('/admin/work-queue?kind=housekeeping&topic=finance');
    expect(areaChips(html).map((c) => c.href)).toContain('/admin/work-queue?kind=housekeeping&topic=membership');
  });

  // Defect caught: an action taken in a narrowed view returns the reader to the
  // whole queue, so the filter is lost after every item.
  it('carries the area and kind on every form and item link in a narrowed view', async () => {
    const html = await page('/admin/work-queue?kind=housekeeping&topic=finance');
    const forms = [...html.matchAll(/<form method="POST" action="\/admin\/work-queue[\s\S]*?<\/form>/g)].map((m) => m[0]);
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      expect(form, 'every list form carries the area').toContain('<input type="hidden" name="topic" value="finance" />');
      expect(form, 'every list form carries the kind').toContain('<input type="hidden" name="kind" value="housekeeping" />');
    }
    expect(html).toContain(`href="/admin/work-queue/${ID.finA}?kind=housekeeping&topic=finance"`);

    // And the item's page carries them on its own forms.
    const item = await page(`/admin/work-queue/${ID.finA}?kind=housekeeping&topic=finance`);
    const itemForms = [...item.matchAll(/<form method="POST" action="\/admin\/work-queue[\s\S]*?<\/form>/g)].map((m) => m[0]);
    expect(itemForms.length).toBeGreaterThan(0);
    for (const form of itemForms) {
      expect(form, 'every item form carries the area').toContain('<input type="hidden" name="topic" value="finance" />');
    }
  });
});
