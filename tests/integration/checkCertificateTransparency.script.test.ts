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
 * empty one. A name outside the served set must fail rather than be summarised.
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

  it('writes the report to --out as well as printing it', () => {
    const out = path.join(dir, 'report.txt');
    const r = run(['--domain', 'footbag.org', '--out', out], writeReader('[]'));
    expect(r.status).toBe(0);
    expect(fs.readFileSync(out, 'utf8')).toMatch(/No certificate is logged/);
  });
});
