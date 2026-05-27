# Human Review Checklist — Pre-Red Freestyle Stabilization

**Purpose**: structured checklist for the curator to execute a real-device review of the post–Slice-W freestyle dictionary. AI did not perform this review; the AI cannot truly evaluate subjective experience, real device behavior, or lived navigation patterns.

**Companion document**: `RENDERED_HTML_AUDIT.md` — AI-grounded findings from rendered HTML/CSS/DOM (no screenshots, no device verification).

> **Honesty notice**: every item below is a checklist for human evaluation. Boxes labeled **[AI: verified]** were source-grounded by the AI from rendered HTML; everything else requires hands-on review.

## Setup

1. Dev server: `npm run dev` on port 3000 (verified responsive)
2. Devices in order of priority:
   - **Mobile portrait** (iOS Safari + Android Chrome — Slice V mobile grid-area fix targets this viewport)
   - **Mobile landscape**
   - **Laptop** (~1280–1440px wide)
   - **Desktop widescreen** (≥1920px)
3. Capture screenshots into `.playwright-mcp/` or your normal review location

## Surfaces to visit (priority-ordered)

| # | URL | Why review this |
|---|---|---|
| 1 | `/freestyle/tricks` | Main browse view. 138 registry cards. Mobile portrait is most diagnostic. |
| 2 | `/freestyle/tricks/paradox-whirl` | Trick-detail. Has BOTH Notation (Layer 1) + Equivalent readings (Layer 2). Tests Slice W intro softening + the new section-intro fix. |
| 3 | `/freestyle/tricks/mobius` | Trick-detail with multi-reading chain (3 readings of progressive depth). Tests whether progressive-unfolding pedagogy reads cleanly. |
| 4 | `/freestyle/tricks?view=family` | Family view. 16 family sections. Tests Slice M dual-membership (torque + blender appear in BOTH osis-family AND their own). |
| 5 | `/freestyle/tricks?view=movement-system` | Slice L1/L2 + Slice N composition glosses. 6 pilot glosses render: pixie, atomic (empty), stepping, paradox, spinning, ducking, diving (empty), symposium. |
| 6 | `/freestyle/glossary` | §1–§12 onboarding ladder. Curator should read top-to-bottom as a fresh learner. |
| 7 | `/freestyle/sets` | Legacy move-sets surface. |

---

## 1. Mobile readability checklist

Test on **real mobile device** at ≤520px viewport. Slice V's grid-area fix targets this width specifically.

- [ ] On `/freestyle/tricks`, registry cards stack to two rows: title+ADD on row 1, formula on row 2 (per Slice V mockup §8.2). **AI: CSS rule served; markup classes present.** Manual verification required.
- [ ] Formula does NOT overlap the title row.
- [ ] Long formulas wrap gracefully within the "reading" grid area.
- [ ] No horizontal scroll bar at 360px width.
- [ ] Thumb-scroll fatigue: scrolling through 138 cards is workable, not exhausting.
- [ ] ADD chip is touch-target-friendly (≥44pt).
- [ ] The pending-decomposition pill (rev-up, reaper, surreal, montage, fury, surgery — 6 rows) renders inline without breaking row layout.
- [ ] Tap a chain-reading token (e.g. ATW link) — confirms glossary cross-link navigation.

**Confusion / fatigue / overload findings**:
- ____________________
- ____________________

## 2. Newcomer onboarding checklist

Imagine yourself with **zero prior symbolic-system knowledge**. Walk top-to-bottom.

### 2a. Glossary onboarding

- [ ] §1 Movement-Language Primer — readable as a non-practitioner?
- [ ] §2 Contact Surfaces — clear what surfaces are?
- [ ] §3 Dexterities — does the motion/window/quality reorg help or confuse?
- [ ] §4 Timing Layers — does the SVG load + render clearly?
- [ ] §5 Core Trick Structures — family-tree visualizations parse cleanly?
- [ ] §6 Modifiers — Surface A feel cards vs Surface B advanced reference — does the split feel natural?
- [ ] §7 Symbolic Notation — feels intimidating?
- [ ] §8 Composition — meaningful to a newcomer?
- [ ] §9 Movement Neighborhoods — does the "observational" framing land? (Renamed from "topology" in the stabilization slice.)
- [ ] §10 Traditional Reference — ADD ladder reads cleanly?
- [ ] §11 Community — empty or filled?
- [ ] §12 Sources — render correctly (only h2 found at the top-level grep matched this one).

### 2b. Trick-detail onboarding

Open `/freestyle/tricks/paradox-whirl` cold:

- [ ] Hero — clear what the trick is?
- [ ] About this trick — "How it's built: paradox(1) + whirl(3) = 4 ADD" — does this prepare the reader for the Notation section?
- [ ] Notation — Slice W intro ("The name broken into named parts…"). Does it land? **AI: rendered.**
- [ ] Equivalent readings — new intro ("Other ways the same trick reads — later rows progressively unfold…"). Does the multi-reading pattern make sense on `mobius` (3 readings) vs paradox-whirl (1 reading)?
- [ ] Operational notation — "Execution mechanics" framing — does it feel distinct from semantic notation?
- [ ] Execution prose — narrative readable?

**Onboarding failures observed**:
- ____________________

## 3. Trick-detail flow checklist

Visit 3 detail pages: `paradox-whirl`, `mobius`, `dimwalk`.

- [ ] Canonical-first order (Notation → Operational → Modifier Layering → Prose) feels natural?
- [ ] Equivalent-readings section progressive-depth pedagogy: does mobius's 3 readings (gyro torque → spinning ss torque → spinning ss miraging op osis) read as "progressively unfolding"? **AI: verified the readings render in order.**
- [ ] Structural decomposition collapse — does anyone open it? Did you want to?
- [ ] If you DID open Structural decomposition: does "Jobs notation" / "Parse warnings" feel like it belongs on a public educational page? **AI: confirmed Jobs notation present; flagged for admin-gating in Slice W §3.1.**
- [ ] Editorial decomposition label — does the word "Editorial" feel out of place?
- [ ] Modifier layering nested-box visualization — when it renders, is it readable on mobile?
- [ ] Cross-reference sections (Family, Related, Topology, Memberships, Parallels, Substitutions) — discoverability or overload?
- [ ] Media block — videos load? Captions readable?

**Diagnostic-section admin-gating decision**: should `<details class="notation-grammar-diagnostics">` be admin-only?
- [ ] Yes — admin-only
- [ ] No — keep as-is (collapsed-within-collapsed is enough restraint)
- [ ] Remove from public page entirely
- [ ] Other: ____________________

## 4. Family topology checklist

On `/freestyle/tricks?view=family`:

- [ ] 16 family sections render in canonical order. **AI: verified — whirl, rev-whirl, butterfly, osis, torque, blender, mirage, drifter, legover, pickup, illusion, ATW, swirl, reverse-drifter, barfly, double-leg-over.**
- [ ] osis-family contains BOTH torque AND blender cards (Slice M dual-membership). **AI: verified.**
- [ ] torque-family contains the torque card itself as anchor (Slice M dual-membership). **AI: verified.**
- [ ] drifter-family contains drifter + paradox-drifter + smoke + tombstone + vortex + high-plains-drifter (re-bucketed via FAMILY_OVERRIDES). **AI: dual-membership verified.**
- [ ] clipper-stall family section is ABSENT (Slice M retirement). **AI: verified — no family-clipper-stall section, no clipper-stall card in family view.**
- [ ] Does the dual-membership of torque/blender (appearing twice) confuse you, or read as natural lineage?

**Dual-membership UX impression**:
- ____________________

## 5. Movement System view checklist

On `/freestyle/tricks?view=movement-system`:

- [ ] All 4 axes render in declaration order: Set / Uptime · Entry Topologies · Midtime Body · No-Plant & Suspension. **AI: verified.**
- [ ] Paradox group displays the entry-shape line ("Entry shape: clip > op-in dex" from Pre-Red sweep). **AI: present (HTML-encoded `&gt;`).**
- [ ] All 6 pilot composition glosses render: paradox, spinning, ducking, symposium, stepping, pixie. **AI: verified.**
- [ ] Atomic and diving groups render without a composition gloss (un-glossed per pilot scope). **AI: verified.**
- [ ] Trick cards within each axis group sort ADD ascending. **AI: verified for pixie group earlier.**
- [ ] Axis-jump nav at top works correctly when tapped.
- [ ] Does the page teach the curator's intended ontology (4 axes as pedagogical primitives) or just overwhelm?

## 6. Emotional / experiential review

Subjective. **Manual review required for all of these.**

- [ ] Does the site feel **welcoming**?
- [ ] Does it feel **scholarly**?
- [ ] Does it feel **overloaded**?
- [ ] Does it feel **alive** or **mechanical**?
- [ ] Does the Notation section's terminology ("base trick", "modifier", "positional cue") feel like teaching or jargon?
- [ ] Does the four-layer ontology rule "leak" into the user experience visibly? Or stay invisible?

## 7. Device matrix

| Device | Browse view | Trick detail | Family view | Movement System | Glossary |
|---|---|---|---|---|---|
| Mobile portrait | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Mobile landscape | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Laptop | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Desktop widescreen | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

## 8. Free-form impressions

### Areas that feel elegant
- ____________________

### Areas that feel too "ontology-heavy"
- ____________________

### Navigation friction points
- ____________________

### Visual overload points
- ____________________

### Onboarding failures
- ____________________

---

## End — return findings to the curator-triage queue
