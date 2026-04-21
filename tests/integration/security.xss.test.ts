/**
 * Adversarial tests: XSS attempts against fields that render in Handlebars
 * templates.
 *
 * Per `.claude/rules/testing.md` §Adversarial testing: "XSS attempts in every
 * field that lands in a Handlebars template."
 *
 * Assertion shape: for every payload, the response body must contain the
 * escaped form (`&lt;script&gt;`, `&quot;`, etc.) and must NOT contain the
 * raw tag that would execute in a browser. Handlebars `{{field}}` escapes by
 * default; these tests pin that the project's templates never bypass it for
 * user-controlled fields.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3081');

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID       = 'xss-member-001';
const MEMBER_SLUG     = 'xss_member';
const MEMBER_EMAIL    = 'xss@example.com';
const MEMBER_PASSWORD = 'OrigPass!1';

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror="alert(1)">',
  '"><script>alert(1)</script>',
  '<svg onload="alert(1)">',
  'javascript:alert(1)',
  '<iframe src="javascript:alert(1)"></iframe>',
];

// Substrings that, if present verbatim in response HTML, prove the payload
// would execute in a browser. Any of these as a match = failed escape.
const EXECUTABLE_FRAGMENTS = [
  '<script>alert(1)</script>',
  'onerror="alert(1)"',
  'onload="alert(1)"',
  '<iframe src="javascript:alert(1)"',
];

function ownCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    login_email: MEMBER_EMAIL,
    display_name: 'Xss Member',
    password_hash: await argon2.hash(MEMBER_PASSWORD),
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ── Bio field renders on the profile edit form ────────────────────────────────

describe('Bio field — XSS payloads escape on render', () => {
  for (const payload of XSS_PAYLOADS) {
    it(`escapes: ${payload.slice(0, 32)}...`, async () => {
      // Save the payload as bio.
      const app = createApp();
      const saveRes = await request(app)
        .post(`/members/${MEMBER_SLUG}/edit`)
        .set('Cookie', ownCookie())
        .type('form')
        .send({
          bio: payload,
          firstCompetitionYear: '',
          showCompetitiveResults: 'on',
        });
      expect(saveRes.status).toBeLessThan(500);

      // Fetch the profile edit form to see how the bio renders.
      const viewRes = await request(app)
        .get(`/members/${MEMBER_SLUG}/edit`)
        .set('Cookie', ownCookie());
      expect(viewRes.status).toBe(200);

      // No executable fragment appears in the response body.
      for (const fragment of EXECUTABLE_FRAGMENTS) {
        expect(viewRes.text).not.toContain(fragment);
      }

      // The raw `<` from the payload must have been escaped somewhere in the
      // rendered HTML. `&lt;` is the canonical escape; `&amp;lt;` would mean
      // double-escaping (acceptable but suspicious). Either proves Handlebars
      // escaped it.
      if (payload.includes('<')) {
        expect(
          viewRes.text.includes('&lt;') || viewRes.text.includes('&amp;lt;'),
        ).toBe(true);
      }
    });
  }
});

// ── Search query renders in the member-search results ─────────────────────────

describe('Member search ?q=... — XSS payloads escape on render', () => {
  for (const payload of XSS_PAYLOADS) {
    it(`escapes: ${payload.slice(0, 32)}...`, async () => {
      const res = await request(createApp())
        .get(`/members?q=${encodeURIComponent(payload)}`)
        .set('Cookie', ownCookie());
      expect(res.status).toBeLessThan(500);

      for (const fragment of EXECUTABLE_FRAGMENTS) {
        expect(res.text).not.toContain(fragment);
      }
    });
  }
});

// ── Register form re-renders user input on validation error ───────────────────
//
// When registration fails validation (e.g. mismatched passwords), the form
// is re-rendered with the submitted realName / displayName / email so the
// user doesn't retype. That render path is an XSS target.

describe('Register form re-render — XSS payloads escape on validation error', () => {
  for (const payload of XSS_PAYLOADS) {
    it(`escapes realName: ${payload.slice(0, 32)}...`, async () => {
      const res = await request(createApp())
        .post('/register')
        .type('form')
        .send({
          realName: payload,
          displayName: 'Legit Name',
          email: 'newbie@example.com',
          password: 'ValidPass1!',
          confirmPassword: 'mismatch',
        });
      expect(res.status).toBeLessThan(500);
      for (const fragment of EXECUTABLE_FRAGMENTS) {
        expect(res.text).not.toContain(fragment);
      }
    });
  }
});
