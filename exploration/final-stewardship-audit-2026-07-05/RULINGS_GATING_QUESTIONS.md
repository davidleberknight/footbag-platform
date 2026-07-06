# Rulings — The Four Gating Questions

James ruled all four gating questions from HARD_QUESTIONS_FOR_JAMES.md. Recorded
verbatim with consequences. These unblock the queued glossary work; nothing is
implemented by this document.

## 1. Doctrine papers — private, feeding public essays

> First-edition doctrine papers remain internal working scholarship and review
> material. Public-facing doctrine will be published only as edited essays or concise
> explanatory notes, not as raw Red packets or unresolved adjudication documents.

Split: private/internal = full doctrine papers, Red packets, unresolved scoring
debates, detailed source disagreements, operator/ruling uncertainty, "why X over Y"
where it would confuse visitors. Public later = polished essays derived from them
(Name vs Structure, The Mirror Law, The Frontier, How We Know What We Know), short
method notes, honest unresolved-frontier notes after editorial cleanup.

Consequence: essays carry their evidence inside themselves in prose; they never cite
repo paths or paper titles as if readers can follow the link.

## 2. Foundational Bases — physical learner gateways, not graph hubs

> Foundational Bases are physical learner gateways, not graph-theory hubs. The
> dependency graph may identify Core Concepts such as Dexterity and Composition, but
> those remain glossary concepts, not Foundational Bases. Foundational Bases are the
> tricks or positions a player physically learns and repeatedly returns to.

Two categories, kept distinct forever:
- **Core Concepts** (glossary conceptual hubs): Dexterity, Direction, Side, Set,
  Operator, Composition, Cross-body, Same-side/opposite-side, Additive scoring.
- **Foundational Bases, ruled V1.1 list (six):** Toe Stall, Clipper Stall, Around the
  World, Mirage, Butterfly, Osis.
- Held for later (after the voice and page pattern prove themselves): Rake, Pendulum,
  Inside Stall, Whirl, Pickup/Legover.

This ruling supersedes the dependency graph's hub-derived Base recommendation. The
graph's hub/gateway analysis remains a private design input; its vocabulary never
reaches the UI.

## 3. Glossary migration — in-place strangler, per-entry collapsibles first

> Glossary V2 migrates in place, one section at a time, using the existing glossary as
> the public route. No parallel V2 glossary is built. The first implementation slice is
> a small section-level conversion with per-entry collapsibles only; global depth
> controls, essays, and broader restructuring wait until the pattern is proven.

First slice = the atoms / core vocabulary section only. No global Simple/Deep/Expert
toggle at first — per-entry expanders (Definition line; How it relates; What it
reveals; Explore) prove content and interaction without committing to a mode system.
Operational note: the slice updates that section's pinned tests in the same change and
touches nothing else.

## 4. Voice QA — James owns the voice

> James is the final voice QA owner for Glossary V2. Claude/Opus may draft entries and
> identify structural issues, Red may validate doctrine, and Dave may review
> implementation, but no Glossary V2 prose becomes canonical until James approves that
> it is physically clear, plain-English, structurally accurate, and worth the reader's
> attention.

The four per-entry tests (the voice standard, to be folded verbatim into the
architecture's voice-standard section when the pilot revisions are folded in):
1. Physical first — a player can feel what the movement is.
2. Plain English — no doctrine jargon unless introduced.
3. One useful relationship — the reader learns what it sits next to.
4. One earned insight — only if the entry truly deserves it.

Target reading experience: "Oh, that's what it is." / "Oh, that's what it connects
to." / "Oh, that changes how I see freestyle."

## What these rulings unblock (not started; recorded only)

- Fold the accepted pilot revisions + these rulings into
  `exploration/glossary-v2-architecture/ARCHITECTURE.md`, and create the single
  INSIGHT_REGISTRY.md (Opus, one sitting).
- Author tranche 2 in Markdown (Dexterity, Osis, miraging, whirling, stepping,
  paradox, blurry) — Dexterity and Osis now explicitly Core Concept and Foundational
  Base respectively, per ruling 2.
- The essays proceed as derived public artifacts under ruling 1's citation constraint.
- Slice 1 implementation shape is fixed by ruling 3; it waits for content per the
  phasing.
