# Symbolic Coverage Roadmap — SYMBOLIC-COVERAGE-ROADMAP-1

Generated 2026-05-14. Long-range planning + governance review. No implementation in this slice. Restraint-first preserved; publication-contract preserved; no parser changes, no ontology mutation, no automatic decomposition generation, no bulk ingestion proposed.

## Preamble — where we landed

The architecture scaled cleanly into ADD-7 territory over the last sequence of slices:

| Slice | Net effect |
|---|---|
| IA-REALIGNMENT 1–4 | Compact symbolic-object pattern; cross-surface visual identity; two-surface contract; typography hierarchy |
| CSR S1+S2+S3 | Dictionary cards consume curator chain registry; allow-list governs atom-level aliases; restraint-first default |
| EXP-1 | Two-surface contract formally documented in VIEW_CATALOG |
| CSR-2 NR-1 + NR-1B | 17 canon-locked compound chains added; pendulum + squeeze primitives backfilled |
| VIS-TUNE-1 | Mobile overflow-wrap parity on equivalence rows |
| FBORG-AUDIT-1 | 254-row corpus audit + audit-source elevation of footbag.org/newmoves/list |
| NR-1C | gauntlet two-reading entry (Blurry-compression flagship) |

The architecture is stable, restraint posture intact, infrastructure mature. This roadmap answers a forward-looking question: **what should the next major phase actually be?**

---

## A. Current symbolic coverage assessment

### A1 — Quantitative state (DB snapshot 2026-05-14)

| Metric | Count | Of |
|---|---:|---|
| Active canonical tricks | 160 | total |
| Atoms (`is_core=1`) | 13 | (incl. pixie + fairy + guay drift items per CSR audit) |
| Modifiers (`category='modifier'`) | 10 | |
| Tricks at ADD≥7 | **2** | (gauntlet, montage) |
| Tricks at ADD≥8 | **0** | |
| Compounds with chain-registry `≡` readings | **37** | post-NR-1C |
| Compounds with curator-locked `≡` readings (`curatorConfirmPending: false`) | 30+ | (NR-1 batch + NR-1C all locked) |
| Atom-level alias allow-list entries | 5 | (2 surface, 3 hidden) |
| Compounds with operational notation | 16 | of 160 |
| Compounds with neither notation form | 93 | (per notation-reconciliation audit) |

### A2 — Coverage by surface

| Surface | Coverage state |
|---|---|
| Landing Core Tricks | 11 atoms surfaced; 9 with ADD chip, 2 with `≡` line (around-the-world + orbit); orbit still ADD-pending |
| Glossary §3 compression-flow | 3 cards (osis → torque → mobius); pedagogically sufficient as worked example |
| Dictionary browse cards | 37 compounds render canonical `≡` readings; ~14% of 160 active tricks; pattern recognition has crossed the threshold for surging-X / atomic-X / miraging-X / pixie-X families |
| Trick-detail expanded surface | Per-trick narrative renders Layer-2 ladder via chain registry; same-source-of-truth as compact surface |
| `/freestyle/sets` (set-notation reference) | Legacy table-style; not aligned with symbolic-object visual language; functionally correct for token-lookup purpose |

### A3 — Coverage by ADD tier

| ADD tier | Active DB rows | Cards with `≡` readings | Notes |
|---|---:|---:|---|
| 0–1 (atoms, stalls) | ~25 | ~3 | atoms render no `≡` (correct); ATW alias surfaces |
| 2 (base tricks) | ~30 | ~5 | illusion ≡ outside-in mirage surfaces; rest are atoms |
| 3–4 (compound primitives) | ~50 | ~12 | drifter / torque / blender / vortex / eggbeater / drifter family |
| 5–6 (stacked compounds) | ~45 | ~17 | surging-X / blurry-X (Q1 pending) / pixie-X family |
| 7+ | 2 | 1 | gauntlet (post-NR-1C); montage pending entry |

The 7+ tier coverage gap is the largest single canonical-coverage gap in the dictionary. FM sample alone surfaces 43+ named compounds at this tier.

### A4 — Coverage health summary

- **Strong**: atom-level + modifier-level + compound-primitive tiers (ADD 1-4).
- **Healthy and growing**: stacked-compound tier (ADD 5-6) post-NR-1.
- **Sparse**: high-ADD tier (ADD 7+) — only 2 canonical rows.
- **Architecturally sound**: stopping-depth, two-surface contract, allow-list governance all stable.
- **Externally gated**: ~10 compounds depend on Wave-1 / Wave-2 Red rulings; ~15 named operators surfaced from FM corpus require curator clarification.

---

## B. Highest-leverage future enrichment lanes

Ranked by leverage. "Leverage" = how much canonical-surface ground each lane covers per unit of effort.

### B1 — Wave-1 reply integration (HIGHEST; externally gated)

When Red replies to the Wave-1 packet (Q1 rotational bonus / Q1c furious non-rotational / Q2 Q4 FM-vocab / Q3 positional weights / Q4 atomic-set polysemy), follow the post-reply protocol per `project_red_consultation_state`:

1. Re-run `legacy_data/tools/build_add_conflict_audit.py`
2. Update `RED_RESOLVED_CANON.md` with new rulings
3. Append newly-canon-locked entries to `freestyleSymbolicEquivalences.ts`
4. Allow-list newly-canonical aliases in `freestyleAliasGovernance.ts`
5. Compact cards surface new readings on next deploy

**Estimated unblock**: 10–15 chain-registry entries currently blocked on Wave-1 (blurry-*, fury, food-processor, witchdoctor + ~7 Q4-modifier-dependent rows). Plus several DB pt12-open rows close arithmetically.

**Cost**: low — curator-content + re-run scripts. No code shape change.

**Blocker**: external. The packet is sent; reply timing unknown.

### B2 — Down-family canonicalization (Wave-2 Theme 6) consultation

The largest single Wave-2 theme blocking high-ADD canonical promotion. Resolves whether `down`, `double-over-down`, `down-diver`, `down-double-down` get canonical base-trick rows + ADD assignments.

**Unlocks**: Cold Fusion, Spinning Symposium Down Double Down, Superdeeduperfly, Your Mom, Your Sister (ADD 7-8), plus 7+ other corpus entries.

**Path**: Wave-2 packet drafting. Per `project_red_consultation_state` consolidate-before-send methodology — bundle Theme 6 + Theme 2 (focus tricks Witchdoctor/Frigidosis/Scrambled Eggbeater) + Theme 7 (double-quantifier default) + the new-operator clarifications (B3) into one consolidated packet.

### B3 — New-operator clarification packet

FBORG-AUDIT-1 surfaced six new operator-token candidates (Motion, Nova, X-body Rake, Floating, Warping, Alpine-as-modifier, Zulu-as-modifier). Per `feedback_frequency_not_authority`, none auto-promote.

**Path**: bundle into Wave-2 packet. Single Red theme: "Are any of these candidate NF-2A operators, and if so, what are their ADD weights and decomposition?"

**Unlocks**: several ADD-7+ compound readings (Atomotion, Oh Wheely, Sasquatch/Warlock, Floatation, Warp, Alpine Big Apple, Odula).

### B4 — Audit-source maturity expansion

Currently `reference_fborg_newmoves_list` documents footbag.org as a structured audit source. The footbagmoves.com corpus (referenced by `build_fborg_reconciliation_xlsx.py` as "~569-trick" target) deserves the same treatment.

**Path**: small reference-memory entry; audit-lane parallel to FBORG-AUDIT-1. The cached `footbagmoves-*.txt` extracts already in the repo prove the value.

**Cost**: zero code; one memory entry; documents the existing evidence corpus.

**Leverage**: enables future SYMBOLIC-COVERAGE-N audits to use both corpora consistently.

### B5 — NR-1D canonical-promotion micro-batch

The four cleanest E2 candidates from FBORG-AUDIT-1 (Gangsta Party, Overlord, Swirlwind, Stepping Ducking PS Whirl) — all-canon-locked, math validates, no Wave-pending dependence. Each is:
- One DB row insert (curator-authored SQL migration)
- One chain-registry entry
- One discoverability check (does the name appear in any other corpus row?)

**Path**: curator + maintainer decision. Per `feedback_reversible_content_governance`, content-layer chain entries first; DB row insert is the SQL-migration boundary.

**Cost**: small. Net effect: ADD-7 canonical coverage goes from 2 → 6 rows.

### B6 — Operational-notation curator backfill

The 144-row operational-notation gap is the LARGEST raw-numbers gap. But: curator manual work per row. Not a single-slice opportunity; a multi-month curator workstream.

**Path**: prioritize the 14 chain-registry-locked compounds that LACK operational notation (e.g., torque has `notation: TORQUE` but no `operational_notation`). Backfilling these 14 first lets compact cards show all four symbolic layers.

**Cost**: curator content authorship. Estimate ~30 minutes per row, ~7 hours total for the 14 priority rows.

### B7 — Glossary §3 single-sourcing (NR-4 from CSR-2 audit)

Refactor `glossary.hbs §3 symbolic-compression-flow` to consume the chain registry directly instead of hardcoded readings for mobius. Resolves the dual-source maintenance burden flagged in CSR PART 7 / SYMBOLIC_SURFACE_QA_REVIEW PART B2.

**Path**: small code change. Service shaping reads from `freestyleSymbolicEquivalences.ts` for the §3 cards; template renders unchanged.

**Cost**: low. Risk: visual regression if filter rules emerge wrong; tests assert §3 still renders 3 cards.

**Deferral candidate**: not urgent; dual-source state works today.

---

## C. Scalability risks

### C1 — Chain registry growth past manageable manual-edit threshold

At 37 entries today; ~50–80 candidates surfacable from existing canon-locked rulings. Realistic ceiling: ~100–120 entries for full dictionary coverage. Beyond that, manual curator-edits become brittle.

**Mitigation**: the file-header rules (max 3 readings; stopping-depth; pt-source citation per entry) keep individual entries small. Bulk-edit pattern (NR-1 batch of 17) proved viable. The ceiling is far from reached.

**Watch threshold**: if a future single batch proposes >25 entries, treat as a process signal — consider splitting into curator review sub-batches.

### C2 — Operator proliferation pressure

Each new operator (Motion, Nova, Rake, Floating, Warping, Alpine-as-mod, Zulu-as-mod) is a Q4-batch-style ontology question. Promoting any without Red ruling expands NF-2A ontology.

**Mitigation**: hard rule already in place — operators surface as Red questions, not promotions. The FBORG-AUDIT-1 surfaced operators are queued for Wave-2 consultation, not added to `freestyleOperatorReference.ts`.

**Watch threshold**: if a future contributor proposes adding an operator without a Red ruling citation, escalate.

### C3 — Cross-corpus disagreement accumulation

FBORG and FM corpora occasionally name the same trick with different decomposition (gauntlet's Stepping Paradox vs Blurry was a happy two-readings-of-one-trick case; future cases may be ambiguous).

**Mitigation**: the chain-registry is the curator's authoritative source. Corpora are evidence corpora. The `reference_fborg_newmoves_list` memory codifies "never automatic ontology authority." Same posture for footbagmoves.com when its reference memory ships.

**Watch threshold**: a cross-corpus disagreement where the curator cannot reconcile to a single chain reading is a Red consultation candidate.

### C4 — Glossary saturation

The §3 Execution Mechanics subsection has 7 PassBack-adapted entries. As more PassBack/FBORG concepts surface, the section could grow into encyclopedia shape — the failure mode the re-bloat test was added to prevent.

**Mitigation**: the existing re-bloat guard test (`< 120_000` HTML bytes) is the structural limit. The qualitative limit (each entry stays under 3 sentences) is the editorial rule.

**Watch threshold**: any single PR adding more than 3 new glossary entries should be sliced.

### C5 — High-ADD card height on mobile

A 9-ADD compound like Carousel ("Surging Ducking Paradox Symposium Whirling Rake") with 3 chain readings + operational notation could render an 8-line card on a 320px viewport. Already a known scaling concern from the QA review.

**Mitigation**: typography-led; not container-led. Adjacent-sibling tight-stack rule keeps `≡` lines visually layered. VIS-TUNE-1 added the mobile overflow-wrap safety net.

**Watch threshold**: if a card consistently scrolls past the visible viewport on a target mobile device, that signals a content-design issue, not a typography issue.

---

## D. Governance risks

### D1 — Promotion pressure from corpus mining

Once a curator scans 254 FBORG rows or 569 FM rows, the natural human reaction is "should we add this?" for many of them. The publication-contract restraint exists explicitly to slow this down.

**Mitigation**: every canonical promotion goes through the six-requirement gate (`project_canonical_trick_publication_contract`). Each row needs symbolic representation + structural composition + discoverability + alias governance + honest incompleteness + no fabricated structure. Mechanical enforcement: any PR proposing >1 new canonical row triggers maintainer review.

**Watch threshold**: NR-1D (4 candidates) is the largest single canonical-promotion proposal so far. Larger proposals should be split.

### D2 — Operator promotion pressure (D1's ontology cousin)

Same shape but for operators (NF-2A entries). Adding `Motion` or `Floating` as canonical operators is a much bigger commitment than adding a trick row — operators reach across many compound readings.

**Mitigation**: Red ruling required for NF-2A additions. `feedback_frequency_not_authority` is the load-bearing rule.

**Watch threshold**: an operator addition WITHOUT a pt-numbered ruling citation should never ship.

### D3 — Canonical-vs-archival drift

The corpora (FBORG, FM, Holden compilation, PassBack glossary) are evidence corpora — never canon. The line is preserved via the audit-source memory pattern. Risk: a future maintainer treats a high-frequency corpus entry as "obviously canonical" without realizing the restraint posture.

**Mitigation**: every reference memory entry explicitly states "never automatic ontology authority and never bulk-import." The line is documented in five places: `reference_legacy_move_sets`, `reference_fborg_newmoves_list`, `feedback_frequency_not_authority`, `feedback_reversible_content_governance`, and `project_canonical_trick_publication_contract`.

**Watch threshold**: if a future PR proposes loading a corpus file directly into `freestyle_tricks` via a loader script, escalate.

### D4 — Curator burnout / single-point-of-knowledge

The chain-registry + allow-list pattern requires curator manual review per entry. At 100+ entries this becomes a real workload. A single curator's mental model becomes load-bearing.

**Mitigation**: the file-header rules + cross-reference citations (`pt11-locked`, `Red pt6+pt8 locked`, etc.) externalize the curator's reasoning. A second curator could ramp up by reading the existing entries and tracing the citations.

**Watch threshold**: when a new contributor cannot add a chain entry without consulting the curator, the documentation has rotted.

### D5 — Wave-2 packet drift (consolidate-before-send violation)

Per `project_red_consultation_state`, the consolidate-before-send methodology requires reading RED_RESOLVED_CANON + the status matrix before drafting new Red packets. The temptation to ship "just one more Red question" piecemeal violates this.

**Mitigation**: Wave-2 packet should bundle Theme 2 + Theme 6 + Theme 7 + Theme 8 (already in scope) + new-operator clarification batch. One packet, multiple themes.

**Watch threshold**: any proposal to send a single-question Red packet without consolidating with pending themes should be flagged.

---

## E. Typography / readability risks

### E1 — Pattern-recognition saturation

Already flagged in SYMBOLIC_SURFACE_QA_REVIEW. When `≡` becomes ubiquitous, readers stop processing it. Currently 24% of cards render `≡`; near-term ceiling around 35-40% (NR-1D + future NR-1E expansions). Beyond that, the sigil's distinctness fades.

**Mitigation**: the symbolic-object pattern relies on `≡` being meaningful AT EVERY CARD. The fix isn't visual; it's restraint — only canon-locked readings surface, never speculative chains.

### E2 — Operator-stack overflow on multi-reading deep compounds

A 4-or-5-reading chain (if max-3 rule is broken) at ADD-9 would render an unwieldy card. Today max-3 is enforced; the visual breakdown is theoretical not actual.

**Mitigation**: max-3 readings/entry is the editorial rule. The pedagogical value of a 4th reading is negative (returns diminish quickly). The rule should NOT be relaxed.

### E3 — Card height variance across the grid

Atoms render 2-line cards; multi-reading compounds render 5-6-line cards. The grid's `auto-fit` keeps cards aligned to their content; tall cards push their grid neighbors down asymmetrically.

**Mitigation**: this is desired behavior (asymmetry signals complexity). The visual rhythm assumes cards-of-different-heights. Forcing uniform card height would reintroduce database-table aesthetics.

### E4 — `[UNS]` and other curator-introduced op-flags

NR-1B introduced `[UNS]` as a curator-authored operational flag for squeeze. The render treats it as an unknown-role span (graceful degradation). If 5+ new curator-introduced flags accumulate, the operational-notation glossary §9 needs maintenance.

**Mitigation**: a future small slice could formalize new flags in §9. Not urgent today; flag for D1-style curator burnout warning.

---

## F. Future-work priority recommendation

Across the five categories the user enumerated:

| Category | Priority | Why |
|---|---|---|
| **Enrichment (chain registry, allow-list)** | 1st when canon-locked sources land | Highest leverage per unit cost. Wave-1 reply integration is the biggest pending unlock. |
| **Glossary / operator work** | 2nd | Glossary §3 single-sourcing (NR-4); new-operator clarification packet (B3); future `[UNS]` formalization. Mostly small slices. |
| **Canonical promotion** | 3rd (curator-gated) | NR-1D shortlist (4 candidates) is the cleanest set. Anything beyond needs maintainer call. |
| **Alias governance** | 4th | Stable. Allow-list module works. No expansion proposed until Wave-1 reply expands the canonical-alias set. |
| **Archival / reference surfaces** | 5th (low priority but eventually) | Audit-source memory pattern is the right home for non-canonical evidence corpora. footbagmoves.com elevation is a one-memory-entry task. |

The clearest priority ladder: **Wave-1 reply integration → Wave-2 packet drafting (consolidated) → small glossary/operator cleanups → NR-1D canonical micro-batch → archival-source elevation**.

---

## G. Explicit recommendation for the next major phase

### G1 — The next major phase: Wave-2 consolidated Red packet drafting (RED-WAVE2)

Single highest-leverage forward move that does NOT depend on external state.

**Scope** (per `project_red_consultation_state` consolidate-before-send methodology):

| Theme | Existing? | Audit input | Estimated questions |
|---|---|---|---|
| Theme 2 — Witchdoctor / Frigidosis / Scrambled Eggbeater | already drafted | RED_PACKET_DRAFT.md | 3 questions |
| Theme 6 — Down-family canonicalization | already drafted | RED_PACKET_DRAFT.md | 2 questions |
| Theme 7 — Double-quantifier default | already drafted | RED_PACKET_DRAFT.md | 1 question |
| Theme 8 — Equivalence-chain educational promotion (sailing, frantic, leaning, hyper, bling-blang) | already drafted | RED_PACKET_DRAFT.md | 2 questions |
| **NEW Theme 9 — High-ADD compositional naming + new operators** | NEW (proposed in FBORG-AUDIT-1 PART G3) | FBORG_AUDIT_1_REPORT.md | 4-5 questions (gauntlet confirmation, Motion/Nova/Rake/Floating/Warping classification, Alpine-as-modifier status, Zulu-as-modifier status) |
| **NEW Theme 10 — Math discrepancies surfaced by NR-1B** | NEW (proposed here) | NOTATION_RECONCILIATION_AUDIT + FBORG_AUDIT_1_REPORT | 2 questions (Super Ego's 6-vs-7; Big Apple Sauce's 8-vs-9; venom/nemesis Furious-rotational math) |

**Total**: ~15 consolidated questions in one packet. Substantially larger than Wave-1's 4-question packet, but covers all currently-pending themes plus the new corpus-mining-surfaced gaps.

**Why this phase?**

1. Wave-1 reply timing is external — can't plan around it.
2. Wave-2 drafting can proceed in parallel without blocking on Wave-1.
3. Consolidating 5 themes into one packet is more efficient for Red.
4. The audit-driven new themes (9 + 10) unblock the highest-ADD-tier canonical coverage gap.
5. No code, no DB writes — pure curator + maintainer drafting work. Restraint-first.

**Constraint**: do not send Wave-2 packet until Wave-1 reply arrives. The post-Wave-1 protocol may reframe some Wave-2 questions. Drafting can happen in parallel; sending awaits Wave-1's reply.

### G2 — Concurrent low-cost work (no Red dependence)

While Wave-2 drafts:

1. **footbagmoves.com audit-source memory** — one reference-memory entry; promotes the existing cached corpus to peer status with FBORG. (~30 min curator work.)
2. **NR-4 glossary §3 single-sourcing** — small code slice; resolves dual-source maintenance burden. (~1 hour.)
3. **Operational-notation backfill for the 14 chain-registered compounds lacking it** — curator content work; surfaces 4-layer compact cards for those rows. (~7 hours of curator authorship.)

None block or compete with Wave-2 drafting.

### G3 — Deferred until next reply cycle

- NR-1D canonical-promotion micro-batch (4 candidates) — awaits curator + maintainer green-light
- New-operator NF-2A additions — wait for Wave-2 reply
- High-ADD canonical promotions (Cold Fusion, Superdeeduperfly, etc.) — wait for Wave-2 Theme 6 resolution
- Down-family base-trick rows — wait for Wave-2 Theme 6 resolution

---

## H. Architectural verdict

**The current architecture scales cleanly into ADD-8 and ADD-9 territory.** No structural changes needed. The constraints are NOT architectural — they are:

1. External (Red ruling cadence)
2. Curatorial (manual review per entry)
3. Restraint-driven (we deliberately defer promotion pressure)

The architecture's success is measured by **what it refuses to do automatically**. The publication contract, the allow-list, the chain-registry stopping-depth rules, the audit-source restraint posture — together these form a governance fabric that resists the temptation to bulk-promote evidence into canon.

This roadmap's load-bearing claim: **the next major phase is consolidation and Red consultation, not enrichment**. The dictionary's symbolic surface is in good shape today. Adding more canonical rows or operators without Red rulings would erode restraint posture. Adding more chain entries within current canon is incremental.

The big move is consolidating the Wave-2 packet so when Red replies, multiple themes unblock at once. Everything else flows downstream from that.

---

## Cross-references

- `FBORG_AUDIT_1_REPORT.md` — corpus audit feeding Themes 9 + 10
- `NOTATION_RECONCILIATION_AUDIT.md` — pre-NR-1 audit identifying remaining gaps
- `SYMBOLIC_SURFACE_QA_REVIEW.md` — post-NR-1 / NR-1B surface review
- `CANONICAL_SURFACE_REALIGNMENT_PLAN.md` — CSR architectural plan + deferred S4/S5/S6
- `COMPACT_SYMBOLIC_BROWSE_PLAN.md` — two-surface contract + EXP-1
- [[project_red_consultation_state]] — Wave-1 sent / Wave-2 deferred / consolidate-before-send methodology
- [[project_canonical_trick_publication_contract]] — six-requirement promotion gate
- [[project_freestyle_core_atoms]] — atom registry (still 12; pixie/fairy/guay drift items per CSR S6)
- [[feedback_frequency_not_authority]] — corpus recurrence is evidence not authority
- [[feedback_reversible_content_governance]] — content-layer over SQL during ontology refinement
- [[reference_fborg_newmoves_list]] — first audit-source memory; pattern for footbagmoves.com elevation
- [[reference_legacy_move_sets]] — Chris Holden compilation; sibling evidence corpus
- [[project_symbolic_ux_rollout]] — the load-bearing project-state pointer; updated 2026-05-14 with all this session's work
