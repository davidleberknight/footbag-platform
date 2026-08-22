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
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3062');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID   = 'edit-val-001';
const MEMBER_SLUG = 'edit_validator';
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
  onboarding.startTaskList(MEMBER_ID);
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
function postEdit(fields: Record<string, string>): request.Test {
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

describe('region must be an official state or province code', () => {
  function storedRegion(): string | null {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT region FROM members WHERE slug = ?').get(MEMBER_SLUG) as
      | { region: string | null }
      | undefined;
    db.close();
    return row?.region ?? null;
  }

  it('refuses a full state name', async () => {
    const res = await postEdit({ region: 'Oregon' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('official two-letter state or province code');
  });

  it('refuses a code that is not a real state', async () => {
    const res = await postEdit({ region: 'ZZ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('official two-letter state or province code');
  });

  it('refuses a full province name for Canada', async () => {
    const res = await postEdit({ region: 'Ontario', country: 'Canada' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('official two-letter state or province code');
  });

  it('accepts a Canadian province code', async () => {
    const res = await postEdit({ region: 'ON', country: 'Canada' });
    expect(res.status).toBe(303);
    expect(storedRegion()).toBe('ON');
  });

  it('accepts a code in any casing and stores the canonical form', async () => {
    // One place must reach the database under one spelling: this column feeds
    // the official roster export, which cannot reconcile variants afterwards.
    const res = await postEdit({ region: 'or' });
    expect(res.status).toBe(303);
    expect(storedRegion()).toBe('OR');
  });

  it('leaves the region free text for a country with no official set', async () => {
    const res = await postEdit({ region: 'Canterbury', country: 'New Zealand' });
    expect(res.status).toBe(303);
    expect(storedRegion()).toBe('Canterbury');
  });
});

// ── Legacy-claim anchors removed from Edit Profile ───────────────────────────

describe('Edit Profile offers the claim task while a linkage is missing', () => {
  it('shows the claim call-to-action to a member holding neither identity link', async () => {
    // The claim task is the only claim and anchor surface, so this link is how
    // a member who finished onboarding without claiming reaches it later.
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/edit`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('/register/wizard/legacy_claim');
    expect(res.text).toContain('Link your legacy account, results, and clubs');
  });

  it('hides it once the member holds both identity links', async () => {
    const res = await request(createApp())
      .get(`/members/${LINKED_SLUG}/edit`)
      .set('Cookie', linkedCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('/register/wizard/legacy_claim');
  });
});

describe('Edit Profile no longer hosts legacy-claim anchors', () => {
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
  // normalizeText only trims, so the interior control + homoglyph chars are
  // stored verbatim; the profile view double-stashes {{content.bio}} so the
  // script is HTML-escaped and never executes.
  it('stores control/homoglyph chars verbatim and HTML-escapes the bio on render', async () => {
    const bio = 'pa\u202Eyback\u200D \u0430dmin <script>alert(1)</script>';
    const res = await postEdit({ bio });
    expect(res.status).toBe(303);
    expect(readMember().bio).toBe(bio);

    const view = await request(createApp())
      .get(`/members/${MEMBER_SLUG}`)
      .set('Cookie', ownCookie());
    expect(view.status).toBe(200);
    // Script payload escaped, not live.
    expect(view.text).not.toContain('<script>alert(1)</script>');
    expect(view.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // Control + homoglyph chars survive into the rendered HTML verbatim.
    expect(view.text).toContain('\u202E');
    expect(view.text).toContain('\u0430');
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
    // The whitelisted field saves; the extras are ignored (a field-by-field
    // contract), so the request is not a server error.
    expect([303, 422]).toContain(res.status);

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
    const res = await postEdit({ bio: 'Audited bio', city: 'Auditville', phone: '555-0000' });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      // Earlier cases in this file save the same member, and audit timestamps
      // carry millisecond resolution, so two saves can tie. created_at alone
      // then orders non-deterministically and can return a prior save's row.
      // rowid rises with insertion, so it breaks the tie exactly; the audit id
      // is a random UUID and carries no ordering.
      `SELECT action_type, category, actor_type, actor_member_id, entity_type, entity_id, metadata_json
         FROM audit_entries
        WHERE action_type = 'member.profile_updated' AND entity_id = ?
        ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ).get(MEMBER_ID) as
      | {
          action_type: string; category: string; actor_type: string;
          actor_member_id: string; entity_type: string; entity_id: string;
          metadata_json: string;
        }
      | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row!.category).toBe('profile_change');
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

    // Pin the ledger position rather than ordering by timestamp. Both rows can
    // share a created_at second, which leaves the tiebreak deciding which row
    // the assertion reads.
    const before = new BetterSqlite3(dbPath, { readonly: true });
    const priorMax = (before.prepare(
      `SELECT COALESCE(MAX(rowid), 0) AS m FROM audit_entries
        WHERE action_type = 'member.profile_updated' AND entity_id = ?`,
    ).get(MEMBER_ID) as { m: number }).m;
    before.close();

    const res = await postEdit({ bio: 'Only the bio moved', city: 'Baseville', phone: '555-0001' });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const rows = db.prepare(
      `SELECT metadata_json FROM audit_entries
        WHERE action_type = 'member.profile_updated' AND entity_id = ? AND rowid > ?
        ORDER BY rowid`,
    ).all(MEMBER_ID, priorMax) as Array<{ metadata_json: string }>;
    db.close();

    // Exactly one row, so a save that wrote none or several is named as such.
    expect(rows).toHaveLength(1);
    const meta = JSON.parse(rows[0].metadata_json) as { fields: string[] };
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

  it('keeps the picked country and its region control after a validation error', async () => {
    const res = await postEdit({ country: 'Canada', region: 'ON', whatsapp: 'not a phone number' });
    expect(res.status).toBe(422);
    // Ontario is a Canadian province, so the region picker must have re-rendered
    // for Canada rather than for the stored country.
    expect(res.text).toContain('Ontario');
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
