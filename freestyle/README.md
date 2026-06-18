# freestyle/

The freestyle pipeline: the one data pipeline that keeps living past cutover,
when `legacy_data/` freezes. Everything needed to rebuild the freestyle tables
from committed inputs lives here — no mirror, no network.

## Rebuild

```
freestyle/run_freestyle.sh [path/to/footbag.db]   # default: database/footbag.db
```

Idempotent (each loader is DELETE+INSERT). It loads records, the trick
dictionary (curated-v1 base + Red overlays + footbag.org provenance + pending
moves), runs the notation parser, and runs QC. The footbag.org move corpus
comes from the committed snapshot (`inputs/footbag_org_moves_snapshot.csv`), not
a live scrape.

## Layout

- `loaders/` — the DB loaders (filenames keep their legacy numbers for now).
- `scripts/` — the gated footbag.org scrape (`18_*.py --live` refreshes the
  snapshot) and the notation parser.
- `inputs/` — all committed pipeline inputs (curated trick CSVs, records,
  aliases, the move snapshot).
- `tools/` — trick-video discovery + coverage prep.
- `out/`, `reports/` — gitignored build artifacts.

## Refreshing the footbag.org snapshot (pre-cutover only)

```
python3 freestyle/scripts/18_scrape_footbag_org_moves.py --live
```
Re-scrapes the live site and overwrites `inputs/footbag_org_moves_snapshot.csv`
for review and commit. Without `--live` the script is a no-op.

## Not here yet

- Symbolic-grammar build + DB load (`build_symbolic_grammar_*`) — still in
  `legacy_data/scripts/`, and the runtime reads `exploration/symbolic-grammar-2/`.
  Moving + DB-loading it is the documented follow-up.
- The shared `_trick_canonicalization.py` / `_trick_tag_invariant.py` helpers
  stay in `scripts/` (also used by the curator-media seeder); the QC loaders
  import them from there.
