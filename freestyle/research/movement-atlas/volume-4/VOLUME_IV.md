# The Atlas of the Freestyle Movement Universe, Volume IV: Taxonomy of the Two-Dex Movement Universe

Status: exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. No production code, no parser, grammar, notation, dictionary, promotion, naming, biomechanics, or historical-family work. Volumes I to III and their errata are frozen and untouched. This volume asks how the two-dex universe those volumes mapped is naturally organized, deriving the taxonomy from structure and comparing it with historical naming only afterward, as observation.

Generated evidence: `generate_taxonomy.py` (read-only, over the frozen Volume II catalog and the live dictionary notation). Machine-readable assignment: `taxonomy_catalog.csv`. Companions: `STRUCTURAL_FAMILY_PROFILES.md`, `HIERARCHY.md`, `BOUNDARY_ANALYSIS.md`, `HISTORICAL_COMPARISON.md`.

## 1. The question and the principle

Volumes I to III mapped coordinates and their representation. Volume IV asks which coordinates naturally belong together. The principle is strict: coordinates first, taxonomy second, names last. The families are derived from the relationship between a coordinate's two dexterities, never from any trick name; the existing named families are brought in only at the end, as an observational layer, and are never used to define a structural family.

## 2. The structural facets

Every two-dex coordinate is an ordered pair of dexterities, dex1 = (side1, direction1, out1) and dex2 = (side2, direction2, out2). The natural taxonomic distinctions are the RELATIONS between the two, not their absolute values, because a family is a set of coordinates that share a structural relationship. Four relational facets, each binary, plus one flag:

- **Leg usage.** Same-leg (side1 = side2, the two dexterities circle on the same side) versus alternating-leg (side1 != side2).
- **Directional relation.** Parallel (direction1 = direction2, the two dexterities circle the same way) versus reversed (a direction reversal between them).
- **Receiver behavior.** Preserved (the bag ends on the side it entered) versus changed (the bag crosses).
- **Carriage path.** Steady (the intermediate carriage equals the final side) versus mid-cross (the bag passes through the other side). This is the notation-invisible axis from Volume III.
- **Repeat flag.** Repeated (dex1 = dex2, the diagonal) versus distinct.

The three named facets (leg, direction, receiver) generate eight **primary families**; the carriage facet subdivides each latently; the repeat flag marks a special locus inside the same-leg parallel families.

## 3. The decisive geometric result: the universe is a uniform hypercube

The first finding is that, at the level of pure geometry, **there is no privileged clustering.** On the clean reference fiber (sixty-four valid coordinates, no blocked or artifact or uncertain cells), every facet splits the fiber exactly in half:

```
   leg        same-leg = 32   alternating-leg = 32
   direction  parallel = 32   reversed        = 32
   receiver   preserved = 32  changed         = 32
   carriage   steady = 32     mid-cross       = 32
```

and the eight primary families each hold exactly eight of the sixty-four coordinates. No facet is more natural than another; each partitions the space evenly, and any product of them is an equally valid classification. This is the signature of a uniform hypercube. The pure two-dex coordinate space does not break into disjoint natural families the way a cluster analysis would find clumps; it is homogeneous, and its taxonomy is a **faceted coordinate system of orthogonal axes**, not a partition into naturally-separated groups.

Over all 1216 valid coordinates the eight families are not quite equal in size (176 each for the four receiver-preserved families, 128 each for the four receiver-changed families), but that skew is not a natural clustering either: it is entirely an effect of the grammar boundary, because midline landings collapse the changed-receiver copy into an artifact that is removed. Under the geometry itself, the eight families are equal.

## 4. Where structure actually comes from: occupancy and higher layers

The uniform geometry does not mean the universe is featureless; it means the features come from elsewhere. Two real sources of structure appear once the mapped universe meets the corpus (Volume III's 395 real two-dex movements):

- **Uneven occupancy.** Real movements do not fill the eight families evenly. They strongly prefer receiver-change: 247 of 395 movements end with the bag crossed, against 145 that preserve the receiver. The most-occupied signature (same-leg, parallel, changed, 68 movements) is more than twice the least (alternating-leg, parallel, preserved, 30). The geometry is uniform; the population is not, and the population's preference for crossing the bag is a genuine structural fact about which two-dex movements are actually used.
- **Higher-layer features the pure geometry does not carry.** A third of the corpus is co-articulated (32.7%), nearly a quarter carries a body-mediated join (23.0%), a sixth is paradox-bearing (15.4%), and a twelfth is rotational (8.1%). None of these is a facet of the two-dex dexterity pair; each is an additional axis stacked on top of it. They are where the corpus is genuinely partitioned, because a body-mediated join or a paradox is a categorical presence-or-absence, not an even split of a hypercube.

So the natural structure of the populated universe is the faceted geometric taxonomy (uniform, orthogonal axes) overlaid by occupancy (a preference for receiver-change) and by higher-layer feature axes (co-articulation, body-mediation, paradox, rotation) that partition where the geometry does not.

## 5. The final question

**Does the movement universe possess a natural taxonomy independent of freestyle's historical naming?**

Answered entirely from atlas evidence: **yes, but it is a faceted taxonomy, not a partition, and the universe is geometrically continuous rather than naturally clustered.** The evidence is unambiguous. The pure two-dex geometry is a uniform hypercube in which every structural facet partitions the space evenly and no clustering is privileged, so the universe does not fall into disjoint natural families of its own accord; it is continuous, organized by a small set of orthogonal relational axes (leg usage, directional relation, receiver behavior, carriage path, and the repeat flag). That orthogonal-axis structure is a genuine, name-independent taxonomy, but it is a coordinate system, not a set of clumps.

The clumping that does exist is imposed on the uniform geometry from two directions: the corpus occupies it unevenly, with a real preference for movements that cross the bag, and higher-layer operators (co-articulation, body-mediation, paradox, rotation) add categorical axes the pure dexterity pair does not have. And freestyle's historical families, examined last, turn out to be an orthogonal axis again: they classify by the terminal mechanic (the landing), not by the dexterity-pair relation, so each named family spreads across the structural facets and each facet contains many named families (`HISTORICAL_COMPARISON.md`).

The organizing principles, stated plainly: the two-dex universe is a continuous, uniform hypercube carrying an orthogonal faceted taxonomy (five relational axes); it is not naturally partitioned by its geometry; and the groupings that appear come from corpus occupancy, from higher-layer operators, and from the historical terminal-mechanic naming, each of which is a separate axis laid over the same continuous space. The universe has a natural structure, and that structure is a lattice of independent axes, not a tree of disjoint families.

## 6. Deliverables and boundaries

The taxonomy catalog assigns every one of the 1216 valid coordinates to one of the eight primary families and routes the 704 boundary coordinates (384 launch-foreclosure artifacts, 192 midline artifacts, 128 unresolved-surface cells) to the boundary analysis rather than forcing them into a family. The structural family profiles describe each of the eight, the hierarchy file shows why the families form a lattice and not a tree, and the historical comparison records the orthogonality of naming and structure. Volume IV creates no movement formulas, revises no earlier volume, and repairs neither grammar nor notation; it describes the natural structure of a universe the earlier volumes mapped.
