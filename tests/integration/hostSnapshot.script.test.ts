/**
 * scripts/lib/host-snapshot.sh — the recovery points a host change takes before
 * it touches a live host: the newest database backup in the snapshots bucket,
 * and a manual Lightsail instance snapshot, found, taken and waited on.
 *
 * Each case sources the library in `bash -c` with a stand-in AWS CLI that
 * answers from files the case writes, and reads back the variables the
 * functions set. Nothing real is reached.
 *
 * The contract pinned: a listing that fails is never read as "nothing there";
 * a snapshot is reused only when it is this instance's, recent and usable; and
 * the wait hands on only a complete snapshot young enough to be used.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const LIB = join(process.cwd(), 'scripts/lib/host-snapshot.sh');

let work: string;
let aws: string;

beforeEach(() => {
  work = createScratchDir('host-snapshot');
  aws = join(work, 'aws');
  // Answers by call: the n-th listing of the bucket reads s3-<n>, the n-th read
  // of one snapshot reads line n of reads (the last line once they run out).
  writeFileSync(aws, [
    '#!/usr/bin/env bash',
    'STATE="$(dirname "$0")"',
    'printf "%s\\n" "$*" >> "$STATE/calls.log"',
    'bump() { local n; n=$(( $(cat "$STATE/n-$1" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STATE/n-$1"; echo "$n"; }',
    'case "$1 $2" in',
    '  "s3api list-objects-v2")',
    '    [[ -e "$STATE/s3-fails" ]] && { echo "An error occurred (AccessDenied) when calling the ListObjectsV2 operation: stand-in refusal" >&2; exit 254; }',
    '    f="$STATE/s3-$(bump s3)"; if [[ -e "$f" ]]; then cat "$f"; else echo None; fi ;;',
    '  "lightsail get-instance-snapshots")',
    '    [[ -e "$STATE/list-fails" ]] && { echo "An error occurred (AccessDeniedException) when calling the GetInstanceSnapshots operation: stand-in refusal" >&2; exit 254; }',
    '    cat "$STATE/snapshots" 2>/dev/null ;;',
    '  "lightsail create-instance-snapshot")',
    '    [[ -e "$STATE/create-fails" ]] && { echo "An error occurred (InvalidInputException) when calling the CreateInstanceSnapshot operation: stand-in refusal" >&2; exit 254; }',
    '    exit 0 ;;',
    '  "lightsail get-instance-snapshot")',
    '    [[ -e "$STATE/read-fails" ]] && { echo "An error occurred (NotFoundException) when calling the GetInstanceSnapshot operation: stand-in refusal" >&2; exit 254; }',
    '    n="$(bump read)"; total="$(wc -l < "$STATE/reads")"; (( n > total )) && n="$total"',
    '    sed -n "${n}p" "$STATE/reads" ;;',
    'esac',
    'exit 0',
  ].join('\n') + '\n');
  chmodSync(aws, 0o755);
});

afterEach(() => {
  removeScratch(work);
});

/** Runs the body with the library sourced, and returns the KEY=value lines it printed. */
function run(body: string): Record<string, string> {
  const r = spawnSync('bash', ['-c', `set -euo pipefail; source "${LIB}"; AWS=${JSON.stringify(aws)}; ${body}`], {
    encoding: 'utf-8', env: { ...process.env, ...NO_AWS_CREDENTIALS }, ...SPAWN_GUARD,
  });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  const out: Record<string, string> = {};
  for (const line of (r.stdout ?? '').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

function calls(): string[] {
  const p = join(work, 'calls.log');
  return existsSync(p) ? readFileSync(p, 'utf-8').trim().split('\n') : [];
}

const iso = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString().replace(/\.\d{3}Z$/, '+00:00');
const epochAgo = (secondsAgo: number) => Math.floor(Date.now() / 1000) - secondsAgo;

describe('host_newest_backup', () => {
  const call = 'rc=0; host_newest_backup "$AWS" stand-in-bucket || rc=$?; printf "rc=%s\\nnewest=%s\\nerror=%s\\n" "$rc" "$HS_NEWEST_BACKUP" "$HS_ERROR"';

  it('takes the newest object of the first day that has one', () => {
    // Defect caught: the first or an arbitrary object is taken, so a backup
    // hours old reads as the latest and a replacement goes ahead on it.
    writeFileSync(join(work, 's3-1'), '2026-11-02T01:00:00+00:00\t2026-11-02T03:00:00+00:00\t2026-11-02T02:00:00+00:00\n');
    const r = run(call);
    expect(r).toMatchObject({ rc: '0', newest: '2026-11-02T03:00:00+00:00', error: '' });
    expect(calls()).toHaveLength(1);
  });

  it('falls back to the day before when the first day has none, asking the later day first', () => {
    // Defect caught: just after midnight the newest backup is yesterday's, and
    // a run asking only today reads it as absent.
    writeFileSync(join(work, 's3-2'), '2026-11-01T23:00:00+00:00\n');
    const r = run(call);
    expect(r).toMatchObject({ rc: '0', newest: '2026-11-01T23:00:00+00:00' });
    const days = calls().map((c) => /--prefix routine\/(\d{4}\/\d{2}\/\d{2})\//.exec(c)?.[1] ?? '');
    expect(days).toHaveLength(2);
    expect(days[0] > days[1], days.join(' then ')).toBe(true);
  });

  it('reads no backup on either day as empty, without failing', () => {
    expect(run(call)).toMatchObject({ rc: '0', newest: '', error: '' });
  });

  it('fails a listing it could not make, with the tool\'s own reason, rather than reading it as no backup', () => {
    writeFileSync(join(work, 's3-fails'), '');
    const r = run(call);
    expect(r.rc).toBe('1');
    expect(r.newest).toBe('');
    expect(r.error).toContain('stand-in refusal');
  });
});

describe('host_snapshot_recent', () => {
  const call = (after: number, within = 3600) =>
    `rc=0; host_snapshot_recent "$AWS" stand-in-web stand-in-web-pre- ${after} ${within} || rc=$?; printf "rc=%s\\nname=%s\\nstate=%s\\nerror=%s\\n" "$rc" "$HS_NAME" "$HS_STATE" "$HS_ERROR"`;

  it('reuses the newest snapshot inside the window, complete or still being taken', () => {
    // Defect caught: a re-run starts a second snapshot beside one still being
    // taken, or reuses an older one when a newer exists.
    writeFileSync(join(work, 'snapshots'), [
      `stand-in-web-pre-a\t${iso(600)}\tavailable`,
      `stand-in-web-pre-b\t${iso(300)}\tpending`,
      `stand-in-web-pre-c\t${iso(7200)}\tavailable`,
    ].join('\n') + '\n');
    expect(run(call(epochAgo(30 * 86400)))).toMatchObject({ rc: '0', name: 'stand-in-web-pre-b', state: 'pending' });
  });

  it('never reuses one taken before the instance was created, or outside the window', () => {
    // Defect caught: a snapshot of the instance replaced last time, under the
    // same name, stands in for one of the instance about to be replaced.
    writeFileSync(join(work, 'snapshots'), `stand-in-web-pre-a\t${iso(600)}\tavailable\n`);
    expect(run(call(epochAgo(60)))).toMatchObject({ rc: '0', name: '' });
    expect(run(call(epochAgo(30 * 86400), 300))).toMatchObject({ rc: '0', name: '' });
    // The same snapshot inside both bounds is reused: the refusals above are
    // the bounds, not a lookup that never matches.
    expect(run(call(epochAgo(30 * 86400)))).toMatchObject({ rc: '0', name: 'stand-in-web-pre-a' });
  });

  it('fails a listing it could not make, with the tool\'s own reason', () => {
    // Defect caught: a refused listing reads as "no snapshot to reuse", in
    // silence, so a permissions fault goes unseen.
    writeFileSync(join(work, 'list-fails'), '');
    const r = run(call(epochAgo(30 * 86400)));
    expect(r.rc).toBe('1');
    expect(r.error).toContain('stand-in refusal');
  });
});

describe('host_snapshot_create', () => {
  const call = 'rc=0; host_snapshot_create "$AWS" stand-in-web stand-in-web-pre-x || rc=$?; printf "rc=%s\\nerror=%s\\n" "$rc" "$HS_ERROR"';

  it('asks Lightsail for the named snapshot of the instance', () => {
    expect(run(call)).toMatchObject({ rc: '0', error: '' });
    expect(calls()[0]).toMatch(/--instance-name stand-in-web --instance-snapshot-name stand-in-web-pre-x/);
  });

  it('fails with Lightsail\'s reason when it refuses', () => {
    writeFileSync(join(work, 'create-fails'), '');
    const r = run(call);
    expect(r.rc).toBe('1');
    expect(r.error).toContain('stand-in refusal');
  });
});

describe('host_snapshot_wait', () => {
  const call = (usable = 6900) =>
    `rc=0; host_snapshot_wait "$AWS" stand-in-web-pre-x ${usable} 0 || rc=$?; printf "rc=%s\\nstate=%s\\nerror=%s\\n" "$rc" "$HS_STATE" "$HS_ERROR"`;
  const reads = (rows: Array<[string, string]>) => writeFileSync(join(work, 'reads'), rows.map(([s, c]) => `${s}\t${c}`).join('\n') + '\n');
  const readCount = () => calls().filter((c) => c.startsWith('lightsail get-instance-snapshot ')).length;

  it('polls a snapshot still being taken until it is complete', () => {
    // Defect caught: the first "pending" ends the wait, and a replacement
    // either stops for nothing or goes ahead on an incomplete snapshot.
    const created = iso(60);
    reads([['pending', created], ['pending', created], ['available', created]]);
    expect(run(call())).toMatchObject({ rc: '0', state: 'available', error: '' });
    expect(readCount()).toBe(3);
  });

  it('fails a snapshot Lightsail reports failed', () => {
    reads([['error', iso(60)]]);
    expect(run(call())).toMatchObject({ rc: '1', state: 'error' });
  });

  it('stops waiting once a snapshot still being taken is past the usable age', () => {
    // Defect caught: the wait outlasts what the apply will accept, so the run
    // waits for a snapshot that can only be refused.
    reads([['pending', iso(7000)]]);
    expect(run(call())).toMatchObject({ rc: '1', state: 'pending' });
    expect(readCount()).toBe(1);
  });

  it('refuses a complete snapshot already past the usable age', () => {
    // Defect caught: a reused snapshot too old for the apply is handed to it,
    // and the replacement fails there instead of here.
    reads([['available', iso(7000)]]);
    expect(run(call())).toMatchObject({ rc: '1', state: 'available' });
    expect(run(call(7200))).toMatchObject({ rc: '0', state: 'available' });
  });

  it('fails a snapshot whose creation time cannot be read, rather than calling it new', () => {
    reads([['available', 'stand-in-not-a-time']]);
    const r = run(call());
    expect(r.rc).toBe('1');
    expect(r.error).toContain('stand-in-not-a-time');
  });

  it('fails a read it could not make, with the tool\'s own reason', () => {
    writeFileSync(join(work, 'read-fails'), '');
    const r = run(call());
    expect(r.rc).toBe('1');
    expect(r.error).toContain('stand-in refusal');
  });
});
