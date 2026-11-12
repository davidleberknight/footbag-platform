/**
 * scripts/dismiss-github-alerts.sh -- carries out a reviewed plan of GitHub
 * alert dismissals, CodeQL code-scanning or Dependabot, and reads each back.
 *
 * What is pinned: the kind of alert is required and decides both the address
 * written to and the reasons accepted; a plan that names an alert twice, uses
 * a reason GitHub does not accept for that kind or carries an unusable comment
 * is refused before anything is written; an unknown alert stops the run before
 * any write; nothing is dismissed without the confirmation; an alert already
 * dismissed as planned is left alone and one in another state is reported, not
 * overwritten; each dismissal sends its own reason and comment and is judged by
 * reading it back.
 *
 * Hermetic: gh is a stand-in that keeps the repository's alerts in a scratch
 * file and can be told to refuse writes or to ignore them.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/dismiss-github-alerts.sh');
const REPO = 'example-owner/footbag-platform';
const scratch = createScratchDir('dismiss-alerts');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

interface Alert { number: number; state: string; dismissed_reason: string | null; dismissed_comment: string | null }
const open = (number: number): Alert => ({ number, state: 'open', dismissed_reason: null, dismissed_comment: null });

let caseNo = 0;
let dir = '';
const stateFile = () => join(dir, 'alerts.json');
const callLog = () => join(dir, 'gh.calls');

beforeEach(() => {
  caseNo += 1;
  dir = join(scratch, `case-${caseNo}`);
  mkdirSync(dir, { recursive: true });
});

/** gh keeping alerts in a file: GET reads one, PATCH applies the -f fields. */
function ghStub(): string {
  const path = join(dir, 'gh');
  writeFileSync(path, [
    '#!/usr/bin/env bash',
    `state=${JSON.stringify(stateFile())}`,
    `printf '%s\\n' "$*" >> ${JSON.stringify(callLog())}`,
    '[[ "$1" == api ]] || exit 64; shift',
    'method=GET; fields=(); path=""',
    'while [[ $# -gt 0 ]]; do case "$1" in --method) method="$2"; shift 2 ;; -f) fields+=("$2"); shift 2 ;; *) path="$1"; shift ;; esac; done',
    'n="${path##*/}"',
    'jq -e --argjson n "$n" \'.[] | select(.number == $n)\' "$state" > /dev/null || { echo "HTTP 404: Not Found" >&2; exit 1; }',
    'if [[ "$method" == GET ]]; then jq --argjson n "$n" \'.[] | select(.number == $n)\' "$state"; exit 0; fi',
    '[[ -n "${FAKE_GH_REFUSE:-}" ]] && { echo "HTTP 403: Resource not accessible by integration" >&2; exit 1; }',
    '[[ -n "${FAKE_GH_IGNORE:-}" ]] && { echo "{}"; exit 0; }',
    'upd="{}"',
    'for f in "${fields[@]}"; do upd=$(jq --arg k "${f%%=*}" --arg v "${f#*=}" \'. + {($k): $v}\' <<< "$upd"); done',
    'jq --argjson n "$n" --argjson u "$upd" \'map(if .number == $n then . + $u else . end)\' "$state" > "$state.new" && mv "$state.new" "$state"',
    'echo "{}"',
  ].join('\n'));
  chmodSync(path, 0o755);
  return path;
}

function run(kind: string | null, plan: unknown, alerts: Alert[], args: string[] = ['--yes'], extra: Record<string, string> = {}) {
  writeFileSync(stateFile(), JSON.stringify(alerts));
  const planPath = join(dir, 'plan.json');
  writeFileSync(planPath, typeof plan === 'string' ? plan : JSON.stringify(plan));
  const kindArgs = kind === null ? [] : ['--kind', kind];
  const r = spawnSync('bash', [SCRIPT, ...kindArgs, '--repo', REPO, '--plan', planPath, ...args], {
    encoding: 'utf-8',
    input: '',
    env: { ...process.env, DISMISS_ALERTS_GH_BIN: ghStub(), TMPDIR: dir, ...extra },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const stored = () => JSON.parse(readFileSync(stateFile(), 'utf-8')) as Alert[];
const calls = () => (existsSync(callLog()) ? readFileSync(callLog(), 'utf-8') : '').split('\n').filter(Boolean);
const writes = () => calls().filter((l) => l.includes('--method PATCH'));

const PLAN = [
  { number: 3, reason: 'false positive', comment: 'Built server-side from committed slugs.' },
  { number: 7, reason: "won't fix", comment: 'Limits live in the owning service.' },
];
const DEPENDABOT_PLAN = [
  { number: 41, reason: 'not_used', comment: 'Only JPEG and PNG bytes reach the image library, so its SVG decoder never runs.' },
];

describe('dismiss-github-alerts.sh', () => {
  // Defect caught: an alert dismissed with another alert's reason, or with
  // none, so the record a reviewer reads later says something untrue.
  it('dismisses each open alert with its own reason and comment and reads it back', () => {
    const r = run('code-scanning', PLAN, [open(3), open(7), open(9)]);
    expect(r.status, r.out).toBe(0);
    const byNumber = new Map(stored().map((a) => [a.number, a]));
    expect(byNumber.get(3)).toMatchObject({ state: 'dismissed', dismissed_reason: 'false positive', dismissed_comment: PLAN[0].comment });
    expect(byNumber.get(7)).toMatchObject({ state: 'dismissed', dismissed_reason: "won't fix", dismissed_comment: PLAN[1].comment });
    expect(byNumber.get(9)?.state, 'an alert outside the plan was touched').toBe('open');
    expect(r.out).toContain('2 of 2 code-scanning alert(s) dismissed and read back');
  });

  // Defect caught: a Dependabot dismissal sent to the code-scanning address,
  // or the other way round, so the wrong alert with the same number closes.
  it('reads and writes each kind of alert at its own address', () => {
    run('code-scanning', PLAN, [open(3), open(7)]);
    const codeCalls = calls();
    expect(codeCalls.length).toBeGreaterThan(0);
    for (const line of codeCalls) expect(line).toContain(`repos/${REPO}/code-scanning/alerts/`);
    const r = run('dependabot', DEPENDABOT_PLAN, [open(41)]);
    expect(r.status, r.out).toBe(0);
    const dependabotCalls = calls().slice(codeCalls.length);
    expect(dependabotCalls.length).toBeGreaterThan(0);
    for (const line of dependabotCalls) expect(line).toContain(`repos/${REPO}/dependabot/alerts/41`);
    expect(stored()[0]).toMatchObject({ state: 'dismissed', dismissed_reason: 'not_used', dismissed_comment: DEPENDABOT_PLAN[0].comment });
  });

  // Defect caught: a plan written for one kind run as the other, so GitHub is
  // sent a reason it rejects part way through, or a run with no kind guesses.
  it('refuses a reason the kind does not accept, and a missing or unknown kind, writing nothing', () => {
    const codeReasonOnDependabot = run('dependabot', [{ number: 41, reason: 'false positive', comment: 'x' }], [open(41)]);
    expect(codeReasonOnDependabot.status).not.toBe(0);
    expect(codeReasonOnDependabot.out).toContain('plan was refused');
    const dependabotReasonOnCode = run('code-scanning', [{ number: 3, reason: 'not_used', comment: 'x' }], [open(3)]);
    expect(dependabotReasonOnCode.status).not.toBe(0);
    expect(run(null, PLAN, [open(3), open(7)]).status).toBe(2);
    expect(run('secret-scanning', PLAN, [open(3), open(7)]).status).toBe(2);
    expect(calls()).toEqual([]);
  });

  // Defect caught: a malformed plan half-applied, leaving some alerts closed
  // on reasons nobody reviewed.
  it('refuses a plan with a repeated alert, an unaccepted reason or an unusable comment, writing nothing', () => {
    const bad = [
      [PLAN[0], PLAN[0]],
      [{ number: 3, reason: 'not a bug', comment: 'x' }],
      [{ number: 3, reason: 'false positive', comment: '' }],
      [{ number: 3, reason: 'false positive', comment: 'x'.repeat(281) }],
      '{"number": 3}',
    ];
    for (const plan of bad) {
      const r = run('code-scanning', plan, [open(3)]);
      expect(r.status, JSON.stringify(plan)).not.toBe(0);
      expect(r.out).toMatch(/plan was refused|not a JSON array/);
    }
    expect(writes()).toEqual([]);
  });

  // Defect caught: a comment of exactly GitHub's limit refused, so a reviewed
  // plan cannot run.
  it('accepts a comment of exactly 280 characters', () => {
    const r = run('code-scanning', [{ number: 3, reason: 'mitigated', comment: 'y'.repeat(280) }], [open(3)]);
    expect(r.status, r.out).toBe(0);
  });

  // Defect caught: a typo in an alert number found only after the others were
  // already dismissed.
  it('stops before any write when the plan names an alert the repository does not have', () => {
    const r = run('code-scanning', PLAN, [open(3)]);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('could not read code-scanning alert 7');
    expect(writes()).toEqual([]);
  });

  // Defect caught: a run with no confirmation, from an agent or a job, that
  // still writes to the repository.
  it('dismisses nothing without the confirmation', () => {
    const r = run('code-scanning', PLAN, [open(3), open(7)], []);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('nothing was changed');
    expect(writes()).toEqual([]);
  });

  // Defect caught: a re-run that rewrites what is already done, or overwrites a
  // dismissal someone else, or a repository rule, made with a different reason.
  it('leaves an alert dismissed as planned alone and reports one in another state', () => {
    const done: Alert = { number: 3, state: 'dismissed', dismissed_reason: 'false positive', dismissed_comment: PLAN[0].comment };
    const other: Alert = { number: 7, state: 'dismissed', dismissed_reason: 'used in tests', dismissed_comment: 'Someone else.' };
    const r = run('code-scanning', PLAN, [done, other]);
    expect(writes()).toEqual([]);
    expect(r.out).toContain('1 alert(s) already dismissed as planned');
    expect(r.out).toContain('alert 7 is dismissed (used in tests), not open');
    expect(stored().find((a) => a.number === 7)?.dismissed_reason).toBe('used in tests');
    const ruled = run('dependabot', DEPENDABOT_PLAN, [{ number: 41, state: 'auto_dismissed', dismissed_reason: null, dismissed_comment: null }]);
    expect(writes()).toEqual([]);
    expect(ruled.out).toContain('alert 41 is auto_dismissed, not open');
  });

  // Defect caught: a refused write counted as done.
  it('reports an error when GitHub refuses a dismissal', () => {
    const r = run('code-scanning', PLAN, [open(3), open(7)], ['--yes'], { FAKE_GH_REFUSE: '1' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('GitHub refused to dismiss alert 3');
    expect(r.out).toContain('0 of 2 code-scanning alert(s) dismissed');
  });

  // Defect caught: a write GitHub accepted but did not apply, reported as done
  // because the call returned success.
  it('judges each dismissal by reading it back', () => {
    const r = run('code-scanning', PLAN, [open(3), open(7)], ['--yes'], { FAKE_GH_IGNORE: '1' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('alert 3 reads back as open');
  });

  // Defect caught: a stubbed run mistaken for a real one.
  it('says on stderr when the gh stand-in is in use', () => {
    expect(run('code-scanning', PLAN, [open(3), open(7)]).out).toContain('stand-in for the gh CLI');
  });
});
