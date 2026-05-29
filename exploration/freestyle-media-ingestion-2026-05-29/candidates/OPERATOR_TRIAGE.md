# Unregistered operator candidates — curator ruling (2026-05-29)

Source: the 9 unregistered operator-shaped tokens surfaced by `build_passback_candidates.py`
(output `04_operator_extraction_candidates.csv`) from the PassBack corpus. Each token is an
operator-shaped word (`-ing` form or known operator) appearing in a PassBack technical name but
absent from the `freestyle_trick_modifiers` registry.

**No registry mutation was performed.** Registering a modifier writes `freestyle_trick_modifiers`
and affects ADD math; that is a curator + Red-doctrine decision. This document records the curator
ruling; the only mechanical action taken is the `baragging` typo normalization in the extractor.

## Ruling

| Token | Corpus evidence | Ruling | Disposition |
|---|---|---|---|
| illusioning | 8 hits (`Illusioning Legover`, `Illusioning far Osis/Clipper`); `illusion` is an active base | **ACCEPT** | Genuine modifier-form operator. Registered-modifier candidate, likely **+1**, structurally parallel to `miraging` but **distinct due to directional semantics** (`illusion ≠ mirage`, Red-confirmed). Registry write **routed through Red Wave 2** for formal doctrine consistency — not written yet. |
| flailing | 2 hits (`Flailing far Symp. Mirage`, `Flailing far Butterfly`); `flail` is an active base | **DEFER** | Plausible modifier-form of `flail` (parallel to whirling/miraging) but thin evidence. Hold; can ride the same Red question as illusioning if a "base-gerund operators" doctrine item is opened. |
| baragging | 1 hit (`Baragging far Symp. Mirage`) | **TYPO — NORMALIZE** | Misspelling of registered `barraging`. Mapped `baragging → barraging` in `build_passback_candidates.py` (2026-05-29). Not a new operator. |
| twisting | 4 hits (`Twisting near Toe/Pickup/Osis`); `twist` absent; corpus equates "Twist / Rev Swirl" | **ALIAS / DECOMPOSITION SPACE** | Treat as an alias / decomposition of existing vocabulary (`swirling` / rev-swirl), not a distinct registry operator. |
| eggbeating | 1 hit, inside Warp's own name (`Symp. Eggbeating Mirage`) | **REJECT** | `eggbeater` is a multi-component base (= atomic-legover), not a primitive modifier. Parse artifact. |
| phasing | 1 hit (`Phasing near Swirl`) | **DEFER / REJECT** | Single-source folk token; no known "phase" operator. |
| slicing | 1 hit (`Slicing far Butterfly`) | **DEFER / REJECT** | Single-source folk token. |
| warping | 1 hit, self-referential in Warp's own name | **REJECT** | `warp` is a trick, not a modifier; self-reference artifact. |
| whipping | 1 hit (`Whipping Osis`); corpus elsewhere "Whip / Rev Whirl" | **ALIAS / DEFER** | Whip ≈ rev-whirl folk; single occurrence; not a registry operator. |

## illusioning — accepted, pending Red Wave 2

- **Status:** accepted as a genuine modifier-form operator; registered-modifier candidate.
- **Weight:** likely **+1** (parallel to `miraging`).
- **Distinction:** directional semantics separate it from `miraging` (`illusion` is the
  direction-reverse of `mirage`; direction is structural per the dictionary skill).
- **Gate:** registry write (`freestyle_trick_modifiers` row + ADD-math wiring) is **routed through
  Red Wave 2** for formal doctrine consistency. Do not register autonomously.
- **Why it matters:** closes the existing leak where `illusioning` is already referenced as a
  modifier_link (the `omelette → illusioning` loader warning) without being a registered modifier.

## Red Wave 2 packet additions (for the next consultation)

1. **`illusioning`** — register as a modifier? Confirm +1 weight and the directional-distinction
   doctrine vs `miraging` (parallel structure, opposite direction).
2. **`flailing`** (optional, same question shape) — is the gerund-of-a-base-trick a registrable
   operator class, or only an ad-hoc reading? Resolving the general rule settles both.

## Governance applied

- Frequency is evidence, not authority: the six single-occurrence folk tokens
  (eggbeating / phasing / slicing / warping / whipping, plus the twisting alias) are NOT promoted
  to the registry on the strength of one or a few corpus appearances.
- Surging remains auto-decomposed to spinning + stepping in the extractor; never a standalone operator.
- No `freestyle_trick_modifiers` write performed in this slice.
