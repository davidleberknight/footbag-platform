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

function ownCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
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
});

afterAll(() => cleanupTestDb(dbPath));

// City and country are mandatory profile fields, and the edit form pre-fills
// them from the stored values, so a genuine save always carries them. These
// cases exercise other fields, so the helper supplies valid city/country by
// default; a case that needs to blank them overrides the default explicitly.
function postEdit(fields: Record<string, string>): request.Test {
  return request(createApp())
    .post(`/members/${MEMBER_SLUG}/edit`)
    .set('Cookie', ownCookie())
    .type('form')
    .send({ city: 'Portland', country: 'USA', ...fields });
}

// ── Legacy-claim anchors removed from Edit Profile ───────────────────────────

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
  it('year below 1972 is silently discarded (set to NULL)', async () => {
    const res = await postEdit({ firstCompetitionYear: '1960' });
    expect(res.status).toBe(303);
    const row = readMember();
    expect(row.first_competition_year).toBeNull();
  });

  it('year above current year is silently discarded', async () => {
    const res = await postEdit({ firstCompetitionYear: '2099' });
    expect(res.status).toBe(303);
    const row = readMember();
    expect(row.first_competition_year).toBeNull();
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

  it('non-numeric string is discarded (set to NULL)', async () => {
    const res = await postEdit({ firstCompetitionYear: 'abc' });
    expect(res.status).toBe(303);
    const row = readMember();
    expect(row.first_competition_year).toBeNull();
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
    expect(row.country).toBe('USA');
  });

  it('rejects a submission that blanks only the country', async () => {
    await postEdit({ city: 'Portland', country: 'USA' });
    const res = await postEdit({ city: 'Seattle', country: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Country is required');
    const row = readMember();
    // The rejected save leaves the earlier complete profile untouched.
    expect(row.city).toBe('Portland');
    expect(row.country).toBe('USA');
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

// ── Audit trail ───────────────────────────────────────────────────────────────

describe('profile update writes an audit row', () => {
  it('POST /members/:slug/edit appends member.profile_updated with field names (no PII values)', async () => {
    const res = await postEdit({ bio: 'Audited bio', city: 'Auditville', phone: '555-0000' });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT action_type, category, actor_type, actor_member_id, entity_type, entity_id, metadata_json
         FROM audit_entries
        WHERE action_type = 'member.profile_updated' AND entity_id = ?
        ORDER BY created_at DESC LIMIT 1`,
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
});
