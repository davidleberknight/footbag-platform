import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4040');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertLegacyClubCandidate,
  insertClubViabilitySignal,
  insertClubInsightNote,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN_ID = 'park-admin-001';
const VOTER_ID = 'park-voter-001';

const RELEASED  = 'lcc-park-released';
const STAYS     = 'lcc-park-stays';
const RETIRED   = 'lcc-park-retired';
const NOTE_ONLY = 'lcc-park-note';
const PURGED    = 'lcc-park-purged';

// Evidence seeded before any park, so it can never release one.
const OLD = '2001-01-01T00:00:00.000Z';
// Evidence seeded after every park, so it always releases one.
const NEW = '2099-01-01T00:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function flag(db: BetterSqlite3.Database, candidateId: string, createdAt: string): void {
  insertClubViabilitySignal(db, {
    member_id: VOTER_ID,
    club_id: null,
    activity_signal: 'not_active',
    source_entity_type: 'legacy_club_candidate',
    source_entity_id: candidateId,
    created_at: createdAt,
  });
}

async function parkCandidate(candidateId: string): Promise<void> {
  const res = await request(createApp())
    .post(`/admin/club-cleanup/candidates/${candidateId}/resolve`)
    .set('Cookie', adminCookie())
    .send({ action: 'park', predicate: 'candidate_flags', reasonText: 'holding' });
  expect(res.status).toBe(303);
}

async function queueHtml(): Promise<string> {
  const res = await request(createApp())
    .get('/admin/club-cleanup')
    .set('Cookie', adminCookie());
  expect(res.status).toBe(200);
  return res.text;
}

// The page renders each group in its own section, and a candidate can sit in
// more than one: parking the wizard-flag item deliberately never hides the
// promotable item for the same candidate. So assertions name the section rather
// than the page.
function section(html: string, startMarker: string): string {
  const start = html.indexOf(startMarker);
  if (start === -1) return '';
  const rest = html.slice(start);
  const end = rest.indexOf('</details>');
  return end === -1 ? rest : rest.slice(0, end);
}

function flagSection(html: string): string {
  return section(html, 'Wizard Flags by Candidate (');
}

function parkedSection(html: string): string {
  return section(html, 'Parked (');
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, {
    id: ADMIN_ID, slug: 'park_admin', display_name: 'Park Admin',
    login_email: 'park-admin@example.com', is_admin: 1,
  });
  insertMember(db, {
    id: VOTER_ID, slug: 'park_voter', display_name: 'Park Voter',
    login_email: 'park-voter@example.com',
  });

  for (const [id, name] of [
    [RELEASED, 'Released Candidate'],
    [STAYS, 'Stays Parked Candidate'],
    [RETIRED, 'Retired Candidate'],
    [NOTE_ONLY, 'Noteworthy Candidate'],
    [PURGED, 'Purged Note Candidate'],
  ] as Array<[string, string]>) {
    insertLegacyClubCandidate(db, { id, display_name: name, classification: 'onboarding_visible' });
    flag(db, id, OLD);
  }

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('a parked candidate returns when a member says something after the park', () => {
  it('stays parked while the only evidence predates the park', async () => {
    await parkCandidate(STAYS);

    const html = await queueHtml();
    expect(flagSection(html)).not.toContain('Stays Parked Candidate');
    expect(parkedSection(html)).toContain('Stays Parked Candidate');
  });

  it('returns to the working queue when a newer activity answer arrives', async () => {
    await parkCandidate(RELEASED);

    let html = await queueHtml();
    expect(flagSection(html)).not.toContain('Released Candidate');

    const db = new BetterSqlite3(dbPath);
    flag(db, RELEASED, NEW);
    db.close();

    html = await queueHtml();
    expect(flagSection(html)).toContain('Released Candidate');
    expect(parkedSection(html)).not.toContain('Released Candidate');
  });

  it('returns when a newer insight note arrives, not only an activity answer', async () => {
    await parkCandidate(NOTE_ONLY);
    expect(flagSection(await queueHtml())).not.toContain('Noteworthy Candidate');

    const db = new BetterSqlite3(dbPath);
    insertClubInsightNote(db, {
      member_id: VOTER_ID,
      club_id: null,
      note_text: 'They moved to a new venue.',
      source_entity_type: 'legacy_club_candidate',
      source_entity_id: NOTE_ONLY,
      created_at: NEW,
    });
    db.close();

    expect(flagSection(await queueHtml())).toContain('Noteworthy Candidate');
  });

  it('a note whose text a purge erased is not evidence and does not release the park', async () => {
    await parkCandidate(PURGED);

    const db = new BetterSqlite3(dbPath);
    insertClubInsightNote(db, {
      member_id: VOTER_ID,
      club_id: null,
      note_text: null,
      source_entity_type: 'legacy_club_candidate',
      source_entity_id: PURGED,
      created_at: NEW,
    });
    db.close();

    const html = await queueHtml();
    expect(flagSection(html)).not.toContain('Purged Note Candidate');
    expect(parkedSection(html)).toContain('Purged Note Candidate');
  });
});

describe('an action that changed nothing says so', () => {
  it('a second administrator resolving the same item is told nobody lost the decision quietly', async () => {
    const db = new BetterSqlite3(dbPath);
    insertLegacyClubCandidate(db, {
      id: 'lcc-park-raced', display_name: 'Raced Candidate', classification: 'onboarding_visible',
    });
    db.close();

    const first = await request(createApp())
      .post('/admin/club-cleanup/candidates/lcc-park-raced/resolve')
      .set('Cookie', adminCookie())
      .send({ action: 'archive', predicate: 'promotable_candidate', reasonText: 'gone' });
    expect(first.status).toBe(303);

    // The guarded write matches nothing the second time. Redirecting the same
    // way as the first told the admin their decision landed when it did not.
    const second = await request(createApp())
      .post('/admin/club-cleanup/candidates/lcc-park-raced/resolve')
      .set('Cookie', adminCookie())
      .send({ action: 'archive', predicate: 'promotable_candidate', reasonText: 'gone again' });
    expect(second.status).toBe(303);

    const cookies = second.headers['set-cookie'] as unknown as string[] | undefined;
    const carried = (cookies ?? []).join('; ');
    const page = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', `${adminCookie()}; ${carried}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('another administrator resolved this item first');
  });
});

describe('a parked candidate the working queue cannot take back still shows somewhere', () => {
  it('a candidate retired after its park stays in the parked listing despite newer evidence', async () => {
    await parkCandidate(RETIRED);

    const db = new BetterSqlite3(dbPath);
    flag(db, RETIRED, NEW);
    db.close();

    // Newer evidence alone would return it, but archiving takes it out of every
    // working listing for good. Dropping it from the parked listing on the
    // evidence comparison would leave it showing on no surface at all.
    const archived = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${RETIRED}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'archive', predicate: 'promotable_candidate', reasonText: 'gone' });
    expect(archived.status).toBe(303);

    const html = await queueHtml();
    expect(flagSection(html)).not.toContain('Retired Candidate');
    expect(parkedSection(html)).toContain('Retired Candidate');
  });
});
