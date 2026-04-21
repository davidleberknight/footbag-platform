# legacy_data/persons/provisional/scripts/03_reconcile_provisional_to_historical.py
#
# Reconcile provisional identity candidates against canonical historical persons.
#
# v2 (alias-aware): adds an alias-resolution PASS 0 backed by the shared
# pipeline.identity.alias_resolver.AliasResolver, before the existing exact /
# last-name / first+last name heuristics. Without this pass, alias-equivalent
# candidates (e.g. "Darryl Genz" while canonical is "Daryl Genz") fell through
# to NO_HISTORICAL_MATCH → STAGED → master_person::<digest> stub in script 05,
# producing duplicate person rows. See pipeline/identity/alias_resolver.py.

import sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[4]

PROV = ROOT / "legacy_data/persons/provisional/out/provisional_identity_candidates.csv"
PERSONS = ROOT / "legacy_data/event_results/canonical_input/persons.csv"

OUT = ROOT / "legacy_data/persons/provisional/out/provisional_to_historical_matches.csv"

# Make pipeline.identity importable when this script is run directly.
sys.path.insert(0, str(ROOT / "legacy_data"))
from pipeline.identity.alias_resolver import load_default_resolver, normalize_name  # noqa: E402


def split_name(name):
    parts = name.split()
    if len(parts) < 2:
        return "", ""
    return parts[0], parts[-1]


def main():
    prov = pd.read_csv(PROV).fillna("")
    hist = pd.read_csv(PERSONS).fillna("")

    resolver = load_default_resolver()
    print(f"AliasResolver: {resolver.stats()}")

    # Build a lookup of canonical persons by id for the alias PASS 0
    pid_to_name = dict(zip(hist["person_id"].astype(str), hist["person_name"].astype(str)))

    # normalize for the existing heuristic passes
    hist["norm"] = hist.iloc[:, 1].str.lower().str.strip()
    hist["first"], hist["last"] = zip(*hist["norm"].apply(split_name))

    rows = []
    n_alias_resolved = 0

    for _, r in prov.iterrows():
        name_raw = r["canonical_candidate_name"]
        name_norm = r["canonical_candidate_name_norm"]
        first, last = split_name(name_norm)

        # ---- PASS 0: alias resolution ----
        # Resolve via shared registry. If the candidate name maps to a
        # canonical person via person_aliases.csv (or directly by canonical
        # name), short-circuit to MATCHED_TO_HISTORICAL — script 04 will
        # promote this as MATCHED_TO_HISTORICAL and script 05 will not
        # generate a master_person:: stub for it.
        alias_pid = resolver.resolve(name_raw)
        if alias_pid:
            rows.append({
                "provisional_identity_id": r["provisional_identity_id"],
                "canonical_candidate_name": name_raw,
                "canonical_candidate_name_norm": name_norm,
                "match_status": "ALIAS_HISTORICAL_MATCH",
                "matched_historical_person_id": alias_pid,
                "matched_historical_person_name": pid_to_name.get(alias_pid, resolver.canonical_name(alias_pid)),
            })
            n_alias_resolved += 1
            continue

        # ---- PASS 1: exact ----
        exact = hist[hist["norm"] == name_norm]

        if len(exact) == 1:
            m = exact.iloc[0]
            status = "EXACT_HISTORICAL_MATCH"

        else:
            # ---- PASS 2: same last name ----
            last_matches = hist[hist["last"] == last]

            if len(last_matches) > 1:
                # ---- PASS 3: same first + last ----
                first_last = last_matches[last_matches["first"] == first]

                if len(first_last) == 1:
                    m = first_last.iloc[0]
                    status = "WEAK_HISTORICAL_MATCH"

                elif len(first_last) > 1:
                    m = first_last.iloc[0]
                    status = "HISTORICAL_CONFLICT"

                else:
                    m = None
                    status = "NO_HISTORICAL_MATCH"

            else:
                m = None
                status = "NO_HISTORICAL_MATCH"

        rows.append({
            "provisional_identity_id": r["provisional_identity_id"],
            "canonical_candidate_name": name_raw,
            "canonical_candidate_name_norm": name_norm,
            "match_status": status,
            "matched_historical_person_id": "" if m is None else m.iloc[0],
            "matched_historical_person_name": "" if m is None else m.iloc[1],
        })

    out = pd.DataFrame(rows)
    out.to_csv(OUT, index=False)

    print(out["match_status"].value_counts())
    print(f"Alias-resolved: {n_alias_resolved} of {len(prov)} provisional candidates")


if __name__ == "__main__":
    main()
