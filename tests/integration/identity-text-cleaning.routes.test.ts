/**
 * Identity write paths clean the text a person typed before any rule reads it
 * and before it is stored: a member's recorded names on an administrator's
 * correction, a declared former surname, a link-help statement, and the
 * administrator's reason for rejecting a link request or upholding a dispute.
 *
 * Cleaning removes tags, control characters and stray whitespace and composes
 * Unicode; it does not replace the name rules. A reserved word or an invisible
 * formatting character that survives cleaning is still refused.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertHistoricalPerson, insertOnboardingTask, createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4731');

// Built from code points so the decomposed and composed forms stay visibly
// different in the source.
const DECOMPOSED_E_ACUTE = `e${String.fromCodePoint(0x0301)}`;
const COMPOSED_E_ACUTE = String.fromCodePoint(0x00e9);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);

const ADMIN_ID = 'itc-admin';

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID, slug: 'itc_admin', login_email: 'itc-admin@example.com', is_admin: 1,
    real_name: 'Ada Admin', display_name: 'Ada Admin',
  });
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

let _n = 0;
function seedMember(realName: string, overrides: Parameters<typeof insertMember>[1] = {}): string {
  _n += 1;
  const [given, ...rest] = realName.split(' ');
  return insertMember(db, {
    id: `itc-member-${_n}`, slug: `itc_member_${_n}`, login_email: `itc-member-${_n}@example.com`,
    real_name: realName, display_name: realName, given_names: given, family_name: rest.join(' '),
    ...overrides,
  });
}

function readNames(memberId: string): { given_names: string | null; family_name: string | null; display_name: string } {
  return db.prepare('SELECT given_names, family_name, display_name FROM members WHERE id = ?')
    .get(memberId) as ReturnType<typeof readNames>;
}

function auditReasons(entityId: string, actionType: string): Array<string | null> {
  return (db.prepare('SELECT reason_text FROM audit_entries WHERE entity_id = ? AND action_type = ?')
    .all(entityId, actionType) as Array<{ reason_text: string | null }>).map((r) => r.reason_text);
}

function correctName(memberId: string, body: Record<string, string>) {
  return request(createApp())
    .post(`/admin/members/${memberId}/name/confirm`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({ reason: 'error correction', ...body });
}

function slugFor(memberId: string): string {
  return (db.prepare('SELECT slug FROM members WHERE id = ?').get(memberId) as { slug: string }).slug;
}

function askAdminToLink(memberId: string, statement: string) {
  return request(createApp())
    .post(`/members/${slugFor(memberId)}/contact-admin`)
    .set('Cookie', cookieFor(memberId))
    .type('form')
    .send({ category: 'identity_link_issue', message: statement });
}

function openLinkHelpItem(memberId: string): { id: string; status: string; reason_text: string } {
  return db.prepare(`
    SELECT id, status, reason_text FROM work_queue_items
    WHERE entity_id = ? AND task_type = 'member_link_help_request'
  `).get(memberId) as { id: string; status: string; reason_text: string };
}

function reject(itemId: string, reason: string) {
  return request(createApp())
    .post(`/admin/work-queue/${itemId}/link-help/reject`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({ reason });
}

describe('the name correction cleans each name before the rules read it', () => {
  // Defect caught: a corrected name is stored with markup, a C1 control
  // character or a decomposed accent, so the member's public name carries
  // tags and the same name typed two ways compares unequal in matching.
  it('stores given, family and display names cleaned and composed', async () => {
    const memberId = seedMember('Rhea Rules');
    const res = await correctName(memberId, {
      given_names:  `Ren${DECOMPOSED_E_ACUTE}e <b>Anne</b>`,
      family_name:  'Du<i>pont</i>\u0085',
      display_name: `Ren${DECOMPOSED_E_ACUTE}e <b>Dupont</b>`,
    });
    expect(res.status).toBe(303);
    expect(readNames(memberId)).toEqual({
      given_names:  `Ren${COMPOSED_E_ACUTE}e Anne`,
      family_name:  'Dupont',
      display_name: `Ren${COMPOSED_E_ACUTE}e Dupont`,
    });
  });

  // Defect caught: a family name that was only markup passes the required
  // check because it reads the raw text, and the record loses its surname.
  it('refuses a family name that is only markup and writes nothing', async () => {
    const memberId = seedMember('Mara Marks');
    const res = await correctName(memberId, {
      given_names: 'Mara', family_name: '<b></b>', display_name: 'Mara',
    });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter your family name.');
    expect(readNames(memberId).family_name).toBe('Marks');
    expect(auditReasons(memberId, 'member.name_corrected')).toEqual([]);
  });

  // Defect caught: cleaning a tag away exposes a reserved word the rule then
  // never sees, letting a member be renamed as an official role.
  it('still refuses a reserved word once the tags around it are removed', async () => {
    const memberId = seedMember('Olga Ober');
    const res = await correctName(memberId, {
      given_names: '<b>IFPA</b>', family_name: 'Ober', display_name: '',
    });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must not include a word reserved for official IFPA and site roles');
    expect(readNames(memberId).given_names).toBe('Olga');
  });

  // Defect caught: an invisible formatting character, which cleaning does not
  // remove because it is not a control character, slips past the name rules,
  // so a name can be made to look like somebody else's.
  it('still refuses an invisible formatting character inside a name', async () => {
    const memberId = seedMember('Ivo Ivers');
    const res = await correctName(memberId, {
      given_names: 'Ivo', family_name: `Iv${ZERO_WIDTH_SPACE}ers`, display_name: '',
    });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must not contain invisible or control characters');
    expect(readNames(memberId).family_name).toBe('Ivers');
  });

  // Defect caught: the correction's reason reaches the append-only ledger with
  // markup in it, where it can never be corrected.
  it('records the reason cleaned', async () => {
    const memberId = seedMember('Rex Reason');
    const res = await correctName(memberId, {
      given_names: 'Rex', family_name: 'Reasoner', display_name: '',
      reason: '<b>Typo</b>   fixed\u0085',
    });
    expect(res.status).toBe(303);
    expect(auditReasons(memberId, 'member.name_corrected')).toEqual(['Typo fixed']);
  });
});

describe('a declared former surname is cleaned like a name', () => {
  function addAnchor(memberId: string, anchorValue: string) {
    return request(createApp())
      .post('/register/wizard/legacy_claim/anchors/add')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ anchorType: 'former_surname', anchorValue });
  }

  function anchorValues(memberId: string): string[] {
    return (db.prepare('SELECT anchor_value FROM member_declared_anchors WHERE member_id = ?')
      .all(memberId) as Array<{ anchor_value: string }>).map((r) => r.anchor_value);
  }

  function seedClaimStepMember(realName: string): string {
    const memberId = seedMember(realName, { onboarding: 'none' });
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');
    return memberId;
  }

  // Defect caught: the former surname is stored with markup, a control
  // character or a decomposed accent, so it never matches the old record that
  // spells it in composed form.
  it('stores the former surname cleaned and composed', async () => {
    const memberId = seedClaimStepMember('Ana Anchor');
    const res = await addAnchor(memberId, `Bel${DECOMPOSED_E_ACUTE}<b>zile</b>\u0085`);
    expect(res.status).toBe(303);
    expect(anchorValues(memberId)).toEqual([`Bel${COMPOSED_E_ACUTE}zile`]);
  });

  // Defect caught: a former surname that was only markup passes the
  // value-required check and an empty anchor is stored.
  it('refuses a former surname that is only markup and stores nothing', async () => {
    const memberId = seedClaimStepMember('Ben Blank');
    const res = await addAnchor(memberId, '<b></b>');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter a value to add.');
    expect(anchorValues(memberId)).toEqual([]);
  });
});

describe('link-help text is cleaned before it is stored', () => {
  // Defect caught: the member's statement reaches the queue with markup, a
  // control character or Windows line endings, or loses its paragraph break.
  it('stores the statement cleaned, keeping its paragraph break', async () => {
    const memberId = seedMember('Stan Statement');
    const res = await askAdminToLink(memberId, 'I competed <b>at Worlds</b>\r\n\r\nas Stan\u0085');
    expect(res.status).toBe(303);
    const payload = JSON.parse(openLinkHelpItem(memberId).reason_text) as { statement: string };
    expect(payload.statement).toBe('I competed at Worlds\n\nas Stan');
  });

  // Defect caught: the rejection reason, which is mailed to the member and
  // kept in the ledger, carries markup or control characters.
  it('records a rejection reason cleaned', async () => {
    const memberId = seedMember('Rita Reject');
    await askAdminToLink(memberId, 'Mine.');
    const item = openLinkHelpItem(memberId);
    const res = await reject(item.id, '<b>No</b> records\r\n\r\nfound\u0085');
    expect(res.status).toBe(303);
    expect(auditReasons(memberId, 'support.help_request_rejected')).toEqual(['No records\n\nfound']);
  });

  // Defect caught: a rejection reason that was only markup counts as given,
  // so a request is refused with no reason the member can read.
  it('refuses a rejection reason that is only markup and leaves the request open', async () => {
    const memberId = seedMember('Mo Markup');
    await askAdminToLink(memberId, 'Mine.');
    const item = openLinkHelpItem(memberId);
    const res = await reject(item.id, '<b></b>');
    expect(res.status).toBe(422);
    expect(res.text).toContain('A rejection reason is required.');
    expect(openLinkHelpItem(memberId).status).toBe('open');
  });

  // The work-queue form allows 500 characters for this reason, so that is the
  // real ceiling the server holds as well.
  // Defect caught: a reason longer than the form allows is stored, or the
  // limit counts markup the cleaner removes and refuses a reason that fits.
  it('holds a rejection reason to 500 characters, counted after cleaning', async () => {
    const longId = seedMember('Lena Long');
    await askAdminToLink(longId, 'Mine.');
    const tooLong = await reject(openLinkHelpItem(longId).id, 'x'.repeat(501));
    expect(tooLong.status).toBe(422);
    expect(tooLong.text).toContain('The rejection reason must be 500 characters or fewer.');
    expect(openLinkHelpItem(longId).status).toBe('open');

    const fitsId = seedMember('Fay Fits');
    await askAdminToLink(fitsId, 'Mine.');
    const fits = await reject(openLinkHelpItem(fitsId).id, `${'x'.repeat(500)}<b></b>`);
    expect(fits.status).toBe(303);
    expect(auditReasons(fitsId, 'support.help_request_rejected')).toEqual(['x'.repeat(500)]);
  });
});

describe('a dispute revert reason is cleaned before it is recorded', () => {
  // A requester whose surname matches a record another member holds files a
  // dispute naming that record, which an administrator may then revert.
  async function fileDispute(surname: string): Promise<{ holderId: string; itemId: string; personId: string }> {
    const holderId = seedMember(`Hold ${surname}x`);
    const requesterId = seedMember(`Req ${surname}`);
    const personId = insertHistoricalPerson(db, {
      person_id: `hp-itc-${surname.toLowerCase()}`, person_name: `Held ${surname}`, hof_member: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(personId, holderId);
    const filed = await askAdminToLink(requesterId, 'Someone else holds my record.');
    expect(filed.status).toBe(303);
    return { holderId, personId, itemId: openLinkHelpItem(requesterId).id };
  }

  function revert(itemId: string, personId: string, reason: string) {
    return request(createApp())
      .post(`/admin/work-queue/${itemId}/link-help/dispute-revert/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ target_historical_person_id: personId, reason });
  }

  function holdsRecord(memberId: string): string | null {
    return (db.prepare('SELECT historical_person_id FROM members WHERE id = ?')
      .get(memberId) as { historical_person_id: string | null }).historical_person_id;
  }

  // Defect caught: the reason for stripping a member's claim reaches the
  // append-only ledger with markup or control characters in it.
  it('records the revert reason cleaned', async () => {
    const { holderId, itemId, personId } = await fileDispute('Cleanrecord');
    const res = await revert(itemId, personId, '<b>Evidence</b> favours\u0085 the requester.');
    expect(res.status).toBe(303);
    expect(holdsRecord(holderId)).toBeNull();
    expect(auditReasons(holderId, 'claim.revert_applied')).toEqual(['Evidence favours the requester.']);
  });

  // Defect caught: a reason that was only markup, or one longer than the form
  // allows, still strips the holder's claim.
  it('refuses a markup-only or over-long reason and leaves the claim in place', async () => {
    const { holderId, itemId, personId } = await fileDispute('Refusedrecord');
    const markupOnly = await revert(itemId, personId, '<b></b>');
    expect(markupOnly.status).toBe(422);
    expect(markupOnly.text).toContain('A dispute reason is required.');

    const tooLong = await revert(itemId, personId, 'x'.repeat(501));
    expect(tooLong.status).toBe(422);
    expect(tooLong.text).toContain('The dispute reason must be 500 characters or fewer.');

    expect(holdsRecord(holderId)).toBe(personId);
    expect(auditReasons(holderId, 'claim.revert_applied')).toEqual([]);
  });
});
