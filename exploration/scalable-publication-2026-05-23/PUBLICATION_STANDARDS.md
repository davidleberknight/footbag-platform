# Scalable Publication Standards -- draft for curator review

Date: 2026-05-23
Status: exploration draft (not canonical doc); curator review pending
Trigger: Red Q11-A ("PassBack is a baseline / historical scoring layer") stabilizes the architecture for confident breadth expansion

## Purpose

Codify the current scalable-publication standard so future curator slices do not regress into over-curation gatekeeping. The architecture is now mature enough that mechanical canonical activation should be the default; flagship-tier ontology essays are an enhancement layer, not an activation prerequisite.

The four tiers below partition publication requirements. Tier 1 is the default for canonical activation. Tier 2 is the selective flagship layer. Tier 3 captures the doctrine-sensitive cohort that stays on hold. Tier 4 is the renamed Emerging Vocabulary staging surface.

## Tier 1 -- Mechanically complete (default canonical activation)

A trick row activates as canonical when, and only when, all of the following hold:

- Canonical slug + display name + numeric `adds` value land in `freestyle_tricks` via the active loader path.
- Executable JOB notation is present via one of three sources, in priority order:
  1. `CoreTrickSpec.operationalNotation` (the 12 core atoms; single source of truth for atomic JOB)
  2. `ResolvedFormula.operationalNotation` in `freestyleResolvedFormulas.ts` (curator-published compound JOB)
  3. `freestyle_tricks.operational_notation` DB column (CSV-loaded curator notation)
- Mechanically-derivable ADD breakdown exists and matches the row's `adds` value within the executable counting system (DEX / XBD / BOD / PDX / DEL / UNS buckets). PB / FM divergence is NOT a blocker: it is provenance, recorded on the resolved-formula entry's `provenance` field or equivalent.
- Family classification assigned via `trick_family` (self-bucket allowed for singletons).
- `review_status` is `expert_reviewed` or `curated`.
- `is_active = 1`.

Optional enhancements (none gate activation):

- Movement-intuition prose in `freestyleTrickIntuition.ts` (Tier 2)
- Curator-authored compound description distinct from the canonical template form
- Aliases populated in `freestyle_trick_aliases`
- Reference media linked through `freestyle_media_links`
- PB / FM baseline-claim recorded as historical provenance metadata when the canonical executable ADD diverges from a documented source claim

Forbidden across all tiers:

- Reviewer names or curator-internal language in `description` (see `feedback_public_facing_prose`)
- ADD math contradicting the row's `adds` value (HIGH-severity QC failure)
- Tautological decompositions (a row whose JOB or derivation simply restates the canonical name)
- `#curated` in sidecar tag arrays (CMP enforcement at load time)
- Aliases inside `description` text (aliases live in the dedicated table only)

## Tier 2 -- Flagship ontology essays

Selective; high-stakes. Reserved for landmark vocabulary:

- The 12 core atoms (toe-stall, clipper-stall, mirage, whirl, butterfly, osis, swirl, legover, pickup, illusion, around-the-world, plus the orbit edge case)
- Foundational rotational bases beyond the core atoms (torque, blender)
- Iconic compound landmarks (paradox-mirage, BOP triplet, eggbeater, ripwalk, atom-smasher)

Adds the following on top of Tier 1:

- `freestyleTrickIntuition` entry with movement-feel narrative attributed to its source (fb.org /newmoves, Holden compilation, PassBack methodology series, etc.)
- Cross-family relationship prose explaining how the row anchors or bridges families
- Pedagogical examples illustrating the operator at play
- Family-anchor framing recorded in `freestyleFamilyInvariants`
- Topology / cross-axis content recorded in `freestyleEquivalenceTopology`

Tier 2 is curator-paced. A row activates at Tier 1 first and earns Tier 2 enhancement later -- the prose layer never blocks canonical visibility.

## Tier 3 -- Doctrine-sensitive (curator hold)

Applies to rows where one or more of the following hold:

- The row depends on modifier vocabulary that is unresolved at the doctrine level (current open questions: fairy weight, barraging composite, blurry composite, inspinning composite, gyro+torque doctrine)
- The row's mechanical derivation diverges from a documented source claim AND no Red ruling settles the divergence type
- The row requires composite-modifier expansion (a single inline modifier that decomposes to multiple operator weights)

Treatment:

- The row stays in Emerging Vocabulary (the Tier 4 surface)
- The observational entry carries `unresolvedBlockers` referencing the open doctrine question
- Promotion to Tier 1 requires the curator's explicit per-row sign-off, ideally bundled with the relevant Red consultation answer

## Tier 4 -- Emerging Vocabulary (the new default for unsettled entries)

The renamed observational surface. Carries:

- A folk-slug (no canonical row in `freestyle_tricks` yet)
- One or more `proposedReadings`
- An optional `operationalNotation` when the JOB string is already authored upstream (in `freestyleTrackedNames.ts` or imported from a corpus)
- Source attribution via `sourceLabel` and explicit `sourceCitation`
- Per-card claim numeric, surfaced as a source-attributed label ("PB claim: 3", "FM claim: 5"), never as a canonical ADD
- Per-card status chip
- Optional curator note + unresolved-blockers array (Tier 3 cases)

Layer-separation invariants from `feedback_observational_canonical_promotion_cleanup`:

- Emerging-Vocabulary entries never appear on canonical surfaces (landing core-tricks grid, ADD analysis, glossary terms, trick-detail pages, family / movement-system / topology views)
- Emerging-Vocabulary entries never get media attachments (curator-gated)
- Emerging-Vocabulary entries never get a `/freestyle/tricks/{slug}` route (no detail page)
- When a row is promoted to canonical, its Emerging-Vocabulary entry is removed in the same change-set (no stale slug-in-both state)

## Dual-convention ADD counting (forever-rule, ratified Slice 7-OBS-A)

Two ADD-counting conventions coexist in the dictionary. They describe the same physical movement under different counting models. Both are recognized scoring layers; neither is more "correct" than the other.

### Convention 1 -- canonical bracket (footbag.org-style)

JOB strings written with uppercase tokens and `[BRACKETS]`. Used by:

- The 12 core atoms (CoreTrickSpec.operationalNotation)
- Curator-resolved folk-name compounds (barfly, paradon, barraging-osis, blur, high-plains-drifter, squeeze, etc.)
- Modifier-stack compounds (paradox-mirage, spinning-whirl, ducking-clipper, etc., once their JOBs are bracket-rewritten)

Counting rule: every distinct `[TOKEN]` instance contributes +1 ADD. Tokens include `[DEX]`, `[XBD]`, `[BOD]`, `[PDX]`, `[UNS]`, `[DEL]`. `(plant)`, `(no plant while)`, `(back)`, `(front)` and positional descriptors (`TOE`, `CLIP`, `SET`, `SAME`, `OP`, `IN`, `OUT`) are non-additive.

Calibration rows (all 7 confirm the convention; bracket count == curated ADD):

| Slug | JOB | ADD |
|---|---|---:|
| `barfly` | `CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]` | 4 |
| `barrage` | `CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]` | 3 |
| `barraging-osis` | `CLIP > OP IN [DEX] > SAME IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | 5 |
| `blur` | `CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]` | 4 |
| `high-plains-drifter` | `CLIP > SAME IN [DEX] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]` | 4 |
| `paradon` | `TOE > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]` | 4 |
| `squeeze` | `[UNS] [DEL]` | 2 |

### Convention 2 -- FM parens (FootbagMoves-style)

JOB strings written with mixed-case tokens and `(parens)`. Used by:

- The Slice 7-OBS-A promotion cohort (bladerunner, bling-blang, cold-fusion, flurricane, golden-shower, goliath, gybas, motion-sickness, pandemonium)
- All `freestyleTrackedNames.ts` entries with `formulaProvenance: 'FootbagMoves'`

Counting rule: only `(DEX)` tokens contribute +1 ADD. All other parenthesized flags are descriptive qualifiers:

- `(XDEX)` -- cross-dex flag attached to a dex event
- `(XBD)` -- cross-body topology on a step
- `(BOD)` -- body-component marker (even on standalone `Duck (BOD)` / `(back) Spin (BOD)` steps)
- `(PDX)` -- paradox-pose flag on a dex event
- `(DEL)` -- terminal stall (implicit; every trick has one)
- `(UNS)` -- unusual-surface descriptor

Calibration rows (all 9 from the Slice 7-OBS-A cohort confirm the convention; (DEX)-count == PB historical claim):

| Slug | JOB | PB claim | (DEX) count |
|---|---|---:|---:|
| `bladerunner` | `Toe > Op Out (DEX) >> Op Out (DEX)(XDEX) > Op Out (DEX) > Same Toe (DEL)` | 3 | 3 |
| `bling-blang` | `Clip > Op Front Whirl (DEX) >> Same Back Swirl (DEX) > Op Clip (XBD)(DEL)` | 2 | 2 |
| `cold-fusion` | `Clip > Same Out (DEX)(PDX) >> Op Out (DEX)(XDEX) > Same Out (DEX) > Op Clip (XBD)(DEL)` | 3 | 3 |
| `flurricane` | `Clip >> (back) Spin (BOD) > Same In (DEX) > Same In (DEX) >> Op Out (DEX) > Same Toe (DEL)` | 3 | 3 |
| `golden-shower` | `Clip > Op In (DEX) >> Duck (BOD) >> Op Out (DEX)(PDX) > Op Out (DEX) > Same Toe (DEL)` | 3 | 3 |
| `goliath` | `Toe > Same In (DEX) >> Duck (BOD) >> Op In (DEX) > Op Out (DEX) > Same Toe (DEL)` | 3 | 3 |
| `gybas` | `Clip > Op In (DEX) >> Op Back Whirl (DEX) > (back) Spin (BOD) > Same Clip (XBD)(DEL)` | 2 | 2 |
| `motion-sickness` | `Clip >> (back) Spin (BOD) >> Op Out (DEX) > Same Out (DEX) >> (back) Spin (BOD) > Same Clip (XBD)(DEL)` | 2 | 2 |
| `pandemonium` | `Toe > Same In (DEX) >> (no plant while) Op Out (DEX)(BOD) > Op Out (DEX) > Same Toe (DEL)` | 3 | 3 |

### The forever-rule

**The JOB-notation punctuation style determines its counting convention.**

- `[BRACKETS]` → canonical convention; every token +1.
- `(parens)` → FM convention; only `(DEX)` events count.

Rewriting between conventions is curator-doctrine work, not transcription. Re-bracketing an FM string may change the implied ADD (e.g. `bladerunner`'s FM dex-count is 3; a canonical-bracket rewrite might count more elements as additive). Such rewrites are reserved for a future curator pass and are not part of the publication path.

### What this preserves

- **Executable derivation authority.** Each ADD is mechanically derivable from its JOB string under its own convention.
- **Zero-mismatch invariant.** Each row's published `adds` value matches its JOB-derived count under its convention. There is no "canonical disagrees with executable" state.
- **Community recognition.** Folk-named tricks publish at their community-perceived ADD; the dictionary does not silently reframe community-known tricks at higher difficulty.
- **Doctrine-divergence as metadata.** When a curator later evaluates a canonical-bracket rewrite for an FM row, any divergence is recorded as a doctrine question, not as an implicit error.

## Anti-pattern: over-curation as gatekeeping

The 2026-05-18 expansion gated on "Wave-2-safe": no barraging, no fairy, no blurry composite, no atomic-family X-dex scope question. That gate was correct at the time. Q11-A invalidates it for most entries by reframing divergence as metadata rather than parser failure.

Publication of Tier-1-eligible rows MUST NOT require any of the following:

- A flagship ontology essay before canonical activation
- Movement-intuition prose before canonical activation
- Perfect alignment between mechanical ADD and the source's published claim
- A cross-axis topology entry before canonical activation
- A family-anchor narrative entry before canonical activation

These are Tier 2 enhancements. Treating them as Tier 1 prerequisites recreates the bottleneck Q11-A was meant to dissolve.

## Throughput targets (recommendation)

- Wave cadence: roughly bi-weekly canonical-row publication slices of ~10-30 rows each, depending on family-stem complexity
- Tier 2 cadence: 1-2 movement-intuition entries per slice, curator-paced
- Tier 3 cadence: zero rows promoted out of Tier 3 without the corresponding doctrine answer in hand

## Open implementation questions (for curator)

These are not blocked on this doc; they are surfaced here to drive subsequent slices.

1. **PB / FM baseline-claim storage**. Where does the historical-claim metadata live when canonical ADD diverges from source claim?
   Options:
   - `ResolvedFormula.provenance` (already present; suitable for compound rows that have a resolved-formula entry)
   - New optional field on `ResolvedFormula` (e.g. `pbBaselineClaim: number | null`) for structured access
   - DB column on `freestyle_tricks` (heavier; requires schema + loader change)
   - A separate sidecar TS map keyed by slug
   Recommendation: start with `provenance`; promote to a structured field when QC tooling needs it.

2. **"Mechanical ADD" computation source**. Today, mechanical ADD is computed implicitly via the parser and the ATAM bracket-flag system. Should a slug-keyed "mechanical_add" field surface on the resolved-formula entry so the divergence with `adds` is grep-able without re-running the parser?
   Recommendation: defer until the next wave introduces enough divergent rows to motivate it.

3. **Promotion automation**. The CSV-load + remove-observational-entry + add-resolved-formula three-step is currently hand-stitched per row. Worth a small Python helper that takes a list of slugs and applies the pattern?
   Recommendation: revisit after the next 30-row wave lands; if the pattern stabilizes, write the helper.

4. **Slug-collision audit**. Some Emerging-Vocabulary folk slugs may collide with future canonical names (e.g. `kiwi`, `ghost`, `monster`). Worth an audit pass before bulk promotion?
   Recommendation: yes, before any Tier-1 slice ships -- compare every folk slug against `freestyle_tricks.canonical_name` to catch existing duplication risk.

## How this doc evolves

This is a curator-reviewable draft. After curator review:

- If the framework holds, key invariants (Tier 1 requirement list; Forbidden list; layer-separation invariants) migrate into a permanent home, most likely a brief paragraph in `docs/SERVICE_CATALOG.md` or `docs/DATA_MODEL.md` under the freestyle ownership entry, plus an updated trigger note in the `footbag-freestyle-dictionary` skill.
- If specific invariants need adjustment, this doc is the iteration surface; the canonical homes do not move until curator sign-off.
- This exploration directory will move to `exploration/_archive/2026-05/` once the framework lands in its canonical home.
