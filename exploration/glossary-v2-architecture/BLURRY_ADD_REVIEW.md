# Blurry ADD — Read-Only Doctrine / Data Review

Narrow review of the "blurry +1 / +2" ambiguity flagged in the tranche-2 review note.
Read-only: no production data changed, no glossary rewritten, no scoring ruling made. The
question is only how Glossary V2 should *explain* blurry, and whether the ambiguity is a
data bug, a doctrine question, or a teaching caveat.

## The ambiguity, stated precisely

"Blurry" is a folk label whose structural expansion is **not fixed**, and the platform
resolves it **per named trick**, not by one global number.

- As a **bare set modifier**, the registry records blurry = **+1** — "blurry just implies
  stepping" (a Red retraction). This is the default for loose `blurry X` application and
  for `blurriest`.
- Inside its **canonically named compounds**, "blurry" is folk shorthand for a
  stepping-based stack, and each row carries its own recorded decomposition. Those
  decompositions **disagree on what blurry expands to**, and each is internally consistent:

  | Trick | Recorded decomposition | Blurry expands to | ADD | Check |
  |---|---|---|---|---|
  | `ripwalk` (blurry butterfly) | stepping butterfly | stepping (**+1**) | 4 | 1 + butterfly 3 |
  | `blur` (blurry mirage) | stepping paradox mirage | stepping + paradox (**+2**) | 4 | 1 + 1 + mirage 2 |
  | `blurry_whirl` | stepping paradox whirl | stepping + paradox (**+2**) | 5 | 1 + 1 + whirl 3 |
  | `blurry_torque` | stepping paradox torque | stepping + paradox (**+2**) | 6 | 1 + 1 + torque 4 |
  | `food_processor` | stepping paradox (blender base) | stepping + paradox (**+2**) | 6 | 1 + 1 + blender 4 |
  | `blurriest` (blurry barfly) | flat modifier on barfly | stepping (**+1**) | 5 | 1 + barfly 4 |

So "+1 vs +2" is **not one trick scored two ways.** It is the same folk word meaning
*stepping* in some compounds (`ripwalk`, `blurriest`) and *stepping + paradox* in others
(`blur`, `blurry whirl`, `blurry torque`, `food processor`), over a flat +1 registry
default. The operator reference (`freestyleOperatorReference.ts`, the canonical authority
for operator ADD/structure) records the fuller reading — decomposition `stepping paradox`
— and the public add-analysis, family-card, and structural-alias content all teach blurry
as folk shorthand for the stepping (+ paradox) stack, resolved by composition rather than
by adding a flat modifier.

## Classification: teaching caveat (settled doctrine), with one narrow flag

**It is a teaching caveat, resting on settled-but-layered doctrine — not a live data bug
and not an open doctrine question.**

- **Not a data bug.** Every affected trick row is internally consistent: its ADD equals
  its own recorded decomposition, bracket-count included. The registry note documents the
  carve-out explicitly ("named blurry compounds carry deeper structural decompositions
  where blurry stands for a multi-modifier expansion"). Nothing in the live scoring is
  wrong.
- **Not an open doctrine question.** Red already ruled: flat +1 as the bare-modifier
  default, with each named compound carrying its own recorded expansion. The rule is
  settled; it is just layered (a general default plus per-trick decompositions).
- **It is a teaching caveat** because the folk word invites a reader to expect one fixed
  number, and there isn't one. The glossary's job is to teach *how to read blurry*, not to
  publish a single "blurry = N."

**One narrow item to flag to the curator (not resolved here).** The modifier-registry note
lists "blurry mirage = 3" as a worked example of the flat +1 reading, but the canonical
named trick `blur` (which the structural-alias taxonomy renders as "Blurry Mirage") is 4
via the stepping-paradox expansion. The same surface string thus has two documented
answers — 3 (registry worked example) and 4 (the canonical row and five other sources). The
weight of evidence favors 4 for the named trick; the lone "= 3" example reads as a stale or
under-qualified illustration. Recommend the curator either qualify that example (mark it as
the loose-modifier reading, distinct from the named trick `blur`) or drop it. This is a
doc-clarity flag, **not** a scoring change, and no production data was touched.

## Safest wording for prototype glossary entries

Do not assert a single flat ADD for blurry. Teach it as folk shorthand, resolved per trick.
Recommended prototype prose:

> **Blurry** is a folk label for a stepping-based treatment — a stepping momentum with a
> paradox-style side-change. It is not scored by a single fixed number: the platform reads
> each named "blurry" trick from its own structure. In some it expands to just *stepping*
> (ripwalk = stepping butterfly); in others to *stepping + paradox* (blur = stepping
> paradox mirage; blurry whirl = stepping paradox whirl). So to find a blurry trick's ADD,
> read the trick's own decomposition rather than adding a fixed "blurry" value — the label
> compresses a stack, and which stack depends on the trick.

Guidance for authors:

- Lead with "folk shorthand for a stepping (+ paradox) stack," matching the operator
  reference and the existing public content; do not lead with "+1."
- If a single illustrative number is wanted, use a *named* trick with its decomposition
  shown (blur = stepping + paradox + mirage = 4), never a bare "blurry = +N."
- Keep this a Line/Relates matter; it does not earn a Reveal (it is plumbing that lets the
  compound entries — Blur, Blender, Blur-family tricks — be explained, consistent with the
  tranche-2 finding that the operator layer earns no Reveals).
- The tranche-2 Blurry prototype's current one-line "stored +1 but reads +2 in blur" note
  is accurate as a flag but understates it; when that entry is next revised, adopt the
  wording above (folk label, resolved per trick). Not edited here, per the no-rewrite scope.
