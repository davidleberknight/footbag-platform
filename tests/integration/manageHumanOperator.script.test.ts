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
 *   - only the directly authenticated IAM user footbag-operator may run it, because every
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
  /** What the role-assuming section resolves to, or absent for one that does not. */
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
      // A freshly minted key is refused for a while after it is made. The
      // count in "lag" is how many more calls on the new key are refused.
      `    if [ "$profile" != footbag-operator ] && [ -s "$S/lag" ] && [ "$(cat "$S/lag")" -gt 0 ]; then`,
      `      echo $(( $(cat "$S/lag") - 1 )) > "$S/lag"`,
      '      echo "An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation: The security token included in the request is invalid." >&2',
      '      exit 254',
      '    fi',
      '    case "$profile" in',
      `      footbag-operator) cat "$S/caller" ;;`,
      `      FootbagDevTester)`,
      `        [ -f "$S/assumed" ] || { echo "profile could not be found" >&2; exit 255; }`,
      `        cat "$S/assumed" ;;`,
      `      ${OPERATOR})`,
      `        [ -f "$S/user" ] || { echo "profile could not be found" >&2; exit 255; }`,
      `        printf '%s\\n' "arn:aws:iam::${ACCOUNT}:user${OPERATOR_PATH}${OPERATOR}" ;;`,
      '      *) echo "profile could not be found" >&2; exit 255 ;;',
      '    esac ;;',
      // A fresh assume with the source key, never a cached session. It succeeds
      // while the role is reachable ("assumed"), and for as many further calls
      // as "revoke-lag" holds, which is how long IAM goes on honouring a key
      // after it is deleted.
      '  assume-role)',
      `    if [ -s "$S/revoke-lag" ] && [ "$(cat "$S/revoke-lag")" -gt 0 ]; then`,
      `      echo $(( $(cat "$S/revoke-lag") - 1 )) > "$S/revoke-lag"`,
      `      printf '%s\\n' "arn:aws:sts::${ACCOUNT}:assumed-role/FootbagDevTester/${OPERATOR}"; exit 0`,
      '    fi',
      `    [ -f "$S/assumed" ] || { echo "An error occurred (InvalidClientTokenId) when calling the AssumeRole operation: The security token included in the request is invalid." >&2; exit 254; }`,
      `    cat "$S/assumed" ;;`,
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

function run(
  args: string[],
  account: Account = {},
  opts: { valuesDir?: string; env?: NodeJS.ProcessEnv } = {},
) {
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
      // The allow-list report reads the values tree. Pointed at one the test
      // owns, so the assertion does not depend on whether this machine has a
      // private checkout wired: without the override the default resolves to
      // whatever the developer happens to have.
      ...(opts.valuesDir ? { MANAGE_OPERATOR_VALUES_DIR: opts.valuesDir } : {}),
      ...(opts.env ?? {}),
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

  it('settles onto footbag-operator rather than refusing a job-role shell', () => {
    // There is exactly one identity this can ever act as, so inheriting the
    // wrong one from the work before it was never a decision to respect. It
    // used to stop at the door and cost a re-run in a fresh shell: a refusal
    // that was correct and that nobody should have had to meet.
    const bothDir = join(workDir, 'both');
    mkdirSync(bothDir, { recursive: true });
    const r = run(['--verify', OPERATOR], INERT_MANAGED, {
      env: {
        AWS_PROFILE: 'FootbagDevTester',
        ...awsIdentityStubEnv(bothDir, {
          profile: ['footbag-operator', 'FootbagDevTester'],
        }),
      },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/profile 'footbag-operator', required by this script/);
    expect(r.stderr).not.toMatch(/is an assumed role/);
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

describe('manage-human-operator.sh — a replaced input says so', () => {
  it('announces a staging runtime role taken from the environment', () => {
    // The chain onboarding writes ends at this role, so a value replaced from
    // the environment changes what an operator's workstation is set up to
    // reach. A stubbed or redirected run must never look like a real one.
    const r = run(['--verify', OPERATOR], READY, {
      env: { MANAGE_OPERATOR_STAGING_ROLE_ARN: 'arn:aws:iam::111122223333:role/elsewhere' },
    });
    expect(r.stderr).toMatch(/staging runtime role .*role\/elsewhere.* comes from the environment/);
  });

  it('says nothing when the staging runtime role is the default', () => {
    const r = run(['--verify', OPERATOR], READY);
    expect(r.stderr).not.toMatch(/staging runtime role .* comes from the environment/);
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

  it('writes the role-assuming section chaining from the operator’s own key', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(config()).toContain('[profile FootbagDevTester]');
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
    const devtester = config().split('[profile ').find((s) => s.startsWith('FootbagDevTester]'));
    expect(devtester, 'the role-assuming section was written').toBeTruthy();
    expect(devtester).toMatch(new RegExp(`role_session_name\\s+= ${OPERATOR}`));
  });

  it('writes the staging runtime chain through the job role', () => {
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status, r.stderr).toBe(0);
    expect(config()).toContain('[profile footbag-staging-runtime]');
    expect(config()).toMatch(/source_profile\s+= FootbagDevTester/);
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

  it('waits for a freshly minted key to take effect rather than rolling back', () => {
    // AWS refuses a new access key for some seconds after minting it. Proving
    // the chain at once read that as a broken identity and deleted everything.
    writeFileSync(join(stateDir, 'lag'), '3\n', 'utf-8');
    const r = run(['--onboard', OPERATOR, '--yes'], READY, {
      env: { MANAGE_OPERATOR_PROPAGATION_POLL: '0' },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/waiting for the new key to take effect/);
    expect(r.stdout).toMatch(/session name: test_operator/);
  });

  it('still fails and rolls back when the new key never takes effect', () => {
    writeFileSync(join(stateDir, 'lag'), '1000\n', 'utf-8');
    const r = run(['--onboard', OPERATOR, '--yes'], READY, {
      env: { MANAGE_OPERATOR_PROPAGATION_POLL: '0' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not resolve an identity/);
    expect(r.stdout + r.stderr).toMatch(/Deleted\. Nothing was left behind\./);
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

  it('reissues the key of an operator whose key is still active, retiring the old one', () => {
    // A named operator's key is never rotated: a lost one is reissued by
    // onboarding them again. The old key is still Active in that case, because
    // losing a key does not deactivate it, so the re-onboard retires it rather
    // than refusing for want of a free key slot.
    const r = run(['--onboard', OPERATOR, '--yes'], {
      role: true,
      userPath: OPERATOR_PATH,
      tags: MANAGED_TAGS,
      policy: true,
      keys: [[OLD_KEY_ID, 'Active']],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`Retiring the key being replaced: ${OLD_KEY_ID}`);
    expect(keyRows().join('\n')).toContain(FAKE_KEY_ID);
    expect(keyRows().join('\n')).not.toContain(OLD_KEY_ID);
    // Matched as a whole flag value: "Inactive" contains "Active", and the
    // deactivation that retiring the old key performs must not read as a
    // reactivation.
    expect(calls().some((c) => c.includes('update-access-key') && /--status Active\b/.test(c))).toBe(
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

  it('refuses before creating anything when this machine\'s role profile belongs to somebody else', () => {
    // The role profile is written once per workstation, sourcing the operator
    // it was written for. Onboarding a second person here would leave that
    // profile as it is, the session-name proof would then name the first
    // person, and the run would create the user, grant it, mint a key and
    // unwind all of it. Refusing at the door says why instead.
    writeFileSync(
      configFile,
      '[profile FootbagDevTester]\nrole_arn = arn:aws:iam::111122223333:role/FootbagDevTester\nsource_profile = someone_else\nrole_session_name = someone_else\n',
      'utf-8',
    );
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/\[profile FootbagDevTester\] on this machine already sources\s+\[someone_else\]/);
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
    expect(config()).not.toMatch(/\[profile footbag-staging-runtime\][\s\S]*?source_profile\s+= FootbagDevTester/);
    expect(r.stdout).toMatch(
      /\[profile footbag-staging-runtime\]: already present, left untouched/,
    );
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

  it('names the host-side step it cannot take, and prints the addresses on the list', () => {
    // Retiring the identity does nothing about the departed operator's address
    // on the SSH allow-list. Terraform owns that firewall and its values live
    // in the private operations checkout, so the script cannot prune it — but
    // an offboarding that never mentions it leaves a standing hole for an
    // address nobody uses, and because nothing breaks, nobody notices.
    const values = mkdtempSync(join(tmpdir(), 'footbag-test-operatorvalues-'));
    try {
      mkdirSync(join(values, 'staging'), { recursive: true });
      mkdirSync(join(values, 'production'), { recursive: true });
      writeFileSync(
        join(values, 'staging', 'terraform.tfvars'),
        'operator_cidrs = [\n  "203.0.113.4/32", # departing operator\n  "198.51.100.9/32",\n]\n',
        'utf-8',
      );
      writeFileSync(
        join(values, 'production', 'terraform.tfvars'),
        'operator_cidrs = [\n  "203.0.113.4/32",\n]\n',
        'utf-8',
      );
      const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE, { valuesDir: values });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/Still owed/);
      // The access path this script does NOT end is the one that reaches a
      // shell. An operator who ran only this and saw it succeed would have a
      // departed colleague still holding a host account, their key on it, and
      // their address through the firewall. Naming the one command that ends
      // all of it, at the moment the gap opens, is the whole point of this
      // block, so the command is asserted rather than the heading.
      expect(r.stdout).toMatch(/bash scripts\/offboard-operator\.sh --target <env> --account test_operator/);
      expect(r.stdout).toMatch(/for each environment/);
      // The owed firewall act names the command that performs it rather than a
      // values file to edit by hand, and it says that the list printed below it
      // comes from that file rather than from the firewall, because those two
      // disagree for exactly as long as an apply is pending.
      expect(r.stdout).toMatch(/authorize-operator-address\.sh/);
      expect(r.stdout).toMatch(/--remove/);
      expect(r.stdout).toMatch(/read from the values file/);
      expect(r.stdout).toMatch(/staging: 203\.0\.113\.4\/32 198\.51\.100\.9\/32/);
      expect(r.stdout).toMatch(/production: 203\.0\.113\.4\/32/);
    } finally {
      rmSync(values, { recursive: true, force: true });
    }
  });

  it('does not repeat the host step when the one-command offboard is driving it', () => {
    // The parent has just retired the host account and prints what a
    // departure still owes, so a host step printed here would tell the
    // operator to do again what has just been done.
    const values = mkdtempSync(join(tmpdir(), 'footbag-test-operatorvalues-'));
    try {
      mkdirSync(join(values, 'staging'), { recursive: true });
      mkdirSync(join(values, 'production'), { recursive: true });
      writeFileSync(join(values, 'staging', 'terraform.tfvars'), 'operator_cidrs = [\n  "203.0.113.4/32",\n]\n', 'utf-8');
      writeFileSync(join(values, 'production', 'terraform.tfvars'), 'operator_cidrs = ["203.0.113.4/32"]\n', 'utf-8');
      const r = run(['--offboard', OPERATOR, '--yes', '--driven-by-offboard'], ACTIVE, {
        valuesDir: values,
      });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).not.toMatch(/Still owed/);
      expect(r.stdout).not.toMatch(/offboard-operator\.sh/);
      expect(r.stdout).toMatch(/staging: 203\.0\.113\.4\/32/);
    } finally {
      rmSync(values, { recursive: true, force: true });
    }
  });

  it('refuses to call the identity retired while a console sign-in survives', () => {
    // Onboarding already asserts there is no login profile at creation, and
    // offboarding did not. Nothing in this script makes one, so one here
    // arrived by another route, and it is a console sign-in with no second
    // factor that neither the grant removal nor the key retirement touches.
    // Without this the run reports a retired identity that can still sign in.
    const r = run(['--offboard', OPERATOR, '--yes'], { ...ACTIVE, login: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/still has a console login profile/);
    expect(r.stderr).toMatch(/survives both/);
  });

  it('reads the single-line form, which is the shape production actually uses', () => {
    // The two values files are written differently, and only one of them was
    // ever fixtured here. Production declares the list on one line, so its
    // closing bracket is mid-line; the range this used to use ended on a line
    // that was nothing but a bracket, never matched, and printed to the end of
    // the file. On the real file that still yielded the right answer, because
    // nothing else quoted in it happens to look like an address -- so the bug
    // was invisible and one unrelated quoted literal away from reporting a
    // stranger's address as an operator's.
    const values = mkdtempSync(join(tmpdir(), 'footbag-test-operatorvalues-'));
    try {
      mkdirSync(join(values, 'staging'), { recursive: true });
      mkdirSync(join(values, 'production'), { recursive: true });
      writeFileSync(
        join(values, 'staging', 'terraform.tfvars'),
        'operator_cidrs = ["203.0.113.4/32"]\n',
        'utf-8',
      );
      // Everything after the list is what the old range swallowed. None of it
      // is an allow-list entry and all of it is quoted.
      writeFileSync(
        join(values, 'production', 'terraform.tfvars'),
        'operator_cidrs = ["203.0.113.4/32"]\n' +
          'lightsail_origin_dns = "198.51.100.77.nip.io"\n' +
          'alarm_topic_name     = "192.0.2.1"\n',
        'utf-8',
      );
      const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE, { valuesDir: values });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/staging: 203\.0\.113\.4\/32\s*$/m);
      expect(r.stdout).toMatch(/production: 203\.0\.113\.4\/32\s*$/m);
      expect(r.stdout).not.toMatch(/198\.51\.100\.77/);
      expect(r.stdout).not.toMatch(/192\.0\.2\.1/);
    } finally {
      rmSync(values, { recursive: true, force: true });
    }
  });

  it('does not report a commented-out entry as a live one', () => {
    // A retired address is often left in place as a comment rather than
    // deleted, which is how the reason it was removed survives. Reporting it as
    // live sends an operator to prune something that is already gone, and the
    // next person to read the list trusts it less.
    const values = mkdtempSync(join(tmpdir(), 'footbag-test-operatorvalues-'));
    try {
      mkdirSync(join(values, 'staging'), { recursive: true });
      mkdirSync(join(values, 'production'), { recursive: true });
      const body =
        'operator_cidrs = [\n' +
        '  "203.0.113.4/32", # current\n' +
        '  # "198.51.100.9/32", withdrawn 2026-08-01, kept for the reason\n' +
        ']\n';
      writeFileSync(join(values, 'staging', 'terraform.tfvars'), body, 'utf-8');
      writeFileSync(join(values, 'production', 'terraform.tfvars'), body, 'utf-8');
      const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE, { valuesDir: values });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/staging: 203\.0\.113\.4\/32\s*$/m);
      expect(r.stdout).not.toMatch(/198\.51\.100\.9/);
    } finally {
      rmSync(values, { recursive: true, force: true });
    }
  });

  it('reports an IPv6 range rather than dropping it', () => {
    // The old extraction matched a quoted run of digits, dots and slashes, so no
    // IPv6 literal could match it at all. An operator on a v6 address was
    // reported as absent from a list that carried them, which reads as "nothing
    // to prune" on exactly the day that matters.
    const values = mkdtempSync(join(tmpdir(), 'footbag-test-operatorvalues-'));
    try {
      mkdirSync(join(values, 'staging'), { recursive: true });
      mkdirSync(join(values, 'production'), { recursive: true });
      const body = 'operator_cidrs = [\n  "2001:db8:abcd::/48",\n  "203.0.113.4/32",\n]\n';
      writeFileSync(join(values, 'staging', 'terraform.tfvars'), body, 'utf-8');
      writeFileSync(join(values, 'production', 'terraform.tfvars'), body, 'utf-8');
      const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE, { valuesDir: values });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/2001:db8:abcd::\/48/);
      expect(r.stdout).toMatch(/203\.0\.113\.4\/32/);
    } finally {
      rmSync(values, { recursive: true, force: true });
    }
  });

  it('completes rather than aborting when the allow-list is empty', () => {
    // An empty list is a real answer and must not end the run. This sits after
    // the grant and every key have already gone, so a non-zero exit here reports
    // a completed revocation as a failure, and the turnover runbook then tells
    // the operator not to record it as done.
    const values = mkdtempSync(join(tmpdir(), 'footbag-test-operatorvalues-'));
    try {
      mkdirSync(join(values, 'staging'), { recursive: true });
      mkdirSync(join(values, 'production'), { recursive: true });
      writeFileSync(join(values, 'staging', 'terraform.tfvars'), 'operator_cidrs = [\n]\n', 'utf-8');
      writeFileSync(join(values, 'production', 'terraform.tfvars'), 'operator_cidrs = [\n]\n', 'utf-8');
      const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE, { valuesDir: values });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/staging: no operator_cidrs found in the values file/);
    } finally {
      rmSync(values, { recursive: true, force: true });
    }
  });

  it('says the current allow-list is unknown when it cannot read the values', () => {
    // A values file that cannot be read must say so. Printing nothing would
    // read as an empty allow-list, which is the opposite of the truth. This is
    // the ordinary case on a workstation with no private checkout wired, where
    // the values symlink dangles.
    const empty = mkdtempSync(join(tmpdir(), 'footbag-test-operatorvalues-'));
    try {
      const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE, { valuesDir: empty });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/staging: values file unreadable from here/);
      expect(r.stdout).toMatch(/the current list is unknown/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
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
    // A finding rather than a line to read past: the trust policy matches on
    // the path, so a user outside it cannot assume the role whatever its own
    // grants say, and a read-back that reports that and exits 0 is a report
    // nobody acts on.
    const r = run(['--verify', OPERATOR], { role: true, userPath: '/', tags: MANAGED_TAGS });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/NOT \/footbag-operators\//);
    expect(r.stderr).toMatch(/1 finding\(s\)/);
  });

  it('reports a retired identity without calling it a finding', () => {
    // No policy and no active key is the correct state after an offboard, so a
    // verify of a properly retired person passes. Counting it would fail the
    // run for the outcome the offboard is supposed to produce.
    const r = run(['--verify', OPERATOR], INERT_MANAGED);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/absent, so this identity reaches nothing/);
  });

  it('refuses a name that collides with a section it writes, by shape alone', () => {
    // These were once refused twice: by the shape check, and by a list of
    // reserved names below it that could never be reached, because every one
    // of them carries a capital letter or a hyphen and the shape admits
    // neither. The list is gone; the refusal is not.
    for (const reserved of ['FootbagDevTester', 'footbag-staging-runtime', 'footbag-production-runtime']) {
      const r = run(['--onboard', reserved, '--yes'], READY);
      expect(r.status, `${reserved} must be refused`).toBe(2);
      expect(mutatingCalls()).toEqual([]);
    }
  });

  it('says plainly when the run is against a stub', () => {
    const r = run(['--verify', OPERATOR], READY);
    expect(r.stderr).toMatch(/SYNTHETIC/);
  });
});

/**
 * The workstation side of the two proofs that used to be hand-typed after the
 * run: attempting the refused assume for real, and comparing the key a
 * re-onboard mints against the one it replaced. Both were steps an operator
 * performed at the end of a long sitting, which is when a step gets skipped,
 * and the second produced "they look different" rather than an assertion.
 */
describe('manage-human-operator.sh — the proofs the run makes for itself', () => {
  /** A profile list naming more than the one the shared helper offers. */
  function profileListStub(names: string[]): string {
    const path = join(workDir, 'profile-list-stub.sh');
    writeFileSync(
      path,
      [
        '#!/usr/bin/env bash',
        'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then',
        `  printf '%s\\n' ${names.map((n) => JSON.stringify(n)).join(' ')}`,
        '  exit 0',
        'fi',
        'exit 64',
      ].join('\n'),
      'utf-8',
    );
    chmodSync(path, 0o755);
    return path;
  }

  /** The two sections an onboarded operator's workstation carries. */
  function seedWorkstation(sourceProfile: string, keyId?: string) {
    writeFileSync(
      configFile,
      [
        `[profile FootbagDevTester]`,
        `role_arn = ${ROLE_ARN}`,
        `source_profile = ${sourceProfile}`,
        `role_session_name = ${sourceProfile}`,
        '',
      ].join('\n'),
      'utf-8',
    );
    if (keyId) {
      writeFileSync(
        credFile,
        [`[${OPERATOR}]`, `aws_access_key_id = ${keyId}`, `aws_secret_access_key = ${FAKE_SECRET}`, ''].join(
          '\n',
        ),
        'utf-8',
      );
    }
  }

  const withChain = () => ({
    env: { AWS_PROFILE_BIN: profileListStub(['footbag-operator', 'FootbagDevTester']) },
  });

  const RETIRING: Account = {
    role: true,
    userPath: OPERATOR_PATH,
    tags: MANAGED_TAGS,
    keys: [[FAKE_KEY_ID, 'Active']],
    policy: true,
  };

  it('attempts the refused assume for real and reports what it said', () => {
    seedWorkstation(OPERATOR, FAKE_KEY_ID);
    const r = run(['--offboard', OPERATOR, '--yes'], { ...RETIRING, assumed: null }, withChain());
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('a real role session: refused');
    // The verbatim failure is the evidence the go-live gate asks for, so it is
    // reproduced rather than summarised.
    expect(r.stdout).toMatch(/InvalidClientTokenId/);
  });

  it('asks with the retired key itself, never a cached role session', () => {
    // The CLI caches role sessions on disk, and a cached one stays valid until
    // it expires whatever happens to the key. Asking through the role profile
    // answered with that session and failed a retirement that had worked.
    seedWorkstation(OPERATOR, FAKE_KEY_ID);
    run(['--offboard', OPERATOR, '--yes'], { ...RETIRING, assumed: null }, withChain());
    const calls = readFileSync(join(stateDir, 'calls.log'), 'utf-8');
    expect(calls).toMatch(new RegExp(`sts assume-role --profile ${OPERATOR} --role-arn ${ROLE_ARN}`));
    expect(calls).not.toMatch(/get-caller-identity --profile FootbagDevTester/);
  });

  it('waits for a deleted key to stop working rather than failing the retirement', () => {
    // IAM goes on honouring a deleted key for some seconds.
    seedWorkstation(OPERATOR, FAKE_KEY_ID);
    writeFileSync(join(stateDir, 'revoke-lag'), '3\n', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], { ...RETIRING, assumed: null }, {
      env: { ...withChain().env, MANAGE_OPERATOR_PROPAGATION_POLL: '0' },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/waiting for the retired key to stop working/);
    expect(r.stdout).toContain('a real role session: refused');
  });

  it('keeps the simulator proof alongside it, since they answer different questions', () => {
    seedWorkstation(OPERATOR, FAKE_KEY_ID);
    const r = run(['--offboard', OPERATOR, '--yes'], { ...RETIRING, assumed: null }, withChain());
    expect(r.stdout).toContain('a new role session: refused by the policy simulator');
  });

  it('fails the offboard when the retired credentials still reach the role', () => {
    // The case the simulator cannot see: policy evaluation says no while a
    // credential that survived the retirement still authenticates.
    seedWorkstation(OPERATOR, FAKE_KEY_ID);
    const r = run(['--offboard', OPERATOR, '--yes'], RETIRING, {
      env: { ...withChain().env, MANAGE_OPERATOR_PROPAGATION_POLL: '0' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/still reached FootbagDevTester/);
    expect(r.stderr).toMatch(/is NOT retired/);
  });

  it('does not attempt it against a chain belonging to somebody else', () => {
    // A profile of that name sourcing another person's credentials would answer
    // a question about them, and either answer would be misread as this one.
    seedWorkstation('somebody_else', FAKE_KEY_ID);
    const r = run(['--offboard', OPERATOR, '--yes'], { ...RETIRING, assumed: null }, withChain());
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/chains from \[somebody_else\]/);
    expect(r.stdout).not.toContain('a real role session: refused');
  });

  it('treats a chain named for the operator as evidence only when it signs with their key', () => {
    // The section is called after them but signs with a key IAM never held for
    // them, so its refusal says nothing about the retirement.
    seedWorkstation(OPERATOR, OLD_KEY_ID);
    const r = run(['--offboard', OPERATOR, '--yes'], { ...RETIRING, assumed: null }, withChain());
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('a real role session: refused');
    expect(r.stdout).toMatch(/signing with \S+, which is not one of\s+the keys IAM held/);
  });

  it('proves a chain that signs with their retired key, whatever its source is called', () => {
    // Identity is the key, not the section name: a chain sourcing a section
    // called something else but signing with their retired key is exactly the
    // credential whose survival this proof exists to catch.
    writeFileSync(
      configFile,
      [
        '[profile FootbagDevTester]',
        `role_arn = ${ROLE_ARN}`,
        'source_profile = laptop_key',
        `role_session_name = ${OPERATOR}`,
        '',
      ].join('\n'),
      'utf-8',
    );
    writeFileSync(
      credFile,
      ['[laptop_key]', `aws_access_key_id = ${FAKE_KEY_ID}`, `aws_secret_access_key = ${FAKE_SECRET}`, ''].join(
        '\n',
      ),
      'utf-8',
    );
    const r = run(['--offboard', OPERATOR, '--yes'], RETIRING, {
      env: { ...withChain().env, MANAGE_OPERATOR_PROPAGATION_POLL: '0' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/still reached FootbagDevTester/);
    expect(readFileSync(join(stateDir, 'calls.log'), 'utf-8')).toMatch(/sts assume-role --profile laptop_key/);
  });

  it('says why it could not attempt it on a workstation without the chain', () => {
    const r = run(['--offboard', OPERATOR, '--yes'], { ...RETIRING, assumed: null });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/no \[profile FootbagDevTester\] chaining from anything/);
  });

  it('shows both key ids on a re-onboard and asserts they differ', () => {
    seedWorkstation(OPERATOR, OLD_KEY_ID);
    const r = run(['--onboard', OPERATOR, '--yes'], INERT_MANAGED, withChain());
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`minted a different key: ${OLD_KEY_ID} then ${FAKE_KEY_ID}`);
  });

  it('refuses a re-onboard that hands back the key the workstation already held', () => {
    // A deleted access key id is never reissued, so the two matching means a
    // retired credential was revived rather than replaced, and the departure it
    // was retired for ended nothing.
    seedWorkstation(OPERATOR, FAKE_KEY_ID);
    const r = run(['--onboard', OPERATOR, '--yes'], INERT_MANAGED, withChain());
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is the one this workstation/);
    // It stops before the credentials file is rewritten, so the machine is left
    // holding what it held.
    expect(credentials()).toContain(FAKE_KEY_ID);
  });

  it('withdraws the key it minted when that comparison fails', () => {
    seedWorkstation(OPERATOR, FAKE_KEY_ID);
    run(['--onboard', OPERATOR, '--yes'], INERT_MANAGED, withChain());
    expect(calls().some((c) => /delete-access-key/.test(c))).toBe(true);
  });
});
