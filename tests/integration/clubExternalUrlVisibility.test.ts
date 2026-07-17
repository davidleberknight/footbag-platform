/**
 * Club external-URL public visibility: hide until verified.
 *
 * A club's external_url renders publicly only once it has been verified at
 * data-prep time (external_url_validated_at stamped) and is not quarantined.
 * An unverified URL (validated_at NULL) and a quarantined URL are both hidden
 * from the public reads (listOpen, getByTagNormalized); the value still exists
 * on the row for the admin edit surface.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertClub, insertTag } from '../fixtures/factories';

const { dbPath } = setTestEnv('3124');

let clubs: typeof import('../../src/db/db').clubs;

const VERIFIED_URL = 'https://verified.example/club';
const UNVERIFIED_URL = 'https://unverified.example/club';
const QUARANTINED_URL = 'https://quarantined.example/club';

const VERIFIED_ID = 'club_vis_verified';
const UNVERIFIED_ID = 'club_vis_unverified';
const QUARANTINED_ID = 'club_vis_quarantined';

const VERIFIED_TAG = '#club_vis_verified';
const UNVERIFIED_TAG = '#club_vis_unverified';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const verifiedTag = insertTag(db, { standard_type: 'club', tag_normalized: VERIFIED_TAG });
  const unverifiedTag = insertTag(db, { standard_type: 'club', tag_normalized: UNVERIFIED_TAG });

  // Verified (validated, not quarantined) -> shown.
  insertClub(db, { id: VERIFIED_ID, hashtag_tag_id: verifiedTag, name: 'Verified Club', external_url: VERIFIED_URL });
  // Unverified (validated_at NULL) -> hidden.
  insertClub(db, {
    id: UNVERIFIED_ID, hashtag_tag_id: unverifiedTag, name: 'Unverified Club',
    external_url: UNVERIFIED_URL, external_url_validated_at: null,
  });
  // Quarantined (a quarantine_reason hides it even when validated) -> hidden.
  insertClub(db, {
    id: QUARANTINED_ID,
    hashtag_tag_id: insertTag(db, { standard_type: 'club', tag_normalized: '#club_vis_quarantined' }),
    name: 'Quarantined Club',
    external_url: QUARANTINED_URL, external_url_quarantine_reason: 'This URL is not allowed.',
  });
  db.close();

  ({ clubs } = await import('../../src/db/db'));
});

afterAll(() => cleanupTestDb(dbPath));

describe('clubs public read hides external_url until verified', () => {
  it('listOpen shows a verified URL and hides unverified + quarantined', () => {
    const rows = clubs.listOpen.all() as Array<{ club_id: string; external_url: string | null }>;
    const by = (id: string) => rows.find((r) => r.club_id === id);
    expect(by(VERIFIED_ID)?.external_url).toBe(VERIFIED_URL);
    expect(by(UNVERIFIED_ID)?.external_url).toBeNull();
    expect(by(QUARANTINED_ID)?.external_url).toBeNull();
  });

  it('getByTagNormalized shows a verified URL but hides an unverified one', () => {
    const verified = clubs.getByTagNormalized.get(VERIFIED_TAG) as { external_url: string | null } | undefined;
    const unverified = clubs.getByTagNormalized.get(UNVERIFIED_TAG) as { external_url: string | null } | undefined;
    expect(verified?.external_url).toBe(VERIFIED_URL);
    expect(unverified?.external_url).toBeNull();
  });
});
