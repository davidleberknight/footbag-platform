/**
 * The real-claim builder registers a claimant under the legacy record's own real
 * name, so registration derives the profile slug from that name the way a genuine
 * registration does, rather than a synthetic id-based slug. This pins that a
 * record's real name registers cleanly and yields a name-derived, surname-bearing
 * slug -- the happy path the request-shape guards in build-claim.routes cannot
 * reach, and the exact step where the earlier digit-name and slug-surname failures
 * hid (both surfaced only through the operator's live crawl before this).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3437');

beforeAll(() => {
  const db = createTestDb(dbPath);
  db.close();
});

afterAll(() => cleanupTestDb(dbPath));

describe('real-claim builder registration', () => {
  it('registers under a record real name and derives a name-based, surname-bearing slug', async () => {
    // Dynamic imports so db.ts binds to this file's test DB. A static src/ import
    // would run before setTestEnv (hoisted), binding the db layer to the setup-env
    // ':memory:' default and reading an empty database.
    const { insertLegacyMember } = await import('../fixtures/factories');
    const { identityAccessService } = await import('../../src/services/identityAccessService');
    const { slugify } = await import('../../src/services/slugify');
    const { db } = await import('../../src/db/db');

    const realName = 'Regression Claimant';
    insertLegacyMember(db, { legacy_member_id: '900001', real_name: realName });

    // Mirror the builder's register call: the record's real name, no slug supplied,
    // so registration derives the slug itself.
    const result = await identityAccessService.registerMember(
      'real_claim_900001@personas.test',
      'real-claim-registration-probe-pw',
      'real-claim-registration-probe-pw',
      realName,
      realName,
      '127.0.0.1',
    );
    expect(result).toBeTruthy();

    const row = db
      .prepare('SELECT slug FROM members WHERE display_name = ?')
      .get(realName) as { slug: string } | undefined;
    expect(row?.slug).toBe(slugify(realName));
    // validateSlug requires the slug to contain the surname; a numeric-id slug did not.
    expect(row?.slug).toContain('claimant');
  });
});
