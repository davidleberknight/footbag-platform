/**
 * Recovering a host that has run out of memory: a cold stop and start of its
 * Lightsail instance, then proof that the host answers.
 *
 * The stop takes the environment's site down, so every refusal is pinned to
 * leave the instance untouched, beside a run the same guard lets through. The
 * mutating path is driven end to end against a stand-in Lightsail that keeps
 * the instance's state between calls and moves it the way the real service
 * does (running to stopping to stopped, stopped to pending to running), because
 * the run's own reading of that state decides whether it starts the instance
 * and what it reports.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, rmSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';
import { requireToolInCI } from '../fixtures/toolAvailability';

const SCRIPT = join(process.cwd(), 'scripts/host-cold-restart.sh');
/** A name a restore from snapshot gives the host, so a hard-coded original name is caught. */
const INSTANCE = 'footbag-staging-web-r202610260728';

const HAS_SCRIPT = requireToolInCI('script', '--version');
const HAS_SETSID = requireToolInCI('setsid', '--version');

let work: string;
let st: string;
let bin: string;

const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const calls = () => read(join(st, 'calls.log')).split('\n').filter(Boolean);
const lightsailCalls = (sub: string) => calls().filter((l) => l.startsWith(`aws lightsail ${sub} `));
const state = () => read(join(st, 'state')).trim();
const MUTATING = ['stop-instance', 'start-instance', 'reboot-instance'];
const mutatingCalls = () => calls().filter((l) => MUTATING.some((m) => l.startsWith(`aws lightsail ${m} `)));
/** The closing report's list of what the run proved, up to what it did not. */
const provenSection = (out: string) => {
  const from = out.lastIndexOf('Proven:');
  if (from < 0) return '';
  const to = out.indexOf('Not proven:', from);
  return out.slice(from, to < 0 ? undefined : to);
};
/** The host-diagnostics proof, as the report names it once the diagnostics passed. */
const DIAG_PROOF = 'host-diagnostics status';

function exe(path: string, body: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...body].join('\n') + '\n');
  chmodSync(path, 0o755);
}

/**
 * A Lightsail holding one instance. Each state read moves an instance in
 * transit one step on, as the real service does over time, unless NEVER_STOPS
 * keeps a stop in "stopping". NO_INSTANCE answers as Lightsail does for a name
 * it does not hold. Every call is logged.
 */
function writeAwsStub(): void {
  exe(join(bin, 'aws'), [
    `S=${JSON.stringify(st)}`,
    'echo "aws $*" >> "$S/calls.log"',
    'arg() { local k="$1"; shift; while [[ $# -gt 0 ]]; do [[ "$1" == "$k" ]] && { printf "%s" "$2"; return; }; shift; done; }',
    'n="$(arg --instance-name "$@")"',
    `if [[ -n "\${NO_INSTANCE:-}" || "$n" != ${JSON.stringify(INSTANCE)} ]]; then`,
    '  echo "An error occurred (NotFoundException) when calling the $2 operation: The Instance does not exist" >&2; exit 254',
    'fi',
    's="$(cat "$S/state")"',
    'case "$2" in',
    '  get-instance-state)',
    '    echo "$s"',
    '    case "$s" in',
    '      stopping) [[ -n "${NEVER_STOPS:-}" ]] || echo stopped > "$S/state" ;;',
    '      pending) echo running > "$S/state" ;;',
    '    esac ;;',
    // A forced stop ends a stop that is stuck, as Lightsail documents --force.
    '  stop-instance)',
    '    if [[ "$s" == running ]]; then echo stopping > "$S/state";',
    '    elif [[ "$s" == stopping && " $* " == *" --force "* ]]; then echo stopped > "$S/state"; fi ;;',
    '  start-instance) [[ "$s" == stopped ]] && echo pending > "$S/state" ;;',
    '  *) echo "stand-in aws: unhandled $2" >&2; exit 2 ;;',
    'esac',
    'exit 0',
  ]);
}

beforeEach(() => {
  work = createScratchDir('host-cold-restart');
  st = join(work, 'state-dir');
  bin = join(work, 'bin');
  mkdirSync(st);
  mkdirSync(bin);
  writeFileSync(join(st, 'state'), 'running\n');
  writeAwsStub();
  // Terraform names the restored instance, as it does after a restore.
  exe(join(bin, 'terraform'), [
    `echo "terraform $*" >> ${JSON.stringify(join(st, 'calls.log'))}`,
    `[[ "$*" == *"output -raw lightsail_instance_name"* ]] && { printf %s ${JSON.stringify(INSTANCE)}; exit 0; }`,
    'exit 1',
  ]);
  // scripts/host-diagnostics.sh's stand-in: records how it was asked and the
  // state Lightsail reported at that moment, prints DIAG_OUTPUT, exits DIAG_EXIT.
  exe(join(bin, 'diagnostics'), [
    `echo "diagnostics $* state=$(cat ${JSON.stringify(join(st, 'state'))})" >> ${JSON.stringify(join(st, 'calls.log'))}`,
    'printf "%s\\n" "${DIAG_OUTPUT:-NAME STATUS}"',
    'exit "${DIAG_EXIT:-0}"',
  ]);
  exe(join(bin, 'identity'), ["printf '%s\\n' 'arn:aws:iam::041904915126:user/footbag-operator'"]);
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    HOST_COLD_RESTART_AWS_BIN: join(bin, 'aws'),
    HOST_COLD_RESTART_TERRAFORM_BIN: join(bin, 'terraform'),
    HOST_COLD_RESTART_DIAGNOSTICS: join(bin, 'diagnostics'),
    // Well above the two reads a transition takes, so only the timeout case
    // runs out of tries.
    HOST_COLD_RESTART_POLL_TRIES: '20',
    HOST_COLD_RESTART_POLL_SECS: '0',
    AWS_PROFILE: 'stub-profile',
    AWS_IDENTITY_BIN: join(bin, 'identity'),
    AWS_PROFILE_BIN: join(bin, 'identity'),
    ...extra,
  };
}

/** No terminal at all: the condition of a scheduled job or an agent session. */
function runDetached(args: string[], extra: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('setsid', ['--wait', 'bash', SCRIPT, ...args], {
    encoding: 'utf8', input: '', env: env(extra), ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

/** At a terminal, typing `typed`. */
function runAtTerminal(args: string[], typed = 'APPLY\n', extra: NodeJS.ProcessEnv = {}) {
  const inner = ['bash', JSON.stringify(SCRIPT), ...args.map((a) => JSON.stringify(a)), '</dev/null'].join(' ');
  const res = spawnSync('script', ['-qec', `${inner}; echo "EXIT=$?"`, '/dev/null'], {
    encoding: 'utf8', input: typed, env: env(extra), ...SPAWN_GUARD,
  });
  const out = res.stdout ?? '';
  const m = out.match(/EXIT=(\d+)/);
  return { status: m ? Number(m[1]) : -1, out };
}

describe.skipIf(!HAS_SETSID || !HAS_SCRIPT)('host-cold-restart.sh refusals, each beside a run the guard lets through', () => {
  it('requires a target rather than defaulting to one, and takes a named one', () => {
    // Defect caught: a forgotten flag stopping whichever environment's host a
    // default named, or a bad name reaching Lightsail at all.
    const none = runDetached([]);
    expect(none.status).toBe(2);
    const bad = runDetached(['--target', 'prod']);
    expect(bad.status).toBe(2);
    expect(calls()).toEqual([]);
    const ok = runAtTerminal(['--target', 'staging']);
    expect(ok.status, ok.out).toBe(0);
  });

  it('refuses an instance that is neither running nor part way through a cold restart, naming its state', () => {
    // Defect caught: a stop sent to a host Lightsail is already rebooting or
    // shutting down, turning one recovery into two overlapping ones.
    writeFileSync(join(st, 'state'), 'rebooting\n');
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('rebooting');
    expect(mutatingCalls()).toEqual([]);
  });

  it('refuses a name Lightsail does not hold, with Lightsail\'s own words', () => {
    // Defect caught: an unreadable instance taken for one in some other state,
    // or the reason thrown away so the operator chases the wrong cause.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { NO_INSTANCE: '1' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('NotFoundException');
    expect(mutatingCalls()).toEqual([]);
  });

  it('refuses --force-stop for an instance that is not stuck stopping, naming its state, and takes it for one that is', () => {
    // Defect caught: a forced stop sent to a running, stopped or starting host,
    // which AWS warns against, instead of the normal path or a refusal.
    for (const s of ['running', 'stopped', 'pending']) {
      writeFileSync(join(st, 'state'), `${s}\n`);
      const r = runAtTerminal(['--target', 'staging', '--force-stop']);
      expect(r.status, `${s}: ${r.out}`).toBe(1);
      expect(r.out, s).toMatch(new RegExp(`Errors \\([1-9]\\d*\\):[\\s\\S]*is ${s}`));
      expect(mutatingCalls(), s).toEqual([]);
    }
    writeFileSync(join(st, 'state'), 'stopping\n');
    const ok = runAtTerminal(['--target', 'staging', '--force-stop'], 'APPLY\n', { NEVER_STOPS: '1' });
    expect(ok.status, ok.out).toBe(0);
  });

  it('refuses a run with no terminal to confirm on', () => {
    // Defect caught: a scheduled job or agent session taking the site down.
    const r = runDetached(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(mutatingCalls()).toEqual([]);
    expect(state()).toBe('running');
  });

  it('does nothing when the typed word is anything but APPLY', () => {
    // Defect caught: a casual or lower-case answer accepted as consent to stop
    // the live host.
    const r = runAtTerminal(['--target', 'staging'], 'apply\n');
    expect(r.status).toBe(1);
    expect(mutatingCalls()).toEqual([]);
    expect(state()).toBe('running');
  });
});

describe.skipIf(!HAS_SCRIPT)('host-cold-restart.sh, the stop and start end to end', () => {
  it('stops the instance Terraform names, starts it only once stopped, and proves the host after it runs', () => {
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    // Defect caught: a stubbed run passing itself off as one against the estate.
    expect(r.out).toContain('SYNTHETIC: HOST_COLD_RESTART_AWS_BIN');
    // Defect caught: the original name hard-coded, stopping a host a restore
    // already replaced.
    expect(lightsailCalls('stop-instance')).toHaveLength(1);
    expect(lightsailCalls('stop-instance')[0]).toContain(`--instance-name ${INSTANCE}`);
    // Defect caught: a forced stop sent to a running host without being asked
    // for, which AWS warns against outside the stuck-stopping state.
    expect(lightsailCalls('stop-instance')[0]).not.toMatch(/ --force\b/);
    // Defect caught: a reboot sent instead of a cold stop and start.
    expect(calls().some((l) => l.includes('reboot-instance'))).toBe(false);
    // Defect caught: a start sent while the instance is still stopping, which
    // Lightsail refuses, or no start at all.
    const at = (needle: string) => calls().findIndex((l) => l.includes(needle));
    expect(at('start-instance')).toBeGreaterThan(at('stop-instance'));
    const stoppedRead = calls().findIndex((l, i) => i > at('stop-instance') && l.includes('get-instance-state'));
    expect(stoppedRead).toBeLessThan(at('start-instance'));
    expect(state()).toBe('running');
    // Defect caught: the proof run against a host Lightsail does not yet report
    // running, or against the other environment.
    const diag = calls().find((l) => l.startsWith('diagnostics'));
    expect(diag).toBe('diagnostics --target staging status state=running');
    expect(provenSection(r.out)).toContain(DIAG_PROOF);
  });

  it('fails, and never starts the instance, when it does not reach stopped within the wait', () => {
    // Defect caught: a start sent at an instance stuck stopping, or a run that
    // waits out its bound and then reports the restart done.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { NEVER_STOPS: '1', HOST_COLD_RESTART_POLL_TRIES: '3' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/Errors \([1-9]\d*\):/);
    expect(lightsailCalls('start-instance')).toEqual([]);
    expect(calls().some((l) => l.startsWith('diagnostics'))).toBe(false);
  });

  it('fails the run when the diagnostics fail after the restart', () => {
    // Defect caught: a restart reported done while the host still does not
    // answer, which is the state the run exists to recover from.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { DIAG_EXIT: '255' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/Errors \(1\):/);
    expect(provenSection(r.out)).not.toContain(DIAG_PROOF);
    expect(state()).toBe('running');
  });

  it('fails the run when the diagnostics print an error and still exit 0, and claims nothing they did not prove', () => {
    // Defect caught: a host problem the diagnostics printed mid-stream followed
    // by a closing report that lists the host as proved.
    const r = runAtTerminal(['--target', 'staging'], 'APPLY\n', { DIAG_OUTPUT: 'ERROR: footbag.service is not active' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/Errors \(1\):[\s\S]*footbag\.service is not active/);
    expect(provenSection(r.out)).not.toContain(DIAG_PROOF);
  });

  it('finishes a cold restart left with the instance stopped: starts it, without stopping again, and proves it', () => {
    // Defect caught: a re-run after a stop part way refusing the stopped host,
    // leaving the site down, or sending a second stop.
    writeFileSync(join(st, 'state'), 'stopped\n');
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(lightsailCalls('stop-instance')).toEqual([]);
    expect(lightsailCalls('start-instance')).toHaveLength(1);
    expect(state()).toBe('running');
    expect(calls().some((l) => l.startsWith('diagnostics'))).toBe(true);
  });

  it('finishes a cold restart left with the instance stopping: waits for the stop it already sent, then starts it', () => {
    // Defect caught: a second stop sent at an instance already stopping, which
    // Lightsail refuses, ending the recovery with the site down.
    writeFileSync(join(st, 'state'), 'stopping\n');
    const r = runAtTerminal(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(lightsailCalls('stop-instance')).toEqual([]);
    expect(lightsailCalls('start-instance')).toHaveLength(1);
    expect(state()).toBe('running');
  });

  it('forces the stop of an instance stuck stopping only when asked, then starts it and proves it', () => {
    // Defect caught: an out-of-memory host stuck stopping that no run can
    // recover, because a re-run only waits out its bound and starts nothing.
    writeFileSync(join(st, 'state'), 'stopping\n');
    const r = runAtTerminal(['--target', 'staging', '--force-stop'], 'APPLY\n', { NEVER_STOPS: '1' });
    expect(r.status, r.out).toBe(0);
    const stops = lightsailCalls('stop-instance');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toContain(`--instance-name ${INSTANCE}`);
    expect(stops[0]).toMatch(/ --force\b/);
    // Defect caught: a start sent before Lightsail reports the forced stop done.
    const at = (needle: string) => calls().findIndex((l) => l.includes(needle));
    const stoppedRead = calls().findIndex((l, i) => i > at('stop-instance') && l.includes('get-instance-state'));
    expect(stoppedRead).toBeGreaterThan(at('stop-instance'));
    expect(stoppedRead).toBeLessThan(at('start-instance'));
    expect(lightsailCalls('start-instance')).toHaveLength(1);
    expect(state()).toBe('running');
    expect(calls().find((l) => l.startsWith('diagnostics'))).toBe('diagnostics --target staging status state=running');
    expect(provenSection(r.out)).toContain(DIAG_PROOF);
  });

  it('sends no forced stop when the typed word is anything but APPLY', () => {
    // Defect caught: a forced stop of the live host sent without the typed consent.
    writeFileSync(join(st, 'state'), 'stopping\n');
    const r = runAtTerminal(['--target', 'staging', '--force-stop'], 'apply\n', { NEVER_STOPS: '1' });
    expect(r.status).toBe(1);
    expect(mutatingCalls()).toEqual([]);
    expect(state()).toBe('stopping');
  });

  it('finishes a cold restart left with the instance starting: waits for it and proves it, changing nothing', () => {
    // Defect caught: a re-run after the start was sent stopping the host again.
    writeFileSync(join(st, 'state'), 'pending\n');
    const r = runDetached(['--target', 'staging']);
    expect(r.status, r.out).toBe(0);
    expect(mutatingCalls()).toEqual([]);
    expect(calls().find((l) => l.startsWith('diagnostics'))).toBe('diagnostics --target staging status state=running');
  });
});
