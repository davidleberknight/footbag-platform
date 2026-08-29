/**
 * The notation-authoring backlog: which rulings it lists and which it does not.
 *
 * A name reaches this queue when its identity and difficulty are settled and its
 * movement is not. That is derived from the ruling, never flagged by hand:
 * operator composition reliably gives a difficulty and generally not a movement,
 * so arithmetic certainty must not put a row on the list. A ruling whose evidence
 * already carries the movement, one that is resolved, one gated by a doctrine
 * question rather than a curator decision, and one somebody has already authored
 * are each excluded for a different reason, and each is asserted here.
 *
 * The queue reads the adjudication table rather than the generated corpus,
 * because that is the record a curator authors into; a queue read from generated
 * content would lag whatever was just written.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleEvAdjudication,
  insertFreestyleTrick,
  insertMember,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4137');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID  = 'aaaaaaaa-0000-0000-0000-0000000backl';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-0000000backl';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');

async function get(path: string, cookie?: string) {
  const req = request(await createApp()).get(path);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID, slug: 'backlog_admin', display_name: 'Backlog Admin',
    login_email: 'backlog-admin@example.com', is_admin: 1,
  });
  insertMember(db, {
    id: MEMBER_ID, slug: 'backlog_member', display_name: 'Backlog Member',
    login_email: 'backlog-member@example.com',
  });

  // On the queue: settled identity and difficulty, movement not established.
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Waiting On Notation', normalized_name: 'waitingonnotation',
    ev_state: 'parser', final_disposition: 'C',
    evidence_state: 'compositional-name-only',
    blocker_id: 'D7', blocker_subtype: 'settled-modifier-on-published-terminal',
    matched_existing_object: 'whirl', match_type: 'formula-identity',
    proposed_formula: 'pixie(+1) + whirl(3) = 4',
    residual_home: 'curator (registry weights settle the structure)',
    owner: 'james', source: 'SG', confidence: 'high',
  });

  // A second group, so the grouping is exercised rather than assumed.
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Second Group Name', normalized_name: 'secondgroupname',
    ev_state: 'undefined_operator', final_disposition: 'C',
    evidence_state: 'partial-structure', blocker_id: 'D8', owner: 'james+red',
  });

  // Off the queue, each for its own reason.
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Movement Already Documented', normalized_name: 'movementalreadydocumented',
    ev_state: 'parser', final_disposition: 'C',
    evidence_state: 'exact-notation', blocker_id: 'D7',
  });
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Footage Backed', normalized_name: 'footagebacked',
    ev_state: 'parser', final_disposition: 'C',
    evidence_state: 'verified-footage', blocker_id: 'D7',
  });
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Already Resolved', normalized_name: 'alreadyresolved',
    ev_state: 'canonical', final_disposition: 'A',
    evidence_state: 'compositional-name-only', blocker_id: 'D7',
  });
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Doctrine Held Name', normalized_name: 'doctrineheldname',
    ev_state: 'doctrine', final_disposition: 'C',
    evidence_state: 'compositional-name-only', blocker_id: 'Q02',
  });
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Already Authored', normalized_name: 'alreadyauthored',
    ev_state: 'parser', final_disposition: 'C',
    evidence_state: 'compositional-name-only', blocker_id: 'D7',
    authored_notation: 'TOE > SAME OUT [DEX] > SAME TOE [DEL]',
    notation_evidence_basis: 'platform-structure',
    notation_derivation_method: 'convention-derivation',
    notation_convention_id: 'swirl-chain-terminal-replacement',
  });

  // A queued name that already has a held-out trick row, the second intake shape.
  insertFreestyleTrick(db, {
    slug: 'linked_candidate', canonical_name: 'Linked Candidate', adds: '3',
    review_status: 'pending', is_active: 0,
  });
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Linked Candidate', normalized_name: 'linkedcandidate',
    ev_state: 'parser', final_disposition: 'C',
    evidence_state: 'compositional-name-only', blocker_id: 'D7',
    published_trick_slug: 'linked_candidate',
  });

  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('GET /admin/freestyle/notation-backlog — admin gate', () => {
  it('redirects a signed-out visitor', async () => {
    const res = await get('/admin/freestyle/notation-backlog');
    expect(res.status).toBe(302);
  });

  it('refuses an ordinary member', async () => {
    const res = await get('/admin/freestyle/notation-backlog', cookieFor(MEMBER_ID, 'member'));
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/freestyle/notation-backlog — what the queue holds', () => {
  it('lists a ruling whose identity and difficulty are settled and whose movement is not', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Waiting On Notation');
  });

  it('omits a ruling whose evidence already carries the movement', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    expect(res.text).not.toContain('Movement Already Documented');
    expect(res.text).not.toContain('Footage Backed');
  });

  it('omits a ruling that is already resolved', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    expect(res.text).not.toContain('Already Resolved');
  });

  it('omits a ruling gated by a doctrine question rather than a curator decision', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    expect(res.text).not.toContain('Doctrine Held Name');
  });

  it('omits a ruling whose notation someone has already authored', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    expect(res.text).not.toContain('Already Authored');
  });

  it('counts the rulings it lists', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    // Three qualify: the two group representatives and the linked candidate.
    expect(res.text).toContain('3 rulings');
  });
});

describe('GET /admin/freestyle/notation-backlog — what a curator can read without leaving', () => {
  it('shows what the ruling decided, what it rests on, and who owns it', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    expect(res.text).toContain('Name only, composition understood');
    expect(res.text).toContain('settled-modifier-on-published-terminal');
    expect(res.text).toContain('james');
    expect(res.text).toContain('high');
  });

  it('shows the identity it resolved to and how the difficulty was derived', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    expect(res.text).toContain('whirl');
    expect(res.text).toContain('pixie(+1) + whirl(3)');
  });

  it('groups by what released the name, with its title rather than only its code', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    expect(res.text).toContain('Confirm a familiar modifier added to an existing trick');
    expect(res.text).toContain('D7');
    expect(res.text).toContain('D8');
    expect(res.text).toContain('2 decision groups');
  });

  it('links a candidate that already has a held-out trick row, and says so when there is none', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    expect(res.text).toContain('/admin/freestyle/tricks/linked_candidate/edit');
    expect(res.text).toContain('Not yet created');
  });
});

describe('GET /admin/freestyle/notation-backlog — it writes nothing', () => {
  it('offers no state-changing control of its own', async () => {
    const res = await get('/admin/freestyle/notation-backlog', admin());
    // The layout's sign-out control is the only form on any signed-in page, so
    // the assertion is about the page's own body rather than the whole document.
    const body = res.text.slice(res.text.indexOf('<div class="hero hero-sm">'));
    expect(body).not.toContain('<form');
    expect(body).not.toContain('<button');
    expect(body).not.toContain('method="POST"');
  });

  it('leaves every ruling exactly as it found it', async () => {
    const before = db.prepare(
      'SELECT candidate_id, version, authored_notation FROM freestyle_ev_adjudications ORDER BY sequence_no',
    ).all();
    await get('/admin/freestyle/notation-backlog', admin());
    const after = db.prepare(
      'SELECT candidate_id, version, authored_notation FROM freestyle_ev_adjudications ORDER BY sequence_no',
    ).all();
    expect(after).toEqual(before);
  });
});
