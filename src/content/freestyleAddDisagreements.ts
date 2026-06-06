/**
 * freestyleAddDisagreements.ts
 * =============================
 *
 * Curator-shipped reconciliation data for the 68 PassBack→IFPA name-
 * matched rows where the PB ADD claim differs from the IFPA canonical
 * ADD. Surfaces on /freestyle/add-analysis as the "External-source ADD
 * framings" subsection.
 *
 * Why this layer exists
 * ---------------------
 * PassBack and IFPA measure different things:
 *
 *   - **PB `dex_count`**: a mechanical count of dexterities performed
 *     within a trick. Roughly: how many bag-foot interactions does the
 *     player execute?
 *   - **IFPA `adds`**: the canonical structural ADD = stall (1) + dex
 *     contributions + cross-body traversals (xbody) + body rotations
 *     (spin) + operator weights stacked on a base trick.
 *
 * Same trick name, two different measurements → numeric "disagreement"
 * that is structurally reconcilable, not a true canonical conflict.
 *
 * Observational notes surface the framing explicitly rather than
 * silently absorbing or contradicting PB's numbers.
 *
 * Reversibility: TypeScript content module, so the layer can be revised
 * without mutating canonical trick data. Source rows pulled from
 * passback_formula_disagreements.csv (disagreement_type =
 * add_value_diverges). To refresh: re-run the audit script + replace
 * this array.
 */

export interface AddDisagreementRow {
  /** IFPA canonical slug (resolves to /freestyle/tricks/{slug}). */
  ifpaSlug:        string;
  /** IFPA canonical display name. */
  ifpaName:        string;
  /** IFPA canonical structural formula (when present). */
  ifpaFormula:     string | null;
  /** PB-claimed ADD (the dex_count number from PassBack). */
  passbackAdd:     number;
  /** Optional curator note specific to this row. */
  curatorNote:     string | null;
}

export const PASSBACK_ADD_FRAMING_PROSE =
  "PassBack records a trick's dex_count — the mechanical count of " +
  "dexterities performed. IFPA records the canonical ADD — the " +
  "structural sum across stall, dex, cross-body traversal, rotation, " +
  "and operator weights. The two measurements answer different " +
  "questions: PB asks \"how many dexes?\", IFPA asks \"how much " +
  "compositional difficulty?\". Same trick name; two valid readings. " +
  "Rows below show the divergence honestly — both numbers measure " +
  "something real, just different things.";

// Full 68 rows: rendered as a compact table on /freestyle/add-analysis.
// Sourced from passback_formula_disagreements.csv.
export const PASSBACK_ADD_DISAGREEMENTS: readonly AddDisagreementRow[] = [
  { ifpaSlug: 'barfly',                    ifpaName: 'barfly',                    ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'barrage',                   ifpaName: 'barrage',                   ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'blender',                   ifpaName: 'blender',                   ifpaFormula: 'whirling osis',                 passbackAdd: 1, curatorNote: null },
  { ifpaSlug: 'blur',                      ifpaName: 'blur',                      ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'blurriest',                 ifpaName: 'blurriest',                 ifpaFormula: null,                            passbackAdd: 3, curatorNote: null },
  { ifpaSlug: 'bullwhip',                  ifpaName: 'bullwhip',                  ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'butterfly',                 ifpaName: 'butterfly',                 ifpaFormula: null,                            passbackAdd: 1, curatorNote: 'IFPA canonical = 3 ADD (dex + xbody + stall); PB counts 1 dex' },
  { ifpaSlug: 'clipper',                   ifpaName: 'Clipper Kick',              ifpaFormula: null,                            passbackAdd: 0, curatorNote: 'IFPA canonical = 1 ADD (xbody kick); PB records 0 dexes (a clipper kick is not a dex)' },
  { ifpaSlug: 'dada-curve',                ifpaName: 'dada curve',                ifpaFormula: 'miraging far symposium butterfly', passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'dimwalk',                   ifpaName: 'dimwalk',                   ifpaFormula: 'pixie butterfly',                passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'eggbeater',                 ifpaName: 'eggbeater',                 ifpaFormula: 'atomic legover',                 passbackAdd: 1, curatorNote: 'IFPA per pt4 = 3 ADD (atomic + legover + stall); PB counts 1 dex' },
  { ifpaSlug: 'foot-stall',                ifpaName: 'foot stall',                ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'forehead-stall',            ifpaName: 'forehead stall',            ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'gauntlet',                  ifpaName: 'gauntlet',                  ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'head-stall',                ifpaName: 'head-stall',                ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'heel-stall',                ifpaName: 'heel stall',                ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'illusion',                  ifpaName: 'illusion',                  ifpaFormula: null,                            passbackAdd: 1, curatorNote: 'IFPA canonical = 2 ADD; PB counts 1 dex' },
  { ifpaSlug: 'inside-stall',              ifpaName: 'inside stall',              ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'knee-stall',                ifpaName: 'knee stall',                ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'legover',                   ifpaName: 'legover',                   ifpaFormula: null,                            passbackAdd: 1, curatorNote: 'IFPA canonical = 2 ADD; PB counts 1 dex' },
  { ifpaSlug: 'mirage',                    ifpaName: 'mirage',                    ifpaFormula: null,                            passbackAdd: 1, curatorNote: 'IFPA canonical = 2 ADD; PB counts 1 dex' },
  { ifpaSlug: 'mobius',                    ifpaName: 'mobius',                    ifpaFormula: 'gyro torque',                    passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'neck-stall',                ifpaName: 'neck stall',                ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'osis',                      ifpaName: 'osis',                      ifpaFormula: null,                            passbackAdd: 1, curatorNote: 'IFPA canonical = 3 ADD (spin + xbody + stall); PB counts 1 dex' },
  { ifpaSlug: 'outside-stall',             ifpaName: 'outside stall',             ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'paradox-blender',           ifpaName: 'paradox blender',           ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'paradox-drifter',           ifpaName: 'paradox drifter',           ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'paradox-legover',           ifpaName: 'paradox legover',           ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'paradox-mirage',            ifpaName: 'paradox mirage',            ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'paradox-osis',              ifpaName: 'paradox osis',              ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'paradox-torque',            ifpaName: 'paradox torque',            ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'paradox-whirl',             ifpaName: 'paradox whirl',             ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'parkwalk',                  ifpaName: 'parkwalk',                  ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'phoenix',                   ifpaName: 'phoenix',                   ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'pickup',                    ifpaName: 'pickup',                    ifpaFormula: null,                            passbackAdd: 1, curatorNote: 'IFPA canonical = 2 ADD; PB counts 1 dex' },
  { ifpaSlug: 'pixie-mirage',              ifpaName: 'pixie mirage',              ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'pixie-osis',                ifpaName: 'pixie osis',                ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'pixie-whirl',               ifpaName: 'pixie whirl',               ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'ripwalk',                   ifpaName: 'ripwalk',                   ifpaFormula: 'stepping butterfly',             passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'shoulder-stall',            ifpaName: 'shoulder-stall',            ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'sidewalk',                  ifpaName: 'sidewalk',                  ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'smear',                     ifpaName: 'smear',                     ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'smoke',                     ifpaName: 'smoke',                     ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'sole-kick',                 ifpaName: 'sole kick',                 ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'spinning-butterfly',        ifpaName: 'spinning butterfly',        ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'spinning-mirage',           ifpaName: 'spinning mirage',           ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'spinning-osis',             ifpaName: 'spinning osis',             ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'spinning-symposium-whirl',  ifpaName: 'spinning symposium whirl',  ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'spinning-torque',           ifpaName: 'spinning torque',           ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'spinning-whirl',            ifpaName: 'spinning whirl',            ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'stepping-osis',             ifpaName: 'stepping osis',             ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'stepping-whirl',            ifpaName: 'stepping whirl',            ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'sumo',                      ifpaName: 'sumo',                      ifpaFormula: null,                            passbackAdd: 2, curatorNote: 'Sumo also features in §3b edge cases (pt9 X-Dex exception)' },
  { ifpaSlug: 'swirl',                     ifpaName: 'swirl',                     ifpaFormula: null,                            passbackAdd: 1, curatorNote: 'IFPA canonical = 3 ADD; PB counts 1 dex' },
  { ifpaSlug: 'symposium-mirage',          ifpaName: 'symposium mirage',          ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'symposium-osis',            ifpaName: 'symposium osis',            ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'symposium-whirl',           ifpaName: 'symposium whirl',           ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'toe-stall',                 ifpaName: 'toe stall',                 ifpaFormula: null,                            passbackAdd: 0, curatorNote: null },
  { ifpaSlug: 'torque',                    ifpaName: 'torque',                    ifpaFormula: 'miraging osis',                  passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'tripwalk',                  ifpaName: 'tripwalk',                  ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'ducking-whirl',             ifpaName: 'ducking whirl',             ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'ducking-osis',              ifpaName: 'ducking osis',              ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'ducking-mirage',            ifpaName: 'ducking mirage',            ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'whirl',                     ifpaName: 'whirl',                     ifpaFormula: null,                            passbackAdd: 1, curatorNote: 'IFPA canonical = 3 ADD; PB counts 1 dex' },
  { ifpaSlug: 'whirling-butterfly',        ifpaName: 'whirling butterfly',        ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'whirling-mirage',           ifpaName: 'whirling mirage',           ifpaFormula: null,                            passbackAdd: 2, curatorNote: null },
  { ifpaSlug: 'around-the-world',          ifpaName: 'around the world',          ifpaFormula: null,                            passbackAdd: 1, curatorNote: 'IFPA canonical = 2 ADD (full-orbit dex + stall); PB counts 1 dex' },
  { ifpaSlug: 'orbit',                     ifpaName: 'orbit',                     ifpaFormula: 'around the world',               passbackAdd: 1, curatorNote: null },
];
