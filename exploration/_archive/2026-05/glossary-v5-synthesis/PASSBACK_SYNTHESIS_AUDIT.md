# PASSBACK_SYNTHESIS_AUDIT

**Project:** GLOSSARY-V5-SYNTHESIS — Task F
**Scope:** Audit the PassBack glossary as captured in the local intake corpus (`legacy_data/inputs/curated/tricks/passback-glossary.txt`, 613 lines; `passback-dicrionary.txt`, 240 lines; `pb-dict2.txt`, 42 lines; plus the staged comparison from `glossary-synthesis-1`). Identify the strongest pedagogical structures, weakest points, and opportunities for the IFPA / symbolic layer to clarify what PassBack leaves ambiguous.
**Constraints:** No PassBack wording reproduced verbatim. Pedagogical structure is what's synthesized; prose belongs to PassBack. Where this document cites PassBack vocabulary (term names), it does so because the terms themselves are community-shared, not PassBack-owned.

---

## 1. The strongest pedagogical structure: simple → complex authoring

The single most pedagogically valuable feature of the PassBack glossary is its **explicitly stated authoring principle**: terms are defined from simple to complex, each section builds on those before it, the first use of a term is bolded, subsequent uses are normal text, and an alphabetical index sits at the end.

Why this is strong:

- **The author cared about the reading order.** Most freestyle reference material is alphabetical or arbitrary. PassBack made an editorial commitment to a teaching arc.
- **The "first-use bold" convention** lets a reader skim and pick up new vocabulary as a sequence, not as a flat lookup.
- **The trailing index** preserves the lookup utility without forcing the reader to scan alphabetically by default.

**Synthesis recommendation:** GLOSSARY-V5-SYNTHESIS's §1–§9 (primer) + §10 (alphabetical reference) directly mirrors this dual-surface design. The IFPA glossary should adopt the principle: **a primer that reads top-to-bottom, plus a reference that reads alphabetically.** The two surfaces share content but are accessed differently.

---

## 2. The strongest sequence: contacts → dexes → body components → ducks → spins → trick phases → sides → paradox → execution

The PassBack glossary's main teaching arc, in order:

1. Equipment (bags, shoes, mods)
2. Tricks → Setting the Bag
3. Components → Contacts (defining a contact, contact surfaces, contact types, toe & clipper, other contacts)
4. Dexes (dex directions, dex styles & fullness)
5. Body components (ducks, spins, in-the-air components like symposium / symple / muted / stomping)
6. Trick phases (uptime / midtime / downtime; attack)
7. Sides (ss / op; defaults for toe and clipper)
8. Paradox (special hip-pivot case)
9. Stance (strong / flip / bigfoot / sideways)
10. Execution (clean / deep / thin / shoey / the / scoopy / pulled / froggy)
11. Trick names (technical name; Jobs notation; nicknames)
12. Shorthand modifiers (PS, Alpine, Crispy)
13. Symposium modifiers (FS / BS / Full Symp; alpha / beta / gamma rejected as overcomplicated)
14. Combining multiple tricks (strings / runs / combos / links / drills / mirrors / b2b / BSOS / marathon)
15. Ending a trick or string (handcatch / seal / drop / dropless / bailed / footed / over-dexed)
16. ADDs (categories: DEL / DEX / XBD / UNS / BOD; groupings: Tiltless ... Godly; controversy)
17. Circles (etiquette, props, asking to kick / shred / play)

**Synthesis observations:**

- **The first nine items are atomic primitives**, each adding one concept. The reader builds a mental model linearly.
- **Steps 11–13 introduce the language for *naming* tricks**, not new tricks themselves. Naming is treated as a system, not a memorization task.
- **Step 14 jumps to compositions above the single-trick level** (strings / drills / mirrors / multipliers).
- **Step 16 (ADDs) is positioned LATE**, after the entire trick-language is in place. The reader has the structural vocabulary before they're asked to score it.

**Synthesis recommendation:** GLOSSARY-V5-SYNTHESIS's §1–§9 borrows the **principle of late difficulty/scoring**. ADD-system terminology (Tiltless / Guiltless / etc.) should move from today's IFPA glossary's §1 (where it currently leads) to §10 (reference) or near the end of the primer. The primer leads with mechanics; the reference covers scoring.

---

## 3. Strongest compositional explanations

PassBack's strongest single explanation passages, by topic:

### 3.1 Modifiers as transformations on a base trick

PassBack frames `PS + [base trick]`, `Alpine + [base trick]`, `Crispy + [base trick]`, `FS + [base trick]`, `BS + [base trick]`, and `Full Symp + [base trick]` as **operators that take a base trick and produce a modified trick.** Each operator is explained with its mechanic and a worked example. This is more pedagogically clear than any IFPA reference that lists modifiers as isolated words.

**Synthesis recommendation:** §6 (Modifiers & Operators) adopts this **operator framing wholesale** but does not copy PassBack's specific operator inventory verbatim. Operators are an organizational principle; the inventory belongs to the canonical IFPA layer.

### 3.2 The "technical name" concept

PassBack's distinction between a trick's **technical name** (the structural composition) and its **nickname** (the folk single-token name) is the cleanest piece of pedagogy in the document. The Phoenix example (technical name: Pixie Ducking Butterfly) is repeated in multiple sections because it teaches the reader that *names are readable*: every nickname has a structural reading.

**Synthesis recommendation:** §5 (Core Trick Structures) and §6 (Modifiers) cross-reference each trick's technical name + folk name pairing. The IFPA representation-layer model (`NOTATION_LAYER_STRATEGY.md`) formalizes this as layers 1 + 2 + 5 of the 8-layer model. PassBack's "technical name" maps to layer 2 (semantic compressed); "nickname" maps to layer 1 (canonical) or layer 5 (folk). The mapping is conceptually clean.

### 3.3 The Alpine operator's branching logic

PassBack defines Alpine as inserting a duck or dive between uptime and downtime — and explicitly explains that **whether it's a duck or a dive depends on whether the downtime is op or ss relative to the set**. That's a *conditional* rule, not a flat definition. The reader learns that one operator can have branch logic.

**Synthesis recommendation:** §6 (Modifiers & Operators) introduces conditional-operator concepts explicitly. The reader who internalizes "Alpine = duck-if-op, dive-if-ss" is ready for the broader principle that modifiers encode rules, not just words.

### 3.4 Side-defaults

PassBack notes that the default side for a toe trick is `op`; the default for a clipper trick is `ss`. This implicit convention is what makes the technical-name notation readable — readers don't have to specify `op` everywhere because it's already the default. PassBack states the rule clearly.

**Synthesis recommendation:** §7 (Symbolic Notation) and `OPERATIONAL_NOTATION_STYLE_GUIDE.md` already encode this. Worth surfacing the default-side rule as the reason notation is *compressible*: defaults let readers drop tokens without losing information.

---

## 4. Strongest terminology clusters

PassBack groups vocabulary into pedagogically motivated clusters rather than scattering them:

| Cluster | Members | Why it's strong |
|---|---|---|
| **Head-motion family** | ducking / weaving / diving / zulu | 2×2 matrix (head direction × bag-fall side). The reader learns the family logic, not 4 isolated words. |
| **Symposium variants** | symposium / symple / muted | Three closely-related no-plant disciplines that share the "active leg in the air" mechanic. Distinct enough to need separate terms, related enough to teach together. |
| **Execution-quality vocabulary** | clean / deep / thin / shoey / the / scoopy / pulled / slurry / froggy | Vocabulary for describing HOW WELL a trick was performed. Pairs with each other to form a feedback language for play. |
| **Trick-ending vocabulary** | handcatch / seal / drop / dropless / bailed / footed / over-dexed | The grammar of how a string terminates. Six related words that together cover the "what happened at the end" question space. |
| **Combination grammar** | string / run / combo / link / drill / mirror / b2b / BSOS / marathon | The compositional layer above single tricks. PassBack treats these as a unified topic, not as scattered slang. |

**Synthesis recommendation:** §3 (Dexterities) and §6 (Modifiers) and §8 (Composition & Decomposition) all benefit from PassBack's **clustering convention**. Group related vocabulary into pedagogical clusters rather than alphabetical scattering; teach the family logic, not isolated definitions.

---

## 5. Strongest body-mechanics explanations

PassBack consistently anchors abstract terms in concrete body actions:

- **Hippy vs leggy dex** — "the dex motion comes from the hip and the thigh circles the bag" / "the dex motion comes from the knee and the calf circles the bag." Body region + which part of the leg traces the circle. The reader has a kinesthetic image immediately.
- **Paradox** — "a special type of far dex where: 1) the previous component was Xbd (usually a Clipper set), and 2) the dex requires a hip pivot in order to bring the leg under the bag in preparation." Concrete: previous component requirement + hip pivot mechanic + worked example.
- **Symposium** — "a single-leg jump: the symposium leg jumps and lands on its own while the other leg remains in the air." The mechanic is named in terms of the support leg's behaviour.
- **Magic hop** — "where the support leg does a small hop just before and just after the bag is stalled on the set foot." A small, named, biomechanically-specific event.

**Synthesis recommendation:** §1 (Movement Language Primer) and §2 (Contact Surfaces) and §3 (Dexterities) and §6 (Modifiers) adopt PassBack's **body-region-anchoring discipline**. Every term in those sections is defined in terms of *where in the body the motion lives* and *what the support leg / set leg / kicking foot is doing*. The IFPA / symbolic glossary today is conceptually correct but light on biomechanical grounding; V5 fixes that.

---

## 6. Strongest learning sequences

A few PassBack micro-sequences are unusually well-designed:

### 6.1 The dex sequence

- (a) What is a dex? (motion of the leg circling the bag)
- (b) Direction (in vs out)
- (c) Style (hippy vs leggy)
- (d) Fullness (full vs half)
- (e) Execution quality (deep / thin / shoey / the)

Five sub-sequences, each cumulative. By the end, the reader can describe a dex along five axes.

### 6.2 The naming sequence

- (a) Technical name (structural composition)
- (b) Jobs notation (token-sequence representation)
- (c) Nickname (folk single-token name)

The reader learns three names for the same trick, each at a different layer.

### 6.3 The Alpine introduction

- (a) Base trick has uptime and downtime
- (b) Alpine inserts a component between them
- (c) The inserted component is duck-or-dive based on downtime side
- (d) Worked examples (Alpine Ripwalk; Alpine Pixie op Mirage; Alpine Stepping ss Butterfly)

A four-step conditional operator introduction.

**Synthesis recommendation:** GLOSSARY-V5-SYNTHESIS uses **micro-sequences** as the pedagogical unit within each top-level section. Inside §3 (Dexterities), the five-axis dex classification is a micro-sequence. Inside §6 (Modifiers), each modifier-operator gets a 3-4-step introduction (mechanic → transformation rule → ADD contribution → worked example). The pattern is reusable.

---

## 7. Strongest symbolic explanations

PassBack's strongest symbolic content:

- **Jobs notation example**: `Clipper > ss In Dex >> op Out Dex > ss Clipper`. A four-token operational reading shown as one line of notation. The reader sees what Jobs notation looks like in flight.
- **Sides defaults** (Toe → op; Clipper → ss): a *rule* for what to assume when side flags are absent. This makes notation compressible without losing precision.
- **The "Pdx + base" naming**: paradox is explained as a special far dex, then immediately deployed as a naming shorthand (`Pdx. Whirl` = `Paradox Whirl` = `Clipper Far Whirl`). Three names for the same trick, layered.

**Synthesis recommendation:** §7 (Symbolic Notation) and `OPERATIONAL_NOTATION_STYLE_GUIDE.md` already align with these. PassBack's contribution to V5: validate that the IFPA operational notation is *recognisable* to PassBack-trained readers without modification. The PassBack `Clipper > ss In Dex >> op Out Dex > ss Clipper` and the IFPA `[clip] > op in dex > butterfly wing > ss clipper` are different surface forms of the same grammar; both are legal Jobs-notation readings.

---

## 8. Weaknesses and inconsistencies

### 8.1 ADD-system positioning

The ADD system is introduced **after** the entire trick-language. PassBack handles this well — but then ADDs are explained with implicit assumptions ("DEX with the same meaning as previously defined") that depend on the reader having read every prior section. A reader who jumps to ADDs to look up a tier name has to backtrack.

**Opportunity for IFPA:** §10 (Reference) entries for ADD-tier terms should be self-contained — short definition + back-reference to the primer location for context. Don't force a reader to read the whole primer to look up "Tiltless."

### 8.2 Symposium / symple / muted overlap

PassBack defines three closely-related terms (symposium / symple / muted) and then admits the shorthand `symp` is used for either symposium or symple "whichever the particular component would be more naturally done as." That's pedagogically correct (it's how players talk) but glossary-wise ambiguous — the same shorthand maps to two distinct mechanics depending on context.

**Opportunity for IFPA:** §6 (Modifiers & Operators) treats symposium, symple, muted as **three distinct operators with explicit transformation rules.** The folk shorthand `symp` lives in §11 (Community / Historical Vocabulary) with explicit cross-reference to both canonical operators. The glossary preserves community usage without conflating canonical mechanics.

### 8.3 Frontside / Backside / Full Symp + alpha / beta / gamma redundancy

PassBack documents two parallel symposium-modifier systems (FS / BS / Full Symp vs alpha / beta / gamma) and explicitly editorializes that the latter is "unnecessary and overly complicated." Documenting both is necessary for community vocabulary recognition; recommending one over the other is curator-side editorializing that may bias readers.

**Opportunity for IFPA:** §11 records the alpha / beta / gamma terms as historical vocabulary; §6 teaches the simpler FS / BS / Full Symp operators canonically. The glossary doesn't editorialize; the architecture decides which gets primary placement.

### 8.4 The "Crispy" definition

PassBack's Crispy definition is itself flagged as "not commonly used, and is (IMO) sometimes longer or more confusing than using the technical name." The author flags an entry as confusing in its own definition. This is honest but glossary-wise odd.

**Opportunity for IFPA:** §11 records Crispy as community vocabulary; doesn't promote it to §6's canonical operator list unless / until curator review concludes it deserves canonical status. The glossary acknowledges folk terms without making them canonical.

### 8.5 BOP definition vs trick-level guiltless tier

PassBack defines BOP (Butterfly / Osis / Paradox Mirage) as the foundational guiltless tier, then defines Genuine Guiltless as Guiltless that excludes BOPs. Two terms with overlapping populations. A reader looking up "Guiltless" gets one definition; looking up "Genuine Guiltless" gets a refinement; looking up "BOP" gets a third entry. The relationship is real but the lookup experience is forking.

**Opportunity for IFPA:** §10 (Reference) entries for Guiltless / Genuine / BOP cross-reference each other inline. A reader landing on any of the three immediately sees the relationship to the other two.

### 8.6 Folk ambiguity at the head-motion family edge

PassBack's head-motion family (ducking / weaving / diving / zulu) is explained as a clean 2×2 matrix. But then `Alpine` is introduced as inserting "a duck or dive" — *not* a weaving or zulu. The shorthand only applies to two of the four head-motion siblings. A reader following the 2×2 logic would expect Alpine to support all four; PassBack restricts it to two.

**Opportunity for IFPA:** §6 (Modifiers & Operators) is explicit about Alpine's domain: it inserts duck or dive, not the full head-motion family. The reader learns the rule's *boundary*, not just the rule.

---

## 9. Folk ambiguities worth surfacing

Terms PassBack uses where community usage is internally inconsistent:

- **Magic hop** — PassBack notes the term is ambiguous whether it refers to the hop during catch, during set, or a combination. This is genuine community ambiguity.
- **Symp** — shorthand for symposium *or* symple depending on context.
- **Same-side / near** and **opposite / far** — interchangeable but the choice between them carries cultural register (`near` / `far` is older; `ss` / `op` is modern). PassBack notes "they mean the same thing" without flagging the register difference.
- **In- prefix** — applicable to "Spinning, Gyro, or even full trick names" to flip direction. Range of valid applications is ambiguous.
- **Mirage's implicit op** — `Toe Mirage = Toe op Mirage` is implicit; readers learn this through prose mention, not formal table.

**Opportunity for IFPA:** §11 (Community / Historical Vocabulary) gets an explicit "ambiguities" subsection where each of these is documented with its variants and (where applicable) the IFPA-canonical preference. The glossary preserves cultural variation without forcing readers into one register.

---

## 10. Strongest single sentences (pedagogically)

Sentences where PassBack does an unusual amount of work in one breath. Each one is a *pattern* worth replicating, not text to copy:

- "Footbag tricks are very modular and are created from combining and ordering different components." — Frames the entire mechanical premise in one sentence.
- "The simplest type of component is a contact, where a part of the body comes into contact with the bag, which typically marks the end of a trick." — Defines contact + locates its typical timing in the trick lifecycle.
- "The primary trick component in footbag is a dexterity, or dex for short, where the leg circles the bag while it's in the air." — Names the central primitive + states its mechanic + provides the shorthand.
- "A single trick can be broken down into three phases depending on which direction the bag is moving at a given time." — Introduces the timing-layer concept in one motion.

**Synthesis recommendation:** §1–§6 of GLOSSARY-V5-SYNTHESIS aim to deliver **one-sentence pattern-introductions** at the head of each subsection. The reader gets the concept's frame in a sentence; the rest of the subsection unpacks it.

---

## 11. Opportunities where IFPA / symbolic improves on PassBack

Where the IFPA + symbolic-grammar layer offers something PassBack doesn't:

### 11.1 The 8-layer representation model

PassBack treats technical name / Jobs notation / nickname as three layers. The IFPA work expands this to eight (canonical / semantic-compressed / semantic-expanded / operational / folk / PassBack rendering / FootbagMoves rendering / alias) — see `NOTATION_LAYER_STRATEGY.md`. The IFPA layer model:

- Acknowledges PassBack's three layers explicitly (technical name → semantic compressed; Jobs notation → operational; nickname → folk).
- Adds the canonical-name layer (the *identity* of a trick, independent of its readings).
- Adds the semantic-expanded layer (the most-decomposed reading, which PassBack's "technical name" sometimes is and sometimes isn't).
- Adds the alias layer (the search-resolution surface).
- Adds the PassBack / FM rendering layers explicitly (acknowledging that a trick has community-specific renderings).

**Opportunity:** §7 + §8 (Symbolic Notation + Composition & Decomposition) teach the 8-layer model. PassBack readers gain expressive precision without losing the three-layer mental model they came in with.

### 11.2 Topology and equivalence-cluster relationships

PassBack has no equivalent of the symbolic-grammar topology layer. Tricks that share structure across families (the hippy-in-on-mirage cluster spanning mirage / smear / blur / atom-smasher / sumo / paradox-mirage) are unrelated in PassBack's model; they emerge naturally in the IFPA topology layer.

**Opportunity:** §9 (Movement Topologies) is genuinely net-new content the IFPA glossary can offer. PassBack readers encounter a structural lens their original source didn't provide.

### 11.3 Modifier-family pedagogy pages

PassBack defines modifiers in glossary entries — definitions, not teaching surfaces. The IFPA modifier-family pages (`/freestyle/modifier/{spinning|paradox|ducking}`) are full embodied teaching surfaces: mechanical lead, anchor sentence, common confusions, progression, cross-base examples, related modifiers. PassBack doesn't have parallel surfaces.

**Opportunity:** §6 (Modifiers & Operators) deep-links to modifier-family pages where they exist. PassBack readers gain teaching surfaces their original glossary lacked.

### 11.4 Cross-reference density

The IFPA glossary already carries fragment anchors (`#term-{slug}` + `#glossary-panel-{slug}`) and the deep-link resolver (`glossaryAnchors.ts`). Every term referenced in another surface can be deep-linked. PassBack glossary is monolithic prose with an end-of-document index; deep-linking from elsewhere requires linking to the entire document.

**Opportunity:** §10 + §11's lookup utility is *spatial* — every term is its own anchor. The reader's experience of "what does X mean" is one click in IFPA versus a document search in PassBack.

### 11.5 Observational-vs-canonical separation

PassBack treats all vocabulary as canonical-equivalent. The IFPA / symbolic layer maintains a hard boundary: canonical (IFPA-owned trick families, ADD values, modifier ADD contributions) vs observational (symbolic-grammar topology, archetypes, equivalence clusters). The boundary is visible to the reader (badges, footers).

**Opportunity:** §9 (Movement Topologies) is explicitly observational. The reader learns that structural relationships are observed, not asserted; canonical structure remains the IFPA's territory.

---

## 12. Where IFPA should NOT improve on PassBack

Some PassBack features should be left as-is, not "improved":

- **Editorial voice.** PassBack speaks in a teaching voice. IFPA glossary should preserve teachability over formality.
- **Examples-first explanations.** PassBack consistently leads with a worked example. IFPA glossary should adopt the same pattern.
- **Conversational acknowledgement of community variation.** PassBack notes when a term is contested or has folk variations. IFPA glossary should do the same; not pretend there's one canonical answer to "magic hop happens during catch or set?"
- **The "from simple to complex" authoring principle.** This is the structural foundation of the whole document. IFPA's V5 adopts it directly.

---

## 13. Synthesis recommendations summary

| Strength | V5 home |
|---|---|
| Simple → complex authoring | §1–§9 read in order; §10 reference |
| Body-mechanics anchoring | §1, §2, §3, §6 |
| Operator framing of modifiers | §6 |
| Cluster-by-relationship vocabulary | §3, §6, §8 |
| Technical name vs nickname distinction | §5, §6, with cross-references; the 8-layer model formalizes |
| Examples-first explanations | every section |
| Conversational acknowledgement of folk variation | §11 |
| Late-stage scoring discussion | ADD vocabulary moves to §10 reference and primer-end, not lead |
| Default-side rule for compressibility | §7 |

| Weakness / Opportunity | V5 response |
|---|---|
| Crispy flagged-in-definition | §11 records it; §6 doesn't elevate it |
| symp shorthand → two operators | §6 keeps mechanics separate; §11 documents the folk shorthand |
| BOP / Guiltless / Genuine inter-relationship | §10 entries cross-reference inline |
| Magic-hop timing ambiguity | §11 ambiguity subsection |
| Symposium-modifier dual system (FS/BS/Full Symp + alpha/beta/gamma) | §6 teaches FS/BS/Full Symp canonically; §11 records the alpha/beta/gamma vocabulary |

| IFPA / symbolic net-new | V5 home |
|---|---|
| 8-layer representation model | §7, §8 |
| Topology + archetype + equivalence-cluster layer | §9 |
| Modifier-family pedagogy pages | §6 deep-links into them |
| Fragment-anchor + deep-link resolver | every section's terms |
| Observational-vs-canonical separation | §9, §11 |

---

## 14. Constraints honoured

- No PassBack wording reproduced
- Term names cited are community-shared (paradox, symposium, ducking, etc.), not PassBack-original
- The synthesis is structural: what PassBack does well, where it leaves room for improvement, what V5's section homes do with each
- No canonical-ontology changes
- No ADD-rule changes
- No parser changes
- No auto-import from PassBack into the canonical glossary surface

---

## 15. Cross-references

- `GLOSSARY_V5_ARCHITECTURE.md` — the section homes referenced throughout this audit
- `legacy_data/inputs/curated/tricks/passback-glossary.txt` — the source corpus (613 lines)
- `legacy_data/inputs/curated/tricks/passback-dicrionary.txt` — supplemental (240 lines)
- `exploration/passback-intake/passback_glossary_staging.csv` — 180-row staging from the PassBack glossary intake pipeline
- `exploration/glossary-synthesis-1/GLOSSARY_COMPARISON_MATRIX.csv` — 108-term per-term comparison (existing curator output)
- `exploration/dictionary-symbolic-card/NOTATION_LAYER_STRATEGY.md` — the 8-layer model that §11.1 references
- `feedback_phased_scope_control.md` — curator-led promotion path for PassBack vocabulary

---

*End of PASSBACK_SYNTHESIS_AUDIT.md*
