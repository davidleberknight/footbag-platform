# Footbag.org Recovery Sprint — Closure Report (2026-06-29)

Closes the Footbag.org freestyle recovery sprint. No unresolved compounds were
authored, FootbagMoves was not started, and no doctrine / parser / ADD /
promotion change was made.

## 1. What was implemented (shipped, commit `db8bfb3e`)

- **Member Tips recovery.** Legacy `moves2.movehints` community technique advice
  is extracted, sanitized, deduped, and shown on trick-detail pages behind a
  compact, collapsed-by-default "Community Tips (N)" control. Pipeline: extractor
  (`legacy_data/scripts/extract_footbag_org_member_tips.py`) -> committed NDJSON
  (`freestyle/inputs/footbag_org_member_tips.ndjson`) -> loader
  `freestyle/loaders/27_load_trick_tips.py` -> `freestyle_trick_tips` table ->
  `freestyleService.getTrickDetailPage` -> `trick-shell.hbs`.
- **Three recovery aliases** so spelling/folk variants resolve: `pixie opposite
  side butterfly` -> dimwalk (`trick_aliases.csv`); `pixie double legover` -> smog
  and `stepping paradox eggbeater` -> bedwetter (`red_additions`).
- **Five-bucket preservation** of every tip (nothing discarded).
- **Docs:** `docs/DATA_MODEL.md` §4.32 entry for `freestyle_trick_tips`.

## 2. What was intentionally NOT implemented

- No authoring/promotion of the unresolved freestyle compounds.
- No FootbagMoves work (high-ADD frontier is a separate sprint).
- No change to doctrine, parser, ADDs, family, or first-class eligibility.
- No author names on public pages (v1).
- `moves_journal` (private per-member practice log) not extracted; `move_tip_votes`
  (abandoned) not extracted.
- Atomic Double Over Down NOT mapped to `fusion` (left ambiguous).

## 3. Final tip bucket counts

| Bucket | Tips | Storage | Public? |
|---|---|---|---|
| published | 408 (115 tricks) | canonical slug | yes |
| unresolved_freestyle | 7 | `unresolved:<name>` | no |
| unresolved_frontier | 1 | `unresolved:pogo-op-whirling-swirl` | no |
| unresolved_ambiguous | 1 | `unresolved:atomic-double-over-down` | no |
| future_net | 2 | `unresolved:net:<name>` | no |

Total 419 (= 431 raw movehints − 6 empty − 6 within-trick duplicates).

## 4. Unresolved slug policy

A tip whose legacy trick name has no canonical slug is preserved, never dropped,
under a stable placeholder slug: `unresolved:<kebab-name>` for freestyle, and
`unresolved:net:<kebab-name>` for net techniques held for future Net pages. These
placeholder slugs have **no foreign key** to `freestyle_tricks` (so they are
allowed) and are status-gated out of public rendering. When the canonical trick
(or Net page) is later authored, the placeholder is remapped to the final slug;
the gitignored grouped review artifact `freestyle/reports/member_tips_unmatched.json`
lists every non-published tip by bucket and slug so remap needs no rediscovery.

## 5. Public rendering policy

Only `status = 'published'` tips render on freestyle trick pages (enforced by the
`freestyleTrickTips.listForTrick` statement: `WHERE status='published'`). Tips are
display-only community advice, clearly labelled not doctrine, and never feed
descriptions, notation, ADDs, parser output, family, or first-class eligibility.
No author names in v1.

## 6. Source preservation produced in this pass

These artifacts were produced and verified in this pass; they land together with
this report via the closure commit (the raw seal itself is gitignored by archive
design, so the committed record is the manifest plus the public extract):

- **`moves2` sealed via the standard `seal.py` pattern.** `seal.py --app moves2`
  copied the dump to `legacy_data/legacy_archive/raw/moves2/latest.sql` (chmod
  0444) with a sha256 sidecar; `sha256sum -c` verified OK (`9f4dd6c7…`, 328624
  bytes). `raw/` is gitignored, so this immutable copy is local.
- **Public moves metadata extracted to a committed artifact.**
  `freestyle/inputs/footbag_org_moves_metadata.ndjson` (303 rows: pronunciation 5,
  nickname 100, description 194, notation 254, video ref 46, per-trick record 12),
  via `legacy_data/scripts/extract_footbag_org_moves_metadata.py`. Author/holder
  member ids are not carried.
- **Payload-free manifest committed.**
  `legacy_data/legacy_archive/reports/seal_moves2_2026-06-29.manifest.json`
  records the checksum, table row counts, allowlist/denylist, and what was
  preserved vs excluded.
- **Configs:** `moves2` registered in `sources.yaml` / `allowlist.yaml` (moves,
  movehints); `moves_journal` armed in `denylist.yaml` (`*`, never extracted).

## 7. Remaining follow-ups

- **Description reconciliation** — 194 legacy human descriptions in
  `footbag_org_moves_metadata.ndjson` vs our AI/curated text; upgrade where the
  human original is better (sourcing rule prefers human-authored).
- **Instructional slot population** — mine the recovered legacy descriptions and
  Member Tips to populate `execution_summary`, `learning_notes`, and
  `prerequisite_notes`, rather than simply replacing `description`. The schema
  already exists (those columns sit ~3/896 populated today); the content is the
  missing piece. This is the single highest-leverage recovery opportunity.
- **Pronunciation** — 5 legacy pronunciations preserved; needs the v2 column
  decision (recommended: a dedicated `pronunciation` column) then curator expansion.
- **Records rendering** — per-trick records already exist in `freestyle_records`
  (our data is newer/higher than legacy's 12); surface them on the trick card
  (rendering gap, not a data import). Verify the one anomaly: legacy Osis 306
  (Greg Nelson) vs our 256.
- **Media performer attribution / gallery metadata** — the 46 demo-clip references
  (binaries lost; metadata in the gallery archive) and a possible `media_items`
  performer/credit field.
- **Unresolved freestyle compounds** — the tips are already preserved under stable
  unresolved slugs, so the archival work is done. When these compounds
  (barraging-paradox-mirage, stepping-paradox-symposium-whirl, stepping-down-double-down,
  clipper-set-illusion, pixie-same-side-butterfly) are authored and promoted, their
  tips remap automatically with no further archival work.
- **Future net tips** — recover the 2 net tips when Net technique pages exist.
- **FootbagMoves high-ADD sprint** — separate doctrine/content audit of the 8/9-ADD
  frontier.

## 8. Clone-dependency verification

**Now preserved in repo (committed with this closure pass):**
- Member Tips `freestyle/inputs/footbag_org_member_tips.ndjson` (419); moves
  metadata `freestyle/inputs/footbag_org_moves_metadata.ndjson` (303); seal
  manifest + the `moves2` config entries; feature code/schema/docs/tests (`db8bfb3e`).

**Local-only (gitignored, by archive design):**
- `legacy_data/legacy_archive/raw/moves2/latest.sql` (immutable 0444 seal + sha256),
  a second local copy of the dump alongside the clone; never tracked.

**Still only in `/home/james/projects/legacy_SG_clone` (plus the local gitignored seal):**
- `moves_journal` (97 rows, private practice log) — intentionally not committed
  (privacy); committing it would need an explicit privacy decision and it is not
  freestyle-reference content.
- `move_tip_votes` (1 row, abandoned) — no value.
- Raw bytes of non-extracted `moves` columns (OldMoveID, internal timestamps,
  holder member ids) — provenance-only, not recovery-valuable.

**Is anything at risk if the clone disappears?**
No freestyle recovery value is at risk: every public, recovery-useful artifact
(tips + moves metadata) is committed, and the seal manifest pins the source
checksum. The only content surviving solely in the local gitignored seal (lost if
both the clone and that local copy vanish) is `moves_journal` (private,
deliberately not preserved in-repo) and no-value/provenance-only fields. Preserving
private journals, if ever wanted, is a separate privacy-governed decision, not a
gap in this sprint.

## 9. Conclusion

The Footbag.org sprint demonstrated that the modern platform has already surpassed
Footbag.org in structural dictionary coverage (notation, parser, formulas,
taxonomy). The remaining opportunity lies in recovering legacy community knowledge
and using it to enrich the instructional experience, not to replace the underlying
dictionary model.
