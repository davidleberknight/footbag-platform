/**
 * Integration tests for the /media hub's Share Your Media card: the hub's route
 * into sharing, the same destination as the profile's Upload Media control.
 *
 * A member holding Tier 1 benefits is linked to their own upload form; a member
 * without them is shown the Tier 1 benefit notice and its upgrade link in the
 * card's place; a visitor and a registrant still onboarding see no card.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  createMemberAtTier,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4742');

let createApp: Awaited<ReturnType<typeof importApp>>;
// Imported after the test database is configured: a static import would open
// the default database before setTestEnv runs.
let buildTierBenefitNotice: typeof import('../../src/services/tierBenefitNotice').buildTierBenefitNotice;

const TIER1_ID = 'hub-share-tier1';
const TIER1_SLUG = 'hub_share_tier1';
const TIER0_ID = 'hub-share-tier0';
const TIER0_SLUG = 'hub_share_tier0';
const ONBOARDING_ID = 'hub-share-onboarding';
const ONBOARDING_SLUG = 'hub_share_onboarding';

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

// The hub's card grid alone, so a link the site header or footer also carries
// cannot satisfy an assertion about the cards.
function hubGrid(html: string): string {
  const start = html.indexOf('<div class="media-hub-grid">');
  if (start === -1) return '';
  return html.slice(start, html.indexOf('</section>', start));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  createMemberAtTier(db, { id: TIER1_ID, slug: TIER1_SLUG, tier: 'tier1' });
  createMemberAtTier(db, { id: TIER0_ID, slug: TIER0_SLUG, tier: 'tier0' });
  // Signed in but onboarding not finished: reads media pages as a visitor does.
  createMemberAtTier(db, {
    id: ONBOARDING_ID, slug: ONBOARDING_SLUG, tier: 'tier1', memberOverrides: { onboarding: 'none' },
  });
  db.close();
  createApp = await importApp();
  ({ buildTierBenefitNotice } = await import('../../src/services/tierBenefitNotice'));
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media — Share Your Media card', () => {
  it('links a Tier 1 member to their own upload form, after the browse card', async () => {
    // Broken, a member who can share would find no way in from the hub, or be
    // sent to someone else's upload form.
    const res = await request(createApp()).get('/media').set('Cookie', cookieFor(TIER1_ID));
    expect(res.status).toBe(200);
    const grid = hubGrid(res.text);
    const uploadHref = `href="/members/${TIER1_SLUG}/media/upload"`;
    expect(grid).toContain(uploadHref);
    expect(grid.indexOf('href="/media/browse"')).toBeLessThan(grid.indexOf(uploadHref));
    expect(grid.indexOf(uploadHref)).toBeLessThan(grid.indexOf('href="/freestyle/media"'));
    // A member who holds the benefit is never told to upgrade.
    expect(grid).not.toContain(`href="${buildTierBenefitNotice(TIER1_SLUG, 'media').upgradeHref}"`);
  });

  it('shows a Tier 0 member the benefit notice and upgrade link instead of an upload control', async () => {
    // Broken, a member without the benefit would be offered a form the tier
    // gate refuses, or would get no explanation of how to start sharing.
    const notice = buildTierBenefitNotice(TIER0_SLUG, 'media');
    const res = await request(createApp()).get('/media').set('Cookie', cookieFor(TIER0_ID));
    expect(res.status).toBe(200);
    const grid = hubGrid(res.text);
    expect(grid).toContain(`href="${notice.upgradeHref}"`);
    expect(grid).toContain(notice.lead);
    expect(grid).not.toContain('/media/upload"');
  });

  it('shows no card to a visitor or to a registrant still onboarding', async () => {
    // Broken, a visitor would see an upload control (the story forbids it), or a
    // registrant would be linked to member-only pages that 404 for them.
    const visitor = await request(createApp()).get('/media');
    const onboarding = await request(createApp()).get('/media').set('Cookie', cookieFor(ONBOARDING_ID));
    for (const [who, res] of [['visitor', visitor], ['onboarding registrant', onboarding]] as const) {
      expect(res.status, who).toBe(200);
      const grid = hubGrid(res.text);
      // The grid is present (browse card), so the absence below is the share card's.
      expect(grid, who).toContain('href="/media/browse"');
      expect(grid, who).not.toContain('/media/upload"');
      expect(grid, who).not.toContain('#membership"');
    }
  });
});
