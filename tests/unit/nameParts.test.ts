/**
 * The surname a member is matched by comes from the part they recorded, not
 * from a guess at which word of their full name is the family name.
 *
 * The guess is still what the legacy and historical records get, because those
 * carry one name string and always will, so both paths are pinned here.
 */
import { describe, it, expect } from 'vitest';
import {
  assembleFullName, memberSurnameKey, surnameKey, surnameKeyMatchesName,
} from '../../src/services/nameUtils';

describe('assembleFullName', () => {
  it('puts given names first', () => {
    expect(assembleFullName('Jane', 'Footbagger')).toBe('Jane Footbagger');
  });

  it('carries a multi-word part through whole', () => {
    expect(assembleFullName('José Reynel', 'Reynel López')).toBe('José Reynel Reynel López');
    expect(assembleFullName('Aaron', 'de Glanville')).toBe('Aaron de Glanville');
  });

  it('produces just the part that is present when one is missing', () => {
    expect(assembleFullName('Sukarno', '')).toBe('Sukarno');
    expect(assembleFullName('', 'Ollivier')).toBe('Ollivier');
    expect(assembleFullName('', '')).toBe('');
  });

  it('trims each part rather than leaving a double space between them', () => {
    expect(assembleFullName('  Jane  ', '  Footbagger  ')).toBe('Jane Footbagger');
  });
});

describe('memberSurnameKey', () => {
  it('uses the recorded family name', () => {
    expect(memberSurnameKey({
      family_name: 'Footbagger', given_names: 'Jane', real_name: 'Jane Footbagger',
    })).toBe('footbagger');
  });

  // This is the case the old guess got wrong: taking the last word gave
  // "lópez", so the member never matched their own record.
  it('keeps a two-surname family name whole where the guess would take the last word', () => {
    const parts = {
      family_name: 'Reynel López',
      given_names: 'José',
      real_name: 'José Reynel López',
    };
    expect(memberSurnameKey(parts)).toBe('reynel lopez');
    expect(surnameKey(parts.real_name)).toBe('lopez');
  });

  it('keeps a particle attached to the family name', () => {
    expect(memberSurnameKey({
      family_name: 'de Glanville', given_names: 'Aaron', real_name: 'Aaron de Glanville',
    })).toBe('de glanville');
  });

  it('folds accents so a match does not turn on a diacritic', () => {
    expect(memberSurnameKey({ family_name: 'Müller', given_names: 'André', real_name: 'André Müller' }))
      .toBe('muller');
  });

  // A member with a single legal name records it as their family name, so the
  // key comes from the same column as everyone else's.
  it('uses the family name for a member who has only that', () => {
    expect(memberSurnameKey({ family_name: 'Sukarno', given_names: null, real_name: 'Sukarno' }))
      .toBe('sukarno');
  });

  // Every record on the other side of a comparison, and any member row written
  // before the parts existed, still resolves through the old derivation.
  it('falls back to guessing from the full name when no part is recorded', () => {
    expect(memberSurnameKey({ family_name: null, given_names: null, real_name: 'Jane Footbagger' }))
      .toBe('footbagger');
  });

  it('is empty when there is nothing to go on, so two blanks never compare equal', () => {
    expect(memberSurnameKey({ family_name: null, given_names: null, real_name: null })).toBe('');
    expect(memberSurnameKey({ family_name: null, given_names: null, real_name: '' })).toBe('');
  });
});

// The two sides of every surname comparison are different shapes: the member's
// is a recorded family name that may be several words, the record's is one name
// string that never will be split. Comparing last word to last word refuses
// every member whose family name is more than one word, which is precisely the
// member the recorded part exists for.
describe('surnameKeyMatchesName', () => {
  it('matches a one-word family name at the end of a full name', () => {
    expect(surnameKeyMatchesName('footbagger', 'Jane Footbagger')).toBe(true);
  });

  it('matches a two-word family name that a last-word comparison would refuse', () => {
    expect(surnameKeyMatchesName('reynel lopez', 'José Reynel López')).toBe(true);
    expect(surnameKeyMatchesName('de glanville', 'Aaron de Glanville')).toBe(true);
  });

  it('matches a member whose whole name is their family name', () => {
    expect(surnameKeyMatchesName('ollivier', 'Ollivier')).toBe(true);
    expect(surnameKeyMatchesName('sukarno', 'Sukarno')).toBe(true);
  });

  it('ignores a suffix on the record', () => {
    expect(surnameKeyMatchesName('reynel lopez', 'José Reynel López Jr')).toBe(true);
    expect(surnameKeyMatchesName('footbagger', 'Jane Footbagger III')).toBe(true);
  });

  it('folds accents on both sides', () => {
    expect(surnameKeyMatchesName('muller', 'André Müller')).toBe(true);
  });

  // The tail rule must not become a substring rule: sharing a final word is not
  // sharing the family name, or a claim could reach the wrong person.
  it('refuses a record that merely ends in the same final word', () => {
    expect(surnameKeyMatchesName('reynel lopez', 'Ana López')).toBe(false);
    expect(surnameKeyMatchesName('de glanville', 'Aaron Glanville')).toBe(false);
  });

  it('refuses a partial word match', () => {
    expect(surnameKeyMatchesName('mann', 'Jane Hoffmann')).toBe(false);
  });

  it('refuses when either side is missing, so two blanks never match', () => {
    expect(surnameKeyMatchesName('', 'Jane Footbagger')).toBe(false);
    expect(surnameKeyMatchesName('footbagger', null)).toBe(false);
    expect(surnameKeyMatchesName('', null)).toBe(false);
  });
});
