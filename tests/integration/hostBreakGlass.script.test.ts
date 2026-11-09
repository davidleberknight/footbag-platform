/**
 * scripts/host-break-glass.sh: minting a short-lived certificate for a host's
 * default account, which has passwordless sudo, and using it once; and the
 * drill that proves the path and its alarm.
 *
 * What carries the risk: a root-capable credential minted for the wrong host,
 * by the wrong identity, without consent, or with no record of which script
 * made it; the private key printed, kept in the CLI's history, or left on disk
 * after the run; the host trusted on first use rather than against the keys the
 * same authenticated response carries; break-glass used for convenience while
 * the routine route works; a key added during the session going unnoticed; and
 * a drill passing on stale alarm history, or on an alarm that never clears.
 *
 * Hermetic: a stand-in AWS CLI, ssh and terraform, named through the script's
 * seams, log every call. The minted response carries a sentinel string in place
 * of a private key, so any place it surfaces is visible. Use mode needs a
 * terminal, so those cases run under `script`, which gives the run a pty and
 * types the answers.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, chmodSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { requireToolInCI } from '../fixtures/toolAvailability';
import { mintEvent, lookupEventsOutput } from '../fixtures/hostAccessMintEvents';

const HAS_SCRIPT = requireToolInCI('script', '--version');

const SCRIPT = join(process.cwd(), 'scripts/host-break-glass.sh');
const ADDRESS = '203.0.113.10';
const INSTANCE = 'footbag-staging-web';
const OPERATOR_ARN = 'arn:aws:iam::000000000000:user/footbag-operator';
// Not a key in any format: a marker whose every appearance outside the key file
// is a leak.
const SENTINEL_KEY = 'SENTINEL-break-glass-private-key-not-a-real-key';
const SENTINEL_CERT = 'ssh-ed25519-cert-v01@openssh.com SENTINEL-break-glass-certificate';
const HOST_KEYS = [
  { algorithm: 'ssh-ed25519', publicKey: 'AAAAC3NzaC1lZDI1NTE5AAAAIFixtureHostKeyOne' },
  { algorithm: 'ssh-rsa', publicKey: 'AAAAB3NzaC1yc2EAAAADAQABAAABAQFixtureHostKeyTwo' },
];
// Far in the future, so every transition and event is after any run's start;
// the stale case uses the far past.
const AFTER = '2099-01-01T00';
const BEFORE = '2000-01-01T00';

let dir: string;
let tmp: string;
beforeEach(() => {
  dir = createScratchDir('host-break-glass');
  tmp = join(dir, 'tmp');
  mkdirSync(tmp);
});
afterEach(() => {
  removeScratch(dir);
});

const file = (name: string) => join(dir, name);
const text = (name: string) => (existsSync(file(name)) ? readFileSync(file(name), 'utf-8') : '');
const awsCalls = () => text('aws.log').split('\n').filter(Boolean);
const mintCalls = () => awsCalls().filter((l) => l.includes('lightsail get-instance-access-details'));
const hostCalls = () => text('ssh.log').split('\n').filter((l) => l.includes(`ec2-user@${ADDRESS}`));

interface Account {
  arn?: string;
  cliHistory?: string;
  /** The minted response's accessDetails, merged over the default. */
  access?: Record<string, unknown>;
  /** describe-alarm-history items. */
  history?: { t: string; s: string }[];
  /** lookup-events events. */
  events?: Record<string, unknown>[];
}

interface Host {
  /** Exit status of the routine-route probe; 255 is a failed connection. */
  probe?: number;
  failPorts?: string;
  sudoRc?: number;
  fingerprintsChange?: boolean;
  signal?: 'INT' | 'TERM';
}

const CLEARS = [
  // Newest first, as AWS returns them, so the script's own ordering is what
  // puts ALARM before OK.
  { t: `${AFTER}:10:00.000000+00:00`, s: 'Alarm updated from ALARM to OK' },
  { t: `${AFTER}:05:00.000000+00:00`, s: 'Alarm updated from OK to ALARM' },
];
const OWN_MINT = mintEvent({ time: `${AFTER}:01:00Z`, instance: INSTANCE, appId: 'footbag-host-break-glass' });

function stubs(a: Account, h: Host): Record<string, string> {
  const response = {
    accessDetails: {
      certKey: SENTINEL_CERT,
      expiresAt: '2099-01-01T01:00:00+00:00',
      ipAddress: ADDRESS,
      password: '',
      passwordData: { ciphertext: '', keyPairName: '' },
      privateKey: SENTINEL_KEY,
      protocol: 'ssh',
      instanceName: INSTANCE,
      username: 'ec2-user',
      hostKeys: HOST_KEYS.map((k) => ({ ...k, witnessedAt: '2099-01-01T00:00:00+00:00', fingerprintSHA1: 'x', fingerprintSHA256: 'y' })),
      ...a.access,
    },
  };
  writeFileSync(file('response.json'), JSON.stringify(response));
  writeFileSync(file('history.json'), JSON.stringify({
    AlarmHistoryItems: (a.history ?? CLEARS).map((x) => ({
      AlarmName: 'footbag-production-break-glass-host-access',
      AlarmType: 'MetricAlarm',
      Timestamp: x.t,
      HistoryItemType: 'StateUpdate',
      HistorySummary: x.s,
    })),
  }));
  writeFileSync(file('events.json'), lookupEventsOutput(a.events ?? [OWN_MINT]));

  const aws = file('aws');
  writeFileSync(aws, [
    '#!/usr/bin/env bash',
    `printf 'APPID=%s %s\\n' "\${AWS_SDK_UA_APP_ID:-}" "$*" >> ${JSON.stringify(file('aws.log'))}`,
    'case "$1 $2" in',
    `  "configure get") ${a.cliHistory === undefined ? 'exit 1' : `echo ${JSON.stringify(a.cliHistory)}`} ;;`,
    '  "configure list-profiles") echo footbag-operator ;;',
    `  "sts get-caller-identity") echo ${JSON.stringify(a.arn ?? OPERATOR_ARN)} ;;`,
    `  "lightsail get-instance-access-details") cat ${JSON.stringify(file('response.json'))} ;;`,
    `  "cloudwatch describe-alarm-history") cat ${JSON.stringify(file('history.json'))} ;;`,
    `  "cloudtrail lookup-events") cat ${JSON.stringify(file('events.json'))} ;;`,
    '  *) echo "unexpected aws call: $*" >&2; exit 64 ;;',
    'esac',
  ].join('\n'));

  const tf = file('terraform');
  writeFileSync(tf, [
    '#!/usr/bin/env bash',
    `case "\${@: -1}" in lightsail_static_ip) echo ${ADDRESS} ;; lightsail_instance_name) echo ${INSTANCE} ;; *) exit 1 ;; esac`,
  ].join('\n'));

  const ssh = file('ssh');
  writeFileSync(ssh, [
    '#!/usr/bin/env bash',
    `printf '%s\\n' "$*" >> ${JSON.stringify(file('ssh.log'))}`,
    'last="${@: -1}"',
    `if [[ "$*" != *"ec2-user@"* ]]; then exit ${h.probe ?? 255}; fi`,
    'key=""; cert=""; pin=""; port=""; prev=""',
    'for a in "$@"; do',
    '  [[ "$prev" == "-i" ]] && key="$a"',
    '  [[ "$prev" == "-p" ]] && port="$a"',
    '  [[ "$a" == CertificateFile=* ]] && cert="${a#CertificateFile=}"',
    '  [[ "$a" == UserKnownHostsFile=* ]] && pin="${a#UserKnownHostsFile=}"',
    '  prev="$a"',
    'done',
    `stat -c '%a' "$key" "$cert" "$pin" | tr '\\n' ' ' >> ${JSON.stringify(file('modes.log'))}; echo >> ${JSON.stringify(file('modes.log'))}`,
    `cp "$pin" ${JSON.stringify(file('pin.copy'))}`,
    h.signal ? `kill -s ${h.signal} "$PPID"; exit 255` : '',
    `for p in ${h.failPorts ?? ''}; do [[ "$port" == "$p" ]] && { echo "ssh: connect to host ${ADDRESS} port $p: Connection refused" >&2; exit 255; }; done`,
    `[[ "$last" == *"sudo -n true"* && "$last" != *ssh-keygen* ]] && exit ${h.sudoRc ?? 0}`,
    'if [[ "$last" == *ssh-keygen* ]]; then',
    `  n=$(cat ${JSON.stringify(file('fp.count'))} 2>/dev/null || echo 0); echo $((n + 1)) > ${JSON.stringify(file('fp.count'))}`,
    '  echo "/home/footbag/.ssh/authorized_keys 256 SHA256:fixtureone footbag (ED25519)"',
    `  ${h.fingerprintsChange ? '(( n >= 1 )) && echo "/home/ec2-user/.ssh/authorized_keys 256 SHA256:fixtureadded added (ED25519)"' : ':'}`,
    '  exit 0',
    'fi',
    `echo SESSION >> ${JSON.stringify(file('ssh.log'))}`,
    'exit 0',
  ].join('\n'));

  writeFileSync(file('pin'), `${ADDRESS} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixtureHostKeyOne\n`, { mode: 0o600 });
  for (const f of [aws, tf, ssh]) chmodSync(f, 0o755);
  return {
    HOST_BREAK_GLASS_AWS_BIN: aws,
    HOST_BREAK_GLASS_SSH_BIN: ssh,
    HOST_BREAK_GLASS_POLL_SECONDS: '0',
    HOST_BREAK_GLASS_WAIT_MINUTES: '0',
    AWS_PROFILE_BIN: aws,
    AWS_IDENTITY_BIN: aws,
    TF_OUTPUT_BIN: tf,
    FOOTBAG_KNOWN_HOSTS: file('pin'),
    TMPDIR: tmp,
  };
}

function run(args: string[], a: Account = {}, h: Host = {}, env: Record<string, string> = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    input: '',
    env: { ...process.env, ...stubs(a, h), ...env },
    ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', out: `${r.stdout}${r.stderr}` };
}

const DRILL = ['--target', 'staging', '--drill', '--yes'];
const drill = (a: Account = {}, h: Host = {}, env: Record<string, string> = {}) => run(DRILL, a, h, env);

/** Use mode at a terminal, typing each answer in turn. */
function atTerminal(typed: string[], a: Account = {}, h: Host = {}, args = ['--target', 'staging', '--reason', 'lockout']) {
  const inner = `bash ${JSON.stringify(SCRIPT)} ${args.map((x) => JSON.stringify(x)).join(' ')} </dev/null; echo "EXIT=$?"`;
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: typed.map((x) => `${x}\n`).join(''),
    env: { ...process.env, ...stubs(a, h) },
    ...SPAWN_GUARD,
  });
  const out = r.stdout ?? '';
  return { status: Number(out.match(/EXIT=(\d+)/)?.[1] ?? -1), out };
}

/** The closing report: everything from its heading on. */
const closingReport = (out: string) => out.slice(out.lastIndexOf('Closing report'));

describe('host-break-glass.sh: refused before anything is minted', () => {
  it('refuses no target and an unknown one, beside a drill that runs', () => {
    // Defect caught: the host chosen by ambient state, so a mint lands on
    // whichever environment the shell happened to point at.
    expect(run(['--drill', '--yes']).status).toBe(2);
    expect(run(['--target', 'prod', '--drill', '--yes']).status).toBe(2);
    expect(mintCalls()).toHaveLength(0);
    const ok = drill();
    expect(ok.status, ok.out).toBe(0);
    expect(mintCalls()).toHaveLength(1);
  });

  it('refuses an assumed-role identity, and mints as the directly authenticated operator', () => {
    // Defect caught: a job-role or assumed-role session minting a root shell.
    const r = drill({ arn: 'arn:aws:sts::000000000000:assumed-role/FootbagDevTester/james' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/assumed role/);
    expect(mintCalls()).toHaveLength(0);
  });

  it('refuses while the CLI history is on, before any AWS call', () => {
    // Defect caught: the minted private key kept in the CLI's history database.
    const r = drill({ cliHistory: 'enabled' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/history setting reads 'enabled'/);
    expect(mintCalls()).toHaveLength(0);
    expect(awsCalls().filter((l) => !l.includes('configure get cli_history'))).toEqual([]);
    expect(drill({ cliHistory: 'disabled' }).status).toBe(0);
  });

  it('refuses use mode without a terminal, and --yes outside a drill', () => {
    // Defect caught: a root shell minted by a run nobody is at, or a consent
    // flag that skips the typed answer on a real use.
    const noTty = run(['--target', 'staging', '--reason', 'lockout']);
    expect(noTty.status).not.toBe(0);
    expect(noTty.stderr).toMatch(/no terminal/);
    expect(run(['--target', 'staging', '--reason', 'lockout', '--yes']).status).toBe(2);
    expect(run(['--target', 'staging']).status).toBe(2);
    expect(awsCalls()).toEqual([]);
  });

  it.skipIf(!HAS_SCRIPT)('mints nothing without a typed APPLY', () => {
    // Defect caught: a credential minted without consent.
    const r = atTerminal(['no']);
    expect(r.status, r.out).not.toBe(0);
    expect(r.out).toMatch(/Type 'APPLY' to mint the certificate for ec2-user on footbag-staging-web/);
    expect(mintCalls()).toHaveLength(0);
  });

  it('makes no AWS or ssh call on a dry run', () => {
    // Defect caught: a dry run that mints, firing the alarm for a rehearsal.
    for (const args of [['--target', 'staging', '--drill', '--dry-run'], ['--target', 'production', '--reason', 'x', '--dry-run']]) {
      const r = run(args);
      expect(r.status, r.out).toBe(0);
    }
    expect(awsCalls()).toEqual([]);
    expect(text('ssh.log')).toBe('');
  });
});

describe('host-break-glass.sh: the minted response', () => {
  it('refuses a response with no host keys, connecting to nothing', () => {
    // Defect caught: the host trusted on first use.
    const r = drill({ access: { hostKeys: [] } });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/carries no host keys/);
    expect(hostCalls()).toEqual([]);
  });

  it('refuses a response whose address is not Terraform\'s', () => {
    // Defect caught: a connection to some other host than the one minted for.
    const r = drill({ access: { ipAddress: '198.51.100.7' } });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/names the address '198\.51\.100\.7', not Terraform's 203\.0\.113\.10/);
    expect(hostCalls()).toEqual([]);
  });

  it('carries the application id on the mint call and on no other', () => {
    // Defect caught: an unattributable mint, or every call labelled by an id
    // exported in the operator's shell.
    const r = drill({}, {}, { AWS_SDK_UA_APP_ID: 'footbag-ambient' });
    expect(r.status, r.out).toBe(0);
    const [mint] = mintCalls();
    expect(mint).toMatch(/^APPID=footbag-host-break-glass /);
    const others = awsCalls().filter((l) => !l.includes('lightsail get-instance-access-details'));
    expect(others.length).toBeGreaterThan(0);
    for (const call of others) expect(call, call).toMatch(/^APPID= /);
  });
});

describe('host-break-glass.sh: the credential on disk and in output', () => {
  it('never prints the private key or the certificate', () => {
    // Defect caught: a root-capable key in a terminal scrollback, a wrapper's
    // log or an agent transcript.
    const r = drill();
    expect(r.status, r.out).toBe(0);
    for (const secret of [SENTINEL_KEY, 'SENTINEL-break-glass-certificate']) {
      expect(r.stdout).not.toContain(secret);
      expect(r.stderr).not.toContain(secret);
      expect(text('ssh.log')).not.toContain(secret);
    }
    // The record block printed beside the closing report is checked too.
    expect(r.stderr).toMatch(/Record for the incident card[\s\S]*Closing report/);
  });

  it.skipIf(!HAS_SCRIPT)('never prints the private key in use mode either', () => {
    const r = atTerminal(['APPLY']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).not.toContain(SENTINEL_KEY);
  });

  it('holds the key, certificate and pin at mode 0600 while ssh runs, and leaves nothing after success', () => {
    // Defect caught: a credential readable by other accounts, or left on disk.
    const r = drill();
    expect(r.status, r.out).toBe(0);
    const modes = text('modes.log').trim().split('\n');
    expect(modes.length).toBeGreaterThan(0);
    for (const m of modes) expect(m.trim()).toBe('600 600 600');
    expect(readdirSync(tmp)).toEqual([]);
  });

  it('leaves nothing after an ssh failure', () => {
    const r = drill({}, { failPorts: '2222 22' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/could not connect as ec2-user on port 2222 or 22/);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it.each([['INT', 130], ['TERM', 143]] as const)('leaves nothing after SIG%s', (signal, status) => {
    const r = drill({}, { signal });
    expect(r.status, r.out).toBe(status);
    expect(text('modes.log').trim()).toBe('600 600 600');
    expect(readdirSync(tmp)).toEqual([]);
  });
});

describe('host-break-glass.sh: the connection', () => {
  it('verifies the host strictly against a pin of exactly the minted host keys, on both ports', () => {
    // Defect caught: trust on first use, or a pin that another known_hosts
    // file can widen.
    const r = drill();
    expect(r.status, r.out).toBe(0);
    const expected = HOST_KEYS.flatMap((k) => [
      `${ADDRESS} ${k.algorithm} ${k.publicKey}`,
      `[${ADDRESS}]:2222 ${k.algorithm} ${k.publicKey}`,
    ]).sort();
    expect(text('pin.copy').trim().split('\n').sort()).toEqual(expected);
    for (const call of hostCalls()) {
      expect(call).toContain('StrictHostKeyChecking=yes');
      expect(call).toContain('GlobalKnownHostsFile=/dev/null');
    }
  });

  it('authenticates with the minted key and certificate alone', () => {
    // Defect caught: an agent key or a configured identity used instead, so
    // the run proves nothing about the break-glass path.
    const r = drill();
    expect(r.status, r.out).toBe(0);
    expect(hostCalls().length).toBeGreaterThan(0);
    for (const call of hostCalls()) {
      expect(call).toContain('IdentitiesOnly=yes');
      expect(call).toContain('IdentityAgent=none');
      expect(call).toMatch(/CertificateFile=\S+/);
      expect(call).toMatch(/-i \S+/);
    }
  });

  it('falls back from port 2222 to 22, warning about the port that failed', () => {
    // Defect caught: a walk that gives up on one port while the other works.
    const r = drill({}, { failPorts: '2222' });
    expect(r.status, r.out).toBe(0);
    expect(hostCalls().filter((c) => c.includes('-p 22 '))).not.toEqual([]);
    expect(closingReport(r.stderr)).toMatch(/could not connect as ec2-user on port 2222/);
    expect(r.stderr).toMatch(/Connected on port: 22; sudo -n as ec2-user: yes/);
  });

  it('fails when the host answers and refuses sudo -n', () => {
    // Defect caught: an access level claimed that the session does not have.
    const r = drill({}, { sudoRc: 1 });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/sudo -n true was refused/);
  });

  it('reports an authorized_keys fingerprint that changed during the run', () => {
    // Defect caught: a key added during the session going unnoticed.
    const r = drill({}, { fingerprintsChange: true });
    expect(closingReport(r.stderr)).toMatch(/WARNING|Warnings/);
    expect(closingReport(r.stderr)).toMatch(/authorized_keys changed during the run: > \/home\/ec2-user\/\.ssh\/authorized_keys 256 SHA256:fixtureadded/);
    const same = drill();
    expect(closingReport(same.stderr)).not.toMatch(/authorized_keys changed/);
  });
});

describe.skipIf(!HAS_SCRIPT)('host-break-glass.sh: the routine route', () => {
  it('requires a second APPLY when the routine route connects, and mints nothing without it', () => {
    // Defect caught: convenience use passing silently.
    const refused = atTerminal(['APPLY', 'no'], {}, { probe: 0 });
    expect(refused.status, refused.out).not.toBe(0);
    expect(refused.out).toMatch(/attest that the routine route is not enough/);
    expect(mintCalls()).toHaveLength(0);
    const attested = atTerminal(['APPLY', 'APPLY'], {}, { probe: 0 });
    expect(attested.status, attested.out).toBe(0);
    expect(mintCalls()).toHaveLength(1);
    expect(closingReport(attested.out)).toMatch(/routine route footbag-staging connected/);
  });

  it('proceeds on one APPLY when the routine route does not connect, and opens the session', () => {
    const r = atTerminal(['APPLY'], {}, { probe: 255 });
    expect(r.status, r.out).toBe(0);
    expect(r.out).not.toMatch(/attest that the routine route/);
    expect(text('ssh.log')).toContain('SESSION');
    expect(text('ssh.log')).toMatch(/BatchMode=yes .*footbag-staging true/);
    // The session opens on the port that connected, 2222 here.
    const session = hostCalls().filter((c) => !c.includes('BatchMode=yes'));
    expect(session).toHaveLength(1);
    expect(session[0]).toMatch(/ -p 2222 ec2-user@/);
  });
});

describe('host-break-glass.sh: the drill is judged by the alarm\'s own history', () => {
  it('passes on ALARM then OK since the run began, with this run\'s mint listed', () => {
    const r = drill();
    expect(r.status, r.out).toBe(0);
    expect(r.stderr).toMatch(/fired on this run's mint and returned to OK/);
    expect(r.stderr).toMatch(/the listing shows this run's mint on footbag-staging-web under the application id footbag-host-break-glass/);
  });

  it('fails when the alarm never fires', () => {
    // Defect caught: a drill that passes with the alarm broken.
    const r = drill({ history: [] });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/did not fire within 0 minutes/);
  });

  it('fails when the alarm fires and never returns to OK', () => {
    // Defect caught: a dashboard alarm that never clears, passed as a drill.
    const r = drill({ history: [CLEARS[1]] });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/fired but did not return to OK/);
  });

  it('ignores transitions from before the run began', () => {
    // Defect caught: stale history counted as this run's proof.
    const r = drill({ history: [
      { t: `${BEFORE}:10:00.000000+00:00`, s: 'Alarm updated from ALARM to OK' },
      { t: `${BEFORE}:05:00.000000+00:00`, s: 'Alarm updated from OK to ALARM' },
    ] });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/did not fire within/);
  });

  it('fails when the listing does not show this run\'s mint under its application id', () => {
    // Defect caught: a drill that passes while its own mint is unattributable.
    const r = drill({ events: [mintEvent({ time: `${AFTER}:01:00Z`, instance: INSTANCE })] });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/the listing did not show this run's mint/);
  });

  it('does not count a claimed mint from before the run, or on another instance, as this run\'s', () => {
    // Defect caught: an earlier drill's mint, or one on the other host, taken
    // as proof that this run's mint is attributable.
    const app = 'footbag-host-break-glass';
    for (const event of [
      mintEvent({ time: `${BEFORE}:01:00Z`, instance: INSTANCE, appId: app }),
      mintEvent({ time: `${AFTER}:01:00Z`, instance: 'footbag-production-web', appId: app }),
    ]) {
      const r = drill({ events: [event] });
      expect(r.status, JSON.stringify(event)).not.toBe(0);
      expect(r.stderr).toMatch(/the listing did not show this run's mint/);
    }
  });

  it('does not count an OK that came before the ALARM as clearing it', () => {
    // Defect caught: a dashboard alarm still raised, passed as cleared.
    const r = drill({ history: [
      { t: `${AFTER}:10:00.000000+00:00`, s: 'Alarm updated from OK to ALARM' },
      { t: `${AFTER}:05:00.000000+00:00`, s: 'Alarm updated from INSUFFICIENT_DATA to OK' },
    ] });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/fired but did not return to OK/);
  });

  it('records the email and dashboard questions as unproved when no terminal is attached', () => {
    // Defect caught: an outcome nobody saw recorded as proved.
    const r = drill();
    expect(r.status, r.out).toBe(0);
    const report = closingReport(r.stderr);
    expect(report).toMatch(/Not proven:[\s\S]*alarm email for footbag-production-break-glass-host-access arrive \(not asked: no terminal\)/);
    expect(report).toMatch(/dashboard raise and then clear the platform alarm \(not asked: no terminal\)/);
  });

  it.skipIf(!HAS_SCRIPT)('asks both questions at a terminal and fails on a no', () => {
    const args = ['--target', 'staging', '--drill'];
    const yes = atTerminal(['APPLY', 'yes', 'yes'], {}, {}, args);
    expect(yes.status, yes.out).toBe(0);
    const no = atTerminal(['APPLY', 'yes', 'no'], {}, {}, args);
    expect(no.status, no.out).not.toBe(0);
    expect(closingReport(no.out)).toMatch(/did not confirm: did the admin dashboard raise/);
  });
});
