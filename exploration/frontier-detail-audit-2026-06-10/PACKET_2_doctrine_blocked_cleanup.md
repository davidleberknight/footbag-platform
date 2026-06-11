# Packet 2 — Doctrine Blocked Cleanup

Review packet. **Read-only. No edits, no promotions, no doctrine changes.** Full machine data:
`packet2a_stale_doctrine.csv` (54 rows) and `packet2b_alias_candidates.csv` (64 rows).

## Context

The page's Doctrine-Blocked stat is **259** (not the 156 headline, which is `promotionFrontier`).
Its largest cluster is an uninformative **"other" (156)**. Re-deriving the true blocker shows the
259 collapses onto ~5 pending rulings plus two removable groups handled here:

- **2a — Stale (54):** blocked on doctrine that has **already shipped** (nuclear, furious, illusioning,
  quantum, symposium are all live operators). Should leave doctrine-blocked.
- **2b — Alias-resolution candidates (64):** carry a parenthetical folk-equivalent; many resolve to an
  **existing canonical** and are mis-filed as doctrine when they are really aliases.

After removing the 54 stale → **true doctrine-blocked ≈ 205**, concentrated in: blurry-transitivity
(65), DOD/DDD policy (47), pogo-composition (39), weaving-definition (32), shooting-definition (17).

---

## 2a — Stale doctrine rows (54) — recommended action per row

Action split: **10 alias-wire** (folk-equiv already canonical) · **12 re-triage + verify folk** ·
**32 re-triage to authoring** (operator resolved, no folk collision).

**Alias-wire now (10)** — folk-equivalent is already `is_active=1`; remove doctrine flag and wire alias:

| doctrine name | → active canonical |
|---|---|
| Furious Butterfly (Jani Walker) | jani-walker |
| Furious Eggbeater (Clown Face) | clown-face |
| Furious DLO (Nebula) | nebula |
| Furious Illusion (Fission)* | fury / fission† |
| Illusioning Osis (Flux) | flux |
| Nuclear Butterfly (Matador) | matador |
| Furious Whirl (Genesis) | genesis |
| Furious Mirage (Fury) | fury |
| Furious Symposium Legover (Rage) | rage |
| Nuclear … (Oh Wheely) | oh-wheely |

\*/† exact target per the CSV `recommended_action` column; verify the slug before wiring.

**Re-triage to Authoring-ready (32)** — `furious` / `illusioning` / `nuclear` / `quantum` / `symposium`
doctrine is resolved; these have no folk collision and no secondary pending token. e.g. `Furious Drifter`,
`Furious Illusion`, `Illusioning Legover`, `Illusioning Flail`, `Illusioning far Osis`, `Nuclear Drifter`.
→ move to Packet-1 bucket A (authoring), not doctrine.

**Re-triage + verify folk (12)** — operator resolved but the parenthetical folk name is NOT yet
canonical (e.g. `Furious Butterfly Swirl (Tsunami)`, `Illusioning Flail (Toe Massacre)`). → authoring
queue; confirm the folk name isn't a separate existing trick before promoting.

> Caveat: `nuclear` is the largest stale group (29). Confirm the nuclear operator is fully ruled
> (paradox + downtime-illusion) before bulk-re-triaging; spot-check 3–4 nuclear rows first.

---

## 2b — Alias-resolution candidates (64) — recommended action per row

These all carry a parenthetical folk name. 19 of the 64 have an **active** folk-equivalent.

| action | count | meaning |
|---|---:|---|
| **ALIAS-WIRE (active + unblocked)** | 10 | folk canonical active AND lead operator resolved → wire alias, drop doctrine flag. Same 10 as 2a's alias-wire set (these rows are both stale AND parenthetical). |
| **ALIAS candidate, but lead blocker pending** | 9 | folk-equiv active (e.g. `ripwalk`, `blizzard`, `blurrage`, `gauntlet`) BUT the lead operator is still pending (mostly `blurry`). → resolve the equivalence-vs-structure question; do not auto-wire while blurry is unruled. e.g. `Blurry Butterfly (Ripwalk)`, `Blurry Barrage (Blurrage)`. |
| **NEW-ROW / alias review** | 12 | folk-equiv NOT yet canonical, operator resolved (e.g. `(Fission)`, `(Nucleosis)`, `(Terminator)`, `(Toe Massacre)`). → authoring or alias review. |
| **KEEP doctrine-pending** | 33 | lead blocker genuinely open (blurry / weaving / shooting / DOD); the parenthetical is a folk label, not a resolution. Stay blocked. |

**Key takeaway:** of 64 parentheticals, only **10 are clean alias-wires** today; **9 more become
alias-wires the moment blurry-transitivity is ruled**; the remaining 45 are genuine
authoring/doctrine work. The parenthetical folk names are NOT a shortcut around the open rulings.

---

## Net effect on the doctrine wall

| | count |
|---|---:|
| Current Doctrine-Blocked stat | 259 |
| − Stale (2a) re-triaged out | −54 |
| **True doctrine-blocked** | **≈ 205** |
| …of which clears on **blurry** ruling | ~65 |
| …of which clears on **DOD/DDD** policy | ~47 |
| …of which clears on **pogo** composition | ~39 |
| …of which clears on **weaving** definition | ~32 |
| …of which clears on **shooting** definition | ~17 |

**~5 rulings clear ~200 items.** The doctrine wall is far smaller and more concentrated than 259 implies.
