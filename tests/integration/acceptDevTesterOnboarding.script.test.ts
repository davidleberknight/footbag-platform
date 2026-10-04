/**
 * scripts/accept-dev-tester-onboarding.sh — a dev-and-tester opening the sealed
 * delivery on their own computer and putting each thing in it where the tooling
 * expects it.
 *
 * The refusals come first, each stopping the run before anything on the machine
 * changes: the wrong environment or account, a delivery for somebody else or in
 * any other shape, no key pair that opens it, a job-role profile that already
 * belongs to somebody else, a stanza pointing at another host, a one-time
 * password the host no longer accepts. Then whole runs, driven through a
 * terminal, which is where the promises can be checked: every file lands where
 * it belongs and nothing else changes, the directly authenticated identity's
 * section is byte-identical, no secret reaches the terminal or survives in temp,
 * and a second run finds every step already done.
 *
 * aws, age and the connections to the host are stubs; the host is a file holding
 * its current sudo password, which the stub accepts, rejects and changes the way
 * the remote half does. `ssh -G` is the real client reading this suite's own
 * home, because which account the alias resolves as is the thing under test.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
  symlinkSync,
  renameSync,
  copyFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import {
  ADMIN_STANZAS,
  OPERATOR_PROFILES,
  OPERATOR_SECTION,
  seedMaintainerMachine,
  snapshotAdminFiles,
  stillHolds,
} from '../fixtures/maintainerMachine';

const SCRIPT = join(process.cwd(), 'scripts/accept-dev-tester-onboarding.sh');
const LIB = join(process.cwd(), 'scripts/lib/dev-tester-delivery.sh');
const REAL_SSH = '/usr/bin/ssh';
if (!existsSync(REAL_SSH) && process.env.CI) {
  throw new Error(`${REAL_SSH} is required for these cases and is missing on this runner.`);
}

const ACCOUNT = 'james_leberknight';
const ONE_TIME = 'fixtureOneTimePassword0000000000';
const NEW_PASSWORD = 'james-own-sudo-password';
const KEY_ID = 'AKIAFIXTUREJAMES0001';
const SECRET = 'fixtureSecretAccessKeyForJames0000000000';
const ADDRESS = '203.0.113.10';
const OPERATOR_CRED =
  '[footbag-operator]\naws_access_key_id = AKIAOPERATORFIXTURE0\naws_secret_access_key = operator-fixture-secret\n';
const OPERATOR_CONFIG = '[profile footbag-operator]\nregion = us-east-1\n';
// The pins the run is held to, read from where the repository sets them.
const AWS_PIN = /^AWS_CLI_VERSION="(.+)"$/m.exec(readFileSync(join(process.cwd(), 'scripts/setup-dev-workstation.sh'), 'utf-8'))![1];
const TF_PIN = /terraform_version:\s*(\S+)/.exec(readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf-8'))![1];

let dir: string;
let home: string;
let tmp: string;
let sealed: string;
let hostPassword: string;

function stub(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/**
 * aws, answering by profile. A fresh assume-role, signed with the person's own
 * key, is answered separately: issued under the session name asked for, or
 * refused when `fresh` is 'refused', which is a key the role no longer honours
 * while the CLI's cache still answers the role profile as though it did.
 */
function awsStub(opts: { session?: string; runtimeRole?: string; fresh?: 'issued' | 'refused' } = {}): string {
  return stub(
    `aws-${opts.session ?? 'own'}-${opts.runtimeRole ?? 'runtime'}-${opts.fresh ?? 'issued'}`,
    `
# The version the scripts pin, and the profile list as the real CLI derives it
# from the two files, so the run sees this suite's machine and not the host's.
[[ "$1" == "--version" ]] && { echo "aws-cli/${AWS_PIN} Python/3.13 Linux/6 exe/x86_64"; exit 0; }
if [[ "$1 $2" == "configure list-profiles" ]]; then
  sed -n 's/^\\[profile \\([^]]*\\)\\].*/\\1/p' "$AWS_CONFIG_FILE" 2>/dev/null
  sed -n 's/^\\[\\([^]]*\\)\\].*/\\1/p' "$AWS_SHARED_CREDENTIALS_FILE" 2>/dev/null
  exit 0
fi
sub="$2"
profile=""; session=""
while [[ $# -gt 0 ]]; do
  [[ "$1" == "--profile" ]] && profile="$2"
  [[ "$1" == "--role-session-name" ]] && session="$2"
  shift
done
if [[ "$sub" == "assume-role" ]]; then
  [[ "$profile" == ${JSON.stringify(ACCOUNT)} ]] || exit 255
  ${opts.fresh === 'refused' ? 'echo "An error occurred (AccessDenied) when calling the AssumeRole operation: not authorized" >&2; exit 254' : 'echo "arn:aws:sts::000000000000:assumed-role/FootbagDevTester/$session"; exit 0'}
fi
case "$profile" in
  ${ACCOUNT}) echo "arn:aws:iam::000000000000:user/footbag-dev-testers/${ACCOUNT}" ;;
  FootbagDevTester) echo "arn:aws:sts::000000000000:assumed-role/FootbagDevTester/${opts.session ?? ACCOUNT}" ;;
  footbag-staging-runtime) echo "arn:aws:sts::000000000000:assumed-role/${opts.runtimeRole ?? 'footbag-staging-app-runtime'}/botocore-session-1" ;;
  *) exit 255 ;;
esac`,
  );
}

/** age: -d copies what follows the header; it never seals in this suite. */
function ageStub(): string {
  return stub(
    'age',
    `
[[ "\${1:-}" == "--version" ]] && { echo v-stub; exit 0; }
[[ "$1" == "-d" ]] || exit 2
out="$5"; in="$6"
sed '1,/^--- /d' "$in" > "$out"`,
  );
}

/**
 * The host, as the named account reaches it: sudo -v accepts the current
 * password; the password change reads the old one, then CHPW_NEW, and replaces
 * it. Every other connection is refused.
 */
function hostSshStub(): string {
  return stub(
    'host-ssh',
    `
cmd="\${!#}"
# ssh's own exit when it never reached the host.
[[ -e ${JSON.stringify(join(dir, 'unreachable'))} ]] && exit 255
IFS= read -r given || true
current="$(cat ${JSON.stringify(hostPassword)})"
case "$cmd" in
  'sudo -k -S -p "" -v') [[ "$given" == "$current" ]] ;;
  'sudo -k -S -p "" bash')
    [[ "$given" == "$current" ]] || exit 1
    IFS= read -r line
    eval "$line"
    printf '%s\\n' "$CHPW_NEW" > ${JSON.stringify(hostPassword)}
    cat > /dev/null ;;
  *) exit 255 ;;
esac`,
  );
}

function realSshFirst(): string {
  const bin = join(dir, 'real-ssh');
  if (!existsSync(bin)) {
    mkdirSync(bin);
    symlinkSync(REAL_SSH, join(bin, 'ssh'));
    // The tools the preflight asks for, at the pinned versions, so the verdict
    // is this suite's and not whatever the machine running it has installed.
    for (const tool of ['docker', 'rsync', 'sqlite3', 'jq']) {
      writeFileSync(join(bin, tool), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
    }
    writeFileSync(join(bin, 'terraform'), `#!/usr/bin/env bash\necho "Terraform v${TF_PIN}"\n`, { mode: 0o755 });
  }
  return bin;
}

/** The wrapped workstation setup acceptance ends with: recorded, never run. */
function setupStub(): string {
  return stub('setup', `printf '%s\\n' "$*" >> ${JSON.stringify(join(dir, 'setup.args'))}\nexit 0`);
}

/**
 * The client the script resolves the alias with. OpenSSH finds ~/.ssh/config
 * from the password database rather than from HOME, so without -F it would read
 * the configuration of whoever runs this suite. Given -F it reads this suite's
 * file and nothing else.
 */
function aliasSsh(): string {
  return stub('alias-ssh', `exec ${REAL_SSH} -F ${JSON.stringify(join(home, '.ssh', 'config'))} "$@"`);
}

/** A sealed file in age's shape: a header naming the key, then the bundle. */
function seal(overrides: Record<string, string> = {}, extraLine = '') {
  const values: Record<string, string> = {
    TARGET: 'staging',
    ACCOUNT,
    FULL_NAME: 'James Leberknight',
    HOST_PASSWORD: ONE_TIME,
    AWS_ACCESS_KEY_ID: KEY_ID,
    AWS_SECRET_ACCESS_KEY: SECRET,
    AWS_ACCOUNT_ID: '000000000000',
    DEV_TESTER_ROLE_ARN: 'arn:aws:iam::000000000000:role/FootbagDevTester',
    STAGING_RUNTIME_ROLE_ARN: 'arn:aws:iam::000000000000:role/footbag-staging-app-runtime',
    HOST_ADDRESS: ADDRESS,
    HOST_PORT: '2222',
    ...overrides,
  };
  const pub = readFileSync(join(home, '.ssh', 'id_ed25519_footbag_operator.pub'), 'utf-8').trim();
  const r = spawnSync(
    'bash',
    [
      '-c',
      [
        `source ${JSON.stringify(LIB)}`,
        ...Object.entries(values).map(([k, v]) => `DELIVERY_${k}=${JSON.stringify(v)}`),
        `DELIVERY_PINS=(${JSON.stringify(`${ADDRESS} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureHost`)} ${JSON.stringify(
          `[${ADDRESS}]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureHost`,
        )})`,
        `tag="$(delivery_age_recipient_tag ${JSON.stringify(pub)})"`,
        `{ echo age-encryption.org/v1; echo "-> ssh-ed25519 $tag share"; echo body; echo "--- mac"; delivery_bundle_emit; printf '%s' ${JSON.stringify(extraLine)}; } > ${JSON.stringify(sealed)}`,
      ].join('\n'),
    ],
    { encoding: 'utf-8', env: { ...process.env }, ...SPAWN_GUARD },
  );
  expect(r.status, r.stderr).toBe(0);
}

beforeEach(() => {
  dir = createScratchDir('accept-delivery');
  home = join(dir, 'home');
  tmp = join(dir, 'tmp');
  mkdirSync(join(home, '.ssh'), { recursive: true, mode: 0o700 });
  mkdirSync(join(home, '.aws'), { recursive: true });
  mkdirSync(tmp);
  const kg = spawnSync(
    'ssh-keygen',
    ['-q', '-t', 'ed25519', '-N', '', '-C', 'james', '-f', join(home, '.ssh', 'id_ed25519_footbag_operator')],
    { ...SPAWN_GUARD },
  );
  expect(kg.status).toBe(0);
  writeFileSync(join(home, '.aws', 'credentials'), OPERATOR_CRED, { mode: 0o600 });
  writeFileSync(join(home, '.aws', 'config'), OPERATOR_CONFIG);
  hostPassword = join(dir, 'host-password');
  writeFileSync(hostPassword, `${ONE_TIME}\n`);
  sealed = join(dir, `${ACCOUNT}-staging.onboarding.age`);
  seal();
});

afterEach(() => {
  removeScratch(dir);
});

function env(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...NO_AWS_CREDENTIALS,
    HOME: home,
    TMPDIR: tmp,
    PATH: `${realSshFirst()}:${process.env.PATH ?? ''}`,
    AWS_CONFIG_FILE: join(home, '.aws', 'config'),
    AWS_SHARED_CREDENTIALS_FILE: join(home, '.aws', 'credentials'),
    ACCEPT_AWS_BIN: awsStub(),
    ACCEPT_AGE_BIN: ageStub(),
    ACCEPT_SSH_BIN: hostSshStub(),
    DTSK_SSH_BIN: aliasSsh(),
    ACCEPT_PROPAGATION_POLL: '0',
    ACCEPT_PROPAGATION_TRIES: '2',
    ACCEPT_SETUP_CMD: setupStub(),
    // No agent: the offer to add the key to one is its own case.
    SSH_AUTH_SOCK: '',
    ...extra,
  };
}

function args(overrides: Partial<Record<string, string>> = {}): string[] {
  const o = { '--target': 'staging', '--account': ACCOUNT, ...overrides };
  return [...Object.entries(o).flatMap(([k, v]) => (v === '' ? [] : [k, v as string])), sealed];
}

function runPiped(argv: string[]) {
  const r = spawnSync('bash', [SCRIPT, ...argv], {
    encoding: 'utf-8',
    input: '',
    env: { ...process.env, ...env() },
    ...SPAWN_GUARD,
  });
  return { status: r.status, stderr: r.stderr ?? '' };
}

function runInTerminal(terminal: string[], extra: Record<string, string> = {}) {
  const inner = ['bash', JSON.stringify(SCRIPT), ...args().map((a) => JSON.stringify(a))].join(' ');
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: terminal.map((l) => `${l}\n`).join(''),
    env: { ...process.env, ...env(extra) },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: r.stdout ?? '' };
}

/** Every answer a first run asks for, in order. */
// copy the pair, write the profiles, pin, add the stanza, the match block,
// choose the password (typed twice), delete the sealed file, run the setup.
const FIRST_RUN = ['APPLY', 'APPLY', 'APPLY', 'APPLY', 'APPLY', 'APPLY', NEW_PASSWORD, NEW_PASSWORD, 'APPLY', 'APPLY'];

const read = (...p: string[]): string => readFileSync(join(home, ...p), 'utf-8');

describe('accept-dev-tester-onboarding.sh — refused before anything changes', () => {
  it('refuses any environment but staging', () => {
    const r = runPiped(args({ '--target': 'production' }));
    expect(r.status).toBe(2);
  });

  it('refuses footbag-operator and the shared account as the account', () => {
    for (const name of ['footbag-operator', 'footbag']) {
      const r = runPiped(args({ '--account': name }));
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/is not a person's account/);
    }
  });

  it('stops on a missing age with the line that installs it, changing nothing', () => {
    const r = spawnSync('bash', [SCRIPT, ...args()], {
      encoding: 'utf-8',
      input: '',
      env: { ...process.env, ...env({ ACCEPT_AGE_BIN: join(dir, 'no-such-age') }) },
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sudo apt install age');
    expect(r.stderr).toMatch(/Nothing was changed on this machine/);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
    expect(read('.aws', 'config')).toBe(OPERATOR_CONFIG);
    expect(existsSync(join(home, '.ssh', 'config'))).toBe(false);
  });

  it('stops on a missing AWS CLI with its install page, not the age line', () => {
    const r = spawnSync('bash', [SCRIPT, ...args()], {
      encoding: 'utf-8',
      input: '',
      env: { ...process.env, ...env({ ACCEPT_AWS_BIN: join(dir, 'no-such-aws') }) },
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('getting-started-install.html');
    expect(r.stderr).not.toContain('sudo apt install age');
  });

  it('names every missing tool in one run', () => {
    const r = spawnSync('bash', [SCRIPT, ...args()], {
      encoding: 'utf-8',
      input: '',
      env: {
        ...process.env,
        ...env({ ACCEPT_AGE_BIN: join(dir, 'no-such-age'), ACCEPT_AWS_BIN: join(dir, 'no-such-aws') }),
      },
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sudo apt install age');
    expect(r.stderr).toContain('getting-started-install.html');
  });

  it('refuses with no terminal', () => {
    const r = runPiped(args());
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/interactive terminal/);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
  });

  it('refuses a delivery addressed to somebody else, changing nothing', () => {
    seal({ ACCOUNT: 'someone_else' });
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/this delivery is for someone_else/);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
    expect(read('.aws', 'config')).toBe(OPERATOR_CONFIG);
  });

  it('refuses a delivery carrying anything but the known keys', () => {
    seal({}, 'AWS_PROFILE=footbag-operator\n');
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/unknown key 'AWS_PROFILE'/);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
  });

  it('refuses when no key pair on this machine is the one it was sealed to', () => {
    spawnSync('mv', [join(home, '.ssh', 'id_ed25519_footbag_operator.pub'), join(dir, 'away.pub')], { ...SPAWN_GUARD });
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/0 key pairs in ~\/\.ssh match/);
  });

  it('refuses a private key left alone at the named path, before copying anything over it', () => {
    // The copy skips a file already there, so an orphan would be paired with a
    // public half that is not its own and age would fail later without a reason.
    const named = join(home, '.ssh', `id_ed25519_${ACCOUNT}`);
    writeFileSync(named, 'fixture orphan private half\n', { mode: 0o600 });
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/only one half of the key pair is at the path the tooling uses/);
    expect(r.out).toMatch(/Nothing was copied or opened/);
    expect(readFileSync(named, 'utf-8')).toBe('fixture orphan private half\n');
    expect(existsSync(`${named}.pub`)).toBe(false);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
  });

  it('refuses a named pair whose private half does not belong to its public half', () => {
    const named = join(home, '.ssh', `id_ed25519_${ACCOUNT}`);
    const other = join(dir, 'other_key');
    const kg = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', other], { ...SPAWN_GUARD });
    expect(kg.status).toBe(0);
    writeFileSync(`${named}.pub`, read('.ssh', 'id_ed25519_footbag_operator.pub'));
    writeFileSync(named, readFileSync(other, 'utf-8'), { mode: 0o600 });
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/is not the private half of/);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
  });

  it('refuses a private key it cannot read as unreadable, not as a mismatch', () => {
    const named = join(home, '.ssh', `id_ed25519_${ACCOUNT}`);
    writeFileSync(`${named}.pub`, read('.ssh', 'id_ed25519_footbag_operator.pub'));
    writeFileSync(named, 'not a private key\n', { mode: 0o600 });
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/ssh-keygen could not read the private key/);
    expect(r.out).not.toMatch(/is not the private half of/);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
  });

  it('refuses a job-role profile that already chains from somebody else, leaving it alone', () => {
    const theirs = `${OPERATOR_CONFIG}[profile FootbagDevTester]\nrole_arn = x\nsource_profile = david_leberknight\n`;
    writeFileSync(join(home, '.aws', 'config'), theirs);
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/already chains from\s+\[david_leberknight\]/);
    expect(read('.aws', 'config')).toBe(theirs);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
  });

  it('refuses when a fresh session is refused, however the cached role profile answers', () => {
    // The profile answers from the CLI's cache, which can hold a session from
    // before an offboard; only a fresh assume with the new key proves the grant.
    const r = runInTerminal(FIRST_RUN, { ACCEPT_AWS_BIN: awsStub({ fresh: 'refused' }) });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/a fresh session of FootbagDevTester, signed with your new key, was not/);
    expect(r.out).toMatch(/AccessDenied/);
    expect(existsSync(join(home, 'AWS', 'DEV_TESTER_HOST.txt'))).toBe(false);
  });

  it('refuses a session the job role names after somebody else', () => {
    const r = runInTerminal(FIRST_RUN, { ACCEPT_AWS_BIN: awsStub({ session: 'someone_else' }) });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/session is named 'someone_else'/);
  });

  it('never edits a stanza of its own that points at another host', () => {
    const own = 'Host footbag-staging\n  Hostname 198.51.100.7\n  User footbag\n';
    writeFileSync(join(home, '.ssh', 'config'), own);
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/points at '198\.51\.100\.7'/);
    expect(read('.ssh', 'config')).toBe(own);
  });

  it('stops when the host no longer accepts the one-time password', () => {
    writeFileSync(hostPassword, 'somebody-changed-it\n');
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/refuses the one-time password/);
    expect(existsSync(join(home, 'AWS', 'DEV_TESTER_HOST.txt'))).toBe(false);
  });
});

describe('accept-dev-tester-onboarding.sh — failures it must not misreport', () => {
  it('says the host could not be reached, rather than that the password was refused', () => {
    writeFileSync(join(dir, 'unreachable'), '');
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not reach 203\.0\.113\.10/);
    expect(r.out).not.toMatch(/refuses the one-time password/);
    expect(readFileSync(hostPassword, 'utf-8')).toBe(`${ONE_TIME}\n`);
  });

  it('ends the run on an interrupt, rather than carrying on with its secrets blanked', async () => {
    // Ctrl-C typed at the first confirmation. It is sent only once the prompt
    // is on the terminal, so it reaches the script's own handler rather than a
    // shell that has not installed one yet.
    const inner = ['bash', JSON.stringify(SCRIPT), ...args().map((a) => JSON.stringify(a))].join(' ');
    const child = spawn('script', ['-qec', inner, '/dev/null'], {
      env: { ...process.env, ...env() },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let sent = false;
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf-8');
      if (!sent && /Type 'APPLY'/.test(out)) {
        sent = true;
        child.stdin.write('\x03');
      }
    });
    const status = await new Promise<number | null>((resolve) => {
      const guard = setTimeout(() => child.kill('SIGKILL'), SPAWN_GUARD.timeout);
      child.on('close', (code) => {
        clearTimeout(guard);
        resolve(code);
      });
    });
    expect(sent, out).toBe(true);
    expect(status, out).toBe(130);
    expect(out).not.toMatch(/Not confirmed/);
  });
});

describe('accept-dev-tester-onboarding.sh — the pin file', () => {
  it('replaces only this host\'s lines, never a host whose name merely contains it', () => {
    // On a dev-and-tester's own machine; an administrator's pins are never
    // replaced, which the maintainer-machine cases cover.
    devMachine();
    mkdirSync(join(home, 'AWS'), { recursive: true });
    const lookalike = `1${ADDRESS} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherHost`;
    const stale = `${ADDRESS} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIStaleKey`;
    writeFileSync(join(home, 'AWS', 'footbag_known_hosts'), `${lookalike}\n${stale}\n`, { mode: 0o600 });
    const r = runInTerminal(FIRST_RUN);
    expect(r.status, r.out).toBe(0);
    const pins = read('AWS', 'footbag_known_hosts');
    expect(pins).toContain(lookalike);
    expect(pins).not.toContain(stale);
  });
});

/** A dev-and-tester's own machine: no administrator profile, nothing administrative. */
function devMachine(): void {
  writeFileSync(join(home, '.aws', 'credentials'), '', { mode: 0o600 });
  writeFileSync(join(home, '.aws', 'config'), '');
}

describe('accept-dev-tester-onboarding.sh — the staging runtime chain', () => {
  it('proves the chain it wrote reaches the staging runtime role', () => {
    devMachine();
    const r = runInTerminal(FIRST_RUN);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/\[profile footbag-staging-runtime\] chains through FootbagDevTester to footbag-staging-app-runtime/);
  });

  it('never writes the runtime chain on a machine that carries the footbag-operator profile', () => {
    // There that name is the administrators' chain; a chain through the job
    // role under it would change what every administrator run acts as.
    const r = runInTerminal(FIRST_RUN);
    expect(r.status, r.out).toBe(0);
    expect(read('.aws', 'config')).not.toMatch(/\[profile footbag-staging-runtime\]/);
    expect(r.out).toMatch(/is the administrators' chain here and is not written by this run/);
  });

  it('refuses when that chain lands on some other role', () => {
    devMachine();
    const r = runInTerminal(FIRST_RUN, { ACCEPT_AWS_BIN: awsStub({ runtimeRole: 'some-other-role' }) });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/not footbag-staging-app-runtime/);
  });

  it('leaves an administrative runtime chain on the same machine exactly as it is', () => {
    // A holder onboarding themselves accepts on the machine that already runs
    // staging work as footbag-operator; that chain is theirs as an administrator.
    const adminChain =
      '[profile footbag-staging-runtime]\nrole_arn = arn:aws:iam::000000000000:role/footbag-staging-app-runtime\nsource_profile = footbag-operator\n';
    writeFileSync(join(home, '.aws', 'config'), OPERATOR_CONFIG + adminChain);
    const r = runInTerminal(FIRST_RUN.slice(0, -1).concat(['APPLY']));
    expect(r.status, r.out).toBe(0);
    const config = read('.aws', 'config');
    expect(config).toContain(adminChain);
    expect(config.match(/\[profile footbag-staging-runtime\]/g)).toHaveLength(1);
    expect(r.out).toMatch(/chains from \[footbag-operator\] on this machine/);
  });
});

describe('accept-dev-tester-onboarding.sh — a whole acceptance', () => {
  it('puts everything where the tooling expects it, and replaces the one-time password', () => {
    devMachine();
    const r = runInTerminal(FIRST_RUN);
    expect(r.status, r.out).toBe(0);

    expect(existsSync(join(home, '.ssh', `id_ed25519_${ACCOUNT}`))).toBe(true);
    // Copied, not moved: whatever else signs with the pair it was sealed to
    // still finds it where it was.
    expect(existsSync(join(home, '.ssh', 'id_ed25519_footbag_operator'))).toBe(true);
    expect(read('.ssh', `id_ed25519_${ACCOUNT}`)).toBe(read('.ssh', 'id_ed25519_footbag_operator'));
    expect(statSync(join(home, '.ssh', `id_ed25519_${ACCOUNT}`)).mode & 0o777).toBe(0o600);

    const creds = read('.aws', 'credentials');
    expect(creds).toContain(`[${ACCOUNT}]`);
    expect(creds).toContain(KEY_ID);
    const config = read('.aws', 'config');
    expect(config).toMatch(/\[profile FootbagDevTester\]\nrole_arn\s+= arn:aws:iam::000000000000:role\/FootbagDevTester\nsource_profile = james_leberknight\nrole_session_name = james_leberknight/);
    expect(config).toMatch(/\[profile footbag-staging-runtime\]\nrole_arn\s+= \S+footbag-staging-app-runtime\nsource_profile = FootbagDevTester/);

    const pins = read('AWS', 'footbag_known_hosts');
    expect(pins.split('\n').filter(Boolean)).toHaveLength(2);
    expect(statSync(join(home, 'AWS', 'footbag_known_hosts')).mode & 0o777).toBe(0o600);

    const ssh = read('.ssh', 'config');
    expect(ssh).toContain(`Host footbag-staging\n  Hostname ${ADDRESS}\n  Port 2222\n  User footbag`);
    expect(ssh).toContain(`Match host footbag-staging exec "test x$AWS_PROFILE = xFootbagDevTester"\n  User ${ACCOUNT}`);

    expect(readFileSync(hostPassword, 'utf-8')).toBe(`${NEW_PASSWORD}\n`);
    expect(read('AWS', 'DEV_TESTER_HOST.txt')).toBe(`${NEW_PASSWORD}\n`);
    expect(statSync(join(home, 'AWS', 'DEV_TESTER_HOST.txt')).mode & 0o777).toBe(0o600);
    expect(existsSync(sealed)).toBe(false);
  });

  it('shows no secret on the terminal and leaves no cleartext in temp', () => {
    const r = runInTerminal(FIRST_RUN);
    expect(r.status, r.out).toBe(0);
    // The terminal echoes the answers typed ahead before the script turns echo
    // off, so what is judged is the script's own output, from its first step.
    const own = r.out.slice(r.out.indexOf('==> Your key pair'));
    expect(own.length).toBeGreaterThan(0);
    expect(own).not.toContain(ONE_TIME);
    expect(own).not.toContain(SECRET);
    expect(own).not.toContain(NEW_PASSWORD);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('removes their cached job-role sessions when it writes a new key, and nobody else\'s', () => {
    // A re-onboarding leaves the role profile as it was, so without this the CLI
    // goes on answering it with a session from before the offboard, which the
    // role refuses on real work until it expires.
    const cache = join(home, '.aws', 'cli', 'cache');
    mkdirSync(cache, { recursive: true });
    const theirs = join(cache, 'theirs.json');
    const longerName = join(cache, 'longer-name.json');
    const other = join(cache, 'other.json');
    const entry = (session: string) =>
      JSON.stringify({ Credentials: { AccessKeyId: 'ASIAFIXTURE' }, AssumedRoleUser: { Arn: `arn:aws:sts::000000000000:assumed-role/FootbagDevTester/${session}` } });
    writeFileSync(theirs, entry(ACCOUNT), { mode: 0o600 });
    writeFileSync(longerName, entry(`${ACCOUNT}2`), { mode: 0o600 });
    writeFileSync(other, entry('someone_else'), { mode: 0o600 });
    const r = runInTerminal(FIRST_RUN);
    expect(r.status, r.out).toBe(0);
    expect(existsSync(theirs)).toBe(false);
    expect(existsSync(longerName)).toBe(true);
    expect(existsSync(other)).toBe(true);
    expect(r.out).toContain(`removed a cached FootbagDevTester session of ${ACCOUNT}'s`);
  });

  it('finds every step already done on a second run', () => {
    const first = runInTerminal([...FIRST_RUN.slice(0, -2), 'no', 'no']);
    expect(first.status, first.out).toBe(0);
    const credsAfterFirst = read('.aws', 'credentials');
    const configAfterFirst = read('.aws', 'config');
    const sshAfterFirst = read('.ssh', 'config');

    const second = runInTerminal(['no']);
    expect(second.status, second.out).toBe(0);
    expect(second.out).toMatch(/already in place/);
    expect(second.out).toMatch(/already pinned/);
    expect(second.out).toMatch(/already done: sudo accepts/);
    expect(read('.aws', 'credentials')).toBe(credsAfterFirst);
    expect(read('.aws', 'config')).toBe(configAfterFirst);
    expect(read('.ssh', 'config')).toBe(sshAfterFirst);
  });
});

/** A run through a terminal with explicit arguments, the sealed file included or not. */
function runWith(argv: string[], terminal: string[], extra: Record<string, string> = {}, cwd = dir) {
  const inner = ['bash', JSON.stringify(SCRIPT), ...argv.map((a) => JSON.stringify(a))].join(' ');
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    cwd,
    input: terminal.map((l) => `${l}\n`).join(''),
    env: { ...process.env, ...env(extra) },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: r.stdout ?? '' };
}

describe('accept-dev-tester-onboarding.sh — before anything is opened', () => {
  const NO_FILE = ['--target', 'staging', '--account', ACCOUNT];

  it('finds the sealed file in ~/Downloads when it is not named', () => {
    devMachine();
    mkdirSync(join(home, 'Downloads'));
    renameSync(sealed, join(home, 'Downloads', `${ACCOUNT}-staging.onboarding.age`));
    const r = runWith(NO_FILE, FIRST_RUN, {}, tmp);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain(`Using ${join(home, 'Downloads', `${ACCOUNT}-staging.onboarding.age`)}`);
  });

  it('asks which one when two copies are found, rather than choosing', () => {
    mkdirSync(join(home, 'Downloads'));
    mkdirSync(join(home, 'AWS'), { recursive: true });
    copyFileSync(sealed, join(home, 'Downloads', `${ACCOUNT}-staging.onboarding.age`));
    copyFileSync(sealed, join(home, 'AWS', `${ACCOUNT}-staging.onboarding.age`));
    const r = runWith(NO_FILE, [], {}, tmp);
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/more than one james_leberknight-staging\.onboarding\.age/);
  });

  it('says where to put it when none is found', () => {
    const r = runWith(NO_FILE, [], {}, tmp);
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/no james_leberknight-staging\.onboarding\.age in ~\/Downloads, ~\/AWS or here/);
  });

  it('refuses a Terraform at another version than the pinned one, before opening anything', () => {
    const wrong = join(dir, 'wrong-tf');
    mkdirSync(wrong);
    writeFileSync(join(wrong, 'terraform'), '#!/usr/bin/env bash\necho "Terraform v0.0.1"\n', { mode: 0o755 });
    const r = runWith(args(), [], { PATH: `${wrong}:${realSshFirst()}:${process.env.PATH ?? ''}` });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/terraform 0\.0\.1 is installed/);
    expect(r.out).not.toMatch(/Opening the delivery/);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
  });

  it('names a tool the staging work needs in the list of what is missing', () => {
    // The library's report, driven directly: which tools a machine lacks is a
    // property of that machine, so the suite hands it a command that cannot exist.
    const r = spawnSync('bash', ['-c', `source ${JSON.stringify(LIB)}; delivery_require_tools terraform=${join(dir, 'no-such-terraform')} docker=${join(dir, 'no-such-docker')}`], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/- terraform, which the staging deploy and tests use/);
    expect(r.stderr).toMatch(/- docker, which builds what the staging deploy ships/);
  });

  it('refuses an AWS CLI at another version than the pinned one, changing nothing', () => {
    const old = stub('aws-old', '[[ "$1" == "--version" ]] && echo "aws-cli/1.0.0 Python/3"; exit 0');
    const r = runWith(args(), [], { ACCEPT_AWS_BIN: old });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(new RegExp(`the AWS CLI is not ${AWS_PIN.replace(/\./g, '\\.')}`));
    expect(r.out).toMatch(/setup-dev-workstation\.sh --aws --account james_leberknight/);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
  });

  it('offers to hold the key in a running agent for eight hours', () => {
    devMachine();
    const added = join(dir, 'ssh-add.args');
    const sshAdd = stub('ssh-add', `[[ "$1" == "-l" ]] && exit 1; printf '%s\\n' "$*" > ${JSON.stringify(added)}`);
    // The offer comes right after the pair is copied into place.
    const answers = [FIRST_RUN[0], 'APPLY', ...FIRST_RUN.slice(1)];
    const r = runInTerminal(answers, { SSH_AUTH_SOCK: join(dir, 'agent.sock'), ACCEPT_SSH_ADD_BIN: sshAdd });
    expect(r.status, r.out).toBe(0);
    expect(readFileSync(added, 'utf-8').trim()).toBe(`-t 8h ${join(home, '.ssh', `id_ed25519_${ACCOUNT}`)}`);
  });
});

describe('accept-dev-tester-onboarding.sh on a maintainer\'s own machine', () => {
  it('adds only the person\'s own sections, and leaves every administrative file and section as it was', () => {
    // A holder accepts their own onboarding on the machine that holds
    // footbag-operator, both runtime chains, the shared password files, a pin
    // file that already verifies staging and the alias stanzas.
    seedMaintainerMachine(home, [
      `${ADDRESS} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureHost`,
      `[${ADDRESS}]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureHost`,
    ]);
    const before = snapshotAdminFiles(home);
    // copy the pair, write the profiles, the match block, choose the password
    // (typed twice), delete the sealed file, run the setup: no pin, no stanza.
    const r = runInTerminal(['APPLY', 'APPLY', 'APPLY', 'APPLY', NEW_PASSWORD, NEW_PASSWORD, 'APPLY', 'APPLY']);
    expect(r.status, r.out).toBe(0);
    const after = snapshotAdminFiles(home);
    expect(after['AWS/AWS_OPERATOR.txt']).toBe(before['AWS/AWS_OPERATOR.txt']);
    expect(after['AWS/AWS_OPERATOR_PRODUCTION.txt']).toBe(before['AWS/AWS_OPERATOR_PRODUCTION.txt']);
    expect(after['AWS/footbag_known_hosts']).toBe(before['AWS/footbag_known_hosts']);
    expect(after['.aws/credentials']!.startsWith(OPERATOR_SECTION)).toBe(true);
    expect(stillHolds(home, '.aws/config', OPERATOR_PROFILES)).toBe(true);
    expect(after['.aws/config']!.match(/\[profile footbag-staging-runtime\]/g)).toHaveLength(1);
    expect(stillHolds(home, '.ssh/config', ADMIN_STANZAS)).toBe(true);
    expect(after['.aws/credentials']).toContain(`[${ACCOUNT}]`);
  });

  it('refuses a delivery whose host keys disagree with the administrators\' pins, before writing any profile', () => {
    // A stale delivery or a rebuilt host: replacing the pins would change what
    // every administrator connection to staging trusts.
    seedMaintainerMachine(home, [
      `${ADDRESS} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherHostKey`,
      `[${ADDRESS}]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherHostKey`,
    ]);
    const before = snapshotAdminFiles(home);
    const r = runInTerminal(['APPLY', 'APPLY', 'APPLY', 'APPLY']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/already pins \S+ with a different key than\s+this delivery carries/);
    expect(r.out).toMatch(/install-known-hosts\.sh --target staging/);
    const after = snapshotAdminFiles(home);
    expect(after['AWS/footbag_known_hosts']).toBe(before['AWS/footbag_known_hosts']);
    expect(after['.aws/credentials']).toBe(before['.aws/credentials']);
    expect(after['.aws/config']).toBe(before['.aws/config']);
  });

  it('still treats the machine as an administrator\'s when the CLI cannot list profiles, from the files themselves', () => {
    // A CLI that fails on a malformed file must not read as "no footbag-operator
    // here", or the job-role chain is written under the administrators' name.
    const listFails = stub('aws-list-fails', `[[ "$1 $2" == "configure list-profiles" ]] && exit 255\nexec ${awsStub()} "$@"`);
    const r = runInTerminal(FIRST_RUN, { ACCEPT_AWS_BIN: listFails });
    expect(r.status, r.out).toBe(0);
    expect(read('.aws', 'config')).not.toMatch(/\[profile footbag-staging-runtime\]/);
    expect(r.out).toMatch(/is the administrators' chain here and is not written by this run/);
  });

  it('refuses, writing no profile, when the CLI cannot list profiles and the files name no administrator', () => {
    devMachine();
    const listFails = stub('aws-list-fails', `[[ "$1 $2" == "configure list-profiles" ]] && exit 255\nexec ${awsStub()} "$@"`);
    const r = runInTerminal(FIRST_RUN, { ACCEPT_AWS_BIN: listFails });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not list this machine's profiles/);
    expect(read('.aws', 'config')).toBe('');
    expect(read('.aws', 'credentials')).toBe('');
  });
});

describe('accept-dev-tester-onboarding.sh — what it leaves at the end', () => {
  it('leaves a pin file that already verifies the host byte for byte, however it is written', () => {
    // One line naming both forms of the host, which ssh accepts and an exact
    // line comparison does not: an administrator's working pin file is left alone.
    mkdirSync(join(home, 'AWS'), { recursive: true });
    const pins = `${ADDRESS},[${ADDRESS}]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureHost\n`;
    writeFileSync(join(home, 'AWS', 'footbag_known_hosts'), pins, { mode: 0o600 });
    const answers = FIRST_RUN.filter((_, i) => i !== 2); // no pin confirmation is asked
    const r = runInTerminal(answers);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/already pinned/);
    expect(read('AWS', 'footbag_known_hosts')).toBe(pins);
  });

  it('records which pair was accepted, for a later re-onboarding to retire', () => {
    devMachine();
    const r = runInTerminal(FIRST_RUN);
    expect(r.status, r.out).toBe(0);
    const fp = spawnSync('ssh-keygen', ['-l', '-f', join(home, '.ssh', `id_ed25519_${ACCOUNT}.pub`)], { encoding: 'utf-8', ...SPAWN_GUARD })
      .stdout.split(' ')[1];
    expect(read('.ssh', `id_ed25519_${ACCOUNT}.onboarded`)).toBe(`${fp}\n`);
  });

  it('ends with the workstation setup and its check, run through the wrapper, and the evidence block', () => {
    devMachine();
    const r = runInTerminal(FIRST_RUN);
    expect(r.status, r.out).toBe(0);
    expect(read('..', 'setup.args')).toBe('--target staging\n--target staging --check\n');
    expect(r.out).toContain(`assumed role:  arn:aws:sts::000000000000:assumed-role/FootbagDevTester/${ACCOUNT}`);
    expect(r.out).toContain(`access key id: ${KEY_ID}`);
  });

  it('runs no setup when it is declined, and still finishes', () => {
    devMachine();
    const r = runInTerminal([...FIRST_RUN.slice(0, -1), 'no']);
    expect(r.status, r.out).toBe(0);
    expect(existsSync(join(dir, 'setup.args'))).toBe(false);
  });

  it('says so, and fails, when the workstation check still lists something to do', () => {
    devMachine();
    const failing = stub('setup-failing', '[[ "$*" == *--check* ]] && exit 1; exit 0');
    const r = runInTerminal(FIRST_RUN, { ACCEPT_SETUP_CMD: failing });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/still lists something to do/);
  });
});
