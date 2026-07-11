# Atlas Guide: how to read the Movement Atlas

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. A reader's guide to `ATLAS_VOLUME_I.md` and the machine-readable `atlas_catalog.csv`. It explains the coordinate system, the columns, and what each status means. It adds no new claims.

## 1. The one idea

The movement universe is a **surface-fiber bundle**. A base point is a pair of surfaces (where the bag launches, where it lands). Over every base point sits the same eight-vertex **dex cube**. A movement is a base point plus a cube vertex. Names are optional labels placed on some of those movements; the atlas maps every movement, named or not.

## 2. Reading a coordinate

A one-dexterity address is `launch:landing/side.direction.termside`.

- `launch` / `landing`: the surfaces, for example `toe`, `clipper`, `heel`, `head`, `peak`. `clip` abbreviates the clipper launch; `SELF` marks a fiber that launches and lands on the same surface.
- `side`: which side the leg circles on. `S` = same-side, `O` = opposite-side.
- `direction`: which way the leg circles. `IN` or `OUT`.
- `termside`: which side the bag lands on relative to the reference foot. `S` = same, `O` = opposite (crosses the body).

Worked examples:

- `toe:toe/O.IN.O` = launch from the toe, opposite-side inward dexterity, bag lands crossed. This is the movement named **mirage**.
- `toe:toe/S.IN.S` = toe launch, same-side inward, bag returns same. This is **around_the_world**.
- `toe:heel/S.OUT.S` = toe launch, same-side outward dexterity, bag lands held on the heel. **Unnamed.** A real, grammar-valid location with no dictionary label.

A zero-dexterity address puts the terminal in the dex slot:

- `set:toe/DEL` = a held toe stall.
- `set:-/BOD:spin` = a bare spin (a body step, no bag contact, no landing surface).
- `set:sole/KICK` = a bare sole kick.

## 3. The catalog columns (`atlas_catalog.csv`)

One row per coordinate. Columns:

- `region` — `0-DEX` (ground floor) or `1-DEX` (the cube bundle).
- `sub` — `stall` / `body` / `kick` / `cube`.
- `atlas_coord` — the address from Section 2. The stable, name-free key.
- `launch`, `landing` — the surface pair (the base point).
- `landing_grade` — 1 for a plain landing, 2 for a hard one (cross-body or unusual surface).
- `landing_lat` — `paired` (the surface has a same/opposite distinction) or `midline` (one central target).
- `dex_side`, `direction`, `term_side` — the cube vertex, in full words.
- `movement_family` — the structural family (Section 5).
- `symbolic_formula` — the frozen Grammar v1 movement formula.
- `add` — the additive difficulty the grammar assigns (`?` where the grammar cannot score it).
- `grammar_status` — see Section 4.
- `representation` — see Section 4.
- `name` — the dictionary name if the coordinate is named, else blank.
- `notes` — a one-line description of the coordinate's standing.

## 4. What each status means

`grammar_status` describes the coordinate's standing in the grammar:

- **valid** — a well-formed movement the grammar generates and can score. Real terrain.
- **blocked** — the grammar correctly refuses it (a cross-body launch cannot reach its own same-side face). The grammar working, not a gap.
- **artifact** — the enumerator produced a duplicate the grammar does not distinguish (the opposite-side copy of a landing that has only one central target). A feature of the projection, not a place.
- **uncertain** — the coordinate depends on a grammar question the frozen grammar has not settled (the peak surface; the bare-surface kick's unscored point).

`representation` describes the naming layer:

- **existing** — a live dictionary trick sits at this coordinate, under its structural name.
- **existing-another-name** — occupied, but under an opaque folk name rather than its structural description (for example `guay` for the inside pickup).
- **unnamed** — grammar-valid, structurally sound, no label.
- **grammar-blocked** / **grammar-artifact** / **grammar-uncertain** — mirror the grammar-status values above for coordinates that are not real named-able terrain.

Two rules the atlas holds to, so the statuses stay clean:

- It never speculates about physical realizability. "Unnamed" means unlabeled, not impossible.
- It never invents names or recommends promotion. A blank `name` is a fact about the dictionary, not a suggestion.

## 5. The movement families

Nine families group the fibers by launch class and landing grade:

- `toe-launch / plain-paired cube` — the reference family; the densest named region.
- `self-fiber / plain-paired cube` — launch and land on the same paired plain surface.
- `clipper-launch / plain-paired cube` — cross-body launch onto a plain paired surface; half of each cube is blocked.
- `toe-launch / plain-midline square` and `clipper-launch / plain-midline square` — midline landings; half of each cube is artifact.
- `toe-launch / unusual-surface cube` and `clipper-launch / unusual-surface cube` — heel, sole, cloud landings.
- `toe-launch / cross-body cube` and `clipper-launch / cross-body cube` — the clipper landing (a cross-body contact).

## 6. Navigating the map

- To find a known trick's location: search `atlas_catalog.csv` for its `name`; read its `atlas_coord`.
- To explore a region: filter by `movement_family` or by a `launch:landing` fiber prefix in `atlas_coord`.
- To find unexplored terrain: filter `representation = unnamed` within a family of interest.
- To see the grammar's own structure: filter `grammar_status` to `blocked`, `artifact`, or `uncertain`.
- To reason structurally about a coordinate: its family, grade, symmetry partners (flip any axis letter), and status all read directly from the address and its row, with no reference to any name.
