# Glossary V2 — Pilot Review

Collective review of the fifteen flagship prototypes. Read adversarially against the
frozen architecture. The point is not to praise the entries; it is to find where the
architecture bends under real content, before any code is written.

Headline: **the three-layer mechanic works, the voice works, and the tiering
discriminates correctly — but the insight model has one structural flaw and the pilot
set has a composition gap, and both should be fixed before implementation.**

---

## 1. Duplicated insights (the main finding)

Writing the entries surfaced a duplication the architecture did not anticipate,
because it lives *inside* the insight list itself.

**Three entries carry what is really one meta-insight:**
- **Blur** — "the name is the structure" (blur = blurry mirage).
- **Torque** — "famous tricks are compressed formulas" (torque = miraging osis).
- **Butterfly** — "a whole family is one atom plus operators" (the walking tricks).

These read as three separate revelations, but they are three *facets of one idea*: the
sprawling vocabulary reduces to a small algebra of atoms and operators. A reader who
meets all three in one sitting feels the same "aha" three times, and repetition dulls
a revelation faster than anything. In the pilot they are even cross-linked to each
other ("this is the mirror image of the torque lesson"), which papers over the
redundancy but confirms it — they keep reaching for the same point.

**This is the load-bearing finding.** The `~12 insights` list treats these as three
independent entries. They are one insight with three depths:

1. *Name level* — a short name hides a structural name (Blur).
2. *Formula level* — a name that sounds primitive is a base plus an operator (Torque).
3. *Family level* — a whole named family is one atom extended (Butterfly).

**Architecture change:** collapse them into a single insight — call it *the vocabulary
is a small algebra wearing many names* — with **three sequenced canonical homes**, one
per depth, explicitly ordered so the reader experiences a *deepening* rather than a
loop. Blur introduces it, Torque deepens it, Butterfly completes it. The Reveal on each
should name where in that arc it sits ("this is the same lesson blur taught, one level
down") rather than restating the whole point. That turns the redundancy into a
staircase.

A second, milder overlap: **Toe Stall's** Reveal ("a trick is a journey between
stalls") and **Clipper Stall's** ("the whole sport is one journey, open shelf to
crossed shelf") are close cousins. They are distinct enough to keep — one is about the
stall as a *state*, the other about the *dominant journey* — but Clipper's should lean
harder into the topology (toe and clipper dominate everything) so it is not heard as a
second helping of Toe's point.

---

## 2. Weak Reveals

Audited against the standard (*does it change how you think?*), **no Reveal is weak on
its own merits** — which is itself a finding: it means the standard is doing its job at
the entry level. Every keystone Reveal passes; the two Tier-2 entries (Barrage, Double
Over Down) correctly carry none.

But two Reveals are weak *by position*, not by content:

- **Around the World's** "every other dex is an edit of the full orbit" is strong, but
  it sits three entries before Mirage's "direction is structural" and one section before
  Whirl's "one distinction, two lineages." Three genuine revelations inside six
  mirror-family entries is too dense. The reader's capacity for "aha" is finite per
  page; stacking keystones exhausts it.
- **Orbit's** reference-Reveal ("completes a quietly beautiful square") is doing real
  teaching, arguably more than a pointer should — it is nearly a fourth keystone smuggled
  into a reference slot.

**Architecture change (pacing):** the flat glossary never had to think about the
*spacing* of revelations; the layered one does. Keystones should be spaced so a reader
opening Reveals top-to-bottom hits one strong idea, then connective tissue, then the
next — not three in a row. Concretely, within the mirror family, let **Mirage** own the
Mirror Law revelation and demote **Around the World** and **Orbit** to structural-fact
Reveals that *set up* Mirage rather than competing with it. One keystone per cluster,
not three.

---

## 3. Entries that do not need three layers

The tiering held, with one simplification the pilot made obvious.

- **Barrage** and **Double Over Down** (Tier 2, no Reveal) are correct and feel
  complete. The absence of a Reveal is not a hole; it is honesty. Good validation.
- **The "reference Reveal" is an unnecessary layer.** Illusion, Swirl, Orbit, and
  Blender were given Tier-3-reference status with a Reveal that just points elsewhere
  ("see Mirage"). In practice that pointer wants to live in **Relates** or **Explore**,
  not in its own expander. Illusion's real content is "mirage reversed" (a relationship)
  plus a link to the Mirror Law — both fit Relates. Giving it a third expander that only
  says "go read the other entry" is a layer that pays nothing.

**Architecture change:** drop the "Tier 3 (reference)" category entirely. There are
**two kinds of entry**: those that are the *canonical home* of an insight (they have a
Reveal) and everything else (Line + Relates + Explore, with insight-links inline in
Relates). This is simpler, and it makes "having a Reveal" mean exactly one thing — *this
entry is where an insight lives* — which is precisely the signal a reader should learn
to trust. Under this change the fifteen split as: **six Reveal-bearing homes** (Toe
Stall, Clipper Stall, Mirage, Whirl, Torque/Blur/Butterfly-as-one-arc, Double Down) and
**nine connective entries.** Far fewer Reveals than the architecture implied — and that
is correct. Revelations should be rare.

---

## 4. Missing concepts (the composition gap)

The pilot set is **heavy on atoms and nearly empty of operators**, and that imbalance
undermines its own best insight. The "compressed formula" revelation depends on the
reader knowing what the operators *are*:

- Torque is "miraging osis" — but **miraging**, **osis**, and the whole idea of an
  operator are undefined in the set.
- Blur is "stepping + paradox + mirage" — **stepping** and **paradox** are undefined.
- Butterfly's walking family is "butterfly + stepping/pixie" — **stepping** and **pixie**
  undefined.

A reader who meets these Reveals cannot actually *do* the decomposition, because half
the vocabulary in it is unglossed. The insight is asserted, not demonstrated. Three
concepts are missing and are load-bearing:

1. **Osis** — a core atom, and *more* foundational than torque or blender (both are
   built on it). It should be a keystone, and it should probably have been in the pilot
   instead of, or alongside, its own compounds.
2. **The operators** — at minimum miraging, whirling, stepping, paradox, blurry. Without
   them the "algebra" is a claim with no worked example. The single most important
   addition.
3. **Dexterity ("dex")** — the fundamental unit. Every entry leans on it; nothing
   defines it. It is the most-used word in the pilot and has no home.

Smaller gaps: **set vs operator** (referenced in Toe Stall, undefined), and **cross-body
/ the clipper landing** as a concept (leaned on constantly).

**Architecture change:** the first production tranche must be **atoms *and* operators
together**, not atoms first. The compressed-formula arc (Blur→Torque→Butterfly) only
teaches if the operators it names are one click away. Recommend adding Dexterity, Osis,
and the five core operators (miraging, whirling, stepping, paradox, blurry) to the very
first authoring batch, and treating "an operator" and "a dex" as keystones in their own
right.

---

## 5. Places the architecture should change before implementation

Consolidated from the above, in priority order:

1. **Collapse the algebra meta-insight into one staircase** (§1). The single most
   important change. Blur/Torque/Butterfly become three sequenced depths of one idea, not
   three revelations.
2. **Drop the "reference Reveal" tier** (§3). Two entry kinds: insight-home (has a
   Reveal) or connective (does not). Simpler, and it makes a Reveal *mean* something.
3. **Author atoms and operators together** (§4). The decomposition reveals are inert
   without operator entries; add Dexterity, Osis, and five operators to the first batch.
4. **Pace the keystones** (§2). One revelation per cluster; space them so the reader
   meets aha / connective / aha, not three in a row. New concern the flat glossary never
   had.
5. **The Reveal needs a teaser/full split** (voice, below). The pilot Reveals are
   essay-length by instruction; collapsed, a Reveal should show a one-line hook and open
   to the full text. The component may want four grades — Line / Relates / Reveal-hook /
   Reveal-full — rather than three.
6. **Audit the Explore destinations** (below). "Browse by terminal," "browse by base,"
   and the named essays are invented link targets; the glossary-as-journey only works if
   the destinations exist. Before shipping Explore, confirm each target is a real route
   or scope it as build.

---

## What validated (keep these)

- **The three-layer mechanic reads naturally.** Line → Relates → Reveals is a real
  reading experience, not a forced template.
- **The voice.** Concrete-physical Line, connective Relates, essayistic Reveal is the
  right register — a good museum wall text, not a spec sheet. Freeing it from today's
  glossary wording was the right call; the new voice is warmer and teaches harder.
- **The insight-thread is the reward, confirmed.** Cross-links between Reveals ("this is
  the mirror image of the torque lesson," "you know half the dictionary without meeting
  it") create the rediscovery feeling the architecture promised. This is the pilot's
  happiest result — the reward mechanic is real in prose.
- **The canonical-home + reference mechanism prevents duplication** at the entry level
  (Illusion does not restate Mirage). The flaw in §1 is one level up (the insight list
  itself has redundancy), not in the mechanism.
- **Tier 2 is honest.** Barrage and Double Over Down feel complete without a Reveal;
  the absence discriminates correctly.
- **Foundational Bases earn their treatment.** Toe Stall and Clipper Stall carry the
  page differently — the "you will return here" framing and the hub Explore make them
  feel like home bases, not just big entries.
- **Double Down proves the family boundary works.** A glossary entry taught a
  *family-level* structural insight (one structure, several variants) while linking out
  to the family page for the roster — exactly the anti-duplication contract, working.

---

## Voice notes (for the style, once frozen)

- Lead every Line with the *body*, not the metric — what the foot does, pictured. This
  held throughout and it is the right instinct.
- The Reveal earns one figurative move ("the punctuation, not the sentence"; "the loop
  drawn clockwise"), not more. Restraint keeps them from turning purple.
- Never hedge in a Reveal. "Direction is structural" lands; "direction is arguably a
  kind of structural feature" would die. The confidence *is* the teaching.
- The best Reveals reframe rather than inform, every time: *stall as state*, *trick as
  journey*, *name as compression*, *family as one structure*. When drafting a new
  Reveal, write the reframe first and check it against the ~12-insight list; if it is not
  on the list and is not a new admission to it, it is a Relates line in disguise.

---

## Recommended next step

Do **not** build the component yet. First, apply changes 1–4 to the architecture
(collapse the meta-insight, drop reference-Reveals, add the operator/dex/osis entries to
the batch, pace the keystones), then author a **second pilot tranche of operators and
the missing atoms** (Dexterity, Osis, miraging, whirling, stepping, paradox, blurry) so
the compressed-formula arc can be tested end to end — a reader clicking from Torque's
Reveal into "miraging" and "osis" and finding real entries. Only once that arc reads
cleanly across both tranches is the content mature enough to drive the UI.
