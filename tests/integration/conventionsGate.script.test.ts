/**
 * The convention gate: the rules it enforces, proved red and green.
 *
 * The gate carries around sixty rules that no compiler can check, and every one of
 * them passes against this repository, so nothing here was ever demonstrated to
 * fail. It could not be: on a tree carrying only what one rule reads, the gate used
 * to die at the eighth check, because a search of the stylesheet for class names ran
 * without a tolerated empty match under abort-on-error. Forty rules sat behind that
 * line, none of them ever shown to catch anything.
 *
 * Every case below stands up a throwaway repository holding only what the rule under
 * test reads, plants the violation, and asserts the gate refuses it; then removes the
 * violation and asserts the same message is absent. A check with nothing to scan
 * reports that it did not run, and a fixture tree says it is one by setting
 * CONVENTIONS_FIXTURE_TREE, because on a real checkout a rule with nothing to scan is
 * a rule that has stopped being enforced and the gate fails on it. The last case runs
 * against this repository, which is what keeps the fixtures honest.
 *
 * A few fixture snippets are assembled from pieces rather than written out. The gate
 * scans this directory too, and a skipped-test call or an unswept temp prefix written
 * plainly here would be read as the violation it is standing in for.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const GATE = join(process.cwd(), 'scripts/ci/assert_conventions.sh');

interface RunResult { exitCode: number; stdout: string; stderr: string }

/**
 * Stands up a throwaway repository holding the given files and runs the real gate
 * inside it. The gate resolves its own root through git, so the fixture has to be a
 * repository rather than a bare directory, and the files are staged because one rule
 * reads the tracked tree rather than the filesystem.
 *
 * `declareFixture` is what tells the gate that a check with nothing to scan is
 * expected here; the one case that leaves it off is the case asserting that a real
 * checkout may not skip.
 */
function inFixtureRepo(
  files: Record<string, string>,
  { declareFixture = true }: { declareFixture?: boolean } = {},
): RunResult {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-conventions-gate-'));
  try {
    spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
    for (const [name, body] of Object.entries(files)) {
      const full = join(root, name);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    spawnSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8', ...SPAWN_GUARD });
    const env = { ...process.env };
    if (declareFixture) env.CONVENTIONS_FIXTURE_TREE = '1';
    else delete env.CONVENTIONS_FIXTURE_TREE;
    const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', env, ...SPAWN_GUARD });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A stylesheet that satisfies every other rule about the stylesheet. */
const PLAIN_CSS = ':root {\n  --brand: #336699;\n}\n\n.form-known {\n  color: inherit;\n}\n';

/**
 * The rule ran, and was not quietly skipped.
 *
 * Without this, a green case proves nothing: a check whose target is absent reports
 * that it did not run and the gate still exits zero, which reads exactly like the
 * rule having examined the fixture and found it clean. That confusion is the defect
 * this whole suite exists to close, so every green case says which rule it means.
 */
function expectCheckRan(res: RunResult, name: string): void {
  expect(res.stdout).toContain(`[conventions] check: ${name}`);
  expect(res.stdout).not.toContain(`check: ${name} -- DID NOT RUN`);
}

describe('the convention gate: rules about src/', () => {
  it('refuses SQL compiled outside the database layer', () => {
    const res = inFixtureRepo({
      'src/services/thing.ts': "export const row = handle.prepare('SELECT 1').get();\n",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('SQL compilation must live in src/db/db.ts');
    expect(res.stderr).toContain('src/services/thing.ts');
  });

  it('accepts SQL compiled in the database layer', () => {
    const res = inFixtureRepo({
      'src/db/db.ts': "export const row = handle.prepare('SELECT 1').get();\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain('SQL compilation must live');
    expectCheckRan(res, '.prepare( outside src/db/db.ts');
  });

  it('refuses a payment SDK import outside the adapter seam', () => {
    const res = inFixtureRepo({
      'src/services/billing.ts': "import Stripe from 'stripe';\nexport const s = Stripe;\n",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('must live in src/adapters/');
  });

  it('accepts the same import inside the adapter seam', () => {
    const res = inFixtureRepo({
      'src/adapters/billing.ts': "import Stripe from 'stripe';\nexport const s = Stripe;\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'AWS SDK / Stripe imports outside src/adapters/');
  });

  it('refuses an environment read outside the config singleton', () => {
    const res = inFixtureRepo({
      'src/services/thing.ts': 'export const port = process.env.PORT;\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('must go through src/config/env.ts');
  });

  it('accepts the environment read inside the config singleton', () => {
    const res = inFixtureRepo({
      'src/config/env.ts': 'export const port = process.env.PORT;\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'process.env reads outside src/config/env.ts');
  });
});

describe('the convention gate: rules about templates and the stylesheet', () => {
  it('refuses an inline style attribute, which the page policy blocks in production', () => {
    const res = inFixtureRepo({
      'src/views/page.hbs': '<div style="color: red">hello</div>\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('inline style/script violates CSP');
  });

  it('accepts the same markup carrying a class', () => {
    const res = inFixtureRepo({
      'src/views/page.hbs': '<div class="intro">hello</div>\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'inline style/script in src/views/**');
  });

  it('refuses a form class the stylesheet does not define', () => {
    // The rule that used to end the run before anything after it could be proved.
    const res = inFixtureRepo({
      'src/public/css/style.css': PLAIN_CSS,
      'src/views/page.hbs': '<div class="form-unknown">hello</div>\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('form-* class with no rule');
    expect(res.stderr).toContain('form-unknown');
  });

  it('accepts a form class the stylesheet defines', () => {
    const res = inFixtureRepo({
      'src/public/css/style.css': PLAIN_CSS,
      'src/views/page.hbs': '<div class="form-known">hello</div>\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'undefined form-* classes in src/views/**');
  });

  it('reports a form class against a stylesheet defining no form vocabulary at all', () => {
    // An empty match on the stylesheet is the shape that used to end the run: the
    // search for defined class names found none, and a pipeline that finds nothing
    // fails under abort-on-error. The rule has an answer for this tree, and it is
    // the one below rather than silence.
    const res = inFixtureRepo({
      'src/public/css/style.css': ':root {\n  --brand: #336699;\n}\n',
      'src/views/page.hbs': '<div class="form-anything">hello</div>\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('form-anything');
  });

  it('refuses a colour written into a rule instead of a token', () => {
    const res = inFixtureRepo({
      'src/public/css/style.css': '.intro {\n  color: #ff0000;\n}\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('colors must use :root tokens');
  });

  it('accepts a colour declared as a token', () => {
    const res = inFixtureRepo({ 'src/public/css/style.css': PLAIN_CSS });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'raw hex color outside :root in style.css');
  });
});

describe('the convention gate: rules about tests/', () => {
  // Written in pieces: spelled out, these would be the violations themselves, and
  // the gate scans this directory.
  const SKIPPED_CALL = ['it', '.skip', '('].join('');
  const UNSWEPT_TEMP = `mkdtempSync(join(tmpdir(),${" '"}scratch-'))`;
  const SPAWN = 'spawnSync';

  it('refuses a committed skipped test', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts': `${SKIPPED_CALL}'later', () => {});\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('committed skipped tests are forbidden');
  });

  it('accepts the same test unskipped', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts': "it('now', () => {});\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'committed .skip/.todo/xit in tests');
  });

  it('refuses a temp path the session sweep will never reclaim', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts': `const dir = ${UNSWEPT_TEMP};\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('must start with the swept');
  });

  it('accepts a temp path carrying the swept prefix', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts': "const dir = mkdtempSync(join(tmpdir(), 'footbag-test-thing-'));\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'temp paths in tests carry the swept prefix');
  });

  it('refuses a synchronous spawn with no bound on how long it may run', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts': `const r = ${SPAWN}('sleep', ['3600']);\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('must spread SPAWN_GUARD');
  });

  it('refuses a spawn handed an environment built from scratch', () => {
    // The isolation that keeps a spawned operator script away from real cloud
    // credentials lives in the inherited environment. Replacing it wholesale hands
    // the script a clean one, and on a maintainer's machine that means a real
    // operator identity.
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts':
        "import { SPAWN_GUARD } from '../fixtures/spawnGuard';\n"
        + `const r = ${SPAWN}('bash', ['deploy'], { env: { PATH: '/usr/bin' }, ...SPAWN_GUARD });\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('spawn env replaces the isolated one');
  });

  it('accepts a spawn whose environment inherits the isolated one', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts':
        "import { SPAWN_GUARD } from '../fixtures/spawnGuard';\n"
        + `const r = ${SPAWN}('bash', ['deploy'], `
        + "{ env: { ...process.env, PATH: '/usr/bin' }, ...SPAWN_GUARD });\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'real cloud storage / deployed DB access in tests');
  });
});

describe('the convention gate: what it does with nothing to scan', () => {
  it('runs every check on a tree that carries almost nothing', () => {
    const res = inFixtureRepo({ 'notes.txt': 'nothing to see\n' });
    expect(res.exitCode, res.stderr).toBe(0);
    // The last rule in the file. Reaching it is the whole point: the run used to
    // stop at the eighth check and nothing past it could be proved at all.
    expect(res.stdout).toContain('UPDATE statements stamp the metadata columns');
    expect(res.stdout.match(/\[conventions\] check:/g)?.length ?? 0).toBeGreaterThan(50);
  });

  it('says which checks did not run rather than reporting a clean pass', () => {
    const res = inFixtureRepo({ 'notes.txt': 'nothing to see\n' });
    expect(res.stdout).toContain('DID NOT RUN');
    expect(res.stdout).toContain('did not run)');
    expect(res.stdout).not.toContain('all rules pass');
  });

  it('refuses to skip anything unless the run says it is a fixture tree', () => {
    // A real checkout carries every path, so a check with nothing to scan there is a
    // rule that has quietly stopped being enforced.
    const res = inFixtureRepo({ 'notes.txt': 'nothing to see\n' }, { declareFixture: false });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('every check runs against this repository');
  });

  it('passes against this repository, with every check running', () => {
    const res = spawnSync('bash', [GATE], {
      cwd: process.cwd(), encoding: 'utf8', ...SPAWN_GUARD,
    });
    expect(res.status, res.stderr ?? '').toBe(0);
    expect(res.stdout).toContain('[conventions] all rules pass');
    expect(res.stdout).not.toContain('DID NOT RUN');
  });
});
