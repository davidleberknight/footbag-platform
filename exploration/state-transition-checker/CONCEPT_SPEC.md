# State-Transition Compatibility Checker: Concept Spec

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. This is a design note only. No product code, no generator build, no dictionary rows, no promotions. It defines the minimal model for a future checker that reports whether two or more moves can connect, motivated by Red's Frontier ruling.

## 1. What Red ruled, and why a checker

Red's Frontier answer: the frontier of unhit tricks and combos is too vast to enumerate, and "physically impossible" is a dangerous permanent category because players make once-impossible things possible. The one hard, useful distinction is combo compatibility, whether the terminal contact and state of one move can feed the required entry and contact of the next. A generator or checker that reports connectability from start and end contacts is the useful artifact this points to. This spec defines that model without building it.

The doctrine home for the ruling is `freestyle/doctrine/papers/4_Frontier.md`; this note is the design that would implement its combo-compatibility half.

## 2. The motivating case (not to be overfit)

Fog and Blurry Whirl are ordinary moves on their own. As a combo, Fog into Blurry Whirl does not connect:

- **Fog** notation: `CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP OUT [DEX] > SAME TOE [DEL]`. It leaves the bag in a **toe stall** (terminal surface = toe, contact = held delay).
- **Blurry Whirl** notation: `CLIP > OP IN [DEX] > OP IN [PDX] [DEX] > OP CLIP [XBD] [DEL]`. It **requires a clipper entry** (its opening set is `CLIP`).

The bag ends on the toe, but the next move must start from a clipper, and no reset bridges them, so the link is **state-transition incompatible**. It is not impossible: either move is standard, and a different pairing, or a bridging set, could connect. The model must express exactly this, and no more, so it does not overfit to one example: the general rule is "terminal contact/state of move N must be able to serve as the entry contact/state that move N+1 requires."

## 3. State fields the model needs

Per move, two ends and the state between them:

**Entry (what the move requires to begin)**
- `entry_surface` / `entry_contact`: the surface and contact the opening set assumes. In notation this is the launch token (`SET`, `CLIP`, `TOE`) plus the first bracketed role.
- `entry_side`: same-side or opposite-side leg relation, where the entry commits one. A cross-body launch (clipper) commits an opposite-side, across-the-body configuration; a central launch (toe) commits neither.

**Terminal (what the move leaves)**
- `terminal_surface` / `terminal_contact`: the last landing surface and its role. Held stall `SURFACE [DEL]`, cross-body stall `[XBD] [DEL]` (clipper), unusual-surface stall `[UNS] [DEL]` (heel, sole, cloud), or a launched-away kick `[KICK]`.
- `terminal_side`: same-side or opposite-side, where the landing surface is paired (a midline landing has one central value).
- `terminal_body_state`: support and body posture at the end (planted, no-plant, airborne), where it changes what can follow.

**Transition semantics**
- `is_kick_terminal`: a `[KICK]` terminal launches the bag away rather than holding it, so the next move's entry is whatever catches the airborne bag, a distinct lane from a held-stall handoff.
- `resets_state`: whether a move, or a set placed between two moves, resets the contact rather than preserving it. A held stall preserves the surface for the next set; a bridging set (re-kick, re-position) can convert one surface to another.

**Compatibility rule (first cut)**
- `link(A, B)` is compatible when `terminal_contact(A)` can serve as `entry_contact(B)`: the same surface, or a defined bridging set converts A's terminal surface to B's entry surface. A kick terminal is compatible with whatever move catches the launched bag. Everything else is state-transition incompatible until a curator rules a bridge exists.

## 4. What data we already have

- **Terminal surface and role** and the **launch token** are already encoded in `freestyle_tricks.operational_notation` for every trick with complete notation, and the Phase I corpus parse (`freestyle/research/trick-universe-matrix/full_corpus_parse.csv`) already tokenizes them. For those tricks, the entry and terminal contacts are machine-readable with no new data.
- The Fog and Blurry Whirl fields above were read straight from their stored notation, which is the proof of concept for the extraction.

## 5. What data is missing or needs curator annotation

- **The surface-to-surface transition matrix.** Which terminal contacts may bridge to which entry contacts, and via what set, is not in the data. This is the doctrine-sensitive core and is **curator or expert ruling required**. Red's Fog example is one confirmed "incompatible" cell; the rest of the matrix is unwritten.
- **Generic `SET` disambiguation.** A move launched from the generic `SET` token does not name its required entry surface, so its entry field is **unknown / unverified** until annotated.
- **The incomplete-notation cohort.** The roughly sixteen active tricks with blank notation have no terminal or entry to read; they are **unknown / unverified** until notation lands.
- **Terminal body/support state** is only partially in the notation (posture markers appear per step but not on every terminal), so airborne-versus-planted handoffs may need curator annotation where the notation is silent.

## 6. Where notation is sufficient versus where annotation is required

- **Sufficient from notation:** entry surface and contact (launch token plus first role), terminal surface and contact (last landing plus role), terminal side for paired surfaces, and the kick-terminal flag. These cover the extraction for every completely-notated trick.
- **Requires curator annotation:** the transition compatibility matrix (which handoffs and bridging sets are legal), generic-`SET` entry disambiguation, and terminal body/support state where the notation does not record it.

## 7. Where this belongs

Exploration first, product later. The first artifact is a read-only prototype that extracts entry and terminal contacts from the corpus notation, applies a small curator-seeded compatibility matrix, and validates against Fog into Blurry Whirl (must report incompatible) plus a set of known-good combos (must report compatible). Only if it proves useful, and only after the transition matrix is curator-ratified, does a product surface follow. Nothing here commits to building either; this note is the design the prototype would implement.

## 8. Explicit non-goals

- No claim that any incompatible link is permanently impossible; incompatibility is dated to the transition rules in force.
- No enumeration of the frontier; the checker judges specific pairings, it does not list what has not been hit.
- No new schema, no dictionary rows, no promotions, no generator build in this note.
