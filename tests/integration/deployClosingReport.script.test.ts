/**
 * The deploy family ends with one closing report that lists every error and
 * warning the run met, the host half's included.
 *
 * Contract: the entry point an operator types (deploy_to_aws.sh), the
 * orchestrator and the leaves each run their child as a child, never exec'd into,
 * so the outermost run prints the only report and every nested run's problems are
 * in it. A problem a step meets and tolerates is a warning in that report with the
 * tool's own words, never one line in the middle of the output. The host halves
 * mark what they meet through the remote report library: a failed read of an
 * optional Parameter Store value is an error unless the parameter does not exist,
 * a failed stop never lets the database be replaced under a running service, a
 * free-space read that fails is an error rather than a skipped check, and a
 * change the deploy made to the host's container runtime is listed.
 *
 * Each stretch under test is lifted from the shipped file by its own first and
 * last lines and run against stand-in tools, so the code driven is the shipped
 * code. Nothing reaches a host or AWS.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const REPORT_LIB = join(REPO_ROOT, 'scripts/lib/closing-report.sh');
const REMOTE_REPORT_LIB = join(REPO_ROOT, 'scripts/lib/closing-report-remote.sh');
const REPORT_LIBS = ['closing-report.sh', 'closing-report-remote.sh', 'verdict-banner.sh'];
const scratch = createScratchDir('deploy-closing-report');
afterAll(() => removeScratch(scratch));
let seq = 0;

const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

/** The lines of `rel` from the one starting `first` to the one starting `last`, inclusive. */
function stretch(rel: string, first: string, last: string): string {
  const lines = read(rel).split('\n');
  const start = lines.findIndex((l) => l.startsWith(first));
  expect(start, `${rel}: no line starts with ${first}`).toBeGreaterThan(-1);
  const end = lines.findIndex((l, i) => i > start && l.startsWith(last));
  expect(end, `${rel}: no line after ${first} starts with ${last}`).toBeGreaterThan(start);
  return lines.slice(start, end + 1).join('\n');
}

function world(): string {
  const dir = join(scratch, `world-${++seq}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runScript(dir: string, body: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}) {
  const file = join(dir, 'harness.sh');
  writeFileSync(file, body.join('\n') + '\n');
  const env: NodeJS.ProcessEnv = { ...process.env, ...(opts.env ?? {}) };
  delete env.FOOTBAG_CR_REPORT_TO;
  const res = spawnSync('bash', [file], { cwd: dir, encoding: 'utf8', input: opts.input ?? '', env, ...SPAWN_GUARD });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** The closing report at the end of stderr, or '' when none was printed. */
function report(stderr: string): string {
  const at = stderr.indexOf('==== Closing report');
  return at < 0 ? '' : stderr.slice(at);
}

/** A script on the report library that warns, records its stdin's first line, and exits `code`. */
function childOnLibrary(path: string, libDir: string, warning: string, stdinLog: string, code = 0): void {
  writeFileSync(path, [
    `source ${JSON.stringify(join(libDir, 'closing-report.sh'))}`,
    `IFS= read -r line || line=""; printf '%s\\n' "$line" > ${JSON.stringify(stdinLog)}`,
    `cr_warn ${JSON.stringify(warning)}`,
    code === 0 ? 'cr_finish' : `exit ${code}`,
  ].join('\n') + '\n');
  chmodSync(path, 0o755);
}

describe('deploy_to_aws.sh hands off to the orchestrator as a child', () => {
  const HANDOFF_FROM = '_orchestrator_rc=0';

  function drive(typed: boolean, orchestratorExit = 0) {
    const dir = world();
    const stdinLog = join(dir, 'orchestrator-stdin');
    const orchestrator = join(dir, 'deploy-to-aws.sh');
    childOnLibrary(orchestrator, join(REPO_ROOT, 'scripts/lib'), 'orchestrator warning', stdinLog, orchestratorExit);
    const credential = join(dir, 'credential');
    writeFileSync(credential, 'file-password\n');
    const lines = read('deploy_to_aws.sh').split('\n');
    const start = lines.indexOf(HANDOFF_FROM);
    expect(start, 'the hand-off was not found in the wrapper').toBeGreaterThan(-1);
    const res = runScript(dir, [
      'set -euo pipefail',
      `source ${JSON.stringify(REPORT_LIB)}`,
      `ORCHESTRATOR=${JSON.stringify(orchestrator)}`,
      `PROD_PASSWORD_TYPED=${typed ? 1 : 0}; _PROD_SUDO_PASS=typed-password`,
      `OPERATOR_CREDENTIAL_FILE=${JSON.stringify(credential)}`,
      'PROD_MEDIA_ARGS=()',
      ...lines.slice(start),
    ]);
    return { ...res, passed: existsSync(stdinLog) ? readFileSync(stdinLog, 'utf8') : '' };
  }

  // Defect caught: the wrapper exec'ing into the orchestrator, so its exit
  // handling never runs, no closing report prints, and every problem the
  // orchestrator and the leaves recorded is folded into a list nobody reads.
  it.each([true, false])('prints the one closing report, listing the orchestrator\'s warning (typed password: %s)', (typed) => {
    const r = drive(typed);
    expect(r.status, r.stderr).toBe(0);
    expect(r.passed).toBe(typed ? 'typed-password\n' : 'file-password\n');
    expect(r.stderr.match(/==== Closing report: /g) ?? []).toHaveLength(1);
    expect(report(r.stderr)).toMatch(/==== Closing report: harness\.sh ====\nWarnings \(1\):\n {2}- deploy-to-aws\.sh: orchestrator warning/);
  });

  // Defect caught: a failed deploy reported as done, or its exit status lost.
  it('fails with the orchestrator\'s status, and lists it as an error', () => {
    const r = drive(false, 5);
    expect(r.status).toBe(5);
    expect(report(r.stderr)).toMatch(/Errors \(\d+\):[\s\S]*the deploy \(scripts\/deploy-to-aws\.sh\) exited 5/);
    expect(report(r.stderr)).toMatch(/deploy-to-aws\.sh: orchestrator warning/);
  });
});

describe('the orchestrator lists the leaf\'s problems in its own report', () => {
  // Defect caught: the leaf printing a report of its own that the orchestrator's
  // output then follows, or the leaf's warning missing from the one report.
  it('folds a leaf warning into its report and prints no second one', () => {
    const dir = world();
    mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
    for (const lib of REPORT_LIBS) copyFileSync(join(REPO_ROOT, 'scripts/lib', lib), join(dir, 'scripts/lib', lib));
    copyFileSync(join(REPO_ROOT, 'scripts/deploy-to-aws.sh'), join(dir, 'scripts/deploy-to-aws.sh'));
    const stdinLog = join(dir, 'leaf-stdin');
    childOnLibrary(join(dir, 'scripts/deploy-code.sh'), join(dir, 'scripts/lib'), 'leaf warning', stdinLog);
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.DEPLOY_TARGET;
    delete env.FOOTBAG_CR_REPORT_TO;
    const res = spawnSync('bash', [join(dir, 'scripts/deploy-to-aws.sh'), '-k'], {
      encoding: 'utf8', input: 'fake-pw\n', env, ...SPAWN_GUARD,
    });
    expect(res.status, res.stderr).toBe(0);
    expect(readFileSync(stdinLog, 'utf8')).toBe('fake-pw\n');
    expect((res.stderr ?? '').match(/==== Closing report: /g) ?? []).toHaveLength(1);
    expect(report(res.stderr ?? '')).toMatch(/==== Closing report: deploy-to-aws\.sh ====\nWarnings \(1\):\n {2}- deploy-code\.sh: leaf warning/);
  });
});

describe('deploy_to_aws.sh tells an unreadable database from schema drift', () => {
  function drive(db: 'garbage' | 'matching') {
    const dir = world();
    mkdirSync(join(dir, 'database'));
    writeFileSync(join(dir, 'database/schema.sql'), 'CREATE TABLE members (id TEXT PRIMARY KEY);\n');
    if (db === 'garbage') {
      writeFileSync(join(dir, 'database/footbag.db'), 'this is not a database\n'.repeat(200));
    } else {
      spawnSync('sqlite3', [join(dir, 'database/footbag.db'), 'CREATE TABLE members (id TEXT PRIMARY KEY);'], SPAWN_GUARD);
    }
    return runScript(dir, [
      'set -euo pipefail',
      `source ${JSON.stringify(REPORT_LIB)}`,
      'MODE_REUSE=1',
      stretch('deploy_to_aws.sh', '# Schema-drift preflight', '# Operator credential source'),
      'echo REACHED-PAST-DRIFT-CHECK',
    ]);
  }

  // Defect caught: a database file that cannot be opened read as having no
  // tables, so the operator is told every table is missing and sent to rebuild,
  // when the real problem is the file itself.
  it('reports a database it cannot open as unreadable, with sqlite\'s words, not as drift', () => {
    const r = drive('garbage');
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('REACHED-PAST-DRIFT-CHECK');
    expect(report(r.stderr)).toMatch(/Errors \(\d+\):\n {2}- database\/footbag\.db could not be read, so its schema was not compared with database\/schema\.sql: .*not a database/);
    expect(r.stderr).not.toMatch(/out of sync/);
  });

  it('passes a readable database whose schema matches', () => {
    const r = drive('matching');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('REACHED-PAST-DRIFT-CHECK');
  });
});

describe.each(['scripts/deploy-code.sh', 'scripts/deploy-rebuild.sh'])('%s lists a failed disk reclaim', (leaf) => {
  /**
   * The stand-in ssh runs the stream as the host would: sudo takes the first
   * line, and a shell runs the rest, with stand-in docker and journalctl ahead
   * on PATH. The stand-in docker fails with `dockerExit`.
   */
  function drive(dockerExit: number) {
    const dir = world();
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'journalctl'), '#!/usr/bin/env bash\necho "Vacuuming done"\n');
    writeFileSync(join(bin, 'docker'), [
      '#!/usr/bin/env bash',
      `[[ ${dockerExit} == 0 ]] && { echo "Total reclaimed space: 0B"; exit 0; }`,
      `echo "Error response from daemon: fixture daemon unavailable" >&2; exit ${dockerExit}`,
      '',
    ].join('\n'));
    chmodSync(join(bin, 'journalctl'), 0o755);
    chmodSync(join(bin, 'docker'), 0o755);
    return runScript(dir, [
      'set -euo pipefail',
      `source ${JSON.stringify(REPORT_LIB)}`,
      'REMOTE=footbag-staging; SUDO_PASS=fixture-password; SSH_OPTS=()',
      `REMOTE_REPORT_LIB=${JSON.stringify(REMOTE_REPORT_LIB)}`,
      `ssh() { local pass; IFS= read -r pass; PATH=${JSON.stringify(bin)}:"$PATH" bash; }`,
      'send_images_to_host() { echo IMAGES-SENT; }',
      stretch(leaf, '  reclaim_host_disk() {', '  send_images_to_host'),
      'cr_finish',
    ]);
  }

  // Defect caught: the reclaim failing, the deploy carrying on, and the warning
  // printed once in the middle of the image transfer, so the host's disk keeps
  // filling until a later load fails with no space left.
  it('carries on and lists the failure as a warning with the tool\'s message', () => {
    const r = drive(1);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('IMAGES-SENT');
    const rep = report(r.stderr);
    expect(rep).not.toMatch(/Errors \(/);
    expect(rep).toMatch(/Warnings \(\d+\):\n {2}- host disk reclaim on footbag-staging \(the deploy continued\): dangling images: exit 1: Error response from daemon: fixture daemon unavailable/);
  });

  it('lists nothing when the reclaim succeeds', () => {
    const r = drive(0);
    expect(r.status, r.stderr).toBe(0);
    expect(report(r.stderr)).toMatch(/No errors or warnings\./);
  });
});

describe('scripts/deploy-rebuild.sh ends on its report', () => {
  // Defect caught: the warning that the live database was replaced printed after
  // the completion message, where the closing report would push it off the
  // screen, and missing from the report the operator reads.
  it('lists the replaced database in the closing report, with nothing printed after it', () => {
    const dir = world();
    const r = runScript(dir, [
      'set -euo pipefail',
      `source ${JSON.stringify(REPORT_LIB)}`,
      'REMOTE=footbag-staging; FOOTBAG_ENV=staging; HOST_IP=192.0.2.1',
      stretch('scripts/deploy-rebuild.sh', 'echo "Deploy complete."', 'cr_finish'),
      'echo AFTER-THE-REPORT',
    ]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('AFTER-THE-REPORT');
    expect(r.stdout).not.toMatch(/WARNING/);
    expect(report(r.stderr)).toMatch(/Warnings \(1\):\n {2}- the live database on footbag-staging was replaced from scratch/);
  });
});

const HALVES = ['scripts/internal/deploy-code-remote.sh', 'scripts/internal/deploy-rebuild-remote.sh'];

describe.each(HALVES)('%s reads optional Parameter Store values', (half) => {
  // The aws error lines are the CLI's own form for these two outcomes.
  const NOT_FOUND = 'An error occurred (ParameterNotFound) when calling the GetParameter operation: ';
  const DENIED = 'An error occurred (AccessDeniedException) when calling the GetParameter operation: fixture-denied';

  function drive(outcome: 'missing' | 'denied' | 'present') {
    const dir = world();
    const lines = read(half).split('\n');
    const start = lines.findIndex((l) => l.startsWith('ssm_read_optional() {'));
    expect(start, 'the optional reader was not found').toBeGreaterThan(-1);
    const end = lines.findIndex((l, i) => i > start && l.startsWith('env_tmp=$(mktemp /srv/footbag/.env.tmp.XXXXXX)'));
    expect(end).toBeGreaterThan(start);
    const aws = {
      missing: `echo ${JSON.stringify(NOT_FOUND)} >&2; return 254`,
      denied: `echo ${JSON.stringify(DENIED)} >&2; return 254`,
      present: 'printf "https://archive.example.invalid"',
    }[outcome];
    return runScript(dir, [
      'set -euo pipefail',
      `source ${JSON.stringify(REMOTE_REPORT_LIB)}`,
      'FOOTBAG_ENV_VAL=staging; AWS_PROFILE_VAL=fixture; AWS_REGION_VAL=us-east-1',
      `aws() { ${aws}; }`,
      ...lines.slice(start, end),
      'echo "REACHED ARCHIVE_URL=${ARCHIVE_URL_VAL}"',
    ]);
  }

  // Defect caught: a read that failed for a credential or network reason taken
  // as "no parameter", so the deploy clears the host's archive address and hides
  // a working archive, and reports success.
  it('stops with an error carrying the aws message when the read fails for any other reason', () => {
    const r = drive('denied');
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('REACHED');
    expect(r.stderr).toMatch(/^---FOOTBAG-PROBLEM--- ERROR could not read \/footbag\/staging\/app\/archive_url from Parameter Store \(exit 254\): .*AccessDeniedException/m);
  });

  it('reads a parameter that does not exist as absent', () => {
    const r = drive('missing');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('REACHED ARCHIVE_URL=\n');
    expect(r.stderr).not.toContain('---FOOTBAG-PROBLEM---');
  });

  it('reads a parameter that exists as its value', () => {
    const r = drive('present');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('REACHED ARCHIVE_URL=https://archive.example.invalid\n');
  });
});

describe.each(HALVES)('%s lists the awslogs drop-in it installed', (half) => {
  // Defect caught: a deploy that restarted the host's docker daemon saying so in
  // one line among hundreds, so the restart is missing from the closing report.
  it('marks the install and docker restart as a warning', () => {
    const dir = world();
    const r = runScript(dir, [
      'set -euo pipefail',
      `source ${JSON.stringify(REMOTE_REPORT_LIB)}`,
      'install() { :; }',
      'systemctl() { echo "systemctl $*"; }',
      `awslogs_dropin_tmp=${JSON.stringify(join(dir, 'dropin'))}`,
      `printf 'fixture drop-in %s\\n' "${dir}" > "$awslogs_dropin_tmp"`,
      stretch(half, 'if ! cmp -s "$awslogs_dropin_tmp"', 'rm -f "$awslogs_dropin_tmp"'),
      'echo REACHED',
    ]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('systemctl restart docker');
    expect(r.stderr).toMatch(/^---FOOTBAG-PROBLEM--- WARN installed the dockerd awslogs drop-in and restarted docker/m);
  });
});

describe('scripts/internal/deploy-rebuild-remote.sh stops before replacing the database', () => {
  const HALF = 'scripts/internal/deploy-rebuild-remote.sh';

  function driveStop(running: boolean, downFails = false) {
    const dir = world();
    return runScript(dir, [
      'set -euo pipefail',
      `source ${JSON.stringify(REMOTE_REPORT_LIB)}`,
      'DB_PATH=/srv/footbag/db/footbag.db',
      `systemctl() { case "$1" in stop) echo "Failed to stop footbag.service: Transaction for footbag.service/stop is destructive" >&2; return 1 ;; is-active) return ${running ? 0 : 3} ;; esac; }`,
      `compose_cmd() { case "$1" in down) ${downFails ? 'echo "fixture compose down failed" >&2; return 1' : 'return 0'} ;; ps) ${running ? 'echo running-container-id' : ':'} ;; esac; }`,
      stretch(HALF, '# The database is replaced only under a stopped service', 'printf \'%s\\n\' "${down_out:-}"'),
      'echo REACHED-DB-REPLACE',
    ]);
  }

  // Defect caught: a stop that failed swallowed, and the database replaced under
  // a service still writing to it, which is how the replace becomes corruption.
  it('refuses the replace with systemd\'s message when the service is still running', () => {
    const r = driveStop(true);
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('REACHED-DB-REPLACE');
    expect(r.stderr).toMatch(/^---FOOTBAG-PROBLEM--- ERROR footbag\.service did not stop, so the database was not replaced under a running service: Failed to stop footbag\.service/m);
  });

  // A fresh host has no unit yet, so the stop fails with nothing running.
  it('goes ahead, with a warning, when the stop failed but nothing is running', () => {
    const r = driveStop(false);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('REACHED-DB-REPLACE');
    expect(r.stderr).toMatch(/^---FOOTBAG-PROBLEM--- WARN systemctl stop footbag failed, but the service is not running/m);
  });

  function driveDf(df: string) {
    const dir = world();
    return runScript(dir, [
      'set -euo pipefail',
      `source ${JSON.stringify(REMOTE_REPORT_LIB)}`,
      `df() { ${df}; }`,
      stretch(HALF, 'SRV_DF_OUT=', 'fi'),
      'if (( SRV_AVAIL_KB < 512000 )); then echo LOW; fi',
      'echo "REACHED avail=${SRV_AVAIL_KB}"',
    ]);
  }

  // Defect caught: a free-space read that failed leaving an empty number, which
  // skipped the check and replaced the database on a disk nobody measured.
  it('stops with an error when it cannot measure the free space', () => {
    const r = driveDf('echo "df: /srv/footbag: No such file or directory" >&2; return 1');
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('REACHED');
    expect(r.stderr).toMatch(/^---FOOTBAG-PROBLEM--- ERROR could not measure the free space on \/srv\/footbag.*No such file or directory/m);
  });

  it('reads the free space when df answers', () => {
    const r = driveDf("printf ' Avail\\n 9000000\\n'");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('REACHED avail=9000000');
  });
});
