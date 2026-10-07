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
function writeFakeAws(arn: string, mailFrom: string, opts: { warn?: boolean; sesDenied?: boolean } = {}): void {
  fakeBin = path.join(dir, 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(
    path.join(fakeBin, 'aws'),
    [
      '#!/usr/bin/env bash',
      'args="$*"',
      `printf '%s\\n' "$args" >> ${JSON.stringify(path.join(dir, 'aws-calls.log'))}`,
      // `warn` puts a line on stderr beside every answer, as the CLI prints a
      // deprecation or library notice; an acknowledged fake, since what is
      // asserted is that it is never read as a status. `sesDenied` refuses the
      // identity reads the way a principal without the read permission is.
      ...(opts.warn
        ? ['echo "/usr/lib/python3/dist-packages/urllib3/connectionpool.py: InsecureRequestWarning: fixture warning line" >&2']
        : []),
      ...(opts.sesDenied
        ? [
            'if [[ "$args" == *"get-email-identity"* ]]; then',
            '  echo "An error occurred (AccessDeniedException) when calling the GetEmailIdentity operation: not authorized" >&2',
            '  exit 254',
            'fi',
          ]
        : []),
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

function run(args: string[], extraEnv: Record<string, string> = {}): ReturnType<typeof spawnSync> {
  return spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}`, ...extraEnv },
    ...SPAWN_GUARD,
  });
}

/** Every `ses send-email` call the fake received, one line each. */
function sends(): string[] {
  const log = path.join(dir, 'aws-calls.log');
  if (!fs.existsSync(log)) return [];
  return fs.readFileSync(log, 'utf8').split('\n').filter((l) => l.includes('send-email'));
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
    const r = run(['--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--profile .* is required/);
  });

  it('sends nothing without a typed confirmation on a terminal', () => {
    // An unattended run would send real mail through the production identity
    // with nobody having agreed to it.
    const r = run(['--profile', 'footbag-production']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Not confirmed; nothing was sent/);
    expect(sends()).toEqual([]);
  });

  it('an exported ASSUME_YES does not stand in for the confirmation', () => {
    // A variable left in the operator's shell must not send production mail.
    const r = run(['--profile', 'footbag-production'], { ASSUME_YES: 'yes' });
    expect(r.status).toBe(1);
    expect(sends()).toEqual([]);
  });

  it('refuses an argument it does not recognise rather than ignoring it', () => {
    const r = run(['--profile', 'p', '--yes', '--send-everything']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown arg/);
  });

  it('refuses a profile that does not resolve to a production identity', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-staging-runtime', 'SUCCESS');
    const r = run(['--profile', 'wrong', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not resolve to a footbag-production identity/);
  });
});

/**
 * The outbox leg, end to end against stand-ins: it opens a privileged session on
 * the production host, so it must go through the shared library's announced ssh
 * client (the one the host-identity check used), and of the credential file
 * redirected in, only the password line may reach the host, because the remote
 * bash runs every later line as root.
 *
 * This file puts its own `ssh` in front of PATH, visibly: it answers only the
 * configuration lookup the alias and account checks make, with the shared
 * account and a documentation address, and refuses to connect. A leg that
 * reached for the bare client instead of the announced one fails here.
 */
describe('verify-prod-email.sh outbox leg', () => {
  it('runs through the announced ssh client and sends only the password line', () => {
    const sessions = path.join(dir, 'sessions');
    fs.writeFileSync(
      path.join(fakeBin, 'ssh'),
      [
        '#!/usr/bin/env bash',
        'if [[ "$1" == -G ]]; then printf "hostname 203.0.113.10\\nuser footbag\\nport 22\\n"; exit 0; fi',
        'echo "bare ssh refused in this suite: $*" >&2',
        'exit 255',
      ].join('\n'),
      { mode: 0o755 },
    );
    const standIn = path.join(dir, 'ssh-stand-in.sh');
    fs.writeFileSync(
      standIn,
      [
        '#!/usr/bin/env bash',
        `mkdir -p ${JSON.stringify(sessions)}`,
        `f="$(mktemp ${JSON.stringify(path.join(sessions, 'session.XXXXXX'))})"`,
        'cat > "$f"',
        'case "$*" in *footbag-host-identity*)',
        '  printf -- "---FOOTBAG-HOST-ENV---\\nproduction\\n---FOOTBAG-HOST-URL---\\n\\n---FOOTBAG-END---\\n"',
        'esac',
        'exit 0',
      ].join('\n'),
      { mode: 0o755 },
    );
    const knownHosts = path.join(dir, 'known_hosts');
    fs.writeFileSync(knownHosts, 'footbag-production ssh-ed25519 AAAAstub\n', { mode: 0o600 });
    const cred = path.join(dir, 'credential.txt');
    fs.writeFileSync(cred, 'stub-sudo-pass\nSECOND-LINE-MARKER\n', { mode: 0o600 });

    const r = spawnSync('bash', [SCRIPT, '--profile', 'footbag-production', '--outbox', '--yes'], {
      encoding: 'utf8',
      input: fs.readFileSync(cred),
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        FOOTBAG_HOST_SSH_BIN: standIn,
        FOOTBAG_KNOWN_HOSTS: knownHosts,
      },
      ...SPAWN_GUARD,
    });
    expect(r.status, String(r.stderr)).toBe(0);

    const streams = fs.readdirSync(sessions).map((f) => fs.readFileSync(path.join(sessions, f), 'utf8'));
    // The host's identity, then the outbox smoke itself.
    expect(streams).toHaveLength(2);
    expect(streams.some((s) => s.includes(`SMOKE_TO=success@simulator.amazonses.com`))).toBe(true);
    for (const s of streams) {
      expect(s.split('\n')[0]).toBe('stub-sudo-pass');
      expect(s).not.toContain('SECOND-LINE-MARKER');
    }
  });
});

describe('verify-prod-email.sh custom bounce-domain report', () => {
  it('reports a healthy setup as healthy', () => {
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.stdout).toMatch(/Custom bounce domain: healthy/);
  });

  it('reports an unhealthy setup as unhealthy, and says mail still goes out', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'PENDING');
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.stdout).toMatch(/Custom bounce domain: PENDING -- NOT healthy/);
    expect(r.stdout).toMatch(/mail still goes\s+out but cannot align/);
  });

  it('reads the statuses, not a warning the CLI prints beside them', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'SUCCESS', { warn: true });
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status, String(r.stderr)).toBe(0);
    expect(r.stdout).toMatch(/Sender identity: noreply@\S+ \(verified\)/);
    expect(r.stdout).toMatch(/Custom bounce domain: healthy/);
  });

  it('still tells a denied read apart from an unverified sender', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'SUCCESS', { sesDenied: true });
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status, String(r.stderr)).toBe(0);
    expect(r.stdout).toMatch(/status not readable by this profile; sending anyway/);
    expect(r.stdout).toMatch(/Custom bounce domain: status not readable by this profile/);
  });

  it('distinguishes not-yet-configured from unhealthy', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'None');
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.stdout).toMatch(/Custom bounce domain: not configured/);
    expect(r.stdout).not.toMatch(/NOT healthy/);
  });
});
