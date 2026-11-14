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
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'verify-prod-email.sh');

let dir: string;
let fakeBin: string;

/** The read principal every run names, and the user ARN it resolves to. */
const READ_PROFILE = 'footbag-operator';
const READ_ARN = 'arn:aws:iam::1:user/footbag-operator';

/**
 * Writes a fake `aws` that answers the calls the script makes. `arn` is the send
 * profile's identity and decides whether the production check passes; the read
 * profile resolves to `opts.readArn`. `mailFrom` is the bounce-domain status SES
 * holds once the mail-day apply has configured `mail.footbag.org` on the
 * identity, and null before it, when no bounce domain is configured at all.
 *
 * Every identity read made through any profile but the read profile is refused,
 * as the production runtime role refuses it: that role may only send.
 */
function writeFakeAws(
  arn: string,
  mailFrom: string | null,
  opts: {
    warn?: boolean;
    sesDenied?: boolean;
    domainOnly?: boolean;
    mailFromUnreadable?: boolean;
    senderUnverified?: boolean;
    readArn?: string;
  } = {},
): void {
  fakeBin = path.join(dir, 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  const denied = [
    '  echo "An error occurred (AccessDeniedException) when calling the GetEmailIdentity operation: not authorized" >&2',
    '  exit 254',
  ];
  fs.writeFileSync(
    path.join(fakeBin, 'aws'),
    [
      '#!/usr/bin/env bash',
      'args="$*"',
      `printf '%s\\n' "$args" >> ${JSON.stringify(path.join(dir, 'aws-calls.log'))}`,
      // `warn` puts a line on stderr beside every answer, as the CLI prints a
      // deprecation or library notice; an acknowledged fake, since what is
      // asserted is that it is never read as a status. `sesDenied` refuses the
      // identity reads to the read profile too, as a principal without the read
      // permission is refused.
      ...(opts.warn
        ? ['echo "/usr/lib/python3/dist-packages/urllib3/connectionpool.py: InsecureRequestWarning: fixture warning line" >&2']
        : []),
      `if [[ "$args" == *"get-email-identity"* && "$args" != *"--profile ${READ_PROFILE}"* ]]; then`,
      ...denied,
      'fi',
      ...(opts.sesDenied
        ? ['if [[ "$args" == *"get-email-identity"* ]]; then', ...denied, 'fi']
        : []),
      ...(opts.mailFromUnreadable
        ? [
            'if [[ "$args" == *MailFromAttributes* ]]; then',
            '  echo "An error occurred (TooManyRequestsException) when calling the GetEmailIdentity operation: Too many requests" >&2',
            '  exit 254',
            'fi',
          ]
        : []),
      // `domainOnly` is production after the sender cutover: the address has no
      // identity of its own, and SES answers for it through footbag.org.
      ...(opts.domainOnly
        ? [
            'if [[ "$args" == *"get-email-identity --email-identity noreply@"* ]]; then',
            '  echo "An error occurred (NotFoundException) when calling the GetEmailIdentity operation: Email identity <noreply@footbag.org> does not exist." >&2',
            '  exit 254',
            'fi',
          ]
        : []),
      'case "$args" in',
      `  *"sts get-caller-identity"*"--profile ${READ_PROFILE}"*) echo "${opts.readArn ?? READ_ARN}" ;;`,
      `  *"sts get-caller-identity"*) echo "${arn}" ;;`,
      mailFrom === null
        ? '  *MailFromAttributes*) echo "None" ;;'
        : `  *MailFromAttributes*) printf 'mail.footbag.org\\t%s\\n' "${mailFrom}" ;;`,
      `  *VerifiedForSendingStatus*) echo "${opts.senderUnverified ? 'False' : 'True'}" ;;`,
      '  *"send-email"*) echo "MessageId: stub" ;;',
      '  *) echo "" ;;',
      'esac',
      'exit 0',
    ].join('\n'),
    { mode: 0o755 },
  );
}

/**
 * A terraform stand-in answering the production tree's sender output, or failing
 * as an uninitialised tree does when `sender` is null.
 */
let terraformStubs = 0;
function writeFakeTerraform(sender: string | null): string {
  const p = path.join(dir, `terraform-stub-${++terraformStubs}.sh`);
  fs.writeFileSync(p, [
    '#!/usr/bin/env bash',
    sender === null
      ? 'echo "Error: No outputs found" >&2; exit 1'
      : `if [[ "$*" == *"output -raw ses_sender_identity"* ]]; then echo ${JSON.stringify(sender)}; exit 0; fi; exit 1`,
  ].join('\n'), { mode: 0o755 });
  return p;
}

/** Names the read profile, as every caller does, unless the case names its own. */
function withRead(args: string[]): string[] {
  return args.includes('--read-profile') ? args : [...args, '--read-profile', READ_PROFILE];
}

function run(
  args: string[],
  extraEnv: Record<string, string> = {},
  opts: { noReadProfile?: boolean } = {},
): ReturnType<typeof spawnSync> {
  return spawnSync('bash', [SCRIPT, ...(opts.noReadProfile ? args : withRead(args))], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...awsIdentityStubEnv(dir),
      TF_OUTPUT_BIN: writeFakeTerraform('noreply@footbag.org'),
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      ...extraEnv,
    },
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

describe('verify-prod-email.sh --inbox-from-tty', () => {
  /** At a terminal, typing `typed` when the script asks for the inbox. */
  function atTerminal(args: string[], typed: string, stdin = '') {
    const inner = `bash ${JSON.stringify(SCRIPT)} ${withRead(args).join(' ')} ${stdin}; echo "EXIT=$?"`;
    const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
      encoding: 'utf8',
      input: `${typed}\n`,
      env: {
        ...process.env,
        ...awsIdentityStubEnv(dir),
        TF_OUTPUT_BIN: writeFakeTerraform('noreply@footbag.org'),
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      },
      ...SPAWN_GUARD,
    });
    const out = r.stdout ?? '';
    return { status: Number(out.match(/EXIT=(\d+)/)?.[1] ?? -1), out };
  }

  // Defect caught: the readiness step's outbox check sending only to the
  // simulator, so nobody sees the message arrive, because the inbox address is
  // vault material that cannot be written into the step; typed at the terminal
  // instead, it reaches the operator's real mailbox.
  it('asks for the inbox at the terminal and sends to the address typed', () => {
    const r = atTerminal(['--profile', 'footbag-production-runtime', '--yes', '--inbox-from-tty'], 'ops@example.invalid');
    expect(r.status, r.out).toBe(0);
    expect(sends().some((s) => s.includes('ops@example.invalid'))).toBe(true);
  });

  // Defect caught: the inbox read from stdin, which on the outbox leg carries
  // the host password, so the password is taken as the address (and sent to)
  // and nothing the operator types is used.
  it('reads the inbox from the terminal, not from stdin', () => {
    const r = atTerminal(['--profile', 'footbag-production-runtime', '--yes', '--inbox-from-tty'], 'ops@example.invalid', '< /dev/null');
    expect(r.status, r.out).toBe(0);
    expect(sends().some((s) => s.includes('ops@example.invalid'))).toBe(true);
  });

  // Defect caught: an empty answer read as "no inbox", so the check passes on
  // the simulator alone and the arrival is never proved.
  it('refuses an empty answer and sends nothing', () => {
    const r = atTerminal(['--profile', 'footbag-production-runtime', '--yes', '--inbox-from-tty'], '');
    expect(r.status).toBe(2);
    expect(sends()).toEqual([]);
  });

  it('refuses with no terminal to ask on, and beside --inbox', () => {
    const none = run(['--profile', 'footbag-production-runtime', '--yes', '--inbox-from-tty']);
    expect(none.status).toBe(2);
    const both = run(['--profile', 'footbag-production-runtime', '--yes', '--inbox', 'a@example.invalid', '--inbox-from-tty']);
    expect(both.status).toBe(2);
    expect(sends()).toEqual([]);
  });
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

  // Defect caught: before the sender cutover, the check sends as the canonical
  // address production does not use, so a green run proves nothing about the
  // interim sender that real mail goes out under.
  it('sends as the sender production is configured with, not the canonical address', () => {
    const r = run(['--profile', 'footbag-production', '--yes'], {
      TF_OUTPUT_BIN: writeFakeTerraform('noreply@interim.example'),
    });
    expect(r.status, String(r.stderr)).toBe(0);
    expect(r.stdout).toContain('Sender: noreply@interim.example');
    expect(sends().length).toBeGreaterThan(0);
    expect(sends().every((l) => l.includes('--from noreply@interim.example'))).toBe(true);
  });

  // Defect caught: an unreadable output silently falls back to a guessed sender.
  it('refuses when the configured sender cannot be read, and names --sender', () => {
    const r = run(['--profile', 'footbag-production', '--yes'], { TF_OUTPUT_BIN: writeFakeTerraform(null) });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/could not read the sender production sends as/);
    expect(r.stderr).toMatch(/--sender <address>/);
    expect(sends()).toEqual([]);

    const named = run(['--profile', 'footbag-production', '--sender', 'noreply@footbag.org', '--yes'], {
      TF_OUTPUT_BIN: writeFakeTerraform(null),
    });
    expect(named.status, String(named.stderr)).toBe(0);
  });

  it('refuses a profile that does not resolve to a production identity', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-staging-runtime', 'SUCCESS');
    const r = run(['--profile', 'wrong', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not resolve to a footbag-production identity/);
  });

  // Defect caught: a run with no principal able to read the identity, which as
  // the send-only runtime role can never see the bounce domain, so the check
  // could not tell a healthy mail day from a broken one.
  it('refuses without a read profile and sends nothing', () => {
    const r = run(['--profile', 'footbag-production', '--yes'], {}, { noReadProfile: true });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--read-profile .* is required/);
    expect(sends()).toEqual([]);
  });

  // Defect caught: the identity read in another account, whose healthy bounce
  // domain says nothing about the production identity mail is sent through.
  it('refuses a read profile in another account than the send profile', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'SUCCESS', {
      readArn: 'arn:aws:iam::2:user/footbag-operator',
    });
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not in the account the send profile is in/);
    expect(sends()).toEqual([]);
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

    const r = spawnSync('bash', [SCRIPT, ...withRead(['--profile', 'footbag-production', '--sender', 'noreply@footbag.org', '--outbox', '--yes'])], {
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

/** The closing report's verdict and the lists above it, all on stderr. */
function report(r: ReturnType<typeof spawnSync>): string {
  const err = String(r.stderr);
  const at = err.indexOf('==== Closing report: verify-prod-email.sh ====');
  expect(at, err).toBeGreaterThanOrEqual(0);
  return err.slice(at);
}

/**
 * After the mail-day apply SES holds a bounce domain on the identity, and launch
 * waits on this check proving it aligns; before it there is no bounce domain to
 * judge. Which side a run is on is read from SES itself, never from a flag.
 */
describe('verify-prod-email.sh custom bounce-domain report', () => {
  // Defect caught: a healthy mail day reported as a failure, or proven without
  // being listed, so the operator cannot tell what the run established.
  it('lists a healthy bounce domain as proven and passes', () => {
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status, String(r.stderr)).toBe(0);
    expect(r.stdout).toMatch(/Custom bounce domain: healthy/);
    expect(report(r)).toMatch(/No errors or warnings\.[\s\S]*Proven:[\s\S]*mail\.footbag\.org/);
  });

  // Defect caught: after the mail switch, a failed bounce domain printed and then
  // followed by success, so launch proceeds on mail that does not align.
  it('fails the run on an unhealthy bounce domain after the mail switch, and still sends', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'FAILED');
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Custom bounce domain: FAILED -- NOT healthy/);
    expect(r.stdout).toMatch(/mail still goes\s+out but cannot align/);
    expect(report(r)).toMatch(/Errors \(1\):\n  - [^\n]*mail\.footbag\.org[^\n]*FAILED/);
    // The send legs still run, so the report also proves sending works.
    expect(sends().length).toBeGreaterThan(0);
  });

  // Defect caught: SES not having found the bounce record yet read as a pass, on
  // the one run launch waits on to prove alignment.
  it('fails the run while SES has not yet found the bounce domain', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'PENDING');
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status).toBe(1);
    expect(report(r)).toMatch(/Errors \(1\):\n  - [^\n]*PENDING/);
  });

  // Defect caught: an unreadable bounce domain treated as absent, which reads as
  // "before the mail switch" and passes a run that proved nothing.
  it('fails the run when the bounce domain cannot be read', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'SUCCESS', { mailFromUnreadable: true });
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status).toBe(1);
    expect(report(r)).toMatch(/Errors \(1\):\n  - [^\n]*TooManyRequestsException/);
  });

  // Defect caught: a read principal that cannot read the identity let through
  // as "sending anyway", so neither the sender nor the bounce domain is checked.
  it('refuses before sending when the read profile cannot read the identity', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'SUCCESS', { sesDenied: true });
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status).toBe(1);
    expect(report(r)).toMatch(/AccessDeniedException/);
    expect(sends()).toEqual([]);
  });

  // Defect caught: mail sent as an address SES has not verified, whose refusal
  // then reads like a permissions problem rather than the verification it is.
  it('refuses before sending when the sender is not verified', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'SUCCESS', { senderUnverified: true });
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status).toBe(1);
    expect(report(r)).toMatch(/Errors \(\d+\):\n  - [^\n]*not verified for sending[^\n]*status: False/);
    expect(sends()).toEqual([]);
  });

  // Defect caught: the identity read through the send-only runtime role, which is
  // always refused, or a send made through the read principal, which proves
  // nothing about the role production sends as.
  it('reads the identity through the read profile and sends through the send profile', () => {
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status, String(r.stderr)).toBe(0);
    const calls = fs.readFileSync(path.join(dir, 'aws-calls.log'), 'utf8').split('\n');
    const reads = calls.filter((l) => l.includes('get-email-identity'));
    expect(reads.length).toBeGreaterThan(0);
    for (const l of reads) expect(l, l).toContain(`--profile ${READ_PROFILE}`);
    expect(sends().length).toBeGreaterThan(0);
    for (const l of sends()) expect(l, l).toContain('--profile footbag-production');
    for (const l of sends()) expect(l, l).not.toContain(`--profile ${READ_PROFILE}`);
  });

  it('reads the statuses, not a warning the CLI prints beside them', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'SUCCESS', { warn: true });
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status, String(r.stderr)).toBe(0);
    expect(r.stdout).toMatch(/Sender identity: noreply@\S+ \(verified\)/);
    expect(r.stdout).toMatch(/Custom bounce domain: healthy/);
  });

  // Defect caught: on the day sending moves under the domain identity, the check
  // reports the canonical sender missing and refuses to prove the move worked.
  it('reads a sender with no identity of its own through its domain', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', 'SUCCESS', { domainOnly: true });
    const r = run(['--profile', 'footbag-production', '--sender', 'noreply@footbag.org', '--yes']);
    expect(r.status, String(r.stderr)).toBe(0);
    expect(r.stdout).toMatch(/Sender identity: noreply@footbag\.org \(verified through the footbag\.org domain identity\)/);
    expect(r.stdout).toMatch(/Custom bounce domain: healthy/);
    const reads = fs.readFileSync(path.join(dir, 'aws-calls.log'), 'utf8').split('\n')
      .filter((l) => l.includes('MailFromAttributes'));
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain('--email-identity footbag.org');
  });

  // Defect caught: every run before the mail switch failing or warning about a
  // bounce domain nobody has configured yet, which trains the operator to read
  // past the report.
  it('passes cleanly before the mail switch, when no bounce domain is configured', () => {
    writeFakeAws('arn:aws:iam::1:role/footbag-production-runtime', null);
    const r = run(['--profile', 'footbag-production', '--yes']);
    expect(r.status, String(r.stderr)).toBe(0);
    expect(r.stdout).toMatch(/Custom bounce domain: not configured/);
    expect(report(r)).toMatch(/No errors or warnings\./);
    // Nothing about a bounce domain is claimed; the healthy case above is the
    // control showing the same report does list it once one is configured.
    expect(report(r)).not.toMatch(/mail\.footbag\.org/);
  });
});
