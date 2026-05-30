# Frontier Calibration — Governance Memo (2026-05-29)

**Status: read-only observational/governance pass. No promotions, no doctrine, no parser changes,
no new families, no Red-gated resolutions.** Findings feed the curator queue and the Red Wave 2
backlog. Nothing here mutates a trick, modifier, family, or notation.

Two audits feed this memo:
- **Part A** — operator-intake triage of newly-surfaced FM/folk/operator-like tokens.
- **Part B** — existence/attestation pass over PassBack **Bucket 6** (the `new_candidate` set, the
  highest-leverage "size the real backlog" action named in `../freestyle-media-ingestion-2026-05-29/ONTOLOGY_GAP_REPORT.md`).

Method is deterministic and reproducible: `calibrate_frontier.py` (read-only; cross-references the
187 `new_candidate` rows and the operator tokens against `database/footbag.db`, the multi-source
symbolic master corpus, and the PassBack reports). Row-level output: `bucket6_attestation.csv`,
`partA_token_attestation.csv`.

> **Load-bearing method note (the anti-inflation step).** Raw `source_system` labels OVERSTATE
> independence: `fm_inventory`+`fm_symbolic_grammar` are one FM source; `PB`+`passback_intake`+
> `passback_source_links` are one PassBack source; `fborg_text`+`fborg_insert_staging` are one
> footbag.org source; `tracked_names_ts`/`observational_ts`/`canonical_db` are **derived projections of
> our own data, not attestation**. A first naïve pass that counted raw labels reported 94/143 "strongly
> attested" — the inflation artifact this exercise exists to catch. After collapsing to true independent
> source families (FM / PassBack / footbag.org / Stanford) and dropping derived projections, the strong
> tier falls to 41. Every number below uses the collapsed families.

---

## Headline calibration

| Reported PassBack Bucket-6 | 187 | |
|---|---:|---|
| Already canonical (matcher false-new) | 42 | 22% — never a gap |
| Malformed / concept-leakage / placeholder | 16 | 9% — never tricks |
| **= Genuinely-new candidates** | **129** | **the true frontier** |
| ↳ strongly attested (≥2 independent sources) | 41 | 32% of genuine |
| ↳ weakly attested (1 independent + PassBack) | 39 | 30% of genuine |
| ↳ single-source PassBack-only folk name | 49 | 38% of genuine |

- **~31% of the reported frontier was inflation** (42 already-canonical false-new + 16 non-trick
  leakage) — it evaporates on inspection.
- **Of the genuine 129, ~62% (80) have independent corroboration** beyond PassBack; **~38% (49) are
  single-source folk names** that `frequency ≠ authority` keeps out of promotion until corroborated.
- The matcher-recovery count (42) **independently reproduces** the README's "Bucket 6 fix" count of 42
  — a clean cross-check that the existence logic is correct.

---

## PART A — operator-intake triage

Token attestation (corpus-wide occurrence) is in `partA_token_attestation.csv`. Counts reconcile with
the prior FM/folk≥7 triage (`../frontier-canonicalization-initiative/OPERATOR_INTAKE_FMFOLK.md`); where
they differ it is because the symbolic master corpus (snapshot 2026-05-23) predates the ≥7 triage, so
`railing`/`surfing`/`splicing`/`os`/`bent` read as 0 there but were found 1–3× in the ≥7 cohort. The
authoritative low-frequency counts for those come from the ≥7 triage; this pass adds the broader-corpus
view (most usefully: **`flailing` is better-attested than previously thought** — 14× across PassBack +
Stanford, vs the ≥7 triage's 2).

**Classification per token** (semantic axis: T=topology · O=body-orientation · S=surface/catch ·
R=timing/rhythm · St=style-only · ∅=no operational meaning):

### 1. ACCEPTABLE observational vocabulary candidates (route to curator/Red — NOT registered)
| Token | uses | axis | why | productivity |
|---|---|---|---|---|
| **zulu** | 52× (FM+Stanford) | T/O | unregistered 4th member of the head-path family (`ducking`/`diving`/`weaving` are registered); a real, known head movement | structurally productive + culturally attested — **strongest candidate; already in Red queue** |
| **flailing** | 14× (PB+Stanford) | T | gerund of the active base `flail`; recurs as a leading operator | productive + attested, but operator-status is doctrine-gated (gerund-of-base question) |

### 2. HOLD / unresolved vocabulary (plausible but single-source; defer — frequency ≠ authority)
| Token | uses | axis | why HOLD |
|---|---|---|---|
| **railing** | 3× (FM-only) | T/S | leading operator in 3 FM names (dorshanatrix/flying-fish/rail-warrior); no canonical `rail` trick — curator must confirm "rail/railing" is a recognized move first |
| **floating** | 2× (Stanford-only) | St | single-source; reads descriptive/style, no clear operational meaning |
| **surfing** | 1× (FM-only) | St | single-source folk descriptor |
| **splicing** | 1× (FM-only) | T? | single-source; possible movement sense but isolated |
| **bent** | 1× (FM-only) | O? | single-source; unclear descriptive |

### 3. REJECTED — artifacts / abbreviations / structural tokens (NOT operators)
| Token | uses | why rejected |
|---|---|---|
| **double** | 198× | fragment of base names (`double-leg-over`, `double-down`) — not an operator |
| **motion** | 25× | a noun in folk names ("Atomic Motion"), ∅ operational meaning |
| **xbd** / **x-body** | 21× / 2× | the cross-body notation token `[XBD]` leaking into names |
| **nova** | 7× | a base trick (legover family, 4 ADD), not an operator |
| **warp / warping** | 7× / 1× | self-referential; `warp` is a trick, not a modifier |
| **star** | 7× | folk-name noun ("shooting star"); `shooting` is the operator |
| **torquescrew** | 6× | base-name artifact; no such operator |
| **p.s** | 2× | `P.S.` = Paradox-Symposium abbreviation (slug-normalization, not an operator) |
| **os** | 1× | abbreviation/typo for `osis` |

### 4. Glossary / operator-surface implications
- **`zulu`** — if accepted (Red, head-path/topology governance), completes the head-path-family card in
  the glossary modifier section (ducking/diving/weaving/**zulu**). It is family governance, not an
  ad-hoc registration. Already routed (frontier Red queue).
- **`flailing` / `railing`** — bundle with the gerund-of-base operator question. **Note the new
  precedent (this session):** `illusioning` was just registered as a modifier *because* it equals
  `rev(0) miraging` (a known operator composition) — not merely because it is a gerund. So the precedent
  for "a gerund-form token can be a registrable modifier" exists but is **narrow** (it needs a known
  operator-composition equivalent). `flailing`/`railing` have no such equivalent yet, so they stay HOLD,
  not auto-promoted by analogy.
- **Artifact tokens** (`os`, `xbd`, `x-body`, `p.s`) are **normalizer/parser concerns, not glossary
  content** — they should be absorbed by name normalization and kept OFF operator surfaces.

---

## PART B — Bucket-6 existence/attestation

Full per-row classification: `bucket6_attestation.csv`. Decomposability (parses cleanly to a known
modifier + base) by class: strong 30/41 · weak 27/39 · single-source 32/49 · recovered 29/42 ·
malformed 0/14 (decomposability tracks attestation, as expected, and is ~0 in the noise bucket).

### Revised promotion backlog
| Tier | n | disposition |
|---|---:|---|
| **Strong future candidates** (FM + Stanford, ± footbag.org) | 41 | best promotion candidates — still **all Red Wave 2 gated**; no action now beyond flagging |
| Weakly attested (1 independent source + PassBack) | 39 | secondary; corroborate the single independent source before prioritizing |
| Single-source PassBack-only folk names | 49 | **deprioritize** — plausible folk names, but `frequency ≠ authority`; need a second source |
| Malformed / concept-leakage / placeholder | 16 | **strip from candidate set** — not tricks (see below) |
| Already canonical (false-new) | 42 | **matcher correction** — re-bucket out of `new_candidates`; not promotions |

### Strong future promotion candidates (the durable core)
All 41 sit in FM ∩ Stanford. The **3 also attested by footbag.org** are the strongest of all:
**Paratoxic · Torch-R-Rack · Whirr**. The remaining 38 (e.g. Cold Fusion, Dragon, E-Walk, Fission,
Genesis, Grifter, Icarus, Enterrage, Irish Cream) are FM+Stanford folk-named tricks. *Caveat to verify
before treating co-occurrence as strong:* the strong tier rests almost entirely on **FM∩Stanford
co-occurrence** — confirm these two community lists are genuinely independent (not one derived from the
other); if they share lineage, the strong tier is effectively single-lineage and collapses toward
"weak."

### Likely synthetic / deprioritized
- **49 single-source PassBack folk names** (Archnemesis, Armageddon, Big Applesauce, Blurtigo,
  Clownface, Blackula, Badger…). Most are decomposable and look culturally real, but exist only in
  PassBack. Hold for corroboration; do not promote on PassBack alone.
- **14 malformed / concept-leakage** — these are NOT tricks and should never have been candidates:
  - *Glossary/concept leakage:* `Dex, Dexterity`, `In(-Out) Dex`, `Out(-In) Dex`, `Contact`,
    `Gyro, Spinning, Spinning Gyro, Double Spinning` (a modifier list), `Cloud` (a stall-surface def).
  - *Structural-notation fragments* (parser leakage of `ss`/`op` positional readings, not folk names):
    `Fairy ss Legover`, `Pixie ss Mirage`, `Pixie ss Pickup`, `Toe ss Symp Swirl`,
    `Smear>Fairy ss [Legover/Pickup]`.
  - *Other debris:* `Motorfly`, `Atomic DSO`, `Nagellam`, the `>` row, `Anonymous` (placeholder).

### Where the observational inflation came from
1. **Matcher misses (42, 22%).** `new_candidate` was assigned before a full slug/canonical/alias check;
   42 already-canonical tricks (Assassin, Atom Bomb, Wrap, Twirl, Orbit…) were mislabeled new. This is
   the single biggest inflation source and is purely a matcher-recovery fix.
2. **Concept/notation leakage (14, 7.5%).** Glossary terms (dex definitions), a modifier list, and
   `ss`/`op` notation fragments entered the trick-candidate stream. A name-vs-concept filter removes them.
3. **Single-source amplification (49, 26%).** PassBack folk names are real *vocabulary* but get counted
   as promotion-frontier without corroboration — the `frequency ≠ authority` failure mode at the corpus
   level.
4. **Derived-projection double-counting (method-level).** As flagged above, naïvely counting our own
   `tracked_names_ts`/`observational_ts`/`canonical_db` projections as "sources" would have doubled the
   apparent strong tier. Any future attestation tooling must collapse to independent source families.

---

## Frontier assessment + recommended next actions

**% culturally real vs parser-derived/noisy (of the 187 reported Bucket-6):**
- **~43% corroborated-real** (80 strong+weak of 187 have independent attestation).
- **~26% plausible-but-uncorroborated** folk vocabulary (49 single-source).
- **~31% non-frontier** (42 already-canonical + 16 non-trick leakage).

**Promising vocabulary surfaces:** the head-path family (`zulu`) is the clearest genuine vocabulary gap;
`flailing` is a real recurring token gated on doctrine; the 41 FM∩Stanford folk tricks are the durable
promotion core (pending the FM/Stanford-independence check and Red Wave 2).

**Is the frontier stabilizing? Yes.** The true PassBack new-trick frontier is **~129, not 187** (−31%),
with a bounded corroborated core (~80) and a single-source tail (49) that doctrine correctly holds out.
Combined with the FM/folk≥7 finding (0 corroborated → none Tier-A) and the verified-solid 7-ADD base,
the system is converging: headline counts overstate, but the *promotable* set is small and bounded.

**Recommended low-risk next actions (all pre-Red-Wave-2, none requiring doctrine):**
1. **Matcher-recovery fix** — re-bucket the 42 already-canonical false-new rows out of `new_candidates`
   (read-only finding here; the fix is an intake/matcher correction, not a promotion). Biggest single
   honesty win.
2. **Concept/notation-leakage filter** — strip the 14 non-trick rows (dex defs, modifier lists, `ss`/`op`
   fragments) from the candidate stream so the backlog counts tricks only.
3. **Single-source hold** — explicitly tag the 49 PassBack-only folk names "needs-corroboration"
   (`frequency ≠ authority`), separate from the promotable core.
4. **FM/Stanford independence check** — verify the two lists are independent before the 41 strong
   candidates are treated as multi-source corroborated.
5. **Vocabulary routing** — `zulu` is already in the Red queue (head-path family); attach `flailing`/
   `railing` to the gerund-of-base operator question, noting the narrow `illusioning` precedent.
6. **No promotions** until Red Wave 2 lifts the gate; this pass only sizes and cleans the backlog.

---

### Outputs (this directory)
- `MEMO.md` — this memo.
- `bucket6_attestation.csv` — 187 rows, per-row classification + independent-family attestation.
- `partA_token_attestation.csv` — per-token corpus-wide occurrence + examples.
- `partB_summary.txt` / `partA_summary.txt` — console rollups.
- `calibrate_frontier.py` — the read-only generator (re-runnable; no DB writes).
