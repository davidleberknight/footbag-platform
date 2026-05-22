# FB.org INSERT Staging Queue — Triage — 2026-05-21

Recommended disposition for the 82 first-class-ready tricks staged for
DB promotion (`FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv`).

These are **recommendations only.** Canonical promotion is a curator
decision — `curator_decision` is left blank for your sign-off; the
recommendations live in the new `recommended_decision` +
`triage_rationale` columns. No DB writes.

---

## 1. Summary

| Recommendation | Count |
|---|---:|
| accept | 4 |
| defer | 77 |
| reject | 1 |

## 2. ACCEPT (4) — clean gap-fills, recommend promotion

| Slug | Why |
|---|---|
| `peak-delay` | Foundational peak stall (pt8 = 1 ADD); the live DB already carries head / neck / shoulder stalls — peak completes the set. |
| `double-knee` | Curator manual addition — already hand-added to the master; foundational flying-body 1-ADD atom. |
| `ducking-mirage` | Completes the ducking family — DB has ducking-butterfly/-clipper/-osis/-whirl but not -mirage. |
| `spinning-pickup` | Completes the spinning family — DB has spinning-butterfly/-clipper/-osis/-whirl/-torque but not -pickup. |

Each is a foundational atom or a family-completing compound, with
notation and a usable description — comparable to the live DB's
non-pilot rows. Low-risk, low-ambiguity.

## 3. REJECT (1) — redundant

| Slug | Why |
|---|---|
| `clipper-kick` | The live DB already has `clipper` at 1 ADD — that *is* the kick form. The staging match missed it (slug `clipper-kick` ≠ `clipper`). Recommend recording "clipper kick" as an **alias of `clipper`**, not inserting a duplicate canonical row. |

## 4. DEFER (77) — the core finding

77 of 82 are recommended **defer** — and the reason is the load-bearing
result of this triage:

> **`first_class_ready` certifies a row is mechanically sound (settled
> doctrine, clean notation, no review flag). It does NOT make the row
> ready to be a public dictionary *page*.**

The live `freestyle_tricks` rows carry **curated content** these
spreadsheet rows do not have:

- every live row has a `description`;
- pilot-tier rows additionally have authored `short_description`,
  `execution_summary`, `learning_notes`, `prerequisite_notes` (the
  UX2 / SCALE-pilot prose).

The 82 staging rows have notation + `add_formula` + governance — but
no authored pedagogical content. Bulk-inserting 77 of them would
create 77 thin canonical pages: a slug, an ADD, a notation string, and
at best a one-line FB.org source description. That is a visible
quality drop in the public dictionary and an end-run around the
SCALE-pilot process by which the curated 167 were built (small
reviewed batches, prose authored per trick).

**Recommended path for the 77:** promote via the established
SCALE-pilot model — small family-coherent batches, with
`short_description` / `execution_summary` / `learning_notes` authored
per trick before promotion. Not a bulk insert. The `defer`
recommendation is "right move, wrong moment" — these are genuine
future canonical tricks, just not promotable as bare rows today.

DEFER rationale by tier (in `triage_rationale` per row):

| Tier | Count | Rationale |
|---|---:|---|
| 1–2 ADD | ~2 | Bare kick/folk entry — curator call on whether it warrants a page distinct from existing atoms |
| 3–4 ADD | ~45 | Clean compounds; defer for authored prose, promote as reviewed family batches |
| 5 ADD | ~24 | Deep compounds; promotion-ready by notation, low pedagogical priority |
| 6–7 ADD | ~6 | Very deep folk compounds; recommend keeping observational until a pedagogical need appears |

## 5. Suggested first promotion batch (if you want to move now)

Beyond the 4 ACCEPTs, the highest-value *next* batch — once prose is
authored — would be the **family-completers**: the 3–4 ADD compounds
that finish a family the DB already partly carries (e.g.
`inspinning-butterfly`, `gyro-butterfly`, `paradox-illusion`,
`symposium-*` set, `quantum-*` set). These are the SCALE-pilot's
natural unit — a coherent family batch with shared pedagogical
framing. They are `defer` now only because the prose is unwritten,
not because the trick is doubtful.

## 6. Governance posture

- Restraint-first (freestyle-topology-governance skill): when in
  doubt, observational. 77 defer reflects that.
- The Red 2026-05-21 packet is still out — no family-governance
  answers yet. None of the 82 are Pogo/Fairy/Spyro/Shooting
  family-pending (those rows are hedged → already in the observational
  layer, not this queue), so the packet does not block the 4 ACCEPTs,
  but it is another reason not to rush the deep-compound DEFERs.
- Nothing here promotes anything. A future INSERT loader runs only on
  rows where you have filled `curator_decision`, with a match-quality
  pre-check (per the dry-run report — the slug+name match has no fuzzy
  layer).

## 7. Next action for the curator

1. Review `recommended_decision` in the staging CSV; fill
   `curator_decision` per row (your call — confirm or override).
2. For `accept` rows: a small INSERT loader can promote them (4 rows;
   trivial to review). It would need the same ADD-match guard the
   UPDATE loader used.
3. For `defer` rows you want to advance: author prose, batch by
   family, promote via the SCALE-pilot process.
4. For `clipper-kick`: add "clipper kick" to `freestyle_tricks.clipper`
   `aliases_json` instead of inserting.

## Files

```
mod   exploration/footbagmoves-federation/FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv
        (+recommended_decision, +triage_rationale; curator_decision left blank)
new   exploration/footbagmoves-federation/FBORG_INSERT_TRIAGE_2026-05-21.md   (this file)
```

No DB writes. `freestyle_tricks` unchanged at 167 rows.
