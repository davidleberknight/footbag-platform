# Media-tag QC — remaining cleanup scope (next reviewed slice)

The safe whitelist/prefix work is **complete**. The remaining prod-relevant media-tag QC
violations require **curator review** — they involve tag *semantics* (clip-type leakage, status
markers, untagged concept media), not simple source whitelisting. This doc scopes that slice; it
makes **no code changes**.

## Context (already shipped)

`scripts/_trick_tag_invariant.py` now recognizes the committed source-gallery tags as utility:
`shred_global`, `anz_trikz`, `footbag_finland`, `passback_tutorials`, `chinlone`, `footbag_org`
(alongside the prior `tricks_of_the_trade`, `passback_records`). `by_` is now a valid semantic /
uploader prefix. Media-tag QC went **91 → 66**. The remaining violations are no longer source-tag
whitelist misses.

**Validation command** (used throughout this doc):
```
python3 legacy_data/event_results/scripts/25_qc_media_tag_invariant.py --db database/footbag.db
```

**Baseline at scope time:** `FAIL 66/228`. Of those, **~47 are local-only untracked
`curated/photos/fixture-*` pollution** (Bucket 4) — exclude from prod-relevant analysis. The
**prod-relevant remainder is ~19**, in three buckets below.

---

## Bucket 1 — Clip-type tag leakage  → **STRIP**

`#tutorial` / `#demo` are staging clip-type values (`clip_type` is staging-only per the
freestyle-curated-media skill) that leaked into public media tags. They should live in
tier/source/kind metadata, not as free tags. These sidecars **already carry a valid `#<slug>`** (or
are landing demos) — stripping the leaked tag fixes them with no loss.

| Sidecar | Leaked tag | Has valid slug? | Action |
|---|---|---|---|
| `freestyle_tricks/illusion_a1715eac.meta.json` | `#tutorial` | yes (`#illusion`) | strip `#tutorial` |
| `freestyle_tricks/pickup_d050ccdd.meta.json` | `#tutorial` | yes | strip `#tutorial` |
| `freestyle_tricks/swirl_764d053f.meta.json` | `#tutorial` | yes | strip `#tutorial` |
| `freestyle_tricks/quantum_2d260db0.meta.json` | `#tutorial` | yes | strip `#tutorial` |
| `freestyle_tricks/heel-stall_0935bb82.meta.json` | `#tutorial` | yes | strip `#tutorial` |
| `freestyle_tricks/fairy_3cdaf967.meta.json` | `#tutorial` | yes | strip `#tutorial` |
| `freestyle_tricks/drifter_045eabc7.meta.json` | `#tutorial` | yes | strip `#tutorial` |
| `freestyle_tricks/double-around-the-world_0dcda60f.meta.json` | `#tutorial` | yes | strip `#tutorial` |
| `freestyle_tricks/double-leg-over_48a1464e.meta.json` | `#tutorial` | yes | strip `#tutorial` |
| `freestyle_tricks/rev-whirl_daa91d53.meta.json` | `#tutorial` | yes | strip `#tutorial` |
| `freestyle_tricks/flying-clipper_ea270368.meta.json` | `#tutorial` | yes | strip `#tutorial` |
| `landing/demo-freestyle.meta.json` | `#demo` | n/a (landing loop) | strip `#demo` or move to `#demo_` prefix |
| `landing/demo-net.meta.json` | `#demo` | n/a (landing loop) | strip `#demo` or move to `#demo_` prefix |

(The `#tutorial` on the 3 `freestyle_tutorials/*` concept sidecars is handled in Bucket 3 — those
have no slug, so stripping alone doesn't clear them.)

**Expected QC delta:** −13 (11 trick sidecars + 2 landing).

---

## Bucket 2 — Status / descriptive tags  → **DECIDE (define vs strip)**

| Tag | Sidecar(s) | Preliminary recommendation |
|---|---|---|
| `#unavailable_embed` | `freestyle_tricks/tombstone_8f47099c.meta.json`, `freestyle_tricks/spinning-symposium-whirl_ec9dd014.meta.json` | **Keep only if** a UI/QC process intentionally consumes it (then whitelist as a status tag); otherwise **strip** (both rows have valid slugs). |
| `#beginner` | `freestyle_tutorials/footbag-trick-learning_9cba411f.meta.json` | **Strip** unless a formal learning-level taxonomy is created. |
| `#methodology`, `#ontology` | `freestyle_tutorials/freestyle-trick-naming_*`, `footbag-trick-learning_*` | **Strip** unless a formal topic taxonomy is created. |
| `#set-list` (`#set` in QC's truncated readout) | `freestyle_tutorials/pixie-set-list_124750f2.meta.json` | Replace with a **structured set namespace** (`set_*` prefix) or remove; do not leave as a vague bare tag. |

These all live on the Bucket-3 concept sidecars (except `#unavailable_embed`), so their resolution is
coupled to the Bucket-3 decision.

**Expected QC delta:** −2 (`#unavailable_embed`) if stripped; the rest clear with Bucket 3.

---

## Bucket 3 — Untagged galleried-source / concept media  → **ASSOCIATE vs GALLERY-ONLY vs RETIRE**

These have valid **source** tags but **no trick slug or other semantic target**. Do **not** satisfy
the gate by adding arbitrary tags.

| Sidecar | Current tags | What it is | Recommended action |
|---|---|---|---|
| `freestyle_tutorials/freestyle-trick-naming_b8dff8a7.meta.json` | `#freestyle #passback_tutorials #tutorial #methodology #ontology` | concept video (naming conventions) | **gallery-only** classification, or a namespaced concept tag (`fh_*`/`set_*`); strip clip-type/descriptive tags |
| `freestyle_tutorials/footbag-trick-learning_9cba411f.meta.json` | `#freestyle #passback_tutorials #tutorial #methodology #beginner` | concept video (how to learn) | same |
| `freestyle_tutorials/pixie-set-list_124750f2.meta.json` | `#freestyle #passback_tutorials #tutorial #pixie #set-list` | set-list reference | **associate** to a real set namespace (`set_pixie`?) or gallery-only |
| `misc/chilone.meta.json` | `#chinlone` (+ utility) | chinlone discipline demo (not a freestyle trick) | **gallery-only** (chinlone is its own discipline; no trick slug applies); confirm `#chinlone` source/gallery is the intended home |

**Decision needed per row:** add a valid trick/concept/set target, mark gallery-only, or retire.

**Expected QC delta:** −4..−6 depending on classification (clears the residual "no semantic tag" +
the concept-tag "does not resolve" failures).

---

## Bucket 4 — Local fixture pollution  → **CLEAN / IGNORE (not prod)**

`curated/photos/fixture-*.{jpg,meta.json}` — **47 media rows / 94 files**, **untracked** (never
committed), each carrying only `#curated`. Dev-local noise; would not exist in a prod-parity seed.

**Recommendation:** delete from the local working tree if disposable, **or** gitignore / relocate the
fixture media so QC reflects prod-parity curated media only. Keep separate from the prod-relevant
cleanup above.

**Expected QC delta:** −47 locally (or excluded from a prod-parity run).

---

## Strip vs Define vs Associate vs Retire — summary

| Bucket | Default action | Curator decision required? |
|---|---|---|
| 1 — clip-type `#tutorial`/`#demo` | **Strip** | low — recommendation stands unless tutorial/demo is formalized as a tag namespace |
| 2 — `#unavailable_embed` | Strip (or define if consumed) | yes — is it consumed by UI/QC? |
| 2 — `#beginner`/`#methodology`/`#ontology`/`#set-list` | Strip (or define taxonomy) | yes — create a learning/topic/set taxonomy, or strip |
| 3 — concept/discipline media | Associate / gallery-only / retire | yes — per row |
| 4 — fixtures | Clean / gitignore | low — local hygiene |

## Expected total QC delta

Prod-relevant: **19 → 0** (or → only explicitly-documented intentional exceptions). Fixtures handled
separately (−47 local). Resulting `25_qc_media_tag_invariant.py` exit 0 on a prod-parity DB.

## Acceptance criteria

- Prod-relevant media-tag QC goes **green**, or has only explicitly documented intentional exceptions.
- **No clip-type values remain as free media tags** unless formally justified.
- Every curated trick media item has either: a valid trick slug, a valid namespaced semantic target,
  or a deliberate gallery-only classification.
- Local fixtures no longer pollute the QC result.

## Implementation notes (for the eventual slice — not this doc)

- Sidecar edits are James-track; edit `curated/**/*.meta.json` `tags` arrays only (do not touch other
  fields), then re-seed (`seed_fh_curator.py`) and re-run the validation command.
- Any new intentional status/taxonomy tag must be added to `UTILITY_EXACT` / `SEMANTIC_PREFIXES` in
  `scripts/_trick_tag_invariant.py` **with a documented rationale** — no blind whitelisting.
- `#unavailable_embed` "define" path = whitelist + a one-line note on what consumes it.
