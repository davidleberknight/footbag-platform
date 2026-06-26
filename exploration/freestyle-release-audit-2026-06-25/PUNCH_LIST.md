# Freestyle dictionary — release-candidate punch list (2026-06-25)

Read-only final quality pass. Findings are verified (agent claims that turned out to be false
positives were dropped — see "Excluded"). No speculative doctrine; no architectural rewrites; no
already-completed work. Classified P0–P3.

## Headline

**No P0 (incorrect/misleading) defects found.** After this session's work the core surfaces —
trick pages, Set Encyclopedia, Operators & Modifiers, Movement Systems, Emerging Vocabulary, and the
paradox / atomic·illusioning / barraging·furious / spin·spinning language — are consistent and
correct. The remaining gap to 1.0 is completeness + polish + a few navigation/consistency nits.

## P1 — Major quality (fix before 1.0)

1. **Blurry is classified two ways in the glossary.** `src/views/freestyle/glossary.hbs:643` groups
   blurry with ducking/spinning as a "modifier ecosystem … with no ending of its own", but `:1472`
   lists it as "set (composite ≡ stepping+paradox)". Blurry is canonically a composite set; the
   modifier-ecosystem line misleads. Reconcile to one framing (drop blurry from line 643, or state
   the dual set/modifier role the way atomic/illusioning is handled).
2. **16 world-record trick names resolve to no active trick or alias**, so those records badge
   nowhere (known IP item: undefined operators, unpublished bases). Either canonicalize the clean
   ones or suppress the dangling record→trick link so a reader never hits a dead reference.
3. **Operator pages don't link back to their base atom.** The atom→operator "See also" cross-link
   added this session (spin→spinning, whirl→whirling, …) is one-directional. Add the reverse on
   `/freestyle/modifier/:slug` (`getModifierStubPage` + `modifier-stub.hbs`) so spinning→spin etc.
   close the loop.
4. **`trick_family` values are hyphenated while slugs are underscored** (around-the-world,
   inside-stall, clipper-stall, butterfly-kick …) — a post-underscore-migration residual. Confirm the
   `?family=` filter and family chips still resolve against the hyphenated value (self-consistent if
   they key on `trick_family`); normalize as part of the IP underscore-residual cleanup so family
   navigation can't silently break.

## P2 — Minor polish

5. **Execution-first descriptions for the flagship tricks.** A handful of foundational tricks read as
   structural/heritage prose where footbag.org leads with how to perform it (entry options, balance
   cue, gotcha): clipper, mirage, whirl, osis, illusion, and fairy/pixie (which currently use
   comparative-only "opposite of pixie" wording). Rewrite these few descriptions execution-first in
   our own words (do not copy fb.org).
6. **~21 active tricks have empty/placeholder descriptions.** Detail pages should carry a written
   description or a clean "description pending", never blank.
7. **Notation backfill.** 3 active tricks lack both JOB and operational notation (sole_survivor,
   bill-ted-s-excellent-adventure, oh-wheely — low-traffic folk names); ~11 lack JOB, ~27 lack
   operational notation. The corrections-loader fix this session applies pending op-notation
   backfills on the next rebuild; the genuine-gap rows still need authoring.
8. **EV generator data hygiene (no public impact).** `duplicate_variant` rows are emitted with
   `section: "frontier"` in the generated universe; the service correctly filters them out of public
   counts, so nothing leaks, but the generator should assign archive-class buckets a non-frontier
   section so the data file is clean.
9. **Media coverage (curator backlog).** Freestyle media is sparse and an ongoing curator track.
   Re-measure coverage on the live `media_items` + `media_tags` model (the deprecated
   `freestyle_media_*` graph gives misleading numbers) and ensure every foundational trick has at
   least one media item. Supplementary layer, not a dictionary-text blocker.

## P1 resolution (worked 2026-06-25)

- **P1.1 Blurry glossary contradiction — FIXED.** Removed blurry from the "modifier ecosystems …
  no ending of their own" line (`glossary.hbs:643`); it remains correctly a composite set in the kind
  table. Test updated.
- **P1.2 Operator↔atom bidirectional links — FIXED.** Added the reverse link (operator → base atom)
  on both the modifier stub and the spinning teaching page (`baseAtomCrossLinkFor`), so spinning→spin,
  whirling→whirl, … close the loop the atom→operator "See also" opened. Unit + route tests added.
- **P1.4 Family hyphen/underscore — VERIFIED, downgraded to P2.** `listByFamily` matches
  `trick_family = ?` exactly and the family chip uses the same raw `trick_family` value, so `?family=`
  links round-trip correctly today. The slug(underscore)/family(hyphen) mismatch is cosmetic
  data-hygiene (part of the IP underscore-residual cleanup), not user-facing breakage.
- **P1.3 Unresolved record links — AUDITED; rendering already safe; no auto-aliasing.** The records
  page already suppresses dead links (`trickHref` is null for unresolved names → plain text, not a
  broken link), so nothing renders broken. Of 165 record names, **27** don't resolve to a trick;
  audited individually:
  - **3 are not tricks** (record categories): "Unique 3-Dex", "Unique Beastly", "Unique Fearless" —
    intentionally orphaned; correct.
  - **13 are `(ss)` positional variants** of existing tricks (Assassin, Eggbeater, Eclipse, Smear,
    Smog, Smudge, Paste, Pigbeater, Double Leg Over, Fairy Double Leg Over, Fairy Pickup, Pixie DSO,
    Pixie Double Pickup). Per the positional-identity doctrine a multi-component `(ss)` form needs a
    **curated** equivalence, so auto-aliasing them to the base would paper over an unverified claim →
    left on the curator worklist (NEEDS-AUTHORING, not a blanket alias).
  - **11 are genuinely unresolved** (undefined operators "Motion"/"Locomotion"/"Solestice";
    unpublished bases "Scorpion's Tail"/"Spanishfly"; degenerate "Blink"/"Toe Spinning Toe";
    ADD/name conflicts "Enterrage"/"Double Dyno"/"Double Whip"/"Stepping Ducking Blurry Whirl") →
    curator worklist (existing IP item). None has a clean canonical to alias.
  Net: no code change is correct here; the value is the per-name classification so nothing is
  silently papered over.

- **P1.5 (found in the P1 re-audit) ADD-Analysis provenance jargon — FIXED.** `/freestyle/add-analysis`
  rendered the resolved-formula **Provenance** column, whose 28 strings were internal audit notes
  saturated with forbidden jargon (Red, pt##, `.ts`/`.py` file names, code-symbol names like
  `COMPOSITE_DERIVATIONS`, "Bucket A", "ATAM") — a public-prose hygiene violation on a non-sanctioned
  surface. The clean ADD math was already duplicated in the Breakdown column, so the column was
  dropped (matches the project pattern where provenance is internal/unrendered). Two further `pt##`
  leaks in `passbackAddDisagreements` curator notes were also stripped. A page-wide regression test
  now asserts no Red/pt##/code-symbol/file-ref reaches the rendered page. (The equivalence-topology
  "per Red" was verified to live in an unrendered field — safe.)

## P3 — Nice future

10. **Aliases sparse on foundational tricks** (mirage, whirl carry none) — add common abbreviations
    for search discoverability.
11. **Continue undefined-operator definitions** (zulu highest-leverage) to keep shrinking the
    Emerging Vocabulary frontier and resolve more record names.

## Excluded (verified NOT issues — recorded so they aren't re-raised)

- "219 folk rows with empty failureClass = unclassified": false positive. `section=folk` classifies
  as the Folk-names reason regardless of failureClass; folk needs no failureClass. All 1,272 rows
  carry a valid reason.
- "19 NULL base_trick = defect": mostly correct — base atoms (dyno, surging, ripstein, dada-curve,
  paradon) legitimately have no base_trick.
- "P0: 3 core tricks / 3 tricks missing media or notation": these are completeness gaps (P2), not
  incorrect/misleading content; downgraded.
- Paradox / atomic·illusioning / barraging·furious / spin·spinning / EV-Red-naming: already fixed
  this session; consistent across surfaces.
