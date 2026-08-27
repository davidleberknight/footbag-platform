/**
 * Competition results on a member profile, reached by the identity the member
 * claimed rather than by an old-site account.
 *
 * The profile looks up results in three steps, each running only when the one
 * before it found nothing: rows linked directly to the member, then rows under
 * their legacy account, then rows under the historical person they claimed. The
 * third step is the one under test. Without it a member who claimed an archival
 * identity that never had an account sees "no competitive results" while the
 * archive holds them, and the claim page that persuaded them to claim said the
 * opposite would happen.
 *
 * The ordering matters as much as the branch. A member whose account already
 * returns results must not fall through, or a change meant to fill an empty
 * section would quietly rewrite a populated one.
 *
 * The leak direction is the one worth most of the attention here. Results are
 * keyed on the viewed member's own anchor, so a person nobody claimed, and a
 * person another member claimed, must both stay off this profile.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertEvent,
  insertDiscipline,
  insertResultsUpload,
  insertResultEntry,
  insertResultParticipant,
  insertMember,
  insertHistoricalPerson,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3097');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let memberServiceMod: typeof import('../../src/services/memberService');

let db: Database.Database;
/** Whoever uploaded the results. Irrelevant to what is under test, but a result
 *  entry needs an upload and an upload needs a member. */
let uploaderId: string;

beforeAll(async () => {
  db = createTestDb(dbPath);
  uploaderId = insertMember(db, { slug: 'results_uploader', real_name: 'Results Uploader' });
  memberServiceMod = await import('../../src/services/memberService');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

/** One event with one doubles result, and whoever the caller names on it. */
function seedResult(
  participants: Array<{ name: string; personId?: string | null; memberId?: string | null }>,
  opts: { title?: string; tag?: string } = {},
): string {
  const eventId = insertEvent(db, {
    title: opts.title ?? 'Test Open',
    hashtag: opts.tag ?? `testopen${Math.random().toString(36).slice(2, 8)}`,
  });
  const disciplineId = insertDiscipline(db, eventId, { name: 'Open Doubles Net' });
  const uploadId = insertResultsUpload(db, eventId, uploaderId);
  const entryId = insertResultEntry(db, eventId, uploadId, disciplineId, { placement: 1 });
  participants.forEach((p, i) =>
    insertResultParticipant(db, entryId, p.name, {
      participant_order: i + 1,
      historical_person_id: p.personId ?? null,
      member_id: p.memberId ?? null,
    }),
  );
  return eventId;
}

/** The profile's own lookup, exercised through the shipped statements. */
function resultsFor(memberSlug: string) {
  return memberServiceMod.memberService.getOwnProfile(memberSlug).content.eventGroups;
}

describe('a member who claimed a historical person and never had an account', () => {
  it('sees the results held under that person', () => {
    const personId = insertHistoricalPerson(db, { person_name: 'Claimed Competitor' });
    const slug = 'claimed_competitor';
    insertMember(db, {
      slug,
      real_name: 'Claimed Competitor',
      historical_person_id: personId,
      legacy_member_id: null,
    });
    seedResult(
      [
        { name: 'Claimed Competitor', personId },
        { name: 'Their Partner', personId: insertHistoricalPerson(db, { person_name: 'Their Partner' }) },
      ],
      { title: 'Claimed Open' },
    );

    const groups = resultsFor(slug);
    expect(groups).toHaveLength(1);
    expect(groups[0].eventTitle).toBe('Claimed Open');
  });

  it('does not appear as their own partner', () => {
    // The branch passes the member's own person id as the identity to suppress.
    // Without it the profile lists the member as their own teammate.
    const personId = insertHistoricalPerson(db, { person_name: 'Solo Claimer' });
    const partnerId = insertHistoricalPerson(db, { person_name: 'Real Partner' });
    const slug = 'solo_claimer';
    insertMember(db, {
      slug,
      real_name: 'Solo Claimer',
      historical_person_id: personId,
      legacy_member_id: null,
    });
    seedResult([
      { name: 'Solo Claimer', personId },
      { name: 'Real Partner', personId: partnerId },
    ]);

    const [group] = resultsFor(slug);
    const teammateNames = group.results.flatMap((r: { teammates: Array<{ name: string }> }) =>
      r.teammates.map((t) => t.name),
    );
    expect(teammateNames).toContain('Real Partner');
    expect(teammateNames).not.toContain('Solo Claimer');
  });
});

describe('the branch cannot reach results that are not this member\'s', () => {
  it('a member with no anchors at all sees nothing', () => {
    // The unanchored case: neither an account nor a claimed identity. An
    // unclaimed person's results exist in the same database and must stay off
    // this profile.
    const orphanPersonId = insertHistoricalPerson(db, { person_name: 'Unclaimed Person' });
    seedResult([{ name: 'Unclaimed Person', personId: orphanPersonId }]);

    const slug = 'no_anchors';
    insertMember(db, {
      slug,
      real_name: 'No Anchors',
      historical_person_id: null,
      legacy_member_id: null,
    });

    expect(resultsFor(slug)).toHaveLength(0);
  });

  it('two members claiming two people see only their own', () => {
    const personA = insertHistoricalPerson(db, { person_name: 'Competitor A' });
    const personB = insertHistoricalPerson(db, { person_name: 'Competitor B' });
    insertMember(db, {
      slug: 'member_a',
      real_name: 'Competitor A',
      historical_person_id: personA,
      legacy_member_id: null,
    });
    insertMember(db, {
      slug: 'member_b',
      real_name: 'Competitor B',
      historical_person_id: personB,
      legacy_member_id: null,
    });
    seedResult([{ name: 'Competitor A', personId: personA }], { title: 'A Only Open' });
    seedResult([{ name: 'Competitor B', personId: personB }], { title: 'B Only Open' });

    const aTitles = resultsFor('member_a').map((g: { eventTitle: string }) => g.eventTitle);
    const bTitles = resultsFor('member_b').map((g: { eventTitle: string }) => g.eventTitle);

    expect(aTitles).toEqual(['A Only Open']);
    expect(bTitles).toEqual(['B Only Open']);
  });
});

describe('a member whose earlier lookup already succeeded does not fall through', () => {
  it('a direct member-linked result is not replaced by the person branch', () => {
    // Both anchors present and both carry results. The direct link wins, so a
    // populated section keeps exactly what it had.
    const personId = insertHistoricalPerson(db, { person_name: 'Dual Anchored' });
    const slug = 'dual_anchored';
    const memberId = insertMember(db, {
      slug,
      real_name: 'Dual Anchored',
      historical_person_id: personId,
      legacy_member_id: null,
    });
    seedResult([{ name: 'Dual Anchored', memberId }], { title: 'Direct Link Open' });
    seedResult([{ name: 'Dual Anchored', personId }], { title: 'Person Anchor Open' });

    const titles = resultsFor(slug).map((g: { eventTitle: string }) => g.eventTitle);
    expect(titles).toEqual(['Direct Link Open']);
    expect(titles).not.toContain('Person Anchor Open');
  });

  it('a legacy-account result is not replaced by the person branch', () => {
    const legacyId = '99001';
    const personId = insertHistoricalPerson(db, {
      person_name: 'Account Holder',
      legacy_member_id: legacyId,
    });
    const otherPersonId = insertHistoricalPerson(db, { person_name: 'Account Holder Archive' });
    const slug = 'account_holder';
    insertMember(db, {
      slug,
      real_name: 'Account Holder',
      historical_person_id: otherPersonId,
      legacy_member_id: legacyId,
    });
    seedResult([{ name: 'Account Holder', personId }], { title: 'Legacy Account Open' });
    seedResult([{ name: 'Account Holder', personId: otherPersonId }], { title: 'Person Anchor Open' });

    const titles = resultsFor(slug).map((g: { eventTitle: string }) => g.eventTitle);
    expect(titles).toEqual(['Legacy Account Open']);
    expect(titles).not.toContain('Person Anchor Open');
  });
});
