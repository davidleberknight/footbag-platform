# SCALE-3 Blender Mini-Batch — Prose Drafts

Two-row mini-batch. Closes most of the blender family in one surgical pass; the
third non-pilot row (`food-processor`) is deferred for ontology review (math
gap: 1 modifier link on a 4-ADD base does not reach the asserted 6 ADD; the
`blurry` modifier's notes mark this class of compound as carrying deeper
structural decompositions).

## Pool inventory (blender family, 4 rows)

| slug | ADD | modifiers | mod-links | records | op-notation | prose | risk | action |
|---|---|---|---|---|---|---|---|---|
| blender | 4 | (base; transitively Whirling Osis per pt11) | 0 | 1 | – | – | LOW | enrich (mini-batch) |
| paradox-blender | 5 | paradox | 1 | 2 | – | – | LOW | enrich (mini-batch) |
| food-processor | 6 | blurry (1 link, ADD-math gap to asserted 6) | 1 | 3 | – | – | **HIGH** | **defer — pt12-style decomposition review** |
| mind-bender | 6 | ducking + paradox | 2 | 0 | Y | PILOT | n/a | already enriched (SCALE-1) |
| spender | 6 | paradox + spinning | 2 | 2 | Y | PILOT | n/a | already enriched (SCALE-1) |

**Note on the blender base row.** Its `trick_family` column is `osis`, not
`blender`, because pt11 settled blender = Whirling Osis (transitive). The
trick_family chip rendered on the page will read `osis family`, not `blender
family`. The prose acknowledges this without leading with it — pt## process
language is forbidden on public-facing prose per the editorial standard.

## Cadence design

Two rows, two distinct rhetorical patterns across each axis. Family vocabulary
(blender, osis, rotation, stall, body, paradox) preserved as intentional.

| row | opening cadence | rhetorical structure | coaching emphasis | failure mode |
|---|---|---|---|---|
| blender | definition-led ("The blender base — a rotational stall built on the osis family") | foundation → mechanic → recovery | integration of rotation and stall | one element commits before the other |
| paradox-blender | modifier-led ("Paradox direction commits across the blender's rotation-stall pairing") | base + modifier overlay | direction discipline at the strike point | drift to the natural direction; cascade up into the 6-ADD compounds |

---

## 1. blender — 4 ADD, base (trick_family = osis)

**Rationale.** The base of the blender naming line. Once this row is pilot,
every blender compound's prereq lineage reads cleanly from the dictionary. Per
the ontology this row is classified inside the osis family (osis is the
stall-family parent); user-facing prose acknowledges the rotation + stall
integration directly.

**short_description**
The blender base — a rotational stall built on the osis family with the whirl rotation layered in. The body whirls into an osis-style stall as one continuous motion.

**execution_summary**
Set the osis-style stall position, then carry a whirl rotation into the landing. The body rotates around the planted leg while the bag descends toward the stall surface; both the rotation and the stall commit together, with the stall accepting the bag at the rotation's strike point. Recovery holds the stall as the body unwinds.

**learning_notes**
The integration is the trick — neither the rotation nor the stall stands alone. Practitioners who learn the osis stall first tend to set the stall before the rotation lands, which leaves the bag offline; those who chase the rotation first tend to break the stall on contact. Commit both at the same moment.

**prerequisite_notes**
A confident osis-family stall is the entry; whirl (3 ADD) gives the rotation feel. Blender is the foundation for paradox-blender, mind-bender, and spender — every higher blender compound in the dictionary layers modifiers onto this rotation-plus-stall pairing.

---

## 2. paradox-blender — 5 ADD, paradox

**Rationale.** Sits between the blender base and the two pilot 6-ADD blender
compounds (mind-bender, spender). The pedagogical pair completion: with
paradox-blender enriched, the four-row chain blender → paradox-blender →
mind-bender / spender reads as a single authored progression.

**short_description**
Paradox direction commits across the blender's rotation-stall pairing — the body resets to the same side at the strike point against the natural rotational drift.

**execution_summary**
The blender's rotation-and-stall combination carries the trick, but the paradox marker forces the body to commit same-side across the stall landing. As the whirl rotation completes into the osis-style stall, the body weight resets to the kicking-foot side instead of continuing the natural rotational drift. The paradox commitment must hold through both the rotation and the stall.

**learning_notes**
Mistakes here cascade up: a drifting paradox in this row becomes an unrecoverable miss in either of its 6-ADD descendants. Mind-bender (ducking + paradox + blender) and spender (paradox + spinning + blender) both inherit this row's paradox commitment as foundation; get the paradox clean before adding the second modifier.

**prerequisite_notes**
Blender (4 ADD) covers the rotation-stall integration. Paradox on a non-blender base — paradox-mirage (3 ADD) or paradox-whirl (4 ADD) — gives the same-side body commitment without the stall component. Both halves should be reliable before the combination clicks.

---

## Cross-batch coherence

| pairing | rows | shared element |
|---|---|---|
| direct progression | blender → paradox-blender | base → +paradox modifier |
| family chain completion | blender → paradox-blender → mind-bender (pilot) → spender (pilot) | each row layers one more modifier; once mini-batch lands, all four are pilot |
| cross-family paradox | paradox-blender ↔ paradox-whirl (SCALE-2) ↔ paradox-mirage (not yet pilot) | paradox direction commitment on three different rotational bases |

## Apply pipeline (same shape as SCALE-1c / SCALE-2c)

1. Read-only diagnostic — confirm both rows have empty pilot prose columns.
2. Audit CSV — capture pre-load state (both NULL).
3. Rollback SQL — restores NULL state for the 2 slugs.
4. Transaction-wrapped UPDATE — 2 rows, four columns each.
5. Re-capture HTML — verify pilot sections render on both.
6. Forbidden-term audit.
7. Cadence audit — light-touch, 2-row sample (full SCALE-1/SCALE-2 audit is over-tooling for a 2-row batch).

## Deferred (food-processor)

Food-processor's 1 modifier link (blurry) on the blender base (4 ADD) does not
reach the asserted 6 ADD via flat blurry + base addition. The blurry modifier
table notes explicitly that some named blurry compounds (Blur = Stepping
Paradox Mirage; Ripwalk = Stepping Butterfly) carry deeper structural
decompositions; food-processor looks like one of those cases pending review.
Authoring pilot prose now would freeze the page on a math the ontology may
still shift. Defer until the food-processor decomposition is settled (same
queue as Blurry Whirl / Blurry Torque on pt12).

## Files produced

- `exploration/freestyle-notation-grammar/SCALE3_BLENDER_PROSE_DRAFTS.md` (this file)
- `exploration/freestyle-notation-grammar/SCALE3_BLENDER_PROSE_APPLY.csv` (loader-ready)

No DB writes. No code changes. Food-processor untouched; awaits ontology review.
