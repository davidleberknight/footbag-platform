# Fundamental Moves -- Glossary Integration Plan -- 2026-05-19

Concise pedagogical integration plan for using `fundamentalmoves.txt` to enrich glossary v5 without collapsing notation systems.

Source: `exploration/fborg/JobsNotation.txt`-adjacent `exploration/fborg/fundamentalmoves.txt` (FOOTBAG WORLDWIDE FREESTYLE Move List — Fundamental Moves; 18-move catalog with full operational notations).

---

## 1. Major findings worth surfacing in glossary

Three central findings from the fundamentalmoves.txt audit warrant explicit glossary documentation:

1. **fundamentalmoves.txt is the ATAM grammar lineage source.** Every operational notation in the 18-move catalog uses the exact token vocabulary (CLIP, TOE, OP, SAME, IN, OUT, DEX, BOD, XBD, DEL, PDX) that modern ATAM grammar §13 uses. The modern grammar is a direct evolution of the FM source's 1995-2003 era notation. This pedagogical-history claim is worth surfacing in §7.

2. **18 fundamental moves form a natural ADD-graded learning ladder.** 3 surfaces (1 ADD) → 4 base atoms + body primitives (2 ADD) → 4 atoms + simple compounds (3 ADD) → 5 multi-element compounds (4 ADD) → 2 high-density compounds (5 ADD). The ladder structure is implicit in the FM document organization; surfacing it as a learner-facing progression in §5 (family trees) or §8 (compositional structure) adds pedagogical value.

3. **Several FM parenthetical compact readings are doctrinal precursors to modern chain readings.** FM's "Mobius (Gyro Torque)" matches the modern chain registry entry exactly. FM's "Blur (Stepping Paradox Mirage)" matches. FM's "Ripwalk (Stepping Opposite Side Butterfly)" maps to modern "stepping butterfly" (modern compressed the qualifier). FM's "Torque (Stepping Opposite Osis)" represents an ALTERNATE to modern "miraging osis" — doctrinal divergence worth surfacing.

---

## 2. Recommended glossary section placements

| Section | FM content placement | Format | Risk |
|---|---|---|---|
| **§7 (operational notation reference / advanced)** | "Historical origins" subsection naming fundamentalmoves.txt as the structural-notation lineage source; flag-vocabulary documentation; SET/CLIP/TOE opener conventions | Multi-paragraph subsection + token-vocabulary table | Low |
| **§3 (dex direction)** | same/op relator semantics + in/out direction semantics + flag examples | 2 short subsections; cross-link to §7 | Low |
| **§5 (family trees / per-pilot)** | 18-move ladder as an introductory progression (3 surfaces → 4 atoms → 4 compounds → 5 multi-element → 2 high-density) | Single overview table at section opener | Low |
| **§8 (compositional structure)** | FM-style parenthetical compact reading convention; alternation marker convention; flag-bracket vocabulary | Inline-code-block examples from the 18-move catalog | Low |
| **(trick detail pages, future)** | FM-source-cited operational notations for the 17 currently-blank rows | Per-row operational_notation values | Medium (curator-paced authoring) |

---

## 3. Curator decision points

The FM audit surfaces specific token-grammar decisions that should be settled before publishing the 17 blank operational notations:

| Decision | FM form | Modern DB form | Recommendation |
|---|---|---|---|
| Flag order for paradox on dex | `[PDX] [DEX]` (modifier-before-action) | `[DEX] [PDX]` in some DB rows (action-before-modifier) | Surface as FRP-3; curator/ATAM-style-guide picks one canonical order |
| Step marker between dex segments | single `>` | `>>` in some DB rows | Surface as FRP-4; curator picks |
| Surface stall opener | `CLIP [XBD] [DEL]` | `[set] > clipper` | Surface as FRP-6; pick canonical surface-stall convention |
| Alternation markers (`SAME or OP`, `back or front`) | Preserved in source | Modern resolves to one canonical | Surface as FRP-7/8/9 |
| Casing for parenthesized modifiers | Inconsistent in FM (lowercase + uppercase mixed) | Lowercase consistently in modern | Document lowercase as canonical (no row-level change needed) |

Until these are settled, the 17 candidate operational notations should be HELD for curator notation review (same pattern as the Job audit's 3 quick wins).

---

## 4. Layer separation rules (reinforced)

The four-layer ontology separation (`footbag-freestyle-dictionary` skill §A) is preserved:

| Ontology layer | FM content placement |
|---|---|
| **Canonical names** | FM's 18 move names are inputs; the slugs already exist in `freestyle_tricks` for all 18 |
| **Symbolic decomposition** | FM's parenthetical compact readings ('Stepping Opposite Osis', 'Gyro Torque') are alternate chain-reading framings; existing chain registry entries are preserved; FM readings surface as historical-precedent metadata |
| **Glossary pedagogy** | FM's flag vocabulary + opener conventions + alternation markers are pedagogical content for §3/§7/§8 |
| **Embodied movement analogy** | FM's textual descriptions ('tight sharp S shape', 'turn so the bag passes behind your back') are embodied-analogy content; do NOT mix with structural notation; surface in Surface A (modifier feel cards) or trick-detail descriptions only |

---

## 5. Concepts NOT to import

| Concept | Why NOT |
|---|---|
| Auto-overwrite of modern chain readings with FM parenthetical compact readings | Modern chain readings are curator-authored / Red-ratified. FM readings are 1995-2003 era precursors. Do NOT overwrite — preserve both as alternate framings |
| Mass-author operational_notation from FM source without curator notation review | Token-grammar decisions (flag order, step marker, alternation handling) must be settled first |
| Adopt FM's (back or front) SPIN alternation as the canonical osis form | Modern doctrine has not settled the spinning/gyro axis question (RP-6 in Job audit; FRP-5 here); pre-emptive adoption would lock the wrong axis |
| Treat 'Stepping Opposite Side Butterfly' as the canonical chain reading for ripwalk | Modern compressed it to 'Stepping Butterfly' deliberately (Red 2026-05-18 ratified). Do NOT un-compress |
| Adopt FM's `[set] > clipper` vs `CLIP [XBD] [DEL]` choice without curator decision | Both are defensible; the choice affects all surface-stall rows downstream |

---

## 6. Recommended implementation slices (curator-paced; ALL DEFERRED pending notation-token review)

| Slice | Scope | Risk | Gate |
|---|---|---|---|
| FM1 | Add "Historical origins" + flag-vocabulary subsection to glossary §7 | Low | None; ready when curator approves |
| FM2 | Add same/op + in/out semantics subsection to glossary §3 | Low | None |
| FM3 | Add 18-move ADD-graded ladder to glossary §5 or §8 | Low | None |
| FM4 | Surface the 11 Red questions (FRP-1 through FRP-11) to next Wave 2 packet | N/A | Pre-packet curator review |
| FM5 | (DEFERRED) Author IFPA operational_notation for the 17 candidate rows | High | Gated on FRP-3 (flag order) + FRP-4 (step marker) + FRP-6 (surface-stall convention) Red answers |
| FM6 | (DEFERRED) Document FM-parenthetical compact readings as alternate-framing metadata on dictionary cards | Medium | Gated on FRP-1 + FRP-2 |
| FM7 | (DEFERRED) Update Paradon's compact + operational notation per FM + investigate canonical relationship with 'double over down' | Medium | Gated on FRP-11 + Job audit RP-4 |
| FM8 | (DEFERRED) Resolve casing-of-parenthesized-modifiers (D-8) doctrinally; sweep DB rows if needed | Low | After FM4 lands |
