import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/services/slugify';

describe('slugify', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(slugify('John Doe')).toBe('john_doe');
  });

  it('collapses multiple spaces', () => {
    expect(slugify('John  Doe')).toBe('john_doe');
  });

  it('strips non-alphanumeric characters', () => {
    expect(slugify("O'Brien Jr.")).toBe('obrien_jr');
  });

  it('strips accented characters (non-ASCII)', () => {
    expect(slugify('Jean-Pierre Müller')).toBe('jeanpierre_mller');
  });

  it('trims leading and trailing underscores', () => {
    expect(slugify(' _test_ ')).toBe('test');
  });

  it('returns empty string for all non-ASCII input', () => {
    expect(slugify('日本語')).toBe('');
  });

  it('preserves numbers', () => {
    expect(slugify('Player 99')).toBe('player_99');
  });

  it('passes through an already-clean slug', () => {
    expect(slugify('alice_smith')).toBe('alice_smith');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('collapses consecutive underscores from mixed special characters', () => {
    expect(slugify('a---b___c')).toBe('ab_c');
  });

  it('handles single character', () => {
    expect(slugify('A')).toBe('a');
  });

  it('handles whitespace-only input', () => {
    expect(slugify('   ')).toBe('');
  });
});
