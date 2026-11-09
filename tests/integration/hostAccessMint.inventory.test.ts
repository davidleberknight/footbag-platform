/**
 * scripts/lib/host-access-mint.sh — the one place in the tree that calls
 * Lightsail's GetInstanceAccessDetails.
 *
 * That call mints a short-lived certificate and private key for the instance's
 * default account, which has passwordless sudo, and the production break-glass
 * alarm fires on every one. A mint is attributable only when it carries an
 * application id the mint listing knows, and safe only when its response goes
 * to a private file and never through the CLI's history. The library does both;
 * this suite holds that nothing else in the operator tree makes the call, and
 * that every caller names an id the library's table lists.
 *
 * The scan reads the operator tree on disk (scripts/ and the repository-root
 * scripts), not tests or documents, which describe the call without making it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { REPO_ROOT, scanSource } from '../fixtures/sourceTree';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const LIB_REL = 'scripts/lib/host-access-mint.sh';
const LIB = join(REPO_ROOT, LIB_REL);
const OPERATOR_TREE = { roots: ['scripts'], shallow: ['.'], exts: ['.sh', '.bash', '.py', '.ts', '.js', '.mjs', ''] };

/** The application ids the library accepts, read from the library itself. */
function tableIds(): string[] {
  const r = spawnSync('bash', ['-c', `source ${JSON.stringify(LIB)}; printf '%s\\n' "\${HOST_ACCESS_MINT_APP_IDS[@]}"`], {
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  expect(r.status, r.stderr).toBe(0);
  return (r.stdout ?? '').split('\n').filter(Boolean);
}

/**
 * The id a call passes: a literal as written, or a variable the same file
 * assigns exactly one literal. Anything else is returned as written, which the
 * id check then refuses, because no reader can say what it will be.
 */
function resolveId(fileText: string, arg: string): string {
  const v = /^"?\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?"?$/.exec(arg);
  if (!v) return arg.replace(/^"(.*)"$/, '$1');
  const assigned = new Set(
    [...fileText.matchAll(new RegExp(`^\\s*(?:readonly\\s+|local\\s+|declare\\s+-r\\s+)?${v[1]}=(\\S+)\\s*$`, 'gm'))]
      .map((a) => a[1].replace(/^"(.*)"$/, '$1')),
  );
  return assigned.size === 1 ? [...assigned][0] : arg;
}

describe('the minting call has one home', () => {
  it('appears in no operator file but the mint library', () => {
    // Defect caught: a script minting directly, without the application id,
    // the private response file or the history refusal, so its mint fires the
    // alarm unattributed and may leave a root-capable key on disk.
    for (const needle of ['get-instance-access-details', 'get_instance_access_details']) {
      const hits = scanSource(needle, OPERATOR_TREE).filter((f) => f !== LIB_REL);
      expect(hits, `${needle} outside the mint library`).toEqual([]);
    }
    expect(scanSource('get-instance-access-details', OPERATOR_TREE)).toContain(LIB_REL);
  });

  it('is called only with application ids the library lists', () => {
    // Defect caught: a new caller passing an id the mint listing does not
    // know, so its mints read as unattributed, or an id held in a variable that
    // no reader can check.
    const known = tableIds();
    expect(known.length).toBeGreaterThan(0);
    // The library defines the function and names it in its own messages; every
    // other file that names it is a caller.
    const callers = scanSource('host_access_mint ', OPERATOR_TREE).filter((f) => f !== LIB_REL);
    const seen: string[] = [];
    for (const file of callers) {
      const text = readFileSync(join(REPO_ROOT, file), 'utf-8');
      for (const line of text.split('\n')) {
        if (line.trim().startsWith('#')) continue;
        const m = /\bhost_access_mint\s+(\S+)\s+(\S+)/.exec(line);
        if (!m) continue;
        const id = resolveId(text, m[2]);
        expect(id, `${file}: ${line.trim()}`).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(known, `${file} passes ${id}`).toContain(id);
        seen.push(id);
      }
    }
    // The routine callers this inventory exists for are found by the scan, so
    // a scan that matches nothing cannot pass.
    expect(seen).toEqual(expect.arrayContaining(['footbag-install-known-hosts', 'footbag-restore-host']));
  });
});

describe('the library refuses an id it does not list', () => {
  let dir: string;
  let aws: string;
  let log: string;

  beforeEach(() => {
    dir = createScratchDir('host-access-mint');
    aws = join(dir, 'aws');
    log = join(dir, 'calls.log');
    writeFileSync(aws, [
      '#!/usr/bin/env bash',
      `echo "\${AWS_SDK_UA_APP_ID:-none} $*" >> ${JSON.stringify(log)}`,
      '[[ "$1 $2" == "configure get" ]] && exit 1',
      'echo \'{"accessDetails":{"hostKeys":[]}}\'',
    ].join('\n') + '\n', { mode: 0o755 });
  });

  afterEach(() => removeScratch(dir));

  function mint(id: string) {
    const out = join(dir, `response-${id}.json`);
    const r = spawnSync('bash', ['-c', `source ${JSON.stringify(LIB)}; host_access_mint ${JSON.stringify(aws)} ${JSON.stringify(id)} footbag-staging-web ${JSON.stringify(out)}`], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    const calls = existsSync(log) ? readFileSync(log, 'utf-8') : '';
    return { status: r.status, stderr: r.stderr ?? '', calls, out };
  }

  it('makes no call for an unknown id, and mints with the id for a known one', () => {
    // Defect caught: an unlisted caller minting anyway, which is the
    // unattributed firing the alarm asks a person to investigate.
    const refused = mint('footbag-not-a-caller');
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('not a known host-access application id');
    expect(refused.calls).toBe('');
    const allowed = mint('footbag-install-known-hosts');
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(allowed.calls).toContain('footbag-install-known-hosts lightsail get-instance-access-details');
    expect(existsSync(allowed.out)).toBe(true);
  });
});
