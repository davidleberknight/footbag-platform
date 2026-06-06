import { describe, it, expect } from 'vitest';
import { stableClubId } from '../../src/services/clubTag';

// A promoted candidate must land on the same clubs.id the data pipeline
// derives for the same legacy key (sha1 of the key, first 24 hex chars,
// 'club_' prefix). The expected values below were produced by the pipeline
// implementation; byte parity here is what makes platform promotion and
// pipeline pre-population converge on identical rows.
describe('stableClubId pipeline parity', () => {
  it('derives the pipeline id for known legacy keys', () => {
    expect(stableClubId('austin')).toBe('club_7ea35d812706d92138687490');
    expect(stableClubId('1466041249')).toBe('club_9db2b3e371b35996d8188dec');
    expect(stableClubId('les_pieds_a_gilles')).toBe('club_01c3d34fed8ca88a5a1f4c28');
    expect(stableClubId('club-test-key')).toBe('club_dac47f337ddf1afb5203f9ee');
  });

  it('is deterministic and key-sensitive', () => {
    expect(stableClubId('austin')).toBe(stableClubId('austin'));
    expect(stableClubId('austin')).not.toBe(stableClubId('austin2'));
  });

  it('always yields the club_ prefix and a 24-hex-char digest', () => {
    expect(stableClubId('anything')).toMatch(/^club_[0-9a-f]{24}$/);
  });
});
