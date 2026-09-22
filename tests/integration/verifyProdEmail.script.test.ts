/**
 * Contract tests for scripts/verify-prod-email.sh: the production send-path
 * validation, and the one piece of state it reports that nothing else watches.
 *
 * Two families of property are pinned here.
 *
 * The refusals, because this script sends real mail through the production
 * identity. It must refuse without an explicit profile, refuse without the
 * explicit production confirmation, refuse an argument it does not recognise
 * rather than ignoring it, and refuse a profile that does not resolve to a
 * production identity. Each of those is the difference between a verification
 * run and an unintended send.
 *
 * And the custom bounce-domain report, which exists because that setup degrades
 * silently. The failure behaviour is left at its default, so when SES cannot read
 * the bounce record it falls back to its own envelope sender instead of refusing
 * the send. Mail keeps flowing, which is the right failure for this site, but the
 * domain's authentication quietly drops to signature alignment alone and nothing
 * bounces, alarms or logs. A setup stuck pending or failed is therefore invisible
 * everywhere except in this report, so the report has to distinguish healthy from
 * unhealthy from not-yet-configured rather than collapsing them.
 *
 * Hermetic: a fake `aws` on PATH answers every call the script makes, so nothing
 * reaches AWS and no mail is sent.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'verify-prod-email.sh');

let dir: string;
let fakeBin: string;

/**
 * Writes a fake `aws` that answers the four calls the script makes. `arn` decides
 * whether the identity check passes; `mailFrom` is the bounce-domain status the
 * report is built from.
 */
function writeFakeAws(arn: string, mailFrom: string): void {
  fakeBin = path.join(dir, 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(
    path.join(fakeBin, 'aws'),
    [
      '#!/usr/bin/env bash',
      'args="$*"',
      'case "$args" in',
      `  *"sts get-caller-identity"*) echo "${arn}" ;;`,
      `  *MailFromAttributes*) echo "${mailFrom}" ;;`,
      '  *VerifiedForSendingStatus*) echo "True" ;;',
      '  *"send-email"*) echo "MessageId: stub" ;;',
      '  *) echo "" ;;',
      'esac',
      'exit 0',
    ].join('\n'),
    { mode: 0o755 },
  );
}

function run(args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
    ...SPAWN_GUARD,
  });
}

beforeEach(() => {
  dir = createScratchDir('verify-prod-email');
  writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'SUCCESS');
});

afterEach(() => {
  removeScratch(dir);
});

describe('verify-prod-email.sh refusals', () => {
  it('refuses without a profile, rather than picking one up from the environment', () => {
    const r = run(['--confirm-production']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--profile .* is required/);
  });

  it('refuses without the explicit production confirmation', () => {
    const r = run(['--profile', 'footbag-production']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/this sends real production email/);
  });

  it('refuses an argument it does not recognise rather than ignoring it', () => {
    const r = run(['--profile', 'p', '--confirm-production', '--send-everything']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown arg/);
  });

  it('refuses a profile that does not resolve to a production identity', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-staging-runtime', 'SUCCESS');
    const r = run(['--profile', 'wrong', '--confirm-production']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not resolve to a footbag-production identity/);
  });
});

describe('verify-prod-email.sh custom bounce-domain report', () => {
  it('reports a healthy setup as healthy', () => {
    const r = run(['--profile', 'footbag-production', '--confirm-production']);
    expect(r.stdout).toMatch(/Custom bounce domain: healthy/);
  });

  it('reports an unhealthy setup as unhealthy, and says mail still goes out', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'PENDING');
    const r = run(['--profile', 'footbag-production', '--confirm-production']);
    expect(r.stdout).toMatch(/Custom bounce domain: PENDING -- NOT healthy/);
    expect(r.stdout).toMatch(/mail still goes\s+out but cannot align/);
  });

  it('distinguishes not-yet-configured from unhealthy', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'None');
    const r = run(['--profile', 'footbag-production', '--confirm-production']);
    expect(r.stdout).toMatch(/Custom bounce domain: not configured/);
    expect(r.stdout).not.toMatch(/NOT healthy/);
  });
});
