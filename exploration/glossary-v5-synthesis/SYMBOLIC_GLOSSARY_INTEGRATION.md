# SYMBOLIC_GLOSSARY_INTEGRATION

**Project:** GLOSSARY-V5-SYNTHESIS — Task G
**Scope:** Define how the symbolic-grammar layer enters the V5 glossary — what symbolic content is *exposed* (because it aids comprehension) and what stays *hidden* (because it's curator-internal or parser-side). The glossary should explain symbolic systems without becoming parser documentation.
**Constraints:** The glossary teaches readers to *read* the symbolic layer; the parser documentation (curator-only) explains how the tokenizer parses it. The boundary is load-bearing. No canonical-ontology changes.

---

## 1. The integration problem

The symbolic-grammar layer is rich:

- 62 symbolic groups across four axes (modifier / set / topology / archetype)
- 11 movement archetypes
- 323 trick-to-group memberships
- 18 equivalence clusters
- 68 glossary crosslinks
- 8-layer representation model (canonical / semantic-compressed / semantic-expanded / operational / folk / PassBack / FM / alias)
- Two notation languages (semantic + operational), each with its own tokenizer + role taxonomy
- Modifier-family pages (spinning / paradox / ducking) as embodied teaching surfaces

If we surface all of that in the glossary, the glossary becomes a database browser. If we surface none of it, the glossary stays at v3 and the rich symbolic layer never reaches readers.

The integration design picks what to surface, where to surface it, and what stays in the curator's track.

---

## 2. The boundary principle

There are **three kinds of symbolic content**, with different audiences and different surfaces:

| Content | Audience | Surface |
|---|---|---|
| **Reading-the-language vocabulary** | Every learner | Glossary §7 (Notation) |
| **Observed structural relationships** | Curious / advanced readers | Glossary §9 (Topologies) |
| **Internal parser / curator state** | Curators only | Code / engineering docs (NOT glossary) |

The glossary holds the first two. The third stays in `operationalNotationRendering.ts`, `notationRendering.ts`, `feedback_parser_editorial_separation.md`, and curator-only documentation.

Every integration decision below follows from this division.

---

## 3. What §7 (Notation) surfaces

§7 is the glossary's home for **reading the symbolic language.** It teaches a learner to look at `[clip] > op in dex > butterfly wing > ss clipper` and read it as a sentence.

### 3.1 The two notation layers, explained as readable languages

§7 introduces semantic notation and operational notation as **two readings of the same trick**:

- **Semantic notation** (Jobs notation): the trick's identity as a sentence of structural roles. *Stepping Butterfly. Spinning Paradox Whirl.* The community's compositional name.
- **Operational notation**: the trick's mechanics as a token sequence with sequence operators, side flags, direction flags. `[clip] > op in dex > butterfly wing > ss clipper`. The mechanical reading.

Both are valid. Both refer to the same trick. The two layers are explained as *different views*, not as a parser format. The §7 prose answers "what is this telling me about the trick?" — not "how does the tokenizer parse it?"

### 3.2 Token roles, surfaced as visual vocabulary

§7 introduces token roles with worked examples — each role gets a brief explanation of *what kind of meaning it carries* in a notation reading:

- **Component flag** (`[DEX]`, `[DEL]`, `[BOD]`, `[XBD]`, `[PDX]`, `[XDEX]`): a label on a token marking its structural component
- **Surface** (`[clip]`, `toe`, `clipper`): where the body meets the bag
- **Side** (`ss`, `op`): the relationship to the previous component
- **Direction** (`in`, `out`): the direction of a dex's circling
- **Body action** (`spin`, `duck`, `dive`): a physical body motion
- **Rotation variant** (`front whirl`, `back swirl`): a fused rotational dex token
- **Sequence operator** (`>`, `>>`): minor and major boundaries between components
- **Pre-state flag** (`(back)`, `(no plant while)`, `(rooted)`): a brief annotation on the next token

These are taught as **vocabulary the reader recognises in the wild** — not as a tokenizer specification. The glossary cares about reading; the tokenizer (which IS a spec) lives in code.

### 3.3 Worked examples — three or four, lightweight

§7 carries three or four complete worked examples (mirroring today's §8 of the IFPA glossary):

1. **Whirl** — the simplest base. `[clip] > in dex > ss clipper`. Walks the reader through each token.
2. **Stepping Butterfly (Ripwalk)** — a single-modifier compound. Demonstrates how a modifier-prefix adds a token to the reading.
3. **Spinning Paradox Whirl (PS Whirl + spinning)** — a multi-modifier compound. Demonstrates how multiple operators stack in the reading.
4. **Optional: Montage** — the flagship deep compound. Demonstrates dense operational notation. Held back so it doesn't overwhelm the early examples.

Each example is annotated: *what does each token mean, and how does the sequence read as a structural sentence?* The reader leaves §7 able to look at an unfamiliar notation string and parse it as a sentence in their head.

### 3.4 The default-side rule, surfaced

§7 also explains the default-side rule that makes notation *compressible*:

- Toe tricks default to `op`. "Toe Mirage" means "Toe op Mirage."
- Clipper tricks default to `ss`. "Clipper Whirl" means "Clipper ss Whirl."

This explains why notation can drop tokens without losing information. Without the rule, the language looks like ambiguous shorthand; with the rule, it's a compressible-by-convention writing system.

### 3.5 What §7 does NOT surface

§7 deliberately avoids:

- **Token classification logic.** The tokenizer's 12-precedence rule chain in `notationRendering.ts` is curator-internal. §7 explains roles; it doesn't explain how a string gets classified.
- **The full operational vocabulary as a spec table.** The `OPERATIONAL_NOTATION_STYLE_GUIDE.md` is a curator-style guide; §7 doesn't reprint it. §7 teaches the *kinds* of tokens; the style guide enforces conformance.
- **Parser failure modes.** When a tokenizer hits an unrecognised token it emits role `unknown`. The glossary acknowledges that unfamiliar tokens may exist ("community notation may be evolving") but doesn't document the parser's error handling.
- **The complete role taxonomy.** §7 introduces the high-leverage roles (surface / side / direction / body-action / sequence-op / pre-state / component-flag). The full role enum (with `core_family`, `set`, `rotation`, `delay_surface`, `unusual_surface`, `directionality`, `body_component`, `footedness`, `multiplicity`, `suffix`, `unresolved` from the semantic tokenizer) is not enumerated — readers learn what they need to read, not the full taxonomy.

---

## 4. What §9 (Topologies) surfaces

§9 is the glossary's home for **observed structural relationships** — the symbolic-grammar layer that lets a reader see how tricks relate across families.

### 4.1 Three concepts surfaced

§9 introduces three concepts. Each gets a definition + a worked example + a cross-reference into the dictionary / component view.

- **Topology group** — a collection of tricks that share a primary structural feature (e.g., *butterfly-wing-topology*: tricks whose primary downtime mechanic is a hippy out dex finishing on clipper). Topology groups are observed; they're not canonical IFPA families.
- **Movement archetype** — a recurring movement *pattern* across multiple tricks (e.g., *uptime-dex-downtime-butterfly*: the pattern of an uptime modifier + a butterfly-style downtime). Archetypes describe what the body does across a class of tricks.
- **Equivalence cluster** — a group of tricks that share an *underlying mechanic* even when their names look unrelated (e.g., the *hippy-in-on-mirage* cluster spans mirage, smear, blur, atom-smasher, sumo, paradox-mirage — different names, same hippy-in-dex mechanic).

Each of the three is a *lens*, not a classification. The reader learns to *notice* structural relationships, not to *enforce* a taxonomy.

### 4.2 The observational-canonical boundary

§9 carries an explicit framing that runs in every entry: **observational, not canonical.**

The dictionary's `trick_family` column owns canonical structure. Two tricks in the same family share an IFPA-decided membership. Topology groups in §9 are observed structural neighborhoods — they don't override the family classification; they sit alongside it.

The same trick can belong to:

- A canonical family (e.g., Paradox Mirage → family `mirage`).
- One or more topology groups (e.g., Paradox Mirage → `hippy-in-on-mirage` cluster + `mirage-topology`).
- One or more archetypes (e.g., Paradox Mirage → `hippy-in-dex` pattern).

Each layer answers a different question. Family asks "what's the structural anchor?" Topology asks "what shape does this trick make?" Archetype asks "what pattern does the body perform?" The reader learns all three; the dictionary owns family; the glossary owns topology + archetype.

The badge convention from the symbolic-card system (`observational` tag + footer text) appears in §9 to reinforce the framing.

### 4.3 The §13 connective panels migrate to §9

Today's §13 panels (paradox, symposium, ducking, spinning, whirl, pixie) are already the prototype for V5's §9 treatment. Each panel:

- Short coach-tone definition
- List of representative tricks
- Related symbolic groups (cross-axis affordances)
- Notation hint (when applicable)
- Deep-link to the modifier-family pedagogy page when one exists

In V5, these panels become §9's primary unit of presentation. Every topology group, archetype, and equivalence cluster gets a panel of this shape. The reader scrolls §9 as a vertical stack of panels, each anchored to a structural concept.

### 4.4 The 8-layer representation model, in §9

§9 also introduces the 8-layer representation model from `NOTATION_LAYER_STRATEGY.md`. The glossary version is *conceptual*: it explains that a trick can be referred to by its canonical name, its semantic compressed form, its semantic expanded form, its operational notation, its folk name, its PassBack rendering, its FootbagMoves rendering, or its alias. Eight layers; same trick.

The reader learns this layer model so that when they encounter a name like *gyro torque* and another name like *mobius*, they can recognise the relationship: those are two layers of the same trick, not different tricks. The layer model is the *conceptual machinery* that makes decomposition work; §9 is its glossary home.

§9 does NOT surface:

- The migration roadmap from `NOTATION_LAYER_STRATEGY.md` §10 (curator-internal)
- The schema design implications (out of scope for any glossary surface)
- Which DB columns hold which layer (engineering detail)

### 4.5 What §9 does NOT surface

- The full symbolic-grammar-2 CSV inventory. 62 groups × 323 memberships would overwhelm the page. §9 introduces *the concept* and surfaces representative examples; the component view at `/freestyle/tricks?view=component` is the home for the exhaustive browse.
- Curator-state metadata. Confidence scores, source attribution columns, evidence chains — these are curator-internal.
- The parser's reasoning. The relationship between *operational notation* and *semantic notation* is shown via worked examples; the underlying parsing logic stays in code.

---

## 5. What §10 (Reference) surfaces from the symbolic layer

§10 is alphabetical lookup. The symbolic layer contributes:

- Lookup entries for each of the high-leverage symbolic terms (*topology, archetype, equivalence cluster, observational layer, canonical layer, semantic notation, operational notation, technical name, nickname*) with cross-references to §7 or §9.
- Lookup entries for token roles (*surface, side, direction, component flag, sequence operator, pre-state flag*) with cross-references to §7.
- Lookup entries for each named topology group (*butterfly-wing-topology, whirl-rotational-topology, mirage-topology, drifter-miraging-clipper-topology, blender-rotational-topology, osis-rotational-topology*) with short definitions + cross-references to §9.

A reader who searches for "topology" in §10 lands on a short entry pointing to §9. A reader who searches for "front whirl" lands on a short entry pointing to §7. The lookup utility extends naturally to the symbolic vocabulary.

---

## 6. What modifier-family pedagogy pages contribute (cross-link target)

The modifier-family pages (`/freestyle/modifier/spinning`, `/freestyle/modifier/paradox`, `/freestyle/modifier/ducking`) are separate surfaces, not glossary content. The glossary deep-links to them but doesn't subsume them.

The cross-link contract:

- §6's operator entries each carry a "Learn more on the modifier-family page →" deep-link when one exists.
- §9's connective panels carry the same deep-link.
- §10's lookup entries reference the modifier-family page as a related resource.

The modifier-family page is the *embodied teaching surface* (mechanical lead, anchor sentence, common confusions, progression, cross-base examples). The glossary's job is to *define the term*; the modifier-family page's job is to *teach the embodied skill*. The two surfaces serve different jobs and never overlap.

---

## 7. What stays in the curator track (NOT glossary)

Several substantial parts of the symbolic layer are explicitly NOT glossary content. They live in:

- `feedback_parser_editorial_separation.md` — the parser / editorial layer rule (curator-internal architectural invariant)
- `OPERATIONAL_NOTATION_STYLE_GUIDE.md` — operational notation conformance rules for curators
- `NOTATION_LAYER_STRATEGY.md` — the 8-layer representation model's migration path
- The `notationRendering.ts` and `operationalNotationRendering.ts` tokenizers (code, not docs)
- The `symbolic-grammar-2` CSV files (data, not docs)
- The curator review pipelines (`exploration/passback-intake/`, `exploration/glossary-synthesis-1/`)

These exist for curator + engineering audiences. The glossary doesn't reproduce them; it points at them only when relevant to a reader (e.g., "see `OPERATIONAL_NOTATION_STYLE_GUIDE` for notation conformance details" — appears once in §7 as a curator-facing note).

---

## 8. Decomposition concepts in §8

§8 (Composition & Decomposition) of the glossary architecture introduces decomposition as the *inverse* of composition: a folk single-token name (Mobius, Phoenix, Blur, Fury) can be *decomposed* into its constituent operators and base. The decomposition is a *reading*, not a re-naming.

§8 surfaces:

- The decomposition concept: a name like "Phoenix" decomposes into "Pixie Ducking Butterfly" (technical name); the decomposition is a structural sentence.
- A worked-example table of folk → decomposed pairs (the same table that appears in `MODIFIER_OPERATOR_FRAMEWORK.md` §6.12).
- The equivalence cluster concept (a forward reference to §9): two tricks can share an underlying mechanic without being structurally identical.

§8 does NOT surface:

- The internal parser logic that produces decompositions.
- The curator workflow for assigning canonical decompositions to folk names.
- The disambiguation policy for ambiguous decompositions (curator-internal).

Decomposition is presented as a *reader's lens*, not a mechanical operation.

---

## 9. Notation rendering in glossary entries

A small but important integration detail: where the glossary renders notation inline, it uses the **same role-colored token spans** the rest of the site uses. This means:

- When §6 shows `[clip] > op in dex > butterfly wing > ss clipper`, each token is a span with `class="op-token op-token--{role}"` carrying the role's CSS color.
- When §7 shows the worked examples, same convention.
- When §9 carries notation hints in connective panels, same convention.

The glossary inherits the dictionary's notation rendering. A reader who learns to read notation in the glossary sees the same visual language on trick-detail pages, modifier-family pages, and browse cards. Visual consistency = recognition consistency.

This integration is already partial today (today's §8 of the glossary uses role-colored tokens; today's §9 does not). V5 unifies both at §7 and propagates to §9's connective panels.

---

## 10. The symbolic glossary's pedagogical voice

A consistent voice question: when §7 and §9 talk about symbolic concepts, they should sound like *observations a learner can make*, not like *parser specifications*.

Good (§9 voice):

> Several trick names hide a hippy in dex on a mirage base inside them: Smear is a mirage with a different uptime; Blur is a mirage with paradox; Atom Smasher is an atomic mirage. The hippy-in-on-mirage cluster groups them by the mechanic they share, even though their compositional names differ.

Bad (parser-spec voice):

> The hippy-in-on-mirage equivalence cluster (id: hippy-in-on-mirage) is defined in symbolic_equivalence_clusters.csv with anchor topology mirage-topology and includes the following trick slugs: mirage, smear, blur, atom-smasher, sumo, witchdoctor, paradox-mirage.

The first surfaces the *observation*. The second surfaces the *data*. The glossary uses the first voice throughout §7 and §9.

This is more than tone. The first voice teaches the reader to *notice* the pattern; the second teaches the reader to *consult* the database. The glossary's job is the first.

---

## 11. Constraints honoured

- The symbolic-grammar layer is surfaced where it aids reading (notation, topology) and hidden where it doesn't (parser internals, curator state)
- Observational-canonical boundary preserved at §9 (badge + footer convention)
- Modifier-family pedagogy pages remain separate surfaces; glossary deep-links rather than subsumes
- No parser specification leaks into the glossary
- §13 connective-panel pattern extends to §9 as the primary presentation unit
- 8-layer representation model surfaced conceptually at §9; migration roadmap stays curator-internal
- Glossary inherits the dictionary's role-colored notation rendering (visual consistency)
- No canonical-ontology changes
- No PassBack wording reproduced

---

## 12. Cross-references

- `GLOSSARY_V5_ARCHITECTURE.md` — defines §7 and §9 at the architecture level; this document operationalises the symbolic integration
- `MOVEMENT_LANGUAGE_PRIMER_DRAFT.md` — §1 primer; introduces the operator framing that §7 + §9 build on
- `MODIFIER_OPERATOR_FRAMEWORK.md` — §6 operators; the decomposition table referenced in §8
- `TRADITIONAL_GLOSSARY_PRESERVATION_PLAN.md` — §10 reference; the symbolic vocabulary lookup entries
- `exploration/dictionary-symbolic-card/NOTATION_LAYER_STRATEGY.md` — the 8-layer representation model surfaced conceptually at §9
- `exploration/dictionary-symbolic-card/OPERATIONAL_NOTATION_STYLE_GUIDE.md` — the curator-facing notation style guide §7 forward-references
- `exploration/symbolic-grammar-2/` — the source data §9 surfaces representative examples from
- `feedback_parser_editorial_separation.md` — the parser/editorial separation rule the glossary respects
- `src/services/notationRendering.ts` — semantic notation tokenizer (NOT documented in glossary)
- `src/services/operationalNotationRendering.ts` — operational notation tokenizer (NOT documented in glossary)

---

*End of SYMBOLIC_GLOSSARY_INTEGRATION.md*
