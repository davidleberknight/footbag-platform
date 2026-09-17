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
 * a rule that has stopped being enforced and the gate fails on it.
 *
 * What keeps these fixtures honest is the gate's own run against this repository, in
 * the pre-PR script, the full local runner, the clean-room gate and continuous
 * integration. That run is deliberately not repeated here. Without
 * CONVENTIONS_FIXTURE_TREE the gate already fails closed on any check that found
 * nothing to scan, so its exit status alone carries everything a copy of it here
 * could assert, and a full scan of the tree takes about twenty seconds, which on a
 * slower machine exceeds the bound every spawn in this file runs under and would be
 * reported as a killed worker rather than as a named failure.
 *
 * A few fixture snippets are assembled from pieces rather than written out. The gate
 * scans this directory too, and a skipped-test call or an unswept temp prefix written
 * plainly here would be read as the violation it is standing in for.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
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

  it('accepts a tree where the vitest config marker and its refusal are both present', () => {
    // The marker and the refusal that reads it are a pair and either alone is
    // inert: a config that stamps nothing cannot be detected as absent, and a
    // setup that never looks is satisfied by any config at all. The gate holds
    // both rather than trusting the next edit to keep them together.
    const res = inFixtureRepo({
      'vitest.config.ts': "env: { FOOTBAG_VITEST_CONFIG_LOADED: '1' },\n",
      'tests/setup-env.ts': "if (!process.env.FOOTBAG_VITEST_CONFIG_LOADED) throw new Error('x');\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, "the test setup proves this repository's vitest config is in force");
  });

  it('refuses a vitest config that stamps no marker into the worker', () => {
    const res = inFixtureRepo({
      'vitest.config.ts': 'export default { test: { globals: true } };\n',
      'tests/setup-env.ts': "if (!process.env.FOOTBAG_VITEST_CONFIG_LOADED) throw new Error('x');\n",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('must stamp FOOTBAG_VITEST_CONFIG_LOADED');
  });

  it('refuses a test setup that never checks whether the marker arrived', () => {
    const res = inFixtureRepo({
      'vitest.config.ts': "env: { FOOTBAG_VITEST_CONFIG_LOADED: '1' },\n",
      'tests/setup-env.ts': 'export const setup = () => undefined;\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('must refuse to run when FOOTBAG_VITEST_CONFIG_LOADED is absent');
  });

  it('refuses a test setup that has stopped neutralising an AWS credential source', () => {
    // Default-deny in one place rather than per file, because per file is a rule
    // the next file forgets. Dropping any one source from the declaration
    // reopens the whole path: a spawned child inherits the environment, so a
    // test running an operator script would be authenticated again.
    const res = inFixtureRepo({
      'tests/setup-env.ts':
        "import { NO_AWS_CREDENTIALS } from './fixtures/awsIsolation';\n" +
        "if (process.env.RUN_STAGING_SMOKE !== '1') Object.assign(process.env, NO_AWS_CREDENTIALS);\n",
      'tests/fixtures/awsIsolation.ts':
        "export const NO_AWS_CREDENTIALS = { AWS_PROFILE: '', AWS_CONFIG_FILE: '/dev/null', AWS_SHARED_CREDENTIALS_FILE: '/dev/null' };\n",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('no longer neutralises AWS_EC2_METADATA_DISABLED');
  });

  it('accepts a test setup that neutralises every declared AWS credential source', () => {
    const res = inFixtureRepo({
      'tests/setup-env.ts':
        "import { NO_AWS_CREDENTIALS } from './fixtures/awsIsolation';\n" +
        "if (process.env.RUN_STAGING_SMOKE !== '1') Object.assign(process.env, NO_AWS_CREDENTIALS);\n",
      'tests/fixtures/awsIsolation.ts':
        "export const NO_AWS_CREDENTIALS = { AWS_PROFILE: '', AWS_CONFIG_FILE: '/dev/null', AWS_SHARED_CREDENTIALS_FILE: '/dev/null', AWS_EC2_METADATA_DISABLED: 'true' };\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'the test setup isolates AWS credentials');
  });

  it('refuses a machine declaration that has stopped denying the SSH client', () => {
    // No environment variable can deny it: the client reads a system-wide
    // configuration as well as the one under the home directory, so an empty
    // home leaves a spawned script resolving whichever aliases the workstation
    // happens to define, and the verdict follows the machine rather than the
    // code. The stub at the front of the search path is the only mechanism, and
    // it is worth a rule because removing it is invisible on any machine.
    const res = inFixtureRepo({
      'tests/setup-env.ts':
        "import { noMachineState } from './fixtures/machineIsolation';\n" +
        'Object.assign(process.env, noMachineState(root));\n',
      'tests/fixtures/machineIsolation.ts':
        "export const MACHINE_ENV_TO_CLEAR = ['FOOTBAG_ENV'];\n" +
        'export function noMachineState(root) {\n' +
        '  return { HOME: root, FOOTBAG_MEDIA_DIR: root, FOOTBAG_CURATED_MEDIA_DIR: root };\n' +
        '}\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('no longer puts a stub ssh at the front of PATH');
  });

  it('accepts a machine declaration that puts a stub ssh at the front of the path', () => {
    const res = inFixtureRepo({
      'tests/setup-env.ts':
        "import { noMachineState } from './fixtures/machineIsolation';\n" +
        'Object.assign(process.env, noMachineState(root));\n',
      'tests/fixtures/machineIsolation.ts':
        "export const MACHINE_ENV_TO_CLEAR = ['FOOTBAG_ENV'];\n" +
        'export function noMachineState(root) {\n' +
        "  writeFileSync(join(root, 'ssh'), STUB);\n" +
        '  return {\n' +
        '    HOME: root, FOOTBAG_MEDIA_DIR: root, FOOTBAG_CURATED_MEDIA_DIR: root,\n' +
        '    PATH: `${root}:${process.env.PATH}`,\n' +
        '  };\n' +
        '}\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain('no longer puts a stub ssh');
    expectCheckRan(res, 'the test setup isolates the rest of the machine');
  });

  it('refuses a script that names one account home directory', () => {
    // Correct only while the connecting account is that account. For anyone else
    // the run either dies on a permission error or ships from a tree belonging to
    // a different login, and the rebuild path promoted a database that way.
    const res = inFixtureRepo({
      'scripts/deploy-thing.sh': "RELEASE_DIR=/home/someone/footbag-release\necho \"$RELEASE_DIR\"\n",
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("names one account's home directory");
    expect(res.stderr).toContain('scripts/deploy-thing.sh');
  });

  it('accepts a release directory the caller resolves and sends', () => {
    const res = inFixtureRepo({
      'scripts/deploy-thing.sh':
        'REMOTE_HOME="$(ssh "$REMOTE" \'printf %s "$HOME"\')"\n' +
        'RELEASE_DIR="${REMOTE_HOME}/footbag-release"\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'no account home directories named in scripts/');
  });

  it('keeps the hook-fixture exemption narrow, to that one file', () => {
    // The literal there is the denied command a hook case asserts on. The
    // exemption is by filename, so this is what proves it did not widen into a
    // pattern that would excuse a real script sitting beside it.
    const res = inFixtureRepo({
      'scripts/ci/test_hooks.sh': "expect \"$H\" 'cat /home/user/.ssh/config' deny\n",
      'scripts/deploy-thing.sh': 'RELEASE_DIR=/home/someone/footbag-release\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/deploy-thing.sh');
    expect(res.stderr).not.toContain('test_hooks.sh');
  });

  it('refuses a script that asks the values file whether an address is allowed', () => {
    // A values file says what was last declared, not what the firewall holds, and
    // a text match can see neither a containing range nor a source-IP alias. Two
    // scripts asked it this way and drifted apart in opposite directions; fixing
    // both would not have stopped a third.
    const res = inFixtureRepo({
      'scripts/arm-thing.sh': 'if grep -qF -- "\\"$EGRESS_IP/32\\"" "$TFVARS_PATH"; then :; fi\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('reads the operator allowlist out of a values file');
    expect(res.stderr).toContain('scripts/arm-thing.sh');
  });

  it('refuses the same question asked of the allowlist variable by name', () => {
    const res = inFixtureRepo({
      'scripts/arm-thing.sh': 'grep -q operator_cidrs "$TFVARS_PATH"\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('reads the operator allowlist out of a values file');
  });

  it('refuses a script that runs a deploy without asking whether it can connect', () => {
    // The half that catches the script nobody has written yet: whether this
    // workstation still reaches the host is the one control that decides whether
    // the deploy can start at all.
    const res = inFixtureRepo({
      'scripts/ship-thing.sh': '  DEPLOY_TARGET="$SSH_ALIAS" "$DEPLOY_CMD" -k\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('without asking whether this workstation can still reach');
    expect(res.stderr).toContain('scripts/ship-thing.sh');
  });

  it('accepts a script that runs a deploy and calls the shared check first', () => {
    const res = inFixtureRepo({
      'scripts/ship-thing.sh':
        'source "${REPO_ROOT}/scripts/lib/egress-allowlist.sh"\n' +
        '  egress_allowlist_check "$TARGET" "$SSH_ALIAS"\n' +
        '  DEPLOY_TARGET="$SSH_ALIAS" "$DEPLOY_CMD" -k\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'the firewall check before a deploy is live, and is actually called');
  });

  it('does not read an instruction about a deploy as running one', () => {
    // The pattern is the assignment-prefixed invocation. A script that prints the
    // command for an operator to run later is not the one that has to have asked,
    // and flagging it would push the next author to satisfy the rule with a call
    // that runs nowhere near a deploy.
    const res = inFixtureRepo({
      'scripts/tell-thing.sh': 'echo "  DEPLOY_TARGET=$SSH_ALIAS ./deploy_to_aws.sh"\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
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
    expect(res.stderr).toContain('class with no rule');
    expect(res.stderr).toContain('form-unknown');
  });

  it('accepts a form class the stylesheet defines', () => {
    const res = inFixtureRepo({
      'src/public/css/style.css': PLAIN_CSS,
      'src/views/page.hbs': '<div class="form-known">hello</div>\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'undefined classes in src/views/**');
  });

  it('refuses an undefined class that carries no form prefix', () => {
    // The check reads every class token, not one prefix. A table class with no
    // rule and a button variant defined only under some other container both
    // reached production while the scan looked at `form-` alone, and an
    // undefined class renders silently unstyled with every route test green.
    const res = inFixtureRepo({
      'src/public/css/style.css': PLAIN_CSS,
      'src/views/page.hbs': '<table class="roster-table">hello</table>\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('roster-table');
  });

  it('accepts a literal prefix the template completes with a template expression', () => {
    // `page-{{section}}` is a prefix a value completes, never a class in itself,
    // so the scan must not read the literal half as an undefined class. The
    // literal names around the expression are still real tokens: `form-known`
    // here is defined, and the case below proves an undefined one is caught.
    const res = inFixtureRepo({
      'src/public/css/style.css': PLAIN_CSS,
      'src/views/page.hbs': '<div class="form-known page-{{currentSection}}">hi</div>\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'undefined classes in src/views/**');
  });

  it('still reads a whole literal class sitting beside a template expression', () => {
    const res = inFixtureRepo({
      'src/public/css/style.css': PLAIN_CSS,
      'src/views/page.hbs':
        '<div class="form-known{{#if wide}} roster-wide{{/if}}">hi</div>\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('roster-wide');
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

  // Assembled rather than written out, for the reason the header gives: a line
  // reading exactly like the closing argument below IS the violation, and the
  // gate scans this directory too.
  const CONFIG = 'export default { test: { testTimeout: 30_000 } };\n';
  const closeWith = (n: string): string => `${'}'}, ${n});`;
  const caseClosing = (n: string): string => `it('x', async () => {\n${closeWith(n)}\n`;
  const hookClosing = (n: string): string => `beforeAll(async () => {\n${closeWith(n)}\n`;

  it('refuses a per-test timeout that only restates the configured default', () => {
    const res = inFixtureRepo({
      'vitest.config.ts': CONFIG,
      'tests/unit/thing.test.ts': caseClosing('30_000'),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('equals the configured testTimeout');
  });

  it('accepts a per-test timeout that differs from the default', () => {
    const res = inFixtureRepo({
      'vitest.config.ts': CONFIG,
      'tests/unit/thing.test.ts': caseClosing('120_000'),
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'tests/ declare a timeout equal to the configured default');
  });

  // Assembled for the same reason: written out plainly, these are the violation.
  const NOW = `Date${'.'}now()`;
  const clockAssertion = `it('x', () => {\n  expect(${NOW} - started).toBeLessThan(3000);\n});\n`;

  it('refuses an assertion decided by the clock', () => {
    const res = inFixtureRepo({ 'tests/unit/thing.test.ts': clockAssertion });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('decided by the clock');
  });

  it('accepts the same assertion when its bound comes from a budget the code declares', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts':
        "it('x', () => {\n  // budget-is-the-contract: a multiple of the client timeout.\n"
        + `  expect(${NOW} - started).toBeLessThan(TIMEOUT_MS * 20);\n});\n`,
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'tests/ assert against an unfrozen clock or unseeded randomness');
  });

  it('accepts an unfrozen source used to build test data rather than to decide a verdict', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts': `const id = ${NOW};\nit('x', () => {\n  expect(id).toBeTruthy();\n});\n`,
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'tests/ assert against an unfrozen clock or unseeded randomness');
  });

  it('accepts the same number on a hook, which is measured against a different budget', () => {
    const res = inFixtureRepo({
      'vitest.config.ts': CONFIG,
      'tests/unit/thing.test.ts': hookClosing('30_000'),
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'tests/ declare a timeout equal to the configured default');
  });
});

describe('the convention gate: the AWS-identity delegation', () => {
  it('runs the identity gate, and fails the run when that gate refuses', () => {
    // The sub-gate has its own suite; what is pinned here is that the
    // conventions run actually reaches it, since a delegation that silently
    // stopped being invoked would leave a rule enforced by nothing.
    // The delegated gate has to exist inside the fixture for the delegation to
    // run at all, so the real one is copied in: a stand-in would prove the
    // conventions gate calls something, not that it calls this.
    const res = inFixtureRepo({
      'scripts/ci/check_aws_identity.sh': readFileSync(
        join(process.cwd(), 'scripts/ci/check_aws_identity.sh'),
        'utf8',
      ),
      'scripts/thing.sh': ['#!/usr/bin/env bash', 'aws ssm get-parameter --name /x', ''].join('\n'),
    });
    expect(res.exitCode).toBe(1);
    expectCheckRan(res, 'AWS identity resolution (delegated)');
    expect(res.stderr).toContain('never says where its identity comes from');
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

});

/**
 * The verdict has to name what was violated.
 *
 * The gate runs sixty-five checks and keeps going after one fails, so a rule broken
 * early has its offending file:line pushed out of the sixty-line tail that
 * run_all_tests.sh and the clean room re-show on a failure — and both delete their
 * captured logs on the way out. The verdict was a bare count, so the reader was told
 * that one rule was violated, never which, with nothing left to scroll back to.
 */
describe('the convention gate: the verdict says which rule failed', () => {
  it('names the violated rule after the count, where the tail of the run will carry it', () => {
    const res = inFixtureRepo({
      'src/services/thing.ts': "export const row = handle.prepare('SELECT 1').get();\n",
    });
    expect(res.exitCode).toBe(1);

    const countAt = res.stderr.indexOf('rule(s) violated');
    expect(countAt, 'the gate must still report a count').toBeGreaterThan(-1);
    const verdict = res.stderr.slice(countAt);
    expect(verdict).toContain('.prepare( outside src/db/db.ts');
  });

  it('names every violated rule when more than one failed', () => {
    const res = inFixtureRepo({
      'src/services/thing.ts': "export const row = handle.prepare('SELECT 1').get();\n",
      // A second, unrelated rule: a test file that spawns synchronously without
      // importing the shared spawn bound. Assembled rather than written plainly,
      // because the gate scans this directory too.
      'tests/integration/x.test.ts': `import { ${'spawnSync'} } from 'node:child_process';\n${'spawnSync'}('ls', []);\n`,
    });
    expect(res.exitCode).toBe(1);

    const verdict = res.stderr.slice(res.stderr.indexOf('rule(s) violated'));
    expect(verdict).toContain('.prepare( outside src/db/db.ts');
    expect(verdict.split('\n').filter((l) => l.startsWith('  ')).length).toBeGreaterThan(1);
  });

  it('names no rule when the gate passes', () => {
    const res = inFixtureRepo({
      'src/db/db.ts': "export const row = handle.prepare('SELECT 1').get();\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain('rule(s) violated');
  });
});

// The rule that test comments and test names never cite a document. A test
// describes a lasting contract in plain words; a document path or section number
// rots as the documents move, and a finding id is throwaway.
//
// It was a search over whole files, so it also matched string DATA -- a filename
// a fixture builds, a path a test asserts on -- which is neither a citation nor
// something that can rot. Two exceptions had been hand-written into it to shield
// individual literals, which is the shape of a rule patched at the symptom, and a
// third literal then failed the same way. It now reads comment text and the names
// of test declarations, which is what it always said it covered.
describe('the convention gate: citing a document from a test', () => {
  const RULE = 'tests/ doc / finding-id references';

  it('refuses a document path in a comment', () => {
    const res = inFixtureRepo({
      'tests/x.test.ts': "// see DESIGN_DECISIONS for why\nexport const a = 1;\n",
    });
    expectCheckRan(res, RULE);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('doc reference or finding id in test comment or name');
  });

  it('refuses a document path in a test name', () => {
    // The cited name is assembled rather than written out, so that the fixture
    // on disk carries it while this file does not. A test whose subject is a
    // banned string is otherwise caught by the very rule it is testing.
    const cited = 'USER_' + 'STORIES';
    const res = inFixtureRepo({
      'tests/x.test.ts': `it('matches ${cited}', () => {});\n`,
    });
    expectCheckRan(res, RULE);
    expect(res.exitCode).toBe(1);
  });

  it('refuses a finding id in a comment, which is the throwaway kind', () => {
    const res = inFixtureRepo({
      'tests/x.test.ts': "// regression: B12\nexport const a = 1;\n",
    });
    expectCheckRan(res, RULE);
    expect(res.exitCode).toBe(1);
  });

  it('refuses a block comment spanning lines', () => {
    // The scanner tracks block comments across lines; a citation on the second
    // line of one is the case a line-by-line reader misses.
    const res = inFixtureRepo({
      'tests/x.test.ts': "/*\n * see DATA_GOVERNANCE\n */\nexport const a = 1;\n",
    });
    expectCheckRan(res, RULE);
    expect(res.exitCode).toBe(1);
  });

  it('allows a filename that is fixture data rather than a citation', () => {
    // The case that surfaced the defect: a synthetic repository whose contents
    // are described by filename. Nothing here points a reader at a document.
    const res = inFixtureRepo({
      'tests/x.test.ts': "const files = { 'README.md': 'no scripts here\\n' };\nexport default files;\n",
    });
    expectCheckRan(res, RULE);
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('allows an asserted string value that happens to name a path', () => {
    // The second hand-written exception this replaces: a test checking that some
    // output contains a path is asserting behaviour, not citing a document.
    const res = inFixtureRepo({
      'tests/x.test.ts': "expect(out).toContain('exploration/notes');\n",
    });
    expectCheckRan(res, RULE);
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('still allows a comment naming the document extension a scanner skips', () => {
    // The one hand-written exception that is legitimate and stays: the comment is
    // about which file types are scanned, not about a document to go and read.
    const res = inFixtureRepo({
      'tests/x.test.ts': "// It does NOT scan documentation (.md); doc content is governed elsewhere\nexport const a = 1;\n",
    });
    expectCheckRan(res, RULE);
    expect(res.exitCode, res.stderr).toBe(0);
  });
});

// A violation has to name the rule that found it. The gate runs sixty-five checks
// and keeps going after a failure, so by the time the verdict prints, the offending
// file:line is thousands of lines up or gone with a truncated log; the rule name in
// the summary is all a reader has to go on. Pointing it at the wrong rule is worse
// than printing nothing, because the reader goes and reads a rule that is working.
describe('the convention gate: a violation is attributed to the rule that found it', () => {
  const CF_RULE = 'no concrete CloudFront hostnames tracked';

  it('names the rule that failed, not the one that ran before it', () => {
    // The regression. This rule announced itself directly instead of through the
    // helper that records which check is running, so its violations were credited
    // to the previous check -- the continuous-integration parity rule, which had
    // passed. Assembled from pieces because the gate scans this directory too, and
    // a whole hostname written plainly here is the violation it stands for.
    const host = ['d', 'beefcafe99', '.cloudfront', '.net'].join('');
    const res = inFixtureRepo({ 'docs/notes.md': `The distribution answers at ${host}.\n` });

    expectCheckRan(res, CF_RULE);
    expect(res.exitCode, res.stdout).toBe(1);
    // The summary lists one rule per violation, after the count.
    const summary = res.stderr.slice(res.stderr.indexOf('rule(s) violated'));
    expect(summary).toContain(CF_RULE);
    expect(summary).not.toContain('every CI job has a local gate');
  });

  it('names the missing-checks rule when the failure is that a check did not run', () => {
    // The same misattribution by the other route. This violation is raised after
    // every named span has closed, so the final flush credited it to whichever
    // rule ran last -- sending the reader to a rule that had just passed, for a
    // failure whose real cause was a check finding nothing to scan.
    const res = inFixtureRepo({ 'notes.txt': 'nothing to see\n' }, { declareFixture: false });

    expect(res.exitCode, res.stdout).toBe(1);
    expect(res.stderr).toContain('every check runs against this repository');
    const summary = res.stderr.slice(res.stderr.indexOf('rule(s) violated'));
    expect(summary).toContain('every check ran against this tree');
    expect(summary).not.toContain('UPDATE statements stamp');
  });

  it('routes every announcement through the helper that does the attributing', () => {
    // The shape that caused it, pinned so it cannot return in the next rule anyone
    // adds. The helper's own two announcements interpolate the name it was handed;
    // a rule printing its own carries the name as a literal, which is the tell.
    const source = readFileSync(GATE, 'utf8');
    const handWritten = source
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => line.includes('echo "[conventions] check:'))
      .filter(({ line }) => !line.includes('${name}'));

    expect(handWritten.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
  });
});
