/**
 * Integration tests for scripts/verify-cutover-notice.sh.
 *
 * This is the only check that can tell the cutover migration notice from the
 * launched platform: the runbook's other probes are provably blind to it (the
 * health path rides an ordered behaviour the edge function never runs on, and
 * the apex redirect fires with the notice both up and down). So the script's
 * own ability to fail is the thing worth pinning — a verifier that passes
 * whatever it observes would wave through the one state the launch decision
 * turns on.
 *
 * The aws CLI is stubbed on PATH, in the idiom restoreDb.script.test.ts
 * established: the stub answers describe-function with an ETag and
 * test-function with whatever the case wants the edge runtime to have returned,
 * so the four-way host matrix and the verdict logic are exercised without an
 * AWS account and without a published function.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = 'scripts/verify-cutover-notice.sh';

let workDir: string;
let binDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-cutover-notice-'));
  binDir = path.join(workDir, 'bin');
  fs.mkdirSync(binDir);
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

/** Where the aws stub records every call it received, one line per invocation. */
function argsLogPath(): string {
  return path.join(workDir, 'aws-args.log');
}

/**
 * Install an `aws` stub that replays one canned function output per host+uri.
 * The key is `<host><uri>`; anything unlisted answers as a pass-through, which
 * is the shape of the request object CloudFront returns when the function does
 * not generate a response.
 */
function stubAws(outputs: Record<string, string>): void {
  const table = Object.entries(outputs)
    .map(([k, v]) => `  ${JSON.stringify(k)}) printf '%s' ${JSON.stringify(v)} ;;`)
    .join('\n');
  const script = `#!/usr/bin/env bash
# Minimal aws stub: only the two subcommands this script calls. Every call is
# logged so a test can pin which stage the script asked for, which is the
# difference between checking the artifact viewers reach and checking the one
# Terraform wrote before publishing.
args="$*"
printf '%s\\n' "$args" >> ${JSON.stringify(argsLogPath())}
if [[ "$args" == *describe-function* ]]; then
  printf 'ETAGSTUB123'
  exit 0
fi
if [[ "$args" == *test-function* ]]; then
  # Recover the event file from --event-object fileb://<path> and read the
  # host and uri back out of it, so the stub answers per case exactly as the
  # real edge runtime would vary.
  ev=""
  prev=""
  for a in "$@"; do
    if [[ "$prev" == "--event-object" ]]; then ev="\${a#fileb://}"; fi
    prev="$a"
  done
  host=$(grep -o '"value": "[^"]*"' "$ev" | tail -1 | sed 's/.*: "//;s/"$//')
  uri=$(grep -o '"uri": "[^"]*"' "$ev" | sed 's/.*: "//;s/"$//')
  case "\${host}\${uri}" in
${table}
  # A pass-through, in the shape the real runtime returns it. Captured from
  # \`aws cloudfront test-function --stage LIVE\` against the production
  # apex-redirect function, which returns the whole request object rather than
  # the two fields a hand-written fake would think to include. Nothing in the
  # script parses querystring, headers or cookies today, but a fixture that
  # claims to be the real shape and is not is how a parser bug hides.
  *) printf '{"request":{"method":"GET","uri":"%s","querystring":{},"headers":{"host":{"value":"%s"}},"cookies":{}}}' "$uri" "$host" ;;
  esac
  exit 0
fi
exit 0
`;
  const p = path.join(binDir, 'aws');
  fs.writeFileSync(p, script);
  fs.chmodSync(p, 0o755);
}

function run(args: string[]) {
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    ...SPAWN_GUARD,
  });
}

// Generated responses, in the shape the real runtime returns them. The redirect
// below is a verbatim capture from `aws cloudfront test-function --stage LIVE`
// against the production apex-redirect function; the notice follows the same
// shape, since it is the same runtime returning the same kind of object, and
// cannot be captured live until the flag is on.
const NOTICE =
  '{"response":{"statusCode":503,"statusDescription":"Service Unavailable","headers":{"retry-after":{"value":"86400"},"cache-control":{"value":"no-store"}},"cookies":{}}}';
const REDIRECT =
  '{"response":{"statusCode":301,"statusDescription":"Moved Permanently","headers":{"location":{"value":"https://www.footbag.org/events"}},"cookies":{}}}';

describe('verify-cutover-notice.sh: invocation contract', () => {
  it('refuses to run without a mode', () => {
    const res = run(['--expect-notice']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('name a mode');
  });

  it('refuses to infer which state it should expect', () => {
    // A check that reads its expectations off the world it is checking agrees
    // with that world by construction. This refusal is the reason the script is
    // worth running at all.
    const res = run(['--function']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('proves nothing');
  });
});

describe('verify-cutover-notice.sh: the four-way matrix with the notice up', () => {
  it('passes a correctly-behaving function', () => {
    stubAws({
      'www.footbag.org/events': NOTICE,
      'footbag.org/events': REDIRECT,
    });
    const res = run(['--function', '--expect-notice']);
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toContain('GATE: CUTOVER-NOTICE PASS');
    expect(res.stdout).toContain('www.footbag.org/events: 503 notice');
    expect(res.stdout).toContain('passes through to the platform');
  });

  it('fails when the notice reaches the Stripe webhook path', () => {
    // The exemption is what keeps deliveries landing in the database that goes
    // live; a notice on that path is an endpoint Stripe eventually disables.
    stubAws({
      'www.footbag.org/events': NOTICE,
      'www.footbag.org/payments/webhook': NOTICE,
      'footbag.org/events': REDIRECT,
    });
    const res = run(['--function', '--expect-notice']);
    expect(res.status).toBe(1);
    expect(res.stdout).toMatch(/payments\/webhook: expected pass-through/);
  });

  it('fails when the notice blankets preview, which is the defect the design exists to avoid', () => {
    stubAws({
      'www.footbag.org/events': NOTICE,
      'preview.footbag.org/members': NOTICE,
      'footbag.org/events': REDIRECT,
    });
    const res = run(['--function', '--expect-notice']);
    expect(res.status).toBe(1);
    expect(res.stdout).toMatch(/preview\.footbag\.org\/members: expected pass-through/);
  });

  it('fails when www serves the platform while the notice is supposed to be up', () => {
    stubAws({ 'footbag.org/events': REDIRECT });
    const res = run(['--function', '--expect-notice']);
    expect(res.status).toBe(1);
    expect(res.stdout).toMatch(/expected the 503 notice/);
  });

  it('fails when the apex redirect has been lost behind the notice', () => {
    stubAws({ 'www.footbag.org/events': NOTICE });
    const res = run(['--function', '--expect-notice']);
    expect(res.status).toBe(1);
    expect(res.stdout).toMatch(/expected a 301 to www/);
  });
});

describe('verify-cutover-notice.sh: the same matrix after launch', () => {
  it('passes when every hostname serves the platform and the apex still redirects', () => {
    stubAws({ 'footbag.org/events': REDIRECT });
    const res = run(['--function', '--expect-live']);
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toContain('GATE: CUTOVER-NOTICE PASS');
  });

  it('fails when the notice is still up after launch was declared', () => {
    stubAws({
      'www.footbag.org/events': NOTICE,
      'footbag.org/events': REDIRECT,
    });
    const res = run(['--function', '--expect-live']);
    expect(res.status).toBe(1);
    expect(res.stdout).toMatch(/expected pass-through to the platform, got a generated response/);
  });
});

describe('verify-cutover-notice.sh: which artifact it checks', () => {
  it('exercises the stage viewers reach, not the one written before publishing', () => {
    // Terraform writes the function and then publishes it. A publish that did
    // not land leaves the two stages holding different code, and a check that
    // reads the unpublished one would report a pass on a notice no visitor can
    // see. Both calls therefore name the published stage explicitly.
    stubAws({ 'footbag.org/events': REDIRECT });
    const res = run(['--function', '--expect-live']);
    expect(res.status, res.stdout + res.stderr).toBe(0);

    const calls = fs.readFileSync(argsLogPath(), 'utf-8');
    expect(calls).toMatch(/describe-function.*--stage LIVE/);
    expect(calls).toMatch(/test-function.*--stage LIVE/);
    expect(calls).not.toContain('DEVELOPMENT');
  });
});

describe('verify-cutover-notice.sh: preconditions', () => {
  it('refuses when the function cannot be read, rather than reporting a pass over nothing', () => {
    const p = path.join(binDir, 'aws');
    fs.writeFileSync(p, '#!/usr/bin/env bash\nprintf "None"\nexit 0\n');
    fs.chmodSync(p, 0o755);
    const res = run(['--function', '--expect-notice']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not read the ETag');
  });
});
