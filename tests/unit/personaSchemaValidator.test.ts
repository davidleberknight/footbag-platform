/**
 * Unit coverage for the .local persona schema validator.
 *
 * validatePersonaSpec is the up-front guard the seed runner and the
 * /dev/personas listing route both run against hand-edited
 * .local/test-personas.json, so a malformed entry fails with a slug+field
 * message instead of an opaque SQLite constraint violation inside seedPersona.
 * These cases pin every dimension's reject path plus a full-spec accept path,
 * and assert the shipped canonical catalog round-trips through the validator
 * (guarding the validator against the spec it is meant to mirror).
 *
 * Pure (no DB, no HTTP, no env guard): the validator imports only seedCli and
 * node builtins at runtime.
 */
import { describe, it, expect } from 'vitest';
import { validatePersonaSpec } from '../../src/testkit/personaSchemaValidator';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';

const L = '.local/test-personas.json[0]';

/** A spec exercising every supported dimension; each invalid case mutates a clone. */
function validFullSpec(): Record<string, unknown> {
  return {
    slug: 'full_spec',
    displayName: 'Full Spec',
    realName: 'Full Real Name',
    loginEmail: 'full@personas.test',
    tier: 'tier3',
    underlyingTier: 'tier2',
    isAdmin: true,
    onboardingTasks: { personal_details: 'completed', legacy_claim: 'in_progress_paused' },
    payments: [{ type: 'membership', status: 'succeeded', amountCents: 2500, purchasedTier: 'tier2' }],
    legacy: { linked: false, realName: 'Legacy Name', legacyEmail: 'legacy@old.test', autoLinkConfidence: 'medium' },
    club: { clubName: 'Persona Club', leader: true },
    clubs: [{ clubName: 'Second Club', current: false, primary: false, contact: true }],
    legacyClubCandidates: [{ clubName: 'Cand Club', classification: 'onboarding_visible', resolutionStatus: 'pending', mapped: false }],
    activePlayer: { expiresAt: '2025-01-01T00:00:00.000Z', reasonCode: 'attendance' },
    mailingList: [{ listSlug: 'announce', status: 'subscribed' }],
    coverageNotes: ['exercises every dimension'],
  };
}

describe('validatePersonaSpec — accept paths', () => {
  it('accepts a spec exercising every supported dimension', () => {
    const spec = validatePersonaSpec(validFullSpec(), L);
    expect(spec.slug).toBe('full_spec');
  });

  it('accepts a minimal spec (slug + displayName + tier + coverageNotes)', () => {
    expect(() =>
      validatePersonaSpec(
        { slug: 'm', displayName: 'M', tier: 'tier0', coverageNotes: ['baseline'] },
        L,
      ),
    ).not.toThrow();
  });

  it('accepts a single (non-array) mailingList object', () => {
    const spec = validFullSpec();
    spec.mailingList = { listSlug: 'announce', status: 'unsubscribed' };
    expect(() => validatePersonaSpec(spec, L)).not.toThrow();
  });
});

describe('validatePersonaSpec — reject paths name the slug + field', () => {
  it('non-object entry', () => {
    expect(() => validatePersonaSpec(null, L)).toThrow(/must be an object/);
    expect(() => validatePersonaSpec([], L)).toThrow(/must be an object/);
  });

  it('missing slug (cannot reference a slug it does not have)', () => {
    expect(() => validatePersonaSpec({ displayName: 'X', tier: 'tier0', coverageNotes: ['c'] }, L)).toThrow(
      /slug must be a non-empty string/,
    );
  });

  it('unknown top-level key', () => {
    const spec = { ...validFullSpec(), bogusField: true };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*unknown field 'bogusField'/);
  });

  it('empty displayName', () => {
    const spec = { ...validFullSpec(), displayName: '' };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*displayName/);
  });

  it('bad tier', () => {
    const spec = { ...validFullSpec(), tier: 'tier9' };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*tier must be one of/);
  });

  it('tier3 without underlyingTier', () => {
    const spec = validFullSpec();
    delete spec.underlyingTier;
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*underlyingTier is required for tier3/);
  });

  it('underlyingTier on a non-tier3 spec must still be valid', () => {
    const spec = { ...validFullSpec(), tier: 'tier1', underlyingTier: 'tier9' };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*underlyingTier must be one of/);
  });

  it('non-boolean isAdmin', () => {
    const spec = { ...validFullSpec(), isAdmin: 'yes' };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*isAdmin must be a boolean/);
  });

  it('unknown onboarding task type', () => {
    const spec = validFullSpec();
    spec.onboardingTasks = { not_a_task: 'completed' };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*onboardingTasks key 'not_a_task'/);
  });

  it('bad onboarding task state', () => {
    const spec = validFullSpec();
    spec.onboardingTasks = { personal_details: 'halfway' };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*onboardingTasks.personal_details/);
  });

  it('bad payment status', () => {
    const spec = validFullSpec();
    spec.payments = [{ type: 'membership', status: 'exploded' }];
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*payments\[0\].status/);
  });

  it('bad legacy.linked type', () => {
    const spec = validFullSpec();
    spec.legacy = { linked: 'nope' };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*legacy.linked/);
  });

  it('bad legacy.autoLinkConfidence value', () => {
    const spec = validFullSpec();
    (spec.legacy as Record<string, unknown>).autoLinkConfidence = 'maybe';
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*legacy.autoLinkConfidence must be one of/);
  });

  it('autoLinkConfidence with linked:true is rejected', () => {
    const spec = validFullSpec();
    (spec.legacy as Record<string, unknown>).linked = true;
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*autoLinkConfidence requires an unlinked/);
  });

  it('legacyClubCandidates without a legacy identity', () => {
    const spec = validFullSpec();
    delete spec.legacy;
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*legacyClubCandidates require a legacy identity/);
  });

  it('bad legacyClubCandidates classification', () => {
    const spec = validFullSpec();
    (spec.legacyClubCandidates as Record<string, unknown>[])[0].classification = 'bogus';
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*legacyClubCandidates\[0\].classification/);
  });

  it('bad club flag type', () => {
    const spec = validFullSpec();
    spec.clubs = [{ clubName: 'C', current: 'maybe' }];
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*clubs\[0\].current/);
  });

  it('missing activePlayer.expiresAt', () => {
    const spec = validFullSpec();
    spec.activePlayer = { reasonCode: 'attendance' };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*activePlayer.expiresAt/);
  });

  it('bad mailingList status', () => {
    const spec = validFullSpec();
    spec.mailingList = [{ listSlug: 'announce', status: 'maybe' }];
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*mailingList\[0\].status/);
  });

  it('empty coverageNotes', () => {
    const spec = { ...validFullSpec(), coverageNotes: [] };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*coverageNotes must be a non-empty array/);
  });

  it('non-string coverageNotes entry', () => {
    const spec = { ...validFullSpec(), coverageNotes: ['ok', 42] };
    expect(() => validatePersonaSpec(spec, L)).toThrow(/slug=full_spec.*coverageNotes\[1\]/);
  });
});

describe('validatePersonaSpec — canonical catalog round-trips', () => {
  it('every CANONICAL_PERSONAS entry passes the validator', () => {
    for (const spec of CANONICAL_PERSONAS) {
      expect(() => validatePersonaSpec(spec, `canonical:${spec.slug}`)).not.toThrow();
    }
  });
});
