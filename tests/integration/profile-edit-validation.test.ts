/**
 * Integration tests for profile edit negative paths and boundary validation.
 *
 * Covers:
 *   POST /members/:slug/edit
 *   - firstCompetitionYear boundaries and invalid values
 *   - showCompetitiveResults toggle
 *   - Bio at exactly 1000 chars (max)
 *   - Bio exceeding 1000 chars (rejected)
 *   - Mandatory city/country rejected when blank
 *   - Phone whitespace trimming
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import type { Test } from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertMemberLink, insertSystemConfig, createTestSessionJwt } from '../fixtures/factories';
import { rowPin, snapshotIds, oneRowAddedSince } from '../fixtures/rowPinning';
import { REGION_CODE_MESSAGE, REGION_COUNTRY_MISMATCH_MESSAGE } from '../../src/services/memberLocationRules';

const { dbPath } = setTestEnv('3062');

// Built from code points so the decomposed and composed forms stay visibly
// different in the source.
const DECOMPOSED_E_ACUTE = `e${String.fromCodePoint(0x0301)}`;
const COMPOSED_E_ACUTE = String.fromCodePoint(0x00e9);

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID   = 'edit-val-001';
const MEMBER_SLUG = 'edit_validator';

// The profile-update rows this member has accumulated. Several cases save the
// same member, so each one takes the row its own save added.
const profileAudit = rowPin(
  'audit_entries',
  `action_type = 'member.profile_updated' AND entity_id = ?`,
  [MEMBER_ID],
);
const LINKED_ID   = 'edit-val-linked';
const LINKED_SLUG = 'edit_val_linked';

function ownCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

function linkedCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: LINKED_ID })}`;
}

/** Read the member row directly from the test DB to verify persisted values. */
function readMember(): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM members WHERE id = ?').get(MEMBER_ID) as Record<string, unknown>;
  db.close();
  return row;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    display_name: 'Edit Validator',
    login_email: 'editval@example.com',
    first_competition_year: 2000,
    show_competitive_results: 1,
  });
  // A member holding both identity links, so the claim call-to-action has
  // nothing left to offer them.
  insertMember(db, {
    id: LINKED_ID,
    slug: LINKED_SLUG,
    display_name: 'Fully Linked',
    login_email: 'fullylinked@example.com',
    legacy_member_id: 'legmem-edit-val-linked',
    historical_person_id: 'person-edit-val-linked',
  });
  db.close();
  createApp = await importApp();
  // Fully onboard the member so the completion gate is a no-op: these tests
  // exercise profile-edit validation and the removed anchor route, not wizard
  // routing, and an incomplete member would be redirected to the wizard before
  // the route resolves.
  const onboarding = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
  onboarding.completeTask(MEMBER_ID, 'personal_details');
  onboarding.completeTask(MEMBER_ID, 'legacy_claim');
  onboarding.completeTask(MEMBER_ID, 'club_affiliations');
});

afterAll(() => cleanupTestDb(dbPath));

// City, country and date of birth are mandatory profile fields, and region joins
// them when the country is the USA or Canada. The edit form pre-fills all of
// them from the stored values, so a genuine save always carries them. These
// cases exercise other fields, so the helper supplies a valid location and date
// by default; a case that needs to blank part of it overrides the default
// explicitly.
function postEdit(fields: Record<string, string>): Test {
  return request(createApp())
    .post(`/members/${MEMBER_SLUG}/edit`)
    .set('Cookie', ownCookie())
    .type('form')
    .send({
      city: 'Portland', region: 'OR', country: 'USA',
      birthDay: '14', birthMonth: '3', birthYear: '1978',
      ...fields,
    });
}

// ── Region required in the USA and Canada ────────────────────────────────────

describe('region requirement by country', () => {
  it('rejects a blank region for the USA', async () => {
    const res = await postEdit({ region: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Region or state is required');
  });

  it('rejects a blank region for Canada', async () => {
    const res = await postEdit({ region: '', country: 'Canada' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Region or state is required');
  });

  it('accepts a blank region for a country that does not need one', async () => {
    const res = await postEdit({ region: '', country: 'New Zealand' });
    expect(res.status).toBe(303);
  });

  it.each(['US', 'U.S.', 'United States', 'United States of America', 'CA', 'CAN'])(
    'recognises %s as a country whose region is required',
    async (country) => {
      const res = await postEdit({ region: '', country });
      expect(res.status).toBe(422);
      expect(res.text).toContain('Region or state is required');
    },
  );
});

// ── The official code is the whole vocabulary where a country has one ────────

describe('region is stored as the official state or province code', () => {
  function storedRegion(): string | null {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT region FROM members WHERE slug = ?').get(MEMBER_SLUG) as
      | { region: string | null }
      | undefined;
    db.close();
    return row?.region ?? null;
  }

  // A member never has to know the two-letter code: a full name in any casing
  // is stored as the code, so the roster still sees one spelling per place.
  it('accepts a full state name and stores its code', async () => {
    const res = await postEdit({ region: 'Oregon' });
    expect(res.status).toBe(303);
    expect(storedRegion()).toBe('OR');
  });

  it('refuses a code that is not a real state, keeping the stored region', async () => {
    await postEdit({ region: 'OR' });
    const res = await postEdit({ region: 'ZZ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain(REGION_CODE_MESSAGE);
    expect(storedRegion()).toBe('OR');
  });

  it('accepts a full province name for Canada in any casing and stores its code', async () => {
    const res = await postEdit({ region: ' ontario ', country: 'Canada' });
    expect(res.status).toBe(303);
    expect(storedRegion()).toBe('ON');
  });

  it('accepts a Canadian province code', async () => {
    const res = await postEdit({ region: 'ON', country: 'Canada' });
    expect(res.status).toBe(303);
    expect(storedRegion()).toBe('ON');
  });

  it('accepts a code in any casing and stores the canonical form', async () => {
    // One place must reach the database under one spelling: this column feeds
    // the Official IFPA Roster, which cannot reconcile variants afterwards.
    const res = await postEdit({ region: 'or' });
    expect(res.status).toBe(303);
    expect(storedRegion()).toBe('OR');
  });

  it('stores the state picked from the list, telling a shared code apart by country', async () => {
    // WA is both Washington and Western Australia.
    const res = await postEdit({ region: 'AU-WA', country: 'Australia' });
    expect(res.status).toBe(303);
    expect(storedRegion()).toBe('WA');
    const refused = await postEdit({ region: 'US-WA', country: 'Australia' });
    expect(refused.status).toBe(422);
    expect(refused.text).toContain(REGION_COUNTRY_MISMATCH_MESSAGE);
  });

  it('opens the form with the stored state selected by its own country', async () => {
    // A stored WA must select Washington for an American and nothing else.
    await postEdit({ region: 'US-WA' });
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}/edit`).set('Cookie', ownCookie());
    const select = /<select id="region"[\s\S]*?<\/select>/.exec(res.text)?.[0] ?? '';
    const selected = select.match(/<option [^>]*selected[^>]*>/g) ?? [];
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain('value="US-WA"');
  });

  it('stores no region typed for a country the form asks none of', async () => {
    // Moving to New Zealand drops the old state, and a region carried by a
    // hand-built request is not stored: the form never asked for one.
    const res = await postEdit({ region: 'Canterbury', country: 'New Zealand' });
    expect(res.status).toBe(303);
    expect(storedRegion()).toBeNull();
  });
});

// ── City casing ──────────────────────────────────────────────────────────────

describe('city casing on save', () => {
  it('stores an all-lowercase city with each word capitalized', async () => {
    const res = await postEdit({ city: 'tauranga', region: '', country: 'New Zealand' });
    expect(res.status).toBe(303);
    expect(readMember().city).toBe('Tauranga');
  });

  it('stores a city carrying any capital exactly as typed', async () => {
    const res = await postEdit({ city: 'McAllen', region: 'TX' });
    expect(res.status).toBe(303);
    expect(readMember().city).toBe('McAllen');
  });
});

// ── Legacy-claim anchors removed from Edit Profile ───────────────────────────

describe('Edit Profile offers a route to the missing linkage', () => {
  it('sends a member holding neither identity link to an administrator', async () => {
    // Claiming belongs to signing up and its wizard surface closes when signing
    // up finishes, so a member who got here without claiming cannot be sent
    // back to it. The identity-link topic of their own contact form is the
    // route that still works, and it arrives preselected.
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/edit`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`href="/members/${MEMBER_SLUG}/contact-admin?category`);
    expect(res.text).toContain('identity_link_issue');
    expect(res.text).toContain('Ask an administrator to link your history');
    expect(res.text).not.toContain('/register/wizard/legacy_claim');
  });

  it('hides it once the member holds both identity links', async () => {
    const res = await request(createApp())
      .get(`/members/${LINKED_SLUG}/edit`)
      .set('Cookie', linkedCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Ask an administrator to link');
    expect(res.text).not.toContain('/register/wizard/legacy_claim');
  });
});

describe('Edit Profile does not host legacy-claim anchors', () => {
  it('does not render the declared-anchor section', async () => {
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/edit`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Used a different email or name on the old site?');
    expect(res.text).not.toContain('/anchors/add');
  });

  it('returns 404 for the removed anchor-add route', async () => {
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/anchors/add`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({ anchorType: 'old_email', anchorValue: 'x@example.com' });
    expect(res.status).toBe(404);
  });
});

// ── firstCompetitionYear ──────────────────────────────────────────────────────

describe('firstCompetitionYear validation', () => {
  // A year the member cannot have competed in is a typo, and the profile form
  // must say so rather than accept the save and quietly clear the field: a
  // member who mistypes one digit would otherwise lose the year they had and be
  // told the save succeeded.
  it('a year before 1972 is refused, and the stored year is left alone', async () => {
    const before = readMember().first_competition_year;
    const res = await postEdit({ firstCompetitionYear: '1960' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Year must be a whole number between 1972 and');
    expect(readMember().first_competition_year).toBe(before);
  });

  it('a year after the current year is refused, and the stored year is left alone', async () => {
    const before = readMember().first_competition_year;
    const res = await postEdit({ firstCompetitionYear: '2099' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Year must be a whole number between 1972 and');
    expect(readMember().first_competition_year).toBe(before);
  });

  it('year exactly 1972 is accepted', async () => {
    const res = await postEdit({ firstCompetitionYear: '1972' });
    expect(res.status).toBe(303);
    const row = readMember();
    expect(row.first_competition_year).toBe(1972);
  });

  it('year equal to current year is accepted', async () => {
    const currentYear = new Date().getFullYear().toString();
    const res = await postEdit({ firstCompetitionYear: currentYear });
    expect(res.status).toBe(303);
    const row = readMember();
    expect(row.first_competition_year).toBe(Number(currentYear));
  });

  it('a non-numeric year is refused rather than erasing the stored year', async () => {
    const before = readMember().first_competition_year;
    const res = await postEdit({ firstCompetitionYear: 'abc' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Year must be a whole number between 1972 and');
    expect(readMember().first_competition_year).toBe(before);
  });

  it('empty string is discarded (set to NULL)', async () => {
    const res = await postEdit({ firstCompetitionYear: '' });
    expect(res.status).toBe(303);
    const row = readMember();
    expect(row.first_competition_year).toBeNull();
  });
});

// ── showCompetitiveResults ────────────────────────────────────────────────────

describe('showCompetitiveResults toggle', () => {
  it('set to 0 stores 0', async () => {
    const res = await postEdit({ showCompetitiveResults: '0' });
    expect(res.status).toBe(303);
    const row = readMember();
    expect(row.show_competitive_results).toBe(0);
  });

  it('set to 1 stores 1', async () => {
    const res = await postEdit({ showCompetitiveResults: '1' });
    expect(res.status).toBe(303);
    const row = readMember();
    expect(row.show_competitive_results).toBe(1);
  });

  it('any non-zero value defaults to 1', async () => {
    const res = await postEdit({ showCompetitiveResults: 'yes' });
    expect(res.status).toBe(303);
    const row = readMember();
    expect(row.show_competitive_results).toBe(1);
  });
});

// ── Bio ───────────────────────────────────────────────────────────────────────

describe('bio validation', () => {
  it('bio at exactly 1000 chars is accepted', async () => {
    const bio = 'x'.repeat(1000);
    const res = await postEdit({ bio });
    expect(res.status).toBe(303);
    const row = readMember();
    expect((row.bio as string).length).toBe(1000);
  });

  it('bio exceeding 1000 chars is rejected with 422', async () => {
    const bio = 'x'.repeat(1001);
    const res = await postEdit({ bio });
    expect(res.status).toBe(422);
    expect(res.text).toContain('1000 characters');
  });

  // Adversarial unicode: an RTL override (U+202E), a zero-width joiner
  // (U+200D), a Cyrillic homoglyph (U+0430), and an HTML/script payload.
  // Defect caught: the bio is stored with its script tags, so every surface
  // that renders it leans on escaping alone, or the cleaning eats the words
  // around the tags; or the profile renders a bio live. Formatting characters
  // and homoglyphs are not markup, so they are kept as typed.
  it('stores the bio without its tags, keeps the text, and renders it inert', async () => {
    const bio = 'pa\u202Eyback\u200D \u0430dmin <script>alert(1)</script>';
    const res = await postEdit({ bio });
    expect(res.status).toBe(303);
    expect(readMember().bio).toBe('pa\u202Eyback\u200D \u0430dmin alert(1)');

    const view = await request(createApp())
      .get(`/members/${MEMBER_SLUG}`)
      .set('Cookie', ownCookie());
    expect(view.status).toBe(200);
    expect(view.text).not.toContain('<script>alert(1)</script>');
    expect(view.text).toContain('\u0430dmin alert(1)');
    expect(view.text).toContain('\u202E');
  });
});

// ── Mandatory city/country ────────────────────────────────────────────────────

describe('mandatory city/country', () => {
  // The establishing save submits 'USA', which the country rule folds to the one
  // name the picker offers for that country, so the stored value these cases
  // check for is the canonical spelling rather than the submitted one.
  it('rejects a submission that blanks both city and country, preserving the stored values', async () => {
    // Establish a complete profile first.
    await postEdit({ city: 'Portland', country: 'USA' });
    // A submission that clears both mandatory fields is rejected, and the write
    // does not run, so the prior values survive.
    const res = await postEdit({ city: '', country: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('City and country are required');
    const row = readMember();
    expect(row.city).toBe('Portland');
    expect(row.country).toBe('United States');
  });

  it('rejects a submission that blanks only the country', async () => {
    await postEdit({ city: 'Portland', country: 'USA' });
    const res = await postEdit({ city: 'Seattle', country: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Country is required');
    const row = readMember();
    // The rejected save leaves the earlier complete profile untouched.
    expect(row.city).toBe('Portland');
    expect(row.country).toBe('United States');
  });
});

// ── Phone trimming ────────────────────────────────────────────────────────────

describe('phone whitespace trimming', () => {
  it('trims leading and trailing whitespace', async () => {
    const res = await postEdit({ phone: '  555-1234  ' });
    expect(res.status).toBe(303);
    const row = readMember();
    expect(row.phone).toBe('555-1234');
  });
});

// ── Mass assignment / overposting ────────────────────────────────────────────

describe('mass-assignment / overposting guard', () => {
  it('ignores crafted privileged fields in the edit body; no protected column moves', async () => {
    const before = readMember();
    // A valid edit plus crafted extra fields targeting privileged columns the
    // profile-edit contract must never accept from the member's own form body.
    const res = await postEdit({
      bio: 'legit overposting-probe bio',
      is_admin: '1',
      id: 'attacker-controlled-id',
      slug: 'hijacked_slug',
      login_email: 'attacker@evil.example',
      login_email_normalized: 'attacker@evil.example',
      password_hash: 'attacker-controlled-hash',
      password_version: '999',
      email_verified_at: '2000-01-01T00:00:00.000Z',
      email_status: 'verified',
    });
    // The whitelisted field saves and the extras are ignored: a field-by-field
    // contract, so the handler accepts the request rather than rejecting the
    // whole body. Pinned to the one status it issues, because "either accepted
    // or rejected" is satisfied by both a working whitelist and a broken one.
    expect(res.status).toBe(303);

    // Not one protected column moved.
    const after = readMember();
    expect(after.is_admin, 'is_admin unchanged').toBe(before.is_admin);
    expect(after.id, 'id unchanged').toBe(MEMBER_ID);
    expect(after.slug, 'slug unchanged').toBe(MEMBER_SLUG);
    expect(after.login_email, 'login_email unchanged').toBe(before.login_email);
    expect(after.login_email_normalized, 'login_email_normalized unchanged').toBe(before.login_email_normalized);
    expect(after.password_hash, 'password_hash unchanged').toBe(before.password_hash);
    expect(after.password_version, 'password_version unchanged').toBe(before.password_version);
    expect(after.email_verified_at, 'email_verified_at unchanged').toBe(before.email_verified_at);
    expect(after.email_status, 'email_status unchanged').toBe(before.email_status);

    // The crafted id/slug conjured no shadow account.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const hijacked = db
      .prepare("SELECT COUNT(*) AS n FROM members WHERE id = 'attacker-controlled-id' OR slug = 'hijacked_slug'")
      .get() as { n: number };
    db.close();
    expect(hijacked.n, 'no shadow account created').toBe(0);
  });
});

// ── Audit trail ───────────────────────────────────────────────────────────────

describe('profile update writes an audit row', () => {
  it('POST /members/:slug/edit appends member.profile_updated with field names (no PII values)', async () => {
    // Take the row this save adds rather than the newest one. The block above
    // saves the same member three times, and under a loaded parallel run this
    // assertion has read one of those instead of its own and failed on a field
    // list belonging to a different save. The helper also names it when a save
    // writes none or several, rather than letting that surface later as a
    // confusing field-list mismatch.
    const before = new BetterSqlite3(dbPath, { readonly: true });
    const beforeIds = snapshotIds(before, profileAudit);
    before.close();

    const res = await postEdit({ bio: 'Audited bio', city: 'Auditville', phone: '555-0000' });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = oneRowAddedSince<{
      action_type: string; category: string; actor_type: string;
      actor_member_id: string; entity_type: string; entity_id: string;
      metadata_json: string;
    }>(
      db,
      profileAudit,
      beforeIds,
    );
    db.close();

    expect(row).toBeDefined();
    expect(row!.category).toBe('membership');
    expect(row!.actor_type).toBe('member');
    expect(row!.actor_member_id).toBe(MEMBER_ID);
    expect(row!.entity_type).toBe('member');

    const meta = JSON.parse(row!.metadata_json) as { fields: string[] };
    expect(Array.isArray(meta.fields)).toBe(true);
    expect(meta.fields).toContain('bio');
    expect(meta.fields).toContain('city');
    // The audit metadata must NOT carry the new PII values.
    expect(row!.metadata_json).not.toContain('Audited bio');
    expect(row!.metadata_json).not.toContain('Auditville');
  });

  it('names only the fields the save actually changed', async () => {
    // The row exists to answer which field a member altered. Recording every
    // editable field on every save answers nothing, so a save that touches one
    // field must name that field alone.
    //
    // The baseline save is a precondition, so its result is asserted. Left
    // unchecked, a baseline that did not land makes the second save the first
    // real change, which then correctly names all three fields — and the test
    // fails on the field list rather than on the save that actually went wrong.
    const baseline = await postEdit({ bio: 'Baseline bio', city: 'Baseville', phone: '555-0001' });
    expect(baseline.status, 'the baseline save must land before the single-field save').toBe(303);

    // Take the row this save adds rather than ordering by timestamp. Both rows
    // can share a stamp, which leaves the tiebreak deciding which one the
    // assertion reads.
    const before = new BetterSqlite3(dbPath, { readonly: true });
    const beforeIds = snapshotIds(before, profileAudit);
    before.close();

    const res = await postEdit({ bio: 'Only the bio moved', city: 'Baseville', phone: '555-0001' });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = oneRowAddedSince<{ metadata_json: string }>(
      db,
      profileAudit,
      beforeIds,
    );
    db.close();

    const meta = JSON.parse(row.metadata_json) as { fields: string[] };
    expect(meta.fields).toEqual(['bio']);
  });
});

// ── A validation error must not cost the member the rest of the form ─────────

describe('validation re-render preserves the submitted values', () => {
  it('returns every other field the member typed when one link is invalid', async () => {
    const res = await postEdit({
      bio:      'Bio the member rewrote',
      city:     'Typedville',
      region:   'WA',
      phone:    '555-0123',
      link_label: 'My Site',
      link_url:   'not-a-valid-url',
    } as Record<string, string>);

    expect(res.status).toBe(422);
    // The message names the field that failed...
    expect(res.text.toLowerCase()).toContain('url');
    // ...and everything else comes back, rather than reverting to the stored row.
    expect(res.text).toContain('Bio the member rewrote');
    expect(res.text).toContain('Typedville');
    expect(res.text).toContain('555-0123');
    expect(res.text).toContain('My Site');
    expect(res.text).toContain('not-a-valid-url');
  });

  it('keeps the picked country and its state or province after a validation error', async () => {
    // The member picked Canada and Ontario; a refusal for another field must
    // leave exactly that entry selected, not the stored US state.
    const res = await postEdit({ country: 'Canada', region: 'CA-ON', whatsapp: 'not a phone number' });
    expect(res.status).toBe(422);
    const select = /<select id="region"[\s\S]*?<\/select>/.exec(res.text)?.[0] ?? '';
    const selected = select.match(/<option [^>]*selected[^>]*>/g) ?? [];
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain('value="CA-ON"');
  });
});

// ── WhatsApp is a phone number, and is published as a chat link ──────────────

describe('WhatsApp format', () => {
  it('refuses a value that is not a phone number', async () => {
    const res = await postEdit({ whatsapp: 'ping me on whatsapp' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('international phone number');
  });

  it('refuses a number too short to dial internationally', async () => {
    const res = await postEdit({ whatsapp: '12345' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('international phone number');
  });

  it('accepts an international number written with spaces and punctuation', async () => {
    const res = await postEdit({ whatsapp: '+1 (555) 010-0200' });
    expect(res.status).toBe(303);
  });
});

// ── A save submitted twice ────────────────────────────────────────────────────

describe('profile save submitted twice', () => {
  // A member of their own, holding a stored link, so the counts below belong to
  // this case. A ceiling of two edits an hour makes a spent slot visible: the
  // first save takes one, so exactly one more save is allowed after it.
  const TWICE_ID = 'edit-val-twice';
  const TWICE_SLUG = 'edit_val_twice';
  const LINK_URL = 'https://93.184.216.34/';
  const form = {
    bio: 'Saved once', city: 'Portland', region: 'OR', country: 'USA',
    birthDay: '14', birthMonth: '3', birthYear: '1978',
    phone: '555-0101', emailVisibility: 'members',
    link_label: 'Homepage', link_url: LINK_URL,
  };

  function twiceState(): { version: number; linkIds: string[]; audits: number } {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const version = (db.prepare('SELECT version FROM members WHERE id = ?').get(TWICE_ID) as { version: number }).version;
    const linkIds = (db.prepare('SELECT id FROM member_links WHERE member_id = ?').all(TWICE_ID) as Array<{ id: string }>)
      .map((r) => r.id).sort();
    const audits = (db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'member.profile_updated' AND entity_id = ?`,
    ).get(TWICE_ID) as { n: number }).n;
    db.close();
    return { version, linkIds, audits };
  }

  function postTwice(fields: Record<string, string>): Test {
    return request(createApp())
      .post(`/members/${TWICE_SLUG}/edit`)
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: TWICE_ID })}`)
      .type('form')
      .send(fields);
  }

  beforeAll(async () => {
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id: TWICE_ID, slug: TWICE_SLUG, display_name: 'Twice Saver', login_email: 'twice@example.com' });
    insertMemberLink(db, TWICE_ID, { label: 'Homepage', url: LINK_URL, sort_order: 0 });
    insertSystemConfig(db, { config_key: 'profile_edit_rate_limit_per_hour', value_json: '2' });
    db.close();
    const onboarding = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
    onboarding.completeTask(TWICE_ID, 'personal_details');
    onboarding.completeTask(TWICE_ID, 'legacy_claim');
    onboarding.completeTask(TWICE_ID, 'club_affiliations');
  });

  // Defect caught: a double click or back-button re-post of the profile form
  // bumps the member's version, rewrites their links, writes a second audit
  // row or uses up one of their hourly edits, or reports something other than
  // the first save's success.
  it('the repeat reports the same success and writes, records and counts nothing', async () => {
    const first = await postTwice(form);
    expect(first.status).toBe(303);
    const afterFirst = twiceState();
    expect(afterFirst.linkIds).toHaveLength(1);

    const repeat = await postTwice(form);
    expect(repeat.status).toBe(303);
    expect(repeat.headers.location).toBe(first.headers.location);
    const flash = (repeat.get('Set-Cookie') ?? []).find((c) => c.startsWith('footbag_flash=') && !c.startsWith('footbag_flash=;'));
    expect(flash).toBeDefined();
    const landed = await request(createApp())
      .get(repeat.headers.location)
      .set('Cookie', [`__Host-footbag_session=${createTestSessionJwt({ memberId: TWICE_ID })}`, flash!.split(';')[0]].join('; '));
    expect(landed.status).toBe(200);
    expect(landed.text).toContain('Profile updated.');

    expect(twiceState()).toEqual(afterFirst);

    // The repeat took no slot: with the first save holding one of two, a
    // genuine change is still allowed.
    const changed = await postTwice({ ...form, bio: 'Saved twice, changed once' });
    expect(changed.status).toBe(303);
    expect(twiceState().version).toBe(afterFirst.version + 1);
  });

  // Defect caught: a save that changes a link and another field together is
  // charged twice, once before the link check and once before the write, so a
  // member runs out of edits at half the advertised rate.
  it('a save changing a link and another field together spends one edit', async () => {
    const both = await postTwice({ ...form, bio: 'Link and bio', link_url: 'https://198.51.100.7/' });
    expect(both.status).toBe(303);
    const next = await postTwice({ ...form, bio: 'One more change', link_url: 'https://198.51.100.7/' });
    expect(next.status).toBe(303);
  });

  // Defect caught: a member who used their last edit and re-posts the same
  // form is refused as rate-limited for a save that went through, instead of
  // being shown its success; while a genuine change past the limit is still
  // refused.
  it('a repeat after the last edit reports success, and a new change is still refused', async () => {
    const last = { ...form, bio: 'The last edit this hour' };
    expect((await postTwice({ ...form, bio: 'First edit this hour' })).status).toBe(303);
    expect((await postTwice(last)).status).toBe(303);
    const afterLast = twiceState();

    const repeat = await postTwice(last);
    expect(repeat.status).toBe(303);
    expect(twiceState()).toEqual(afterLast);

    const another = await postTwice({ ...form, bio: 'One edit too many' });
    expect(another.status).toBe(429);
    expect(twiceState()).toEqual(afterLast);
  });
});

// ── Typed text is cleaned before it is checked and stored ─────────────────────

describe('profile text is cleaned at write time', () => {
  // A member of their own, so the version and audit counts below belong to
  // these cases alone.
  const CLEAN_ID = 'edit-val-clean';
  const CLEAN_SLUG = 'edit_val_clean';
  const LINK_URL = 'https://93.184.216.34/';
  const cleanForm = {
    bio: 'First para\n\nSecond para', city: 'Old Town', region: 'OR', country: 'USA',
    birthDay: '14', birthMonth: '3', birthYear: '1978',
    phone: '555-0101', emailVisibility: 'members',
    link_label: 'My site', link_url: LINK_URL,
  };

  function postClean(fields: Record<string, string>): Test {
    return request(createApp())
      .post(`/members/${CLEAN_SLUG}/edit`)
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: CLEAN_ID })}`)
      .type('form')
      .send({ ...cleanForm, ...fields });
  }

  function cleanRow(): { version: number; bio: string; city: string; region: string; phone: string | null; whatsapp: string | null } {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT version, bio, city, region, phone, whatsapp FROM members WHERE id = ?')
      .get(CLEAN_ID) as ReturnType<typeof cleanRow>;
    db.close();
    return row;
  }

  function cleanAudits(): number {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const n = (db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'member.profile_updated' AND entity_id = ?`,
    ).get(CLEAN_ID) as { n: number }).n;
    db.close();
    return n;
  }

  beforeAll(async () => {
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id: CLEAN_ID, slug: CLEAN_SLUG, display_name: 'Clean Saver', login_email: 'clean@example.com' });
    db.close();
    const onboarding = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
    onboarding.completeTask(CLEAN_ID, 'personal_details');
    onboarding.completeTask(CLEAN_ID, 'legacy_claim');
    onboarding.completeTask(CLEAN_ID, 'club_affiliations');
  });

  // Defect caught: a field the member typed is stored with markup, a C1
  // control character, Windows line endings or a decomposed accent, so the
  // same words compare unequal and every reader of the row inherits the junk;
  // or the bio loses the paragraph break the member meant.
  it('stores bio, city, phone and WhatsApp as the cleaner leaves them', async () => {
    const res = await postClean({
      bio:      `Line one\r\n\r\n\r\nLine <b>two</b>\u0085 caf${DECOMPOSED_E_ACUTE}`,
      city:     `Montr${DECOMPOSED_E_ACUTE}al <i>Nord</i>`,
      phone:    '555\u0085-<b>0102</b>',
      whatsapp: '+1 555 <b>0100</b>',
    });
    expect(res.status).toBe(303);
    const row = cleanRow();
    expect(row.bio).toBe(`Line one\n\nLine two caf${COMPOSED_E_ACUTE}`);
    expect(row.city).toBe(`Montr${COMPOSED_E_ACUTE}al Nord`);
    expect(row.phone).toBe('555-0102');
    expect(row.whatsapp).toBe('+1 555 0100');
  });

  // Defect caught: a city that was only markup passes the required check
  // because the check reads the raw text, and the profile is saved with an
  // empty city.
  it('refuses a city that is only markup and writes nothing', async () => {
    const before = cleanRow();
    const res = await postClean({ city: '<b></b>' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('City is required.');
    expect(cleanRow()).toEqual(before);
  });

  // The administrator's correction form allows 40 characters for phone and
  // WhatsApp, so that is the real ceiling the server holds as well.
  // Defect caught: a phone longer than any form allows is stored, or the
  // limit counts markup the cleaner removes and refuses a value that fits.
  it('holds phone and WhatsApp to 40 characters, counted after cleaning', async () => {
    const fits = await postClean({ phone: `${'5'.repeat(40)}<b></b>` });
    expect(fits.status).toBe(303);
    expect(cleanRow().phone).toBe('5'.repeat(40));

    const before = cleanRow();
    const longPhone = await postClean({ phone: '5'.repeat(41) });
    expect(longPhone.status).toBe(422);
    expect(longPhone.text).toContain('Phone must be 40 characters or fewer.');

    const longWhatsapp = await postClean({ whatsapp: `+1 555 0100${'-'.repeat(30)}` });
    expect(longWhatsapp.status).toBe(422);
    expect(longWhatsapp.text).toContain('WhatsApp must be 40 characters or fewer.');
    expect(cleanRow()).toEqual(before);
  });

  // Defect caught: a member whose bio, city or link label was saved before
  // cleaning existed resubmits the form untouched, and the save compares the
  // cleaned input with the raw stored value, so it reports changes nobody made
  // and writes an audit row for them, or re-verifies a link they did not touch.
  // The stored link's address is one verification now refuses (a private
  // network address), so a re-verification shows as a refusal.
  it('an untouched resubmission of values saved before cleaning records no change', async () => {
    expect((await postClean({})).status).toBe(303);
    const dirtyBio = 'First para\r\n\r\nSecond <b>para</b>';
    const dirtyCity = 'Old <i>Town</i>';
    const dirtyLabel = 'My <b>site</b>';
    const storedUrl = 'https://10.0.0.5/';
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET bio = ?, city = ? WHERE id = ?').run(dirtyBio, dirtyCity, CLEAN_ID);
    db.prepare('UPDATE member_links SET label = ?, url = ? WHERE member_id = ?').run(dirtyLabel, storedUrl, CLEAN_ID);
    db.close();
    const before = cleanRow();
    const audits = cleanAudits();

    const res = await postClean({ bio: dirtyBio, city: dirtyCity, link_label: dirtyLabel, link_url: storedUrl });
    expect(res.status).toBe(303);
    expect(cleanAudits()).toBe(audits);
    expect(cleanRow()).toEqual(before);
  });
});
