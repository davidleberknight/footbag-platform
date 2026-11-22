/**
 * What a club page shows someone who is not a member where a member would
 * join, and in place of the roster.
 *
 * The contract: joining a club and seeing its roster take IFPA membership. A
 * signed-out visitor is offered log-in, which returns them to the club page,
 * and a way to create an account. A signed-in registrant still onboarding is
 * already signed in, so they are sent to finish onboarding instead, never
 * told to log in. A member sees neither prompt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertTag,
  insertClubLeader,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4000');

let createApp: Awaited<ReturnType<typeof importApp>>;
const clubKey = 'club_nonmember_joiners';
const clubPath = `/clubs/${clubKey}`;

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function get(memberId: string | null) {
  const r = request(createApp()).get(clubPath);
  return memberId ? r.set('Cookie', cookieFor(memberId)) : r;
}

/** The markup of the div with this id, through its matching close tag; fails when absent. */
function regionOf(html: string, id: string): string {
  const start = html.indexOf(`<div id="${id}"`);
  expect(start, `element #${id} is on the page`).toBeGreaterThanOrEqual(0);
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  throw new Error(`element #${id} never closes`);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const leader = insertMember(db, {
    id: 'nmj-leader', slug: 'nmj_leader', display_name: 'Lee Leader', login_email: 'nmj-leader@example.com',
  });
  completeOnboarding(db, leader);
  const member = insertMember(db, {
    id: 'nmj-member', slug: 'nmj_member', display_name: 'Mo Member', login_email: 'nmj-member@example.com',
  });
  completeOnboarding(db, member);
  insertMember(db, {
    id: 'nmj-onboarding', slug: 'nmj_onboarding', display_name: 'Ona Boarding',
    login_email: 'nmj-onboarding@example.com', onboarding: 'none',
  });
  const tagId = insertTag(db, { standard_type: 'club', tag_normalized: `#${clubKey}` });
  const clubId = insertClub(db, { id: 'nmj-club', name: 'Nonmember Joiners Club', hashtag_tag_id: tagId });
  insertClubLeader(db, { club_id: clubId, member_id: leader });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the club page for someone who is not a member', () => {
  // Defect caught: a visitor sees no way to join, or a log-in that does not
  // return them to the club, or no way to create the account joining needs.
  it('offers a visitor log-in back to the club page and a way to create an account', async () => {
    const res = await get(null);
    expect(res.status).toBe(200);
    const loginHref = `/login?returnTo=${encodeURIComponent(clubPath)}`;
    const prompt = regionOf(res.text, 'join-prompt');
    expect(prompt).toContain(`href="${loginHref}"`);
    expect(prompt).toContain('href="/register"');
    expect(res.text).not.toContain(`action="${clubPath}/join"`);
    // The roster card sends the visitor the same way.
    expect(regionOf(res.text.replace('<div class="card club-members-gate">', '<div id="members-gate">'), 'members-gate'))
      .toContain(`href="${loginHref}"`);
  });

  // Defect caught: a registrant who is already signed in is told to log in to
  // join or to see the roster, instead of being sent to finish onboarding.
  it('sends a signed-in registrant still onboarding to finish it, never to log in', async () => {
    const res = await get('nmj-onboarding');
    expect(res.status).toBe(200);
    const prompt = regionOf(res.text, 'join-prompt');
    expect(prompt).toMatch(/href="\/register\/wizard\/[a-z_]+"/);
    expect(prompt).not.toContain('/login');
    const gate = regionOf(res.text.replace('<div class="card club-members-gate">', '<div id="members-gate">'), 'members-gate');
    expect(gate).toMatch(/href="\/register\/wizard\/[a-z_]+"/);
    expect(gate).not.toContain('/login');
  });

  // Defect caught: a member is shown the visitor prompt beside, or instead of,
  // their Join button.
  it('shows a member the Join button and no membership prompt', async () => {
    const res = await get('nmj-member');
    expect(res.text).toContain(`action="${clubPath}/join"`);
    expect(res.text).not.toContain('id="join-prompt"');
  });
});
