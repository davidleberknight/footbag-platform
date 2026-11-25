/**
 * scripts/verify-prelive-probes.sh: four controls proved on the running
 * environment before go-live (the forwarded address, the image strip, the
 * error-line alarm, the URL screening), each with a stated pass.
 *
 * What carries the risk: a probe that passes on the wrong state (a spoofed
 * address trusted, dev code left in the image, an alarm that never fires, the
 * stub screening links), or that passes when its read failed; an alarm already
 * firing taken as proof; and the deliberate error line written where the
 * logging driver never sees it.
 *
 * The workstation side is driven through a stand-in host that answers each
 * session with the facts a case chooses, and a stand-in aws CLI. The root-side
 * half is driven on its own with a stand-in docker that runs its node code
 * against this repository's own Express. Nothing reaches AWS or a host.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';

const REPO_ROOT = process.cwd();
const SCRIPT = join(REPO_ROOT, 'scripts/verify-prelive-probes.sh');
const HALF = join(REPO_ROOT, 'scripts/internal/verify-prelive-probes-remote.sh');
const REPORT_REMOTE = join(REPO_ROOT, 'scripts/lib/closing-report-remote.sh');
const PASSWORD = 'fixture-sudo-password';
const MARK = '---FOOTBAG-PRELIVE---';

/** The stubs docker/web/Dockerfile writes, read from its text: path under dist/ and digest. */
function dockerfileStubs(): string {
  const text = readFileSync(join(REPO_ROOT, 'docker/web/Dockerfile'), 'utf-8');
  const stubs = [...text.matchAll(/printf '([^']*)' > dist\/(\S+?)(?=[\s;&])/g)].map((m) => ({
    path: m[2],
    digest: createHash('sha256').update(m[1].replace(/\\n/g, '\n')).digest('hex'),
  }));
  expect(stubs.length).toBe(3);
  return stubs.sort((a, b) => a.path.localeCompare(b.path)).map((s) => `${s.digest}  ${s.path}`).join(' ; ');
}

const NGINX_GOOD = [
  'set_real_ip_from 127.0.0.1;', 'set_real_ip_from 172.16.0.0/12;', 'real_ip_header X-Forwarded-For;', 'real_ip_recursive on;',
  ...Array.from({ length: 3 }, () => ['proxy_pass http://app;', 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;']).flat(),
];
const CANONICAL_BAD = 'http://malware.testing.google.test/testing/malware/';
const SECOND_BAD = 'https://testsafebrowsing.appspot.com/s/malware.html';
const ORDINARY = 'https://example.com/';
const screen = (url: string, answer: Record<string, unknown>) => JSON.stringify({ url, ...answer });
const SCREENING_GOOD = [
  screen(CANONICAL_BAD, { safe: false, threats: ['MALWARE'] }),
  screen(SECOND_BAD, { safe: false, threats: ['MALWARE'] }),
  screen(ORDINARY, { safe: true, threats: [] }),
];

interface Facts { trust_proxy?: string; trust_resolves?: string; nginx?: string[]; digests?: string; screening?: string[] }

let dir: string;

beforeEach(() => { dir = createScratchDir('prelive-probes'); });
afterEach(() => removeScratch(dir));

function readsOutput(f: Facts = {}): string {
  return [
    `${MARK} trust_proxy ${f.trust_proxy ?? '2'}`,
    `${MARK} trust_resolves ${f.trust_resolves ?? '203.0.113.10'}`,
    `${MARK} nginx_forwarding ${(f.nginx ?? NGINX_GOOD).join(' ; ')}`,
    `${MARK} dev_digests ${f.digests ?? dockerfileStubs()}`,
    `${MARK} url_screening ${(f.screening ?? SCREENING_GOOD).join(' ; ')}`,
  ].join('\n') + '\n';
}

/** A stand-in host and aws CLI for one run. */
function estate(o: { reads?: string; errorLine?: string; alarm?: string[]; logArrives?: boolean; recorded?: string } = {}) {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const sessions = join(dir, 'sessions.log');
  writeFileSync(join(dir, 'reads.out'), o.reads ?? readsOutput());
  writeFileSync(join(dir, 'error-line.out'), o.errorLine ?? `${MARK} error_line written\n`);
  writeFileSync(join(bin, 'ssh'), [
    '#!/usr/bin/env bash',
    hostIdentityAnswer(o.recorded),
    'for a in "$@"; do [[ "$a" == "-G" ]] && { printf "hostname 203.0.113.40\\nuser footbag\\n"; exit 0; }; done',
    'stream="$(cat)"',
    `printf '%s\\n=====\\n' "$stream" >> ${JSON.stringify(sessions)}`,
    `case "$stream" in *PROBE_MODE=reads*) cat ${JSON.stringify(join(dir, 'reads.out'))} ;; *PROBE_MODE=error-line*) cat ${JSON.stringify(join(dir, 'error-line.out'))} ;; esac`,
  ].join('\n'));
  chmodSync(join(bin, 'ssh'), 0o755);
  writeFileSync(join(dir, 'pin'), '[203.0.113.40]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
  // The alarm's state on successive reads, the last repeating.
  writeFileSync(join(dir, 'alarm-states'), (o.alarm ?? ['OK', 'ALARM']).join('\n') + '\n');
  const aws = join(dir, 'aws');
  writeFileSync(aws, [
    '#!/usr/bin/env bash',
    `echo "aws $*" >> ${JSON.stringify(join(dir, 'aws.log'))}`,
    'case "$1 $2" in',
    '  "cloudwatch describe-alarms")',
    `    n="$(cat ${JSON.stringify(join(dir, 'alarm-n'))} 2>/dev/null || echo 0)"; echo $((n + 1)) > ${JSON.stringify(join(dir, 'alarm-n'))}`,
    `    mapfile -t s < ${JSON.stringify(join(dir, 'alarm-states'))}; i=$(( n < \${#s[@]} ? n : \${#s[@]} - 1 )); echo "\${s[$i]}" ;;`,
    `  "logs filter-log-events") ${o.logArrives === false ? 'echo ""' : 'echo "event-1"'} ;;`,
    '  *) exit 64 ;;',
    'esac',
  ].join('\n'));
  chmodSync(aws, 0o755);
  return {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      FOOTBAG_KNOWN_HOSTS: join(dir, 'pin'),
      VERIFY_PRELIVE_AWS_BIN: aws,
      VERIFY_PRELIVE_POLL_SECONDS: '0',
    },
    sessions: () => (existsSync(sessions) ? readFileSync(sessions, 'utf-8') : ''),
  };
}

function probes(env: NodeJS.ProcessEnv, args = ['--target', 'production']) {
  const r = spawnSync('setsid', ['bash', SCRIPT, ...args], { encoding: 'utf-8', input: `${PASSWORD}\n`, env, ...SPAWN_GUARD });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const errors = (stderr: string) => (stderr.match(/Errors \(\d+\):([\s\S]*?)(?:\n\S|$)/)?.[1] ?? '');

describe('the pre-live probes on a healthy environment', () => {
  // Defect caught: a probe that cannot pass on the state it exists to prove.
  it('passes every probe and says what it did not prove', () => {
    const e = estate();
    const r = probes(e.env);
    expect(r.status, r.stderr).toBe(0);
    const proven = r.stderr.match(/\nProven:\n([\s\S]*?)\nNot proven:/)?.[1] ?? '';
    for (const probe of ['A:', 'B:', 'C:', 'D:']) expect(proven, probe).toMatch(new RegExp(`- ${probe}`));
    expect(r.stderr).toMatch(/Not proven[\s\S]*origin-fence/);
    // The screening asked for both test addresses and the ordinary one, and
    // the error line carried an error level and this run's probe id.
    const sent = e.sessions();
    expect(sent).toContain('PROBE_MODE=reads');
    for (const url of [CANONICAL_BAD, SECOND_BAD, ORDINARY]) expect(sent).toContain(url);
    expect(sent).toMatch(/PROBE_LINE=.*level.*error.*probe.*prelive-/);
    // The password travels only as the first line of each session.
    expect(sent.split('\n').filter((l) => l === PASSWORD)).toHaveLength(2);
  });
});

describe('probe A: the forwarded address', () => {
  // Defect caught: a host whose app trusts a spoofed forwarded entry, or whose
  // nginx stops sending the address on one location, read as fine.
  it.each([
    ['the hop count is the named-range fallback', { trust_proxy: 'loopback, linklocal, uniquelocal' }],
    ['the chain resolves to the spoofed entry', { trust_resolves: '198.51.100.66' }],
    ['the chain resolves to the edge', { trust_resolves: '192.0.2.1' }],
    ['one proxied location sends no forwarded header', { nginx: NGINX_GOOD.filter((l, i) => i !== NGINX_GOOD.lastIndexOf('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;')) }],
    ['nginx trusts every address for its real-ip', { nginx: [...NGINX_GOOD, 'set_real_ip_from 0.0.0.0/0;'] }],
    ['nginx takes its real-ip from no header', { nginx: NGINX_GOOD.filter((l) => l !== 'real_ip_header X-Forwarded-For;') }],
    ['nginx proxies nothing, so no forwarding was read', { nginx: NGINX_GOOD.filter((l) => !l.startsWith('proxy_')) }],
    ['the read failed and gave nothing', { trust_proxy: '' }],
  ])('fails when %s', (_why, facts) => {
    const r = probes(estate({ reads: readsOutput(facts as Facts) }).env);
    expect(r.status).toBe(1);
    expect(errors(r.stderr)).toMatch(/- A: /);
    expect(errors(r.stderr)).not.toMatch(/- [BCD]: /);
  });
});

describe('probe B: the image strip', () => {
  // Defect caught: an image built with the dev shortcuts, or a stub changed so
  // it no longer stands in for the dev code, passing as stripped.
  it.each([
    ['an extra file is in the dev-only folders', () => `${dockerfileStubs()} ; ${'0'.repeat(64)}  testkit/personaRoutes.js`],
    ['a stub holds other content', () => dockerfileStubs().replace(/^[0-9a-f]{64}/, 'f'.repeat(64))],
    ['nothing was read', () => ''],
  ])('fails when %s', (_why, digests) => {
    const r = probes(estate({ reads: readsOutput({ digests: digests() }) }).env);
    expect(r.status).toBe(1);
    expect(errors(r.stderr)).toMatch(/- B: /);
    expect(errors(r.stderr)).not.toMatch(/- [ACD]: /);
  });
});

describe('probe D: the URL screening', () => {
  // Defect caught: the stub screening running in production, which refuses
  // only the canonical address; a lookup failure read as an answer; or a
  // screening that refuses ordinary links.
  it.each([
    ['the second test address reads safe, as only the stub would', [SCREENING_GOOD[0], screen(SECOND_BAD, { safe: true, threats: [] }), SCREENING_GOOD[2]]],
    ['a lookup throws', [screen(CANONICAL_BAD, { error: 'API key not valid' }), SCREENING_GOOD[1], SCREENING_GOOD[2]]],
    ['the ordinary address reads unsafe', [SCREENING_GOOD[0], SCREENING_GOOD[1], screen(ORDINARY, { safe: false, threats: ['MALWARE'] })]],
    ['an address got no answer', [SCREENING_GOOD[0], SCREENING_GOOD[2]]],
    ['a test address reads unsafe but names no threat', [SCREENING_GOOD[0], screen(SECOND_BAD, { safe: false, threats: [] }), SCREENING_GOOD[2]]],
  ])('fails when %s', (_why, screening) => {
    const r = probes(estate({ reads: readsOutput({ screening: screening as string[] }) }).env);
    expect(r.status).toBe(1);
    expect(errors(r.stderr)).toMatch(/- D: /);
    expect(errors(r.stderr)).not.toMatch(/- [ABC]: /);
  });
});

describe('probe C: the error-line alarm', () => {
  // Defect caught: an alarm already firing taken as this run's proof, so a
  // filter that matches nothing passes.
  it('refuses to start while the alarm is already in ALARM, and writes no line', () => {
    const e = estate({ alarm: ['ALARM'] });
    const r = probes(e.env);
    expect(r.status).toBe(1);
    expect(errors(r.stderr)).toMatch(/- C: .*already in ALARM/);
    expect(e.sessions()).not.toContain('PROBE_MODE=error-line');
  });

  // Defect caught: an alarm the tree never created read as one that is quiet,
  // so the probe writes its line and waits on nothing.
  it('refuses when the alarm does not exist, and writes no line', () => {
    const e = estate({ alarm: ['None'] });
    const r = probes(e.env);
    expect(r.status).toBe(1);
    expect(errors(r.stderr)).toMatch(/- C: .*was not found/);
    expect(e.sessions()).not.toContain('PROBE_MODE=error-line');
  });

  // Defect caught: app lines not reaching the log group passing because the
  // alarm fired for some other line.
  it('fails when the line never reaches the log group', () => {
    const r = probes(estate({ logArrives: false }).env);
    expect(r.status).toBe(1);
    expect(errors(r.stderr)).toMatch(/- C: .*never reached/);
  });

  // Defect caught: a filter or period that does not catch an error line.
  it('fails when the alarm never fires', () => {
    const r = probes(estate({ alarm: ['OK'] }).env);
    expect(r.status).toBe(1);
    expect(errors(r.stderr)).toMatch(/- C: .*did not reach ALARM/);
  });

  it('fails when the host could not write the line', () => {
    const r = probes(estate({ errorLine: '' }).env);
    expect(r.status).toBe(1);
    expect(errors(r.stderr)).toMatch(/- C: .*not written/);
  });
});

describe('refusals', () => {
  it('refuses no target and an unknown one before reaching any host', () => {
    for (const args of [[], ['--target', 'prod']]) {
      const e = estate();
      const r = probes(e.env, args);
      expect(r.status, args.join(' ')).toBe(2);
      expect(e.sessions()).toBe('');
    }
  });

  it('refuses a host that records another environment before reading anything', () => {
    const e = estate({ recorded: 'staging' });
    const r = probes(e.env);
    expect(r.status).toBe(1);
    expect(e.sessions()).toBe('');
  });
});

describe('the root-side half', () => {
  /** A stand-in docker: records each call, runs node code locally against this
   *  repository's own Express, and answers the rest from the case. */
  function half(mode: string, extra: Record<string, string> = {}, trustProxy = '2') {
    const bin = join(dir, 'half-bin');
    mkdirSync(bin, { recursive: true });
    const calls = join(dir, 'docker.log');
    writeFileSync(join(bin, 'docker'), [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(calls)}`,
      'while [[ $# -gt 0 && "$1" != exec ]]; do shift; done; shift',
      'args=(); while [[ "$1" == -* ]]; do [[ "$1" == -u ]] && shift; shift; done',
      'service="$1"; shift',
      'case "$1" in',
      `  printenv) echo ${JSON.stringify(trustProxy)} ;;`,
      `  node) if [[ "$3" == *getSafeBrowsingAdapter* ]]; then echo '{"url":"x","safe":true,"threats":[]}'; else cd ${JSON.stringify(REPO_ROOT)} && TRUST_PROXY=${JSON.stringify(trustProxy)} node -e "$3"; fi ;;`,
      '  nginx) printf "    proxy_pass         http://app;\\n    proxy_set_header   X-Forwarded-For   \\$proxy_add_x_forwarded_for;\\n    gzip on;\\n" ;;',
      '  sh) echo "dev-bootstrap/runtime.js" ;;',
      'esac',
    ].join('\n'));
    chmodSync(join(bin, 'docker'), 0o755);
    const r = spawnSync('bash', ['-c', `source ${JSON.stringify(REPORT_REMOTE)}; source ${JSON.stringify(HALF)}`], {
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, PROBE_MODE: mode, ENV_PATH: '/dev/null', COMPOSE_DIR: '/c', ...extra },
      ...SPAWN_GUARD,
    });
    return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '', calls: existsSync(calls) ? readFileSync(calls, 'utf-8') : '' };
  }
  const factOf = (out: string, name: string) => out.match(new RegExp(`^${MARK} ${name} (.*)$`, 'm'))?.[1];

  // Defect caught: the resolution worked out by a copy of the rule rather than
  // by Express itself, so a hop count that hands req.ip to the viewer passes.
  it('resolves the spoofed chain with Express\'s own trust function, to the visitor at 2 hops and not at 3', () => {
    expect(factOf(half('reads').stdout, 'trust_resolves')).toBe('203.0.113.10');
    expect(factOf(half('reads', {}, '3').stdout, 'trust_resolves')).toBe('198.51.100.66');
  });

  // Defect caught: the nginx read keeping lines that do not decide the address,
  // or losing the ones that do.
  it('keeps only the lines that decide which address the app sees', () => {
    expect(factOf(half('reads').stdout, 'nginx_forwarding')).toBe('proxy_pass http://app; ; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
  });

  // Defect caught: the line written where the logging driver never reads it,
  // or as a user that cannot open that descriptor.
  it('writes the error line to the web container\'s own output, as root', () => {
    const r = half('error-line', { PROBE_LINE: '{"level":"error","probe":"p1"}' });
    expect(r.status, r.stderr).toBe(0);
    expect(factOf(r.stdout, 'error_line')).toBe('written');
    expect(r.calls).toMatch(/exec -T -u root web sh -c printf "%s\\n" "\$1" > \/proc\/1\/fd\/1 probe \{"level":"error","probe":"p1"\}/);
  });

  it('reports a failed read as an error rather than a fact', () => {
    const r = half('reads', {}, '2');
    expect(r.status, r.stderr).toBe(0);
    const bin = join(dir, 'half-bin', 'docker');
    writeFileSync(bin, '#!/usr/bin/env bash\necho "cannot connect to the docker daemon" >&2\nexit 1\n');
    const failed = spawnSync('bash', ['-c', `source ${JSON.stringify(REPORT_REMOTE)}; source ${JSON.stringify(HALF)}`], {
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${join(dir, 'half-bin')}:${process.env.PATH ?? ''}`, PROBE_MODE: 'reads', ENV_PATH: '/dev/null', COMPOSE_DIR: '/c' },
      ...SPAWN_GUARD,
    });
    expect(failed.status).toBe(1);
    expect(failed.stdout).not.toMatch(new RegExp(`${MARK} trust_proxy`));
    expect(failed.stderr).toMatch(/---FOOTBAG-PROBLEM--- ERROR trust_proxy: .*cannot connect/);
  });
});
