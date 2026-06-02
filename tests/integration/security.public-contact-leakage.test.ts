/**
 * Public surfaces never expose member contact fields. Anonymous responses to
 * public GET routes must not contain a member's email or phone value, and must
 * not contain any email/phone-shaped string beyond a small allowlist of
 * non-PII historical citations. Asserts the staging-safe pentest contract for
 * the public-PII boundary: contact information is never a public default.
 *
 * Two layers:
 *  - Sentinel hard-gate: a seeded member carries distinctive email/phone values
 *    that could only appear in a body via a leak; assert they never do.
 *  - Regex sweep: assert no un-allowlisted email/phone-shaped strings render,
 *    catching leakage of contact data the sentinel member does not model.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertClub, insertEvent } from '../fixtures/factories';

const { dbPath } = setTestEnv('3099');

const SENTINEL_EMAIL = 'leak-canary@probe.invalid';
const SENTINEL_PHONE = '+1-555-0100';

// Always-public landing/index surfaces rendered to anonymous visitors.
// Param-heavy and data-dependent surfaces (media galleries, net brackets,
// per-record detail pages) carry their own route-level tests; this probe
// sweeps the routes that render for any visitor without per-row context.
const PUBLIC_ROUTES = [
  '/',
  '/clubs',
  '/members',
  '/events',
  '/hof',
  '/bap',
  '/rules',
  '/legal',
  '/freestyle/glossary',
];

// Email-shaped strings that legitimately appear on a public page and are NOT
// member contact fields. These are organizational/archival footbag.org
// addresses, deliberately published in service-shaped copy:
//   - footbag@footbag.org  -- 1995 mailing-list address cited in the
//     Jobs-notation history on /freestyle/glossary (archival, in a <code>).
//   - announce@footbag.org -- IFPA community-announcements address shown in
//     member-benefit copy (/members).
//   - admin@footbag.org    -- IFPA legal/privacy/admin contact shown on /legal.
// A member or person contact field appearing here would still fail the sweep;
// only these org/archival addresses are exempt.
const EMAIL_ALLOWLIST = [
  'footbag@footbag.org',
  'announce@footbag.org',
  'admin@footbag.org',
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /\+?\d{1,3}[-.\s]\d{3}[-.\s]\d{4}\b/g;

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const memberId = insertMember(db, {
    login_email: SENTINEL_EMAIL,
    real_name: 'Canary Member',
    searchable: 1,
  });
  // insertMember does not expose `phone`; set the sentinel directly. phone is
  // outside the credential-state CHECK constraints, so this update is safe.
  db.prepare('UPDATE members SET phone = ? WHERE id = ?').run(SENTINEL_PHONE, memberId);
  // Seed one club and one published event so the index routes render content
  // rather than empty-state placeholders.
  insertClub(db);
  insertEvent(db, { status: 'published' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Public surfaces -- no member contact fields in response body', () => {
  it.each(PUBLIC_ROUTES)('sentinel email/phone never leak on %s', async (route) => {
    const app = createApp();
    const res = await request(app).get(route);
    expect(res.status).toBeLessThan(500);
    expect(res.text).not.toContain(SENTINEL_EMAIL);
    expect(res.text).not.toContain(SENTINEL_PHONE);
  });

  it.each(PUBLIC_ROUTES)('no un-allowlisted email/phone-shaped strings on %s', async (route) => {
    const app = createApp();
    const res = await request(app).get(route);
    expect(res.status).toBeLessThan(500);

    const emails = (res.text.match(EMAIL_RE) ?? []).filter(
      (e) => !EMAIL_ALLOWLIST.includes(e.toLowerCase()),
    );
    expect(emails, `unexpected email-shaped strings on ${route}`).toEqual([]);

    const phones = res.text.match(PHONE_RE) ?? [];
    expect(phones, `unexpected phone-shaped strings on ${route}`).toEqual([]);
  });
});
