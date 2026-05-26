import { describe, it, expect } from 'vitest';
import { slugify, slugifyForTag } from '../../src/services/slugify';

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

describe('slugifyForTag', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(slugifyForTag('Denver')).toBe('denver');
  });

  it('handles multi-word city names', () => {
    expect(slugifyForTag('San Francisco')).toBe('san_francisco');
  });

  it('strips diacritics via NFD normalization', () => {
    expect(slugifyForTag('München')).toBe('munchen');
    expect(slugifyForTag('São Paulo')).toBe('sao_paulo');
    expect(slugifyForTag('Łódź')).toBe('lodz');
  });

  it('handles L-stroke, O-stroke, D-stroke via pre-NFD map', () => {
    expect(slugifyForTag('Ørsted')).toBe('orsted');
    expect(slugifyForTag('Đakovo')).toBe('dakovo');
  });

  it('replaces non-alphanumeric with underscores', () => {
    expect(slugifyForTag('New York - USA')).toBe('new_york_usa');
  });

  it('collapses consecutive underscores', () => {
    expect(slugifyForTag('a---b___c')).toBe('a_b_c');
  });

  it('strips leading and trailing underscores', () => {
    expect(slugifyForTag('  _test_  ')).toBe('test');
  });

  it('returns empty string for empty input', () => {
    expect(slugifyForTag('')).toBe('');
  });

  it('preserves digits', () => {
    expect(slugifyForTag('Club 42')).toBe('club_42');
  });

  it('handles already-clean input', () => {
    expect(slugifyForTag('portland')).toBe('portland');
  });

  it('handles all-special-character input', () => {
    expect(slugifyForTag('!!!')).toBe('');
  });
});
