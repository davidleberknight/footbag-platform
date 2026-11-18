/**
 * The names and cells of the site's downloads: a file name safe in a header
 * and on every file system, and CSV cells a spreadsheet reads as text.
 */
import { describe, it, expect } from 'vitest';
import { downloadFilename } from '../../src/lib/downloadFilename';
import { csvCell, csvRow } from '../../src/lib/csv';

describe('download file names', () => {
  // Defect caught: an accented or punctuated event title produces a file name
  // with characters that break the Content-Disposition header or a file system.
  it('folds the name to lowercase letters, digits and underscores, with the date', () => {
    expect(downloadFilename('Montréal Open: 2027!', 'checkin', '2027-07-30T12:00:00.000Z', 'pdf'))
      .toBe('montreal_open_2027_checkin_20270730.pdf');
    expect(downloadFilename('"; rm -rf /', 'participants', '2027-01-02', 'csv'))
      .toBe('rm_rf_participants_20270102.csv');
  });

  // Defect caught: a title of only symbols or another script yields a file
  // named "_kind_date", or an over-long title an unbounded name.
  it('falls back to a plain name and bounds the length', () => {
    expect(downloadFilename('Кубок', 'checkin', '2027-07-30', 'pdf')).toBe('download_checkin_20270730.pdf');
    const long = downloadFilename('a'.repeat(200), 'checkin', '2027-07-30', 'pdf');
    expect(long).toBe(`${'a'.repeat(60)}_checkin_20270730.pdf`);
  });
});

describe('CSV cells', () => {
  // Defect caught: a member-chosen name opening with a formula character runs
  // as a formula when an organizer opens the export.
  it('neutralises every formula-leading character', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
      expect(csvCell(`${lead}SUM(A1)`).replace(/^"/, '').startsWith(`'${lead}`), `lead ${JSON.stringify(lead)}`).toBe(true);
    }
    expect(csvCell('Ada')).toBe('Ada');
  });

  // Defect caught: a comma, quote or line break inside a value splits it into
  // extra columns or rows.
  it('quotes delimiters, doubles quotes, and ends each row with CRLF', () => {
    expect(csvCell('Smith, Jo')).toBe('"Smith, Jo"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvRow(['a', 2, null])).toBe('a,2,\r\n');
  });
});
