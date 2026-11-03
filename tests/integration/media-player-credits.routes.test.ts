/**
 * Player credits on media: the `#player_<slug>` hashtag that names the person
 * performing in an item.
 *
 * - The item viewer turns each player tag that names a member (by slug) or
 *   exactly one canonical historical person (by folded name) into a credit,
 *   linked to that person for a member viewer and to a public counterpart for
 *   a signed-out visitor. An unmatched or ambiguous tag credits nobody.
 * - The member upload and edit forms offer the member's own player tag as a
 *   suggestion chip.
 * - The member and curator edit pages run the one member search on their own
 *   address, and each result's credit button submits the edit form with that
 *   person's player tag.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4686');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import {
  insertMember,
  insertMemberTierGrant,
  insertHistoricalPerson,
  createTestSessionJwt,
  insertMediaItem,
  insertTag,
  attachMediaTag,
} from '../fixtures/factories';

const OWNER_ID = 'member-pc-owner-001';
const OWNER_SLUG = 'pc_owner';
const PLAYER_ID = 'member-pc-player-001';
const PLAYER_SLUG = 'pc_player';
const PLAYER_NAME = 'Pcplayer Member';
const HIDDEN_ID = 'member-pc-hidden-001';
const HIDDEN_NAME = 'Pcplayer Hidden';
const CLAIMER_ID = 'member-pc-claimer-001';
const CLAIMER_SLUG = 'pc_claimer';
const ADMIN_ID = 'member-pc-admin-001';
const SYSTEM_ID = 'member-pc-system-001';

const HP_ACCENTED = 'hp-pc-accented';
const HP_ACCENTED_NAME = 'Zoë Pcquist';
const HP_ACCENTED_TAG = '#player_zoe_pcquist';
const HP_CLAIMED = 'hp-pc-claimed';
const HP_CLAIMED_NAME = 'Ola Pcclaimed';
const HP_CLAIMED_TAG = '#player_ola_pcclaimed';
const DUP_NAME = 'Dup Pcname';
const DUP_TAG = '#player_dup_pcname';
const UNMATCHED_TAG = '#player_nobody_pchere';

let creditedItemId = '';
let curatedItemId = '';

function cookieFor(memberId: string, role: 'member' | 'admin' = 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

// Handlebars escapes `=` in an attribute, so an href carrying a query string
// renders with the entity.
function asRenderedHref(href: string): string {
  return href.replace(/=/g, '&#x3D;');
}

function creditParagraphs(html: string): string[] {
  return [...html.matchAll(/<p class="gallery-item-uploader">([\s\S]*?)<\/p>/g)].map((m) => m[1]);
}

function tagsOf(mediaId: string): string[] {
  const db = new BetterSqlite3(dbPath);
  try {
    return (db.prepare(
      `SELECT t.tag_normalized FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ?`,
    ).all(mediaId) as { tag_normalized: string }[]).map((r) => r.tag_normalized).sort();
  } finally { db.close(); }
}

function attachTags(db: BetterSqlite3.Database, mediaId: string, tags: string[]): void {
  for (const t of tags) {
    const existing = db.prepare(`SELECT id FROM tags WHERE tag_normalized = ?`).get(t) as { id: string } | undefined;
    attachMediaTag(db, mediaId, existing?.id ?? insertTag(db, { tag_normalized: t, tag_display: t }));
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.pragma('foreign_keys = ON');
  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG, display_name: 'Pc Owner' });
  insertMemberTierGrant(db, { member_id: OWNER_ID, new_tier_status: 'tier1' });
  insertMember(db, { id: PLAYER_ID, slug: PLAYER_SLUG, display_name: PLAYER_NAME });
  insertMember(db, { id: HIDDEN_ID, slug: 'pc_hidden', display_name: HIDDEN_NAME, searchable: 0 });
  insertMember(db, { id: ADMIN_ID, slug: 'pc_admin', display_name: 'Pc Admin', is_admin: 1 });
  insertMember(db, { id: SYSTEM_ID, slug: 'footbag_hacky_pc', display_name: 'Footbag Hacky', is_system: 1 });

  insertHistoricalPerson(db, { person_id: HP_ACCENTED, person_name: HP_ACCENTED_NAME, source_scope: 'CANONICAL' });
  insertHistoricalPerson(db, { person_id: HP_CLAIMED, person_name: HP_CLAIMED_NAME, source_scope: 'CANONICAL' });
  insertMember(db, { id: CLAIMER_ID, slug: CLAIMER_SLUG, display_name: 'Pc Claimer', historical_person_id: HP_CLAIMED });
  insertHistoricalPerson(db, { person_id: 'hp-pc-dup-a', person_name: DUP_NAME, source_scope: 'CANONICAL' });
  insertHistoricalPerson(db, { person_id: 'hp-pc-dup-b', person_name: DUP_NAME, source_scope: 'CANONICAL' });

  creditedItemId = insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'pc-credited.jpg', caption: 'credited' });
  attachTags(db, creditedItemId, [
    `#by_${OWNER_SLUG}`,
    `#player_${PLAYER_SLUG}`,
    HP_ACCENTED_TAG,
    HP_CLAIMED_TAG,
    DUP_TAG,
    UNMATCHED_TAG,
  ]);

  curatedItemId = insertMediaItem(db, { uploader_member_id: SYSTEM_ID, source_filename: 'pc-curated.jpg', caption: 'curated' });
  attachTags(db, curatedItemId, ['#curated', '#freestyle']);
  db.close();

  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
});

describe('item viewer player credits', () => {
  it('credits a member and a single historical record, links them to public pages for a visitor, and credits nobody for an unmatched or shared tag', async () => {
    const res = await request(createApp()).get(`/media/item/${creditedItemId}`);
    expect(res.status).toBe(200);
    const credits = creditParagraphs(res.text).join('\n');

    // A visitor cannot open a member profile, so the member credit goes to that
    // member's player gallery; a historical record goes to its public history page.
    expect(credits).toContain(`href="${asRenderedHref(`/media/browse?tag=player_${PLAYER_SLUG}`)}"`);
    expect(credits).toContain(PLAYER_NAME);
    expect(credits).toContain(`href="/history/${HP_ACCENTED}"`);
    expect(credits).toContain(HP_ACCENTED_NAME);
    expect(credits).toContain(`href="/history/${HP_CLAIMED}"`);
    expect(credits).not.toContain('/members/');

    // Two records spell the same tag, and one tag names nobody: neither is a credit,
    // though both stay on the item as hashtags.
    expect(credits).not.toContain(DUP_NAME);
    expect(credits).not.toContain('nobody');
    expect(res.text).toContain(DUP_TAG);
    expect(res.text).toContain(UNMATCHED_TAG);
  });

  it('links a member viewer to the member profile, and a claimed record to its member', async () => {
    const res = await request(createApp())
      .get(`/media/item/${creditedItemId}`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    const credits = creditParagraphs(res.text).join('\n');
    expect(credits).toContain(`href="/members/${PLAYER_SLUG}"`);
    expect(credits).toContain(`href="/members/${CLAIMER_SLUG}"`);
    expect(credits).toContain(`href="/history/${HP_ACCENTED}"`);
  });

  it('shows no player credit on an item that carries no player tag', async () => {
    const res = await request(createApp()).get(`/media/item/${curatedItemId}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('/history/');
    expect(creditParagraphs(res.text).join('\n')).not.toContain('player_');
  });
});

describe('own player tag suggestion', () => {
  it('offers the member their own player tag as a chip on upload and on edit', async () => {
    const ownChip = `data-tag="#player_${OWNER_SLUG}"`;
    const upload = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(upload.status).toBe(200);
    expect(upload.text).toContain(ownChip);

    const edit = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/${creditedItemId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(edit.status).toBe(200);
    expect(edit.text).toContain(ownChip);
  });
});

describe('member edit page player search', () => {
  const editPath = () => `/members/${OWNER_SLUG}/media/${creditedItemId}/edit`;
  const creditButton = (formId: string, tag: string) =>
    `form="${formId}" name="addPlayer" value="${tag}"`;

  it('finds a historical record by name and offers to credit its folded player tag through the edit form', async () => {
    const res = await request(createApp())
      .get(`${editPath()}?q=Pcquist`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('<form id="member-media-edit-form"');
    expect(res.text).toContain(creditButton('member-media-edit-form', HP_ACCENTED_TAG));
  });

  it('offers a searchable member by their slug, and never a member who opted out of search', async () => {
    const res = await request(createApp())
      .get(`${editPath()}?q=Pcplayer`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain(creditButton('member-media-edit-form', `#player_${PLAYER_SLUG}`));
    expect(res.text).not.toContain(HIDDEN_NAME);
    expect(res.text).not.toContain('#player_pc_hidden');
  });

  // The search runs as a reload of the edit page, so without JavaScript the
  // caption and hashtags typed but not yet saved ride along in the query and
  // come back filled in, rather than being thrown away by the search.
  it('keeps the unsaved caption and hashtags typed before a search', async () => {
    const page = await request(createApp()).get(editPath()).set('Cookie', cookieFor(OWNER_ID));
    const button = /<button[^>]*formmethod="get"[^>]*>/.exec(page.text)?.[0] ?? '';
    expect(button).toContain('form="member-media-edit-form"');
    const res = await request(createApp())
      .get(editPath())
      .query({ q: 'Pcquist', caption: 'Unsaved caption words', tags: '#unsaved_typed_tag' })
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Unsaved caption words');
    expect(res.text).toContain('#unsaved_typed_tag');
    expect(res.text).toContain(creditButton('member-media-edit-form', HP_ACCENTED_TAG));
  });

  it('runs no search and offers no credit button without a query', async () => {
    const res = await request(createApp()).get(editPath()).set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('name="addPlayer"');
  });

  function insertOwnerItem(filename: string): string {
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    const mediaId = insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: filename, caption: null });
    attachTags(db, mediaId, [`#by_${OWNER_SLUG}`]);
    db.close();
    return mediaId;
  }

  it('saving with a picked player adds that tag and keeps the typed tags and the uploader tag', async () => {
    const mediaId = insertOwnerItem('pc-pick.jpg');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({ caption: '', tags: '#freestyle', externalUrl: '', addPlayer: HP_ACCENTED_TAG });
    expect(res.status).toBe(303);
    expect(tagsOf(mediaId)).toEqual(['#by_pc_owner', '#freestyle', HP_ACCENTED_TAG].sort());
  });

  it('a pick the typed tags already carry, in another case, does not land twice', async () => {
    const mediaId = insertOwnerItem('pc-pick-dup.jpg');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({ caption: '', tags: '#Player_Zoe_Pcquist', externalUrl: '', addPlayer: HP_ACCENTED_TAG });
    expect(res.status).toBe(303);
    expect(tagsOf(mediaId)).toEqual(['#by_pc_owner', HP_ACCENTED_TAG].sort());
  });
});

describe('curator edit page player search', () => {
  it('offers the same search, and a picked player is saved onto the curated item', async () => {
    const page = await request(createApp())
      .get(`/admin/curator/media/${curatedItemId}/edit?q=Pcquist`)
      .set('Cookie', cookieFor(ADMIN_ID, 'admin'));
    expect(page.status).toBe(200);
    expect(page.text).toContain('<form id="curator-media-edit-form"');
    expect(page.text).toContain(`form="curator-media-edit-form" name="addPlayer" value="${HP_ACCENTED_TAG}"`);

    const save = await request(createApp())
      .post(`/admin/curator/media/${curatedItemId}/edit`)
      .set('Cookie', cookieFor(ADMIN_ID, 'admin'))
      .type('form')
      .send({ caption: 'curated', tags: '#freestyle', addPlayer: HP_ACCENTED_TAG });
    expect(save.status).toBe(303);
    expect(tagsOf(curatedItemId)).toContain(HP_ACCENTED_TAG);
    expect(tagsOf(curatedItemId)).toContain('#curated');
  });
});
