/**
 * scripts/link-stripe-test-clock.sh: the test-clock customer link for the
 * payment rehearsal on pre-cutover production.
 *
 * A real run reads the production-live marker from AWS, a test key from the
 * terminal, calls the Stripe API, and reaches the production host. Each has a
 * stand-in here: the script's AWS and curl seams, and the shared ssh seam,
 * whose stand-in drops the password line as sudo would and runs the real remote
 * half against a stand-in `docker` that answers as the entry point does.
 *
 * What these pin: each refusal (a live or unknown marker, a live key, a member
 * the host refuses, no terminal, no APPLY) beside the run it lets through; that
 * the record of the change lands before the write; and that a run which created
 * a clock and could not link it deletes the clock, so nothing is left at the
 * provider that no record names.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { requireToolInCI } from '../fixtures/toolAvailability';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';

const SETSID = requireToolInCI('setsid', '--version');
const SCRIPT_PTY = requireToolInCI('script', '--version');

const SCRIPT = join(process.cwd(), 'scripts/link-stripe-test-clock.sh');
const PASSWORD = 'stub-sudo-password';
const TEST_KEY = 'sk_test_synthetic';
const MEMBER = 'clock_member';
const MEMBER_ID = 'member_gold0000000000000000000a';
const CLOCK = 'clock_gold000000000b';
const CUSTOMER = 'cus_gold00000000000c';

let dir: string;
let caseCounter = 0;

function exe(path: string, lines: string[]): void {
  writeFileSync(path, `${lines.join('\n')}\n`, { mode: 0o755 });
}

beforeAll(() => {
  dir = createScratchDir('link-stripe-test-clock');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  mkdirSync(join(dir, 'home', 'AWS'), { recursive: true });
  writeFileSync(join(dir, 'home', 'AWS', 'AWS_OPERATOR_PRODUCTION.txt'), `${PASSWORD}\n`, { mode: 0o600 });
  writeFileSync(join(dir, 'known_hosts'), '[203.0.113.10]:22 ssh-ed25519 AAAA\n');
  writeFileSync(join(dir, 'host.env'), 'FOOTBAG_ENV=production\n');

  // The ssh stand-in: answers alias resolution and the host's identity, then
  // records the stream and runs it as sudo would, password line dropped.
  exe(join(bin, 'ssh'), [
    '#!/usr/bin/env bash',
    hostIdentityAnswer(),
    'for a in "$@"; do',
    '  if [[ "$a" == "-G" ]]; then echo "hostname 203.0.113.10"; echo "user footbag"; exit 0; fi',
    'done',
    'cat > "$FAKE_STREAM.$$"',
    'cat "$FAKE_STREAM.$$" >> "$FAKE_STREAM"',
    'tail -n +2 "$FAKE_STREAM.$$" | PATH="$FAKE_BIN:$PATH" bash',
  ]);
  // The docker stand-in: answers as the entry point would for a check and a link.
  exe(join(bin, 'docker'), [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" >> "$FAKE_DOCKER_LOG"',
    'if [[ " $* " == *" --check "* ]]; then echo "$FAKE_CHECK_LINE"; exit "$FAKE_CHECK_RC"; fi',
    'echo "$FAKE_LINK_LINE"; exit "$FAKE_LINK_RC"',
  ]);
  // The curl stand-in: a clock, a customer on it, and a delete, each recorded.
  exe(join(bin, 'curl'), [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" >> "$FAKE_CURL_LOG"',
    'OUT=""; URL=""; prev=""; DELETE=0',
    'for a in "$@"; do',
    '  [[ "$prev" == "-o" ]] && OUT="$a"',
    '  [[ "$prev" == "--config" ]] && printf "%s\\n" "$a" >> "$FAKE_CONFIGS"',
    '  [[ "$a" == "DELETE" ]] && DELETE=1',
    '  case "$a" in https://api.stripe.com/*) URL="$a" ;; esac',
    '  prev="$a"',
    'done',
    `if (( DELETE )); then echo '{"id":"${CLOCK}","deleted":true}' > "$OUT"`,
    `elif [[ "$URL" == */test_clocks ]]; then echo '{"id":"${CLOCK}","object":"test_helpers.test_clock","livemode":false}' > "$OUT"`,
    'else echo "$FAKE_CUSTOMER" > "$OUT"; fi',
  ]);
  // The aws stand-in for the marker read.
  exe(join(bin, 'aws-marker'), [
    '#!/usr/bin/env bash',
    'printf "%s\\n" "$*" >> "$FAKE_AWS_LOG"',
    'echo "$FAKE_MARKER"; exit "$FAKE_MARKER_RC"',
  ]);
});

afterAll(() => removeScratch(dir));

interface RunOptions {
  marker?: string;
  markerRc?: number;
  key?: string | null;
  checkLine?: string;
  checkRc?: number;
  linkLine?: string;
  linkRc?: number;
  customer?: Record<string, unknown>;
  noTerminal?: boolean;
  typed?: string;
}

interface RunResult {
  exitCode: number;
  output: string;
  curl: string[];
  docker: string[];
  stream: string;
  configs: string[];
}

function runScript(args: string[], opts: RunOptions = {}): RunResult {
  caseCounter += 1;
  const f = (name: string) => join(dir, `${name}-${caseCounter}`);
  for (const n of ['curl', 'docker', 'aws', 'stream', 'configs']) writeFileSync(f(n), '');
  const bin = join(dir, 'bin');
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...awsIdentityStubEnv(dir),
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    HOME: join(dir, 'home'),
    FOOTBAG_HOST_SSH_BIN: join(bin, 'ssh'),
    FOOTBAG_KNOWN_HOSTS: join(dir, 'known_hosts'),
    FOOTBAG_STRIPE_TESTCLOCK_CURL_BIN: join(bin, 'curl'),
    FOOTBAG_STRIPE_TESTCLOCK_AWS_BIN: join(bin, 'aws-marker'),
    ENV_PATH: join(dir, 'host.env'),
    FAKE_BIN: bin,
    FAKE_CURL_LOG: f('curl'), FAKE_DOCKER_LOG: f('docker'), FAKE_AWS_LOG: f('aws'),
    FAKE_STREAM: f('stream'), FAKE_CONFIGS: f('configs'),
    FAKE_MARKER: opts.marker ?? 'false', FAKE_MARKER_RC: String(opts.markerRc ?? 0),
    FAKE_CHECK_LINE: opts.checkLine ?? `LINK: CHECK member=${MEMBER_ID}`,
    FAKE_CHECK_RC: String(opts.checkRc ?? 0),
    FAKE_LINK_LINE: opts.linkLine ?? `LINK: LINKED member=${MEMBER_ID} customer=${CUSTOMER}`,
    FAKE_LINK_RC: String(opts.linkRc ?? 0),
    FAKE_CUSTOMER: JSON.stringify(opts.customer ?? { id: CUSTOMER, object: 'customer', livemode: false, test_clock: CLOCK }),
  };
  if (opts.key !== null) env.FOOTBAG_STRIPE_TESTCLOCK_KEY_VALUE = opts.key ?? TEST_KEY;

  const pass = join(dir, 'pass.txt');
  writeFileSync(pass, `${PASSWORD}\n`, { mode: 0o600 });
  let result;
  if (opts.typed !== undefined) {
    const inner = `${['bash', SCRIPT, ...args].map((a) => `'${a}'`).join(' ')} < '${pass}'`;
    result = spawnSync('script', ['-qec', inner, '/dev/null'], {
      cwd: process.cwd(), env, input: `${opts.typed}\n`, encoding: 'utf-8', ...SPAWN_GUARD,
    });
  } else {
    const [command, argv] = opts.noTerminal
      ? ['setsid', ['--wait', 'bash', SCRIPT, ...args]]
      : ['bash', [SCRIPT, ...args]];
    result = spawnSync(command as string, argv as string[], {
      cwd: process.cwd(), env, input: `${PASSWORD}\n`, encoding: 'utf-8', ...SPAWN_GUARD,
    });
  }
  const lines = (p: string) => readFileSync(p, 'utf-8').split('\n').filter((l) => l.trim() !== '');
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    curl: lines(f('curl')),
    docker: lines(f('docker')),
    stream: readFileSync(f('stream'), 'utf-8'),
    configs: lines(f('configs')),
  };
}

const DRY = ['--target', 'production', '--member', MEMBER];
function recordDir(): string {
  caseCounter += 1;
  const d = join(dir, `records-${caseCounter}`);
  mkdirSync(d);
  return d;
}

describe('link-stripe-test-clock.sh: arguments', () => {
  it('rejects an unknown argument', () => {
    const r = runScript(['--bogus']);
    expect(r.exitCode).toBe(2);
    expect(r.output).toMatch(/unknown argument/);
  });

  it('refuses every target but production, a malformed slug, and a record directory out of place', () => {
    expect(runScript(['--target', 'staging', '--member', MEMBER]).output).toMatch(/--target must be production/);
    expect(runScript(['--target', 'production', '--member', 'Bad Slug']).output).toMatch(/--member must be a member's slug/);
    expect(runScript([...DRY, '--apply']).output).toMatch(/--apply needs --record-dir/);
    expect(runScript([...DRY, '--record-dir', dir]).output).toMatch(/--record-dir is only for --apply/);
  });
});

describe('link-stripe-test-clock.sh: the marker, the terminal and the key', () => {
  it('refuses a marker that is not exactly false, or cannot be read, before touching anything', () => {
    // After go-live production holds real donors and no test key; a failed read
    // taken as "before launch" would link on a live platform.
    for (const [marker, markerRc] of [['true', 0], ['False', 0], ['', 0], ['AccessDenied', 255]] as const) {
      const r = runScript(DRY, { marker, markerRc });
      expect(r.exitCode, marker).toBe(1);
      expect(r.output, marker).toMatch(/production-live marker/);
      expect(r.curl, marker).toHaveLength(0);
      expect(r.docker, marker).toHaveLength(0);
    }
  });

  it('says on stderr that a seam is in use, and a dry run with every precondition met passes', () => {
    const r = runScript(DRY);
    expect(r.exitCode, r.output).toBe(0);
    expect(r.output).toMatch(/SYNTHETIC: a test seam is in use/);
    expect(r.output).toMatch(/nothing was created or written/);
    expect(r.docker).toEqual([expect.stringMatching(/exec -T web node dist\/runLinkTestClockCustomer\.js --member clock_member --check/)]);
    expect(r.curl).toHaveLength(0);
  });

  it.skipIf(!SETSID)('refuses without a terminal when no synthetic key is supplied', () => {
    const r = runScript(DRY, { key: null, noTerminal: true });
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/no terminal/);
    expect(r.curl).toHaveLength(0);
  });

  it('refuses a live key and anything that is not a test secret key, before the host is asked', () => {
    for (const key of ['sk_live_synthetic', 'rk_live_synthetic', 'rk_test_synthetic', 'not-a-key']) {
      const r = runScript(DRY, { key });
      expect(r.exitCode, key).toBe(1);
      expect(r.docker, key).toHaveLength(0);
      expect(r.curl, key).toHaveLength(0);
    }
  });
});

describe('link-stripe-test-clock.sh: the host decides the member and the key mode', () => {
  it('refuses when the host refuses the check, creating nothing', () => {
    // The payment service is where a held customer or a live key is refused; the
    // script must stop on its word, not carry on to Stripe.
    const r = runScript([...DRY, '--apply', '--record-dir', recordDir()], {
      checkLine: 'LINK: REFUSED this member already holds a Stripe customer; name a member with no recurring donation yet',
      checkRc: 1,
    });
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/the host refused the link \(session exit 1\): REFUSED this member already holds/);
    expect(r.curl).toHaveLength(0);
  });

  it('creates nothing without a typed APPLY', () => {
    const records = recordDir();
    const r = runScript([...DRY, '--apply', '--record-dir', records]);
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/no terminal to confirm on|not confirmed/);
    expect(r.curl).toHaveLength(0);
    expect(readdirSync(records)).toEqual([]);
  });
});

describe('link-stripe-test-clock.sh: --member-from-tty', () => {
  it.skipIf(!SCRIPT_PTY)('asks for the member at the terminal and checks the one typed', () => {
    // The readiness sitting writes this command down before the member is chosen;
    // a typed slug that went unchecked, or was ignored, would link the wrong member.
    const r = runScript(['--target', 'production', '--member-from-tty'], { typed: MEMBER });
    expect(r.exitCode, r.output).toBe(0);
    expect(r.docker).toEqual([expect.stringMatching(/--member clock_member --check$/)]);
    const bad = runScript(['--target', 'production', '--member-from-tty'], { typed: 'Not A Slug' });
    expect(bad.exitCode).toBe(1);
    expect(bad.output).toMatch(/--member must be a member's slug/);
    expect(bad.docker).toHaveLength(0);
  });

  it('refuses both ways of naming the member at once', () => {
    const r = runScript([...DRY, '--member-from-tty']);
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/not both/);
  });
});

describe('link-stripe-test-clock.sh: --apply', () => {
  it.skipIf(!SCRIPT_PTY)('creates the clock and its customer, records the change, then links it', () => {
    const records = recordDir();
    const r = runScript([...DRY, '--apply', '--record-dir', records], { typed: 'APPLY' });
    expect(r.exitCode, r.output).toBe(0);
    expect(r.curl.map((c) => c.match(/https:\/\/api\.stripe\.com\/\S+/)?.[0])).toEqual([
      'https://api.stripe.com/v1/test_helpers/test_clocks',
      'https://api.stripe.com/v1/customers',
    ]);
    expect(r.curl[1]).toContain(`test_clock=${CLOCK}`);
    expect(r.docker[1]).toMatch(new RegExp(`--member clock_member --customer ${CUSTOMER}$`));
    expect(r.stream).toContain(`CUSTOMER_ID=${CUSTOMER}`);

    const files = readdirSync(records).sort();
    expect(files).toHaveLength(2);
    expect(readFileSync(join(records, files[0]), 'utf-8'))
      .toBe(`table,id,column,before,after,test_clock\nmembers,${MEMBER_ID},stripe_customer_id,,${CUSTOMER},${CLOCK}\n`);
    expect(readFileSync(join(records, files[1]), 'utf-8')).toContain(
      `UPDATE members SET stripe_customer_id = NULL WHERE id = '${MEMBER_ID}' AND stripe_customer_id = '${CUSTOMER}';`,
    );
    // The key went into a curl config, never an argument, and the config is gone.
    expect(r.curl.join('\n')).not.toContain(TEST_KEY);
    expect(r.stream).not.toContain(TEST_KEY);
    for (const c of r.configs) expect(existsSync(c)).toBe(false);
  });

  it.skipIf(!SCRIPT_PTY)('deletes the clock it made when the link does not land', () => {
    // Left behind, the clock and its customer would sit in the account with no
    // member pointing at them and nothing saying why they exist.
    const r = runScript([...DRY, '--apply', '--record-dir', recordDir()], {
      typed: 'APPLY', linkLine: 'LINK: REFUSED the payment key this host holds reads as live, not test', linkRc: 1,
    });
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/did not link the customer/);
    const deletes = r.curl.filter((c) => c.includes('DELETE'));
    expect(deletes).toEqual([expect.stringContaining(`/v1/test_helpers/test_clocks/${CLOCK}`)]);
  });

  it.skipIf(!SCRIPT_PTY)('refuses a customer that is not on the clock, and deletes the clock', () => {
    const r = runScript([...DRY, '--apply', '--record-dir', recordDir()], {
      typed: 'APPLY', customer: { id: CUSTOMER, object: 'customer', livemode: false, test_clock: null },
    });
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/not return a test-mode customer attached/);
    expect(r.docker).toHaveLength(1);
    expect(r.curl.filter((c) => c.includes('DELETE'))).toHaveLength(1);
  });
});
