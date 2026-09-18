/**
 * scripts/setup-operator-workstation.sh — the one command a new operator runs.
 *
 * Its whole value is that it REPORTS rather than fails. Each step is either
 * `[ok]` or `[TODO]`, and a `[TODO]` names what to do; the operator fixes those
 * and runs it again. That is only true if no step can abort the run, which is
 * the property most easily lost: the script runs under `set -euo pipefail`, so
 * any check whose command exits non-zero outside a condition kills it halfway
 * down and the operator sees a partial list with no verdict.
 *
 * The case that proved it: `grep -c` PRINTS its count and THEN exits 1 when that
 * count is zero, so a `|| echo 0` fallback produced "0\n0" and the arithmetic
 * that read it died with a bash syntax error — on an EMPTY credential file,
 * which is exactly the state that check exists to catch.
 *
 * So what is pinned here is that a cold machine gets a full report and a verdict,
 * that each individual defect is reported rather than fatal, and that `--check`
 * changes nothing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/setup-operator-workstation.sh');

let fakeHome: string;

function run(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  // The developer's own AWS variables are stripped rather than inherited. The
  // script now resolves an identity on every run, and an exported AWS_PROFILE or
  // key pair in the parent shell is an identity: left in place it would send a
  // TEST to the real AWS, and the verdict would then depend on whose machine ran
  // it and whether that person's key was live that day.
  const inherited: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [
    'AWS_PROFILE',
    'AWS_DEFAULT_PROFILE',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
  ]) {
    delete inherited[name];
  }

  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: {
      ...inherited,
      HOME: fakeHome,
      // Pointed into the throwaway home so no run can read or write the
      // operator's own pin.
      FOOTBAG_KNOWN_HOSTS: join(fakeHome, 'AWS', 'footbag_known_hosts'),
      ...extraEnv,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/**
 * A stand-in for `ssh -G`, which is how the script learns what an alias resolves
 * to. Real output cannot be arranged from a test: it depends on the developer's
 * own ~/.ssh/config, which is exactly the machine-specific input a test must not
 * take its verdict from.
 *
 * The lines are the ones OpenSSH actually prints, lowercase keyword then value,
 * captured from `ssh -G` on a configured host.
 */
function stubSshOnPath(lines: string[]): NodeJS.ProcessEnv {
  const binDir = join(fakeHome, 'stubbin');
  mkdirSync(binDir, { recursive: true });
  const sshStub = join(binDir, 'ssh');
  writeFileSync(
    sshStub,
    `#!/usr/bin/env bash\nprintf '%s\\n' ${lines.map((l) => JSON.stringify(l)).join(' ')}\nexit 0\n`,
    'utf-8',
  );
  chmodSync(sshStub, 0o755);
  return { PATH: `${binDir}:${process.env.PATH ?? ''}` };
}

/**
 * What the stubbed AWS CLI answers. `profiles` is what `configure list-profiles`
 * lists; `identities` maps a `--profile` value to the ARN it resolves to, and a
 * profile absent from it refuses, which is how a configured-but-dead credential
 * is expressed.
 */
type AwsStubSpec = { profiles: string[]; identities?: Record<string, string> };

const OPERATOR_ARN = 'arn:aws:iam::000000000000:user/footbag-operator';
const STAGING_ROLE_ARN = 'arn:aws:sts::000000000000:assumed-role/footbag-staging-app-runtime/s';
const PRODUCTION_ROLE_ARN = 'arn:aws:sts::000000000000:assumed-role/footbag-production-app-runtime/s';

/**
 * An `aws` stub, on PATH and on both library seams at once.
 *
 * All three are needed together and the reason is easy to miss: the script probes
 * for the CLI with `command -v aws`, while the library asks the profile question
 * through AWS_PROFILE_BIN and the identity question through AWS_IDENTITY_BIN. A
 * case that set only the seams would pass the probe using the developer's real
 * CLI; a case that set only PATH would resolve identities through it.
 *
 * The answers are in the shape the callers parse for -- one profile name per
 * line, and the bare ARN that `--query Arn --output text` returns -- so the
 * fixture cannot mislead a parser about a format AWS is free to change.
 */
function stubAwsOnPath(spec: AwsStubSpec): NodeJS.ProcessEnv {
  const binDir = join(fakeHome, 'stubbin');
  mkdirSync(binDir, { recursive: true });
  const stub = join(binDir, 'aws');
  const arms = Object.entries(spec.identities ?? {}).map(
    ([profile, arn]) => `    ${profile}) printf '%s\\n' ${JSON.stringify(arn)}; exit 0 ;;`,
  );
  writeFileSync(
    stub,
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then',
      ...spec.profiles.map((p) => `  printf '%s\\n' ${JSON.stringify(p)}`),
      '  exit 0',
      'fi',
      'if [[ "$1" == "sts" && "$2" == "get-caller-identity" ]]; then',
      '  want=""; prev=""',
      '  for a in "$@"; do [[ "$prev" == "--profile" ]] && want="$a"; prev="$a"; done',
      '  case "$want" in',
      ...arms,
      '  esac',
      // The wording AWS itself uses for a key that has been deactivated,
      // deleted or rotated away, which is the state this stub stands in for.
      '  printf \'%s\\n\' "An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation: The security token included in the request is invalid." >&2',
      '  exit 255',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(stub, 0o755);
  return {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    AWS_PROFILE_BIN: stub,
    AWS_IDENTITY_BIN: stub,
  };
}

/** Every profile present and every one of them resolving. */
const HEALTHY_AWS: AwsStubSpec = {
  profiles: ['footbag-operator', 'footbag-staging-runtime', 'footbag-production-runtime'],
  identities: {
    'footbag-operator': OPERATOR_ARN,
    'footbag-staging-runtime': STAGING_ROLE_ARN,
    'footbag-production-runtime': PRODUCTION_ROLE_ARN,
  },
};

const PINNED_ALIAS_LINES = [
  'user footbag',
  'hostname 203.0.113.10',
  'port 2222',
  'identitiesonly yes',
  'stricthostkeychecking yes',
];

/**
 * The same alias connecting as a named person instead of the shared account.
 * That one line is the whole of the identity switch, and it is also what decides
 * which of the four credential files this workstation needs, so it has to be an
 * input the test supplies rather than whatever the developer's own config says.
 */
const NAMED_ALIAS_LINES = PINNED_ALIAS_LINES.map((l) =>
  l === 'user footbag' ? 'user ada_lovelace' : l,
);

/** Everything the run prints, since steps report to both streams. */
function output(r: { stdout: string; stderr: string }): string {
  return `${r.stdout}\n${r.stderr}`;
}

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'footbag-test-workstation-'));
});

afterEach(() => {
  rmSync(fakeHome, { recursive: true, force: true });
});

describe('setup-operator-workstation.sh — argument guards', () => {
  it('requires a target rather than defaulting to one', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target is required \('staging' or 'production'\)/);
    expect(r.stderr).toMatch(/deliberately no default/);
  });

  it('refuses a target that is neither environment', () => {
    const r = run(['--target', 'prod']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/must be 'staging' or 'production'/);
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });

  it('documents every flag it accepts, --private-repo included', () => {
    // It was parsed and it worked, and the help text did not mention it, so the
    // one command a newcomer is sent to run carried a flag its own --help
    // denied having. A flag that works but is undocumented is indistinguishable
    // from a typo to the person reading the usage block to check.
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--private-repo');
    expect(r.stdout).toContain('--target');
    expect(r.stdout).toContain('--check');
  });
});

describe('setup-operator-workstation.sh — it reports rather than aborting', () => {
  it('reaches a verdict on a cold machine, rather than stopping at the first gap', () => {
    // The whole contract. A machine with nothing set up must still get every
    // section and a closing count, because a partial list with no verdict is
    // indistinguishable from a crash and tells the operator nothing about what
    // else is waiting for them.
    const r = run(['--target', 'staging', '--check'], stubSshOnPath(PINNED_ALIAS_LINES));
    expect(r.status).toBe(1);
    const all = output(r);
    expect(all).toMatch(/Tools the deploy needs/);
    expect(all).toMatch(/AWS profiles/);
    expect(all).toMatch(/SSH alias footbag-staging/);
    expect(all).toMatch(/Operator credential file/);
    expect(all).toMatch(/Pinned host-key file/);
    expect(all).toMatch(/thing\(s\) still to do/);
  });

  it('reports an empty credential file instead of dying on it', () => {
    // The regression this file exists for. `grep -c` on an empty file prints 0
    // and exits 1, so the obvious fallback yielded two lines and the arithmetic
    // reading it was a syntax error, which under `set -e` ends the run.
    mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
    const cred = join(fakeHome, 'AWS', 'AWS_OPERATOR.txt');
    writeFileSync(cred, '', 'utf-8');
    chmodSync(cred, 0o600);

    const r = run(['--target', 'staging', '--check'], stubSshOnPath(PINNED_ALIAS_LINES));
    const all = output(r);
    expect(all).toMatch(/holds 0 non-empty lines/);
    expect(all).not.toMatch(/syntax error/);
    // Still reaches the end, which is what proves it reported rather than died.
    expect(all).toMatch(/thing\(s\) still to do/);
  });

  it('reports a credential file with the wrong mode, and says to rotate as well as fix it', () => {
    // A file that was readable must be assumed to have been read, so the mode is
    // not the whole remedy.
    mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
    const cred = join(fakeHome, 'AWS', 'AWS_OPERATOR.txt');
    writeFileSync(cred, 'a-password\n', 'utf-8');
    chmodSync(cred, 0o644);

    const r = run(['--target', 'staging', '--check'], stubSshOnPath(PINNED_ALIAS_LINES));
    const all = output(r);
    expect(all).toMatch(/has mode 644/);
    expect(all).toMatch(/rotate the password/);
    expect(all).toMatch(/thing\(s\) still to do/);
  });

  it('reports a multi-line credential file, which fails on the host as a wrong password', () => {
    mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
    const cred = join(fakeHome, 'AWS', 'AWS_OPERATOR.txt');
    writeFileSync(cred, 'a-password\nsomething-else\n', 'utf-8');
    chmodSync(cred, 0o600);

    const r = run(['--target', 'staging', '--check'], stubSshOnPath(PINNED_ALIAS_LINES));
    expect(output(r)).toMatch(/holds 2 non-empty lines/);
  });

  it('accepts a well-formed credential file', () => {
    mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
    const cred = join(fakeHome, 'AWS', 'AWS_OPERATOR.txt');
    writeFileSync(cred, 'a-password\n', 'utf-8');
    chmodSync(cred, 0o600);

    const r = run(['--target', 'staging', '--check'], stubSshOnPath(PINNED_ALIAS_LINES));
    expect(output(r)).toMatch(/AWS_OPERATOR\.txt present, one line, mode 600/);
  });

  it('names the production credential file when the target is production', () => {
    // Different hosts, different passwords, so a run for one environment must
    // not report the other environment's file as though it were this one's.
    const r = run(['--target', 'production', '--check'], stubSshOnPath(PINNED_ALIAS_LINES));
    expect(output(r)).toMatch(/AWS_OPERATOR_PRODUCTION\.txt/);
  });

  it('names the personal file when the alias connects as a named account', () => {
    // The alias's `User` line is the whole of the identity switch, and the
    // credential follows it. A report that named the shared file here would send
    // an operator to write their own password into the shared account's file,
    // which is the one-file-two-meanings shape the four files exist to prevent.
    const r = run(['--target', 'staging', '--check'], stubSshOnPath(NAMED_ALIAS_LINES));
    const all = output(r);
    expect(all).toMatch(/HOST_OPERATOR\.txt is missing/);
    expect(all).not.toMatch(/AWS_OPERATOR\.txt is missing/);
  });

  it('reports the named account without calling it a mistake', () => {
    // It used to say a named account did not exist yet and that the shared one
    // was the account to use. Both halves are now wrong, and an operator part
    // way through moving onto their own account would read it as an instruction
    // to undo the move.
    const r = run(['--target', 'staging', '--check'], stubSshOnPath(NAMED_ALIAS_LINES));
    const all = output(r);
    expect(all).toMatch(/connects as the named account 'ada_lovelace'/);
    expect(all).not.toMatch(/does not exist yet/);
  });

  it('says which file it needs rather than guessing when the account cannot be read', () => {
    // An ssh that answers nothing is a configuration it could not parse. No
    // account means no rule, and naming a file anyway is how one account's
    // password ends up filed under another's.
    const r = run(['--target', 'staging', '--check'], stubSshOnPath([]));
    const all = output(r);
    expect(all).toMatch(/cannot tell which credential file/);
    expect(all).not.toMatch(/AWS_OPERATOR\.txt is missing/);
  });
});

// The alias's own host-key settings are deliberately not checked, and there is no
// test for them, because there is nothing to check: the pin is carried by the
// scripts, which pass it on their own command line where it outranks any
// configuration file. An operator's alias does not need to carry it, because no
// operator types a command against these hosts. Every connection on this path is
// made by a script, including the login and sudo proof below.
//
// An earlier version of this file asserted that the alias carried the pin, which
// pushed the fix into the operator's own ~/.ssh/config. That was the wrong end of
// the problem: a runbook handing somebody a raw ssh is the defect, and the answer
// is to remove the raw ssh.
describe('the alias itself must be pinned, not only the deploy scripts', () => {
  it('inspects no host-key setting on the alias, and touches no ssh config', () => {
    // The absence is the contract. Nothing here reads UserKnownHostsFile or
    // StrictHostKeyChecking off the alias, and nothing writes to ~/.ssh/config,
    // because the pin travels with the scripts rather than with the operator's
    // configuration.
    const src = readFileSync(SCRIPT, 'utf-8');
    expect(src).not.toMatch(/userknownhostsfile/i);
    expect(src).not.toMatch(/stricthostkeychecking/i);
    // Naming the file in a message is fine; writing to it is not. What this
    // forbids is a redirection into it, which is how the removed code worked.
    expect(src).not.toMatch(/>>?\s*"?\$?\{?[^"\s]*\.ssh\/config/);
  });

  it('proves the login and the sudo password over a pinned connection instead', () => {
    // What replaced it. The files being present is not the same as the
    // credentials working: a wrong password in a well-formed file passes every
    // other check here and is discovered mid-deploy, after it has been piped to
    // the host. This is also what retired the two hand-typed ssh commands the
    // card used to carry.
    const src = readFileSync(SCRIPT, 'utf-8');
    expect(src).toMatch(/require_pinned_known_hosts/);
    expect(src).toMatch(/FOOTBAG_SSH_PIN_OPTS/);
    expect(src).toMatch(/sudo -k -S -p "" true/);
  });

  it('proves it on a connection of its own, not one opened earlier', () => {
    // OpenSSH shares connections when the operator's configuration asks it to,
    // and a shared one carries an authentication that already happened. This
    // step asks whether the key and the password work NOW, so riding a socket
    // opened before a key was withdrawn or a password rotated reports success
    // for the one case it exists to catch. ControlMaster=no is not enough: it
    // declines to become a master and still joins an existing socket.
    const src = readFileSync(SCRIPT, 'utf-8');
    expect(src).toMatch(/-o "ControlPath=none"/);
    // Scoped to the proof rather than bolted onto the shared pin options, so
    // every other connection in the tree keeps the operator's own sharing.
    const pinLib = readFileSync(join(process.cwd(), 'scripts/lib/ssh-known-hosts.sh'), 'utf-8');
    expect(pinLib).not.toMatch(/ControlPath/);
  });

  it('reports rather than aborts when the credential or the pin is missing', () => {
    // A cold machine must still reach a verdict: this step needs two files that
    // earlier steps are still asking for, so it cannot be a hard failure.
    const env = stubSshOnPath(PINNED_ALIAS_LINES);
    const r = run(['--target', 'staging', '--check'], env);
    const all = output(r);
    expect(all).toMatch(/Login and sudo on footbag-staging/);
    expect(all).toMatch(/cannot prove login and sudo yet/);
    expect(all).toMatch(/thing\(s\) still to do/);
  });
});

// A configured profile is not an authenticating one. The key behind it can be
// deactivated, deleted or rotated away and nothing in a list of profile names
// changes, so this step used to report three `[ok]` lines for a credential that
// could not reach AWS at all, and the failure then surfaced further down in
// another step's vocabulary.
describe('the AWS identity is proved, not listed', () => {
  it('names the credential when the profile is configured but its key is dead', () => {
    // The whole regression, in the state it actually arrives in: straight after
    // a key rotation, when every profile is still exactly where it was.
    const env = stubAwsOnPath({
      profiles: ['footbag-operator', 'footbag-staging-runtime', 'footbag-production-runtime'],
      identities: {}, // nothing resolves
    });
    const all = output(run(['--target', 'staging', '--check'], env));

    expect(all).toMatch(/did not authenticate against AWS/);
    expect(all).toMatch(/InvalidClientTokenId/);
    expect(all).toMatch(/install-operator-key\.sh/);
    expect(all).not.toMatch(/footbag-operator profile present/);
  });

  it('does not blame the terraform tree for a credential that cannot authenticate', () => {
    // The sentence that cost an afternoon. With the tree initialised and the key
    // dead, the run told the operator to initialise the tree -- two steps after
    // reporting it initialised. The host-address and pin steps both read an
    // identity, so both must point back at the one real fault.
    const env = stubAwsOnPath({
      profiles: ['footbag-operator', 'footbag-staging-runtime', 'footbag-production-runtime'],
      identities: {},
    });
    const all = output(run(['--target', 'staging', '--check'], env));

    expect(all).not.toMatch(/initialise the tree first/);
    expect(all).toMatch(/cannot read the staging host address without a working AWS identity/);
    expect(all).toMatch(/cannot build or check the pin for staging without a working AWS identity/);
  });

  it('reports the identity and the assumed roles when everything resolves', () => {
    const all = output(run(['--target', 'staging', '--check'], stubAwsOnPath(HEALTHY_AWS)));

    expect(all).toMatch(/that identity authenticates against AWS/);
    expect(all).toMatch(/both chained runtime profiles assume their roles/);
    expect(all).toContain(OPERATOR_ARN);
  });

  it('says a runtime profile is missing rather than that it cannot be assumed', () => {
    // Two different faults with two different owners: the installer writes a
    // missing profile, and nobody on this machine can grant an assume-role.
    // The break-glass profile is present here because that is the tier the
    // TODO is addressed to: only its holder can run the installer that fixes it.
    const env = stubAwsOnPath({
      profiles: ['footbag-operator', 'footbag-operator-key', 'footbag-staging-runtime'],
      identities: {
        'footbag-operator': OPERATOR_ARN,
        'footbag-staging-runtime': STAGING_ROLE_ARN,
      },
    });
    const all = output(run(['--target', 'staging', '--check'], env));

    expect(all).toMatch(/footbag-production-runtime is missing/);
    expect(all).toMatch(/install-operator-sso-profile\.sh/);
    expect(all).not.toMatch(/does not assume its role/);
  });

  it('catches a chained profile that returns its own source identity', () => {
    // The assume-role step never happened, so the role's permissions were never
    // in play. It resolves, so only reading WHAT it resolved to catches it.
    const env = stubAwsOnPath({
      profiles: ['footbag-operator', 'footbag-staging-runtime', 'footbag-production-runtime'],
      identities: {
        'footbag-operator': OPERATOR_ARN,
        'footbag-staging-runtime': STAGING_ROLE_ARN,
        // Resolves to the operator rather than to an assumed role.
        'footbag-production-runtime': OPERATOR_ARN,
      },
    });
    const all = output(run(['--target', 'staging', '--check'], env));

    expect(all).toMatch(/does not assume its role/);
    // The grant is on whichever principal that profile sources from, which is
    // no longer one shared IAM user for everybody: a super admin's chain
    // sources the break-glass key and a federated one would source the
    // sign-in. Naming a single principal here sent the reader to the wrong
    // trust policy.
    expect(all).toMatch(/assume-role permission on whichever principal it sources from/);
  });

  it('does not fail a dev-and-tester for the production chain their role is denied', () => {
    // Production's runtime role trusts the super-admin set and not the other,
    // so for that tier the profile's absence is the boundary working. The
    // staging chain is a finding for everybody, because the SSO installer
    // writes it off their own sign-in and everybody can run that.
    const env = stubAwsOnPath({
      profiles: ['footbag-operator'],
      identities: { 'footbag-operator': STAGING_ROLE_ARN },
    });
    const all = output(run(['--target', 'staging', '--check'], env));

    expect(all).toMatch(/\[note\][^\n]*footbag-production-runtime is not here/);
    expect(all).not.toMatch(/\[TODO\][^\n]*footbag-production-runtime/);
    expect(all).toMatch(/\[TODO\][^\n]*footbag-staging-runtime is missing/);
    expect(all).toMatch(/install-operator-sso-profile\.sh/);
  });

  it('reports an absent break-glass profile without failing the run over it', () => {
    // Correct for a dev-and-tester, who must never hold that key, and a gap for
    // a super admin. Nothing on the machine says which its owner is, so this is
    // reported and not counted: counting it would fail somebody for not holding
    // a credential they are not allowed to have.
    const env = stubAwsOnPath({
      profiles: ['footbag-operator', 'footbag-staging-runtime', 'footbag-production-runtime'],
      identities: {
        'footbag-operator': OPERATOR_ARN,
        'footbag-staging-runtime': STAGING_ROLE_ARN,
        'footbag-production-runtime': PRODUCTION_ROLE_ARN,
      },
    });
    const all = output(run(['--target', 'staging', '--check'], env));
    expect(all).toMatch(/\[note\].*footbag-operator-key/);
    expect(all).not.toMatch(/\[TODO\][^\n]*footbag-operator-key/);
  });
});

describe('setup-operator-workstation.sh — the read-only report', () => {
  it('creates nothing in --check mode, not even the operator folder', () => {
    run(['--target', 'staging', '--check']);
    expect(existsSync(join(fakeHome, 'AWS', 'AWS_OPERATOR.txt'))).toBe(false);
    expect(existsSync(join(fakeHome, 'AWS', 'footbag_known_hosts'))).toBe(false);
  });
});
