/**
 * scripts/github-ruleset.sh -- the public repository's protect-main ruleset,
 * held to the committed copy.
 *
 * A ruleset switched off or loosened in the web interface leaves no record, so
 * what is pinned here is that the comparison sees what the ruleset does and
 * nothing else (GitHub's ids, links, timestamps and rule order are not drift,
 * while enforcement, a rule or a bypass entry is), that an apply writes the
 * committed copy to the right ruleset and judges itself by reading it back, and
 * that it writes nothing without a confirmation.
 *
 * Hermetic: gh is a stand-in keeping the repository's rulesets in a scratch
 * file, and the origin remote is supplied through the script's announced seam.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/github-ruleset.sh');
const COMMITTED = JSON.parse(readFileSync(join(process.cwd(), 'scripts/github-ruleset-protect-main.json'), 'utf-8'));
const REPO = 'example-owner/footbag-platform';
const scratch = createScratchDir('github-ruleset');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * The shape `gh api repos/<repo>/rulesets/<id>` returns, from a capture of the
 * live repository on 2026-11-10, owner renamed. It carries a required status
 * check and a bypass entry and is disabled, so it differs from the committed
 * copy on every axis the comparison must see.
 */
const LIVE_CAPTURE = {
  id: 14395608,
  name: 'protect-main',
  target: 'branch',
  source_type: 'Repository',
  source: REPO,
  enforcement: 'disabled',
  conditions: { ref_name: { exclude: [], include: ['~DEFAULT_BRANCH'] } },
  rules: [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        do_not_enforce_on_create: false,
        required_status_checks: [{ context: 'Type-check and test', integration_id: 15368 }],
      },
    },
  ],
  node_id: 'RRS_lACqUmVwb3NpdG9yec5F9vaPzgDbqNg',
  created_at: '2026-03-27T15:27:45.684+13:00',
  updated_at: '2026-03-27T15:30:32.852+13:00',
  bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
  current_user_can_bypass: 'always',
  _links: { self: { href: `https://api.github.com/repos/${REPO}/rulesets/14395608` } },
};

/** The committed copy as GitHub would return it: bookkeeping added, rules in another order. */
const MATCHING = {
  ...COMMITTED,
  id: 14395608,
  source_type: 'Repository',
  source: REPO,
  node_id: 'RRS_x',
  created_at: '2026-03-27T15:27:45.684+13:00',
  updated_at: '2026-11-10T09:00:00.000+13:00',
  current_user_can_bypass: 'never',
  rules: [...COMMITTED.rules].reverse(),
};

let dir: string;
let caseNo = 0;
const stateFile = () => join(dir, 'rulesets.json');
const callLog = () => join(dir, 'calls.log');

/**
 * gh, over a file holding the repository's rulesets as an array. A PUT or POST
 * stores the --input body under the ruleset's id; FAKE_GH_WRITE_IGNORED accepts
 * the write and keeps the old state, as a write GitHub silently narrowed would.
 */
function ghStub(): string {
  const path = join(dir, 'gh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `state=${JSON.stringify(stateFile())}`,
      `printf '%s\\n' "$*" >> ${JSON.stringify(callLog())}`,
      '[[ "$1" == api ]] || exit 64; shift',
      'method=GET; input=""',
      'while [[ $# -gt 0 ]]; do case "$1" in --method) method="$2"; shift 2 ;; --input) input="$2"; shift 2 ;; *) path="$1"; shift ;; esac; done',
      'case "$method $path" in',
      '  "GET repos/"*"/rulesets?per_page=100") jq "[.[] | {id, name}]" "$state" ;;',
      '  "GET repos/"*"/rulesets/"*) id="${path##*/}"; jq -e --argjson i "$id" ".[] | select(.id == \\$i)" "$state" || { echo "HTTP 404: Not Found" >&2; exit 1; } ;;',
      '  "PUT repos/"*"/rulesets/"*|"POST repos/"*"/rulesets")',
      '    [[ -n "${FAKE_GH_WRITE_IGNORED:-}" ]] && { echo "{}"; exit 0; }',
      '    id="${path##*/}"; [[ "$method" == POST ]] && id=777',
      '    jq --argjson i "$id" --slurpfile body "$input" "[.[] | select(.id != \\$i)] + [\\$body[0] + {id: \\$i, node_id: \\"RRS_new\\"}]" "$state" > "$state.new" && mv "$state.new" "$state"',
      '    echo "{}" ;;',
      '  *) echo "unexpected gh call: $method $path" >&2; exit 64 ;;',
      'esac',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

function run(args: string[], rulesets: unknown[], extra: Record<string, string> = {}) {
  writeFileSync(stateFile(), JSON.stringify(rulesets));
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      GITHUB_RULESET_GH_BIN: ghStub(),
      GITHUB_RULESET_ORIGIN_URL: `git@github.com:${REPO}.git`,
      TMPDIR: dir,
      ...extra,
    },
    ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const calls = () => (existsSync(callLog()) ? readFileSync(callLog(), 'utf-8') : '');
const writesMade = () => calls().split('\n').filter((l) => /--method (PUT|POST)/.test(l));
const stored = () => JSON.parse(readFileSync(stateFile(), 'utf-8')) as Array<Record<string, unknown>>;

beforeEach(() => {
  caseNo += 1;
  dir = join(scratch, `case-${caseNo}`);
  mkdirSync(dir, { recursive: true });
});

describe('github-ruleset.sh: arguments', () => {
  it('needs exactly one mode, and takes --yes only with --apply', () => {
    // Defect caught: a run that guesses whether to write, or a --yes that seems
    // to mean something on a read.
    expect(run([], [MATCHING]).status).toBe(2);
    expect(run(['--verify', '--apply'], [MATCHING]).status).toBe(2);
    expect(run(['--verify', '--yes'], [MATCHING]).status).toBe(2);
    expect(calls()).toBe('');
    expect(run(['--verify'], [MATCHING]).status).toBe(0);
  });

  it('names the repository from the origin remote in either URL form, and refuses one that is not GitHub', () => {
    // Defect caught: a ruleset written to the wrong repository, or a remote
    // that names none read as some default.
    for (const url of [
      `https://github.com/${REPO}.git`, `https://github.com/${REPO}`, `git@github.com:${REPO}.git`, `ssh://git@github.com/${REPO}.git`,
    ]) {
      rmSync(callLog(), { force: true });
      const r = run(['--verify'], [MATCHING], { GITHUB_RULESET_ORIGIN_URL: url });
      expect(r.status, url).toBe(0);
      expect(calls(), url).toContain(`repos/${REPO}/rulesets`);
    }
    const bad = run(['--verify'], [MATCHING], { GITHUB_RULESET_ORIGIN_URL: 'git@gitlab.com:someone/thing.git' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/not a GitHub repository/);
  });

  it('never prints a credential carried in the origin URL, whether or not the URL is GitHub', () => {
    // Defect caught: a token stored in the remote as user:token@ printed into
    // the terminal, a log or an agent transcript by a message that echoes the
    // remote.
    const token = 'not-a-real-token-value';
    const good = run(['--verify'], [MATCHING], { GITHUB_RULESET_ORIGIN_URL: `https://x-access-token:${token}@github.com/${REPO}.git` });
    expect(good.status, good.stderr).toBe(0);
    expect(calls()).toContain(`repos/${REPO}/rulesets`);
    const bad = run(['--verify'], [MATCHING], { GITHUB_RULESET_ORIGIN_URL: `https://someone:${token}@gitlab.com/someone/thing.git` });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/not a GitHub repository/);
    for (const r of [good, bad]) expect(`${r.stdout}${r.stderr}`).not.toContain(token);
  });
});

describe('github-ruleset.sh: --verify', () => {
  it("ignores GitHub's bookkeeping and rule order, and reports every real difference", () => {
    // Defect caught: a comparison that fails on ids and timestamps, so a healthy
    // ruleset always reads as drift; or one that misses a ruleset switched off,
    // a rule added or a bypass entry granted.
    expect(run(['--verify'], [MATCHING]).status).toBe(0);
    const drift = run(['--verify'], [LIVE_CAPTURE]);
    expect(drift.status).toBe(1);
    expect(drift.stdout).toMatch(/^[-+].*"enforcement"/m);
    expect(drift.stdout).toMatch(/^\+.*required_status_checks/m);
    expect(drift.stdout).toMatch(/^\+.*"actor_type": "RepositoryRole"/m);
    expect(drift.stdout).not.toMatch(/updated_at|node_id/);
    expect(writesMade()).toEqual([]);
  });

  it('reports a main that does not yet require a pull request as a difference, writing nothing', () => {
    // Defect caught: the pre-launch ruleset, which blocks only deletion and
    // force pushes, read as matching the go-live target, so main stays open to
    // direct pushes after launch with --verify reporting it healthy.
    const preLaunch = { ...MATCHING, rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }] };
    const r = run(['--verify'], [preLaunch]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^-.*"type": "pull_request"/m);
    expect(r.stderr).toMatch(/expected until go-live/);
    expect(writesMade()).toEqual([]);
  });

  it('reports a missing ruleset, and refuses two of the same name', () => {
    // Defect caught: no ruleset read as a match, or one of two duplicates
    // compared while the other goes on doing something else.
    const missing = run(['--verify'], [{ id: 1, name: 'something-else', rules: [] }]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/no ruleset named protect-main/);
    const twice = run(['--verify'], [MATCHING, { ...MATCHING, id: 2 }]);
    expect(twice.status).toBe(1);
    expect(twice.stderr).toMatch(/more than one ruleset named protect-main/);
  });
});

describe('github-ruleset.sh: --apply', () => {
  it('replaces the drifted ruleset with the committed copy, by its id, and proves it by reading back', () => {
    // Defect caught: a write to another ruleset, a write of something other
    // than the committed copy, or success claimed on GitHub's acceptance alone.
    const r = run(['--apply', '--yes'], [LIVE_CAPTURE, { id: 5, name: 'other' }]);
    expect(r.status, r.stderr).toBe(0);
    expect(writesMade()).toEqual([
      `api --method PUT repos/${REPO}/rulesets/14395608 --input ${join(process.cwd(), 'scripts/github-ruleset-protect-main.json')}`,
    ]);
    const after = stored().find((s) => s.id === 14395608);
    expect(after?.enforcement).toBe('active');
    expect(stored().find((s) => s.id === 5)).toEqual({ id: 5, name: 'other' });
  });

  it('creates the ruleset when there is none', () => {
    // Defect caught: an apply that can only update, leaving a deleted ruleset
    // deleted.
    const r = run(['--apply', '--yes'], []);
    expect(r.status, r.stderr).toBe(0);
    expect(writesMade()).toHaveLength(1);
    expect(writesMade()[0]).toMatch(new RegExp(`--method POST repos/${REPO}/rulesets --input`));
  });

  it('writes nothing when the live ruleset already matches', () => {
    // Defect caught: a re-run that rewrites a healthy setting every time.
    const r = run(['--apply', '--yes'], [MATCHING]);
    expect(r.status).toBe(0);
    expect(writesMade()).toEqual([]);
  });

  it('fails when GitHub accepts the write but the ruleset still differs', () => {
    // Defect caught: success judged by the API's status, which a write GitHub
    // narrowed or ignored also returns.
    const r = run(['--apply', '--yes'], [LIVE_CAPTURE], { FAKE_GH_WRITE_IGNORED: '1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/still differs/);
  });

  it('writes nothing without a confirmation, and refuses with no terminal and no --yes', () => {
    // Defect caught: a repository setting changed on nobody's word.
    const r = run(['--apply'], [LIVE_CAPTURE]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no terminal to confirm on/);
    expect(writesMade()).toEqual([]);
  });
});
