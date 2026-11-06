/**
 * The country table every member, club and event write folds through.
 *
 * One place must be stored under one name, or a country splits across the
 * Official IFPA Roster, the clubs directory and the duplicate-club checks. The
 * picker therefore offers each country once, any spelling people actually
 * write folds to that name, a spelling naming no country is refused rather than
 * guessed, and a country's short token (its clubs page address and the country
 * slot of a club hashtag) is the concise form people type.
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalCountryName, countryCode, countryFlag, countryNames, countrySlug, personLocation,
  subdivisionsForCountry,
} from '../../src/services/countryUtils';
import { regionRequiredForCountry } from '../../src/services/memberLocationRules';

describe('the picker offers each country once', () => {
  it('offers names that fold to themselves, each with its own flag', () => {
    // Broken, a picked country would be stored under another spelling, or
    // render with no flag, or two picker entries would name one country.
    const names = countryNames();
    const flags = new Set<string>();
    for (const name of names) {
      expect(canonicalCountryName(name), name).toBe(name);
      const flag = countryFlag(name);
      expect([...flag].length, name).toBe(2);
      expect(flags.has(flag), `${name} shares a flag`).toBe(false);
      flags.add(flag);
    }
  });

  it('offers the countries real members live in that a short list left out', () => {
    // Broken, a member in one of these countries cannot record where they live.
    for (const name of ['Lithuania', 'Singapore', 'Serbia', 'Iceland', 'Georgia', 'Costa Rica']) {
      expect(countryNames(), name).toContain(name);
    }
  });
});

describe('a spelling folds to the canonical name', () => {
  it('folds abbreviations, constituent nations, native and bilingual names, ignoring case, dots and accents', () => {
    // Broken, a legacy or hand-typed spelling is dropped on a claim, or stored
    // apart from the same country's other rows.
    const cases: Array<[string, string]> = [
      ['USA', 'United States'], ['u.s.a.', 'United States'], ['us', 'United States'],
      ['United States of America', 'United States'],
      ['England', 'United Kingdom'], ['UK', 'United Kingdom'], ['Great Britain', 'United Kingdom'],
      ['Deutschland', 'Germany'], ['Polska', 'Poland'], ['Brasil', 'Brazil'],
      ['México', 'Mexico'], ['España', 'Spain'], ['Česká republika', 'Czech Republic'],
      ['Slovak Republic', 'Slovakia'], ['The Netherlands', 'Netherlands'],
      ['Aotearoa', 'New Zealand'], ['Éire', 'Ireland'], ['Cymru', 'United Kingdom'],
      ['CAN', 'Canada'], ['nz', 'New Zealand'],
    ];
    for (const [spelling, name] of cases) {
      expect(canonicalCountryName(spelling), spelling).toBe(name);
    }
  });

  it('refuses a spelling that names no country rather than guessing', () => {
    // Broken, junk such as "unknown country" would be stored as a country.
    for (const spelling of ['unknown country', 'Freedonia', '', '   ']) {
      expect(canonicalCountryName(spelling), spelling).toBeNull();
    }
    expect(countryCode('Freedonia')).toBe('Freedonia');
    expect(countryFlag('Freedonia')).toBe('');
  });
});

describe('the short token people type', () => {
  it('is the concise form for countries named with formal words, and the plain slug otherwise', () => {
    // Broken, a clubs page address or club hashtag carries "united_states"
    // where people type "usa", or the US page splits across two addresses.
    const cases: Array<[string, string]> = [
      ['United States', 'usa'], ['USA', 'usa'], ['United Kingdom', 'uk'], ['England', 'uk'],
      ['Czech Republic', 'czech'], ['Canada', 'canada'], ['New Zealand', 'new_zealand'],
      ['Freedonia Land', 'freedonia_land'],
    ];
    for (const [country, token] of cases) {
      expect(countrySlug(country), country).toBe(token);
    }
  });
});

describe('the region rule reads the same table', () => {
  it('requires a region for every spelling of the United States and Canada, and nowhere else', () => {
    // Broken, a spelling of the US or Canada would escape the state or
    // province requirement, or another country would be held to it.
    for (const country of ['United States', 'United States of America', 'USA', 'CAN', 'Canada']) {
      expect(regionRequiredForCountry(country), country).toBe(true);
      expect(subdivisionsForCountry(country).length, country).toBeGreaterThan(0);
    }
    for (const country of ['Mexico', 'Georgia', 'New Zealand']) {
      expect(regionRequiredForCountry(country), country).toBe(false);
    }
  });
});

describe('a person\'s location reads one way on every page', () => {
  it('names the country alone as Country, and with a city or region as Location, country last', () => {
    // Broken, a player with only a country would show an unlabeled word, or a
    // member with a city would be labeled as if only the country were known.
    expect(personLocation(null, null, 'Finland')).toEqual({ label: 'Country', text: 'Finland' });
    expect(personLocation('Boulder', 'CO', 'United States'))
      .toEqual({ label: 'Location', text: 'Boulder, CO, United States' });
    expect(personLocation(null, 'CO', 'United States'))
      .toEqual({ label: 'Location', text: 'CO, United States' });
    expect(personLocation('Helsinki', null, null)).toEqual({ label: 'Location', text: 'Helsinki' });
  });

  it('shows the canonical name for any spelling, and an unknown spelling as written', () => {
    // Broken, one country would read "USA" on one page and "United States" on
    // another, or a legacy value naming no country would vanish.
    expect(personLocation(' Austin ', '', 'usa')?.text).toBe('Austin, United States');
    expect(personLocation(null, null, 'Cananda')?.text).toBe('Cananda');
  });

  it('gives nothing when no part is on file', () => {
    // Broken, the facts strip would render an empty "Country:" fact.
    expect(personLocation(null, null, null)).toBeNull();
    expect(personLocation(' ', '', undefined)).toBeNull();
  });
});
