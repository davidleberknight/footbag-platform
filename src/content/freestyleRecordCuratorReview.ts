/**
 * freestyleRecordCuratorReview.ts
 * ================================
 *
 * Curator-authored list of PassBack record names whose canonical dictionary
 * identity is not yet settled. These are valid historical record names; only the
 * mapping to a canonical trick is unresolved.
 *
 * Why this layer exists
 * ---------------------
 * A record whose name has no matching dictionary trick otherwise renders as a
 * plain unlinked name, indistinguishable from a record whose trick simply is not
 * documented yet. For a name that is actively awaiting a curator decision, that
 * is not honest enough: the reader should see that the record is real and that
 * its canonical identity is under review, with the specific open question.
 *
 * This mirrors the freestyleUnresolvedCompounds mechanism (a reversible
 * TypeScript content module, no DB column, a small public status), applied to
 * records instead of dictionary trick cards. A flagged record never links to a
 * speculative or incorrect canonical trick.
 *
 * Reversibility
 * -------------
 * Pure TypeScript content. Removing an entry drops the status from that record on
 * the next request. No DB column, no migration.
 *
 * Authoring rule
 * --------------
 * Curator-only. An entry is added when a specific canonical-identity question is
 * open, and removed once the record is promoted or otherwise resolved. Keyed on
 * the record's public name exactly as it appears in the record data.
 */

export const RECORD_CURATOR_REVIEW: ReadonlyMap<string, string> = new Map<string, string>([
  ['Double Dyno', 'The scope and placement of the doubled movement within the reversed Blender / Dyno structure are not yet authoritatively defined.'],
  ['Double Whip', 'The interaction and ordering of the reverse Whirl and the doubled movement need curator confirmation.'],
  ['Solestice', '"Osis Flapper" does not yet map to a settled canonical decomposition.'],
  ['Stepping Ducking Blurry Whirl', 'The public name, structural description, and stated ADD may not agree; "stepping" and "blurry" may duplicate or conflict.'],
  ['Toe Spinning Toe', 'The exact entry, rotation, side relationship, and terminal interpretation need curator confirmation.'],
]);

/**
 * The curator-review note for a record name, or null when the record is not
 * under review. Callers render a "Needs curator review" status carrying the note
 * and suppress any canonical-trick link for the record.
 */
export function recordCuratorReviewNote(trickName: string | null | undefined): string | null {
  if (!trickName) return null;
  return RECORD_CURATOR_REVIEW.get(trickName.trim()) ?? null;
}
