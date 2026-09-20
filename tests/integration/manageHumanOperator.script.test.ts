/**
 * scripts/manage-human-operator.sh — the whole life of a named human operator's
 * AWS identity.
 *
 * A shared identity cannot say who did something. The model this script builds
 * gives each person their own IAM user, grants that user nothing except the
 * right to assume one job role, and binds the role session name to the user's
 * own name in the role's trust policy, so the name in the trail is the person's
 * and no workstation config can lie about it.
 *
 * Everything that makes that safe is a refusal or a proof, and both are what is
 * pinned here:
 *
 *   - only the directly authenticated super-admin may run it, because every
 *     role in the account is denied every write to a human operator's identity,
 *     and a run started under one would fail partway through rather than at the
 *     door;
 *   - an IAM user of the same name that this script did not create is never
 *     adopted, because granting somebody else's identity the job role is the
 *     worst thing available here;
 *   - the identity's whole grant is one allow statement naming one role, with
 *     no console sign-in and no managed policy;
 *   - the key never appears on either stream, and a run that fails after
 *     minting one withdraws it;
 *   - a user that pre-dated the run is never deleted by a failure, whatever
 *     else the run undoes;
 *   - a chained profile the operator already has is reported, never rewritten;
 *   - offboarding removes the grant before the keys, ends with nothing active,
 *     and proves the identity can no longer reach the role.
 *
 * The aws CLI is stubbed through the script's own seam and keeps state across
 * calls within a run, so the proofs the script makes at the end are answered by
 * what its own earlier calls actually did rather than by a canned reply.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  statSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/manage-human-operator.sh');

const ACCOUNT = '111122223333';
const OPERATOR = 'test_operator';
const OPERATOR_PATH = '/footbag-operators/';
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/FootbagDevTester`;
const SUPER_ADMIN_ARN = `arn:aws:iam::${ACCOUNT}:user/footbag-operator`;
const ASSUMED_ARN = `arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/${OPERATOR}`;

// AWS's own documented example pair. The id is the one AWS prints in its
// samples and the secret is plainly a filler of the right shape, so the
// credential-shape validators in the library are exercised without putting
// anything that looks like a live key into the tree.
const FAKE_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
const FAKE_SECRET = 'EXAMPLEKEYEXAMPLEKEYEXAMPLEKEYEXAMPLEKEY';
const OLD_KEY_ID = 'AKIAI44QH8DHBEXAMPLE';

let workDir: string;
let stateDir: string;
let configFile: string;
let credFile: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-humanop-'));
  stateDir = join(workDir, 'state');
  mkdirSync(stateDir);
  configFile = join(workDir, 'config');
  credFile = join(workDir, 'credentials');
  // The two list-backed files always exist so the stub can read them without
  // having to distinguish "no keys" from "no account".
  writeFileSync(join(stateDir, 'keys'), '', 'utf-8');
  writeFileSync(join(stateDir, 'tags'), '', 'utf-8');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface Account {
  /** The role the operators assume. Absent unless the identity tree is applied. */
  role?: boolean;
  /** The IAM user's path, or absent for a user that does not exist. */
  userPath?: string;
  /** Ownership tags on that user, as the script writes them. */
  tags?: Record<string, string>;
  /** `<id>\t<status>` rows the user already holds. */
  keys?: Array<[string, string]>;
  /** The inline assume-role policy is already attached. */
  policy?: boolean;
  /** A console login profile exists, which it never should. */
  login?: boolean;
  /** What get-caller-identity returns for the profile the run authenticates on. */
  caller?: string;
  /** What the job-role profile resolves to, or absent for one that does not. */
  assumed?: string | null;
}

const MANAGED_TAGS = {
  Project: 'footbag',
  ManagedBy: 'manage-human-operator.sh',
  OperatorRole: 'dev_tester',
};

function seed(a: Account) {
  if (a.role !== false) writeFileSync(join(stateDir, 'role'), '', 'utf-8');
  if (a.userPath) writeFileSync(join(stateDir, 'user'), `${a.userPath}\n`, 'utf-8');
  if (a.tags) {
    writeFileSync(
      join(stateDir, 'tags'),
      Object.entries(a.tags)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n') + '\n',
      'utf-8',
    );
  }
  if (a.keys) {
    writeFileSync(
      join(stateDir, 'keys'),
      a.keys.map(([id, st]) => `${id}\t${st}\t2026-01-01T00:00:00Z`).join('\n') + '\n',
      'utf-8',
    );
  }
  if (a.policy) writeFileSync(join(stateDir, 'policy'), '', 'utf-8');
  if (a.login) writeFileSync(join(stateDir, 'login'), '', 'utf-8');
  writeFileSync(join(stateDir, 'caller'), `${a.caller ?? SUPER_ADMIN_ARN}\n`, 'utf-8');
  if (a.assumed !== null) {
    writeFileSync(join(stateDir, 'assumed'), `${a.assumed ?? ASSUMED_ARN}\n`, 'utf-8');
  }
}

/**
 * An aws stub that keeps its answers in files, so a call made late in a run is
 * answered by what the run's own earlier calls did. That matters here more than
 * usual: the script's closing steps are proofs, and a stub returning a canned
 * reply to those would let a script that verified nothing pass.
 *
 * It answers per argument rather than per subcommand alone, because the same
 * subcommand is asked three different questions — the key list is read for a
 * count, for id-and-status, and for id-status-and-date — and a stub with one
 * answer for all three would agree with whatever the caller assumed.
 */
function awsStub(): string {
  const path = join(workDir, 'aws-stub.sh');
  const S = stateDir;
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `S=${JSON.stringify(S)}`,
      `echo "$*" >> "$S/calls.log"`,
      'profile=""; prev=""; qkey=""; akid=""; status=""',
      'for a in "$@"; do',
      '  case "$prev" in',
      '    --profile) profile="$a" ;;',
      '    --access-key-id) akid="$a" ;;',
      '    --status) status="$a" ;;',
      '  esac',
      `  case "$a" in *"Key=='"*) qkey="\${a#*Key==\\'}"; qkey="\${qkey%%\\'*}" ;; esac`,
      '  prev="$a"',
      'done',
      'case "$2" in',
      '  get-caller-identity)',
      '    case "$profile" in',
      `      footbag-operator) cat "$S/caller" ;;`,
      `      footbag-devtester)`,
      `        [ -f "$S/assumed" ] || { echo "profile could not be found" >&2; exit 255; }`,
      `        cat "$S/assumed" ;;`,
      `      ${OPERATOR})`,
      `        [ -f "$S/user" ] || { echo "profile could not be found" >&2; exit 255; }`,
      `        printf '%s\\n' "arn:aws:iam::${ACCOUNT}:user/${OPERATOR}" ;;`,
      '      *) echo "profile could not be found" >&2; exit 255 ;;',
      '    esac ;;',
      `  get-role) [ -f "$S/role" ] || { echo NoSuchEntity >&2; exit 254; }; printf '{}\\n' ;;`,
      `  get-user) [ -f "$S/user" ] || { echo NoSuchEntity >&2; exit 254; }; cat "$S/user" ;;`,
      '  create-user)',
      `    printf '%s\\n' "${OPERATOR_PATH}" > "$S/user"`,
      `    printf 'Project=footbag\\nManagedBy=manage-human-operator.sh\\nOperatorRole=dev_tester\\n' > "$S/tags" ;;`,
      `  delete-user) rm -f "$S/user" "$S/tags" ;;`,
      `  list-user-tags) grep "^\${qkey}=" "$S/tags" | cut -d= -f2- ;;`,
      `  get-login-profile) [ -f "$S/login" ] || { echo NoSuchEntity >&2; exit 254; } ;;`,
      `  put-user-policy) : > "$S/policy" ;;`,
      `  get-user-policy) [ -f "$S/policy" ] || { echo NoSuchEntity >&2; exit 254; } ;;`,
      `  delete-user-policy) rm -f "$S/policy" ;;`,
      '  list-access-keys)',
      '    case "$*" in',
      `      *length*) wc -l < "$S/keys" | tr -d ' ' ;;`,
      `      *CreateDate*) cat "$S/keys" ;;`,
      `      *) cut -f1,2 "$S/keys" ;;`,
      '    esac ;;',
      '  create-access-key)',
      `    printf '%s\\tActive\\t2026-01-01T00:00:00Z\\n' "${FAKE_KEY_ID}" >> "$S/keys"`,
      `    printf '%s\\t%s\\n' "${FAKE_KEY_ID}" "${FAKE_SECRET}" ;;`,
      '  update-access-key|delete-access-key)',
      `    : > "$S/keys.tmp"`,
      "    while IFS=$'\\t' read -r i s d; do",
      '      [ -z "$i" ] && continue',
      '      if [ "$i" = "$akid" ]; then',
      '        if [ "$2" = "delete-access-key" ]; then continue; fi',
      `        printf '%s\\t%s\\t%s\\n' "$i" "$status" "$d" >> "$S/keys.tmp"`,
      '      else',
      `        printf '%s\\t%s\\t%s\\n' "$i" "$s" "$d" >> "$S/keys.tmp"`,
      '      fi',
      `    done < "$S/keys"`,
      `    mv "$S/keys.tmp" "$S/keys" ;;`,
      // The simulator answers from the grant that is actually attached, so the
      // offboard proof is a real question rather than a fixed reply.
      `  simulate-principal-policy)`,
      `    if [ -f "$S/simulate" ]; then cat "$S/simulate"`,
      `    elif [ -f "$S/policy" ]; then echo allowed`,
      `    else echo implicitDeny; fi ;;`,
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(args: string[], account: Account = {}) {
  seed(account);
  const res = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      ...awsIdentityStubEnv(workDir, { profile: ['footbag-operator'] }),
      // Settled here rather than left to the shared helper's own default, so
      // the stub is asked about a profile the test named.
      AWS_PROFILE: 'footbag-operator',
      AWS_CONFIG_FILE: configFile,
      AWS_SHARED_CREDENTIALS_FILE: credFile,
      MANAGE_OPERATOR_AWS_BIN: awsStub(),
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** A healthy account with the role applied and the operator not yet onboarded. */
const READY: Account = { role: true };

/** The same account after a previous onboarding that has since been retired. */
const INERT_MANAGED: Account = {
  role: true,
  userPath: OPERATOR_PATH,
  tags: MANAGED_TAGS,
  keys: [[OLD_KEY_ID, 'Inactive']],
};

function calls(): string[] {
  const log = join(stateDir, 'calls.log');
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean);
}

/** Every call that changes something, which is what a refusal must not reach. */
function mutatingCalls(): string[] {
  return calls().filter((c) =>
    /\b(create-user|delete-user|put-user-policy|delete-user-policy|create-access-key|update-access-key|delete-access-key|create-login-profile)\b/.test(
      c,
    ),
  );
}

function keyRows(): string[] {
  return readFileSync(join(stateDir, 'keys'), 'utf-8').trim().split('\n').filter(Boolean);
}

function config(): string {
  return existsSync(configFile) ? readFileSync(configFile, 'utf-8') : '';
}

function credentials(): string {
  return existsSync(credFile) ? readFileSync(credFile, 'utf-8') : '';
}

describe('manage-human-operator.sh — the argument guards', () => {
  it('refuses with no action, because creating and retiring are opposite acts', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/one of --onboard, --offboard or --verify is required/);
    expect(calls()).toHaveLength(0);
  });

  it('refuses an action with no operator name', () => {
    const r = run(['--onboard']);
    expect(r.status).toBe(2);
    expect(calls()).toHaveLength(0);
  });

  it('refuses an unknown flag', () => {
    const r = run(['--onboard', OPERATOR, '--force']);
    expect(r.status).toBe(2);
    expect(calls()).toHaveLength(0);
  });

  it('refuses a name that would not survive as a profile and a session name', () => {
    const r = run(['--onboard', 'a name with spaces', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not a usable operator name/);
    expect(calls()).toHaveLength(0);
  });

  it('refuses the directly authenticated identity as a target, under every flag', () => {
    for (const action of ['--onboard', '--offboard', '--verify']) {
      const r = run([action, 'footbag-operator', '--yes']);
      expect(r.status, `${action} must refuse`).toBe(2);
      expect(r.stderr).toMatch(/not managed here, under any flag/);
    }
    expect(calls()).toHaveLength(0);
  });
});

describe('manage-human-operator.sh — who may run it', () => {
  it('refuses a different directly authenticated user before any mutation', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], {
      ...READY,
      caller: `arn:aws:iam::${ACCOUNT}:user/somebody-else`,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is not user\/footbag-operator/);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses an assumed role, naming why no role can do this', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], {
      ...READY,
      caller: `arn:aws:sts::${ACCOUNT}:assumed-role/SomeOtherRole/session`,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is an assumed role/);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses the job role itself, which is the caller most likely to try', () => {
    // A dev-and-tester working as themselves holds this role all day. It is
    // denied every write to its own definition and to any operator identity,
    // so a run started here gets partway and stops on an access denial having
    // already made some of the changes.
    const r = run(['--onboard', OPERATOR, '--yes'], { ...READY, caller: ASSUMED_ARN });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is an assumed role/);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses when the job role does not exist yet, and names the tree that makes it', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], { role: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/there is no FootbagDevTester role/);
    expect(r.stderr).toMatch(/--target identity/);
    expect(mutatingCalls()).toHaveLength(0);
  });
});

describe('manage-human-operator.sh — onboarding a new operator', () => {
  it('creates the user under the path the role trusts, with the ownership tags', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    const create = calls().find((c) => c.includes('create-user'));
    expect(create).toContain(`--path ${OPERATOR_PATH}`);
    expect(create).toContain('Key=Project,Value=footbag');
    expect(create).toContain('Key=ManagedBy,Value=manage-human-operator.sh');
    expect(create).toContain('Key=OperatorRole,Value=dev_tester');
  });

  it('grants one inline statement naming one role, and attaches nothing else', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    const put = calls().find((c) => c.includes('put-user-policy'));
    expect(put).toContain('--policy-name AssumeFootbagDevTester');
    expect(put).toContain('"Action":"sts:AssumeRole"');
    expect(put).toContain(`"Resource":"${ROLE_ARN}"`);
    expect(calls().some((c) => c.includes('attach-user-policy'))).toBe(false);
    expect(calls().some((c) => c.includes('add-user-to-group'))).toBe(false);
  });

  it('creates no console sign-in, and refuses to continue if one is there', () => {
    expect(calls().some((c) => c.includes('create-login-profile'))).toBe(false);
    const r = run(['--onboard', OPERATOR, '--yes'], { ...READY, login: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/has a console login profile/);
  });

  it('installs a fresh key into a credentials section named for the operator', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(credentials()).toContain(`[${OPERATOR}]`);
    expect(credentials()).toContain(FAKE_KEY_ID);
    expect(statSync(credFile).mode & 0o777).toBe(0o600);
  });

  it('never puts the secret on either stream', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain(FAKE_SECRET);
    expect(r.stderr).not.toContain(FAKE_SECRET);
    // And it did reach the file, so the assertion above is about where it went
    // rather than about a key that was never minted.
    expect(credentials()).toContain(FAKE_SECRET);
  });

  it('leaves the directly authenticated identity’s own profile alone', () => {
    writeFileSync(credFile, '[footbag-operator]\naws_access_key_id = AKIAEXISTINGKEY00000\n', 'utf-8');
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(credentials()).toContain('[footbag-operator]');
    expect(credentials()).toContain('AKIAEXISTINGKEY00000');
  });

  it('writes the job-role profile chaining from the operator’s own', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(config()).toContain('[profile footbag-devtester]');
    // The library pads the keys into a column, so the assertions allow for it.
    expect(config()).toMatch(new RegExp(`role_arn\\s+= ${ROLE_ARN}`));
    expect(config()).toMatch(new RegExp(`source_profile\\s+= ${OPERATOR}`));
  });

  it('pins the role session name in the profile, which the trust policy requires', () => {
    // Without this line the SDK invents a session name, the trust policy's
    // StringEquals condition on the assuming user's name does not match, and
    // EVERY assume-role is refused. The refusal names the role rather than the
    // missing config line, so it reads as a broken credential.
    //
    // Asserted on the config file rather than on the run's own session-name
    // proof, because that proof reads what the stub was told to return. A stub
    // cannot tell you whether the real SDK would have sent this name; only the
    // line being present can.
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    const devtester = config().split('[profile ').find((s) => s.startsWith('footbag-devtester]'));
    expect(devtester, 'the job-role profile was written').toBeTruthy();
    expect(devtester).toMatch(new RegExp(`role_session_name\\s+= ${OPERATOR}`));
  });

  it('writes the staging runtime chain through the job role', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(config()).toContain('[profile footbag-staging-runtime]');
    expect(config()).toMatch(/source_profile\s+= footbag-devtester/);
  });

  it('writes no production runtime chain, and says why', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(config()).not.toContain('footbag-production-runtime');
    expect(r.stdout).toMatch(/does not trust FootbagDevTester/);
  });

  it('proves the session carries the operator’s own name', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/session name: test_operator/);
  });

  it('refuses when the session comes back under somebody else’s name', () => {
    // On a shared role the session name IS the attribution, so a session
    // carrying the wrong name records this person's work as somebody else's.
    // The trust policy is what forces it, and this is the check that the trust
    // policy is actually doing so.
    const r = run(['--onboard', OPERATOR, '--yes'], {
      ...READY,
      assumed: `arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/someone-else`,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not end in FootbagDevTester\/test_operator/);
  });
});

describe('manage-human-operator.sh — onboarding an operator who already exists', () => {
  it('restores a managed inert user without creating it again', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], INERT_MANAGED);
    expect(r.status, r.stderr).toBe(0);
    expect(calls().some((c) => c.includes('create-user'))).toBe(false);
    expect(r.stdout).toMatch(/exists and is managed here/);
  });

  it('mints a new key rather than reactivating the retired one', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], INERT_MANAGED);
    expect(r.status, r.stderr).toBe(0);
    expect(keyRows().join('\n')).toContain(FAKE_KEY_ID);
    expect(keyRows().join('\n')).not.toContain(OLD_KEY_ID);
    // Deleted, never switched back on: an access key id is never reissued and a
    // retired secret is retired.
    expect(calls().some((c) => c.includes(`update-access-key`) && c.includes('Active'))).toBe(
      false,
    );
  });

  it('refuses an unmanaged user of the same name, and changes nothing', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], {
      role: true,
      userPath: '/',
      tags: { Project: 'something-else' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/already exists and is not one/);
    expect(r.stderr).toMatch(/hand somebody else's identity/);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses a user carrying only some of the ownership tags', () => {
    // Any one tag could be a coincidence; the set is what only this script
    // writes, so partial ownership is not ownership.
    const r = run(['--onboard', OPERATOR, '--yes'], {
      role: true,
      userPath: OPERATOR_PATH,
      tags: { Project: 'footbag' },
    });
    expect(r.status).toBe(1);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('leaves a chained profile the operator already has, and says what it sources', () => {
    writeFileSync(
      configFile,
      '[profile footbag-staging-runtime]\nrole_arn = arn:aws:iam::111122223333:role/footbag-staging-app-runtime\nsource_profile = footbag-operator\n',
      'utf-8',
    );
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(config()).toContain('source_profile = footbag-operator');
    expect(config()).not.toMatch(/\[profile footbag-staging-runtime\][\s\S]*?source_profile\s+= footbag-devtester/);
    expect(r.stdout).toMatch(/footbag-staging-runtime: already present, left untouched/);
    expect(r.stdout).toMatch(/it chains from \[profile footbag-operator\]/);
  });
});

describe('manage-human-operator.sh — what a failed run undoes', () => {
  it('deletes the user it created when a later step fails', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], {
      ...READY,
      assumed: `arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/someone-else`,
    });
    expect(r.status).toBe(1);
    expect(calls().some((c) => c.includes('delete-user '))).toBe(true);
    expect(existsSync(join(stateDir, 'user'))).toBe(false);
  });

  it('never deletes a user that pre-dated the run', () => {
    // The most damaging mistake available here. A person whose key install
    // failed still has an identity, and the run that failed is not entitled to
    // take it away.
    const r = run(['--onboard', OPERATOR, '--yes'], {
      ...INERT_MANAGED,
      assumed: `arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/someone-else`,
    });
    expect(r.status).toBe(1);
    expect(calls().some((c) => c.includes('delete-user '))).toBe(false);
    expect(existsSync(join(stateDir, 'user'))).toBe(true);
    expect(r.stderr).toMatch(/pre-dated this run and is NOT being deleted/);
  });

  it('withdraws the key it minted rather than leaving it live', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], {
      ...READY,
      assumed: `arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/someone-else`,
    });
    expect(r.status).toBe(1);
    expect(keyRows()).toHaveLength(0);
  });

  it('removes the grant it attached', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], {
      ...READY,
      assumed: `arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/someone-else`,
    });
    expect(r.status).toBe(1);
    expect(existsSync(join(stateDir, 'policy'))).toBe(false);
  });

  it('leaves nothing behind on a successful run', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).not.toMatch(/being deleted/);
    expect(r.stderr).not.toMatch(/NOT being deleted/);
    expect(existsSync(join(stateDir, 'user'))).toBe(true);
    expect(existsSync(join(stateDir, 'policy'))).toBe(true);
    expect(keyRows()).toHaveLength(1);
  });
});

describe('manage-human-operator.sh — offboarding', () => {
  const ACTIVE: Account = {
    role: true,
    userPath: OPERATOR_PATH,
    tags: MANAGED_TAGS,
    keys: [[FAKE_KEY_ID, 'Active']],
    policy: true,
  };

  it('removes the grant before it touches a key', () => {
    // A key that outlives the policy by a moment can reach nothing. A policy
    // that outlives the keys is a live grant waiting for the next credential
    // anybody issues.
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    const order = calls();
    const policyAt = order.findIndex((c) => c.includes('delete-user-policy'));
    const keyAt = order.findIndex((c) => c.includes('update-access-key'));
    expect(policyAt).toBeGreaterThanOrEqual(0);
    expect(keyAt).toBeGreaterThanOrEqual(0);
    expect(keyAt).toBeGreaterThan(policyAt);
  });

  it('deactivates before deleting, so the irreversible step is second', () => {
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    const order = calls();
    const deactivateAt = order.findIndex((c) => c.includes('update-access-key'));
    const deleteAt = order.findIndex((c) => c.includes('delete-access-key'));
    // Both indices are pinned as present first. A comparison alone is satisfied
    // by a deactivate that never happened, which is the failure this is for.
    expect(deactivateAt).toBeGreaterThanOrEqual(0);
    expect(deleteAt).toBeGreaterThan(deactivateAt);
    expect(keyRows()).toHaveLength(0);
  });

  it('leaves the IAM user itself in place for the trail', () => {
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    expect(calls().some((c) => c.includes('delete-user '))).toBe(false);
    expect(existsSync(join(stateDir, 'user'))).toBe(true);
  });

  it('refuses if the identity would still be allowed to assume the role', () => {
    // Something other than this script's own grant would have to be doing it —
    // a group, a managed policy, a permissions boundary — and calling the
    // identity retired while that stands is the failure worth catching.
    writeFileSync(join(stateDir, 'simulate'), 'allowed\n', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/would still be allowed to assume/);
  });

  it('states that a session already in flight is not revoked', () => {
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/stays valid until/);
  });

  it('refuses a user this script does not manage', () => {
    const r = run(['--offboard', OPERATOR, '--yes'], {
      role: true,
      userPath: '/',
      keys: [[FAKE_KEY_ID, 'Active']],
    });
    expect(r.status).toBe(1);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses a user that does not exist, and says that is the reason', () => {
    // The reason is asserted, not just the refusal. An absent user also trips
    // the ownership check below it, so a test that only pinned the exit code
    // would pass with this guard gone and report the wrong thing to whoever
    // mistyped a name.
    const r = run(['--offboard', OPERATOR, '--yes'], READY);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/there is no IAM user named/);
    expect(mutatingCalls()).toHaveLength(0);
  });
});

describe('manage-human-operator.sh — verify', () => {
  it('changes nothing at all', () => {
    const r = run(['--verify', OPERATOR], {
      role: true,
      userPath: OPERATOR_PATH,
      tags: MANAGED_TAGS,
      keys: [[FAKE_KEY_ID, 'Active']],
      policy: true,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(mutatingCalls()).toHaveLength(0);
    expect(config()).toBe('');
    expect(credentials()).toBe('');
  });

  it('reports an absent operator without failing', () => {
    const r = run(['--verify', OPERATOR], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/user:\s+absent/);
  });

  it('reports key age as information and does not fail on an old key', () => {
    // Keys here are replaced for a reason and never on a calendar, so an age
    // threshold would fail a run over a credential nothing is wrong with, and
    // teach the operator to stop reading the output.
    const r = run(['--verify', OPERATOR], {
      role: true,
      userPath: OPERATOR_PATH,
      tags: MANAGED_TAGS,
      keys: [[FAKE_KEY_ID, 'Active']],
      policy: true,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/key:\s+AKIAIOSFODNN7EXAMPLE Active, \d+ days old/);
    expect(r.stdout).toMatch(/active:\s+1 key/);
  });

  it('names a wrong path as the reason the role would refuse the user', () => {
    const r = run(['--verify', OPERATOR], { role: true, userPath: '/', tags: MANAGED_TAGS });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/NOT \/footbag-operators\//);
  });

  it('says plainly when the run is against a stub', () => {
    const r = run(['--verify', OPERATOR], READY);
    expect(r.stderr).toMatch(/SYNTHETIC/);
  });
});
