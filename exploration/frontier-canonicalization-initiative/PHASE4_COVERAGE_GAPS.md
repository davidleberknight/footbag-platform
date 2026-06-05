# Phase 4 coverage closure: the genuinely-missing FM names

## Context

FM coverage is 713/763 (93.4%) when counting canonical + observational + alias. Of the 50 uncovered, 43 are `-ss`/`-far`/`-same-side` positional variants that normalize to a covered base (no action, by the slug-normalization rule). This packet dispositions the 7 genuinely-distinct names so every FM trick is represented somewhere.

## The 7 distinct names

| Name | Disposition | Action |
|---|---|---|
| `clipper-kick` | Already represented by `clipper` (the 1-ADD body kick). | Alias-note only; no new entry. |
| `barrage-toe-set` | Set-notation variant of `barrage` (toe-set entry spelled out). | Add to observational as a lexical variant of `barrage`. |
| `flurry-toe-set` | Set-notation variant of `flurry`. | Add to observational as a lexical variant of `flurry`. |
| `scorpion-s-tail` | Real trick, **carries a competition record**; down-family (the residue-packet down cohort). | Add to observational; flag as record-bearing. Promotion gated on DOD-policy. |
| `barroque` | Folk name (baroque); structure not yet decomposed. | Add to observational, `intakeBucket=frontier_review`. |
| `frigidosis` | Folk name (likely frigid/osis-family); structure not yet decomposed. | Add to observational, `intakeBucket=frontier_review`. |
| `kyttyra` | Already in the >=7 triage; blocked by the undefined `bent` operator. | Already tracked in the triage; ensure it surfaces in Emerging Vocabulary with `failureClass=unknown-modifier-token (bent)`. |

## Proposed observational entries (for the intake, not hand-edited into generated content)

Six new tracked names (clipper-kick excluded as an alias):

```
barrage-toe-set     source=FM  section=parser  intakeBucket=alias            note=lexical variant of barrage
flurry-toe-set      source=FM  section=parser  intakeBucket=alias            note=lexical variant of flurry
scorpion-s-tail     source=FM  section=folk    intakeBucket=low_confidence   note=record-bearing; DOD-gated
barroque            source=FM  section=folk    intakeBucket=frontier_review
frigidosis          source=FM  section=folk    intakeBucket=frontier_review
kyttyra             source=FM  section=parser  intakeBucket=low_confidence   failureClass=unknown-modifier-token(bent)
```

## Result

With these six added (and `clipper-kick` recognized as a `clipper` alias), **every FM name is represented somewhere** (canonical, observational, or alias). The remaining 43 positional variants are by-rule normalized and need no separate entry.

Note: `freestyleObservationalUniverse.ts` is curator/pipeline content; these entries should land through the observational intake path rather than a hand-edit, to avoid clobbering on regeneration. This packet is the authoring input for that step.
