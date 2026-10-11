/**
 * City casing rule shared by every path that writes a city: a city written
 * with no capital letter has each word capitalized, and a city carrying any
 * capital is kept exactly as written. The import path applies the same rule
 * to a city copied out of a legacy record.
 */
import { describe, it, expect } from 'vitest';
import {
  capitalizeLowercaseCity,
  normalizeImportedLocation,
} from '../../src/services/memberLocationRules';

describe('capitalizeLowercaseCity', () => {
  it('capitalizes every word of an all-lowercase city', () => {
    // A member who never pressed shift would otherwise show as "tauranga" on
    // their profile and on every roster that lists them.
    expect(capitalizeLowercaseCity('tauranga')).toBe('Tauranga');
    expect(capitalizeLowercaseCity('san luis obispo')).toBe('San Luis Obispo');
    expect(capitalizeLowercaseCity('st. louis')).toBe('St. Louis');
  });

  it('treats a hyphen as a word boundary', () => {
    expect(capitalizeLowercaseCity('winston-salem')).toBe('Winston-Salem');
  });

  it('capitalizes a word that opens with an accented letter', () => {
    // An ASCII-only letter class would leave "évry" and "örebro" lowercase.
    expect(capitalizeLowercaseCity('évry')).toBe('Évry');
    expect(capitalizeLowercaseCity('são paulo')).toBe('São Paulo');
    expect(capitalizeLowercaseCity('örebro')).toBe('Örebro');
  });

  it('keeps any city carrying a capital exactly as written', () => {
    // Title-casing these would damage names their writer spelled correctly.
    for (const city of ['McAllen', 'La Jolla', 'NYC', 'BOULDER', 'tauRanga', "St. John's"]) {
      expect(capitalizeLowercaseCity(city), city).toBe(city);
    }
  });

  it('leaves a value with no cased letters, and the empty string, alone', () => {
    expect(capitalizeLowercaseCity('')).toBe('');
    expect(capitalizeLowercaseCity('12345')).toBe('12345');
    expect(capitalizeLowercaseCity('東京')).toBe('東京');
  });

  it('is stable when applied to its own output', () => {
    const once = capitalizeLowercaseCity('coeur d\'alene');
    expect(capitalizeLowercaseCity(once)).toBe(once);
  });
});

describe('normalizeImportedLocation applies the city casing rule', () => {
  it('capitalizes an all-lowercase imported city and keeps a cased one', () => {
    expect(
      normalizeImportedLocation({ city: 'tauranga', region: null, country: 'New Zealand' }).city,
    ).toBe('Tauranga');
    expect(
      normalizeImportedLocation({ city: 'McAllen', region: 'TX', country: 'USA' }).city,
    ).toBe('McAllen');
  });

  it('still drops an over-long city rather than storing it', () => {
    expect(
      normalizeImportedLocation({ city: 'a'.repeat(65), region: null, country: null }).city,
    ).toBeNull();
  });
});
