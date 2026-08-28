/**
 * freestyleDisplayNameExceptions.ts
 *
 * The curator-approved exceptions to the rule that a trick's display name folds
 * back to its slug.
 *
 * The rule itself is the content pipeline's hard gate: a name passes when it is
 * an approved verbatim exception, or when it carries no underscore, its hyphens
 * sit only inside approved compound-adjective tokens, and folding it to
 * lowercase with non-alphanumeric runs collapsed reproduces the slug exactly.
 * The admin save applies the same rule so a curator cannot store a name the
 * pipeline would reject on its next run.
 *
 * Why this file exists as well as the curated one. The curator's home for these
 * decisions is the display-name exceptions file in the pipeline's curated trick
 * inputs, and it stays that: it carries each decision's reason, and the pipeline
 * reads it directly. The deployed container does not ship that tree, so the
 * running application cannot read it and this module is the compiled mirror. It
 * is data, not a second rule, and a parity test asserts the two agree exactly,
 * so a curator adding an exception there and forgetting this one is a failing
 * test rather than a save the pipeline will later refuse.
 *
 * Forever-rules:
 *   - The curated file is where a decision is made and where its reason lives.
 *     Reasons deliberately do not travel here; a reader wanting to know why an
 *     exception exists goes to the file that records it.
 *   - Adding an entry here without adding it there is backwards, and the parity
 *     test fails either way round.
 */

/**
 * Slug to the exact display name approved for it.
 *
 * Two shapes appear. A folk-name slug bound to a structural display name
 * (`big_apple_sauce`), and a family whose slug keeps a stable abbreviation while
 * the display spells it out (the reverse-whirl rows).
 */
export const DISPLAY_NAME_ROW_EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  ['big_apple_sauce',                   'spinning paradox miraging symposium torque'],
  ['stepping_p_s_whirling_x_body_rake', 'Stepping P.S. Whirling x-body Rake'],
  ['rev_whirl',                         'reverse whirl'],
  ['fairy_rev_whirl',                   'fairy reverse whirl'],
  ['nuclear_rev_whirl',                 'nuclear reverse whirl'],
  ['pixie_rev_whirl',                   'pixie reverse whirl'],
  ['pixie_symposium_rev_whirl',         'pixie symposium reverse whirl'],
  ['spinning_rev_whirl',                'spinning reverse whirl'],
  ['stepping_rev_whirl',                'stepping reverse whirl'],
  ['whirling_rev_whirl',                'whirling reverse whirl'],
]);

/**
 * Compound adjectives whose hyphen is genuine English orthography.
 *
 * The display keeps the hyphen and the slug folds it to an underscore, so these
 * are removed before the "no separator hyphen" check rather than being treated
 * as a curator writing a slug into a name.
 */
export const GENUINE_HYPHEN_TOKENS: readonly string[] = ['cross-body', 'x-body'];
