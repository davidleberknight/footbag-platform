import { systemConfig } from '../db/db';

/**
 * Canonical reader for runtime-mutable admin configuration.
 *
 * Reads a positive-integer value from the `system_config_current` view.
 * Consumers use this for admin-configurable thresholds. Falls back when
 * the key is missing or the stored value does not parse to a finite
 * positive integer. Never queries the raw `system_config` table.
 */
export function readIntConfig(key: string, fallback: number): number {
  const row = systemConfig.getValueByKey.get(key) as { value_json: string } | undefined;
  if (!row) return fallback;
  const parsed = parseInt(row.value_json, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// A year. The floor stops a zero or negative value emptying the window; the
// ceiling stops a large one producing a window start the date arithmetic cannot
// express, which throws wherever the value is turned into a timestamp.
const MAX_WINDOW_HOURS = 8760;

/**
 * The health window, in hours, clamped to a range the date arithmetic can
 * express. Both consumers read it here rather than each clamping their own
 * copy: the admin health page reports bounce and complaint volume over this
 * window, and the outbox drain judges its bulk halt over the same one, so a
 * clamp applied in one place and not the other would let the two disagree
 * about the period they are describing.
 */
export function readHealthWindowHours(): number {
  const configured = readIntConfig('system_health_window_hours', 24);
  return Math.min(MAX_WINDOW_HOURS, Math.max(1, configured));
}
