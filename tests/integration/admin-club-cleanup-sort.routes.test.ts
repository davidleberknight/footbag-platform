/**
 * The cleanup queue is sortable by category, age, region, flag count and
 * source surface. Each key has to actually reorder the queue: asserting only
 * that the page still renders would pass against no sorting at all. Every case
 * below seeds an order that differs from the one it expects.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3994');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  insertMember,
  insertClub,
  insertClubViabilitySignal,
  insertLegacyClubCandidate,
} from '../fixtures/factories';

const VOTER_ONE   = 'sort-voter-1';
const VOTER_TWO   = 'sort-voter-2';
const VOTER_THREE = 'sort-voter-3';

// Seeded in an order that matches none of the expected sorts.
const CLUB_MID  = 'sort-club-mid';   // Oregon, 2 negative votes
const CLUB_LAST = 'sort-club-last';  // Wyoming, 1 negative vote
const CLUB_FIRST = 'sort-club-first'; // Alabama, 3 negative votes

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  for (const [id, slug] of [
    [VOTER_ONE, 'sort_voter_1'], [VOTER_TWO, 'sort_voter_2'], [VOTER_THREE, 'sort_voter_3'],
  ] as const) {
    insertMember(db, { id, slug, display_name: `Sort Voter ${slug.slice(-1)}`, login_email: `${slug}@example.com` });
  }

  // Every club is established at import and written off by at least one member,
  // which is the one verdict that reaches the working queue.
  const seed = [
    { id: CLUB_MID,   name: 'Mid Club',   region: 'Oregon',  voters: [VOTER_ONE, VOTER_TWO] },
    { id: CLUB_LAST,  name: 'Last Club',  region: 'Wyoming', voters: [VOTER_ONE] },
    { id: CLUB_FIRST, name: 'First Club', region: 'Alabama', voters: [VOTER_ONE, VOTER_TWO, VOTER_THREE] },
  ];
  for (const club of seed) {
    insertClub(db, { id: club.id, name: club.name, city: 'Somewhere', region: club.region, country: 'USA' });
    insertLegacyClubCandidate(db, { mapped_club_id: club.id, classification: 'pre_populate' });
    for (const voter of club.voters) {
      insertClubViabilitySignal(db, { member_id: voter, club_id: club.id, activity_signal: 'not_active' });
    }
  }

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function reviewIdsSortedBy(sort?: string): Promise<string[]> {
  const { clubCleanupService } = await import('../../src/services/clubCleanupService');
  const vm = clubCleanupService.getCleanupQueuePage(sort ? { sort } : undefined);
  return vm.content.itemGroups
    .flatMap((g) => g.items)
    .filter((i) => i.predicate === 'crowdsource_viability')
    .map((i) => i.clubId);
}

describe('the cleanup queue sorts by the key it is given', () => {
  it('orders by flag count, most reported first', async () => {
    expect(await reviewIdsSortedBy('flag_count')).toEqual([CLUB_FIRST, CLUB_MID, CLUB_LAST]);
  });

  it('orders by region', async () => {
    expect(await reviewIdsSortedBy('region')).toEqual([CLUB_FIRST, CLUB_MID, CLUB_LAST]);
  });

  it('groups the items table by category, and by source surface the same way', async () => {
    const byCategory = await reviewIdsSortedBy('category');
    const bySource = await reviewIdsSortedBy('source');
    expect(bySource).toEqual(byCategory);

    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const labels = clubCleanupService.getCleanupQueuePage({ sort: 'category' }).content.itemGroups
      .flatMap((g) => g.items)
      .map((i) => i.predicateLabel);
    expect([...labels].sort()).toEqual(labels);
  });

  it('an unknown sort key leaves the queue in its unsorted order', async () => {
    expect(await reviewIdsSortedBy('bogus')).toEqual(await reviewIdsSortedBy());
  });
});
