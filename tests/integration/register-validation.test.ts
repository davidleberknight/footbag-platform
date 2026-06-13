/**
 * Registration validation boundaries that the happy-path and short-password
 * cases in register.routes.test.ts do not cover.
 *
 * Intent (M_Register): a password outside the allowed length is rejected before
 * any account is created, and every member receives a unique slug even when the
 * display name contains no slug-able ASCII (a non-Latin name must still onboard
 * with a stable, unique identifier rather than an empty or colliding slug).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import originRequest from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3421');

let createApp: Awaited<ReturnType<typeof importApp>>;

function register(body: Record<string, string>) {
  return originRequest(createApp()).post('/register').send(body);
}

function slugForEmail(email: string): string | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const row = db
      .prepare('SELECT slug FROM members WHERE login_email = ?')
      .get(email.toLowerCase().trim()) as { slug: string | null } | undefined;
    return row?.slug ?? undefined;
  } finally {
    db.close();
  }
}

function sexForEmail(email: string): string | null | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const row = db
      .prepare('SELECT sex FROM members WHERE login_email = ?')
      .get(email.toLowerCase().trim()) as { sex: string | null } | undefined;
    return row ? row.sex : undefined;
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('registration validation boundaries', () => {
  it('rejects a password longer than the maximum and creates no account', async () => {
    const email = 'toolong@example.com';
    const res = await register({
      realName: 'Max Length',
      displayName: 'Max Length',
      slug: '',
      email,
      password: 'a'.repeat(129),
      confirmPassword: 'a'.repeat(129),
      sex: 'male',
    });
    expect(res.status, 'over-long password rejected').toBe(422);
    expect(res.text, 'error names the length limit').toMatch(/128|at most/i);
    expect(slugForEmail(email), 'no member row was created').toBeUndefined();
  });

  it('issues a unique fallback slug when the display name has no slug-able ASCII', async () => {
    const email = 'nonascii@example.com';
    const res = await register({
      // Real name and display name match (no slug-able ASCII), so the surname
      // rule is skipped and the empty-slug fallback path is what onboards them.
      realName: '你好 世界',
      displayName: '你好 世界',
      slug: '',
      email,
      password: 'a-valid-password',
      confirmPassword: 'a-valid-password',
      sex: 'male',
    });
    expect(res.status, 'non-ASCII registration succeeds').toBe(303);
    const slug = slugForEmail(email);
    expect(slug, 'a fallback slug was generated').toBeDefined();
    expect(slug, 'fallback slug is the unique member_<hex> form').toMatch(/^member_[0-9a-f]{8}$/);
  });
});

describe('registration sex field (competition eligibility)', () => {
  it('rejects registration with no sex selected and creates no account', async () => {
    const email = 'nosex@example.com';
    const res = await register({
      realName: 'Nosex Player',
      displayName: 'Nosex Player',
      slug: '',
      email,
      password: 'a-valid-password',
      confirmPassword: 'a-valid-password',
      sex: '',
    });
    expect(res.status, 'missing sex rejected').toBe(422);
    expect(res.text, 'error names the sex selection').toMatch(/sex/i);
    expect(slugForEmail(email), 'no member row was created').toBeUndefined();
  });

  it('rejects an out-of-domain sex value and creates no account', async () => {
    const email = 'badsex@example.com';
    const res = await register({
      realName: 'Badsex Player',
      displayName: 'Badsex Player',
      slug: '',
      email,
      password: 'a-valid-password',
      confirmPassword: 'a-valid-password',
      sex: 'other',
    });
    expect(res.status, 'unrecognized sex rejected').toBe(422);
    expect(slugForEmail(email), 'no member row was created').toBeUndefined();
  });

  it('stores the selected sex value on the new member', async () => {
    const email = 'undisclosed@example.com';
    const res = await register({
      realName: 'Quiet Player',
      displayName: 'Quiet Player',
      slug: '',
      email,
      password: 'a-valid-password',
      confirmPassword: 'a-valid-password',
      sex: 'undisclosed',
    });
    expect(res.status, 'valid registration succeeds').toBe(303);
    expect(sexForEmail(email), 'submitted sex is persisted').toBe('undisclosed');
  });
});
