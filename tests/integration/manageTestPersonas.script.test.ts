/**
 * scripts/manage-test-personas.sh, the wrapper that seeds or rebuilds the
 * dev-and-staging persona harness in a database.
 *
 * The refresh deletes persona-owned rows, including anything a tester built
 * while acting as one, so what this pins is the wrapper's own part: production
 * is refused before anything runs, a missing database is refused rather than
 * created, and the destructive refresh reaches the runner with --apply only when
 * the operator gave it. The runners are replaced by a stand-in `npx` on PATH,
 * visibly in this file, that records what it was asked to run; the runners'
 * behaviour has suites of their own.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'manage-test-personas.sh');

let root: string;
let bin: string;
let log: string;
let db: string;

beforeAll(() => {
  root = createScratchDir('manage-test-personas');
  bin = path.join(root, 'bin');
  log = path.join(root, 'npx.log');
  db = path.join(root, 'footbag.db');
  fs.mkdirSync(bin);
  fs.writeFileSync(db, '');
  fs.writeFileSync(
    path.join(bin, 'npx'),
    `#!/usr/bin/env bash\nprintf '%s FOOTBAG_ENV=%s\\n' "$*" "$FOOTBAG_ENV" >> ${JSON.stringify(log)}\n`,
    { mode: 0o755 },
  );
});
afterAll(() => removeScratch(root));

function run(args: string[], env: Record<string, string> = {}) {
  fs.rmSync(log, { force: true });
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, FOOTBAG_DB_PATH: db, ...env },
    ...SPAWN_GUARD,
  });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  return { ...res, calls };
}

describe('manage-test-personas.sh', () => {
  it('refuses production, by either variable, before any runner starts', () => {
    const both: Record<string, string>[] = [{ NODE_ENV: 'production' }, { FOOTBAG_ENV: 'production' }];
    for (const env of both) {
      const res = run(['--refresh-test-personas', '--apply'], env);
      expect(res.status, JSON.stringify(env)).toBe(2);
      expect(res.stderr).toContain('production is hard-blocked');
      expect(res.calls, JSON.stringify(env)).toEqual([]);
    }
  });

  it('refuses an environment it does not know, so a misspelt production reaches no runner', () => {
    // "Production" or "prod" slips past the exact production check; the runner
    // would then delete persona rows in whatever database it was pointed at.
    for (const value of ['Production', 'prod']) {
      const res = run(['--refresh-test-personas', '--apply'], { FOOTBAG_ENV: value });
      expect(res.status, value).toBe(2);
      expect(res.stderr).toContain(`not '${value}'`);
      expect(res.calls, value).toEqual([]);
    }
  });

  it('refuses a database that is not there rather than letting a runner create one', () => {
    const res = run(['--seed-test-personas'], { FOOTBAG_DB_PATH: path.join(root, 'absent.db') });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('DB file not found');
    expect(res.calls).toEqual([]);
  });

  it('reports a refresh without writing unless --apply is given, wherever it is written', () => {
    const report = run(['--refresh-test-personas'], { FOOTBAG_ENV: 'staging' });
    expect(report.status, report.stderr).toBe(0);
    expect(report.calls).toEqual([`tsx src/testkit/personaRefreshCli.ts --db ${db} FOOTBAG_ENV=staging`]);

    const applied = run(['--apply', '--refresh-test-personas'], { FOOTBAG_ENV: 'staging' });
    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.calls).toEqual([`tsx src/testkit/personaRefreshCli.ts --db ${db} --apply FOOTBAG_ENV=staging`]);
  });
});
