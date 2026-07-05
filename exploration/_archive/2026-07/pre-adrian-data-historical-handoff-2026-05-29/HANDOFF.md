# Pre-Adrian Release — Data & Historical Hand-off (James / Dave)

**Date:** 2026-05-29
**Source:** the pre-release Adrian QC audit. These are the items deliberately
**NOT** fixed in the code/content slice because they require a pipeline
regeneration, a DB rebuild, an identity-governance decision, or external
historical verification.

**Guardrails (carried from the audit):**
- **Do not normalize historical claims without authoritative evidence** (Tina, Joey, Kenny).
- **Do not merge identities silently** when the equivalence is inferred, not confirmed (Gosia / Małgorzata).
- Fixes go to `canonical_input/*` or `overrides/*`, **never** `out/canonical/*.csv` directly.
- `scripts/reset-local-db.sh` is Dave-owned; the live-DB reflection of any source fix waits on a rebuild.

All evidence below was verified against the live `database/footbag.db` and source files during the audit.

---

## A. Data / pipeline fixes (mechanical — James to author, Dave to reload)

### A1. Małgorzata Nycz — encoding corruption
- **Problem:** the canonical person name is mojibaked — the `ł` was lost; it stores/renders as **"Ma gorzata Nycz"** (visible on `/freestyle/partnerships`).
- **Evidence:** `historical_persons.person_id = e6f5c3f9-b642-52a2-a6b4-9d8037fa5a83`, `person_name = 'Ma gorzata Nycz'`, country Poland. Source: `legacy_data/event_results/canonical_input/persons.csv` (the corrupt form is in the canonical input). An alias row in `legacy_data/overrides/person_aliases.csv` already maps the correct UTF-8 form → this row with reason `encoding_corruption`, but does not fix the stored name.
- **Mechanism:** correct the name in `canonical_input/persons.csv` (decision: `Małgorzata` vs ASCII `Malgorzata`), then rebuild. **Coordinate with A2/B1** — likely the same person.
- **Owner:** James (persons/identity). **Risk:** low (single field). **Verify:** partnerships page shows the corrected name; no `Ma gorzata` anywhere.

### A2. Peter Irish — duplicate 1997 Worlds event inflates gold count
- **Problem:** his singles-gold count renders as **14** on `/freestyle/competition`, but the editorial note says **13** — the extra one is a **duplicate event**.
- **Evidence (verified):** two events share the title *"18th Annual World Footbag Championships"*:
  - `1997_worlds` — `start_date 1997-07-01`, no city, country `Unknown` (a bare stub)
  - `1997_worlds_portland` — `1997-08-11`, Portland, United States (the real event)
  Both carry an Open Singles Freestyle 1st place for Peter Irish → the 1997 title is counted twice. Removing/merging the stub yields 13 (matching the editorial note).
- **Mechanism:** merge `1997_worlds` → `1997_worlds_portland` via the existing event-equivalence path (`overrides/event_equivalence*`, the 05p5 merge pass / Fix 14/15), or drop the stub from `canonical_input/events.csv` + repoint its participant rows. Then rebuild.
- **Owner:** James (event-merge), with Dave coordination on `events`. **Risk:** medium (touches results). **Verify:** Peter Irish = 13 singles golds; only one 1997 Worlds event remains. **Note:** this is the same class as the Kenny ambiguity (C3) — fixing duplicate/variant event records may resolve both.

### A3. Witchdoctor description — source fixed, needs reload
- **Problem:** the trick description read *"Atomic + symposium + mirage (4 ADD)."* while `adds = 5` — a self-contradiction on the trick page.
- **Status:** **already corrected at source** — `legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` row `witchdoctor` description now reads *"Atomic + symposium + mirage."* (ADD math stripped per description policy; the `adds=5` value is correct via the atom-smasher X-dex doctrine: atom-smasher 4 + symposium 1).
- **Mechanism:** **DB reload only** (`reset-local-db.sh` / loader 17+19) to reflect the corrected description on the live surface.
- **Owner:** Dave (reload). **Risk:** none. **Verify:** `/freestyle/tricks/witchdoctor` "About" prose no longer shows "(4 ADD)".

---

## B. Identity-governance (decision required BEFORE any action)

### B1. Gosia Nycz / Małgorzata Nycz — probable same person
- **Problem:** two distinct person rows that are very likely one player; they show as separate rows (and a double-counted partnership) on `/freestyle/partnerships`.
- **Evidence (verified):**
  - `07f95465-470d-502b-804d-643380e1385c` — **Gosia Nycz** (Poland) — partnered with Wiktor Debski
  - `e6f5c3f9-b642-52a2-a6b4-9d8037fa5a83` — **Ma gorzata Nycz** (Poland, the mojibake row from A1) — also partnered with Wiktor Debski
  - "Gosia" is the standard Polish nickname for "Małgorzata"; overlapping years and the same partner strongly suggest one person. `person_aliases.csv` maps both name forms but does **not** link the two `person_id`s. No alias currently bridges them.
- **Mechanism (only if confirmed same person):** merge one `person_id` into the other; **rebind ALL alias rows pointing at the doomed pid** (including variants/typos — "Gozia Nycz", "Małgorzata Nycz", "Ma gorzata Nycz" all appear), repoint participant rows, then rebuild. Pair with the A1 encoding fix.
- **Owner:** James (identity). **Risk:** medium-high (identity merge). **Guardrail:** **confirm the equivalence first** (community knowledge / IFPA records) — do not auto-merge on the name-nickname inference alone.

---

## C. Historical verification (need authoritative evidence — do NOT change without it)

### C1. Tina Aeberli — country France vs Switzerland
- **Problem:** Adrian reports she is widely known as Swiss; the DB lists **France**.
- **Evidence (verified):** `historical_persons` Tina Aeberli, `country = France`, `bap_nickname = "Swiss Miss"`. France is in `canonical_input/persons.csv` (source data, not a coding error). The "Swiss Miss" nickname is suggestive but not authoritative; the country may reflect residence at registration.
- **Mechanism (if confirmed Swiss):** add a country override in `legacy_data/overrides/` + rebuild.
- **Owner:** James (after verification). **Guardrail:** confirm against IFPA membership records / direct community knowledge before changing.

### C2. Joey Schaeffer — symposium + "Stand Clear of the Blades" attribution
- **Problem:** site gives **sole** credit; Adrian cites a community source for **collaborative** credit with Rick Reese.
- **Evidence:** `src/content/freestyleEditorial.ts` (Joey Schaeffer entry) reads *"Originated the BAP's 'Stand Clear of the Blades' branding…; conceptualized the symposium modifier."* Adrian's source: The Tale of BAP (bigaddposse.com, Tu Vu, 2003) — "helped create" symposium; branding shared with Rick Reese. Not verifiable from inside the repo.
- **Mechanism (if confirmed):** content edit to collaborative framing (e.g. "Co-originated… co-conceptualized… with Rick Reese"). Code/content only, no rebuild.
- **Owner:** content (James), after verification. **Guardrail:** confirm against the BAP source first.

### C3. Kenny Shults — singles-gold count (10 vs 11)
- **Problem:** editorial note says **11** (`freestyleEditorial.ts`); the DB freestyle-singles filter computes **10**.
- **Evidence (verified):** the count is **event-dedup-sensitive** — at 1985 alone Kenny has three freestyle-singles gold entries under different discipline spellings ("Singles Freestyle", "Open Singles Freestyle", "Freestyle") across multiple 1985 events with placeholder dates. The true unique count depends on event/discipline de-duplication (same root cause as A2).
- **Mechanism:** resolve as part of the duplicate/variant event-record cleanup (A2), then reconcile the editorial note to the verified count.
- **Owner:** James (event-dedup) + content. **Guardrail:** **do not change 11 → 10** until the event-dedup pass confirms the unique count — changing to another unverified number is worse than leaving it.

---

## D. Rebuild dependency summary

| Item | Fix location | Appears live after |
|------|--------------|--------------------|
| A1 Nycz encoding | canonical_input/persons.csv | rebuild |
| A2 Peter Irish dup event | overrides/event_equivalence* or canonical_input/events.csv | rebuild |
| A3 Witchdoctor desc | **already in** red_additions CSV | **reload only** |
| B1 Nycz merge | persons.csv + alias rebind | rebuild (after confirm) |
| C1 Tina country | overrides/ | rebuild (after confirm) |
| C2 Joey attribution | freestyleEditorial.ts | no rebuild (after confirm) |
| C3 Kenny count | event cleanup + editorial | rebuild (after dedup) |

**Recommended order:** A3 (free, reload) → A1+B1 together (Nycz) → A2+C3 together (event dedup) → C1/C2 after Adrian/community confirm.

**Confirmed-clean (no action — closed in the code slice or verified fixed):** 1905 dates, Mariusz Wilk, passback "dicrionary" label, "Eggbeager" typo, Atom Smasher X-dex explanation, Barrage family card, the "Red"/internal-label public leaks, and the movement-system landing-card IA.
