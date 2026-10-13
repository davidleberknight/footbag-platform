/**
 * scripts/lib/shipped-db-checks.sh -- every data-quality check, run on the
 * database a production deploy is about to ship.
 *
 * Contract: shipped_db_checks returns non-zero whenever any check fails or cannot
 * run, names every failing check rather than stopping at the first, and judges
 * the database it was given rather than whatever the environment names. A
 * database with no member load is refused, whether the import gates report it or
 * the presence count does. A check whose output carries an address fails with the
 * output withheld. It runs inside a caller under errexit without ending that
 * caller on the first failing check.
 *
 * The library under test is the real file. The checks it runs are stand-ins in a
 * scratch repository root, each recording the database it was pointed at and
 * exiting as the case sets; the Python interpreter is found through
 * python-env.sh's own repository-root seam. The member-load count reads a real
 * database built from the schema.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { createTestDb } from '../fixtures/testDb';
import { insertLegacyMember } from '../fixtures/factories';

const LIB = join(process.cwd(), 'scripts', 'lib', 'shipped-db-checks.sh');
const scratch = createScratchDir('shipped-db-checks');
afterAll(() => removeScratch(scratch));
let seq = 0;

const BASH_CHECKS = [
  'validate-legacy-import-gates.sh',
  'validate-realdata-ri.sh',
  'validate-club-candidates.sh',
  'validate-bootstrap-leaders.sh',
  'validate-name-variants.sh',
  'validate-showcase-presence.sh',
  'audit-dev-shortcuts.sh',
];
const PY_CHECKS = ['validate_legacy_honors.py', 'audit_member_data.py'];

function exe(path: string, lines: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...lines].join('\n') + '\n', { mode: 0o755 });
}

interface World {
  /** Exit status per check file name; unnamed checks pass. */
  exits?: Record<string, number>;
  /** Text a check prints. */
  says?: Record<string, string>;
  memberLoad?: boolean;
  python?: boolean;
  /** Ship a path where no database exists. */
  noDatabase?: boolean;
  /** Run the checks twice in one shell, failing first and passing second. */
  twice?: boolean;
}

function run(w: World) {
  const root = join(scratch, `root-${++seq}`);
  const log = join(root, 'calls.log');
  mkdirSync(join(root, 'scripts'), { recursive: true });
  const stub = (name: string, extra: string[] = []) => [
    ...extra,
    `echo "${name} FOOTBAG_DB_PATH=\${FOOTBAG_DB_PATH:-unset} PWD=$PWD $*" >> ${JSON.stringify(log)}`,
    ...(w.says?.[name] ? [`echo ${JSON.stringify(w.says[name])}`] : []),
    `exit ${w.exits?.[name] ?? 0}`,
  ];
  for (const name of BASH_CHECKS) exe(join(root, 'scripts', name), stub(name));
  if (w.python ?? true) {
    const bin = join(root, 'legacy_data', 'footbag_venv', 'bin');
    mkdirSync(bin, { recursive: true });
    exe(join(bin, 'python'), [
      'name="$(basename "$1")"',
      ...PY_CHECKS.map((c) => `if [[ "$name" == ${c} ]]; then\n${stub(c).join('\n')}\nfi`),
      'exit 99',
    ]);
  }

  const db = join(root, 'ship.db');
  if (!w.noDatabase) {
    const handle = createTestDb(db);
    insertLegacyMember(handle, { import_source: (w.memberLoad ?? true) ? 'legacy_site_data' : 'system_fixture' });
    handle.close();
  }

  const call = `shipped_db_checks ${JSON.stringify(root)} ${JSON.stringify(db)} && echo VERDICT=pass || echo VERDICT=refused`;
  const flip = join(root, 'scripts', 'validate-realdata-ri.sh');
  const res = spawnSync('bash', ['-c', [
    'set -euo pipefail',
    `source ${JSON.stringify(LIB)}`,
    ...(w.twice
      // The first run fails one check; the stand-in is then made to pass, and
      // the second run in the same shell must judge only what it saw.
      ? [call, `printf '#!/usr/bin/env bash\\nexit 0\\n' > ${JSON.stringify(flip)}`, call]
      : [call]),
  ].join('\n')], {
    encoding: 'utf8',
    env: { ...process.env, FOOTBAG_REPO_ROOT: root, FOOTBAG_DB_PATH: '/elsewhere/footbag.db' },
    ...SPAWN_GUARD,
  });
  const verdicts = [...(res.stdout ?? '').matchAll(/VERDICT=(\w+)/g)].map((m) => m[1]);
  return {
    root,
    db,
    verdict: verdicts[verdicts.length - 1],
    verdicts,
    err: res.stderr ?? '',
    calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
  };
}

describe('the data-quality checks a production ship runs', () => {
  // Defect caught: a correct migration load is refused at go-live, or a check
  // judges the developer database named in the environment instead of the file
  // about to ship.
  it('passes when every check passes, each run against the database to ship', () => {
    const r = run({});
    expect(r.verdict, r.err).toBe('pass');
    expect(r.err).toContain('every check passed on the database to ship');
    // Each check runs from the repository root, where the real checks resolve
    // their relative inputs.
    for (const name of BASH_CHECKS) {
      expect(r.calls, name).toContain(`${name} FOOTBAG_DB_PATH=${r.db} PWD=${r.root} `);
    }
    expect(r.calls).toMatch(new RegExp(`audit_member_data\\.py .* --db ${r.db}`));
    // The honours check judges the flags as loaded, against the committed
    // rosters named absolutely so the working directory cannot redirect them.
    const honours = r.calls.split('\n').find((l) => l.startsWith('validate_legacy_honors.py')) ?? '';
    expect(honours).toContain(`--flags-from-db --db ${r.db}`);
    expect(honours).toContain(`--hof-csv ${r.root}/legacy_data/inputs/hof.csv`);
    expect(honours).toContain(`--bap-csv ${r.root}/legacy_data/inputs/bap_data_updated.csv`);
    expect(r.calls).not.toContain('/elsewhere/footbag.db');
  });

  // Defect caught: a check's own explanation of a failure is swallowed, so the
  // operator sees only that something failed.
  it('shows what a check printed', () => {
    const r = run({ exits: { 'validate-name-variants.sh': 1 }, says: { 'validate-name-variants.sh': 'GATE: G11 FAIL: 12 rows' } });
    expect(r.verdict, r.err).toBe('refused');
    expect(r.err).toContain('GATE: G11 FAIL: 12 rows');
  });

  // Defect caught: a deploy pointed at a database that was never built ships
  // whatever the host already has, or passes because nothing was there to fail.
  it('refuses a database path with no file behind it', () => {
    const r = run({ noDatabase: true });
    expect(r.verdict, r.err).toBe('refused');
    expect(r.err).toContain(`the database to ship is not at ${r.db}`);
    expect(r.calls).toBe('');
  });

  // Defect caught: a failure from an earlier run in the same shell is carried
  // into the next verdict, so a fixed database is still refused.
  it('judges each run on its own checks', () => {
    const r = run({ exits: { 'validate-realdata-ri.sh': 1 }, twice: true });
    expect(r.verdicts, r.err).toEqual(['refused', 'pass']);
  });

  // Defect caught: a database failing a check ships, or the operator fixes one
  // failure only to meet the next on the following attempt.
  it('refuses on any failing check and names every failure, running the rest', () => {
    const r = run({ exits: { 'validate-realdata-ri.sh': 1, 'audit-dev-shortcuts.sh': 1 } });
    expect(r.verdict, r.err).toBe('refused');
    expect(r.err).toContain('2 check(s) failed');
    expect(r.err).toContain('  - real-data invariants');
    expect(r.err).toContain('  - development residue');
    expect(r.calls).toContain('audit_member_data.py');
  });

  // Defect caught: a Python check failing is read as a pass because it runs
  // under a different interpreter path than the shell gates.
  it('refuses when a Python check fails', () => {
    const r = run({ exits: { 'audit_member_data.py': 1 } });
    expect(r.verdict, r.err).toBe('refused');
    expect(r.err).toContain('  - member-data audits');
  });

  // Defect caught: the import gates' "nothing to judge" exit is treated as a
  // skip, so a production database without the member load ships.
  it('refuses the import gates reporting no member load', () => {
    const r = run({ exits: { 'validate-legacy-import-gates.sh': 78 } });
    expect(r.verdict, r.err).toBe('refused');
    expect(r.err).toContain('FAIL legacy import gates: the database carries no member load');
  });

  it('refuses a database with no account imported from the legacy site', () => {
    const r = run({ memberLoad: false });
    expect(r.verdict, r.err).toBe('refused');
    expect(r.err).toContain('  - member load present');
    expect(r.err).toContain('0 accounts imported from the legacy site');
  });

  // Defect caught: a member's address printed by a check lands in a captured
  // deploy log.
  it('withholds and fails a check whose output carries an address', () => {
    const r = run({ says: { 'validate_legacy_honors.py': 'mismatch for someone@example.com' } });
    expect(r.verdict, r.err).toBe('refused');
    expect(r.err).toContain('FAIL honours flags: output withheld');
    expect(r.err).not.toContain('someone@example.com');
  });

  // Defect caught: a machine without the legacy-data environment skips the
  // honours check and the audits and ships anyway.
  it('refuses when the Python checks cannot run', () => {
    const r = run({ python: false });
    expect(r.verdict, r.err).toBe('refused');
    expect(r.err).toContain('  - honours flags');
    expect(r.err).toContain('  - member-data audits');
  });
});
