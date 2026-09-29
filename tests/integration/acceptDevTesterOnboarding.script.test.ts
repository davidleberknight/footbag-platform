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
} from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

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

function awsStub(opts: { session?: string; runtimeRole?: string } = {}): string {
  return stub(
    `aws-${opts.session ?? 'own'}-${opts.runtimeRole ?? 'runtime'}`,
    `
profile=""
while [[ $# -gt 0 ]]; do [[ "$1" == "--profile" ]] && profile="$2"; shift; done
case "$profile" in
  ${ACCOUNT}) echo "arn:aws:iam::000000000000:user/footbag-operators/${ACCOUNT}" ;;
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
  }
  return bin;
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
    OPERATOR: 'James Leberknight',
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
    OSK_SSH_BIN: aliasSsh(),
    ACCEPT_PROPAGATION_POLL: '0',
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
const FIRST_RUN = ['APPLY', 'APPLY', 'APPLY', 'APPLY', 'APPLY', 'APPLY', NEW_PASSWORD, NEW_PASSWORD, 'APPLY'];

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

  it('refuses a job-role profile that already chains from somebody else, leaving it alone', () => {
    const theirs = `${OPERATOR_CONFIG}[profile FootbagDevTester]\nrole_arn = x\nsource_profile = david_leberknight\n`;
    writeFileSync(join(home, '.aws', 'config'), theirs);
    const r = runInTerminal(FIRST_RUN);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/already chains from\s+\[david_leberknight\]/);
    expect(read('.aws', 'config')).toBe(theirs);
    expect(read('.aws', 'credentials')).toBe(OPERATOR_CRED);
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
    expect(existsSync(join(home, 'AWS', 'HOST_OPERATOR.txt'))).toBe(false);
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

describe('accept-dev-tester-onboarding.sh — the staging runtime chain', () => {
  it('proves the chain it wrote reaches the staging runtime role', () => {
    const r = runInTerminal(FIRST_RUN);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/\[profile footbag-staging-runtime\] chains through FootbagDevTester to footbag-staging-app-runtime/);
  });

  it('refuses when that chain lands on some other role', () => {
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
    const r = runInTerminal(FIRST_RUN);
    expect(r.status, r.out).toBe(0);

    expect(existsSync(join(home, '.ssh', `id_ed25519_${ACCOUNT}`))).toBe(true);
    // Copied, not moved: whatever else signs with the pair it was sealed to
    // still finds it where it was.
    expect(existsSync(join(home, '.ssh', 'id_ed25519_footbag_operator'))).toBe(true);
    expect(read('.ssh', `id_ed25519_${ACCOUNT}`)).toBe(read('.ssh', 'id_ed25519_footbag_operator'));
    expect(statSync(join(home, '.ssh', `id_ed25519_${ACCOUNT}`)).mode & 0o777).toBe(0o600);

    const creds = read('.aws', 'credentials');
    expect(creds.startsWith(OPERATOR_CRED)).toBe(true);
    expect(creds).toContain(`[${ACCOUNT}]`);
    expect(creds).toContain(KEY_ID);
    const config = read('.aws', 'config');
    expect(config.startsWith(OPERATOR_CONFIG)).toBe(true);
    expect(config).toMatch(/\[profile FootbagDevTester\]\nrole_arn\s+= arn:aws:iam::000000000000:role\/FootbagDevTester\nsource_profile = james_leberknight\nrole_session_name = james_leberknight/);
    expect(config).toMatch(/\[profile footbag-staging-runtime\]\nrole_arn\s+= \S+footbag-staging-app-runtime\nsource_profile = FootbagDevTester/);

    const pins = read('AWS', 'footbag_known_hosts');
    expect(pins.split('\n').filter(Boolean)).toHaveLength(2);
    expect(statSync(join(home, 'AWS', 'footbag_known_hosts')).mode & 0o777).toBe(0o600);

    const ssh = read('.ssh', 'config');
    expect(ssh).toContain(`Host footbag-staging\n  Hostname ${ADDRESS}\n  Port 2222\n  User footbag`);
    expect(ssh).toContain(`Match host footbag-staging exec "test x$AWS_PROFILE = xFootbagDevTester"\n  User ${ACCOUNT}`);

    expect(readFileSync(hostPassword, 'utf-8')).toBe(`${NEW_PASSWORD}\n`);
    expect(read('AWS', 'HOST_OPERATOR.txt')).toBe(`${NEW_PASSWORD}\n`);
    expect(statSync(join(home, 'AWS', 'HOST_OPERATOR.txt')).mode & 0o777).toBe(0o600);
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

  it('finds every step already done on a second run', () => {
    const first = runInTerminal([...FIRST_RUN.slice(0, -1), 'no']);
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
