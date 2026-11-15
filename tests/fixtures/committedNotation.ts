/**
 * A trick's operational notation as the rebuild leaves it from the committed
 * expert-corrections file: loader 19 applies the file's corrections in order, so
 * the last operational_notation correction for a slug is the one a built
 * database holds. Tests that check a foundational move's notation read it here,
 * from the same input the database is built from, rather than from a second
 * copy in code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseQuotedCsv } from './testDb';

const CORRECTIONS = path.join(
  process.cwd(), 'freestyle', 'inputs', 'curated', 'tricks', 'red_corrections_2026_04_20.csv',
);

let cache: Map<string, string> | null = null;

function notationBySlug(): Map<string, string> {
  if (cache) return cache;
  const rows = parseQuotedCsv(fs.readFileSync(CORRECTIONS, 'utf8'));
  const header = rows[0] ?? [];
  const slugAt = header.indexOf('slug');
  const fieldAt = header.indexOf('field');
  const valueAt = header.indexOf('new_value');
  const map = new Map<string, string>();
  for (const r of rows.slice(1)) {
    const value = (r[valueAt] ?? '').trim();
    if ((r[fieldAt] ?? '').trim() !== 'operational_notation' || !value) continue;
    // The loader matches a correction to its trick by the underscore slug form,
    // so a hyphenated slug in the file ("toe-stall") names the same row.
    map.set((r[slugAt] ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_'), value);
  }
  cache = map;
  return map;
}

/** The committed operational notation for a slug, or undefined when the
 *  corrections file sets none. */
export function committedNotation(slug: string): string | undefined {
  return notationBySlug().get(slug);
}
