# Skill Replacement Drafts — The Three Stale Freestyle Skills

Ready-to-review replacement specs for the three domain skills the stewardship audit
flagged. These are **drafts for the maintainers**, not applied edits — every `.claude/`
file is approval-gated, and the actual edit is Dave's tracked cross-track item, which
this document unblocks. Each skill below: what to delete, what durable rules remain,
the new wording for the parts that change, the target size, and the warnings the
rewrite must carry.

The one principle behind all three (recommend promoting it into
`claude-harness-governance.md`, Dave's call):

> **A skill body carries zero project status.** Any "current state / what to do next"
> content defers to IMPLEMENTATION_PLAN.md by pointer. A skill that needs status to make
> sense is a working log misfiled as a skill.

---

## 1. `footbag-freestyle-dictionary` — 858 lines → REWRITE + SPLIT (target: SKILL.md < 500)

### Delete outright (dated campaign logs, ~248 lines)

- **§B "Current strategic posture"** (lines 48-66) — the promotion-campaign "current
  state" ("first-class 536 → 651," "runway EXHAUSTED," "frontier 1844"). The campaign is
  closed; the IP owns state.
- **§B.1** (67-129), **§B.2** (130-172), **§B.3** (173-282), **§B.4** (283-296) — dated
  Wave/Phase history and methodology journals. Any genuinely timeless mechanical rule
  buried here (the JOB-notation derivation rule, the sibling-pattern op_notation rule,
  the bracket==ADD sanity check) is extracted as a one-line forever-rule folded into §1
  Trick Dictionary Layer; the dated narrative around it is deleted.
- The media **"Phase E" deprecation status note** in §5b — reword to the timeless rule
  ("do not build new curated media on the `freestyle_media_*` tables; the unified
  `media_items` model is authoritative") with the dated Phase-E status removed.
- The broken citation to `exploration/nonstandard-topology-audit-2026-05-24/` (gone).
- The memory-pointer instruction "if Red Wave 2/3 answers land, integrate per the queued
  follow-up slices (see `[[project_red_consultation_state]]`)" — replace with: "For what
  is currently held on Red's answers, read `freestyle/doctrine/RED_QUEUE.md`; never trust
  a remembered or skill-embedded hold list."

### Keep verbatim (the durable skill — the layer rules are good)

Core Rule (10-24); §A Four-layer ontology separation (29-47); §C Family/topology caution
(297-311); §D Symbolic restraint doctrine (312-326); §1 Trick Dictionary Layer with the
canonical-vs-compositional rule, direction-is-structural, the stall ontology rule, Jobs
notation as backbone, description policy (327-433); §2 Modifier Layer + Surging rule
(434-480); §3 Alias/Naming + positional identity contract (481-536); §4 Glossary layer
(537-575); §5 Sequence/Combo (576-599); §5b Media Linkage minus the Phase-E status
(600-684); §5c Navigation layer rules (685-738); §6 Competition Results (739-755); Source/
Truth Rules (756-775); Red Husted Clarifications (776-798); Activation/Review Rules
(799-815); Public-surface invariant + modifier-rows-are-not-tricks (816-831);
Implementation Rules (832-844); Product Goal (845-858).

### New wording — the "Operating posture" block that replaces §B

> ## Operating posture
>
> The freestyle encyclopedia is release-ready and in **stewardship mode**. There is no
> active promotion campaign; the promotion arc is closed, and what remains unpromoted is
> blocked on doctrine questions recorded in `freestyle/doctrine/RED_QUEUE.md`. This skill
> carries no project status — for what is done, active, parked, or blocked, read the
> "State of freestyle" block in `IMPLEMENTATION_PLAN.md`. Do not begin promotion,
> authoring, or restructuring work from this skill; start only from a scoped item the
> maintainer has pulled from the plan. The one sanctioned forward-build track is Glossary
> V2 (`exploration/glossary-v2-architecture/`), and it is content-first and gated on
> maintainer approval.

### Size

Deleting §B (~248 lines) lands the file near 610 — still over the ~500 ceiling. Apply the
split the harness governance already prescribes and that `bug-hunt` models: **SKILL.md**
keeps the Core Rule, §A ontology, the forever-rules, the compact per-layer summaries, and
the Operating-posture block (target < 500); **REFERENCE.md** (new sidecar, no frontmatter,
never in the slash menu) holds the detailed per-layer procedures (the description
templates, the media source-registry specifics, the navigation cap details). Also delete
the two freestyle-pending allowlist entries in `scripts/ci/assert_claude_harness.sh` once
the file is under the ceiling.

### Warnings the rewrite must carry

- Do not reopen the promotion campaign. If you find yourself preparing red_additions rows
  without a scoped maintainer request, stop — you have been misled.
- Family pages, trick detail, browse, sets, glossary, operators are **live production
  surfaces**, not exploration.
- Status is IP-only; holds are RED_QUEUE.md-only.

---

## 2. `freestyle-dictionary-surface` — 288 lines → REWRITE (target ~230)

### Delete or fix (the status spine is factually false)

- **§2 "Phase boundaries"** (39-58): "Currently NOT in scope: family-page production
  routes... exploration only as of 2026-05-07." **False** — `/freestyle/families` and
  `/freestyle/families/:slug` are mounted, live, and passed the release audit. Delete the
  scope-boundary framing entirely.
- **§9 "Status"** (284-288): "Exploration-derived. Not production-shipped... not yet
  load-bearing." **False and dangerous** — it tells a session maintaining live family
  pages that this skill's contract rules are inapplicable notes. Delete.
- **§8 "Source-of-truth references"** (268-283): the four citations to
  `exploration/freestyle-dictionary-ux/*` — the directory is gone. Remove the dead
  citations; keep only live references.
- **§6 "Future direction"** (235-250): non-binding sequencing that predates the shipped
  reality; trim to a one-line "future direction is tracked in IMPLEMENTATION_PLAN.md, not
  here."

### Keep verbatim (the durable contract — this is genuinely good)

§1 Purpose and intent (27-38); §3 Architectural invariants — projection-over-extension,
disclosure-depth-never-auth, decomposition-is-pedagogy, single-mapping-site,
search-resolves-all-aliases, ontology-is-the-joint-model (59-88); §4 Canonical UX contract
patterns — multi-family membership, hero-media inversion, the **alias five-category
taxonomy**, the disclosure model (89-177); §5 Pedagogical philosophy — five-question
intro, voice norms, "show your work" expander depth, ADD-math trust signal (189-234); §7
Anti-patterns (251-267).

### New wording — the block that replaces §2 and §9

> ## Status of the surfaces this skill governs
>
> These are **live production surfaces**: the trick index and detail pages, family pages
> (`/freestyle/families`, `/freestyle/families/:slug`), sets, glossary, operators, and
> search all ship and passed the V1 release audit. This skill's contract rules apply to
> them now, not "when a production phase begins." Implementation status lives in
> `IMPLEMENTATION_PLAN.md`; this skill carries the durable UX contract only. The one
> active forward-build track is Glossary V2, whose design lives in
> `exploration/glossary-v2-architecture/`.

### Warnings

- Family pages exist and are live. Never propose "building" them or treat their contract
  rules as inapplicable exploration notes.
- This is a maintenance-era skill for shipped surfaces, not a sandbox charter.

---

## 3. `freestyle-topology-governance` — 208 lines → TRIM (target ~180)

### Delete (one dated block)

- **§"Red-wave governance caution"** (137-164): cites "Wave 2 packet SENT 2026-05-15 /
  still in flight" and gates a stale list of six doctrine areas. Wave 3 is the current
  round; several named Wave-2 items are ruled and recorded in `RED_RULINGS.md`. A session
  trusting this would freeze settled doctrine and miss the real current holds.

### Keep verbatim (the topology doctrine is durable)

Core invariant (22-46); Family semantics warnings (47-64); Topology categories (65-96);
Movement-neighborhood philosophy (97-118); Multi-axis relationship concept (119-136);
Reversible governance doctrine (165-177); When this skill applies / does not apply
(178-203); Strategic frame (204-208).

### New wording — the one durable sentence that replaces the caution block

> ## Doctrine holds
>
> Before doctrine-adjacent topology work, read `freestyle/doctrine/RED_QUEUE.md` for what
> is currently held pending the rules expert's answers, and `RED_RULINGS.md` for what is
> settled. Never trust a hold list embedded in this skill or in memory; those two files
> are the only live truth. Do not freeze a decomposition or add a schema constraint over a
> reading that is still open there.

### Warnings

- The doctrine caution here is timeless (reversible governance during open questions); the
  *specific wave and item list* is not. Take the current list from RED_QUEUE.md only.

---

## Rollup for the maintainers

| Skill | Action | From | To | Riskiest thing it currently says |
|---|---|---|---|---|
| footbag-freestyle-dictionary | Rewrite + split | 858 | <500 + REFERENCE.md | "runway EXHAUSTED... what to do next: backup DB → red_additions..." (marching orders for a closed campaign) |
| freestyle-dictionary-surface | Rewrite status sections | 288 | ~230 | "family pages do not yet exist" (false; they are live) |
| freestyle-topology-governance | Trim one block | 208 | ~180 | "Wave 2... still in flight" (superseded; stale holds) |

All three share one root cause and one fix: they embedded status that belongs only in the
IP. The harness-governance addition above prevents recurrence. None of these edits should
be applied by an agent unprompted — they are the maintainers' to make.
