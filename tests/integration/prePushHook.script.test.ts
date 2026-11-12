/**
 * .githooks/pre-push -- the push-time warning about open high or critical
 * CodeQL alerts.
 *
 * What is pinned: a serious alert is shown and the push still goes ahead; an
 * alert list that cannot be read is a warning, never a refused push; the
 * repository and branch asked about are the ones being pushed to; and a push
 * with nothing scanned to report on (a branch deletion, a tag, a branch new to
 * the remote, a remote off GitHub) asks nothing at all.
 *
 * Hermetic: gh is a stand-in through the alert check's own seam, and the hook
 * runs the real alert check from this working tree.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const HOOK = join(process.cwd(), '.githooks/pre-push');
const REPO = 'example-owner/footbag-platform';
const SSH_URL = `git@github.com:${REPO}.git`;
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const ZERO = '0'.repeat(40);
const scratch = createScratchDir('pre-push-hook');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const HIGH_ALERT = JSON.stringify([{
  number: 72,
  state: 'open',
  rule: { id: 'js/xss', security_severity_level: 'high' },
  most_recent_instance: { location: { path: 'src/views/example.hbs', start_line: 68 } },
}]);

let caseNo = 0;
let dir = '';
const callLog = () => join(dir, 'gh.calls');

beforeEach(() => {
  caseNo += 1;
  dir = join(scratch, `case-${caseNo}`);
  mkdirSync(dir, { recursive: true });
});

function ghStub(page: string, fail = false): string {
  const path = join(dir, 'gh');
  writeFileSync(join(dir, 'page.json'), page);
  writeFileSync(path, [
    '#!/usr/bin/env bash',
    `printf '%s\\n' "$*" >> ${JSON.stringify(callLog())}`,
    fail ? 'echo "error connecting to api.github.com" >&2; exit 1' : '',
    `cat ${JSON.stringify(join(dir, 'page.json'))}`,
  ].join('\n'));
  chmodSync(path, 0o755);
  return path;
}

/** Runs the hook as git does: remote name and URL as arguments, one line per ref on stdin. */
function push(url: string, lines: string[], gh: string) {
  const r = spawnSync('bash', [HOOK, 'origin', url], {
    encoding: 'utf-8',
    input: lines.map((l) => `${l}\n`).join(''),
    env: { ...process.env, GITHUB_REPOSITORY: '', GITHUB_REF: '', CODEQL_ALERTS_GH_BIN: gh, TMPDIR: dir },
    ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const mainUpdate = `refs/heads/main ${SHA_A} refs/heads/main ${SHA_B}`;

describe('pre-push hook', () => {
  // Defect caught: a serious alert refuses the push, or passes without a word,
  // when the maintainer asked to be warned and never blocked.
  it('lists an open high alert and lets the push go ahead', () => {
    const r = push(SSH_URL, [mainUpdate], ghStub(HIGH_ALERT));
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('#72 high js/xss src/views/example.hbs:68');
    expect(r.stderr).toContain('WARNING: CodeQL alerts on refs/heads/main');
  });

  // Defect caught: a network failure or an unreadable list stops the push.
  it('warns and lets the push go ahead when the alert list cannot be read', () => {
    const r = push(SSH_URL, [mainUpdate], ghStub('[]', true));
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('nothing was checked');
    expect(r.stderr).toContain('WARNING: CodeQL alerts on refs/heads/main');
  });

  // Defect caught: a clean branch is reported as carrying alerts.
  it('gives no warning when no serious alert is open', () => {
    const r = push(SSH_URL, [mainUpdate], ghStub('[]'));
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('WARNING');
  });

  // Defect caught: the warning reports another repository's or another
  // branch's alerts, so the one pushed goes unchecked.
  it('asks about the pushed repository and branch, for SSH and HTTPS remotes alike', () => {
    const gh = ghStub('[]');
    push(SSH_URL, [`refs/heads/feature-x ${SHA_A} refs/heads/feature-x ${SHA_B}`], gh);
    push(`https://github.com/${REPO}`, [mainUpdate], gh);
    const calls = readFileSync(callLog(), 'utf-8').trim().split('\n');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain(`repos/${REPO}/code-scanning/alerts?`);
    expect(calls[0]).toContain('ref=refs/heads/feature-x');
    expect(calls[1]).toContain(`repos/${REPO}/code-scanning/alerts?`);
    expect(calls[1]).toContain('ref=refs/heads/main');
  });

  // Defect caught: a push with no scan to report on prints a spurious
  // "could not be read" warning, which teaches the reader to ignore it.
  it('asks nothing for a deletion, a tag, a branch new to the remote, or a remote off GitHub', () => {
    const gh = ghStub(HIGH_ALERT);
    const quiet = [
      push(SSH_URL, [`(delete) ${ZERO} refs/heads/old ${SHA_B}`], gh),
      push(SSH_URL, [`refs/tags/v1 ${SHA_A} refs/tags/v1 ${ZERO}`], gh),
      push(SSH_URL, [`refs/heads/new ${SHA_A} refs/heads/new ${ZERO}`], gh),
      push('git@gitlab.example:owner/repo.git', [mainUpdate], gh),
    ];
    for (const r of quiet) {
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('WARNING');
    }
    expect(existsSync(callLog())).toBe(false);
  });
});
