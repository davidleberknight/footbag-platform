/**
 * A person's country and location read one way on the pages others see.
 *
 * On a person's own page the facts strip under the name shows the place as a
 * labeled fact: "Country" when only the country is known, "Location" once a
 * city or region is, with the country last and always its canonical name. A
 * signed-out visitor to an honoree's public profile sees the country and
 * nothing finer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertHistoricalPerson,
  createTestSessionJwt,
  completeOnboarding,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4891');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

const VIEWER_ID = 'member-location-viewer';
const HOF_ID    = 'member-location-hof';
const HOF_SLUG  = 'location_hof_member';
let hpId = '';

function viewerCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: VIEWER_ID })}`;
}

function factsStrip(html: string): string {
  const m = html.match(/<div class="event-meta-row">([\s\S]*?)<\/div>/);
  return m ? m[1] : '';
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  hpId = insertHistoricalPerson(db, {
    person_name: 'Placeholder Kärki', country: 'Suomi', hof_member: 1, hof_induction_year: 2011,
  });
  insertMember(db, { id: VIEWER_ID, slug: 'location_viewer', display_name: 'Location Viewer', login_email: 'locviewer@example.com' });
  completeOnboarding(db, VIEWER_ID);
  insertMember(db, {
    id: HOF_ID, slug: HOF_SLUG, display_name: 'Location Hof', login_email: 'lochof@example.com',
    is_hof: 1, city: 'Boulder', region: 'CO', country: 'USA',
  });
  completeOnboarding(db, HOF_ID);
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
});

describe('the facts strip under a person\'s name', () => {
  it('labels a historical player\'s country alone as Country, folded to its canonical name', async () => {
    // Broken, the player page would show a lone unlabeled word, or the
    // stored spelling instead of the name every other page uses.
    const res = await request(createApp()).get(`/history/${hpId}`);
    expect(res.status).toBe(200);
    const strip = factsStrip(res.text);
    expect(strip).toContain('Country: Finland');
    expect(strip).not.toContain('Suomi');
  });

  it('shows a signed-in viewer the member\'s city, region and country as one Location, country last', async () => {
    // Broken, the member's place would read in a different form from club and
    // event locations, or keep the old middot before the country.
    const res = await request(createApp()).get(`/members/${HOF_SLUG}`).set('Cookie', viewerCookie());
    expect(res.status).toBe(200);
    const strip = factsStrip(res.text);
    expect(strip).toContain('Location: Boulder, CO, United States');
    expect(strip).not.toContain('·');
  });

  it('shows a signed-out visitor to an honoree only the country', async () => {
    // Broken, an anonymous visitor would learn the honoree's city and region,
    // which only members may see.
    const res = await request(createApp()).get(`/members/${HOF_SLUG}`);
    expect(res.status).toBe(200);
    const strip = factsStrip(res.text);
    expect(strip).toContain('Country: United States');
    expect(res.text).not.toContain('Boulder');
  });
});
