# Render drift audit

Phase B audit deliverable. Inspects the trick-identity surfaces for
identity-layer drift (V2 invariant 8). Context-layer differences are
explicitly excluded — only identity-layer divergence counts as drift.

## Method

1. Reviewed `dictionary-trick-card.hbs` for the canonical card render
   path (browse + registry densities).
2. Reviewed `core-tricks-grid.hbs` for the symbolic-object render path.
3. Reviewed `trick-shell.hbs` for the detail-page superset render.
4. Cross-referenced the `trickcard_surface_consistency_matrix.csv`
   per-surface identity coverage.
5. Spot-tested specific high-traffic atoms (mirage, whirl, butterfly,
   osis, paradox-mirage) across surfaces via DB → service shaping
   inspection.

## Findings — identity-layer drift

### Confirmed: NO drift found (identity layer)

All surfaces consume the shared service-layer shaping pipeline:

- Title text → `displayName` from `freestyle_tricks.canonical_name`
- Slug → `freestyle_tricks.slug`
- href → `/freestyle/tricks/{slug}`
- ADD value → `addNumeric` / `addsLabel` shaped uniformly
- Tokenized equivalence → `tokenizedEquivalences` shaped once and
  shared across both densities of the dictionary-trick-card partial
- Media indicator → `mediaCoverage` / `hasReferenceMedia` /
  `mediaCoverageLabel` shaped once per trick

The two-density model in `dictionary-trick-card.hbs` (registry + browse)
shares the same field order documented in
`docs/PRESENTATION_OBJECT_HIERARCHY.md`:

```
1. title · 2. formula · 3. ADD chip · 4. media chip · 5. status badge · 6. placeholder note
```

Identity-layer fields are pulled from the same shaped view-model
properties in both densities. Layout differs (inline vs vertical),
which is context-layer per V2 invariant 8.

### Resolved / intentional differences

| Difference | Layer | Verdict |
|---|---|---|
| Registry density renders inline (single line); browse density renders vertical-stack | context | Documented render-mode register (V2 invariant 9). Intentional. |
| Landing Core Tricks grid uses the symbolic-object pattern (#slug + ≡ reading + ADD box); does NOT use dictionary-trick-card | context | Documented render mode `core-atom-symbolic`. Intentional. |
| Detail-page parallels sidebar shows only the canonical title + link; no formula, no ADD chip | context | Context-only cross-link; full identity available via click-through. |
| Family view group heading carries family identity; per-card family chip is suppressed (would be redundant) | context | Group-heading absorbs the chip role. Intentional. |
| `clipper-stall` core atom renders as `#clipper` on landing grid (displaySlug override); anchor id stays `core-trick-clipper-stall` | identity? | Registered exemption per `CORE-ATOM-CANONICAL-RECONCILE-1`. The visible tag is curator-chosen; the anchor preserves slug identity. Not drift. |

### Potential drift watch-list

| Surface | Watch-item | Status |
|---|---|---|
| Trick-detail page formula visibility | The detail page's structural section currently shows the formula in multiple sub-partials (trick-notation, trick-structural). If a future template change removes formula visibility from one path while keeping it in another, that would be a parity drift. | No current drift; monitor. |
| Topology view observational badge | The topology view header carries an observational badge; cards within it inherit observational context. If a card surfaces a discrepancy/badge that contradicts the observational framing, that's identity-layer drift. | No current drift; monitor. |
| Movement System axis-rationale prose | The axis rationale prose lives in the content module; if it ever drifted from the glossary §3 axis vocabulary, that'd be a cross-page identity drift. | No current drift; monitor. |
| Trick-detail "Symbolic memberships" connective panels | These cite specific tricks via name; if the citation text ever diverges from the canonical_name, that's identity drift. | No current drift; the citation text is shaped from `canonical_name`. |
| Operational-notation vs tokenized-equivalence precedence | The card partial uses `tokenizedEquivalences` when present, else `operationalNotation`, else `coreAtomLabel`, else "Notation pending" placeholder. If two surfaces of the same trick choose different fallbacks, that's identity-layer drift. | No current drift; shaping pipeline produces the same precedence everywhere. |

## Conclusion

**No identity-layer drift detected** on the surfaces currently
implemented. The shared service-layer shaping pipeline + the two
registered card render modes + the trick-shell detail-page partial
maintain identity consistency by construction.

The two-layer model from V2 invariant 8 holds: identity-layer fields
are pulled from one source; context-layer differences are register-
documented. Future surface additions that consume the registered
render modes will preserve this property.

## Recommendations

1. **Codify the two-layer test in code review.** When a new surface
   ships, run the matrix in `trickcard_surface_consistency_matrix.csv`
   against it before merge.
2. **Test pin the precedence order** in
   `dictionary-trick-card.hbs` (tokenized → operational → core-atom →
   pending) so future template edits don't silently re-order it.
3. **Pre-flight check for any new render mode.** Before adding a new
   trick-rendering surface, register the mode in V2 invariant 9 and
   document its identity-layer coverage in the surface-consistency
   matrix.
4. **Detail-page parity gate.** Before promoting any new trick to
   curated status, verify the detail page surfaces ALL identity-layer
   fields shown by any card surface that references it (V2 invariant
   7).
