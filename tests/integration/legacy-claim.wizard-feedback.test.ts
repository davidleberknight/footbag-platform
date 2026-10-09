/**
 * Member-facing feedback on the wizard claim task.
 *
 * A card offers only the claim the server would accept: a surname-differing
 * card offers the one-step surname claim, and a held record shows no card.
 * Every claim the re-check turns away, whatever the reason, gets the same
 * refusal and links nothing. The task belongs to signing up: its writes are
 * refused once onboarding completes, on every verb, not only on the page
 * render.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertOnboardingTask,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3251');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
  svc = (await import('../../src/services/identityAccessService')).identityAccessService;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

let _seq = 0;
function tag(prefix: string): string {
  _seq += 1;
  return `${prefix}${_seq.toString().padStart(3, '0')}`;
}

/** Member whose login email matches a legacy row back-linked to an HP. */
function matchFixture(opts: { memberName: string; personName: string }): {
  memberId: string; legacyId: string; personId: string; slug: string;
} {
  const t = tag('wf');
  const email = `${t}@example.com`;
  const legacyId = `LM-${t}`;
  const personId = `HP-${t}`;
  const slug = `wf_slug_${t}`;
  insertLegacyMember(db, {
    legacy_member_id: legacyId, legacy_email: email,
    real_name: opts.personName, display_name: opts.personName,
  });
  insertHistoricalPerson(db, {
    person_id: personId, person_name: opts.personName, legacy_member_id: legacyId,
  });
  // Still signing up: the claim task lives in the wizard, which closes to a
  // member who has finished.
  const memberId = insertMember(db, {
    slug, login_email: email,
    real_name: opts.memberName, display_name: opts.memberName,
    birth_date: '1980-01-01',
    onboarding: 'none',
  });
  // The legacy-claim step runs only once personal details are on file.
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  return { memberId, legacyId, personId, slug };
}

const NO_LONGER_AVAILABLE = 'This record is no longer available to claim.';

function memberLinks(memberId: string): { historical_person_id: string | null; legacy_member_id: string | null } {
  return db.prepare('SELECT historical_person_id, legacy_member_id FROM members WHERE id = ?')
    .get(memberId) as { historical_person_id: string | null; legacy_member_id: string | null };
}

describe('what a claim the member cannot make shows them', () => {
  // Defect caught: a card whose surname differs from the member's offers a
  // plain claim the server will refuse, instead of the one-step surname claim,
  // and a forged plain claim of it links anything.
  it('a surname-differing card offers the surname claim, and a plain claim of it is refused', async () => {
    const f = matchFixture({ memberName: 'Robin Alpha', personName: 'Robin Betaq' });
    const page = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(f.memberId));
    expect(page.status).toBe(200);
    expect(page.text).toContain('/register/wizard/legacy_claim/claim-with-surname');
    expect(page.text).toContain('I Used the Surname Betaq');
    expect(page.text).not.toContain('action="/register/wizard/legacy_claim/claim"');

    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(f.memberId))
      .type('form')
      .send({ accountId: f.legacyId, recordId: f.personId });
    expect(res.status).toBe(422);
    expect(res.text).toContain(NO_LONGER_AVAILABLE);
    expect(memberLinks(f.memberId)).toEqual({ historical_person_id: null, legacy_member_id: null });
  });

  // Defect caught: a record another member claimed after the page was drawn is
  // still shown with a claim control, or a stale claim of it reveals whose it
  // is or links anything.
  it('a record claimed by another member in the meantime leaves no card, and a stale claim is refused uniformly', async () => {
    const f = matchFixture({ memberName: 'Casey Gamma', personName: 'Casey Gamma' });
    const rival = insertMember(db, {
      slug: `wf_rival_${_seq}`, login_email: `rival${_seq}@example.com`,
      real_name: 'Casey Gamma', birth_date: '1980-01-01',
    });
    svc.claimLegacyAccount(rival, f.legacyId);

    const page = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(f.memberId));
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(`value="${f.legacyId}"`);

    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(f.memberId))
      .type('form')
      .send({ accountId: f.legacyId, recordId: f.personId });
    expect(res.status).toBe(422);
    expect(res.text).toContain(NO_LONGER_AVAILABLE);
    expect(res.text).not.toContain('claimed by another');
    expect(memberLinks(f.memberId)).toEqual({ historical_person_id: null, legacy_member_id: null });
  });

  // Defect caught: an id the member's evidence never reached gets a different
  // answer from a real refused one, which would let a member probe for ids.
  it('an id the step never showed gets the same refusal', async () => {
    const memberId = insertMember(db, {
      slug: `wf_forged_${tag('d')}`, login_email: `forged${_seq}@example.com`,
      real_name: 'Forged Delta', birth_date: '1980-01-01',
      onboarding: 'none',
    });
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ accountId: 'LM-nonexistent' });
    expect(res.status).toBe(422);
    expect(res.text).toContain(NO_LONGER_AVAILABLE);
  });
});

describe('the claim task after onboarding completes', () => {
  it('the profile identity section sends an unlinked member to an administrator, not back to the closed task', async () => {
    // The claim task closes with the wizard, and this profile renders only for
    // a member who has finished, so a control pointing at the task would bounce
    // every reader of it to where they already are. The route that still works
    // is the identity-link topic of their own contact form.
    const t = tag('cta');
    const slug = `wf_cta_${t}`;
    const memberId = insertMember(db, {
      slug, login_email: `${t}@example.com`, real_name: 'Late Linker', birth_date: '1980-01-01',
    });
    completeOnboarding(db, memberId);
    const res = await request(createApp())
      .get(`/members/${slug}`)
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(res.text).toContain(`href="/members/${slug}/contact-admin?category`);
    expect(res.text).toContain('identity_link_issue');
    expect(res.text).toContain('Ask an administrator to link your history');
    expect(res.text).not.toContain('/register/wizard/legacy_claim');
  });

  it('a member with no linkage is bounced away too: claiming belongs to signing up', async () => {
    // Not linking is a complete answer to the claim task, and the task closes
    // with the wizard whether or not it produced a link. A member who still
    // needs one asks an administrator through the identity-link category of the
    // contact form; the claim controls are not theirs to use any more.
    const t = tag('re');
    const memberId = insertMember(db, {
      slug: `wf_re_${t}`, login_email: `${t}@example.com`, real_name: 'Returning Member', birth_date: '1980-01-01',
    });
    completeOnboarding(db, memberId);
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).not.toContain('/register/wizard/');
  });

  it('a fully linked member is still bounced away from the completed task', async () => {
    const f = matchFixture({ memberName: 'Linked Omega', personName: 'Linked Omega' });
    completeOnboarding(db, f.memberId);
    svc.claimLegacyAccount(f.memberId, f.legacyId);
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(f.memberId));
    expect(res.status).toBe(303);
  });
});

describe('the wizard closes to a member who has finished signing up', () => {
  // Defect caught: a member who has finished onboarding claims an old account
  // through a card posted from a stale page, bypassing the administrator.
  it('a claim from a card is not accepted once onboarding is complete', async () => {
    const f = matchFixture({ memberName: 'Finished Claimant', personName: 'Finished Claimant' });
    completeOnboarding(db, f.memberId);

    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(f.memberId))
      .type('form')
      .send({ accountId: f.legacyId, recordId: f.personId });

    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('contact-admin?category=identity_link_issue');
    const row = db.prepare('SELECT historical_person_id FROM members WHERE id = ?')
      .get(f.memberId) as { historical_person_id: string | null };
    expect(row.historical_person_id).toBeNull();
  });

  it('the other claim-resolving writes are refused on the same terms', async () => {
    const f = matchFixture({ memberName: 'Also Finished', personName: 'Also Finished' });
    completeOnboarding(db, f.memberId);
    const cookie = cookieFor(f.memberId);

    const targets: Array<[string, Record<string, string>]> = [
      ['/register/wizard/legacy_claim/continue-without-linking', { no_link_answer: 'never_had_one' }],
      ['/register/wizard/legacy_claim/anchors/add', { anchorType: 'old_email', anchorValue: 'x@old.example.com' }],
      ['/register/wizard/legacy_claim/claim-with-surname', { accountId: f.legacyId, recordId: f.personId }],
    ];
    for (const [path, body] of targets) {
      const res = await request(createApp())
        .post(path).set('Cookie', cookie).type('form').send(body);
      expect(res.status, path).toBe(303);
      expect(res.headers.location, path).toContain('contact-admin?category=identity_link_issue');
    }
    // Nothing was declared along the way: the refusal is before the write.
    expect(svc.listDeclaredAnchors(f.memberId)).toHaveLength(0);
  });
});
