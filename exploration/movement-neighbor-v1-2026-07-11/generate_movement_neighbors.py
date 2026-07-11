#!/usr/bin/env python3
"""Generate and audit the Version 1 Movement Neighbor relationship.

Exploration-only. Reads the Atlas one-dex toe cube coordinates as the structural
source and emits the node table, the canonical undirected edge table, and a directed
consumer projection, then audits the result against every doctrinal invariant.

Two tricks are movement neighbors when they belong to the same bounded neighborhood
and their structural coordinates differ in exactly one of three attributes: the side
the leg circles on, the direction it circles, and the side the bag lands on. The
relation is undirected; the canonical edge table emits each pair once.

Identity is the Atlas movement coordinate, never the trick name and never the
production operational-notation string. This script reads no production data and
writes nothing outside its own output folder; the production active-canonical, alias,
and operator facts were verified separately and are recorded in the QC report.
"""

import csv
import os
from itertools import combinations

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ATLAS_CATALOG = os.path.join(REPO_ROOT, "exploration", "movement-atlas", "atlas_catalog.csv")
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

NEIGHBORHOOD_ID = "one_dex_toe"
PROVENANCE_VERSION = "movement-neighbor-v1"

# The bounded neighborhood: exactly these eight one-dex toe atoms, by their Atlas
# catalog name (which equals the production canonical slug for all eight). Bounding
# the set is the neighborhood definition, not a filter that could hide edges.
NEIGHBORHOOD = {
    "around_the_world", "orbit", "pixie", "fairy",
    "mirage", "illusion", "pickup", "legover",
}

# The three structural attributes, each read from an explicit Atlas catalog column,
# and the plain-language label naming a change in that attribute. The label reads the
# same in both directions of an undirected edge (reversing a direction, switching a
# side), so it is symmetric by construction. No Atlas coordinate term appears here.
ATTRS = [
    # (attribute name, catalog column, value map, change label)
    ("circling side", "dex_side",  {"SAME": "same", "OP": "opposite"}, "switch circling side"),
    ("dex direction", "direction", {"IN": "in", "OUT": "out"},          "reverse dex direction"),
    ("landing side",  "term_side", {"SAME": "same", "OP": "opposite"},  "switch landing side"),
]


def load_nodes():
    """Read the eight one-dex toe cube atoms from the Atlas catalog."""
    nodes = {}
    with open(ATLAS_CATALOG, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = row["name"]
            if row["region"] != "1-DEX" or row["sub"] != "cube":
                continue
            if row["launch"] != "toe" or row["landing"] != "toe":
                continue
            if name not in NEIGHBORHOOD:
                continue
            attrs = {}
            for attr_name, col, vmap, _label in ATTRS:
                raw = row[col]
                if raw not in vmap:
                    raise SystemExit(f"unmapped {col} value {raw!r} for {name}")
                attrs[attr_name] = vmap[raw]
            nodes[name] = {
                "slug": name,
                "display_name": name.replace("_", " "),
                "neighborhood_id": NEIGHBORHOOD_ID,
                "circling_side": attrs["circling side"],
                "dex_direction": attrs["dex direction"],
                "landing_side": attrs["landing side"],
                "structural_coordinate": row["atlas_coord"],
                "atlas_provenance": f"atlas 1-dex toe cube; {row['atlas_coord']}",
            }
    missing = NEIGHBORHOOD - set(nodes)
    if missing:
        raise SystemExit(f"neighborhood members absent from the Atlas catalog: {sorted(missing)}")
    return nodes


def differing_attrs(a, b):
    """List the structural attributes on which two nodes differ."""
    out = []
    for attr_name, _col, _vmap, label in ATTRS:
        key = attr_name.replace(" ", "_")
        if a[key] != b[key]:
            out.append((attr_name, label))
    return out


def build_edges(nodes):
    """Undirected edges: exactly-one-attribute-differs pairs, each emitted once."""
    edges = []
    for sa, sb in combinations(sorted(nodes), 2):  # sorted -> each pair once, a<b
        diffs = differing_attrs(nodes[sa], nodes[sb])
        if len(diffs) != 1:
            continue
        changed_attr, label = diffs[0]
        edges.append({
            "neighborhood_id": NEIGHBORHOOD_ID,
            "trick_a_slug": sa,
            "trick_b_slug": sb,
            "changed_attribute": changed_attr,
            "change_label": label,
            "source_coord_a": nodes[sa]["structural_coordinate"],
            "source_coord_b": nodes[sb]["structural_coordinate"],
            "provenance_version": PROVENANCE_VERSION,
        })
    return edges


def write_csv(path, fieldnames, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def main():
    nodes = load_nodes()
    edges = build_edges(nodes)

    node_rows = [nodes[s] for s in sorted(nodes)]
    write_csv(
        os.path.join(OUT_DIR, "movement_neighbor_nodes.csv"),
        ["slug", "display_name", "neighborhood_id", "circling_side", "dex_direction",
         "landing_side", "structural_coordinate", "atlas_provenance"],
        node_rows,
    )
    write_csv(
        os.path.join(OUT_DIR, "movement_neighbor_edges.csv"),
        ["neighborhood_id", "trick_a_slug", "trick_b_slug", "changed_attribute",
         "change_label", "source_coord_a", "source_coord_b", "provenance_version"],
        edges,
    )
    directed = []
    for e in edges:
        for src, dst in ((e["trick_a_slug"], e["trick_b_slug"]),
                         (e["trick_b_slug"], e["trick_a_slug"])):
            directed.append({"source_slug": src, "neighbor_slug": dst,
                             "change_label": e["change_label"]})
    directed.sort(key=lambda r: (r["source_slug"], r["neighbor_slug"]))
    write_csv(
        os.path.join(OUT_DIR, "movement_neighbor_directed.csv"),
        ["source_slug", "neighbor_slug", "change_label"],
        directed,
    )

    audit(nodes, edges, directed)


def audit(nodes, edges, directed):
    """Print pass/fail for every doctrinal invariant and the manual sanity checks."""
    print("=" * 68)
    print("MOVEMENT NEIGHBOR v1 -- GENERATION + AUDIT")
    print("=" * 68)
    print(f"nodes: {len(nodes)}   undirected edges: {len(edges)}   directed rows: {len(directed)}")
    results = []

    def check(name, ok, detail=""):
        results.append(ok)
        print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" -- {detail}" if detail else ""))

    # Neighborhood closure.
    closed = all(e["trick_a_slug"] in NEIGHBORHOOD and e["trick_b_slug"] in NEIGHBORHOOD
                 for e in edges)
    check("neighborhood closure (every endpoint in the eight)", closed)

    # Exactly one change per edge, recomputed independently.
    one_change = all(len(differing_attrs(nodes[e["trick_a_slug"]], nodes[e["trick_b_slug"]])) == 1
                     for e in edges)
    check("exactly one structural attribute differs per edge", one_change)

    # Irreflexivity.
    irreflexive = all(e["trick_a_slug"] != e["trick_b_slug"] for e in edges)
    check("irreflexive (no self-neighbor)", irreflexive)

    # No parallel edges.
    pair_keys = [frozenset((e["trick_a_slug"], e["trick_b_slug"])) for e in edges]
    no_parallel = len(pair_keys) == len(set(pair_keys))
    check("no parallel edges (each unordered pair at most once)", no_parallel)

    # Symmetry: directed projection carries both directions of each undirected edge.
    directed_pairs = {(r["source_slug"], r["neighbor_slug"]) for r in directed}
    symmetric = all((e["trick_a_slug"], e["trick_b_slug"]) in directed_pairs
                    and (e["trick_b_slug"], e["trick_a_slug"]) in directed_pairs
                    for e in edges)
    check("symmetry (both directions present in directed projection)", symmetric)

    # Regularity: every node degree 3.
    degree = {s: 0 for s in nodes}
    for e in edges:
        degree[e["trick_a_slug"]] += 1
        degree[e["trick_b_slug"]] += 1
    regular = all(d == 3 for d in degree.values())
    check("regularity (every trick has exactly 3 neighbors)", regular,
          "degrees=" + ",".join(f"{s}:{degree[s]}" for s in sorted(degree)))

    # Expected edge count, DERIVED from the doctrine: three binary attributes over a
    # complete cube of 2^3 = 8 nodes. Flipping one attribute pairs the 8 nodes into
    # 8/2 = 4 disjoint edges; three attributes give 3 * 4 = 12. Equivalently a
    # d-cube has d * 2^d / 2 edges = 3 * 8 / 2 = 12.
    expected = 3 * (len(nodes) // 2)
    check("expected edge count derived (3 attributes x 8/2 = 12)",
          len(edges) == expected, f"expected={expected} actual={len(edges)}")

    # Change-label accuracy: each edge's label is the one for the single differing attr.
    label_by_attr = {attr: label for attr, _c, _m, label in ATTRS}
    label_ok = all(e["change_label"] == label_by_attr[e["changed_attribute"]] for e in edges)
    check("change-label names exactly the one changed attribute", label_ok)

    # Change vocabulary is closed and coordinate-free.
    allowed = set(label_by_attr.values())
    vocab_ok = all(e["change_label"] in allowed for e in edges)
    coord_terms = {"same", "op", "in", "out", "s.", ".o", "hamming", "vertex", "cube", "bit"}
    labels_clean = not any(t in e["change_label"].lower() for e in edges for t in ("cube", "vertex", "hamming", "bit", "coordinate"))
    check("closed, coordinate-free change vocabulary", vocab_ok and labels_clean,
          "labels=" + "; ".join(sorted(allowed)))

    # Manual sanity checks (spelled out in the task).
    print("-" * 68)
    print("MANUAL SANITY CHECKS")
    def rel(a, b):
        return differing_attrs(nodes[a], nodes[b])
    def is_neighbor_with_label(a, b, label):
        d = rel(a, b)
        return len(d) == 1 and d[0][1] == label
    check("mirage <-> illusion : reverse dex direction",
          is_neighbor_with_label("mirage", "illusion", "reverse dex direction"))
    check("mirage <-> pickup : switch landing side",
          is_neighbor_with_label("mirage", "pickup", "switch landing side"))
    check("mirage <-> pixie : switch circling side",
          is_neighbor_with_label("mirage", "pixie", "switch circling side"))
    mf = rel("mirage", "fairy")
    check("mirage <-> fairy : NOT neighbors (two coordinates differ)",
          len(mf) == 2, "differs in: " + ", ".join(a for a, _ in mf))
    check("around_the_world <-> orbit : reverse dex direction",
          is_neighbor_with_label("around_the_world", "orbit", "reverse dex direction"))
    check("pixie <-> fairy : reverse dex direction",
          is_neighbor_with_label("pixie", "fairy", "reverse dex direction"))
    check("pickup <-> legover : reverse dex direction",
          is_neighbor_with_label("pickup", "legover", "reverse dex direction"))

    # Report every two-or-three-coordinate rejection (intuitive-looking non-edges).
    print("-" * 68)
    print("REJECTED PAIRS (differ in 2 or 3 coordinates, so NOT neighbors)")
    for a, b in combinations(sorted(nodes), 2):
        d = rel(a, b)
        if len(d) >= 2:
            print(f"  {a} x {b}: differs in {len(d)} -> " + ", ".join(x for x, _ in d))

    print("=" * 68)
    print("VERDICT:", "ALL INVARIANTS PASS" if all(results) else "FAILURES PRESENT")
    print("=" * 68)


if __name__ == "__main__":
    main()
