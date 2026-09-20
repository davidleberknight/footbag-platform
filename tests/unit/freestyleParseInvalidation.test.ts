/**
 * What invalidates a stored notation parse matches what the parser reads.
 *
 * The parse is not a function of the notation alone. The parser decomposes a
 * trick's canonical name into a base plus operators and grades the result against
 * the asserted ADD, reading the family, base trick, category and active flag on
 * the way. A save that changes any of those leaves the stored decomposition
 * describing the row as it was, while the maintainer's grammar panel presents it
 * as the current structure.
 *
 * The invalidation trigger named three of those columns. A rename — the parser's
 * primary input — was not among them, so renaming a trick left a parse of the
 * former name in place. The rule was never wrong; the list implementing it was
 * short by five.
 *
 * Two different failures are guarded here, and the second is the one that keeps
 * the first from returning. One case asserts the list is complete today. The
 * other reads the parser's own select statement and fails when the two stop
 * naming the same columns, so widening what the parser reads cannot silently
 * narrow what invalidates a parse. Without it the lists live in two languages,
 * in two directories, with nothing holding them together.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PARSE_INPUT_FIELDS } from '../../src/services/freestyleCurationService';

const PARSER = join(
  process.cwd(), 'freestyle', 'scripts', 'parse_freestyle_notation.py',
);

/** The row's identity, and the key the update is issued against: the parser
 *  selects it, but it is not an input that can change underneath a parse. */
const IDENTITY_COLUMN = 'slug';

/** The columns the parser's own row query names. */
function parserSelectColumns(): string[] {
  const source = readFileSync(PARSER, 'utf8');
  // The query that loads the trick rows the parse is derived from. Anchored on
  // the table rather than on any one column, so reordering the select does not
  // read as a change and adding a column does not slip past.
  const match = /SELECT\s+([\s\S]*?)\s+FROM\s+freestyle_tricks/i.exec(source);
  expect(match, 'the parser no longer has a recognisable freestyle_tricks query').toBeTruthy();
  return match![1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

describe('the parse invalidation trigger covers every column the parser reads', () => {
  it('names each of the parser row inputs', () => {
    expect([...PARSE_INPUT_FIELDS].sort()).toEqual([
      'adds', 'base_trick', 'canonical_name', 'category',
      'is_active', 'notation', 'operational_notation', 'trick_family',
    ].sort());
  });

  it('matches the parser own select list, column for column', () => {
    const selected = parserSelectColumns().filter((c) => c !== IDENTITY_COLUMN);
    const invalidated = [...PARSE_INPUT_FIELDS];

    const unguarded = selected.filter((c) => !invalidated.includes(c as never));
    const surplus = invalidated.filter((c) => !selected.includes(c));

    expect(unguarded, `the parser reads ${unguarded.join(', ')} and nothing invalidates `
      + 'a parse when they change, so an edit would leave the stored decomposition '
      + 'describing the row as it was').toEqual([]);
    expect(surplus, `${surplus.join(', ')} invalidates a parse but the parser does not `
      + 'read it, so a save discards a parse that was still correct').toEqual([]);
  });

  it('does not treat the row identity as an input', () => {
    // The slug is the key the update is issued against. A different slug is a
    // different row, not the same row with a stale parse.
    expect(parserSelectColumns()).toContain(IDENTITY_COLUMN);
    expect([...PARSE_INPUT_FIELDS]).not.toContain(IDENTITY_COLUMN);
  });

  it('carries the rename that the short list let through', () => {
    // Named on its own because it is the case that was live: the parser's
    // primary input is the canonical name, and renaming a trick used to leave a
    // decomposition of the previous name on the page.
    expect([...PARSE_INPUT_FIELDS]).toContain('canonical_name');
  });
});
