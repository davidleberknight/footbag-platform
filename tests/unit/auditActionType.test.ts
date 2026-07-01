import { describe, it, expect } from 'vitest';
import { assertCanonicalActionType } from '../../src/services/auditService';

// Contract: audit action_type is a closed vocabulary of lowercase, dotted,
// domain-prefixed values. The write path rejects any value that is not
// namespaced, so a malformed label can never reach a durable audit row.
describe('assertCanonicalActionType', () => {
  it('accepts lowercase dotted domain.event values, including multi-segment ones', () => {
    for (const value of [
      'auth.register',
      'admin.role_granted',
      'wizard.task.started',
      'testkit.persona_seed',
      'admin.club_cleanup.delist_residue',
      'media.curated_url_reference_added',
    ]) {
      expect(() => assertCanonicalActionType(value)).not.toThrow();
    }
  });

  it('rejects a non-namespaced value', () => {
    expect(() => assertCanonicalActionType('upload_member_media')).toThrow(
      /dotted domain\.event/,
    );
  });

  it('rejects empty, uppercase, leading-dot, and trailing-dot values', () => {
    for (const value of ['', 'auth', 'Auth.Register', '.register', 'auth.']) {
      expect(() => assertCanonicalActionType(value)).toThrow();
    }
  });
});
