/**
 * scripts/onboard-dev-tester.sh — onboarding one dev-and-tester, and sealing
 * what they need to their own public key. The same run serves a person on
 * another machine and a holder onboarding themselves, so nothing here depends
 * on who is at the keyboard.
 *
 * The refusals are pinned first, because each stops the run before anything
 * exists: the wrong environment, a name that is not a person, a key age cannot
 * seal to, no address for the allow-list, no terminal for the typed
 * confirmation. Then whole runs against stubs, driven through a terminal, which
 * is where the promises that matter can be checked at all: the directly
 * authenticated identity is untouched in AWS and on this machine, no secret
 * reaches the terminal, the sealed bundle carries exactly what the host step and
 * IAM handed back, the person's address goes on the allow-list, and the result
 * is read back from IAM. Then a finished onboarding, which a re-run must leave
 * alone unless told to re-issue it. Last, runs that stop part way, which must
 * withdraw what they created and nothing that pre-dated them.
 *
 * Every external tool is a stub: aws, the host step, the allow-list step, age
 * and Terraform. age's stub writes the header age would and
 * copies the cleartext after it, so the suite can read the bundle; that the
 * header tag is age's own is proved against the real binary in the
 * delivery-format suite.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, chmodSync, existsSync, mkdirSync, statSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { seedMaintainerMachine, snapshotAdminFiles } from '../fixtures/maintainerMachine';

const SCRIPT = join(process.cwd(), 'scripts/onboard-dev-tester.sh');
const ACCOUNT = 'james_leberknight';
const OPERATOR_ARN = 'arn:aws:iam::000000000000:user/footbag-operator';
const MINTED_KEY_ID = 'AKIAFIXTUREMINTED001';
const MINTED_SECRET = 'fixture/minted+secret=value000000000000';
const EARLIER_KEY_ID = 'fixture-earlier-key-id';
const ONE_TIME = 'fixtureOneTimePassword0000000000';
const ADDRESS = '198.51.100.7/32';

let dir: string;
let home: string;
let tmp: string;
let pub: string;
let pubSha: string;
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
 * aws, answering from files the test writes, and logging every call. With none
 * written it is an account with the role applied and no user of the name.
 * "user" makes the user exist and be ours, "policy" gives it the grant,
 * "active-key" an active key, and "unreadable-<subcommand>" makes that read
 * fail the way a denied call does. "late-unreadable-get-user" denies get-user
 * once the run has minted its key, which is the read-back failing after
 * everything else succeeded. "grant-lost" makes the grant fail to stick, and
 * "minted-lost" the minted key, as though somebody removed either in between.
 * "warn-on-success" puts a line on stderr for every call, successful or not, the way the CLI prints a deprecation or library warning;
 * it is an acknowledged fake, because what is asserted is that no read takes it
 * as data, not its wording. Not-found answers are printed as the CLI prints them,
 * captured from a real read: the error code is what the scripts recognise, and
 * the rest of the message is not a contract.
 *
 * The key the run mints is remembered in "minted-key", so it is listed as the
 * CLI would list it, and deleting it removes that key and no other.
 */
function awsStub(): string {
  const log = join(dir, 'calls.log');
  const S = JSON.stringify(dir);
  return stub(
    'aws',
    `
printf '%s\\n' "$*" >> ${JSON.stringify(log)}
S=${S}
[[ -e "$S/warn-on-success" ]] && echo "/usr/lib/python3/dist-packages/urllib3/connectionpool.py: InsecureRequestWarning: fixture warning line" >&2
[[ -e "$S/unreadable-$2" ]] && { echo "aws: [ERROR]: An error occurred (AccessDenied) when calling the operation: not authorized" >&2; exit 254; }
if [[ "$2" == "get-user" && -e "$S/late-unreadable-get-user" && -e "$S/minted-key" ]]; then
  echo "aws: [ERROR]: An error occurred (AccessDenied) when calling the GetUser operation: not authorized" >&2; exit 254
fi
case "$1 $2" in
  "sts get-caller-identity") echo ${JSON.stringify(OPERATOR_ARN)} ;;
  "iam get-role") exit 0 ;;
  "iam get-user")
    [[ -e "$S/user" ]] || { echo "aws: [ERROR]: An error occurred (NoSuchEntity) when calling the GetUser operation: The user with name ${ACCOUNT} cannot be found." >&2; exit 254; }
    [[ -e "$S/foreign-path" ]] && { echo /; exit 0; }
    [[ -e "$S/legacy" && ! -e "$S/moved" ]] && { echo /footbag-operators/; exit 0; }
    echo /footbag-dev-testers/ ;;
  "iam list-user-tags")
    legacy_tags=0; [[ -e "$S/legacy" && ! -e "$S/retagged" ]] && legacy_tags=1
    case "$*" in
      *"Key=='Project'"*) echo footbag ;;
      *"Key=='ManagedBy'"*) if (( legacy_tags )); then echo manage-human-operator.sh; else echo manage-dev-tester.sh; fi ;;
      *"Key=='DevTesterRole'"*) [[ -e "$S/partial-tags" ]] || (( legacy_tags )) || echo dev_tester ;;
      *"Key=='OperatorRole'"*)
        if [[ -e "$S/legacy" && ! -e "$S/untagged" ]]; then
          if [[ -e "$S/legacy-other-role" ]]; then echo administrator; else echo dev_tester; fi
        fi ;;
    esac ;;
  "iam update-user") touch "$S/moved" ;;
  "iam tag-user") touch "$S/retagged" ;;
  "iam untag-user") touch "$S/untagged" ;;
  "iam create-user") touch "$S/user" ;;
  "iam put-user-policy") [[ -e "$S/grant-lost" ]] || touch "$S/policy" ;;
  "iam delete-user-policy") rm -f "$S/policy" ;;
  "iam delete-user") rm -f "$S/user" ;;
  "iam update-access-key")
    case "$*" in
      *${JSON.stringify(MINTED_KEY_ID)}*) touch "$S/minted-inactive" ;;
      *) touch "$S/key-inactive" ;;
    esac ;;
  "iam delete-access-key")
    case "$*" in
      *${JSON.stringify(MINTED_KEY_ID)}*) rm -f "$S/minted-key" "$S/minted-inactive" ;;
      *) rm -f "$S/active-key" "$S/key-inactive" ;;
    esac ;;
  "iam get-user-policy")
    [[ -e "$S/policy" ]] && { echo AssumeFootbagDevTester; exit 0; }
    echo "aws: [ERROR]: An error occurred (NoSuchEntity) when calling the GetUserPolicy operation: The user policy with name AssumeFootbagDevTester cannot be found." >&2
    exit 254 ;;
  "iam get-login-profile")
    [[ -e "$S/login" ]] && { echo '{"LoginProfile":{}}'; exit 0; }
    echo "aws: [ERROR]: An error occurred (NoSuchEntity) when calling the GetLoginProfile operation: Login Profile for User ${ACCOUNT} cannot be found." >&2
    exit 254 ;;
  "iam list-access-keys")
    case "$*" in
      *"length("*) n=0; [[ -e "$S/active-key" ]] && n=$((n+1)); [[ -e "$S/minted-key" ]] && n=$((n+1)); echo "$n" ;;
      *)
        st=Active; [[ -e "$S/key-inactive" ]] && st=Inactive
        [[ -e "$S/active-key" ]] && printf '%s\\t%s\\t2026-01-01T00:00:00+00:00\\n' ${JSON.stringify(EARLIER_KEY_ID)} "$st"
        [[ -e "$S/second-active-key" ]] && printf '%s\\t%s\\t2026-02-01T00:00:00+00:00\\n' fixture-second-key-id Active
        st=Active; [[ -e "$S/minted-inactive" ]] && st=Inactive
        [[ -e "$S/minted-key" ]] && printf '%s\\t%s\\t2026-09-01T00:00:00Z\\n' ${JSON.stringify(MINTED_KEY_ID)} "$st"
        true ;;
    esac ;;
  "iam create-access-key")
    [[ -e "$S/minted-lost" ]] || touch "$S/minted-key"
    printf '%s\\t%s\\n' ${JSON.stringify(MINTED_KEY_ID)} ${JSON.stringify(MINTED_SECRET)} ;;
  "ssm get-parameter")
    [[ -e "$S/param" ]] && { cat "$S/param"; exit 0; }
    echo "aws: [ERROR]: An error occurred (ParameterNotFound) when calling the GetParameter operation:" >&2
    exit 254 ;;
  "cloudtrail lookup-events")
    printf '%s\\n' "$*" >> "$S/cloudtrail.args"
    if [[ -e "$S/assumed" ]]; then
      cat "$S/assumed"
    else
      echo '{"Events":[]}'
    fi ;;
  "lightsail get-instance-access-details")
    printf 'ssh-ed25519\\tAAAAC3NzaC1lZDI1NTE5AAAAIFixtureHostKeyEd25519\\n'
    printf 'ssh-rsa\\tAAAAB3NzaC1yc2EAAAADAQABFixtureHostKeyRsa\\n' ;;
  *) echo "unexpected aws call: $*" >&2; exit 64 ;;
esac`,
  );
}

/**
 * The host step: records how it was called and hands back a password. Asked to
 * inspect, it answers as the real one does, from files the test writes: the
 * account live and holding the key given, unless "host-absent", "host-locked"
 * or "host-other-key" says otherwise, or "host-unreadable" makes the read fail.
 */
function provisionStub(): string {
  const D = JSON.stringify(dir);
  return stub(
    'provision',
    `
if [[ " $* " == *" --inspect "* ]]; then
  printf '%s\\n' "$*" >> ${JSON.stringify(join(dir, 'inspect.args'))}
  IFS= read -r sudo_line || true
  printf '%s\\n' "$sudo_line" > ${JSON.stringify(join(dir, 'inspect.stdin'))}
  [[ -e ${D}/host-unreadable ]] && { echo "ERROR: could not read the account." >&2; exit 1; }
  [[ -e ${D}/host-absent ]] && { echo "ACCOUNT absent"; exit 0; }
  echo "==> Account:     ${ACCOUNT}  for "
  echo "ACCOUNT present"
  if [[ -e ${D}/host-locked ]]; then echo "LOCKED yes"; else echo "LOCKED no"; fi
  mine="$(ssh-keygen -l -f ${JSON.stringify(join(dir, 'id_ed25519_james.pub'))})"
  if [[ -e ${D}/host-other-key ]]; then
    echo "KEY 256 SHA256:fixtureSomebodyElsesKeyFingerprint0000000000 other (ED25519)"
  else
    echo "KEY $mine"
  fi
  [[ -e ${D}/host-retired-this-key ]] && echo "RETIRED $mine"
  if [[ -e ${D}/host-shared-this-key ]]; then
    echo "SHARED $(awk '{print $2}' <<<"$mine")"
  elif [[ -e ${D}/host-shared-unknown ]]; then
    echo "SHARED unknown"
  else
    echo "SHARED SHA256:fixtureTheSharedAccountsOwnKey00000000000000"
  fi
  exit 0
fi
printf '%s\\n' "$*" > ${JSON.stringify(join(dir, 'provision.args'))}
printf '%s\\n' "\${DTACC_SEALED_OUT:-}" > ${JSON.stringify(join(dir, 'provision.out'))}
IFS= read -r sudo_line || true
printf '%s\\n' "$sudo_line" > ${JSON.stringify(join(dir, 'provision.stdin'))}
printf '%s\\n' ${JSON.stringify(ONE_TIME)} > "$DTACC_SEALED_OUT"`,
  );
}

/**
 * A child the run hands off to, recording its arguments and what arrived on its
 * standard input, and failing when told to.
 */
function childStub(name: string): string {
  return stub(
    name,
    `
printf '%s\\n' "$*" >> ${JSON.stringify(join(dir, `${name}.args`))}
cat >> ${JSON.stringify(join(dir, `${name}.stdin`))}
[[ -e ${JSON.stringify(join(dir, `${name}-fails`))} ]] && exit 1
exit 0`,
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

/** The SHA256 field of a public key's fingerprint, as ssh-keygen prints it. */
function fingerprintOf(path: string): string {
  const r = spawnSync('ssh-keygen', ['-l', '-f', path], { encoding: 'utf-8', ...SPAWN_GUARD });
  expect(r.status).toBe(0);
  return (r.stdout ?? '').split(' ')[1];
}

function terraformStub(): string {
  return stub('terraform', `[[ "$*" == *"output -raw lightsail_static_ip"* ]] && { echo 203.0.113.10; exit 0; }; exit 1`);
}

beforeEach(() => {
  dir = createScratchDir('onboard-dev-tester');
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
  pubSha = fingerprintOf(pub);
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
    ONBOARD_DEV_TESTER_AWS_BIN: awsStub(),
    ONBOARD_DEV_TESTER_PROVISION_CMD: provisionStub(),
    ONBOARD_DEV_TESTER_AGE_BIN: ageStub(),
    ONBOARD_DEV_TESTER_ADDRESS_CMD: childStub('address'),
    TF_OUTPUT_BIN: terraformStub(),
  };
}

function args(overrides: Partial<Record<string, string>> = {}, extra: string[] = []): string[] {
  const base: Record<string, string> = {
    '--target': 'staging',
    '--account': ACCOUNT,
    '--full-name': 'James Leberknight',
    '--public-key': pub,
    '--expect-fingerprint': pubSha,
    '--address': ADDRESS,
    '--location': 'home',
    ...overrides,
  };
  return [...Object.entries(base).flatMap(([k, v]) => (v === '' ? [] : [k, v])), ...extra];
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
function runInTerminal(terminal: string, argv: string[] = args(), extraEnv: Record<string, string> = {}) {
  const cred = join(dir, 'cred');
  writeFileSync(cred, 'fixture-sudo-password\n', { mode: 0o600 });
  const inner = ['bash', JSON.stringify(SCRIPT), ...argv.map((a) => JSON.stringify(a)), '<', JSON.stringify(cred)].join(' ');
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: terminal,
    env: { ...process.env, ...env(), ...extraEnv },
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
    /\b(create-user|delete-user|update-user|tag-user|untag-user|put-user-policy|delete-user-policy|create-access-key|update-access-key|delete-access-key|create-login-profile)\b/.test(c),
  );
}

const read = (name: string): string => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf-8') : '');

const SEALED = (): string => join(home, 'AWS', `${ACCOUNT}-staging.onboarding.age`);

/** A finished onboarding in IAM: the user, its grant and an active key. */
function finished(): void {
  writeFileSync(join(dir, 'user'), '');
  writeFileSync(join(dir, 'policy'), '');
  writeFileSync(join(dir, 'active-key'), '');
}

describe('onboard-dev-tester.sh — refused before anything is read or reached', () => {
  it('refuses production, which a dev-and-tester never reaches', () => {
    const r = runPiped(args({ '--target': 'production' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/never onboarded onto production/);
    expect(calls()).toEqual([]);
  });

  it('refuses a missing target', () => {
    const r = runPiped(args({ '--target': '' }));
    expect(r.status).toBe(2);
    expect(calls()).toEqual([]);
  });

  it('refuses the directly authenticated identity as the person onboarded', () => {
    const r = runPiped(args({ '--account': 'footbag-operator' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/is not a person/);
    expect(calls()).toEqual([]);
  });

  it('refuses the shared host account as the person onboarded', () => {
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
    const r = runPiped(args({ '--full-name': '' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--full-name/);
  });

  it('refuses a missing address, since nothing else reaches them without it', () => {
    const r = runPiped(args({ '--address': '' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--address must be the IPv4 address they connect from/);
    expect(calls()).toEqual([]);
  });

  it('refuses an address that is not IPv4', () => {
    const r = runPiped(args({ '--address': 'home.example.org' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--address must be/);
  });

  it('refuses an address with an octet past 255 before anything is minted', () => {
    // The shape check alone admitted 999.1.1.1, and the run then minted a key
    // and sealed a file before the allow-list step refused it.
    const r = runPiped(args({ '--address': '999.1.1.1' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--address must be/);
    expect(calls()).toEqual([]);
    // The edge of the range is still an address.
    const ok = runInTerminal('APPLY\n', args({ '--address': '255.255.255.254/32' }));
    expect(ok.status, ok.out).toBe(0);
  });

  it('describes the address as home when no location is given', () => {
    const r = runInTerminal('APPLY\n', args({ '--location': '' }));
    expect(r.status, r.out).toBe(0);
    expect(read('address.args')).toContain(`--for ${ACCOUNT}; home`);
  });

  it('refuses a location carrying the attribution separator', () => {
    const r = runPiped(args({ '--location': 'home; and more' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/without a ';'/);
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

  it('refuses a missing fingerprint, since nothing else proves the key file is theirs', () => {
    const r = runPiped(args({ '--expect-fingerprint': '' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--expect-fingerprint must be/);
    expect(calls()).toEqual([]);
  });

  it('refuses a key whose fingerprint is not the one they posted, before anything is read', () => {
    // A key swapped in transit would seal the person's access to whoever holds it.
    const other = join(dir, 'id_ed25519_other');
    spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', other], { ...SPAWN_GUARD });
    const r = runPiped(args({ '--expect-fingerprint': fingerprintOf(`${other}.pub`) }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not the SHA256:\S+ they posted/);
    expect(calls()).toEqual([]);
    expect(existsSync(join(dir, 'provision.args'))).toBe(false);
  });

  it('refuses when age is not installed', () => {
    const r = runPiped(args(), { ONBOARD_DEV_TESTER_AGE_BIN: join(dir, 'no-such-age') });
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

describe('onboard-dev-tester.sh — a whole onboarding', () => {
  it('creates nothing without a typed APPLY', () => {
    const r = runInTerminal('no\n');
    expect(r.status).toBe(1);
    expect(mutatingCalls()).toEqual([]);
    expect(existsSync(join(dir, 'provision.args'))).toBe(false);
    expect(read('address.args')).toBe('');
    expect(existsSync(SEALED())).toBe(false);
  });

  it('seals the host password, the key and the pins to the key given', () => {
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);

    // The host step: sealed mode, the sudo password on its stdin, a hand-back
    // file this run created and has since destroyed.
    expect(read('provision.args')).toMatch(/--sealed/);
    expect(read('provision.args')).toContain(`--account ${ACCOUNT}`);
    expect(read('provision.stdin')).toBe('fixture-sudo-password\n');
    const handBack = read('provision.out').trim();
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

  it('puts their address on the allow-list, attributed to them, with the sudo password kept away from it', () => {
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    // Their own parameter, never the values file that holds the administrators'
    // entries, so an onboarding cannot change an administrator's access.
    expect(read('address.args')).toBe(`--target staging --dev-tester ${ACCOUNT} --address ${ADDRESS} --for ${ACCOUNT}; home\n`);
    expect(read('address.stdin')).toBe('');
  });

  it('writes a bare address as a single-host range', () => {
    const r = runInTerminal('APPLY\n', args({ '--address': '198.51.100.7' }));
    expect(r.status, r.out).toBe(0);
    expect(read('address.args')).toContain('--address 198.51.100.7/32 ');
  });

  it('reads the identity back from IAM once it is sealed, down to the key it sealed', () => {
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/Reading james_leberknight back from IAM/);
    expect(r.out).toMatch(/grant: {3}AssumeFootbagDevTester/);
    expect(r.out).toContain(`key:     ${MINTED_KEY_ID} active`);
  });

  it('fails the run when the grant is missing once it is sealed', () => {
    writeFileSync(join(dir, 'grant-lost'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/does not read back from IAM as onboarded: it does not hold AssumeFootbagDevTester/);
    expect(r.out).not.toMatch(/Get that file to/);
  });

  it('fails the run when the key it sealed is not active', () => {
    writeFileSync(join(dir, 'minted-lost'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toContain(`the key just sealed, ${MINTED_KEY_ID}, is not active`);
    expect(r.out).not.toMatch(/Get that file to/);
  });

  it('fails the run when IAM cannot be read back, rather than reading the user as absent', () => {
    writeFileSync(join(dir, 'late-unreadable-get-user'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not read the IAM user james_leberknight/);
    expect(r.out).toMatch(/does not read back from IAM as onboarded: IAM could not be read/);
    expect(r.out).not.toMatch(/Get that file to/);
  });

  it('never reads a warning the CLI prints on stderr as a key id', () => {
    finished();
    writeFileSync(join(dir, 'warn-on-success'), '');
    const r = runInTerminal('APPLY\n', args({}, ['--reissue']));
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain(`Retiring the key being replaced: ${EARLIER_KEY_ID}`);
    expect(calls().filter((c) => /access-key --user-name/.test(c) && /InsecureRequestWarning|urllib3/.test(c))).toEqual([]);
    expect(r.out).toContain(`key:     ${MINTED_KEY_ID} active`);
  });

  it('judges the re-issue on IAM alone, whatever key this machine still holds for the person', () => {
    // A holder re-issuing their own onboarding keeps the retired key in their
    // files until they accept the new one; the read-back must not consult it.
    finished();
    writeFileSync(
      credFile,
      `${OPERATOR_CRED}[${ACCOUNT}]\naws_access_key_id = AKIAEXAMPLEEXAMPLE02\naws_secret_access_key = retired-fixture-secret\n`,
      { mode: 0o600 },
    );
    writeFileSync(
      configFile,
      `${OPERATOR_CONFIG}[profile FootbagDevTester]\nrole_arn = arn:aws:iam::000000000000:role/FootbagDevTester\nsource_profile = ${ACCOUNT}\nrole_session_name = ${ACCOUNT}\n`,
    );
    const r = runInTerminal('APPLY\n', args({}, ['--reissue']));
    expect(r.status, r.out).toBe(0);
    expect(calls().some((c) => /--profile (james_leberknight|FootbagDevTester)/.test(c))).toBe(false);
  });

  it('fails, naming the re-run, when the address is not proved on the allow-list', () => {
    writeFileSync(join(dir, 'address-fails'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/is not proved on the staging allow-list/);
    expect(r.out).toMatch(/re-run this same command to finish it/);
    // The sealed file and its key are kept: only the allow-list is left to do.
    expect(existsSync(SEALED())).toBe(true);
    expect(calls().some((c) => c.startsWith('iam delete-access-key'))).toBe(false);
  });

  it('shows no secret on the terminal, and asks for no vault entry', () => {
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(r.out).not.toContain(ONE_TIME);
    expect(r.out).not.toContain(MINTED_SECRET);
    expect(r.out).not.toMatch(/Title:/);
    expect(r.out).toMatch(/Nothing goes in the vault: nobody named has a vault entry/);
    expect(r.out).toMatch(new RegExp(`access key id: ${MINTED_KEY_ID}`));
    expect(r.out).toMatch(new RegExp(`fingerprint: +${pubSha.replace(/[+/]/g, '\\$&')}`));
    expect(r.out).toContain('accept-dev-tester-onboarding.sh');
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
    expect(readdirSync(join(home, 'AWS'))).toEqual([`${ACCOUNT}-staging.onboarding.age`]);
    expect(readdirSync(tmp).filter((f) => !f.startsWith('tf-'))).toEqual([]);
  });
});

describe('onboard-dev-tester.sh — the IAM identity it makes', () => {
  it('creates the user under the path the role trusts, with the ownership tags', () => {
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    const create = calls().find((c) => c.startsWith('iam create-user')) ?? '';
    expect(create).toContain(`--user-name ${ACCOUNT}`);
    expect(create).toContain('--path /footbag-dev-testers/');
    expect(create).toContain('Key=Project,Value=footbag');
    expect(create).toContain('Key=ManagedBy,Value=manage-dev-tester.sh');
    expect(create).toContain('Key=DevTesterRole,Value=dev_tester');
  });

  it('grants one inline statement naming one role, and attaches nothing else', () => {
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    const grants = calls().filter((c) => c.startsWith('iam put-user-policy'));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toContain('--policy-name AssumeFootbagDevTester');
    expect(grants[0]).toContain('"Action":"sts:AssumeRole"');
    expect(grants[0]).toContain('"Resource":"arn:aws:iam::000000000000:role/FootbagDevTester"');
    expect(calls().some((c) => /attach-user-policy|add-user-to-group/.test(c))).toBe(false);
  });

  it('refuses to finish an identity that has a console sign-in, which these never carry', () => {
    writeFileSync(join(dir, 'login'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/has a console login profile/);
    expect(existsSync(SEALED())).toBe(false);
  });

  it('refuses a user of the same name at another path, and changes nothing', () => {
    writeFileSync(join(dir, 'user'), '');
    writeFileSync(join(dir, 'foreign-path'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/already exists and is not one/);
    expect(mutatingCalls()).toEqual([]);
  });

  it('refuses a user carrying only some of the ownership tags', () => {
    writeFileSync(join(dir, 'user'), '');
    writeFileSync(join(dir, 'partial-tags'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/hand somebody else's identity/);
    expect(mutatingCalls()).toEqual([]);
  });

  it('moves a retired user of its own from the legacy path and tags, then restores it', () => {
    // Users created under the earlier names sit outside the path the role's
    // trust now matches. Re-onboarding moves and retags one, scripted, so no
    // one-off command is needed and the user keeps its id.
    writeFileSync(join(dir, 'user'), '');
    writeFileSync(join(dir, 'legacy'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/is moved to \/footbag-dev-testers\/ and its ownership tags/);
    const c = calls();
    expect(c.some((l) => l.startsWith('iam create-user'))).toBe(false);
    expect(c).toContain(`iam update-user --user-name ${ACCOUNT} --new-path /footbag-dev-testers/`);
    expect(c.some((l) => l.startsWith(`iam tag-user --user-name ${ACCOUNT}`) && l.includes('Key=ManagedBy,Value=manage-dev-tester.sh') && l.includes('Key=DevTesterRole,Value=dev_tester'))).toBe(true);
    expect(c).toContain(`iam untag-user --user-name ${ACCOUNT} --tag-keys OperatorRole`);
    // Moved before the grant is written, so the grant lands on the user the role trusts.
    expect(c.findIndex((l) => l.startsWith('iam update-user'))).toBeLessThan(
      c.findIndex((l) => l.startsWith(`iam put-user-policy --user-name ${ACCOUNT}`)),
    );
  });

  it('finishes a move that stopped after the path changed and before the tags did', () => {
    // Otherwise the user would sit at the new path with legacy tags, read as
    // somebody else's, and need a hand-typed IAM fix.
    writeFileSync(join(dir, 'user'), '');
    writeFileSync(join(dir, 'legacy'), '');
    writeFileSync(join(dir, 'moved'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    const c = calls();
    expect(c.some((l) => l.startsWith(`iam tag-user --user-name ${ACCOUNT}`))).toBe(true);
    expect(c).toContain(`iam untag-user --user-name ${ACCOUNT} --tag-keys OperatorRole`);
  });

  it('refuses a legacy-path user whose role tag is not a dev-tester\'s, and changes nothing', () => {
    writeFileSync(join(dir, 'user'), '');
    writeFileSync(join(dir, 'legacy'), '');
    writeFileSync(join(dir, 'legacy-other-role'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/already exists and is not one/);
    expect(mutatingCalls()).toEqual([]);
  });

  it('restores an offboarded user of its own rather than creating it again', () => {
    writeFileSync(join(dir, 'user'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(calls().some((c) => c.startsWith('iam create-user'))).toBe(false);
    expect(calls().some((c) => c.startsWith(`iam put-user-policy --user-name ${ACCOUNT}`))).toBe(true);
  });

  it('never reactivates a retired key: a re-issue mints a new one', () => {
    finished();
    const r = runInTerminal('APPLY\n', args({}, ['--reissue']));
    expect(r.status, r.out).toBe(0);
    expect(calls().some((c) => c.startsWith('iam update-access-key') && c.includes('--status Active'))).toBe(false);
    expect(r.out).toContain(`Retiring the key being replaced: ${EARLIER_KEY_ID}`);
  });
});

describe('onboard-dev-tester.sh — an onboarding that is already finished', () => {
  it('changes nothing in IAM or on the host, and says how to re-issue', () => {
    // Accepted or not, a finished onboarding's key and password may be in use,
    // and replacing them unasked would lock their owner out.
    finished();
    const r = runInTerminal('');
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/Already done/);
    expect(r.out).toMatch(/--reissue/);
    expect(mutatingCalls()).toEqual([]);
    // The host was read, never changed: only the inspection ran.
    expect(existsSync(join(dir, 'provision.args'))).toBe(false);
    expect(read('inspect.args')).toBe(`--target staging --account ${ACCOUNT} --inspect\n`);
    expect(read('inspect.stdin')).toBe('fixture-sudo-password\n');
    expect(existsSync(SEALED())).toBe(false);
  });

  it('refuses to call it done when the host account is locked, as a half-finished offboard leaves it', () => {
    finished();
    writeFileSync(join(dir, 'host-locked'), '');
    const r = runInTerminal('');
    expect(r.status).toBe(1);
    expect(r.out).not.toMatch(/Already done/);
    expect(r.out).toMatch(/their host account is locked/);
    expect(r.out).toMatch(/--from-step 2/);
    expect(mutatingCalls()).toEqual([]);
    expect(existsSync(join(dir, 'provision.args'))).toBe(false);
    expect(read('address.args')).toBe('');
  });

  it('refuses to call it done when the host account holds any other key', () => {
    finished();
    writeFileSync(join(dir, 'host-other-key'), '');
    const r = runInTerminal('');
    expect(r.status).toBe(1);
    expect(r.out).not.toMatch(/Already done/);
    expect(r.out).toMatch(/does not hold\s+exactly the key given/);
    expect(existsSync(join(dir, 'provision.args'))).toBe(false);
  });

  it('refuses to call it done when there is no host account', () => {
    finished();
    writeFileSync(join(dir, 'host-absent'), '');
    const r = runInTerminal('');
    expect(r.status).toBe(1);
    expect(r.out).not.toMatch(/Already done/);
    expect(r.out).toMatch(/there is no james_leberknight account on/);
  });

  it('refuses rather than calling it done when the host cannot be read', () => {
    finished();
    writeFileSync(join(dir, 'host-unreadable'), '');
    const r = runInTerminal('');
    expect(r.status).toBe(1);
    expect(r.out).not.toMatch(/Already done/);
    expect(r.out).toMatch(/their host account could not be\s+read/);
    expect(existsSync(join(dir, 'provision.args'))).toBe(false);
  });

  it('still makes sure of the allow-list entry and reads the identity back', () => {
    finished();
    const r = runInTerminal('');
    expect(r.status, r.out).toBe(0);
    expect(read('address.args')).toContain(`--for ${ACCOUNT}; home`);
    expect(r.out).toMatch(/Reading james_leberknight back from IAM/);
    expect(r.out).toContain(`key:     ${EARLIER_KEY_ID} active`);
  });

  it('refuses, before the host step and any confirmation, when IAM cannot say whether the user exists', () => {
    // Read as absent, a finished onboarding would skip the check above and go on
    // to issue its host account a fresh password.
    finished();
    writeFileSync(join(dir, 'unreadable-get-user'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not read the IAM user james_leberknight/);
    expect(r.out).not.toMatch(/Type 'APPLY'/);
    expect(existsSync(join(dir, 'provision.args'))).toBe(false);
    expect(mutatingCalls()).toEqual([]);
  });

  it('re-issues it only when told to, replacing the key and sealing again', () => {
    finished();
    const r = runInTerminal('APPLY\n', args({}, ['--reissue']));
    expect(r.status, r.out).toBe(0);
    expect(calls().some((c) => c.startsWith(`iam delete-access-key --user-name ${ACCOUNT} --access-key-id ${EARLIER_KEY_ID}`))).toBe(true);
    expect(calls().some((c) => c.startsWith(`iam create-access-key --user-name ${ACCOUNT}`))).toBe(true);
    expect(read('provision.args')).toMatch(/--sealed/);
    expect(existsSync(SEALED())).toBe(true);
  });

  it('treats a user holding the grant but no active key as unfinished', () => {
    // A run that stopped before sealing withdrew its key, so the file was never
    // made and the onboarding still has to be completed.
    writeFileSync(join(dir, 'user'), '');
    writeFileSync(join(dir, 'policy'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(r.out).not.toMatch(/Already done/);
    expect(existsSync(SEALED())).toBe(true);
  });

  it('refuses rather than guessing when IAM cannot say whether it is finished', () => {
    writeFileSync(join(dir, 'user'), '');
    writeFileSync(join(dir, 'unreadable-get-user-policy'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/could not read whether .* holds AssumeFootbagDevTester/);
    expect(mutatingCalls()).toEqual([]);
    expect(existsSync(join(dir, 'provision.args'))).toBe(false);
  });
});

describe('onboard-dev-tester.sh — an onboarding that stops after the host step', () => {
  it('withdraws the key, the grant and the user it created, and leaves the host account', () => {
    writeFileSync(join(dir, 'age-fails'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(calls().some((c) => c.startsWith(`iam delete-access-key --user-name ${ACCOUNT} --access-key-id ${MINTED_KEY_ID}`))).toBe(true);
    expect(calls().some((c) => c.startsWith(`iam delete-user-policy --user-name ${ACCOUNT}`))).toBe(true);
    expect(calls().some((c) => c.startsWith(`iam delete-user --user-name ${ACCOUNT}`))).toBe(true);
    expect(r.out).toMatch(/is left in place and is NOT being removed/);
    expect(existsSync(SEALED())).toBe(false);
    expect(read('address.args')).toBe('');
    expect(existsSync(join(home, 'AWS')) ? readdirSync(join(home, 'AWS')) : []).toEqual([]);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('never deletes a user, or a grant, that pre-dated the run', () => {
    // A re-onboarding after an offboarding finds the user already there, and a
    // failure part way must leave it as it was found.
    writeFileSync(join(dir, 'user'), '');
    writeFileSync(join(dir, 'policy'), '');
    writeFileSync(join(dir, 'age-fails'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(calls().some((c) => c.startsWith(`iam delete-user --user-name ${ACCOUNT}`))).toBe(false);
    expect(calls().some((c) => c.startsWith(`iam delete-user-policy --user-name ${ACCOUNT}`))).toBe(false);
    expect(existsSync(join(dir, 'policy'))).toBe(true);
    expect(r.out).toMatch(/pre-dated this run and is NOT being deleted/);
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

describe('onboard-dev-tester.sh — the key and the address it is given', () => {
  it('takes the key line itself, as it was sent, and hands that line to the host step', () => {
    const line = readFileSync(pub, 'utf-8').trim();
    const r = runInTerminal('APPLY\n', args({ '--public-key': line }));
    expect(r.status, r.out).toBe(0);
    expect(read('provision.args')).toContain(`--key-line ${line}`);
  });

  it('onboards yourself from your own named pair, deriving the fingerprint and reading your address', () => {
    // No key travelled, so there is nothing to compare a posted fingerprint to;
    // the pair is the one this machine made for that account name and no other.
    mkdirSync(join(home, '.ssh'), { recursive: true });
    writeFileSync(join(home, '.ssh', `id_ed25519_${ACCOUNT}.pub`), readFileSync(pub, 'utf-8'));
    const fetch = stub('checkip', 'echo 203.0.113.44');
    const cred = join(dir, 'cred');
    writeFileSync(cred, 'fixture-sudo-password\n', { mode: 0o600 });
    const argv = args({ '--public-key': '', '--expect-fingerprint': '', '--address': '' });
    const inner = ['bash', JSON.stringify(SCRIPT), ...argv.map((a) => JSON.stringify(a)), '<', JSON.stringify(cred)].join(' ');
    const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
      encoding: 'utf-8',
      input: 'APPLY\n',
      env: { ...process.env, ...env(), ONBOARD_DEV_TESTER_FETCH: fetch },
      ...SPAWN_GUARD,
    });
    expect(r.status, r.stdout).toBe(0);
    expect(read('address.args')).toContain('--address 203.0.113.44/32 ');
    expect(r.stdout).toMatch(new RegExp(`fingerprint: +${pubSha.replace(/[+/]/g, '\\$&')}`));
  });

  it('refuses to onboard yourself when this machine has no pair of that name', () => {
    const r = runPiped(args({ '--public-key': '', '--expect-fingerprint': '' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/no --public-key, and no .*id_ed25519_james_leberknight\.pub/);
    expect(r.stderr).toMatch(/setup-dev-workstation\.sh --aws --account james_leberknight/);
  });

  it('refuses a range, since a dev-and-tester\'s address is one host', () => {
    const r = runPiped(args({ '--address': '198.51.100.0/24' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/one host/);
  });

  it('refuses a key the account was retired with, before anything is confirmed or created', () => {
    // Reinstating it would let back in whoever still holds its private half.
    writeFileSync(join(dir, 'host-retired-this-key'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/is a key james_leberknight was retired with/);
    expect(r.out).toMatch(/--replace-key retired/);
    expect(r.out).not.toMatch(/Type 'APPLY' to onboard/);
    expect(read('provision.args')).toBe('');
    expect(mutatingCalls()).toEqual([]);
  });

  it('refuses a key the shared account holds, before anything is confirmed or created', () => {
    writeFileSync(join(dir, 'host-shared-this-key'), '');
    const r = runInTerminal('APPLY\n');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/also on the shared footbag account/);
    expect(read('provision.args')).toBe('');
    expect(mutatingCalls()).toEqual([]);
  });

  it('hands the sudo password to every host step, the early read included', () => {
    const r = runInTerminal('APPLY\n');
    expect(r.status, r.out).toBe(0);
    expect(read('inspect.stdin')).toBe('fixture-sudo-password\n');
    expect(read('provision.stdin')).toBe('fixture-sudo-password\n');
  });
});

describe('onboard-dev-tester.sh on a maintainer\'s own machine', () => {
  it('leaves every administrative file byte for byte across an onboarding, an already-done run and a re-issue', () => {
    // The holder onboards themselves on the machine holding footbag-operator, both
    // runtime chains, the shared password files, the pin file and the stanzas.
    // The only thing any of these runs may add is the sealed file.
    seedMaintainerMachine(home, ['203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureHost']);
    const files = {
      AWS_CONFIG_FILE: join(home, '.aws', 'config'),
      AWS_SHARED_CREDENTIALS_FILE: join(home, '.aws', 'credentials'),
    };
    const before = snapshotAdminFiles(home);

    const onboard = runInTerminal('APPLY\n', args(), files);
    expect(onboard.status, onboard.out).toBe(0);
    expect(snapshotAdminFiles(home)).toEqual(before);

    // The onboarding is now finished in IAM, so a second run reads it back.
    const again = runInTerminal('', args(), files);
    expect(again.status, again.out).toBe(0);
    expect(again.out).toMatch(/Already done/);
    expect(snapshotAdminFiles(home)).toEqual(before);

    const reissue = runInTerminal('APPLY\n', args({}, ['--reissue']), files);
    expect(reissue.status, reissue.out).toBe(0);
    expect(snapshotAdminFiles(home)).toEqual(before);
    expect(readdirSync(join(home, 'AWS')).sort()).toEqual(
      ['AWS_OPERATOR.txt', 'AWS_OPERATOR_PRODUCTION.txt', 'footbag_known_hosts', `${ACCOUNT}-staging.onboarding.age`].sort(),
    );
  });
});

describe('onboard-dev-tester.sh --verify: one read-only verdict', () => {
  const VERIFY = ['--verify', '--target', 'staging', '--account', ACCOUNT];
  const ASSUMED_ARN = `arn:aws:sts::000000000000:assumed-role/FootbagDevTester/${ACCOUNT}`;

  /** A finished, accepted onboarding: IAM, the host, the address, and the trail. */
  function accepted(): void {
    finished();
    writeFileSync(join(dir, 'param'), ADDRESS);
    const event = JSON.stringify({
      eventTime: '2026-01-02T10:00:00Z',
      responseElements: { assumedRoleUser: { arn: ASSUMED_ARN } },
    });
    writeFileSync(join(dir, 'assumed'), JSON.stringify({ Events: [{ EventName: 'AssumeRole', CloudTrailEvent: event }] }));
  }

  function runVerify(extra: string[] = [], extraEnv: Record<string, string> = {}) {
    return runPiped([...VERIFY, '--expect-fingerprint', pubSha, ...extra], {
      ONBOARD_DEV_TESTER_POLL_SECONDS: '0',
      ONBOARD_DEV_TESTER_POLL_TRIES: '2',
      ...extraEnv,
    });
  }

  it('proves an accepted onboarding, with no terminal, changing nothing, and prints the evidence', () => {
    accepted();
    const r = runVerify();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/VERIFIED/);
    expect(r.stdout).toContain(`assumed role:  ${ASSUMED_ARN}`);
    expect(r.stdout).toContain(`access key id: ${EARLIER_KEY_ID}`);
    expect(mutatingCalls()).toEqual([]);
    expect(read('provision.args')).toBe('');
    expect(read('address.args')).toBe('');
    // The acceptance is looked for with the active key, from the moment it was made.
    expect(read('cloudtrail.args')).toContain(`AttributeKey=AccessKeyId,AttributeValue=${EARLIER_KEY_ID}`);
    expect(read('cloudtrail.args')).toContain('--start-time 2026-01-01T00:00:00+00:00');
  });

  it('reports pending, with the re-run, when the trail does not show the acceptance yet', () => {
    accepted();
    writeFileSync(join(dir, 'assumed'), '{"Events":[]}');
    const r = runVerify();
    expect(r.status).toBe(3);
    expect(r.stdout).toMatch(/PENDING/);
    expect(r.stdout).toMatch(/onboard-dev-tester\.sh --verify/);
    expect(read('cloudtrail.args').split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('does not count an assumption from before the key was made', () => {
    accepted();
    const old = JSON.stringify({ eventTime: '2025-12-31T10:00:00Z', responseElements: { assumedRoleUser: { arn: ASSUMED_ARN } } });
    writeFileSync(join(dir, 'assumed'), JSON.stringify({ Events: [{ EventName: 'AssumeRole', CloudTrailEvent: old }] }));
    expect(runVerify().status).toBe(3);
  });

  it('fails when the shared account holds the key too', () => {
    accepted();
    writeFileSync(join(dir, 'host-shared-this-key'), '');
    const r = runVerify();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/shared footbag account holds this key too/);
  });

  it('fails when whether the shared account holds the key cannot be read', () => {
    accepted();
    writeFileSync(join(dir, 'host-shared-unknown'), '');
    const r = runVerify();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not be read/);
  });

  it('fails when the user holds more than one active key', () => {
    accepted();
    writeFileSync(join(dir, 'second-active-key'), '');
    const r = runVerify();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/2 active keys where exactly one belongs/);
  });

  it('fails when the address parameter is missing', () => {
    accepted();
    rmSync(join(dir, 'param'));
    const r = runVerify();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no staging address parameter/);
  });

  it('fails when the host account holds a different key', () => {
    accepted();
    writeFileSync(join(dir, 'host-other-key'), '');
    expect(runVerify().status).toBe(1);
  });

  it('takes nothing that would change anything', () => {
    const r = runPiped([...VERIFY, '--expect-fingerprint', pubSha, '--reissue']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--verify changes nothing/);
  });
});
