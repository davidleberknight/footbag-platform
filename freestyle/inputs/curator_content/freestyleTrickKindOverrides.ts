/**
 * freestyleTrickKindOverrides.ts
 *
 * The rows of `freestyle_tricks` that are not tricks a browse should list,
 * seeded into `freestyle_tricks.trick_kind`. A row not named here is a trick.
 *
 * The table mixes structural roles: true tricks (whirl, ripwalk, mobius) sit
 * beside modifiers (spinning, paradox), set operators (atomic, quantum) and rows
 * whose role is still under review. The trick browse lists only true tricks;
 * modifiers and operators have their own homes.
 *
 * The kind classifies structural role only. It is not the category column:
 * spyro is category body but a modifier, and the catch surfaces stay tricks.
 */

export type FreestyleTrickKind = 'modifier' | 'operator' | 'surface' | 'pending-review';

export const TRICK_KIND_OVERRIDES: ReadonlyMap<string, FreestyleTrickKind> = new Map<string, FreestyleTrickKind>([
  // Body and set modifiers: rows that transform a base trick.
  //
  // The bare spinning kicks spin and double spin are deliberately absent. They
  // are canonical tricks in their own right, historically recognised bare-name
  // kicks whose kick terminator is implied, so they list in the browse. The
  // spinning concept still acts as a modifier inside compounds, through the
  // separate spinning row below; spin and spinning are a dual-role pair, not a
  // contradiction, and this is a narrow exception rather than a rule that every
  // rotational term becomes a standalone trick.
  ['ducking',   'modifier'],
  ['gyro',      'modifier'],
  ['paradox',   'modifier'],
  ['spinning',  'modifier'],
  ['stepping',  'modifier'],
  ['symposium', 'modifier'],
  ['tapping',   'modifier'],
  ['terraging', 'modifier'],
  // Spyro is the counter-case to spin: a folk synonym for a spinning-class
  // rotational descriptor (category body, 1 ADD), not a standalone scoring
  // element. It stays a modifier and out of the browse, and survives as folk
  // vocabulary in the glossary.
  ['spyro',     'modifier'],

  // Set operators: the category-set rows except pixie and fairy, which are
  // dual-role, a set that also stands as a trick, so they list in the browse.
  // Pogo and rooted are stationary set primitives, not 0-ADD tricks. Blazing is
  // a whirling-chassis set the following trick is performed off of; its +1 is
  // the set's scoring contribution, so it initiates a trick rather than
  // transforming one.
  ['atomic',   'operator'],
  ['blazing',  'operator'],
  ['furious',  'operator'],
  ['pogo',     'operator'],
  ['quantum',  'operator'],
  ['rooted',   'operator'],
  ['sailing',  'operator'],
  ['shooting', 'operator'],

  // Under review: whether surging is a set, a modifier or a true trick is
  // unresolved, though compound rows already name it as their base.
  ['surging', 'pending-review'],
]);
