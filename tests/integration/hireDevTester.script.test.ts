/**
 * scripts/hire-dev-tester.sh — hiring somebody who is not at this keyboard, and
 * sealing what they need to their own public key.
 *
 * The refusals are pinned first, because each stops the run before anything
 * exists: the wrong environment, a name that is not a person, a key age cannot
 * seal to, no terminal for the typed confirmations. Then one whole run against
 * stubs, driven through a terminal, which is where the promises that matter can
 * be checked at all: the directly authenticated identity is untouched in AWS and
 * on this machine, no secret reaches the terminal, and the sealed bundle carries
 * exactly what the host step and IAM handed back. Last, a run whose sealing
 * fails, which must withdraw the key it minted and the user it created while
 * leaving the recorded host account alone.
 *
 * Every external tool is a stub: aws, the host step, age and Terraform. age's
 * stub writes the header age would and copies the cleartext after it, so the
 * suite can read the bundle; that the header tag is age's own is proved against
 * the real binary in the delivery-format suite.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, chmodSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/hire-dev-tester.sh');
const ACCOUNT = 'james_leberknight';
const OPERATOR_ARN = 'arn:aws:iam::000000000000:user/footbag-operator';
const MINTED_KEY_ID = 'AKIAFIXTUREMINTED001';
const MINTED_SECRET = 'fixture/minted+secret=value000000000000';
const ONE_TIME = 'fixtureOneTimePassword0000000000';

let dir: string;
let home: string;
let tmp: string;
let pub: string;
let configFile: string;
let credFile: string;

const OPERATOR_CRED =
  '[footbag-operator]\naws_access_key_id = AKIAOPERATORFIXTURE0\naws_secret_access_key = operator-fixture-secret\n';
const OPERATOR_CONFIG = '[profile footbag-operator]\nregion = us-east-1\n';

function stub(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\nset -u\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/**
 * aws, answering the calls a first hire makes against an account with the role
 * applied and no user of the name, and logging every call.
 */
function awsStub(): string {
  const log = join(dir, 'calls.log');
  return stub(
    'aws',
    `
printf '%s\\n' "$*" >> ${JSON.stringify(log)}
case "$1 $2" in
  "sts get-caller-identity") echo ${JSON.stringify(OPERATOR_ARN)} ;;
  "iam get-role") exit 0 ;;
  "iam get-user") exit 254 ;;
  "iam create-user"|"iam put-user-policy"|"iam delete-user-policy"|"iam delete-user"|"iam delete-access-key") exit 0 ;;
  "iam get-login-profile") exit 254 ;;
  "iam list-access-keys")
    case "$*" in *"length("*) echo 0 ;; *) : ;; esac ;;
  "iam create-access-key") printf '%s\\t%s\\n' ${JSON.stringify(MINTED_KEY_ID)} ${JSON.stringify(MINTED_SECRET)} ;;
  "lightsail get-instance-access-details")
    printf 'ssh-ed25519\\tAAAAC3NzaC1lZDI1NTE5AAAAIFixtureHostKeyEd25519\\n'
    printf 'ssh-rsa\\tAAAAB3NzaC1yc2EAAAADAQABFixtureHostKeyRsa\\n' ;;
  *) echo "unexpected aws call: $*" >&2; exit 64 ;;
esac`,
  );
}

/** The host step: records how it was called and hands back a password. */
function provisionStub(): string {
  return stub(
    'provision',
    `
printf '%s\\n' "$*" > ${JSON.stringify(join(dir, 'provision.args'))}
printf '%s\\n' "\${OPACC_SEALED_OUT:-}" > ${JSON.stringify(join(dir, 'provision.out'))}
IFS= read -r sudo_line || true
printf '%s\\n' "$sudo_line" > ${JSON.stringify(join(dir, 'provision.stdin'))}
printf '%s\\n' ${JSON.stringify(ONE_TIME)} > "$OPACC_SEALED_OUT"`,
  );
}

/**
 * age: writes the header age would for an SSH recipient, then the cleartext, so
 * the bundle can be read back. Fails on demand, for the unfinished-run case.
 */
function ageStub(): string {
  return stub(
    'age',
    `
[[ "\${1:-}" == "--version" ]] && { echo v-stub; exit 0; }
[[ -e ${JSON.stringify(join(dir, 'age-fails'))} ]] && exit 1
key="$2"; out="$4"; in="$5"
tag="$(awk '{print $2}' <<<"$key" | base64 -d | openssl dgst -sha256 -binary | head -c 4 | base64 | tr -d '=')"
[[ -e ${JSON.stringify(join(dir, 'age-wrong-recipient'))} ]] && tag="WRONG1"
{ echo "age-encryption.org/v1"; echo "-> ssh-ed25519 $tag stubshare"; echo "stubbody"; echo "--- stubmac"; cat "$in"; } > "$out"`,
  );
}

function terraformStub(): string {
  return stub('terraform', `[[ "$*" == *"output -raw lightsail_static_ip"* ]] && { echo 203.0.113.10; exit 0; }; exit 1`);
}

beforeEach(() => {
  dir = createScratchDir('hire-dev-tester');
  home = join(dir, 'home');
  mkdirSync(home);
  tmp = join(dir, 'tmp');
  mkdirSync(tmp);
  const key = join(dir, 'id_ed25519_james');
  const kg = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'james', '-f', key], {
    ...SPAWN_GUARD,
  });
  expect(kg.status).toBe(0);
  pub = `${key}.pub`;
  configFile = join(dir, 'config');
  credFile = join(dir, 'credentials');
  writeFileSync(configFile, OPERATOR_CONFIG);
  writeFileSync(credFile, OPERATOR_CRED, { mode: 0o600 });
});

afterEach(() => {
  removeScratch(dir);
});

/** The seams and fixtures every run gets, on top of the inherited environment. */
function env(): Record<string, string> {
  return {
    ...NO_AWS_CREDENTIALS,
    ...awsIdentityStubEnv(dir, { profile: ['footbag-operator'] }),
    HOME: home,
    // Where every temp file the run makes lands, so the suite can see that
    // none of them outlives it.
    TMPDIR: tmp,
    AWS_PROFILE: 'footbag-operator',
    AWS_CONFIG_FILE: configFile,
    AWS_SHARED_CREDENTIALS_FILE: credFile,
    HIRE_DEV_TESTER_AWS_BIN: awsStub(),
    HIRE_DEV_TESTER_PROVISION_CMD: provisionStub(),
    HIRE_DEV_TESTER_AGE_BIN: ageStub(),
    TF_OUTPUT_BIN: terraformStub(),
  };
}

function args(overrides: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    '--target': 'staging',
    '--account': ACCOUNT,
    '--operator': 'James Leberknight',
    '--public-key': pub,
    ...overrides,
  };
  return Object.entries(base).flatMap(([k, v]) => (v === '' ? [] : [k, v]));
}

/** Piped stdio: the condition every refusal before the terminal check sees. */
function runPiped(argv: string[], extraEnv: Record<string, string> = {}) {
  const r = spawnSync('bash', [SCRIPT, ...argv], {
    encoding: 'utf-8',
    input: 'fixture-sudo-password\n',
    env: { ...process.env, ...env(), ...extraEnv },
    ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Through `script`, with the sudo password redirected in as documented. */
function runInTerminal(terminal: string) {
  const cred = join(dir, 'cred');
  writeFileSync(cred, 'fixture-sudo-password\n', { mode: 0o600 });
  const inner = ['bash', JSON.stringify(SCRIPT), ...args().map((a) => JSON.stringify(a)), '<', JSON.stringify(cred)].join(' ');
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: terminal,
    env: { ...process.env, ...env() },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: r.stdout ?? '' };
}

function calls(): string[] {
  const log = join(dir, 'calls.log');
  return existsSync(log) ? readFileSync(log, 'utf-8').split('\n').filter(Boolean) : [];
}

function mutatingCalls(): string[] {
  return calls().filter((c) =>
    /\b(create-user|delete-user|put-user-policy|delete-user-policy|create-access-key|update-access-key|delete-access-key|create-login-profile)\b/.test(c),
  );
}

const SEALED = (): string => join(home, 'AWS', `${ACCOUNT}-staging.delivery.age`);

describe('hire-dev-tester.sh — refused before anything is read or reached', () => {
  it('refuses production, which a dev-and-tester never reaches', () => {
    const r = runPiped(args({ '--target': 'production' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/never hired onto production/);
    expect(calls()).toEqual([]);
  });

  it('refuses a missing target', () => {
    const r = runPiped(args({ '--target': '' }));
    expect(r.status).toBe(2);
    expect(calls()).toEqual([]);
  });

  it('refuses the directly authenticated identity as the person hired', () => {
    const r = runPiped(args({ '--account': 'footbag-operator' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/is not a person/);
    expect(calls()).toEqual([]);
  });

  it('refuses the shared host account as the person hired', () => {
    const r = runPiped(args({ '--account': 'footbag' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/is not a person/);
  });

  it('refuses a name that is not firstname_lastname', () => {
    const r = runPiped(args({ '--account': 'James' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not a usable account name/);
  });

  it('refuses a missing full name', () => {
    const r = runPiped(args({ '--operator': '' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--operator/);
  });

  it('refuses a key age cannot seal to', () => {
    const ecdsa = join(dir, 'id_ecdsa');
    spawnSync('ssh-keygen', ['-q', '-t', 'ecdsa', '-N', '', '-f', ecdsa], { ...SPAWN_GUARD });
    const r = runPiped(args({ '--public-key': `${ecdsa}.pub` }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/age seals only to ssh-ed25519 or\s+ssh-rsa/);
  });

  it('refuses a file holding more than one key', () => {
    const two = join(dir, 'two.pub');
    writeFileSync(two, readFileSync(pub, 'utf-8') + readFileSync(pub, 'utf-8'));
    const r = runPiped(args({ '--public-key': two }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not exactly one public key/);
  });

  it('refuses when age is not installed', () => {
    const r = runPiped(args(), { HIRE_DEV_TESTER_AGE_BIN: join(dir, 'no-such-age') });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/sudo apt install age/);
    expect(r.stderr).toMatch(/Nothing was changed on this machine/);
    expect(calls()).toEqual([]);
  });

  it('refuses with no terminal, before any identity is read or anything created', () => {
    const r = runPiped(args());
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no terminal to confirm on/);
    expect(calls()).toEqual([]);
    expect(existsSync(join(dir, 'provision.args'))).toBe(false);
  });
});

describe('hire-dev-tester.sh — a whole hire', () => {
  it('creates nothing without a typed APPLY', () => {
    const r = runInTerminal('no\n');
    expect(r.status).toBe(1);
    expect(mutatingCalls()).toEqual([]);
    expect(existsSync(join(dir, 'provision.args'))).toBe(false);
    expect(existsSync(SEALED())).toBe(false);
  });

  it('seals the host password, the key and the pins to the key given', () => {
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);

    // The host step: sealed mode, the sudo password on its stdin, a hand-back
    // file this run created and has since destroyed.
    expect(readFileSync(join(dir, 'provision.args'), 'utf-8')).toMatch(/--sealed/);
    expect(readFileSync(join(dir, 'provision.args'), 'utf-8')).toContain(`--account ${ACCOUNT}`);
    expect(readFileSync(join(dir, 'provision.stdin'), 'utf-8')).toBe('fixture-sudo-password\n');
    const handBack = readFileSync(join(dir, 'provision.out'), 'utf-8').trim();
    expect(handBack).not.toBe('');
    expect(existsSync(handBack)).toBe(false);

    const sealed = SEALED();
    expect(statSync(sealed).mode & 0o777).toBe(0o600);
    const body = readFileSync(sealed, 'utf-8').split('--- stubmac\n')[1];
    expect(body).toContain(`ACCOUNT=${ACCOUNT}\n`);
    expect(body).toContain(`HOST_PASSWORD=${ONE_TIME}\n`);
    expect(body).toContain(`AWS_ACCESS_KEY_ID=${MINTED_KEY_ID}\n`);
    expect(body).toContain(`AWS_SECRET_ACCESS_KEY=${MINTED_SECRET}\n`);
    expect(body).toContain('DEV_TESTER_ROLE_ARN=arn:aws:iam::000000000000:role/FootbagDevTester\n');
    expect(body).toContain('HOST_ADDRESS=203.0.113.10\n');
    expect(body.match(/^PIN=/gm)).toHaveLength(4);
    expect(body).toContain('PIN=[203.0.113.10]:2222 ssh-ed25519 ');
  });

  it('shows no secret on the terminal, and asks for no vault entry', () => {
    // A dev-and-tester has no vault entry: who holds the access is read live
    // from the host and IAM, and the hire's card records who approved it.
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(r.out).not.toContain(ONE_TIME);
    expect(r.out).not.toContain(MINTED_SECRET);
    expect(r.out).not.toMatch(/Title:/);
    expect(r.out).toMatch(/Nothing goes in the vault: a dev-and-tester has no vault entry/);
    expect(r.out).toContain(`The access key id issued is ${MINTED_KEY_ID}`);
    expect(r.out).toContain('accept-dev-tester-delivery.sh');
  });

  it('leaves the directly authenticated identity untouched, in AWS and on this machine', () => {
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(readFileSync(credFile, 'utf-8')).toBe(OPERATOR_CRED);
    expect(readFileSync(configFile, 'utf-8')).toBe(OPERATOR_CONFIG);
    expect(mutatingCalls().length).toBeGreaterThan(0);
    expect(mutatingCalls().filter((c) => /--user-name footbag-operator\b/.test(c))).toEqual([]);
    expect(mutatingCalls().filter((c) => !/--user-name /.test(c))).toEqual([]);
    expect(mutatingCalls().every((c) => c.includes(`--user-name ${ACCOUNT}`))).toBe(true);
  });

  it('leaves no cleartext behind, beside the sealed file or in temp', () => {
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(readdirSync(join(home, 'AWS'))).toEqual([`${ACCOUNT}-staging.delivery.age`]);
    expect(readdirSync(tmp).filter((f) => !f.startsWith('tf-'))).toEqual([]);
  });
});

describe('hire-dev-tester.sh — a hire that stops after the host step', () => {
  it('withdraws the key and the user it created, and leaves the host account', () => {
    writeFileSync(join(dir, 'age-fails'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(calls().some((c) => c.startsWith(`iam delete-access-key --user-name ${ACCOUNT} --access-key-id ${MINTED_KEY_ID}`))).toBe(true);
    expect(calls().some((c) => c.startsWith(`iam delete-user --user-name ${ACCOUNT}`))).toBe(true);
    expect(r.out).toMatch(/is left in place and is NOT being removed/);
    expect(existsSync(SEALED())).toBe(false);
    expect(existsSync(join(home, 'AWS')) ? readdirSync(join(home, 'AWS')) : []).toEqual([]);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('refuses a sealed file addressed to any key but the one given', () => {
    writeFileSync(join(dir, 'age-wrong-recipient'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/not addressed to exactly the key given/);
    expect(existsSync(SEALED())).toBe(false);
    expect(calls().some((c) => c.startsWith(`iam delete-access-key --user-name ${ACCOUNT}`))).toBe(true);
    expect(readdirSync(tmp)).toEqual([]);
  });
});
