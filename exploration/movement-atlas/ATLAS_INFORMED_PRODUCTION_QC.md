# Atlas-Informed Production QC Audit

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. A read-only audit of the production freestyle surfaces for conflicts with the safe Atlas conclusions. It fixes nothing. Findings cite file and line from a read-only pass; severities are LOW/MED/HIGH; every finding notes whether it blocks launch.

## Headline: the dictionary already embodies the durable conclusions

The most important audit result is a confirmation, not a conflict. The production surfaces already carry the safe Atlas doctrine, in their own words:

- **ADD is the count of scored parts.** `src/content/freestyleGlossaryCoreConcepts.ts:61`: "Because ADD is a count of parts, it follows straight from composition... the parts are the points." Aligned with harvest #6.
- **Score follows structure, not name.** `src/content/freestyleTrickOntologyRole.ts:71`: "the score follows the notation, not the operator name." Aligned with harvest #2.
- **A kick scores one less than a stall.** `src/content/freestyleSemanticOverrides.ts:64`: "a dex-kick finishes the same circling motion with a kick, so the loop scores a single ADD because no terminal stall is added," and it adds that such forms "follow naturally from the notation but are rarely performed as named tricks." Aligned with harvest #7 and #9.
- **Freestyle is a movement language.** The glossary core-concepts, history narrative, and mechanical-delta content already frame it this way. Aligned with harvest #1.
- **Identity is alias-aware and slug-canonical.** The service resolves aliases to canonical slugs and dedups by slug, not by literal display name (`freestyleService.ts` alias/duplicate-archive ladder step; slug-keyed dedup throughout). Aligned with harvest #3, #4, #10.

Because of this alignment, the audit found **no HIGH or MED conflicts and no launch blockers.** The findings below are all LOW-severity wording or preventive-guard items.

## Findings

### QC-1: "generate every possible variation" over-claims completeness
- **Surface:** `src/content/freestyleHistoryNarrative.ts:105`.
- **Claim:** the Ben Job notation "could generate every possible variation, not only the ones players had already named and performed."
- **Atlas conclusion it conflicts with:** grammar-describable is not exhaustive or physically realizable (harvest #12); the generative space is an upper bound. "Every possible variation" reads as a completeness-and-realizability claim.
- **Severity:** LOW. It is inside a historical narrative about a 1995 claim, and the surrounding sentence is otherwise sound.
- **Recommended disposition:** soften to something like "a wide range of variations beyond those players had already named," preserving the historical point without the completeness claim.
- **Work type:** content.
- **Blocks launch:** no.

### QC-2: "primitive" applied to atoms and stalls in public content
- **Surface:** `src/content/freestyleLandingContent.ts:139` ("core atom: foundational single-stall primitive"); `src/content/freestyleMovementSystems.ts:48` ("Set primitives that initiate a trick").
- **Claim:** a stall, and a set, are labeled "primitives."
- **Atlas conclusion it conflicts with:** the foundational atoms are compositions (a stall is a contact plus a delay; a set operator is a leg-circle at a setting), not irreducible primitives (harvest #5, and the internal closure result). Note the same content set is otherwise aligned: `freestyleCoreAtomEducational.ts:67` already says "a toe stall is not really a trick, it is an anchor state."
- **Severity:** LOW. "Primitive" here reads as "foundational/basic," which is pedagogically fine; the conflict is only with a strict reading of irreducibility, which is internal doctrine, not visitor-facing truth.
- **Recommended disposition:** optional. If touched, prefer "foundational" or "anchor" over "primitive" to avoid implying irreducibility. The "atoms are compositions" insight stays internal doctrine; it is not something the public copy must assert.
- **Work type:** content / doctrine.
- **Blocks launch:** no.

### QC-3: "primitive" in code comments (internal only)
- **Surface:** `src/content/freestyleFamilyOverrides.ts:249,252,255` ("base primitives", "kick primitives").
- **Claim:** internal comments call surfaces and kicks "primitives."
- **Atlas conclusion:** same as QC-2 (they are compositions).
- **Severity:** LOW, and internal (code comments, not rendered).
- **Recommended disposition:** optional wording note for internal consistency; no visitor impact.
- **Work type:** doctrine (comment).
- **Blocks launch:** no.

### QC-4: notation equality must never be a merge or promotion key
- **Surface:** resolver and promotion paths (`freestyleService.ts` dedup, and the promotion/loader path generally). No active defect found: the service dedups by slug and resolves aliases, which is correct.
- **Behavior at risk:** the live data has 36 notation strings each shared by 2+ distinctly-named tricks (72 rows). Any current or future logic that treated notation-string equality, or literal-name equality, as evidence that two rows are the same movement would wrongly merge distinct dictionary objects.
- **Atlas conclusion it protects:** distinct dictionary objects can share one notation (harvest #11); formula/slug identity supersedes literal-name matching (harvest #10).
- **Severity:** LOW (preventive; no current defect observed).
- **Recommended disposition:** add a regression test asserting that no dedup, related-trick, or promotion path uses raw `operational_notation` equality or literal `canonical_name` equality as a merge key, and that alias/slug resolution is the identity path. Keep curator review and existing governance unchanged.
- **Work type:** resolver / test.
- **Blocks launch:** no.

## Patterns checked and found clean (no finding)

For honesty, the patterns the audit searched for and did **not** find as production conflicts:

- Names or slugs presented as structural identity beyond the (correct) use of slug as the dictionary's canonical key: clean; aliases resolve to slugs.
- One-name-one-movement claims: clean; the alias and positional-identity systems explicitly handle many-to-one and side-configuration identity.
- Notation presented as a complete physical description: clean; the mechanical-delta content explicitly frames notation as tracking structure, and the dex-kick copy frames notation as generative beyond the named.
- Dictionary presented as the exhaustive universe of possible movement: clean; the history narrative frames the notation as reaching beyond the named vocabulary (the opposite of an exhaustiveness claim).
- Set/operator labels treated as full trick objects: clean at the layer boundary; the modifier layer is kept distinct from tricks (aside from the "primitive" wording in QC-2/QC-3).
- Historical families presented as exhaustive structural partitions: clean; family claims are hedged ("nearly every trick resolves to..."), and family is treated as one axis, not the only one.
- ADD presented as anything other than scored-component count where operational notation is present: clean; ADD is consistently the scored-part count.
- Kick-versus-stall relationship: clean and correct.

## Summary

No launch-blocking conflicts. Four LOW findings: two public-wording softenings (QC-1, QC-2), one internal-comment note (QC-3), and one preventive resolver/test guard (QC-4). The dominant result is that the live dictionary already agrees with the Atlas's durable conclusions, which is itself the audit's most useful output: the mature conclusions are safe to state publicly because production already behaves as if they are true.
