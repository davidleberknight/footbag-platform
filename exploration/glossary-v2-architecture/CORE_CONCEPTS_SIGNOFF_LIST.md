# Core Concepts — Production Sign-off List

For James. Six Core Concept entries put forward for the same explicit production sign-off the
twelve atoms received. Surface Frame is held. This is the copy you are signing off; the
prototype prose is shown verbatim, with the production adaptations (below) applied only at
implementation, not now.

## The six entries

| Entry | Kind | Reveal? | Verdict |
|---|---|---|---|
| Direction | connective (insight homed at Mirage) | no | READY |
| Side | insight home (side is structural) | yes | READY |
| Set vs Operator | insight home (role, not mechanic) | yes | READY |
| Composition | connective (algebra homed at Blur/Torque/Butterfly) | no | READY |
| ADD / notation checksum | insight home (bracket count equals ADD) | yes (late) | READY |
| Cross-body | connective | no | READY |

Three carry a Reveal (Side, Set vs Operator, ADD); three are connective (Direction,
Composition, Cross-body). Same "Reveals are rare" discipline as the atoms.

---

### Direction — connective, no Reveal
**Line.** A dexterity travels one of two ways around the leg, inward or outward. The
direction is set the instant the foot starts the bag moving, and it is one of the two
choices that make one dex a different move from another.
**Relates.** Direction pairs with side to distinguish the two-point atoms (see Side).
Reversing a dex's direction is not a softer or harder version of the trick, it is a
different trick with its own name, trained and scored separately, which is what mirage and
illusion teach and the heart of the Mirror Law. Every atom has a direction mirror.
**Reason:** the direction axis, kept connective so it does not re-fire Mirage's Reveal.

### Side — insight home, Reveal
**Line.** A dexterity works either on your own side, the side of the leg you are standing on,
or crosses to the opposite side. Same-side and opposite-side describe where the bag travels
relative to your plant leg.
**Relates.** Side is the second of the two choices that define a dex, alongside direction.
The four two-point atoms lay both axes out: around the world and orbit same-side, mirage and
illusion opposite-side. Which side the bag travels to is part of what the trick is.
**Reveal.** Two tricks can share landing, difficulty, even direction, and still be two
different tricks because one stays on your side and the other crosses the body. Side is a
full structural axis. Hold direction and side as two switches, and the crowd of
near-identical pairs stops being confusing: each atom flips on either switch, and each flip
is a separately named, separately scored trick.
**Reason:** earns the side-is-structural Reveal; distinct from direction.

### Set vs Operator — insight home, Reveal
**Line.** The same movement can play two jobs. When it launches a trick it is a set; when it
modifies a trick already under way it is an operator. Set or operator is a question of the
job, not of the movement itself.
**Relates.** This is the hinge between atoms and compounds: a trick is a base, often launched
by a set, with operators laid over it (see Composition). Barrage and furious are the same
two-dex structure named twice, a barrage as the trick you perform, furious as a modifier.
**Reveal.** Whether a movement is a set or an operator is decided by where it sits in the
trick, not written into the movement. So you cannot sort the vocabulary by looking at
movements in isolation; you ask what job each piece is doing. Once role comes apart from
mechanic, the operator layer becomes a small set of jobs the atoms you know can be assigned
to, not a second pile to memorize.
**Reason:** role-not-mechanic is a genuine reframe, carried by barrage/furious.

### Composition — connective, no Reveal
**Line.** A freestyle trick is usually a structure, a base move with operators added to it.
"Miraging osis," "blurry mirage," and "two dexes in one set" are all compositions. To read a
trick is to read its parts.
**Relates.** Composition is the premise that makes the vocabulary legible: a base plus
operators gives a named compound, and the count of parts is what the trick scores (see ADD).
It is why torque reads as "miraging osis." The payoff, that famous short names are secretly
formulas, is the algebra homed at Blur, Torque, and Butterfly, deliberately not pre-fired
here.
**Reason:** the premise the algebra Reveal builds on; correctly carries no Reveal of its own.

### ADD / notation checksum — insight home, Reveal (late)
**Line.** ADD (added difficulty) is freestyle's difficulty score, and it is literal: it
counts the structural parts of a trick. One point per dex, one per operator laid on. A bare
stall is one point; a barrage, two dexes in one set, is three.
**Relates.** Because ADD is a count of parts, it follows straight from composition: read a
trick's structure and you can read its score. The same additive logic is what the notation,
taught later, turns into something you can check yourself.
**Reveal.** Once freestyle is written down, the score checks itself: each scoring part sits
in its own notation bracket, so the bracket count is the ADD and a reader can confirm it,
trusting no one. A scoring system that audits its own arithmetic in front of you is the
strongest answer to "how do you know that trick is worth that much?"
**Reason:** the bracket-count checksum. Note: the Reveal lands late (with the notation
section), so in a scoring-section slice ADD ships as the count-the-parts idea and the
checksum Reveal attaches later.

### Cross-body — connective, no Reveal
**Line.** Cross-body describes what the working foot does with the body: instead of working
the bag in front of you on your open side, the foot reaches across and works behind the
opposite leg, the legs crossing so the bag is handled on the far side.
**Relates.** Cross-body defines the clipper (a clipper stall is a cross-body catch) and is
the shared signature of the atoms that land there (whirl, swirl, butterfly, osis) and their
compounds. It is a body configuration, not a travel direction: whirl finishes cross-body on
the opposite side, swirl cross-body on its own side, so it is a distinct axis from Side and
from Surface Frame. In notation it is the scored cross-body bracket, exactly the extra point
a whirl has over a mirage.
**Reason:** closes the last prerequisite the compounds walk surfaced; grounded in notation.

---

## Held: Surface Frame

Surface Frame stays **held**, not in this sign-off. Its public prose is gated on the
reverse-swirl notation verification, and it carries the direction-reversal family guard. Do
not render it or its Reveal until that verification settles; the whirl and swirl atom cards
already ship the settled distinction without it.

## Production adaptations applied at implementation (not doctrine changes)

These are the same mechanical steps the atoms slice used; they do not change what you are
signing off:

- **Em dashes removed** from rendered copy (the prototypes above use them; production copy
  uses commas/parentheses per the visitor copy standard).
- **Reveals tightened to two to four sentences**, no essay-length paragraphs, matching the
  standard you set for the atoms.
- **No formula line** on these entries: unlike the atoms, Core Concepts are abstract hubs,
  not tricks with operational notation, so their Line is the plain conceptual description,
  not a "set + dex + catch" recipe.
- **Explore links stay unrendered** for now (their targets, the essays and other concept
  entries, are not built yet, so linking would create broken links).

## Next slice after sign-off: the Dexterities section only

Same in-place pattern as the atoms: existing `/freestyle/glossary` route, one existing
section, per-entry collapsibles, no global toggle, no essays, no Surface Frame, rendered-page
tests.

- **Direction** converts in place onto the Dexterities section's existing "Direction"
  subsection.
- **Side** converts in place onto its existing "Relative-side relationships" subsection.
- **Cross-body** has **no existing subsection in the Dexterities section** to convert. It is a
  clean fit for the Surfaces section (it defines the clipper) rather than a new Dexterities
  subsection. Recommendation: keep the Dexterities slice to Direction and Side, and place
  Cross-body in the slice that converts the Surfaces section, so every slice stays a true
  in-place conversion of an existing section rather than adding a new subsection.

Set vs Operator and Composition (the grammar) and ADD (scoring) are their own later
one-section slices, not part of the Dexterities slice.
