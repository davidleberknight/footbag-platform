/**
 * The production release gate, proved against a throwaway repository.
 *
 * Contract: the standalone check passes a tree only when it is clean, its origin
 * is the canonical repository, its HEAD is that repository's main, every run of
 * the CI aggregate check on it succeeded, a GREEN ./run_all_tests.sh receipt
 * owned by this account covers exactly this tree, staging runs the same commit
 * shipped from a clean tree, and a GREEN ./run_all_tests.sh --staging receipt
 * owned by this account covers the commit staging runs; SKIP_SMOKE, SKIP_TESTS
 * and the schema-drift and lock-holder escape hatches are findings, and the test
 * seams are never honoured outside it. Every failing rule is named, and a
 * question that cannot be answered is a finding. A production deploy reports the
 * same findings as warnings and goes on: only footbag-operator deploys
 * production, and that holder decides at the typed confirmation.
 *
 * Each case builds a repository whose origin names the canonical repository and
 * resolves, through git's insteadOf, to a local bare repository; copies in the
 * shipped gate and the libraries it sources; and runs the copy. gh and ssh are
 * stubs that answer only when called the way the gate must call them, so a gate
 * asking the wrong question, or reaching staging without the pinned host keys,
 * gets no answer and refuses.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = process.cwd();
const CANONICAL = 'davidleberknight/footbag-platform';
const CHECK = 'Type-check and test';
const SHIPPED = [
  'scripts/verify-production-release.sh',
  'scripts/lib/production-release-gate.sh',
  'scripts/lib/source-tree-state.sh',
  'scripts/lib/ssh-known-hosts.sh',
  'scripts/lib/full-pass-receipt.sh',
  'scripts/lib/staging-deployed-from.sh',
];
const ESCAPE_HATCHES = ['FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK', 'FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT', 'FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS'];
const SEAMS = ['FOOTBAG_GH_BIN', 'FOOTBAG_SSH_BIN', 'FOOTBAG_FULL_RECEIPT', 'FOOTBAG_STAGING_RECEIPT'];

const scratch: string[] = [];
afterAll(() => scratch.forEach((s) => removeScratch(s)));

function sh(cwd: string, cmd: string, args: string[]): string {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', ...SPAWN_GUARD });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout.trim();
}

interface Fixture {
  work: string;
  bin: string;
  env: NodeJS.ProcessEnv;
  head: string;
  receipt: string;
  stagingReceipt: string;
  writeReceipt: (overrides?: Record<string, string>) => void;
  writeStagingReceipt: (overrides?: Record<string, string>) => void;
  answerCi: (conclusions: string[] | null) => void;
  answerStaging: (record: string | null) => void;
}

function fixture(): Fixture {
  const dir = createScratchDir('release-gate');
  scratch.push(dir);
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  sh(dir, 'git', ['init', '-q', '--bare', origin]);
  sh(dir, 'git', ['init', '-q', '-b', 'main', work]);
  sh(work, 'git', ['config', 'user.email', 'gate@example.com']);
  sh(work, 'git', ['config', 'user.name', 'Gate Test']);
  for (const rel of SHIPPED) {
    mkdirSync(join(work, rel, '..'), { recursive: true });
    copyFileSync(join(REPO_ROOT, rel), join(work, rel));
  }
  writeFileSync(join(work, 'run_all_tests.sh'), '#!/usr/bin/env bash\necho runner\n');
  sh(work, 'git', ['add', '-A']);
  sh(work, 'git', ['commit', '-q', '-m', 'release candidate']);
  const url = `git@github.com:${CANONICAL}.git`;
  sh(work, 'git', ['remote', 'add', 'origin', url]);
  sh(work, 'git', ['config', `url.${origin}.insteadOf`, url]);
  sh(work, 'git', ['push', '-q', 'origin', 'main']);
  const head = sh(work, 'git', ['rev-parse', 'HEAD']);

  const answerCi = (conclusions: string[] | null): void => {
    const endpoint = `repos/${CANONICAL}/commits/${head}/check-runs`;
    writeFileSync(
      join(bin, 'gh'),
      conclusions === null
        ? '#!/usr/bin/env bash\necho "gh: not signed in" >&2\nexit 1\n'
        : '#!/usr/bin/env bash\n'
          + `[[ " $* " == *" ${endpoint} "* && "$*" == *'.name == "${CHECK}"'* ]] || exit 1\n`
          + `printf '%s\\n' ${conclusions.map((c) => `'${c}'`).join(' ')}\n`,
      { mode: 0o755 },
    );
  };
  const answerStaging = (record: string | null): void => {
    writeFileSync(
      join(bin, 'ssh'),
      record === null
        ? '#!/usr/bin/env bash\nexit 255\n'
        : '#!/usr/bin/env bash\n'
          + '[[ "$*" == *"StrictHostKeyChecking=yes"* && "$*" == *"UserKnownHostsFile="* && "$*" == *"footbag-staging"* ]] || exit 255\n'
          + `printf 'deployed_at=2026-01-01T00:00:00Z\\n%s\\n' '${record}'\n`,
      { mode: 0o755 },
    );
  };
  answerCi(['success']);
  answerStaging(`commit=${head.slice(0, 7)} dirty=0 paths=none`);

  const pin = join(dir, 'known_hosts');
  writeFileSync(pin, 'footbag-staging ssh-ed25519 AAAA\n');
  chmodSync(pin, 0o600);
  const receipt = join(dir, 'receipt');
  const stagingReceipt = join(dir, 'staging-receipt');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FOOTBAG_GH_BIN: join(bin, 'gh'),
    FOOTBAG_SSH_BIN: join(bin, 'ssh'),
    FOOTBAG_FULL_RECEIPT: receipt,
    FOOTBAG_STAGING_RECEIPT: stagingReceipt,
    FOOTBAG_KNOWN_HOSTS: pin,
  };
  for (const k of ['SKIP_SMOKE', 'SKIP_TESTS', ...ESCAPE_HATCHES]) delete env[k];

  const writeReceipt = (overrides: Record<string, string> = {}): void => {
    const tree = sh(work, 'bash', ['-c', 'source scripts/lib/source-tree-state.sh && source_tree_state .']);
    const runner = sh(work, 'bash', ['-c', "sha256sum run_all_tests.sh | cut -d' ' -f1"]);
    const fields: Record<string, string> = {
      verdict: 'GREEN', commit: head, tree, clean: 'yes', finished_at: '2026-01-01T00:00:00Z', runner, ...overrides,
    };
    writeFileSync(receipt, Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
    chmodSync(receipt, 0o600);
  };
  writeReceipt();
  // What a green --staging run writes: the commit exactly as staging's own
  // record names it, which is the short form the stub above reports.
  const writeStagingReceipt = (overrides: Record<string, string> = {}): void => {
    const runner = sh(work, 'bash', ['-c', "sha256sum run_all_tests.sh | cut -d' ' -f1"]);
    const fields: Record<string, string> = {
      verdict: 'GREEN', commit: head.slice(0, 7), dirty: '0', finished_at: '2026-01-01T00:00:00Z', runner, ...overrides,
    };
    writeFileSync(stagingReceipt, Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
    chmodSync(stagingReceipt, 0o600);
  };
  writeStagingReceipt();
  return { work, bin, env, head, receipt, stagingReceipt, writeReceipt, writeStagingReceipt, answerCi, answerStaging };
}

function runGate(f: Fixture, extraEnv: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('bash', [join(f.work, 'scripts/verify-production-release.sh')], {
    cwd: f.work, encoding: 'utf8', env: { ...process.env, ...f.env, ...extraEnv }, ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function expectRefused(f: Fixture, fragment: string, extraEnv: Record<string, string> = {}): void {
  const res = runGate(f, extraEnv);
  expect(res.status, res.stderr).toBe(1);
  expect(res.stderr).toContain(fragment);
}

describe('the production release gate', () => {
  // Defect caught: a tree that meets every rule is refused, so production can
  // never be deployed.
  it('passes a clean tree on the canonical main with green CI, a matching receipt, and staging running it', () => {
    const res = runGate(fixture());
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('PASS: this tree may ship to production.');
    for (const seam of SEAMS) {
      expect(res.stderr, seam).toContain(`TEST SEAM: ${seam}=`);
    }
  });

  it('refuses a working tree with uncommitted changes', () => {
    const f = fixture();
    writeFileSync(join(f.work, 'scratch.txt'), 'uncommitted\n');
    expectRefused(f, 'the working tree is not clean');
  });

  // Defect caught: a fork's main and a fork's CI stand in for the real ones.
  it('refuses an origin that is not the canonical repository', () => {
    const f = fixture();
    sh(f.work, 'git', ['config', 'remote.origin.url', 'git@github.com:someone/footbag-platform.git']);
    expectRefused(f, "origin is 'someone/footbag-platform'");
  });

  it('refuses a HEAD that is not main', () => {
    const f = fixture();
    writeFileSync(join(f.work, 'extra.txt'), 'x\n');
    sh(f.work, 'git', ['add', '-A']);
    sh(f.work, 'git', ['commit', '-q', '-m', 'not pushed']);
    expectRefused(f, 'is not main');
  });

  // Defect caught: an unreachable remote is taken as "HEAD is on main".
  it('refuses when main cannot be fetched', () => {
    const f = fixture();
    sh(f.work, 'git', ['config', `url.${join(f.work, '..', 'missing.git')}.insteadOf`, `git@github.com:${CANONICAL}.git`]);
    sh(f.work, 'git', ['config', '--unset-all', `url.${join(f.work, '..', 'origin.git')}.insteadOf`]);
    expectRefused(f, 'could not fetch main');
  });

  it('refuses a commit whose CI check did not succeed', () => {
    const f = fixture();
    f.answerCi(['failure']);
    expectRefused(f, 'finished red (failure)');
  });

  // Defect caught: an older green run of the same check hides a newer red one.
  it('refuses when any run of the CI check did not succeed', () => {
    const f = fixture();
    f.answerCi(['success', 'failure']);
    expectRefused(f, 'finished red (failure,success)');
  });

  // Defect caught: a run that was cancelled, timed out or is still going is taken
  // for green, because only an explicit failure is refused.
  it('refuses a CI check that was cancelled, timed out, or has not finished', () => {
    for (const conclusion of ['cancelled', 'timed_out']) {
      const f = fixture();
      f.answerCi([conclusion]);
      expectRefused(f, `finished red (${conclusion})`);
    }
    const f = fixture();
    f.answerCi(['in_progress']);
    expectRefused(f, 'is not green on every run (in_progress)');
  });

  // Defect caught: an unreadable CI verdict is treated as a pass.
  it('refuses when the CI check cannot be read', () => {
    const f = fixture();
    f.answerCi(null);
    expectRefused(f, 'could not be read');
  });

  // Defect caught: the refusal sends an operator to the dev-tester role for a
  // local run that needs none, or names no command at all.
  it('refuses without a local receipt, naming the local command that makes one', () => {
    const f = fixture();
    spawnSync('rm', ['-f', f.receipt], SPAWN_GUARD);
    const res = runGate(f);
    expect(res.status).toBe(1);
    const line = res.stderr.split('\n').find((l) => l.includes('no ./run_all_tests.sh pass for this tree')) ?? '';
    expect(line, res.stderr).toContain('run ./run_all_tests.sh');
    expect(line).not.toContain('dev-tester');
    // The local gate is the bare runner; the retired mode name must not come back.
    expect(res.stderr).not.toContain('--full');
  });

  // Defect caught: production ships a commit whose read-only staging checks
  // never ran, now that the local run no longer carries them.
  it('refuses without a --staging receipt, naming the command that makes one', () => {
    const f = fixture();
    spawnSync('rm', ['-f', f.stagingReceipt], SPAWN_GUARD);
    expectRefused(f, 'no ./run_all_tests.sh --staging pass');
    expectRefused(f, 'scripts/as-dev-tester.sh --account <your-name> ./run_all_tests.sh --quick --staging');
  });

  // Defect caught: a staging pass for an older deploy vouches for whatever
  // staging runs now.
  it('refuses a --staging receipt for a commit other than the one staging runs', () => {
    const f = fixture();
    f.writeStagingReceipt({ commit: 'abcdef0' });
    expectRefused(f, 'the last --staging pass was for abcdef0');
  });

  it('refuses a --staging receipt other accounts could have written, or one that is not GREEN', () => {
    const f = fixture();
    chmodSync(f.stagingReceipt, 0o644);
    expectRefused(f, `the --staging receipt at ${f.stagingReceipt} is not owned by this account with mode 600`);
    f.writeStagingReceipt({ verdict: 'RED' });
    expectRefused(f, 'the --staging receipt');
    expectRefused(f, 'is not GREEN');
  });

  it('refuses a --staging receipt made by a different version of the runner', () => {
    const f = fixture();
    f.writeStagingReceipt({ runner: 'f'.repeat(64) });
    expectRefused(f, 'the last --staging pass was made by a different version of run_all_tests.sh');
  });

  // Defect caught: an escape hatch left exported in the operator's shell ships
  // production code past the schema-drift check, or kills whatever holds the
  // live database's lock, with nothing asking.
  it('refuses each schema-drift and lock-holder escape hatch', () => {
    for (const hatch of ESCAPE_HATCHES) {
      const f = fixture();
      expect(runGate(f).status, 'the fixture passes without it').toBe(0);
      expectRefused(f, `${hatch} is set`, { [hatch]: '1' });
      // Refused whatever the value: one that reads as "off" is no reason to guess.
      expectRefused(f, `${hatch} is set`, { [hatch]: 'no' });
      expectRefused(f, `${hatch} is set`, { [hatch]: '0' });
    }
  });

  // Defect caught: on a machine where the fingerprint and the runner hash cannot
  // be computed, a receipt with empty fields matches the empty values and passes.
  it('refuses receipts it cannot check because the tree and the runner cannot be hashed', () => {
    const f = fixture();
    f.writeReceipt({ tree: '', runner: '' });
    f.writeStagingReceipt({ runner: '' });
    const noSha = join(f.bin, '..', 'no-sha');
    mkdirSync(noSha, { recursive: true });
    writeFileSync(join(noSha, 'sha256sum'), '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });
    const PATH = `${noSha}:${process.env.PATH ?? ''}`;
    expectRefused(f, 'the tree has changed since the last ./run_all_tests.sh pass', { PATH });
    expectRefused(f, 'the last --staging pass was made by a different version of run_all_tests.sh', { PATH });
  });

  // Defect caught: a receipt another local account wrote into /tmp vouches for
  // a production release. Only the mode half of the trust check is driven here:
  // a file owned by another account cannot be made without a second account, so
  // the owner comparison is proven by review, not by this case.
  it('refuses a receipt other accounts could have written', () => {
    const f = fixture();
    chmodSync(f.receipt, 0o644);
    expectRefused(f, 'not owned by this account with mode 600');
  });

  it('refuses a receipt for another commit', () => {
    const f = fixture();
    f.writeReceipt({ commit: '0'.repeat(40) });
    expectRefused(f, 'not this commit');
  });

  it('refuses a receipt from a run on an unclean tree', () => {
    const f = fixture();
    f.writeReceipt({ clean: 'no' });
    expectRefused(f, 'ran on a tree with uncommitted changes');
  });

  it('refuses a receipt for a different tree fingerprint', () => {
    const f = fixture();
    f.writeReceipt({ tree: 'a'.repeat(64) });
    expectRefused(f, 'the tree has changed since the last ./run_all_tests.sh pass');
  });

  it('refuses a receipt made by a different version of the runner', () => {
    const f = fixture();
    f.writeReceipt({ runner: 'f'.repeat(64) });
    expectRefused(f, 'different version of run_all_tests.sh');
  });

  it('refuses a receipt that is not GREEN', () => {
    const f = fixture();
    f.writeReceipt({ verdict: 'INCOMPLETE' });
    expectRefused(f, 'is not GREEN');
  });

  it('refuses SKIP_SMOKE and SKIP_TESTS', () => {
    const f = fixture();
    expectRefused(f, 'SKIP_SMOKE=yes', { SKIP_SMOKE: 'yes' });
    expectRefused(f, 'SKIP_TESTS=yes', { SKIP_TESTS: 'yes' });
  });

  it('refuses when staging runs a different commit', () => {
    const f = fixture();
    f.answerStaging('commit=abcdef0 dirty=0 paths=none');
    expectRefused(f, 'staging is running abcdef0');
  });

  it('refuses when staging was shipped from a dirty tree', () => {
    const f = fixture();
    f.answerStaging(`commit=${f.head.slice(0, 7)} dirty=3 paths=x`);
    expectRefused(f, 'shipped from a tree with 3 uncommitted path(s)');
  });

  // Defect caught: a file named "dirty=0" among a dirty deploy's paths makes it
  // read as clean.
  it('reads the dirty count from its own field, not from a path that mentions it', () => {
    const f = fixture();
    f.answerStaging(`commit=${f.head.slice(0, 7)} dirty=2 paths=a,dirty=0`);
    expectRefused(f, 'shipped from a tree with 2 uncommitted path(s)');
  });

  // Defect caught: an unreadable staging host, or one reached without the
  // pinned host keys, is taken as agreement.
  it('refuses when what staging runs cannot be read', () => {
    const f = fixture();
    f.answerStaging(null);
    expectRefused(f, 'could not read what staging is running');
  });

  it('names every failing rule at once, not only the first', () => {
    const f = fixture();
    f.answerCi(['failure']);
    f.answerStaging('commit=abcdef0 dirty=0 paths=none');
    writeFileSync(join(f.work, 'scratch.txt'), 'x\n');
    const res = runGate(f, { SKIP_SMOKE: 'yes' });
    expect(res.status).toBe(1);
    for (const rule of ['SKIP_SMOKE=yes', 'not clean', 'finished red', 'staging is running']) {
      expect(res.stderr, rule).toContain(rule);
    }
  });

  // Defect caught: an exported fake gh or a hand-written receipt makes the
  // strict check report a proof it does not have.
  it('names every test seam as a finding when the seams are not allowed', () => {
    const f = fixture();
    const res = spawnSync('bash', ['-c', 'source scripts/lib/production-release-gate.sh && production_release_gate_require "$PWD"'], {
      cwd: f.work, encoding: 'utf8', env: { ...process.env, ...f.env }, ...SPAWN_GUARD,
    });
    expect(res.status).toBe(1);
    for (const seam of SEAMS) {
      expect(res.stderr, seam).toContain(`${seam} is set; test seams are never honoured on a production deploy`);
    }
  });
});

/**
 * The deploy form, run the way a deploy runs it: no seams, so gh and ssh are the
 * fixture's stubs found on PATH. The receipts live at their fixed per-account
 * paths, which a test cannot own, so no case here asserts on them; a receipt
 * finding is a warning either way and never changes the verdict.
 */
function runDeploy(f: Fixture, extraEnv: Record<string, string> = {}): { rc: string; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...f.env, PATH: `${f.bin}:${process.env.PATH ?? ''}`, ...extraEnv };
  for (const seam of SEAMS) if (!(seam in extraEnv)) delete env[seam];
  const res = spawnSync('bash', ['-c', 'source scripts/lib/production-release-gate.sh; production_release_gate_deploy "$PWD"; echo "rc=$?"'], {
    cwd: f.work, encoding: 'utf8', env, ...SPAWN_GUARD,
  });
  return { rc: (res.stdout ?? '').trim(), stderr: res.stderr ?? '' };
}

describe('the release rules on a production deploy', () => {
  // Defect caught: footbag-operator cannot deploy production when they decide
  // to, because uncommitted, unpushed or untested work stops the deploy.
  it('warns, and goes on, for uncommitted, unpushed, untested and not-yet-staged work', () => {
    const f = fixture();
    f.answerCi(['in_progress']);
    f.answerStaging('commit=abcdef0 dirty=0 paths=none');
    writeFileSync(join(f.work, 'scratch.txt'), 'x\n');
    const res = runDeploy(f);
    expect(res.rc, res.stderr).toBe('rc=0');
    expect(res.stderr).toContain('WARNING: this tree does not meet every production release rule');
    expect(res.stderr).not.toContain('stopped by a real problem');
    for (const rule of ['not clean', 'is not green on every run (in_progress)', 'staging is running abcdef0']) {
      expect(res.stderr, rule).toContain(rule);
    }
  });

  // Defect caught: a real problem slips through as a warning, so production
  // ships with a safety step switched off, from a fork, or with CI red.
  it('stops on each real problem, naming it as one', () => {
    const cases: Array<[string, (f: Fixture) => Record<string, string>, string]> = [
      ['SKIP_SMOKE', () => ({ SKIP_SMOKE: 'yes' }), 'SKIP_SMOKE=yes'],
      ['SKIP_TESTS', () => ({ SKIP_TESTS: 'yes' }), 'SKIP_TESTS=yes'],
      ...ESCAPE_HATCHES.map((h): [string, (f: Fixture) => Record<string, string>, string] => [h, () => ({ [h]: '0' }), `${h} is set`]),
      ['a fork origin', (f) => {
        sh(f.work, 'git', ['config', 'remote.origin.url', 'git@github.com:someone/footbag-platform.git']);
        return {};
      }, "origin is 'someone/footbag-platform'"],
      ['CI finished red', (f) => { f.answerCi(['success', 'failure']); return {}; }, 'finished red (failure,success)'],
    ];
    for (const [name, arrange, fragment] of cases) {
      const f = fixture();
      const res = runDeploy(f, arrange(f));
      expect(res.rc, `${name}: ${res.stderr}`).toBe('rc=1');
      const blockSection = res.stderr.slice(res.stderr.indexOf('stopped by a real problem'));
      expect(res.stderr, name).toContain('ERROR: this deploy is stopped by a real problem:');
      expect(blockSection.split('WARNING:')[0], name).toContain(fragment);
    }
  });

  // Defect caught: on a deploy, an exported fake gh or hand-written receipt is
  // honoured, so the deploy reports a proof the tree does not have.
  it('never honours a test seam, and stops on one', () => {
    const f = fixture();
    const seams = Object.fromEntries(SEAMS.map((s) => [s, f.env[s] as string]));
    const res = runDeploy(f, seams);
    expect(res.rc, res.stderr).toBe('rc=1');
    for (const seam of SEAMS) {
      expect(res.stderr, seam).toContain(`${seam} is set; test seams are never honoured on a production deploy`);
      expect(res.stderr, seam).not.toContain(`TEST SEAM: ${seam}=`);
    }
  });
});

describe('where the gate is called', () => {
  // Defect caught: a production path ships without checking the rules, a
  // production deploy is held to the strict form (so uncommitted or untested
  // work is refused), or staging starts being checked against production's rules.
  it('checks the deploy form of the rules on every production shipping path, and only on its production branch', () => {
    const entry = readFileSync(join(REPO_ROOT, 'deploy_to_aws.sh'), 'utf8');
    const call = entry.indexOf('production_release_gate_deploy "$SCRIPT_DIR" || exit 1');
    expect(entry).not.toContain('production_release_gate_require');
    expect(call).toBeGreaterThan(entry.indexOf('if [[ "${DEPLOY_TARGET:-footbag-staging}" == "footbag-production" ]]; then'));
    // After the terminal check, and before the first prompt, so a real problem
    // costs no typed word and no password.
    expect(call).toBeGreaterThan(entry.indexOf('stdin/stdout/stderr are not all TTYs'));
    expect(call).toBeLessThan(entry.indexOf("Type 'APPLY' to confirm"));
    expect(call).toBeLessThan(entry.indexOf('Skip the media upload'));

    for (const leaf of ['scripts/deploy-code.sh', 'scripts/deploy-rebuild.sh']) {
      const text = readFileSync(join(REPO_ROOT, leaf), 'utf8');
      const block = /if \[\[ "\$REMOTE" == "footbag-production" \]\]; then\n(?:\s*#[^\n]*\n)*\s*source "\$\{REPO_ROOT\}\/scripts\/lib\/production-release-gate\.sh"\n\s*production_release_gate_deploy "\$REPO_ROOT" \|\| exit 1\nfi/;
      expect(text, leaf).toMatch(block);
      expect(text, leaf).not.toContain('production_release_gate_require');
      // Ahead of anything that reaches a host.
      expect(text.search(block), leaf).toBeLessThan(text.indexOf('require_pinned_known_hosts || exit 1'));
    }
    // deploy-migrate.sh ships by handing off to deploy-code.sh.
    expect(readFileSync(join(REPO_ROOT, 'scripts/deploy-migrate.sh'), 'utf8'))
      .toMatch(/exec bash "\$\{SCRIPT_DIR\}\/deploy-code\.sh"/);
  });
});
