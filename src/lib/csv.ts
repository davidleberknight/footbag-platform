/**
 * CSV for the site's downloads and for the files organizers upload.
 *
 * Writing: a cell carrying a delimiter, quote or newline is quoted, an
 * internal quote doubled, per RFC 4180. A leading '=', '+', '-', '@', tab or
 * carriage return is neutralised with a leading apostrophe first, so a
 * spreadsheet opening the file reads every member-entered value as text,
 * never as a formula.
 *
 * Reading: `parseCsv` splits RFC 4180 text into rows of cells, accepting CRLF
 * or LF line ends and a leading byte-order mark, which spreadsheet programs
 * write. `startsLikeFormula` names the same leading characters, so an upload
 * can refuse a cell a spreadsheet would run.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** True when a cell begins with a character a spreadsheet reads as a formula. */
export function startsLikeFormula(cell: string): boolean {
  return FORMULA_LEAD.test(cell);
}

export type CsvParseResult =
  | { ok: true; rows: string[][] }
  | { ok: false; error: 'unterminated_quote' | 'stray_quote'; line: number };

/**
 * Parse CSV text into rows of cells. Blank lines are dropped. A quoted cell
 * may hold commas, doubled quotes and line breaks; a quote inside an unquoted
 * cell, or a quote left open at the end, refuses the whole text with the line
 * it was found on, counted from 1.
 */
export function parseCsv(text: string): CsvParseResult {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellWasQuoted = false;
  let line = 1;
  let quoteLine = 1;
  const endRow = () => {
    row.push(cell);
    if (!(row.length === 1 && row[0] === '' && !cellWasQuoted)) rows.push(row);
    row = [];
    cell = '';
    cellWasQuoted = false;
  };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else { inQuotes = false; }
      } else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (cell !== '' || cellWasQuoted) return { ok: false, error: 'stray_quote', line };
      inQuotes = true;
      cellWasQuoted = true;
      quoteLine = line;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
      cellWasQuoted = false;
    } else if (ch === '\r' && src[i + 1] === '\n') {
      // CRLF: the LF ends the row.
    } else if (ch === '\n' || ch === '\r') {
      endRow();
      line += 1;
    } else {
      if (cellWasQuoted) return { ok: false, error: 'stray_quote', line };
      cell += ch;
    }
  }
  if (inQuotes) return { ok: false, error: 'unterminated_quote', line: quoteLine };
  if (cell !== '' || row.length > 0 || cellWasQuoted) endRow();
  return { ok: true, rows };
}

export function csvCell(v: string | number | null | undefined): string {
  const raw = v === null || v === undefined ? '' : String(v);
  const s = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV line, CRLF-terminated. */
export function csvRow(cells: Array<string | number | null | undefined>): string {
  return `${cells.map(csvCell).join(',')}\r\n`;
}
