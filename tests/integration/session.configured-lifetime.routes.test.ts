/**
 * The session lifetime is an administrator-configurable value, and every part of
 * a session grant has to take it from the same place.
 *
 * Three things expire together: the signed session token, the browser cookie
 * that carries it, and the signed archive cookies issued beside it. Archive
 * access is granted by the main-site session and is validated at the edge with
 * no database lookup, so an archive grant outliving the session would keep the
 * archive open to someone whose session had ended. This file boots with the
 * archive cookie signer configured so all three are observable in one response,
 * and pins them against a lifetime that is deliberately not the seeded default:
 * a hard-coded window passes a default-valued test whatever it reads.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertSystemConfig, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('4189');

const signingKeyPath = path.join(
  os.tmpdir(),
  `footbag-test-session-lifetime-${process.pid}.pem`,
);
process.env.ARCHIVE_URL = 'https://archive.example.test';
process.env.ARCHIVE_COOKIE_SIGNER = 'local';
process.env.ARCHIVE_SIGNING_KEY_PATH = signingKeyPath;
process.env.ARCHIVE_COOKIE_DOMAIN = '.example.test';

// Not the seeded 24, and not a value any constant in the tree happens to hold.
const CONFIGURED_HOURS = 3;
const CONFIGURED_SECONDS = CONFIGURED_HOURS * 60 * 60;

const ARCHIVE_COOKIE_NAMES = [
  'CloudFront-Policy',
  'CloudFront-Signature',
  'CloudFront-Key-Pair-Id',
];

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db: BetterSqlite3.Database = createTestDb(dbPath);
  insertMember(db, {
    id: 'mem-session-ttl', slug: 'mem_session_ttl', login_email: 'sessionttl@example.com',
    real_name: 'Session Lifetime Tester', display_name: 'Session Lifetime Tester',
  });
  insertSystemConfig(db, { config_key: 'jwt_expiry_hours', value_json: String(CONFIGURED_HOURS) });
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

/** The sliding refresh is what mints a session outside the login form, so it is
 *  the cheapest surface on which to observe a freshly issued grant. */
async function issueFreshSession(): Promise<string[]> {
  const nearExpiry = createTestSessionJwt({ memberId: 'mem-session-ttl', ttlSeconds: 60 * 60 });
  const res = await request(createApp())
    .get('/members/mem_session_ttl')
    .set('Cookie', `__Host-footbag_session=${nearExpiry}`);
  expect(res.status).toBe(200);
  const cookies = setCookies(res);
  expect(cookies.filter((c) => c.startsWith('__Host-footbag_session='))).toHaveLength(1);
  return cookies;
}

function claimsOf(sessionCookie: string): { iat: number; exp: number } {
  const jwt = sessionCookie.split(';')[0].split('=').slice(1).join('=');
  const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
}

describe('session lifetime from the configured value', () => {
  it('stamps the signed session token with the configured window', async () => {
    const cookies = await issueFreshSession();
    const session = cookies.find((c) => c.startsWith('__Host-footbag_session='))!;
    const { iat, exp } = claimsOf(session);
    expect(exp - iat).toBe(CONFIGURED_SECONDS);
  });

  it('gives the session cookie the same window as the token it carries', async () => {
    const cookies = await issueFreshSession();
    const session = cookies.find((c) => c.startsWith('__Host-footbag_session='))!;
    expect(session).toMatch(new RegExp(`;\\s*Max-Age=${CONFIGURED_SECONDS}\\b`, 'i'));
  });

  it('gives all three archive cookies the same window', async () => {
    const cookies = await issueFreshSession();
    for (const name of ARCHIVE_COOKIE_NAMES) {
      const cookie = cookies.find((c) => c.startsWith(`${name}=`));
      expect(cookie, name).toBeDefined();
      expect(cookie, name).toMatch(new RegExp(`;\\s*Max-Age=${CONFIGURED_SECONDS}\\b`, 'i'));
    }
  });

  it('expires the archive policy itself with the session rather than on its own schedule', async () => {
    // The Max-Age above governs only whether the browser keeps sending the
    // cookie. The policy inside it is what the edge enforces, so a policy that
    // outlived the session would still open the archive to a replayed cookie.
    const before = Math.floor(Date.now() / 1000);
    const cookies = await issueFreshSession();
    const after = Math.floor(Date.now() / 1000);
    const policyCookie = cookies.find((c) => c.startsWith('CloudFront-Policy='))!;
    const value = policyCookie.split(';')[0].split('=').slice(1).join('=');
    const base64 = value.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/');
    const policy = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    const expiry = policy.Statement[0].Condition.DateLessThan['AWS:EpochTime'];
    expect(expiry).toBeGreaterThanOrEqual(before + CONFIGURED_SECONDS);
    expect(expiry).toBeLessThanOrEqual(after + CONFIGURED_SECONDS);
  });
});
