# Family Ordering Audit (NCR-6, brief E7)

Audit-only. Surfaces evidence about the current family-view ordering
logic, rev-up's whirl-family membership, and intra-family ordering
patterns. No taxonomy mutation in this wave.

Supports `FINAL_RECOMMENDATION.md` NCR-6. Bakes in curator decision #5
locked 2026-05-18: rev-up resolution and family-ordering changes are
SEPARATE follow-on slices; they do NOT block this notation cleanup wave.

---

## 1. Current state (recon-grounded)

### 1.1. Family-view ordering logic

Source: `src/services/freestyleService.ts:4004-4067`.

Family-view groups render in two phases:

1. **Curator-ordered head**: families listed in the `FAMILY_ORDER`
   constant render first, in the constant's order:
   ```
   ['whirl', 'rev-whirl', 'butterfly', 'osis', 'torque', 'blender',
    'mirage', 'clipper', 'drifter', 'legover']
   ```
2. **Insertion-ordered tail**: families NOT in `FAMILY_ORDER` render
   after, in the order they're first encountered in the trick rows
   iteration.

Why "whirl" renders first: it's slot 0 in the `FAMILY_ORDER` constant.
The current curator decision elevates whirl as the most recognized /
populous family.

Filter: lines 4057-4067 -- only families with `length > 1` members
render in the family view. Singleton families (e.g. `dada-curve`,
`atw`) are suppressed from the browse surface today.

### 1.2. rev-up's family membership

Source: `src/content/freestyleFamilyOverrides.ts:38-39`.

`rev-up` carries `trick_family='whirl'` in the DB (canonical). Its
override entry in the content module is **explicitly deferred**:

```typescript
// rev-up: family TBD; per curator pending decision
// (no override line emitted; remains in whirl per DB)
```

In contrast, the Stage A promotions are overridden to `rev-whirl`
family per lines 67-69:
- `rev-whirl` → rev-whirl family (anchor)
- `hatchet` → rev-whirl family
- `mullet` → rev-whirl family

So rev-up sits as a "lone whirl-family member that arguably belongs in
rev-whirl" today, while the three Stage A promotions are explicit
rev-whirl family members.

### 1.3. Intra-family ordering

Per recon, intra-family ordering inside the family-view browse renders
via the trick-card sort applied to each family group. Recon §6 of the
prior wave's dictionary-coherence audit noted alphabetical-by-name
within-family. Confirmed during this audit pass.

`buildPreviousTricks` in `freestyleRelatedTricks.ts` has a
"family-base tiebreaker" that surfaces the family-base trick first
within its ADD bucket -- but this applies to the per-trick-detail
"Previous Tricks" affordance, NOT the family-view browse ordering.
The two surfaces use different sort logic.

### 1.4. Brief's E7 questions

The brief asks five questions:

1. Why does whirl family render first?
2. What is the current family-ordering logic?
3. What is the intra-family ordering logic?
4. Why does rev-up appear in whirl family?
5. Should rev-up and rev-whirl coexist (as separate families)?
6. (Bonus) Is current ordering alphabetical, ADD-based, lineage-based,
   or accidental?

Answers, derived from §1.1-1.3 above:

1. Whirl renders first because `FAMILY_ORDER[0] === 'whirl'`.
   Explicit curator choice.
2. Curator-overridden order via `FAMILY_ORDER`, then insertion-
   ordered tail for families not in the list.
3. Alphabetical by name within each family group on the family-view.
4. rev-up retains DB-default `trick_family='whirl'`; curator hasn't
   issued an override; the content module explicitly defers.
5. rev-whirl IS its own family today (per the Stage A overrides;
   rev-whirl + hatchet + mullet). rev-up arguably belongs there
   too, but pending curator decision.
6. Family ordering is curator-overridden (not alphabetical, not
   ADD-based). Intra-family is alphabetical.

---

## 2. Problem evidence (brief-validated)

The brief identifies the rev-up situation as an audit candidate but
explicitly says "no ontology rewrites unless clearly safe." Per
curator decision #5, rev-up resolution is a SEPARATE follow-on slice
that does not block notation cleanup.

So the deliverable of this audit is **evidence and decision options**,
not action.

---

## 3. rev-up evidence: should it stay in whirl family?

### 3.1. Evidence for whirl-family membership (status quo)

- DB default per `freestyle_tricks.trick_family='whirl'`.
- rev-up shares structural anchor pattern with whirl: dex motion
  ending in clipper-stall.
- "Rev-whirl" naming implies "rev-up + whirl" -- if both are
  whirl-family, the compound stays coherent.
- Singleton-family suppression (`length > 1`) would otherwise hide
  rev-up if it became its own family.

### 3.2. Evidence against whirl-family membership

- rev-up's distinctive feature is REVERSE direction of dex motion.
  Per skill doctrine "Direction is structural", direction changes
  create new canonical tricks (and arguably new families).
- rev-whirl IS its own family (Stage A overrides); the rev-* family
  exists. rev-up belongs there structurally.
- Treating rev-up as whirl-family hides the directional structure
  on the family-view browse surface.
- The compound `rev-whirl` could be modeled as rev-whirl-family
  with whirl as a base modifier, rather than whirl-family with
  reverse as a modifier. Either model works.

### 3.3. Three options for curator

| Option | Effect | Cost |
|---|---|---|
| **F-A: Keep rev-up in whirl** (status quo) | rev-up shows under whirl-family browse | Zero (no change) |
| **F-B: Promote rev-up to rev-whirl family** | rev-up moves to rev-whirl family alongside rev-whirl + hatchet + mullet; rev-whirl family count goes from 3 → 4 | Single override entry in `freestyleFamilyOverrides.ts` |
| **F-C: Dual membership** (rev-up in both whirl AND rev-whirl) | rev-up appears in both family-view groups; cross-axis representation | One entry in `freestyleFamilyDualMemberships.ts` (mechanism exists) |

Option F-B is the cleanest taxonomic statement. Option F-C is the
most charitable to the dual-anchor framing. Status quo F-A is the
zero-touch default.

**Recommended deferral**: curator-paced separate slice. Surface the
three options; curator picks.

---

## 4. Family-ordering evidence: is the current sequence right?

### 4.1. Curator's FAMILY_ORDER (current)

```
['whirl', 'rev-whirl', 'butterfly', 'osis', 'torque', 'blender',
 'mirage', 'clipper', 'drifter', 'legover']
```

10 explicit slots. Whirl first. The order appears to be roughly:

- **Slot 0-2**: rotational dex families (whirl / rev-whirl /
  butterfly).
- **Slot 3-5**: extended-rotation / compositional families (osis /
  torque / blender).
- **Slot 6-8**: dex-direction families (mirage / clipper / drifter).
- **Slot 9**: legover.

Families not in the list (e.g. `swirl`, `illusion`, `pickup`) appear
in the insertion-ordered tail. Their position depends on row
iteration order from the DB.

### 4.2. Is this ordering rationale curator-documented?

Per recon, the `FAMILY_ORDER` constant lacks an inline rationale
comment. The pattern of "rotational families first, then directional"
is inferred; not explicit.

### 4.3. Options for re-ordering (decision-options)

| Option | Rationale | Effect |
|---|---|---|
| **O-A: Keep current order** | Curator-locked; preserves muscle memory | Zero change |
| **O-B: ADD-ascending family ordering** | Order by lowest-ADD member or family-average-ADD | Atomic families (toe-stall, etc.) would float to top -- arguably better pedagogy |
| **O-C: Alphabetical** | Predictable; reduces curator-paced maintenance | Loses pedagogical ordering |
| **O-D: Lineage-based** | Group by structural anchor (rotational → directional → catch-surface) | Requires explicit curator authoring of lineage groups |

Recommendation: surface these to curator; F-A status quo is safe.
Pedagogically, O-B (ADD-ascending) has merit for a learning-oriented
landing page; O-A has merit for a reference-oriented dictionary.

---

## 5. Intra-family ordering evidence

Currently alphabetical-by-name within each family group on the
family-view browse.

Alternative ordering options:

| Option | Rationale |
|---|---|
| **I-A: Alphabetical** (status quo) | Predictable; reference-style |
| **I-B: ADD-ascending then alphabetical** | Pedagogical (easiest first); matches the `buildPreviousTricks` family-base tiebreaker pattern at the detail-page level |
| **I-C: Lineage-based** (family-base first, then derivative chains) | Tells the structural story; requires explicit per-family curator authoring |

Recommendation: surface to curator. I-B has consistency arguments
(matches detail-page surface); I-C has narrative arguments.

---

## 6. Singleton-family policy

Per recon, families with `length=1` are suppressed from the
family-view browse (the `length > 1` heuristic at lines 4057-4067).

Singleton candidates today (informal observation):
- `dada-curve` (only `dada-curve` itself)
- `atw` (only `around-the-world`)
- possibly others

The dictionary-coherence wave's `family_and_neighborhood_governance.md`
§3.7 raised this; deferred to curator decision. Same here -- not in
scope this wave.

Options remain (S-A status quo, S-B add Specialty section, S-C
auto-pair by similarity which doctrine C rejects).

---

## 7. Recommended approach for this wave

### 7.1. What this slice does

NOTHING in source code. This is a planning artifact.

### 7.2. Deliverable

This audit document itself. Lays out:

- Current ordering logic (whirl first because explicit; alpha
  intra-family).
- rev-up evidence with three options F-A / F-B / F-C.
- Family-ordering re-options O-A through O-D.
- Intra-family re-options I-A through I-C.
- Singleton-family options S-A through S-C (cross-referenced from
  prior wave).

### 7.3. Curator decisions queued

| # | Topic | Options | Recommended deferral |
|---|---|---|---|
| Q1 | rev-up family | F-A / F-B / F-C | Separate slice |
| Q2 | Family ordering rule | O-A / O-B / O-C / O-D | Separate slice |
| Q3 | Intra-family ordering | I-A / I-B / I-C | Separate slice |
| Q4 | Singleton family policy | S-A / S-B / S-C | Cross-referenced from prior wave; separate slice |
| Q5 | Document FAMILY_ORDER rationale | Add inline comment to `FAMILY_ORDER` describing the curator's pattern | Tiny single-line change; could fold into any future ordering slice |

### 7.4. Coupling with prior wave's `family_and_neighborhood_governance.md`

The dictionary-coherence wave's family-governance doc raised
decisions D1-D8. This wave's audit confirms the rev-up + family-
ordering evidence but doesn't re-litigate D1-D8 outright. Some
overlap is intentional; the curator's queue holds.

Recommendation: when curator triages, batch all family-related
decisions (D1-D8 + Q1-Q5) into a single curator-triage session for
coherence. Then sequence implementation slices.

---

## 8. Risks and mitigations

### 8.1. Risk: Audit-only deliverable feels insubstantial

The deliverable is decision-framing, not code. Same shape as the
prior wave's family-governance audit. Curator-paced by design.

### 8.2. Risk: Audit becomes stale

The evidence here is grounded in 2026-05-18 recon. If the family
overrides or `FAMILY_ORDER` constant change between this audit and
the curator triage session, the audit needs a refresh pass.
Mitigation: implementation slices should re-grep these surfaces
before acting on the audit recommendations.

### 8.3. Risk: Curator wants concrete recommendations rather than option lists

This audit lists options because curator decision #5 explicitly
defers resolution. If curator wants a single concrete recommendation
per question, a follow-on session can convert this audit into a
decided plan.

### 8.4. Risk: rev-up resolution becomes pre-emptively unblocked

The curator may decide to land rev-up resolution in parallel with
the notation cleanup. The dual-membership pattern (Option F-C) is
the lowest-touch option if so. Recommendation: keep rev-up audit
deliberately decoupled from notation slices unless curator OKs the
combined PR.

---

## 9. Out of scope

- Any `trick_family` mutation.
- Any new family-override entries.
- Any change to `FAMILY_ORDER`.
- Any change to intra-family sort logic.
- Any change to singleton-family suppression.
- Anything in `freestyleFamilyInvariants.ts`.
- Schema migrations.
- Movement Neighborhoods (the prior wave's Movement Neighborhoods
  rename is shipped; not affected here).

---

## 10. Cross-references

- `FINAL_RECOMMENDATION.md` -- NCR-6; decision #5 (separate follow-
  on slices).
- Prior wave's `family_and_neighborhood_governance.md` (D1-D8) --
  overlapping curator decision queue.
- Prior wave's `FINAL_RECOMMENDATION.md` CR-6 -- canonical home of
  the four-surface ontology disambiguation.
- Skill `footbag-freestyle-dictionary` -- "Direction is structural"
  rule informs the rev-up F-B vs F-A evidence.
- Skill `freestyle-topology-governance` -- multi-axis caution;
  family vs topology distinction.

---

## 11. Summary

Family ordering is curator-driven via `FAMILY_ORDER`; whirl renders
first because slot 0. Intra-family is alphabetical. rev-up retains
whirl-family default; rev-whirl family exists separately (Stage A
promotions). Three options for rev-up (F-A status quo / F-B move /
F-C dual). Four options for family ordering (O-A through O-D).
Three options for intra-family ordering (I-A through I-C). All
audited; all curator-paced. None block notation cleanup. Brief E7
satisfied as audit-only.
