/**
 * The created_at a new ledger row carries when the ledger's current row is the
 * one with the latest created_at: `now`, unless the subject's newest existing
 * stamp is not earlier than `now`, in which case one millisecond after it.
 *
 * Why: the host clock can step backward between two writes (a hypervisor time
 * sync, an NTP correction, a resumed VM), and a row stamped before the one it
 * follows would read as older, leaving the superseded state in force. Equal is
 * not enough either: ids rise only within one process, so a tie broken by id can
 * still go the wrong way between two processes or across a restart.
 *
 * Both stamps are canonical ISO-8601 UTC text, which compares in time order.
 */
export function laterStamp(latest: string | null | undefined, now: string): string {
  if (!latest || latest < now) return now;
  return new Date(Date.parse(latest) + 1).toISOString();
}
