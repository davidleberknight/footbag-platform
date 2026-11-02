/**
 * scripts/lib/host-reboot.sh — reboot a host and wait until it is back.
 *
 * Each case sources the library in `bash -c` with a stand-in ssh client that
 * records the reboot session's stream and answers each boot-id poll from a
 * list the case writes. Nothing real is reached.
 *
 * The contract pinned: the reboot is proved by a boot id different from the
 * one the host reported before it, never by the host answering at all; a host
 * that cannot be asked, or that never comes back changed, fails with the reason;
 * and only the password line and the half travel on the stream.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const LIB = join(process.cwd(), 'scripts/lib/host-reboot.sh');
const HALF = join(process.cwd(), 'scripts/internal/bootstrap-host-reboot-remote.sh');

let work: string;
let ssh: string;

beforeEach(() => {
  work = createScratchDir('host-reboot');
  ssh = join(work, 'ssh');
  // The reboot session answers the half's boot-id sentinel; the n-th poll
  // answers line n of answers (the last once they run out): "refused" is a
  // host mid-reboot, anything else is the boot id it reports.
  writeFileSync(ssh, [
    '#!/usr/bin/env bash',
    'STATE="$(dirname "$0")"',
    'printf "%s\\n" "$*" >> "$STATE/calls.log"',
    'case "$*" in',
    '  *footbag-reboot*)',
    '    cat > "$STATE/reboot-stream"',
    '    [[ -e "$STATE/schedule-fails" ]] && { echo "sudo: stand-in: a password is required" >&2; exit 1; }',
    '    [[ -e "$STATE/no-boot-id" ]] || printf -- "---FOOTBAG-BOOT-ID---\\nold-boot\\n"',
    '    echo "---FOOTBAG-END---" ;;',
    '  *boot_id*)',
    '    n=$(( $(cat "$STATE/polls" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STATE/polls"',
    '    total="$(wc -l < "$STATE/answers")"; (( n > total )) && n="$total"',
    '    a="$(sed -n "${n}p" "$STATE/answers")"',
    '    if [[ "$a" == refused ]]; then echo "ssh: connect to host stand-in port 2222: Connection refused" >&2; exit 255; fi',
    '    echo "$a" ;;',
    'esac',
    'exit 0',
  ].join('\n') + '\n');
  chmodSync(ssh, 0o755);
  writeFileSync(join(work, 'answers'), 'new-boot\n');
});

afterEach(() => {
  removeScratch(work);
});

function reboot(tries = 3): Record<string, string> {
  const body = [
    `source "${LIB}"`,
    'SUDO_PASS=stub-reboot-pass',
    `HOST_SSH_BIN=${JSON.stringify(ssh)}`,
    'HOST_SSH_OPTS=(-o BatchMode=yes)',
    `rc=0; host_reboot_and_wait footbag-staging ${JSON.stringify(HALF)} 0 ${tries} || rc=$?`,
    'printf "rc=%s\\nold=%s\\nnew=%s\\nerror=%s\\n" "$rc" "$HR_OLD_BOOT_ID" "$HR_BOOT_ID" "$HR_ERROR"',
  ].join('\n');
  const r = spawnSync('bash', ['-c', `set -euo pipefail\n${body}`], { encoding: 'utf-8', ...SPAWN_GUARD });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  const out: Record<string, string> = {};
  for (const line of (r.stdout ?? '').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

const polls = () => (existsSync(join(work, 'polls')) ? Number(readFileSync(join(work, 'polls'), 'utf-8').trim()) : 0);

describe('host_reboot_and_wait', () => {
  it('waits through a refused connection and the old boot id, and proves the reboot by the new one', () => {
    // Defect caught: a host that answers before it has gone down, still on its
    // old boot, is reported rebooted, and the run goes on against a host about
    // to drop out from under it.
    writeFileSync(join(work, 'answers'), 'old-boot\nrefused\nnew-boot\n');
    expect(reboot()).toMatchObject({ rc: '0', old: 'old-boot', new: 'new-boot', error: '' });
    expect(polls()).toBe(3);
  });

  it('fails a host that keeps its boot id for every try', () => {
    writeFileSync(join(work, 'answers'), 'old-boot\n');
    const r = reboot(3);
    expect(r.rc).toBe('1');
    expect(r.error).not.toBe('');
    expect(polls()).toBe(3);
  });

  it('fails, with the reason, when the reboot could not be scheduled, and waits for nothing', () => {
    // Defect caught: a refused sudo reads as a reboot under way, and the run
    // polls for a reboot that was never asked for.
    writeFileSync(join(work, 'schedule-fails'), '');
    const r = reboot();
    expect(r.rc).toBe('1');
    expect(r.error).toContain('stand-in: a password is required');
    expect(polls()).toBe(0);
  });

  it('fails a host that reported no boot id before the reboot, since nothing could prove it changed', () => {
    writeFileSync(join(work, 'no-boot-id'), '');
    const r = reboot();
    expect(r.rc).toBe('1');
    expect(r.old).toBe('');
    expect(polls()).toBe(0);
  });

  it('sends the password as the stream\'s first line, the half after it, and never in an argument', () => {
    // Defect caught: the password reaches the host's process list, or a line
    // other than the half runs as root.
    reboot();
    const stream = readFileSync(join(work, 'reboot-stream'), 'utf-8');
    expect(stream).toBe(`stub-reboot-pass\n${readFileSync(HALF, 'utf-8')}`);
    expect(readFileSync(join(work, 'calls.log'), 'utf-8')).not.toContain('stub-reboot-pass');
  });
});
