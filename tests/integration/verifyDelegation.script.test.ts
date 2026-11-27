/**
 * scripts/verify-delegation.sh: who the .org registry delegates footbag.org to,
 * and whether the world resolves it the same way whichever servers answer.
 *
 * What carries the risk: the delegation read from a caching resolver instead of
 * the registry, so a move that never landed, or landed on some registry servers
 * only, reads as done; a failed query read as an answer; a resolver still on the
 * other zone, which is normal for hours after the move, reported as a failure,
 * or a resolver answering DIFFERENT records, which is never normal, reported as
 * pending; and a convergence time recorded before the registry agrees, which
 * starts the 25-hour clock the certificate stages wait on too early.
 *
 * The stand-ins answer in the shapes real tools gave when captured on 2026-11-26,
 * as follows.
 *   - `dig +norecurse +noall +authority @v0n0.pir-ns.org footbag.org NS` printed
 *     the referral as "footbag.org.\t\t3600\tIN\tNS\tdns2.llic.net." lines;
 *   - `dig +short @8.8.8.8 www.footbag.org A` printed "footbag.org." and then
 *     the address, because the legacy zone answers www through a canonical name,
 *     while a Route 53 server printed the address alone;
 *   - `dig +short` against an unreachable server printed ";; communications
 *     error to <addr>#53: timed out" and ";; no servers could be reached" on
 *     stdout and exited 9;
 *   - the registry's RDAP record carried "status": ["client transfer
 *     prohibited"] and nameservers[].ldhName "dns1.llic.net", "dns2.llic.net".
 * Addresses here are documentation ranges in those shapes. Nothing real is
 * reached.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { spawnAtTerminal } from '../fixtures/ptySession';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/verify-delegation.sh');

const ZONE_NS = ['ns-203.awsdns-25.com', 'ns-581.awsdns-08.net', 'ns-1507.awsdns-60.org', 'ns-1736.awsdns-25.co.uk'];
const LEGACY_NS = ['dns1.llic.net', 'dns2.llic.net'];
const REGISTRY = ['v0n0.pir-ns.org', 'v0n1.pir-ns.org', 'v2n0.pir-ns.org'];
const RESOLVERS = ['8.8.8.8', '1.1.1.1', '9.9.9.9'];

const APEX_A = '192.0.2.10';
const APEX_MX = ['10 mail.footbag.org.', '20 backup.example.net.'];
const MY_MX = ['10 ASPMX.L.GOOGLE.COM.', '20 ALT1.ASPMX.L.GOOGLE.COM.'];

const LOG_BEFORE = [
  '# Cutover log',
  '',
  '### 4a. The zone move and the mail preparation',
  '',
  '| Reading | Value | When measured | Notes |',
  '|---|---|---|---|',
  '| Registrar nameserver change saved | | | |',
  '| Delegation converged | | | |',
  '| Gmail on for `footbag.org` | | | |',
  '',
  '### 4b. T-0: the alias flip, then the mail apply',
  '',
  '| Reading | Value | When measured | Notes |',
  '|---|---|---|---|',
  '| Delegation converged | must not be written here | | |',
  '',
].join('\n');

/** 2026-11-26T18:30:00Z, the clock the recorded time is read from. */
const NOW = 1795717800;
const STAMP = '2026-11-26T18:30Z';

interface World {
  /** What each registry server delegates to; a server set to null cannot be read. */
  registry?: Record<string, string[] | null>;
  rdapNs?: string[];
  rdapStatus?: string[];
  rdapFails?: boolean;
  /** Which zone each resolver reads; defaults to the expected one. */
  resolverReads?: Record<string, 'route53' | 'legacy'>;
  /** A resolver whose apex MX answer differs from the zone's. */
  resolverMxDiffers?: string;
  httpCode?: string;
}

let dir: string;
let data: string;
let log: string;

function stub(name: string, body: string): string {
  const path = join(dir, 'bin', name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/** One stand-in answer: the file dig prints for "<server> <name> <type>". */
function answer(server: string, name: string, type: string, lines: string[]) {
  writeFileSync(join(data, `${server}__${name}__${type}`), lines.length ? `${lines.join('\n')}\n` : '');
}

function zoneAnswers(server: string, viaCname: boolean, mxDiffers = false) {
  answer(server, 'footbag.org', 'A', [APEX_A]);
  // The legacy zone answers www through its canonical name, as a resolver
  // reading it does; Route 53 answers the address alone.
  answer(server, 'www.footbag.org', 'A', viaCname ? ['footbag.org.', APEX_A] : [APEX_A]);
  answer(server, 'footbag.org', 'MX', mxDiffers ? ['10 elsewhere.example.net.'] : APEX_MX);
  answer(server, 'my.footbag.org', 'MX', MY_MX);
}

function world(w: World, expect: 'route53' | 'legacy'): NodeJS.ProcessEnv {
  const expected = expect === 'route53' ? ZONE_NS : LEGACY_NS;
  answer('8.8.8.8', 'org.', 'NS', REGISTRY.map((r) => `${r}.`));
  for (const r of REGISTRY) {
    const got = w.registry && r in w.registry ? w.registry[r] : expected;
    if (got === null) continue;
    answer(r, 'footbag.org', 'NS', got.map((n) => `footbag.org.\t\t3600\tIN\tNS\t${n}.`));
  }
  // The expected zone's own first server, which the resolvers are judged against.
  zoneAnswers(expected.slice().sort()[0]!, expect === 'legacy');
  for (const res of RESOLVERS) {
    const reads = w.resolverReads?.[res] ?? expect;
    const mname = reads === 'route53' ? 'ns-581.awsdns-08.net.' : 'dns1.llic.net.';
    answer(res, 'footbag.org', 'SOA', [`${mname} hostmaster.example.net. 1 7200 900 1209600 86400`]);
    zoneAnswers(res, reads === 'legacy', w.resolverMxDiffers === res);
  }

  const dig = stub(
    'dig',
    [
      'server=""; name=""; type=""',
      'for a in "$@"; do',
      '  case "$a" in @*) server="${a#@}" ;; +*) ;; *) if [[ -z "$name" ]]; then name="$a"; else type="$a"; fi ;; esac',
      'done',
      `f=${JSON.stringify(data)}/"\${server}__\${name}__\${type}"`,
      'if [[ -f "$f" ]]; then cat "$f"; exit 0; fi',
      'echo ";; communications error to 192.0.2.53#53: timed out"',
      'echo ";; no servers could be reached"',
      'exit 9',
    ].join('\n'),
  );
  const rdap = join(dir, 'rdap.json');
  writeFileSync(
    rdap,
    JSON.stringify({
      objectClassName: 'domain',
      ldhName: 'footbag.org',
      status: w.rdapStatus ?? ['client transfer prohibited'],
      nameservers: (w.rdapNs ?? expected).map((n) => ({ objectClassName: 'nameserver', ldhName: n })),
    }),
  );
  const curl = stub(
    'curl',
    [
      'case "$*" in',
      `  *rdap*) ${w.rdapFails ? 'echo "curl: (22) The requested URL returned error: 503" >&2; exit 22' : `cat ${JSON.stringify(rdap)}`} ;;`,
      `  *http://*) printf '%s' ${JSON.stringify(w.httpCode ?? '200')} ;;`,
      'esac',
    ].join('\n'),
  );
  const tf = stub(
    'terraform',
    [
      'case " $* " in',
      `  *" output -json route53_name_servers "*) printf '%s' '${JSON.stringify(ZONE_NS)}'; exit 0 ;;`,
      'esac',
      'exit 1',
    ].join('\n'),
  );
  const home = join(dir, 'home');
  mkdirSync(home, { recursive: true });
  return {
    ...process.env,
    ...awsIdentityStubEnv(dir),
    HOME: home,
    TF_OUTPUT_BIN: tf,
    VERIFY_DELEGATION_DIG_BIN: dig,
    VERIFY_DELEGATION_CURL_BIN: curl,
    VERIFY_DELEGATION_LOG: log,
    VERIFY_DELEGATION_NOW: String(NOW),
  };
}

const shellWord = (a: string) => `'${a.replace(/'/g, `'\\''`)}'`;

/** Runs the script at a pseudo-terminal, typing `answers` at it. */
function run(w: World, args: string[], answers: string[] = []) {
  const expectArg = args.includes('legacy') ? 'legacy' : 'route53';
  const env = world(w, expectArg);
  const inner = ['bash', SCRIPT, ...args].map(shellWord).join(' ');
  const res = spawnAtTerminal(inner, { env, typed: answers.map((a) => `${a}\n`).join('') });
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`.replace(/\r/g, ''),
    log: existsSync(log) ? readFileSync(log, 'utf-8') : '',
  };
}

const route53 = ['--target', 'production', '--expect', 'route53'];
const legacy = ['--target', 'production', '--expect', 'legacy'];
const record = [...route53, '--record'];

beforeEach(() => {
  dir = createScratchDir('verify-delegation');
  mkdirSync(join(dir, 'bin'), { recursive: true });
  data = join(dir, 'answers');
  mkdirSync(data, { recursive: true });
  log = join(dir, 'CUTOVER_LOG.md');
  writeFileSync(log, LOG_BEFORE);
});

afterEach(() => {
  removeScratch(dir);
});

describe('verify-delegation.sh: arguments', () => {
  it('refuses any target but production, and runs with it', () => {
    const r = run({}, ['--target', 'staging', '--expect', 'route53']);
    // Defect caught: a run named for another environment reads production's
    // delegation and reports it as that environment's.
    expect(r.status).toBe(2);
    expect(run({}, route53).status).toBe(0);
  });

  it('refuses a missing or unknown expectation', () => {
    // Defect caught: a run with no stated expectation judges the delegation
    // against nothing and passes whatever it finds.
    expect(run({}, ['--target', 'production']).status).toBe(2);
    expect(run({}, ['--target', 'production', '--expect', 'cloudflare']).status).toBe(2);
  });

  it('refuses to record a convergence time against the legacy set', () => {
    const r = run({}, [...legacy, '--record'], ['APPLY']);
    // Defect caught: a rollback run writes a "converged" time, and the
    // certificate stages start their 25-hour clock on a delegation that left.
    expect(r.status).toBe(2);
    expect(r.log).toBe(LOG_BEFORE);
  });

  it('prints the zone\'s own nameservers for the registrar and checks nothing', () => {
    const r = run({}, ['--target', 'production', '--print-nameservers']);
    // Defect caught: the registrar is given a set other than the zone's, and the
    // domain stops resolving the moment it is saved.
    expect(r.status, r.out).toBe(0);
    for (const ns of ZONE_NS) expect(r.out, ns).toContain(`  ${ns}\n`);
    expect(r.out).not.toMatch(/pir-ns\.org/);
  });
});

describe('verify-delegation.sh: the registry', () => {
  it('passes when every registry server and RDAP name the expected set', () => {
    const r = run({}, route53);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/all 3 \.org registry nameservers delegate footbag\.org to the route53 set/);
  });

  it('reports PENDING, not done and not failed, while one registry server still names the old set', () => {
    const r = run({ registry: { 'v2n0.pir-ns.org': LEGACY_NS } }, route53);
    // Defect caught: a change that has reached some registry servers only is
    // reported as done, or the normal minutes of propagation read as a failure.
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/v2n0\.pir-ns\.org: dns1\.llic\.net dns2\.llic\.net {3}<- not yet the route53 set/);
    expect(r.out).toMatch(/0 error\(s\)/);
  });

  it('fails when a registry server cannot be read, rather than reading silence as an answer', () => {
    const r = run({ registry: { 'v0n1.pir-ns.org': null } }, route53);
    // Defect caught: an unreachable registry server is skipped, so a run that
    // asked two servers of three reports the whole registry delegated.
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/v0n1\.pir-ns\.org could not be read \(dig exit 9/);
  });

  it('fails when RDAP cannot be read', () => {
    const r = run({ rdapFails: true }, route53);
    // Defect caught: the registry's own record is unreadable and the run passes
    // on the nameserver reads alone, without the lock status it exists to show.
    expect(r.status, r.out).toBe(1);
  });

  it('refuses an update lock before the move, and accepts one after it', () => {
    const locked = ['client transfer prohibited', 'client update prohibited'];
    const before = run({ rdapStatus: locked }, legacy);
    // Defect caught: the operator reaches the registrar to find the change
    // refused part way through the window.
    expect(before.status, before.out).toBe(1);
    expect(before.out).toMatch(/update lock/);
    const after = run({ rdapStatus: locked }, route53);
    // Defect caught: the lock recommended once the move has settled turns every
    // later check red.
    expect(after.status, after.out).toBe(0);
  });
});

describe('verify-delegation.sh: the resolvers', () => {
  it('treats a resolver still reading the legacy zone as not yet proved, when it answers the same records', () => {
    const r = run({ resolverReads: { '1.1.1.1': 'legacy' } }, route53);
    // Defect caught: the hours a resolver legitimately holds the old nameserver
    // set read as a broken move; and the legacy zone's www, answered through a
    // canonical name, reads as a different address from Route 53's alias.
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/that 1\.1\.1\.1 reads the route53 zone: it still reads dns1\.llic\.net/);
    expect(r.out).toMatch(/0 error\(s\)/);
  });

  it('fails when a resolver answers a record differently from the zone', () => {
    const r = run({ resolverMxDiffers: '9.9.9.9' }, route53);
    // Defect caught: the two zones have drifted apart, so mail for the domain
    // goes somewhere different depending on which zone a sender's resolver
    // reads, and the run reports only that a resolver is "still converging".
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/9\.9\.9\.9 answers footbag\.org MX as 10 elsewhere\.example\.net; the route53 zone answers 10 mail\.footbag\.org 20 backup\.example\.net/);
  });

  it('fails when the legacy site stops answering over HTTP', () => {
    const r = run({ httpCode: '000' }, legacy);
    // Defect caught: the legacy site goes dark across the move and every DNS
    // check still passes.
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/http:\/\/www\.footbag\.org\/ did not answer/);
  });
});

describe('verify-delegation.sh: --record', () => {
  it('writes the convergence time in the zone-move section, in the form the cutover stages read', () => {
    const r = run({}, record, ['APPLY']);
    // Defect caught: the time lands in the wrong row or section, or in a form the
    // custom-domain stage cannot parse, so that stage refuses or waits on the
    // wrong moment.
    expect(r.status, r.out).toBe(0);
    expect(r.log).toContain(`| Delegation converged | ${STAMP} | ${STAMP} | scripts/verify-delegation.sh --expect route53 --record |`);
    expect(r.log).toContain('| Delegation converged | must not be written here | | |');
    expect(r.log.replace(/\| Delegation converged \| 2026-11-26T18:30Z .*\n/, '| Delegation converged | | | |\n')).toBe(LOG_BEFORE);
  });

  it('leaves the log unchanged when the confirmation is declined', () => {
    const r = run({}, record, ['no']);
    // Defect caught: a declined confirmation still writes the time.
    expect(r.status).toBe(1);
    expect(r.log).toBe(LOG_BEFORE);
  });

  it('refuses to record while the registry has not converged', () => {
    const r = run({ registry: { 'v0n0.pir-ns.org': LEGACY_NS } }, record, ['APPLY']);
    // Defect caught: the 25-hour clock starts before every registry server
    // hands out the new set, so a certificate stage validates too early.
    expect(r.status).toBe(3);
    expect(r.log).toBe(LOG_BEFORE);
  });

  it('keeps a time already recorded, so a re-run cannot move it', () => {
    const recorded = LOG_BEFORE.replace('| Delegation converged | | | |', '| Delegation converged | 2026-11-25T09:00Z | 2026-11-25T09:00Z | |');
    writeFileSync(log, recorded);
    const r = run({}, record, ['APPLY']);
    // Defect caught: a later run overwrites the convergence time with a later
    // one, so the stages wait longer than needed or, rewritten earlier, too little.
    expect(r.status, r.out).toBe(0);
    expect(r.log).toBe(recorded);
  });
});
