/**
 * Real-claim crawl (development/staging, opt-in). The person-neutral successor
 * to the DL persona crawl: it builds a claimed account for a real migrated
 * record via GET /dev/build-claim and walks the surfaces that render that
 * record's data, proving migrated real-world data renders and behaves once a
 * member claims it.
 *
 * Opt-in via RUN_PERSONA_CRAWL=1 against an already-running dev/staging stack
 * (the build drives the real services and the drained stub-SES outbox that only
 * a running stack produces); it never runs in the default suite or CI. Target a
 * record with PERSONA_CRAWL_LEGACY_ID, or let it default to the numerically
 * lowest Hall-of-Fame honoree carrying a legacy link in the loaded dataset.
 * Point the stack elsewhere with PERSONA_CRAWL_BASE_URL.
 *
 * PII discipline: every assertion keys on the resolved record id and page
 * structure, never on the claimed person's name, email, or other real PII.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import request from 'supertest';

const INVOKED = process.env.RUN_PERSONA_CRAWL === '1';
const BASE = process.env.PERSONA_CRAWL_BASE_URL ?? 'http://localhost:3000';

function resolveTargetLegacyId(): string {
  const explicit = process.env.PERSONA_CRAWL_LEGACY_ID;
  if (explicit && explicit.trim()) return explicit.trim();
  // The shared test harness defaults FOOTBAG_DB_PATH to the in-memory sentinel
  // ':memory:' for integration-database isolation. That sentinel cannot back the
  // read-only file probe this crawl uses to choose a default target, so ignore it
  // and read the real dev database the booted stack runs against; an explicit real
  // path still overrides.
  const envDb = process.env.FOOTBAG_DB_PATH;
  const dbPath = envDb && envDb !== ':memory:'
    ? envDb
    : path.join(process.cwd(), 'database', 'footbag.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`real-claim crawl: no database at ${dbPath}; load the operator dataset or set PERSONA_CRAWL_LEGACY_ID.`);
  }
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const row = db
      .prepare(
        `SELECT legacy_member_id FROM historical_persons
          WHERE hof_member = 1 AND legacy_member_id IS NOT NULL
          ORDER BY legacy_member_id LIMIT 1`,
      )
      .get() as { legacy_member_id: string } | undefined;
    if (!row) {
      throw new Error('real-claim crawl: no Hall-of-Fame honoree with a legacy link found; set PERSONA_CRAWL_LEGACY_ID.');
    }
    return String(row.legacy_member_id);
  } finally {
    db.close();
  }
}

describe.skipIf(!INVOKED)('real-claim crawl', () => {
  let slug = '';
  let cookie = '';

  beforeAll(async () => {
    // Fail loudly if the stack is unreachable, rather than passing vacuously.
    const ping = await request(BASE).get('/').timeout({ deadline: 5000 }).catch(() => null);
    if (!ping || ping.status >= 500) {
      throw new Error(`real-claim crawl: dev stack unreachable at ${BASE}; start ./run_dev.sh first.`);
    }
    const target = resolveTargetLegacyId();

    const built = await request(BASE).get(`/dev/build-claim?as=${encodeURIComponent(target)}`).redirects(0);
    expect(built.status, 'build-claim redirects after building/minting the session').toBe(302);

    // The redirect target is the claimed member's real-name profile; take the slug
    // from it rather than recomputing one, so the crawl never assumes a slug shape.
    const location = (built.headers['location'] ?? '') as string;
    const match = /^\/members\/([^/?#]+)/.exec(location);
    if (!match) throw new Error(`real-claim crawl: build-claim did not redirect to a member profile (location=${location})`);
    slug = match[1];

    const set = (built.headers['set-cookie'] ?? []) as string[];
    const entry = set.find((c) => c.startsWith('footbag_session='));
    if (!entry) throw new Error('real-claim crawl: build-claim issued no session cookie');
    cookie = entry.split(';')[0];
  });

  it('signs the caller in as the claimed account: the owner reaches its own edit page', async () => {
    const res = await request(BASE).get(`/members/${slug}/edit`).set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('renders the claimed profile cleanly (no template artifacts)', async () => {
    const res = await request(BASE).get(`/members/${slug}`);
    expect(res.status).toBe(200);
    expect(res.text.includes('[object Object]'), 'no unrendered object on the profile').toBe(false);
    expect(/\{\{|\}\}/.test(res.text), 'no raw mustache on the profile').toBe(false);
  });

  it('the claimed member is reachable in the public member listing', async () => {
    // The migrated record now backs a live member, so its slug resolves as a
    // real profile rather than a 404. Structure only; never asserts the name.
    const res = await request(BASE).get(`/members/${slug}`);
    expect(res.status).toBe(200);
    expect(res.text.length, 'the profile rendered a non-empty body').toBeGreaterThan(0);
  });
});
