/**
 * scripts/manage-human-operator.sh — retiring a dev-and-tester's AWS identity,
 * and reading it back.
 *
 * A shared identity cannot say who did something. The model gives each person
 * their own IAM user, grants that user nothing except the right to assume one
 * job role, and binds the role session name to the user's own name in the
 * role's trust policy, so the name in the trail is the person's and no
 * workstation config can lie about it. The identity is created by the
 * onboarding script, which seals the key to its owner; this one retires it and
 * reads it back.
 *
 * Everything that makes that safe is a refusal or a proof, and both are what is
 * pinned here:
 *
 *   - only the directly authenticated IAM user footbag-operator may run it, because every
 *     role in the account is denied every write to a human operator's identity,
 *     and a run started under one would fail partway through rather than at the
 *     door;
 *   - there is no onboarding here at all, so a request for one is refused as an
 *     unknown argument and a run with no action names the script that creates
 *     an identity;
 *   - an IAM user of the same name that this script's family did not create is
 *     never retired;
 *   - an answer IAM could not give is never read as an absent grant, key or
 *     sign-in;
 *   - offboarding removes the grant before the keys, ends with nothing active,
 *     proves the identity can no longer reach the role, and ends the sessions
 *     already issued;
 *   - verify changes nothing.
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
      'profile=""; prev=""; qkey=""; akid=""; status=""; pname=""; doc=""',
      'for a in "$@"; do',
      '  case "$prev" in',
      '    --profile) profile="$a" ;;',
      '    --access-key-id) akid="$a" ;;',
      '    --status) status="$a" ;;',
      '    --policy-name) pname="$a" ;;',
      '    --policy-document) doc="$a" ;;',
      '  esac',
      `  case "$a" in *"Key=='"*) qkey="\${a#*Key==\\'}"; qkey="\${qkey%%\\'*}" ;; esac`,
      '  prev="$a"',
      'done',
      // "unreadable-<subcommand>" makes a read fail the way a denied or dropped
      // call does, with no NoSuchEntity in it, so a script that took that for
      // "none" would be caught.
      `[ -f "$S/unreadable-$2" ] && { echo "aws: [ERROR]: An error occurred (AccessDenied) when calling the operation: not authorized" >&2; exit 254; }`,
      // "warn-on-success" puts a line on stderr for every IAM call, the way the
      // CLI prints a deprecation or library warning for a call that succeeded.
      // An acknowledged fake: what is asserted is that no read takes it as data.
      `[ "$1" = iam ] && [ -f "$S/warn-on-success" ] && echo "/usr/lib/python3/dist-packages/urllib3/connectionpool.py: InsecureRequestWarning: fixture warning line" >&2`,
      'case "$2" in',
      '  get-caller-identity)',
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
      `  get-role) [ -f "$S/role" ] || { echo NoSuchEntity >&2; exit 254; }`,
      // The role's maximum session, as the identity tree declares it: four hours.
      `    case "$*" in *MaxSessionDuration*) echo 14400 ;; *) printf '{}\\n' ;; esac ;;`,
      `  list-role-policies) ls "$S" | sed -n 's/^role-policy-//p' | tr '\\n' '\\t'; echo ;;`,
      `  delete-role-policy) rm -f "$S/role-policy-$pname" ;;`,
      `  get-user) [ -f "$S/user" ] || { echo NoSuchEntity >&2; exit 254; }; cat "$S/user" ;;`,
      `  list-user-tags) grep "^\${qkey}=" "$S/tags" | cut -d= -f2- ;;`,
      `  get-login-profile) [ -f "$S/login" ] || { echo NoSuchEntity >&2; exit 254; } ;;`,
      // The role's inline policies, kept by name. The read-back is answered
      // from the document the run actually wrote, so a script that wrote the
      // wrong cutoff or the wrong person is caught by its own proof; "readback"
      // replaces the answer to prove the proof itself refuses.
      '  put-role-policy)',
      `    [ -f "$S/put-role-fails" ] && { echo "An error occurred (AccessDenied) when calling the PutRolePolicy operation" >&2; exit 254; }`,
      // The role's shared inline budget, as IAM enforces it: the documents
      // already on the role, other than the one being replaced, plus this one.
      `    if [ -s "$S/inline-budget" ]; then`,
      `      used=$(cat "$S"/role-policy-* 2>/dev/null | wc -c); [ -f "$S/role-policy-$pname" ] && used=$(( used - $(wc -c < "$S/role-policy-$pname") ))`,
      `      [ $(( used + \${#doc} )) -gt "$(cat "$S/inline-budget")" ] && { echo "An error occurred (LimitExceeded) when calling the PutRolePolicy operation: Maximum policy size exceeded" >&2; exit 254; }`,
      '    fi',
      `    printf '%s' "$doc" > "$S/role-policy-$pname" ;;`,
      '  get-role-policy)',
      `    [ -f "$S/role-policy-$pname" ] || { echo NoSuchEntity >&2; exit 254; }`,
      `    [ -f "$S/readback" ] && { cat "$S/readback"; exit 0; }`,
      `    d="$(cat "$S/role-policy-$pname")"`,
      `    e="$(printf '%s' "$d" | sed -E 's/.*"Effect":"([^"]*)".*/\\1/')"`,
      `    t="$(printf '%s' "$d" | sed -E 's/.*"aws:TokenIssueTime":"([^"]*)".*/\\1/')"`,
      `    u="$(printf '%s' "$d" | sed -E 's/.*"aws:userid":"([^"]*)".*/\\1/')"`,
      `    printf '%s\\t%s\\t%s\\n' "$e" "$t" "$u" ;;`,
      `  get-user-policy) [ -f "$S/policy" ] || { echo NoSuchEntity >&2; exit 254; } ;;`,
      `  delete-user-policy) rm -f "$S/policy" ;;`,
      '  list-access-keys)',
      '    case "$*" in',
      `      *length*) wc -l < "$S/keys" | tr -d ' ' ;;`,
      `      *CreateDate*) cat "$S/keys" ;;`,
      `      *) cut -f1,2 "$S/keys" ;;`,
      '    esac ;;',
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
      // CloudTrail, answering the queried columns from "trail" as the text
      // output prints them: time, event name, event source, tab-separated.
      `  lookup-events) [ -f "$S/trail" ] && cat "$S/trail"; true ;;`,
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
  opts: { env?: NodeJS.ProcessEnv } = {},
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
      ...(opts.env ?? {}),
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** A healthy account with the role applied and no IAM user of the operator's name. */
const READY: Account = { role: true };

/** The same account holding an identity that has already been retired. */
const INERT_MANAGED: Account = {
  role: true,
  userPath: OPERATOR_PATH,
  tags: MANAGED_TAGS,
  keys: [[OLD_KEY_ID, 'Inactive']],
};

/** A live identity: managed, granted, and holding an active key. */
const ACTIVE: Account = {
  role: true,
  userPath: OPERATOR_PATH,
  tags: MANAGED_TAGS,
  keys: [[FAKE_KEY_ID, 'Active']],
  policy: true,
};

function calls(): string[] {
  const log = join(stateDir, 'calls.log');
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean);
}

/** Every call that changes something, which is what a refusal must not reach. */
function mutatingCalls(): string[] {
  return calls().filter((c) =>
    /\b(create-user|delete-user|put-user-policy|delete-user-policy|put-role-policy|create-access-key|update-access-key|delete-access-key|create-login-profile)\b/.test(
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
  it('refuses with no action, because retiring and reading back are different acts', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/one of --offboard or --verify is required/);
    expect(calls()).toHaveLength(0);
  });

  it('names the script that creates an identity when no action is given', () => {
    // Somebody reaching for this script to onboard a person is told where
    // onboarding lives, rather than left to guess at a flag that is not here.
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/created by scripts\/onboard-dev-tester\.sh/);
    expect(calls()).toHaveLength(0);
  });

  it('refuses --onboard as an unknown argument, since an identity is created elsewhere', () => {
    // Onboarding seals the key to its owner and writes nothing onto this
    // workstation; a second path that did either would be a way round that.
    const r = run(['--onboard', OPERATOR, '--yes'], READY);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown argument '--onboard'/);
    expect(calls()).toHaveLength(0);
  });

  it('refuses an action with no operator name', () => {
    const r = run(['--offboard']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--offboard requires the operator name/);
    expect(calls()).toHaveLength(0);
  });

  it('refuses an unknown flag', () => {
    const r = run(['--offboard', OPERATOR, '--force']);
    expect(r.status).toBe(2);
    expect(calls()).toHaveLength(0);
  });

  it('refuses a name that would not survive as a profile and a session name', () => {
    const r = run(['--offboard', 'a name with spaces', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not a usable operator name/);
    expect(calls()).toHaveLength(0);
  });

  it('settles onto footbag-operator rather than refusing a job-role shell', () => {
    // There is exactly one identity this can ever act as, so a job-role profile
    // inherited from the work before it is not a decision to respect. Stopping
    // at the door would cost a re-run in a fresh shell for a refusal nobody
    // should have to meet.
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
    for (const action of ['--offboard', '--verify']) {
      const r = run([action, 'footbag-operator', '--yes']);
      expect(r.status, `${action} must refuse`).toBe(2);
      expect(r.stderr).toMatch(/not managed here, under any flag/);
    }
    expect(calls()).toHaveLength(0);
  });
});

describe('manage-human-operator.sh — who may run it', () => {
  it('refuses a different directly authenticated user before any mutation', () => {
    const r = run(['--offboard', OPERATOR, '--yes'], {
      ...ACTIVE,
      caller: `arn:aws:iam::${ACCOUNT}:user/somebody-else`,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is not user\/footbag-operator/);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses an assumed role, naming why no role can do this', () => {
    const r = run(['--offboard', OPERATOR, '--yes'], {
      ...ACTIVE,
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
    const r = run(['--offboard', OPERATOR, '--yes'], { ...ACTIVE, caller: ASSUMED_ARN });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is an assumed role/);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses when the job role does not exist yet, and names the tree that makes it', () => {
    const r = run(['--offboard', OPERATOR, '--yes'], { ...ACTIVE, role: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/there is no FootbagDevTester role/);
    expect(r.stderr).toMatch(/--target identity/);
    expect(mutatingCalls()).toHaveLength(0);
  });
});

describe('manage-human-operator.sh — offboarding', () => {
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

  function revokeDoc(): string {
    const p = join(stateDir, `role-policy-revoke-sessions-${OPERATOR}`);
    return existsSync(p) ? readFileSync(p, 'utf-8') : '';
  }

  it('ends the sessions the person already holds, and only theirs', () => {
    // Removing the grant stops new sessions being minted, and a session issued
    // before it stays valid until it expires, up to four hours. The role is
    // told to refuse this person's sessions issued before now: a time
    // comparison rather than a fixed date, scoped by the session name the trust
    // policy forces to be the person's, so no other operator's session is cut.
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    expect(calls().some((c) => /put-role-policy --role-name FootbagDevTester --policy-name revoke-sessions-test_operator /.test(c))).toBe(true);
    const doc = JSON.parse(revokeDoc());
    expect(doc.Statement).toHaveLength(1);
    const st = doc.Statement[0];
    expect(st.Effect).toBe('Deny');
    expect(st.Action).toBe('*');
    expect(Object.keys(st.Condition).sort()).toEqual(['DateLessThan', 'StringLike']);
    expect(st.Condition.DateLessThan['aws:TokenIssueTime']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(st.Condition.StringLike['aws:userid']).toBe(`*:${OPERATOR}`);
    expect(r.stdout).toMatch(/no\s+job-role session still working/);
  });

  /** An earlier departure's revocation, as this script writes one. */
  const seedRevocation = (person: string, cutoff: string) =>
    writeFileSync(
      join(stateDir, `role-policy-revoke-sessions-${person}`),
      `{"Version":"2012-10-17","Statement":[{"Sid":"RevokeSessionsIssuedBeforeOffboard","Effect":"Deny","Action":"*","Resource":"*","Condition":{"DateLessThan":{"aws:TokenIssueTime":"${cutoff}"},"StringLike":{"aws:userid":"*:${person}"}}}]}`,
      'utf-8',
    );

  it('clears an earlier revocation whose cutoff is older than any session can live', () => {
    seedRevocation('long_gone', '2020-01-01T00:00:00Z');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(stateDir, 'role-policy-revoke-sessions-long_gone'))).toBe(false);
    expect(existsSync(join(stateDir, `role-policy-revoke-sessions-${OPERATOR}`))).toBe(true);
    expect(r.stdout).toMatch(/revoke-sessions-long_gone: cut off at 2020-01-01T00:00:00Z, refuses nothing now, removed/);
  });

  it('clears an expired revocation before writing, so a role with room for one still takes the next', () => {
    // A role's inline policies share one size limit. With room for a single
    // revocation, an earlier departure's expired one left on the role refused
    // this write when clearing ran after it, and every re-run was refused the
    // same way with the departing person's sessions still live.
    seedRevocation('long_gone', '2020-01-01T00:00:00Z');
    writeFileSync(join(stateDir, 'inline-budget'), '300\n', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(stateDir, 'role-policy-revoke-sessions-long_gone'))).toBe(false);
    expect(JSON.parse(revokeDoc()).Statement[0].Condition.StringLike['aws:userid']).toBe(`*:${OPERATOR}`);
  });

  it('names the size limit when a full role refuses the revocation', () => {
    // A live revocation cannot be cleared, so a role with no room left refuses,
    // and the operator is told what that refusal means and how to see it.
    seedRevocation('just_left', new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
    writeFileSync(join(stateDir, 'inline-budget'), '300\n', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/LimitExceeded refusal means the role's inline policies are full/);
    expect(r.stderr).toMatch(/aws iam list-role-policies --role-name FootbagDevTester/);
    expect(r.stdout).not.toMatch(/Done\./);
  });

  it('keeps an earlier revocation that could still be refusing a live session', () => {
    // Cut off moments ago: a session issued just before it can still be alive.
    const recent = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    seedRevocation('just_left', recent);
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(stateDir, 'role-policy-revoke-sessions-just_left'))).toBe(true);
  });

  it('keeps an earlier revocation whose cutoff is not in the shape this script writes', () => {
    // date(1) reads this as a real, long-past time, so only the shape check
    // stands between it and removing a revocation nobody can vouch for.
    seedRevocation('odd_one', '1 Jan 2020');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(stateDir, 'role-policy-revoke-sessions-odd_one'))).toBe(true);
    expect(r.stdout).toMatch(/revoke-sessions-odd_one: cutoff unreadable, left in place/);
  });

  it('writes the revocation only after every proof has passed', () => {
    // A run that failed a proof has not retired anybody, and denying the
    // person's sessions at that point would be a half-finished state reported
    // as nothing.
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    const order = calls();
    const putAt = order.findIndex((c) => c.includes('put-role-policy'));
    const simAt = order.findIndex((c) => c.includes('simulate-principal-policy'));
    const loginAt = order.findIndex((c) => c.includes('get-login-profile'));
    expect(simAt).toBeGreaterThanOrEqual(0);
    expect(loginAt).toBeGreaterThanOrEqual(0);
    expect(putAt).toBeGreaterThan(simAt);
    expect(putAt).toBeGreaterThan(loginAt);

    // A second run in the same account that fails a proof writes nothing more.
    const r2 = run(['--offboard', OPERATOR, '--yes'], { ...ACTIVE, login: true });
    expect(calls().filter((c) => c.includes('put-role-policy'))).toHaveLength(1);
    expect(r2.status).toBe(1);
  });

  it('fails the run when the revocation cannot be written', () => {
    writeFileSync(join(stateDir, 'put-role-fails'), '', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not write revoke-sessions-test_operator onto FootbagDevTester/);
    expect(r.stdout).not.toMatch(/Done\./);
  });

  it('fails the run when the revocation does not read back as written', () => {
    // The read-back is the proof. A cutoff or a person other than the one
    // written would leave the sessions it was meant to end still working.
    writeFileSync(join(stateDir, 'readback'), 'Deny\t2000-01-01T00:00:00Z\t*:somebody_else\n', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not read back as/);
    expect(r.stdout).not.toMatch(/Done\./);
  });

  it('names the one command that ends the rest, when run on its own', () => {
    // Retiring the AWS identity leaves the host account and the allow-list
    // entry. An operator who ran only this and saw it succeed would have a
    // departed colleague still holding both.
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Still owed/);
    expect(r.stdout).toMatch(/bash scripts\/offboard-dev-tester\.sh --target staging --account test_operator/);
    expect(r.stdout).not.toMatch(/--target <env>/);
    // The offboarding command it names takes no GitHub flag, and would refuse one.
    expect(r.stdout).not.toMatch(/--github-login/);
    expect(r.stdout).not.toMatch(/terraform\.tfvars|values file/);
  });

  it('does not name that command when it is the one driving this run', () => {
    const r = run(['--offboard', OPERATOR, '--yes', '--driven-by-offboard'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/Still owed/);
    expect(r.stdout).not.toMatch(/offboard-dev-tester\.sh/);
  });

  it('refuses to call the identity retired while a console sign-in survives', () => {
    // Nothing in this script's family makes one, so one here arrived by another
    // route, and it is a console sign-in with no second factor that neither the
    // grant removal nor the key retirement touches.
    // Without this the run reports a retired identity that can still sign in.
    const r = run(['--offboard', OPERATOR, '--yes'], { ...ACTIVE, login: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/still has a console login profile/);
    expect(r.stderr).toMatch(/survives both/);
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

  it('fails rather than calling the keys gone when IAM cannot list them', () => {
    writeFileSync(join(stateDir, 'unreadable-list-access-keys'), '', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read .*access keys from IAM/);
    expect(r.stdout).not.toMatch(/active keys: none/);
  });

  it('fails rather than calling the grant gone when IAM cannot read it', () => {
    writeFileSync(join(stateDir, 'unreadable-get-user-policy'), '', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read whether .* holds AssumeFootbagDevTester/);
    expect(r.stdout).not.toMatch(/already absent/);
  });

  it('fails rather than calling a new session refused when the simulator cannot answer', () => {
    writeFileSync(join(stateDir, 'unreadable-simulate-principal-policy'), '', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/policy simulator could not say/);
    expect(r.stdout).not.toMatch(/refused by the policy simulator/);
  });

  it('fails rather than calling the console sign-in absent when IAM cannot read it', () => {
    writeFileSync(join(stateDir, 'unreadable-get-login-profile'), '', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read whether .* has a console login profile/);
    expect(r.stdout).not.toMatch(/login profile: none/);
  });

  it('fails rather than calling the user absent when IAM cannot read it', () => {
    writeFileSync(join(stateDir, 'unreadable-get-user'), '', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read the IAM user test_operator/);
    expect(r.stderr).not.toMatch(/there is no IAM user named/);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('refuses as unreadable, not as somebody else\'s, a user whose tags cannot be read', () => {
    writeFileSync(join(stateDir, 'unreadable-list-user-tags'), '', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read test_operator's ManagedBy tag from IAM/);
    expect(r.stderr).not.toMatch(/is not a user this script/);
    expect(mutatingCalls()).toHaveLength(0);
  });

  it('retires the identity when the CLI prints warnings on stderr for calls that succeed', () => {
    // A warning read together with an answer would be a key id to retire and a
    // decision the simulator never gave, so every answer is read from stdout.
    writeFileSync(join(stateDir, 'warn-on-success'), '', 'utf-8');
    const r = run(['--offboard', OPERATOR, '--yes'], ACTIVE);
    expect(r.status, r.stderr).toBe(0);
    expect(keyRows()).toHaveLength(0);
    expect(r.stdout).toMatch(/refused by the policy simulator/);
    expect(calls().filter((c) => /access-key-id .*(urllib3|InsecureRequestWarning)/.test(c))).toEqual([]);
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

  it('fails rather than reporting the operator absent when IAM cannot read the user', () => {
    // Absent is an answer IAM gives by name. A denied call, an expired session
    // or a dropped connection is no answer, and reporting it as absent would
    // pass a read-back of an identity nobody had looked at.
    writeFileSync(join(stateDir, 'unreadable-get-user'), '', 'utf-8');
    const r = run(['--verify', OPERATOR], ACTIVE);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read the IAM user test_operator/);
    expect(r.stdout).not.toMatch(/user:\s+absent/);
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
    // Every one of these carries a capital letter or a hyphen, and the shape
    // check admits neither, so it is the one guard they have and it has to
    // hold under both flags.
    for (const action of ['--offboard', '--verify']) {
      for (const reserved of ['FootbagDevTester', 'footbag-staging-runtime', 'footbag-production-runtime']) {
        const r = run([action, reserved, '--yes'], READY);
        expect(r.status, `${action} ${reserved} must be refused`).toBe(2);
        expect(r.stderr).toMatch(/not a usable operator name/);
      }
    }
    expect(calls()).toEqual([]);
  });

  it('says plainly when the run is against a stub', () => {
    const r = run(['--verify', OPERATOR], READY);
    expect(r.stderr).toMatch(/SYNTHETIC/);
  });
});

describe('manage-human-operator.sh — verify reads what was done under the name', () => {
  const HELD: Account = {
    role: true,
    userPath: OPERATOR_PATH,
    tags: MANAGED_TAGS,
    keys: [[FAKE_KEY_ID, 'Active']],
    policy: true,
  };

  it('reports the count, the newest event and the latest role assumption, asking for this name only', () => {
    // Rows arrive in page order, not time order, and a pagination line is not
    // an event; reading the first row as the newest would report a stale deploy.
    writeFileSync(
      join(stateDir, 'trail'),
      [
        '2026-09-30T10:00:00+00:00\tAssumeRole\tsts.amazonaws.com',
        '2026-10-01T09:00:05+00:00\tGetParameter\tssm.amazonaws.com',
        '2026-10-01T09:00:00+00:00\tAssumeRole\tsts.amazonaws.com',
        'NEXTTOKEN\teyJmaXh0dXJlIjoidG9rZW4ifQ==',
        '',
      ].join('\n'),
      'utf-8',
    );
    const r = run(['--verify', OPERATOR], HELD);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/trail:\s+3 event\(s\) as test_operator since/);
    expect(r.stdout).toMatch(/latest:\s+2026-10-01T09:00:05\+00:00 GetParameter \(ssm\.amazonaws\.com\)/);
    expect(r.stdout).toMatch(/assumed:\s+2026-10-01T09:00:00\+00:00/);
    expect(calls().some((c) => c.includes('lookup-events') && c.includes(`AttributeValue=${OPERATOR}`))).toBe(true);
  });

  it('reports no events as information, since a new identity has done nothing yet', () => {
    const r = run(['--verify', OPERATOR], HELD);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/trail:\s+no event as test_operator since/);
  });

  it('counts an unreadable trail as a finding rather than an empty one', () => {
    writeFileSync(join(stateDir, 'unreadable-lookup-events'), '', 'utf-8');
    const r = run(['--verify', OPERATOR], HELD);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/CloudTrail could not be read/);
    expect(r.stdout).not.toMatch(/no event as/);
    expect(r.stderr).toMatch(/1 finding\(s\)/);
  });
});

/**
 * The workstation side of the offboard proof: attempting the refused assume for
 * real, with the retired key itself. The simulator answers a question about
 * policy evaluation; only a real attempt answers one about the credential, and
 * a check left for an operator to type at the end of a long sitting is the one
 * that gets skipped.
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
});
