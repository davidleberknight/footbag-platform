/**
 * scripts/offboard-dev-tester.sh — offboarding as one command.
 *
 * An onboarding left half-finished is obvious within a day. An offboarding left
 * half-finished is not: a person whose AWS identity is retired and whose shell
 * account is not still holds a login and a sudo password, and nothing anywhere
 * says so.
 *
 * What is pinned here is the sequencing, the refusals, and what the command
 * adds over running the halves separately: the host account always ends before
 * the AWS identity, a person with no AWS identity is retired rather than
 * stranded, and retiring the account this workstation connects as, which has
 * no provision, is refused before anything changes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { createScratchDir } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/offboard-dev-tester.sh');

const ACCOUNT = 'jane_doe';
const SUPER_ADMIN_ARN = 'arn:aws:iam::111122223333:user/footbag-operator';

let workDir: string;
let hostLog: string;
let awsLog: string;
let addressLog: string;
let ghLog: string;
let hostStdin: string;

beforeEach(() => {
  workDir = createScratchDir('offboard-dev-tester');
  hostLog = join(workDir, 'host-child.log');
  awsLog = join(workDir, 'aws-child.log');
  addressLog = join(workDir, 'address-child.log');
  ghLog = join(workDir, 'gh.log');
  hostStdin = join(workDir, 'host-child.stdin');
  sshConfig = join(workDir, 'ssh-config');
  awsConfig = join(workDir, 'aws-config');
  awsCred = join(workDir, 'aws-credentials');
  namedKey = join(workDir, '.ssh', `id_ed25519_${ACCOUNT}`);
  writeFileSync(awsConfig, OPERATOR_CONFIG, 'utf-8');
  writeFileSync(awsCred, OPERATOR_CRED, 'utf-8');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function childStub(name: string, log: string, exitCode: number, captureStdin = false): string {
  const path = join(workDir, `${name}.sh`);
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(log)}`,
      captureStdin ? `cat > ${JSON.stringify(hostStdin)} || true` : '',
      `exit ${exitCode}`,
    ]
      .filter(Boolean)
      .join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/**
 * An `ssh` that answers the one question this run asks: which account the
 * alias connects as, read from the suite's own config file so a run that moves
 * the alias sees the move. The shared machine isolation puts a refusing stub on
 * PATH; a suite that needs an alias to resolve supplies its own ahead of it.
 */
function sshStub(): string {
  const bin = join(workDir, 'bin');
  mkdirSync(bin, { recursive: true });
  const path = join(bin, 'ssh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "-G" ]]; then',
      `  awk -v a="$2" 'tolower($1)=="host" { m=0; for (i=2;i<=NF;i++) if ($i==a) m=1; next }`,
      `    m && tolower($1)=="user" && u=="" { u=$2 } END { print "user " u; print "hostname 203.0.113.10" }' "$OFFBOARD_SSH_CONFIG"`,
      '  exit 0',
      'fi',
      'exit 255',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return bin;
}

const NAMED_LINE = `    IdentityFile ~/.ssh/id_ed25519_${ACCOUNT}`;
const stanza = (user: string, extra = '') =>
  [
    'Host footbag-staging',
    '    HostName 203.0.113.10',
    `    User ${user}`,
    '    IdentityFile ~/.ssh/id_ed25519',
    ...(extra ? [extra] : []),
    '    IdentitiesOnly yes',
    '',
  ].join('\n');

/** What footbag-operator holds on a holder's workstation; offboarding anyone must leave it byte for byte. */
const OPERATOR_CRED = '[footbag-operator]\naws_access_key_id = AKIAOPERATOR\naws_secret_access_key = operator-secret\n';
const OPERATOR_CONFIG = '[profile footbag-operator]\nregion = us-east-1\n';
/** What accepting an onboarding of the account being offboarded leaves on this machine. */
const NAMED_CRED = `[${ACCOUNT}]\naws_access_key_id = AKIANAMED\naws_secret_access_key = named-secret\n`;
const NAMED_CONFIG = [
  '[profile FootbagDevTester]',
  'role_arn = arn:aws:iam::111122223333:role/FootbagDevTester',
  `source_profile = ${ACCOUNT}`,
  'role_session_name = jane_doe',
  '',
  '[profile footbag-staging-runtime]',
  'role_arn = arn:aws:iam::111122223333:role/footbag-staging-app-runtime',
  'source_profile = FootbagDevTester',
  '',
].join('\n');

let sshConfig: string;
let awsConfig: string;
let awsCred: string;
let namedKey: string;

/** The Match block onboarding writes above the untouched alias stanza. */
const blockFor = (account: string) =>
  [
    'Match host footbag-staging exec "test x$AWS_PROFILE = xFootbagDevTester"',
    `  User ${account}`,
    `  IdentityFile ~/.ssh/id_ed25519_${account}`,
    '',
  ].join('\n');

/** A workstation that accepted the onboarding of the account being offboarded: its key, Match block, password file and profiles. */
function workstationHeldIt(): void {
  writeFileSync(sshConfig, blockFor(ACCOUNT) + stanza('footbag'), 'utf-8');
  mkdirSync(join(workDir, '.ssh'), { recursive: true });
  writeFileSync(namedKey, 'private', 'utf-8');
  writeFileSync(`${namedKey}.pub`, 'ssh-ed25519 AAAA jane_doe\n', 'utf-8');
  mkdirSync(join(workDir, 'AWS'), { recursive: true });
  writeFileSync(join(workDir, 'AWS', 'HOST_OPERATOR.txt'), 'their-password\n', 'utf-8');
  writeFileSync(awsCred, `${OPERATOR_CRED}\n${NAMED_CRED}`, 'utf-8');
  writeFileSync(awsConfig, `${OPERATOR_CONFIG}\n${NAMED_CONFIG}`, 'utf-8');
}

type IamUser = 'present' | 'absent' | 'unreadable';

const PUBLIC_REPO = 'example-owner/public-repo';
const PRIVATE_REPO = 'example-owner/private-repo';
const LOGIN = 'Jane-Doe';

interface Github {
  /** Repositories the login is a collaborator on. */
  collaborator?: string[];
  /** The permission the API reports per repository, where not the default. */
  permission?: Record<string, string>;
  /** Pending invitation ids per repository. */
  invites?: Record<string, string[]>;
  /** A removal the API accepts and does not carry out. */
  removalIgnored?: boolean;
  /** Every read fails as an unauthenticated CLI does. */
  unreadable?: boolean;
}

interface RunOptions {
  args?: string[];
  hostExit?: number;
  awsExit?: number;
  arn?: string;
  input?: string;
  aliasUser?: string;
  iamUser?: IamUser;
  /** Leave the SSH config a test wrote itself, rather than writing one from aliasUser. */
  keepConfig?: boolean;
  /** Addresses the allow-list child lists for the account, or 'unreadable'. */
  listed?: string[] | 'unreadable';
  /** The allow-list child's exit on a removal. */
  removeExit?: number;
  github?: Github;
  /** Replace the GitHub CLI with a name that is not installed. */
  noGh?: boolean;
}

const BASE = ['--target', 'staging', '--account', ACCOUNT, '--github-login', LOGIN, '--yes'];

const fileFor = (slug: string) => slug.replace('/', '_');

/** The allow-list child: lists what the test says, and records every removal. */
function addressStub(listed: string[] | 'unreadable', removeExit: number): string {
  const path = join(workDir, 'address-child.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(addressLog)}`,
      'if [[ " $* " == *" --list-for "* ]]; then',
      listed === 'unreadable'
        ? '  echo "ERROR: the operator_cidrs list cannot be read with certainty" >&2; exit 1'
        : `  ${listed.map((a) => `printf '%s\\n' ${JSON.stringify(a)}; `).join('')}exit 0`,
      'fi',
      `exit ${removeExit}`,
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/**
 * A GitHub CLI answering the calls the run makes, from files, so the read-back
 * after a removal is answered by what the removal did. A collaborator check on
 * somebody who is not one fails the way the real CLI does, naming HTTP 404.
 */
function ghStub(g: Github): string {
  const state = join(workDir, 'gh-state');
  mkdirSync(state, { recursive: true });
  for (const slug of g.collaborator ?? []) writeFileSync(join(state, `collab-${fileFor(slug)}`), '', 'utf-8');
  for (const [slug, perm] of Object.entries(g.permission ?? {}))
    writeFileSync(join(state, `perm-${fileFor(slug)}`), `${perm}\n`, 'utf-8');
  for (const [slug, ids] of Object.entries(g.invites ?? {}))
    writeFileSync(join(state, `invites-${fileFor(slug)}`), ids.map((i) => `${i}\n`).join(''), 'utf-8');
  const path = join(workDir, 'gh-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `S=${JSON.stringify(state)}`,
      `printf '%s\\n' "$*" >> ${JSON.stringify(ghLog)}`,
      g.unreadable ? 'echo "To get started with GitHub CLI, please run:  gh auth login" >&2; exit 4' : '',
      'method=GET; path=""',
      'for a in "$@"; do case "$a" in DELETE) method=DELETE ;; repos/*) path="$a" ;; esac; done',
      'rest="${path#repos/}"; owner="${rest%%/*}"; rest="${rest#*/}"; repo="${rest%%/*}"; rest="${rest#*/}"',
      'f="${owner}_${repo}"',
      'case "$method $rest" in',
      '  "GET collaborators/"*/permission)',
      '    if [ -f "$S/perm-$f" ]; then cat "$S/perm-$f"; elif [ -f "$S/collab-$f" ]; then echo write; else echo read; fi ;;',
      '  "GET collaborators/"*)',
      '    [ -f "$S/collab-$f" ] || { echo "gh: Not Found (HTTP 404)" >&2; exit 1; } ;;',
      '  "DELETE collaborators/"*)',
      g.removalIgnored ? '    : ;;' : '    rm -f "$S/collab-$f" ;;',
      '  "GET invitations")',
      '    [ -f "$S/invites-$f" ] && cat "$S/invites-$f"; exit 0 ;;',
      '  "DELETE invitations/"*)',
      '    id="${rest#invitations/}"; grep -vx "$id" "$S/invites-$f" > "$S/i.tmp" || true; mv "$S/i.tmp" "$S/invites-$f" ;;',
      '  *) echo "unexpected gh call: $*" >&2; exit 64 ;;',
      'esac',
      'exit 0',
    ]
      .filter(Boolean)
      .join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

const collaboratorOn = (slug: string) => existsSync(join(workDir, 'gh-state', `collab-${fileFor(slug)}`));

/**
 * The IAM read answers the way the CLI does. `NoSuchEntity` is the error code
 * AWS names in its message for a user that does not exist, and it is the only
 * answer the run may read as "nothing to retire".
 */
function getUserAnswer(iamUser: IamUser): string[] {
  switch (iamUser) {
    case 'present':
      return ["  printf '%s\\n' /footbag-operators/", '  exit 0'];
    case 'absent':
      return [
        '  echo "An error occurred (NoSuchEntity) when calling the GetUser operation: The user with name jane_doe cannot be found." >&2',
        '  exit 254',
      ];
    case 'unreadable':
      return [
        '  echo "Could not connect to the endpoint URL: \\"https://iam.amazonaws.com/\\"" >&2',
        '  exit 255',
      ];
  }
}

function run(options: RunOptions = {}) {
  const {
    args = BASE,
    hostExit = 0,
    awsExit = 0,
    arn = SUPER_ADMIN_ARN,
    input = '',
    aliasUser = 'footbag',
    iamUser = 'present',
    keepConfig = false,
    listed = [],
    removeExit = 0,
    github = { collaborator: [PUBLIC_REPO, PRIVATE_REPO] },
    noGh = false,
  } = options;
  if (!keepConfig) writeFileSync(sshConfig, stanza(aliasUser), 'utf-8');
  const stubPath = join(workDir, 'aws-stub.sh');
  writeFileSync(
    stubPath,
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "configure" && "$2" == "list-profiles" ]]; then',
      "  printf '%s\\n' footbag-operator",
      '  exit 0',
      'fi',
      'if [[ "$1" == "sts" && "$2" == "get-caller-identity" ]]; then',
      `  printf '%s\\n' ${JSON.stringify(arn)}`,
      '  exit 0',
      'fi',
      'if [[ "$1" == "iam" && "$2" == "get-user" ]]; then',
      ...getUserAnswer(iamUser),
      'fi',
      'exit 64',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(stubPath, 0o755);
  const bin = sshStub();
  const res = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input,
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      // Fixture files the suite owns, so the workstation cleanup has something
      // to read; nothing in them is a real credential.
      AWS_CONFIG_FILE: awsConfig,
      AWS_SHARED_CREDENTIALS_FILE: awsCred,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      AWS_PROFILE_BIN: stubPath,
      OFFBOARD_AWS_BIN: stubPath,
      OFFBOARD_HOST_CMD: childStub('host-child', hostLog, hostExit, true),
      OFFBOARD_AWS_CMD: childStub('aws-child', awsLog, awsExit),
      OFFBOARD_SSH_CONFIG: sshConfig,
      OFFBOARD_SSH_ADD: '/bin/true',
      OFFBOARD_ADDRESS_CMD: addressStub(listed, removeExit),
      OFFBOARD_GH_BIN: noGh ? join(workDir, 'no-such-gh') : ghStub(github),
      OFFBOARD_PUBLIC_REPO: PUBLIC_REPO,
      // Set explicitly, so a developer's own wiring never decides which
      // repository a test run names.
      FOOTBAG_PRIVATE_REPO: PRIVATE_REPO,
      HOME: workDir,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const hostCalls = () => (existsSync(hostLog) ? readFileSync(hostLog, 'utf-8') : '');
const awsCalls = () => (existsSync(awsLog) ? readFileSync(awsLog, 'utf-8') : '');
const addressCalls = () => (existsSync(addressLog) ? readFileSync(addressLog, 'utf-8') : '');
const ghCalls = () => (existsSync(ghLog) ? readFileSync(ghLog, 'utf-8') : '');
/** Every call that changes something outside this machine. */
const outwardChanges = () =>
  [hostCalls(), awsCalls(), addressCalls().split('\n').filter((l) => l.includes('--remove')).join('\n'),
    ghCalls().split('\n').filter((l) => l.includes('DELETE')).join('\n')].join('');

describe('offboard-dev-tester refuses the wrong caller and the wrong subject', () => {
  it('refuses anything but the directly authenticated footbag-operator', () => {
    const r = run({ arn: 'arn:aws:sts::111122223333:assumed-role/FootbagDevTester/dave' });
    expect(r.status).toBe(1);
    expect(hostCalls()).toBe('');
    expect(awsCalls()).toBe('');
  });

  it('refuses to retire the shared account, which is the way back in', () => {
    const r = run({ args: ['--target', 'staging', '--account', 'footbag', '--yes'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/way back in/);
    expect(hostCalls()).toBe('');
  });

  it('refuses the administrative identity by name, even on a resumed run that skips the children', () => {
    // A resumed run from the last step reaches the workstation cleanup directly,
    // and footbag-operator is a credentials section this machine holds.
    workstationHeldIt();
    writeFileSync(awsCred, '[footbag-operator]\naws_access_key_id = placeholder\n', 'utf-8');
    const r = run({
      keepConfig: true,
      args: ['--target', 'staging', '--account', 'footbag-operator', '--github-login', 'none',
        '--from-step', '4', '--yes'],
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not the shape a named account takes/);
    expect(outwardChanges()).toBe('');
    expect(readFileSync(awsCred, 'utf-8')).toContain('[footbag-operator]');
  });

  it('refuses a name that is not a person\'s account shape', () => {
    const r = run({ args: ['--target', 'staging', '--account', 'jane', '--github-login', 'none', '--yes'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not the shape a named account takes/);
    expect(outwardChanges()).toBe('');
  });

  it('exits 2 on an unknown flag', () => {
    const r = run({ args: [...BASE, '--purge'] });
    expect(r.status).toBe(2);
  });

  it('takes only the four steps it has', () => {
    const r = run({ args: [...BASE, '--from-step', '5'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/takes 1 to 4/);
  });

  it('requires the GitHub login, or an explicit none, before anything changes', () => {
    // A forgotten flag would leave an offboarded person able to push, so an omission
    // is refused rather than read as "they hold no access".
    const r = run({ args: ['--target', 'staging', '--account', ACCOUNT, '--yes'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Give 'none' if they hold none/);
    expect(outwardChanges()).toBe('');
  });

  it('refuses something that is not a GitHub login', () => {
    const r = run({ args: ['--target', 'staging', '--account', ACCOUNT, '--github-login', '-jane', '--yes'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/is not a GitHub login/);
  });
});

describe('offboard-dev-tester offboards the named identity this machine accepted, and cleans it', () => {
  it('offboards through the shared account, which the alias always connects as', () => {
    workstationHeldIt();
    const r = run({ keepConfig: true });
    expect(r.status, r.stderr).toBe(0);
    expect(hostCalls()).toContain(`--account ${ACCOUNT} --offboard`);
    expect(awsCalls()).toContain(`--offboard ${ACCOUNT}`);
  });

  it('leaves this machine carrying nothing of the offboarded identity', () => {
    workstationHeldIt();
    const r = run({ keepConfig: true });
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(namedKey)).toBe(false);
    expect(existsSync(`${namedKey}.pub`)).toBe(false);
    expect(existsSync(join(workDir, 'AWS', 'HOST_OPERATOR.txt'))).toBe(false);
    expect(readFileSync(sshConfig, 'utf-8')).not.toContain(ACCOUNT);
    expect(readFileSync(awsCred, 'utf-8')).not.toContain(`[${ACCOUNT}]`);
    expect(readFileSync(awsConfig, 'utf-8')).not.toContain('FootbagDevTester');
    expect(readFileSync(awsConfig, 'utf-8')).not.toContain('footbag-staging-runtime');
  });

  it('leaves footbag-operator and the alias stanza byte for byte, whatever else it removes', () => {
    workstationHeldIt();
    run({ keepConfig: true });
    expect(readFileSync(awsCred, 'utf-8')).toBe(OPERATOR_CRED + '\n');
    expect(readFileSync(awsConfig, 'utf-8')).toBe(OPERATOR_CONFIG + '\n');
    expect(readFileSync(sshConfig, 'utf-8')).toBe(stanza('footbag'));
  });

  it('reports every part already done on a second run, and changes nothing', () => {
    workstationHeldIt();
    run({ keepConfig: true });
    const configAfter = readFileSync(sshConfig, 'utf-8');
    const r = run({ keepConfig: true });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/nothing of jane_doe's is on this machine/);
    expect(readFileSync(sshConfig, 'utf-8')).toBe(configAfter);
  });

  it('removes nothing local when a host step fails, so a re-run still finds it all', () => {
    workstationHeldIt();
    const r = run({ keepConfig: true, hostExit: 1 });
    expect(r.status).toBe(1);
    expect(existsSync(namedKey)).toBe(true);
    expect(readFileSync(awsCred, 'utf-8')).toContain(`[${ACCOUNT}]`);
    expect(readFileSync(sshConfig, 'utf-8')).toBe(blockFor(ACCOUNT) + stanza('footbag'));
  });
});

describe('offboard-dev-tester never moves the default', () => {
  it('refuses, changing nothing, when the alias connects as anything but the shared account', () => {
    workstationHeldIt();
    writeFileSync(sshConfig, stanza(ACCOUNT, NAMED_LINE), 'utf-8');
    const before = readFileSync(sshConfig, 'utf-8');
    const r = run({ keepConfig: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/connects as 'jane_doe', not the shared account/);
    expect(hostCalls()).toBe('');
    expect(awsCalls()).toBe('');
    expect(readFileSync(sshConfig, 'utf-8')).toBe(before);
    expect(existsSync(namedKey)).toBe(true);
  });
});

describe('offboard-dev-tester offboarding somebody else from your workstation', () => {
  it('retires them while the alias names the shared account', () => {
    const r = run({ aliasUser: 'footbag' });
    expect(r.status, r.stderr).toBe(0);
    expect(hostCalls()).toContain(`--account ${ACCOUNT}`);
  });

  it('leaves your own Match block and your own filed password alone', () => {
    // This machine's own named account has its block and password file here,
    // and neither is the departing person's.
    mkdirSync(join(workDir, 'AWS'), { recursive: true });
    writeFileSync(join(workDir, 'AWS', 'HOST_OPERATOR.txt'), 'the-holders-password\n', 'utf-8');
    writeFileSync(sshConfig, blockFor('david_leberknight') + stanza('footbag'), 'utf-8');
    const before = readFileSync(sshConfig, 'utf-8');
    const r = run({ keepConfig: true });
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(sshConfig, 'utf-8')).toBe(before);
    expect(readFileSync(join(workDir, 'AWS', 'HOST_OPERATOR.txt'), 'utf-8')).toBe('the-holders-password\n');
    expect(r.stdout).toMatch(/nothing of jane_doe's is on this machine/);
  });

  it('keeps your own filed password even when something of theirs is on this machine', () => {
    // A stray copy of their key pair makes this machine one that held them, but
    // the one password file here belongs to the named account the Match block
    // connects as, which is yours.
    mkdirSync(join(workDir, 'AWS'), { recursive: true });
    writeFileSync(join(workDir, 'AWS', 'HOST_OPERATOR.txt'), 'the-holders-password\n', 'utf-8');
    writeFileSync(sshConfig, blockFor('david_leberknight') + stanza('footbag'), 'utf-8');
    mkdirSync(join(workDir, '.ssh'), { recursive: true });
    writeFileSync(namedKey, 'private', 'utf-8');
    writeFileSync(`${namedKey}.pub`, 'ssh-ed25519 AAAA jane_doe\n', 'utf-8');
    const r = run({ keepConfig: true });
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(workDir, 'AWS', 'HOST_OPERATOR.txt'), 'utf-8')).toBe('the-holders-password\n');
    expect(r.stdout).toMatch(/left alone, because this machine's named account\s+is david_leberknight/);
    expect(existsSync(namedKey)).toBe(false);
  });
});

describe('offboard-dev-tester ends the shell before the AWS identity', () => {
  it('runs the host child first and the AWS child after it', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(hostCalls()).toContain('--offboard');
    expect(hostCalls()).toContain(`--account ${ACCOUNT}`);
    expect(awsCalls()).toContain(`--offboard ${ACCOUNT}`);
    expect(awsCalls()).toContain('--driven-by-offboard');
  });

  it('pre-accepts only the AWS confirmation; the host step always asks a person', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(awsCalls()).toContain('--yes');
    expect(hostCalls()).not.toContain('--yes');
    expect(readFileSync(SCRIPT, 'utf-8')).toMatch(/the host step always asks at the/);
  });

  it('does not touch the AWS identity when the host account failed', () => {
    const r = run({ hostExit: 1 });
    expect(r.status).toBe(1);
    expect(awsCalls()).toBe('');
    expect(r.stderr).toMatch(/Ending one half and reporting the other/);
  });

  it('says plainly what is left when the AWS half failed', () => {
    const r = run({ awsExit: 1 });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/an AWS identity and\s+no shell/);
  });

  it('passes standard input to the host child untouched', () => {
    const credential = 'the-runners-own-sudo-password\n';
    run({ input: credential });
    expect(readFileSync(hostStdin, 'utf-8')).toBe(credential);
  });

  it('reports each half as proved by the half that ends it, with no login probe of its own', () => {
    // A login attempted from this workstation uses this machine's key, which
    // was never on the departing account, so it is refused whatever state that
    // account is in and proves nothing.
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/a login as .* is now refused/);
    expect(r.stdout).toMatch(/Each step proved its own outcome/);
  });
});

describe('offboard-dev-tester takes their address off the allow-list', () => {
  it('removes every address attributed to them, through the script that owns the list', () => {
    const r = run({ listed: ['203.0.113.7/32', '203.0.113.8/32'] });
    expect(r.status, r.stderr).toBe(0);
    const calls = addressCalls();
    expect(calls).toContain(`--target staging --list-for ${ACCOUNT}`);
    expect(calls).toContain('--target staging --address 203.0.113.7/32 --remove --yes');
    expect(calls).toContain('--target staging --address 203.0.113.8/32 --remove --yes');
    expect(r.stdout).toMatch(/203\.0\.113\.7\/32: off the list, and the live firewall agrees/);
  });

  it('runs after the host and AWS halves', () => {
    // An address with no account behind it reaches a login prompt and nothing
    // more; the shell and the identity are what matter first.
    const r = run({ listed: ['203.0.113.7/32'], hostExit: 1 });
    expect(r.status).toBe(1);
    expect(addressCalls()).toBe('');
  });

  it('says so by name when no entry is attributed to them', () => {
    const r = run({ listed: [] });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/no entry on it is attributed to jane_doe/);
    expect(addressCalls()).not.toContain('--remove');
  });

  it('fails, naming where to resume, when the list cannot be read', () => {
    // An unreadable list must not read as "nothing to remove".
    const r = run({ listed: 'unreadable' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read the staging allow-list/);
    expect(r.stderr).toMatch(/--from-step 3/);
    expect(r.stdout).not.toMatch(/Done\./);
  });

  it('fails, naming where to resume, when a removal is not proved', () => {
    const r = run({ listed: ['203.0.113.7/32'], removeExit: 1 });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/203\.0\.113\.7\/32 was not proved off the staging allow-list/);
    expect(r.stderr).toMatch(/--from-step 3/);
    expect(r.stdout).not.toMatch(/Done\./);
  });

  it('never pre-accepts a production removal, which asks at the terminal', () => {
    writeFileSync(sshConfig, stanza('footbag').replace('footbag-staging', 'footbag-production'), 'utf-8');
    const r = run({
      args: ['--target', 'production', '--account', ACCOUNT, '--github-login', LOGIN, '--yes'],
      listed: ['203.0.113.7/32'],
      keepConfig: true,
    });
    expect(r.status, r.stderr).toBe(0);
    const removal = addressCalls().split('\n').find((l) => l.includes('--remove')) ?? '';
    expect(removal).toContain('--target production --address 203.0.113.7/32 --remove');
    expect(removal).not.toContain('--yes');
  });
});

describe('offboard-dev-tester ends their access to the repositories', () => {
  it('removes them from both repositories and reads each back as gone', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(collaboratorOn(PUBLIC_REPO)).toBe(false);
    expect(collaboratorOn(PRIVATE_REPO)).toBe(false);
    expect(r.stdout).toMatch(/example-owner\/public-repo: Jane-Doe removed, and read back as no collaborator/);
    expect(r.stdout).toMatch(/example-owner\/private-repo: Jane-Doe removed, and read back as no collaborator/);
    expect(r.stdout).toMatch(/Jane-Doe is no collaborator on either repository/);
  });

  it('withdraws a pending invitation, so it cannot be accepted after the removal', () => {
    const r = run({ github: { collaborator: [], invites: { [PRIVATE_REPO]: ['4242'] } } });
    expect(r.status, r.stderr).toBe(0);
    expect(ghCalls()).toContain(`api -X DELETE repos/${PRIVATE_REPO}/invitations/4242`);
    expect(r.stdout).toMatch(/private-repo: pending invitation withdrawn/);
  });

  it('reports a person who is no collaborator as such, and removes nothing', () => {
    const r = run({ github: { collaborator: [] } });
    expect(r.status, r.stderr).toBe(0);
    expect(ghCalls()).not.toMatch(/DELETE/);
    expect(r.stdout).toMatch(/public-repo: Jane-Doe is not a collaborator/);
  });

  it('fails when a removal does not read back as done', () => {
    const r = run({ github: { collaborator: [PUBLIC_REPO], removalIgnored: true } });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not proved ended: still listed as a collaborator/);
    expect(r.stderr).toMatch(/--from-step 4/);
    expect(r.stdout).not.toMatch(/Done\./);
  });

  it('refuses an administrator of either repository before anything changes', () => {
    // An owner or admin is not ended by removing a collaborator.
    const r = run({ github: { collaborator: [PRIVATE_REPO], permission: { [PRIVATE_REPO]: 'admin' } } });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Jane-Doe administers example-owner\/private-repo/);
    expect(outwardChanges()).toBe('');
  });

  it('refuses before anything changes when GitHub cannot be read', () => {
    const r = run({ github: { unreadable: true } });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read Jane-Doe's access to/);
    expect(outwardChanges()).toBe('');
  });

  it('refuses before anything changes when the GitHub CLI is not installed', () => {
    const r = run({ noGh: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/the GitHub CLI is not installed/);
    expect(outwardChanges()).toBe('');
  });

  it('removes nothing, and says so, when told none', () => {
    const r = run({ args: ['--target', 'staging', '--account', ACCOUNT, '--github-login', 'none', '--yes'] });
    expect(r.status, r.stderr).toBe(0);
    expect(ghCalls()).toBe('');
    expect(r.stdout).toMatch(/No GitHub login was named, so no repository access was removed/);
  });
});

describe('offboard-dev-tester retires a person who holds no AWS identity', () => {
  it('passes the AWS step when IAM says by name that no such user exists', () => {
    // A dev-and-tester's AWS half is delivered after their host account, so
    // somebody leaving in between has a shell and no IAM user. Stopping there
    // would strand the departure with nothing left to do.
    const r = run({ iamUser: 'absent' });
    expect(r.status, r.stderr).toBe(0);
    expect(awsCalls()).toBe('');
    expect(r.stdout).toMatch(/IAM has no user named jane_doe, so there is no AWS identity/);
  });

  it('fails rather than calling an unreadable answer an absent user', () => {
    const r = run({ iamUser: 'unreadable' });
    expect(r.status).toBe(1);
    expect(awsCalls()).toBe('');
    expect(r.stderr).toMatch(/could not read whether jane_doe has an IAM user/);
    expect(r.stderr).toMatch(/--from-step 2/);
  });
});

describe('offboard-dev-tester says what a departure still owes', () => {
  it('owes nothing further, and names no vault step, since nobody named has a vault entry', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Nothing else is owed/);
    expect(r.stdout).toMatch(/nobody named has a vault entry/);
    expect(r.stdout).not.toMatch(/Still owed/);
    expect(r.stdout).not.toMatch(/vault entries/);
  });

  it('discloses the chained runtime session no step reaches', () => {
    const r = run();
    expect(r.stdout).toMatch(/AWS ends a chained session within the hour/);
  });
});

describe('offboard-dev-tester resumes a run that stopped after the host step', () => {
  it('runs only the AWS step when told the host step is done', () => {
    const r = run({ args: [...BASE, '--from-step', '2'] });
    expect(r.status, r.stderr).toBe(0);
    expect(hostCalls()).toBe('');
    expect(awsCalls()).toContain(`--offboard ${ACCOUNT}`);
  });
});

/**
 * Every case above replaces both children with stubs, which is right for
 * testing the parent's sequencing and is exactly how offboarding was once broken
 * with nothing noticing: a stub accepted an argument vector the real child
 * refused. So these spawn the REAL children with the vectors the parent sends,
 * and assert only that the arguments are accepted, because everything after
 * that needs a host or an account.
 */
describe('offboard-dev-tester.sh — the real children accept what the parent sends them', () => {
  const HOST_CHILD = join(process.cwd(), 'scripts/provision-operator-account.sh');
  const AWS_CHILD = join(process.cwd(), 'scripts/manage-human-operator.sh');

  const spawnChild = (child: string, args: string[]) =>
    spawnSync('bash', [child, ...args], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: '',
      env: { ...process.env, ...NO_AWS_CREDENTIALS, HOME: workDir },
      ...SPAWN_GUARD,
    });

  it('the host child accepts a retirement with no operator name, which is all the parent has', () => {
    const r = spawnChild(HOST_CHILD, ['--target', 'staging', '--account', ACCOUNT, '--offboard']);
    expect(r.stderr ?? '').not.toMatch(/--operator is required/);
    expect(r.status).not.toBe(2);
  });

  it('the host child still demands the operator name when it is creating an account', () => {
    // The guard is scoped, not removed. A creation writes the name into the
    // account's comment field, so an account nobody can attribute is still
    // refused.
    const r = spawnChild(HOST_CHILD, [
      '--target', 'staging', '--account', ACCOUNT, '--key-line', 'ssh-ed25519 AAAA test', '--sealed',
    ]);
    expect(r.status).toBe(2);
    expect(r.stderr ?? '').toMatch(/--operator is required/);
  });

  it('the AWS child accepts the flag that says the parent is driving it', () => {
    const r = spawnChild(AWS_CHILD, ['--offboard', ACCOUNT, '--yes', '--driven-by-offboard']);
    expect(r.stderr ?? '').not.toMatch(/unknown argument/);
    expect(r.status).not.toBe(2);
  });
});
