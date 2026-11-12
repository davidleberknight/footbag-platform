/**
 * scripts/ci/check_codeql_alerts.sh -- the CodeQL gate that fails on an open
 * high or critical alert.
 *
 * What is pinned: a serious alert on any page of the list fails the run and
 * is named; an alert below high does not; the branch asked about is the one
 * given; and a list that cannot be read or parsed fails rather than reading as
 * "no alerts".
 *
 * Hermetic: gh is a stand-in that prints canned pages of the alert list.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/ci/check_codeql_alerts.sh');
const REPO = 'example-owner/footbag-platform';
const REF = 'refs/heads/main';
const scratch = createScratchDir('codeql-alerts');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * One alert as `gh api repos/<repo>/code-scanning/alerts` returns it, from a
 * capture of the live repository on 2026-11-12, owner renamed. Every field is
 * kept; only the rule's long `help` text is shortened.
 */
const CAPTURED_ALERT = {
  assignees: [],
  created_at: '2026-11-06T07:28:15Z',
  dismissal_approved_by: null,
  dismissed_at: null,
  dismissed_by: null,
  dismissed_comment: null,
  dismissed_reason: null,
  fixed_at: null,
  html_url: `https://github.com/${REPO}/security/code-scanning/181`,
  instances_url: `https://api.github.com/repos/${REPO}/code-scanning/alerts/181/instances`,
  linked_issues: [],
  linked_pull_requests: [],
  most_recent_instance: {
    analysis_key: '.github/workflows/ci.yml:codeql',
    category: '.github/workflows/ci.yml:codeql',
    classifications: [],
    commit_sha: '0c971e28d85fa601cce2df57c244270abf4660c1',
    environment: '{}',
    location: { end_column: 22, end_line: 153, path: 'src/adapters/curatedAuthoringAdapter.ts', start_column: 15, start_line: 153 },
    message: { text: 'This path depends on a user-provided value.' },
    ref: 'refs/heads/main',
    state: 'open',
  },
  number: 181,
  rule: {
    description: 'Uncontrolled data used in path expression',
    full_description: 'Accessing paths influenced by users can allow an attacker to access unexpected resources.',
    help: '# Uncontrolled data used in path expression (shortened)',
    id: 'js/path-injection',
    name: 'js/path-injection',
    security_severity_level: 'high',
    severity: 'error',
    tags: ['external/cwe/cwe-022', 'security'],
  },
  state: 'open',
  tool: { guid: null, name: 'CodeQL', version: '2.27.4' },
  updated_at: '2026-11-06T07:28:15Z',
  url: `https://api.github.com/repos/${REPO}/code-scanning/alerts/181`,
};

type Alert = typeof CAPTURED_ALERT;
const alert = (number: number, level: string, id = 'js/some-rule'): Alert => ({
  ...CAPTURED_ALERT,
  number,
  rule: { ...CAPTURED_ALERT.rule, id, name: id, security_severity_level: level },
});

let caseNo = 0;
let dir = '';
const callLog = () => join(dir, 'gh.calls');

beforeEach(() => {
  caseNo += 1;
  dir = join(scratch, `case-${caseNo}`);
  mkdirSync(dir, { recursive: true });
});

/** A gh that prints each page as its own JSON array, the way --paginate does, or fails. */
function ghStub(pages: string[], fail = false): string {
  const path = join(dir, 'gh');
  pages.forEach((p, i) => writeFileSync(join(dir, `page${i}.json`), p));
  writeFileSync(path, [
    '#!/usr/bin/env bash',
    `printf '%s\\n' "$*" >> ${JSON.stringify(callLog())}`,
    fail ? 'echo "HTTP 403: Resource not accessible by integration" >&2; exit 1' : '',
    ...pages.map((_, i) => `cat ${JSON.stringify(join(dir, `page${i}.json`))}`),
  ].join('\n'));
  chmodSync(path, 0o755);
  return path;
}

function run(args: string[], gh: string, extra: Record<string, string> = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    input: '',
    env: { ...process.env, GITHUB_REPOSITORY: '', GITHUB_REF: '', CODEQL_ALERTS_GH_BIN: gh, TMPDIR: dir, ...extra },
    ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const ARGS = ['--repo', REPO, '--ref', REF];

describe('check_codeql_alerts.sh', () => {
  // Defect caught: a high alert left open passes CI, which is the whole gap
  // the gate exists to close.
  it('fails on an open high alert and names it', () => {
    const r = run(ARGS, ghStub([JSON.stringify([CAPTURED_ALERT])]));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('#181 high js/path-injection src/adapters/curatedAuthoringAdapter.ts:153');
    expect(r.stdout).not.toContain('pass');
  });

  // Defect caught: only the first page is read, so a serious alert past the
  // first hundred never fails the run.
  it('fails on a critical alert on a later page', () => {
    const page1 = JSON.stringify([alert(1, 'medium'), alert(2, 'low')]);
    const page2 = JSON.stringify([alert(3, 'critical', 'js/request-forgery')]);
    const r = run(ARGS, ghStub([page1, page2]));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('#3 critical js/request-forgery');
    expect(r.stderr).not.toContain('#1 ');
  });

  // Defect caught: a gate that fails on every alert, medium and low included,
  // which would block every push on findings the decision does not gate on.
  it('passes when every open alert is below high', () => {
    const r = run(ARGS, ghStub([JSON.stringify([alert(1, 'medium'), alert(2, 'low')])]));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[codeql-alerts] pass');
  });

  // Defect caught: the branch a run asks about is not the branch it pushed,
  // so another branch's alerts decide this run's verdict.
  it('asks only for open CodeQL alerts on the branch given', () => {
    run(['--repo', REPO, '--ref', 'refs/heads/feature-x'], ghStub(['[]']));
    const call = readFileSync(callLog(), 'utf-8');
    expect(call).toContain(`repos/${REPO}/code-scanning/alerts?`);
    expect(call).toContain('state=open');
    expect(call).toContain('tool_name=CodeQL');
    expect(call).toContain('ref=refs/heads/feature-x');
    expect(call).toContain('--paginate');
  });

  // Defect caught: a list the token cannot read is taken as an empty list,
  // so a permissions slip silently switches the gate off.
  it('fails, saying nothing was checked, when the alert list cannot be read', () => {
    const r = run(ARGS, ghStub([], true));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('HTTP 403');
    expect(r.stderr).toContain('nothing was checked');
    expect(r.stdout).not.toContain('pass');
  });

  // Defect caught: output that is not the alert list (an HTML error page)
  // filters to nothing and reads as clean.
  it('fails when the alert list does not parse', () => {
    const r = run(ARGS, ghStub(['<html>rate limited</html>']));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('did not parse');
  });

  // Defect caught: a stubbed run mistaken for a real one.
  it('says on stderr when the gh stand-in is in use', () => {
    const r = run(ARGS, ghStub(['[]']));
    expect(r.stderr).toContain('stand-in for the gh CLI');
  });

  // Defect caught: in Actions the gate asks about no repository or branch at
  // all, because it does not pick up the ones the runner provides.
  it('takes the repository and branch from the Actions environment', () => {
    const r = run([], ghStub(['[]']), { GITHUB_REPOSITORY: REPO, GITHUB_REF: REF });
    expect(r.status).toBe(0);
    expect(readFileSync(callLog(), 'utf-8')).toContain(`repos/${REPO}/code-scanning/alerts?`);
  });

  // Defect caught: a run with no repository or a bare branch name checks
  // something other than what was meant, or nothing.
  it('refuses a missing repository or a ref that is not a full ref, and calls nothing', () => {
    expect(run(['--ref', REF], ghStub(['[]'])).status).toBe(2);
    expect(run(['--repo', REPO, '--ref', 'main'], ghStub(['[]'])).status).toBe(2);
    expect(existsSync(callLog())).toBe(false);
  });
});
