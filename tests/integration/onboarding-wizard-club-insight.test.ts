/**
 * The club step's free-text insight question.
 *
 * The two fixed answers on a club card cannot express local knowledge such as
 * a club that merged or moved, so the step also invites free text: on the
 * member's last card, keyed to that club, and on the wrap-up landing, keyed to
 * nothing because the member is writing about clubs in their area. The text is
 * evidence for the admin cleanup queue, never public, and it is member-authored
 * personal content, so erasure clears the words while the evidence row lives on.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertClubLeader,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertOnboardingTask,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3199');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let memberSvc: typeof import('../../src/services/memberService').memberService;

const MEMBER_CARD    = 'insight-card-member';
const MEMBER_LONG    = 'insight-long-member';
const MEMBER_BLANK   = 'insight-blank-member';
const MEMBER_CONTROL = 'insight-control-member';
const MEMBER_PURGE   = 'insight-purge-member';

let cardClubId = '';
let cardAffId  = '';
let longAffId  = '';
let blankAffId = '';
let controlAffId = '';

interface NoteRow {
  club_id: string | null;
  source_stage: string;
  note_text: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  member_id: string;
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function readNotes(memberId: string): NoteRow[] {
  return testDb
    .prepare(
      `SELECT member_id, club_id, source_stage, note_text, source_entity_type, source_entity_id
         FROM club_insight_notes WHERE member_id = ? ORDER BY rowid`,
    )
    .all(memberId) as NoteRow[];
}

function readInsightAudits(memberId: string): Array<{ action_type: string; metadata_json: string }> {
  return testDb
    .prepare(
      `SELECT action_type, metadata_json FROM audit_entries
         WHERE actor_member_id = ? AND action_type = 'wizard.club_insight.recorded'
         ORDER BY rowid`,
    )
    .all(memberId) as Array<{ action_type: string; metadata_json: string }>;
}

// One member, one membership card, personal details already on file so the club
// step is reachable. A co-leader already holds the club so confirming does not
// divert into the leadership offer.
function seedCardMember(
  db: BetterSqlite3.Database,
  memberId: string,
  slug: string,
  clubName: string,
): { clubId: string; affId: string } {
  insertMember(db, {
    onboarding: 'none',
    id: memberId,
    slug,
    login_email: `${slug}@example.com`,
    legacy_member_id: `lm-${slug}`,
  });
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  const clubId = insertClub(db, { name: clubName });
  insertMember(db, {
    onboarding: 'none',
    id: `${memberId}-coleader`,
    slug: `${slug}_coleader`,
    login_email: `${slug}-co@example.com`,
  });
  insertClubLeader(db, { club_id: clubId, member_id: `${memberId}-coleader` });
  const candidateId = insertLegacyClubCandidate(db, {
    classification:  'pre_populate',
    mapped_club_id:  clubId,
    display_name:    clubName,
  });
  const affId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         `lm-${slug}`,
    legacy_club_candidate_id: candidateId,
    confidence_score:         0.9,
  });
  return { clubId, affId };
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  ({ clubId: cardClubId, affId: cardAffId } =
    seedCardMember(db, MEMBER_CARD, 'insight_card', 'Insight Card Club'));
  ({ affId: longAffId } =
    seedCardMember(db, MEMBER_LONG, 'insight_long', 'Insight Long Club'));
  ({ affId: blankAffId } =
    seedCardMember(db, MEMBER_BLANK, 'insight_blank', 'Insight Blank Club'));
  ({ affId: controlAffId } =
    seedCardMember(db, MEMBER_CONTROL, 'insight_control', 'Insight Control Club'));

  // Wrap-up path: no cards at all, so the landing is where the question is asked.
  insertMember(db, {
    onboarding:  'none',
    id:          MEMBER_PURGE,
    slug:        'insight_purge',
    login_email: 'insight_purge@example.com',
  });
  insertOnboardingTask(db, MEMBER_PURGE, 'personal_details', 'completed');

  db.close();
  createApp = await importApp();
  testDb = new BetterSqlite3(dbPath);
  memberSvc = (await import('../../src/services/memberService')).memberService;
});

afterAll(() => {
  testDb?.close();
  cleanupTestDb(dbPath);
});

describe('the club card asks for insight on the last card', () => {
  it('renders the question on the member\'s last card', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_CARD));
    expect(res.status).toBe(200);
    expect(res.text).toContain('any other insight or information about this club');
    expect(res.text).toContain('name="insightNote"');
  });

  it('stores the note against the club the answer resolved to, and keeps the words out of the audit row', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_CARD))
      .type('form')
      .send({
        kind: 'membership',
        candidateId: cardAffId,
        userDecision: 'confirm',
        activitySignal: 'active',
        insightNote: '  They merged into the university club in 2019.  ',
      });
    expect(res.status).toBe(303);

    const notes = readNotes(MEMBER_CARD);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      club_id:      cardClubId,
      source_stage: 'onboarding_club_card',
      note_text:    'They merged into the university club in 2019.',
    });

    const audits = readInsightAudits(MEMBER_CARD);
    expect(audits).toHaveLength(1);
    const meta = JSON.parse(audits[0].metadata_json);
    expect(meta.note_length).toBe('They merged into the university club in 2019.'.length);
    expect(audits[0].metadata_json).not.toContain('university');
  });
});

describe('the insight question is optional and bounded', () => {
  it('writes nothing when the member leaves it blank', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_BLANK))
      .type('form')
      .send({
        kind: 'membership',
        candidateId: blankAffId,
        userDecision: 'confirm',
        activitySignal: 'active',
        insightNote: '   \n  ',
      });
    expect(res.status).toBe(303);
    expect(readNotes(MEMBER_BLANK)).toHaveLength(0);
    expect(readInsightAudits(MEMBER_BLANK)).toHaveLength(0);
  });

  it('refuses an over-long note and leaves the card unanswered so the words are not lost', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_LONG))
      .type('form')
      .send({
        kind: 'membership',
        candidateId: longAffId,
        userDecision: 'confirm',
        activitySignal: 'active',
        insightNote: 'x'.repeat(1001),
      });
    expect(res.status).toBe(422);
    expect(readNotes(MEMBER_LONG)).toHaveLength(0);

    const affStatus = testDb
      .prepare(`SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?`)
      .get(longAffId) as { resolution_status: string };
    expect(affStatus.resolution_status).toBe('pending');
  });

  it('strips control characters while keeping the newlines a member typed', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_CONTROL))
      .type('form')
      .send({
        kind: 'membership',
        candidateId: controlAffId,
        userDecision: 'confirm',
        activitySignal: 'active',
        insightNote: 'line one\nline two',
      });
    expect(res.status).toBe(303);

    const notes = readNotes(MEMBER_CONTROL);
    expect(notes).toHaveLength(1);
    expect(notes[0].note_text).toBe('line one\nline two');
  });
});

describe('the wrap-up landing collects area knowledge from a member with no cards', () => {
  it('answers an over-long note with a 422 rather than leaving the request hanging', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookieFor(MEMBER_PURGE))
      .type('form')
      .send({ insightNote: 'y'.repeat(1001) });
    expect(res.status).toBe(422);
    expect(readNotes(MEMBER_PURGE)).toHaveLength(0);
  });

  it('renders the question, then stores the answer keyed to no club', async () => {
    const page = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_PURGE));
    expect(page.status).toBe(200);
    expect(page.text).toContain('name="insightNote"');

    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookieFor(MEMBER_PURGE))
      .type('form')
      .send({ insightNote: 'There is a new group meeting in the park on Sundays.' });
    expect(res.status).toBe(303);

    const notes = readNotes(MEMBER_PURGE);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      club_id:           null,
      source_entity_id:  null,
      source_stage:      'onboarding_club_wrapup',
      note_text:         'There is a new group meeting in the park on Sundays.',
    });
  });
});

describe('erasure clears the member\'s words and keeps the evidence row', () => {
  it('purging the account nulls the note text without deleting the row', () => {
    expect(readNotes(MEMBER_PURGE)[0].note_text).toBeTruthy();

    testDb.prepare(`UPDATE members SET deleted_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), MEMBER_PURGE);
    const result = memberSvc.purgeAccountPII(MEMBER_PURGE);
    expect(result.status).toBe('purged');

    const notes = readNotes(MEMBER_PURGE);
    expect(notes).toHaveLength(1);
    expect(notes[0].note_text).toBeNull();
  });
});

describe('the admin cleanup queue is where the notes are read', () => {
  it('shows a club note on its queue row and an area note in its own section', async () => {
    const db = new BetterSqlite3(dbPath);
    const {
      insertMember: mkMember, insertClub: mkClub,
      insertClubViabilitySignal: mkSignal, insertClubInsightNote: mkNote,
      insertLegacyClubCandidate: mkCandidate,
      createTestSessionJwt: mkJwt,
    } = await import('../fixtures/factories');
    mkMember(db, {
      id: 'insight-admin', slug: 'insight_admin', display_name: 'Insight Admin',
      login_email: 'insight-admin@example.com', is_admin: 1,
    });
    // A club members called inactive, whose own record says it was established
    // at import, is a live queue item, so the note attached to it has a row to
    // render on. Without that contradiction the rules would settle the club and
    // it would never reach the queue.
    const queueClub = mkClub(db, { id: 'insight-queue-club', name: 'Queue Note Club' });
    mkCandidate(db, { mapped_club_id: queueClub, classification: 'pre_populate' });
    mkMember(db, { id: 'insight-voter-1', slug: 'insight_voter_1', display_name: 'Voter One', login_email: 'iv1@example.com' });
    mkMember(db, { id: 'insight-voter-2', slug: 'insight_voter_2', display_name: 'Voter Two', login_email: 'iv2@example.com' });
    mkSignal(db, { member_id: 'insight-voter-1', club_id: queueClub, activity_signal: 'not_active' });
    mkSignal(db, { member_id: 'insight-voter-2', club_id: queueClub, activity_signal: 'not_active' });
    mkNote(db, {
      member_id: 'insight-voter-1', club_id: queueClub,
      note_text: 'They stopped meeting when the rec centre closed.',
    });
    // An area note belongs to no club. The wizard-written one earlier in this
    // file has since been erased by the purge case, so this seeds its own.
    mkNote(db, {
      member_id: 'insight-voter-2', club_id: null,
      source_stage: 'onboarding_club_wrapup',
      note_text: 'Someone runs a Sunday circle in the park downtown.',
    });
    db.close();

    const adminCookie = `__Host-footbag_session=${mkJwt({ memberId: 'insight-admin', role: 'admin' })}`;
    const res = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    // The club note rides on the club's own row, attributed to its author.
    expect(res.text).toContain('They stopped meeting when the rec centre closed.');
    expect(res.text).toContain('Voter One');
    // The area note belongs to no club, so it has its own section.
    expect(res.text).toContain('What members told us about their area');
    expect(res.text).toContain('Someone runs a Sunday circle in the park downtown.');
  });
});
