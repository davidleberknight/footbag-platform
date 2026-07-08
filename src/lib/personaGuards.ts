/**
 * Identity check for seeded test-persona member rows.
 *
 * The dev/staging persona harness inserts every persona member with an id built
 * from this prefix (see the persona factory). The id is the one stable, always-
 * present signal that a member is a synthetic test persona rather than a real
 * account, so guards that must treat test personas differently key on it.
 *
 * The pre-go-live curated-media guardrail uses this to refuse curated/sidecar
 * writes from test-persona admins: real maintainer accounts register through the
 * real flow and so carry ordinary uuid ids, never this prefix, and pass; a
 * seeded persona admin is blocked.
 *
 * Lives in the neutral lib layer (no service or testkit dependency) so both the
 * persona factory and the service-layer guard share one definition of the prefix.
 */
export const SEEDED_PERSONA_MEMBER_ID_PREFIX = 'member_persona_';

export function isSeededTestPersonaMemberId(memberId: string): boolean {
  return memberId.startsWith(SEEDED_PERSONA_MEMBER_ID_PREFIX);
}
