/**
 * Publishing a candidate resolves its Emerging Vocabulary ruling, and keeps it.
 *
 * A trick held out of the dictionary (inactive, review status pending) is a
 * candidate: the observational surface lists exactly that set and attaches each
 * name's ruling to it. Taking a row out of that set is publication, so the save
 * that does it is the moment the ruling stops describing an open candidate.
 *
 * What must be true afterwards: the ruling records that the name became
 * canonical and which trick row it resolved to; the ruling itself survives,
 * because it is the record of how the name was decided; the trick, the ruling
 * and the audit entry move together or not at all; and a name whose ruling names
 * a different trick is refused rather than published into a contradiction.
 *
 * A publication with no ruling behind it is ordinary and silent: most canonical
 * tricks were never adjudicated.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleEvAdjudication,
  insertMember,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4136');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000pub1';

function admin(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

/** A candidate: held out of the dictionary, waiting on a decision. */
function insertCandidate(slug: string, name: string): void {
  insertFreestyleTrick(db, {
    slug, canonical_name: name, adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    operational_notation: 'CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    review_status: 'pending', is_active: 0,
  });
}

function body(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    canonicalName:     'Candidate One',
    adds:              '3',
    movementNotation:  '',
    executionNotation: 'CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    family:            'whirl',
    baseTrick:         'whirl',
    category:          'compound',
    reviewStatus:      'expert_reviewed',
    isActive:          'on',
    ...overrides,
  };
}

async function post(path: string, form: Record<string, string>) {
  return request(await createApp()).post(path).set('Cookie', admin()).type('form').send(form);
}

function adjudication(normalizedName: string) {
  return db.prepare(
    `SELECT candidate_id, submitted_name, ev_state, hold_kind, match_type, final_disposition,
            matched_existing_object, published_trick_slug, note, source, confidence, owner,
            blocker_id, version
       FROM freestyle_ev_adjudications WHERE normalized_name = ?`,
  ).get(normalizedName) as {
    candidate_id: string; submitted_name: string; ev_state: string; hold_kind: string;
    match_type: string; final_disposition: string; matched_existing_object: string;
    published_trick_slug: string | null; note: string; source: string; confidence: string;
    owner: string; blocker_id: string; version: number;
  } | undefined;
}

function trickRow(slug: string) {
  return db.prepare(
    'SELECT is_active, review_status FROM freestyle_tricks WHERE slug = ?',
  ).get(slug) as { is_active: number; review_status: string };
}

function pendingSlugs(): string[] {
  return (db.prepare(
    `SELECT slug FROM freestyle_tricks
      WHERE is_active = 0 AND review_status = 'pending' AND category <> 'modifier'`,
  ).all() as { slug: string }[]).map(r => r.slug);
}

function auditMetadata(slug: string): string[] {
  return (db.prepare(
    `SELECT metadata_json FROM audit_entries
      WHERE entity_id = ? AND action_type = 'freestyle.trick.updated'`,
  ).all(slug) as { metadata_json: string }[]).map(r => r.metadata_json);
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID, slug: 'pub_admin', display_name: 'Pub Admin',
    login_email: 'pub-admin@example.com', is_admin: 1,
  });

  // A linked candidate, exactly the shape the seed produced for the nine rulings
  // that named a trick row.
  insertCandidate('candidate_one', 'Candidate One');
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Candidate One', normalized_name: 'candidateone',
    ev_state: 'doctrine', final_disposition: 'C', blocker_id: 'Q02',
    note: 'appended=ev-restructure external-db-row slug=candidate_one',
    source: 'external', confidence: 'high', owner: 'james+red',
    published_trick_slug: 'candidate_one',
  });

  // A ruling for a name whose trick row exists but carries no link yet: the
  // shape a name adjudicated before its row existed would have.
  insertCandidate('candidate_unlinked', 'Candidate Unlinked');
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Candidate Unlinked', normalized_name: 'candidateunlinked',
    ev_state: 'authoring', final_disposition: 'C', owner: 'james',
    published_trick_slug: null,
  });

  // A candidate with no ruling at all: the ordinary case.
  insertCandidate('candidate_unruled', 'Candidate Unruled');

  // A ruling already bound to one trick, and a different trick row carrying the
  // same name: publishing the second must be refused.
  insertFreestyleTrick(db, {
    slug: 'conflict_owner', canonical_name: 'Conflict Name', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertCandidate('conflict_claimant', 'Conflict Name');
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Conflict Name', normalized_name: 'conflictname',
    ev_state: 'doctrine', final_disposition: 'C',
    published_trick_slug: 'conflict_owner',
  });

  // An already-live trick whose ordinary edit must not touch any ruling.
  insertFreestyleTrick(db, {
    slug: 'already_live', canonical_name: 'Already Live', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleEvAdjudication(db, {
    submitted_name: 'Already Live', normalized_name: 'alreadylive',
    ev_state: 'doctrine', final_disposition: 'C',
    published_trick_slug: 'already_live',
  });

  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('publishing a linked candidate', () => {
  it('resolves its ruling to canonical and records the trick it resolved to', async () => {
    const before = adjudication('candidateone')!;
    expect(before.ev_state).toBe('doctrine');
    expect(before.final_disposition).toBe('C');

    const res = await post('/admin/freestyle/tricks/candidate_one/edit', body());
    expect(res.status).toBe(303);

    const after = adjudication('candidateone')!;
    expect(after.ev_state).toBe('canonical');
    expect(after.hold_kind).toBe('canonical');
    expect(after.match_type).toBe('promoted-canonical');
    expect(after.final_disposition).toBe('A');
    expect(after.matched_existing_object).toBe('candidate_one');
    expect(after.published_trick_slug).toBe('candidate_one');
    expect(after.version).toBe(before.version + 1);
  });

  it('keeps the ruling as history rather than deleting it', async () => {
    const after = adjudication('candidateone')!;
    expect(after.candidate_id).toBeTruthy();
    // Everything that records how the name was decided survives the resolution.
    expect(after.note).toContain('appended=ev-restructure');
    expect(after.source).toBe('external');
    expect(after.confidence).toBe('high');
    expect(after.owner).toBe('james+red');
    expect(after.blocker_id).toBe('Q02');
    expect(after.submitted_name).toBe('Candidate One');
  });

  it('takes the trick out of the candidate set the observational surface lists', async () => {
    expect(trickRow('candidate_one')).toEqual({ is_active: 1, review_status: 'expert_reviewed' });
    expect(pendingSlugs()).not.toContain('candidate_one');
  });

  it('records the publication and the resolved ruling in the same audit entry', async () => {
    const entries = auditMetadata('candidate_one');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain('"published":true');
    expect(entries[0]).toContain('resolvedAdjudication');
  });
});

describe('publishing a name whose ruling carries no link yet', () => {
  it('finds the ruling by name, resolves it, and records the link', async () => {
    const res = await post(
      '/admin/freestyle/tricks/candidate_unlinked/edit',
      body({ canonicalName: 'Candidate Unlinked' }),
    );
    expect(res.status).toBe(303);

    const after = adjudication('candidateunlinked')!;
    expect(after.published_trick_slug).toBe('candidate_unlinked');
    expect(after.ev_state).toBe('canonical');
    expect(after.final_disposition).toBe('A');
  });
});

describe('publishing a name with no ruling behind it', () => {
  it('publishes silently, because most canonical tricks were never adjudicated', async () => {
    const res = await post(
      '/admin/freestyle/tricks/candidate_unruled/edit',
      body({ canonicalName: 'Candidate Unruled' }),
    );
    expect(res.status).toBe(303);
    expect(trickRow('candidate_unruled').is_active).toBe(1);

    const entries = auditMetadata('candidate_unruled');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain('"published":true');
    expect(entries[0]).not.toContain('resolvedAdjudication');
  });
});

describe('publishing a name ruled to be a different trick', () => {
  it('refuses the save', async () => {
    const res = await post(
      '/admin/freestyle/tricks/conflict_claimant/edit',
      body({ canonicalName: 'Conflict Name' }),
    );
    // The form is re-rendered with the field error, the same 422 every other
    // refusal on this surface uses, rather than a redirect that would read as a
    // successful publication.
    expect(res.status).toBe(422);
    expect(res.text).toContain('already ruled to be a different trick');
  });

  it('leaves the trick unpublished, the ruling untouched, and no audit entry behind', () => {
    expect(trickRow('conflict_claimant')).toEqual({ is_active: 0, review_status: 'pending' });
    const ruling = adjudication('conflictname')!;
    expect(ruling.published_trick_slug).toBe('conflict_owner');
    expect(ruling.ev_state).toBe('doctrine');
    expect(ruling.final_disposition).toBe('C');
    expect(auditMetadata('conflict_claimant')).toHaveLength(0);
  });
});

describe('an ordinary edit of an already-live trick', () => {
  it('does not resolve anything, because nothing was published', async () => {
    // An ordinary save of a row that is already live. It stays inside every
    // row-shape rule, so what it exercises is the publication branch and not a
    // validation path.
    const res = await post(
      '/admin/freestyle/tricks/already_live/edit',
      body({ canonicalName: 'Already Live' }),
    );
    expect(res.status).toBe(303);

    const ruling = adjudication('alreadylive')!;
    expect(ruling.ev_state).toBe('doctrine');
    expect(ruling.final_disposition).toBe('C');

    const entries = auditMetadata('already_live');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain('"published":false');
  });
});
