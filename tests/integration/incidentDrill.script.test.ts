/**
 * The staging incident drill as one run: induce an origin outage, see the edge
 * fail and the alarm fire, capture diagnostics, draft the member notice, recover
 * by restart, prove health, and write the drill up.
 *
 * What these pin: the drill refuses production, a staging that is already
 * unhealthy, an unannounced or unconfirmed start, and stops nothing in those
 * cases; a full run takes the steps in the incident flow's order, hands the
 * password only on stdin, and writes a postmortem naming the induced failure,
 * the commands, who received the alarm and the drafted notice; a drill that
 * stops part way still restarts staging; and no earlier write-up is
 * overwritten. The root-side stop body runs here with docker stubbed.
 *
 * Every child script, curl, ssh and terraform is a stand-in. The stand-in edge
 * answers 502 from the moment the stop session reaches the host until the
 * restart runs, so the run is judged on what it reads back.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/incident-drill.sh');
const REMOTE_HALF = join(process.cwd(), 'scripts/internal/incident-drill-stop-remote.sh');
const REPORT_LIB = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');
const PASSWORD = 'fixture-sudo-password';
const ALARM = 'footbag-staging-site-unavailable';

let dir: string;
let bin: string;
let calls: string;
let sessions: string;
let marker: string;
let postmortems: string;
let cred: string;

/** A stand-in that logs "<name> <args>\t<stdin is a tty>\t<stdin line 1>". */
function stub(name: string, body: string): string {
  const path = join(bin, name);
  writeFileSync(path, [
    '#!/usr/bin/env bash',
    'tty=0; [ -t 0 ] && tty=1',
    'line=""; if [ "$tty" = 0 ]; then IFS= read -r line || line=""; fi',
    `printf '%s\\t%s\\t%s\\n' "${name} $*" "$tty" "$line" >> ${JSON.stringify(calls)}`,
    body,
  ].join('\n'));
  chmodSync(path, 0o755);
  return path;
}

beforeEach(() => {
  dir = createScratchDir('footbag-test-incident-drill');
  bin = join(dir, 'bin');
  mkdirSync(bin);
  calls = join(dir, 'calls.log');
  sessions = join(dir, 'sessions.log');
  marker = join(dir, 'origin-stopped');
  postmortems = join(dir, 'postmortems');
  mkdirSync(postmortems);
  cred = join(dir, 'AWS_OPERATOR.txt');
  writeFileSync(cred, `${PASSWORD}\n`, { mode: 0o600 });

  // The alarm answers by what it is asked: the precondition read, the wait for
  // ALARM, and the wait for OK after recovery.
  stub('send-test-alarm.sh', [
    'case "$*" in',
    '  *"--expect ALARM"*) exit "${ALARM_RC:-0}" ;;',
    '  *--wait-minutes*) exit "${CLEAR_RC:-0}" ;;',
    '  *) exit "${PRE_RC:-0}" ;;',
    'esac',
  ].join('\n'));
  stub('host-diagnostics.sh', 'echo "diagnostics output for ${3}"; exit "${DIAG_RC:-0}"');
  // The restart brings the origin back unless told to fail; RESTART_RCS gives
  // the exit for each successive call.
  stub('restart-host.sh', [
    `n=$(grep -c '^restart-host.sh ' ${JSON.stringify(calls)})`,
    'IFS=, read -r -a rcs <<<"${RESTART_RCS:-0}"',
    'rc="${rcs[$((n - 1))]:-${rcs[-1]}}"',
    `[ "$rc" = 0 ] && rm -f ${JSON.stringify(marker)}`,
    'exit "$rc"',
  ].join('\n'));
  writeFileSync(join(bin, 'curl'), [
    '#!/usr/bin/env bash',
    'if [ -n "${CURL_FORCE:-}" ]; then printf "%s" "$CURL_FORCE"',
    `elif [ -e ${JSON.stringify(marker)} ]; then printf 502`,
    'else printf 200; fi',
  ].join('\n'));
  chmodSync(join(bin, 'curl'), 0o755);
  writeFileSync(join(bin, 'terraform'), '#!/usr/bin/env bash\necho edge.example.invalid\n');
  chmodSync(join(bin, 'terraform'), 0o755);
  // The host: answers the alias lookup and the identity question; any other
  // session is the stop, which is recorded and takes the origin down.
  writeFileSync(join(bin, 'ssh'), [
    '#!/usr/bin/env bash',
    hostIdentityAnswer(),
    'for a in "$@"; do',
    '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.30\\nuser footbag\\n"; exit 0; fi',
    'done',
    `cat >> ${JSON.stringify(sessions)}`,
    `touch ${JSON.stringify(marker)}`,
    'exit "${STOP_RC:-0}"',
  ].join('\n'));
  chmodSync(join(bin, 'ssh'), 0o755);
  writeFileSync(join(dir, 'pin'), '[203.0.113.30]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
});

afterEach(() => {
  removeScratch(dir);
});

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...awsIdentityStubEnv(dir),
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    FOOTBAG_KNOWN_HOSTS: join(dir, 'pin'),
    TF_OUTPUT_BIN: join(bin, 'terraform'),
    INCIDENT_DRILL_ALARM_SCRIPT: join(bin, 'send-test-alarm.sh'),
    INCIDENT_DRILL_DIAGNOSTICS: join(bin, 'host-diagnostics.sh'),
    INCIDENT_DRILL_RESTART: join(bin, 'restart-host.sh'),
    INCIDENT_DRILL_CURL_BIN: join(bin, 'curl'),
    INCIDENT_DRILL_POSTMORTEM_DIR: postmortems,
    INCIDENT_DRILL_POLL_TRIES: '3',
    INCIDENT_DRILL_POLL_SECS: '0',
    INCIDENT_DRILL_WAIT_MINUTES: '1',
    ...extra,
  };
}

/** The script at a terminal, with the password on stdin and `answers` typed. */
function drill(args: string[], answers: string[], extra: Record<string, string> = {}) {
  const inner = `bash ${JSON.stringify(SCRIPT)} ${args.join(' ')} < ${JSON.stringify(cred)}; echo "EXIT=$?"`;
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: answers.map((a) => `${a}\n`).join(''),
    env: env(extra),
    ...SPAWN_GUARD,
  });
  const out = r.stdout ?? '';
  const m = out.match(/EXIT=(\d+)/);
  return { status: m ? Number(m[1]) : -1, out };
}

interface Call { call: string; tty: boolean; line: string }
function logged(): Call[] {
  if (!existsSync(calls)) return [];
  return readFileSync(calls, 'utf-8').split('\n').filter(Boolean).map((l) => {
    const [call, tty, line] = l.split('\t');
    return { call, tty: tty === '1', line: line ?? '' };
  });
}
const first = (re: RegExp) => logged().findIndex((c) => re.test(c.call));
const count = (re: RegExp) => logged().filter((c) => re.test(c.call)).length;
const stopped = () => existsSync(sessions) && readFileSync(sessions, 'utf-8').includes('compose stop web');
const writeups = () => readdirSync(postmortems).filter((f) => f.endsWith('.md'));

// The operator answers three things: the announcement, the APPLY, and whether
// the ALARM email arrived. Everything else the drill writes itself.
const FULL = ['yes', 'APPLY', 'yes'];

describe('refusals before anything is stopped', () => {
  // Defect caught: an operator rehearses on production and takes the public
  // site down to practise.
  it('refuses production, and accepts staging', () => {
    const r = drill(['--target', 'production'], FULL);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('staging only');
    expect(stopped()).toBe(false);
    expect(logged()).toEqual([]);

    expect(drill(['--target', 'staging'], FULL).status).toBe(0);
    expect(stopped()).toBe(true);
  });

  // Defect caught: a drill started over a real fault, which hides the fault
  // and makes the drill's alarm and timings meaningless.
  it.each([
    ['the edge is already failing', { CURL_FORCE: '503' }],
    ['the alarm is not OK', { PRE_RC: '3' }],
  ])('refuses when %s, and stops nothing', (_label, extra) => {
    const r = drill(['--target', 'staging'], FULL, extra);
    expect(r.status).not.toBe(0);
    expect(stopped()).toBe(false);
    expect(count(/^restart-host\.sh /)).toBe(0);
    expect(writeups()).toEqual([]);
  });

  // Defect caught: the site taken down before the watchers were told, so the
  // alarm is mistaken for a real outage; or a stray word accepted as consent.
  it.each([
    ['a "no" to the announcement', ['no']],
    ['a word other than APPLY', ['yes', 'apply']],
  ])('stops nothing on %s', (_label, answers) => {
    const r = drill(['--target', 'staging'], answers);
    expect(r.status).not.toBe(0);
    expect(stopped()).toBe(false);
    expect(count(/^restart-host\.sh /)).toBe(0);
  });

  // Defect caught: a drill run with no private checkout linked, which would
  // take staging down and then have nowhere to record it.
  it('refuses with no write-up directory, before stopping anything', () => {
    const r = drill(['--target', 'staging'], FULL, { INCIDENT_DRILL_POSTMORTEM_DIR: join(dir, 'absent') });
    expect(r.status).not.toBe(0);
    expect(stopped()).toBe(false);
  });
});

describe('a full drill', () => {
  // Defect caught: steps out of the incident flow's order (diagnostics after
  // the restart destroy the evidence), the password in argv or missing from
  // the restart, or a write-up missing what the drill must record.
  it('takes every step in order and writes the drill up', () => {
    const r = drill(['--target', 'staging'], FULL);
    expect(r.status, r.out).toBe(0);

    for (const c of logged()) expect(c.call, c.call).not.toContain(PASSWORD);
    const restart = logged().find((c) => c.call.startsWith('restart-host.sh '))!;
    expect(restart.call).toBe('restart-host.sh --target staging');
    expect(restart.line).toBe(PASSWORD);
    expect(readFileSync(sessions, 'utf-8').split('\n')[0]).toBe(PASSWORD);

    const alarmFired = first(/^send-test-alarm\.sh .*--expect ALARM/);
    expect(alarmFired).toBeGreaterThan(-1);
    expect(logged()[alarmFired].call).toContain(`--alarm ${ALARM}`);
    const diag = first(/^host-diagnostics\.sh /);
    expect(alarmFired).toBeLessThan(diag);
    for (const g of ['status', 'health', 'all-logs']) {
      const at = first(new RegExp(`^host-diagnostics\\.sh --target staging ${g}$`));
      expect(at, g).toBeGreaterThan(-1);
      expect(at, g).toBeLessThan(first(/^restart-host\.sh /));
    }
    // The integrity check runs inside the web container the outage stops, so
    // run before recovery it can only fail; it runs once the restart is proved.
    expect(count(/^host-diagnostics\.sh --target staging integrity$/)).toBe(1);
    expect(first(/^host-diagnostics\.sh --target staging integrity$/)).toBeGreaterThan(first(/^restart-host\.sh /));
    expect(first(/^restart-host\.sh /)).toBeLessThan(first(/^send-test-alarm\.sh .*--expect OK --wait-minutes/));
    expect(count(/^restart-host\.sh /)).toBe(1);

    expect(writeups()).toHaveLength(1);
    expect(writeups()[0]).toMatch(/^\d{4}-\d{2}-\d{2}-staging-incident-drill\.md$/);
    const doc = readFileSync(join(postmortems, writeups()[0]), 'utf-8');
    // Classified from the edge's answer, recorded without asking.
    expect(doc).toContain('Severity as classified: SEV-1');
    expect(doc).toContain('Received by: the operations mailbox');
    expect(doc).toContain('edge answered 502');
    // The notice the drill drafts carries the four things, each as a quoted line.
    const notice = doc.split('## Member notice (drafted, not sent)')[1].split('## ')[0];
    expect(notice).toMatch(/^> .*cannot be reached/m);
    expect(notice).toMatch(/^> No payment was taken and no member data was lost or exposed\.$/m);
    expect(notice).toMatch(/^> We are working on it\.$/m);
    expect(notice).toMatch(/^> The next update comes by \d{2}:\d{2} UTC\.$/m);
    expect(doc).toContain('Every step worked as the drill ran it.');
    expect(doc).toContain('diagnostics output for all-logs');
    expect(doc).not.toContain('not reached');
    expect(doc).not.toContain(PASSWORD);
  });

  // Defect caught: an operator asked too early is forced to answer no, and an
  // email that was only slow is recorded as an alarm path that does not work.
  it('asks again after a wait, and records the email once it arrives', () => {
    const r = drill(['--target', 'staging'], ['yes', 'APPLY', 'wait', 'yes']);
    expect(r.status, r.out).toBe(0);
    const doc = readFileSync(join(postmortems, writeups()[0]), 'utf-8');
    expect(doc).toContain('Email arrived: yes');
  });

  // Defect caught: a missing alarm email recorded as reaching someone, or left
  // out of the steps that did not work, so the broken alarm path is never fixed.
  it('records an email that never arrived as reaching nobody, and lists it as a step that did not work', () => {
    const r = drill(['--target', 'staging'], ['yes', 'APPLY', 'no']);
    expect(r.status).toBe(1);
    expect(count(/^restart-host\.sh /)).toBe(1);
    const doc = readFileSync(join(postmortems, writeups()[0]), 'utf-8');
    expect(doc).toContain('Received by: nobody');
    const steps = doc.split('## Contributing factors and steps that did not work')[1].split('## ')[0];
    expect(steps).toContain(`- the ${ALARM} email did not arrive in the operations mailbox`);
  });

  // Defect caught: an earlier drill's write-up replaced by a second drill on
  // the same day, losing the record.
  it('never overwrites an earlier write-up', () => {
    // Today and tomorrow by the host's own UTC clock, so a run that crosses
    // midnight still meets an existing write-up.
    const existing = (spawnSync('date', ['-u', '+%F'], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout ?? '').trim();
    const tomorrow = (spawnSync('date', ['-u', '-d', 'tomorrow', '+%F'], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout ?? '').trim();
    for (const d of [existing, tomorrow]) writeFileSync(join(postmortems, `${d}-staging-incident-drill.md`), 'EARLIER\n');

    expect(drill(['--target', 'staging'], FULL).status).toBe(0);
    for (const d of [existing, tomorrow]) {
      expect(readFileSync(join(postmortems, `${d}-staging-incident-drill.md`), 'utf-8')).toBe('EARLIER\n');
    }
    expect(writeups().filter((f) => /-staging-incident-drill-2\.md$/.test(f))).toHaveLength(1);
  });
});

describe('a drill that goes wrong', () => {
  // Defect caught: a failed step silently passed, so a drill that found a
  // broken alarm reports success; or the write-up dropped when it is most needed.
  it('records an alarm that never fired, still recovers, and fails the run', () => {
    const r = drill(['--target', 'staging'], FULL, { ALARM_RC: '3' });
    expect(r.status).toBe(1);
    expect(r.out).toContain(`${ALARM} did not reach ALARM`);
    expect(count(/^restart-host\.sh /)).toBe(1);
    const doc = readFileSync(join(postmortems, writeups()[0]), 'utf-8');
    expect(doc).toMatch(/not reached: first signal/);
  });

  // Defect caught: a failing diagnostics command hidden behind the outage's own
  // error output, so the drill never surfaces the tool that does not work.
  it('fails the run when a diagnostics command fails', () => {
    const r = drill(['--target', 'staging'], FULL, { DIAG_RC: '1' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/host-diagnostics\.sh --target staging status failed/);
    expect(count(/^restart-host\.sh /)).toBe(1);
  });

  // Defect caught: a drill abandoned after the stop leaves staging down.
  it('restarts staging on the way out when it stops before recovery', () => {
    const r = drill(['--target', 'staging'], ['yes', 'APPLY']);
    expect(r.status).not.toBe(0);
    expect(stopped()).toBe(true);
    expect(count(/^restart-host\.sh /)).toBe(1);
    expect(existsSync(marker)).toBe(false);
  });

  // Defect caught: a restart that failed is reported as recovered, and the
  // run never tries again, leaving staging down.
  it('reports a failed restart and tries once more on the way out', () => {
    const r = drill(['--target', 'staging'], FULL, { RESTART_RCS: '1,0' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('restart-host.sh --target staging failed');
    expect(count(/^restart-host\.sh /)).toBe(2);
    expect(existsSync(marker)).toBe(false);
  });

  // Defect caught: a stop that did not take is treated as an induced outage,
  // and the drill measures nothing.
  it('ends without a write-up when the stop fails, restarting staging', () => {
    const r = drill(['--target', 'staging'], FULL, { STOP_RC: '1' });
    expect(r.status).toBe(1);
    expect(first(/^host-diagnostics\.sh /)).toBe(-1);
    expect(count(/^restart-host\.sh /)).toBe(1);
    expect(writeups()).toEqual([]);
  });
});

describe('the root-side stop', () => {
  function runHalf(extra: Record<string, string>) {
    const docker = join(bin, 'docker');
    writeFileSync(docker, [
      '#!/usr/bin/env bash',
      `echo "docker $*" >> ${JSON.stringify(calls)}`,
      'case "$*" in *" ps "*) printf "%b" "$PS_OUT" ;; esac',
      'exit 0',
    ].join('\n'));
    chmodSync(docker, 0o755);
    const envFile = join(dir, 'env');
    writeFileSync(envFile, 'FOOTBAG_ENV=staging\n');
    const r = spawnSync('bash', [], {
      encoding: 'utf-8',
      input: readFileSync(REPORT_LIB, 'utf-8') + readFileSync(REMOTE_HALF, 'utf-8'),
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, ENV_PATH: envFile, ...extra },
      ...SPAWN_GUARD,
    });
    return { status: r.status ?? -1, stderr: r.stderr ?? '' };
  }

  // Defect caught: the stop judged by compose's exit alone, so a container
  // that kept running is reported as an induced outage.
  it('stops the web container and proves it is no longer running', () => {
    expect(runHalf({ PS_OUT: 'web exited\\nnginx running\\n' }).status).toBe(0);
    expect(readFileSync(calls, 'utf-8')).toMatch(/docker compose .* stop web/);
    const r = runHalf({ PS_OUT: 'web running\\nnginx running\\n' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('still reads');
  });

  // Defect caught: a stop sent without the host env file, so compose acts on
  // whatever project it finds.
  it('refuses without the host env file', () => {
    const r = runHalf({ PS_OUT: '', ENV_PATH: join(dir, 'absent') });
    expect(r.status).toBe(1);
    expect(existsSync(calls) ? readFileSync(calls, 'utf-8') : '').not.toContain('docker');
  });
});
