/**
 * The price a member is quoted is the price they will be charged.
 *
 * Tier prices are administrator-tunable at runtime. Every surface that quotes a
 * tier price to a member therefore has to resolve the same setting the checkout
 * resolves: a price copied into a template or a content constant keeps its old
 * value silently when the setting changes, and the member reads one amount and
 * is charged another with nothing failing.
 *
 * Two surfaces quote a price: the membership block on the member's own profile,
 * and the membership-tier explainer on the IFPA page, which visitors read before
 * they have an account at all.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3094');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { insertMember, insertSystemConfig, createTestSessionJwt } from '../fixtures/factories';

const MEMBER_ID = 'tqp-member-001';
const MEMBER_SLUG = 'tqp_member';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Quoted Price' });
  // Both tiers moved off their defaults, and Tier 1 to an amount carrying cents,
  // so a hard-coded copy of either default cannot pass this suite.
  insertSystemConfig(db, { config_key: 'tier1_price_cents', value_json: '1234' });
  insertSystemConfig(db, { config_key: 'tier2_price_cents', value_json: '7500' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

describe('a quoted tier price follows the configured price', () => {
  it('the profile quotes the configured price beside each upgrade control', async () => {
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}`)
      .set('Cookie', memberCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('$12.34 USD');
    expect(res.text).toContain('$75 USD');
    expect(res.text).not.toContain('$10 USD');
    expect(res.text).not.toContain('$50 USD');
  });

  it('the membership rules page quotes the same configured price', async () => {
    const res = await request(createApp()).get('/ifpa');
    expect(res.status).toBe(200);
    expect(res.text).toContain('$12.34 USD');
    expect(res.text).toContain('$75 USD');
    expect(res.text).not.toContain('$10 USD');
    expect(res.text).not.toContain('$50 USD');
  });

  it('a price configured in whole dollars carries no decimal part', async () => {
    // The Tier 2 price above is whole dollars, and reads as a membership price
    // rather than as an invoice line.
    const res = await request(createApp()).get('/ifpa');
    expect(res.text).toContain('$75 USD');
    expect(res.text).not.toContain('$75.00 USD');
  });
});
