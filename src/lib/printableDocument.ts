/**
 * Printable documents: the one way the site produces something meant for
 * paper.
 *
 * A service builds a `PrintableDocument` from its own data: headings,
 * paragraphs, label-and-value facts and tables. `renderPdf` turns that model
 * into PDF bytes, and `sendPdfDownload` hands them to the browser as a file
 * named by `downloadFilename`.
 * No page has PDF code of its own, and nothing here accepts HTML, so member
 * text is only ever laid out as text.
 *
 * The renderer runs with every outside read refused: no URL is fetched and
 * no path on disk is opened during rendering. Its font is loaded once into
 * the renderer's in-memory file store and embedded, so accented and
 * non-Latin names print as written.
 */
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import pdfmake from 'pdfmake';

/** One column of a printed table. */
export interface PrintColumn {
  header: string;
  /** Relative width; columns share the page width in proportion. */
  width: number;
  /**
   * `text` and `number` print the row's value; `writeIn` prints an empty cell
   * to write in by hand; `checkbox` prints an empty box to tick.
   */
  kind: 'text' | 'number' | 'writeIn' | 'checkbox';
}

/**
 * A table row. A `group` row spans the table as a sub-heading (one per
 * division, say). A `row` carries one cell per column in order; the cells of
 * write-in and check-box columns are ignored.
 */
export type PrintRow =
  | { kind: 'group'; label: string }
  | { kind: 'row'; cells: Array<string | number | null> };

export type PrintBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'facts'; items: Array<{ label: string; value: string }> }
  | { kind: 'pageBreak' }
  | { kind: 'table'; columns: PrintColumn[]; rows: PrintRow[]; emptyText: string };

export interface PrintableDocument {
  /** The document's title, printed at the top of the first page and as the PDF title. */
  title: string;
  /** A line under the title, such as the event's dates and place. */
  subtitle: string | null;
  orientation: 'portrait' | 'landscape';
  /** Printed at the top of every page after the first, so a loose page still says what it is. */
  runningHeader: string;
  /** The generated date as the reader sees it, printed in every page footer. */
  generatedLabel: string;
  blocks: PrintBlock[];
}

// Roboto, the TrueType face pdfmake ships with, covers Latin, Greek and
// Cyrillic. The site's own web fonts are WOFF2, which the renderer's font
// subsetter cannot embed reliably, so printouts use this face instead.
const FONT_FAMILY = 'Roboto';
const FONT_FILES = {
  normal: 'Roboto-Regular.ttf',
  bold: 'Roboto-Medium.ttf',
} as const;

let fontsLoaded = false;

// Loads the fonts into the renderer's in-memory store once per process, and
// closes the renderer's own reach for URLs and files, so a document can only
// ever use what is placed here.
function prepareRenderer(): void {
  if (fontsLoaded) return;
  const fontDir = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');
  for (const file of Object.values(FONT_FILES)) {
    pdfmake.sharedVirtualfs.writeFileSync(file, fs.readFileSync(path.join(fontDir, file)));
  }
  pdfmake.setFonts({
    [FONT_FAMILY]: {
      normal: FONT_FILES.normal,
      bold: FONT_FILES.bold,
      italics: FONT_FILES.normal,
      bolditalics: FONT_FILES.bold,
    },
  });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(() => false);
  fontsLoaded = true;
}

const CHECKBOX_SIZE = 9;

function cellFor(column: PrintColumn, value: string | number | null): object {
  if (column.kind === 'checkbox') {
    return {
      canvas: [{ type: 'rect', x: 0, y: 1, w: CHECKBOX_SIZE, h: CHECKBOX_SIZE, lineWidth: 0.75 }],
      alignment: 'center',
    };
  }
  if (column.kind === 'writeIn') return { text: '' };
  const text = value === null || value === undefined ? '' : String(value);
  return column.kind === 'number' ? { text, alignment: 'right' } : { text };
}

const PAGE_WIDTH = { portrait: 612, landscape: 792 } as const; // US Letter, in points
const PAGE_MARGIN_X = 36;
const CELL_PADDING_X = 4;
const RULE_WIDTH = 0.5;

// Shares the printable width between the columns in proportion to their
// relative widths. The renderer's widths exclude each cell's padding and
// rules, so those come off every share first.
function columnWidths(columns: PrintColumn[], orientation: PrintableDocument['orientation']): number[] {
  const available = PAGE_WIDTH[orientation] - 2 * PAGE_MARGIN_X - RULE_WIDTH;
  const total = columns.reduce((sum, c) => sum + c.width, 0);
  return columns.map((c) =>
    Math.floor(((available * c.width) / total - 2 * CELL_PADDING_X - RULE_WIDTH) * 100) / 100);
}

function tableContent(block: Extract<PrintBlock, { kind: 'table' }>, orientation: PrintableDocument['orientation']): object {
  if (block.rows.length === 0) return { text: block.emptyText, style: 'paragraph' };
  const header = block.columns.map((c) => ({ text: c.header, style: 'tableHeader' }));
  const body: object[][] = [header];
  // Zebra shading counts data rows only, restarting after each group row, so
  // the stripes stay even within every group.
  const shaded = new Set<number>();
  let stripe = 0;
  for (const row of block.rows) {
    if (row.kind === 'group') {
      stripe = 0;
      body.push([
        { text: row.label, style: 'tableGroup', colSpan: block.columns.length },
        ...block.columns.slice(1).map(() => ({})),
      ]);
      continue;
    }
    if (stripe % 2 === 1) shaded.add(body.length);
    stripe += 1;
    body.push(block.columns.map((c, i) => cellFor(c, row.cells[i] ?? null)));
  }
  const groupRows = new Set<number>();
  block.rows.forEach((row, i) => { if (row.kind === 'group') groupRows.add(i + 1); });
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: columnWidths(block.columns, orientation),
      body,
    },
    layout: {
      hLineWidth: () => RULE_WIDTH,
      vLineWidth: () => RULE_WIDTH,
      hLineColor: () => '#9aa5a0',
      vLineColor: () => '#9aa5a0',
      fillColor: (rowIndex: number) =>
        rowIndex === 0 ? '#e4ece8'
          : groupRows.has(rowIndex) ? '#f1f4f2'
            : shaded.has(rowIndex) ? '#f7f8f7' : null,
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: () => CELL_PADDING_X,
      paddingRight: () => CELL_PADDING_X,
    },
    style: 'table',
  };
}

function blockContent(block: PrintBlock, orientation: PrintableDocument['orientation']): object {
  switch (block.kind) {
    case 'heading': return { text: block.text, style: 'heading' };
    case 'paragraph': return { text: block.text, style: 'paragraph' };
    case 'facts':
      return {
        style: 'facts',
        table: {
          widths: ['auto', '*'],
          body: block.items.map((f) => [{ text: f.label, bold: true }, { text: f.value }]),
        },
        layout: 'noBorders',
      };
    case 'pageBreak': return { text: '', pageBreak: 'after' };
    case 'table': return tableContent(block, orientation);
  }
}

/** The pdfmake definition for a document; exported so tests can read the layout it asks for. */
export function pdfDefinition(doc: PrintableDocument): object {
  const content: object[] = [{ text: doc.title, style: 'title' }];
  if (doc.subtitle) content.push({ text: doc.subtitle, style: 'subtitle' });
  for (const block of doc.blocks) content.push(blockContent(block, doc.orientation));
  return {
    info: { title: doc.title, creator: 'footbag.org', producer: 'footbag.org' },
    pageSize: 'LETTER',
    pageOrientation: doc.orientation,
    pageMargins: [PAGE_MARGIN_X, 44, PAGE_MARGIN_X, 40],
    defaultStyle: { font: FONT_FAMILY, fontSize: 9, lineHeight: 1.15 },
    header: (currentPage: number) =>
      currentPage === 1 ? null : { text: doc.runningHeader, style: 'running', margin: [36, 18, 36, 0] },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: doc.generatedLabel, style: 'running' },
        { text: `Page ${currentPage} of ${pageCount}`, style: 'running', alignment: 'right' },
      ],
      margin: [36, 12, 36, 0],
    }),
    content,
    styles: {
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 2] },
      subtitle: { fontSize: 10, margin: [0, 0, 0, 10] },
      heading: { fontSize: 12, bold: true, margin: [0, 10, 0, 4] },
      paragraph: { margin: [0, 0, 0, 6] },
      facts: { margin: [0, 0, 0, 8] },
      table: { margin: [0, 4, 0, 8] },
      tableHeader: { bold: true },
      tableGroup: { bold: true },
      running: { fontSize: 8, color: '#4a5550' },
    },
  };
}

/** Renders a document to PDF bytes. */
export async function renderPdf(doc: PrintableDocument): Promise<Buffer> {
  prepareRenderer();
  return pdfmake.createPdf(pdfDefinition(doc)).getBuffer();
}

/** Sends rendered PDF bytes as a file download that no cache keeps. */
export function sendPdfDownload(res: Response, out: { filename: string; body: Buffer }): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(out.body);
}
