/**
 * Anti-enumeration under the live SES adapter (production transport).
 *
 * The password-reset and verify-resend sent pages render no simulated-email
 * card under the live adapter, so their responses are byte-identical whether or
 * not the submitted address matches an account. This is the production
 * anti-enumeration guarantee; the dev/staging stub adapter intentionally shows
 * the card (and therefore differs), so that property is verified here, with the
 * card's adapter gate off, rather than in the stub-mode suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3089');

process.env.SES_ADAPTER       = 'live';
process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
process.env.AWS_REGION        = 'us-east-1';

let createApp: Awaited<ReturnType<typeof importApp>>;

const KNOWN_EMAIL      = 'known-prod@example.com';
const UNKNOWN_EMAIL    = 'nobody-prod@example.com';
const UNVERIFIED_EMAIL = 'unverified-prod@example.com';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const hash = await hashTestPassword('KnownPass1!');
  insertMember(db, {
    id: 'anti-enum-prod-known', slug: 'known_prod', login_email: KNOWN_EMAIL,
    display_name: 'Known Prod', password_hash: hash,
  });
  insertMember(db, {
    id: 'anti-enum-prod-unverified', slug: 'unverified_prod', login_email: UNVERIFIED_EMAIL,
    display_name: 'Unverified Prod', password_hash: hash, email_verified_at: null,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** Strip volatile input values (CSRF tokens, refills) and collapse whitespace;
 *  two anti-enumeration responses must match under this normalization. */
function normalize(text: string): string {
  return text
    .replace(/value="[^"]*"/g, 'value="REDACTED"')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('POST /password/forgot — production byte-identity for exists vs not-exists', () => {
  it('known and unknown addresses produce an identical normalized body', async () => {
    const app = createApp();
    const known = await request(app).post('/password/forgot').type('form').send({ email: KNOWN_EMAIL });
    const unknown = await request(app).post('/password/forgot').type('form').send({ email: UNKNOWN_EMAIL });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(normalize(known.text)).toBe(normalize(unknown.text));
    // No reset link ever reaches a live visitor.
    expect(known.text).not.toMatch(/\/password\/reset\/[A-Za-z0-9_-]+/);
  });
});

describe('POST /verify/resend — production byte-identity for unverified/verified/unknown', () => {
  it('all three cases produce an identical normalized body', async () => {
    const app = createApp();
    const unverified = await request(app).post('/verify/resend').type('form').send({ email: UNVERIFIED_EMAIL });
    const verified = await request(app).post('/verify/resend').type('form').send({ email: KNOWN_EMAIL });
    const unknown = await request(app).post('/verify/resend').type('form').send({ email: UNKNOWN_EMAIL });
    expect(unverified.status).toBe(200);
    expect(normalize(unverified.text)).toBe(normalize(verified.text));
    expect(normalize(unverified.text)).toBe(normalize(unknown.text));
    expect(unverified.text).not.toMatch(/\/verify\/[A-Za-z0-9_-]+">CLICK THIS LINK</);
  });
});
