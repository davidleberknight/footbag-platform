# Family-Level Structural Invariants — Audit + Proposal (2026-05-16)

## Status

Audit + proposal only. No implementation this turn. Follows directly on `PRESENTATION_UNIFICATION_SLICE.md` (Slice H2, just shipped). The card-presentation contract that finally stabilized must NOT be destabilized; the new invariant layer sits ABOVE cards as section context, not INSIDE cards as duplicated noise.

## The real problem (Family View, post-Slice-H2)

Card rendering is now consistent — same partial, same density, same typography across every browse view. But the SYMBOLIC CONTENT each card carries is still heterogeneous, and the heterogeneity reads as randomness rather than meaning.

Specifically in Family View, Whirl family (17 active members):

| Slug | Card formula slot today | What it actually says |
|---|---|---|
| `whirl` (base) | `[set] > leggy in dex > ss clipper` | operational mechanics (the family terminal structure!) |
| `paradox-whirl` | `≡ paradox whirl` | compositional reading |
| `spinning-whirl` | `≡ spinning whirl` | compositional reading |
| `ducking-whirl` | `≡ ducking whirl` | compositional reading |
| `symposium-whirl` | `≡ symposium whirl` | compositional reading |
| `stepping-whirl` | `≡ stepping whirl` | compositional reading |
| `tapping-whirl` | `≡ tapping whirl` | compositional reading |
| `blurry-whirl` | `≡ blurry whirl` | compositional reading (first of two) |
| `paradox-symposium-whirl` | `≡ ps whirl` | compositional reading (compressed) |
| `spinning-symposium-whirl` | `≡ spinning symposium whirl` | compositional reading |
| `surreal` | `≡ surging paradox whirl` | compositional reading |
| `montage` | `≡ spinning ducking paradox symposium whirl` | compositional reading |
| `hatchet` | `CLIP >> DIVE [BOD] > SAME FRONT WHIRL [DEX] > OP CLIP [XBD] [DEL]` | full operational mechanics |
| `mullet` | `CLIP >> DUCK [BOD] >> (NO PLANT WHILE) SAME FRONT WHIRL [DEX] [PDX] [BOD] > OP CLIP [XBD] [DEL]` | full operational mechanics |
| `rev-whirl` | *silent* | data gap |
| `rev-up` | *silent* | data gap |
| `tomahawk` | *silent* | data gap |

Three dialects on cards within one family view:
- **Compositional reading** (12 of 17 rows): clean modifier+base sentence
- **Operational mechanics** (3 of 17 rows: whirl/hatchet/mullet): bracketed component flags
- **Silent** (3 of 17 rows: rev-whirl/rev-up/tomahawk): data gap

The user's insight reframes the situation:

> Every Whirl-family trick shares `leggy in dex > ss clipper`. That conserved terminal structure is the important thing to teach.

This is the missing pedagogical layer. The family-LEVEL fact (shared terminal structure) is being smuggled into card-LEVEL data (whirl's per-row op-notation). Pull it up to family level, the family teaches the invariant once, the cards stay clean compositional.

## Proposed model

A new pedagogical surface — `Family invariant line` — between each family heading and the card stack.

### Visual placement

```
<section class="trick-family-group ...">
  <div class="section-heading">
    <h2>Whirl family</h2>
    <span class="section-count">17</span>
  </div>
  <p class="trick-family-shared-structure">
    Shared terminal structure: <code>leggy in dex > ss clipper</code>
  </p>
  <div class="dict-card-stack dict-card-stack--registry">
    [unchanged cards]
  </div>
</section>
```

### Visual specification

- **Position:** below `section-heading`, above `dict-card-stack`. NOT inside cards.
- **Element:** single `<p class="trick-family-shared-structure">`.
- **Typography:** small (0.86–0.9rem), subdued color (text-subtle var), label prefix in plain text, structure portion in `<code>`.
- **No coloring of structural tokens** in this slice (avoid competing with card formula tokens).
- **No hover affordances, no popovers, no expand-collapse.** Restraint per [[freestyle-topology-governance]] skill (no parser AST aesthetics).

### Wording

Recommended: **`Shared terminal structure:`**

Why "terminal":
- "leggy in dex > ss clipper" describes the END of every whirl-family trick
- The shared portion is at the trick's terminal phase (post-uptime through catch)
- Distinguishes from a future "Shared set" or "Shared body" invariant if needed

Alternatives ranked (curator decision):

| Wording | Strength | Weakness |
|---|---|---|
| `Shared terminal structure:` | precise | slightly technical |
| `Shared structure:` | clean | imprecise (doesn't say WHICH portion) |
| `Family terminal:` | compact | jargon-y |
| `All whirl tricks end in:` | beginner-friendly | doesn't scale to non-whirl families |
| `Terminal structure (shared by all members):` | explicit | verbose |

I lean **`Shared terminal structure:`** but this is a tone-bearing curator decision.

### Content authoring

- Curator-authored. NO auto-derivation from the family base's op-notation column. Auto-derivation conflicts with [[feedback_reversible_content_governance]] and could fail on families where the "terminal structure" is heterogeneous.
- Stored as a new field on the family-group view-model: `sharedStructure: string | null`.
- Per-family TypeScript content module (e.g., `freestyleFamilyInvariants.ts`), allow-list keyed by family slug.
- Null when no curator-confirmed invariant exists for the family — section renders without the line.

### Layer hierarchy this introduces

| Layer | Lives at | Example |
|---|---|---|
| **A. Family-level structural invariant** | Section heading | `Shared terminal structure: leggy in dex > ss clipper` |
| **B. Card-level compositional identity** | Card formula slot | `≡ paradox whirl`, `≡ ducking whirl`, etc. |
| **C. Operational detail (full mechanics)** | Trick detail page | `CLIP >> DIVE [BOD] > SAME FRONT WHIRL [DEX] > OP CLIP [XBD] [DEL]` (hatchet's full execution) |

This hierarchy resolves the symbolic incoherence: each layer answers a different question.

- A: "what conserved feature defines this family?" → invariant
- B: "what does this particular trick add on top of the family?" → compositional reading
- C: "what does this trick mechanically look like in practice?" → operational detail (only on demand)

## Card-rendering interaction (this slice vs follow-up)

**This slice adds layer A.** It does NOT remove operational notation from cards. The visual consequence: Whirl family will show the invariant line AND the whirl/hatchet/mullet cards will still carry their op-notation in the formula slot. Short-term redundancy is intentional — adding a new affordance without destabilizing the just-stabilized presentation contract.

The follow-up that completes the user's vision is a separate slice:

**Future Slice (G2 / op-notation demotion) — NOT in this slice's scope:**
- Removes operational notation from the card formula slot in registry density (everywhere).
- Cards render: compositional reading (when chain exists) OR silent (when no chain).
- whirl card goes silent (its op-notation moves up to the family invariant line + lives on the detail page).
- hatchet/mullet cards go silent (their per-row mechanics live ONLY on the detail page).
- The redundancy disappears.

The user's prior decision-tree clearly points toward the demotion. But sequencing matters: introduce the new surface first, validate visually, THEN demote the old one. Two small reversible slices beat one larger one.

## Future extensibility

If Whirl pilot validates, the same pattern extends to other families with curator-confirmable terminal structure. Candidates derived from each family base's op-notation:

| Family | Candidate invariant | Confidence |
|---|---|---|
| Butterfly | `hippy out dex > ss clipper` | high — clean butterfly op-notation |
| Mirage | `hippy in dex > op toe` | high — clean mirage op-notation |
| Osis | `spin > ss clipper` | high — clean osis op-notation |
| Swirl | `leggy (xbd) out dex > ss clipper` | medium — has xbd qualifier |
| Torque | `miraging osis ↦ in-dex spin > clipper` | lower — torque has its own chain reading |
| Drifter | `miraging clipper` | lower — already chain-form, not terminal mechanics |
| Legover | varies by trick | LOW — heterogeneous family, may not have a single invariant |
| Pickup | varies | LOW |

The Whirl pilot tests whether the model survives contact with messier families. Don't extrapolate before the pilot validates.

**Anti-pattern:** auto-deriving the invariant from `freestyle_tricks.operational_notation` of the family base. Some families (legover, pickup) wouldn't yield a clean shared pattern; auto-derivation would lie. Curator-authored only.

## Hard constraints (preserve)

Per [[project_freestyle_post_slice_e_posture]] restraint posture:

- **No re-introduction of density divergence.** Cards stay registry density everywhere.
- **No card-rendering changes** in this slice. Card structure, ADD chip placement, typography all preserved from Slice H2.
- **No symbolic doctrine invention.** Invariant content is curator-authored; no parser, no auto-derivation.
- **No interactive UI on the invariant line.** No tokens, no anchors, no hover. Plain text + `<code>` element only.
- **No invariant for families where it isn't actually invariant.** Empty `sharedStructure` = no line. Default to silence; opt-in via curator.
- **No browse-surface ontology hardening.** Family invariant is observational; doesn't change `trick_family` column semantics.

## Risks

1. **Short-term redundancy in Family View (Whirl pilot).** Until the op-notation-demotion slice ships, Whirl family will show the invariant line PLUS the whirl/hatchet/mullet cards' op-notation. This looks repetitive. Mitigation: rapid follow-up demotion slice OR accept the short-term cost while the new layer validates.

2. **Curator-decision fatigue.** Each family invariant is a separate authorial decision. If extended quickly to 8+ families before the pilot validates, decisions may not be curator-verified.

3. **Tone mismatch with the rest of the dictionary.** The invariant line uses `<code>` for operational fragments, which is the operational-notation style. If a future visual refresh changes operational-notation styling, this line drifts. Mitigation: scoped CSS class `.trick-family-shared-structure` independent of dict-card-notation styles.

4. **Family heading getting too tall.** Section heading + count + crossLink (optional) + invariant line — that's 3-4 lines of context before the first card. Mitigation: keep the invariant line single-line, subdued, no padding.

5. **Some families don't have a single invariant.** Legover family may have multiple terminal patterns; pickup family too. Treating absence (`sharedStructure: null`) as the default avoids forcing a lie.

## Minimal implementation slice (Slice I)

**Scope:** Whirl pilot only. Curator-authored. No card change. No partial change. No service-shape regression.

### Files

| File | Change |
|---|---|
| `src/content/freestyleFamilyInvariants.ts` (NEW) | TypeScript content module: `FAMILY_INVARIANTS` Map<slug, string>. Whirl entry only: `{ whirl: 'leggy in dex > ss clipper' }`. |
| `src/services/freestyleService.ts` | Import the module. Add `sharedStructure: string \| null` to `FreestyleFamilyGroup` interface. In `buildFamilyGroup`, look up the family slug and populate. |
| `src/views/freestyle/tricks.hbs` | Family view branch: add `{{#if sharedStructure}}<p class="trick-family-shared-structure">Shared terminal structure: <code>{{sharedStructure}}</code></p>{{/if}}` between `section-heading` and `dict-card-stack`. |
| `src/public/css/style.css` | Add `.trick-family-shared-structure { font-size: 0.88rem; color: var(--text-subtle); margin: 4px 0 8px; }` and a `<code>` inner style. |
| `tests/integration/freestyle.family-invariant.routes.test.ts` (NEW) | 3 tests: (1) whirl family renders the invariant line; (2) other families render WITHOUT the invariant line; (3) the invariant text is exactly `leggy in dex > ss clipper`. |

### Estimated effort
- ~10 lines content module
- ~5 lines service
- ~3 lines template
- ~6 lines CSS
- ~30 lines tests

Total: well under 60 lines of code + tests. Mechanical, reversible.

### Acceptance

After Slice I:

- Whirl Family View section shows the invariant line immediately below the heading, above the cards. Cards unchanged.
- Other families (Butterfly, Mirage, Osis, etc.) render without the invariant line — exactly as today.
- Build clean, full suite green.

### NOT in this slice

- Op-notation removal from cards (separate slice; will resolve the short-term redundancy)
- Invariants for Butterfly / Mirage / Osis / etc. (extend pattern AFTER Whirl pilot validates)
- Tokenized invariant rendering (plain `<code>` for now)
- Hover affordances on the invariant line
- Detail-page integration (the detail page already shows full op-notation; no change needed)

## Decision points for curator

Before implementation:

1. **Wording.** `Shared terminal structure:` (recommended) vs alternatives in the table above.
2. **Whirl invariant text.** Recommended: `leggy in dex > ss clipper`. Alternative: full form `[set] > leggy in dex > ss clipper` (with set-bracket prefix matching whirl's current card op-notation).
3. **Visual weight.** Subdued (0.88rem, text-subtle) — confirm.
4. **Follow-up sequencing.** Implement Slice I alone OR pair with op-notation demotion (Slice G2)?

## Restraint check

- Observational ≠ canonical: family invariant is an observational pedagogical surface, not a canonical taxonomy claim. Whirl family's `trick_family='whirl'` semantic is unchanged.
- Four-layer rule honored: invariant adds new SECTION-level pedagogy (sits between glossary pedagogy and symbolic decomposition layers); doesn't collapse any layer.
- No SQL changes. Pure TS content + template.
- Reversible: delete the content-module entry, the line disappears.
- No parser aesthetics. Plain text + `<code>` element.
- No interaction-heavy UI. No tokens to hover.
- Restricted to one family for the pilot.

## Addendum (curator, 2026-05-16) — observational ontology distinction

While confirming Slice I, the curator surfaced a pedagogically important
distinction that frames WHY this slice works:

> Terminal families vs Entry / topology / modifier systems.

Two different ontology axes that share the same `trick_family` column today
but are conceptually distinct.

### A. Terminal families

Defined by a CONSERVED ENDING / RECOVERY mechanic. Every member of the
family lands or resolves the same way.

| Family | Terminal mechanic |
|---|---|
| Whirl | leggy in dex > ss clipper |
| Butterfly | hippy out dex > ss clipper |
| Mirage | hippy in dex > op toe |
| Osis | spin > ss clipper |
| Swirl | leggy (xbd) out dex > ss clipper |

These ARE the right candidates for `sharedStructure` invariant lines.

### B. Entry / topology / modifier systems

NOT terminal families. They share ENTRY relationships, body topology, timing,
plant mechanics, or set mechanics. They do not share a conserved ending.

| System | What's shared |
|---|---|
| Paradox | clip-set + in-out dex (entry/body topology) |
| Symposium | no-plant leg discipline (body topology) |
| Spinning | full-body 360° rotation (timing) |
| Ducking/diving | head-path family (body topology) |
| Pixie/fairy/atomic | set-launch primitives (entry) |
| Stepping | plant-foot relocation (plant mechanic) |

These belong to topology / component / modifier / movement-neighborhood
surfaces — NOT family invariants in the "shared terminal" sense.

### Why the distinction matters

This explains why some existing groupings feel "forced" or visually
incoherent: when a row like `paradox-whirl` appears in the `whirl` family
view, it makes pedagogical sense (paradox is what's stacked on top of the
whirl terminal). But if you tried to make a "paradox family" group with
`paradox-whirl`, `paradox-mirage`, `paradox-torque` members, the only thing
those share is `CLIP > in-out dex` at entry — a different ontology axis.

A `paradox` topology surface answers a different question than a `whirl`
family surface. Conflating them at the same `trick_family` column level
produces incoherence.

### Restraint (load-bearing)

DO NOT harden this distinction into rigid taxonomy. It is observational
and educational. Specifically:

- No new schema column for "family type" (terminal vs entry-topology).
- No automatic classification logic. Each curator-authored
  `sharedStructure` entry is a per-family decision; absence is the default.
- No migration of existing `trick_family` values to enforce the distinction.
- The four-layer separation forever-rule applies: this distinction lives
  at the OBSERVATIONAL pedagogical layer, not as canonical ontology.

### Implications for Slice I

Whirl is a strong terminal-family example — proceed.

For follow-up family invariants (butterfly / mirage / osis / swirl): each
qualifies as a terminal family per the curator's framing above. Treat them
as candidates for invariant entries once the Whirl pilot validates the
pattern visually.

Do NOT add `sharedStructure` entries for paradox / symposium / spinning /
ducking / stepping / pixie / fairy / atomic. Those are entry / topology /
modifier systems, not terminal families.

### Curator confirmations for Slice I (recorded 2026-05-16)

Lock-ins:

- **Wording:** `Shared terminal structure:`
- **Whirl invariant text:** `leggy in dex > ss clipper` (token-clean form; no `[set] >` prefix)
- **Visual weight:** subdued, family-level only
- **Card behavior:** no card change in this slice; do NOT duplicate the invariant into every card
- **Sequencing:** Slice I (invariant pilot) → validate visually → later, op-notation demotion if still redundant

Implementation proceeds with these confirmed decisions.

End.
