# Media-Promotion Sprint under Stabilized Frontier Governance (2026-05-29)

**Scope: media / teaching layer. Read-only.** No `media_items` written, no galleries touched, no
observational trick promoted to canonical, no doctrine resolved, no parser/symbolic rules changed, no
media placement positioned to imply ontology settlement. **Media writes are Dave's gallery-edit-tool
track; this sprint ends at a governance-cleared candidate manifest.** All external URLs obey the
verify-before-sign-off forever-rule — no URL is extrapolated or guessed here.

Builds on `../freestyle-media-ingestion-2026-05-29/candidates/EXEMPLAR_CORPUS.md` (the 18-exemplar
audit + 4 candidate packets) and the stabilized governance model from
`../frontier-stabilization-2026-05-29/`. This memo adds the **governance overlay** that the prior
exemplar audit predates: AVOID-list ontology-risk clearance, pre–Red-Wave-2 safety classification, the
broader HIGH-PRIORITY dimensions, and the media-ontology-alignment audit (Part B).

---

## PART A — Exemplar media coverage audit

### Current state (read-only, DB as of 2026-05-29)
- **514 active tricks; 86 (16%) have direct `#slug` media; 49 (9%) have a tutorial-tier clip.** (These
  count only *direct dedicated* coverage; embedded-in-a-compound and demo/reference coverage are
  undercounted — see Part B.)
- **Core atoms:** 11/12 carry a direct tutorial; `orbit` is embedded-covered inside the TT ATW lesson
  (not a true gap).
- **The four HIGH-PRIORITY targets — confirmed against the DB:**

| Target | Direct media | Tiers present | Gap type |
|---|---|---|---|
| **flurry** | **0** | none | **GAP** — no media at all (4-ADD legover-family generator, flurricane parent) |
| **barrage** | 2 | RECORD (passback) + DEMO (shred_global) | **UPGRADE** — no tutorial |
| **blender** | 2 | DEMO (flipsider) + RECORD (passback) | **UPGRADE** — no tutorial |
| **mobius** | 2 | DEMO (footbag_finland) + RECORD (passback) | **UPGRADE** — no tutorial |

### Broader HIGH-PRIORITY dimensions (beyond the 18 exemplars)
- **Core-trick instructional:** strong (11/12 atoms covered) — no action; confirm-and-tag only.
- **Family exemplars:** the 13 COVERED/THIN exemplars are the family-generator reference clips; they
  need a **tagging pass** (`#kind-tutorial` / `#family-*`) on Dave's track, not new ingestion.
- **Set-system demonstrations:** thin — pixie 2, fairy 1, atomic 1, quantum 1. Set primitives are
  under-demonstrated; a "set systems" demo cluster is a legitimate future target (all canonical, low
  risk).
- **Operator/modifier demonstrations:** modifiers are **not** `freestyle_tricks` rows, so they carry no
  `#slug` media by design. These belong on the **glossary / operators page** as embedded demonstrations,
  NOT as trick-tag media. (A media-layer for operators would need the `teaches`/`components-covered`
  edge — Part B — not a `#slug` tag.)
- **Beginner progression media:** entry vocabulary (toe-stall, clipper-stall, inside-stall, ATW) is
  covered; the *progressions themselves* are unmodeled (combo/progression concepts are media-graph
  content, not trick rows — per the ontology-gap report Bucket 4).
- **Animated foundational snippets:** none exist; a genuine future content type, but production-
  dependent (not a sourcing/tagging task) — defer.

### Redundancy / weak-example notes
- **Duplicate-but-legitimate:** the same slug carrying TT-tutorial + PassBack-record + AnzTrikz clips is
  *not* redundancy (how-to vs proof vs alt-tutorial). No de-duplication warranted.
- **Genuine low-value risk:** RECORD/DEMO-only coverage on a pedagogically central node (barrage/
  blender/mobius) is the "weak example" pattern — the clip exists but doesn't teach. That is exactly
  what the UPGRADE packets address.
- **Operational hygiene note (for James/Dave, not a finding):** 56 reviewer-approved snippet rows in
  `snippet_candidates.csv` are not marked `promoted_*` yet some already appear in `media_items` — the
  reviewer-marker convention has drifted. Worth a status reconcile, but it does **not** affect the
  tutorial gaps (those rows are RECORD-tier).

---

## PART B — Media-ontology alignment audit

### Baseline: clean
- **No media is tagged to an inactive/pending (observational) trick.** Nothing currently implies
  ontology settlement on a frontier trick. This is the single most important alignment check and it
  passes.
- **The AVOID-list tricks carry zero media** (`atomic-torque`, `superdeeduperfly`, `blurry-ducking-
  torque`, `odula`, `sasquatch`) — nothing to mis-feature; the correct state is to keep them at zero
  until Red Wave 2.

### The one real finding: doctrine-sensitive tricks with RECORD/demo media
A few canonical-but-doctrine-adjacent tricks carry media:

| Trick | media | tier | doctrine adjacency | alignment call |
|---|---|---|---|---|
| **blurry-whirl** | 1 | RECORD (passback) | **blurry transitivity** (blurry-whirl ?= stepping-paradox-whirl) | KEEP as RECORD/proof; do NOT add a "teaches: stepping-paradox-whirl" edge or feature it as a settled decomposition |
| **fury** | 1 | RECORD | furious-set (atomic-parallel) semantics | KEEP as RECORD; no structural-equivalence framing |
| **paradox-blender** | 2 | RECORD | canonical/active (op_notation backfilled this session) — low risk | fine; standard RECORD |

These are *performance evidence*, which is legitimate and ontology-neutral. The risk is only if a future
placement re-frames a RECORD clip as "this is THE canonical structure of blurry-whirl." It must not.

### Recommendations
1. **Tier discipline = ontology discipline.** RECORD/DEMO tiers make a claim about *performance*, not
   *structure*. Keep doctrine-sensitive media at RECORD/DEMO; never promote it to a structure-asserting
   CANONICAL_TUTORIAL until the relevant Red Wave 2 question rules.
2. **Teach-without-resolving labeling.** A clip may teach movement topology / rhythm / body mechanics /
   stylistic feel / progression **without** asserting a symbolic decomposition. Where a tutorial covers
   a doctrine-adjacent trick, label it pedagogically ("how the movement feels / how to land it"), not
   structurally ("= stepping paradox whirl").
3. **`teaches` / `components-covered` indirect-coverage layer (proposed, not built).** The flat `#slug`
   tag conflates direct, embedded, and demo coverage. The proposed edge (ARCHITECTURE §3a) is the right
   home for indirect coverage (orbit-inside-ATW; an atom taught inside a compound lesson) — and it is
   also the *ontology-safe* way to express operator/modifier demonstrations without a misleading trick
   tag. Recommend it as the next media-graph design direction; it must carry no ADD/structure claim.
4. **Family / system cross-linking.** Tag the 13 COVERED exemplars `#family-<fam>` so trick/family pages
   can surface "the family generator's tutorial" — a navigation aid, not an ontology claim.
5. **Observational surfaces stay labeled.** If frontier/observational tricks ever get media, label them
   "community-documented, not yet canonical" and never show provisional ADD/decomposition as authoritative.

---

## PART C — Conservative media-promotion candidate package

All four packets are **governance-cleared and pre–Red-Wave-2-safe** (canonical, active, stable family,
zero AVOID-list overlap, zero doctrine dependency). URLs are intentionally blank — Dave sources + HTTP-
verifies each (verify-before-sign-off forever-rule). This re-affirms the EXEMPLAR_CORPUS packets with
the explicit safety classification this sprint adds.

| Candidate | Type | System/family | Why it deserves promotion | Instructional value | Historical value | Ontology risk | Pre-Wave-2 safe? |
|---|---|---|---|---|---|---|---|
| **flurry** | tutorial (NEW) | legover family | only foundational generator with **zero** media; flurricane parent | high (4-ADD family generator) | medium | **none** | **YES** |
| **barrage** | tutorial (UPGRADE) | barrage family | `barraging`-operator host; double-dex mirage; demo exists, no teach | high | medium | **none** | **YES** |
| **blender** | tutorial (UPGRADE) | osis family | whirling-osis; osis-family generator + modifier host | high | medium | **none** | **YES** |
| **mobius** | tutorial (UPGRADE) | torque family | torque flagship; famous movement-language exemplar | high | high | **none** | **YES** |

Source guidance (verify, do not extrapolate): AnzTrikz / FootbagSpot / Polini are the likely tutorial-
tier sources for barrage/blender/mobius; flurry may require a community sourcing pass. `orbit` stays
DEFERRED (embedded-covered, not a gap).

---

## Final deliverables

### 1. Recommended immediate-safe media promotions
There are **no already-verified URLs to fast-track** (the gaps have no assets; existing verified assets
are already in `media_items`). The "immediate-safe" set is therefore the **4-packet manifest above** —
all governance-cleared, awaiting URL sourcing on Dave's track. Nothing blocks them but the URL.

### 2. Recommended tutorial upgrades
**barrage, blender, mobius** — each has demo/record coverage but no teaching clip. Highest pedagogical
ROI; all safe.

### 3. Recommended historical / exemplar additions
- Tag the **13 COVERED exemplars** with `#kind-tutorial` + `#family-*` (Dave-track tagging pass) so the
  family-generator tutorials surface cleanly. No new ingestion.
- **flurry** doubles as a historical addition (a famous family generator with no archival clip).
- Genuinely historical performance clips (classic first-landings, era-defining runs) are a worthwhile
  future curator-sourced set — but require URL sourcing + verification; not actionable in a read-only pass.

### 4. Media items to HOLD until Red Wave 2
- **All AVOID-list tricks** (`atomic-torque`, `superdeeduperfly`, `blurry-ducking-torque`, `odula`,
  `sasquatch`) — keep at zero media; do not feature.
- **Doctrine-sensitive existing media** (`blurry-whirl`, `fury`) — keep as RECORD only; no tutorial-tier
  promotion, no structural/`teaches`-decomposition framing until the relevant doctrine rules.
- **Operator/modifier media** — hold the `teaches`/`components-covered` representation until that layer
  is designed; do not express it via trick `#slug` tags.

### 5. Media-layer philosophy after stabilization
- **Media is a teaching layer, not an ontology layer.** A clip proves a movement happens and shows how
  it feels/lands; it does not adjudicate decomposition or ADD. Media can advance freely while Red Wave 2
  is open — *precisely because* it makes no structural claim.
- **Tier = claim scope.** CANONICAL_TUTORIAL asserts "this teaches trick X"; RECORD asserts "this run
  happened." Neither asserts "X decomposes as Y." Keep that line bright.
- **Coverage honesty.** The 16%/9% direct-coverage numbers undercount real pedagogical reach (embedded
  + demo). Build the indirect-coverage edge before claiming low coverage publicly.
- **Decouple media from doctrine.** Media work should proceed on canonical/stable nodes (the 4 packets,
  the tagging pass, set/family exemplars) and explicitly *avoid* ontology-forward positioning on
  doctrine-gated nodes. This sprint's whole point: a media program that never has to wait on Red.

### 6. Suggested next media sprint
1. **Execute the 4 packets** (Dave sources + verifies URLs; emits sidecars; reseed; QC).
2. **Family/kind tagging pass** on the 13 covered exemplars (Dave-track, idempotent).
3. **Design the `teaches`/`components-covered` indirect-coverage edge** (ARCHITECTURE §3a) — unblocks
   embedded coverage (orbit), operator/modifier demos, and a truthful coverage metric.
4. **Set-system demonstration cluster** (pixie/fairy/atomic/quantum) — canonical, low risk, fills the
   thinnest dimension.
5. Defer animated foundational snippets (production-dependent) and historical performance archive
   (sourcing-heavy) to dedicated later sprints.

---

### Outputs (this directory)
- `MEMO.md` — this memo (Parts A/B/C + 6 deliverables).

Source/reference (not duplicated here): `../freestyle-media-ingestion-2026-05-29/candidates/EXEMPLAR_CORPUS.md`
(18-exemplar audit + 4 packets with proposed metadata), and the curated-media pipeline skill for the
ingestion mechanics (snippet_candidates → promote → sidecars → seed → tag-gallery, all Dave-track at the write).
