/**
 * Archive signed-cookie session contract, exercised where a deployment
 * configures an archive cookie signer: every session-cookie issue also sets
 * the three CloudFront-* cookies scoped by the configured parent domain with
 * the session cookie's lifetime, and logout clears all four with matching
 * attributes, so signing out revokes archive access along with the session.
 * This file boots with the signer on; the signer-off default (session cookie
 * only) is pinned alongside the other session assertions in
 * session-refresh.routes.test.ts and app.routes.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('4038');

const signingKeyPath = path.join(
  os.tmpdir(),
  `footbag-test-archive-signing-${process.pid}.pem`,
);
process.env.ARCHIVE_URL = 'https://archive.example.test';
process.env.ARCHIVE_COOKIE_SIGNER = 'local';
process.env.ARCHIVE_SIGNING_KEY_PATH = signingKeyPath;
process.env.ARCHIVE_COOKIE_DOMAIN = '.example.test';

const ARCHIVE_COOKIE_NAMES = [
  'CloudFront-Policy',
  'CloudFront-Signature',
  'CloudFront-Key-Pair-Id',
];

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db: BetterSqlite3.Database = createTestDb(dbPath);
  insertMember(db, {
    id: 'mem-arch-cookie', slug: 'mem_arch_cookie', login_email: 'archcookie@example.com',
    real_name: 'Archive Cookie Tester', display_name: 'Archive Cookie Tester',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  fs.rmSync(signingKeyPath, { force: true });
});

function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
}

describe('session issue with an archive cookie signer configured', () => {
  it('the sliding refresh sets the session cookie plus all three archive cookies', async () => {
    // One-hour TTL: inside the refresh window from the first second.
    const nearExpiry = createTestSessionJwt({ memberId: 'mem-arch-cookie', ttlSeconds: 60 * 60 });
    const res = await request(createApp())
      .get('/members/mem_arch_cookie')
      .set('Cookie', `__Host-footbag_session=${nearExpiry}`);
    expect(res.status).toBe(200);
    const cookies = setCookies(res);
    expect(cookies.filter((c) => c.startsWith('__Host-footbag_session='))).toHaveLength(1);
    for (const name of ARCHIVE_COOKIE_NAMES) {
      const cookie = cookies.find((c) => c.startsWith(`${name}=`));
      expect(cookie, name).toBeDefined();
      expect(cookie).toContain('Domain=.example.test');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toMatch(/Max-Age=86400/);
    }
    // The session cookie itself stays host-only: no Domain attribute.
    const session = cookies.find((c) => c.startsWith('__Host-footbag_session='))!;
    expect(session).not.toContain('Domain=');
  });

  it('the policy cookie decodes to exactly the archive wildcard resource', async () => {
    const nearExpiry = createTestSessionJwt({ memberId: 'mem-arch-cookie', ttlSeconds: 60 * 60 });
    const res = await request(createApp())
      .get('/members/mem_arch_cookie')
      .set('Cookie', `__Host-footbag_session=${nearExpiry}`);
    const policyCookie = setCookies(res).find((c) => c.startsWith('CloudFront-Policy='))!;
    const value = policyCookie.split(';')[0].split('=').slice(1).join('=');
    const base64 = value.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/');
    const policy = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    expect(policy.Statement).toHaveLength(1);
    expect(policy.Statement[0].Resource).toBe('https://archive.example.test/*');
    expect(policy.Statement[0].Condition.DateLessThan['AWS:EpochTime']).toBeGreaterThan(
      Math.floor(Date.now() / 1000),
    );
  });

  it('a fresh token outside the refresh window issues no cookies at all', async () => {
    const fresh = createTestSessionJwt({ memberId: 'mem-arch-cookie', ttlSeconds: 24 * 60 * 60 });
    const res = await request(createApp())
      .get('/members/mem_arch_cookie')
      .set('Cookie', `__Host-footbag_session=${fresh}`);
    expect(res.status).toBe(200);
    const cookies = setCookies(res);
    expect(cookies.filter((c) => c.startsWith('__Host-footbag_session='))).toHaveLength(0);
    for (const name of ARCHIVE_COOKIE_NAMES) {
      expect(cookies.find((c) => c.startsWith(`${name}=`)), name).toBeUndefined();
    }
  });

  it('logout clears all four cookies with matching attributes', async () => {
    const jwt = createTestSessionJwt({ memberId: 'mem-arch-cookie', ttlSeconds: 24 * 60 * 60 });
    const res = await request(createApp())
      .post('/logout')
      .set('Cookie', `__Host-footbag_session=${jwt}`);
    expect(res.status).toBe(303);
    const cookies = setCookies(res);
    const session = cookies.find((c) => c.startsWith('__Host-footbag_session='));
    expect(session).toBeDefined();
    expect(session).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    for (const name of ARCHIVE_COOKIE_NAMES) {
      const cookie = cookies.find((c) => c.startsWith(`${name}=`));
      expect(cookie, name).toBeDefined();
      expect(cookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
      // A clear whose Domain does not match the set is ignored by strict
      // browsers, which would leave working archive access behind.
      expect(cookie).toContain('Domain=.example.test');
    }
  });
});
