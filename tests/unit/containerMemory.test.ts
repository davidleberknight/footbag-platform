/**
 * Container memory pressure: the working-set figure readiness gates on.
 */
import { describe, expect, it } from 'vitest';
import { workingSetPercent } from '../../src/lib/containerMemory';

const MIB = 1024 * 1024;
const stat = (inactiveFile: number) =>
  `anon ${100 * MIB}\nfile ${300 * MIB}\nactive_file ${50 * MIB}\ninactive_file ${inactiveFile}\nslab 1024\n`;

describe('workingSetPercent', () => {
  it('leaves the inactive file cache out of used memory', () => {
    // A 512 MiB limit with 470 MiB charged, 300 MiB of it reclaimable cache:
    // counting the cache reads 91.8%, past the 90% readiness ceiling, and the
    // site would serve the maintenance page while it has room to spare.
    const pct = workingSetPercent(`${512 * MIB}\n`, `${470 * MIB}\n`, stat(300 * MIB));
    expect(pct).toBe(33.2);
  });

  it('reports genuine pressure when the charge is not cache', () => {
    // The same charge with almost no cache is real pressure; dropping the
    // subtraction the other way would hide it.
    const pct = workingSetPercent(`${512 * MIB}`, `${470 * MIB}`, stat(10 * MIB));
    expect(pct).toBeGreaterThan(89);
  });

  it('returns null for an unlimited or zero limit instead of dividing by it', () => {
    expect(workingSetPercent('max\n', `${470 * MIB}`, stat(0))).toBeNull();
    expect(workingSetPercent('0', `${470 * MIB}`, stat(0))).toBeNull();
  });

  it('never goes negative when the cache figure exceeds the charge', () => {
    // memory.stat and memory.current are read at different instants, so the
    // cache can briefly read higher than the total charge.
    expect(workingSetPercent(`${512 * MIB}`, `${10 * MIB}`, stat(20 * MIB))).toBe(0);
  });

  it('treats a memory.stat without an inactive_file line as no cache', () => {
    expect(workingSetPercent(`${100 * MIB}`, `${50 * MIB}`, 'anon 1\n')).toBe(50);
  });
});
