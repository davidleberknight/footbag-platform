/**
 * The internal QC subsystem is retired and must stay that way.
 *
 * It was operator tooling for reviewing imported net results, mounted only in dev
 * and staging, and no production deployment may carry its code, routes or tables.
 * Every part of it is named here individually rather than counted, because the
 * failure this guards against is one file coming back, not the whole subsystem.
 *
 * Absence is the success signal. A pattern scan in the convention gate covers the
 * other direction, catching QC code that reappears under a name this list does
 * not know; the two are paired so a rename cannot slip through either one alone.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const repo = (...p: string[]): string => path.join(process.cwd(), ...p);

// This file quotes the banner it scans for, so it must exempt itself.
const SELF = 'tests/unit/qc-subsystem-retired.test.ts';

const RETIRED_DIRECTORIES = [
  'src/internal-qc',
  'src/views/internal-qc',
];

const RETIRED_FILES = [
  'src/routes/internalRoutes.ts',
  'src/internal-qc/controllers/netQcController.ts',
  'src/internal-qc/controllers/personsQcController.ts',
  'src/internal-qc/services/netQcService.ts',
  'src/internal-qc/services/personsQcChecks.ts',
  'src/internal-qc/services/personsQcService.ts',
  'scripts/pentest/probes/internalRoutes.ts',
  'legacy_data/event_results/scripts/14_import_net_review_queue.py',
  'legacy_data/event_results/scripts/16_extract_net_matches_from_noise.py',
  'legacy_data/pipeline/export_approved_aliases.py',
  'legacy_data/pipeline/export_team_corrections.py',
];

const RETIRED_TABLES = [
  'net_review_queue',
  'net_candidate_match',
  'net_curated_match',
  'net_raw_fragment',
  'net_recovery_alias_candidate',
  'net_team_correction_candidate',
];

describe('the internal QC subsystem stays retired', () => {
  it('none of its directories exist', () => {
    const present = RETIRED_DIRECTORIES.filter((d) => fs.existsSync(repo(d)));
    expect(present, present.join('\n')).toEqual([]);
  });

  it('none of its files exist', () => {
    const present = RETIRED_FILES.filter((f) => fs.existsSync(repo(f)));
    expect(present, present.join('\n')).toEqual([]);
  });

  it('the schema defines none of its tables', () => {
    const schema = fs.readFileSync(repo('database/schema.sql'), 'utf8');
    const defined = RETIRED_TABLES.filter((t) =>
      new RegExp(`CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${t}\\b`, 'i').test(schema));
    expect(defined, defined.join('\n')).toEqual([]);
  });

  it('no index survives its dropped tables', () => {
    // An index outlives its table in a hand-edited schema far more easily than a
    // table outlives itself, and SQLite fails at build time on the orphan.
    const schema = fs.readFileSync(repo('database/schema.sql'), 'utf8');
    const orphans = RETIRED_TABLES.filter((t) =>
      new RegExp(`CREATE\\s+INDEX[^;]*\\bON\\s+${t}\\b`, 'i').test(schema));
    expect(orphans, orphans.join('\n')).toEqual([]);
  });

  it('the statement layer names none of its tables', () => {
    // An orphaned export compiles cleanly and no test would ever call it, so the
    // compiler cannot be the thing that catches a statement group coming back.
    const db = fs.readFileSync(repo('src/db/db.ts'), 'utf8');
    const named = RETIRED_TABLES.filter((t) => db.includes(t));
    expect(named, named.join('\n')).toEqual([]);
  });

  it('the application mounts no /internal router', () => {
    const app = fs.readFileSync(repo('src/app.ts'), 'utf8');
    expect(app).not.toMatch(/internalRouter/);
    expect(app).not.toMatch(/app\.use\(\s*['"]\/internal['"]/);
  });

  it('no source file carries the retirement banner', () => {
    // Every QC-only file and statement group carried this banner so the scope
    // could be grepped rather than guessed. Its return means the scope grew back.
    const roots = ['src', 'tests', 'legacy_data/event_results/scripts'];
    const banner = 'QC-only (delete with pipeline-qc';
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '__pycache__') walk(full);
        } else if (/\.(ts|hbs|py|sql)$/.test(entry.name) && full !== repo(SELF)) {
          if (fs.readFileSync(full, 'utf8').includes(banner)) found.push(full);
        }
      }
    };
    for (const root of roots) if (fs.existsSync(repo(root))) walk(repo(root));
    expect(found, found.join('\n')).toEqual([]);
  });

  it('the list this suite checks is the real one', () => {
    // A guard that silently checks nothing is worse than no guard. These counts
    // fail if the arrays are emptied to make the suite pass.
    expect(RETIRED_DIRECTORIES).toHaveLength(2);
    expect(RETIRED_FILES).toHaveLength(11);
    expect(RETIRED_TABLES).toHaveLength(6);
    // And every path must sit under a top-level directory that really exists. A
    // path with a typo'd root is absent for the wrong reason and would pass
    // forever without ever checking anything. The immediate parent is not
    // checked, because for a file inside a deleted subtree it is rightly gone.
    for (const f of [...RETIRED_FILES, ...RETIRED_DIRECTORIES]) {
      const root = f.split('/')[0]!;
      expect(fs.existsSync(repo(root)), `${f}: no such top-level directory ${root}`).toBe(true);
    }
  });
});
