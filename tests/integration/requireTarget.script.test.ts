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
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

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
    'deploy_to_aws.sh':
      'it defaults an omitted --target to staging by design, which the shared check exists to refuse, and it validates before sourcing anything so its production gate runs first',
    'deploy-migrate.sh':
      'it reports refusals through die (exit 1), as the code deploy it hands off to does, and its refusal explains why this deploy in particular never defaults',
    'arming.sh': 'takes a lever name and a state; its environment is a property of the lever',
    'activate-payments.sh': 'payments exist in production only; the environment is not a choice',
    'smoke-security.sh':
      'a test harness entry point rather than an operator script, like test-smoke.sh; it probes a base URL and takes its environment from SMOKE_ENV to pick a seeded persona',
    'smoke-local.sh':
      'a test harness entry point rather than an operator script, like smoke-security.sh; it probes a base URL and takes its environment from SMOKE_ENV to pick what it checks',
  };

  /**
   * A case arm listing both deployed environments among its alternatives, in
   * any position and alongside any other value.
   *
   * `staging|production)` is only the commonest spelling. A script that lists a
   * third environment first, or trailing values after production, writes the
   * same hand-rolled check; an anchored pattern does not see it, and such a
   * script is then neither covered, nor reported as an offender, nor exempt. A
   * guard whose whole job is to catch the script that quietly does its own
   * thing must not be evaded by the order somebody wrote the alternatives in.
   *
   * What this fixes is ORDER, and only order. It still reads case arms, so a
   * hand-rolled check written as an if-chain or a test expression is not
   * matched, nor is a case arm with spaces around the alternation, nor one whose
   * alternatives are individually quoted. Said plainly because a matcher
   * described as general gets trusted as general, and the next person to widen
   * it should know where the edge actually is.
   */
  const handRollsEnvironmentCheck = (body: string): boolean => {
    for (const match of body.matchAll(/^[ \t]*([A-Za-z0-9_*?.|-]+)\)/gm)) {
      const alternatives = match[1].split('|');
      if (alternatives.includes('staging') && alternatives.includes('production')) return true;
    }
    return false;
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
      .filter((path) => handRollsEnvironmentCheck(readFileSync(path, 'utf-8')));
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
    // repository-root deploy wrapper, neither of which the scan flagged at the
    // time. The security smoke entry has since come back, and legitimately: the
    // matcher was widened to read a case arm's alternatives rather than one
    // spelling, and that script's own arm lists three environments, so it is now
    // matched and now needs excusing. The deploy wrapper's entry has not
    // returned. Why a script takes its environment differently is a property of
    // the script and belongs in the operator-script rules, not in a list whose
    // only job is to excuse a match.
    const dead = Object.keys(EXEMPT).filter((name) => {
      const hit = scanned().find(([, n]) => n === name);
      if (!hit) return true;
      return !handRollsEnvironmentCheck(readFileSync(hit[0], 'utf-8'));
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

describe('require_host_is: the host says which environment it is', () => {
  // The client is replaced by a stub that answers the way the remote half
  // does, with the host's recorded value between sentinels, and records what it
  // was sent. Connection options are pre-filled so no pin file is needed.
  const dir = createScratchDir('require-host-is');
  const stub = join(dir, 'ssh');
  const sent = join(dir, 'sent.log');
  writeFileSync(stub, [
    '#!/usr/bin/env bash',
    `cat >> "${sent}"`,
    'if [[ "${STUB_FAIL:-}" == 1 ]]; then exit 255; fi',
    'echo "---FOOTBAG-HOST-ENV---"',
    'printf "%s\\n" "${STUB_RECORDED-}"',
    'echo "---FOOTBAG-END---"',
  ].join('\n'));
  chmodSync(stub, 0o755);
  afterAll(() => removeScratch(dir));

  const ask = (target: string, env: Record<string, string>) => {
    rmSync(sent, { force: true });
    const res = spawnSync('bash', ['-c',
      `source "${LIB}"; HOST_SSH_OPTS=(-o BatchMode=yes); HOST_SSH_BIN="${stub}"; SUDO_PASS=pw; ` +
      `require_host_is footbag-${target} ${target}`], {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      ...SPAWN_GUARD,
    });
    return { status: res.status, stderr: res.stderr ?? '' };
  };

  it('passes a host that records itself as the target', () => {
    const r = ask('staging', { STUB_RECORDED: 'staging' });
    expect(r.status, r.stderr).toBe(0);
    // Only the one value is asked for: the body sent reads FOOTBAG_ENV and
    // nothing ships the env file's secrets down.
    const body = readFileSync(sent, 'utf-8');
    expect(body.split('\n')[0]).toBe('pw');
    expect(body).toContain('---FOOTBAG-HOST-ENV---');
    expect(body).not.toContain('base64');
  });

  it('refuses a host that records the other environment, naming both', () => {
    const r = ask('staging', { STUB_RECORDED: 'production' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/records FOOTBAG_ENV=production, but this run is --target staging/);
  });

  it('refuses a host with no record rather than passing it', () => {
    // A new host before its first bring-up step: passing it would leave the
    // newly built host, the likeliest to be misaddressed, as the one unchecked.
    const r = ask('production', { STUB_RECORDED: '' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/records no FOOTBAG_ENV/);
    expect(r.stderr).toMatch(/set-host-env\.sh --target production/);
  });

  it('refuses when the host cannot be asked', () => {
    const r = ask('staging', { STUB_FAIL: '1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not ask footbag-staging which environment it is/);
  });

  // host_address_for reads the other environment's credential file and asks its
  // host; the file selection and the alias lookup are the shared rule's, tested
  // with it, so they are stood in for here and this pins what the function adds.
  const addressOf = (target: string, recorded: string, url: string) => {
    const cred = join(dir, 'cred');
    writeFileSync(cred, 'other-host-pw\n');
    const answer = join(dir, `answer-${recorded}-${url ? 'url' : 'none'}`);
    writeFileSync(answer, [
      '#!/usr/bin/env bash',
      `cat >> "${sent}"`,
      'echo "---FOOTBAG-HOST-ENV---"',
      `printf "%s\\n" ${JSON.stringify(recorded)}`,
      'echo "---FOOTBAG-HOST-URL---"',
      `printf "%s\\n" ${JSON.stringify(url)}`,
      'echo "---FOOTBAG-END---"',
    ].join('\n'));
    chmodSync(answer, 0o755);
    rmSync(sent, { force: true });
    const res = spawnSync('bash', ['-c',
      `source "${LIB}"; HOST_SSH_OPTS=(-o BatchMode=yes); HOST_SSH_BIN="${answer}"; ` +
      `require_operator_credential() { OPERATOR_CREDENTIAL_FILE="${cred}"; OPERATOR_CREDENTIAL_DISPLAY="${cred}"; }; ` +
      'require_ssh_alias() { :; }; ' +
      'SUDO_PASS=callers-own-pw; HOST_PUBLIC_BASE_URL=https://callers-own.example.invalid; ' +
      `host_address_for ${target}; rc=$?; ` +
      'printf "rc=%s address=%s pass=%s own=%s\\n" "$rc" "$HOST_ADDRESS" "$SUDO_PASS" "$HOST_PUBLIC_BASE_URL"'], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    return { out: res.stdout ?? '', stderr: res.stderr ?? '' };
  };

  // Defect caught: a check or a production deploy's staging pre-check loading
  // an address other than the one the environment's own host serves, or the
  // lookup overwriting the password or address the caller holds for its own host.
  it('gives the address the confirmed host records, and leaves the caller its own', () => {
    const r = addressOf('staging', 'staging', 'https://staging-site.example.invalid/');
    expect(r.out, r.stderr).toContain('rc=0 address=https://staging-site.example.invalid pass=callers-own-pw own=https://callers-own.example.invalid');
    // The other host was asked with its own credential, not the caller's.
    expect(readFileSync(sent, 'utf-8').split('\n')[0]).toBe('other-host-pw');
  });

  it('refuses a host that records no address, and one that is not the environment named', () => {
    expect(addressOf('staging', 'staging', '').out).toMatch(/^rc=1 address= /m);
    expect(addressOf('staging', 'staging', '').stderr).toMatch(/records no PUBLIC_BASE_URL/);
    expect(addressOf('staging', 'production', 'https://prod.example.invalid').out).toMatch(/^rc=1 address= /m);
  });

  it('connects with the client the library assigns, not one exported in the shell', () => {
    // An exported HOST_SSH_BIN must not route the check: the library assigns
    // it at source time, and only a script's own seam reassigns it afterwards.
    const res = spawnSync('bash', ['-c', `source "${LIB}"; printf '%s' "$HOST_SSH_BIN"`], {
      encoding: 'utf-8',
      env: { ...process.env, HOST_SSH_BIN: stub },
      ...SPAWN_GUARD,
    });
    expect(res.stdout).toBe('ssh');
  });
});

describe('the server a run reaches follows its label, and confirms it', () => {
  // Defect caught: a run labelled one environment acting on the other's server.
  // A restore labelled staging that was handed the production server's nickname
  // replaced the production database and skipped the production confirmation,
  // because every guard asked the label and nothing asked the server.
  const code = (path: string): string =>
    readFileSync(path, 'utf-8')
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');

  const operatorScripts = (): Array<[string, string]> => {
    const files = (dir: string) =>
      readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.sh'))
        .map((e): [string, string] => [join(dir, e.name), e.name]);
    return [...files(SCRIPTS_DIR), ...files(process.cwd())];
  };

  it('no script accepts a server nickname or takes one from anything but the label', () => {
    // The deploy entry point and its workers pass the nickname between
    // themselves as DEPLOY_TARGET, set from the entry point's own --target.
    const DEPLOY_CHAIN = new Set([
      'deploy_to_aws.sh', 'deploy-to-aws.sh', 'deploy-code.sh', 'deploy-rebuild.sh', 'deploy-migrate.sh',
    ]);
    const offenders = operatorScripts().flatMap(([path, name]) => {
      const body = code(path);
      const found: string[] = [];
      if (/^\s*--(ssh-alias|host-alias)\)/m.test(body)) found.push(`${name}: accepts a nickname option`);
      if (!DEPLOY_CHAIN.has(name) && /\$\{DEPLOY_TARGET/.test(body)) {
        found.push(`${name}: takes its server from DEPLOY_TARGET`);
      }
      // Only the two entry points an operator runs set the hand-off, each from
      // its own --target; anything else setting it is choosing a deploy's
      // environment where no operator named it.
      if (!['deploy_to_aws.sh', 'deploy-migrate.sh'].includes(name) && /(^|[\s;(])(export\s+)?DEPLOY_TARGET=/m.test(body)) {
        found.push(`${name}: sets DEPLOY_TARGET; pass --target to the deploy instead`);
      }
      // The smoke runner's hand-off to its suites, likewise set only by it.
      if (name !== 'test-smoke.sh' && /(^|[\s;(])(export\s+)?SMOKE_TARGET_ENV=/m.test(body)) {
        found.push(`${name}: sets SMOKE_TARGET_ENV; pass --target to the smoke runner instead`);
      }
      if (/(SSH_ALIAS|REMOTE|ALIAS)="\$\{1:-/.test(body)) found.push(`${name}: takes its server as an argument`);
      // One spelling for naming an environment, so an operator never has to
      // remember which script wants which.
      if (/^\s*--env\)/m.test(body)) found.push(`${name}: names the environment with --env, not --target`);
      // A read of $1 inside the --target arm itself is the flag's value, not a
      // bare argument.
      const bare = body.split('\n').some(
        (line) => /(TARGET|TARGET_ENV|ENVIRONMENT)="\$\{1:-/.test(line) && !line.includes('--target)'),
      );
      if (bare) found.push(`${name}: takes the environment as a bare argument`);
      // No default environment, except the daily staging deploy and the two
      // scripts whose subject exists in one environment only and which take no
      // --target at all.
      const PRESET_ALLOWED = new Set(['deploy_to_aws.sh', 'production-live-marker.sh', 'realdata-staging.sh']);
      if (!PRESET_ALLOWED.has(name) && /^TARGET="(staging|production)"/m.test(body)) {
        found.push(`${name}: pre-sets its target, so an omitted --target is never refused`);
      }
      // A site address or bucket comes from the target or the confirmed host,
      // never from a value typed or exported beside it.
      // Only beside a --target: a script whose subject is a domain name, such as
      // a certificate check, names no environment for an address to disagree with.
      // One named exception: a dev-and-tester's acceptance runs before their
      // machine can read the target's address at all (it is in no public file,
      // and Terraform needs the key the delivery carries), so it is handed the
      // address the onboarding read from the target, and refuses any delivery
      // naming another.
      const ADDRESS_BEFORE_IDENTITY = new Set(['accept-dev-tester-onboarding.sh']);
      if (!ADDRESS_BEFORE_IDENTITY.has(name) && /^\s*--target\)/m.test(body) && /^\s*--(base-url|domain|url|host)\)/m.test(body)) {
        found.push(`${name}: accepts a site address beside the target`);
      }
      if (/\$\{SMOKE_BASE_URL/.test(body)) found.push(`${name}: takes the smoke address from SMOKE_BASE_URL`);
      if (name !== 'take-pre-cutover-snapshot.sh' && /\$\{FOOTBAG_DR_BUCKET:-/.test(body)) {
        found.push(`${name}: lets FOOTBAG_DR_BUCKET override the target's bucket`);
      }
      return found;
    });
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  /**
   * Scripts that open a connection to a server without asking it which
   * environment it is, each for a stated reason.
   */
  const UNCONFIRMED: Record<string, string> = {
    'set-host-env.sh':
      'it is the step that records the value on a new host; it refuses a recorded value that differs from its target, which is the same rule applied where the value is written',
    'host-shell.sh':
      'it opens an interactive login and runs nothing itself; it carries no sudo password, and the record it would read is root-only',
    'accept-dev-tester-onboarding.sh':
      'it connects to the staging address the sealed delivery names, as the new named account, before that account has a password the host accepts; it proves and sets only that account\'s own login',
    'deploy_to_aws.sh':
      'its one connection is a read-only schema fingerprint taken before the password is read, which can only warn; the worker scripts it hands off to confirm the host before any change',
  };

  // Every form a script here opens a connection with: the ssh client itself
  // with its pinned options, the named seam a script substitutes for it in
  // tests, and the shared library's wire functions.
  // `ssh -G` only reads the local configuration and reaches nothing, so it is
  // not a connection.
  const connects = (body: string): boolean =>
    /(^|[|(;&!]|\b(then|do|else))\s*ssh\s+(?!-G\b)|"?\$\{?SSH_BIN\}?"?\s|\b(scp|sftp)\s|-e\s+"?ssh\b|\bhost_env_(fetch|install)\s|\bhost_log_tail\s/m.test(body);

  it('every script that connects to a server asks it which environment it is first', () => {
    const offenders = operatorScripts()
      .filter(([, name]) => !(name in UNCONFIRMED))
      .filter(([path]) => {
        const body = code(path);
        return connects(body) && !/\brequire_host_is\s/.test(body);
      })
      .map(([, name]) => name);
    expect(
      offenders,
      `these connect to a server without require_host_is; call it, or add a reason to UNCONFIRMED:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('carries no exemption that exempts nothing', () => {
    const dead = Object.keys(UNCONFIRMED).filter((name) => {
      const hit = operatorScripts().find(([, n]) => n === name);
      return !hit || !connects(code(hit[0]));
    });
    expect(dead, `these exemptions match nothing:\n${dead.join('\n')}`).toEqual([]);
  });
});
