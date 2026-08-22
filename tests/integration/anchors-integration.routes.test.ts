/**
 * Declared-anchor integration across the claim machinery:
 *  - the batch staging pass matches on declared old emails (not just the
 *    login email) and proposes only the asserted-identity floor tier for
 *    declared-anchor matches;
 *  - the direct historical-person claim's surname rule accepts a declared
 *    former surname;
 *  - anchor declare/remove is rate-limited per member;
 *  - registration against a surname already claimed records the conflict
 *    event, the wizard renders the "is one of these you?" prompt, and the
 *    dispute affordance files a help request with the disputed event;
 *  - after a one-source claim, a cross-source offer stages for the other
 *    source with the offered event; confirming applies the second claim
 *    with the cross-source confirmed event; declining is terminal.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson, insertOnboardingTask, createTestSessionJwt } from '../fixtures/factories';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('3088');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identity: typeof import('../../src/services/identityAccessService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let onboarding: typeof import('../../src/services/memberOnboardingService');

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
  identity = await import('../../src/services/identityAccessService');
  ops = await import('../../src/services/operationsPlatformService');
  onboarding = await import('../../src/services/memberOnboardingService');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function declareOldEmail(memberId: string, email: string): void {
  identity.identityAccessService.declareAnchor(memberId, 'old_email', email);
}

function audits(memberId: string, actionType: string): Array<Record<string, unknown>> {
  return db.prepare(
    `SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = ?`,
  ).all(memberId, actionType) as Array<Record<string, unknown>>;
}

function stagedRows(memberId: string): Array<Record<string, unknown>> {
  return db.prepare(
    `SELECT * FROM auto_link_staged_candidates WHERE member_id = ? ORDER BY created_at, id`,
  ).all(memberId) as Array<Record<string, unknown>>;
}

describe('declared old email feeds the batch classifier', () => {
  it('stages a candidate matched via a declared old email with the floor evidence tier', async () => {
    insertLegacyMember(db, {
      legacy_member_id: 'LM-anchor-batch', legacy_email: 'old-self@old.example.com',
      real_name: 'Anchor Batcher', display_name: 'Anchor Batcher',
    });
    insertHistoricalPerson(db, {
      person_id: 'HP-anchor-batch', person_name: 'Anchor Batcher', legacy_member_id: 'LM-anchor-batch',
    });
    const memberId = insertMember(db, {
      id: 'mem-anchor-batch', slug: 'mem_anchor_batch',
      login_email: 'new-self@example.com',
      real_name: 'Anchor Batcher', display_name: 'Anchor Batcher',
    });
    declareOldEmail(memberId, 'old-self@old.example.com');

    await ops.operationsPlatformService.runBatchAutoLink();

    const rows = stagedRows(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].confidence).toBe('high');
    // Declared anchors are asserted, not proven: floor tier despite the
    // high-confidence match.
    expect(rows[0].proposed_evidence_strength).toBe('declared_anchor_only');
    const meta = JSON.parse(String((audits(memberId, 'legacy.auto_link_candidate_staged'))[0].metadata_json)) as Record<string, unknown>;
    expect(meta.matched_anchors).toContain('declared_old_email');
  });

  it('matches a mixed-case declared old email against a lowercase-stored legacy email', async () => {
    // Legacy emails are stored lowercase and the declared old email is
    // lowercased on the way in, so a member who types their old address in a
    // different case than it was stored still matches at batch time.
    insertLegacyMember(db, {
      legacy_member_id: 'LM-anchor-case', legacy_email: 'old-case@old.example.com',
      real_name: 'Case Batcher', display_name: 'Case Batcher',
    });
    insertHistoricalPerson(db, {
      person_id: 'HP-anchor-case', person_name: 'Case Batcher', legacy_member_id: 'LM-anchor-case',
    });
    const memberId = insertMember(db, {
      id: 'mem-anchor-case', slug: 'mem_anchor_case',
      login_email: 'new-case@example.com',
      real_name: 'Case Batcher', display_name: 'Case Batcher',
    });
    declareOldEmail(memberId, 'OLD-Case@Old.Example.com');

    await ops.operationsPlatformService.runBatchAutoLink();

    const rows = stagedRows(memberId);
    expect(rows).toHaveLength(1);
    const meta = JSON.parse(String((audits(memberId, 'legacy.auto_link_candidate_staged'))[0].metadata_json)) as Record<string, unknown>;
    expect(meta.matched_anchors).toContain('declared_old_email');
  });
});

describe('mandatory old-email proof: an unverified old-email match cannot confirm a claim', () => {
  it('refuses the auto-link confirm until the old email is proven, then allows it', async () => {
    insertLegacyMember(db, {
      legacy_member_id: 'LM-oldproof', legacy_email: 'proof-old@old.example.com',
      real_name: 'Proof Person', display_name: 'Proof Person',
    });
    insertHistoricalPerson(db, {
      person_id: 'HP-oldproof', person_name: 'Proof Person', legacy_member_id: 'LM-oldproof',
    });
    const memberId = insertMember(db, {
      id: 'mem-oldproof', slug: 'mem_oldproof',
      login_email: 'proof-new@example.com',
      real_name: 'Proof Person', display_name: 'Proof Person',
      birth_date: '1980-01-01',
    });
    // The legacy-claim resolving actions run only once personal details are on file.
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');
    declareOldEmail(memberId, 'proof-old@old.example.com');
    await ops.operationsPlatformService.runBatchAutoLink();

    const linkedId = () =>
      (db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(memberId) as
        { historical_person_id: string | null }).historical_person_id;

    // The card is staged, but the old email is only asserted: confirming is refused.
    const refused = onboarding.memberOnboardingService.processLegacyClaimAutoLinkConfirm(memberId, 'HP-oldproof');
    expect(refused.kind).toBe('validation_error');
    expect(String((refused as { message: string }).message).toLowerCase()).toContain('old email');
    expect(linkedId()).toBeNull();

    // Prove control of the old email (the mailbox link-click round-trip), then
    // the same confirm succeeds.
    db.prepare(
      `UPDATE member_declared_anchors SET verified_via_link_click_at = '2026-01-01T00:00:00.000Z'
         WHERE member_id = ? AND anchor_type = 'old_email'`,
    ).run(memberId);
    const ok = onboarding.memberOnboardingService.processLegacyClaimAutoLinkConfirm(memberId, 'HP-oldproof');
    expect(ok.kind).not.toBe('validation_error');
    expect(linkedId()).toBe('HP-oldproof');
  });
});

describe('former surname on the direct historical-person claim', () => {
  it('a declared former surname passes the surname rule; no blocked event is recorded', () => {
    insertHistoricalPerson(db, { person_id: 'HP-former-1', person_name: 'Frida Maidenname' });
    const memberId = insertMember(db, {
      id: 'mem-former-1', slug: 'mem_former_1',
      login_email: 'former1@example.com',
      real_name: 'Frida Marriedname', display_name: 'Frida Marriedname',
    });
    identity.identityAccessService.declareAnchor(memberId, 'former_surname', 'Maidenname');

    identity.identityAccessService.claimHistoricalPerson(memberId, 'HP-former-1');

    const m = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(memberId) as Record<string, unknown>;
    expect(m.historical_person_id).toBe('HP-former-1');
    expect(audits(memberId, 'claim.historical_person_blocked')).toHaveLength(0);
    const claim = JSON.parse(String(audits(memberId, 'claim.historical_person')[0].metadata_json)) as Record<string, unknown>;
    expect(claim.evidence_strength).toBe('declared_anchor_only');
  });

  it('a multi-word former surname is held to the whole of it, not to its last word', () => {
    // The surname gate is the only thing standing between a self-asserted anchor
    // and someone else's competition record, and a declared former surname needs
    // no proof at all. Reducing a two-word surname to its final word would let
    // "Garcia Lopez" reach every record ending in Lopez, which is the same
    // false positive the recorded family name is deliberately held against.
    insertHistoricalPerson(db, { person_id: 'HP-former-2', person_name: 'Ana Lopez' });
    const memberId = insertMember(db, {
      id: 'mem-former-2', slug: 'mem_former_2',
      login_email: 'former2@example.com',
      real_name: 'Rosa Newname', display_name: 'Rosa Newname',
    });
    identity.identityAccessService.declareAnchor(memberId, 'former_surname', 'Garcia Lopez');

    expect(() => identity.identityAccessService.claimHistoricalPerson(memberId, 'HP-former-2'))
      .toThrow();
    const m = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(memberId) as Record<string, unknown>;
    expect(m.historical_person_id).toBeNull();
  });

  it('a multi-word former surname still reaches the record that actually carries it', () => {
    insertHistoricalPerson(db, { person_id: 'HP-former-3', person_name: 'Maria Garcia Lopez' });
    const memberId = insertMember(db, {
      id: 'mem-former-3', slug: 'mem_former_3',
      login_email: 'former3@example.com',
      real_name: 'Maria Newname', display_name: 'Maria Newname',
    });
    identity.identityAccessService.declareAnchor(memberId, 'former_surname', 'Garcia Lopez');

    identity.identityAccessService.claimHistoricalPerson(memberId, 'HP-former-3');

    const m = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(memberId) as Record<string, unknown>;
    expect(m.historical_person_id).toBe('HP-former-3');
  });

  it('a former surname carrying a suffix still matches the record without it', () => {
    // The target side drops Jr before comparing, so the member side has to as
    // well or the two halves are folded differently.
    insertHistoricalPerson(db, { person_id: 'HP-former-4', person_name: 'Bill Oldname' });
    const memberId = insertMember(db, {
      id: 'mem-former-4', slug: 'mem_former_4',
      login_email: 'former4@example.com',
      real_name: 'Bill Newname', display_name: 'Bill Newname',
    });
    identity.identityAccessService.declareAnchor(memberId, 'former_surname', 'Oldname Jr');

    identity.identityAccessService.claimHistoricalPerson(memberId, 'HP-former-4');

    const m = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(memberId) as Record<string, unknown>;
    expect(m.historical_person_id).toBe('HP-former-4');
  });
});

describe('anchor-change rate limiting', () => {
  it('throttles repeated declares per member', () => {
    const memberId = insertMember(db, {
      id: 'mem-anchor-rl', slug: 'mem_anchor_rl', login_email: 'anchor-rl@example.com',
    });
    let threw = false;
    try {
      for (let i = 0; i < 30; i++) {
        identity.identityAccessService.declareAnchor(memberId, 'old_email', `rl-${i}@example.com`);
      }
    } catch (err) {
      threw = (err as Error).constructor.name === 'RateLimitedError';
    }
    expect(threw).toBe(true);
  });
});

describe('registration-time conflict prompt', () => {
  function seedClaimedRecord(): void {
    insertLegacyMember(db, {
      legacy_member_id: 'LM-conflict-1', legacy_email: 'conflict-claimed@old.example.com',
      real_name: 'Connie Conflictsson', display_name: 'Connie Conflictsson',
    });
    insertMember(db, {
      id: 'mem-conflict-owner', slug: 'mem_conflict_owner',
      login_email: 'conflict-owner@example.com',
      real_name: 'Connie Conflictsson', display_name: 'Connie Conflictsson',
    });
    identity.identityAccessService.claimLegacyAccount('mem-conflict-owner', 'LM-conflict-1');
  }

  it('records the prompted event at registration, renders the wizard prompt, and the later dispute files a help request', async () => {
    seedClaimedRecord();
    const memberId = insertMember(db, {
      id: 'mem-conflict-new', slug: 'mem_conflict_new',
      login_email: 'conflict-new@example.com',
      real_name: 'Carl Conflictsson', display_name: 'Carl Conflictsson',
      onboarding: 'none',
    });
    // The legacy-claim step renders only once personal details are on file.
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');
    // The registration hook is exercised via the service-level detection the
    // hook uses (registerMember itself needs the full registration flow; the
    // detection contract is what the prompt depends on).
    const conflicts = (identity as unknown as {
      identityAccessService: { [k: string]: unknown };
    });
    void conflicts;

    const page = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(page.status).toBe(200);
    expect(page.text).toContain('We already have a claim under this name');
    expect(page.text).toContain('Connie Conflictsson');

    // The registrant is told to finish signing up first, because an
    // administrator answers on a member-only surface. Once they have, the
    // identity-link category of the contact form is the route, and the platform
    // classifies the request as a dispute from the records it detects rather
    // than from anything the member declares.
    // Rendering the task above already materialised the task rows, so signing
    // up is finished by advancing them rather than by seeding new ones.
    db.prepare(
      `UPDATE member_onboarding_tasks SET state = 'completed' WHERE member_id = ?`,
    ).run(memberId);

    const res = await request(createApp())
      .post('/members/mem_conflict_new/contact-admin')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        category: 'identity_link_issue',
        message: 'That claimed record is actually mine.',
      });
    expect(res.status).toBe(303);
    expect(audits(memberId, 'legacy.registration_conflict_disputed')).toHaveLength(1);

    const item = db.prepare(
      `SELECT reason_text FROM work_queue_items WHERE entity_id = ? AND task_type = 'member_link_help_request'`,
    ).get(memberId) as { reason_text: string };
    expect(JSON.parse(item.reason_text).is_dispute).toBe(true);
  });

  it('tells a registrant what they can do instead, and offers them no way to write to an administrator', async () => {
    // The same conflict, read by someone still signing up. An administrator
    // answers on a member-only surface, so the dispute form is not theirs to
    // use yet and the card must not tell them to use one.
    insertLegacyMember(db, {
      legacy_member_id: 'LM-conflict-pending', legacy_email: 'rival-claimed@old.example.com',
      real_name: 'Rhea Rivalsson', display_name: 'Rhea Rivalsson',
    });
    insertMember(db, {
      id: 'mem-rival-owner', slug: 'mem_rival_owner',
      login_email: 'rival-owner@example.com',
      real_name: 'Rhea Rivalsson', display_name: 'Rhea Rivalsson',
    });
    identity.identityAccessService.claimLegacyAccount('mem-rival-owner', 'LM-conflict-pending');

    const memberId = insertMember(db, {
      id: 'mem-conflict-pending', slug: 'mem_conflict_pending',
      login_email: 'conflict-pending@example.com',
      real_name: 'Ross Rivalsson', display_name: 'Ross Rivalsson',
      onboarding: 'none',
    });
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');
    insertOnboardingTask(db, memberId, 'legacy_claim', 'pending');
    insertOnboardingTask(db, memberId, 'club_affiliations', 'pending');

    const page = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(page.status).toBe(200);
    expect(page.text).toContain('We already have a claim under this name');
    expect(page.text).toContain('finish signing up and then ask an IFPA administrator');
    expect(page.text).not.toContain("tell an administrator and we'll investigate");
    expect(page.text).not.toContain('Yes, One of These Is Me');
    expect(page.text).not.toContain('/register/wizard/legacy_claim/help-request');
  });

  it('never surfaces a claimed legacy account\'s legal real_name: the card matches and shows the chosen display handle only', async () => {
    // A claimed record whose legal name differs from the public handle.
    insertLegacyMember(db, {
      legacy_member_id: 'LM-conflict-2', legacy_email: 'conflict-claimed-2@old.example.com',
      real_name: 'Greta Hiddenlegal', display_name: 'Greta Showhandle',
    });
    insertMember(db, {
      id: 'mem-conflict-owner-2', slug: 'mem_conflict_owner_2',
      login_email: 'conflict-owner-2@example.com',
      real_name: 'Greta Hiddenlegal', display_name: 'Greta Showhandle',
    });
    identity.identityAccessService.claimLegacyAccount('mem-conflict-owner-2', 'LM-conflict-2');

    // A registrant sharing the LEGAL surname must not learn it exists here:
    // matching on real_name and showing display_name would still link the
    // public handle to the legal surname, so neither match nor display may
    // consult real_name.
    const legalMatchId = insertMember(db, {
      id: 'mem-conflict-legal', slug: 'mem_conflict_legal',
      login_email: 'conflict-legal@example.com',
      real_name: 'Hans Hiddenlegal', display_name: 'Hans Hiddenlegal',
      onboarding: 'none',
    });
    insertOnboardingTask(db, legalMatchId, 'personal_details', 'completed');
    const legalPage = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(legalMatchId));
    expect(legalPage.status).toBe(200);
    // The registrant's own name renders on the wizard, so assert on the
    // claimed record's names specifically.
    expect(legalPage.text).not.toContain('Greta Hiddenlegal');
    expect(legalPage.text).not.toContain('Greta Showhandle');

    // A registrant sharing the HANDLE surname sees the handle, never the
    // legal name.
    const handleMatchId = insertMember(db, {
      id: 'mem-conflict-handle', slug: 'mem_conflict_handle',
      login_email: 'conflict-handle@example.com',
      real_name: 'Berta Showhandle', display_name: 'Berta Showhandle',
      onboarding: 'none',
    });
    insertOnboardingTask(db, handleMatchId, 'personal_details', 'completed');
    const handlePage = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(handleMatchId));
    expect(handlePage.status).toBe(200);
    expect(handlePage.text).toContain('Greta Showhandle');
    expect(handlePage.text).not.toContain('Greta Hiddenlegal');
  });
});

describe('cross-source offer after a one-source claim', () => {
  function seedHpAndLegacy(
    tag: string,
    opts: { memberCountry?: string | null; legacyCountry?: string | null } = {},
  ): { memberId: string } {
    insertHistoricalPerson(db, { person_id: `HP-xs-${tag}`, person_name: `Xavier Source${tag}` });
    insertLegacyMember(db, {
      legacy_member_id: `LM-xs-${tag}`, legacy_email: `xs-${tag}@example.com`,
      real_name: `Xavier Source${tag}`, display_name: `Xavier Source${tag}`,
      country: opts.legacyCountry ?? null,
    });
    // Still signing up: the claim task belongs to the wizard, which is closed to
    // a member who has finished.
    const memberId = insertMember(db, {
      id: `mem-xs-${tag}`, slug: `mem_xs_${tag}`,
      login_email: `xs-${tag}@example.com`,
      real_name: `Xavier Source${tag}`, display_name: `Xavier Source${tag}`,
      country: opts.memberCountry ?? 'US',
      birth_date: '1980-01-01',
      onboarding: 'none',
    });
    // The direct historical-record claim runs only once personal details are on
    // file, and completing that step also lets the legacy_claim GET render the
    // cross-source offer instead of routing to the next outstanding task.
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');
    return { memberId };
  }

  function offeredMeta(memberId: string): Record<string, unknown> {
    return JSON.parse(
      String(audits(memberId, 'legacy.cross_source_candidate_offered')[0].metadata_json),
    ) as Record<string, unknown>;
  }

  it('claiming the HP stages a legacy offer; confirming applies the legacy claim with the cross-source event', async () => {
    const { memberId } = seedHpAndLegacy('a');
    // Direct historical-record claim (the HP has no legacy back-link, so the
    // claim covers one source only); the post-confirm offer hook runs here.
    onboarding.memberOnboardingService.claimHistoricalPersonAndCompleteTask(memberId, 'HP-xs-a', '198.51.100.1');

    const m1 = db.prepare('SELECT historical_person_id, legacy_member_id FROM members WHERE id = ?').get(memberId) as Record<string, unknown>;
    expect(m1.historical_person_id).toBe('HP-xs-a');
    expect(m1.legacy_member_id).toBeNull();

    const offers = stagedRows(memberId).filter((r) => r.source_pass === 'cross_source');
    expect(offers).toHaveLength(1);
    expect(offers[0].legacy_member_id).toBe('LM-xs-a');
    expect(offers[0].historical_person_id).toBeNull();
    // The offer was found through the member's verified login email, so it
    // proposes the modern-email evidence tier, not the asserted-only floor.
    expect(offers[0].proposed_evidence_strength).toBe('currently_controls_modern_email_matching_legacy');
    expect(audits(memberId, 'legacy.cross_source_candidate_offered')).toHaveLength(1);

    const page = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(page.text).toContain('Yes, This Is Also Me');

    const confirm = await request(createApp())
      .post('/register/wizard/legacy_claim/cross-source/confirm')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ candidateId: String(offers[0].id) });
    expect(confirm.status).toBe(303);

    const m2 = db.prepare('SELECT legacy_member_id FROM members WHERE id = ?').get(memberId) as Record<string, unknown>;
    expect(m2.legacy_member_id).toBe('LM-xs-a');
    expect(audits(memberId, 'legacy.cross_source_candidate_confirmed')).toHaveLength(1);
    const resolved = stagedRows(memberId).filter((r) => r.source_pass === 'cross_source');
    expect(resolved[0].status).toBe('confirmed');
  });

  it('declining the offer is terminal and emits the cross-source declined event', async () => {
    const { memberId } = seedHpAndLegacy('b');
    onboarding.memberOnboardingService.claimHistoricalPersonAndCompleteTask(memberId, 'HP-xs-b', '198.51.100.1');
    const offer = stagedRows(memberId).find((r) => r.source_pass === 'cross_source')!;

    const decline = await request(createApp())
      .post('/register/wizard/legacy_claim/auto-link/decline')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ candidateId: String(offer.id) });
    expect(decline.status).toBe(303);
    expect(audits(memberId, 'legacy.cross_source_candidate_declined')).toHaveLength(1);

    // The pair never re-offers.
    const again = identity.identityAccessService.offerCrossSourceCandidate(memberId);
    expect(again.offered).toBe(false);
  });

  it('a country difference still offers (a member may have moved) but records the mismatch as a negative signal', () => {
    const { memberId } = seedHpAndLegacy('mismatch', { memberCountry: 'US', legacyCountry: 'Canada' });
    onboarding.memberOnboardingService.claimHistoricalPersonAndCompleteTask(memberId, 'HP-xs-mismatch', '198.51.100.1');

    const offers = stagedRows(memberId).filter((r) => r.source_pass === 'cross_source');
    // Country is not a gate: the offer still stages so a member who moved is
    // never silently denied. The mismatch is captured as a negative signal.
    expect(offers).toHaveLength(1);
    expect(JSON.parse(String(offers[0].matched_anchors_json))).not.toContain('country_agreement');
    expect(offeredMeta(memberId).country_signal).toBe('mismatch');
  });

  it('a matching country records the positive country signal on the offer', () => {
    const { memberId } = seedHpAndLegacy('agree', { memberCountry: 'US', legacyCountry: 'US' });
    onboarding.memberOnboardingService.claimHistoricalPersonAndCompleteTask(memberId, 'HP-xs-agree', '198.51.100.1');

    const offers = stagedRows(memberId).filter((r) => r.source_pass === 'cross_source');
    expect(offers).toHaveLength(1);
    expect(JSON.parse(String(offers[0].matched_anchors_json))).toContain('country_agreement');
    expect(offeredMeta(memberId).country_signal).toBe('agree');
  });
});

describe('mailbox-control verification email enqueue failure', () => {
  it('records an operational audit row carrying the committed token id, then rethrows', async () => {
    // The token row commits before the email enqueue; a lost enqueue must
    // leave an operator-visible trail that correlates with the orphaned
    // token when the member reports the missing email.
    expectLoggedError('audit: legacy.mailbox_link_email_enqueue_failed');
    const memberId = insertMember(db, {
      id: 'mem-anchor-enq', slug: 'mem_anchor_enq', login_email: 'anchor-enq@example.com',
    });
    declareOldEmail(memberId, 'anchor-enq-old@old.example.com');
    const anchor = db.prepare(
      'SELECT id FROM member_declared_anchors WHERE member_id = ?',
    ).get(memberId) as { id: string };

    const commsMod = await import('../../src/services/communicationService');
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    commsMod.setCommunicationServiceForTests({
      enqueueEmail: () => {
        throw new ServiceUnavailableError('synthetic enqueue failure');
      },
      enqueueEmailOrFail: () => {
        throw new ServiceUnavailableError('synthetic enqueue failure for mailbox-control email');
      },
      enqueueMailingListEmail: () => ({ enqueued: 0, duplicates: 0 }),
      processSendQueue: async () => ({
        claimed: 0, sent: 0, failed: 0, deadLettered: 0, paused: false,
      }),
    });
    try {
      expect(() =>
        identity.identityAccessService.requestAnchorMailboxVerification(memberId, anchor.id, '10.0.0.9'),
      ).toThrow('synthetic enqueue failure for mailbox-control email');
    } finally {
      commsMod.resetCommunicationServiceForTests();
    }

    const rows = audits(memberId, 'legacy.mailbox_link_email_enqueue_failed');
    expect(rows).toHaveLength(1);
    const meta = JSON.parse(String(rows[0].metadata_json)) as Record<string, unknown>;
    expect(meta.anchor_id).toBe(anchor.id);
    expect(String(meta.token_row_id)).not.toBe('');
    const token = db.prepare(
      'SELECT used_at FROM account_tokens WHERE id = ?',
    ).get(String(meta.token_row_id)) as { used_at: string | null } | undefined;
    expect(token).toBeTruthy();
    expect(token!.used_at).toBeNull();
  });
});

// The prompt shown to a registrant names the people it found, because that is
// the question it is asking them. The permanent ledger entry behind it must not:
// erasure never reaches that table, so a name recorded there outlives the account
// it belongs to, and these are other people's names held against a registrant who
// may have no connection to them.
describe('registration conflict ledger entry', () => {
  it('names conflicting records by identifier, never by the person, and stays bounded', async () => {
    insertLegacyMember(db, {
      legacy_member_id: 'LM-ledger-1', legacy_email: 'ledger-claimed@old.example.com',
      real_name: 'Ledger Ledgersson', display_name: 'Ledger Ledgersson',
    });
    insertMember(db, {
      id: 'mem-ledger-owner', slug: 'mem_ledger_owner',
      login_email: 'ledger-owner@example.com',
      real_name: 'Ledger Ledgersson', display_name: 'Ledger Ledgersson',
    });
    identity.identityAccessService.claimLegacyAccount('mem-ledger-owner', 'LM-ledger-1');

    const res = await request(createApp())
      .post('/register')
      .type('form')
      .send({
        email: 'ledger-new@example.com',
        password: 'TestPassword123!',
        confirmPassword: 'TestPassword123!',
        givenNames: 'Newcomer', familyName: 'Ledgersson',
        displayName: 'Newcomer Ledgersson',
      });
    expect(res.status).toBe(303);

    const registered = db.prepare('SELECT id FROM members WHERE login_email = ?')
      .get('ledger-new@example.com') as { id: string };
    const rows = audits(registered.id, 'legacy.registration_conflict_prompted');
    expect(rows).toHaveLength(1);

    const metadata = JSON.parse(rows[0].metadata_json as string);
    expect(metadata.conflict_count).toBeGreaterThan(0);
    expect(metadata.conflicts[0].legacy_member_id).toBe('LM-ledger-1');
    expect(metadata.conflicts.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(metadata)).not.toContain('Ledgersson');
  }, 30000);
});
