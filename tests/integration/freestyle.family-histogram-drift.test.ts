/**
 * The family histogram describes the dictionary it claims to describe.
 *
 * The chart's family bars are generated from the browse's own family membership
 * and committed as data. That is fast to render and impossible to notice going
 * stale: the numbers looked measured whatever the dictionary had since become,
 * and an earlier generation of them drifted for years while every check stayed
 * green, because the only guard compared the committed data against other
 * committed data and never against a trick.
 *
 * So this measures. It builds a dictionary from the committed inputs in a
 * throwaway directory, asks the same calculation the browse renders how large
 * each family is, and requires the committed numbers to match exactly. A trick
 * that changes family, an input that adds one, a public family admitted or
 * retired: each moves a count here, and each fails until the data is regenerated.
 *
 * Nothing real is read or written. The database is built from committed files
 * into a temp directory and deleted afterwards, and no path under the checkout is
 * touched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * The dictionary loaders, in the order the rebuild runs them. Enough to create
 * every trick row a family can contain; the later stages shape aliases, records
 * and grammar, none of which a family count reads.
 */
const LOADERS = [
  'freestyle/loaders/17_load_trick_dictionary.py',
  'freestyle/loaders/19_load_red_additions.py',
  'freestyle/loaders/20_link_footbag_org_sources.py',
  'freestyle/loaders/21_load_footbag_org_pending_tricks.py',
];

let workdir: string;
let dbPath: string;
/** Family label to measured membership, recomputed from the built dictionary. */
let measured: Map<string, number>;
let committed: typeof import('../../src/content/freestyleFamilyHistogram');

/** Ask the browse how large every public family is, against the built database. */
function measureAgainst(db: string): Map<string, number> {
  const script = `
    process.env.FOOTBAG_DB_PATH = ${JSON.stringify(db)};
    const { freestyleService } = require('${REPO_ROOT}/src/services/freestyleService.ts');
    const page = freestyleService.getFreestyleTricksIndexPage(undefined, 'family');
    const out = {};
    for (const g of page.content.familyGroups) out[g.familyName] = g.cards.length;
    for (const m of page.content.minorLineages) out[m.name] = m.count;
    process.stdout.write(JSON.stringify(out));
  `;
  // A child process, because the service reads its database once at import and
  // this suite's other imports must not be bound to a throwaway file.
  const raw = execFileSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, FOOTBAG_DB_PATH: db, INTERNAL_EVENT_SECRET: 'family-histogram-guard' },
    ...SPAWN_GUARD,
  });
  return new Map(Object.entries(JSON.parse(raw) as Record<string, number>));
}

beforeAll(async () => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-family-histogram-'));
  dbPath = path.join(workdir, 'dictionary.db');

  const schema = fs.readFileSync(path.join(REPO_ROOT, 'database/schema.sql'), 'utf-8');
  const db = new BetterSqlite3(dbPath);
  db.exec(schema);
  db.close();

  for (const loader of LOADERS) {
    execFileSync('python3', [loader, '--db', dbPath], {
      cwd: REPO_ROOT, encoding: 'utf-8', ...SPAWN_GUARD,
    });
  }

  measured = measureAgainst(dbPath);
  committed = await import('../../src/content/freestyleFamilyHistogram');
}, 180_000);

afterAll(() => {
  if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
});

describe('the committed family histogram matches the dictionary', () => {
  it('charts every family the dictionary measures, and no others', () => {
    const chartedLabels = committed.FAMILY_HISTOGRAM_ROWS.map(r => r.label).sort();
    expect(chartedLabels).toEqual([...measured.keys()].sort());
  });

  it('carries the measured count for every family, exactly', () => {
    const asCommitted = Object.fromEntries(
      committed.FAMILY_HISTOGRAM_ROWS.map(r => [r.label, r.count]));
    expect(asCommitted).toEqual(Object.fromEntries(measured));
  });

  it('names every family the dictionary could not measure, and only those', () => {
    // Below the browse's display floor is the only reason a public family has no
    // number, and a name left here after its measurement exists is the stale
    // declaration this list is supposed to make impossible.
    expect([...committed.FAMILIES_WITHOUT_A_MEASURED_ROW]).toEqual([]);
  });

  it('is ordered by the measurement, not by hand', () => {
    const rows = committed.FAMILY_HISTOGRAM_ROWS;
    const expected = [...rows].sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
    expect(rows).toEqual(expected);
  });
});

describe('a dictionary change the chart has not caught up with', () => {
  it('fails rather than rendering a number nothing supports', () => {
    // The proof that the comparison above has teeth: move one trick into another
    // family in a copy of the built dictionary, and the committed numbers stop
    // describing it. Both families shift, so this cannot pass by coincidence.
    const drifted = path.join(workdir, 'drifted.db');
    fs.copyFileSync(dbPath, drifted);

    const db = new BetterSqlite3(drifted);
    const moved = db.prepare(
      "SELECT slug FROM freestyle_tricks WHERE trick_family = 'flurry' AND is_active = 1 LIMIT 1",
    ).get() as { slug: string } | undefined;
    expect(moved, 'the fixture family must have a member to move').toBeDefined();
    db.prepare("UPDATE freestyle_tricks SET trick_family = 'swirl' WHERE slug = ?").run(moved!.slug);
    db.close();

    const after = measureAgainst(drifted);
    const asCommitted = Object.fromEntries(
      committed.FAMILY_HISTOGRAM_ROWS.map(r => [r.label, r.count]));
    expect(Object.fromEntries(after)).not.toEqual(asCommitted);
  });
});
