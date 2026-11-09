/**
 * Container memory pressure from the cgroup v2 files, as a pure function of
 * their text so it can be checked without a container.
 *
 * Working-set memory is memory.current minus the inactive file cache, which
 * the kernel reclaims before it ever kills a process. The database is a file,
 * so its cache grows with ordinary reads; counting it would report pressure
 * while nothing is wrong. The host memory alarm leaves that cache out the same
 * way, and the host container monitor computes the same figure, so every
 * reading of "used memory" agrees.
 */

/**
 * Percent of the container's limit in use, to two decimals, or null when the
 * container has no limit (`max`) or a zero limit.
 */
export function workingSetPercent(memoryMax: string, memoryCurrent: string, memoryStat: string): number | null {
  const max = memoryMax.trim();
  if (max === 'max') return null;
  const maxBytes = BigInt(max);
  if (maxBytes === 0n) return null;
  const current = BigInt(memoryCurrent.trim());
  const inactiveFile = BigInt(/^inactive_file (\d+)$/m.exec(memoryStat)?.[1] ?? '0');
  const workingSet = current > inactiveFile ? current - inactiveFile : 0n;
  return Number((workingSet * 10000n) / maxBytes) / 100;
}
