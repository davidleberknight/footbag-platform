/**
 * Correcting the imported facts on a historical competition record nobody has
 * claimed: the name, the country and the first and last competition years.
 *
 * Covers the form, the preview that writes nothing, the write with its reason
 * and before-and-after audit row, the refusals (no reason, impossible years, a
 * country that names no country, a record a member holds, a hashtag already in
 * use), a submission that changes nothing, a repeated submit, and the player
 * hashtag that moves with a corrected name so the media crediting the person
 * keep crediting them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertHistoricalPerson, createTestSessionJwt,
  insertFreeformTag, insertMediaItem, attachMediaTag,
} from '../fixtures/factories';
import { flashCookieOf } from '../fixtures/flashCookie';

const { dbPath } = setTestEnv('4736');

const ADMIN_ID = 'hc_admin';
const OTHER_ADMIN_ID = 'hc_admin_2';
const HOLDER_ID = 'hc_holder';
const CORRECTED = 'legacy.historical_person_corrected';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'admin' })}`;
}

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

function seedPerson(o: Parameters<typeof insertHistoricalPerson>[1]): string {
  return db((conn) => insertHistoricalPerson(conn, o));
}

interface PersonRow {
  person_name: string; country: string | null; first_year: number | null; last_year: number | null;
  is_deceased: number;
}

function person(personId: string): PersonRow {
  return db((conn) => conn.prepare(
    `SELECT person_name, country, first_year, last_year, is_deceased
     FROM historical_persons WHERE person_id = ?`,
  ).get(personId)) as PersonRow;
}

function corrections(personId: string): { actor_member_id: string; reason_text: string; metadata_json: string }[] {
  return db((conn) => conn.prepare(
    `SELECT actor_member_id, reason_text, metadata_json FROM audit_entries
     WHERE action_type = ? AND entity_type = 'historical_person' AND entity_id = ?`,
  ).all(CORRECTED, personId)) as { actor_member_id: string; reason_text: string; metadata_json: string }[];
}

interface Facts { name: string; country: string; first_year: string; last_year: string; reason: string }

function post(path: string, body: Partial<Facts> & Record<string, string>, actor = ADMIN_ID) {
  return request(createApp()).post(path).set('Cookie', cookieFor(actor)).type('form').send(body);
}

async function landing(res: Awaited<ReturnType<typeof post>>, actor = ADMIN_ID): Promise<string> {
  const shown = await request(createApp())
    .get(res.headers.location as string)
    .set('Cookie', [cookieFor(actor), flashCookieOf(res)].filter(Boolean).join('; '));
  return shown.text;
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: ADMIN_ID, display_name: 'Hana Admin', real_name: 'Hana Admin',
    login_email: 'hc-admin@example.com', is_admin: 1,
  });
  insertMember(conn, {
    id: OTHER_ADMIN_ID, slug: OTHER_ADMIN_ID, display_name: 'Ivo Admin', real_name: 'Ivo Admin',
    login_email: 'hc-admin-2@example.com', is_admin: 1,
  });
  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('correcting a record nobody holds', () => {
  it('opens a form holding the record\'s current facts, posting to its preview', async () => {
    // Defect caught: the form opens blank or with another record's facts, so an
    // administrator correcting one field wipes the others.
    const id = seedPerson({ person_name: 'Form Person', country: 'Finland', first_year: 1995, last_year: 2001 });
    const res = await request(createApp())
      .get(`/admin/historical-records/${id}/correction`).set('Cookie', cookieFor(ADMIN_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('value="Form Person"');
    expect(res.text).toContain('<option value="Finland" selected>');
    expect(res.text).toContain('value="1995"');
    expect(res.text).toContain('value="2001"');
    expect(res.text).toContain(`action="/admin/historical-records/${id}/correction"`);
  });

  it('previews each changed value before and after and writes nothing', async () => {
    // Defect caught: the preview writes, or hides which values will change, so
    // the administrator confirms a correction they never saw.
    const id = seedPerson({ person_name: 'Preview Person', country: 'Finland', first_year: 1995 });
    const res = await post(`/admin/historical-records/${id}/correction`, {
      name: 'Preview Persson', country: 'Finland', first_year: '1994', last_year: '', reason: 'spelling',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Preview Person &rarr; Preview Persson');
    expect(res.text).toContain('1995 &rarr; 1994');
    expect(res.text).not.toContain('Finland &rarr;');
    expect(res.text).toContain(`action="/admin/historical-records/${id}/correction/confirm"`);
    expect(person(id).person_name).toBe('Preview Person');
    expect(corrections(id)).toHaveLength(0);
  });

  it('writes the correction with one audit row carrying the reason and only the changed values', async () => {
    // Defect caught: the correction lands without a trail, or the trail names
    // fields that never changed, so the record cannot be reviewed or reverted.
    const id = seedPerson({ person_name: 'Wrtie Person', country: 'Finland', first_year: 1995, last_year: 2001 });
    const res = await post(`/admin/historical-records/${id}/correction/confirm`, {
      name: 'Write Person', country: 'Sweden', first_year: '1995', last_year: '2003', reason: 'results sheet',
      // Overposting: fields the form never offers must not reach the record.
      is_deceased: '1', person_id: 'hijacked',
    });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/admin/historical-records?q=${id}`);
    expect(await landing(res)).toContain(
      '<div class="form-success-banner" role="status">The record for Write Person has been corrected, and the change is in the audit log.</div>',
    );

    expect(person(id)).toEqual({
      person_name: 'Write Person', country: 'Sweden', first_year: 1995, last_year: 2003, is_deceased: 0,
    });
    const rows = corrections(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_member_id).toBe(ADMIN_ID);
    expect(rows[0]!.reason_text).toBe('results sheet');
    expect(JSON.parse(rows[0]!.metadata_json)).toEqual({
      fields: ['person_name', 'country', 'last_year'],
      before: { person_name: 'Wrtie Person', country: 'Finland', last_year: 2001 },
      after:  { person_name: 'Write Person', country: 'Sweden', last_year: 2003 },
    });
  });

  it('shows the corrected name on the public history page straight away', async () => {
    // Defect caught: a correction that only lands in the admin view, so visitors
    // keep seeing the misspelled name.
    const id = seedPerson({ person_name: 'Pubilc Person' });
    await post(`/admin/historical-records/${id}/correction/confirm`, {
      name: 'Public Person', country: 'United States', first_year: '', last_year: '', reason: 'spelling',
    });
    const page = await request(createApp()).get(`/history/${id}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Public Person');
    expect(page.text).not.toContain('Pubilc Person');
  });

  it('accepts a name and a reason at their full length, one year competed, and stores the reason cleaned', async () => {
    // Defect caught: a cap one character short refuses a legitimate long name
    // or reason, a single-season competitor cannot be recorded, or the stored
    // reason keeps the stray whitespace the form sent.
    const id = seedPerson({ person_name: 'Long Person' });
    const longName = 'N'.repeat(200);
    const longReason = 'r'.repeat(500);
    const res = await post(`/admin/historical-records/${id}/correction/confirm`, {
      name: longName, country: 'United States', first_year: '1999', last_year: '1999', reason: `  ${longReason}  `,
    });
    expect(res.status).toBe(303);
    expect(person(id)).toMatchObject({ person_name: longName, first_year: 1999, last_year: 1999 });
    expect(corrections(id)[0]!.reason_text).toBe(longReason);
  });

  it('keeps the tag when a corrected name spells the same hashtag', async () => {
    // Defect caught: a change of capitals alone is refused as a hashtag clash
    // with the person's own tag.
    const id = seedPerson({ person_name: 'case person' });
    db((conn) => insertFreeformTag(conn, { tag_normalized: '#player_case_person' }));
    const res = await post(`/admin/historical-records/${id}/correction/confirm`, {
      name: 'Case Person', country: 'United States', first_year: '', last_year: '', reason: 'capitals',
    });
    expect(res.status).toBe(303);
    expect(person(id).person_name).toBe('Case Person');
  });

  it('clears a country or a year left blank', async () => {
    // Defect caught: a blank field silently keeps the wrong imported value, so
    // a fact that was never known cannot be removed.
    const id = seedPerson({ person_name: 'Blank Person', country: 'Finland', first_year: 1990 });
    await post(`/admin/historical-records/${id}/correction/confirm`, {
      name: 'Blank Person', country: '', first_year: '', last_year: '', reason: 'unknown origin',
    });
    expect(person(id)).toMatchObject({ country: null, first_year: null });
  });
});

describe('refusals', () => {
  it.each([
    ['no reason',                 { reason: '' },                               'Enter the reason for this correction.'],
    ['no name',                   { name: '  ' },                               'Enter the name.'],
    ['a name one past the cap',   { name: 'N'.repeat(201) },                    'The name must be 200 characters or fewer.'],
    ['a reason one past the cap', { reason: 'r'.repeat(501) },                  'The reason must be 500 characters or fewer.'],
    ['first year after the last', { first_year: '2005', last_year: '2001' },    'The first competition year cannot be later than the last.'],
    ['a year in the future',      { last_year: String(new Date().getFullYear() + 1) }, 'Year must be a whole number'],
    ['a country that is none',    { country: 'Atlantis' },                      'country'],
  ])('refuses %s, keeping what was typed and writing nothing', async (_label, override, message) => {
    // Defect caught: an invalid correction is stored, or the administrator is
    // sent back to an empty form with no word of what was wrong.
    const id = seedPerson({ person_name: 'Refused Person', country: 'Finland', first_year: 1995, last_year: 2001 });
    const body = {
      name: 'Refused Persson', country: 'Finland', first_year: '1995', last_year: '2001', reason: 'typo',
      ...override,
    };
    const res = await post(`/admin/historical-records/${id}/correction/confirm`, body);
    expect(res.status).toBe(422);
    expect(res.text).toContain(message);
    expect(res.text).toContain(`value="${body.name}"`);
    expect(person(id).person_name).toBe('Refused Person');
    expect(corrections(id)).toHaveLength(0);
  });

  it('refuses a record a member holds, on the form and on the write', async () => {
    // Defect caught: the record and the member who holds it carry two names
    // that can disagree, when the member record is the one home for theirs.
    const id = seedPerson({ person_name: 'Held Person' });
    db((conn) => insertMember(conn, {
      id: HOLDER_ID, slug: HOLDER_ID, display_name: 'Held Person', real_name: 'Held Person',
      login_email: 'hc-holder@example.com', historical_person_id: id,
    }));
    const form = await request(createApp())
      .get(`/admin/historical-records/${id}/correction`).set('Cookie', cookieFor(ADMIN_ID));
    expect(form.status).toBe(422);
    expect(form.text).toContain('corrected through their member record');

    const body = { name: 'Changed Name', country: 'United States', first_year: '', last_year: '', reason: 'x' };
    for (const path of [`/admin/historical-records/${id}/correction`, `/admin/historical-records/${id}/correction/confirm`]) {
      const res = await post(path, body);
      expect(res.status, path).toBe(422);
      expect(res.text, path).toContain('corrected through their member record');
    }
    expect(person(id).person_name).toBe('Held Person');
    expect(corrections(id)).toHaveLength(0);
  });

  it('still refuses a record whose holder deleted their account, which can be restored', async () => {
    // Defect caught: a soft-deleted holder stops counting, so the record is
    // corrected underneath an account that may come back holding it.
    const id = seedPerson({ person_name: 'Deleted Holder' });
    db((conn) => insertMember(conn, {
      id: 'hc_deleted_holder', slug: 'hc_deleted_holder', display_name: 'Deleted Holder', real_name: 'Deleted Holder',
      login_email: 'hc-deleted@example.com', historical_person_id: id, deleted_at: '2026-01-01T00:00:00.000Z',
    }));
    const res = await post(`/admin/historical-records/${id}/correction/confirm`, {
      name: 'Changed Holder', country: 'United States', first_year: '', last_year: '', reason: 'x',
    });
    expect(res.status).toBe(422);
    expect(person(id).person_name).toBe('Deleted Holder');
  });

  it('answers an unknown record with not found', async () => {
    const res = await request(createApp())
      .get('/admin/historical-records/no-such-person/correction').set('Cookie', cookieFor(ADMIN_ID));
    expect(res.status).toBe(404);
  });

  it('offers the correction on an unclaimed record in the lookup, and not on a claimed one', async () => {
    // Defect caught: the lookup gives no way to reach the correction, or offers
    // it on a record the write would refuse.
    const free = seedPerson({ person_name: 'Lookup Free' });
    const res = await request(createApp())
      .get('/admin/historical-records?q=Lookup').set('Cookie', cookieFor(ADMIN_ID));
    expect(res.text).toContain(`href="/admin/historical-records/${free}/correction"`);
    const held = await request(createApp())
      .get('/admin/historical-records?q=Held Person').set('Cookie', cookieFor(ADMIN_ID));
    expect(held.text).toContain('Held Person');
    expect(held.text).not.toMatch(/historical-records\/[^/"]+\/correction"/);
  });
});

describe('a submission that changes nothing', () => {
  it('writes nothing and says so', async () => {
    // Defect caught: a correction recorded that did not happen, padding the
    // trail and claiming a change nobody made.
    const id = seedPerson({ person_name: 'Same Person', country: 'Finland', first_year: 1999 });
    const res = await post(`/admin/historical-records/${id}/correction/confirm`, {
      name: 'Same Person', country: 'Finland', first_year: '1999', last_year: '', reason: 'check',
    });
    expect(res.status).toBe(303);
    expect(await landing(res)).toContain(
      '<p class="form-notice" role="status">Those are the facts the record already holds, so nothing changed.</p>',
    );
    expect(corrections(id)).toHaveLength(0);
  });

  it('a repeated submit by the same admin gets the first answer, with one audit row', async () => {
    // Defect caught: a double click reads as "nothing changed", or writes the
    // correction twice.
    const id = seedPerson({ person_name: 'Twice Persn' });
    const body = { name: 'Twice Person', country: 'United States', first_year: '', last_year: '', reason: 'typo' };
    const success = '<div class="form-success-banner" role="status">The record for Twice Person has been corrected, and the change is in the audit log.</div>';
    expect(await landing(await post(`/admin/historical-records/${id}/correction/confirm`, body))).toContain(success);
    expect(await landing(await post(`/admin/historical-records/${id}/correction/confirm`, body))).toContain(success);
    expect(corrections(id)).toHaveLength(1);
  });

  it('another admin\'s earlier correction is not taken for this admin\'s repeat', async () => {
    // Defect caught: one administrator is told they made a change another
    // administrator made.
    const id = seedPerson({ person_name: 'Other Persn' });
    const body = { name: 'Other Person', country: 'United States', first_year: '', last_year: '', reason: 'typo' };
    await post(`/admin/historical-records/${id}/correction/confirm`, body, OTHER_ADMIN_ID);
    const res = await post(`/admin/historical-records/${id}/correction/confirm`, body, ADMIN_ID);
    expect(await landing(res)).toContain('nothing changed');
    expect(corrections(id)).toHaveLength(1);
  });
});

describe('the player hashtag follows a corrected name', () => {
  function seedTaggedMedia(tag: string): { tagId: string; mediaId: string } {
    return db((conn) => {
      const tagId = insertFreeformTag(conn, { tag_normalized: tag });
      const mediaId = insertMediaItem(conn, { uploader_member_id: ADMIN_ID });
      attachMediaTag(conn, mediaId, tagId);
      return { tagId, mediaId };
    });
  }

  function tagState(tagId: string): { tag: string; copies: string[] } {
    return db((conn) => ({
      tag: (conn.prepare(`SELECT tag_normalized FROM tags WHERE id = ?`).get(tagId) as { tag_normalized: string }).tag_normalized,
      copies: (conn.prepare(`SELECT tag_display FROM media_tags WHERE tag_id = ?`).all(tagId) as { tag_display: string }[])
        .map((r) => r.tag_display),
    }));
  }

  it('warns in the preview, then renames the tag and every media item\'s copy of it', async () => {
    // Defect caught: media keep crediting a spelling no record has, or the
    // chips on each media item keep showing the old hashtag.
    const id = seedPerson({ person_name: 'Tagg Mover' });
    const { tagId } = seedTaggedMedia('#player_tagg_mover');
    const body = { name: 'Tag Mover', country: 'United States', first_year: '', last_year: '', reason: 'spelling' };

    const preview = await post(`/admin/historical-records/${id}/correction`, body);
    expect(preview.text).toContain('#player_tagg_mover &rarr; #player_tag_mover');
    expect(preview.text).toContain('class="notice notice-warn"');
    expect(tagState(tagId).tag).toBe('#player_tagg_mover');

    await post(`/admin/historical-records/${id}/correction/confirm`, body);
    expect(tagState(tagId)).toEqual({ tag: '#player_tag_mover', copies: ['#player_tag_mover'] });
    expect(JSON.parse(corrections(id)[0]!.metadata_json)).toMatchObject({
      old_tag: '#player_tagg_mover', new_tag: '#player_tag_mover',
    });
  });

  it('leaves a tag another record\'s name also spells, which still credits that record', async () => {
    // Defect caught: correcting one of two people sharing a name moves the other
    // person's credits onto a spelling that is not theirs.
    const id = seedPerson({ person_name: 'Shared Name' });
    seedPerson({ person_name: 'Shared Name' });
    const { tagId } = seedTaggedMedia('#player_shared_name');
    await post(`/admin/historical-records/${id}/correction/confirm`, {
      name: 'Shared Namer', country: 'United States', first_year: '', last_year: '', reason: 'spelling',
    });
    expect(person(id).person_name).toBe('Shared Namer');
    expect(tagState(tagId).tag).toBe('#player_shared_name');
  });

  it('refuses a correction whose new hashtag is already in use, writing nothing', async () => {
    // Defect caught: two hashtags silently merged, or the rename collides with
    // a tag that already exists.
    const id = seedPerson({ person_name: 'Clash Persn' });
    const { tagId } = seedTaggedMedia('#player_clash_persn');
    seedTaggedMedia('#player_clash_person');
    const res = await post(`/admin/historical-records/${id}/correction/confirm`, {
      name: 'Clash Person', country: 'United States', first_year: '', last_year: '', reason: 'spelling',
    });
    expect(res.status).toBe(422);
    expect(res.text).toContain('#player_clash_person is already in use');
    expect(person(id).person_name).toBe('Clash Persn');
    expect(tagState(tagId).tag).toBe('#player_clash_persn');
    expect(corrections(id)).toHaveLength(0);
  });
});
