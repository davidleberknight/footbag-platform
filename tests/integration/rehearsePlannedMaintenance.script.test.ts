/**
 * Integration tests for scripts/rehearse-planned-maintenance.sh.
 *
 * The script raises the deliberate maintenance window on production, proves
 * every page path serves the branded page, and takes the window down again. Its
 * refusals are the part worth pinning, because the state it can leave behind is
 * the worst one in the estate: production serving a maintenance page to the
 * public with nothing alarming on it, since the edge 5xx alarm counts the
 * window's own deliberate 503s and cannot tell them from an outage.
 *
 * The mutating path belongs to the operator and is not exercised here. What is
 * exercised is every way the run refuses, and the behaviour when it dies partway
 * through: the values file goes back to what it was, the live state is reported
 * rather than silently repaired, and nothing applies unattended.
 *
 * Both external commands are stubbed through their named seams, so no test
 * reaches a real environment. The fake edge decides what to answer by reading
 * the same values file the run rewrites, so the stub and the declared state
 * cannot disagree the way a hardcoded answer would.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = 'scripts/rehearse-planned-maintenance.sh';
const PAGE = path.join(REPO_ROOT, 'terraform/production/maintenance-page/maintenance.html');

let workDir: string;
let tfvarsPath: string;
let applyLog: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-maint-'));
  tfvarsPath = path.join(workDir, 'fake.tfvars');
  applyLog = path.join(workDir, 'apply.log');
  fs.writeFileSync(applyLog, '');
  writeFlag('false');
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function writeFlag(value: string | null): void {
  const line = value === null ? '' : `enable_planned_maintenance    = ${value}\n`;
  fs.writeFileSync(tfvarsPath, `aws_region = "us-east-1"\n${line}enable_cloudfront = true\n`);
}

/** An apply that records its arguments. `failFrom` makes it fail from that call on. */
function stubApply(failFrom = 0): string {
  const p = path.join(workDir, 'apply.sh');
  fs.writeFileSync(p, `#!/usr/bin/env bash
set -euo pipefail
printf 'apply %s\\n' "$*" >> "${applyLog}"
if [[ ${failFrom} -gt 0 && "$(wc -l < "${applyLog}")" -ge ${failFrom} ]]; then
  exit 1
fi
echo "  (synthetic apply: $*)"
`);
  fs.chmodSync(p, 0o755);
  return p;
}

/**
 * A fake edge. Reads the declared flag to decide what the window is doing, so
 * the answers track the run's own rewrites. `pageStatus` overrides what the
 * page's own URL returns, which is how the missing-object precondition is
 * exercised.
 */
function stubCurl(pageStatus = '200'): string {
  const p = path.join(workDir, 'curl.sh');
  fs.writeFileSync(p, `#!/usr/bin/env bash
set -euo pipefail
url=""; want_status=0
for a in "$@"; do
  case "$a" in
    https://*) url="$a" ;;
    '%{http_code}') want_status=1 ;;
  esac
done
if [[ "$url" == */maintenance.html ]]; then
  (( want_status )) && { printf '${pageStatus}'; exit 0; }
  cat "${PAGE}"; exit 0
fi
window="$(grep -E '^[[:space:]]*enable_planned_maintenance[[:space:]]*=' "${tfvarsPath}" | sed 's/.*=[[:space:]]*//' | tr -d ' "')"
if [[ "$window" == "true" ]]; then
  (( want_status )) && { printf '503'; exit 0; }
  cat "${PAGE}"; exit 0
fi
(( want_status )) && { printf '200'; exit 0; }
printf '<html>the platform</html>'
`);
  fs.chmodSync(p, 0o755);
  return p;
}

function run(args: string[], opts: { failFrom?: number; pageStatus?: string } = {}) {
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      FOOTBAG_MAINT_APPLY_CMD: stubApply(opts.failFrom ?? 0),
      FOOTBAG_MAINT_CURL_CMD: stubCurl(opts.pageStatus ?? '200'),
    },
    ...SPAWN_GUARD,
  });
}

/** The full synthetic cycle, which every refusal test is a deviation from. */
function runCycle(opts: { failFrom?: number; pageStatus?: string } = {}) {
  return run(
    ['--target', 'production', '--tfvars', tfvarsPath, '--domain', 'example.invalid', '--yes'],
    opts,
  );
}

function flagNow(): string {
  const m = fs.readFileSync(tfvarsPath, 'utf-8').match(/enable_planned_maintenance\s*=\s*(\S+)/);
  return m ? m[1] : '';
}

describe('rehearse-planned-maintenance.sh: invocation contract', () => {
  it('refuses to run without a named environment', () => {
    const res = run([]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('There is no default');
  });

  it('refuses staging, and says why rather than just declining', () => {
    // Staging carries no maintenance-page resources by a recorded ruling, and
    // the flag is not declared in that tree, so there is nothing to rehearse.
    const res = run(['--target', 'staging']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('no maintenance page to rehearse');
    expect(res.stderr).toContain('not declared in that tree');
    expect(fs.readFileSync(applyLog, 'utf-8')).toBe('');
  });

  it('refuses to accept the confirmations in advance on a real production run', () => {
    // The run applies to production twice. A flag that supplies the answer
    // ahead of time is the thing the typed confirmation exists to prevent.
    const res = run(['--target', 'production', '--yes']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('refused for a real production run');
  });
});

describe('rehearse-planned-maintenance.sh: preconditions', () => {
  it('refuses when the page object is not in the bucket', () => {
    // An access-controlled bucket with no list permission answers 403 for a key
    // that is not there, and CloudFront hands that straight to the viewer. A
    // window raised in that state serves the storage service's XML on every
    // path, which is the failure the page exists to prevent.
    const res = runCycle({ pageStatus: '403' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('answered 403, expected 200');
    expect(res.stderr).toContain('terraform-apply.sh --target production');
    expect(fs.readFileSync(applyLog, 'utf-8')).toBe('');
  });

  it('refuses when the flag is already on, rather than ending someone else\'s window', () => {
    writeFlag('true');
    const res = runCycle();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('already reads "true"');
    expect(fs.readFileSync(applyLog, 'utf-8')).toBe('');
  });

  it('refuses to invent the flag line when the values file carries none', () => {
    writeFlag(null);
    const res = runCycle();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('rather than letting this script invent the line');
  });

  it('refuses when the values file is absent, naming the private checkout', () => {
    const res = run([
      '--target', 'production',
      '--tfvars', path.join(workDir, 'nope.tfvars'),
      '--domain', 'example.invalid', '--yes',
    ]);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('private operations checkout');
  });
});

describe('rehearse-planned-maintenance.sh: the cycle', () => {
  it('raises the window, proves the branded page, and puts the site back', () => {
    const res = runCycle();
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toContain('GATE: PLANNED-MAINTENANCE PASS');
    expect(res.stdout).toMatch(/\/events: 503 carrying the maintenance page/);
    expect(res.stdout).toMatch(/\/maintenance\.html: still 200 while the window is up/);
    expect(res.stdout).toMatch(/\/events: 200, serving the platform again/);
  });

  it('applies exactly twice, both at the named environment', () => {
    runCycle();
    const applies = fs.readFileSync(applyLog, 'utf-8').trim().split('\n');
    expect(applies).toEqual(['apply --target production', 'apply --target production']);
  });

  it('leaves the flag off when it finishes', () => {
    runCycle();
    expect(flagNow()).toBe('false');
  });

  it('says on stderr that the stubbed commands are not the real ones', () => {
    // A stubbed run proves nothing about the estate, so it must never be able to
    // pass for one that did.
    const res = runCycle();
    expect(res.stderr).toContain('not the real apply');
    expect(res.stderr).toContain('not reaching the real edge');
  });
});

describe('rehearse-planned-maintenance.sh: a run that dies after writing the flag', () => {
  it('restores the flag when the raising apply fails', () => {
    // The flag is written true before the apply that publishes it, so an apply
    // that fails there leaves the file claiming a window that never went up.
    // Only the trap puts that back, which is what this pins: with the restore
    // removed, the file is left reading true.
    const res = runCycle({ failFrom: 1 });
    expect(res.status).toBe(1);
    expect(flagNow()).toBe('false');
    expect(res.stderr).toContain('values file restored');
  });

  it('says nothing about a live window when the window never went up', () => {
    // The banner is for a window that is actually serving. Printing it after a
    // failed raising apply would send an operator to fix a state that does not
    // exist, which is its own kind of wrong.
    const res = runCycle({ failFrom: 1 });
    expect(res.stderr).not.toContain('PRODUCTION IS STILL SERVING');
  });
});

describe('rehearse-planned-maintenance.sh: a run that dies with the window up', () => {
  it('reports the live state loudly instead of quietly repairing it', () => {
    // The trap restores the file, which the run wrote, and stops there. It must
    // not apply: an unattended production apply is what the confirmation exists
    // to prevent, and a trap is the least attended moment there is.
    const res = runCycle({ failFrom: 2 });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('PRODUCTION IS STILL SERVING THE MAINTENANCE PAGE');
    expect(res.stderr).toContain('Nothing will alarm on this state');
    expect(res.stderr).toContain('bash scripts/terraform-apply.sh --target production');
  });

  it('does not attempt a third apply on the way out', () => {
    runCycle({ failFrom: 2 });
    const applies = fs.readFileSync(applyLog, 'utf-8').trim().split('\n');
    expect(applies).toHaveLength(2);
  });
});
