/**
 * The club caps every club write path counts against. A club is a local group
 * and a member may be local to more than one place, so a member holds up to
 * three current clubs and co-leads up to three, each of them one of their
 * current clubs. A club has at most five co-leaders. SQLite cannot express
 * "at most N rows" as an index, so each cap is a count before insert.
 */
import { clubLeaders } from '../db/db';

export const MAX_COLEADERS_PER_CLUB = 5;
export const MAX_CLUBS_LED_PER_MEMBER = 3;
export const MAX_CURRENT_CLUBS_PER_MEMBER = 3;

/** True when the member already co-leads as many clubs as a member may lead. */
export function memberAtColeadCap(memberId: string): boolean {
  const row = clubLeaders.countClubsLedByMember.get(memberId) as { c: number };
  return row.c >= MAX_CLUBS_LED_PER_MEMBER;
}
