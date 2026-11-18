/**
 * Reading an uploaded CSV file: RFC 4180 quoting, the line endings and the
 * byte-order mark spreadsheet programs write, and refusal of text that is not
 * CSV. An organizer's results file passes through this before anything is
 * read as results.
 */
import { describe, it, expect } from 'vitest';
import { parseCsv, startsLikeFormula } from '../../src/lib/csv';

describe('parseCsv', () => {
  it('reads quoted cells holding commas, doubled quotes and line breaks as one cell each', () => {
    // A name with a comma or a quote split into two cells would shift every later column.
    const out = parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nd,e,f,g\r\n');
    expect(out).toEqual({ ok: true, rows: [['a', 'b, c', 'say "hi"', 'two\nlines'], ['d', 'e', 'f', 'g']] });
  });

  it('accepts LF and lone CR line ends and a leading byte-order mark, and drops blank lines', () => {
    // A file saved by a spreadsheet with a BOM would otherwise name its first column "﻿division".
    const out = parseCsv('﻿division,place\n\nNet,1\rRoutines,2');
    expect(out).toEqual({ ok: true, rows: [['division', 'place'], ['Net', '1'], ['Routines', '2']] });
  });

  it('keeps empty cells, including a trailing one', () => {
    // A singles row with an empty partner column must keep its column count.
    expect(parseCsv('x,,y,\n')).toEqual({ ok: true, rows: [['x', '', 'y', '']] });
  });

  it('refuses an unterminated quote with the line it opened on', () => {
    // A runaway quote would otherwise swallow the rest of the file into one cell.
    expect(parseCsv('a,b\nc,"d\ne,f')).toEqual({ ok: false, error: 'unterminated_quote', line: 2 });
  });

  it('refuses a quote inside an unquoted cell, and text after a closing quote', () => {
    // Either shape means the columns cannot be trusted.
    expect(parseCsv('a,b"c\n')).toMatchObject({ ok: false, error: 'stray_quote', line: 1 });
    expect(parseCsv('a\n"b"c\n')).toMatchObject({ ok: false, error: 'stray_quote', line: 2 });
  });

  it('reads empty text as no rows', () => {
    expect(parseCsv('')).toEqual({ ok: true, rows: [] });
  });
});

describe('startsLikeFormula', () => {
  it('flags the characters a spreadsheet runs and nothing else', () => {
    // A cell an upload accepted with a leading = would run as a formula when the results are opened.
    for (const cell of ['=1+1', '+1', '-1', '@SUM(A1)']) expect(startsLikeFormula(cell), cell).toBe(true);
    for (const cell of ['Kenny', '1', 'a=b', '']) expect(startsLikeFormula(cell), cell).toBe(false);
  });
});
