/**
 * Spends a member's member-search allowance, so the next search the app runs
 * for them is refused the way a burst of real searches would leave it.
 *
 * The search keys its per-member bucket on the searching member's id and
 * refuses once the bucket holds as many attempts as its configured ceiling.
 * Filling the bucket here with a ceiling far above any configured one leaves it
 * over whatever ceiling the suite has set, so a case does not depend on the
 * configured number. The per-test reset in the shared setup empties it again.
 */
export async function spendMemberSearchAllowance(memberId: string): Promise<void> {
  const { hit } = await import('../../src/services/rateLimitService');
  for (let i = 0; i < 500; i++) hit(`member-search:${memberId}`, 500, 1);
}

/** Whether a response carries a numeric wait the limiter could have set. */
export function retryAfterIsAWait(header: string | string[] | undefined): boolean {
  const wait = Number(header);
  return Number.isInteger(wait) && wait >= 1 && wait <= 3600;
}
