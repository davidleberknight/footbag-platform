/**
 * Integration tests for the /legal public route.
 *
 * Covers:
 *   GET /legal — single page with Privacy, Terms, and Copyright sections
 *
 * Contract verified:
 *   - content includes anchors for #privacy, #terms, #copyright
 *   - includes the operator identity and contact email
 *   - includes Apache-2.0 source-code license reference
 *   - includes IFPA trademark notice and Hacky Sack descriptive-use notice
 *   - privacy disclosures match what the site actually loads: every cookie the
 *     app sets, the Cloudflare human-verification check and the pages it runs
 *     on, and the video-thumbnail requests behind the click-to-load facade
 *   - includes last-updated date
 *   - footer legal-link row is present on the page layout
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadRouteTable } from '../fixtures/routeTable';
import { cachedGet } from '../fixtures/cachedGet';
import { legalService } from '../../src/services/legalService';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3090');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /legal', () => {
  it('renders the three anchored sections', async () => {
    const res = await page('/legal');
    expect(res.text).toContain('id="privacy"');
    expect(res.text).toContain('id="terms"');
    expect(res.text).toContain('id="copyright"');
  });

  it('names the operator and contact email', async () => {
    const res = await page('/legal');
    expect(res.text).toContain('David Leberknight');
    expect(res.text).toContain('admin@footbag.org');
  });

  it('references IFPA, California jurisdiction, and 501(c)(3) status', async () => {
    const res = await page('/legal');
    expect(res.text).toContain('International Footbag Players Association Incorporated');
    expect(res.text).toContain('California');
    expect(res.text).toContain('501(c)(3)');
  });

  it('references the Apache-2.0 license and repository URL', async () => {
    const res = await page('/legal');
    expect(res.text).toContain('Apache License 2.0');
    expect(res.text).toContain('github.com/davidleberknight/footbag-platform');
  });

  it('includes IFPA trademark notice and Hacky Sack descriptive-use notice', async () => {
    const res = await page('/legal');
    // Legal wording the marks' owners rely on. The words "IFPA" and "Hacky
    // Sack" alone appear in the site logo and footer on every page, so the
    // assertions are on the notices' own sentences.
    expect(res.text).toContain('are marks of the International Footbag Players Association Incorporated');
    expect(res.text).toContain('do not imply endorsement, sponsorship, or affiliation');
  });

  it('discloses every cookie the app sets, by purpose', async () => {
    const res = await page('/legal');
    // All three kinds the app can set: the session cookie, the members-only
    // archive's access cookies, and the short-lived one-time-message cookie.
    expect(res.text).toMatch(/session cookie/i);
    expect(res.text).toMatch(/members-only archive[^.]*access cookies/i);
    expect(res.text).toMatch(/one-time confirmation message/i);
  });

  it('promises self-service export and deletion, and the member tools the promise names exist', async () => {
    const res = await page('/legal');
    // The published page tells every visitor they can do these two things from
    // their account tools. It said so for a long time while both controls were
    // inert text on the profile, and nothing here noticed. The sentence and the
    // routes behind it are pinned together, so removing either fails: a promise
    // on a public legal page is only as true as the surface that answers it.
    expect(res.text).toContain('download a complete copy of your personal data or delete your account at any time');

    const routes = await loadRouteTable();
    const deployed = new Set(routes.allRoutes.map((r) => `${r.method.toUpperCase()} ${r.path}`));
    expect(deployed.has('POST /members/:memberKey/download')).toBe(true);
    expect(deployed.has('GET /members/:memberKey/delete')).toBe(true);
    expect(deployed.has('POST /members/:memberKey/delete')).toBe(true);
  });

  it('discloses the human-verification check and the pages it runs on', async () => {
    const res = await page('/legal');
    expect(res.text).toContain('Cloudflare Turnstile');
    expect(res.text).toMatch(/legacy-account claim/i);
  });

  it('discloses the video thumbnail requests and keeps the click-to-load statement', async () => {
    const res = await page('/legal');
    expect(res.text).toMatch(/image servers/i);
    expect(res.text).toMatch(/click-to-load facade/i);
  });

  it('shows the last-updated date the legal service publishes', async () => {
    const res = await page('/legal');
    const { lastUpdated } = legalService.getLegalPage().content;
    expect(res.text).toContain(`Last updated: ${lastUpdated}`);
  });

  it('includes the footer legal-links row on every layout', async () => {
    const res = await page('/legal');
    expect(res.text).toContain('/legal#privacy');
    expect(res.text).toContain('/legal#terms');
    expect(res.text).toContain('/legal#copyright');
  });
});
