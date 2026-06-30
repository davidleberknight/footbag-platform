# FootbagMoves Reconciliation — Summary

Read-only reconciliation of the FootbagMoves (FM) corpus against the live freestyle
dictionary. Scope: the full A–Z corpus (854 FM moves in `SYMBOLIC_GRAMMAR_MASTER.csv`),
plus the precomputed `FM_MATH_DIVERGENCES.csv` (22 terms) and `OPERATOR_INVENTORY.csv`
(55 operators). Nothing in production was changed. This report is the narrative; the
three review CSVs alongside it hold the row-level detail.

The objective was not to harvest missing tricks. It was to treat FM as a second
human-authored source and ask what structure, terminology, and educational value it adds.

---

## What FootbagMoves contributed

- **A folk-name / alias vocabulary.** 221 FM rows display a name that differs from our
  canonical name. Most are names we already recognise; the genuinely new, doctrine-safe
  ones distil to **43 realistic alias candidates** — memorable folk names that map to
  compounds we currently expose only under long structural names (for example
  `Vertigo → ducking-paradox-drifter`, `Croissant → pixie-symposium-whirling-swirl`,
  `Sabotage → toe-flurry`, `Cyclone → shooting-gyro-mirage`).
- **A positional / directional naming layer.** ~77 name-based same-side / far / in-out /
  out-in variants, all ADD-neutral. This is external corroboration for the open
  positional-evidence worklist — an independent source naming the `(ss)` / `(far)`
  variants the resolver currently holds.
- **A folk-operator inventory.** 55 operators with inferred semantics, and per-trick
  compositional readings (FM's `technical_name`, e.g. "Barrage = Clipper-set Double
  Mirage").
- **Cross-source equivalence evidence** for three doctrine threads (below).
- **A small set of new structural tricks**, clustered in the dragon-terminal family
  (`Dragster` = miraging-dragon, `Firefly` = butterfly-dragon) — which also supply
  structure for the Dragon "identification" residue.

## What was already covered

- **108** of the 221 differing FM names already exist in our dictionary as aliases.
- **93 of 100** FM `equivalent_to` mappings are FM simply using *our* canonical name —
  confirmation, not new information.
- **51** positional variants are already represented through their base trick (the
  positional-identity doctrine deliberately does not split side/direction into rows).
- The earlier federation assessment that FM is "~93% absorbed" holds: the corpus is
  overwhelmingly structure we already carry.

## How the candidate counts relate (reconciliation)

The alias work ran in two passes, so three figures appear in the working notes. They are
consistent once the funnel is laid out:

1. **Displayed-name divergence pass** (source = FM's primary displayed `move_name` only,
   in `FM_NAME_DIVERGENCE_REVIEW.csv`): 221 names differ from our canonical → 108 already
   aliases, 62 positional, 51 folk/short. Of the 51, **33 rows are doctrine-clean — which
   is 29 distinct names** (4 are duplicate multi-source rows), 17 touch a doctrine
   operator, 1 is ADD-untrusted.
2. **Final SAFE_ALIAS pass** (`FM_ALIAS_CANDIDATES_REVIEW.csv`) broadens and tightens:
   it also mines `alternate_names` and structural-reading names — which the displayed-name
   pass skips whenever the displayed name already equals our canonical (e.g. *High Plains
   Drifter* is our canonical, but its alternate **Barrifter** is new) — and it adds
   down-family/DOD and blurry-rotational to the doctrine filter.

Net: **43 clean candidates = 26 carried from the 29 distinct displayed-name divergences
+ 17 new from the broader `alternate_names`/structural sources.** The 3 not carried are
Blacula and Kiwi (down-family/DOD, now held) plus one residual. The final pass holds
**22** candidates as doctrine-touching (more than the divergence pass's 17, because the
wider candidate pool and stricter filter catch more).

## What we recommend adopting (proposed; nothing wired yet)

- **The 43 clean alias candidates** in `FM_ALIAS_CANDIDATES_REVIEW.csv` (39 high
  confidence, 4 medium). Each is a distinct FM folk or structural name mapping to an
  *active* trick by structure, not yet an alias, and free of any doctrine-pending operator.
  This is the curatable list: review, resolver-check, then wire the confirmed ones as
  `SAFE_ALIAS`.
- **Two cross-hits with open IP record names:** `Spanish Fly → ducking-barfly`
  (the unresolved "Spanishfly" record) and `Torch-r Rack → stepping-superfly`.
- **One new doctrine question:** the `far` / `near` ADD weight, which FM observes as +0
  but which has never been formally ruled (distinct from the settled `ss = +0`).

## What we intentionally rejected

- **All FM ADD values where `ss`, X-Dex, `terraging`, or `furious` appear.** FM
  systematically under-counts these (it ignores X-Dex; it mishandles `ss`). Quantified in
  `FM_MATH_DIVERGENCES.csv`: of 22 flagged terms, 7 are genuine FM math errors.
- **FM's atomic-vs-illusioning structural split.** FM occasionally distinguishes them by
  beat-marker placement; Red ruled illusioning *is* atomic. Across the full corpus FM uses
  "atomic" 16× as a primary name and "illusioning" 0×, so FM's dominant practice actually
  agrees with the merge. The split is rejected by current doctrine.
- **Positional variants as new scoring rows.** They are +0 naming variants, not new ADD.
- **The inflated "292 positional" figure.** 233 of those were `XBD` cross-body *surface*
  markers, not positional variants; the true count is ~77.
- **Extraction noise:** typos (`fornt swirl`), truncated rows, and the 302 no-notation
  entries.

## What remains evidence only (carry to the doctrine packet; do not act)

- **Quantum vs Miraging:** FM treats them as **distinct, non-overlapping** coordinates
  (Quantum a productive set across 12 bases; Miraging only a structural reading; no base
  under both). Evidence for the open "one set or two?" question.
- **Furious ≈ Barraging:** FM corroborates near-equivalence (`Genesis` is labelled both
  "Furious Whirl" and "Barraging Whirl").
- **Atomic ≡ Illusioning:** FM agrees with the merge (see above).
- **22 doctrine-held alias candidates** that touch open threads (down family / DOD,
  blurry-rotational, quantum / sailing / zulu / barraging). Hold until the relevant
  Red or curator ruling; do not wire as aliases yet.
- **The dragon-terminal structures** (`Dragster`, `Firefly`, miraging-dragon) feed the
  Dragon decision but are not promoted here.

## Recommended future work

1. Resolver-check and wire the confirmed subset of the **43 clean aliases**.
2. Put the **`far` / `near` ADD-weight** question to Red.
3. Fold the **dragon-terminal structures** into the Dragon identification decision
   (they convert it from "open" to "structure supplied by a second source").
4. Re-evaluate the **22 held candidates** as each doctrine thread resolves.
5. Optionally surface FM's compositional readings (e.g. "Barrage = Clipper-set Double
   Mirage") as Set-Encyclopedia / Commentary glosses — teaching value, not ontology.

## Supporting artifacts (read-only)

- `FM_ALIAS_CANDIDATES_REVIEW.csv` — **43 clean SAFE_ALIAS candidates** (the curatable list).
- `FM_POSITIONAL_CANDIDATES_REVIEW.csv` — 77 positional/directional variants (all
  "preserve as observational").
- `FM_NAME_DIVERGENCE_REVIEW.csv` — the full 221 name divergences, with type and
  doctrine/trust flags, for traceability.

The enduring value of FootbagMoves is a **folk-name alias vocabulary, a positional-variant
naming layer, and cross-source equivalence evidence** — not new tricks and not ADD values.
