# Atlas to Glossary — Integration Plan (planning only)

Read-only planning exercise. Nothing here is implemented. No glossary copy is
authored, no production code is changed, the Atlas is unchanged, the glossary is not
redesigned. This document decides *where* a small number of Atlas ideas would earn
their place in the existing public glossary, and, just as firmly, what stays in
exploration forever.

## The one fact that shapes the whole plan

Two things are already true, so the integration is small by construction:

1. The Atlas already ruled on itself. Its harvest document
   (`freestyle/research/movement-atlas/DOCTRINE_HARVEST_AND_GLOSSARY_PROPOSAL.md`) sorts
   every conclusion into four bins: PUBLIC-NOW (rows 1 to 7), PUBLIC-CAUTIOUS (rows
   8 to 9), INTERNAL (rows 10 to 12), RESEARCH-ONLY (rows 13 to 15). Its production
   handoff (`PRODUCTION_HANDOFF.md`, Lane D) names the machinery that must never
   leave exploration. This plan does not re-derive that ruling; it operationalizes
   it against the live template.

2. The live glossary already teaches every PUBLIC-NOW concept. The ten collapsible
   chapters already carry movement-language framing, structure-over-naming,
   names-as-labels, many-names-one-structure, composition, and the ADD-as-count
   scoring law. There is no missing chapter to build.

The consequence: the harvest is not new construction. It is one genuinely new
illustration, one carefully worded Advanced expander, and three small wording
replacements, all inside chapters that already exist. A beginner should not notice
the change. An advanced reader who opens the Advanced blocks finds a second, coherent
layer. That is the success criterion, met by restraint rather than addition.

The single highest-value move is the "eight from three" one-dex figure: the eight
foundational one-dex toe tricks are exactly the eight combinations of three yes-or-no
choices the Dexterities chapter already teaches. The Atlas calls this structure a
cube; the glossary must show the eight named tricks and the three choices and never
say the word cube. The pedagogy is public; the formalism is not.

---

## A. Glossary integration plan (the shape of the whole thing)

Principle: harvest the *conclusions*, never the *scaffolding*. A conclusion is
eligible only if it helps a player understand or communicate, is stable, and carries
no mathematical apparatus. This is the Atlas's own dividing line, adopted verbatim.

Three tiers of action, smallest footprint first:

- **Tier 1, wording refinements inside existing prose.** Where the Atlas states a
  PUBLIC-NOW idea more cleanly than the current sentence, replace the weaker sentence.
  Do not add length. Targets: the object-separation intro (Chapter 1), the
  "foundational not primitive" framing of the twelve atoms (Chapter 2), and one
  careful coverage sentence (Chapter 10 or the new figure's caption).

- **Tier 2, one new illustration.** The "eight from three" one-dex figure, as a
  collapsed Advanced expander inside the Dexterities chapter. This is the only new
  drawn or tabular graphic the plan recommends.

- **Tier 3, one new Advanced expander of prose.** "What the notation leaves out"
  inside the Structural Analysis chapter, phrased positively, never as a criticism of
  the notation.

Everything else the Atlas produced is either already present (integrate-in-place, no
action) or research-only (deliberately excluded). No new chapter. No new page. No new
navigation. No Atlas link from the glossary.

---

## 1. Where should each Atlas concept appear? (per-concept classification)

Classifications: **integrate directly** (already in the glossary or a one-sentence
in-place refinement), **Advanced expander**, **illustration only**, **Learn More
page**, **keep inside Atlas**.

| Atlas concept | Bin | Classification | Where / why |
|---|---|---|---|
| Freestyle is a movement language, not a list of names | PUBLIC-NOW | integrate directly (present) | Chapter 9 "Vocabulary relationships" and Chapter 1 "five kinds of object" already frame this. No action beyond optional wording. |
| Structure is more fundamental than naming | PUBLIC-NOW | integrate directly (present) | Chapter 9 and the ADD provenance material carry it. No action. |
| Names are labels on structures; many names, one structure | PUBLIC-NOW | integrate directly (present) | Chapter 9 "Pure aliases" and "Structural compression" plus the distinctions table. No action. |
| A trick is a composition of recurring events (set, dex, surface) | PUBLIC-NOW | integrate directly (present) | Chapter 2 and Chapter 6. No action. |
| ADD is the count of scored components; a kick scores one less | PUBLIC-NOW | integrate directly (present) | Chapter 8 ADD accounting already states this as the scoring law. No action. |
| The eight one-dex toe tricks come from three yes-or-no choices | (pedagogy of a RESEARCH-ONLY object) | **illustration only, Advanced expander** | New figure in Chapter 4 Dexterities. The three choices are already taught there; the figure makes them concrete. Machinery vocabulary forbidden. This is the plan's headline item. |
| The notation is a scoring-and-identity shorthand, not a full physical description | PUBLIC-CAUTIOUS | **Advanced expander** | New "What the notation leaves out" block in Chapter 8, worded positively. |
| The named vocabulary covers only part of the describable space | PUBLIC-CAUTIOUS | integrate directly, one careful sentence | One sentence, no fraction, no claim that unnamed forms are real tricks. Lands in the figure caption or Chapter 10. |
| Match tricks by structural formula, not by name string or notation | INTERNAL | keep inside Atlas / curator QC | This is a dedup and promotion rule, not visitor teaching. Not glossary material. |
| Grammar-describable is not the same as physically performable | INTERNAL | keep inside Atlas (as a rendering guardrail) | Never stated to visitors, but it is the reason the figure shows only real named tricks and makes no "possible or impossible" claim. |
| The dex cube, hypercube, fiber bundle, lattice, symmetry group, handoff state, topology, monodromy | RESEARCH-ONLY | **keep inside Atlas** | Named machinery. Never public, never doctrine. See Deliverable E. |
| The uniform-hypercube / orthogonal-taxonomy result (families are imposed, not natural) | RESEARCH-ONLY | keep inside Atlas | Elegant, and explicitly parked by the Atlas. Not public. |
| Any count of possible or unnamed movements | RESEARCH-ONLY | keep inside Atlas | No such number reaches a public surface. |

Reading of the table: five PUBLIC-NOW rows need no work because the glossary already
teaches them. One figure and one expander are new. One sentence is a careful
addition. Everything below the mid-line is excluded on purpose.

---

## 2. Visual opportunities

The glossary today has exactly one true drawn diagram, the timing-clock SVG in
Chapter 5, and otherwise teaches through CSS tables, DL-based histogram bars, and
color-coded notation tokens. The symbolic-restraint doctrine governs additions: no
token soup, no parser or tree visuals, no interaction-heavy widgets, replace rather
than add. Against that bar, most of the brief's candidate visuals do not earn a new
graphic, because prose or an existing table already teaches them well.

| Candidate visual | Verdict | Educational purpose | Audience | Size | Static/interactive | Expandable/always | Dependencies | Complexity |
|---|---|---|---|---|---|---|---|---|
| The eight one-dex toe tricks from three choices | **Build** | Show that eight familiar names are one structure under three binary choices; make "structure precedes naming" tangible | Intermediate reader who knows the eight names but not that they are systematic | Small: two 2-by-2 groupings by landing side, roughly the footprint of the timing-clock figure | Static | Expandable, collapsed by default | The eight canonical trick names and the three dex axes, all already in Chapter 4; reuses the `glossary-timing-clock-figure` or a `moves-table` primitive | Medium: one SVG or one styled table, no new CSS design, no JS |
| Operator decomposition (base + operator = trick) | Do not build; strengthen text | Show a trick as base plus stacked operators with ADD | Intermediate | n/a | n/a | n/a | Already served by the Chapter 8 ADD weight tables and the Chapter 9 decomposition table | Reuse existing tables; no new graphic |
| Movement language versus trick names | Do not build | The vocabulary-relationships table (Chapter 9) already is the visual | All | n/a | n/a | n/a | Present | none |
| Notation versus movement | Build as a small table inside the prose expander | Two columns: what the notation records, what it deliberately omits (handedness, which leg) | Advanced | Small: a `glossary-layer-contrast`-style two-column table | Static | Inside the Chapter 8 Advanced expander | Reuses the layer-contrast table primitive | Low |
| Structural identity versus aliases | Do not build | The compression ladder and distinctions table (Chapter 9) already teach it | Intermediate | n/a | n/a | n/a | Present | none |
| Movement composition | Do not build | Timing clock plus the composition chapter already cover it | All | n/a | n/a | n/a | Present | none |
| Any hypercube, lattice, symmetry, or coordinate diagram | Never | Would import banned machinery | n/a | n/a | n/a | n/a | n/a | Excluded |

Net: one new illustration (the eight-from-three figure) and one small supporting
table (notation keeps versus omits) inside a prose expander. No other new graphics.

---

## 3. The movement cube (the one-dex eight-trick figure)

Recommendation: include it, as a collapsed Advanced expander inside the **Dexterities
chapter (Chapter 4)**. Not the notation page (the figure is about movement, not
notation). Not a new Movement Language page (a page for one figure is over-build).
Not Atlas-only (this is the single most teachable thing the Atlas produced).

Why Chapter 4: the figure's three choices are precisely the three ideas that chapter
already teaches. The Atlas generates the eight tricks from (1) which side the leg
circles, same or opposite; (2) which direction it circles, in or out; (3) which side
the bag lands on, same or opposite. Chapter 4 already teaches relative side, direction,
and the SAME/OP distinction. The figure is the payoff of the chapter, not a new topic.

Exact placement and behavior:

- **Where:** a new `<details>` Advanced expander at the end of the Dexterities
  chapter, after the direction and side concepts are established, reusing the
  `[advanced]` badge pattern already used in Chapter 8.
- **Collapsed by default:** yes. Consistent with every chapter and every Advanced
  block on the page. A beginner never has to open it.
- **The eight tricks shown:** around-the-world, pickup, orbit, legover (bag lands
  same side) and pixie, mirage, fairy, illusion (bag lands opposite side), each with
  its two-choice label. All eight are existing canonical tricks with detail pages, so
  each name can link to its trick page.
- **Surrounding explanatory text (intent, not final copy):** a lead sentence that the
  eight most basic one-dex toe tricks are exactly the eight combinations of the three
  choices just met, and a closing sentence that every other one-dex trick is one of
  these eight done onto a different landing surface. Optionally one plain-language note
  that reversing the direction pairs them up (around-the-world with orbit, mirage with
  illusion, pixie with fairy, pickup with legover). That pairing is the symmetry-group
  finding stated with zero group vocabulary.
- **How much mathematics is exposed:** none. No "cube," no "vertices," no coordinates,
  no group, no count of anything. Three choices, eight named tricks, one sentence about
  reverse pairs. If a single word of apparatus would be needed to explain it, it does
  not ship.

Guardrail baked in: the figure shows only real, named tricks and makes no claim about
possible or impossible movements, so the "grammar-describable is not performable"
boundary is respected by construction, never stated.

---

## 4. Higher-dimensional research (each evaluated separately)

The brief is right to make me argue for each rather than wave them in together.

| Item | Verdict | Reason |
|---|---|---|
| Hypercube | Research only | Named machinery on the Atlas ban list. No public form exists that is not the apparatus itself. |
| Triple-dex matrix | Research only | It is a curator dedup instrument (it decided that two "same-side" submissions were redundant wording). It makes no pedagogical claim a player needs. |
| Lattice | Research only | The taxonomy-lattice result is parked by the Atlas. The separate surface-lattice base map is validated but is internal addressing, not a teaching object. |
| Symmetry groups | Research only as a *group*; the concrete reverse-pairs may appear | The Klein-four framing stays in exploration. The one usable crumb is the direction-flip pairing of the eight named tricks, which can appear inside the figure caption in plain words with no group vocabulary. |
| Atlas coordinate system / fiber bundle | Research only as a *formalism*; the *principle* is already public | "Identity is the structure, names are labels" is PUBLIC-NOW and already in Chapter 9. The bundle formalism that implements it never ships. |

None of these belongs in the public glossary or even in an advanced glossary expander,
with the single narrow exception of the reverse-pairs sentence, which is a fact about
eight named tricks rather than an exposure of the symmetry group.

---

## 5. New glossary topics (pages)

Recommendation: create none. Each candidate fails the value-exceeds-complexity test.

- **Movement Language:** already carried by Chapter 9 vocabulary relationships, and in
  a real sense the whole glossary is the movement language. A dedicated page would
  duplicate and fragment. No.
- **Structural Identity:** already carried by Chapter 9 (pure aliases, structural
  compression, the distinctions table, and "tracking is not canonization" in Chapter
  10). No.
- **Movement Space:** this is the coordinate, cube, and hypercube framing, which is
  research only. A page named this would exist only to host machinery. No.
- **Symmetry:** research only. No.

Zero new pages is the museum-curator answer and is what keeps the glossary feeling
unchanged to a beginner.

---

## 6. Existing pages, strengthened without lengthening (replace, do not add)

| Chapter | Opportunity | Action (replace, not add) |
|---|---|---|
| 1 Reading the Dictionary | The "five kinds of object" intro can borrow the Atlas's crisp "names are labels attached to structures" to sharpen why the objects are kept separate | Replace one framing sentence; net length unchanged |
| 2 Movement Basics | The twelve atoms should read as foundational anchors, not as irreducible primitives (the Atlas records, internally, that atoms are themselves compositions) | Prefer "foundational" or "anchor" over "primitive" where the current copy over-claims irreducibility; wording only |
| 4 Dexterities | Hosts the eight-from-three figure (item 2 and 3 above) | Add one collapsed Advanced expander; the only structural addition in the plan |
| 5 Timing and Sets | Already strong; timing clock is the model figure | No change |
| 6 Operators and Modifiers | Decomposition is already served by tables | No change |
| 8 Structural Analysis | Add the "What the notation leaves out" Advanced expander (notation-is-shorthand, PUBLIC-CAUTIOUS), positively worded | One new collapsed `[advanced]` expander with a small two-column table |
| 9 Runs and Sequences | Vocabulary relationships already strong; the "match by formula not name" idea is INTERNAL and must not enter visitor copy | No change |
| 10 Reference and History | Optional home for the single careful coverage sentence, if it does not live in the figure caption | At most one sentence; no fraction, no unnamed-tricks claim |

The pattern throughout is replacement or a single collapsed expander, never a new
inline heading in an already dense chapter.

---

## 7. Progressive-disclosure ladder

The brief's ladder maps cleanly onto the existing default-collapsed chapters, because
the glossary already is a progressive-disclosure instrument (native details and
summary at chapter, concept, and reference depth, with a deep-link opener). The Atlas
sits past the end of the public ladder and is never linked from it.

```
Chapter 3  Contact Surfaces and Delays      (surface, delay)
   |
Chapter 4  Dexterities                       (dexterity)
   |         ...optional Advanced expander: eight-from-three figure
Chapter 6  Operators and Modifiers           (operators)
   |
Chapter 8  Structural Analysis               (notation)
   |         ...optional Advanced expander: what the notation leaves out
Chapter 9  Runs and Sequences                (movement language: how names relate)
   |
  (cliff)
   |
Atlas research                               exploration only, NOT linked from the glossary
```

Two rules make the optional layer feel optional:

1. The two harvested Advanced blocks are collapsed by default and badged advanced, so
   the required path never passes through them.
2. There is no "read more in the Atlas" link anywhere on the public page. The deeper
   layer the advanced reader discovers is the set of Advanced expanders, not a doorway
   into exploration. The Atlas is a source for the glossary, never a public destination.

---

## 8. Production doctrine: safe versus research

**Safe to inform public copy (may appear, worded plainly):**

- Freestyle is a movement language built from a small set of recurring components.
- Structure is more fundamental than the name; difficulty follows structure.
- Names are labels on structures; several names can point at one structure.
- A trick is a composition of a set, one or more leg circles, and a landing surface.
- ADD is the count of the scored components; a kick scores one less than the matching
  held ending.
- The eight foundational one-dex toe tricks are the eight combinations of three
  yes-or-no choices (shown as named tricks, no apparatus).
- The notation is a compact scoring-and-identity shorthand that deliberately omits some
  physical detail (worded positively, PUBLIC-CAUTIOUS).

**Must be evaluated before any exposure, and here excluded, because each depends on
hypercubes, topology, fiber bundles, hidden state, monodromy, state transport, or
unresolved grammar:**

- The dex cube named as a cube, and the two-dex six-cube (whose free-product form the
  Atlas falsified to an upper bound, not a count).
- The hypercube and any "power of the cube" framing.
- The symmetry group as a group (the Klein-four and dex-swap symmetries).
- The fiber-bundle coordinate formalism and any name-free address system.
- The handoff-state model, and its monodromy and state-transport machinery, which the
  Atlas validated as incomplete and not recoverable from notation.
- The uniform-hypercube and orthogonal-taxonomy results.
- Any count of possible, impossible, or unnamed movements, and any claim that a formula
  is physically realizable.

The test for anything not on either list: it goes public only if it helps a player
understand or communicate, is stable, and carries no mathematical scaffolding.
Elegance is not a reason to promote a model.

---

## B. Page-by-page recommendation

See section 6 for the full table. In one line each:

- Chapter 1: sharpen the object-separation sentence (wording).
- Chapter 2: "foundational" over "primitive" for the atoms (wording).
- Chapter 3: no change.
- Chapter 4: add the collapsed eight-from-three figure (the one structural addition).
- Chapter 5: no change.
- Chapter 6: no change.
- Chapter 7: no change.
- Chapter 8: add the collapsed "what the notation leaves out" expander with a small
  two-column table.
- Chapter 9: no change (the INTERNAL formula-matching rule stays out of visitor copy).
- Chapter 10: optionally host one careful coverage sentence.

## C. Visual integration plan

See section 2 for the full table. Summary:

- Build one new illustration: the eight one-dex toe tricks from three choices,
  collapsed Advanced expander in Chapter 4, static, reusing the timing-clock figure or
  a moves-table primitive, no new CSS design, no JS.
- Build one small supporting table: notation keeps versus omits, inside the Chapter 8
  Advanced expander, reusing the layer-contrast table primitive.
- Build nothing else. Operator decomposition, movement-language-versus-names,
  structural-identity, and composition are already taught by existing prose and tables.

## D. Implementation roadmap, ordered by educational value

Each item is independently shippable, reversible, and built from existing template and
CSS primitives. None blocks another. All are future work, gated on maintainer approval;
this plan authorizes nothing.

1. **The eight-from-three figure in Chapter 4.** Highest value: it makes "structure
   precedes naming" tangible using tricks the reader already knows, and it is the only
   place the Atlas earns a new graphic. Self-contained.
2. **The "what the notation leaves out" Advanced expander in Chapter 8.** Second: it
   closes a genuine honesty gap (the notation is a shorthand) that the current chapter
   does not state, and it is the PUBLIC-CAUTIOUS item most worth stating carefully.
3. **Wording refinements.** Third: the object-separation sentence (Chapter 1), the
   foundational-not-primitive framing of the atoms (Chapter 2), and the single careful
   coverage sentence. Lowest risk, smallest footprint, pure replacement.

Anything past step 3 is a signal of scope creep and should be refused.

## E. Atlas concepts that must never leave exploration

Verbatim from the RESEARCH-ONLY bin and the production handoff's research-only lane:

- The geometric and algebraic models: the dex cube as a cube, the two-dex six-cube,
  the hypercube, the fiber bundle, the surface and taxonomy lattices as lattices, and
  the symmetry groups as groups.
- The handoff-state formalism and its monodromy and state-transport machinery
  (validated as incomplete and not notation-recoverable).
- The topology framing in every form.
- The uniform-hypercube and orthogonal-taxonomy taxonomy results.
- Any count of possible, unnamed, or impossible movements, and any realizability claim.
- The falsified and withdrawn claims (the free-product six-cube; notation can
  reconstruct a movement; the universe partitions into natural families), which stay in
  exploration as the record of what was tested and rejected, cited only by future
  research.

The banned public vocabulary, as a hard list: hypercube, fiber bundle, topology,
monodromy, movement-state formalism, and the word cube used for the eight-trick figure.
Public copy uses none of them and makes no claim about every possible or impossible
trick.

---

## What this plan deliberately does not do

- It does not create a Movement Language, Structural Identity, Movement Space, or
  Symmetry page.
- It does not link the glossary to the Atlas.
- It does not add a Simple versus Deep Dive toggle (the native details nesting already
  delivers progressive disclosure).
- It does not expose any count, coordinate, or model.
- It authors no final glossary copy; the sentences quoted above are intent, to be
  drafted and reviewed if and when a build slice is approved.
