/**
 * scripts/lib/ssh-known-hosts.sh — the host-key pin every operator script
 * verifies a deployed host against before it opens a privileged connection.
 *
 * These scripts put the operator's sudo password on line one of the SSH
 * stream, so the pin is what stands between that credential and a substituted
 * host. The contract this suite holds is that the helper fails closed: a pin
 * that is missing, or that other accounts could rewrite, stops the caller
 * rather than downgrading it to trust-on-first-connect, and a pin the helper
 * does accept produces options that refuse an unknown host outright and read
 * no known-hosts file other than the pin itself.
 *
 * It also holds how a pin is judged current without the Lightsail call that
 * mints a root-capable certificate: by the instance record beside the pin,
 * compared with the instance Lightsail reports now, so a rebuilt host never
 * passes as current and no check fires the break-glass alarm.
 *
 * The suite supplies its own pin under a throwaway directory and never reads
 * the operator's, which is machine-local and absent everywhere else.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/ssh-known-hosts.sh');

const PIN_LINE = '[203.0.113.10]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITESTKEYFORPINSUITE\n';

let workDir: string;
let emptyHome: string;

interface RunResult {
  exitCode: number;
  optsLines: string[];
  stderr: string;
}

/**
 * Sources the helper, calls it, and reports both halves of its contract: the
 * return code, and the option array it populated. The options are printed one
 * per line so an assertion can compare the exact pair rather than a joined
 * string that would hide a missing or reordered element.
 */
function runPinCheck(env: Record<string, string>): RunResult {
  const snippet = [
    `source "${LIB}"`,
    'require_pinned_known_hosts',
    'rc=$?',
    'printf "%s\\n" "${FOOTBAG_SSH_PIN_OPTS[@]}"',
    'exit $rc',
  ].join('\n');

  const r = spawnSync('bash', ['-c', snippet], {
    encoding: 'utf-8',
    env: { ...process.env, HOME: emptyHome, FOOTBAG_KNOWN_HOSTS: '', ...env },
    ...SPAWN_GUARD,
  });

  return {
    exitCode: r.status ?? -1,
    optsLines: (r.stdout ?? '').split('\n').filter((l) => l.length > 0),
    stderr: r.stderr ?? '',
  };
}

/** Writes a pin at the given mode and returns its path. */
function writePin(name: string, mode: number): string {
  const p = join(workDir, name);
  writeFileSync(p, PIN_LINE, 'utf-8');
  chmodSync(p, mode);
  return p;
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-sshpin-'));
  // A home with no pin in it, so the default-location cases are exercised
  // against a known-empty directory rather than whatever the runner happens to
  // have.
  emptyHome = join(workDir, 'home');
  mkdirSync(emptyHome, { recursive: true });
});

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe('a missing pin stops the caller', () => {
  it('refuses, names the path it looked for, and populates no options', () => {
    const missing = join(workDir, 'absent-pin');
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: missing });

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain(missing);
    // An empty option array is the safe failure: a caller that forgets to check
    // the return code gets an SSH invocation with no verification options
    // rather than a silently permissive one.
    expect(r.optsLines).toEqual([]);
  });

  it('looks under the operator home directory when no override is set', () => {
    const r = runPinCheck({});

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain(join(emptyHome, 'AWS/footbag_known_hosts'));
  });

  it('tells the operator how to rebuild it from the authoritative source', () => {
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: join(workDir, 'absent-pin-2') });

    // A refusal an operator cannot act on invites deleting the check instead of
    // fixing the pin, which is the one outcome this guard cannot survive.
    expect(r.stderr).toMatch(/install-known-hosts\.sh --target/);
    expect(r.stderr).toMatch(/FOOTBAG_KNOWN_HOSTS/);
  });
});

describe('a pin other accounts could rewrite is not a pin', () => {
  it('refuses a world-writable pin and reports the mode it found', () => {
    const pin = writePin('loose-pin', 0o666);
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: pin });

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('666');
    expect(r.optsLines).toEqual([]);
  });

  it('refuses a group-writable pin', () => {
    const pin = writePin('group-writable-pin', 0o660);
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: pin });

    expect(r.exitCode).not.toBe(0);
    expect(r.optsLines).toEqual([]);
  });

  it.each([0o600, 0o644, 0o400, 0o444])('accepts mode %s', (mode) => {
    const pin = writePin(`ok-pin-${mode.toString(8)}`, mode);
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: pin });

    expect(r.exitCode).toBe(0);
  });
});

describe('an accepted pin produces options that fail closed', () => {
  it('refuses an unknown host and reads the pin alone', () => {
    const pin = writePin('good-pin', 0o600);
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: pin });

    expect(r.exitCode).toBe(0);
    // StrictHostKeyChecking=yes refuses an unknown host instead of learning it,
    // and pointing UserKnownHostsFile at the pin alone stops the operator's own
    // trust-on-first-use history vouching for a host the pin does not carry.
    expect(r.optsLines).toEqual([
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      `UserKnownHostsFile=${pin}`,
    ]);
  });

  it('takes the override in preference to the operator home default', () => {
    const pin = writePin('override-pin', 0o600);
    const r = runPinCheck({ FOOTBAG_KNOWN_HOSTS: pin });

    expect(r.exitCode).toBe(0);
    expect(r.optsLines).toContain(`UserKnownHostsFile=${pin}`);
    expect(r.optsLines).not.toContain(
      `UserKnownHostsFile=${join(emptyHome, 'AWS/footbag_known_hosts')}`,
    );
  });
});

// ── Currency, judged without minting ────────────────────────────────────────

const TF_LIB = join(process.cwd(), 'scripts/lib/terraform-output.sh');
const IP = '203.0.113.10';
const INSTANCE = 'footbag-staging-web';
const ARN = 'arn:aws:lightsail:us-east-1:041904915126:Instance/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const CREATED = '2026-09-01T10:00:00.123000+00:00';
const RECORD = `footbag-staging ${INSTANCE} ${ARN} ${CREATED}`;
const PROD_RECORD = 'footbag-production footbag-production-web arn:aws:lightsail:us-east-1:041904915126:Instance/11111111-2222-3333-4444-555555555555 2026-08-01T10:00:00+00:00';
const KEYS = ['ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureCurrencyKey', 'ssh-rsa AAAAB3NzaC1yc2EFixtureCurrencyRsa'];
const tagged = (host: string, key: string, tag = 'footbag-staging') => `${host} ${key} ${tag}`;
const CURRENT_PIN = KEYS.flatMap((k) => [tagged(IP, k), tagged(`[${IP}]:2222`, k)]);

let caseNo = 0;
let cur: string;
let curPin: string;
let curRecord: string;

/**
 * Lightsail as GetInstance answers `--query 'instance.[arn,createdAt]' --output
 * text`: the two values, tab-separated, from files the case writes. The minting
 * call is never expected here, so it is logged and refused: a judgement that
 * reached it would both fail and show in the log.
 */
function writeCurrencyStubs(): void {
  const aws = join(cur, 'aws');
  writeFileSync(aws, [
    '#!/usr/bin/env bash',
    `S=${JSON.stringify(cur)}`,
    'case "$1 $2" in',
    '  "lightsail get-instance")',
    '    [[ -e "$S/get-instance-fails" ]] && { echo "AccessDeniedException: not authorized" >&2; exit 254; }',
    '    printf "%s\\t%s\\n" "$(cat "$S/arn")" "$(cat "$S/created")" ;;',
    '  "lightsail get-instance-access-details") echo "$*" >> "$S/mints.log"; exit 1 ;;',
    '  *) echo "unexpected aws call: $*" >&2; exit 64 ;;',
    'esac',
  ].join('\n') + '\n', { mode: 0o755 });
  writeFileSync(join(cur, 'tf'), [
    '#!/usr/bin/env bash',
    `case "$*" in *lightsail_instance_name*) printf '%s' ${INSTANCE} ;; *lightsail_static_ip*) printf '%s' ${IP} ;; *) exit 1 ;; esac`,
  ].join('\n') + '\n', { mode: 0o755 });
  writeFileSync(join(cur, 'identity'), "#!/usr/bin/env bash\nprintf '%s\\n' 'arn:aws:iam::041904915126:user/footbag-operator'\n", { mode: 0o755 });
  writeFileSync(join(cur, 'arn'), ARN);
  writeFileSync(join(cur, 'created'), CREATED);
}

function writeCurrent(pinLines = CURRENT_PIN, recordLines: string[] = [RECORD], recordMode = 0o600): void {
  writeFileSync(curPin, pinLines.map((l) => `${l}\n`).join(''), { mode: 0o600 });
  if (recordLines.length) {
    writeFileSync(curRecord, recordLines.map((l) => `${l}\n`).join(''));
    chmodSync(curRecord, recordMode);
  }
}

/** Sources the libraries as a caller does, from the repository root, and runs `body`. */
function runLib(body: string[]) {
  const r = spawnSync('bash', ['-c', [`source ${JSON.stringify(TF_LIB)}`, `source ${JSON.stringify(LIB)}`, ...body].join('\n')], {
    encoding: 'utf-8',
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: emptyHome,
      FOOTBAG_KNOWN_HOSTS: curPin,
      TF_OUTPUT_BIN: join(cur, 'tf'),
      AWS_PROFILE: 'stub-profile',
      AWS_PROFILE_BIN: join(cur, 'identity'),
      AWS_IDENTITY_BIN: join(cur, 'identity'),
    },
    ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** known_hosts_pin_current's verdict, its reason, and the record line it built. */
function judge() {
  const r = runLib([
    `rc=0; known_hosts_pin_current staging ${JSON.stringify(join(cur, 'aws'))} || rc=$?`,
    'printf "RC=%s\\nREASON=%s\\nRECORD=%s\\nCOUNT=%s\\n" "$rc" "$KNOWN_HOSTS_STALE_REASON" "$KNOWN_HOSTS_INSTANCE_RECORD" "$KNOWN_HOSTS_PIN_COUNT"',
  ]);
  const field = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(r.stdout)?.[1] ?? '';
  return { rc: Number(field('RC')), reason: field('REASON'), record: field('RECORD'), count: Number(field('COUNT')), stderr: r.stderr };
}

const mintCalls = () => (existsSync(join(cur, 'mints.log')) ? readFileSync(join(cur, 'mints.log'), 'utf-8') : '');

describe('known_hosts_pin_current: a pin is current only for the instance it was read from', () => {
  beforeEach(() => {
    cur = join(workDir, `currency-${++caseNo}`);
    mkdirSync(cur, { recursive: true });
    curPin = join(cur, 'footbag_known_hosts');
    curRecord = `${curPin}.instances`;
    writeCurrencyStubs();
  });

  it('passes a pin whose record names the instance Lightsail reports now, and mints nothing', () => {
    // Defect caught: a routine check that reaches the minting call and fires
    // the production break-glass alarm, or one that never passes a good pin and
    // sends every operator to mint.
    writeCurrent();
    const v = judge();
    expect(v.rc, v.stderr + v.reason).toBe(0);
    expect(v.record).toBe(RECORD);
    expect(v.count).toBe(4);
    expect(mintCalls()).toBe('');
  });

  it.each([
    ['ARN', 'arn', 'arn:aws:lightsail:us-east-1:041904915126:Instance/99999999-8888-7777-6666-555555555555'],
    ['creation time', 'created', '2026-11-01T09:00:00+00:00'],
  ])('fails a rebuilt host whose %s differs from the record', (_label, file, value) => {
    // Defect caught: a host rebuilt under the same name, with new host keys,
    // passing as current, so a dev-and-tester is sealed the old host's keys.
    writeCurrent();
    writeFileSync(join(cur, file), value);
    const v = judge();
    expect(v.rc).toBe(1);
    expect(v.reason).toContain('rebuilt or replaced');
    expect(v.record).toContain(value);
    expect(mintCalls()).toBe('');
  });

  it('calls a pin with no instance record not proven current', () => {
    // Defect caught: a pin taken before records existed, or by hand, read as
    // current with nothing to say which host its keys came from.
    writeCurrent(CURRENT_PIN, []);
    const v = judge();
    expect(v.rc).toBe(1);
    expect(v.reason).toContain('not proven current');
  });

  it('fails a pin file every connection would refuse, beside the same pin at 600 passing', () => {
    // Defect caught: install, --check and bootstrap reporting the pin current
    // while every deploy refuses the same file, and onboarding sealing lines
    // from a pin another account could have rewritten.
    writeCurrent();
    expect(judge().rc).toBe(0);
    chmodSync(curPin, 0o664);
    const v = judge();
    expect(v.rc).toBe(1);
    expect(v.reason).toMatch(/every connection refuses the pin file: .*mode 664/);
    expect(mintCalls()).toBe('');
  });

  it('does not trust a record another account could rewrite', () => {
    // Defect caught: whoever can write the record can make a rebuilt host read
    // as current.
    writeCurrent(CURRENT_PIN, [RECORD], 0o666);
    const v = judge();
    expect(v.rc).toBe(1);
    expect(v.reason).toContain('666');
  });

  it('reads only this environment\'s record line, and refuses two of them', () => {
    // Defect caught: production's record standing in for staging's, or a
    // duplicated line letting a stale entry ride beside a current one.
    writeCurrent(CURRENT_PIN, [PROD_RECORD]);
    expect(judge().rc).toBe(1);
    writeCurrent(CURRENT_PIN, [PROD_RECORD, RECORD]);
    expect(judge().rc).toBe(0);
    writeCurrent(CURRENT_PIN, [RECORD, RECORD.replace(CREATED, '2026-01-01T00:00:00+00:00')]);
    const v = judge();
    expect(v.rc).toBe(1);
    expect(v.reason).toContain('more than one line');
  });

  it('fails a tagged line that names another address than Terraform holds', () => {
    // Defect caught: a pin left at an address the host no longer has, which
    // verifies whoever is given that address next.
    writeCurrent([...CURRENT_PIN, tagged('198.51.100.20', KEYS[0])]);
    const v = judge();
    expect(v.rc).toBe(1);
    expect(v.reason).toContain('198.51.100.20');
  });

  it('fails a key pinned on one port only', () => {
    // Defect caught: a pin that verifies port 22 and not 2222, which the deploy
    // alias uses, so every deploy refuses the host.
    writeCurrent(CURRENT_PIN.filter((l) => !l.startsWith(`[${IP}]:2222 ssh-rsa`)));
    const v = judge();
    expect(v.rc).toBe(1);
    expect(v.reason).toContain('ssh-rsa');
  });

  it('fails a line not tagged for this environment that names its address', () => {
    // Defect caught: an untagged key for the host, of unknown origin, still
    // trusted by ssh while the check reports the pin current.
    writeCurrent([...CURRENT_PIN, `${IP},[${IP}]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIUnknownOrigin`]);
    const v = judge();
    expect(v.rc).toBe(1);
    expect(v.reason).toContain('not tagged');
  });

  it('reports a Lightsail read it could not make as an error, not as stale', () => {
    // Defect caught: a denied read answered by minting a fresh pin, which is
    // the call the check exists to avoid.
    writeCurrent();
    writeFileSync(join(cur, 'get-instance-fails'), '');
    const v = judge();
    expect(v.rc).toBe(2);
    expect(v.stderr).toContain('AccessDeniedException');
    expect(mintCalls()).toBe('');
  });
});

describe('known_hosts_pin_lines_from_pin and the record writer', () => {
  beforeEach(() => {
    cur = join(workDir, `lines-${++caseNo}`);
    mkdirSync(cur, { recursive: true });
    curPin = join(cur, 'footbag_known_hosts');
    curRecord = `${curPin}.instances`;
    writeCurrencyStubs();
  });

  it('takes this environment\'s tagged lines and nothing else', () => {
    // Defect caught: production's keys, or an untagged line of unknown origin,
    // sealed to a newcomer as staging's.
    const prod = tagged('203.0.113.20', KEYS[0], 'footbag-production');
    const untagged = `${IP} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIUntagged`;
    writeCurrent([prod, ...CURRENT_PIN, untagged]);
    const r = runLib(['known_hosts_pin_lines_from_pin staging || exit 1', 'printf "%s\\n" "$KNOWN_HOSTS_PIN_LINES"']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n').filter(Boolean)).toEqual(CURRENT_PIN);
  });

  it('refuses a pin holding fewer than one key on both ports', () => {
    writeCurrent([CURRENT_PIN[0]]);
    const r = runLib(['known_hosts_pin_lines_from_pin staging']);
    expect(r.status).toBe(1);
  });

  it('replaces this environment\'s record line, keeps the other\'s, and writes it mode 600', () => {
    // Defect caught: a staging install erasing production's record, so the
    // next production check sends the operator to mint; or a record others can
    // rewrite.
    writeCurrent(CURRENT_PIN, [PROD_RECORD, RECORD.replace(CREATED, '2026-01-01T00:00:00+00:00')]);
    const r = runLib([`known_hosts_record_write staging ${JSON.stringify(RECORD)}`]);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(curRecord, 'utf-8')).toBe(`${PROD_RECORD}\n${RECORD}\n`);
    expect(statSync(curRecord).mode & 0o777).toBe(0o600);
  });

  it('refuses to record a line that is not an instance record for the environment', () => {
    // Defect caught: a delivery's forged record line, or production's, written
    // beside a newcomer's staging pin.
    const r = runLib([`known_hosts_record_write staging ${JSON.stringify(PROD_RECORD)}`]);
    expect(r.status).toBe(1);
    expect(existsSync(curRecord)).toBe(false);
  });
});
