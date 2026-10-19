/**
 * Public trick descriptions carry no curation trail.
 *
 * A trick description renders verbatim on the trick page, so it reads as
 * neutral instruction: it names no person as a source to ask, cites no corpus
 * page the description was copied from, refers to no internal review note, is
 * not an alias clause standing in for a description, and is not raw movement
 * notation (notation has its own section). This suite derives each trick's
 * final description from the committed dictionary CSVs the way the load
 * resolves it (the additions, then any description correction), so a
 * regression in the source data fails without a built database.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { trickNameToSlug } from '../../src/services/freestyleRecordShaping';

const REPO_ROOT = resolve(__dirname, '../..');
const ADDITIONS_CSV = join(REPO_ROOT, 'freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv');
const CORRECTIONS_CSV = join(REPO_ROOT, 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv');

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field); field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

function rows(path: string): Record<string, string>[] {
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const header = splitCsvLine(lines[0]!);
  return lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

// The description each trick ends up with: the addition's own cell, replaced by
// a non-empty description correction, which the loader applies after it.
function finalDescriptions(): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows(ADDITIONS_CSV)) {
    const description = (r.description ?? '').trim();
    if (description) out.set(trickNameToSlug(r.canonical_name!.trim()), description);
  }
  for (const r of rows(CORRECTIONS_CSV)) {
    if ((r.field ?? '').trim() !== 'description') continue;
    const value = (r.new_value ?? '').trim();
    if (value) out.set(trickNameToSlug(r.slug!.trim()), value);
  }
  return out;
}

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: 'a person named as the source to ask', pattern: /\bjust ask\b/i },
  { label: 'a corpus-page citation', pattern: /\(FB\.org \/newmoves[^)]*\)/ },
  { label: 'a reference to an internal review note', pattern: /\bper the review note\b/i },
  { label: 'an alias clause standing in for a description', pattern: /^[^.]*\balso known as\b[^.]*\.?$/i },
  { label: 'raw movement notation', pattern: /^[A-Z]+ > / },
];

describe('trick descriptions in the committed dictionary', () => {
  const descriptions = finalDescriptions();

  // Defect caught: a visitor reading a trick page is told to "just ask" a named
  // player, sees a corpus citation or a review-note aside, gets an alias line
  // where the explanation should be, or reads raw notation as the description.
  it('carry no source person, citation, review note, bare alias clause or raw notation', () => {
    // A positive control: the descriptions were read at all, so an empty or
    // mis-parsed file cannot pass by having nothing to check.
    expect(descriptions.size).toBeGreaterThan(100);
    const offenders: string[] = [];
    for (const [slug, text] of descriptions) {
      for (const { label, pattern } of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${slug}: ${label}: ${text}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
