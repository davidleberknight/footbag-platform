/**
 * The printable-document facility: a document model laid out for paper, and
 * the PDF bytes it renders to. A printout must repeat its column headings on
 * every page, keep a row whole, print a box to tick and room to write, fill
 * the page width, and print names in any script the members write them in.
 */
import { describe, it, expect } from 'vitest';
import { pdfDefinition, renderPdf, type PrintableDocument, type PrintRow } from '../../src/lib/printableDocument';

function roster(rows: PrintRow[], orientation: 'portrait' | 'landscape' = 'landscape'): PrintableDocument {
  return {
    title: 'Check-in Sheet: Test Open',
    subtitle: '1 August 2027, Montréal, Canada',
    orientation,
    runningHeader: 'Test Open: check-in sheet',
    generatedLabel: 'Printed on 2027-07-30',
    blocks: [{
      kind: 'table',
      emptyText: 'No confirmed participants yet.',
      columns: [
        { header: 'Name', width: 3, kind: 'text' },
        { header: 'Fee', width: 1, kind: 'number' },
        { header: 'In', width: 0.6, kind: 'checkbox' },
        { header: 'Notes', width: 3, kind: 'writeIn' },
      ],
      rows,
    }],
  };
}

type TableNode = { table: { headerRows: number; dontBreakRows: boolean; widths: number[]; body: Array<Array<Record<string, unknown>>> } };

function tableOf(doc: PrintableDocument): TableNode['table'] {
  const def = pdfDefinition(doc) as { content: Array<Record<string, unknown>> };
  const node = def.content.find((c) => 'table' in c && Array.isArray((c as TableNode).table.body) && (c as TableNode).table.headerRows === 1);
  if (!node) throw new Error('no data table in the definition');
  return (node as TableNode).table;
}

describe('laying a table out for paper', () => {
  // Defect caught: a long roster's later pages have no column headings, or a
  // row is split across a page break so its tick box and name part company.
  it('repeats the header row on every page and never splits a row', () => {
    const t = tableOf(roster([{ kind: 'row', cells: ['Ada', 25, null, null] }]));
    expect(t.headerRows).toBe(1);
    expect(t.dontBreakRows).toBe(true);
    expect(t.body[0].map((c) => c.text)).toEqual(['Name', 'Fee', 'In', 'Notes']);
  });

  // Defect caught: the tick column prints the row's value instead of a box,
  // or the notes column prints text where the organizer must write.
  it('prints a box to tick and an empty notes cell, ignoring any value passed for them', () => {
    const t = tableOf(roster([{ kind: 'row', cells: ['Ada', 25, 'should not print', 'nor this'] }]));
    const [name, fee, box, notes] = t.body[1];
    expect(name.text).toBe('Ada');
    expect(fee).toMatchObject({ text: '25', alignment: 'right' });
    expect(box.canvas).toBeDefined();
    expect(box.text).toBeUndefined();
    expect(notes.text).toBe('');
  });

  // Defect caught: a group heading spans one column and pushes the row's
  // cells out of line, or the table overruns or underfills the page.
  it('spans group rows across the table and fills the printable width', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
      const t = tableOf(roster([{ kind: 'group', label: 'Competitor (1)' }, { kind: 'row', cells: ['Ada', 25, null, null] }], orientation));
      expect(t.body[1][0]).toMatchObject({ text: 'Competitor (1)', colSpan: 4 });
      expect(t.body[1]).toHaveLength(4);
      // Letter is 612 by 792 points; 36-point side margins; each cell adds 8
      // points of padding and half a point of rule.
      const pageWidth = orientation === 'portrait' ? 612 : 792;
      const drawn = t.widths.reduce((s, w) => s + w + 8.5, 0) + 0.5;
      expect(drawn).toBeLessThanOrEqual(pageWidth - 72);
      expect(drawn).toBeGreaterThan(pageWidth - 72 - 1);
    }
  });

  // Defect caught: an empty roster prints a bare header row with nothing
  // saying why.
  it('prints the empty text in place of a table with no rows', () => {
    const def = pdfDefinition(roster([])) as { content: Array<Record<string, unknown>> };
    expect(def.content.some((c) => c.text === 'No confirmed participants yet.')).toBe(true);
    expect(def.content.some((c) => 'table' in c && (c as TableNode).table.headerRows === 1)).toBe(false);
  });
});

describe('rendering the PDF', () => {
  // Defect caught: the renderer fails on accented or Cyrillic names (the
  // embedded font cannot subset them), or a long roster does not break onto
  // further pages.
  it('renders a multi-page PDF with accented and Cyrillic names', async () => {
    const rows: PrintRow[] = Array.from({ length: 120 }, (_, i) => ({
      kind: 'row' as const,
      cells: [i % 2 ? `Zoë Ångström ${i}` : `Дмитрий Ковалёв ${i}`, 25, null, null],
    }));
    const bytes = await renderPdf(roster(rows));
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = (bytes.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });
});
