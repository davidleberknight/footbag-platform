/**
 * The Title Case rule for platform-authored interface chrome, as an importable
 * function. These cases pin the decisions the prose form of the rule leaves
 * open, so a future edit to the function cannot quietly change what the site's
 * headings and button labels look like.
 */
import { describe, it, expect } from 'vitest';
import { toTitleCase, TITLE_CASE_MINOR_WORDS } from '../../src/lib/titleCase';

describe('toTitleCase', () => {
  it('capitalizes each significant word', () => {
    expect(toTitleCase('club members')).toBe('Club Members');
    expect(toTitleCase('recurring donations')).toBe('Recurring Donations');
  });

  it('leaves minor words lowercase inside the title', () => {
    expect(toTitleCase('Find media by hashtag')).toBe('Find Media by Hashtag');
    expect(toTitleCase('clubs in your area')).toBe('Clubs in Your Area');
    expect(toTitleCase('Grant a Hall of Fame or Big Add Posse tier')).toBe(
      'Grant a Hall of Fame or Big Add Posse Tier',
    );
  });

  it('capitalizes a minor word when it lands first or last', () => {
    expect(toTitleCase('to the top')).toBe('To the Top');
    expect(toTitleCase('a record of')).toBe('A Record Of');
  });

  it('lowercases a minor word that was capitalized mid-title', () => {
    expect(toTitleCase('Go To Home')).toBe('Go to Home');
  });

  it('only enumerates the ratified minor words', () => {
    // "with" and "from" are deliberately absent, so they capitalize like any
    // other word. A change here is a change to the rule, not to the code.
    expect(TITLE_CASE_MINOR_WORDS).toEqual([
      'a',
      'an',
      'as',
      'the',
      'and',
      'or',
      'nor',
      'but',
      'to',
      'of',
      'in',
      'on',
      'at',
      'by',
      'for',
    ]);
    expect(toTitleCase('Top events with issues')).toBe('Top Events With Issues');
    expect(toTitleCase('Recent from the community')).toBe('Recent From the Community');
  });

  it('treats a hyphen as part of one word, not as a boundary', () => {
    expect(toTitleCase('new consecutive-kicks record')).toBe('New Consecutive-kicks Record');
    expect(toTitleCase('assign a co-leader')).toBe('Assign a Co-leader');
    expect(toTitleCase('junk-flagged candidates')).toBe('Junk-flagged Candidates');
  });

  it('leaves a word starting with a digit exactly as written', () => {
    expect(toTitleCase('45th IFPA World Footbag Championships 2026')).toBe(
      '45th IFPA World Footbag Championships 2026',
    );
    expect(toTitleCase('2-Square rules')).toBe('2-Square Rules');
    expect(toTitleCase('team freestyle finals (1st place)')).toBe(
      'Team Freestyle Finals (1st Place)',
    );
  });

  it('leaves HTML character references alone', () => {
    // Named references are case-sensitive, so casing one produces a string that
    // no longer decodes and renders as literal text to the reader.
    expect(toTitleCase('Identity &amp; history')).toBe('Identity &amp; History');
    expect(toTitleCase('confidence &amp; status')).toBe('Confidence &amp; Status');
    expect(toTitleCase('a &ndash; b &hellip; c')).toBe('A &ndash; B &hellip; C');
    expect(toTitleCase('numeric &#8212; reference')).toBe('Numeric &#8212; Reference');
  });

  it('capitalizes an accented initial rather than the first ASCII letter', () => {
    expect(toTitleCase('über alles')).toBe('Über Alles');
    expect(toTitleCase('école normale')).toBe('École Normale');
    expect(toTitleCase('the éclair recipe')).toBe('The Éclair Recipe');
  });

  it('leaves a letter alone when uppercasing would change its length', () => {
    // The German sharp s uppercases to two characters; respelling a word is
    // not this rule's business.
    expect(toTitleCase('ßeta nord')).toBe('ßeta Nord');
    // An interior sharp s is untouched either way; only a leading one triggers
    // the guard, because only then would the word itself be respelled.
    expect(toTitleCase('straße nord')).toBe('Straße Nord');
  });

  it('does not mistake a non-ASCII word for a minor word once stripped', () => {
    // A dotted capital I lowercases to a letter plus a combining mark; an
    // ASCII-only comparison would read this as the minor word "of".
    expect(toTitleCase('See İof Now')).toBe('See İof Now');
  });

  it('never touches a word carrying an interior capital', () => {
    expect(toTitleCase('Back to IFPA hub')).toBe('Back to IFPA Hub');
    expect(toTitleCase('how ADD is built')).toBe('How ADD Is Built');
    expect(toTitleCase('the X-Dex family')).toBe('The X-Dex Family');
  });

  it('capitalizes through leading punctuation rather than being blocked by it', () => {
    expect(toTitleCase('Age (oldest first)')).toBe('Age (Oldest First)');
    expect(toTitleCase('"quoted heading"')).toBe('"Quoted Heading"');
  });

  it('preserves trailing punctuation and apostrophes', () => {
    expect(toTitleCase("still can't find your records?")).toBe("Still Can't Find Your Records?");
    expect(toTitleCase('confirm: grant admin role')).toBe('Confirm: Grant Admin Role');
  });

  it('preserves the original whitespace, including runs and non-breaking spaces', () => {
    expect(toTitleCase('two  spaces here')).toBe('Two  Spaces Here');
    expect(toTitleCase('nbsp separated words')).toBe('Nbsp Separated Words');
  });

  it('is idempotent, so the conformance gate can compare against its own output', () => {
    const samples = [
      'Club Members',
      'Find Media by Hashtag',
      'New Consecutive-kicks Record',
      '45th IFPA World Footbag Championships 2026',
      'Age (Oldest First)',
      "Still Can't Find Your Records?",
    ];
    for (const sample of samples) {
      expect(toTitleCase(sample)).toBe(sample);
      expect(toTitleCase(toTitleCase(sample))).toBe(sample);
    }
  });

  it('handles empty and whitespace-only input without throwing', () => {
    expect(toTitleCase('')).toBe('');
    expect(toTitleCase('   ')).toBe('   ');
  });

  it('capitalizes a single word regardless of whether it is a minor word', () => {
    expect(toTitleCase('account')).toBe('Account');
    expect(toTitleCase('the')).toBe('The');
  });
});
