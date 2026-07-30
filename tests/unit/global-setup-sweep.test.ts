/**
 * The transient-artifact sweep collects abandoned test databases without ever
 * touching one a live session could still be using.
 *
 * The distinction is load-bearing: more than one test session can run at once,
 * so a sweep that deleted by filename prefix alone would delete the other
 * session's database mid-run, surfacing as a missing table or an unopenable
 * database file in whichever suites were mid-flight. Age is what separates
 * abandoned from live.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { closeSync, existsSync, openSync, unlinkSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MIN_AGE_MS,
  sweepFootbagTransientArtifacts,
} from '../global-setup';

const created: string[] = [];

function makeArtifact(name: string, ageMs: number): string {
  const full = join(tmpdir(), name);
  closeSync(openSync(full, 'w'));
  const seconds = (Date.now() - ageMs) / 1000;
  utimesSync(full, seconds, seconds);
  created.push(full);
  return full;
}

afterEach(() => {
  for (const path of created.splice(0)) {
    try { unlinkSync(path); } catch { /* already swept */ }
  }
});

describe('transient test-artifact sweep', () => {
  it('deletes an abandoned artifact', () => {
    const stale = makeArtifact(`footbag-test-sweep-stale-${process.pid}.db`, MIN_AGE_MS * 2);
    sweepFootbagTransientArtifacts();
    expect(existsSync(stale)).toBe(false);
  });

  it('leaves an artifact a live session could still own', () => {
    const fresh = makeArtifact(`footbag-test-sweep-fresh-${process.pid}.db`, 0);
    sweepFootbagTransientArtifacts();
    expect(existsSync(fresh)).toBe(true);
  });

  it('leaves an artifact whose age is just inside the threshold', () => {
    const recent = makeArtifact(
      `footbag-test-sweep-recent-${process.pid}.db`,
      MIN_AGE_MS - 60_000,
    );
    sweepFootbagTransientArtifacts();
    expect(existsSync(recent)).toBe(true);
  });

  it('covers the browser-stack artifacts as well as the unit ones', () => {
    const staleE2e = makeArtifact(`footbag-e2e-sweep-stale-${process.pid}.db`, MIN_AGE_MS * 2);
    const freshE2e = makeArtifact(`footbag-e2e-sweep-fresh-${process.pid}.db`, 0);
    sweepFootbagTransientArtifacts();
    expect(existsSync(staleE2e)).toBe(false);
    expect(existsSync(freshE2e)).toBe(true);
  });

  it('ignores an unrelated file of a similar name', () => {
    const unrelated = makeArtifact(`footbag-keepme-${process.pid}.db`, MIN_AGE_MS * 2);
    sweepFootbagTransientArtifacts();
    expect(existsSync(unrelated)).toBe(true);
  });
});
