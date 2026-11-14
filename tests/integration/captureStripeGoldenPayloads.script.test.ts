/**
 * scripts/capture-stripe-golden-payloads.sh: the capture of real Stripe
 * test-mode events into the committed golden-payload set.
 *
 * A real run reads a test key from the terminal and calls the Stripe events
 * API, which CI cannot reach. The script's curl seam,
 * FOOTBAG_STRIPE_CAPTURE_CURL_BIN, stands in for the API here, and the key may
 * come from the environment only while that seam is in use, so no case can
 * reach a real account. The sanitiser runs for real.
 *
 * What these pin: every refusal that keeps real money, a donor's details or a
 * payload from the wrong API version out of a public repository, each beside a
 * run the same guard lets through; that a write happens only on a typed APPLY,
 * and what it writes is the sanitised set; and that the key never reaches an
 * argument list or outlives the run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { requireToolInCI } from '../fixtures/toolAvailability';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { findSanitisationViolations } from '../../scripts/lib/stripe-golden-sanitise';

/** A run with no controlling terminal has to be made: one is inherited otherwise. */
const SETSID = requireToolInCI('setsid', '--version');
/** The typed APPLY needs a terminal to be typed into. */
const SCRIPT_PTY = requireToolInCI('script', '--version');

const SCRIPT = join(process.cwd(), 'scripts/capture-stripe-golden-payloads.sh');
const PINNED_VERSION = readFileSync(join(process.cwd(), 'scripts/activate-payments.sh'), 'utf-8')
  .split('\n').find((l) => l.startsWith('STRIPE_API_VERSION='))!.split('"')[1];

const TEST_KEY = 'sk_test_synthetic';
const EVENT_ID = 'evt_1Pq2Rs3Tu4Vw5Xy6';

/** A test-mode one-time settlement carrying a donor's address, words and real ids. */
function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: EVENT_ID,
    object: 'event',
    api_version: PINNED_VERSION,
    created: 1767225600,
    data: { object: {
      id: 'pi_3U6jlzPD9Y5ur16e', object: 'payment_intent', amount: 1500, currency: 'usd',
      receipt_email: 'pat@example.org',
      metadata: { paymentId: 'pay_3e1f5a0b33fc4009b69a0ec7', memberId: 'member_0a1b2c3d4e5f60718293a4b5', comment: 'for the club' },
    } },
    livemode: false,
    type: 'payment_intent.succeeded',
    ...overrides,
  };
}

let dir: string;
let fakeCurl: string;
let caseCounter = 0;

beforeAll(() => {
  dir = createScratchDir('capture-stripe-golden');
  // Records each argv, notes the curl config it was handed, and answers the
  // listing from FAKE_LIST (FAKE_LIST2 once a page cursor is sent) and a single
  // event from FAKE_EVENTS/<id>.json. FAKE_FAIL makes every call fail as a
  // dropped connection would.
  fakeCurl = join(dir, 'fake-curl.sh');
  writeFileSync(fakeCurl, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'printf "%s\\n" "$*" >> "$FAKE_LOG"',
    'OUT=""; URL=""; prev=""; CURSOR=""',
    'for arg in "$@"; do',
    '  [[ "$prev" == "-o" ]] && OUT="$arg"',
    '  [[ "$prev" == "--config" ]] && printf "%s\\n" "$arg" >> "$FAKE_CONFIGS"',
    '  case "$arg" in https://api.stripe.com/*) URL="$arg" ;; starting_after=*) CURSOR="$arg" ;; esac',
    '  prev="$arg"',
    'done',
    '[[ -z "${FAKE_FAIL:-}" ]] || exit 7',
    'if [[ "$URL" == */v1/events ]]; then',
    '  if [[ -n "$CURSOR" ]]; then cat "$FAKE_LIST2" > "$OUT"; else cat "$FAKE_LIST" > "$OUT"; fi',
    'else',
    '  ID="${URL##*/}"',
    '  if [[ -e "$FAKE_EVENTS/$ID.json" ]]; then cat "$FAKE_EVENTS/$ID.json" > "$OUT";',
    '  else printf \'{"error":{"message":"No such event: %s"}}\' "$ID" > "$OUT"; fi',
    'fi',
    '',
  ].join('\n'));
  chmodSync(fakeCurl, 0o755);
});

afterAll(() => removeScratch(dir));

interface RunOptions {
  events?: Record<string, unknown>[];
  list?: Record<string, unknown>;
  list2?: Record<string, unknown>;
  key?: string | null;
  noTerminal?: boolean;
  /** Run inside a pseudo-terminal and type this line, as an operator would. */
  typed?: string;
  fail?: boolean;
}

interface RunResult {
  exitCode: number;
  output: string;
  curlCalls: string[];
  configs: string[];
}

function runScript(args: string[], opts: RunOptions = {}): RunResult {
  caseCounter += 1;
  const eventsDir = createScratchDir(`capture-events-${caseCounter}`);
  for (const e of opts.events ?? [event()]) writeFileSync(join(eventsDir, `${e.id}.json`), JSON.stringify(e));
  const list = join(dir, `list-${caseCounter}.json`);
  const list2 = join(dir, `list2-${caseCounter}.json`);
  const log = join(dir, `curl-${caseCounter}.log`);
  const configs = join(dir, `configs-${caseCounter}.log`);
  writeFileSync(list, JSON.stringify(opts.list ?? { data: [], has_more: false }));
  writeFileSync(list2, JSON.stringify(opts.list2 ?? { data: [], has_more: false }));
  writeFileSync(log, '');
  writeFileSync(configs, '');
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    FOOTBAG_STRIPE_CAPTURE_CURL_BIN: fakeCurl,
    FOOTBAG_STRIPE_CAPTURE_DATE: '2026-11-20',
    FAKE_LIST: list, FAKE_LIST2: list2, FAKE_EVENTS: eventsDir, FAKE_LOG: log, FAKE_CONFIGS: configs,
    ...(opts.fail ? { FAKE_FAIL: '1' } : {}),
  };
  if (opts.key !== null) env.FOOTBAG_STRIPE_CAPTURE_KEY_VALUE = opts.key ?? TEST_KEY;

  let result;
  if (opts.typed !== undefined) {
    const inner = ['bash', SCRIPT, ...args].map((a) => `'${a}'`).join(' ');
    result = spawnSync('script', ['-qec', inner, '/dev/null'], {
      cwd: process.cwd(), env, input: `${opts.typed}\n`, encoding: 'utf-8', ...SPAWN_GUARD,
    });
  } else {
    const [command, argv] = opts.noTerminal
      ? ['setsid', ['--wait', 'bash', SCRIPT, ...args]]
      : ['bash', [SCRIPT, ...args]];
    result = spawnSync(command as string, argv as string[], {
      cwd: process.cwd(), env, encoding: 'utf-8', ...SPAWN_GUARD,
    });
  }
  removeScratch(eventsDir);
  const lines = (p: string) => readFileSync(p, 'utf-8').split('\n').filter((l) => l.trim() !== '');
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    curlCalls: lines(log),
    configs: lines(configs),
  };
}

function manifest(text: string): string {
  caseCounter += 1;
  const p = join(dir, `manifest-${caseCounter}.txt`);
  writeFileSync(p, text);
  return p;
}

const CAPTURE = (m: string, out: string) => ['--target', 'production', '--manifest', m, '--out', out];
const ONE_LINE = `${EVENT_ID} | a one-time donation settling | processed | one-time\n`;

describe('capture-stripe-golden-payloads.sh: arguments', () => {
  it('rejects an unknown argument', () => {
    const r = runScript(['--bogus']);
    expect(r.exitCode).toBe(2);
    expect(r.output).toMatch(/unknown argument/);
  });

  it('refuses every target but production, and lets production through', () => {
    // Staging runs the stub adapter, so nothing it holds is the provider's shape.
    const refused = runScript(['--target', 'staging', '--list', '--since', '2026-11-20']);
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toMatch(/--target must be production/);
    expect(refused.curlCalls).toHaveLength(0);
    expect(runScript(['--target', 'production', '--list', '--since', '2026-11-20']).exitCode).toBe(0);
  });

  it('needs a date to list from, and a manifest and an output to capture', () => {
    expect(runScript(['--target', 'production', '--list']).output).toMatch(/--list needs --since/);
    expect(runScript(['--target', 'production', '--list', '--since', '20 Nov']).output)
      .toMatch(/--since must be YYYY-MM-DD/);
    // The readiness sitting passes the UTC time a step started.
    expect(runScript(['--target', 'production', '--list', '--since', '2026-11-20T09:15:00Z']).exitCode).toBe(0);
    expect(runScript(['--target', 'production', '--list', '--since', '2026-11-20T09:15']).output)
      .toMatch(/--since must be YYYY-MM-DD or a UTC time/);
    expect(runScript(['--target', 'production', '--manifest', manifest(ONE_LINE)]).output)
      .toMatch(/needs both --manifest <file> and --out <file>/);
  });

  it('refuses a manifest line that names no event', () => {
    const r = runScript(CAPTURE(manifest('ch_1Aa | a charge | processed | g\n'), join(dir, 'never.json')));
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/'ch_1Aa', which is not an event id/);
    expect(r.curlCalls).toHaveLength(0);
  });
});

describe('capture-stripe-golden-payloads.sh: the seam, the terminal and the key', () => {
  it('says on stderr that a seam is in use, so a stubbed run is never mistaken for proof', () => {
    expect(runScript(['--target', 'production', '--list', '--since', '2026-11-20']).output)
      .toMatch(/SYNTHETIC: a test seam is in use/);
  });

  it('dry-runs without reading a key or calling out', () => {
    const r = runScript([...CAPTURE(manifest(ONE_LINE), join(dir, 'dry.json')), '--dry-run'], { key: null });
    expect(r.exitCode).toBe(0);
    expect(r.output).toMatch(/Dry run: no key read, no call made/);
    expect(r.curlCalls).toHaveLength(0);
  });

  it.skipIf(!SETSID)('refuses without a terminal when no synthetic key is supplied', () => {
    const r = runScript(['--target', 'production', '--list', '--since', '2026-11-20'], { key: null, noTerminal: true });
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/no terminal/);
    expect(r.curlCalls).toHaveLength(0);
  });

  it('refuses a live key and anything that is not a key, before any call', () => {
    // A live key would read real donors' events into a public repository.
    for (const key of ['sk_live_synthetic', 'rk_live_synthetic', 'not-a-key']) {
      const r = runScript(['--target', 'production', '--list', '--since', '2026-11-20'], { key });
      expect(r.exitCode, key).toBe(1);
      expect(r.curlCalls, key).toHaveLength(0);
    }
    expect(runScript(['--target', 'production', '--list', '--since', '2026-11-20'], { key: 'rk_test_synthetic' }).exitCode)
      .toBe(0);
  });

  it('never puts the key in an argument list, and leaves no curl config behind', () => {
    const ok = runScript(['--target', 'production', '--list', '--since', '2026-11-20']);
    const failed = runScript(['--target', 'production', '--list', '--since', '2026-11-20'], { fail: true });
    expect(failed.exitCode).toBe(1);
    for (const r of [ok, failed]) {
      expect(r.curlCalls.length).toBeGreaterThan(0);
      expect(r.curlCalls.join('\n')).not.toContain(TEST_KEY);
      expect(r.configs.length).toBeGreaterThan(0);
      for (const c of r.configs) expect(existsSync(c), c).toBe(false);
    }
  });
});

describe('capture-stripe-golden-payloads.sh: --list', () => {
  it('prints every event since the date across pages, and no bodies', () => {
    // A listing that stopped at the first page would leave a run's later events
    // out of the manifest without saying so.
    const r = runScript(['--target', 'production', '--list', '--since', '2026-11-20'], {
      list: { data: [{ id: 'evt_page1', type: 'invoice.paid', created: 1767225600, api_version: PINNED_VERSION, livemode: false, data: { object: { receipt_email: 'pat@example.org' } } }], has_more: true },
      list2: { data: [{ id: 'evt_page2', type: 'charge.refunded', created: 1767225700, api_version: PINNED_VERSION, livemode: false }], has_more: false },
    });
    expect(r.exitCode).toBe(0);
    expect(r.output).toMatch(/evt_page1\tinvoice\.paid\t2026-01-01T00:00:00Z\t/);
    expect(r.output).toMatch(/evt_page2\tcharge\.refunded\t/);
    expect(r.output).not.toContain('pat@example.org');
    expect(r.curlCalls[1]).toMatch(/starting_after=evt_page1/);
    expect(r.output).toMatch(/listed 2 events/);
  });
});

describe('capture-stripe-golden-payloads.sh: a capture', () => {
  it('refuses a live-mode event and writes nothing', () => {
    const out = join(dir, 'live.json');
    const r = runScript(CAPTURE(manifest(ONE_LINE), out), { events: [event({ livemode: true })] });
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/is not a test-mode event/);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses an event sent at another API version and writes nothing', () => {
    const out = join(dir, 'version.json');
    const r = runScript(CAPTURE(manifest(ONE_LINE), out), { events: [event({ api_version: '2025-01-27.acacia' })] });
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/sent at API version 2025-01-27\.acacia, and the adapter pins/);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses an event the provider does not have', () => {
    const r = runScript(CAPTURE(manifest('evt_9Missing9 | gone | processed | g\n'), join(dir, 'missing.json')));
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/Stripe refused .*No such event: evt_9Missing9/);
  });

  it('writes nothing without a typed APPLY', () => {
    const out = join(dir, 'unconfirmed.json');
    const r = runScript(CAPTURE(manifest(ONE_LINE), out));
    expect(r.exitCode).toBe(1);
    expect(r.output).toMatch(/no terminal to confirm on|nothing was written/);
    expect(existsSync(out)).toBe(false);
  });

  it.skipIf(!SCRIPT_PTY)('on APPLY writes the sanitised set, and a repeat finds nothing to write', () => {
    // The written body must be the sanitiser's output: a script that wrote the
    // raw event would publish the donor's address, words and ids.
    const out = join(dir, 'applied.json');
    const m = manifest(ONE_LINE);
    const applied = runScript(CAPTURE(m, out), { typed: 'APPLY' });
    expect(applied.exitCode, applied.output).toBe(0);
    const set = JSON.parse(readFileSync(out, 'utf-8')) as Array<Record<string, string>>;
    expect(set).toHaveLength(1);
    expect(set[0]).toMatchObject({
      describes: 'a one-time donation settling', eventType: 'payment_intent.succeeded',
      expectedOutcome: 'processed', sequenceGroup: 'one-time', capturedApiVersion: PINNED_VERSION,
      capturedAt: '2026-11-20',
    });
    expect(findSanitisationViolations(set[0].rawBody)).toEqual([]);
    expect(set[0].rawBody).not.toContain('pat@example.org');
    expect(set[0].rawBody).not.toContain('pay_3e1f5a0b33fc4009b69a0ec7');
    for (const c of applied.configs) expect(existsSync(c)).toBe(false);

    // Idempotent: the same capture again changes nothing and asks nothing.
    const again = runScript(CAPTURE(m, out));
    expect(again.exitCode, again.output).toBe(0);
    expect(again.output).toMatch(/nothing to write/);
  });
});
