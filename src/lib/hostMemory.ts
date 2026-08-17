/**
 * Host-wide available memory, for admission control ahead of memory-heavy
 * work. /proc/meminfo shows the HOST's values even inside a container, which
 * is exactly what a transcode admission gate needs: the danger being guarded
 * against is host starvation, which no cgroup-scoped reading can see.
 *
 * This module reads no environment and imports no application config: it is
 * loaded by the media container, which is given none of the web environment
 * contract, and an import-graph test fails if anything reachable from that
 * container loads the web config.
 */
import { readFileSync } from 'node:fs';

/**
 * The refusal the media container answers with when the host is below the
 * floor. Defined here because both sides of the HTTP boundary need it and this
 * module is the one leaf both may load: the media container writes it into the
 * 503 body, and the dispatcher recognises it to tell a host-memory refusal
 * apart from a saturated worker. Two literals would drift, and the drift would
 * be silent, showing only as a misleading failure sentence on an admin's
 * screen.
 */
export const TRANSCODE_ADMISSION_REFUSAL = 'host memory below transcode admission floor';

/**
 * MemAvailable in bytes, or null when /proc/meminfo is unreadable or has no
 * parseable MemAvailable line (a non-Linux dev machine, an exotic kernel).
 * Callers decide the null posture; the reader itself never throws.
 */
export function readHostMemAvailableBytes(): number | null {
  let meminfo: string;
  try {
    meminfo = readFileSync('/proc/meminfo', 'utf8');
  } catch {
    return null;
  }
  const match = /^MemAvailable:\s+(\d+)\s*kB/m.exec(meminfo);
  if (!match) return null;
  return parseInt(match[1], 10) * 1024;
}
