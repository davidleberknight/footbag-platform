# Body-Topology Audit — Data-Fix / Taxonomy-Conflict Candidates

Read-only. Curator review list.

## 1. `modifier_type` does not match body role
| modifier | DB modifier_type | body role |
|---|---|---|
| barraging | set | Dexterity-Operator |
| railing | set | Dexterity-Operator |

## 2. Uncategorized body modifiers (no semantic bucket yet)
| modifier | count | DB type |
|---|---|---|
| surfing | 1 | set |
| floating | 1 | set |
| splicing | 1 | set |
| shooting | 1 | set |
| warping | 1 | set |

## 3. Airborne / Elevation gap

flying, jumping, stomping, pogo are not carried in `freestyle_trick_modifier_links` (0 membership each) despite the `JUMP` token appearing in 10 formulas. The elevation axis is uncurated; consider whether these should be registered as modifiers.

## 4. Notation vs membership — the spin conflation (NOT a data error)

The `SPIN` formula token appears in 177 tricks, but the spinning modifier ecosystem is 78 and gyro is 38. The difference is rotational BASE tricks (osis, torque, blender, …) that carry a spin in their own base formula and are not 'spinning' applications. Body membership must be read from the modifier links, not the SPIN token.

