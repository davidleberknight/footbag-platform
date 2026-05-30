/**
 * Persona harness — graded auto-link confidence.
 *
 * seedPersona's `legacy.autoLinkConfidence` dimension must seed rows that the
 * real classifier resolves into the named bucket on the single-candidate path.
 * This drives identityAccessService.getAutoLinkClassificationForMember against
 * harness-seeded personas, so it also fails the build if the in-harness name
 * normalization (used to write the `medium` name_variants row) ever drifts from
 * the service normalizer. The exhaustive branch matrix lives in
 * tests/integration/auto-link.scenarios.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedPersona } from '../../src/testkit/personaFactory';

const { dbPath } = setTestEnv('3405');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identitySvc: typeof import('../../src/services/identityAccessService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedPersona(db, {
    slug: 'al_high', displayName: 'Hy High', realName: 'Hy Highmatch',
    tier: 'tier0', legacy: { autoLinkConfidence: 'high' }, coverageNotes: ['high'],
  });
  seedPersona(db, {
    slug: 'al_medium', displayName: 'Em Med', realName: 'Em Midmatch',
    tier: 'tier0', legacy: { autoLinkConfidence: 'medium' }, coverageNotes: ['medium'],
  });
  seedPersona(db, {
    slug: 'al_low', displayName: 'El Low', realName: 'El Lowmatch',
    tier: 'tier0', legacy: { autoLinkConfidence: 'low' }, coverageNotes: ['low'],
  });
  db.close();
  await importApp();
  identitySvc = await import('../../src/services/identityAccessService');
});

afterAll(() => cleanupTestDb(dbPath));

describe('persona autoLinkConfidence → classifier bucket', () => {
  it('high persona resolves to high (exact name match)', () => {
    const r = identitySvc.identityAccessService.getAutoLinkClassificationForMember('member_persona_al_high');
    expect(r.confidence).toBe('high');
  });

  it('medium persona resolves to medium (same-surname name_variants match)', () => {
    const r = identitySvc.identityAccessService.getAutoLinkClassificationForMember('member_persona_al_medium');
    expect(r.confidence).toBe('medium');
  });

  it('low persona resolves to low/no_name_candidate', () => {
    const r = identitySvc.identityAccessService.getAutoLinkClassificationForMember('member_persona_al_low');
    expect(r.confidence).toBe('low');
    if (r.confidence === 'low') expect(r.reason).toBe('no_name_candidate');
  });
});
