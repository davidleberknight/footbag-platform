/**
 * scripts/list-host-access-mints.sh: listing every host-access mint since a
 * time and attributing each one.
 *
 * What carries the risk: a mint no script claims passing as a clean listing,
 * so the alarm it raised is never investigated; a denied attempt dropped from
 * the list, so nobody learns who tried; and a window the operator did not ask
 * for, from a time the script misread.
 *
 * Driven through its aws seam against a stub that returns lookup-events output
 * built from the events in the shared fixture, which says which are captured
 * and which synthetic.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { isoDaysAgo } from '../fixtures/clock';
import { CAPTURED_PRODUCTION_EVENT, mintEvent, lookupEventsOutput } from '../fixtures/hostAccessMintEvents';

const SCRIPT = join(process.cwd(), 'scripts/list-host-access-mints.sh');
// A day ago, to the second, in the form --since takes: inside the 90 days the
// event history holds whenever the suite runs. The stub ignores the window, so
// the events keep their own fixed times.
const SINCE = isoDaysAgo(1).replace(/\.\d+Z$/, 'Z');

let dir: string;
beforeEach(() => {
  dir = createScratchDir('list-host-access-mints');
});
afterEach(() => {
  removeScratch(dir);
});

const log = () => join(dir, 'aws.log');

function run(args: string[], events: Record<string, unknown>[]) {
  const eventsFile = join(dir, 'events.json');
  writeFileSync(eventsFile, lookupEventsOutput(events));
  const aws = join(dir, 'aws');
  writeFileSync(
    aws,
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(log())}`,
      `[[ "$1 $2" == "cloudtrail lookup-events" ]] && { cat ${JSON.stringify(eventsFile)}; exit 0; }`,
      'echo "unexpected aws call: $*" >&2; exit 64',
    ].join('\n'),
  );
  chmodSync(aws, 0o755);
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    input: '',
    env: { ...process.env, ...awsIdentityStubEnv(dir), LIST_HOST_ACCESS_MINTS_AWS_BIN: aws },
    ...SPAWN_GUARD,
  });
  const rows = (r.stdout ?? '').split('\n').filter(Boolean).map((l) => l.split('\t'));
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', rows };
}

/** The row for the call at `time`: [time, class, principal, source, instance, error, app]. */
const rowAt = (rows: string[][], time: string) => rows.find((r) => r[0] === time);

describe('list-host-access-mints.sh: classing each call', () => {
  const claimed = mintEvent({ time: '2026-11-09T01:00:00Z', instance: 'footbag-staging-web', appId: 'footbag-host-break-glass' });
  const denied = mintEvent({
    time: '2026-11-09T02:00:00Z',
    errorCode: 'AccessDenied',
    arn: 'arn:aws:sts::111122223333:assumed-role/FootbagDevTester/james',
  });

  it('classes claimed, denied and unattributed calls, and fails on the unattributed one', () => {
    // Defect caught: a mint nothing claims listed as clean, so the alarm it
    // raised is matched to nothing and nobody investigates.
    const r = run(['--since', SINCE], [claimed, denied, CAPTURED_PRODUCTION_EVENT]);
    expect(r.status, r.stderr).toBe(1);
    expect(rowAt(r.rows, '2026-11-09T01:00:00Z')?.slice(1)).toEqual([
      'claimed', 'arn:aws:iam::111122223333:user/footbag-operator', '203.0.113.10', 'footbag-staging-web', '-', 'footbag-host-break-glass',
    ]);
    expect(rowAt(r.rows, '2026-11-09T02:00:00Z')?.[1]).toBe('denied');
    // The captured production event carries no application id: the shape of
    // every mint made before the scripts carried one.
    const unattributed = rowAt(r.rows, CAPTURED_PRODUCTION_EVENT.eventTime);
    expect(unattributed?.[1]).toBe('unattributed');
    expect(unattributed?.[4]).toBe('footbag-production-web');
    expect(r.stderr).toMatch(/unattributed mint at 2026-11-09T00:07:34Z by arn:aws:iam::111122223333:user\/footbag-operator from 203\.0\.113\.10/);
  });

  it('passes a listing of claimed calls only, and says claimed is not proved', () => {
    // Defect caught: a listing that fails every run, which teaches the operator
    // to ignore it; and a report that reads a claim as proof of the run.
    const r = run(['--since', SINCE], [claimed]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/1 claimed, 0 denied, 0 unattributed/);
    expect(r.stderr).toMatch(/claimed is not proved/);
  });

  it('lists a denied attempt as a warning naming who tried, without failing the run', () => {
    // Defect caught: a denied attempt dropped from the list, so a job-role
    // session trying to mint a root shell goes unseen.
    const r = run(['--days', '1'], [denied]);
    expect(r.status, r.stderr).toBe(0);
    expect(rowAt(r.rows, '2026-11-09T02:00:00Z')?.slice(1, 3)).toEqual([
      'denied', 'arn:aws:sts::111122223333:assumed-role/FootbagDevTester/james',
    ]);
    expect(r.stderr).toMatch(/WARNING: denied attempt at 2026-11-09T02:00:00Z by arn:aws:sts::111122223333:assumed-role\/FootbagDevTester\/james .*AccessDenied/);
  });

  it('classes an application id outside the known table as unattributed', () => {
    // Defect caught: any app/ token accepted as a claim, so a caller that
    // invents its own id is attributed to nothing real and still passes.
    const r = run(['--days', '1'], [mintEvent({ time: '2026-11-09T03:00:00Z', appId: 'footbag-something-else' })]);
    expect(r.status).toBe(1);
    expect(rowAt(r.rows, '2026-11-09T03:00:00Z')?.[1]).toBe('unattributed');
  });

  it('classes a denied call as denied even when it carries a known application id', () => {
    // Defect caught: a refused attempt by a known script listed as a claimed
    // mint, so the attempt is never reported as one that failed.
    const r = run(['--days', '1'], [mintEvent({
      time: '2026-11-09T05:00:00Z', appId: 'footbag-host-break-glass', errorCode: 'AccessDenied',
    })]);
    expect(rowAt(r.rows, '2026-11-09T05:00:00Z')?.[1]).toBe('denied');
  });

  it('reads the application id only as its own user-agent token', () => {
    // Defect caught: an id embedded in some other token read as a claim.
    const r = run(['--days', '1'], [mintEvent({
      time: '2026-11-09T06:00:00Z', userAgent: 'aws-cli/2.34.8 xapp/footbag-host-break-glass',
    })]);
    expect(r.status).toBe(1);
    expect(rowAt(r.rows, '2026-11-09T06:00:00Z')?.[1]).toBe('unattributed');
  });

  it('names the principal by its id when the event records no ARN', () => {
    // Defect caught: a call listed as by nobody, so the warning names no one.
    const r = run(['--days', '1'], [mintEvent({ time: '2026-11-09T07:00:00Z', noArn: true })]);
    expect(rowAt(r.rows, '2026-11-09T07:00:00Z')?.[2]).toBe('AIDAEXAMPLE');
  });

  it('lists calls oldest first, whatever order the trail returns them in', () => {
    // ordering-is-the-contract: an operator matching firings to runs reads the
    // listing as a timeline.
    const r = run(['--days', '1'], [
      mintEvent({ time: '2026-11-09T03:00:00Z' }),
      mintEvent({ time: '2026-11-09T01:00:00Z' }),
      mintEvent({ time: '2026-11-09T02:00:00Z' }),
    ]);
    expect(r.rows.map((x) => x[0])).toEqual(['2026-11-09T01:00:00Z', '2026-11-09T02:00:00Z', '2026-11-09T03:00:00Z']);
  });

  it('lists an event with no user agent and no instance by time and source, as unattributed', () => {
    // Defect caught: an event missing the fields attribution relies on dropped
    // or crashing the listing, instead of falling back to time and address.
    const r = run(['--days', '1'], [mintEvent({ time: '2026-11-09T04:00:00Z', instance: null, userAgent: null })]);
    expect(r.status).toBe(1);
    expect(rowAt(r.rows, '2026-11-09T04:00:00Z')?.slice(1, 5)).toEqual([
      'unattributed', 'arn:aws:iam::111122223333:user/footbag-operator', '203.0.113.10', '(not recorded)',
    ]);
  });
});

describe('list-host-access-mints.sh: the window', () => {
  it('reads the trail from the --since time it was given', () => {
    const r = run(['--since', SINCE], []);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(log(), 'utf-8')).toContain(
      'cloudtrail lookup-events --region us-east-1 --lookup-attributes '
      + `AttributeKey=EventName,AttributeValue=GetInstanceAccessDetails --start-time ${SINCE}`,
    );
  });

  it('refuses a malformed --since and reads nothing', () => {
    // Defect caught: date(1) reading "yesterday" or a typo as some other
    // window, so the listing silently covers less than was asked.
    // A valid time just over the history's reach is refused too: the window
    // would silently start later than asked.
    const tooOld = isoDaysAgo(91).replace(/\.\d+Z$/, 'Z');
    for (const since of ['yesterday', SINCE.slice(0, 10), SINCE.replace('T', ' '), '2026-13-40T00:00:00Z', tooOld]) {
      const r = run(['--since', since], []);
      expect(r.status, since).toBe(2);
    }
    expect(existsSync(log())).toBe(false);
  });

  it('refuses a window longer than the event history holds', () => {
    // Defect caught: a 91-day request answered with 90 days and no word.
    expect(run(['--days', '91'], []).status).toBe(2);
    expect(run(['--days', '90'], []).status).toBe(0);
  });

  it('refuses no window and two windows', () => {
    expect(run([], []).status).toBe(2);
    expect(run(['--days', '1', '--since', SINCE], []).status).toBe(2);
  });
});
