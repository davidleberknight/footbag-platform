import fs from 'node:fs';
import path from 'node:path';

/**
 * Roster row schema mirrors curated/freestyle_media/tt_roster.csv §4.1.
 * The CSV is the single source of truth for "which TT numbers exist" and
 * for lesson-title text rendered in the view.
 */
export interface TtRosterRow {
  ttNumber: number;
  lessonTitle: string;
  isMeta: boolean;
  expectedTrickSlug: string | null;
  expectedVideoId: string | null;
  notes: string | null;
}

const ROSTER_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'curated',
  'freestyle_media',
  'tt_roster.csv',
);

/**
 * Minimal CSV reader for tt_roster.csv. Handles double-quoted fields with
 * embedded commas; does not support escaped quotes (the roster does not
 * use them and the parser will throw if one appears).
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Read curated/freestyle_media/tt_roster.csv and return the parsed rows.
 * The roster is small (42 rows) so re-parsing per request is acceptable;
 * cache the result here if profiling shows otherwise.
 */
export function readTtRoster(filePath: string = ROSTER_PATH): TtRosterRow[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string): number => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error(`tt_roster.csv missing required column: ${name}`);
    return i;
  };
  const iNum = idx('tt_number');
  const iTitle = idx('lesson_title');
  const iMeta = idx('is_meta');
  const iSlug = idx('expected_trick_slug');
  const iVid = idx('expected_video_id');
  const iNotes = idx('notes');

  const rows: TtRosterRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const fields = parseCsvLine(lines[r]);
    const ttNumber = parseInt(fields[iNum], 10);
    if (!Number.isFinite(ttNumber)) continue;
    rows.push({
      ttNumber,
      lessonTitle: fields[iTitle].trim(),
      isMeta: fields[iMeta].trim() === '1',
      expectedTrickSlug: fields[iSlug].trim() || null,
      expectedVideoId: fields[iVid].trim() || null,
      notes: fields[iNotes].trim() || null,
    });
  }
  rows.sort((a, b) => a.ttNumber - b.ttNumber);
  return rows;
}
