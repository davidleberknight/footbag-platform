/**
 * Work-queue areas on the administrator queue page: GET /admin/work-queue.
 *
 * Every task type belongs to one area or is shared by every administrator.
 * Each card, working or parked, names its area and that area's owner, or that
 * it is shared, and marks the areas the viewing administrator owns. An owner
 * who no longer holds the admin role reads as no owner. Plain links narrow the
 * queue to the viewer's own areas, to one area, or to the shared items, and
 * combine with the category filter; an unrecognised area shows everything.
 * Ownership orients and never restricts: every card keeps its actions.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
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

// Each item carries its own reason text, so its card is found by its data.
const ITEMS = {
  finA:   'area-marker-finance-a',
  finB:   'area-marker-finance-b',
  mem:    'area-marker-membership',
  plat:   'area-marker-platform',
  flag:   'area-marker-moderation-flag',
  report: 'area-marker-moderation-report',
  shared: 'area-marker-shared',
  parked: 'area-marker-parked-finance',
} as const;
type ItemKey = keyof typeof ITEMS;
const WORKING: ItemKey[] = ['finA', 'finB', 'mem', 'plat', 'flag', 'report', 'shared'];

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string, role: 'admin' | 'member' = 'admin'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

async function queuePage(query: string, viewer = VIEWER): Promise<string> {
  const res = await request(createApp()).get(`/admin/work-queue${query}`).set('Cookie', cookieFor(viewer));
  expect(res.status).toBe(200);
  // Handlebars escapes `=` inside an attribute, which the browser decodes.
  return res.text.replace(/&#x3D;/g, '=');
}

function cards(html: string): string[] {
  return html.split('<div class="card work-queue-item">').slice(1);
}

function cardFor(html: string, key: ItemKey): string {
  const found = cards(html).filter((c) => c.includes(ITEMS[key]));
  expect(found, `exactly one card for ${key}`).toHaveLength(1);
  return found[0]!;
}

/** The items in the working queue, leaving out the parked listing. */
function workingItems(html: string): ItemKey[] {
  const working = cards(html).filter((c) => !c.includes('/unpark"'));
  return (Object.keys(ITEMS) as ItemKey[]).filter((k) => working.some((c) => c.includes(ITEMS[k])));
}

/** The card's area line: the first meta line under its title. */
function areaLine(card: string): { text: string; viewerBadge: boolean } {
  const m = /<p class="card-meta">([^<]*)(<span class="badge">[^<]*<\/span>)?<\/p>/.exec(card);
  expect(m, 'the card carries an area line').not.toBeNull();
  return { text: m![1]!, viewerBadge: m![2] !== undefined };
}

function areaChips(html: string): Array<{ href: string; current: boolean }> {
  const nav = /<nav[^>]*aria-label="Show items by area"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  expect(nav, 'the area filter links are on the page').not.toBeNull();
  return [...nav![1]!.matchAll(/<a class="tag-chip" href="([^"]*)"( aria-current="page")?>/g)]
    .map((m) => ({ href: m[1]!.replace(/&amp;/g, '&'), current: m[2] !== undefined }));
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

  insertWorkQueueItem(db, { queue_category: 'payments', task_type: 'reconciliation_discrepancy', entity_type: 'reconciliation_issue', entity_id: 'ri-1', reason_text: ITEMS.finA });
  insertWorkQueueItem(db, { queue_category: 'payments', task_type: 'payout_failed', entity_type: 'stripe_payout', entity_id: 'po-1', reason_text: ITEMS.finB });
  insertWorkQueueItem(db, { queue_category: 'membership', task_type: 'member_contact_request', entity_type: 'member', entity_id: MEMBER, created_by: MEMBER, reason_text: ITEMS.mem });
  insertWorkQueueItem(db, { queue_category: 'media', task_type: 'media_takedown_storage_removal', entity_type: 'media_item', entity_id: 'mi-1', reason_text: ITEMS.plat });
  // Moderation: a flagged media item, and a contact-form report of content that
  // breaks the community standards. Neither has an owner set.
  insertWorkQueueItem(db, { queue_category: 'media', task_type: 'media_flag_review', entity_type: 'media_item', entity_id: 'mi-2', reason_text: ITEMS.flag });
  insertWorkQueueItem(db, { queue_category: 'membership', task_type: 'content_report', entity_type: 'member', entity_id: MEMBER, created_by: MEMBER, reason_text: ITEMS.report });
  insertWorkQueueItem(db, { queue_category: 'events', task_type: 'needs_organizer', entity_type: 'event', entity_id: 'ev-1', reason_text: ITEMS.shared });
  insertWorkQueueItem(db, {
    queue_category: 'payments', task_type: 'partial_refund_review', entity_type: 'payment', entity_id: 'pay-1',
    reason_text: ITEMS.parked, parked_at: '2026-01-01T00:00:00.000Z', parked_by_member_id: COLLEAGUE, park_reason: 'Waiting on the bank.',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('each card names its area and owner', () => {
  // Defect caught: an administrator cannot tell whose area an item is in, or
  // which items are theirs to keep moving, so owned work waits unnoticed and a
  // departed administrator is still shown as the one responsible.
  it('shows the owner and marks the viewer’s own area, reads a former administrator as no owner, and names shared items as no area', async () => {
    const html = await queuePage('');

    const own = areaLine(cardFor(html, 'finA'));
    expect(own.text).toContain(WORK_QUEUE_TOPICS.finance.label);
    expect(own.text).toContain(VIEWER_NAME);
    expect(own.viewerBadge).toBe(true);

    const theirs = areaLine(cardFor(html, 'mem'));
    expect(theirs.text).toContain(WORK_QUEUE_TOPICS.membership.label);
    expect(theirs.text).toContain(COLLEAGUE_NAME);
    expect(theirs.viewerBadge).toBe(false);

    const lapsed = areaLine(cardFor(html, 'plat'));
    expect(lapsed.text).toContain(WORK_QUEUE_TOPICS.platform.label);
    expect(lapsed.text).not.toContain(FORMER_NAME);
    expect(lapsed.viewerBadge).toBe(false);

    // Defect caught: a moderation item filed as shared or under membership, so
    // the moderation owner never sees it as theirs.
    for (const key of ['flag', 'report'] as const) {
      const line = areaLine(cardFor(html, key));
      expect(line.text, key).toContain(WORK_QUEUE_TOPICS.moderation.label);
      expect(line.text, key).not.toContain(WORK_QUEUE_TOPICS.membership.label);
      expect(line.viewerBadge, key).toBe(false);
    }

    const shared = areaLine(cardFor(html, 'shared'));
    for (const topic of Object.values(WORK_QUEUE_TOPICS)) {
      expect(shared.text, `shared item is not filed under ${topic.label}`).not.toContain(topic.label);
    }
    for (const name of [VIEWER_NAME, COLLEAGUE_NAME, FORMER_NAME]) {
      expect(shared.text).not.toContain(name);
    }
    expect(shared.viewerBadge).toBe(false);

    // A parked item keeps its area line, so setting it aside does not hide
    // whose it is.
    const parked = areaLine(cardFor(html, 'parked'));
    expect(parked.text).toContain(VIEWER_NAME);
    expect(parked.viewerBadge).toBe(true);

    // The owners form offers current administrators only, shows each area's
    // current owner chosen, and shows a former administrator's area as unowned.
    const select = (field: string) => {
      const m = new RegExp(`<select id="${field}" name="${field}">([\\s\\S]*?)</select>`).exec(html);
      expect(m, `${field} select`).not.toBeNull();
      return [...m![1]!.matchAll(/<option value="([^"]*)"( selected)?>/g)].map((o) => ({ value: o[1], selected: o[2] !== undefined }));
    };
    expect(select('owner_finance').filter((o) => o.selected).map((o) => o.value)).toEqual([VIEWER]);
    expect(select('owner_platform').filter((o) => o.selected).map((o) => o.value)).toEqual(['']);
    expect(select('owner_platform').map((o) => o.value).sort()).toEqual(['', COLLEAGUE, VIEWER].sort());
    expect(html).toContain('action="/admin/work-queue/owners"');
  });
});

describe('narrowing the queue by area', () => {
  // Defect caught: the filter offers an area nothing can land in, drops one an
  // item can, or loses track of which view the reader is in.
  it('offers All, the viewer’s own areas, each area with task types, and the shared items, with All current by default', async () => {
    const chips = areaChips(await queuePage(''));
    expect(chips.map((c) => c.href)).toEqual([
      '/admin/work-queue',
      '/admin/work-queue?topic=mine',
      '/admin/work-queue?topic=finance',
      '/admin/work-queue?topic=membership',
      '/admin/work-queue?topic=platform',
      '/admin/work-queue?topic=moderation',
      '/admin/work-queue?topic=shared',
    ]);
    expect(chips.filter((c) => c.current).map((c) => c.href)).toEqual(['/admin/work-queue']);
  });

  // Defect caught: "my areas" shows another administrator's items, or the same
  // list whoever is looking.
  it('shows each administrator only the areas they own under their own view', async () => {
    const mine = await queuePage('?topic=mine');
    expect(workingItems(mine)).toEqual(['finA', 'finB']);
    expect(areaChips(mine).filter((c) => c.current).map((c) => c.href)).toEqual(['/admin/work-queue?topic=mine']);

    expect(workingItems(await queuePage('?topic=mine', COLLEAGUE))).toEqual(['mem']);
  });

  // Defect caught: one area's view leaks another area's or a shared item, or
  // the shared view shows an item that belongs to an area.
  it('shows one area alone, and the shared items alone', async () => {
    expect(workingItems(await queuePage('?topic=finance'))).toEqual(['finA', 'finB']);
    // A former administrator's area still has its items; only the owner lapsed.
    expect(workingItems(await queuePage('?topic=platform'))).toEqual(['plat']);
    expect(workingItems(await queuePage('?topic=moderation'))).toEqual(['flag', 'report']);
    expect(workingItems(await queuePage('?topic=membership'))).toEqual(['mem']);
    expect(workingItems(await queuePage('?topic=shared'))).toEqual(['shared']);
  });

  // Defect caught: a stale or mistyped link, or an area no task type uses yet,
  // shows an empty queue that reads as no work.
  it('shows the whole queue for an area value it does not offer', async () => {
    for (const query of ['?topic=sanctioning', '?topic=not_an_area']) {
      const html = await queuePage(query);
      expect(workingItems(html), query).toEqual(WORKING);
      expect(areaChips(html).filter((c) => c.current).map((c) => c.href), query).toEqual(['/admin/work-queue']);
    }
  });

  // Defect caught: the two filters override each other instead of narrowing
  // together, or switching area drops the category the reader was in.
  it('combines an area with a category, and keeps the category on the area links', async () => {
    const both = await queuePage('?topic=finance&category=payments');
    expect(workingItems(both)).toEqual(['finA', 'finB']);
    expect(areaChips(both).map((c) => c.href)).toContain('/admin/work-queue?topic=membership&category=payments');

    expect(workingItems(await queuePage('?topic=membership&category=payments'))).toEqual([]);
    expect(workingItems(await queuePage('?topic=moderation&category=media'))).toEqual(['flag']);
    expect(workingItems(await queuePage('?topic=shared&category=events'))).toEqual(['shared']);
  });

  // Defect caught: an action taken in a narrowed view returns the reader to the
  // whole queue, so the filter is lost after every item.
  it('carries the area on every form in a narrowed view', async () => {
    const html = await queuePage('?topic=finance&category=payments');
    const forms = [...html.matchAll(/<form method="POST" action="\/admin\/work-queue[\s\S]*?<\/form>/g)].map((m) => m[0]);
    expect(forms.length).toBeGreaterThan(1);
    for (const form of forms) {
      expect(form, 'every queue form carries the area').toContain('<input type="hidden" name="topic" value="finance" />');
    }
  });
});
