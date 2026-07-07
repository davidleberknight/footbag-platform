// Scoring-bracket parity for freestyle operational (execution) notation.
//
// Operational notation encodes each scoring component of a trick as a
// square-bracket flag, and the number of scoring flags equals the trick's ADD.
// The scoring flags are BOD, DEX, XBD, DEL, UNS, PDX, and XDEX. The KICK action
// marker is non-scoring and never counts, and non-flag brackets such as [set]
// or paren pre-states are ignored.

// Matched globally so a single call counts every occurrence. Kept private
// because a shared global-flagged RegExp carries lastIndex state across
// .test()/.exec() calls; callers go through the functions below instead.
const SCORING_BRACKET_RE = /\[(BOD|DEX|XBD|DEL|UNS|PDX|XDEX)\]/gi;

export function countScoringBrackets(operationalNotation: string): number {
  const matches = operationalNotation.match(SCORING_BRACKET_RE);
  return matches ? matches.length : 0;
}

export interface ScoringBracketCheck {
  add: number;
  bracketCount: number;
  ok: boolean;
}

// Returns null when the row is not checkable: the ADD is not a whole number
// (blank, or the literal "modifier"), or the execution notation carries no
// scoring brackets (a blank field, or primitive markers like `[set] > toe`).
// Otherwise reports whether the scoring-bracket count equals the numeric ADD.
export function checkAddMatchesScoringBrackets(
  adds: string | null,
  operationalNotation: string,
): ScoringBracketCheck | null {
  if (adds === null || !/^\d+$/.test(adds)) return null;
  const bracketCount = countScoringBrackets(operationalNotation);
  if (bracketCount === 0) return null;
  return { add: parseInt(adds, 10), bracketCount, ok: bracketCount === parseInt(adds, 10) };
}
