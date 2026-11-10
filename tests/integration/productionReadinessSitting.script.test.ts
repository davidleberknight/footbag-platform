/**
 * scripts/production-readiness-sitting.sh: the first readiness pass for one
 * environment, run as one command that calls each step's own script in order,
 * asks the checks only a person can make, and records every step in the
 * cutover log.
 *
 * What carries the risk: a step run out of order or twice; a run that carries
 * on past a failure, a declined check or a blocked step; the host password
 * reaching a step that does not take it, or any argv; a log row that says a
 * step happened when it did not, or a log a run corrupts; a resume that redoes
 * a one-time act; and a derived value (the backup to restore, the time a drill
 * started) taken from the wrong place.
 *
 * Every child is a stand-in that records its arguments, whether its stdin was
 * a terminal and the first line it was given, and answers from a rule table.
 * Full runs go through `script` so the questions are asked at a real terminal
 * and answered from the test. Nothing reaches AWS or a host.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const REPO_ROOT = process.cwd();
const SCRIPT = join(REPO_ROOT, 'scripts/production-readiness-sitting.sh');
const PASSWORD = 'fixture-sudo-password';
const LOG_HEAD = '# Cutover log\n\n## 8. The 14-day close-watch\n\nNothing yet.\n';

let dir: string;
let root: string;
let logReal: string;
let stubLog: string;
let rulesFile: string;

/**
 * One rule per line, first match wins: a glob over "<path> <args>", the exit
 * codes to answer with on successive calls (the last repeating), stdout (with
 * per-call variants split on "~", the last repeating), a warning and a fact for
 * the child's closing report.
 */
interface Rule { match: string; codes?: number[]; stdout?: string; warn?: string; fact?: string }
const DEFAULT_RULES: Rule[] = [
  { match: 'scripts/admin-bootstrap-token.sh * status*', stdout: 'ABSENT: /footbag/x/admin_bootstrap_token does not exist.' },
  { match: 'scripts/host-diagnostics.sh * table-digests', stdout: 'DIGEST members rows=3 sha256=' + 'a'.repeat(64) },
  { match: 'scripts/deploy-migrate.sh *', fact: 'migration-applied' },
];

const STUB = `#!/usr/bin/env bash
rel="\${0#"$SITTING_ROOT"/}"
call="$rel $*"
tty=0; [ -t 0 ] && tty=1
line=""
if [ "$tty" = 0 ]; then IFS= read -r line || line=""; fi
printf '%s\\t%s\\t%s\\n' "$call" "$tty" "$line" >> "$STUB_LOG"
code=0; out=""; warn=""; fact=""; n=0
while IFS='|' read -r pat codes o w f; do
  n=$((n + 1))
  [[ "$call" == $pat ]] || continue
  idx="$(cat "$STUB_STATE/$n" 2>/dev/null || echo 0)"
  IFS=, read -r -a cs <<<"$codes"
  code="\${cs[$idx]:-\${cs[-1]}}"
  echo $((idx + 1)) > "$STUB_STATE/$n"
  IFS='~' read -r -a os <<<"$o"
  out=""; if (( \${#os[@]} )); then out="\${os[$idx]:-\${os[-1]}}"; fi
  warn="$w"; fact="$f"
  break
done < "$STUB_RULES"
[ -n "$out" ] && printf '%b\\n' "$out"
if [ -n "$warn$fact" ]; then
  source "$REPORT_LIB"
  [ -n "$warn" ] && cr_warn "$warn"
  [ -n "$fact" ] && cr_fact "$fact"
  [ "$code" = 0 ] && cr_finish
fi
exit "$code"
`;

function writeRules(rules: Rule[]): void {
  // New rules start counting their calls afresh.
  rmSync(join(dir, 'state'), { recursive: true, force: true });
  mkdirSync(join(dir, 'state'));
  const lines = [...rules, ...DEFAULT_RULES, { match: '*' }].map((r) =>
    // "|", not a tab: read collapses runs of tabs, which would shift empty fields.
    [r.match, (r.codes ?? [0]).join(','), r.stdout ?? '', r.warn ?? '', r.fact ?? ''].join('|'));
  writeFileSync(rulesFile, lines.join('\n') + '\n');
}

/** Every child path the dry run lists, each a stand-in in the stub tree. */
function stageTree(): void {
  for (const target of ['staging', 'production']) {
    const r = spawnSync('bash', [SCRIPT, '--target', target, '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD });
    expect(r.status, r.stderr).toBe(0);
    for (const m of r.stdout.matchAll(/(?:^|\] |\s)((?:scripts|legacy_data)\/\S+\.sh|deploy_to_aws\.sh)/gm)) {
      const path = join(root, m[1]);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, STUB);
      chmodSync(path, 0o755);
    }
  }
  writeFileSync(join(root, 'npm'), STUB);
  chmodSync(join(root, 'npm'), 0o755);
  // Read by the run itself, not listed as a step: the alarm-mail status.
  const status = join(root, 'scripts', 'reconfirm-alarm-subscriptions.sh');
  writeFileSync(status, STUB);
  chmodSync(status, 0o755);
}

/** The aws stand-in: the routine backups, one modified `offsetSecs` from now. */
function awsStub(offsetSecs: number): string {
  const path = join(dir, `aws-s3-${offsetSecs}`);
  writeFileSync(path, [
    '#!/usr/bin/env bash',
    `echo "aws $*" >> ${JSON.stringify(stubLog)}`,
    'old="$(date -u -d "-3 days" +%Y-%m-%dT%H:%M:%S+00:00)"',
    `new="$(date -u -d "${offsetSecs >= 0 ? '+' : ''}${offsetSecs} seconds" +%Y-%m-%dT%H:%M:%S+00:00)"`,
    'printf "%s\\troutine/2026/11/07/footbag-20261107T000000Z.db.gz\\n" "$old"',
    'printf "%s\\troutine/2026/11/10/footbag-20261110T120000Z.db.gz\\n" "$new"',
    'printf "%s\\troutine/2026/11/10/not-a-backup.txt\\n" "$new"',
  ].join('\n') + '\n');
  chmodSync(path, 0o755);
  return path;
}

/** Makes the deploy-migrate stand-in keep each migration it is given; returns a reader of them, in call order. */
function keepMigrations(): () => string[] {
  const kept = join(dir, 'migrations');
  mkdirSync(kept, { recursive: true });
  const stub = join(root, 'scripts', 'deploy-migrate.sh');
  writeFileSync(stub, `#!/usr/bin/env bash\ncp "$4" ${JSON.stringify(kept)}/"$(ls ${JSON.stringify(kept)} | wc -l)"\n${readFileSync(stub, 'utf-8').replace(/^#!.*\n/, '')}`);
  return () => readdirSync(kept).sort((a, b) => Number(a) - Number(b)).map((f) => readFileSync(join(kept, f), 'utf-8'));
}

/** The tables left after running `sql` on a database holding `tables`. */
async function tablesAfter(tables: string[], sql: string): Promise<string[]> {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(':memory:');
  for (const t of tables) db.exec(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY)`);
  db.exec(sql);
  const left = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
  db.close();
  return left.map((r) => r.name);
}

beforeEach(() => {
  dir = createScratchDir('readiness-sitting');
  root = join(dir, 'root');
  stubLog = join(dir, 'calls.tsv');
  rulesFile = join(dir, 'rules.tsv');
  mkdirSync(join(root, 'footbag_private_repo', 'cutover'), { recursive: true });
  logReal = join(dir, 'real-cutover-log.md');
  writeFileSync(logReal, LOG_HEAD);
  symlinkSync(logReal, join(root, 'footbag_private_repo', 'cutover', 'CUTOVER_LOG.md'));
  // The private checkout is a git repository, whose uncommitted files the run lists at its end.
  spawnSync('git', ['init', '-q', join(root, 'footbag_private_repo')], SPAWN_GUARD);
  // The alias tells the credential rule which account the host password is for.
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'ssh'), '#!/usr/bin/env bash\nprintf "hostname 192.0.2.10\\nuser footbag\\n"\n');
  chmodSync(join(dir, 'bin', 'ssh'), 0o755);
  mkdirSync(join(dir, 'home', 'AWS'), { recursive: true });
  for (const f of ['AWS_OPERATOR.txt', 'AWS_OPERATOR_PRODUCTION.txt']) {
    writeFileSync(join(dir, 'home', 'AWS', f), `${PASSWORD}\n`, { mode: 0o600 });
  }
  writeRules([]);
  stageTree();
});
afterEach(() => removeScratch(dir));

function env(extra: Record<string, string> = {}, arn?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...awsIdentityStubEnv(dir, arn ? { arn } : {}),
    PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
    HOME: join(dir, 'home'),
    SITTING_ROOT: root,
    SITTING_NPM_BIN: join(root, 'npm'),
    SITTING_AWS_BIN: awsStub(120),
    SITTING_POLL_SECS: '0',
    STUB_LOG: stubLog,
    STUB_RULES: rulesFile,
    STUB_STATE: join(dir, 'state'),
    REPORT_LIB: join(REPO_ROOT, 'scripts/lib/closing-report.sh'),
    ...extra,
  };
}

/** At a terminal, the credential on stdin unless `stdin` says otherwise, answering each question in turn. */
function sit(args: string[], answers: string[] = [], o: { stdin?: string; env?: Record<string, string>; arn?: string; wrap?: string } = {}) {
  const target = args[args.indexOf('--target') + 1];
  const cred = join(dir, 'home', 'AWS', target === 'production' ? 'AWS_OPERATOR_PRODUCTION.txt' : 'AWS_OPERATOR.txt');
  const redirect = o.stdin ?? `< ${JSON.stringify(cred)}`;
  const inner = `${o.wrap ?? ''} bash ${JSON.stringify(SCRIPT)} ${args.join(' ')} ${redirect}; echo "EXIT=$?"`;
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: answers.map((a) => `${a}\n`).join(''),
    env: { ...process.env, ...env(o.env, o.arn) },
    ...SPAWN_GUARD,
  });
  const out = r.stdout ?? '';
  const m = out.match(/EXIT=(\d+)/);
  return { status: m ? Number(m[1]) : -1, out };
}

interface Call { call: string; tty: boolean; line: string }
function calls(): Call[] {
  if (!existsSync(stubLog)) return [];
  return readFileSync(stubLog, 'utf-8').split('\n').filter(Boolean).filter((l) => !l.startsWith('aws ')).map((l) => {
    const [call, tty, line] = l.split('\t');
    return { call, tty: tty === '1', line: line ?? '' };
  });
}
const firstCall = (re: RegExp) => calls().findIndex((c) => re.test(c.call));
/** The steps' own calls, without the once-per-run alarm-mail status read. */
const stepCalls = () => calls().filter((c) => !/^scripts\/reconfirm-alarm-subscriptions\.sh --target \S+ --status$/.test(c.call));
const log = () => readFileSync(logReal, 'utf-8');
const rows = () => log().split('\n').filter((l) => /^\| \d{4}-/.test(l)).map((l) => l.split(' | ').map((c) => c.replace(/^\| | \|$/g, '')));
const YES = (n: number) => Array.from({ length: n }, () => 'yes');

describe('the dry run', () => {
  // Defect caught: a listing that runs, reads the credential, or writes a row,
  // so a look at the plan does part of it.
  it('lists the steps and runs, reads and writes nothing', () => {
    const r = spawnSync('bash', [SCRIPT, '--target', 'production', '--dry-run'], {
      encoding: 'utf-8', input: `${PASSWORD}\n`, env: { ...process.env, ...env() }, ...SPAWN_GUARD,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/p09 +once +\[password on stdin\] scripts\/restore-db\.sh --target production --snapshot \{SNAPSHOT>p04a\}/);
    expect(r.stdout).not.toContain(PASSWORD);
    expect(calls()).toEqual([]);
    expect(log()).toBe(LOG_HEAD);
  });
});

describe('a full staging run', () => {
  // Defect caught: steps run out of the order their dependencies need, run
  // twice, or a step skipped silently.
  it('runs every step once, in order, and stops at the blocked step', () => {
    const r = sit(['--target', 'staging'], YES(7));
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/VERDICT: BLOCKED AT s99/);
    const ids = rows().map((c) => c[3]);
    const dryIds = [...spawnSync('bash', [SCRIPT, '--target', 'staging', '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD })
      .stdout.matchAll(/^ {2}(s\d+[a-z]?) /gm)].map((m) => m[1]);
    expect(ids).toEqual(dryIds);
    expect(new Set(ids).size).toBe(ids.length);
    const blocked = rows().find((c) => c[3] === 's99')!;
    expect(blocked[5]).toBe('blocked');
    // The orders a person would otherwise have to hold in their head.
    const digest = (n: number) => calls().map((c, i) => [c, i] as const).filter(([c]) => /table-digests/.test(c.call))[n][1];
    expect(digest(0)).toBeLessThan(firstCall(/deploy-migrate\.sh/));
    expect(firstCall(/deploy-migrate\.sh/)).toBeLessThan(digest(1));
    const deployAfterRotation = calls().findIndex((c, i) => i > firstCall(/rotate-jwt-signing-key/) && /^scripts\/deploy-migrate\.sh/.test(c.call));
    expect(firstCall(/provision-ssm-secret\.sh .*store/)).toBeLessThan(deployAfterRotation);
    expect(firstCall(/--state dark/)).toBeLessThan(firstCall(/--state armed/));
    // Staging always has administrators, and the first-admin claim grants only
    // while none exists, so staging provisions no claim token it could never
    // use, and removes any one left there, proving it gone.
    expect(firstCall(/admin-bootstrap-token\.sh .*provision/)).toBe(-1);
    expect(firstCall(/admin-bootstrap-token\.sh --target staging cleanup/)).toBeGreaterThan(-1);
    expect(firstCall(/admin-bootstrap-token\.sh --target staging cleanup/)).toBeLessThan(firstCall(/admin-bootstrap-token\.sh --target staging status/));
  });

  // Defect caught: the password reaching a step that reads its stdin as an
  // answer or a link, or missing from one that needs it, or put in argv.
  it('gives the password on stdin to exactly the steps that take it', () => {
    sit(['--target', 'staging'], YES(7));
    const takesIt = /^scripts\/(bootstrap-host|deploy-migrate|restore-db|rotate-jwt-signing-key|incident-drill)\.sh /;
    expect(calls().length).toBeGreaterThan(10);
    // The drill stops and restarts the host, so it needs the password; a table
    // that dropped it, or ran it as an ask, would leave the drill unwalked.
    expect(calls().some((c) => /^scripts\/incident-drill\.sh --target staging$/.test(c.call) && c.line === PASSWORD)).toBe(true);
    for (const c of calls()) {
      expect(c.call, c.call).not.toContain(PASSWORD);
      if (takesIt.test(c.call)) {
        expect(c.line, c.call).toBe(PASSWORD);
      } else {
        expect(c.tty, c.call).toBe(true);
      }
    }
  });
});

describe('stopping', () => {
  // Defect caught: a run that carries on after a step failed, or stops without
  // saying what did not run and how to resume.
  it('stops at the first failed step, names what did not run and how to resume', () => {
    writeRules([{ match: 'scripts/send-test-alarm.sh *', codes: [1] }]);
    const r = sit(['--target', 'staging'], YES(7));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT s04a/);
    expect(r.out).toMatch(/--from-step s04a/);
    expect(r.out).toMatch(/not run: s04b s04c s04d s05a/);
    expect(firstCall(/table-digests|deploy-migrate/)).toBe(-1);
    expect(rows().at(-1)!.slice(3, 6)).toEqual(['s04a', expect.any(String), 'failed (exit 1)']);
  });

  // Defect caught: a hurried "y" or a bare Enter taken as yes.
  it.each([['y'], ['']])('treats %j as a decline and stops there', (answer) => {
    const r = sit(['--target', 'staging', '--from-step', 's04b'], [answer, 'yes']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT s04b/);
    expect(rows().at(-1)![5]).toBe('declined');
    expect(stepCalls()).toEqual([]);
  });

  // Defect caught: resuming at the blocked step reads as done.
  it('stays blocked when resumed at the blocked step', () => {
    const r = sit(['--target', 'staging', '--from-step', 's99']);
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/VERDICT: BLOCKED AT s99/);
  });
});

describe('refusals', () => {
  it('refuses no target, a target it does not know, and a step not on the list', () => {
    for (const args of [[], ['--target', 'prod'], ['--target', 'staging', '--from-step', 's42']]) {
      const r = spawnSync('bash', [SCRIPT, ...args, '--dry-run'], { encoding: 'utf-8', env: { ...process.env, ...env() }, ...SPAWN_GUARD });
      expect(r.status, args.join(' ')).toBe(2);
    }
    expect(calls()).toEqual([]);
  });

  // Defect caught: a run started without the redirect hanging on, or taking an
  // answer typed at the terminal as the password.
  it('refuses a terminal on stdin, naming the credential file', () => {
    const r = sit(['--target', 'staging'], [], { stdin: '' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/< ~\/AWS\/AWS_OPERATOR\.txt bash scripts\/production-readiness-sitting\.sh --target staging/);
    expect(calls()).toEqual([]);
    expect(log()).toBe(LOG_HEAD);
  });

  // Defect caught: an unattended run, with nobody to answer, carrying on.
  it('refuses with no terminal to ask on', () => {
    const r = spawnSync('bash', [SCRIPT, '--target', 'staging'], {
      encoding: 'utf-8', input: `${PASSWORD}\n`, env: { ...process.env, ...env() }, ...SPAWN_GUARD,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no terminal to ask on/);
    expect(calls()).toEqual([]);
  });

  // Defect caught: the pass run as the dev-and-tester job role.
  it('refuses any identity but the footbag-operator IAM user', () => {
    const r = sit(['--target', 'staging'], [], { arn: 'arn:aws:sts::000000000000:assumed-role/FootbagDevTester/session' });
    expect(r.status).toBe(1);
    expect(calls()).toEqual([]);
    expect(log()).toBe(LOG_HEAD);
  });
});

describe('--status', () => {
  // Defect caught: a status read that applies or acts, writes a row, or reads a
  // log row as proof the work is done.
  it('runs only proof commands, writes nothing, and says which states come from the log only', () => {
    // Before any run, not even the section heading is written.
    expect(sit(['--target', 'staging', '--to-step', 's01c', '--status']).status).toBe(3);
    expect(log()).toBe(LOG_HEAD);
    sit(['--target', 'staging', '--to-step', 's01c']);
    const before = log();
    const callsBefore = calls().length;
    const r = sit(['--target', 'staging', '--to-step', 's04b', '--status']);
    expect(r.status).toBe(3);
    expect(log()).toBe(before);
    const ran = calls().slice(callsBefore).map((c) => c.call);
    expect(ran.length).toBeGreaterThan(0);
    for (const c of ran) expect(c).toMatch(/--status$/);
    expect(r.out).toMatch(/s01a +RECORDED ok at \S+ \(log only\)/);
    expect(r.out).toMatch(/s01b +RE-RUN PROVES; recorded ok/);
    expect(r.out).toMatch(/s02 +DONE \(proved by scripts\/bootstrap-host\.sh --target staging --status\)/);
    expect(r.out).toMatch(/s04a +NOT RUN/);
  });
});

describe('resuming', () => {
  // Defect caught: a resume that rewrites earlier rows, or runs steps before
  // the one it was told to start from.
  it('runs from --from-step on and keeps earlier log content', () => {
    sit(['--target', 'staging', '--to-step', 's01c']);
    const before = log();
    const callsBefore = calls().length;
    const r = sit(['--target', 'staging', '--from-step', 's04a', '--to-step', 's04a']);
    expect(r.status, r.out).toBe(0);
    expect(log().startsWith(before)).toBe(true);
    // Only the step resumed from was run and recorded.
    expect(rows().map((c) => c[3])).toEqual(['s01a', 's01b', 's01c', 's04a']);
    expect(calls().slice(callsBefore).map((c) => c.call.split(' ')[0])).not.toContain('scripts/apply-account-baseline.sh');
  });
});

describe('the cutover log', () => {
  // Defect caught: the section written twice, rows landing under another
  // section, or the symlink into the private checkout replaced by a file.
  it('creates the section once, appends under it, and keeps the symlink', () => {
    sit(['--target', 'staging', '--to-step', 's01a']);
    sit(['--target', 'staging', '--from-step', 's01b', '--to-step', 's01b']);
    expect(log().match(/^## 9\. Production-readiness sitting$/gm)).toHaveLength(1);
    expect(rows().map((c) => c[3])).toEqual(['s01a', 's01b']);
    expect(lstatSync(join(root, 'footbag_private_repo', 'cutover', 'CUTOVER_LOG.md')).isSymbolicLink()).toBe(true);
  });

  it('refuses when its section is not the last one, writing nothing', () => {
    sit(['--target', 'staging', '--to-step', 's01a']);
    writeFileSync(logReal, log() + '\n## 10. Something later\n');
    const before = log();
    const r = sit(['--target', 'staging', '--from-step', 's01b', '--to-step', 's01b']);
    expect(r.status).toBe(1);
    expect(log()).toBe(before);
  });

  it('refuses a missing log', () => {
    writeFileSync(logReal, '');
    spawnSync('rm', ['-f', logReal], SPAWN_GUARD);
    const r = sit(['--target', 'staging', '--to-step', 's01a']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/private operations checkout is missing/);
  });

  // Defect caught: a child's warning shown in the stream and then lost.
  it('carries a child warning into its own closing report', () => {
    writeRules([{ match: 'scripts/apply-account-baseline.sh *--dry-run', warn: 'stand-in baseline drift warning' }]);
    const r = sit(['--target', 'staging', '--to-step', 's01a']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/Warnings \(1\):\s+- apply-account-baseline\.sh: stand-in baseline drift warning/);
  });
});

describe('derived values', () => {
  // Defect caught: the restore taking a backup made before the deploy it is
  // meant to follow, or any key the listing happens to hold.
  it('restores the newest routine backup made after the production deploy', () => {
    sit(['--target', 'production', '--from-step', 'p04a', '--to-step', 'p04a']);
    sit(['--target', 'production', '--from-step', 'p09', '--to-step', 'p09']);
    const restore = calls().find((c) => /restore-db\.sh .*--snapshot/.test(c.call))!;
    expect(restore.call).toBe('scripts/restore-db.sh --target production --snapshot routine/2026/11/10/footbag-20261110T120000Z.db.gz');
  });

  // Defect caught: the backup search reading a bucket that does not exist in
  // one environment, so the restore drill stops before it starts. The two
  // environments' snapshot buckets are not named alike: staging's has no db-.
  it('searches each environment\'s own snapshot bucket', () => {
    const bucketsListed = () => readFileSync(stubLog, 'utf-8').split('\n')
      .filter((l) => l.startsWith('aws s3api list-objects-v2 '))
      .map((l) => l.match(/--bucket (\S+)/)?.[1]);
    sit(['--target', 'staging', '--from-step', 's06', '--to-step', 's06']);
    expect(bucketsListed()).toEqual(['footbag-staging-snapshots']);
    writeFileSync(stubLog, '');
    sit(['--target', 'production', '--from-step', 'p04a', '--to-step', 'p04a']);
    sit(['--target', 'production', '--from-step', 'p09', '--to-step', 'p09']);
    expect(bucketsListed()).toEqual(['footbag-production-db-snapshots']);
  });

  it('stops the restore when no backup is newer than the deploy', () => {
    sit(['--target', 'production', '--from-step', 'p04a', '--to-step', 'p04a']);
    const r = sit(['--target', 'production', '--from-step', 'p09', '--to-step', 'p09'], [], { env: { SITTING_AWS_BIN: awsStub(-600) } });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/wait for the next routine backup/);
    expect(firstCall(/restore-db\.sh/)).toBe(-1);
  });

  // Defect caught: the mint listing given a time other than the drill's own
  // start, so it attributes the wrong firings.
  it('lists mints since the drill step started', () => {
    sit(['--target', 'production', '--from-step', 'p11a', '--to-step', 'p11b']);
    const drill = rows().find((c) => c[3] === 'p11a')!;
    const listing = calls().find((c) => /list-host-access-mints/.test(c.call))!;
    expect(drill[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(listing.call).toBe(`scripts/list-host-access-mints.sh --since ${drill[0]}`);
  });

  // The same on a resume, from the drill's recorded row, whose start and
  // finish differ: the listing must begin at the start, or it misses the
  // drill's own mint.
  it('lists mints since the recorded drill start when resumed after the drill', () => {
    writeFileSync(logReal, LOG_HEAD + [
      '', '## 9. Production-readiness sitting', '', 'One row per step.', '',
      '| Started (UTC) | Finished (UTC) | Target | Step | Command | Result | Notes |', '|---|---|---|---|---|---|---|',
      '| 2026-11-10T10:00:00Z | 2026-11-10T10:05:00Z | production | p11a | scripts/host-break-glass.sh --drill --target staging | ok |  |',
      '',
    ].join('\n'));
    sit(['--target', 'production', '--from-step', 'p11b', '--to-step', 'p11b']);
    expect(stepCalls().map((c) => c.call)).toEqual(['scripts/list-host-access-mints.sh --since 2026-11-10T10:00:00Z']);
  });

  // Defect caught: a durability rehearsal whose migration the host skipped
  // recorded as passed.
  it('fails the migration step when the deploy records no applied migration', () => {
    writeRules([{ match: 'scripts/deploy-migrate.sh *', fact: 'migration-skipped' }]);
    const r = sit(['--target', 'staging', '--from-step', 's05c', '--to-step', 's05c']);
    expect(r.status).toBe(1);
    expect(rows().at(-1)![5]).toMatch(/^failed/);
    const migrate = calls().find((c) => /deploy-migrate/.test(c.call))!;
    expect(migrate.call).toMatch(/--migration \S+\/sitting_durability_\d{14}\.sql$/);
  });

  // Defect caught: the durability probe leaving its table behind, so every later
  // code-only deploy finds the deployed schema differing from schema.sql and
  // refuses. The probe must still be a real migration the host records.
  it('generates a probe migration that runs and leaves the schema as it was', async () => {
    const kept = keepMigrations();
    const r = sit(['--target', 'staging', '--from-step', 's05c', '--to-step', 's05c']);
    expect(r.status, r.out).toBe(0);
    const [sql] = kept();
    expect(sql).toMatch(/CREATE TABLE sitting_durability_\d{14}/);
    expect(await tablesAfter([], sql)).toEqual([]);
  });

  // Defect caught: a probe table left on staging, or brought back by the
  // restore, surviving into the deploy after the secret rotation, which then
  // refuses on schema drift. That deploy is a
  // migration deploy that removes the probe table s05c's run created, read
  // from this run or, on a resume, from s05c's recorded row.
  it('removes the probe table of the recorded durability run in the deploy after the rotation', async () => {
    writeFileSync(logReal, LOG_HEAD + [
      '', '## 9. Production-readiness sitting', '', 'One row per step.', '',
      '| Started (UTC) | Finished (UTC) | Target | Step | Command | Result | Notes |', '|---|---|---|---|---|---|---|',
      '| 2026-11-10T07:04:16Z | 2026-11-10T07:10:19Z | staging | s05c | scripts/deploy-migrate.sh --target staging --migration /tmp/tmp.x/sitting_durability_20261110070416.sql | ok |  |',
      '',
    ].join('\n'));
    const kept = keepMigrations();
    const r = sit(['--target', 'staging', '--from-step', 's07d', '--to-step', 's07d']);
    expect(r.status, r.out).toBe(0);
    const deploy = stepCalls().find((c) => /deploy-migrate/.test(c.call))!;
    expect(deploy.call).toMatch(/--migration \S+\/sitting_durability_cleanup_20261110070416\.sql$/);
    expect(deploy.line).toBe(PASSWORD);
    const [sql] = kept();
    expect(await tablesAfter(['sitting_durability_20261110070416', 'members'], sql)).toEqual(['members']);
  });

  it('removes the probe table of the durability run in the same run', async () => {
    const kept = keepMigrations();
    const r = sit(['--target', 'staging', '--from-step', 's05b', '--to-step', 's07d'], YES(3));
    expect(r.status, r.out).toBe(0);
    const [probe, cleanup] = kept();
    const stamp = probe.match(/sitting_durability_(\d{14})/)![1];
    expect(await tablesAfter([`sitting_durability_${stamp}`], cleanup)).toEqual([]);
  });

  it('stops the deploy after the rotation when no durability run is recorded', () => {
    const r = sit(['--target', 'staging', '--from-step', 's07d', '--to-step', 's07d']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/step s05c has no ok row/);
    expect(firstCall(/deploy-migrate/)).toBe(-1);
  });

  // Defect caught: the preserved tables changing across the migration unnoticed.
  it('passes the digests that match and fails the ones that differ', () => {
    const same = 'DIGEST members rows=3 sha256=' + 'b'.repeat(64);
    writeRules([{ match: 'scripts/host-diagnostics.sh * table-digests', stdout: same }]);
    expect(sit(['--target', 'staging', '--from-step', 's05b', '--to-step', 's05e'], ['yes']).status).toBe(0);

    writeRules([{ match: 'scripts/host-diagnostics.sh * table-digests',
      stdout: `${same}~DIGEST members rows=3 sha256=${'c'.repeat(64)}` }]);
    const r = sit(['--target', 'staging', '--from-step', 's05b', '--to-step', 's05e'], ['yes']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT s05e/);
    expect(rows().at(-1)![6]).toMatch(/the preserved tables changed: > DIGEST members rows=3 sha256=c{64}/);
  });
});

describe('the restore fallback and the archive edge wait', () => {
  // Defect caught: a restore whose erasure replay stopped left half-finished,
  // or a failed replay recorded as a restore that finished.
  it('offers the replay when the restore fails, and records which one finished it', () => {
    writeRules([
      { match: 'scripts/restore-db.sh --target staging --snapshot *', codes: [1] },
      { match: 'scripts/restore-db.sh --target staging --resume-erasure-replay', codes: [0] },
    ]);
    const r = sit(['--target', 'staging', '--from-step', 's06', '--to-step', 's06'], ['yes']);
    expect(r.status, r.out).toBe(0);
    const row = rows().at(-1)!;
    expect(row[5]).toBe('ok');
    expect(row[6]).toMatch(/finished by --resume-erasure-replay/);
  });

  it('keeps the step failed when the replay fails too', () => {
    writeRules([
      { match: 'scripts/restore-db.sh --target staging --snapshot *', codes: [1] },
      { match: 'scripts/restore-db.sh --target staging --resume-erasure-replay', codes: [2] },
    ]);
    const r = sit(['--target', 'staging', '--from-step', 's06', '--to-step', 's06'], ['yes']);
    expect(r.status).toBe(1);
    expect(rows().at(-1)![5]).toMatch(/^failed/);
    expect(r.out).toMatch(/and its fallback exit 2/);
  });

  // Defect caught: a live endpoint missing events left for the operator to
  // repair by hand, or a repaired endpoint recorded as still short.
  it('offers the endpoint repair when the live endpoint check fails, and records it', () => {
    writeRules([
      { match: 'scripts/create-stripe-endpoint.sh --target production --mode live --verify', codes: [1] },
      { match: 'scripts/create-stripe-endpoint.sh --target production --mode live --verify --repair', codes: [0] },
    ]);
    const r = sit(['--target', 'production', '--from-step', 'p19b', '--to-step', 'p19b'], ['yes']);
    expect(r.status, r.out).toBe(0);
    expect(firstCall(/--verify --repair$/)).toBeGreaterThan(firstCall(/--mode live --verify$/));
    const row = rows().at(-1)!;
    expect(row[5]).toBe('ok');
    expect(row[6]).toMatch(/finished by --repair/);
  });

  // Defect caught: the archive stage applied to production before the same
  // stage has proved its already-done path on staging.
  it('proves the archive stage on staging before it runs on production', () => {
    sit(['--target', 'production', '--from-step', 'p14c', '--to-step', 'p15a']);
    const staging = firstCall(/^scripts\/production-cutover\.sh --target staging --stage archive-base$/);
    expect(staging).toBeGreaterThan(-1);
    expect(staging).toBeLessThan(firstCall(/^scripts\/production-cutover\.sh --target production --stage archive-base$/));
  });

  // Defect caught: the edge log check run before the hour its logs need, or
  // never run at all once the hour has passed.
  it('runs the edge check once the hour after the publish has passed, and stops when the publish has no finish', () => {
    const stop = sit(['--target', 'production', '--from-step', 'p15d', '--to-step', 'p15d']);
    expect(stop.status).toBe(1);
    expect(stop.out).toMatch(/step p15c has no finish recorded/);
    expect(firstCall(/verify-archive-edge/)).toBe(-1);

    const finished = new Date(Date.now() - 61 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    writeFileSync(logReal, log() + `| ${finished} | ${finished} | production | p15c | scripts/publish-archive.sh --target production | ok |  |\n`);
    const ran = sit(['--target', 'production', '--from-step', 'p15d', '--to-step', 'p15d']);
    expect(ran.status, ran.out).toBe(0);
    expect(firstCall(/verify-archive-edge\.sh --target production/)).toBeGreaterThan(-1);
  });
});

describe('checks made by a read rather than asked', () => {
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace(/\.\d{3}Z$/, 'Z');

  // Defect caught: the bounce check reads a bounce older than the probe, or runs
  // before the feed has had its minutes, or passes when the feed recorded none.
  it('reads the bounce feed for a bounce newer than the probe, and stops when there is none', () => {
    const started = at(7 * 60_000);
    writeFileSync(logReal, log() + [
      '', '## 9. Production-readiness sitting', '', 'One row per step.', '',
      '| Started (UTC) | Finished (UTC) | Target | Step | Command | Result | Notes |', '|---|---|---|---|---|---|---|',
      `| ${started} | ${at(6 * 60_000)} | production | p08e | scripts/verify-prod-email.sh --profile footbag-operator --bounce-probe | ok |  |`,
      '',
    ].join('\n'));
    const ok = sit(['--target', 'production', '--from-step', 'p08f', '--to-step', 'p08f']);
    expect(ok.status, ok.out).toBe(0);
    expect(calls().map((c) => c.call)).toContain(
      `scripts/host-diagnostics.sh --target production ses-bounces --since ${started}`);
    expect(ok.out).not.toMatch(/\(yes\/no/);

    writeRules([{ match: 'scripts/host-diagnostics.sh * ses-bounces *', codes: [3] }]);
    const none = sit(['--target', 'production', '--from-step', 'p08f', '--to-step', 'p08f']);
    expect(none.status).toBe(1);
    expect(none.out).toMatch(/VERDICT: STOPPED AT p08f/);
  });

  // Defect caught: the first-admin claim taken on the operator's word, or
  // passed while the token is still unspent.
  it('waits for the claim to spend the token instead of asking, and stops while it is present', () => {
    const ok = sit(['--target', 'production', '--from-step', 'p10c', '--to-step', 'p10c']);
    expect(ok.status, ok.out).toBe(0);
    expect(calls().map((c) => c.call)).toContain(
      'scripts/admin-bootstrap-token.sh --target production --profile footbag-operator status --wait-minutes 30');
    expect(ok.out).not.toMatch(/\(yes\/no/);

    writeRules([{ match: 'scripts/admin-bootstrap-token.sh * status *', codes: [3], stdout: 'PRESENT: still there' }]);
    const present = sit(['--target', 'production', '--from-step', 'p10c', '--to-step', 'p10c']);
    expect(present.status).toBe(1);
    expect(present.out).toMatch(/VERDICT: STOPPED AT p10c/);
  });

  // Defect caught: a question asked although a read already proves its answer,
  // or skipped although the read fails.
  it('skips the archive-capture question when the verify passes, and asks it when the verify fails', () => {
    const proved = sit(['--target', 'production', '--from-step', 'p17a', '--to-step', 'p17a']);
    expect(proved.status, proved.out).toBe(0);
    expect(proved.out).not.toMatch(/\(yes\/no/);
    expect(rows().at(-1)!.slice(3, 7)).toEqual(['p17a', 'legacy_data/legacy_mirror/verify_mirror.sh', 'ok', expect.stringMatching(/^not asked: proved by/)]);

    writeRules([{ match: 'legacy_data/legacy_mirror/verify_mirror.sh*', codes: [1, 0] }]);
    const asked = sit(['--target', 'production', '--from-step', 'p17a', '--to-step', 'p17b'], ['yes']);
    expect(asked.status, asked.out).toBe(0);
    expect(asked.out).toMatch(/Has the clean archive capture finished\?.*\(yes\/no/);
    expect(rows().slice(-2).map((c) => [c[3], c[5]])).toEqual([['p17a', 'ok'], ['p17b', 'ok']]);

    writeRules([{ match: 'legacy_data/legacy_mirror/verify_mirror.sh*', codes: [1] }]);
    const declined = sit(['--target', 'production', '--from-step', 'p17a', '--to-step', 'p17b'], ['no']);
    expect(declined.status).toBe(1);
    expect(declined.out).toMatch(/VERDICT: STOPPED AT p17a/);
  });
});

describe('waiting, and an interrupted step', () => {
  // Defect caught: the edge check run inside the hour after the publish, when
  // its logs cannot have arrived; or an interrupt during a step leaving no row,
  // so the log reads as though the step never started.
  it('waits out the hour after a fresh publish, and records the step as interrupted on Ctrl-C', () => {
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    writeFileSync(logReal, LOG_HEAD + [
      '', '## 9. Production-readiness sitting', '', 'One row per step.', '',
      '| Started (UTC) | Finished (UTC) | Target | Step | Command | Result | Notes |', '|---|---|---|---|---|---|---|',
      `| ${now} | ${now} | production | p15c | scripts/publish-archive.sh --target production | ok |  |`,
      '',
    ].join('\n'));
    // The wait is an hour long, so the interrupt always lands inside it. The
    // pause between checks is long too, so it lands in the pause: bash can lose
    // an interrupt that arrives while it is reading the clock, and with no pause
    // the script does little else.
    const r = sit(['--target', 'production', '--from-step', 'p15d', '--to-step', 'p15d'], [], { wrap: 'timeout --preserve-status -s INT 3', env: { SITTING_POLL_SECS: '30' } });
    expect(r.out).toMatch(/p15d runs no sooner than \d{2}:\d{2}:\d{2}Z \(60 minutes after p15c\)/);
    expect(r.status).toBe(130);
    expect(firstCall(/verify-archive-edge/)).toBe(-1);
    const row = rows().at(-1)!;
    expect(row[3]).toBe('p15d');
    expect(row[5]).toBe('interrupted');
  });
});

describe('steps that need alarm mail', () => {
  const PENDING = { match: 'scripts/reconfirm-alarm-subscriptions.sh --target * --status', codes: [3] };

  // Defect caught: the alarm-mail confirmation left outside the pass, so
  // nothing in the run gets it done, or a topic the operator skips stopping
  // the run although alarm mail must not block it.
  it('runs the confirmation walk at a terminal, and carries on deferred when a topic is left pending', () => {
    writeRules([PENDING, { match: 'scripts/confirm-alarm-subscription.sh --target staging', codes: [3] }]);
    const r = sit(['--target', 'staging', '--from-step', 's03', '--to-step', 's04b']);
    expect(r.status, r.out).toBe(0);
    const walk = stepCalls().find((c) => /confirm-alarm-subscription/.test(c.call))!;
    expect(walk.call).toBe('scripts/confirm-alarm-subscription.sh --target staging');
    expect(walk.tty).toBe(true);
    expect(rows().map((c) => [c[3], c[5]])).toEqual([
      ['s03', 'deferred (alarm mail not confirmed)'],
      ['s04a', 'deferred (alarm mail not confirmed)'],
      ['s04b', 'deferred (alarm mail not confirmed)'],
    ]);
  });

  // Defect caught: the subscriptions read before the walk confirmed them, so the
  // test alarm right after the walk is deferred anyway.
  it('runs the mail steps once the walk confirms every subscription', () => {
    // Pending until the walk has run, clean after it.
    writeRules([{ match: 'scripts/reconfirm-alarm-subscriptions.sh --target * --status', codes: [0] }]);
    const r = sit(['--target', 'staging', '--from-step', 's03', '--to-step', 's04b'], ['yes']);
    const walkAt = calls().findIndex((c) => /confirm-alarm-subscription/.test(c.call));
    const readAt = calls().findIndex((c) => /reconfirm-alarm-subscriptions\.sh .*--status/.test(c.call));
    expect(walkAt).toBeLessThan(readAt);
    expect(r.status, r.out).toBe(0);
    expect(rows().map((c) => [c[3], c[5]])).toEqual([['s03', 'ok'], ['s04a', 'ok'], ['s04b', 'ok']]);
  });

  it('stops when the walk fails rather than leaving a topic pending', () => {
    writeRules([{ match: 'scripts/confirm-alarm-subscription.sh --target staging', codes: [1] }]);
    const r = sit(['--target', 'staging', '--from-step', 's03', '--to-step', 's04b']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT s03/);
  });

  it('walks production before its first step that needs mail', () => {
    const r = spawnSync('bash', [SCRIPT, '--target', 'production', '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD });
    const ids = [...r.stdout.matchAll(/^ {2}(p\d+[a-z]?) /gm)].map((m) => m[1]);
    const lines = r.stdout.split('\n');
    const walkAt = ids.findIndex((id) => lines.some((l) => l.startsWith(`  ${id} `) && /confirm-alarm-subscription\.sh --target production/.test(l)));
    expect(walkAt).toBeGreaterThan(-1);
    expect(walkAt).toBeLessThan(ids.indexOf('p11a'));
  });

  // Defect caught: a pass stopped by alarm mail nobody can confirm yet, or a
  // test alarm sent while nothing can receive it.
  it('defers them while the subscriptions are pending, and carries on with the rest', () => {
    writeRules([PENDING]);
    const r = sit(['--target', 'staging', '--from-step', 's04a', '--to-step', 's05a'], ['yes']);
    expect(r.status, r.out).toBe(0);
    expect(rows().map((c) => [c[3], c[5]])).toEqual([
      ['s04a', 'deferred (alarm mail not confirmed)'],
      ['s04b', 'deferred (alarm mail not confirmed)'],
      ['s04c', 'deferred (alarm mail not confirmed)'],
      ['s04d', 'deferred (alarm mail not confirmed)'],
      ['s05a', 'ok'],
    ]);
    expect(firstCall(/send-test-alarm/)).toBe(-1);
    expect(firstCall(/active-alarms/)).toBe(-1);
    expect(r.out).toMatch(/- deferred until alarm mail is confirmed: s04a/);
    // One read of the subscriptions serves the whole run.
    expect(calls().filter((c) => /reconfirm-alarm-subscriptions\.sh .*--status/.test(c.call))).toHaveLength(1);
  });

  // Defect caught: subscriptions confirmed by clicking their emails, which do
  // receive alarm mail, read as not confirmed, so the alarm work never runs.
  it('runs them once the subscriptions read confirmed by a click', () => {
    writeRules([{ match: 'scripts/reconfirm-alarm-subscriptions.sh --target * --status', codes: [4] }]);
    const r = sit(['--target', 'staging', '--from-step', 's04a', '--to-step', 's04b'], ['yes']);
    expect(r.status, r.out).toBe(0);
    expect(rows().map((c) => [c[3], c[5]])).toEqual([['s04a', 'ok'], ['s04b', 'ok']]);
  });

  // Defect caught: the deferral firing on confirmed mail too, so the alarm work
  // never gets done.
  it('runs them once the subscriptions read clean', () => {
    const r = sit(['--target', 'staging', '--from-step', 's04a', '--to-step', 's04b'], ['yes']);
    expect(r.status, r.out).toBe(0);
    expect(rows().map((c) => [c[3], c[5]])).toEqual([['s04a', 'ok'], ['s04b', 'ok']]);
    expect(firstCall(/send-test-alarm\.sh --target staging/)).toBeGreaterThan(-1);
  });

  // Defect caught: a drill or proof that asks whether its alarm email arrived
  // run without mail, so it can only fail; its mint listing deferred with it.
  it('defers the production drills and the audit-alarm proof while mail is pending', () => {
    writeRules([PENDING]);
    const r = sit(['--target', 'production', '--from-step', 'p11a', '--to-step', 'p11b']);
    expect(r.status, r.out).toBe(0);
    expect(rows().map((c) => c[5])).toEqual(['deferred (alarm mail not confirmed)', 'deferred (alarm mail not confirmed)']);
    expect(firstCall(/host-break-glass|list-host-access-mints/)).toBe(-1);
    const audit = sit(['--target', 'production', '--from-step', 'p13k', '--to-step', 'p13k']);
    expect(audit.status).toBe(0);
    expect(firstCall(/prove-audit-alarms/)).toBe(-1);
  });

  // Defect caught: a production test alarm, drill or audit-alarm proof run while
  // nothing can receive its mail, because its row lost the marker; the alarm
  // gates and state reads around them, which need no mail, still run.
  it('defers every production step that sends or awaits alarm mail, across the whole alarm stretch', () => {
    writeRules([PENDING]);
    const r = sit(['--target', 'production', '--from-step', 'p11a', '--to-step', 'p14b'], YES(4));
    expect(r.status, r.out).toBe(0);
    expect(stepCalls().filter((c) => /send-test-alarm\.sh(?!.*--status)|host-break-glass|prove-audit-alarms|list-host-access-mints/.test(c.call))).toEqual([]);
    expect(firstCall(/set-terraform-gate\.sh --target production --gate enable_container_alarms --state on/)).toBeGreaterThan(-1);
    expect(firstCall(/send-test-alarm\.sh .*--status --expect OK/)).toBeGreaterThan(-1);
  });

  // Defect caught: the production data gates run with the local test legs,
  // which boot a local stack that says nothing about production and can be
  // killed by the memory guard, failing the step for a reason unrelated to the
  // data.
  it('runs the production data gates without the local test legs', () => {
    const r = spawnSync('bash', [SCRIPT, '--target', 'production', '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD });
    expect(r.stdout).toMatch(/^ {2}p08c +read +\[password on stdin\] scripts\/pre-cutover-checklist\.sh --target production .*--skip-tests/m);
  });

  // Defect caught: the dry run hiding which steps wait on alarm mail.
  it('marks the steps that need alarm mail in the dry run', () => {
    const r = spawnSync('bash', [SCRIPT, '--target', 'production', '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD });
    expect(r.stdout).toMatch(/^ {2}p13k +once\+mail +scripts\/prove-audit-alarms\.sh$/m);
    expect(r.stdout).toMatch(/^ {2}p13d +idem +scripts\/set-terraform-gate\.sh/m);
  });

  // Defect caught: a step that ran once mail worked shown as deferred again
  // when mail is later pending, so done work reads as outstanding.
  it('keeps a mail step that already ran as recorded in --status, whatever the mail state now', () => {
    sit(['--target', 'staging', '--from-step', 's04a', '--to-step', 's04a']);
    writeRules([PENDING]);
    const r = sit(['--target', 'staging', '--from-step', 's04a', '--to-step', 's04a', '--status']);
    expect(r.out).toMatch(/s04a +RECORDED ok at \S+ \(log only\)/);
  });

  // Defect caught: a deferred step read as done, or forgotten once mail works.
  it('lists a deferred step as pending in --status, and says to run it once mail is confirmed', () => {
    writeRules([PENDING]);
    sit(['--target', 'staging', '--from-step', 's04a', '--to-step', 's04a']);
    const pending = sit(['--target', 'staging', '--from-step', 's04a', '--to-step', 's04a', '--status']);
    expect(pending.status).toBe(3);
    expect(pending.out).toMatch(/s04a +DEFERRED \(alarm mail not confirmed\)/);
    writeRules([]);
    const ready = sit(['--target', 'staging', '--from-step', 's04a', '--to-step', 's04a', '--status']);
    expect(ready.status).toBe(3);
    expect(ready.out).toMatch(/s04a +NOT RUN \(alarm mail is confirmed now: run it with --from-step s04a\)/);
  });
});
