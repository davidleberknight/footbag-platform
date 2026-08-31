// freestyleFamilyHistogram.ts
// ============================
// GENERATED FILE — do not hand-edit.
// Regenerate: npx tsx freestyle/scripts/build_family_histogram_content.ts
//
// How large each public browse family is, measured from the family-membership
// calculation the dictionary browse itself renders: members folded up the family
// ancestor chain, public display-family mappings applied, dual memberships
// counted, an umbrella's branches unioned, and non-trick rows excluded. A family
// therefore counts its branches' tricks as well as its own, which is why a root
// stands above the sub-families nested under it.
//
// These are not the numbers of the original topology study, and no attempt is
// made to reproduce them: that study's corpus and procedure were not kept, so
// its figures cannot be recomputed. What is kept is its question. Every count
// here is a measurement of the dictionary as committed, and re-running this
// against unchanged inputs changes nothing.
//
// Sorted by count descending, then label, so the order is a property of the data
// rather than of the run.

/** One family bar: the public family label and its measured membership. */
export interface FamilyHistogramRow {
  label: string;
  count: number;
}

/** Every public browse family with a measured membership, largest first. */
export const FAMILY_HISTOGRAM_ROWS: readonly FamilyHistogramRow[] = [
  { label: "Osis", count: 118 },
  { label: "Legover", count: 113 },
  { label: "Mirage", count: 111 },
  { label: "Whirl", count: 83 },
  { label: "Butterfly", count: 68 },
  { label: "Down", count: 54 },
  { label: "Swirl", count: 50 },
  { label: "Torque", count: 47 },
  { label: "Illusion", count: 45 },
  { label: "Pickup", count: 43 },
  { label: "Blender", count: 35 },
  { label: "Drifter", count: 34 },
  { label: "Double Legover", count: 33 },
  { label: "Inside Stall", count: 32 },
  { label: "Eggbeater", count: 31 },
  { label: "Double-Over-Down", count: 24 },
  { label: "Barfly", count: 15 },
  { label: "Reverse Whirl", count: 14 },
  { label: "Eclipse", count: 12 },
  { label: "Flail", count: 12 },
  { label: "Butterfly-Swirl", count: 11 },
  { label: "Paradon", count: 10 },
  { label: "Barrage", count: 9 },
  { label: "Dada-Curve", count: 7 },
  { label: "Dyno", count: 6 },
  { label: "Reverse Swirl", count: 6 },
  { label: "Down-Double-Down", count: 5 },
  { label: "Flurry", count: 4 },
];

/**
 * Public browse families this measurement produced no row for.
 *
 * A family renders on the browse only once it has more than two members, so one
 * below that floor has nothing to measure and is named here instead of dropped
 * silently. Nothing is drawn for it: a zero would read as a measurement.
 */
export const FAMILIES_WITHOUT_A_MEASURED_ROW: readonly string[] = [
  // Every public browse family has a measured row.
];
