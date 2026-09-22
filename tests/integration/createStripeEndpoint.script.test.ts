/**
 * scripts/create-stripe-endpoint.sh — the --verify and --repair paths.
 *
 * A real run prompts for a live Stripe secret key and talks to the Stripe API,
 * which CI cannot exercise. The script carries two named test seams for exactly
 * this: FOOTBAG_STRIPE_ENDPOINT_CURL_BIN replaces curl, and
 * FOOTBAG_STRIPE_ENDPOINT_TF_BIN replaces the terraform read that resolves the
 * distribution domain. The key may come from the environment only while the
 * curl seam is in use, so no test path can reach the real account.
 *
 * These tests pin what --verify is for. It exists because the event-set diff
 * used to run once, against the creation call's own response, and never again:
 * an endpoint edited afterwards, or left behind by a code change that added an
 * event, both passed unnoticed while Stripe silently stopped delivering. So the
 * cases that matter here are the disagreements — missing events, unexpected
 * ones, a wildcard subscription, a stale URL, a version off the pin — and the
 * refusals that keep --repair from papering over the ones it cannot fix.
 *
 * The expected event list is read out of the activation script rather than
 * restated, for the same reason the script itself reads it there: a second copy
 * is a second thing to drift.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { requireToolInCI } from '../fixtures/toolAvailability';

/**
 * The no-terminal case has to create its own absence of a terminal.
 *
 * A controlling terminal is inherited, not chosen: a developer running the
 * suite from their own shell hands one to every process the run spawns, and the
 * script then does the right thing and prompts, on that developer's terminal,
 * until the spawn bound kills it. The case passes only where no terminal
 * happened to be attached, which is the runner and an editor's task pane, so
 * the machine decides the verdict rather than the test. `setsid` puts the
 * script in a session of its own with no controlling terminal, which is the
 * condition the case is about; `--wait` keeps its exit status and its stderr.
 */
const SETSID = requireToolInCI('setsid', '--version');

const SCRIPT = join(process.cwd(), 'scripts/create-stripe-endpoint.sh');
const ACTIVATE = join(process.cwd(), 'scripts/activate-payments.sh');

const DOMAIN = 'd1234abcdef8.cloudfront.net';
const EXPECTED_URL = `https://${DOMAIN}/payments/webhook`;
/** What terraform's `platform_url` output reads once the custom-domain flag is
 *  on: the `www` host, never the bare apex, which only redirects. */
const CANONICAL_ORIGIN = 'https://www.footbag.org';

/** The dispatcher's event list and pinned version, from their single source. */
function readFromActivationScript(name: string): string {
  const line = readFileSync(ACTIVATE, 'utf-8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found in the activation script`);
  return line.split('"')[1];
}
const REQUIRED_EVENTS = readFromActivationScript('REQUIRED_WEBHOOK_EVENTS').split(/\s+/);
const PINNED_VERSION = readFromActivationScript('STRIPE_API_VERSION');

/** The five events added after the live endpoint was created, in commit 4292d823. */
const ADDED_AFTER_LIVE_ENDPOINT = [
  'refund.failed',
  'refund.updated',
  'charge.dispute.updated',
  'charge.dispute.funds_reinstated',
  'invoice.paid',
];

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Every argv the curl seam saw, one line per invocation. */
  curlCalls: string[];
}

let tmpDir: string;
let fakeCurl: string;
let fakeTerraform: string;
let caseCounter = 0;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'footbag-test-create-stripe-endpoint-'));

  // Answers the two outputs the script reads: the distribution's own name, which
  // the endpoint is created against, and the canonical origin, which is where
  // the cutover moves it. Both are real outputs; answering only the first is how
  // the script came to rebuild the second by hand.
  fakeTerraform = join(tmpDir, 'fake-terraform.sh');
  writeFileSync(
    fakeTerraform,
    [
      '#!/usr/bin/env bash',
      'for arg in "$@"; do',
      `  if [[ "$arg" == "platform_url" ]]; then echo "${CANONICAL_ORIGIN}"; exit 0; fi`,
      'done',
      `echo "${DOMAIN}"`,
      '',
    ].join('\n'),
  );
  chmodSync(fakeTerraform, 0o755);

  // Answers the collection GET from FAKE_LIST and any single-endpoint GET or
  // POST from FAKE_SINGLE, and records every argv so a test can prove that a
  // read-only run wrote nothing.
  fakeCurl = join(tmpDir, 'fake-curl.sh');
  writeFileSync(
    fakeCurl,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'printf "%s\\n" "$*" >> "$FAKE_LOG"',
      'OUT=""; URL=""; prev=""',
      'for arg in "$@"; do',
      '  if [[ "$prev" == "-o" ]]; then OUT="$arg"; fi',
      '  case "$arg" in https://api.stripe.com/*) URL="$arg" ;; esac',
      '  prev="$arg"',
      'done',
      'if [[ "$URL" == */webhook_endpoints ]]; then',
      '  cat "$FAKE_LIST" > "$OUT"',
      'else',
      '  cat "$FAKE_SINGLE" > "$OUT"',
      'fi',
      '',
    ].join('\n'),
  );
  chmodSync(fakeCurl, 0o755);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

interface EndpointOverrides {
  id?: string;
  url?: string;
  apiVersion?: string;
  events?: string[];
  status?: string;
}

function endpoint(overrides: EndpointOverrides = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'we_synthetic',
    object: 'webhook_endpoint',
    status: overrides.status ?? 'enabled',
    url: overrides.url ?? EXPECTED_URL,
    api_version: overrides.apiVersion ?? PINNED_VERSION,
    enabled_events: overrides.events ?? REQUIRED_EVENTS,
  };
}

interface RunOptions {
  /** The account's endpoint list, as the collection GET returns it. */
  list?: Record<string, unknown>[];
  /** What a single-endpoint GET or POST returns; defaults to a corrected one. */
  single?: Record<string, unknown>;
  /** Omit the key so the run has neither a synthetic key nor a terminal. */
  withKey?: boolean;
  /** Detach from the controlling terminal, so the run genuinely has none. */
  noTerminal?: boolean;
  env?: Record<string, string>;
}

function runScript(args: string[], opts: RunOptions = {}): RunResult {
  caseCounter += 1;
  const listPath = join(tmpDir, `list-${caseCounter}.json`);
  const singlePath = join(tmpDir, `single-${caseCounter}.json`);
  const logPath = join(tmpDir, `curl-${caseCounter}.log`);

  writeFileSync(listPath, JSON.stringify({ object: 'list', data: opts.list ?? [endpoint()] }));
  writeFileSync(singlePath, JSON.stringify(opts.single ?? endpoint()));
  writeFileSync(logPath, '');

  const env: Record<string, string> = {
    ...process.env,
    // The terraform reads are preceded by settling and proving an identity.
    ...awsIdentityStubEnv(tmpDir),
    FOOTBAG_STRIPE_ENDPOINT_CURL_BIN: fakeCurl,
    FOOTBAG_STRIPE_ENDPOINT_TF_BIN: fakeTerraform,
    FAKE_LIST: listPath,
    FAKE_SINGLE: singlePath,
    FAKE_LOG: logPath,
    ...opts.env,
  };
  if (opts.withKey !== false) env.FOOTBAG_STRIPE_ENDPOINT_KEY_VALUE = 'sk_live_synthetic';

  const [command, argv] = opts.noTerminal
    ? ['setsid', ['--wait', 'bash', SCRIPT, ...args]]
    : ['bash', [SCRIPT, ...args]];

  const result = spawnSync(command as string, argv as string[], {
    cwd: process.cwd(),
    env,
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });

  const log = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '';
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    curlCalls: log.split('\n').filter((l) => l.trim() !== ''),
  };
}

describe('create-stripe-endpoint.sh — argument validation', () => {
  it('rejects an unknown argument', () => {
    const result = runScript(['--bogus']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it('rejects an invalid target', () => {
    const result = runScript(['--target', 'dev', '--mode', 'live', '--verify']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be production or staging/);
  });

  it('rejects an invalid mode', () => {
    const result = runScript(['--target', 'production', '--mode', 'sandbox', '--verify']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--mode must be live or test/);
  });

  it('refuses --repair without --verify, so it can never mean "create and also repair"', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--repair']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--repair only applies alongside --verify/);
    expect(result.curlCalls).toHaveLength(0);
  });
});

describe('create-stripe-endpoint.sh — the seam and the terminal guard', () => {
  it('says on stderr that a seam is in use, so a stubbed run is never mistaken for proof', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify']);
    expect(result.stderr).toMatch(/SYNTHETIC: a test seam is in use/);
  });

  it.skipIf(!SETSID)('refuses without a terminal when no synthetic key is supplied', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify'], {
      withKey: false,
      noTerminal: true,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no terminal/);
    expect(result.curlCalls).toHaveLength(0);
  });

  it('dry-runs without reading a key or calling out', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/nothing read/);
    for (const event of REQUIRED_EVENTS) expect(result.stdout).toContain(event);
    expect(result.curlCalls).toHaveLength(0);
  });
});

describe('create-stripe-endpoint.sh --verify — agreement', () => {
  it('passes when the registered set equals the dispatcher\'s', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/exact match/);
    expect(result.stdout).toMatch(/matches the dispatcher/);
  });

  it('is read-only: it issues no POST and no write of any kind', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify']);
    expect(result.exitCode).toBe(0);
    expect(result.curlCalls).toHaveLength(1);
    expect(result.curlCalls[0]).not.toMatch(/-d /);
  });
});

describe('create-stripe-endpoint.sh --verify — disagreement', () => {
  it('names every missing event rather than reporting a count', () => {
    const kept = REQUIRED_EVENTS.filter((e) => !ADDED_AFTER_LIVE_ENDPOINT.includes(e));
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify'], {
      list: [endpoint({ events: kept })],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/MISSING/);
    for (const event of ADDED_AFTER_LIVE_ENDPOINT) expect(result.stderr).toContain(event);
  });

  it('names events registered at the provider that the code does not dispatch', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify'], {
      list: [endpoint({ events: [...REQUIRED_EVENTS, 'payment_intent.canceled'] })],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/UNEXPECTED/);
    expect(result.stderr).toContain('payment_intent.canceled');
  });

  it('treats a wildcard subscription as a disagreement, not a pass', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify'], {
      list: [endpoint({ events: ['*'] })],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/all events/);
  });

  it('accepts the canonical host as well as the distribution name', () => {
    // The endpoint is registered against the distribution's own name and stays
    // there, but an endpoint somebody has moved to the canonical host is this
    // environment's webhook too. Pinning only the first would fail the go-live
    // gate that names this command over a working endpoint.
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify'], {
      list: [endpoint({ url: 'https://www.footbag.org/payments/webhook' })],
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/exact match/);
  });

  it('fails on an endpoint pointing somewhere other than this environment', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify'], {
      list: [endpoint({ url: 'https://stale.example.net/payments/webhook' })],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/MISMATCH url/);
    expect(result.stderr).toContain(EXPECTED_URL);
  });

  it('fails on an API version off the adapter\'s pin', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify'], {
      list: [endpoint({ apiVersion: '2025-01-01.basil' })],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/MISMATCH api_version/);
    expect(result.stderr).toContain(PINNED_VERSION);
  });

  it('fails when nothing is receiving events at all', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify'], {
      list: [],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no enabled webhook endpoint/);
  });

  it('fails when a second enabled endpoint is taking a copy of the traffic', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify'], {
      list: [endpoint({ id: 'we_one' }), endpoint({ id: 'we_two' })],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/exactly one is expected/);
    expect(result.stderr).toContain('we_two');
  });

  it('ignores a disabled endpoint when choosing which one to check', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify'], {
      list: [endpoint({ id: 'we_old', status: 'disabled', events: [] }), endpoint()],
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/exact match/);
  });
});

describe('create-stripe-endpoint.sh --repair', () => {
  const drifted = () => [
    endpoint({ events: REQUIRED_EVENTS.filter((e) => !ADDED_AFTER_LIVE_ENDPOINT.includes(e)) }),
  ];

  it('changes nothing without a confirmation', () => {
    const result = runScript(['--target', 'production', '--mode', 'live', '--verify', '--repair'], {
      list: drifted(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no terminal to confirm on|Not confirmed/);
    expect(result.curlCalls.filter((c) => c.includes('-d '))).toHaveLength(0);
  });

  it('corrects the event list and proves it by re-reading the endpoint', () => {
    const result = runScript(
      ['--target', 'production', '--mode', 'live', '--verify', '--repair', '--yes'],
      { list: drifted(), single: endpoint() },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Repaired/);
    // One list read, one write, then an independent re-read: the write's own
    // response is never the evidence.
    expect(result.curlCalls).toHaveLength(3);
    expect(result.curlCalls[1]).toMatch(/-d /);
    expect(result.curlCalls[2]).not.toMatch(/-d /);
  });

  it('fails when the endpoint still disagrees after the write', () => {
    const result = runScript(
      ['--target', 'production', '--mode', 'live', '--verify', '--repair', '--yes'],
      { list: drifted(), single: endpoint({ events: ['payment_intent.succeeded'] }) },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/still disagrees/);
  });

  it('refuses to repair around an API version it does not change', () => {
    const result = runScript(
      ['--target', 'production', '--mode', 'live', '--verify', '--repair', '--yes'],
      { list: [endpoint({ apiVersion: '2025-01-01.basil', events: [] })] },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/REFUSING to repair/);
    expect(result.curlCalls.filter((c) => c.includes('-d '))).toHaveLength(0);
  });

  it('refuses to repair around a URL it does not change', () => {
    const result = runScript(
      ['--target', 'production', '--mode', 'live', '--verify', '--repair', '--yes'],
      { list: [endpoint({ url: 'https://stale.example.net/payments/webhook', events: [] })] },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/REFUSING to repair/);
    expect(result.curlCalls.filter((c) => c.includes('-d '))).toHaveLength(0);
  });
});
