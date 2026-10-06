/**
 * Contract tests for scripts/check-certificate-transparency.sh: the check that
 * reads the public certificate logs for the domain.
 *
 * Why the check exists, and therefore what these pin. The authorisation record
 * at the apex constrains which authority may issue for a name under the domain.
 * It does not constrain who may prove control to that authority, and the system
 * addresses that authority accepts as proof reach the outgoing operator's host
 * until the apex mail records move. Through that window the zone cannot answer
 * whether a certificate exists, so the logs are the only source and a run that
 * cannot read them must say so rather than report silence.
 *
 * Four properties carry the risk. An unreadable log must never be reported as an
 * empty one. A name outside the served set whose certificate is still valid, or
 * was issued within the last 200 days, must fail rather than be summarised; only
 * a long-expired one is reported as historical evidence without failing.
 * The served set must be derived from the domain the operator names, so a run
 * against one domain cannot pass on another's names. And the run must refuse
 * without a domain, because which domain is read is exactly the thing that must
 * not come from ambient state.
 *
 * Hermetic: a fake reader on the seam serves fixture responses; nothing reaches
 * the network.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-certificate-transparency.sh');

let dir: string;

/** Writes a stub reader that prints `body` and exits `code`. */
function writeReader(body: string, code = 0): string {
  const stub = path.join(dir, 'reader');
  fs.writeFileSync(stub, `#!/usr/bin/env bash\ncat <<'JSON'\n${body}\nJSON\nexit ${code}\n`, {
    mode: 0o755,
  });
  return stub;
}

function run(args: string[], reader?: string): ReturnType<typeof spawnSync> {
  return spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...(reader ? { FOOTBAG_CURL_BIN: reader } : {}) },
    ...SPAWN_GUARD,
  });
}

beforeEach(() => {
  dir = createScratchDir('cert-transparency');
});

afterEach(() => {
  removeScratch(dir);
});

// One row of the public log's JSON exactly as it answered for this domain,
// captured 2026-10-06 from crt.sh: a certificate for the legacy host that expired
// in 2016. The validity fields are read from this shape, so the fixture keeps the
// row whole rather than the two fields the classification uses.
const CAPTURED_EXPIRED_ROW = {
  issuer_ca_id: 1558,
  issuer_name: 'C=US, O=GeoTrust Inc., CN=RapidSSL SHA256 CA - G3',
  common_name: 'rimu2.footbag.org',
  name_value: 'rimu2.footbag.org',
  id: 10034592,
  not_before: '2015-02-11T22:41:55',
  not_after: '2016-05-16T03:02:24',
  serial_number: '025255',
  result_count: 2,
};

/** A log timestamp `days` from now, in the log's own format. */
function logMoment(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19);
}

describe('judging a logged certificate by its validity window', () => {
  it('reports a long-expired certificate outside the served set as evidence, without failing', () => {
    const r = run(['--domain', 'footbag.org'], writeReader(JSON.stringify([CAPTURED_EXPIRED_ROW])));
    expect(r.status, String(r.stderr)).toBe(0);
    expect(r.stdout).toMatch(/HISTORICAL\s+rimu2\.footbag\.org\s+expired 2016-05-16T03:02:24Z/);
    expect(r.stdout).toMatch(/outside it:\s+0/);
  });

  it('fails on a certificate outside the served set that is still valid', () => {
    const body = JSON.stringify([
      CAPTURED_EXPIRED_ROW,
      { ...CAPTURED_EXPIRED_ROW, id: 1, not_before: logMoment(-400), not_after: logMoment(30) },
    ]);
    const r = run(['--domain', 'footbag.org'], writeReader(body));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/UNEXPECTED\s+rimu2\.footbag\.org\s+not in the served set \(valid until/);
  });

  it('fails on a certificate issued inside the window even after it has expired', () => {
    // A short-lived certificate obtained through the window above and already
    // lapsed still says someone proved control of the name recently.
    const body = JSON.stringify([
      { ...CAPTURED_EXPIRED_ROW, name_value: 'rogue.footbag.org', not_before: logMoment(-40), not_after: logMoment(-1) },
    ]);
    const r = run(['--domain', 'footbag.org'], writeReader(body));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/UNEXPECTED\s+rogue\.footbag\.org\s+not in the served set \(issued/);
  });

  it('judges each name an entry covers, so a served name cannot carry an unexpected one past', () => {
    const body = JSON.stringify([
      { ...CAPTURED_EXPIRED_ROW, name_value: 'www.footbag.org\nshadow.footbag.org', not_before: logMoment(-10), not_after: logMoment(80) },
    ]);
    const r = run(['--domain', 'footbag.org'], writeReader(body));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/EXPECTED\s+www\.footbag\.org/);
    expect(r.stdout).toMatch(/UNEXPECTED\s+shadow\.footbag\.org/);
  });
});

describe('check-certificate-transparency.sh', () => {
  it('refuses to run without a domain, rather than defaulting to one', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--domain is required/);
  });

  it('says on stderr when it is reading a stub rather than the logs', () => {
    const r = run(['--domain', 'footbag.org'], writeReader('[]'));
    expect(r.stderr).toMatch(/reads a stub rather than the public logs/);
  });

  it('passes and says so when no certificate is logged', () => {
    const r = run(['--domain', 'footbag.org'], writeReader('[]'));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/No certificate is logged/);
  });

  it('passes when every logged name is in the served set', () => {
    const body = JSON.stringify([
      { name_value: 'footbag.org' },
      { name_value: 'www.footbag.org' },
      { name_value: 'archive.footbag.org' },
    ]);
    const r = run(['--domain', 'footbag.org'], writeReader(body));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/in the served set: 3/);
    expect(r.stdout).toMatch(/outside it:\s+0/);
  });

  it('fails on a name outside the served set and names it', () => {
    const body = JSON.stringify([
      { name_value: 'www.footbag.org' },
      { name_value: 'rimu2.footbag.org' },
    ]);
    const r = run(['--domain', 'footbag.org'], writeReader(body));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/UNEXPECTED\s+rimu2\.footbag\.org/);
    expect(r.stderr).toMatch(/not in the served set/);
  });

  it('refuses to treat an unreadable log as an empty one', () => {
    const r = run(['--domain', 'footbag.org'], writeReader('', 7));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read the certificate logs/);
    expect(r.stderr).toMatch(/An unreadable log is not an empty one/);
  });

  it('derives the served set from the domain it was given', () => {
    // www of ANOTHER domain is not in this domain's served set, so a run that
    // built the set from a hardcoded name rather than from --domain would pass
    // this and must not.
    const body = JSON.stringify([{ name_value: 'www.footbag.org' }]);
    const r = run(['--domain', 'example.org'], writeReader(body));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/UNEXPECTED\s+www\.footbag\.org/);
  });

  it('does not call the real reader a stub when the seam names it', () => {
    // Mock mode reads nothing, so this asks only what the run says about its reader.
    const r = spawnSync('bash', [SCRIPT, '--mock', '--domain', 'footbag.org'], {
      encoding: 'utf8',
      env: { ...process.env, FOOTBAG_CURL_BIN: 'curl' },
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/reads a stub/);
  });

  it('writes the report to --out as well as printing it', () => {
    const out = path.join(dir, 'report.txt');
    const r = run(['--domain', 'footbag.org', '--out', out], writeReader('[]'));
    expect(r.status).toBe(0);
    expect(fs.readFileSync(out, 'utf8')).toMatch(/No certificate is logged/);
  });
});
