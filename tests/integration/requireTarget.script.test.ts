/**
 * require_target — which environment a run lands on, asked once for the tree.
 *
 * Nineteen scripts had their own copy of this check, each a hand-written case
 * with its own wording and its own accepted set, and the sets had already
 * diverged. Nothing verified that a new script had the guard at all.
 *
 * It had produced no defect, which is why it was a card rather than a fix. The
 * reason it is worth doing anyway is the confirmation flag, which was the same
 * structure: every script was expected to clear `ASSUME_YES` before sourcing,
 * seven had not, and an exported value accepted the typed confirmation on a
 * production apply, on arming live payments, and on restoring a database. That
 * was fixed in the library rather than in each caller, and this is the same
 * move for the same reason.
 *
 * The last block is the one that matters in a year: it fails when a NEW
 * operator script reaches a deployed environment without a target guard, which
 * is the regression no reviewer reliably catches.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/host-env-remote.sh');
const SCRIPTS_DIR = join(process.cwd(), 'scripts');

function callHelper(body: string) {
  const res = spawnSync('bash', ['-c', `source "${LIB}"; ${body}`], {
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

describe('require_target: the refusal', () => {
  it('accepts a value in the set', () => {
    expect(callHelper('require_target staging staging production').status).toBe(0);
  });

  it('refuses an empty value as missing rather than as wrong', () => {
    // These used to share one message in several scripts, which told an
    // operator who had forgotten the flag that their value was invalid.
    const r = callHelper('require_target "" staging production');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target is required \('staging' or 'production'\)/);
    expect(r.stderr).toMatch(/no default/);
  });

  it('refuses a value outside the set, and shows what was given', () => {
    const r = callHelper('require_target sandbox staging production');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target must be 'staging' or 'production' \(got 'sandbox'\)/);
  });

  it('takes the accepted set from the caller, so a third value is expressible', () => {
    // The apply wrapper has a third tree, holding every environment's state.
    expect(callHelper('require_target shared staging production shared').status).toBe(0);
    const r = callHelper('require_target sandbox staging production shared');
    expect(r.stderr).toMatch(/'staging', 'production' or 'shared'/);
  });

  it('is expressible with a single accepted value', () => {
    // Payments exist in production only, so a lever naming one environment is
    // correct rather than a missing check.
    expect(callHelper('require_target production production').status).toBe(0);
    const r = callHelper('require_target staging production');
    expect(r.stderr).toMatch(/--target must be 'production' \(got 'staging'\)/);
  });

  it('names the flag the calling script actually spells it with', () => {
    // The secret provisioners say --env. Telling an operator to fix a flag
    // their script does not have is worse than the duplication this replaces.
    const r = callHelper('REQUIRE_TARGET_FLAG="--env"; require_target "" staging production');
    expect(r.stderr).toMatch(/--env is required/);
    expect(r.stderr).not.toMatch(/--target/);
  });

  it('refuses a call that declares no accepted values, rather than passing everything', () => {
    // A guard with an empty allow-list accepts anything, which is the most
    // dangerous possible failure for this particular function.
    const r = callHelper('require_target staging');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/no accepted values/);
  });
});

describe('every operator script that reaches an environment has the guard', () => {
  /**
   * Scripts exempt from the guard, each for a stated reason. Adding a name here
   * is the deliberate act; the point of the list is that it takes one.
   */
  const EXEMPT: Record<string, string> = {
    'restore-db.sh':
      'reports through die (exit 1) and its --target is optional, since an absent one means a local restore',
    'pre-cutover-checklist.sh': 'its --target is optional; an absent one runs the local checks',
    'test-smoke.sh': 'a test harness entry point rather than an operator script',
    'arming.sh': 'takes a lever name and a state; its environment is a property of the lever',
    'activate-payments.sh': 'payments exist in production only; the environment is not a choice',
  };

  const shellFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) return [];
      return e.isFile() && e.name.endsWith('.sh') ? [e.name] : [];
    });

  /**
   * scripts/ plus the repository-root operator wrappers, as `[path, name]`.
   *
   * The root is included for the same reason the credential gate includes it:
   * `deploy_to_aws.sh` is an operator entry point that reaches a deployed
   * environment, and a scan stopping at scripts/ would never see it. Scoping to
   * one directory because that is where most of them live is how a gate comes
   * to have a hole nobody can see from a green run.
   */
  const scanned = (): Array<[string, string]> => [
    ...shellFiles(SCRIPTS_DIR).map((n): [string, string] => [join(SCRIPTS_DIR, n), n]),
    ...shellFiles(process.cwd()).map((n): [string, string] => [join(process.cwd(), n), n]),
  ];

  it('finds at least the scripts this is meant to cover', () => {
    const named = scanned().filter(([path]) => {
      const body = readFileSync(path, 'utf-8');
      return /--target|--env\b/.test(body) && /staging/.test(body);
    });
    expect(named.length).toBeGreaterThanOrEqual(15);
  });

  it('scans the repository-root wrappers, not only scripts/', () => {
    // The hole this closes: deploy_to_aws.sh is an operator entry point that
    // reaches a deployed environment and lives at the root.
    expect(scanned().some(([, name]) => name === 'deploy_to_aws.sh')).toBe(true);
  });

  it('has no script hand-rolling the check outside the exempt list', () => {
    const offenders = scanned()
      .filter(([, name]) => !(name in EXEMPT))
      .map(([path]) => path)
      .filter((path) => {
        const body = readFileSync(path, 'utf-8');
        // The shape every copy shared: a case arm listing both environments.
        return /^\s*staging\|production\)/m.test(body);
      });
    expect(
      offenders,
      `these hand-roll the environment check; use require_target or add a reason to EXEMPT:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('carries no exemption that exempts nothing', () => {
    // An entry naming a script the scan would never have flagged does nothing,
    // and reads as load-bearing to the next editor: it looks like the reason
    // that script is allowed to differ, when in fact removing it changes no
    // outcome. Two such entries sat here, for the security smoke script and the
    // repository-root deploy wrapper, neither of which hand-rolls the check.
    // Why those two scripts take their environment differently is a property of
    // the scripts and belongs in the operator-script rules, not in a list whose
    // only job is to excuse a match.
    const dead = Object.keys(EXEMPT).filter((name) => {
      const hit = scanned().find(([, n]) => n === name);
      if (!hit) return true;
      return !/^\s*staging\|production\)/m.test(readFileSync(hit[0], 'utf-8'));
    });
    expect(
      dead,
      `these exemptions match nothing and should be deleted:\n${dead.join('\n')}`,
    ).toEqual([]);
  });

  it('every exemption carries a reason, so the list cannot grow silently', () => {
    for (const [name, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `${name} needs a real reason`).toBeGreaterThan(20);
    }
  });
});
