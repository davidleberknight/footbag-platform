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
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';

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
  // The marker line production-live-marker.sh prints before go-live.
  { match: 'scripts/production-live-marker.sh --status*', stdout: 'Marker /footbag/production/app/production_live currently reads: false' },
  // The status read's switch line, as arming.sh prints it for a dark switch.
  { match: 'scripts/arming.sh --target production --switch email --status*', stdout: 'SSM  (/footbag/production/app/email_send_armed): dark' },
  // Staging's payments switch, read as arming.sh prints it: as seeded, then
  // after s08b turns it dark, then after s08d arms it again.
  {
    match: 'scripts/arming.sh --target staging --status',
    stdout: [
      'tfvars (x.tfvars): payments_armed = armed\\nSSM  (/footbag/staging/app/payments_armed): armed',
      'tfvars (x.tfvars): payments_armed = dark\\nSSM  (/footbag/staging/app/payments_armed): dark',
      'tfvars (x.tfvars): payments_armed = armed\\nSSM  (/footbag/staging/app/payments_armed): armed',
    ].join('~'),
  },
  // The denial check's stdout line when every refusal rests on an explicit deny.
  { match: 'scripts/verify-dev-tester-role-denials.sh *', stdout: 'No findings.' },
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
  for (const args of [['staging'], ['production'], ['production', '--pass', '2'], ['production', '--pass', '3']]) {
    const r = spawnSync('bash', [SCRIPT, '--target', ...args, '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD });
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
  // The tree the steps run from is a committed checkout, as the real one is;
  // the private checkout inside it is ignored there, as it is in the real one.
  writeFileSync(join(root, '.gitignore'), 'footbag_private_repo/\n');
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'stand-in tree');
});

function git(...args: string[]): string {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', ...SPAWN_GUARD });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}
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

describe('the Stripe test-mode exercise on production', () => {
  // Defect caught: the exercise held as one blocked row, so the sitting names
  // nothing to run; or a step given the wrong stdin, so the test-clock link (which
  // takes the host password) refuses mid-sitting, or a key-reading script is fed
  // the password where it expects the terminal.
  it('runs as steps before the blocked tail, each script given the stdin it takes', () => {
    const r = spawnSync('bash', [SCRIPT, '--target', 'production', '--dry-run'], {
      encoding: 'utf-8', env: { ...process.env, ...env() }, ...SPAWN_GUARD,
    });
    expect(r.status, r.stderr).toBe(0);
    const lines = r.stdout.split('\n');
    const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
    const firstBlocked = at(/^\s+p9\d +blocked/);
    for (const script of ['link-stripe-test-clock.sh', 'payments-pause.sh --target production --pause', 'activate-payments.sh --target production --profile footbag-operator --deactivate']) {
      const steps = lines.map((l, i) => ({ l, i }))
        .filter(({ l }) => l.includes(script) && /^\s+p2[12]\S*\s+(once|read|idem)\s/.test(l));
      expect(steps.length, script).toBeGreaterThan(0);
      for (const { l, i } of steps) {
        expect(i, l).toBeLessThan(firstBlocked);
        expect(l, l).toContain('[password on stdin]');
      }
    }
    for (const script of ['capture-stripe-golden-payloads.sh', 'create-stripe-endpoint.sh --target production --mode test']) {
      const steps = lines.map((l, i) => ({ l, i }))
        .filter(({ l }) => l.includes(script) && /^\s+p2[12]\S*\s+(once|read|idem)\s/.test(l));
      expect(steps.length, script).toBeGreaterThan(0);
      for (const { l, i } of steps) {
        expect(i, l).toBeLessThan(firstBlocked);
        expect(l, l).not.toContain('[password on stdin]');
      }
    }
    // The capture lists the events since the exercise's first flow began.
    expect(r.stdout).toMatch(/capture-stripe-golden-payloads\.sh --target production --list --since \{SINCE<p21f\}/);
  });
});

describe('a full staging run', () => {
  // Defect caught: steps run out of the order their dependencies need, run
  // twice, or a step skipped silently.
  it('runs every step once, in order, to the end', () => {
    const r = sit(['--target', 'staging'], YES(10));
    expect(r.status, r.out).toBe(0);
    const ids = rows().map((c) => c[3]);
    const dryIds = [...spawnSync('bash', [SCRIPT, '--target', 'staging', '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD })
      .stdout.matchAll(/^ {2}(s\d+[a-z]?) /gm)].map((m) => m[1]);
    expect(ids).toEqual(dryIds);
    expect(new Set(ids).size).toBe(ids.length);
    // The second operator's drill is a step that can be recorded done, not a
    // blocked placeholder that keeps the pass from ever reading complete.
    expect(rows().find((c) => c[3] === 's99')![5]).toBe('ok');
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
    sit(['--target', 'staging'], YES(9));
    // The staging replacement reaches no host and reads no credential, so it
    // alone of bootstrap-host's forms takes the terminal.
    const takesIt = /^scripts\/(bootstrap-host\.sh --target staging( --status| --restore-database)?$|(deploy-migrate|restore-db|restore-host|rotate-jwt-signing-key|incident-drill|verify-prelive-probes|step-amazon-linux|harden-sshd|verify-host-env)\.sh )/;
    expect(calls().some((c) => /^scripts\/restore-host\.sh --target staging --delete-old$/.test(c.call))).toBe(true);
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

describe('the host rebuild drills', () => {
  const at = (re: RegExp) => stepCalls().findIndex((c) => re.test(c.call));

  // Defect caught: the drills handed to the operator as a list of commands, or
  // run in an order that deletes the old host before the restored one has
  // proved itself, deploys before the restore, or bootstraps before the
  // replacement exists; or the restore run without the host password it needs.
  it('runs the staging snapshot restore, then the fresh instance, in order, each script given the stdin it takes', () => {
    const r = sit(['--target', 'staging', '--from-step', 's11a', '--to-step', 's13b'], YES(2));
    expect(r.status, r.out).toBe(0);
    const restore = at(/^scripts\/restore-host\.sh --target staging$/);
    const drills = stepCalls().map((c, i) => [c, i] as const).filter(([c]) => /^scripts\/restore-db\.sh --target staging --drill$/.test(c.call)).map(([, i]) => i);
    const deleteOld = at(/^scripts\/restore-host\.sh --target staging --delete-old$/);
    const replace = at(/^scripts\/bootstrap-host\.sh --target staging --replace-instance$/);
    const bootstrap = at(/^scripts\/bootstrap-host\.sh --target staging --restore-database$/);
    const deploys = stepCalls().map((c, i) => [c, i] as const).filter(([c]) => /^deploy_to_aws\.sh --target staging$/.test(c.call)).map(([, i]) => i);
    expect(restore).toBeGreaterThan(-1);
    // One deploy, after the restore; the fresh instance's deploy is the
    // bootstrap's own, so a second would only redeploy what it just shipped.
    expect(deploys).toHaveLength(1);
    expect(restore).toBeLessThan(deploys[0]);
    expect(deploys[0]).toBeLessThan(drills[0]);
    expect(drills[0]).toBeLessThan(deleteOld);
    expect(deleteOld).toBeLessThan(replace);
    expect(replace).toBeLessThan(bootstrap);
    // The fresh instance's restored database is drilled too.
    expect(drills).toHaveLength(2);
    expect(bootstrap).toBeLessThan(drills[1]);
    expect(stepCalls()[restore].line).toBe(PASSWORD);
    expect(stepCalls()[deleteOld].line).toBe(PASSWORD);
    expect(stepCalls()[bootstrap].line).toBe(PASSWORD);
    expect(stepCalls()[replace].tty).toBe(true);
    // Then the retention read and both buckets' restore drills.
    for (const re of [/^scripts\/apply-snapshot-retention\.sh --target staging --verify/, /^scripts\/restore-bucket\.sh --target staging --bucket media --drill$/, /^scripts\/restore-bucket\.sh --target staging --bucket archive --drill$/]) {
      expect(at(re), String(re)).toBeGreaterThan(drills[1]);
    }
  });

  // Defect caught: a host rebuild, restore or fresh-instance bootstrap started
  // on a host whose CPU burst allowance is spent, so it ran at baseline CPU and
  // failed six times in one night; or a critical alarm left firing after one,
  // with the run carrying on regardless.
  it('reads the host\'s health before and the alarms after each heavy step', () => {
    const r = sit(['--target', 'staging', '--from-step', 's11a', '--to-step', 's13b'], YES(2));
    expect(r.status, r.out).toBe(0);
    // Each heavy step, then the next step's command: the alarm read comes
    // after the step (and its proof read) and before the next step runs.
    const pairs: [RegExp, RegExp][] = [
      [/^scripts\/restore-host\.sh --target staging$/, /^deploy_to_aws\.sh --target staging$/],
      [/^scripts\/bootstrap-host\.sh --target staging --restore-database$/, /^scripts\/verify-account-baseline\.sh/],
    ];
    const all = stepCalls().map((c) => c.call);
    for (const [heavy, next] of pairs) {
      const step = at(heavy);
      expect(step, String(heavy)).toBeGreaterThan(1);
      const following = all.findIndex((c, k) => k > step && next.test(c));
      // Health read, then the mute of the step's expected alarms, then the step.
      expect(all.slice(step - 2, step)).toEqual([
        'scripts/check-env-health.sh --target staging --allow-site-down',
        'scripts/mute-expected-alarms.sh --target staging --minutes 240',
      ]);
      // After it: the alarm read, then the mute lifted, before the next step.
      const after = all.indexOf('scripts/check-env-health.sh --target staging --alarms-only --wait-minutes 10', step);
      const unmute = all.indexOf('scripts/mute-expected-alarms.sh --target staging --clear', step);
      expect(after, `alarm read after ${heavy}`).toBeGreaterThan(step);
      expect(unmute).toBeGreaterThan(after);
      expect(following, `next step after ${heavy}`).toBeGreaterThan(unmute);
    }
    // A light step gets no health read of its own.
    const replace = at(/^scripts\/bootstrap-host\.sh --target staging --replace-instance$/);
    expect(stepCalls()[replace - 1].call).not.toMatch(/check-env-health/);
  });

  it('does not start a heavy step on an unfit host, and resumes at that step within the same stretch', () => {
    writeRules([{ match: 'scripts/check-env-health.sh --target staging --allow-site-down', codes: [1] }]);
    const r = sit(['--target', 'staging', '--from-step', 's11k', '--to-step', 's13b']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT s11k/);
    expect(at(/^scripts\/bootstrap-host\.sh --target staging --restore-database$/)).toBe(-1);
    // Nothing was muted for a step that never started.
    expect(at(/^scripts\/mute-expected-alarms\.sh/)).toBe(-1);
    expect(rows().at(-1)!.slice(3, 6)).toEqual(['s11k', 'scripts/check-env-health.sh --target staging --allow-site-down', 'failed (health)']);
    // The resume a stop prints keeps the stretch's end, so it does not run on
    // past the drills into the second operator's step.
    expect(r.out).toMatch(/--from-step s11k --to-step s13b/);
  });

  it('records a heavy step done but stops before the next one while a critical alarm stays in ALARM', () => {
    writeRules([{ match: 'scripts/check-env-health.sh --target staging --alarms-only*', codes: [1] }]);
    const r = sit(['--target', 'staging', '--from-step', 's11k', '--to-step', 's13b']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT s11l/);
    expect(rows().some((row) => row[3] === 's11k' && row[5] === 'ok')).toBe(true);
    expect(at(/^scripts\/verify-account-baseline\.sh/)).toBe(-1);
    // The mute is lifted even though the run stops.
    expect(at(/^scripts\/mute-expected-alarms\.sh --target staging --clear$/)).toBeGreaterThan(-1);
  });

  it('lifts the mute when the heavy step itself fails', () => {
    // Defect caught: a failed rebuild leaving its alarms muted, so the
    // operator investigating it is not told when they fire.
    writeRules([{ match: 'scripts/bootstrap-host.sh --target staging --restore-database', codes: [1] }]);
    const r = sit(['--target', 'staging', '--from-step', 's11k', '--to-step', 's13b']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT s11k/);
    const muted = at(/^scripts\/mute-expected-alarms\.sh --target staging --minutes 240$/);
    const lifted = at(/^scripts\/mute-expected-alarms\.sh --target staging --clear$/);
    expect(muted).toBeGreaterThan(-1);
    expect(lifted).toBeGreaterThan(muted);
  });

  it('carries on unmuted, with a warning, when the mute script fails', () => {
    // Defect caught: a heavy step blocked by its own mute.
    writeRules([{ match: 'scripts/mute-expected-alarms.sh *', codes: [2] }]);
    const r = sit(['--target', 'staging', '--from-step', 's11k', '--to-step', 's11k']);
    expect(r.status, r.out).toBe(0);
    expect(at(/^scripts\/bootstrap-host\.sh --target staging --restore-database$/)).toBeGreaterThan(-1);
    expect(r.out).toMatch(/mute-expected-alarms\.sh --target staging --minutes 240 exited 2/);
  });

  // Defect caught: the production drills replacing a live production's
  // serving host, or starting on a tree with changes still to apply.
  it('stops before any production drill when production is live', () => {
    writeRules([{ match: 'scripts/production-live-marker.sh --status*', stdout: 'Marker /footbag/production/app/production_live currently reads: true' }]);
    const r = sit(['--target', 'production', '--from-step', 'p90a', '--to-step', 'p90s'], YES(2));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT p90a/);
    expect(at(/restore-host\.sh|bootstrap-host\.sh --target production --replace-instance/)).toBe(-1);
  });

  // Defect caught: a production restore started while email is armed, so the
  // restored host's worker resends, from the snapshot's day-old database, mail
  // the old host had already sent to real members.
  it('stops before the production restore unless the email switch reads dark', () => {
    writeRules([{ match: 'scripts/arming.sh --target production --switch email --status*', stdout: 'SSM  (/footbag/production/app/email_send_armed): armed' }]);
    const armed = sit(['--target', 'production', '--from-step', 'p90a', '--to-step', 'p90s'], YES(2));
    expect(armed.status).toBe(1);
    expect(armed.out).toMatch(/VERDICT: STOPPED AT p90c/);
    expect(at(/restore-host\.sh/)).toBe(-1);

    writeRules([]);
    writeFileSync(stubLog, '');
    const dark = sit(['--target', 'production', '--from-step', 'p90a', '--to-step', 'p90s'], YES(2));
    const restore = at(/^scripts\/restore-host\.sh --target production$/);
    expect(restore).toBeGreaterThan(at(/arming\.sh --target production --switch email --status/));
    expect(restore).toBeGreaterThan(at(/terraform-apply-all\.sh --target production --check/));
    expect(stepCalls()[restore].line).toBe(PASSWORD);
    // Defect caught: the fresh-instance rebuild reached on production while it
    // still mints new host keys, so the drill makes the operator rewrite the
    // vault; or the steps that stand on that rebuild run anyway, so a restore
    // lands on the old host and a question about the replacement is answered
    // yes; or the drills that stand on nothing it does wait behind it.
    expect(dark.status, dark.out).toBe(3);
    expect(dark.out).toMatch(/VERDICT: PENDING: blocked p90m; skipped p90n p90q/);
    expect(at(/bootstrap-host\.sh --target production --replace-instance/)).toBe(-1);
    expect(at(/^scripts\/bootstrap-host\.sh --target production --restore-database$/)).toBe(-1);
    const result = (id: string) => rows().find((c) => c[3] === id)?.[5];
    expect(result('p90m')).toBe('blocked');
    expect(result('p90n')).toBe('skipped (needs p90m)');
    expect(result('p90q')).toBe('skipped (needs p90m)');
    for (const id of ['p90o', 'p90p', 'p90r', 'p90s']) expect(result(id), id).toBe('ok');
    expect(at(/restore-db\.sh --target production --drill --bucket footbag-production-db-snapshots-dr/)).toBeGreaterThan(-1);
    expect(at(/^deploy_to_aws\.sh --target production --all-data/)).toBe(-1);

    // Resumed past the block, the dependents stay skipped: the rebuild they
    // stand on still has not happened.
    writeFileSync(stubLog, '');
    const resumed = sit(['--target', 'production', '--from-step', 'p90n', '--to-step', 'p90n']);
    expect(resumed.status, resumed.out).toBe(3);
    expect(at(/^scripts\/bootstrap-host\.sh --target production --restore-database$/)).toBe(-1);
  });

  // Defect caught: a dependency gate that skips whatever the log says, so the
  // restore onto the fresh instance never runs once the rebuild is done.
  it('runs a step whose dependency is recorded done', () => {
    sit(['--target', 'production', '--from-step', 'p02a', '--to-step', 'p02a']);
    // The rebuild recorded done, as it will be once its script carries the keys.
    writeFileSync(logReal, `${log().trimEnd()}\n| 2026-11-24T00:00:00Z | 2026-11-24T01:00:00Z | production | p90m | scripts/bootstrap-host.sh --target production --replace-instance | ok |  |\n`);
    const r = sit(['--target', 'production', '--from-step', 'p90n', '--to-step', 'p90n']);
    expect(r.status, r.out).toBe(0);
    expect(at(/^scripts\/bootstrap-host\.sh --target production --restore-database$/)).toBeGreaterThan(-1);
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
    expect(r.out).toMatch(/not run: s04b s04c s04d s04e s05a/);
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

  // Defect caught: resuming at a blocked step reads as done.
  it('stays pending when resumed at a blocked step', () => {
    const r = sit(['--target', 'production', '--from-step', 'p91', '--to-step', 'p91']);
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/VERDICT: PENDING: blocked p91/);
  });

  // Defect caught: a blocked step that ends the run, so every runnable step
  // after it waits on work nobody can do yet.
  it('carries on past a blocked step to the steps after it, and names every blocked one', () => {
    const r = sit(['--target', 'production', '--from-step', 'p91', '--to-step', 'p97']);
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/VERDICT: PENDING: blocked p91 p92 p93 p94 p96 p97/);
    expect(rows().map((c) => c[3])).toContain('p95');
  });

  // Defect caught: a pending verdict over a run that also failed, so a caller
  // branching on "pending" carries on past a real error.
  it('reports a failure, not pending, when an error follows a deferred step', () => {
    writeRules([
      { match: 'scripts/reconfirm-alarm-subscriptions.sh --target * --status', codes: [3] },
      { match: 'scripts/check-env-health.sh --target staging --alarms-only*', codes: [1] },
    ]);
    const r = sit(['--target', 'staging', '--from-step', 's11h', '--to-step', 's11k']);
    expect(rows().find((c) => c[3] === 's11h')?.[5]).toBe('deferred (alarm mail not confirmed)');
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/VERDICT: FAILED/);
    expect(r.out).not.toMatch(/VERDICT: PENDING/);
  });

  // Defect caught: the second operator's drill recorded under whoever happens to
  // be at the keyboard, or run with no credential, so the drill proves nothing
  // about the second operator.
  it('asks who is at the keyboard before the second operator\'s drill, then runs it with the credential', () => {
    const declined = sit(['--target', 'staging', '--from-step', 's98', '--to-step', 's99'], ['no']);
    expect(declined.status).toBe(1);
    expect(declined.out).toMatch(/VERDICT: STOPPED AT s98/);
    expect(firstCall(/incident-drill/)).toBe(-1);

    const ran = sit(['--target', 'staging', '--from-step', 's98', '--to-step', 's99'], ['yes']);
    expect(ran.status, ran.out).toBe(0);
    const drill = stepCalls().find((c) => /incident-drill\.sh --target staging/.test(c.call))!;
    expect(drill.line).toBe(PASSWORD);
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

  // Defect caught: a later section (another pass's records) either blocking the
  // run or receiving its rows.
  it('keeps writing under its own section when a later section follows it', () => {
    sit(['--target', 'staging', '--to-step', 's01a']);
    writeFileSync(logReal, log() + '\n## 10. Something later\n');
    const r = sit(['--target', 'staging', '--from-step', 's01b', '--to-step', 's01b']);
    expect(r.status, r.out).toBe(0);
    const text = log();
    expect(text.indexOf('| staging | s01b |')).toBeLessThan(text.indexOf('## 10. Something later'));
    expect(text.trimEnd().endsWith('## 10. Something later')).toBe(true);
  });

  // Defect caught: a row that cannot say which code ran it, so no row can be
  // matched to a commit, and a run from a changed tree reads like one from a
  // clean checkout of the same commit.
  it('opens every row\'s notes with the commit, the uncommitted count and a fingerprint of the uncommitted changes', () => {
    const head = git('rev-parse', 'HEAD');
    const once = () => {
      sit(['--target', 'staging', '--from-step', 's01a', '--to-step', 's01a']);
      const notes = rows().at(-1)![6];
      const m = notes.match(/^at ([0-9a-f]{40}), (\d+) uncommitted, tree ([0-9a-f]{12})/);
      expect(m, notes).not.toBeNull();
      return { commit: m![1], count: Number(m![2]), tree: m![3] };
    };
    const clean = once();
    expect(clean).toMatchObject({ commit: head, count: 0 });
    // A tracked file changed.
    writeFileSync(join(root, 'scripts', 'apply-account-baseline.sh'), `${STUB}# changed\n`);
    const changed = once();
    expect(changed).toMatchObject({ commit: head, count: 1 });
    expect(changed.tree).not.toBe(clean.tree);
    // A new file the commit does not hold is code the run may have used too,
    // and its content counts, not only its name.
    writeFileSync(join(root, 'scripts', 'new-helper.sh'), 'echo one\n');
    const added = once();
    expect(added).toMatchObject({ commit: head, count: 2 });
    expect(added.tree).not.toBe(changed.tree);
    writeFileSync(join(root, 'scripts', 'new-helper.sh'), 'echo two\n');
    const changedAgain = once();
    expect(changedAgain.tree).not.toBe(added.tree);
    // A file the checkout ignores is not code the run used: changing it moves
    // neither the count nor the fingerprint.
    writeFileSync(join(root, '.gitignore'), 'footbag_private_repo/\nlocal-notes.txt\n');
    git('add', '.gitignore');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'ignore notes');
    const beforeIgnored = once();
    writeFileSync(join(root, 'local-notes.txt'), 'one\n');
    const ignoredOnce = once();
    writeFileSync(join(root, 'local-notes.txt'), 'two\n');
    const ignoredTwice = once();
    expect(ignoredOnce).toMatchObject({ count: beforeIgnored.count, tree: beforeIgnored.tree });
    expect(ignoredTwice).toMatchObject({ count: beforeIgnored.count, tree: beforeIgnored.tree });
  });

  // Defect caught: a run from a tree with no commit to name, so its rows carry
  // nothing that ties them to code.
  it('refuses to run from a tree that is not a git checkout', () => {
    rmSync(join(root, '.git'), { recursive: true, force: true });
    const r = sit(['--target', 'staging', '--to-step', 's01a']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/not a git checkout/);
    expect(calls()).toEqual([]);
    expect(log()).toBe(LOG_HEAD);
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
    expect(rows().at(-1)!.slice(3, 7)).toEqual(['p17a', 'legacy_data/legacy_mirror/verify_mirror.sh', 'ok', expect.stringMatching(/; not asked: proved by/)]);

    writeRules([{ match: 'legacy_data/legacy_mirror/verify_mirror.sh*', codes: [1, 0] }]);
    const asked = sit(['--target', 'production', '--from-step', 'p17a', '--to-step', 'p17b'], ['yes']);
    expect(asked.status, asked.out).toBe(0);
    expect(asked.out).toMatch(/The archive capture does not verify\..*Has that finished\?.*\(yes\/no/s);
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
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/VERDICT: PENDING: deferred s03 s04a s04b/);
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
    // Defect caught: a run whose alarm work was all deferred passing as done.
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/VERDICT: PENDING: deferred s04a s04b s04c s04d s04e +\(exit 3\)/);
    expect(rows().map((c) => [c[3], c[5]])).toEqual([
      ['s04a', 'deferred (alarm mail not confirmed)'],
      ['s04b', 'deferred (alarm mail not confirmed)'],
      ['s04c', 'deferred (alarm mail not confirmed)'],
      ['s04d', 'deferred (alarm mail not confirmed)'],
      ['s04e', 'deferred (alarm mail not confirmed)'],
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
    expect(r.status, r.out).toBe(3);
    expect(rows().map((c) => c[5])).toEqual(['deferred (alarm mail not confirmed)', 'deferred (alarm mail not confirmed)']);
    expect(firstCall(/host-break-glass|list-host-access-mints/)).toBe(-1);
    const audit = sit(['--target', 'production', '--from-step', 'p13k', '--to-step', 'p13k']);
    expect(audit.status).toBe(3);
    expect(firstCall(/prove-audit-alarms/)).toBe(-1);
  });

  // Defect caught: a production test alarm, drill or audit-alarm proof run while
  // nothing can receive its mail, because its row lost the marker; the alarm
  // gates and state reads around them, which need no mail, still run.
  it('defers every production step that sends or awaits alarm mail, across the whole alarm stretch', () => {
    writeRules([PENDING]);
    const r = sit(['--target', 'production', '--from-step', 'p11a', '--to-step', 'p14b'], YES(4));
    expect(r.status, r.out).toBe(3);
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

describe('passes 2 and 3', () => {
  const dryPass = (pass: string) => spawnSync('bash', [SCRIPT, '--target', 'production', '--pass', pass, '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD });
  const listed = (out: string) => new Map([...out.matchAll(/^ {2}(p\S+) +\S+ +(.*)$/gm)].map((m) => [m[1], m[2]]));

  // Defect caught: a later pass with no list of its own, so it is run from
  // memory; or one whose stages are not the scripts that own them.
  it('lists pass 2 from the custom domain to the rehearsal, each stage the cutover script owns', () => {
    const r = dryPass('2');
    expect(r.status, r.stderr).toBe(0);
    const steps = listed(r.stdout);
    for (const [id, cmd] of [
      ['p2-1', 'scripts/production-cutover.sh --target production --stage custom-domain'],
      ['p2-3a', 'scripts/production-cutover.sh --target production --stage ses-domain'],
      ['p2-3b', '[password on stdin] scripts/ses-sender-cutover.sh --target production'],
      ['p2-6a', 'scripts/production-cutover.sh --target production --stage window'],
      ['p2-7c', '[password on stdin] scripts/verify-prelive-probes.sh --target production'],
      ['p2-9b', 'scripts/production-cutover.sh --target production --stage rehearsal'],
      ['p2-9e', 'scripts/production-cutover.sh --target production --stage window'],
    ]) expect(steps.get(id), id).toBe(cmd);
  });

  // Defect caught: pass 3's battery drifting from pass 1's reads, or still
  // expecting the site live while production rests behind the notice.
  it('runs pass 1\'s section-1 reads again in pass 3, twice, with the notice expected on', () => {
    const pass1 = listed(spawnSync('bash', [SCRIPT, '--target', 'production', '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout);
    const pass3 = listed(dryPass('3').stdout);
    for (const letter of 'bcdefghijklmno') {
      const want = pass1.get(`p07${letter}`)!.replace('--expect-live', '--expect-notice');
      expect(want, letter).toBeDefined();
      expect(pass3.get(`p3-2-${letter}`), `p3-2-${letter}`).toBe(want);
      expect(pass3.get(`p3-3-${letter}`), `p3-3-${letter}`).toBe(want);
    }
    expect(pass3.get('p3-2-l')).toContain('--expect-notice');
  });

  // Defect caught: two steps of one pass sharing an id, so the log row of one
  // reads as the other's, a resume starts at the wrong one, and a step that
  // needs one is satisfied by the other.
  it('gives every step of every pass an id of its own', () => {
    for (const args of [['staging'], ['production'], ['production', '--pass', '2'], ['production', '--pass', '3']]) {
      const out = spawnSync('bash', [SCRIPT, '--target', ...args, '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout;
      const ids = [...out.matchAll(/^ {2}([ps]\S+) /gm)].map((m) => m[1]);
      expect(ids.length, args.join(' ')).toBeGreaterThan(10);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i), args.join(' ')).toEqual([]);
    }
  });

  it('refuses a later pass on staging and a pass it does not know', () => {
    for (const args of [['--target', 'staging', '--pass', '2'], ['--target', 'production', '--pass', '4']]) {
      const r = spawnSync('bash', [SCRIPT, ...args, '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD });
      expect(r.status, args.join(' ')).toBe(2);
    }
  });

  // Defect caught: a later pass's rows landing in pass 1's section, so its
  // re-run of a step reads as pass 1's; or a stop's resume line dropping the
  // pass, so the resume runs pass 1 instead.
  it('writes under its own section and resumes within its own pass', () => {
    writeRules([{ match: 'scripts/ses-sender-cutover.sh *', codes: [1] }]);
    const r = sit(['--target', 'production', '--pass', '2', '--from-step', 'p2-3a', '--to-step', 'p2-3c']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/--target production --pass 2 --from-step p2-3b --to-step p2-3c/);
    const text = log();
    expect(text).toMatch(/^## 10\. Production-readiness sitting, pass 2$/m);
    expect(text).not.toMatch(/^## 9\. /m);
    expect(text.indexOf('| production | p2-3a |')).toBeGreaterThan(text.indexOf('## 10. Production-readiness sitting, pass 2'));
  });

  // Defect caught: a step that stands on two others run once one of them is
  // done, because only its last-named need is kept.
  it('skips a step while any one of the steps it needs is not done', () => {
    sit(['--target', 'production', '--pass', '2', '--from-step', 'p2-1', '--to-step', 'p2-1']);
    // Origin TLS recorded done, as it will be once its script exists; the
    // cookie publisher still is not.
    writeFileSync(logReal, `${log().trimEnd()}\n| 2026-11-24T00:00:00Z | 2026-11-24T01:00:00Z | production | p2-5 | scripts/provision-origin-tls.sh --target production | ok |  |\n`);
    const r = sit(['--target', 'production', '--pass', '2', '--from-step', 'p2-8a', '--to-step', 'p2-8b']);
    expect(r.status, r.out).toBe(3);
    expect(rows().find((c) => c[3] === 'p2-8b')?.[5]).toBe('skipped (needs p2-8a)');
    expect(r.out).not.toMatch(/\(yes\/no/);
  });

  // Defect caught: the window and the rehearsal run before the origin hop is
  // encrypted, because the step that encrypts it is not built.
  it('skips everything that stands on origin TLS while it is blocked, and ends pending', () => {
    const r = sit(['--target', 'production', '--pass', '2', '--from-step', 'p2-5', '--to-step', 'p2-6b']);
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/VERDICT: PENDING: blocked p2-5; skipped p2-6a p2-6b/);
    expect(firstCall(/production-cutover\.sh --target production --stage window/)).toBe(-1);
    expect(firstCall(/^deploy_to_aws\.sh/)).toBe(-1);
  });
});

describe('the production steps around email, the zero-logins gate and the archive', () => {
  const dry = () => spawnSync('bash', [SCRIPT, '--target', 'production', '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout;
  const order = (out: string) => [...out.matchAll(/^ {2}(p\d+[a-z]\d*|p\d+) /gm)].map((m) => m[1]);

  // Defect caught: the email checks run as the operator account, which the
  // email script refuses outright, so the outbox and bounce steps can only
  // fail; or the outbox check mails only the simulator, so nobody sees the
  // message arrive.
  it('runs both email checks as the production runtime role, with the inbox typed at the terminal', () => {
    const out = dry();
    const email = out.split('\n').filter((l) => /verify-prod-email\.sh/.test(l));
    expect(email.length).toBe(2);
    for (const l of email) {
      expect(l).toMatch(/--profile footbag-production-runtime/);
      expect(l).not.toMatch(/--profile footbag-operator/);
      // Defect caught: no principal that can read the identity, so the check
      // refuses and the bounce domain is never judged.
      expect(l).toMatch(/--read-profile footbag-operator/);
    }
    expect(out).toMatch(/^ {2}p08d +once +\[password on stdin\] scripts\/verify-prod-email\.sh --profile footbag-production-runtime --read-profile footbag-operator --outbox --inbox-from-tty$/m);
    expect(order(out).indexOf('p08d1')).toBe(order(out).indexOf('p08d') + 1);
  });

  // Defect caught: the outbox message's arrival taken on faith.
  it('asks whether the outbox message arrived signed, and stops on a no', () => {
    const r = sit(['--target', 'production', '--from-step', 'p08d1', '--to-step', 'p08d1'], ['no']);
    expect(r.out).toMatch(/DKIM.*\(yes\/no/s);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT p08d1/);
  });

  // Defect caught: a run that stops while the zero-logins gate is on leaves an
  // alarm armed that exists only for this fire test.
  it('offers to turn the zero-logins gate off when the run stops before p13o', () => {
    writeRules([{ match: 'scripts/send-test-alarm.sh --target production --status --expect ALARM *', codes: [3] }]);
    const r = sit(['--target', 'production', '--from-step', 'p13m', '--to-step', 'p13o'], ['yes']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT p13n/);
    const gateOff = 'scripts/set-terraform-gate.sh --target production --gate enable_cutover_login_alarm --state off';
    expect(calls().map((c) => c.call)).toContain(gateOff);
    // The step stays failed: turning the gate off proves nothing about the alarm.
    expect(rows().find((c) => c[3] === 'p13n')![5]).toMatch(/^failed/);
  });

  it('leaves the gate alone when the operator declines, and when the gate was never turned on', () => {
    writeRules([{ match: 'scripts/send-test-alarm.sh --target production --status --expect ALARM *', codes: [3] }]);
    sit(['--target', 'production', '--from-step', 'p13m', '--to-step', 'p13o'], ['no']);
    expect(calls().some((c) => /--gate enable_cutover_login_alarm --state off/.test(c.call))).toBe(false);
    // A log with no p13m row: the gate was never turned on by this pass.
    rmSync(stubLog, { force: true });
    writeFileSync(logReal, LOG_HEAD);
    sit(['--target', 'production', '--from-step', 'p13n', '--to-step', 'p13o'], ['yes']);
    expect(calls().some((c) => /--gate enable_cutover_login_alarm --state off/.test(c.call))).toBe(false);
  });

  // Defect caught: the zero-logins wait shorter than the alarm's two clean
  // hours after the sign-in a few steps earlier, so the step times out on a
  // healthy alarm.
  it('waits long enough for two clean hours after the session check', () => {
    const line = dry().split('\n').find((l) => /^ {2}p13n /.test(l))!;
    expect(Number(line.match(/--wait-minutes (\d+)/)![1])).toBeGreaterThanOrEqual(180);
  });

  // Defect caught: the zero-logins alarm proved only by going off on an idle
  // host, which it does whether or not its filter matches a real sign-in.
  it('proves a real sign-in is counted, after the gate is off again', () => {
    const ids = order(dry());
    expect(ids.indexOf('p13p')).toBeGreaterThan(ids.indexOf('p13o'));
    expect(dry()).toMatch(/^ {2}p13q +read +scripts\/send-test-alarm\.sh --target production --status --metric LoginSuccessCount --wait-minutes \d+$/m);
  });

  // Defect caught: a question declined by a line already waiting in the
  // terminal reads to the operator exactly like a no they never typed.
  it('says what it read when a question is declined', () => {
    const declined = sit(['--target', 'production', '--from-step', 'p10a', '--to-step', 'p10a'], ['CRED=x']);
    expect(declined.status).toBe(1);
    expect(declined.out).toContain('Read CRED=x, which is not yes.');
    const accepted = sit(['--target', 'production', '--from-step', 'p10a', '--to-step', 'p10a'], ['yes']);
    expect(accepted.status).toBe(0);
    expect(accepted.out).not.toContain('which is not yes');
  });

  // Defect caught: a question sends the operator to a step the table no longer
  // has, so they do work nothing later reads, or cannot do what it asks.
  it('names only steps that exist in its questions and commands', () => {
    for (const target of ['production', 'staging']) {
      const out = spawnSync('bash', [SCRIPT, '--target', target, '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout;
      const ids = new Set([...out.matchAll(/^ {2}([ps]\d+[a-z]?\d*) /gm)].map((m) => m[1]));
      expect(ids.size).toBeGreaterThan(10);
      const named = [...out.matchAll(/^ {2}[ps]\d+[a-z]?\d* +.*$/gm)]
        .flatMap((m) => [...m[0].slice(2).replace(/^\S+/, '').matchAll(/\b([ps]\d{2}[a-z]?\d*)\b/g)].map((n) => n[1]));
      expect(named.length).toBeGreaterThan(0);
      expect(named.filter((n) => !ids.has(n))).toEqual([]);
    }
  });

  // Defect caught: the archive published before its capture is checked, so a
  // failing capture is found only after it is live.
  it('checks the capture before the archive publish', () => {
    const ids = order(dry());
    expect(ids.indexOf('p17b')).toBeGreaterThan(-1);
    expect(ids.indexOf('p17b')).toBeLessThan(ids.indexOf('p15b'));
    expect(ids).not.toContain('p17c');
  });

  // Defect caught: a production run without --to-step running Julie's drill
  // and recording whoever is at the keyboard as the second operator.
  it('asks who is at the keyboard before the break-glass drill, and stops on a no', () => {
    const ids = order(dry());
    expect(ids.indexOf('p10g')).toBe(ids.indexOf('p11a') - 1);
    const r = sit(['--target', 'production', '--from-step', 'p10g', '--to-step', 'p11a'], ['no']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT p10g/);
    expect(firstCall(/host-break-glass/)).toBe(-1);
  });

  // Defect caught: the operator check asked while alarm mail is pending, when
  // the drill it guards is deferred anyway, so the question stops a run for
  // nothing.
  it('defers the operator check with the drill while alarm mail is pending', () => {
    writeRules([{ match: 'scripts/reconfirm-alarm-subscriptions.sh --target * --status', codes: [3] }]);
    const r = sit(['--target', 'production', '--from-step', 'p10g', '--to-step', 'p11a']);
    expect(r.status, r.out).toBe(3);
    // Not asked: the log row names the step, so the question's mark is what shows a prompt.
    expect(r.out).not.toMatch(/\(yes\/no/);
    expect(rows().map((c) => [c[3], c[5]])).toEqual([
      ['p10g', 'deferred (alarm mail not confirmed)'],
      ['p11a', 'deferred (alarm mail not confirmed)'],
    ]);
  });

  // Defect caught: the first admin taken on the operator's word that a warning
  // stopped, which nothing shows minutes after the claim; the host database's
  // own count of administrators is the proof.
  it('reads that an administrator now exists after the claim, and stops when none does', () => {
    const ids = order(dry());
    expect(ids.indexOf('p10d')).toBe(ids.indexOf('p10c') + 1);
    writeRules([{ match: 'scripts/bringup-status.sh *', stdout: ' 6. First admin               DONE     1 administrator(s) on the host database can sign in and act' }]);
    const ok = sit(['--target', 'production', '--from-step', 'p10d', '--to-step', 'p10d']);
    expect(ok.status, ok.out).toBe(0);
    writeRules([{ match: 'scripts/bringup-status.sh *', stdout: ' 6. First admin               PENDING  no administrator on the host database can sign in' }]);
    const none = sit(['--target', 'production', '--from-step', 'p10d', '--to-step', 'p10d']);
    expect(none.status).toBe(1);
    expect(none.out).toMatch(/VERDICT: STOPPED AT p10d/);
  });

  // Defect caught: a status read recorded ok because it exited 0, while what
  // it printed showed the wrong state (payments armed, a host row not done,
  // the agent stopped, a feed queue missing). Each read passes on the state the
  // reads section expects, and stops on any one line of it wrong.
  it.each([
    ['p07b', 'scripts/arming.sh --target production --status*', [
      'tfvars (/v/production.tfvars): payments_armed = dark',
      'SSM  (/footbag/production/app/payments_armed): dark',
    ], [
      ['tfvars (/v/production.tfvars): payments_armed = dark', 'tfvars (/v/production.tfvars): payments_armed = armed'],
      ['SSM  (/footbag/production/app/payments_armed): dark', 'SSM  (/footbag/production/app/payments_armed): <unreadable>'],
    ]],
    ['p07e', 'scripts/bringup-status.sh --target production --profile footbag-operator', [
      ' 2. Terraform                DONE     plan reports no changes in shared, identity or production',
      ' 3. Payments                 N-A      payments dark (stub adapter; fake checkout, no real money)',
      ' 4. Backup pipeline          DONE     timer active',
      ' 8. Deployed runtime         DONE     4 containers healthy',
    ], [
      [' 2. Terraform                DONE ', ' 2. Terraform                PENDING '],
      [' 3. Payments                 N-A      payments dark', ' 3. Payments                 PENDING  payments dark'],
      [' 4. Backup pipeline          DONE ', ' 4. Backup pipeline          UNKNOWN '],
      [' 8. Deployed runtime         DONE ', ' 8. Deployed runtime         FAILED '],
    ]],
    ['p07j', 'scripts/diagnose-cwagent.sh --target production', [
      '  enabled: enabled', '  active:  active', '  toml: namespace = "CWAgent/production"',
    ], [
      ['  enabled: enabled', '  enabled: disabled'],
      ['  active:  active', '  active:  inactive'],
      ['CWAgent/production', 'CWAgent'],
    ]],
    ['p07m', 'scripts/activate-notification-feeds.sh --target production --status*', [
      'live feed queues: https://sqs.us-east-1.amazonaws.com/0/footbag-production-alarm-feed\thttps://sqs.us-east-1.amazonaws.com/0/footbag-production-ses-feedback-feed',
    ], [
      ['footbag-production-alarm-feed\t', 'footbag-production-alarm-feed-dlq\t'],
      ['footbag-production-ses-feedback-feed', 'footbag-production-ses-feedback-feed-dlq'],
    ]],
  ] as const)('%s passes only on the expected state', (id, match, good, breaks) => {
    const lines = good.join('\n');
    writeRules([{ match, stdout: lines.replace(/\n/g, '\\n').replace(/\t/g, '\\t') }]);
    expect(sit(['--target', 'production', '--from-step', id, '--to-step', id]).status, id).toBe(0);
    for (const [from, to] of breaks) {
      writeRules([{ match, stdout: lines.replace(from, to).replace(/\n/g, '\\n').replace(/\t/g, '\\t') }]);
      const r = sit(['--target', 'production', '--from-step', id, '--to-step', id]);
      expect(r.status, `${id}: ${to}`).toBe(1);
      expect(r.out).toMatch(new RegExp(`VERDICT: STOPPED AT ${id}`));
    }
  });

  // Defect caught: a row whose proof holds the table's field separator, so the
  // rest of the proof is run as the step's command.
  it('holds every step row to its fields: a known kind, stdin and proof, and a runnable command', () => {
    const text = readFileSync(SCRIPT, 'utf-8');
    const rowLines = [...text.matchAll(/^ {2}'([ps][0-9][^|']*\|.*)'$/gm)].map((m) => m[1].replace(/'"'"'/g, "'"));
    expect(rowLines.length).toBeGreaterThan(150);
    const runnable = /^(scripts\/|legacy_data\/|npm |deploy_to_aws\.sh)/;
    for (const row of rowLines) {
      const f = row.split('|');
      expect(f.length, row).toBeGreaterThanOrEqual(5);
      expect(f.length, row).toBeLessThanOrEqual(6);
      const [, kind, stdin, proof, cmd, fallback] = f;
      expect(kind, row).toMatch(/^(read|idem|once|ask|digest|blocked|mailwalk)(\+heavy)?(\+mail)?$/);
      expect(stdin, row).toMatch(/^(cred|tty|-)$/);
      expect(proof, row).toMatch(/^(-|log|rerun|save|match|fact=\S+|after=\S+|stdout=.+|(cred|tty):[0-9,]+=.+)$/);
      if (!/^(ask|blocked)/.test(kind)) expect(cmd, row).toMatch(runnable);
      if (/^(cred|tty):/.test(proof)) expect(proof.replace(/^\w+:[0-9,]+=/, ''), row).toMatch(runnable);
      if (fallback !== undefined) expect(fallback, row).toMatch(runnable);
    }
  });

  // Defect caught: section 1's reads attested by a question and never run.
  it('runs the section-1 reads as steps, each with the stdin its script takes', () => {
    const out = dry();
    for (const [id, cred, cmd] of [
      ['p07h', false, 'scripts/apply-snapshot-retention.sh --target production --verify --profile footbag-operator'],
      ['p07i', false, 'scripts/apply-bucket-tls-baseline.sh --verify-only --profile footbag-operator'],
      ['p07j', true, 'scripts/diagnose-cwagent.sh --target production'],
      ['p07k', false, 'scripts/provision-ssm-secret.sh --target production --secret session_secret status --profile footbag-operator'],
      ['p07l', false, 'scripts/verify-cutover-notice.sh --function --expect-live --profile footbag-operator'],
      ['p07m', true, 'scripts/activate-notification-feeds.sh --target production --status --profile footbag-operator'],
      ['p07n', true, 'scripts/payments-pause.sh --target production --status'],
      // Gate OR4: the dev-and-tester role's denials, proved against the live account.
      ['p07o', false, 'scripts/verify-dev-tester-role-denials.sh --profile footbag-operator'],
    ] as const) {
      const line = out.split('\n').find((l) => l.startsWith(`  ${id} `));
      expect(line, id).toBeDefined();
      expect(line, id).toContain(cmd);
      expect(line!.includes('[password on stdin]'), id).toBe(cred);
    }
  });
});

describe('the cutover log', () => {
  // Defect caught: a section added after the sitting's (pass 2's records)
  // refusing every later pass-1 run, or a row landing under the wrong heading.
  it('writes a row inside the sitting section when a later section follows it', () => {
    writeFileSync(logReal, LOG_HEAD + [
      '', '## 9. Production-readiness sitting', '', 'One row per step.', '',
      '| Started (UTC) | Finished (UTC) | Target | Step | Command | Result | Notes |', '|---|---|---|---|---|---|---|',
      // A later pass keeps its own table, so a row must not land in it.
      '', '## 10. Pass 2', '', 'Later records.', '',
      '| Started (UTC) | Step | Result |', '|---|---|---|', '| 2026-12-01T00:00:00Z | P2-1 | ok |', '',
    ].join('\n'));
    const r = sit(['--target', 'production', '--from-step', 'p02a', '--to-step', 'p02a']);
    expect(r.status, r.out).toBe(0);
    const text = log();
    const rowAt = text.indexOf('| production | p02a |');
    expect(rowAt).toBeGreaterThan(text.indexOf('## 9. Production-readiness sitting'));
    expect(rowAt).toBeLessThan(text.indexOf('## 10. Pass 2'));
  });
});

describe('the run lock, the mute on any exit, and lapsed rows', () => {
  const tmp = () => { const t = join(dir, 'tmp'); mkdirSync(t, { recursive: true }); return t; };
  const lockDir = () => {
    const hash = createHash('sha256').update(`${realpathSync(logReal)}\n`).digest('hex').slice(0, 16);
    return join(tmp(), `footbag-sitting-${hash}.lock`);
  };

  // Defect caught: two sitting runs at once interleaving their steps and
  // rewriting the log over each other's rows.
  it('refuses while another live run holds the log, writing nothing', () => {
    mkdirSync(lockDir(), { recursive: true });
    writeFileSync(join(lockDir(), 'pid'), `${process.pid}\n`);
    const r = sit(['--target', 'staging', '--to-step', 's01a'], [], { env: { TMPDIR: tmp() } });
    expect(r.status).toBe(1);
    expect(r.out).toContain(`process ${process.pid}`);
    expect(stepCalls()).toEqual([]);
    expect(log()).toBe(LOG_HEAD);
  });

  // Defect caught: a run killed outright leaving a lock no later run can pass.
  it('takes over the lock of a run that is gone, and releases its own at the end', () => {
    const gone = spawnSync('true', [], SPAWN_GUARD).pid!;
    mkdirSync(lockDir(), { recursive: true });
    writeFileSync(join(lockDir(), 'pid'), `${gone}\n`);
    const r = sit(['--target', 'staging', '--to-step', 's01a'], [], { env: { TMPDIR: tmp() } });
    expect(r.status, r.out).toBe(0);
    expect(rows().map((c) => c[3])).toEqual(['s01a']);
    expect(existsSync(lockDir())).toBe(false);
  });

  // Defect caught: an interrupt during a heavy step leaving its alarms muted
  // for hours, so a real outage then sends no mail.
  it('lifts the mute when a heavy step is interrupted', () => {
    const stub = join(root, 'scripts', 'bootstrap-host.sh');
    // The heavy step holds on a pipe nobody writes, so the interrupt always
    // lands while it runs; its read gives up on its own so the run can end.
    const hold = join(dir, 'hold');
    expect(spawnSync('mkfifo', [hold], SPAWN_GUARD).status).toBe(0);
    writeFileSync(stub, `#!/usr/bin/env bash\n[[ "$*" == *--restore-database* ]] && read -r -t 4 _ <> ${JSON.stringify(hold)}\n${readFileSync(stub, 'utf-8').replace(/^#!.*\n/, '')}`);
    const r = sit(['--target', 'staging', '--from-step', 's11k', '--to-step', 's11k'], [], { wrap: 'timeout --preserve-status -s INT 2' });
    expect(r.status).toBe(130);
    const all = stepCalls().map((c) => c.call);
    const muted = all.indexOf('scripts/mute-expected-alarms.sh --target staging --minutes 240');
    expect(muted).toBeGreaterThan(-1);
    expect(all.indexOf('scripts/mute-expected-alarms.sh --target staging --clear')).toBeGreaterThan(muted);
    expect(rows().at(-1)!.slice(3, 6)).toEqual(['s11k', expect.any(String), 'interrupted']);
  });

  // Defect caught: a staging command run from the production list recorded as
  // though it acted on production.
  it('says in the notes when a step\'s command acts on the other environment, and still finds the row', () => {
    sit(['--target', 'production', '--from-step', 'p14c', '--to-step', 'p15a']);
    const byId = Object.fromEntries(rows().map((c) => [c[3], c]));
    expect(byId.p14c[2]).toBe('production');
    expect(byId.p14c[6]).toContain('runs against staging');
    expect(byId.p15a[6]).not.toContain('runs against');
    const s = sit(['--target', 'production', '--from-step', 'p14c', '--to-step', 'p14c', '--status']);
    expect(s.out).not.toMatch(/p14c +NOT RUN/);
  });

  // Defect caught: a row recorded by code that has since changed, or by no
  // known code at all, read as proof the step is done.
  it('reads a row as lapsed when it names no commit or what it ran has changed, and not otherwise', () => {
    sit(['--target', 'staging', '--to-step', 's01a']);
    expect(sit(['--target', 'staging', '--to-step', 's01a', '--status']).out).toMatch(/s01a +RECORDED ok/);
    writeFileSync(join(root, 'scripts', 'arming.sh'), readFileSync(join(root, 'scripts', 'arming.sh'), 'utf-8') + '# changed\n');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qam', 'unrelated change');
    expect(sit(['--target', 'staging', '--to-step', 's01a', '--status']).out).toMatch(/s01a +RECORDED ok/);
    const baseline = join(root, 'scripts', 'apply-account-baseline.sh');
    writeFileSync(baseline, readFileSync(baseline, 'utf-8') + '# changed\n');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qam', 'the step\'s own script changed');
    expect(sit(['--target', 'staging', '--to-step', 's01a', '--status']).out).toMatch(/s01a +LAPSED \(what it runs changed since [0-9a-f]{8}\)/);
    writeFileSync(logReal, log().replace(/\| at [0-9a-f]{40}, \d+ uncommitted, tree [0-9a-f]{12}[^|]*\|/, '|  |'));
    expect(sit(['--target', 'staging', '--to-step', 's01a', '--status']).out).toMatch(/s01a +LAPSED \(the row names no commit\)/);
  });

  // Defect caught: a switch read that passes whichever way the switch reads.
  it('fails the staging arming reads on the wrong state', () => {
    writeRules([{ match: 'scripts/arming.sh --target staging --status', stdout: 'tfvars (x.tfvars): payments_armed = armed\\nSSM  (/footbag/staging/app/payments_armed): armed' }]);
    const r = sit(['--target', 'staging', '--from-step', 's08a', '--to-step', 's08e']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT s08c/);
  });

  // Defect caught: the denial check recorded ok while refusals rest only on
  // nothing granting the action.
  it('fails the dev-and-tester denial read without its no-findings line', () => {
    writeRules([{ match: 'scripts/verify-dev-tester-role-denials.sh *', stdout: '' }]);
    const r = sit(['--target', 'production', '--from-step', 'p07o', '--to-step', 'p07o']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/VERDICT: STOPPED AT p07o/);
  });

  // Defect caught: a production host or workstation read run for the first
  // time on production, never proved on staging.
  it('runs every production host read on staging first', () => {
    const staging = spawnSync('bash', [SCRIPT, '--target', 'staging', '--dry-run'], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout;
    for (const cmd of [
      'scripts/check-versions.sh',
      'scripts/step-amazon-linux.sh --target staging --status',
      'scripts/harden-sshd.sh --target staging --expect-hardened',
      'scripts/verify-host-env.sh --target staging',
      'scripts/verify-replication.sh --target staging',
      'npm run test:deployed -- --target staging',
      'scripts/verify-captcha-outage-alarm.sh --target staging',
    ]) expect(staging, cmd).toContain(cmd);
  });
});
