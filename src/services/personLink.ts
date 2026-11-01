/**
 * Canonical person-link resolution.
 *
 * Every page that links to a person (event results, history landing,
 * history detail teammates) must use this helper so the URL pattern
 * is consistent: members get `/members/{slug}`, everyone else gets
 * `/history/{personId}`.
 *
 * The SQL layer is responsible for resolving the member slug through the
 * member's direct link to the historical-person record
 * (members.historical_person_id = historical_persons.person_id).
 * This helper only formats the already-resolved values.
 */
export function personHref(
  memberSlug: string | null | undefined,
  historicalPersonId: string | null | undefined,
): string | null {
  if (memberSlug) return `/members/${memberSlug}`;
  if (historicalPersonId) return `/history/${historicalPersonId}`;
  return null;
}
