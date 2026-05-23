# Compositional Sets — Holden / Platform Consistency Audit

**Date:** 2026-05-23
**Scope:** Phase 2c of the compositional-sets slice. Full row-by-row
comparison of Chris Holden's set compilation (`exploration/fborg/
chrisHoldenSets.txt`) against the platform's other movement-language
content modules. Public summary at `/freestyle/compositional-sets` §4;
this doc is the curator-internal evidence trail.

**Posture:** transparency, not normalization. No Holden-only entry is
promoted to canonical by this audit; no conflict is silently resolved.
Each row is a curator-reviewable disagreement.

---

## 1. Methodology

For each entry in Holden's compilation (~45 names across 6 family
categories) the audit asks four questions:

1. **Does the platform have a corresponding entry?** Sources checked:
   - `src/content/freestyleOperatorReference.ts` (operator entries:
     atomic, blurry, quantum, nuclear, barraging, furious, whirling)
   - `src/content/freestyleMovementSystems.ts` (4-axis classification +
     composition glosses)
   - `src/content/freestyleSymbolicEquivalences.ts` (equivalence chains)
   - `src/content/freestyleResolvedFormulas.ts` (resolved ADD formulas)
   - `src/content/freestyleDerivationPilot.ts` (deep derivation entries)
   - `freestyle_tricks` table (canonical trick rows)
2. **Does the notation match?** Compare Holden's operational-notation
   string to the platform's recorded string where both exist.
3. **Does the decomposition framing agree?** A name can have matching
   notation but a divergent ontological reading (e.g. Holden frames
   atomic as a "Toe set Illusion" compressed compound; the platform
   treats atomic as a +1 primitive operator).
4. **Where is the divergence?** If decompositions disagree, identify
   whether the disagreement is on the entry surface, the body-modifier
   axis, the terminal component, or the named-set anchor.

Categorization (locked):

- **Aligned** — notation matches AND decomposition agrees (or platform
  has no decomposition framing to disagree with).
- **Partial fit** — notation matches; ontological framing diverges.
- **Conflict** — substantive decomposition disagreement.
- **Holden-only** — no platform entry exists.

---

## 2. Summary counts

From the full 45-entry corpus:

| Status | Count | Share |
|--------|-------|-------|
| Aligned | 11 | 24% |
| Partial fit | 2 | 4% |
| Conflict | 1 | 2% |
| Holden-only | 27 | 60% |
| (out of scope — components/discipline notes) | 4 | 9% |

The dominant pattern is **Holden-only**: most of his compilation
documents community-cited folk names that never received platform
canonical treatment. The dominant pattern in the **aligned** group is
that Holden's parenthetical (e.g. "Stepping Paradox", "High Stepping",
"Barraging Paradox Miraging") matches the platform's later analytical
decomposition — Holden's compilation was prescient.

The single **conflict** is `surging`. The two **partial fit** rows
(`atomic`, `nuclear`) are framing disagreements, not notation
disagreements.

---

## 3. Aligned entries (11)

These are the rows where Holden's notation AND any structural framing
he provides match the platform's recorded reading.

| Name | Holden | Platform source | Notes |
|------|--------|-----------------|-------|
| Pixie | `TOE > SAME IN [DEX] >` | `freestyleOperatorReference.ts` (referenced); `freestyleMovementSystems.ts:57` axis member | Pure single-dex primitive. No decomposition disagreement. |
| Stepping | `CLIP > OP IN [DEX] >` | `freestyleOperatorReference.ts` (operator); `freestyleResolvedFormulas.ts` (+1 stack); `freestyleDerivationPilot.ts` (blur = stepping paradox) | Aligned across every module that mentions it. |
| Miraging | `SET > OP IN [DEX] >` | `freestyleSymbolicEquivalences.ts` (used as chain component); `freestyleMovementSystems.ts:170` (surging gloss references it) | Uptime form of the mirage shape; consistent across sources. |
| Quantum | `TOE > OP IN [DEX] > (op side)` | `freestyleOperatorReference.ts:88` ("compressed-atomic set") | Holden's "compressed atomic" parenthetical matches platform's "compressed-atomic" framing. |
| Blurry | `CLIP > OP IN [DEX] > OP OUT [DEX] >` | `freestyleOperatorReference.ts:77` (blurry = stepping paradox); `freestyleDerivationPilot.ts:211` (blur entry); `feedback_loader_19_family_default` memory references the same | Strongest cross-source alignment. Holden's "Stepping Paradox" parenthetical = the platform's settled compound decomposition. |
| Barraging | `CLIP > OP IN [DEX] > SAME IN [DEX] >` | `freestyleOperatorReference.ts:110`; freestyleResolvedFormulas tracking | "High Stepping" parenthetical matches the platform's two-dex framing. |
| Furious | `CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] >` | `freestyleOperatorReference.ts:121` (furious paradox mirage); `freestyleSymbolicEquivalences.ts` (fury variants) | "Barraging Paradox Miraging" parenthetical is structurally consistent with the platform's tracked three-dex composition. |
| Terraging | `TOE > SAME IN [DEX] > SAME IN [DEX] >` | No standalone platform entry, but pixie is platform-tracked | Decomposition mechanically aligned with "Double Pixie" parenthetical; the platform doesn't track "Terraging" as a distinct name. |
| Pogo | `CLIP > (no plant while) OP IN [DEX] >` | Platform tracks pogo as a whirl-family no-plant variant | Holden's "Symposium Whirling" parenthetical aligned with platform reading. |
| Blistering | `CLIP > OP IN [DEX] > (BACK) SPIN [BOD] >` | Platform tracks blistering as a whirl-gyro compound | Holden's "Whirling Gyro" parenthetical aligned. |
| Whirling | `CLIP > OP IN [DEX] > (same side)` | `freestyleOperatorReference.ts:143` ("a directional variant…") | Aligned as a body modifier on whirl bases. |

**Curator triage:** no action required. These rows are well-supported
by the existing platform sources.

---

## 4. Partial fit (2)

Notation matches; ontological framing diverges. These are the rows
where careful curator review may surface a deliberate decision about
how to frame the named set.

### 4.1 Atomic

**Holden** (`chrisHoldenSets.txt:14`):
```
Atomic (Toe set Illusion): TOE > OP OUT [DEX] > (op side component)
```

**Platform** (`freestyleOperatorReference.ts:66-69`):
> Atomic — A cross-body uptime set with x-dex character. Operational
> form: TOE > OP OUT [DEX] > (op-side component).

**Reading:** notation matches exactly. The disagreement is ontological:

- Holden frames atomic as a *compressed compound* — "Toe set Illusion"
  reads atomic as "perform an illusion shape from a toe set".
- The platform treats atomic as a +1 *primitive operator* in the
  operator reference, with x-dex character but no formal decomposition
  to "toe + illusion".

**Curator triage:** Holden's framing offers a deeper structural
reading. The platform has not formalized atomic as a compressed
compound. If this is later promoted (atomic ≡ toe + illusion-class
dex), the operator-reference entry should be revised to note the
decomposition. No immediate action required.

### 4.2 Nuclear

**Holden** (`chrisHoldenSets.txt:8`):
```
Nuclear: CLIP > SAME OUT >
```

**Platform** (`freestyleOperatorReference.ts:99-102`):
> Nuclear — A +2 set modifier combining paradox's hip pivot with
> atomic's cross-body character. Operational form: CLIP > SAME OUT >.

**Reading:** notation matches. Disagreement on framing:

- Holden lists nuclear as a *basic set* alongside pixie, fairy,
  stepping, miraging.
- The platform treats nuclear as a *compound* +2 modifier (paradox +
  atomic stack).

**Curator triage:** the difference is framing, not mechanics. Holden's
compilation predates the platform's compound-decomposition framework;
the +2 weight (paradox(+1) + atomic(+1)) implies the platform's
compound reading is structurally consistent with Holden's notation. No
action required.

---

## 5. Conflict (1)

### 5.1 Surging

**Holden** (`chrisHoldenSets.txt:35`):
```
Surging (spinning miraging): SET > (BACK/FRONT) SPIN [BOD] > OP IN [DEX] >
```

**Platform** (`freestyleMovementSystems.ts:170`):
```
'a high-energy pre-base treatment that decomposes to spinning + stepping.'
```

**Reading:** the two decompositions disagree on the entry surface and
therefore on which named set anchors the decomposition:

| Axis | Holden | Platform |
|------|--------|----------|
| Entry surface | `SET` (set-agnostic) | `CLIP` (stepping's opening) |
| Body modifier | `SPIN [BOD]` | `spinning` |
| Terminal dex direction | `OP IN [DEX]` (same as miraging) | `OP IN [DEX]` (same as stepping) |
| Named-set anchor | miraging (SET-led) | stepping (CLIP-led) |
| Decomposition name | "spinning miraging" | "spinning + stepping" |

**The dex direction (OP IN) is identical in both readings.** The
disagreement is whether surging starts from any set type (miraging-led)
or specifically from a CLIP (stepping-led).

**Curator triage:** this is a real ontological disagreement. Options:

1. Resolve in favor of Holden — surging is set-agnostic; update
   `freestyleMovementSystems.ts:170` gloss to "spinning miraging".
2. Resolve in favor of the platform — surging is stepping-anchored;
   the Holden compilation predates the platform's choice and the
   audit footer documents the historical reading.
3. Document as two competing decompositions — both rendered on
   trick-detail pages where they apply.

No immediate action required. The public surface (§3 surging ladder)
already records both readings honestly.

---

## 6. Holden-only (27)

These are names Holden's compilation lists with structural notation
but the platform has no canonical or tracked entry for. Organized by
Holden's category structure:

### 6.1 Single-dex Holden basics (3)

| Name | Holden notation | Structural reading | Curator note |
|------|-----------------|---------------------|--------------|
| Slapping | `TOE > OP IN [DEX] > (same side component)` | Same-side-component sibling of quantum | If promoted: pair with quantum as the side-pair primitive group. |
| Bubba | `CLIP > OP OUT [DEX] >` | Reverse-direction sibling of stepping | Clean single-dex CLIP-set; structurally unambiguous. If promoted: name the directional pattern stepping ↔ bubba. |
| Tapping | `TOE > OP OUT [DEX] (plant) > (same side component)` | "Atomic same side" — same-side-component sibling of atomic | Pair with atomic as the side-pair primitive group. Holden's `(plant)` annotation is unusual notation. |

### 6.2 Multi-dex Holden compounds (6)

| Name | Holden notation | Holden parenthetical | Curator note |
|------|-----------------|----------------------|--------------|
| Sailing | `TOE > SAME IN [DEX] > OP OUT [DEX] >` | Pixie Illusion | Decomposes mechanically as pixie + illusion-class second dex. |
| Frantic | `TOE > SAME IN [DEX] > OP IN [DEX] >` | pixie-quantum | Decomposes as pixie + quantum-direction second dex. |
| Flailing | `SET > (no plant while) OP OUT [BOD] [DEX] >` | Symposium Reverse Miraging | Unusual no-plant constraint inside the notation. |
| Fairy Atomic | `TOE > SAME OUT [DEX] > OP OUT [DEX] >` | (none) | Fairy + atomic chain. |
| Shooting | `CLIP > OP IN [DEX] > OP OUT [PDX][DEX] >` | Stepping Paradox Illusion | Three-element decomposition. |
| Infracting | `opposite of a Refraction, done as a set` | (none) | Inverse pattern; not a literal grammar string. |

### 6.3 Spinning family (9)

All Holden-only. The platform tracks `spinning` as a body modifier
but doesn't surface these specific spinning-compound names.

| Name | Holden notation | Holden parenthetical |
|------|-----------------|----------------------|
| Sonic | `CLIP > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >` | double spinning |
| Peeking | `SET > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >` | double spinning (SET-led) |
| Leaning | `CLIP > OP IN [DEX] > (front) SPIN [BOD] >` | stepping inspinning |
| Go-Go | `CLIP > OP IN [DEX] > (back) spin [bod] >` | stepping backspinning |
| Twinspinning | `CLIP > SAME OUT [DEX] > (FRONT) SPIN [BOD] >` | nuclear inspinning |
| Neutron | `TOE > OP OUT [DEX] > (BACK) SPIN [BOD] > (op side)` | Atomic spin |
| Fairy Spinning | `TOE > SAME OUT [DEX] > (BACK) SPIN [BOD] >` | (none) |
| Pixie Inspinning | `TOE > SAME IN [DEX] > (FRONT) SPIN [BOD] >` | (none) |

**Curator triage:** Holden's spinning-family compilation is internally
consistent and pedagogically valuable. Several pairs document
direction-mirror siblings (Leaning ↔ Go-Go; Fairy Spinning ↔ Pixie
Inspinning) that would slot cleanly into a future spinning-family
view. None promoted by this audit.

### 6.4 Whirl/swirl variants (4)

| Name | Holden notation | Curator note |
|------|-----------------|--------------|
| Blazing | `CLIP > OP IN [DEX] > (op side component)` | Whirling's op-side-component sibling. Holden distinguishes; the platform does not separate them by terminal-component side. |
| Scattered | `CLIP > OP OUT [DEX] > (same side)` | "Reverse Whirling (same side)". |
| Shattered | `CLIP > OP OUT [DEX] > (op side)` | "Reverse Whirling (op side)". Direction-mirror sibling of Scattered. |
| Broken | `CLIP > OP OUT [DEX] > (SAME)` | Holden marks with asterisk. "clipper reverse whirl" — the underlying shape (rev-whirl) IS canonical; "Broken" is the folk synonym Holden's compilation preserves. |

### 6.5 Unusual non-standard (UNS) sets (5)

All Holden-only with non-standard entry surfaces.

| Name | Holden notation | Parenthetical |
|------|-----------------|---------------|
| Finchy | `PINCH > SAME OUT [DEX] >` | Pinching Fairy set |
| Pixie Pinching | `PINCH > SAME IN [DEX] >` | (none) |
| Twisted | `DRAGON > SAME FRONT SWIRL [DEX] > SAME IN/OUT [PDX][DEX] >` | Dragon set Swirling Paradox |
| Snapping | `DRAGON > SAME FRONT SWIRL [DEX] >` | Dragon set Swirling |
| Arctic | `FRIGIDOSIS > SAME IN [DEX] >` | frigidosis Pixie |

**Curator triage:** UNS sets exercise non-standard entry surfaces
(PINCH, DRAGON, FRIGIDOSIS) that the base Job grammar does not cover.
This is the strongest evidence that Holden's compilation reaches
beyond the canonical Job formula — directly supporting the softener
wording in the glossary §7 subsection and on /freestyle/compositional-
sets §1. No platform promotion; preserved as Holden's compilation.

---

## 7. Out of scope (4)

Two of Holden's categories — Antisymposium discipline notes (Rooting/
Rooted, Zoid) and Components (Ducking, Diving, Spinning, Inspinning,
Gyro) — describe movement constraints or body modifiers rather than
named sets. They appear in §2.6 of /freestyle/compositional-sets but
are not first-class audit subjects.

The Components row deserves a small note:

- **Ducking, Diving, Spinning, Inspinning, Gyro** are platform-tracked
  as body modifiers in `freestyleMovementSystems.ts` (axis 3: Midtime
  Body Modifiers).
- Holden frames them as "components of sets, but not necessarily sets"
  — i.e. they appear inside set notation strings but rarely function
  as a standalone set prefix.
- The platform reading and Holden's framing **agree** — body modifiers
  layer onto sets; they aren't named sets themselves.

---

## 8. Cross-source coverage matrix

For the 18 most-cited Holden names, here's the coverage across the
platform's content modules:

| Name | OperatorRef | MovementSys | SymbolicEq | ResolvedFormulas | DerivationPilot | Status |
|------|-------------|-------------|------------|------------------|-----------------|--------|
| pixie | — | ✓ | ✓ (dimwalk, phoenix) | ✓ | — | aligned |
| fairy | — | ✓ | ✓ | ✓ | — | aligned |
| stepping | ✓ | ✓ | ✓ (ripwalk) | ✓ | ✓ (blur) | aligned |
| miraging | — | (referenced) | ✓ (chain component) | ✓ (in formulas) | ✓ (mobius) | aligned |
| atomic | ✓ | ✓ | ✓ (atom-smasher, phoenix) | ✓ | (referenced) | partial fit |
| quantum | ✓ | ✓ | ✓ | ✓ | — | aligned |
| nuclear | ✓ | ✓ | — | — | — | partial fit |
| blurry | ✓ | ✓ | ✓ (via toe-blur) | ✓ | ✓ | aligned |
| barraging | ✓ | ✓ | ✓ (fury variants) | ✓ | — | aligned |
| furious | ✓ | ✓ | ✓ | ✓ (pending) | — | aligned |
| surging | — | ✓ (gloss) | — | — | — | **conflict** |
| whirling | ✓ | ✓ | — | — | — | aligned |
| pogo | — | (whirl-family entry) | — | — | — | aligned |
| blistering | — | (whirl-gyro entry) | — | — | — | aligned |
| frantic | — | — | — | — | — | Holden-only |
| sailing | — | — | — | — | — | Holden-only |
| bubba | — | — | — | — | — | Holden-only |
| slapping | — | — | — | — | — | Holden-only |

---

## 9. Recommendations (curator triage)

1. **Surging conflict resolution.** Decide between Holden's
   "spinning miraging" reading and the platform's "spinning +
   stepping" reading. Until decided, both readings live on the
   /freestyle/compositional-sets §3 ladder honestly.
2. **Atomic ontological framing.** If a future ruling treats atomic
   as a compressed compound (Holden's "Toe set Illusion"), update
   `freestyleOperatorReference.ts` to document the decomposition.
   Until then, the partial-fit framing is honest and stable.
3. **Holden-only promotion candidates.** Three categories are worth
   considering for canonical promotion if curator effort allows:
   - Direction-mirror siblings (Leaning ↔ Go-Go, Scattered ↔
     Shattered, Fairy Spinning ↔ Pixie Inspinning) — clean structural
     pairs that would slot into existing axes.
   - Single-dex Holden basics (Slapping, Bubba, Tapping) — fill the
     side-component permutation grid alongside quantum/atomic/pixie.
   - The "Broken" name (Holden's folk synonym for rev-whirl) — could
     surface on the rev-whirl trick-detail page as a historical name.
4. **UNS sets.** Preserve as Holden-only; do not promote. They
   document the non-standard entry surfaces that motivate the
   softener wording about grammar extensions.
5. **Re-audit cadence.** Run this audit again when any of:
   - The platform gains a new operator-reference entry for a Holden-
     named set.
   - A future Red ruling resolves the surging ambiguity.
   - A new content module enters the cross-source mix.

---

## 10. Where this audit appears

- **Public surface:** /freestyle/compositional-sets §4 — compact
  summary table + 8 curated headline rows + summary counts.
- **Content module:** `src/content/freestyleCompositionalSets.ts` —
  `COMPOSITIONAL_AUDIT_ENTRIES` const (single source of truth).
- **This document:** the curator-internal evidence trail with
  file:line references and triage notes.

The public surface intentionally surfaces a curated subset. The full
audit lives here because the row-by-row detail is curator-internal —
file paths, evidence quoting, and triage suggestions are review work,
not pedagogy.

— end —
