/**
 * Member-facing feedback on the wizard claim task.
 *
 * A failed "This Is Me" confirmation shows the real reason (surname
 * mismatch with its contact-an-administrator guidance, or a record claimed
 * by another member in the meantime); only genuine classifier drift shows
 * the generic pick-another-candidate banner. The claim task stays reachable
 * after onboarding from the profile's legacy-claim link while a linkage is
 * missing. A classifier-produced suggestion card carries a decline control
 * even before any staging pass has run, and declining it is durable: the
 * card never re-renders and the pair is never re-staged without new signal.
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
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
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
  const memberId = insertMember(db, {
    slug, login_email: email,
    real_name: opts.memberName, display_name: opts.memberName,
    birth_date: '1980-01-01',
  });
  // The legacy-claim step runs only once personal details are on file.
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  return { memberId, legacyId, personId, slug };
}

describe('specific failure reasons on This Is Me confirmation', () => {
  it('a surname mismatch shows the name-does-not-match message with admin guidance', async () => {
    const f = matchFixture({ memberName: 'Robin Alpha', personName: 'Robin Beta' });
    const staged = svc.stageAutoLinkCandidate(
      f.memberId,
      { confidence: 'high', personId: f.personId, personName: 'Robin Beta' },
      'batch',
    );
    expect(staged.status).toBe('staged');
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/auto-link/confirm')
      .set('Cookie', cookieFor(f.memberId))
      .type('form')
      .send({ personId: f.personId });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Your name does not match this historical record');
    expect(res.text).toContain('contact an administrator');
  });

  it('a record claimed by another member in the meantime says so plainly', async () => {
    const f = matchFixture({ memberName: 'Casey Gamma', personName: 'Casey Gamma' });
    const staged = svc.stageAutoLinkCandidate(
      f.memberId,
      { confidence: 'high', personId: f.personId, personName: 'Casey Gamma' },
      'batch',
    );
    expect(staged.status).toBe('staged');
    const rival = insertMember(db, {
      slug: `wf_rival_${_seq}`, login_email: `rival${_seq}@example.com`,
      real_name: 'Casey Gamma', birth_date: '1980-01-01',
    });
    svc.claimLegacyAccount(rival, f.legacyId);
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/auto-link/confirm')
      .set('Cookie', cookieFor(f.memberId))
      .type('form')
      .send({ personId: f.personId });
    expect(res.status).toBe(422);
    expect(res.text.toLowerCase()).toContain('already been claimed');
  });

  it('genuine drift keeps the generic pick-another-candidate banner', async () => {
    const memberId = insertMember(db, {
      slug: `wf_drift_${tag('d')}`, login_email: `drift${_seq}@example.com`,
      real_name: 'Drift Delta', birth_date: '1980-01-01',
    });
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/auto-link/confirm')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ personId: 'HP-nonexistent' });
    expect(res.status).toBe(303);
    const follow = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', [cookieFor(memberId), ...(res.headers['set-cookie'] ?? [])].join('; '));
    expect(follow.status).toBe(200);
    expect(follow.text).toContain('no longer applicable');
  });
});

describe('the claim task after onboarding completes', () => {
  it('the profile identity section keeps the claim-task link while nothing is linked', async () => {
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
    expect(res.text).toContain('/register/wizard/legacy_claim');
  });

  it('the wizard claim task still renders after completion while a linkage is missing', async () => {
    const t = tag('re');
    const memberId = insertMember(db, {
      slug: `wf_re_${t}`, login_email: `${t}@example.com`, real_name: 'Returning Member', birth_date: '1980-01-01',
    });
    completeOnboarding(db, memberId);
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Help us find your record');
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

describe('declining a classifier-only suggestion card', () => {
  it('the card carries This Is Not Me, declining removes it durably', async () => {
    const f = matchFixture({ memberName: 'Morgan Kappa', personName: 'Morgan Kappa' });

    const before = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(f.memberId));
    expect(before.status).toBe(200);
    expect(before.text).toContain('This Is Me, Link My History');
    expect(before.text).toContain('This Is Not Me');

    const decline = await request(createApp())
      .post('/register/wizard/legacy_claim/auto-link/decline')
      .set('Cookie', cookieFor(f.memberId))
      .type('form')
      .send({ personId: f.personId });
    expect(decline.status).toBe(303);

    const after = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(f.memberId));
    expect(after.status).toBe(200);
    expect(after.text).not.toContain('This Is Me, Link My History');

    const row = db.prepare(
      "SELECT status, source_pass FROM auto_link_staged_candidates WHERE member_id = ? AND historical_person_id = ?",
    ).get(f.memberId, f.personId) as { status: string; source_pass: string };
    expect(row.status).toBe('declined');

    // The declined pair is never re-staged without new signal.
    const restage = svc.stageAutoLinkCandidate(
      f.memberId,
      { confidence: 'high', personId: f.personId, personName: 'Morgan Kappa' },
      'batch',
    );
    expect(restage.status).toBe('skipped_previously_declined');
  });

  it('a second decline of the same card is a harmless no-op', async () => {
    const f = matchFixture({ memberName: 'Repeat Sigma', personName: 'Repeat Sigma' });
    for (let i = 0; i < 2; i += 1) {
      const res = await request(createApp())
        .post('/register/wizard/legacy_claim/auto-link/decline')
        .set('Cookie', cookieFor(f.memberId))
        .type('form')
        .send({ personId: f.personId });
      expect(res.status).toBe(303);
    }
  });
});

describe('the simulated-email card on the mailbox-control declared state', () => {
  it('shows the just-sent mailbox-verification link on the page under the stub adapter', async () => {
    const f = matchFixture({ memberName: 'Card Tester', personName: 'Card Tester' });
    svc.declareAnchor(f.memberId, 'old_email', 'card-old@old.example.com');
    const anchorId = svc.listDeclaredAnchors(f.memberId)[0].id;

    const send = await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/send-verification')
      .set('Cookie', cookieFor(f.memberId))
      .type('form')
      .send({ anchorId });
    expect(send.status).toBe(303);
    expect(send.headers.location).toContain('anchor_verification=sent');

    // Following the redirect, the declared-state page shows the confirmation
    // link so a tester opens it without leaving the page. The card reads the
    // stub buffer, so the send's body scrub does not blank the rendered link.
    const page = await request(createApp())
      .get('/register/wizard/legacy_claim?anchor_verification=sent')
      .set('Cookie', cookieFor(f.memberId));
    expect(page.status).toBe(200);
    expect(page.text).toContain('Simulated email (dev)');
    expect(page.text).toMatch(
      /\/register\/wizard\/legacy_claim\/anchors\/verify\/[A-Za-z0-9_-]+">CLICK THIS LINK</,
    );
  });
});
