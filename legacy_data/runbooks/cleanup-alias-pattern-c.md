
# Runbook: cleanup-alias-pattern-c

## When to Use
Invoke when:
- Duplicate persons detected by QC
- Stale alias rows exist in person_aliases.csv
- Alias target pids no longer exist
- Diacritic / normalization duplicates appear

---

## Goal
Fix alias data safely without introducing new inconsistencies.

---

## Categories

1. Recoverable stale
- alias → dead pid
- person_canon matches live person
→ retarget safely

2. Unrecoverable
- corrupted encoding ( , ?)
→ manual review or leave

3. Self-loops
- alias == canon == target
→ optional cleanup only

---

## Workflow

1. Identify failing cases
```bash
python3 legacy_data/pipeline/qc/check_alias_duplicate_persons.py
4. Apply minimal safe fixes
- retarget only exact canonical matches
- do not guess ambiguous mappings

5. Rebuild identity pipeline
→ use `rebuild-identity-pipeline`

6. Confirm QC returns 0 violations

---

## Conflict-bucket taxonomy (partition before resolving)

When alias conflicts surface (two candidate identities competing for one alias),
partition them into buckets and resolve the mechanical ones first:

- **Bucket 1 — strict self-pointing orphan rows** (alias == canon == target, no
  other referents): mechanically safe to delete.
- **Bucket 2 — conflicts where both pids carry participant refs**: never resolve
  mechanically; escalate to a domain expert with the evidence for each side.
- **Bucket 3 — reserved**: a new conflict shape gets a new bucket rather than
  being forced into 1 or 2.

---

## Identity-merge checklist (doomed pid → survivor pid)

1. Confirm doomed + survivor row counts, event overlap, and team-row handling
   BEFORE writing anything.
2. PT patch (`tools/patch_pt_v{N}_<slug>.py`): delete the doomed row; union
   `player_ids_seen` / `player_names_seen` / aliases into the survivor; append a
   merge note; leave `aliases_presentable` as-is.
3. Placements patch (`tools/patch_placements_v{M}_<slug>.py`): remap `person_id`
   (solo rows) and split/remap `team_person_key` (team rows); assert zero
   residual doomed refs.
4. Check for composite keys containing BOTH the doomed and survivor pids;
   expected zero — if found, handle the intra-key collapse explicitly.
5. Alias cleanup: delete doomed-pointing self rows; rebind ALL alias rows that
   point at the doomed pid (variants, typos, abbreviations) to the survivor.
6. Mirror the remap in `out/Placements_ByPerson.csv` and remove the doomed row
   from `out/Persons_Truth.csv`.
7. Re-export (historical export, then platform export), then rebuild the local DB.
8. Verify zero residual doomed pid in canonical output and the DB; verify honor
   flags preserved; run QC to PASS.
9. If an honor flag regressed: add an alias row mapping the source name to the
   survivor pid; never restore a code override.
10. The human owns commits.

---

## Merges that need no patch at all

Two duplicate shapes resolve with a single alias row and nothing else. Reach for the
checklist above only when both sides are canonical rows carried by the identity lock.

- **A provisional stub duplicating a canonical person.** Rows whose person id begins
  `master_person::` are built from the legacy club and membership rosters, not from the
  lock, and the enrichment loader deletes and rebuilds the whole provisional cohort every
  run. A truth-file patch is therefore impossible and a hand-deleted row returns on the
  next run. One alias row pointing the stub's spelling at the canonical person suppresses
  it three steps upstream: the provisional master build never mints it, the reconciler
  routes it to the canonical person, and the persons-master build drops it again as
  defence in depth. Re-run the provisional and persons phases plus the enrichment load,
  and the stub is gone at source.

- **A canonical row generated from the result stream.** A person row that exists only
  because a result spelled the name differently is regenerated from the results on every
  export, so an alias row is enough: the historical export resolves the spelling to the
  surviving person, the duplicate stops being generated, and its placements re-attribute
  in the same pass. Verify by rebuilding and confirming the row is absent from
  `out/canonical/persons.csv` before running QC, because the alias-duplicate gate fails
  hard if the row survives alongside the alias.

Both shapes still need the alias to be right. A wrong alias merges two real people, and
neither leaves the audit trail a patch tool does.

---

## HoF-only stub rows

When a Hall-of-Fame honoree has no competition placements, add a PT stub via
`tools/patch_pt_v{N}_add_hof_only_stubs.py`: `effective_person_id` is a stable
UUID5 from the alias-resolver name normalization, or the pre-filled pid from
`hof.csv` when present; `source = patch_v{N}:hof_only_stub`;
`player_names_seen` = the canonical display; remaining columns empty. No
placements changes and no alias rows in the same batch, unless correcting an
identity collision.
