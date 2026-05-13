# GLOSSARY_SYNTHESIS_DRAFTS — Best-Of Multi-Layer Drafts (Task C)

Synthesized glossary drafts for 17 high-value terms. Each draft pulls the strongest aspects of IFPA precision + PassBack educational clarity + symbolic-grammar mechanical insight WITHOUT collapsing the layers.

**Status:** drafts only. Do NOT replace canonical entries. Companion to `GLOSSARY_ARCHITECTURE_V4.md`.

**Date:** 2026-05-12

**Format:** each term has 5 attribute sections — Canonical / Educational / Symbolic / Operational / Related — preserving the four-layer separation. Where a layer has no source content, the section is marked **(gap)**.

---

## 1. ADD (Additional Degree of Difficulty)

**Axis:** concept. **Layers covered:** all four.

**Canonical (IFPA):**
A scoring system assigning difficulty values to tricks based on their components. ADDs are counted in whole numbers and are awarded for various components that are each worth 1 ADD. Conceived in the 1980s when the sport was developing.

**Educational (PassBack):**
ADD stands for Additional Degree of Difficulty. In addition to categorization and scoring, ADDs can be used to get a very rough gauge of a trick's difficulty and group together different tricks of approximately similar difficulty. The ADD system is controversial but ingrained in the culture. Newer players are encouraged to not ADD hunt, which means to chase high-ADD tricks solely for the number with little other reason.

**Symbolic (mechanics):**
ADD components are: DEL (delay/stall final), DEX (dexterity flick), XBD (cross-body), BOD (body action: spin/duck/dive/paradox/symposium/flying/X-dex), UNS (unusual surfaces). Each is +1 in the additive heuristic. The total ADD reflects the count of these components present in a trick's canonical decomposition.

**Operational (notation):**
Component flags in operational notation map directly: `(DEX)` `(DEL)` `(XBD)` `(BOD)` `(PDX)` `(XDEX)` `(UNS)`. Each adds +1 to the additive ADD heuristic.

**Related:**
ADD groupings (Tiltless / Guiltless / Tripless / Fearless / Beastly / Godly) — BOP (Butterfly/Osis/Pdx-Mirage foundational guiltless) — Genuine guiltless (excludes BOPs) — PWF (Pdx-Whirl-Free; Fearless/Beastly subcategory).

**Common misunderstandings:** ADD is NOT a quality score; a 7-ADD trick isn't necessarily "better" than a 5-ADD trick. ADD measures component count, not execution quality or aesthetic value. The ADD system is intentionally an approximation per IFPA + PassBack.

---

## 2. dex (dexterity)

**Axis:** concept. **Layers covered:** all four.

**Canonical (IFPA):**
A motion where the foot circles around the bag. Example: Mirage = one dex; Double Around the World = two dexes.

**Educational (PassBack):**
Dexterity (or dex for short) is the primary trick component in footbag, where the leg circles the bag while it's in the air. Dexes are so core to footbag that tricks and components without dexes are called "dexless." Dexes can be performed in two **directions** relative to the center of the body: **in-out** (away from body) or **out-in** (toward body). Dexes can be done in two movement **styles**: **hippy** (motion from the hip; thigh circles the bag) or **leggy** (motion from the knee; calf circles the bag). Every dex can also be described in terms of **fullness**: a full dex circles the bag entirely; a half dex circles partially.

**Symbolic (mechanics):**
The dex moment is the load-bearing kinematic event of most freestyle tricks. James-shorthand notation marks dex types explicitly: `hippy in dex` (mirage canonical), `hippy out dex` (illusion canonical), `leggy pass` (legover), `leggy circle` (ATW), `under-foot scoop` (pickup), `wing-motion dex` (butterfly).

**Operational (notation):**
Component flag `(DEX)` marks any beat that is a dex. Stacks with `(PDX)` for paradox-direction dex, `(XDEX)` for full-circle dex variant (pt1 narrow).

**Related:**
DEX (operational flag) — XDEX (X-Dex; pt1 narrow scope) — hippy / leggy (dex styles) — in / out (dex directions) — full dex / half dex (dex fullness) — clean / deep / thin (dex execution quality).

**Common misunderstandings:** "Dex" sometimes used informally to mean any leg motion. The canonical meaning specifically requires the leg/foot to circle the bag while the bag is in the air.

---

## 3. set

**Axis:** concept. **Layers covered:** canonical, educational, symbolic.

**Canonical (IFPA):**
The action used to position the bag before a trick. Uptime = before the peak; Midtime (hangtime) = at the peak; Downtime = after the peak. Modern usage: set = uptime + midtime components.

**Educational (PassBack):**
The vast majority of footbag tricks happen while the bag is in the air. The act of getting the bag in the air is called the set or setting the bag. Most often the bag is set with one leg/foot (the set leg/foot), while the other remains on the ground (the support leg/foot). To get more energy and rhythm into stalls and sets, the magic hop is used, where the support leg does a small hop just before and just after the bag is stalled on the set foot.

**Symbolic (mechanics):**
Set = the pre-state beat of a trick's operational sequence. In James-shorthand notation, `[set]` is always the leading bracket. A set's surface (toe vs clipper) determines downstream trick possibilities. Different sets prepare different dex types: toe-set → hippy-in (mirage) or hippy-out (illusion); clipper-set → wing-motion (butterfly).

**Operational (notation):**
Set is implicit when a notation opens with `Toe`, `Clip`, or `Set` as the first token. The `(no plant while)` and `(rooted)` pre-states modify how the set foot behaves during execution.

**Related:**
Uptime / midtime / downtime (trick phases) — magic hop — support leg / set leg — set foot — uptime set — uptime dex.

---

## 4. stall / delay

**Axis:** concept. **Layers covered:** canonical, educational, symbolic.

**Canonical (IFPA):**
Controlling the bag on a surface. Most stalls are 1 ADD. Examples: toe stall, clipper stall, inside stall.

**Educational (PassBack):**
The most common contact type seen in freestyle is a delay or stall, where the bag is briefly stopped on a surface before being set for the next trick. A specific contact is defined by a surface of the body combined with a type of motion applied to the bag. The most common contact surfaces are the toe and inside surfaces of the shoe, as well as less commonly used outside, heel, and sole surfaces. Any non-shoe surface uses the name for the part of the body (knee, calf, back, etc.).

**Symbolic (mechanics):**
Stall = the terminal contact beat of a trick. In symbolic notation, the final beat names the stall surface: `op toe`, `op clip`, `same toe`, `same clip`, `op flapper (uns)`. Stalls are foundational primitives — most are 1-ADD self-atoms.

**Operational (notation):**
Component flag `(DEL)` marks the trick's final stall (one DEL per trick by convention). Stalls on non-standard surfaces (flapper, sole, head, knee, cloud) carry the `(UNS)` flag, which appears to add implicit +1 ADD per source rulings (per `GRAMMAR_AMBIGUITIES.md`).

**Related:**
Toe (toe stall) — clipper (clipper stall, also "xbd inside stall") — inside / outside / heel / sole stalls — unusual surfaces (UNS: flapper, knee, neck, head, cloud) — contact (more general term) — wrap (transfer from inside-stall to clipper or vice versa).

---

## 5. symposium

**Axis:** modifier. **Layers covered:** all four. **Educational + symbolic = strong; IFPA gap.**

**Canonical (IFPA):**
**(gap in v2)** — symposium is referenced in compound names (Symposium Whirl, Spinning Symposium Whirl) but has no dedicated glossary entry.

**Educational (PassBack):**
A symposium component is one where an active leg performs an action in a single-leg jump: the symposium leg jumps and lands on its own while the other leg remains in the air. Symposium is most often used with dexes, but can be combined with other components as long as it follows the same principle. The shorthand **symp** can be used to mean either symposium or symple (whichever is more natural; ex: Symp Mirage = Symposium Mirage; Symp Legover = Symple Legover). Related: **symple** (starts symposium but the non-symple foot returns midway), **muted** (active leg held in air for the entire component).

**Symbolic (mechanics):**
Symbolic group: `symposium-family` (modifier axis). +1 ADD body modifier. The "no plant while" pre-state in operational notation maps directly to symposium-style execution. 9+ pilot rows carry symposium-family membership (matador, mullet, montage, spinal-tap, symposium-whirl, symposium-mirage, superfly).

**Operational (notation):**
Pre-state `(no plant while)` marks symposium beats. Pre-state `(rooted)` is related (held position; no plant; pt8 = 0 ADD).

**Related:**
Symple (symposium variant; foot returns midway) — muted (foot never plants) — no-plant-while (operational pre-state) — Frontside (FS; symposium applied to uptime) — Backside (BS; symposium applied to downtime; pt9 = symposium-equivalent) — Full Symp (both uptime + downtime symposium) — alpha/beta/gamma (alternate dex-position symposium terms).

**Common misunderstandings:** "Symposium" is sometimes used as if it were a trick name. It's a body modifier; the trick is always `symposium + <base>`. The Frontside/Backside variants don't apply to individual dexes — they apply to whole trick phases.

---

## 6. paradox

**Axis:** modifier. **Layers covered:** all four. **Complementary across sources.**

**Canonical (IFPA):**
Body modifier adding +1 ADD. Structurally an in-then-out dex pair. Modifier-table: +1 universal.

**Educational (PassBack):**
Paradox (pdx) is a special type of far dex where: (1) the previous component was Xbd (usually a Clipper set), and (2) the dex requires a hip pivot in order to bring the leg under the bag in preparation. Example: a Pdx Mirage requires the set leg to be brought underneath the bag before the Mirage is performed. Some paradox components don't quite fit that description (ex: Pdx Illusion), but the majority of them are "Clipper set far in-out dex." Paradox is technically only needed when describing ADDs, but has been ingrained into many trick names — for example, Clipper Far Whirl is a valid way to describe that trick, but it's more commonly named Pdx. Whirl.

**Symbolic (mechanics):**
Symbolic group: `paradox-family` (modifier axis). 15+ pilot rows. Always +1 ADD universal. Mechanical signature: hip pivot under bag from XBD position. Distinct from X-Dex (xdex), which uses the same hip-pivot pattern but for toe-set tricks instead of XBD-prefix tricks.

**Operational (notation):**
Component flag `(PDX)` marks paradox-direction dex on a beat. Often stacks with `(DEX)`: `Op In (DEX)(PDX)`. The flag's "clear independence" condition is undefined per `GRAMMAR_AMBIGUITIES.md` §1.3.

**Related:**
PDX (operational flag) — X-Dex / XDEX (toe-set analog; pt1 narrow) — Pdx-Whirl-Free (PWF; Fearless/Beastly subcategory excluding Pdx Whirl) — PS = Paradox Symposium (e.g., PS Whirl) — symposium (often paired in compound names).

**Common misunderstandings:** Paradox is sometimes confused with X-Dex; they share the hip-pivot pattern but apply to different set surfaces. "Clipper Far X" and "Pdx X" mean the same thing — the Pdx naming is the canonical shortening.

---

## 7. ducking

**Axis:** modifier. **Layers covered:** all four. **Educational + symbolic; IFPA gap.**

**Canonical (IFPA):**
Body modifier adding +1 ADD. Duck body action interleaved between dexes.

**Educational (PassBack):**
Ducks are performed by dipping the head in a particular direction and allowing the bag to pass around the neck. Ducking, diving, weaving, and zulu are all variations of the general ducking component that differ in the direction the head moves and where the bag goes after the duck. A well-executed duck is one performed close to the neck; a duck becomes thinner the farther from the neck it gets. A duck done with just the very top of the head is said to be **crowny**.

| Variant | Head moves | Bag falls |
|---|---|---|
| Ducking | toward bag | opposite side |
| Weaving | toward bag | same side |
| Diving | over bag, under back | same side |
| Zulu | over bag, under back | opposite side |

**Symbolic (mechanics):**
Symbolic group: `ducking-family` (modifier axis). 8+ pilot rows + 39 FM-corpus rows. Mechanical signature: head movement separates the dex flicks (uptime + downtime), creating the duck-family compound shape.

**Operational (notation):**
Component flag `(BOD)` marks the duck beat: `Duck (BOD)`. Pre-state `(back)` or `(front)` orients the duck direction.

**Related:**
Diving — weaving — zulu (4-variant head-motion cluster) — ducking-whirl, ducking-osis, ducking-butterfly (compound applications) — crowny (thin duck execution quality) — alpine (compound modifier; inserts a duck between uptime + downtime).

---

## 8. spinning

**Axis:** modifier. **Layers covered:** all four. **Educational + symbolic strong; IFPA narrow.**

**Canonical (IFPA):**
Rotation modifier adding +1 ADD (flat per pt10; was +2 on rotational base; flattened in pt10).

**Educational (PassBack):**
Spins are performed by rotating the entire body to various degrees: **gyro** means to spin 180 degrees, while **spinning** means to spin 360 degrees. The two terms can be combined, along with double or triple, to create a spin of any half or full degree. Example: Spinning Gyro = 450 degrees; Gyro Gyro = 180 degrees, then 180 degrees in the other direction. Spins are most commonly performed as **backspins** (body turns away from bag; back passes the bag first). An **inspin** turns toward the bag and the chest passes the bag first. Unless the prefix `in-` is used, a spin is presumed to be a backspin. `In-` can be applied to Spinning, Gyro, or even full trick names to change spin direction (like In-Vortex to mean In-gyro Drifter).

**Symbolic (mechanics):**
Symbolic group: `spinning-family` (modifier axis). 13+ pilot rows. Largest modifier cohort. Cuts across whirl / osis / torque / butterfly / clipper / drifter / blender bases.

**Operational (notation):**
Component flag `(BOD)` when present on spin beat. Pre-state `(back)` or `(front)` (front = inspin equivalent).

**Related:**
Gyro (180° rotation; +1 ADD) — Inspinning (chest passes bag first) — Double-spinning (720°) — backspin (default direction) — In- (prefix to reverse rotational direction) — inspin (variant terminology) — montage (paradox + symposium + ducking + spinning + whirl = 7 ADD anchor).

---

## 9. osis

**Axis:** trick. **Layers covered:** canonical (slim) + symbolic strong. **PassBack adds context.**

**Canonical (IFPA):**
**(slim entry in v2)** — osis is referenced as part of BOP (foundational guiltless tricks) but has no detailed prose entry. Dictionary: 3 ADD; inside-to-outside delay combination.

**Educational (PassBack):**
Osis is one of the **BOP** foundational guiltless tricks (Butterfly + Osis + Pdx Mirage). Pt6 / modifier table: osis is the canonical base for compound rotational families. Pt11 Red ruling: **torque = miraging-osis**; **blender = whirling-osis**; pt12 Q1 transitive-blurry: **food-processor likely = stepping + paradox + blender = transitive-osis**.

**Symbolic (mechanics):**
Symbolic group: `osis-rotational-topology` (topology axis). 7 IFPA family members; coherence=1.0 per SG-2 analysis. Mechanical signature: hippy-in dex extended into an osis-specific arc that lands on the same trajectory side as the starting hippy motion. Anchor for the torque + blender derivative families.

**Operational (notation):**
Osis appears as the base token in compound operational notations. The osis arc is sustained longer than mirage's single hippy-in dex.

**Related:**
Torque (miraging-osis canonical; pt11) — blender (whirling-osis canonical; pt11) — stepping-osis / ducking-osis / spinning-osis (modifier compounds) — barraging-osis (deferred baroque-legacy) — BOP (foundational guiltless trio with butterfly + pdx-mirage).

---

## 10. whirl

**Axis:** trick. **Layers covered:** canonical (slim) + symbolic strong.

**Canonical (IFPA):**
Rotational body-spin dex; anchor of the whirl family. 3 ADD.

**Educational (PassBack):**
**(implicit only in PassBack)** — whirl appears throughout the PassBack glossary as a base for compound trick names (Pdx Whirl, Spinning Whirl, etc.) but has no dedicated section. Per IFPA + community use: whirl is the rotational primitive — a single full-body spinning dex action; the kicking foot traces through the rotation's arc.

**Symbolic (mechanics):**
Symbolic group: `whirl-rotational-topology` (topology axis). 17 IFPA family members; coherence=1.0; largest pilot cohort. Mechanical signature: front-spin dex pattern. Anchor of the whirl-family compound tree (spinning-whirl, paradox-whirl, ducking-whirl, stepping-whirl, atomic-whirl, hatchet, montage's whirl-base, etc.).

**Operational (notation):**
Whirl appears as the base token in compound operational notations. Often combined with `Front Whirl` or `Back Whirl` qualifiers on a dex beat — `Op Front Whirl (DEX)` — which appears to carry implicit +1 ADD per `GRAMMAR_AMBIGUITIES.md` §1.4.

**Related:**
Swirl (reverse-direction variant; 2nd canonical direction-variant pair) — rev-whirl (3-ADD reverse-direction whirl) — Pdx Whirl (simplest 4-ADD; namesake of PWF subcategory) — Spinning Whirl — Symposium Whirl — Paradox Symposium Whirl (PS Whirl) — Montage (4-mod compound on whirl base; 7 ADD anchor).

---

## 11. swirl

**Axis:** trick. **Layers covered:** canonical (slim) + symbolic.

**Canonical (IFPA):**
Reverse-direction rotational dex; anchor of the swirl family. 3 ADD.

**Educational (PassBack):**
**(implicit only)** — swirl appears in compound names (Pdx Swirl, Spinning Swirl) but has no dedicated PassBack entry.

**Symbolic (mechanics):**
Symbolic group: `swirl-rotational-topology` (topology axis). 13 FM-corpus members. Mechanical signature: back-spin dex pattern. Mirror of whirl — same rotational mechanic, opposite directional travel (whirl = front rotation; swirl = back rotation).

**Operational (notation):**
Swirl appears as base token. Often with `Back Swirl` or `Front Swirl` qualifiers.

**Related:**
Whirl (front-rotation sibling) — Cardinal Swirl (PassBack alias: Tripstein = triple-dex Swirl) — Whirling Swirl (cohort opener SCALE-9) — Paradon Swirl — Symposium Butterfly Swirl (Badger).

---

## 12. pixie

**Axis:** modifier. **Layers covered:** symbolic + operational (IFPA modifier-table entry exists; no glossary entry).

**Canonical (IFPA modifier table):**
+1 ADD universally. Worked examples per modifier-table notes: `pixie mirage = smear = 3` (mirage 2+1); `pixie butterfly = dimwalk = 4` (butterfly 3+1); `pixie osis = 4` (osis 3+1).

**Educational (PassBack):**
**(gap in PassBack glossary)** — pixie not in the Index. Compound applications visible only via dictionary tricks (PB-dict tech names like "Pixie Ducking far Mirage" for Assassin).

**Symbolic (mechanics):**
Symbolic group: `pixie-family` (modifier axis; set type). 9+ pilot rows. Mechanical signature: compact dex variant; tightens the dex moment. Cuts across butterfly, mirage, drifter, illusion, legover, pickup, osis bases.

**Operational (notation):**
Pixie appears as a token in operational notation: `Pixie Ducking far Mirage`. Not a component flag itself — appears as named modifier in canonical decomposition.

**Related:**
Fairy (modifier-table sibling; +1 universal) — Quantum (modifier-table sibling; +1 universal) — Pixie Mirage = Smear — Pixie Butterfly = Dimwalk — Pixie Pickup = Paste — Pixie Eggbeater = Pigbeater — Pixie Illusion = Smudge — Pixie ss Legover = Magellan.

**Common misunderstandings:** Pixie is sometimes confused with "small / quick" versions of other modifiers. It's a specific +1-universal set modifier with its own mechanical signature; not a generic "small" qualifier.

---

## 13. quantum

**Axis:** modifier. **Layers covered:** symbolic + modifier-table (IFPA glossary gap).

**Canonical (IFPA modifier table):**
+1 ADD universally per Red pt10 ruling. Set modifier.

**Educational (PassBack):**
**(gap)** — quantum appears in PassBack dict tech names (Quantum Pickup = Legeater per PB-dict2) but no glossary entry.

**Symbolic (mechanics):**
Symbolic group: `quantum-family` (modifier axis; set type). 3 pilot rows (tripwalk, legeater, plasma). Mechanical signature: compact set quality, similar to pixie. Functional parallel to pixie + fairy (all three +1 universal set modifiers).

**Operational (notation):**
Quantum appears as named modifier token: `Quantum Butterfly` for Tripwalk, `Quantum Pickup` for Legeater.

**Related:**
Pixie (sibling +1-universal set modifier) — Fairy (sibling +1-universal set modifier) — Tripwalk (Quantum Butterfly) — Legeater (Quantum Pickup) — Plasma (3rd quantum pilot) — Quantum Double Down (Cold Fusion → Pdx Fusion alternate naming).

---

## 14. atomic

**Axis:** modifier. **Layers covered:** symbolic + modifier-table; IFPA glossary gap.

**Canonical (IFPA modifier table):**
+1 ADD on non-rotational bases / +2 ADD on rotational bases. Set modifier. Worked examples per modifier-table notes: atomic butterfly = legbeater = 4 (butterfly 3 + 1); atomic osis = 4 (osis 3 + 1); atomic mirage = atom smasher = 4 (mirage 2 + 2). The composition atomic + torque (named: silo) reports 6 ADD, which suggests a construction-specific element beyond the +2 weight; this combination is treated as an open case.

**Educational (PassBack):**
**(gap)** — atomic appears in PB-dict tech names (Atomic Mirage for Atomsmasher) but no glossary entry.

**Symbolic (mechanics):**
Symbolic group: `atomic-family` (modifier axis; set type). 5+ pilot rows. Mechanical signature: set primitive with rotational-aware bonus structure. Atomic's hallmark application is to mirage (atom smasher) and torque (silo / open case).

**Operational (notation):**
Atomic appears as named modifier token: `Atomic Mirage` for Atomsmasher; `Atomic Eggbeater` for Bladerunner (FM); `Atomic far Down-Over-Down` for Fusion.

**Related:**
Furious (parallel set primitive; +1 non-rotational / +2 rotational) — Nuclear (+2 universal; structurally Paradox + Atomic per pt10) — Atom Smasher (Atomic Mirage with X-Dex per pt1) — Eggbeater (canonical = atomic-legover per pt4) — Atomic Butterfly = Legbeater — Atomic Osis (4 ADD) — Atomic Torque = Silo (open case; reports 6 ADD).

---

## 15. butterfly

**Axis:** trick. **Layers covered:** all four. **Strongest IFPA + symbolic + operational coverage.**

**Canonical (IFPA):**
**(slim entry in v2)** — butterfly is listed as one of the 8 foundational tricks; no dedicated prose entry. 3 ADD; one of the BOP trio.

**Educational (PassBack):**
**(implicit only)** — butterfly compounds are referenced extensively in PassBack tech names but no dedicated glossary entry.

**Symbolic (mechanics):**
Symbolic group: `butterfly-wing-topology` (topology axis). 12 IFPA family members; coherence=1.0. Mechanical signature: outside-wing dex with cross-body clipper recovery. The wing-motion + cross-body finish is the defining shape. Anchor of the entire walking-family (ripwalk + sidewalk + dimwalk + parkwalk + bigwalk = 5/5 walking-family pilots at SCALE-11 close).

**Operational (notation):**
FM notation: `SET > SAME or OP OUT [DEX] > OP CLIP [XBD] [DEL]`. James-shorthand: `[set]>op out dex>op clip (xbd)`. The `OR` connector in FM notation indicates execution can mirror on either side without changing the trick's identity.

**Related:**
BOP (Butterfly + Osis + Pdx Mirage — three foundational guiltless tricks) — Ripwalk (Stepping Butterfly per pt11) — Sidewalk (Stepping Butterfly same-side) — Dimwalk (Pixie Butterfly) — Parkwalk (Pixie Butterfly same-side) — Phoenix (Pixie Ducking Butterfly) — Matador (Nuclear Butterfly) — Dada-Curve (4-ADD self-atom; no foot plant; structural twin to Ripwalk).

---

## 16. clipper

**Axis:** stall. **Layers covered:** all four. **Strong symbolic + educational; IFPA narrow.**

**Canonical (IFPA):**
Clipper-stall; one of the foundational stalls. 1 ADD per IFPA dictionary.

**Educational (PassBack):**
A Clipper is an Inside Stall in a crossbody (xbd) position, meaning that one leg is positioned behind the other. In order to get the flattest possible surface for an Inside Stall or Clipper, you have to bend or crank your ankle in order to flex the inside surface upwards. Tricks that primarily use clipper are called **clipper tricks**, and players that favor clipper over toe are **clipper players**.

**Symbolic (mechanics):**
Symbolic groups: `stall-1add-topology` + `clipper-start` (188 FM-corpus rows open with Clip) + `clipper-ending` (very common XBD recovery). The clipper-stall position is the most common cross-body recovery surface in freestyle.

**Operational (notation):**
Operational token: `Clip` (start position) or `Op Clip (XBD)` (terminal contact with cross-body flag). Component flag `(XBD)` marks the cross-body recovery.

**Related:**
XBD (cross-body component flag; clipper IS xbd inside stall — equivalence) — Toe (foundational stall sibling) — Inside stall (clipper without the cross-body position) — clipper player / clipper trick (community vocabulary) — Brocka mod (shoe mod creating a flatter clipper surface).

---

## 17. ss / op (same-side / opposite)

**Axis:** notation. **Layers covered:** canonical, educational, symbolic. **Pt12 SS resolution gives precise canonical reading.**

**Canonical (IFPA pt12):**
Same-side (ss) = +0 ADD universally per Red pt12 ruling 2026-05-11. The ss execution-direction qualifier does NOT contribute ADD. Opposite (op) is the canonical default for toe tricks (Toe Mirage = Toe op Mirage); same-side (ss) is the canonical default for clipper tricks (Clipper Whirl = Clipper ss Whirl).

**Educational (PassBack):**
A component can be further specified with a **side** to describe exactly which half of the body should perform it. Sides are described relatively to the previous component, and it's rarely important whether it's "left" or "right" side, but rather **same-side (ss) / near** or **opposite (op) / far**. When thinking about the body as two vertical halves, ss connects two components on the same vertical half; op connects two components on one vertical half and then the other. Same-side/near and opposite/far mean the same thing and can be used interchangeably. There are probably exceptions, but if you want to be precise, it's never incorrect to specify a side.

**Symbolic (mechanics):**
Symbolic group: `same-side-execution` (positional axis). Pt12 SS ruling: ss = +0 universally. The 54-row same-side-display-suffix cohort in records covers many tricks where ss is an execution-style annotation, NOT a structural ADD contributor.

**Operational (notation):**
`Same` and `Op` are side prefixes that appear in operational notation: `Same In (DEX)`, `Op Out (DEX)`, `Op Clip (XBD)`. They modify the side of the next contact/dex relative to the previous component.

**Related:**
Near (synonym of ss) — Far (synonym of op) — XBD (cross-body; spatial position rather than side) — Strong-side / Flip-side (stance preference, not execution direction) — Sidewalk = stepping butterfly ss — Ripwalk = stepping butterfly op (natural-direction).

**Common misunderstandings:** ss/op are sometimes confused with strong-side / flip-side. The latter describe a player's preferred foot; the former describe execution direction relative to the previous component. Also: ss does NOT add ADD (pt12 ruling), despite some older sources implying it does.

---

## Notes on draft style

Each draft follows the layer order: Canonical → Educational → Symbolic → Operational → Related. The "Common misunderstandings" subsection is OPTIONAL and added only where misunderstandings are documented in the source corpus.

**Authoritative-source attribution.** Every Educational section is sourced from PassBack glossary (with "Source: PassBack glossary" attribution implicit in this draft; would be explicit in published rendering). Canonical sections cite IFPA glossary v2 or Red rulings by pt-number where available.

**Gap markers.** Where a layer has no available source, "(gap)" is explicit. The IFPA-side gaps in 12 of 17 high-value terms are the **primary educational opportunity** v4 would address.

**Length calibration.** Each draft is ~400-700 words; matches v2 entry length proportionally where v2 has prose; expands proportionally for gap-filling terms (symposium, ducking, atomic).

## Cross-references

- `GLOSSARY_COMPARISON_MATRIX.csv` — overlap classification driving draft prioritization
- `GLOSSARY_ARCHITECTURE_V4.md` — multi-layer architecture spec
- `GLOSSARY_GAP_ANALYSIS.md` — gap analysis (Task E)
- `SYMBOLIC_GLOSSARY_LINKS.csv` — symbolic group ↔ glossary term ↔ trick membership
- `GLOSSARY_RELATIONSHIP_GRAPH.csv` — relationship graph
