/**
 * Route-level rendering of the Identity & History block on the personal
 * home (`/members/<slug>`). Four-state truth table over
 * (legacy_member_id linked, historical_person_id linked):
 *
 *   no/no   → "No past account or competition record linked." + CTA visible
 *   yes/no  → "Legacy account: linked (since <date>)"
 *             + "Competition record: not yet linked."
 *             + "Find your competition record" CTA
 *   no/yes  → "Legacy account: none on file."
 *             + "Competition record: <person_name>." + no CTA
 *   yes/yes → both linked summaries + no CTA
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3088');

let createApp: Awaited<ReturnType<typeof importApp>>;

const NO_NO_ID    = 'member-id-no-no';
const NO_NO_SLUG  = 'id_no_no';
const YES_NO_ID   = 'member-id-yes-no';
const YES_NO_SLUG = 'id_yes_no';
const NO_YES_ID   = 'member-id-no-yes';
const NO_YES_SLUG = 'id_no_yes';
const YES_YES_ID  = 'member-id-yes-yes';
const YES_YES_SLUG = 'id_yes_yes';

const CLAIMED_AT = '2024-01-12T10:00:00.000Z';
const HP_NAME    = 'Joe Footbag';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // no/no: bare member, no legacy, no HP
  insertMember(db, { id: NO_NO_ID, slug: NO_NO_SLUG });

  const claimLegacy = db.prepare(
    'UPDATE legacy_members SET claimed_by_member_id = ?, claimed_at = ? WHERE legacy_member_id = ?',
  );
  const linkHp = db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?');

  // yes/no: legacy claimed, no HP
  const legacyA = insertLegacyMember(db, { real_name: 'Yes No Legacy' });
  insertMember(db, { id: YES_NO_ID, slug: YES_NO_SLUG, legacy_member_id: legacyA });
  claimLegacy.run(YES_NO_ID, CLAIMED_AT, legacyA);

  // no/yes: HP linked, no legacy
  const hpA = insertHistoricalPerson(db, { person_name: HP_NAME });
  insertMember(db, { id: NO_YES_ID, slug: NO_YES_SLUG });
  linkHp.run(hpA, NO_YES_ID);

  // yes/yes: both legacy and HP
  const legacyB = insertLegacyMember(db, { real_name: 'Yes Yes Legacy' });
  const hpB = insertHistoricalPerson(db, { person_name: HP_NAME });
  insertMember(db, { id: YES_YES_ID, slug: YES_YES_SLUG, legacy_member_id: legacyB });
  claimLegacy.run(YES_YES_ID, CLAIMED_AT, legacyB);
  linkHp.run(hpB, YES_YES_ID);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

const SLUG_BY_ID: Record<string, string> = {
  [NO_NO_ID]:   NO_NO_SLUG,
  [YES_NO_ID]:  YES_NO_SLUG,
  [NO_YES_ID]:  NO_YES_SLUG,
  [YES_YES_ID]: YES_YES_SLUG,
};

async function getDashboard(memberId: string): Promise<request.Response> {
  const slug = SLUG_BY_ID[memberId];
  return request(createApp())
    .get(`/members/${slug}`)
    .set('Cookie', cookieFor(memberId));
}

describe('GET /members/<slug> — Identity & History block', () => {
  it('no/no: shows combined empty line + wizard CTA', async () => {
    const res = await getDashboard(NO_NO_ID);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Identity');
    expect(res.text).toContain('No past account or competition record linked.');
    expect(res.text).toContain('Link your legacy account, results, and clubs');
    expect(res.text).toContain('href="/register/wizard/legacy_claim"');
    expect(res.text).not.toContain('Legacy account: linked');
    expect(res.text).not.toContain('Competition record:');
  });

  it('yes/no: shows linked-since date, HP not-yet-linked line, wizard CTA labelled for the missing link', async () => {
    const res = await getDashboard(YES_NO_ID);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Legacy account: linked.*Jan.*2024/);
    expect(res.text).toContain('Competition record: not yet linked.');
    expect(res.text).toContain('Link your competition history');
    expect(res.text).toContain('href="/register/wizard/legacy_claim"');
  });

  it('no/yes: shows HP summary, legacy none-on-file, wizard CTA labelled for the missing link', async () => {
    const res = await getDashboard(NO_YES_ID);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Legacy account: none on file.');
    expect(res.text).toContain(`>${HP_NAME}</a>.`);
    expect(res.text).toMatch(/href="\/history\/[^"]+"/);
    expect(res.text).toContain('Link your old footbag.org account');
  });

  it('yes/yes: shows both linked summaries, no CTA', async () => {
    const res = await getDashboard(YES_YES_ID);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Legacy account: linked.*Jan.*2024/);
    expect(res.text).toContain(`>${HP_NAME}</a>.`);
    expect(res.text).toMatch(/href="\/history\/[^"]+"/);
    expect(res.text).not.toContain('not yet linked');
    expect(res.text).not.toContain('none on file');
    expect(res.text).not.toContain('Find your past account');
    expect(res.text).not.toContain('Find your competition record');
  });
});
