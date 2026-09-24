/**
 * scripts/onboard-operator.sh — hiring as one command, from any starting state.
 *
 * A person onboarded by running some of the halves is not onboarded: they have
 * an AWS identity and no shell, or a shell and no way to act as it, or a named
 * account carrying the shared account's key, which firing them would sweep off
 * the shared account too.
 *
 * What is pinned here is what an operator cannot see go wrong:
 *
 *   - that the default is never changed: the alias's stanza is left byte for
 *     byte, and a run that finds it already pointed elsewhere refuses;
 *   - the refusals that stop the run before anything changes;
 *   - that the named key is made here, is never the main key, and is held by
 *     the agent before the host step runs, since the host step's own login
 *     proof depends on it;
 *   - that the host step creates an account neither key reaches, finishes one a
 *     key on this machine reaches, and is skipped only when three logins and a
 *     sudo proof say it is done;
 *   - that the AWS step is skipped only when its own read-back is clean;
 *   - that standard input reaches the host child untouched, because it carries
 *     a sudo password and this script must read none of it;
 *   - that the Match block reaching the named account is written last, only
 *     after both of those exist, and resolves as the named account only under
 *     the job role's profile;
 *   - that a second run over a finished hire changes nothing.
 *
 * The children, the ssh client and the agent are stubbed; the key pairs are
 * real, because the fingerprints are what the run compares.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  chmodSync,
  existsSync,
  rmSync,
  mkdirSync,
  copyFileSync,
  utimesSync,
} from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { createScratchDir } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/onboard-operator.sh');

const ACCOUNT = 'david_leberknight';
const SHARED_PASSWORD = 'the-shared-accounts-sudo-password';
const NAMED_PASSWORD = 'the-named-accounts-password';
const FOOTBAG_OPERATOR_ARN = 'arn:aws:iam::111122223333:user/footbag-operator';

const STANZA = (user = 'footbag', extra = '') =>
  [
    'Host footbag-staging',
    '    HostName 203.0.113.10',
    '    Port 2222',
    `    User ${user}`,
    '    IdentityFile ~/.ssh/id_ed25519',
    ...(extra ? [extra] : []),
    '    IdentitiesOnly yes',
    '',
  ].join('\n');
const NAMED_LINE = `    IdentityFile ~/.ssh/id_ed25519_${ACCOUNT}`;
/** The block onboarding writes above the untouched alias stanza. */
const BLOCK = [
  'Match host footbag-staging exec "test x$AWS_PROFILE = xFootbagDevTester"',
  `  User ${ACCOUNT}`,
  `  IdentityFile ~/.ssh/id_ed25519_${ACCOUNT}`,
  '',
].join('\n');

let workDir: string;
let home: string;
let sshConfig: string;
let mainKey: string;
let namedKey: string;
let pin: string;
let probes: string;
let rotated: string;
let hostPassword: string;
let agentFile: string;
let hostLog: string;
let hostStdin: string;
let awsLog: string;
let awsDone: string;
let agentLog: string;

function write(path: string, body: string, mode = 0o644): string {
  writeFileSync(path, body, 'utf-8');
  chmodSync(path, mode);
  return path;
}

function keygen(path: string): void {
  const res = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'test', '-f', path], {
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  if (res.status !== 0) throw new Error(`ssh-keygen failed: ${res.stderr}`);
}

function fingerprint(pub: string): string {
  const res = spawnSync('ssh-keygen', ['-l', '-f', pub], { encoding: 'utf-8', ...SPAWN_GUARD });
  return (res.stdout ?? '').split(' ')[1];
}

type Outcome = 'accepted' | 'refused' | 'timeout';
interface HostState {
  namedOnAccount: Outcome;
  mainOnAccount: Outcome;
  namedOnShared: Outcome;
}
const ABSENT: HostState = { namedOnAccount: 'refused', mainOnAccount: 'refused', namedOnShared: 'refused' };
const ON_MAIN_KEY: HostState = { namedOnAccount: 'refused', mainOnAccount: 'accepted', namedOnShared: 'refused' };
const SEPARATED: HostState = { namedOnAccount: 'accepted', mainOnAccount: 'refused', namedOnShared: 'refused' };

/** Which logins the stub host accepts, before the host child has run and after. */
function hostIs(before: HostState, after: HostState = SEPARATED): void {
  const lines: string[] = [];
  for (const [phase, s] of [['before', before], ['after', after]] as const) {
    lines.push(`${phase} ${ACCOUNT} ${namedKey} ${s.namedOnAccount}`);
    lines.push(`${phase} ${ACCOUNT} ${mainKey} ${s.mainOnAccount}`);
    lines.push(`${phase} footbag ${namedKey} ${s.namedOnShared}`);
  }
  write(probes, lines.join('\n') + '\n');
}

function agentHolds(keys: string[]): void {
  write(agentFile, keys.map((k) => `256 ${fingerprint(`${k}.pub`)} test (ED25519)`).join('\n') + '\n');
}

const credFile = () => join(home, 'AWS', 'HOST_OPERATOR.txt');

/** What a finished host step leaves: the password set on the host and filed here, after the key. */
function hostStepFinished(): void {
  writeFileSync(hostPassword, NAMED_PASSWORD, 'utf-8');
  mkdirSync(join(home, 'AWS'), { recursive: true });
  writeFileSync(credFile(), `${NAMED_PASSWORD}\n`, 'utf-8');
}

beforeEach(() => {
  workDir = createScratchDir('onboard-operator');
  home = join(workDir, 'home');
  mkdirSync(join(home, '.ssh'), { recursive: true });
  sshConfig = join(home, '.ssh', 'config');
  mainKey = join(home, '.ssh', 'id_ed25519');
  namedKey = join(home, '.ssh', `id_ed25519_${ACCOUNT}`);
  keygen(mainKey);
  keygen(namedKey);
  // Made a minute ago, so a password file a run writes is plainly newer,
  // whatever the filesystem's timestamp resolution.
  const earlier = new Date(Date.now() - 60_000);
  for (const f of [mainKey, `${mainKey}.pub`, namedKey, `${namedKey}.pub`]) utimesSync(f, earlier, earlier);
  write(sshConfig, STANZA());

  pin = write(join(workDir, 'known_hosts'), '[203.0.113.10]:2222 ssh-ed25519 AAAA\n', 0o600);
  probes = join(workDir, 'probes');
  rotated = join(workDir, 'rotated');
  hostPassword = join(workDir, 'host-password');
  agentFile = join(workDir, 'agent');
  hostLog = join(workDir, 'host-child.log');
  hostStdin = join(workDir, 'host-child.stdin');
  awsLog = join(workDir, 'aws-child.log');
  awsDone = join(workDir, 'aws-done');
  agentLog = join(workDir, 'agent.log');
  agentHolds([mainKey, namedKey]);
  hostIs(ABSENT);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * An `ssh` that answers the configuration query from the suite's own config the
 * way the real client does (first value wins across every matching Host block,
 * every IdentityFile accumulates), each single-key login from the probe table,
 * and the sudo proof by comparing line one of stdin with the password the host
 * child set.
 */
function sshStubDir(): string {
  const dir = join(workDir, 'ssh-bin');
  mkdirSync(dir, { recursive: true });
  write(
    join(dir, 'ssh'),
    [
      '#!/usr/bin/env bash',
      'if [[ "$1" == "-G" ]]; then',
      '  alias_name="$2"',
      `  awk -v a="$alias_name" '`,
      // The one Match form this tree writes: it applies while AWS_PROFILE names
      // the job role's profile, which is what its exec test checks.
      '    tolower($1)=="match" { m = ($3==a && ENVIRON["AWS_PROFILE"]=="FootbagDevTester"); next }',
      '    tolower($1)=="host" { m=0; for (i=2;i<=NF;i++) if ($i==a || $i=="*") m=1; next }',
      '    m && tolower($1)=="user" && u=="" { u=$2 }',
      '    m && tolower($1)=="hostname" && h=="" { h=$2 }',
      '    m && tolower($1)=="port" && p=="" { p=$2 }',
      '    m && tolower($1)=="identitiesonly" && o=="" { o=$2 }',
      '    m && tolower($1)=="identityfile" { ids = ids "identityfile " $2 "\\n" }',
      '    END {',
      '      print "user " (u=="" ? "nobody" : u)',
      '      print "hostname " (h=="" ? a : h)',
      '      print "port " (p=="" ? 22 : p)',
      '      print "identitiesonly " (o=="" ? "no" : o)',
      '      printf "%s", ids',
      '    }',
      `  ' "$ONBOARD_SSH_CONFIG" 2>/dev/null || echo "hostname $alias_name"`,
      '  exit 0',
      'fi',
      'user=""; key=""',
      'for a in "$@"; do',
      '  case "$a" in User=*) user="${a#User=}" ;; IdentityFile=*) key="${a#IdentityFile=}" ;; esac',
      'done',
      'if [[ "${!#}" == *"sudo -k -S"* ]]; then',
      '  IFS= read -r pass || true',
      `  [[ -e ${JSON.stringify(hostPassword)} && "$pass" == "$(cat ${JSON.stringify(hostPassword)})" ]] && exit 0`,
      '  exit 1',
      'fi',
      `phase=before; [[ -e ${JSON.stringify(rotated)} ]] && phase=after`,
      `result="$(awk -v p="$phase" -v u="$user" -v k="$key" '$1==p && $2==u && $3==k {print $4}' ${JSON.stringify(probes)})"`,
      'case "$result" in',
      '  accepted) exit 0 ;;',
      '  refused) echo "${user}@203.0.113.10: Permission denied (publickey)." >&2; exit 255 ;;',
      '  *) echo "ssh: connect to host 203.0.113.10 port 2222: Connection timed out" >&2; exit 255 ;;',
      'esac',
    ].join('\n'),
    0o755,
  );
  return dir;
}

const STARTED_SOCK = 'agent-started-by-this-run';

/** An ssh-add that reaches no agent when the suite says so, unless the run started one. */
function sshAddStub(noAgent: boolean): string {
  return write(
    join(workDir, 'ssh-add-stub.sh'),
    [
      '#!/usr/bin/env bash',
      noAgent ? `[[ "\${SSH_AUTH_SOCK:-}" == ${JSON.stringify(STARTED_SOCK)} ]] || exit 2` : '',
      `if [[ "$1" == "-l" ]]; then cat ${JSON.stringify(agentFile)}; exit 0; fi`,
      'exit 0',
    ].join('\n'),
    0o755,
  );
}

/** An ssh-agent that hands out the socket the ssh-add stub recognises, and records being stopped. */
function sshAgentStub(startFails: boolean): string {
  return write(
    join(workDir, 'ssh-agent-stub.sh'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(agentLog)}`,
      startFails ? '[[ "$1" == "-s" ]] && exit 1' : '',
      `[[ "$1" == "-s" ]] && echo "SSH_AUTH_SOCK=${STARTED_SOCK}; export SSH_AUTH_SOCK; SSH_AGENT_PID=4242; export SSH_AGENT_PID;"`,
      'exit 0',
    ].join('\n'),
    0o755,
  );
}

/**
 * The host child as the real one behaves: on success it swaps the keys, sets the
 * account's password on the host and files it here. Stopped at VAULTED, it has
 * swapped the keys and done neither of the others.
 */
function hostChild(exitCode: number, stopsAtVaulted: boolean): string {
  return write(
    join(workDir, 'host-child.sh'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(hostLog)}`,
      `cat > ${JSON.stringify(hostStdin)} || true`,
      exitCode === 0 || stopsAtVaulted ? `touch ${JSON.stringify(rotated)}` : '',
      exitCode === 0
        ? [
            `printf '%s' ${JSON.stringify(NAMED_PASSWORD)} > ${JSON.stringify(hostPassword)}`,
            `mkdir -p ${JSON.stringify(join(home, 'AWS'))}`,
            `printf '%s\\n' ${JSON.stringify(NAMED_PASSWORD)} > ${JSON.stringify(credFile())}`,
          ].join('\n')
        : '',
      `exit ${exitCode}`,
    ].join('\n'),
    0o755,
  );
}

/**
 * The AWS child. Its read-back reports absent until an onboarding has succeeded,
 * and after that whatever the awsDone file holds: the real script's lines for a
 * complete identity by default, or a suite's variant with a part missing.
 */
const AWS_COMPLETE = [
  '    user:      present',
  '    path:      /footbag-operators/',
  '    key:       AKIAEXAMPLE Active, 1 days old',
  '    active:    1 key(s)',
  '    policy:    assume-footbag-dev-tester present',
].join('\n');

function awsChild(exitCode: number): string {
  return write(
    join(workDir, 'aws-child.sh'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(awsLog)}`,
      'if [[ "$1" == "--verify" ]]; then',
      `  if [[ -s ${JSON.stringify(awsDone)} ]]; then cat ${JSON.stringify(awsDone)}; else echo "    user:      absent"; fi`,
      '  exit 0',
      'fi',
      exitCode === 0 ? `printf '%s\\n' ${JSON.stringify(AWS_COMPLETE)} > ${JSON.stringify(awsDone)}` : '',
      `exit ${exitCode}`,
    ].join('\n'),
    0o755,
  );
}

function awsStub(arn: string): string {
  return write(
    join(workDir, 'aws-stub.sh'),
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
      'exit 64',
    ].join('\n'),
    0o755,
  );
}

const BASE = ['--target', 'staging', '--account', ACCOUNT, '--operator', 'David Leberknight', '--yes'];

interface RunOptions {
  args?: string[];
  hostExit?: number;
  stopsAtVaulted?: boolean;
  awsExit?: number;
  arn?: string;
  noAgent?: boolean;
  agentStartFails?: boolean;
}

function run(options: RunOptions = {}) {
  const {
    args = BASE,
    hostExit = 0,
    stopsAtVaulted = false,
    awsExit = 0,
    arn = FOOTBAG_OPERATOR_ARN,
    noAgent = false,
    agentStartFails = false,
  } = options;
  const stub = awsStub(arn);
  const res = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: `${SHARED_PASSWORD}\n`,
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      AWS_PROFILE_BIN: stub,
      ONBOARD_AWS_BIN: stub,
      ONBOARD_HOST_CMD: hostChild(hostExit, stopsAtVaulted),
      ONBOARD_AWS_CMD: awsChild(awsExit),
      ONBOARD_SSH_CONFIG: sshConfig,
      ONBOARD_SSH_ADD: sshAddStub(noAgent),
      ONBOARD_SSH_AGENT: sshAgentStub(agentStartFails),
      FOOTBAG_KNOWN_HOSTS: pin,
      HOME: home,
      PATH: `${sshStubDir()}:${process.env.PATH ?? ''}`,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const hostCalls = () => (existsSync(hostLog) ? readFileSync(hostLog, 'utf-8') : '');
const awsCalls = () => (existsSync(awsLog) ? readFileSync(awsLog, 'utf-8') : '');
const configNow = () => readFileSync(sshConfig, 'utf-8');
const withArg = (from: string, to: string) => BASE.map((a) => (a === from ? to : a));

describe('onboard-operator refuses what it cannot make sense of', () => {
  it('refuses a caller that is not the directly authenticated IAM user footbag-operator', () => {
    const r = run({ arn: 'arn:aws:sts::111122223333:assumed-role/FootbagDevTester/dave' });
    expect(r.status).toBe(1);
    expect(hostCalls()).toBe('');
    expect(awsCalls()).toBe('');
    expect(configNow()).toBe(STANZA());
  });

  it('refuses an account name that is not the shape the Linux account and IAM user take', () => {
    // Both the Linux account and the IAM user are created from this one string,
    // and the role's trust binds the session name to the IAM user name.
    const r = run({ args: withArg(ACCOUNT, 'David.Leberknight') });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not the shape an operator name takes/);
    expect(hostCalls()).toBe('');
  });

  it('refuses a one-part name here, exactly as the AWS half refuses it', () => {
    // A name this accepted and the AWS half rejected would create the Linux
    // account and then fail, leaving a shell with no AWS identity.
    const r = run({ args: withArg(ACCOUNT, 'dave') });
    expect(r.status).toBe(2);
    expect(hostCalls()).toBe('');
  });

  it('refuses a name longer than a Linux account may be, before anything is created', () => {
    const long = `${'a'.repeat(16)}_${'b'.repeat(16)}`;
    expect(long.length).toBe(33);
    const r = run({ args: withArg(ACCOUNT, long) });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/at most 32 characters/);
  });

  it('holds to the same shape the AWS half enforces, read from that script', () => {
    const shape = /\^\[a-z\]\[a-z0-9\]\*\(_\[a-z0-9\]\+\)\+\$/;
    expect(readFileSync(SCRIPT, 'utf-8')).toMatch(shape);
    expect(readFileSync(join(process.cwd(), 'scripts/manage-human-operator.sh'), 'utf-8')).toMatch(shape);
  });

  it('refuses a missing environment rather than inheriting one', () => {
    const r = run({ args: BASE.slice(2) });
    expect(r.status).toBe(2);
  });

  it('exits 2 on an unknown flag, including a key supplied from elsewhere', () => {
    // The key is made here, on the holder's own machine; there is no flag to
    // hand one in.
    const r = run({ args: [...BASE, '--key-file', '/tmp/x.pub'] });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown argument: --key-file');
  });

  it('refuses a workstation with no stanza for the alias, before changing anything', () => {
    write(sshConfig, 'Host something-else\n    User footbag\n');
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not configured on this workstation/);
    expect(hostCalls()).toBe('');
  });

  it.each(['someone_else', ACCOUNT])(
    'refuses an alias whose default is not the shared account, here %s',
    (user) => {
      // The default is what every other run relies on; a hire that found it
      // changed would be acting on a workstation already pointed elsewhere.
      write(sshConfig, STANZA(user));
      const r = run();
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(new RegExp(`connects as '${user}', not the shared account`));
      expect(hostCalls()).toBe('');
      expect(configNow()).toBe(STANZA(user));
    },
  );

  it('refuses an alias without IdentitiesOnly, where a login proves nothing about which key', () => {
    write(sshConfig, STANZA().replace('    IdentitiesOnly yes\n', ''));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/IdentitiesOnly yes/);
  });

  it('refuses a stanza that offers more than one candidate main key', () => {
    // Which key the shared account holds has to be read, not guessed.
    write(sshConfig, STANZA('footbag', '    IdentityFile ~/.ssh/id_rsa'));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/exactly one key besides/);
  });
});

describe('onboard-operator makes the named key before anything reaches the host', () => {
  it('refuses a named key that is the main key under another name', () => {
    // The one mistake that would make firing this account sweep the shared
    // account's key.
    copyFileSync(mainKey, namedKey);
    copyFileSync(`${mainKey}.pub`, `${namedKey}.pub`);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is the main key \(same fingerprint/);
    expect(hostCalls()).toBe('');
    expect(configNow()).toBe(STANZA());
  });

  it('leaves half a key pair alone rather than overwriting it', () => {
    rmSync(`${namedKey}.pub`);
    const before = readFileSync(namedKey, 'utf-8');
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/only one half/);
    expect(readFileSync(namedKey, 'utf-8')).toBe(before);
  });

  it('makes a missing key pair with no passphrase, without asking for one', () => {
    // Standard input carries the sudo password and there is no terminal here,
    // so a prompt would fail the run rather than make the key.
    rmSync(namedKey);
    rmSync(`${namedKey}.pub`);
    const r = run();
    expect(r.stdout).toMatch(/making /);
    expect(existsSync(namedKey)).toBe(true);
    // An empty passphrase opens it; an encrypted key would refuse this.
    const open = spawnSync('ssh-keygen', ['-y', '-P', '', '-f', namedKey], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(open.status, open.stderr).toBe(0);
    // With no terminal, ssh-keygen falls back to an empty passphrase by itself,
    // so the run above cannot tell a prompt from none. At a real terminal it
    // would ask; the explicit empty passphrase is what stops that.
    const lib = readFileSync(join(process.cwd(), 'scripts/lib/operator-ssh-key.sh'), 'utf-8');
    expect(lib).toMatch(/ssh-keygen [^\n]*-N '' /);
  });

  it('starts an agent for itself when none is reachable, and stops it when the run ends', () => {
    // No side command for the operator to remember: the run needs an agent
    // for its batch-mode logins, so it starts one, the host child inherits it,
    // and it is stopped because this run created it.
    const r = run({ noAgent: true });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/started an SSH agent for this run/);
    const agent = readFileSync(agentLog, 'utf-8');
    expect(agent).toContain('-s');
    expect(agent).toContain('-k');
    expect(hostCalls()).toContain('--own-password');
  });

  it('stops the agent it started even when the run fails part way', () => {
    const r = run({ noAgent: true, hostExit: 1 });
    expect(r.status).toBe(1);
    expect(readFileSync(agentLog, 'utf-8')).toContain('-k');
  });

  it('leaves an agent the operator already had running', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(agentLog)).toBe(false);
  });

  it('refuses when no agent is reachable and one cannot be started', () => {
    const r = run({ noAgent: true, agentStartFails: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/starting one failed/);
    expect(hostCalls()).toBe('');
  });

  it('refuses to go on with a key the agent does not hold when there is no terminal to load it', () => {
    // An unloaded key is never offered in batch mode, and the host step's own
    // login proof would fail after the account was made.
    agentHolds([mainKey]);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Loading .* needs a terminal/);
    expect(hostCalls()).toBe('');
  });

  it('leaves the alias stanza byte for byte, adding only the Match block above it', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(configNow()).toBe(BLOCK + STANZA());
  });
});

describe('onboard-operator decides the host step from what the host says', () => {
  it('creates an account neither key reaches, with the named key and a typed password', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(hostCalls()).toContain(
      `--target staging --account ${ACCOUNT} --operator David Leberknight --key-file ${namedKey}.pub --own-password --attest-own\n`,
    );
    expect(hostCalls()).not.toContain('--rotate');
  });

  it('finishes an account made before it had a key of its own, still carrying the main key', () => {
    hostIs(ON_MAIN_KEY);
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/finished rather than created/);
    expect(hostCalls()).toContain('--own-password --rotate');
  });

  it('finishes a host step that stopped after VAULTED, where the keys are apart but no password was filed', () => {
    // The host child swaps the keys before asking for VAULTED, so the logins
    // alone would call this done while the password is neither set nor filed.
    hostIs(SEPARATED);
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(hostCalls()).toContain('--rotate');
  });

  it('does not take a password file older than the key as proof the host step finished', () => {
    hostIs(SEPARATED);
    hostStepFinished();
    const older = new Date(Date.now() - 120_000);
    utimesSync(credFile(), older, older);
    run();
    expect(hostCalls()).toContain('--rotate');
  });

  it('does not take a password sudo refuses as proof the host step finished', () => {
    hostIs(SEPARATED);
    hostStepFinished();
    writeFileSync(hostPassword, 'a-different-password', 'utf-8');
    run();
    expect(hostCalls()).toContain('--rotate');
  });

  it('passes standard input to the host child untouched', () => {
    // It carries the shared account's sudo password, and anything this script
    // read would be a line the child never sees.
    run();
    expect(readFileSync(hostStdin, 'utf-8')).toBe(`${SHARED_PASSWORD}\n`);
  });

  it('proves the outcome with three logins and sudo, and prints both fingerprints', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/david_leberknight with the named key: +accepted/);
    expect(r.stdout).toMatch(/david_leberknight with the main key: +refused/);
    expect(r.stdout).toMatch(/footbag with the named key: +refused/);
    expect(r.stdout).toMatch(/sudo with the filed password: +yes/);
    expect(r.stdout).toContain(fingerprint(`${namedKey}.pub`));
    expect(r.stdout).toContain(fingerprint(`${mainKey}.pub`));
  });

  it('counts a login that timed out as unproven, never as a refusal', () => {
    hostIs(ABSENT, { ...SEPARATED, mainOnAccount: 'timeout' });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/with the main key: +unproven/);
    expect(r.stderr).toMatch(/host account is not proven/);
    expect(awsCalls()).toBe('');
  });

  it('fails when the named account still takes the main key after the host child ran', () => {
    hostIs(ON_MAIN_KEY, { ...SEPARATED, mainOnAccount: 'accepted' });
    const r = run();
    expect(r.status).toBe(1);
    expect(awsCalls()).toBe('');
  });

  it('hands an account neither key reaches to the host step for the owner to attest, not to a refusal', () => {
    // A lost key leaves the owner's own account unreachable. The host step shows
    // what it accepts and rotates it on a typed APPLY, so a re-run finishes the
    // hire rather than stopping for good.
    const r = run({ hostExit: 1 });
    expect(r.status).toBe(1);
    expect(hostCalls()).toContain('--own-password --attest-own');
    expect(hostCalls()).not.toContain('--rotate');
    expect(r.stderr).toMatch(/find out whose account/);
    expect(awsCalls()).toBe('');
    expect(configNow()).not.toContain(`User ${ACCOUNT}`);
  });

  it('stops without reaching AWS when the host child stops at VAULTED', () => {
    const r = run({ hostExit: 1, stopsAtVaulted: true });
    expect(r.status).toBe(1);
    expect(awsCalls()).toBe('');
  });

  it('refuses to run the host step through an alias already moved to the named account', () => {
    // The host step runs through the shared account with that account's
    // password on stdin; the named account's password would be the wrong one.
    write(sshConfig, STANZA(ACCOUNT, NAMED_LINE));
    hostIs(ON_MAIN_KEY);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/User line back to footbag/);
    expect(hostCalls()).toBe('');
  });
});

describe('onboard-operator decides the AWS step from its own read-back', () => {
  it('creates the AWS identity from the same one name, with no standard input', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(awsCalls()).toContain(`--verify ${ACCOUNT}`);
    expect(awsCalls()).toContain(`--onboard ${ACCOUNT}`);
    expect(r.stdout).not.toContain(SHARED_PASSWORD);
  });

  it('leaves an identity the read-back reports complete alone, rather than re-minting its key', () => {
    writeFileSync(awsDone, AWS_COMPLETE, 'utf-8');
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(awsCalls()).not.toContain('--onboard');
  });

  it.each([
    ['a lost key, with none active', AWS_COMPLETE.replace('active:    1', 'active:    0')],
    ['a missing grant', AWS_COMPLETE.replace(/policy:.*$/, 'policy:    x absent, so this identity reaches nothing')],
    ['no profile on this workstation', `${AWS_COMPLETE}\n    profile:   no [profile FootbagDevTester] here, so this workstation`],
  ])('onboards again where the read-back exits clean but shows %s', (_label, readBack) => {
    // The read-back prints these without failing, and each is work the
    // onboarding does; a lost key is reissued exactly this way.
    writeFileSync(awsDone, readBack, 'utf-8');
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(awsCalls()).toContain(`--onboard ${ACCOUNT}`);
  });

  it('leaves the host account standing when the AWS identity failed, and says so', () => {
    // It is recorded in the vault by then, and withdrawing it would make that
    // record describe a login that does not exist.
    const r = run({ awsExit: 1 });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/host account stands/);
    expect(configNow()).not.toContain(`User ${ACCOUNT}`);
  });
});

describe('onboard-operator writes the Match block last, and never moves the default', () => {
  it('writes it once the Linux account and IAM user exist, and proves both outcomes', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(configNow()).toBe(BLOCK + STANZA());
    expect(r.stdout).toMatch(new RegExp(`footbag-staging connects as footbag by default, and as ${ACCOUNT} only`));
    expect(r.stdout).toMatch(new RegExp(`as-dev-tester\\.sh --account ${ACCOUNT}`));
  });

  it('fails when the block is not what ssh resolves under the job role, rather than reporting it done', () => {
    // An earlier `Host *` block setting User wins over anything after it, so the
    // block would change nothing ssh does.
    write(sshConfig, `Host *\n    User footbag\n\n${STANZA()}`);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/under AWS_PROFILE=FootbagDevTester, footbag-staging resolves as 'footbag'/);
  });

  it('writes no block when the AWS identity failed', () => {
    const r = run({ awsExit: 1 });
    expect(r.status).toBe(1);
    expect(configNow()).toBe(STANZA());
  });
});

describe('onboard-operator run again over a finished hire', () => {
  it('proves every step done and changes nothing', () => {
    write(sshConfig, BLOCK + STANZA());
    hostIs(SEPARATED);
    hostStepFinished();
    writeFileSync(awsDone, AWS_COMPLETE, 'utf-8');
    const before = configNow();
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Step 2[\s\S]*already done/);
    expect(r.stdout).toMatch(/Step 3[\s\S]*already done/);
    expect(r.stdout).toMatch(/Step 4[\s\S]*already present/);
    expect(hostCalls()).toBe('');
    expect(awsCalls()).not.toContain('--onboard');
    expect(configNow()).toBe(before);
  });

  it('says on stderr that a stubbed run proves nothing', () => {
    const r = run();
    expect(r.stderr).toMatch(/ONBOARD_HOST_CMD is set; this run is stubbed/);
  });
});
