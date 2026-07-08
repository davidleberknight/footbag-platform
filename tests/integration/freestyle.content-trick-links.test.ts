/**
 * Content-authored freestyle trick links resolve to real canonical tricks.
 *
 * The freestyle reference pages are content modules authored against the full
 * dictionary, so they link trick slugs no small route-test fixture carries; the
 * route-wiring crawl therefore skips unseeded trick-detail links. This suite is
 * the deterministic complement: it validates every content-authored trick link
 * against the dictionary's own committed source CSVs (the base dictionary plus
 * the expert-review additions), folded through the application's own
 * name-to-slug normalization. That derivation reproduces every active canonical
 * slug, so a typo or a ghost slug in content fails here with the offending file
 * or page named. Aliases do not count as valid targets: internal links always
 * use canonical slugs, with the alias redirect reserved as a safety net for
 * external links. (The CSVs also carry some rows the load later deactivates, so
 * this proves a linked slug exists, not that it is active.)
 *
 * Two layers: a static scan of literal trick hrefs across src/, and a rendered
 * scan of the content-driven public pages served against an empty database, so
 * links built from content-module slug fields are checked too.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { trickNameToSlug } from '../../src/services/freestyleRecordShaping';

const { dbPath } = setTestEnv('3976');
let createApp: Awaited<ReturnType<typeof importApp>>;

const REPO_ROOT = resolve(__dirname, '../..');
const SRC_ROOT = join(REPO_ROOT, 'src');
const DICTIONARY_CSVS = [
  join(REPO_ROOT, 'freestyle/inputs/noise/tricks.csv'),
  join(REPO_ROOT, 'freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv'),
];

// The public pages whose trick links come from compiled content modules rather
// than database rows, so they render their full link set even on an empty DB.
const CONTENT_DRIVEN_PAGES = [
  '/freestyle',
  '/freestyle/add-analysis',
  '/freestyle/combo-analysis',
  '/freestyle/insights',
  '/freestyle/learn',
  '/freestyle/glossary',
  '/freestyle/sets',
  '/freestyle/sets/reference',
  '/freestyle/compositional-sets',
  '/freestyle/operators',
  '/freestyle/observational',
  '/freestyle/progression/walking-family',
  '/freestyle/notation-article',
];

// Minimal quote-aware CSV field split for a single line. The dictionary CSVs
// carry no embedded newlines, so line-based parsing is sound.
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

// Every canonical slug derivable from the committed dictionary source: the name
// column of each CSV, folded with the app's own normalization.
function loadDictionarySlugs(): Set<string> {
  const slugs = new Set<string>();
  for (const csvPath of DICTIONARY_CSVS) {
    const lines = readFileSync(csvPath, 'utf8').split('\n').filter((l) => l.trim() !== '');
    const header = splitCsvLine(lines[0]);
    // The base dictionary names its name column trick_canon; the additions CSV
    // names it canonical_name. Resolve explicitly so a column reorder cannot
    // silently misread the corpus.
    const nameIdx = header.findIndex((h) => h === 'trick_canon' || h === 'canonical_name');
    expect(nameIdx, `${csvPath} must carry a recognized name column`).toBeGreaterThanOrEqual(0);
    for (const line of lines.slice(1)) {
      const name = (splitCsvLine(line)[nameIdx] ?? '').trim();
      if (name) slugs.add(trickNameToSlug(name));
    }
  }
  return slugs;
}

const TRICK_HREF_RE = /\/freestyle\/tricks\/([a-z0-9_]+)/g;

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkSourceFiles(full, out);
    else if (/\.(ts|hbs)$/.test(entry)) out.push(full);
  }
  return out;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

describe('content-authored freestyle trick links', () => {
  it('every literal trick href in src/ targets a slug the dictionary source defines', () => {
    const dictionary = loadDictionarySlugs();
    expect(dictionary.size).toBeGreaterThan(500); // the parse actually read the corpus

    const offenders: string[] = [];
    for (const file of walkSourceFiles(SRC_ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(TRICK_HREF_RE)) {
        if (!dictionary.has(m[1])) {
          offenders.push(`${relative(REPO_ROOT, file)}: ${m[1]}`);
        }
      }
    }
    expect(offenders.join('\n'), `unknown trick slugs in literal hrefs:\n${offenders.join('\n')}`).toBe('');
  });

  it('every trick link the content-driven pages render targets a slug the dictionary source defines', async () => {
    const dictionary = loadDictionarySlugs();
    const app = await createApp();
    const offenders: string[] = [];

    for (const path of CONTENT_DRIVEN_PAGES) {
      const res = await request(app).get(path);
      expect(res.status, `${path} should render`).toBe(200);
      for (const m of res.text.matchAll(TRICK_HREF_RE)) {
        if (!dictionary.has(m[1])) {
          offenders.push(`${path}: ${m[1]}`);
        }
      }
    }
    expect(offenders.join('\n'), `unknown trick slugs in rendered links:\n${offenders.join('\n')}`).toBe('');
  });
});
