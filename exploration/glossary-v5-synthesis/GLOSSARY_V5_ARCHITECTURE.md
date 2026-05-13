# GLOSSARY_V5_ARCHITECTURE

**Project:** GLOSSARY-V5-SYNTHESIS — Task A
**Scope:** Propose the next-generation freestyle glossary structure. Twelve top-level sections, designed so a learner can progress from "I don't know any of this vocabulary" to "I can read tricks" while still letting an expert look up a single term in seconds.
**Constraints:** No canonical-ontology changes, no ADD-rule changes, no parser changes, no PassBack wording copied. The glossary remains a curator-authored surface; this document specifies architecture only.

---

## 0. North-star statement

The freestyle glossary's job, in one sentence:

> Teach a learner the **language** of freestyle footbag — body, mechanics, structure, symbolic — without forcing the learner through a curriculum, and without losing the lookup utility that a glossary fundamentally is.

This means the glossary is now **four surfaces in one document**:

1. A **movement-language primer** — read top-to-bottom for a teaching arc
2. A **symbolic-grammar guide** — explains the notation language used across the dictionary
3. A **compositional-learning system** — shows how modifiers transform core structures
4. A **traditional terminology reference** — A→Z lookup remains first-class

Each section below is designed to serve at least two of these surfaces at once. None of them collapses the four into a flat dictionary.

---

## 1. Top-level section structure

Twelve sections in two groups: **§1–§9 are the language primer** (read in order, build up); **§10–§12 are reference and pathways** (lookup, preservation, navigation). The boundary between primer and reference matters: a learner can finish §9 and feel "I can read tricks"; an expert can jump to §10 and look up a single term.

| # | Section | Group | Audience | Primary purpose |
|--:|---|---|---|---|
| 1 | Movement Language Primer | Primer | Newcomer + returning player | Frame the four-surface job; teach the universal trick skeleton (contact / uptime dex / midtime / downtime dex / catch) |
| 2 | Contact Surfaces | Primer | Newcomer | The body's vocabulary of stalls and kicks. Toe / clipper / inside / outside / heel / sole / knee / calf / back. Plus motion types: stall, kick, roll, transfer, wrap, walkover, rake, burger, pincher |
| 3 | Dexterities | Primer | Newcomer | The dex is the heart of freestyle. Direction (in / out), style (hippy / leggy), fullness (full / half), execution-window vocabulary (deep / thin / shoey / the / scoopy) |
| 4 | Timing Layers | Primer | Newcomer + intermediate | Uptime / midtime / downtime as the canonical clock of a trick. Sets are uptime components; downtime stalls; midtime no-plant breaks. The "attack" concept (how quickly the next phase starts) |
| 5 | Core Trick Structures | Primer | Newcomer + intermediate | The grammar's vocabulary of named base tricks: toe stall, clipper stall, ATW, orbit, legover, pickup, mirage, illusion, butterfly, osis, whirl, swirl. Each with notation + dex class + timing characterization + relatives. (Full draft: `CORE_TRICK_GRAMMAR_DRAFT.md`) |
| 6 | Modifiers & Operators | Primer | Intermediate | Modifiers treated as transformational operators on core structures, not glossary words. Body / set / timing / compositional / directional axes. Worked examples: ripwalk = stepping butterfly; mobius = spinning torque; blur = stepping paradox mirage. (Full draft: `MODIFIER_OPERATOR_FRAMEWORK.md`) |
| 7 | Symbolic Notation | Primer | Intermediate | The two notation layers (semantic and operational) explained as readable languages. Token roles, role-coloured rendering, the relationship between notation and trick structure. Pre-empts §10's reference utility by teaching how to *read* notation, not just look up tokens |
| 8 | Composition & Decomposition | Primer | Intermediate + advanced | Multi-trick combinations (strings, runs, combos, links, drills, mirrors, b2b, BSOS, marathon drills). The compositional grammar above the single-trick level |
| 9 | Movement Topologies | Primer | Advanced + curator | The observational symbolic-grammar layer. Topology groups (butterfly-wing-topology, whirl-rotational-topology, mirage-topology). Movement archetypes. Equivalence clusters. How tricks relate structurally even when they don't share a family |
| 10 | Traditional Glossary Reference | Reference | Any | Alphabetical lookup. Every term defined in §1–§9 has an entry here that points back to its primer location and links to its dictionary uses. Preserves the historical glossary's "I just want a definition" path |
| 11 | Community / Historical Vocabulary | Reference | Any | Folk names, deprecated terms, regional variants, era-specific slang. Preserves the cultural record; explicitly separated from the canonical-active vocabulary in §1–§9 |
| 12 | Learning Pathways | Pathways | Newcomer + curator | Curated reading orders. "If you're a beginner, read §1 → §2 → §3 → §5 then dictionary." "If you came from PassBack, read §6 → §7 → §9." "If you want to start reading notation, read §7 → §5 → §6 in order." Cross-links into modifier-family pages and progression chains |

---

## 2. Section-by-section rationale

For each section: **what it teaches, who it teaches, how it differs from today's glossary, how the symbolic-grammar layer integrates.**

### §1 — Movement Language Primer

**Teaches:** The four-surface framing (movement primer / symbolic guide / compositional learning / terminology reference) and the universal trick skeleton:

```
contact → uptime dex → midtime → downtime dex → catch
```

Every named trick fits this skeleton. The primer's first paragraph orients readers around the skeleton; subsequent sections fill in each slot.

**Audience:** Newcomers + returning players. Anyone who's never been taught the *shape* of a freestyle trick.

**Difference from today:** Today's glossary opens with run-quality terms (Tiltless / Guiltless / etc.). Those are useful but cognitively backwards — they describe difficulty *of* tricks before the reader knows what a trick is. The V5 primer leads with the skeleton, then teaches the parts that fill it.

**Symbolic integration:** The primer immediately introduces operational notation by example — `[clip] > op in dex > butterfly wing > ss clipper` — as a *reading of the skeleton*, not a separate notation language. The reader sees notation as natural from page 1.

**Full draft:** `MOVEMENT_LANGUAGE_PRIMER_DRAFT.md` (Task B).

### §2 — Contact Surfaces

**Teaches:** Where the body meets the bag. Surfaces (toe / clipper / inside / outside / heel / sole / knee / calf / back / head). Motion types (kick / stall / roll / transfer / wrap / walkover / rake / burger / pincher). Implicit assumptions ("toe op" / "clipper ss" defaults).

**Audience:** Newcomers. Anyone watching a video and unsure which surface a player just used.

**Difference from today:** Today's glossary mentions toe and clipper inline; never enumerates the surface vocabulary cleanly. The new section makes the surface taxonomy explicit and pairs each surface with the typical contact type.

**Symbolic integration:** Each surface gets its symbolic-grammar role-tag (e.g., `[clip]` as the entry surface; `clipper` as a landing surface token). Notation appears as supporting evidence of vocabulary, not as separate-track content.

### §3 — Dexterities

**Teaches:** The dex as the central freestyle primitive. Two directions (in / out). Two styles (hippy / leggy). Fullness (full / half). Execution-window vocabulary (deep / thin / shoey / the / scoopy / clean / sloppy / pulled / slurry / froggy / over-dexed).

**Audience:** Newcomer + intermediate. The first place a learner builds a mental model of what their leg should do.

**Difference from today:** Today's glossary calls a dex "a motion where the foot circles around the bag" and lists mirage as one. The new section structures the dex space along multiple axes (direction × style × fullness × execution quality) and explains how those axes combine. Readers leave the section able to *classify* a dex they see, not just recognize the word.

**Symbolic integration:** Hippy-in-dex topology cluster (mirage, smear, blur, atom-smasher, sumo, paradox-mirage) gets a forward reference in §9. The dex classification becomes the entry point into the topology layer.

### §4 — Timing Layers

**Teaches:** Uptime / midtime / downtime as the clock of a single trick. Set = uptime component. Catch = downtime contact. Midtime = the no-plant or hangtime moment between. The "attack" concept (how quickly the next phase fires). The interplay between timing and modifiers (uptime dexes vs downtime dexes).

**Audience:** Newcomer + intermediate.

**Difference from today:** Today's glossary defines set / uptime / midtime / downtime in compact prose. The new section formalizes them as a layered timing model — a four-beat clock that every trick uses. With the clock in place, modifiers in §6 can be classified by *which beat they transform*.

**Symbolic integration:** Movement archetypes from `symbolic-grammar-2` (`uptime-dex-downtime-butterfly`, `uptime-dex-downtime-osis`, `set-into-dex`) appear as worked examples. The timing model becomes the bridge to topology.

### §5 — Core Trick Structures

**Teaches:** The canonical named base tricks. Each entry: name + operational notation + dex class (hippy / leggy / hybrid) + timing characterization (uptime-dex-heavy, midtime-spin, downtime-stall) + body-mechanics note + structural relatives.

**Audience:** Newcomer + intermediate. The first time the reader sees a *trick* defined as a *composition of parts they already know*.

**Difference from today:** Today's glossary lists 12 foundational tricks (§10) as a flat grid of nouns. The new section gives each trick a small entry that puts it on the dex/timing/topology axes the previous sections introduced. The reader walks away seeing trick names as *structural shorthand for compositions*, not opaque vocabulary.

**Symbolic integration:** Each structure entry carries its symbolic group memberships (topology, family, archetype) inline. The "structural relatives" sub-section is anchored to the equivalence-cluster data in `symbolic-grammar-2`.

**Full draft:** `CORE_TRICK_GRAMMAR_DRAFT.md` (Task C).

### §6 — Modifiers & Operators

**Teaches:** The set of modifiers in the freestyle vocabulary, treated as **transformational operators on core structures.** Not glossary words to memorize; functions that take a base trick and produce a new one. The framework distinguishes:

- **Body modifiers** (paradox, spinning, ducking, diving, weaving, zulu, gyro, inspin) — transform the body's posture during the trick
- **Set modifiers** (pixie, fairy, atomic, quantum, nuclear, stepping, furious) — transform the uptime
- **Timing modifiers** (symposium, symple, muted, alpine, crispy) — transform which beat the trick fills
- **Compositional operators** (ss / op, in / out, fullness, sides) — directional and relational, not body-region
- **Directional modifiers** (inspin, in- prefix) — flip rotational direction

**Audience:** Intermediate. The reader who knows their dexes and base tricks and wants to understand how a "stepping butterfly" becomes a "ripwalk."

**Difference from today:** Today's glossary §3 modifier-reference subsection lists 6 modifiers as small `<dl>` entries. The new section is a framework: each modifier has its mechanic, its ADD contribution, its transformation rule, and worked examples on multiple base tricks. The reader learns operators, not just words.

**Symbolic integration:** Operational notation appears in every worked example. Modifier-family pages (`/freestyle/modifier/{spinning|paradox|ducking}`) are linked from each modifier's entry as the embodied teaching surface.

**Full draft:** `MODIFIER_OPERATOR_FRAMEWORK.md` (Task D).

### §7 — Symbolic Notation

**Teaches:** The two notation languages and how to read them.

- **Semantic notation** (Jobs notation): trick identity as a sentence of structural roles. `Stepping Butterfly`, `Spinning Paradox Whirl`.
- **Operational notation**: trick mechanics as a token sequence with entry bracket, sequence operators, side flags, direction flags. `[clip] > op in dex > butterfly wing > ss clipper`.

Token roles + role colours + the reading flow (left-to-right structural sentence). The reader learns to *read* notation, not look up tokens.

**Audience:** Intermediate. The reader who has seen `[clip] > op in dex > butterfly wing > ss clipper` somewhere on the site and wants to know what it means.

**Difference from today:** Today's glossary §8 has three worked notation examples; §9 has a token-reference dictionary with no examples. The new section unifies them: every token gets a worked example, every example demonstrates the language as a whole.

**Symbolic integration:** This section is the symbolic grammar's home in the glossary. It explains the system without becoming parser documentation. The glossary teaches `the language of operational notation`; the parser documentation (curator-only, not surfaced here) explains how the tokenizer parses it. The boundary is clean: readers learn to read; curators handle the grammar.

### §8 — Composition & Decomposition

**Teaches:** Multi-trick combinations. Strings, runs, combos, links, drills, mirrors, b2b, BSOS, marathon drills, rewinds, multipliers. The grammar of *playing* freestyle, not just *naming* tricks. Plus decomposition concepts: a single trick name often *decomposes* into a structural reading (`Phoenix = Pixie Ducking Butterfly`; `Blur = Stepping Paradox Mirage`).

**Audience:** Intermediate + advanced.

**Difference from today:** Today's glossary §5 lists run / combo / shuffle / link in compact prose. The new section formalizes the compositional grammar above the single-trick level and introduces decomposition as the inverse operation — taking a folk name and reading out its structural composition.

**Symbolic integration:** Decomposition examples cite the equivalence-cluster data (`symbolic-grammar-2`) and the 8-layer representation model (`NOTATION_LAYER_STRATEGY.md`). The reader learns that `gyro torque` is a *reading of* mobius, not a different trick.

### §9 — Movement Topologies

**Teaches:** The observational symbolic-grammar layer — how tricks share *structure* even when they don't share a family. Topology groups (butterfly-wing-topology, whirl-rotational-topology, mirage-topology). Movement archetypes (uptime-dex-downtime-butterfly). Equivalence clusters (hippy-in-on-mirage). The point is *structural neighbourhood*: if you know one member of a topology, you have a foothold on the rest.

**Audience:** Advanced + curator. The reader who's already comfortable with §1–§8 and wants the observational lens that the symbolic-grammar layer provides.

**Difference from today:** Today's glossary §13 ships six "connective panels" for paradox / symposium / ducking / spinning / whirl / pixie. The new section is a fuller treatment: every topology group + archetype gets a dedicated entry, with cross-links to the component-view browse (`/freestyle/tricks?view=component`) when that view ships.

**Symbolic integration:** This is the observational layer's home. Layer-attribution badges and "observational" framing are explicit throughout. The section ends with explicit boundary: "topology relationships are observational, not canonical; canonical family classifications live in the dictionary."

### §10 — Traditional Glossary Reference

**Teaches:** Every term defined in §1–§9 (and any term in §11) gets an alphabetical lookup entry. Each entry: short definition + cross-link to its primer location + cross-link to representative tricks in the dictionary.

**Audience:** Anyone who knows what they're looking for. Returning experts. Mid-watching-a-video lookups.

**Difference from today:** Today's glossary is structured almost entirely as §10 already (a flat reference). The V5 §10 is a *parallel* surface: the primer is the teaching arc, §10 is the lookup arc. A term defined in §6 as a modifier-operator also appears in §10 with a one-line definition and a "Learn more →" deep-link to §6.

**Symbolic integration:** Each entry carries its `#term-{slug}` anchor (already shipped per `glossaryAnchors.ts`). The resolver continues to prefer §13-style panel anchors for terms with rich panels, falling back to §10 lookup anchors otherwise.

### §11 — Community / Historical Vocabulary

**Teaches:** The folk vocabulary that lives outside the canonical-active set. Deprecated terms (e.g., `Blurry Butterfly` for what is now called Ripwalk). Regional / era variants. Historical names from the 80s–90s. PassBack-specific vocabulary not yet promoted to canonical.

**Audience:** Cultural memory; curators reviewing folk-vs-canonical decisions; advanced readers who encounter old vocabulary in videos.

**Difference from today:** Today's glossary doesn't have a dedicated "folk and historical" section. Community vocabulary appears scattered across §3 alongside canonical terms. The V5 §11 separates them deliberately: canonical-active stays in §1–§10; folk / historical lives here with explicit deprecation status and provenance notes.

**Symbolic integration:** When a folk term has a canonical-active equivalent, the entry shows the deprecation arrow and the canonical replacement. When it has no equivalent (era-specific slang), it stays in §11 as a cultural reference. The representation-layer model's layer 5 (folk names) is the conceptual home.

### §12 — Learning Pathways

**Teaches:** Curated reading orders for different audiences. The glossary is a long document; pathways tell a reader *which sections to read in what order* based on their starting point.

**Audience:** Newcomers (the most-deferred-to pathway); curators (when they want to design a learning sequence for a new player); PassBack readers (porting their mental model into IFPA / symbolic).

**Difference from today:** Today's glossary has no pathway concept. The V5 §12 surfaces 4–6 named pathways:

- **Newcomer path** — §1 → §2 → §3 → §5 → dictionary by family
- **PassBack-port path** — §6 → §7 → §11 (cross-reference) → §9
- **Notation-first path** — §7 → §5 → §6 in tight loop
- **Curator path** — §9 → §11 → §10 ↔ §6 for vocabulary curation
- **Modifier-pedagogy path** — §6 → modifier-family page → §9
- **Topology-explorer path** — §9 → component view → §5 cross-references

**Symbolic integration:** Each pathway is a chain of section links + dictionary deep-links + modifier-family-page deep-links. The pathway concept is the discoverability layer over the entire educational subsystem.

**Full draft:** `GLOSSARY_V5_NAVIGATION.md` (Task H).

---

## 3. What stays the same as today

The V5 architecture **preserves**:

- All canonical-active terminology defined in today's glossary
- The §13 connective panels (paradox / symposium / ducking / spinning / whirl / pixie) — they live in §9 in the new structure
- The `id="term-{slug}"` anchor convention (per `glossaryAnchors.ts`)
- The two-notation-layer split (semantic vs operational), already cleanly separated in code
- The four-layer glossary architecture (canonical / educational / symbolic / operational) from `glossary-synthesis-1`
- The deep-link resolver (`glossaryHrefForTerm`) — extended to §10 entries as they're authored
- The traditional lookup utility (§10 inherits the alphabetical-search role)
- The observational-layer separation rule (badges + footers on §9 and §11)

**Nothing in V5 forces a re-author of canonical glossary content.** Each section is additive; existing content migrates into its V5 home, gets a forward-reference from §10 lookup, and is preserved.

---

## 4. What's deliberately NOT in the architecture

The architecture explicitly **does not** include:

- A pure A-Z dictionary as the primary entry point. §10 supports lookup, but the page lead is §1 (the primer).
- A tag browser. Tags are dictionary-side, not glossary-side.
- A parser specification. §7 explains the language; the tokenizer's grammar stays in `operationalNotationRendering.ts`.
- An ontology manifest. The dictionary owns canonical structure; the glossary explains vocabulary.
- A theorem document. The primer is teachable prose, not formal logic.
- A database dump. Glossary content stays curator-authored.

These exclusions are load-bearing. Each one represents a way the glossary could collapse into a single-surface document and lose the four-surface utility.

---

## 5. Pedagogical sequencing rationale

Why §1–§9 in this order:

1. **Skeleton first** (§1) — the reader needs a frame before vocabulary
2. **Surfaces** (§2) — where the body meets the bag; concrete + immediate
3. **Dexterities** (§3) — the central primitive; the reader's body-knowledge cornerstone
4. **Timing** (§4) — the clock; lets §5 entries be characterized by which beat they emphasize
5. **Core structures** (§5) — named tricks as compositions of §2–§4 vocabulary
6. **Modifiers as operators** (§6) — transformations on §5 structures
7. **Notation** (§7) — the language for writing §1–§6
8. **Composition above tricks** (§8) — multi-trick grammar
9. **Topologies** (§9) — the observational lens over all of the above

Each section builds on every prior section. The reader who finishes §9 has the full toolkit; the reader who stops after §5 has read tricks; the reader who skims §1 and jumps to §10 has the traditional glossary they expected.

---

## 6. Multi-surface utility verified

| Surface | Sections that primarily serve it |
|---|---|
| Movement-language primer | §1, §2, §3, §4, §5, §6, §8 |
| Symbolic-grammar guide | §7, §9 |
| Compositional learning | §5, §6, §8 |
| Traditional terminology reference | §10, §11, with primer back-references |

The architecture passes the multi-surface test: every surface is served by at least two sections, and no section serves only one surface.

---

## 7. Open design questions (curator review)

Items the architecture surfaces but does not decide:

1. **Should §10 surface ALL primer terms, or only those without primer entries?** Tradeoff: full A-Z is conceptually clean but duplicates the primer's content; primer-only-when-not-in-primer is leaner but harder to scan alphabetically. Recommend: full A-Z with short entries pointing back to the primer location for terms with primer entries; full-text definition only for terms whose only home is §10/§11.
2. **§11 deprecation policy.** When does a folk term move from §3 (canonical) to §11 (historical)? The Ripwalk / Blurry Butterfly precedent (pt11 ruled Ripwalk canonical, Blurry Butterfly alias). Curator track owns the decisions; the architecture provides the surface for them.
3. **Should §12 pathways be interactive (clickable progress indicators), or static (read-only curated paths)?** Static is the smaller scope; interactive is a future enhancement. Recommend: static for V5; revisit after observed usage.
4. **PassBack-port pathway** (§12) — should it acknowledge PassBack by name, or be framed neutrally? Tradeoff: explicit credit acknowledges the source; neutral framing avoids implicit endorsement. Recommend: neutral framing with a "If you came from another glossary, this path may help" header.

---

## 8. Constraints honoured

- No canonical-ontology changes
- No ADD-rule changes
- No parser changes
- No PassBack wording copied (pedagogical structure synthesized, prose original)
- Traditional glossary functionality (§10) preserved
- Symbolic-grammar layer integrated as an additive lens, not a replacement
- Observational-layer separation preserved on §9 and §11
- Migration is curator-led; no auto-import from PassBack or symbolic-grammar-2 CSVs into authoritative content

---

## 9. Cross-references

- `PASSBACK_SYNTHESIS_AUDIT.md` — strongest pedagogical structures from PassBack, weaknesses identified, opportunities mapped
- `MOVEMENT_LANGUAGE_PRIMER_DRAFT.md` — Task B (full §1 draft)
- `CORE_TRICK_GRAMMAR_DRAFT.md` — Task C (full §5 draft)
- `MODIFIER_OPERATOR_FRAMEWORK.md` — Task D (full §6 draft)
- `TRADITIONAL_GLOSSARY_PRESERVATION_PLAN.md` — Task E (§10 + §11 + coexistence)
- `SYMBOLIC_GLOSSARY_INTEGRATION.md` — Task G (how §7 + §9 fit)
- `GLOSSARY_V5_NAVIGATION.md` — Task H (full §12 draft + navigation strategy)
- `GLOSSARY_V5_FUTURE_CAPABILITIES.md` — Task I (capabilities unlocked)
- `exploration/dictionary-symbolic-card/NOTATION_LAYER_STRATEGY.md` — the 8-layer representation model the §6, §7, §8 sections lean on
- `exploration/glossary-synthesis-1/GLOSSARY_ARCHITECTURE_V4.md` — the 4-layer architecture this V5 builds on
- `src/services/glossaryAnchors.ts` — the deep-link resolver each section's anchors flow through
- `exploration/symbolic-grammar-2/` — topology / archetype / equivalence-cluster source data for §9

---

*End of GLOSSARY_V5_ARCHITECTURE.md*
