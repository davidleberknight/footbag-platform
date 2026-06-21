/**
 * The standing "volunteer to co-lead" affordance on the personal home
 * (My Clubs block):
 *   - an eligible member of a leaderless club sees the more-urgent
 *     no-co-leader prompt;
 *   - an eligible member of an already-led club sees the plain volunteer link;
 *   - a member who already co-leads the club sees the step-down action and no
 *     volunteer link.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertClubLeader,
  insertMemberClubAffiliation,
  createMemberAtTier,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3203');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
});
afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const cookieFor = (id: string) => `footbag_session=${createTestSessionJwt({ memberId: id })}`;

let _n = 0;
function tier1Member(idStub: string): { id: string; slug: string } {
  _n += 1;
  const id = `${idStub}-${_n}`;
  const slug = `${idStub.replace(/-/g, '_')}_${_n}`;
  createMemberAtTier(db, { id, slug, tier: 'tier1' });
  completeOnboarding(db, id);
  return { id, slug };
}
function club(): string {
  _n += 1;
  return insertClub(db, { id: `cta-club-${_n}`, name: `CTA Club ${_n}` });
}

describe('My Clubs volunteer-to-co-lead affordance', () => {
  it('an eligible member of a leaderless club sees the urgent no-co-leader prompt', async () => {
    const m = tier1Member('cta-leaderless');
    const c = club();
    insertMemberClubAffiliation(db, m.id, c);

    const res = await request(createApp()).get(`/members/${m.slug}`).set('Cookie', cookieFor(m.id));
    expect(res.status).toBe(200);
    expect(res.text).toContain('This Club Has No Co-leader Yet; Become Its First');
  });

  it('an eligible member of an already-led club sees the plain volunteer link', async () => {
    const m = tier1Member('cta-led');
    const c = club();
    insertMemberClubAffiliation(db, m.id, c);
    const other = insertMember(db, { id: `cta-other-${_n}`, slug: `cta_other_${_n}` });
    insertClubLeader(db, { club_id: c, member_id: other });

    const res = await request(createApp()).get(`/members/${m.slug}`).set('Cookie', cookieFor(m.id));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Volunteer to Co-lead');
    expect(res.text).not.toContain('This club has no co-leader yet');
  });

  it('a member who already co-leads the club sees step-down and no volunteer link', async () => {
    const m = tier1Member('cta-already');
    const c = club();
    insertMemberClubAffiliation(db, m.id, c);
    insertClubLeader(db, { club_id: c, member_id: m.id });

    const res = await request(createApp()).get(`/members/${m.slug}`).set('Cookie', cookieFor(m.id));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Step Down as Co-leader');
    expect(res.text).not.toContain('Volunteer to co-lead');
  });
});
