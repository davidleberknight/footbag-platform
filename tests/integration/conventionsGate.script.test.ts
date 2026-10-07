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
 * the commit gate (test:quick), the full local runner, the clean-room gate and continuous
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
 * repository rather than a bare directory. The gate reads what a commit would carry,
 * tracked files plus new files git does not ignore, so `files` are staged and
 * `untracked` are written after staging, to prove a new file is judged before it is
 * ever added.
 *
 * `declareFixture` is what tells the gate that a check with nothing to scan is
 * expected here; the one case that leaves it off is the case asserting that a real
 * checkout may not skip.
 */
function inFixtureRepo(
  files: Record<string, string>,
  { declareFixture = true, untracked = {} }: {
    declareFixture?: boolean;
    untracked?: Record<string, string>;
  } = {},
): RunResult {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-conventions-gate-'));
  const write = (set: Record<string, string>): void => {
    for (const [name, body] of Object.entries(set)) {
      const full = join(root, name);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
  };
  try {
    spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
    write(files);
    spawnSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8', ...SPAWN_GUARD });
    write(untracked);
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

describe('the convention gate: tests wait on events, not fixed delays', () => {
  const NAME = 'tests wait on events, not on fixed delays';
  const FAIL = 'a test waits a fixed time instead of on the event it needs';
  // Each refused form is assembled from parts, so it exists only in the fixture
  // repository and this file stays clean under the very rule it tests.
  const TIMER = 'set' + 'Timeout';
  const SLEEP = 'sl' + 'eep';
  const WAIT = 'waitFor' + 'Timeout';

  // Defect caught: a test resolves a promise on a timer and assumes the thing it
  // needs has happened by then, so its verdict moves with the machine's load.
  it('refuses a promise that resolves on a fixed timeout', () => {
    const res = inFixtureRepo({
      'tests/unit/waits.test.ts': `await new Promise((r) => ${TIMER}(r, 50));\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain(FAIL);
    expect(res.stderr).toContain('tests/unit/waits.test.ts:1');
  });

  // Defect caught: a stub signals the test's own shell and sleeps, hoping the
  // handler has run by then; this shape hung a CI run outright.
  it('refuses a shell sleep inside a stub', () => {
    const res = inFixtureRepo({
      'tests/integration/stub.script.test.ts': `const gate = 'g() { kill -INT $$; ${SLEEP} 0.3; return 0; }';\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('tests/integration/stub.script.test.ts:1');
  });

  it('refuses a browser test that waits a fixed time', () => {
    const res = inFixtureRepo({
      'tests/e2e/page.spec.ts': `await page.${WAIT}(500);\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('tests/e2e/page.spec.ts:1');
  });

  // Defect caught: the rule refuses the one legitimate use, a child that never
  // finishes on its own so a code timeout has something to cut off.
  it('accepts a never-ending child started with exec sleep, and a delay named in a comment', () => {
    const res = inFixtureRepo({
      'tests/unit/timeout.test.ts': "const ffmpeg = 'exec sleep 30';\n// a sleep 1 here once made this flaky\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain(FAIL);
    expectCheckRan(res, NAME);
  });
});

describe('the convention gate: no pipe into a quitting grep', () => {
  const NAME = 'no pipe into a quitting grep';
  const FAIL = 'a script pipes a command into grep -q';
  // Assembled from parts, so the refused shape exists only in the fixture.
  const PIPE_QUIET = '| grep -' + 'q';

  // Defect caught: grep -q exits at its first match, the writer dies of a broken
  // pipe, and under pipefail a match reads as a failure on some runs only.
  it('refuses a command piped into grep -q', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': `#!/usr/bin/env bash\nset -euo pipefail\nif printf '%s\\n' "$x" ${PIPE_QUIET} y; then :; fi\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain(FAIL);
    expect(res.stderr).toContain('scripts/thing.sh:3');
  });

  it('refuses the quiet flag given after another flag', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': `#!/usr/bin/env bash\nids | grep -F -${'q'} -- "$id"\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/thing.sh:2');
  });

  // Defect caught: the rule refuses the safe forms it tells the author to use,
  // or an `||` that is not a pipe at all.
  it('accepts a here-string, a grep that reads everything, an || alternative and a comment', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': [
        '#!/usr/bin/env bash',
        'grep -q y <<< "$x"',
        'ids | grep y >/dev/null',
        'a || grep -q y <<< "$x"',
        `# never write: cmd ${PIPE_QUIET} y`,
        '',
      ].join('\n'),
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain(FAIL);
    expectCheckRan(res, NAME);
  });
});

/** The role and container credential sources, each of which can authenticate a spawned child on its own. */
describe('the convention gate: judges a new file before it is added', () => {
  // Assembled from pieces so this file does not itself carry a concrete hostname.
  const CONCRETE_HOST = 'd9abcdef0123' + '.cloudfront.net';
  const CF_FAIL = 'a concrete CloudFront hostname must never be committed';

  it('refuses a concrete CloudFront hostname in a file not yet added to git', () => {
    const res = inFixtureRepo({}, {
      untracked: { 'tests/stub.test.ts': `const host = '${CONCRETE_HOST}';\n` },
    });
    expect(res.stderr).toContain(`tests/stub.test.ts:1:const host = '${CONCRETE_HOST}'`);
    expect(res.stderr).toContain(CF_FAIL);
  });

  it('ignores a gitignored file, and accepts the documented fake host in a new file', () => {
    const res = inFixtureRepo({ '.gitignore': 'notes/\n' }, {
      untracked: {
        'notes/hosts.txt': `${CONCRETE_HOST}\n`,
        'tests/stub.test.ts': "const host = 'd1234abcdef8.cloudfront.net';\n",
      },
    });
    expectCheckRan(res, 'no concrete CloudFront hostnames tracked');
    expect(res.stderr).not.toContain(CF_FAIL);
  });
});

const ROLE_AND_CONTAINER_SOURCES = [
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_ROLE_ARN',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN',
];

/** Every credential source the test setup must neutralise, as object-literal entries. */
const ALL_TEST_SETUP_SOURCES =
  "AWS_PROFILE: '', AWS_CONFIG_FILE: '/dev/null', AWS_SHARED_CREDENTIALS_FILE: '/dev/null', " +
  ROLE_AND_CONTAINER_SOURCES.map((v) => `${v}: '', `).join('') +
  "AWS_EC2_METADATA_DISABLED: 'true'";

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

  // Defect caught: a service writes its own outbox row or calls the provider
  // directly, so its mail skips the gate that keeps it from deceased members.
  it('refuses an outbox write or a provider send outside the communication service', () => {
    const res = inFixtureRepo({
      'src/services/clubThing.ts': 'outbox.insert.run(id, email);\n',
      'src/services/otherThing.ts': 'await adapter.sendEmail({ to });\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('only communicationService.ts writes the outbox');
    expect(res.stderr).toContain('src/services/clubThing.ts:1');
    expect(res.stderr).toContain('src/services/otherThing.ts:1');
  });

  it('accepts the communication service and the adapters doing both', () => {
    const res = inFixtureRepo({
      'src/services/communicationService.ts': 'outbox.insert.run(id);\nawait adapter.sendEmail({ to });\n',
      'src/adapters/sesAdapter.ts': 'return stub.sendEmail(input);\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain('only communicationService.ts writes the outbox');
    expectCheckRan(res, 'outbox writes and provider sends outside communicationService.ts');
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
        `export const NO_AWS_CREDENTIALS = { ${ALL_TEST_SETUP_SOURCES} };\n`,
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'the test setup isolates AWS credentials');
  });

  // Defect caught: the declaration stops blanking a role or container credential
  // source, and a test spawning an operator script is authenticated again through
  // a web identity token or a container credential endpoint.
  it('refuses a test setup that has stopped neutralising a role or container credential source', () => {
    for (const dropped of ROLE_AND_CONTAINER_SOURCES) {
      const sources = ALL_TEST_SETUP_SOURCES.replace(`${dropped}: '', `, '');
      // The drop landed, so a case cannot pass by removing nothing.
      expect(sources, dropped).not.toContain(dropped);
      const res = inFixtureRepo({
        'tests/setup-env.ts':
          "import { NO_AWS_CREDENTIALS } from './fixtures/awsIsolation';\n" +
          "if (process.env.RUN_STAGING_SMOKE !== '1') Object.assign(process.env, NO_AWS_CREDENTIALS);\n",
        'tests/fixtures/awsIsolation.ts': `export const NO_AWS_CREDENTIALS = { ${sources} };\n`,
      });
      expect(res.exitCode, dropped).toBe(1);
      expect(res.stderr, dropped).toContain(`tests/fixtures/awsIsolation.ts no longer neutralises ${dropped}`);
    }
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

  it('accepts a machine declaration that puts a stub ssh and a stub aws at the front of the path', () => {
    const res = inFixtureRepo({
      'tests/setup-env.ts':
        "import { noMachineState } from './fixtures/machineIsolation';\n" +
        'Object.assign(process.env, noMachineState(root));\n',
      'tests/fixtures/machineIsolation.ts':
        "export const MACHINE_ENV_TO_CLEAR = ['FOOTBAG_ENV'];\n" +
        'export function noMachineState(root) {\n' +
        "  writeFileSync(join(root, 'ssh'), STUB);\n" +
        "  writeFileSync(join(bin, 'aws'), AWS_STUB);\n" +
        '  return {\n' +
        '    HOME: root, FOOTBAG_MEDIA_DIR: root, FOOTBAG_CURATED_MEDIA_DIR: root,\n' +
        '    PATH: `${root}:${process.env.PATH}`,\n' +
        '  };\n' +
        '}\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain('no longer puts a stub ssh');
    expect(res.stderr).not.toContain('no longer puts a stub aws');
    expectCheckRan(res, 'the test setup isolates the rest of the machine');
  });

  it('refuses a machine declaration that has stopped denying the AWS CLI', () => {
    // Whether the machine has the CLI decided which branch a script took, and
    // each real start costs a second; the stub is what makes both the same
    // everywhere, so losing it is worth a rule.
    const res = inFixtureRepo({
      'tests/setup-env.ts':
        "import { noMachineState } from './fixtures/machineIsolation';\n" +
        'Object.assign(process.env, noMachineState(root));\n',
      'tests/fixtures/machineIsolation.ts':
        "export const MACHINE_ENV_TO_CLEAR = ['FOOTBAG_ENV'];\n" +
        'export function noMachineState(root) {\n' +
        "  writeFileSync(join(root, 'ssh'), STUB);\n" +
        '  return { HOME: root, FOOTBAG_MEDIA_DIR: root, FOOTBAG_CURATED_MEDIA_DIR: root, PATH: root };\n' +
        '}\n',
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('no longer puts a stub aws at the front of PATH');
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
      'scripts/ship-thing.sh': '  "$DEPLOY_CMD" --target "$TARGET" -k\n',
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
        '  "$DEPLOY_CMD" --target "$TARGET" -k\n',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'the firewall check before a deploy is live, and is actually called');
  });

  it('does not read an instruction about a deploy as running one', () => {
    // The pattern is the deploy command in command position. A script that
    // prints the command for an operator to run later is not the one that has to
    // have asked, and flagging it would push the next author to satisfy the rule
    // with a call that runs nowhere near a deploy.
    const res = inFixtureRepo({
      'scripts/tell-thing.sh': 'echo "  \\"$DEPLOY_CMD\\" --target $TARGET -k"\n',
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

  // A section that widens its own prose cap is how lines drifted to 85 and 95
  // characters; the one measure only holds if a wider cap fails the build.
  it('refuses a prose cap wider than the one reading measure', () => {
    const res = inFixtureRepo({
      'src/public/css/style.css': `${PLAIN_CSS}.intro {\n  max-width: 56ch;\n}\n`,
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('reading-measure cap is wider than 55ch');
  });

  it('accepts a prose cap at or under the one reading measure', () => {
    const res = inFixtureRepo({
      'src/public/css/style.css': `${PLAIN_CSS}.intro {\n  max-width: 55ch;\n}\n.caption {\n  max-width: 40ch;\n}\n`,
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'prose measure is at most 55ch');
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

describe('the convention gate: assertions that cannot fail', () => {
  // Each form is assembled from pieces: written out, it would be the violation
  // itself, and the gate scans this directory.
  const VACUOUS_FORMS: Record<string, string> = {
    'a case that only restates a status': `${["it('returns", " 200'"].join('')}, async () => {});\n`,
    'an assertion of a constant': `it('x', () => { ${['expect(', 'true)'].join('')}.toBe(true); });\n`,
    'an early return on a broken page': `it('x', async () => { ${['if (res.status !== 200) ', 'return;'].join('')} });\n`,
    'an assertion that runs only when the page agrees': `it('x', async () => { ${['if (res.text', '.includes('].join('')}'a')) {} });\n`,
    'a committed focus': `${['it', '.only('].join('')}'x', () => {});\n`,
    'a mocked password hasher': `${["vi.mock('", "argon2')"].join('')};\n`,
    'an expected-error pattern that accepts any error': `${['expectLoggedError(/boom|', 'error/i)'].join('')};\n`,
  };

  // Advisory: each form is reported and the gate still passes, because a test
  // that cannot fail harms no user and only a real, serious problem blocks.
  for (const [form, body] of Object.entries(VACUOUS_FORMS)) {
    it(`warns on ${form} without failing the gate`, () => {
      const res = inFixtureRepo({ 'tests/unit/thing.test.ts': body });
      expect(res.exitCode, res.stderr).toBe(0);
      expect(res.stderr).toContain('WARNING: an assertion that may not be able to fail');
    });
  }

  it('accepts a case that asserts status and body together', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts':
        "it('renders the list', async () => {\n  expect(res.status).toBe(200);\n  expect(res.text).toContain('x');\n});\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain('WARNING');
    expectCheckRan(res, 'tests/ carry no vacuous assertion forms');
  });

  const SKIP_IF = ['describe', '.skipIf('].join('');

  it('warns on a tool-gated skip that nothing fails on the runner, without failing the gate', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts': `${SKIP_IF}!hasFfmpeg)('x', () => {});\n`,
      'tests/integration/other.test.ts': '',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).toContain('WARNING: a skipIf/runIf suite should probe through requireToolInCI');
  });

  it('accepts a tool-gated skip that probes through the CI-failing helper', () => {
    const res = inFixtureRepo({
      'tests/unit/thing.test.ts':
        `import { requireToolInCI } from '../fixtures/${'toolAvailability'}';\n`
        + `${SKIP_IF}!requireToolInCI('ffmpeg'))('x', () => {});\n`,
      'tests/integration/other.test.ts': '',
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain('WARNING');
    expectCheckRan(res, 'tool-gated skips in tests/ fail on the runner');
  });

  const CACHED_IMPORT = `import { cachedGet } from '../fixtures/${'cachedGet'}';\n`;

  it('warns on a shared-page suite that inserts rows inside a case, without failing the gate', () => {
    const res = inFixtureRepo({
      'tests/integration/thing.test.ts':
        `${CACHED_IMPORT}it('x', async () => {\n  ${'insert'}Member(db, {});\n});\n`,
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).toContain('WARNING: a cachedGet suite writes inside a case');
  });

  // Defect caught: a per-case hook writes between cached reads and escapes the
  // check because it is not itself a case.
  it('warns on a shared-page suite that writes in a per-case hook', () => {
    const res = inFixtureRepo({
      'tests/integration/thing.test.ts':
        `${CACHED_IMPORT}beforeEach(() => {\n  ${'insert'}Member(db, {});\n});\n`
        + "it('x', async () => {\n  expect(1).toBe(1);\n});\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).toContain('WARNING: a cachedGet suite writes inside a case');
  });

  it('accepts a shared-page suite that seeds only before its cases', () => {
    const res = inFixtureRepo({
      'tests/integration/thing.test.ts':
        `${CACHED_IMPORT}beforeAll(() => {\n  ${'insert'}Member(db, {});\n});\n`
        + "it('x', async () => {\n  expect(1).toBe(1);\n});\n",
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain('WARNING');
    expectCheckRan(res, 'cachedGet suites write nothing inside a case');
  });

  it('accepts a shared-page suite that says why it writes after its cached reads', () => {
    const res = inFixtureRepo({
      'tests/integration/thing.test.ts':
        `${CACHED_IMPORT}// ${'cachedGet-writes'}: the last case seeds and reads fresh.\n`
        + `it('x', async () => {\n  ${'insert'}Member(db, {});\n});\n`,
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stderr).not.toContain('WARNING');
    expectCheckRan(res, 'cachedGet suites write nothing inside a case');
  });
});

describe('the convention gate: retired onboarding scripts and flags', () => {
  // Spelled in pieces: written whole, these would be the violations themselves,
  // and the gate scans this directory.
  const RETIRED_SCRIPT = ['onboard', 'operator.sh'].join('-');
  const RETIRED_FLAG = `--${'own-password'}`;

  it('refuses a script naming the retired onboarding script', () => {
    const res = inFixtureRepo({ 'scripts/thing.sh': `# run ${RETIRED_SCRIPT} first\n` });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('a retired onboarding script or flag is named');
  });

  it('refuses a document naming a retired flag', () => {
    const res = inFixtureRepo({ 'docs/THING.md': `Pass ${RETIRED_FLAG} to it.\n` });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('a retired onboarding script or flag is named');
  });

  it('accepts the one onboarding path', () => {
    const res = inFixtureRepo({ 'scripts/thing.sh': '# run onboard-dev-tester.sh first\n' });
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, 'no retired onboarding script or flag in tracked files');
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

describe('the convention gate: where the local runner may reach', () => {
  const ISOLATION_RULE = 'the local runner isolates AWS credentials';
  const STAGING_RULE = 'the local runner reaches staging only from its staging gates';

  /** The credential sources the isolation library must neutralise, named once each. */
  const ISOLATION_LIB = [
    'aws_isolated_run() {',
    '  env AWS_PROFILE=x AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null \\',
    '    AWS_ACCESS_KEY_ID= AWS_SECRET_ACCESS_KEY= AWS_SESSION_TOKEN= AWS_EC2_METADATA_DISABLED=true \\',
    `    ${ROLE_AND_CONTAINER_SOURCES.map((v) => `${v}=`).join(' ')} "$@"`,
    '}',
    '',
  ].join('\n');

  /**
   * A runner that keeps every staging contact inside its staging preflight and
   * staging gates, and every other gate offline. `edit` plants one violation.
   */
  function runner(edit: (body: string) => string = (b) => b): Record<string, string> {
    const body = [
      '#!/usr/bin/env bash',
      'source scripts/lib/aws-isolation.sh',
      'if (( FULL == 1 )); then',
      '  PENTEST=1',
      '  WITH_PERSONA_CRAWL=1',
      'fi',
      'full_preflight() {',
      '  command -v docker >/dev/null || echo "docker missing"',
      '}',
      'staging_preflight() {',
      '  aws sts get-caller-identity --profile footbag-staging-runtime',
      '  bash scripts/realdata-staging.sh probe',
      '  ssh -G footbag-staging >/dev/null',
      '}',
      'gate_persona_crawl() {',
      '  # a comment may say ssh and terraform/staging without reaching either',
      '  npm run test:persona-crawl',
      '}',
      'gate_terraform() {',
      '  export TF_DATA_DIR=/tmp/x',
      '  aws_isolated_run terraform validate',
      '}',
      'gate_staging_aws_smoke() {',
      '  npm run test:smoke -- --target staging',
      '  aws sts get-caller-identity --profile footbag-staging-runtime',
      '}',
      'gate_staging_realdata_invariants() {',
      '  bash scripts/realdata-staging.sh invariants',
      '}',
      '',
    ].join('\n');
    return { 'run_all_tests.sh': edit(body), 'scripts/lib/aws-isolation.sh': ISOLATION_LIB };
  }

  /** Asserts the edit landed, so a case cannot pass by planting nothing. */
  const plant = (needle: string, replacement: string) => (body: string): string => {
    expect(body, `fixture anchor not found: ${needle}`).toContain(needle);
    return body.replace(needle, replacement);
  };

  it('accepts staging contact inside the staging preflight and gates, and live AWS in a staging gate', () => {
    const res = inFixtureRepo(runner());
    expect(res.exitCode, res.stderr).toBe(0);
    expectCheckRan(res, ISOLATION_RULE);
    expectCheckRan(res, STAGING_RULE);
  });

  // Defect caught: the isolation the runner's offline gates use stops blanking a
  // role or container credential source, so a gate declared offline reaches AWS
  // wherever that source is set.
  it('refuses an isolation library that has stopped neutralising a role or container credential source', () => {
    for (const dropped of ROLE_AND_CONTAINER_SOURCES) {
      const files = runner();
      const lib = files['scripts/lib/aws-isolation.sh'].replace(`${dropped}= `, '').replace(` ${dropped}=`, '');
      // The drop landed, so a case cannot pass by removing nothing.
      expect(lib, dropped).not.toContain(dropped);
      const res = inFixtureRepo({ ...files, 'scripts/lib/aws-isolation.sh': lib });
      expect(res.exitCode, dropped).toBe(1);
      expect(res.stderr, dropped).toContain(`scripts/lib/aws-isolation.sh no longer neutralises ${dropped}`);
    }
  });

  // Defect caught: a local gate starts reading staging's dataset or site, and a
  // run the rules call local contacts a deployed host.
  it('refuses a staging token in a gate that is not a staging gate', () => {
    for (const token of ['bash scripts/realdata-staging.sh probe', 'cf="$(staging_cf_domain)"', 'ssh footbag-staging true', 'ls terraform/staging']) {
      const res = inFixtureRepo(runner(plant('  npm run test:persona-crawl', `  ${token}\n  npm run test:persona-crawl`)));
      expect(res.exitCode, token).toBe(1);
      expect(res.stderr, token).toContain('reaches staging outside the staging preflight and the gate_staging_ gates');
    }
  });

  it('refuses a staging token in the local preflight', () => {
    const res = inFixtureRepo(runner(plant('  command -v docker', '  aws sts get-caller-identity --profile footbag-staging-runtime\n  command -v docker')));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('reaches staging outside the staging preflight and the gate_staging_ gates');
  });

  // Defect caught: the thorough local run quietly turns a staging leg back on.
  it('refuses a bare-run block that turns on a staging flag', () => {
    for (const flag of ['WITH_SMOKE=1', 'STAGING=1']) {
      const res = inFixtureRepo(runner(plant('  PENTEST=1', `  PENTEST=1\n  ${flag}`)));
      expect(res.exitCode, flag).toBe(1);
      expect(res.stderr, flag).toContain("the bare run's block turns on a staging leg");
    }
  });

  // Defect caught: a runner row points at the production account or site, where
  // no local or staging check may ever reach.
  it('refuses a production target anywhere in the runner, a staging gate included', () => {
    for (const target of ['npm run test:smoke -- --target production', 'bash scripts/test-deployed.sh --target production', 'ls terraform/production']) {
      const res = inFixtureRepo(runner(plant('  bash scripts/realdata-staging.sh invariants', `  ${target}`)));
      expect(res.exitCode, target).toBe(1);
      expect(res.stderr, target).toContain('names a production target');
    }
  });

  // Defect caught: the retired single exemption lets a gate outside the staging
  // set reach AWS unisolated under its old name.
  it('holds a gate outside the gate_staging_ set to the offline rule, whatever its name', () => {
    const res = inFixtureRepo(runner(plant('gate_staging_aws_smoke() {', 'gate_smoke() {')));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('gate_smoke invokes aws or terraform outside aws_isolated_run');
  });
});
