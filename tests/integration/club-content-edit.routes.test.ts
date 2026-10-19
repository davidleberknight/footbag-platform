/**
 * Club content editing contract: club leaders edit the description and
 * external URL directly with no approval gate; external URLs are verified
 * before the live row changes and a failing URL changes nothing; members
 * who are not leaders cannot edit club content; every applied edit is
 * audit-logged with before/after values.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertClub, insertClubLeader, insertTag, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3080');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const cookieFor = (id: string) => `__Host-footbag_session=${createTestSessionJwt({ memberId: id })}`;

let _n = 0;
function seedClubWithLeader(
  overrides: Parameters<typeof insertClub>[1] = {},
): { clubId: string; clubKey: string; leaderId: string; memberId: string; name: string } {
  _n += 1;
  const clubId = `ccl-club-${_n}`;
  const leaderId = `ccl-leader-${_n}`;
  const memberId = `ccl-member-${_n}`;
  // The public club key is the stored hashtag minus '#': tag '#club_ccl_<n>'
  // serves at /clubs/club_ccl_<n>.
  const tagId = insertTag(db, { tag_normalized: `#club_ccl_${_n}`, tag_display: `#club_ccl_${_n}`, standard_type: 'club' });
  // A country that names states, with one named, is the ordinary case: the
  // country page groups by state only when every club in it has one.
  insertClub(db, {
    id: clubId,
    name: `CCL Club ${_n}`,
    hashtag_tag_id: tagId,
    description: 'Old description.',
    city: 'Testville',
    region: 'California',
    country: 'USA',
    ...overrides,
  });
  insertMember(db, { id: leaderId, slug: `ccl_leader_${_n}`, login_email: `${leaderId}@example.com` });
  insertMember(db, { id: memberId, slug: `ccl_member_${_n}`, login_email: `${memberId}@example.com` });
  insertClubLeader(db, { id: `ccl-cl-${_n}`, club_id: clubId, member_id: leaderId });
  return {
    clubId, clubKey: `club_ccl_${_n}`, leaderId, memberId,
    name: overrides.name ?? `CCL Club ${_n}`,
  };
}

function clubRow(clubId: string): Record<string, unknown> {
  return db.prepare('SELECT name, description, city, region, country, external_url, external_url_validated_at FROM clubs WHERE id = ?').get(clubId) as Record<string, unknown>;
}

function auditChanges(clubId: string): Record<string, { before: unknown; after: unknown }> {
  const row = db.prepare(
    `SELECT metadata_json FROM audit_entries
      WHERE action_type = 'club.content_edited' AND entity_id = ?
      ORDER BY rowid DESC LIMIT 1`,
  ).get(clubId) as { metadata_json: string };
  return JSON.parse(row.metadata_json).changes;
}

// The widened form posts every field on every save, so a test that changes one
// field sends the rest at their current values, as a browser would. The club's
// own name is one of them: resubmitting it unchanged must not read as a rename.
function fullForm(name: string, over: Record<string, string> = {}): Record<string, string> {
  return {
    name, description: 'Old description.', city: 'Testville',
    region: 'California', country: 'USA', external_url: '',
    ...over,
  };
}

describe('direct edit (authoritative editors)', () => {
  it('a leader edits the description directly with an audit row; non-leaders are refused', async () => {
    const { clubId, clubKey, leaderId, memberId } = seedClubWithLeader();

    const refused = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ description: 'Hijacked.' });
    expect(refused.status).toBe(422);
    expect(clubRow(clubId).description).toBe('Old description.');

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send({ description: 'Fresh description.' });
    expect(res.status).toBe(303);
    expect(clubRow(clubId).description).toBe('Fresh description.');

    const audit = db.prepare(
      `SELECT metadata_json FROM audit_entries WHERE action_type = 'club.content_edited' AND entity_id = ?`,
    ).get(clubId) as { metadata_json: string };
    const changes = JSON.parse(audit.metadata_json).changes as Record<string, { before: unknown; after: unknown }>;
    expect(changes.description.before).toBe('Old description.');
    expect(changes.description.after).toBe('Fresh description.');
  });

  it('a leader-supplied URL that fails verification changes nothing', async () => {
    const { clubId, clubKey, leaderId } = seedClubWithLeader();
    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send({ external_url: 'javascript:alert(1)' });
    expect(res.status).toBe(422);
    expect(clubRow(clubId).external_url).toBeNull();
  });
});

describe('a club does not move between countries', () => {
  it('a co-leader cannot change the country: a submitted one is ignored and the form shows it as fixed', async () => {
    // Broken, one co-leader slip moves the club to another country page and
    // out of its neighbours' duplicate checks.
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();
    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { country: 'Germany', description: 'Moved?' }));
    expect(res.status).toBe(303);
    expect(clubRow(clubId).country).toBe('USA');
    expect(clubRow(clubId).region).toBe('California');
    expect(auditChanges(clubId).country).toBeUndefined();

    const page = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', cookieFor(leaderId));
    expect(page.status).toBe(200);
    expect(page.text).not.toMatch(/name="country"/);
    expect(page.text).toContain('Country: USA');
  });
});

describe('the full club field set', () => {
  it('a co-leader edits name, city and region, each audited with its before and after', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { name: 'Renamed Crew', city: 'Portland', region: 'Oregon' }));
    expect(res.status).toBe(303);

    const row = clubRow(clubId);
    expect(row.name).toBe('Renamed Crew');
    expect(row.city).toBe('Portland');
    expect(row.region).toBe('Oregon');

    const changes = auditChanges(clubId);
    expect(changes.name).toEqual({ before: `CCL Club ${_n}`, after: 'Renamed Crew' });
    expect(changes.city).toEqual({ before: 'Testville', after: 'Portland' });
    expect(changes.region).toEqual({ before: 'California', after: 'Oregon' });
    // A field the save did not change earns no audit entry, so the trail says
    // what moved rather than what was submitted.
    expect(changes.country).toBeUndefined();

    // A co-leader who saves is told the save landed.
    const carried = (res.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const landed = await request(createApp())
      .get(`/clubs/${clubKey}`)
      .set('Cookie', `${carried}; ${cookieFor(leaderId)}`);
    expect(landed.text).toContain('Club updated.');
  });

  it('a submitted state code is stored as the full state name', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { region: 'NY' }));
    expect(res.status).toBe(303);
    // Clubs store the full name because the country page groups on it; the
    // two-letter form is the member-location spelling and is never stored here.
    expect(clubRow(clubId).region).toBe('New York');
  });

  it('an all-lowercase city is stored and audited with each word capitalized', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { city: 'san luis obispo' }));
    expect(res.status).toBe(303);
    expect(clubRow(clubId).city).toBe('San Luis Obispo');
    // The trail records the value the row now holds, not the raw submission.
    expect(auditChanges(clubId).city).toEqual({ before: 'Testville', after: 'San Luis Obispo' });
  });

  it('an unrecognized state is refused and the club is untouched', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { region: 'Nowhereshire', city: 'Portland' }));
    expect(res.status).toBe(422);
    expect(clubRow(clubId).city).toBe('Testville');
    expect(clubRow(clubId).region).toBe('California');
  });
});

describe('renaming a club', () => {
  it('a rename onto an existing name in the same country is refused, with no override offered', async () => {
    const existing = seedClubWithLeader({ name: 'Shared Name', country: 'USA' });
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { name: 'Shared Name' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already exists in that country');
    expect(clubRow(clubId).name).not.toBe('Shared Name');
    expect(clubRow(existing.clubId).name).toBe('Shared Name');
  });

  it('the same name in a different country is allowed, because the block is per country', async () => {
    seedClubWithLeader({ name: 'Shared Abroad', country: 'USA' });
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader({ country: 'Germany', region: null });

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { name: 'Shared Abroad', country: 'Germany', region: '' }));
    expect(res.status).toBe(303);
    expect(clubRow(clubId).name).toBe('Shared Abroad');
  });

  it('a club may recase its own name, since its own row is not a collision', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader({ name: 'lowercase crew' });

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { name: 'Lowercase Crew' }));
    expect(res.status).toBe(303);
    expect(clubRow(clubId).name).toBe('Lowercase Crew');
  });
});

describe('the edit form itself', () => {
  it('a refused save re-renders the form carrying what was typed', async () => {
    const { clubKey, leaderId, name } = seedClubWithLeader();

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { name: '', city: 'Kept Typing', description: 'Also kept.' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Club name is required.');
    // The whole point of re-rendering rather than sending a bare error: the
    // other fields the co-leader filled in survive the refusal.
    expect(res.text).toContain('Kept Typing');
    expect(res.text).toContain('Also kept.');
  });

  it('prefills a quarantined URL that the public page hides, so an untouched save does not clear it', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader({
      external_url: 'https://club.example.com/',
      external_url_validated_at: null,
      external_url_quarantine_reason: 'safe_browsing_match',
    });

    const page = await request(createApp())
      .get(`/clubs/${clubKey}`)
      .set('Cookie', cookieFor(leaderId));
    expect(page.status).toBe(200);
    expect(page.text).toContain('https://club.example.com/');

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { city: 'Portland', external_url: 'https://club.example.com/' }));
    expect(res.status).toBe(303);
    expect(clubRow(clubId).external_url).toBe('https://club.example.com/');
  });
});

describe('a club save submitted twice', () => {
  /** What a save could write: the club row's version, the club's content
   *  audit rows, and the outbox. */
  function saveState(clubId: string): { version: number; contentAudits: number; outbox: number } {
    return {
      version: (db.prepare('SELECT version FROM clubs WHERE id = ?').get(clubId) as { version: number }).version,
      contentAudits: (db.prepare(
        `SELECT COUNT(*) AS n FROM audit_entries
          WHERE entity_type = 'club' AND entity_id = ?
            AND action_type IN ('club.content_edited', 'club.content_corrected')`,
      ).get(clubId) as { n: number }).n,
      outbox: (db.prepare('SELECT COUNT(*) AS n FROM outbox_emails').get() as { n: number }).n,
    };
  }

  function save(clubKey: string, memberId: string, form: Record<string, string>) {
    return request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send(form);
  }

  /** The club page the save redirected to, opened with the flash it set. */
  async function landedOn(memberId: string, res: { headers: Record<string, unknown> }): Promise<string> {
    const flash = ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? [])
      .find((c) => c.startsWith('footbag_flash='))?.split(';')[0];
    expect(flash, 'the save left no outcome for the club page to show').toBeDefined();
    const shown = await request(createApp())
      .get(res.headers.location as string)
      .set('Cookie', [cookieFor(memberId), flash].join('; '));
    expect(shown.status).toBe(200);
    return shown.text;
  }

  // Defect caught: a co-leader who double-clicks Save, or re-posts it from the
  // back button, is shown an error for a save that went through, or the
  // repeat bumps the row and writes a second audit row for no change.
  it('the editing co-leader\'s repeat writes nothing and repeats the first success', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();
    const form = fullForm(name, { description: 'Saved once.' });

    const first = await save(clubKey, leaderId, form);
    expect(first.status).toBe(303);
    const afterFirst = saveState(clubId);
    expect(afterFirst.contentAudits).toBe(1);

    const second = await save(clubKey, leaderId, form);
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(saveState(clubId)).toEqual(afterFirst);
    expect(clubRow(clubId).description).toBe('Saved once.');

    const page = await landedOn(leaderId, second);
    expect(page).toContain('<div class="form-success-banner" role="status">Club updated.</div>');
    expect(page).not.toContain('form-error-banner');
  });

  // Defect caught: a second co-leader saving the details another co-leader
  // just set is told they updated the club, or is refused, when their save
  // changed nothing.
  it('another co-leader\'s unchanged save after the first co-leader\'s edit reads as nothing to update', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();
    const otherId = `ccl-other-${_n}`;
    insertMember(db, { id: otherId, slug: `ccl_other_${_n}`, login_email: `${otherId}@example.com` });
    insertClubLeader(db, { id: `ccl-cl-other-${_n}`, club_id: clubId, member_id: otherId });
    const form = fullForm(name, { description: 'Set by the first co-leader.' });

    const first = await save(clubKey, leaderId, form);
    expect(first.status).toBe(303);
    const afterFirst = saveState(clubId);

    const second = await save(clubKey, otherId, form);
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(saveState(clubId)).toEqual(afterFirst);

    const page = await landedOn(otherId, second);
    expect(page).toContain('<p class="form-notice" role="status">Nothing to update.</p>');
    expect(page).not.toContain('form-success-banner');
    expect(page).not.toContain('form-error-banner');
  });
});

describe('club action notice', () => {
  it('the outcome of a club action renders on the club page and is consumed once', async () => {
    const { clubKey, leaderId, name } = seedClubWithLeader();

    // A co-leader's content edit is an action outcome that lands back on the
    // club page; the contract under test is that the club page displays what
    // the action left for it, whatever the action was.
    const acted = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(fullForm(name, { description: 'A notice-carrying edit.' }));
    expect(acted.status).toBe(303);
    expect(acted.headers.location).toBe(`/clubs/${clubKey}`);

    const carried = (acted.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');

    const shown = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', carried);
    expect(shown.status).toBe(200);
    expect(shown.text).toContain('Club updated.');

    // The clear rides on the response that displayed it, so a reload of the
    // same URL must not repeat an outcome that belonged to the earlier request.
    const cleared = (shown.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(cleared.some((c) => c.startsWith('footbag_flash=;'))).toBe(true);

    const reloaded = await request(createApp()).get(`/clubs/${clubKey}`);
    expect(reloaded.status).toBe(200);
    expect(reloaded.text).not.toContain('Club updated.');
  });
});

// The typed club text is cleaned before it is checked and stored, and a stored
// value is read the same way before it is compared with what was typed.
describe('club content edit cleans the typed text', () => {
  function edit(clubKey: string, leaderId: string, form: Record<string, string>) {
    return request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send(form);
  }
  function contentAuditCount(clubId: string): number {
    return (db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'club.content_edited' AND entity_id = ?`,
    ).get(clubId) as { n: number }).n;
  }

  // Defect caught: an edited club is stored with live markup, a control
  // character, CRLF line ends or a decomposed accent, and the audit row
  // records that raw text as the new value.
  it('stores and audits the cleaned name, description, city and region', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();
    const res = await edit(clubKey, leaderId, fullForm(name, {
      name: 'Clean <b>Edit</b>\u0085 Club',
      description: 'Café <i>meets</i>\u0085 here\r\n\r\nSecond para',
      city: '<b>Fresno</b>',
      region: '<i>Oregon</i>',
    }));
    expect(res.status).toBe(303);
    expect(clubRow(clubId)).toMatchObject({
      name: 'Clean Edit Club',
      description: 'Café meets here\n\nSecond para',
      city: 'Fresno',
      region: 'Oregon',
    });
    expect(auditChanges(clubId).name.after).toBe('Clean Edit Club');
  });

  // Defect caught: a markup-only name passes the required check and the club
  // loses its visible name.
  it('refuses a markup-only name and leaves the club untouched', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();
    const res = await edit(clubKey, leaderId, fullForm(name, { name: '<b></b>' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Club name is required');
    expect(clubRow(clubId).name).toBe(name);
  });

  // Defect caught: the per-country duplicate-name block runs on the raw name,
  // so a rename differing only by markup takes another club's visible name.
  it('refuses a rename onto an existing name that differs only by markup', async () => {
    seedClubWithLeader({ name: 'Taken Clean Name', country: 'USA' });
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();
    const res = await edit(clubKey, leaderId, fullForm(name, { name: '<b>Taken</b> Clean Name' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('already exists in that country');
    expect(clubRow(clubId).name).toBe(name);
  });

  // Defect caught: a description longer than the form allows is stored when
  // posted around the browser's limit, or one exactly at the limit is refused.
  // The edit form declares 2000 characters.
  it('accepts a description of exactly 2000 characters and refuses 2001', async () => {
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader();
    const atLimit = await edit(clubKey, leaderId, fullForm(name, { description: 'd'.repeat(2000) }));
    expect(atLimit.status).toBe(303);
    expect((clubRow(clubId).description as string).length).toBe(2000);

    const over = await edit(clubKey, leaderId, fullForm(name, { description: 'e'.repeat(2001) }));
    expect(over.status).toBe(422);
    expect(over.text).toContain('Club description must be 2000 characters or fewer.');
    expect(clubRow(clubId).description).toBe('d'.repeat(2000));
  });

  // Defect caught: a description stored before cleaning existed, posted back
  // untouched, reads as a change: an untouched save writes an audit row for an
  // edit nobody made, and an edit of another field rewrites the description
  // and records it as changed.
  it('an untouched older description is neither changed nor recorded', async () => {
    const older = '<b>Old</b> description.';
    const { clubId, clubKey, leaderId, name } = seedClubWithLeader({ description: older });

    const untouched = await edit(clubKey, leaderId, fullForm(name, { description: older }));
    expect(untouched.status).toBe(303);
    expect(contentAuditCount(clubId)).toBe(0);

    const cityOnly = await edit(clubKey, leaderId, fullForm(name, { description: older, city: 'Elsewhere' }));
    expect(cityOnly.status).toBe(303);
    expect(Object.keys(auditChanges(clubId))).toEqual(['city']);
    expect(clubRow(clubId).description).toBe(older);
  });
});
