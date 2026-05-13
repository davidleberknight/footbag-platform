# TRADITIONAL_GLOSSARY_PRESERVATION_PLAN

**Project:** GLOSSARY-V5-SYNTHESIS — Task E
**Scope:** Design the coexistence between the V5 movement-language primer (§1–§9) and the traditional alphabetical glossary surface that today's reader expects (§10–§11). Audit existing IFPA + community vocabulary; classify each term into its V5 home; ensure no glossary functionality is lost in the transition.
**Constraints:** Traditional glossary functionality is non-negotiable. The reader who wants "what does *paradox* mean — quick answer" must continue to be served. No canonical-ontology changes.

---

## 1. The core promise

A reader who comes to the V5 glossary expecting a traditional dictionary — search a word, get a definition — must still get exactly that. The primer is additive; the reference is preserved. **Nothing the current glossary does, the V5 glossary fails to do.**

This document is a coexistence design, not a replacement plan. The traditional glossary lives at §10. The primer lives at §1–§9. They share content; they're accessed differently.

---

## 2. What today's glossary does well

Before we redesign, an honest accounting of what the current IFPA glossary already serves:

- **Compact alphabetical lookup.** §1–§12 of the current glossary are mostly flat prose entries; a reader who knows the term they're looking for can land on it via the page's structure.
- **A consistent voice.** The current glossary's prose is short, clear, and free of unnecessary jargon. Definitions average 1–3 sentences.
- **The §13 connective panels.** Six terms (paradox, symposium, ducking, spinning, whirl, pixie) carry richer panels with related tricks, related symbolic groups, and modifier-family deep-links. These already work; V5 preserves them at §9.
- **The notation reference sections (§8 + §9 of the current glossary).** Jobs notation (semantic) and operational notation already have dedicated sections with token references. V5 absorbs both into §7.
- **Glossary anchors via `glossaryAnchors.ts`.** Every term in §3 modifier-reference + §10 foundational-tricks already has a stable `id="term-{slug}"` anchor. Deep links from progression and modifier pages already route through the resolver.
- **The four-layer architecture from `glossary-synthesis-1/GLOSSARY_ARCHITECTURE_V4.md`** (canonical / educational / symbolic / operational). V5 builds on this; doesn't dismantle it.

Each of these capabilities migrates intact into V5. The primer doesn't replace them; it sits *alongside* them.

---

## 3. The classification framework

Every term that the current glossary defines — and every term the primer + new framework introduces — falls into one of six categories. The category determines the term's V5 home.

| Category | V5 home | Example |
|---|---|---|
| **Canonical primer term** | Defined in §1–§9, alphabetical entry in §10 | *dex, hippy, paradox, mirage, butterfly* |
| **Canonical reference term** | Definition primarily in §10 (with primer back-ref where relevant) | *Tiltless, Guiltless, BOP, magic hop* |
| **Operator term** | Primer + framework treatment in §6, lookup in §10 | *stepping, pixie, atomic, nuclear, spinning* |
| **Folk / historical** | §11, with cross-reference from §10 when canonical equivalent exists | *Blurry Butterfly, alpha/beta/gamma, Toe Blur* |
| **Ambiguous / contested** | §11 with explicit "community variant" framing | *magic hop timing, symp shorthand, near/far* |
| **Specialized jargon** | §11 or omitted from V5 if no learner-facing value | *Brocka mod, crispy DLO, certain regional slang* |

The classification is not crisp at the edges. A term like *symposium* is both a canonical primer term (it's in §6 as an operator) AND a canonical reference term (it has its own §10 entry). The categories are pedagogical guidance, not rigid taxonomy.

---

## 4. Term-by-term audit (the canonical-active surface)

The following terms are in active community use and should appear in V5. For each: V5 home, brief justification.

### 4.1 Run-quality terms

The classic IFPA difficulty tiers. Today they lead the glossary; in V5 they move to §10 (reference) with their primer / framework context provided as forward references.

| Term | V5 home | Justification |
|---|---|---|
| Tiltless | §10 + §6 forward-ref to ADD math | Run-quality tier; defined by ADD floor, which is taught in §6 |
| Guiltless | §10 + §6 forward-ref | Same |
| Tripless | §10 + §6 forward-ref | Same |
| Fearless | §10 + §6 forward-ref | Same |
| Beastly | §10 + §6 forward-ref | Same |
| Godly | §10 + §6 forward-ref | Same |
| Genuine | §10 (subset of Guiltless excluding BOPs) | Genuinely a reference term |
| BOP (Butterfly, Osis, Pdx Mirage) | §10 + §5 cross-ref | Names three canonical bases; lookup-first term |

The lead of today's glossary becomes the back-end of V5's reference section. This reflects the architectural correction in `PASSBACK_SYNTHESIS_AUDIT.md` §2: scoring vocabulary comes *after* mechanical vocabulary, not before.

### 4.2 Trick-component vocabulary

The vocabulary the primer introduces. Each gets a primer definition AND a §10 lookup entry.

| Term | Primer home | §10 entry |
|---|---|---|
| dex / dexterity | §1.5, §3 | short def + "Learn more → §3" |
| in dex, out dex | §1.6, §3 | short def + "Learn more → §3" |
| hippy dex | §1.5, §3 | short def + "Learn more → §3" |
| leggy dex | §1.5, §3 | short def + "Learn more → §3" |
| full dex, half dex | §3 | short def + "Learn more → §3" |
| set (component) | §1.7, §4 | short def + "Learn more → §4" |
| stall / delay | §1.3, §2 | short def + "Learn more → §2" |
| uptime, midtime, downtime | §1.7, §4 | short def + "Learn more → §4" |
| attack | §4 | short def + cross-ref |
| dex window, deep dex, thin dex, shoey, the, scoopy | §3 (execution-quality cluster) | short def cluster + "Learn more → §3" |

Every primer term gets the same dual-surface treatment: a teaching home + a lookup entry. The lookup entry is *short* (one sentence) so the reader scanning §10 alphabetically doesn't re-read the primer.

### 4.3 Contact surface vocabulary

Same treatment.

| Term | Primer home | §10 entry |
|---|---|---|
| toe | §1.3, §2 | short def + "Learn more → §2" |
| clipper | §1.3, §2 | short def + crossbody requirement note |
| inside, outside, heel, sole | §2 | short def cluster |
| knee, calf, back, head, shoulder | §2 | short def cluster |
| kick, stall, roll, transfer, wrap, walkover, rake, burger, pincher | §2 (contact-type cluster) | short def cluster |
| rooted, rooted catch | §2 | short def |

### 4.4 Side and direction

| Term | Primer home | §10 entry |
|---|---|---|
| ss / same-side / near | §1.4 | short def — note the three equivalents |
| op / opposite / far | §1.4 | short def — note the three equivalents |
| in (direction) | §1.6, §3 | short def |
| out (direction) | §1.6, §3 | short def |
| xbd / crossbody | §1.3, §2 (clipper definition) | short def + clipper cross-ref |

### 4.5 Operator vocabulary (the heart of §6)

Each operator has a framework treatment in §6 + a §10 lookup entry.

| Operator | §6 home | §10 entry |
|---|---|---|
| stepping | §6.3 | short def + "Operator framework → §6.3" |
| pixie | §6.4 | short def + "Operator framework → §6.4" |
| ducking | §6.5 | short def + cross-refs to weaving/diving/zulu |
| weaving | §6.5 | short def + cross-ref to ducking |
| diving | §6.5 | short def + cross-ref to ducking |
| zulu | §6.5 | short def + cross-ref to ducking |
| spinning | §6.6 | short def + "Operator framework → §6.6" |
| gyro | §6.6 | short def + cross-ref to spinning |
| inspin / in-spin | §6.6 | short def + cross-ref to spinning |
| paradox / pdx | §6.7 | short def + "Operator framework → §6.7" |
| symposium / symp | §6.8 | short def + cross-ref to symple, muted |
| symple | §6.8 | short def + cross-ref to symposium |
| muted | §6.8 | short def + cross-ref to symposium |
| atomic | §6.9 | short def + cross-ref to nuclear, quantum |
| nuclear | §6.9 | short def + cross-ref to atomic, paradox |
| quantum | §6.9 | short def + cross-ref to atomic |
| furious | §6.9 | short def + cross-ref to paradox |
| alpine | §6.10 | short def + conditional-branch note |
| crispy | §6.10 | short def + community-rarity note |
| xdex | §6.7 (sibling of paradox) | short def + cross-ref to paradox |

Each operator's §10 entry is a *summary*: 1–2 sentences naming the body region, the window it transforms, and the ADD contribution. The full operator treatment (mechanic, transformation rule, worked examples) lives in §6.

### 4.6 Composition vocabulary

The string / drill / combo grammar from §8.

| Term | §8 home | §10 entry |
|---|---|---|
| string / run | §8 | short def |
| combo | §8 | short def + cross-ref to string |
| link | §8 (specifically a 2-trick combo) | short def |
| drill | §8 | short def |
| marathon drill | §8 | short def + cross-ref to drill |
| rewind combo | §8 | short def |
| mirror (link) | §8 | short def |
| b2b / back-to-back | §8 | short def |
| BSOS / BSOR | §8 | short def — bag-and-sides acronym |
| multiplier, x[N] | §8 | short def |
| shuffle combo / shuffling | §8 | short def |
| LIMP, CLIMP, Everything drill | §8 | short def cluster |
| midstring | §8 | short def |
| dropless | §10 (lookup-first; cross-ref to §8) | short def |
| BSOS bee sauce | §11 (folk slang) | short def + folk note |

### 4.7 Notation vocabulary

§7 covers the notation language; §10 carries the lookup entries.

| Term | §7 home | §10 entry |
|---|---|---|
| Jobs notation | §7 | short def + history note |
| semantic notation | §7 | short def + cross-ref to Jobs notation |
| operational notation | §7 | short def + cross-ref to semantic |
| technical name | §7, §8 | short def — the structural name of a trick |
| nickname | §7, §8, §11 | short def — folk single-token name |
| string notation | §8 | short def |
| component flag ([DEX], [DEL], [BOD], [XBD], [PDX], [XDEX]) | §7 | short def cluster |
| sequence operator (>, >>) | §7 | short def |
| pre-state flag ((back), (front), (no plant while), (rooted)) | §7 | short def cluster |

### 4.8 Topology vocabulary

§9 is the home. §10 carries short lookup entries.

| Term | §9 home | §10 entry |
|---|---|---|
| topology group | §9 | short def |
| movement archetype | §9 | short def |
| equivalence cluster | §9 | short def |
| symbolic group | §9 | short def |
| observational layer | §9 | short def + framing — the "we observe this" lens |
| canonical layer | §9, cross-ref to dictionary | short def — IFPA-owned classification |

### 4.9 Execution-quality vocabulary

Per §3 of the primer.

| Term | Primer home | §10 entry |
|---|---|---|
| clean | §3 (execution cluster) | short def |
| sloppy | §3 | short def |
| pulled / slurry set | §3 | short def + cross-ref |
| froggy | §3 | short def |
| over-dexed | §3 | short def |
| bailed | §3 | short def |
| footed | §3 | short def |
| handcatch / seal | §3 | short def |

---

## 5. Folk / historical vocabulary → §11

The current glossary tucks community vocabulary inside the canonical entries. V5 separates them deliberately.

§11 (Community / Historical Vocabulary) holds:

### 5.1 Deprecated names

Terms whose canonical replacement is in §1–§10:

| Folk name | Status | Canonical replacement |
|---|---|---|
| Blurry Butterfly | Deprecated by pt11 ruling | Ripwalk (Stepping Butterfly) |
| Toe Blur | Folk single-token | Quantum Mirage |
| Spyro | Folk historical | Inspin |
| Toe Ripwalk | Deprecated | Quantum Butterfly |

Each entry in §11 shows the deprecation status, the canonical replacement, and (when relevant) the historical context for why the folk name persisted.

### 5.2 Cultural ambiguities (PassBack-audit-surfaced)

Terms with community variance the canonical glossary shouldn't pretend to resolve:

| Term | Variance | §11 treatment |
|---|---|---|
| magic hop | "during catch" / "during set" / "both" — community split | §11 entry documents all three readings; no resolution |
| symp | shorthand for *symposium* OR *symple* depending on context | §11 entry cross-references both canonical §6.8 operators |
| near / far | older register for ss / op | §11 entry notes the register; canonical preference is ss/op |
| in-(everything) | community usage applies to spinning, gyro, full trick names | §11 entry surfaces the elasticity of the prefix |
| alpine domain | covers duck and dive only, not weaving or zulu | §11 entry documents the restriction |

### 5.3 Specialized / rarely-used terms

Vocabulary that exists in community usage but doesn't warrant primer treatment.

| Term | §11 treatment |
|---|---|
| crispy | Documented as folk variant; canonical preference is to use the technical name |
| alpha / beta / gamma (per-dex symposium variants) | Documented as alternate vocabulary for FS/BS/Full Symp; canonical preference is FS/BS/Full Symp |
| Brocka mod | Equipment detail; documented for cultural completeness; not load-bearing pedagogically |
| Cloud / Dragon / Flapper (less-common contacts) | Documented as folk vocabulary; canonical contacts are toe / clipper / inside / etc. |
| stomping | Old-school component; recorded for historical completeness |
| trials | Trick variation involving obstacles; documented in §11 |

### 5.4 Era-specific vocabulary

Terms whose primary purpose is cultural / historical record.

| Term | Era | §11 treatment |
|---|---|---|
| hacky sack | 1980s common usage | Documented; canonical is "footbag" |
| Adidas Rod Laver | Shoe model, 1990s–2010s | Equipment detail with cultural note |
| Quantums (shoe) | 2010s+ | Equipment detail with the trick "Quantum" disambiguation |
| Phantom (Q sport variant) | Footbag golf-style game | Documented as non-freestyle |

§11 isn't a dumping ground; it's a deliberate home for vocabulary that doesn't fit the canonical-active set but matters for cultural / historical completeness.

---

## 6. The lookup-first reader experience

A reader who lands on the V5 glossary wanting "what does *paradox* mean" experiences:

1. **They search or scan §10 alphabetically.** §10 is sorted, anchored, indexed.
2. **They land on the *paradox* entry.** Short definition: "A hip pivot between two dexes on the same set. +1 ADD body modifier. The body shifts sides while the bag stays in the air, returning the leg to its starting foot." Two sentences.
3. **Below the definition: "Operator framework → §6.7"** — the link to the framework treatment.
4. **Below that: "See also → paradox-family panel"** — the link to the §9 connective panel.
5. **Below that: "Used in tricks → paradox-mirage, paradox-whirl, montage, ..."** — links to dictionary entries.

Three layers of depth. The reader can stop at layer 1 (the quick definition) or follow any layer (framework treatment, connective panel, dictionary uses) for more depth.

This is the V5 promise: the lookup-first reader gets a fast answer; the curious reader has an obvious next step; the learner has a teaching home.

---

## 7. The learner-first reader experience

A reader who comes to the glossary intending to learn freestyle from scratch experiences:

1. **They land on §1 — the primer.** No need to know what to search.
2. **They read top-to-bottom or follow §12 pathways.**
3. **As terms appear in the primer, each is highlighted on first use** (per the PassBack convention) and has a hover-or-click anchor to its §10 entry for quick re-lookup.
4. **When they reach §6 and meet operators, the framework treatment teaches the concept; §10 lookups support recall.**
5. **When they finish §1–§9, they can navigate to the dictionary, the modifier-family pages, the walking-progression, the component view — all with the language to read what they find.**

This is what makes the dual surface work. The primer surfaces the language; §10 surfaces the words; the cross-linking lets the reader move between them at their own pace.

---

## 8. Coexistence rules

The two surfaces share content but don't duplicate it. Rules:

1. **A term defined in the primer gets a §10 entry that is shorter than the primer treatment.** §10 entries are 1–2 sentences; primer treatments are paragraphs. The §10 entry includes a forward reference to the primer.
2. **A term whose canonical home is §10 (e.g., *BOP*) gets a §10 entry of normal length plus a cross-reference to wherever it's used in the primer (e.g., §5 for *Butterfly, Osis, Paradox Mirage*).**
3. **A term whose home is §11 (folk / historical) appears in §10 as a "see §11" pointer.** §11 carries the full treatment; §10 carries the disambiguation.
4. **A term that exists in two canonical contexts** (e.g., *symposium* as both an operator in §6.8 and a reference term in §10) gets a §10 entry that disambiguates the contexts and links to both.
5. **Anchors are stable.** The existing `id="term-{slug}"` convention extends to every §10 entry. Inbound links from `glossaryAnchors.ts` (and from the dictionary's deep-links) continue to work.

---

## 9. Terms the V5 glossary does NOT preserve

A small number of terms in the current glossary or community usage are deliberately *not* migrated:

- **Vocabulary that only appeared once in a curator's prose and never spread.** These have no inbound references; the lookup utility is zero. Quietly retired.
- **Terms whose definitions were always conjectural** (e.g., "some players use X to mean Y, others use X to mean Z, no consensus"). These move to §11 with the consensus note ("the term is used inconsistently in the community"); they're not promoted to canonical entries.
- **Equipment-only vocabulary that doesn't serve learners** (e.g., extremely specific shoe-mod jargon). These get §11 treatment if they're historically interesting; omitted otherwise.

These retirements are individually small but collectively significant: the V5 glossary is *curated*. Every entry justifies its presence either by being canonical, by being culturally important, or by serving an explicit pedagogical role.

---

## 10. Migration mechanics (curator perspective)

For each term in today's glossary or community usage:

1. **Classify** into one of the six categories from §3.
2. **Identify its V5 home.**
3. **Write (or migrate) its §10 entry** with the short definition + cross-references.
4. **If its home is §1–§9, write or refine the primer treatment.**
5. **If its home is §11, write the historical / folk / ambiguous treatment.**
6. **Verify the anchor convention applies** (`id="term-{slug}"` or `id="glossary-panel-{slug}"`).
7. **Add any inbound cross-references** from other §10 entries or primer sections.

This is curator-led work. The architecture and this preservation plan provide the framework; curators write the entries.

No automation. No auto-import. No bulk migration. Each entry is reviewed.

---

## 11. The §10 entry template

Every §10 entry follows the same shape, regardless of which category it belongs to:

```
TERM (with anchor id="term-{slug}")

  Short definition (1–2 sentences).

  [optional] Cross-reference to primer / framework section.
  [optional] Cross-reference to connective panel (§9).
  [optional] Cross-reference to community-historical entry (§11).
  [optional] Links to representative tricks in the dictionary.
```

Three sections of optional cross-references, none of which is required. Some entries (purely lookup terms) carry only the short definition. Some entries (operator terms with framework treatment and dictionary uses) carry all three.

The template is consistent across §10. The reader who scans alphabetically gets a predictable shape on every entry.

---

## 12. The §11 entry template

Different from §10. §11 entries are usually longer because they carry context.

```
TERM (with anchor)

  Status: deprecated / folk / historical / ambiguous / specialized

  Description: 2–4 sentences. What the term means; when it was used; who uses it.

  [if deprecated] Canonical replacement: [term] (link to §10 or §6)
  [if ambiguous] Variants: [list of readings, each with context]
  [if specialized] Domain: where the term lives (regional / era / sub-community)
```

§11 is permitted more length because it's documenting cultural state, not delivering quick answers. A reader who lands on §11 is already in a "tell me about this" mood.

---

## 13. Constraints honoured

- Traditional glossary functionality preserved
- All canonical-active terms have V5 homes
- Folk / historical / ambiguous terms preserved in §11
- Anchor convention preserved (`id="term-{slug}"`)
- Deep-link resolver (`glossaryAnchors.ts`) continues to work
- §13 connective panels preserved at §9 of V5
- No canonical-ontology changes
- No ADD-rule changes
- No PassBack wording reproduced
- Curator-led migration; no automation

---

## 14. Cross-references

- `GLOSSARY_V5_ARCHITECTURE.md` — defines §10 and §11 at high level; this plan operationalises that definition
- `PASSBACK_SYNTHESIS_AUDIT.md` — surfaces the folk-ambiguities (magic hop, symp, near/far, etc.) that §11 documents
- `MOVEMENT_LANGUAGE_PRIMER_DRAFT.md` — the primer home for many of the terms classified here
- `CORE_TRICK_GRAMMAR_DRAFT.md` — §5 home for trick-name vocabulary
- `MODIFIER_OPERATOR_FRAMEWORK.md` — §6 home for operator vocabulary
- `src/services/glossaryAnchors.ts` — the deep-link resolver that every §10 entry uses
- `feedback_phased_scope_control.md` — curator-led promotion is the established cadence

---

*End of TRADITIONAL_GLOSSARY_PRESERVATION_PLAN.md*
