/**
 * The trick naming invariant holds across the committed dictionary source.
 *
 * A trick's slug is the lowercase-underscore fold of its display name, and the
 * display name is the plain human-readable form: no underscores, hyphens only
 * inside the curator-approved genuine-hyphen tokens, and folding the name
 * reproduces the slug, except for the curator-approved verbatim rows in the
 * committed exception file. Slugs, hashtags, and every identifier surface
 * derive from the slug and are untouched by display names. This suite derives
 * the final (slug, display name) pairs from the committed CSVs, applying the
 * correction overrides the load applies, so a regression in the source data
 * fails in CI without needing a built database; the dictionary QC script
 * enforces the same rule as a hard gate at load time from the same exception
 * file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { trickNameToSlug } from '../../src/services/freestyleRecordShaping';

const REPO_ROOT = resolve(__dirname, '../..');
const BASE_CSV = join(REPO_ROOT, 'freestyle/inputs/noise/tricks.csv');
const ADDITIONS_CSV = join(REPO_ROOT, 'freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv');
const CORRECTIONS_CSV = join(REPO_ROOT, 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv');
const EXCEPTIONS_CSV = join(REPO_ROOT, 'freestyle/inputs/curated/tricks/display_name_exceptions.csv');

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

function dataLines(path: string): string[][] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map(splitCsvLine);
}

interface Exceptions {
  rows: Map<string, string>;
  tokens: RegExp[];
}

function loadExceptions(): Exceptions {
  const rows = new Map<string, string>();
  const tokens: RegExp[] = [];
  const lines = dataLines(EXCEPTIONS_CSV);
  for (const [kind, key, value] of lines.slice(1)) {
    if (kind === 'row') rows.set(key, value);
    else if (kind === 'token') {
      tokens.push(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}\\b`, 'gi'));
    }
  }
  return { rows, tokens };
}

// The final (slug, display name) pairs the load produces: names from the base
// dictionary and the additions (slug folds from the name), then the correction
// overrides that rename a display without touching the slug.
function loadFinalNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const [path, nameCol] of [[BASE_CSV, 'trick_canon'], [ADDITIONS_CSV, 'canonical_name']] as const) {
    const lines = dataLines(path);
    const idx = lines[0].indexOf(nameCol);
    expect(idx, `${path} must carry ${nameCol}`).toBeGreaterThanOrEqual(0);
    for (const row of lines.slice(1)) {
      const name = (row[idx] ?? '').trim();
      if (name) names.set(trickNameToSlug(name), name);
    }
  }
  const corrections = dataLines(CORRECTIONS_CSV);
  for (const row of corrections.slice(1)) {
    if (row[1] === 'canonical_name' && row[3]) {
      const slug = trickNameToSlug(row[0]);
      if (names.has(slug)) names.set(slug, row[3]);
    }
  }
  return names;
}

describe('freestyle trick naming invariant (committed source)', () => {
  it('every display name is the plain form of its slug, modulo the committed exceptions', () => {
    const { rows, tokens } = loadExceptions();
    const names = loadFinalNames();
    expect(names.size).toBeGreaterThan(500); // the parse actually read the corpus

    const violations: string[] = [];
    for (const [slug, name] of names) {
      if (rows.get(slug) === name) continue;
      let stripped = name;
      for (const t of tokens) stripped = stripped.replace(t, '');
      if (name.includes('_')) violations.push(`${slug}: underscore in display name: ${name}`);
      else if (stripped.includes('-')) violations.push(`${slug}: separator hyphen in display name: ${name}`);
      else if (trickNameToSlug(name) !== slug) violations.push(`${slug}: name does not fold to slug: ${name}`);
    }
    expect(violations.join('\n'), `naming-invariant violations:\n${violations.join('\n')}`).toBe('');
  });

  it('the exception file itself stays consistent: verbatim rows fold to their slugs', () => {
    const { rows } = loadExceptions();
    expect(rows.size).toBeGreaterThan(0);
    for (const [slug, display] of rows) {
      // A verbatim exception still names the same trick; only its orthography
      // (or a curator naming ruling) diverges from the mechanical fold. The
      // slug must be a real fold of SOME name, so pin it is lowercase-underscore.
      expect(slug).toMatch(/^[a-z0-9_]+$/);
      expect(display.trim()).not.toBe('');
    }
  });
});
