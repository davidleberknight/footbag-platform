# Dictionary & Glossary Synthesis — What the Four Audits Imply

Planning and evaluation only. **No code, content, doctrine, promotion, or implementation.** This document synthesizes the four read-only audits (terminal, entry, body, component) into findings and recommendations for the public dictionary and glossary.

Inputs reviewed: `terminal-topology-audit/`, `entry-topology-audit/`, `body-topology-audit/`, `component-ecology-audit/`. Surfaces evaluated: the freestyle glossary (family section, five-kinds, family cards), the By-Family / By-Modifier / By-Movement-System dictionary views, the Set Encyclopedia, the 24-family roster, and `freestyleModifierClusters.ts` / `freestyleMovementSystems.ts`.

---

## Audit Outcomes — what changed because of the audits

**Terminal topology**
- Expanded the family-parent doctrine (18 to 24) on an empirical, formula-grounded basis.
- Identified Swirl and Inside Stall as roots and the major derived branches (torque, blender, double-leg-over, eggbeater).

**Entry topology**
- Validated the set ecosystems as real entry identities (not dissolvable by token position).
- Confirmed Symposium, Paradox, Pixie, Fairy, and Stepping as the dominant entry systems once the two set surfaces are set aside.
- Established that operator position within the formula does not determine topological role.

**Body topology**
- Established Rotation, Passage, and Operator as distinct body axes.
- Revealed Ducking and Spinning as co-dominant body ecosystems, with passage co-equal to rotation.

**Component ecology**
- Identified the most common building blocks of freestyle (cross-body, the clipper/toe catches, the op-in/op-out dexes, rotation).
- Demonstrated that the major family parents emerge from recurring component combinations rather than from doctrine.

**Net result**
- The existing glossary and dictionary architecture is largely validated.
- Strong support for adding explanatory histograms.
- Limited support for major navigation restructuring.

---

## Part 1 — Findings Matrix

A check means the audit independently supports the finding.

| Finding | Terminal | Entry | Body | Component | Confidence |
|---|---|---|---|---|---|
| Clipper and toe are the two dominant roots | ✓ catches (328/252) | ✓ sets (207/197) | — | ✓ catches+sets | **HIGH** (3 audits) |
| The two roots are too broad to be family cards | ✓ | ✓ | — | ✓ | **HIGH** |
| Family parents emerge from the data, not doctrine | ✓ | — | — | ✓ (compositions) | **HIGH** |
| Major families = recurring dex+catch combinations | ✓ | — | — | ✓ | **HIGH** |
| Set ecosystems are real entry identities | — | ✓ (pixie 60, fairy 55, stepping 50) | — | ✓ | **HIGH** |
| Ducking and spinning dominate body topology | — | — | ✓ (84/78) | ✓ (spin 206, duck 89) | **HIGH** |
| Operator position does not determine role | — | ✓ | (inherited) | — | **HIGH** (method) |
| The modifier ecosystem spans distinct roles (entry vs body) | — | ✓ | ✓ | ✓ | **HIGH** |
| Rotation is structurally pervasive (embedded in bases) | — | — | ✓ (conflation) | ✓ (spin 206 vs ecosystem 78) | **MEDIUM** |
| Body-passage is co-equal with body-rotation | — | — | ✓ (108 vs 117) | — | **MEDIUM** (1 audit) |
| Cross-body is a foundational component | — | — | — | ✓ (246, >50% of tricks) | **MEDIUM** (1 audit) |

The multi-audit findings (HIGH) are the safe basis for recommendations; the single-audit findings (MEDIUM) are interesting but should not drive structural change.

---

## Part 2 — Dictionary Navigation Review

### By Family
- **Is the 24-family hierarchy supported?** Yes. The terminal audit produces the core 7 + branches directly, and the component audit corroborates them as recurring compositions. The roster is empirical, not arbitrary.
- **Should the hierarchy be visualized more clearly?** Yes, modestly. The roster already renders the tree (`Osis (Torque, Blender)`), but the *why* (the two surfaces dwarf everything) is invisible on the page. A histogram closes that gap (Part 3).
- **Branch families shown differently?** Not needed; the parenthetical nesting already reads correctly. No change recommended.
- **Family cards exposing recursive counts?** Yes, supported. Each card could show its recursive/direct descendant count and landing surface, making the empirical weight legible per family.

### By Entry System
- **First-class browse view?** Plausible, not required. The entry audit shows real entry identities (toe/clip sets; symposium/paradox; pixie/fairy/stepping/quantum/atomic/nuclear), but they are already reachable through the modifier view's "Set / uptime" and "No-plant / timing" clusters. A dedicated view adds discoverability at the cost of a second overlapping surface.
- **Separated from the modifier view?** The modifier view already separates these into named clusters, so the seam exists. A standalone entry view would duplicate it rather than disentangle it.
- **Organizing around symposium/paradox/pixie/fairy/stepping/quantum/atomic/nuclear?** The data supports that grouping as a *lens*, and the modifier clusters already encode it. Promoting it to a first-class view is a judgment call, not an audit mandate.

### By Movement System
- **Alignment with the audits?** Partial and already deliberate. The operator board already names an "Entry-topology" axis (paradox, symposium) distinct from "Midtime body," which matches the entry audit's central finding. The architecture is sound.
- **Should Entry / Body / Terminal be more explicit?** The terminal axis is implicit (it is the family/catch structure) and the entry/body split already exists on the board. Making all three explicit is appealing but is a larger reframing than the audits require; treat as exploratory, not recommended now.
- **Weakly supported groupings?** A few specific *memberships* drift from the audit roles (see By Modifier), but the axes themselves hold.

### By Modifier
- **Trying to do too many jobs?** No. It is correctly clustered by role (Set/uptime, Rotational-body, No-plant/timing, Dexterity/body-path, Surface). The structure is right.
- **Should set / body / timing stay mixed?** They are *not* mixed; they are separate clusters. What the audits surface are **membership misassignments**, not a structural flaw:
  - `whirling`, `swirling` sit in *Rotational-body* but the body audit classes them Dexterity-Operator.
  - `ducking`, `diving` sit in *Dexterity/body-path* but they are Body-Passage.
  - `pogo` sits in *No-plant/timing* but it is Airborne/Elevation.
  - `stepping` correctly in *Set/uptime*; `furious` correctly in *No-plant/timing* (the AddAnalysis board currently miscategorizes both, a separate drift noted in the audit data-fix docs).
  These are reversible content corrections, not a navigation redesign.

---

## Part 3 — Glossary Review

### Family Section — add the histogram (the strongest single idea)
A compact histogram in the family section:
```
Clipper Stall  328   Toe Stall  252   Osis 84   Whirl 74   Legover 71   Mirage 69   Butterfly 48 ...
```
- **Does it explain why the roster exists?** Yes, immediately. It shows the families are the largest terminal lineages, not a hand-picked list.
- **Does it explain why Clipper/Toe Stall are not family cards?** Yes. The bars make it obvious the two surfaces dwarf every family, so they are grandparent roots, too broad to teach as ordinary cards.
- **Does it make the system feel empirical rather than curator-selected?** Yes. This is the highest-value, lowest-risk educational change found across all four audits. It already exists, rendered, in `terminal-topology-audit/RANKING.md`.

### Entry Section — a matching entry histogram
A parallel chart (toe-set 207, clip-set 197, symposium 79, paradox 63, pixie 60, fairy 55, stepping 50) would tell the same empirical story for *how tricks begin*, reinforcing that the set ecosystems are real and measured. Useful if an entry-oriented glossary subsection exists or is added; lower priority than the family histogram.

### Body Section — a body histogram
Body-action chart (ducking 84, spinning 78, gyro 38, diving 24, …). Educationally pleasant and consistent with the others, but the body content is more advanced; medium priority.

### Component Section — most-common-components chart
A chart of cross-body (246), clipper-catch (243), op-in-dex (220), spin (206) is genuinely interesting but **risks noise** for a general audience: dex directions and tags are advanced internals. Best kept to the advanced/reference tier, not the main glossary flow.

---

## Part 4 — Proposed Roadmap

### Strongly Supported (multiple audits, low risk)
1. **Family-section histogram in the glossary.** Value: high (makes the family system visibly empirical, explains the two-surface dominance). Cost: low (a static chart from existing data). Doctrinal risk: low (describes, does not change). Confidence: high. Supported by Terminal + Component.
2. **Recursive/direct descendant counts + landing surface on each family card.** Value: medium-high (per-family empirical backing). Cost: low (data already computed in the audits). Risk: low. Confidence: high. Supported by Terminal + Component.

### Plausibly Useful (judgment, single-audit or moderate cost)
3. **Parallel entry and body histograms** in their glossary sections. Value: medium. Cost: low. Risk: low. Confidence: medium. Supported by Entry + Body.
4. **Correct the modifier-cluster / operator-board membership drift** (whirling/swirling, ducking/diving, pogo, stepping, furious). Value: medium (cleaner browse). Cost: low (reversible content). Risk: low-medium (touches a browse taxonomy). Confidence: medium-high. Supported by Body + Entry.
5. **Curate the Airborne/Elevation ecosystem** (flying/jumping/stomping/pogo, currently 0 modifier links). Value: low-medium (completeness). Cost: low. Risk: low. Confidence: medium. Supported by Body.

### Not Recommended
- **A component-frequency chart in the main glossary.** The component layer is an advanced internal lens; in the public flow it reads as noise. Keep it to exploration/reference.
- **Re-architecting the Movement-System view around explicit Entry/Body/Terminal axes.** The current four-axis board is load-bearing and already half-aligned; a full reframing is a large change the audits do not compel.
- **Promoting cross-body, the dexes, or any component to a family or browse axis.** They are components, not terminal lineages; the audits explicitly keep these layers separate.

---

## Part 5 — Executive Summary

**If limited to three improvements, in priority order:**

1. **Add the family histogram to the glossary family section.** It is the single change every relevant audit points to. With two bars (Clipper Stall 328, Toe Stall 252) towering over the family bars, the page stops asserting "these are the ratified families" and starts *showing* that the families are the largest terminal lineages and that the two surfaces are grandparent roots too broad to be cards. It converts the family system from curator-selected to visibly empirical, at almost no cost or risk.

2. **Expose each family's descendant counts and landing surface on its card.** This carries the same empirical credibility down to the per-family level, using numbers the audits already produce, and makes the difference between a core root (osis, 84) and a small lineage (flurry, 3) self-evident.

3. **Add the matching entry and body histograms** so the glossary tells one consistent story across how tricks begin, end, and move. This extends the empirical framing without touching the taxonomy or navigation, preserving the system's simplicity while deepening the educational payoff.

All three are descriptive additions: they increase educational value precisely by making the existing structure legible, and none of them change a single family, set, modifier, route, or definition. The modifier-cluster membership corrections (Part 4 #4) are the natural next tier if appetite exists, but they edit a taxonomy and so sit below the three purely-educational wins.
