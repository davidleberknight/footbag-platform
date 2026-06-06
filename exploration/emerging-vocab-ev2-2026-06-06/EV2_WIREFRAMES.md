# EV2 — Wireframes

Text wireframes for the three candidate organizations (Task 3) + the recommended layout and visual hierarchy (Task 6). Design-only; no implementation. Counts are live (post-EV1).

## Visual-hierarchy vocabulary (Task 6)

The page should read as a **project map**, not a spreadsheet:
- **Status sections** = the spine (large headings, vertical flow, one per frontier state).
- **ADD groups** = sub-headings inside A and B (`1 ADD`, `2 ADD`, … `ADD Unknown`).
- **Cards** = one per name: name + tracked-tag chip + derived-ADD badge + source-provenance chip + (for B) a "needs: notation/decomposition" tag. No detail-page link (these aren't canonical), no media.
- **Badges:** status (`ready` green · `needs authoring` amber · `doctrine` red · `folk` grey · `alias` muted), derived-ADD (number), and an `ADD Unknown` warning chip.
- **Collapsibles:** D (folk/unresolved) and E (alias archive) collapsed by default; the ecosystem matrix collapsed into a "frontier by ecosystem" health panel.
- **Warning states:** `ADD Unknown` and `doctrine-blocked` use warning styling so the eye lands on what's *not* clean. A doctrine cluster shows its blocking question as the loud element.

---

## Mockup 1 — "By ADD" (ADD is the primary axis)

```
Frontier health: 9% structurally understood
[1 ADD] ───────────────────────────────────
  • toe-blizzard      ready    src:FM
  • smog              needs notation  src:PB
  • cradle            folk     src:fborg
[2 ADD] ───────────────────────────────────
  • magellan          ready    src:PB
  • voodoo            doctrine: torque-symposium ruling
  ...
[ADD Unknown] ⚠ ──────────────────────────
  • 734 folk / parser names (disclosure)
```
Status is only a badge. **Rejected:** mixes ready/blocked/folk in every ADD group, so the curator can't get a clean "promote these" list without visually filtering badges in every bucket. ADD answers "how hard," not "what's actionable."

## Mockup 2 — "By Status" (status is the primary axis, current-style within)

```
PROMOTION READY (101)        grouped by ecosystem
  Whirl ecosystem (12) · Torque ecosystem (9) · ...
NEEDS AUTHORING (~frontier)  grouped by ecosystem
DOCTRINE BLOCKED (259)       clusters
FOLK / UNRESOLVED (705)      disclosure
ALIAS / DUPLICATE (436)      disclosure
```
**Closest to today.** Answers "what's actionable" well, but inside Promotion Ready the curator still hunts across ecosystems for the cheapest batch; no promotion *order*.

## Mockup 3 — "Hybrid" (status spine, ADD order inside A+B) ◀ RECOMMENDED

```
┌────────────────────────────────────────────────────────────┐
│  Emerging Vocabulary — the freestyle frontier               │
│  Names we are still confirming. Not official tricks yet.    │
├────────────────────────────────────────────────────────────┤
│  ▓▓ PROMOTION READY  (101)        ← first thing visible     │
│  Structurally understood, clean ADD, no blocker. Promote    │
│  lowest-ADD first.                                          │
│   1 ADD ─────────────────────────────────────────────      │
│     [toe-blizzard ✓1 FM] [smear ✓1 PB] [cradle ✓1 fborg]   │
│   2 ADD ─────────────────────────────────────────────      │
│     [magellan ✓2 PB] [pandora ✓2 fborg] [flurry ✓2 PB]     │
│   3 ADD ─────────────────────────────────────────────      │
│     [ ... ]                                                 │
│   ADD Unknown ⚠ (n)  [ ... ]                                │
│                                                            │
│  Frontier health:  1065 frontier · 101 ready · 259 blocked │
│                    · 705 unresolved · 9% understood        │
│                                                            │
│  ▒▒ NEEDS AUTHORING  (n)                                    │
│  Structure understood; needs notation/decomposition.       │
│   2 ADD ──  [voodoo  needs decomposition  src:fborg]       │
│   3 ADD ──  [ ... ]                                        │
│                                                            │
│  ██ DOCTRINE BLOCKED  (259)                                 │
│  Each cluster is one ruling away from unblocking many.     │
│   ┌ Torque–symposium reading (41) ──────────┐              │
│   │ Blocking Q: does symposium nest inside…  │              │
│   │ e.g. voodoo, pandora, gyro-symp-swirl     │              │
│   └───────────────────────────────────────────┘            │
│   ┌ X-dex trigger on quantum (33) … ┐                       │
│                                                            │
│  ░ FOLK NAMES / UNRESOLVED  (705)        ▸ expand           │
│  ░ ALIAS / DUPLICATE ARCHIVE (436)       ▸ expand (resolved)│
│  ▸ Frontier by ecosystem (matrix)        ▸ expand          │
└────────────────────────────────────────────────────────────┘
```

Card legend: `[name  ✓<derivedADD>  src:<provenance>]`; `✓` = clean derived ADD, `⚠` = ADD Unknown, `needs …` = authoring tag, doctrine cards show the cluster's blocking question.

**Why Hybrid wins:** it leads with the work queue (Promotion Ready, ADD-ordered = promote-cheapest-first), keeps the curator's three questions as the spine (ready / authoring / blocked), preserves the excellent doctrine-cluster treatment, demotes the long tails and the alias archive to disclosure, and keeps ecosystem as a secondary health lens. Metrics sit *under* the ready list, not above it, so the first thing visible is actionable, not a banner.

---

## Recommended layout (final)

Top-to-bottom: **Promotion Ready (ADD-grouped) → frontier-health metric strip → Needs Authoring (ADD-grouped) → Doctrine Blocked (clusters) → Folk/Unresolved (disclosure) → Alias/Duplicate Archive (disclosure) → Frontier-by-ecosystem (disclosure)**.

This is Mockup 3. It satisfies the five questions in order of curator value, makes the next promotion batch the first screen, and reads as a frontier map. Implementation order, risks, and impact are in `EV2_REDESIGN_PROPOSAL.md`.
