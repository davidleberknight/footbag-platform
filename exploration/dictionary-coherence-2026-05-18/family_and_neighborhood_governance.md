# Family + Neighborhood Governance Audit

Covers brief Part 6 (family + neighborhood governance) AND specifies the
"Movement Neighborhoods" rename from brief Part 1.4.

Supports `FINAL_RECOMMENDATION.md` cross-cutting recommendation CR-6.

This doc is the canonical home of the four-surface ontology
disambiguation. It is also the governance audit for family taxonomy
and the rendering specification for the topology → "Movement
Neighborhoods" public-label rename. Strict scope: AUDIT-ONLY for
taxonomy. No `trick_family` value changes; no schema migration; no
dual-membership additions this slice. The audit surfaces evidence and
curator decision points; the curator decides; future slices implement.

---

## 1. Ontology disambiguation (canonical statement)

The four classification surfaces and their interaction is the most
important shared concept across this slice. Reproduced from
`FINAL_RECOMMENDATION.md` and elaborated here.

### 1.1. The four surfaces

| Surface | Meaning | Layer | Authority | Example |
|---|---|---|---|---|
| **Family** | Canonical derivative lineage | Canonical | Community + IFPA + Red rulings | `whirl` family: whirl, rev-whirl, spinning-whirl, paradox-whirl, blurry-whirl |
| **Movement System** | Operator / mechanical grammar | Canonical (curator-authored) | Curator + skill doctrine | Set/Uptime axis: launches; Entry Topologies axis: entry mechanics; Midtime Body axis: body modifiers; No-Plant & Suspension axis: airborne tricks |
| **Neighborhoods** (formerly "topology") | Embodied movement similarity | Observational | Curator interpretation only | Hippy-downtime-dex, leggy-uptime-dex, X-dex compounds, midtime-body neighborhood |
| **Observed** | Externally seen, not yet canonized | Observational | External sources (PassBack, FM, TT, Shred Global) | Tricks named in tutorials/records that haven't entered canonical review |

### 1.2. The questions each surface answers

| Surface | Question |
|---|---|
| Family | Which structural anchor does this trick descend from? |
| Movement System | How does the trick mechanically work? |
| Neighborhoods | Which other tricks feel like this one in the body? |
| Observed | What does the external ecosystem name that we haven't formally adopted? |

### 1.3. Why they cannot collapse

A single trick simultaneously occupies positions on all four surfaces.
Example: `paradox-mirage`.

- **Family:** `mirage` (its structural anchor; one canonical position).
- **Movement System:** Entry Topologies axis (the paradox operator) +
  Midtime Body axis (the paradox modifier). Multi-axis membership.
- **Neighborhoods:** the X-dex paradox-compound neighborhood
  (observational; cross-family).
- **Observed:** not applicable (canonical; promoted long ago).

Four distinct facts about the same trick. Collapsing any two into one
loses information. Single-value `trick_family` (currently) expresses
ONE axis; the other three live elsewhere (modifier links, content
modules, content modules respectively).

### 1.4. Canonical vs observational discipline

The first two surfaces (Family, Movement System) are CANONICAL --
community-authoritative, single-source-of-truth, encoded in primary
columns or curator-authored content modules with explicit canonical
status.

The last two (Neighborhoods, Observed) are OBSERVATIONAL -- curator
interpretation, multi-axis, reversible, never freezing ontology.

Skill doctrine A ("layers may link, layers must not collapse") +
topology-governance doctrine ("observational ≠ canonical") forbid
any rendering or data shape that conflates these.

### 1.5. Compact disposition (for ref)

- **Family** = lineage (canonical).
- **Movement System** = grammar (canonical).
- **Neighborhoods** = similarity feel (observational).
- **Observed** = external naming (observational).

---

## 2. Movement Neighborhoods rename specification

### 2.1. Locked decision

Public-facing label changes from "Topology" to "Movement Neighborhoods".
Backend slug, URL parameter, code identifiers all stay `topology`. This
is a single one-line render-layer change.

### 2.2. Rationale

- "Topology" reads as math/CS jargon to a learner. "Movement
  Neighborhoods" describes the concept (embodied similarity) in
  English.
- The internal name "topology" remains useful in code where the term
  precisely names the cross-axis observational layer.
- Backend continuity preserves every existing reference, content
  module key, test, content-module mapping, and the in-view
  observational-footer disclaimer.

### 2.3. Implementation surface

The label appears in (at minimum):

| Surface | Current | Post-rename | File |
|---|---|---|---|
| View-toggle row | "Movement Neighborhoods" already | unchanged | `tricks.hbs:76` (already renamed in code; pre-existing) |
| Topology view header | "Topology" | "Movement Neighborhoods" | `tricks.hbs:236-267` area |
| Topology footer disclaimer | "Topology groupings are observational..." | "Movement Neighborhoods are observational..." | `tricks.hbs:267` |
| Landing Card 4 title | (n/a, new card) | "Movement Neighborhoods" | `freestyleDictionaryLanding.ts` (per doc 3) |
| Glossary references | "topology" prose mentions | "Movement Neighborhoods" prose | `glossary.hbs` (search + replace user-facing prose) |
| Service shaping helper labels | likely "Topology" in label fields | "Movement Neighborhoods" | `freestyleService.ts` topology shaping section |

Recon note: line 76 of `tricks.hbs` already says "Movement Neighborhoods"
in the view-toggle row. The other surfaces may already be partially
renamed; an audit pass during implementation confirms each location.

### 2.4. What stays "topology"

- URL parameter: `?view=topology` (unchanged).
- Service interface: `FreestyleTricksActiveView` enum value
  `'topology'` (unchanged).
- Internal variable names, content-module keys, CSS class names that
  use `topology` (unchanged).
- Test descriptions that use "topology" as the technical name
  (unchanged).
- Code comments referring to the technical concept (unchanged or
  optionally updated for clarity).

### 2.5. Out of scope for the rename

- Renaming the URL parameter to `?view=neighborhoods`. No.
  Backward-compatibility cost.
- Migrating internal identifiers. No.
- Authoring new neighborhood groups. No.
- Promoting any neighborhood to canonical status. No (skill doctrine
  C explicit prohibition).

---

## 3. Family governance audit

Audit-only. No taxonomy changes this slice.

### 3.1. Current family governance mechanisms (well-functioning)

The family taxonomy is governed by four curator-authored TypeScript
content modules:

| Module | Purpose |
|---|---|
| `src/content/freestyleFamilyOverrides.ts` | Slug-level family overrides + display names |
| `src/content/freestyleFamilyDualMemberships.ts` | Additive multi-family memberships (torque in both lineage family AND own branch) |
| `src/content/freestyleFamilyInvariants.ts` | Shared terminal structure per family |
| (implicit) `RETIRED_FAMILIES` set | Soft-retired families hidden from browse |
| (implicit) `UNRESOLVED_COMPOUNDS` pilot | Folk-derived / mechanically-ambiguous rows; renders `pendingDecomposition` pill |

This governance pattern works. It is reversible (delete a line, family
retires), additive (multi-membership without schema migration), and
honest (UNRESOLVED_COMPOUNDS flags pending rows).

### 3.2. Single-value `trick_family` limitation (known)

Per skill doctrine C, single-value `trick_family` expresses ONE axis
only. Tricks legitimately belonging to multiple structural cohorts are
handled by `FAMILY_DUAL_MEMBERSHIPS`. Examples currently in the
allow-list:

- `torque` -- own family AND osis-derived
- `blender` -- own family AND torque-related
- `drifter` -- own family AND lineage relation

The dual-membership pattern is the model for any future
multi-membership case. Do NOT introduce a multi-family schema column
in this slice or near future.

### 3.3. Items the brief flags for audit

The brief lists four concerns:

1. Why rev-up appears in whirl family
2. Family ordering logic
3. Intra-family ordering logic
4. Neighborhood overlap explosion
5. Canonical vs observational family distinctions

Treating each in §3.4-3.8 below.

### 3.4. Rev-up in whirl family -- evidence

`rev-up` currently carries `trick_family='whirl'` (recon-confirmed via
the `?view=family` rendering and `freestyleFamilyOverrides.ts`).

**Evidence for whirl-family membership:**

- Rev-up shares the same structural anchor pattern as whirl: dex
  motion ending in clipper-stall.
- Rev-up is community-attested as a "kind of whirl" in informal usage.
- The compound `rev-whirl` (rev-up + whirl) makes sense only if both
  share lineage.

**Evidence against whirl-family membership:**

- Rev-up's distinctive feature is the REVERSE direction of dex
  motion. Per the dictionary skill's "Direction is structural" rule,
  direction changes create new canonical tricks. Rev-up may deserve
  its own family slug (`rev-up` family) rather than whirl membership.
- The compound `rev-whirl` could be modeled as whirl-family with
  `rev` as a modifier, rather than rev-up-family with whirl as a
  base.
- Single-membership in `whirl` family hides the directional structure
  from the family-view UX.

**Two options for curator:**

- **Option F-A:** Keep `rev-up` in whirl family. Status quo. Cheapest.
- **Option F-B:** Promote `rev-up` to its own family slug. Most
  honest. Requires updating overrides + display names + intra-family
  membership data. Adds a singleton family (`rev-up` alone), which
  intersects with §3.7 below.
- **Option F-C:** Use `FAMILY_DUAL_MEMBERSHIPS` to record rev-up as
  whirl-family AND its own family head. Reversible; allows both
  family-view paths.

NOT IN SCOPE THIS SLICE. Surface to curator. The audit lays out
evidence; the curator decides.

### 3.5. Family ordering logic

Recon was not asked for explicit family ordering shaping. Likely
sources:

- Alphabetical (default).
- Curator-overridden via `freestyleFamilyOverrides.ts` display-name
  ordering.

Hypothesis: family-view groups currently render in alphabetical order
of family-display-name. A learner-first ordering might prefer:

1. Foundational base families (whirl, butterfly, osis, mirage) first.
2. Compound families (torque, drifter, blender) next.
3. Modifier-relations (paradox, ducking) excluded (rendered elsewhere
   per category != modifier).
4. Singleton / specialty families last.

NOT IN SCOPE THIS SLICE. Verify the current order, then surface to
curator if the order doesn't match intent.

### 3.6. Intra-family ordering

Recon: tricks within a family appear sorted (in registry-density
cards) but the exact ordering rule wasn't surfaced. Two candidate
rules:

- **Rule O-A:** Alphabetical by `displayName`.
- **Rule O-B:** ADD ascending, then alphabetical. Base trick first.

Rule O-B is more learner-aligned (lower-ADD first; base trick is the
visual anchor). Recon notes the "family-base tiebreaker" already
exists on the trick-detail page's `buildPreviousTricks` helper
(`src/services/freestyleRelatedTricks.ts`) -- specifically so that
the family-base trick surfaces in compound tricks' previous-tricks
lists. The same tiebreaker logic could apply to family-view ordering.

NOT IN SCOPE THIS SLICE. Audit the current rendering order; if
alphabetical, propose Rule O-B as an enhancement.

### 3.7. Singleton-family policy

Singleton families = `trick_family` slugs with only 1 active member.
Recon notes the existing `length > 1` heuristic suppresses them from
the family-view (so `dada-curve` family with just `dada-curve` in it
doesn't render as a family group).

This is a defensible heuristic; the alternative (every trick as its
own family of one) is noisy. But it creates dark zones: a learner
filtering by `?family=dada-curve` lands on an empty group view.

Options:

- **Option S-A:** Keep the `length > 1` suppression. Add a fallback
  "No multi-member family for this trick; see trick-detail page"
  message. Cheapest.
- **Option S-B:** Surface singletons as a separate "Specialty"
  section. Pros: completeness. Cons: visual clutter; the section is
  conceptually a "miscellaneous" bucket.
- **Option S-C:** Auto-pair singletons with their nearest family by
  observational similarity. REJECTED -- doctrine C violation
  (auto-derived family from observational similarity).

NOT IN SCOPE THIS SLICE. Surface to curator with the three options.

### 3.8. Neighborhood overlap explosion

The brief flags neighborhood overlap as a concern. Skill doctrine
explicitly anticipates this: neighborhoods are observational, may be
multi-membership, and never collapse with family.

The "explosion" risk is real if curator-authored neighborhood groups
grow large enough that:

- A typical trick appears in 3+ neighborhood groups, hiding the
  primary structural identity.
- Cross-references become too dense to navigate.
- The observational layer competes visually with canonical browse.

Mitigations (all already in place):

- Neighborhoods render with explicit `.observational-badge`.
- The view is non-default (not the landing's first card).
- Neighborhood membership lives in a curator-authored content module;
  curator paces growth.
- The view's in-view disclaimer renames + acknowledges the
  observational status.

Recommendation: monitor as content grows; if 3+ membership becomes
typical, surface as a structural concern in a future slice. No
intervention now.

### 3.9. Canonical vs observational family distinctions

The brief asks for "explicit distinction between" five concepts:

| Concept | Layer | Authority |
|---|---|---|
| Canonical family | Canonical (Family surface) | Community + IFPA + Red |
| Topology cluster | Observational (Neighborhoods surface) | Curator |
| Movement neighborhood | Observational (same as Neighborhoods, alternate name pre-rename) | Curator |
| Observational grouping | Observational (catchall) | Curator |
| Modifier overlay | Canonical (Movement System surface) | Curator (modifier_links table) |

§1's disambiguation table is the canonical statement. The five
concepts in the brief map onto the four ontology surfaces with
"topology cluster" = "movement neighborhood" = same thing post-rename
(Neighborhoods surface).

Net: the brief's question is already answered by the disambiguation
table. The supplementary distinction is just naming alignment; this
doc's rename specification + the disambiguation table cover it.

### 3.10. What this audit does NOT do

Per the AUDIT-ONLY locked decision:

- No `trick_family` value changes.
- No new family slug authorings.
- No new dual-membership entries.
- No retirement of existing families.
- No reordering of family-view rendering.
- No singleton-family policy change.
- No movement-neighborhood content module changes.
- No multi-axis schema column.

All decisions surface to the curator. Future slices implement when
the curator decides.

---

## 4. Recommended approach

### 4.1. This slice (governance audit only)

1. Apply the topology → "Movement Neighborhoods" public-label rename
   (§2.3). Single render-layer change; surgical; reversible.
2. Surface the audit findings (§3.4-3.9) as curator decision points.
3. No taxonomy changes.

### 4.2. Future slices (curator-paced; not in this slice)

Each below requires explicit curator approval before becoming a slice:

- **Future Slice F-revup:** Resolve rev-up family membership (Option
  F-A / F-B / F-C).
- **Future Slice F-ordering:** Audit family ordering; apply Rule O-B
  if curator approves.
- **Future Slice F-singletons:** Singleton-family policy (Option S-A
  / S-B).
- **Future Slice F-multi-axis (post-Wave-2):** When Wave-2 Red answers
  + curator triage stabilize, consider reversible multi-axis tagging
  content module. Currently premature.

---

## 5. Curator decision points

The full list of curator decisions queued by this audit:

| # | Topic | Options |
|---|---|---|
| D1 | Rev-up family membership | F-A (status quo) / F-B (own family) / F-C (dual membership) |
| D2 | Family ordering rule | Status quo (alphabetical) / Learner-first (foundational → compound → specialty) |
| D3 | Intra-family ordering rule | Rule O-A (alphabetical) / Rule O-B (ADD asc + base first) |
| D4 | Singleton-family policy | S-A (keep suppress + add fallback message) / S-B (Specialty section) |
| D5 | Movement Neighborhoods rename in-view label | Confirm copy + verify all surfaces post-rename |
| D6 | When to revisit multi-axis schema | Post-Wave-2 + curator triage |
| D7 | "Topology cluster" vs "Movement Neighborhood" terminology | Use "Movement Neighborhoods" everywhere user-facing; deprecate "topology cluster" in user-facing prose |
| D8 | Neighborhood overlap monitoring | Curator surveys content periodically; structural intervention only if 3+ membership becomes typical |

---

## 6. Risks and mitigations

### 6.1. Risk: Curator perceives audit as inactive / not delivering
value

Mitigation: an audit is a planning artifact. The deliverable is
evidence + decision-framing, not code. The decision points (§5) are
the curator's lever; future slices implement.

### 6.2. Risk: The rename misses a surface

Mitigation: §2.3 lists known surfaces. The implementation slice
includes a final grep pass for "topology" in user-facing prose to
catch any missed location. Internal references stay; external
references update.

### 6.3. Risk: Rev-up resolution gets stuck

Mitigation: the audit names three viable options. If curator can't
decide between F-A / F-B / F-C, the status quo (F-A) preserves the
current behavior; the decision can defer indefinitely without harm.

### 6.4. Risk: Premature multi-axis schema work pressures the slice

Mitigation: §3.2 + skill doctrine C explicitly defer multi-axis
schema. Any proposal during slice implementation that touches schema
is automatically out of scope; surface to curator.

### 6.5. Risk: Singleton family policy decision blocks family-view
work

Mitigation: status quo (S-A: suppress) is already in place; future
slices not blocked. The audit just lays out the policy options for
curator review.

### 6.6. Risk: The disambiguation table introduces new mental model
overhead

Mitigation: the table exists in `FINAL_RECOMMENDATION.md` already
(per §1 references); this doc elaborates but does not introduce.
Mental model is established at the spine level; supporting docs
reinforce.

### 6.7. Risk: Future expansion of `FAMILY_DUAL_MEMBERSHIPS` without
governance

Mitigation: the existing pattern in `freestyleFamilyDualMemberships.ts`
is curator-authored. Each addition is a curator-explicit decision
(edit a file). No automation; no inference. The pattern is its own
governance.

### 6.8. Risk: Observational neighborhoods get treated as canonical
by future automation

Mitigation: doctrine A + doctrine C explicit prohibition;
`.observational-badge` rendering at every public surface; in-view
disclaimer footer. Three layers of defense.

### 6.9. Risk: Internal "topology" naming creates curator confusion

Mitigation: the audit explicitly preserves "topology" as the
internal name. Curator-side code reads stay clear; user-side prose
reads as "Movement Neighborhoods." The split is intentional.

---

## 7. Out of scope

- Any `trick_family` value change.
- Any new family slug.
- Any new dual-membership entry.
- Any family retirement.
- Any family-view ordering change.
- Any singleton-family policy change.
- Any neighborhood content module change.
- URL parameter rename (`?view=topology` stays).
- Schema migration for multi-axis taxonomy.
- Code-level identifier rename (CSS classes, TS variables, content
  module keys stay).
- Test description updates that reference "topology" technically.
- Auto-derivation of family / neighborhood / topology from notation,
  modifier links, or any other inferred source.
- Promotion of any neighborhood group to canonical status.

---

## 8. Cross-references

- `FINAL_RECOMMENDATION.md` -- CR-6 cross-cutting recommendation;
  ontology disambiguation table (compact).
- `dictionary_landing_page_plan.md` -- Card 4 (Movement Neighborhoods)
  + the public rename consumed at the landing layer.
- `notation_consistency_audit.md` -- the `coreAtomLabel` suppression;
  Core Tricks rendering hierarchy that family-anchor underlining
  references.
- `observational_layer_discoverability.md` -- Card 5 + the
  observational/canonical separation doctrine that family governance
  preserves.
- `footbag_sets_architecture.md` -- doctrine C ("family ≠ catch
  surface ≠ modifier") that this audit reinforces.
- `category_view_retirement_review.md` -- the `set` bucket
  retirement; symmetric soft-retirement pattern available for
  future family retirements if needed.
- Skill `footbag-freestyle-dictionary` doctrines A-D.
- Skill `freestyle-topology-governance` -- the entire skill.
- Memory `project_freestyle_state` -- Slice M (FAMILY_DUAL_MEMBERSHIPS
  + RETIRED_FAMILIES + UNRESOLVED_COMPOUNDS + MODIFIER_COMPOSITION_GLOSSES)
  context.

---

## 9. Sequencing

If the curator approves any decision (D1-D8 in §5), the corresponding
future slice implements it independently. Suggested sequence (when
implementing across multiple slices):

1. **Topology rename** (D7) -- this slice / immediately. Smallest;
   purely render-layer.
2. **Intra-family ordering** (D3) -- next. One shaping-helper change;
   affects every family-view group.
3. **Family ordering** (D2) -- next. Same module as D3.
4. **Singleton-family policy** (D4) -- next, only if curator confirms
   change needed; otherwise stays S-A.
5. **Rev-up resolution** (D1) -- requires curator decision; trivial
   implementation once decided.
6. **Multi-axis schema** (D6) -- DEFER until post-Wave-2 + curator
   triage. Likely 2026-06 or later.

---

## 10. Summary

The four-surface ontology disambiguation (Family / Movement System /
Neighborhoods / Observed) is the load-bearing concept across this
whole slice. This doc is its canonical home. Family governance is
well-served by the existing TypeScript content modules
(`freestyleFamilyOverrides`, `freestyleFamilyDualMemberships`,
`freestyleFamilyInvariants`, `RETIRED_FAMILIES`, `UNRESOLVED_COMPOUNDS`).
The brief's specific concerns (rev-up, ordering, singletons, overlap)
are audited and queued as curator decisions (D1-D8); no taxonomy
changes this slice. The "Movement Neighborhoods" rename is a single
render-layer change applied per §2.3. Skill doctrines A + C
preserved end-to-end; multi-axis schema work explicitly deferred.
Brief Part 6 + 1.4 satisfied without ontology hardening.
