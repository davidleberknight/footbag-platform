/**
 * Confusable-skeleton algorithm and parser (Unicode UTS #39 skeleton, with the
 * documented lowercase pre-fold for display-name-identity consistency).
 *
 * These exercise the algorithm and the confusables-data parser against a small
 * hand-authored TEST FIXTURE that is explicitly not official Unicode data and not
 * complete threat coverage. The database-backed pieces (persisted skeleton column,
 * the existing-member collision audit, the uniqueness index, and the live
 * registration rejection) are a separate slice blocked on vendoring the official
 * Unicode confusables.txt, so those are not covered here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseConfusablesTable,
  confusableSkeleton,
  namesAreConfusable,
  ConfusablesDataError,
} from '../../src/lib/confusableSkeleton';

const FIXTURE = readFileSync(join(__dirname, '../fixtures/confusables.test-fixture.txt'), 'utf8');
const table = parseConfusablesTable(FIXTURE);

// Cyrillic lookalikes spelled out so the intent is unmistakable.
const CYRILLIC_ACE = 'асе';           // а с е  -> "ace"
const CYRILLIC_PAYcO = 'рау' + 'c' + 'о'; // р а у c о -> "payco" (mixed source, single-script-passing shape)

describe('parseConfusablesTable', () => {
  it('parses the fixture header, version, and mappings', () => {
    expect(table.version).toBe('0.0.0');
    expect(table.mapping.size).toBeGreaterThan(0);
  });

  it('parses a multi-codepoint prototype (a ligature maps to two letters)', () => {
    // U+0133 (ĳ) -> "ij"
    expect(confusableSkeleton('ĳ', table)).toBe('ij');
  });

  it('fails loudly when the header is not recognized', () => {
    expect(() => parseConfusablesTable('# some other file\n# Version: 1.0.0\n0430 ; 0061 ; MA\n'))
      .toThrow(ConfusablesDataError);
  });

  it('fails loudly when the version line is missing', () => {
    expect(() => parseConfusablesTable('# confusables.txt\n0430 ;\t0061 ;\tMA\n'))
      .toThrow(/Version/i);
  });

  it('fails loudly on a malformed data line', () => {
    expect(() => parseConfusablesTable('# confusables.txt\n# Version: 1.0.0\nnot-a-hex-line\n'))
      .toThrow(ConfusablesDataError);
  });

  it('fails loudly on empty data', () => {
    expect(() => parseConfusablesTable('')).toThrow(ConfusablesDataError);
  });
});

describe('confusableSkeleton', () => {
  it('collapses an all-Cyrillic lookalike to the same skeleton as the Latin name', () => {
    // The upstream single-script rule lets an all-Cyrillic name through; the
    // skeleton is what catches it impersonating an all-Latin name.
    expect(confusableSkeleton(CYRILLIC_ACE, table)).toBe(confusableSkeleton('ace', table));
    expect(namesAreConfusable(CYRILLIC_ACE, 'ace', table)).toBe(true);
  });

  it('collapses a fullwidth letter to its ASCII skeleton', () => {
    expect(namesAreConfusable('ａce', 'ace', table)).toBe(true); // ａce -> ace
  });

  it('keeps genuinely distinct names distinct', () => {
    expect(namesAreConfusable('alice', 'bob', table)).toBe(false);
    expect(namesAreConfusable('ace', 'aces', table)).toBe(false);
  });

  it('is case-insensitive, matching the lowercased display-name identity', () => {
    expect(confusableSkeleton('Ace', table)).toBe(confusableSkeleton('ace', table));
    expect(confusableSkeleton('ALICE', table)).toBe(confusableSkeleton('alice', table));
  });

  it('treats NFC and NFD spellings of the same name identically', () => {
    const composed = 'café';                 // café (é precomposed)
    const decomposed = 'café';              // café (e + combining acute)
    expect(confusableSkeleton(composed, table)).toBe(confusableSkeleton(decomposed, table));
  });

  it('is deterministic (a backfill and a runtime check would agree)', () => {
    const once = confusableSkeleton(CYRILLIC_PAYcO, table);
    const twice = confusableSkeleton(CYRILLIC_PAYcO, table);
    expect(once).toBe(twice);
    expect(once).toBe(confusableSkeleton('payco', table));
  });
});
