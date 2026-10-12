/**
 * The production release gate, proved against a throwaway repository.
 *
 * Contract: a production release ships only exactly what continuous integration
 * proved. The gate allows a tree only when it is clean, its origin is the
 * canonical repository, main contains its HEAD, and every run of the CI
 * aggregate check on that commit succeeded. A HEAD that is an earlier commit of
 * main is a rollback to a commit CI proved, and is allowed with a warning.
 * SKIP_SMOKE and the schema-drift and lock-holder escape hatches are refused,
 * and the test seam is never honoured outside the standalone check. Staging is
 * no part of a production release: nothing about it is read, required or warned
 * about. Every failing rule is named, and a question that cannot be answered is
 * a refusal. The standalone check and the deploy form apply the same rules.
 *
 * Each case builds a repository whose origin names the canonical repository and
 * resolves, through git's insteadOf, to a local bare repository; copies in the
 * shipped gate; and runs the copy. gh is a stub that answers only when called
 * the way the gate must call it, so a gate asking the wrong question gets no
 * answer and refuses.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = process.cwd();
const CANONICAL = 'davidleberknight/footbag-platform';
const CHECK = 'Type-check and test';
const SHIPPED = ['scripts/verify-production-release.sh', 'scripts/lib/production-release-gate.sh'];
const ESCAPE_HATCHES = ['FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK', 'FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT', 'FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS'];
const SEAM = 'FOOTBAG_GH_BIN';

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
  head: () => string;
  answerCi: (conclusions: string[] | null) => void;
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
  sh(work, 'git', ['add', '-A']);
  sh(work, 'git', ['commit', '-q', '-m', 'release candidate']);
  const url = `git@github.com:${CANONICAL}.git`;
  sh(work, 'git', ['remote', 'add', 'origin', url]);
  sh(work, 'git', ['config', `url.${origin}.insteadOf`, url]);
  sh(work, 'git', ['push', '-q', 'origin', 'main']);
  const head = (): string => sh(work, 'git', ['rev-parse', 'HEAD']);

  // Answers for whatever commit HEAD is when the gate asks, the way the GitHub
  // API does: a check-runs payload, with the gate's own --jq program run over it,
  // so the filter that tells a finished run from a running one is what is
  // judged. A run still going has a null conclusion. The payload also carries an
  // unrelated check, finished red, which a filter selecting the wrong check reads.
  const answerCi = (conclusions: string[] | null): void => {
    const runs = conclusions?.map((c) => (c === 'in_progress'
      ? { name: CHECK, status: 'in_progress', conclusion: null }
      : { name: CHECK, status: 'completed', conclusion: c })) ?? [];
    const payload = JSON.stringify({ check_runs: [...runs, { name: 'Some other check', status: 'completed', conclusion: 'failure' }] });
    writeFileSync(
      join(bin, 'gh'),
      conclusions === null
        ? '#!/usr/bin/env bash\necho "gh: not signed in" >&2\nexit 1\n'
        : '#!/usr/bin/env bash\n'
          + `head="$(git rev-parse HEAD)"\n`
          + `[[ "$1" == api && "$2" == "repos/${CANONICAL}/commits/\${head}/check-runs" ]] || exit 1\n`
          + 'prog=""; while (( $# )); do [[ "$1" == --jq ]] && { prog="$2"; shift; }; shift; done\n'
          + '[[ -n "$prog" ]] || exit 1\n'
          + `jq -r "$prog" <<< ${JSON.stringify(payload)}\n`,
      { mode: 0o755 },
    );
  };
  answerCi(['success']);

  const env: NodeJS.ProcessEnv = { ...process.env, [SEAM]: join(bin, 'gh') };
  for (const k of ['SKIP_SMOKE', ...ESCAPE_HATCHES]) delete env[k];
  return { work, bin, env, head, answerCi };
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

/** Adds a commit to main and pushes it, so the fixture's first commit becomes an earlier commit of main. */
function advanceMain(f: Fixture): void {
  writeFileSync(join(f.work, 'later.txt'), 'later\n');
  sh(f.work, 'git', ['add', '-A']);
  sh(f.work, 'git', ['commit', '-q', '-m', 'a later release']);
  sh(f.work, 'git', ['push', '-q', 'origin', 'main']);
}

describe('the production release gate', () => {
  // Defect caught: a tree that meets every rule is refused, so production can
  // never be deployed.
  it('passes a clean tree at the tip of the canonical main with CI green', () => {
    const res = runGate(fixture());
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('PASS: this tree may ship to production.');
    expect(res.stderr).toContain(`TEST SEAM: ${SEAM}=`);
    expect(res.stderr).not.toContain('WARNING');
  });

  // Defect caught: a production release is held to staging. The fixture gives
  // the gate no staging host and no staging pass of any kind.
  it('passes with nothing known about staging, and names no staging rule in its output', () => {
    const res = runGate(fixture());
    expect(res.status, res.stderr).toBe(0);
    expect(`${res.stdout}${res.stderr}`.toLowerCase()).not.toContain('staging');
  });

  // Defect caught: uncommitted changes ship, bytes no test has seen.
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

  // Defect caught: a commit main does not have ships, so production runs code CI
  // never proved on main.
  it('refuses a HEAD that main does not contain', () => {
    const f = fixture();
    writeFileSync(join(f.work, 'extra.txt'), 'x\n');
    sh(f.work, 'git', ['add', '-A']);
    sh(f.work, 'git', ['commit', '-q', '-m', 'not pushed']);
    expectRefused(f, 'is not on main');
  });

  // Defect caught: rolling production back to a commit CI already proved is
  // refused, so the fastest safe answer to a bad release is unavailable; or it
  // passes silently, so nobody notices production moved backwards.
  it('allows an earlier commit of main, as a rollback, with a warning', () => {
    const f = fixture();
    const earlier = f.head();
    advanceMain(f);
    sh(f.work, 'git', ['checkout', '-q', earlier]);
    const res = runGate(f);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stderr).toContain('is an earlier commit of main, not its tip');
    expect(res.stderr).toContain('rolls production back');
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
    expectRefused(f, 'is not green on every run yet (in_progress)');
  });

  // Defect caught: an unreadable CI verdict, as for an unpushed commit, is
  // treated as a pass.
  it('refuses when the CI check cannot be read', () => {
    const f = fixture();
    f.answerCi(null);
    expectRefused(f, 'could not be read');
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

  it('refuses SKIP_SMOKE, naming production as what the smoke protects', () => {
    const f = fixture();
    expectRefused(f, 'SKIP_SMOKE=yes', { SKIP_SMOKE: 'yes' });
    // Defect caught: the refusal tells the operator a production deploy checks
    // staging first, which it does not; the smoke it protects is production's own.
    const smokeLine = runGate(f, { SKIP_SMOKE: 'yes' }).stderr.split('\n').find((l) => l.includes('SKIP_SMOKE=yes')) ?? '';
    expect(smokeLine).not.toContain('staging');
  });

  it('names every failing rule at once, not only the first', () => {
    const f = fixture();
    f.answerCi(['failure']);
    writeFileSync(join(f.work, 'scratch.txt'), 'x\n');
    const res = runGate(f, { SKIP_SMOKE: 'yes' });
    expect(res.status).toBe(1);
    for (const rule of ['SKIP_SMOKE=yes', 'not clean', 'finished red']) {
      expect(res.stderr, rule).toContain(rule);
    }
  });

  // Defect caught: an exported fake gh makes the check report a CI result it
  // does not have.
  it('refuses the test seam when seams are not allowed', () => {
    const f = fixture();
    const res = spawnSync('bash', ['-c', 'source scripts/lib/production-release-gate.sh && production_release_gate_require "$PWD"'], {
      cwd: f.work, encoding: 'utf8', env: { ...process.env, ...f.env }, ...SPAWN_GUARD,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(`${SEAM} is set; test seams are never honoured on a production deploy`);
  });
});

/**
 * The deploy form, run the way a deploy runs it: no seam, so gh is the fixture's
 * stub found on PATH.
 */
function runDeploy(f: Fixture, extraEnv: Record<string, string> = {}): { rc: string; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...f.env, PATH: `${f.bin}:${process.env.PATH ?? ''}`, ...extraEnv };
  if (!(SEAM in extraEnv)) delete env[SEAM];
  const res = spawnSync('bash', ['-c', 'source scripts/lib/production-release-gate.sh; production_release_gate_deploy "$PWD"; echo "rc=$?"'], {
    cwd: f.work, encoding: 'utf8', env, ...SPAWN_GUARD,
  });
  return { rc: (res.stdout ?? '').trim(), stderr: res.stderr ?? '' };
}

describe('the release rules on a production deploy', () => {
  // Defect caught: a deploy ships what CI never proved: uncommitted changes, a
  // commit main does not have, or a commit whose CI has not finished green.
  it('refuses uncommitted, unpushed and unproven work', () => {
    const cases: Array<[string, (f: Fixture) => void, string]> = [
      ['uncommitted', (f) => writeFileSync(join(f.work, 'scratch.txt'), 'x\n'), 'not clean'],
      ['unpushed', (f) => {
        writeFileSync(join(f.work, 'extra.txt'), 'x\n');
        sh(f.work, 'git', ['add', '-A']);
        sh(f.work, 'git', ['commit', '-q', '-m', 'not pushed']);
      }, 'is not on main'],
      ['CI still running', (f) => f.answerCi(['in_progress']), 'not green on every run yet'],
      ['CI unreadable', (f) => f.answerCi(null), 'could not be read'],
    ];
    for (const [name, arrange, fragment] of cases) {
      const f = fixture();
      arrange(f);
      const res = runDeploy(f);
      expect(res.rc, `${name}: ${res.stderr}`).toBe('rc=1');
      expect(res.stderr, name).toContain('ERROR: this tree may not ship to production:');
      expect(res.stderr, name).toContain(fragment);
      expect(res.stderr.toLowerCase(), name).not.toContain('staging');
    }
  });

  // Defect caught: a safety step switched off, a fork, or red CI ships.
  it('refuses each safety override, a fork origin and red CI', () => {
    const cases: Array<[string, (f: Fixture) => Record<string, string>, string]> = [
      ['SKIP_SMOKE', () => ({ SKIP_SMOKE: 'yes' }), 'SKIP_SMOKE=yes'],
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
      expect(res.stderr, name).toContain(fragment);
    }
  });

  it('allows a clean tree at the tip of main with CI green', () => {
    const res = runDeploy(fixture());
    expect(res.rc, res.stderr).toBe('rc=0');
    expect(res.stderr).toContain('==> Production release gate: clean, on main, CI green on every run for this commit.');
  });

  // Defect caught: on a deploy, an exported fake gh is honoured, so the deploy
  // reports a CI result it does not have.
  it('never honours the test seam, and refuses on it', () => {
    const f = fixture();
    const res = runDeploy(f, { [SEAM]: f.env[SEAM] as string });
    expect(res.rc, res.stderr).toBe('rc=1');
    expect(res.stderr).toContain(`${SEAM} is set; test seams are never honoured on a production deploy`);
    expect(res.stderr).not.toContain(`TEST SEAM: ${SEAM}=`);
  });
});

describe('where the gate is called', () => {
  // Defect caught: a production path ships without checking the rules, or
  // staging starts being checked against production's rules.
  it('checks the rules on every production shipping path, and only on its production branch', () => {
    const entry = readFileSync(join(REPO_ROOT, 'deploy_to_aws.sh'), 'utf8');
    // A live line of its own, so a commented-out call does not count.
    const call = entry.search(/^\s*production_release_gate_deploy "\$SCRIPT_DIR" \|\| exit 1$/m);
    expect(call, 'deploy_to_aws.sh calls the gate on a live line').toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(entry.indexOf('if [[ "${DEPLOY_TARGET:-footbag-staging}" == "footbag-production" ]]; then'));
    // After the terminal check, and before the first prompt, so a refusal costs
    // no typed word and no password.
    expect(call).toBeGreaterThan(entry.indexOf('stdin/stdout/stderr are not all TTYs'));
    expect(call).toBeLessThan(entry.indexOf("Type 'APPLY' to confirm"));
    expect(call).toBeLessThan(entry.indexOf('Skip the media upload'));

    for (const leaf of ['scripts/deploy-code.sh', 'scripts/deploy-rebuild.sh']) {
      const text = readFileSync(join(REPO_ROOT, leaf), 'utf8');
      const block = /if \[\[ "\$REMOTE" == "footbag-production" \]\]; then\n(?:\s*#[^\n]*\n)*\s*source "\$\{REPO_ROOT\}\/scripts\/lib\/production-release-gate\.sh"\n\s*production_release_gate_deploy "\$REPO_ROOT" \|\| exit 1\nfi/;
      expect(text, leaf).toMatch(block);
      // Ahead of anything that reaches a host.
      expect(text.search(block), leaf).toBeLessThan(text.indexOf('require_pinned_known_hosts || exit 1'));
    }
    // deploy-migrate.sh ships by handing off to deploy-code.sh.
    expect(readFileSync(join(REPO_ROOT, 'scripts/deploy-migrate.sh'), 'utf8'))
      .toMatch(/exec bash "\$\{SCRIPT_DIR\}\/deploy-code\.sh"/);
  });
});
