# Red Packet — Top 3 Questions

Dispatch-ready single-packet form for the three highest-priority questions
from `RED_PACKET_PRIORITY_QUEUE.md`. Each question is atomic, evidence-backed,
and bounded to one paragraph of expected answer.

## Packet scope and format

Three independent questions. Each can be answered in isolation. Red may
answer any subset; remaining questions queue for the next packet.

---

## Q1 — Atomic on Illusion (Omelette delta)

### Question

IFPA records `omelette = 3 ADD`. PassBack/FM records `Omelette` with
ADD = 4 and technical_name "Atomic Illusion". Under IFPA's additive
math, atomic (+1 per pt10 non-rotational) plus illusion (which is the
base ADD; needs confirmation) should yield a specific value.

**Is `omelette = 3` an attestation gap in IFPA's records, or is
`omelette` a different trick than the literal "atomic illusion"
composition FM describes?**

### Math context

| reading | atomic | illusion (base) | sum |
|---|---|---|---|
| IFPA additive (illusion = 3) | +1 | 3 | 4 |
| IFPA omelette as recorded | — | — | **3** (1 short of additive) |
| FM additive (Atomic Illusion) | +1 | 3 | 4 |

If illusion's base ADD is 3 (consistent with most IFPA primitives), then
atomic + illusion = 4 matches FM's omelette = 4. IFPA's `omelette = 3` then
appears under-attested by one ADD point.

### Three branches Red could choose

- **(a)** IFPA's `omelette = 3` is a data-entry error; promote to 4.
- **(b)** IFPA's `omelette` is a different trick than the literal
  "atomic illusion" composition; preserve as 3; introduce
  `atomic-illusion` as a separate row at 4 if desired (new-trick decision).
- **(c)** Atomic's ADD weight is conditional on the base (atomic = 0 on
  illusion?), and IFPA's omelette = 3 reflects that conditional rule.
  Rare branch; would require new modifier-table conditional logic.

### Affected rows

- `omelette` (IFPA row at 3 ADD; one of the 144 non-pilot rows)
- Any other `atomic + <X>` row where X = illusion-class would inherit the rule

### Promotion impact

Blocks `omelette` and `atomic-illusion` (and possibly the broader atomic-on-X
pattern) as SCALE-5+ candidates until resolved.

### What this question does NOT ask

- Does not propose a new modifier-table entry.
- Does not adopt FM math values for omelette.
- Does not re-litigate pt10 atomic = +1 / +2 baseline.

---

## Q2 — Double-Pixie semantics (Terrage delta)

### Question

FM technical_name "Double Pixie" yields `Terrage = 3 ADD`. IFPA records
`terrage = 4 ADD`. Pixie is +1 universally per IFPA's modifier table.

**Does "Double <modifier>" in FM grammar mean:**

- **(a)** 2 × modifier ADD weight (so Double Pixie = +2 ADD applied to an
  implicit 1-ADD base, giving 3); or
- **(b)** A single composite-modifier with its own non-additive weight
  (in which case the value needs to be elicited); or
- **(c)** FM data noise — Terrage = 4 in IFPA is correct, FM's 3 is
  miscounted?

### Math context

| reading | math | total |
|---|---|---|
| FM "Double Pixie" with 2× pixie | 2 × 1 = +2, applied to clipper-stall(2) base | 4 |
| FM "Double Pixie" as 1-stack | +1, applied to clipper-stall(2) base | 3 (matches FM) |
| IFPA terrage as recorded | — | **4** |

If FM applies pixie twice with no base, the literal arithmetic is +2
(matches "Double Pixie = 2 ADD as a standalone modifier-form"). The IFPA
4-ADD reading needs an implicit base.

### Broader scope

If "Double X" is a stacking convention (2 × X), then FM's other "Double" rows
become arithmetic:

- Double Drifter (FM "High Plains Drifter" = 4 ADD; 2 × drifter? drifter is
  3 ADD; 2× = 6, doesn't match)
- Double Switchover (FM "Reaper" = 4 ADD)
- Double Over Down (FM "DDD" = 4 ADD; double dex; recursive "Double" of
  itself)
- Double Legover (FM "DLO" = 3 ADD; canonical "double leg-over" trick)
- Triple Over Down (FM "TDD" = 4 ADD)

The 2× rule does not cleanly apply across these. Branch (b) — composite
modifier with its own weight — may be the cleaner reading.

### Affected rows

- `terrage` (IFPA row at 4 ADD)
- All FM `Double <X>` technical_names (DLO, DDD, Reaper, etc.)
- Broader class of "Double / Triple / etc." modifier-prefix usage

### Promotion impact

Blocks `terrage` promotion as SCALE-5+ candidate. Settles a class question
that affects multiple FM observational-grammar interpretations.

### What this question does NOT ask

- Does not propose adding "Double" as an IFPA modifier-table entry.
- Does not re-litigate IFPA's pixie = +1 ruling.

---

## Q3 — Positional operators ADD weight (class question)

### Question

Per the SS ruling (Red 2026-05-11), `same-side` (`ss`) carries no ADD weight
in canonical IFPA decomposition. PassBack/FM grammar uses additional
positional operators in the same syntactic slot: `near`, `far`, `op`, `os`,
and surface-`set` shorthand (Toe set, Clipper set, Dragon set).

Inspection of the FM inventory shows these operators consistently appear
with no ADD-weight contribution: e.g., `Stepping Far Butterfly` = Ripwalk
= 4 ADD (stepping +1 + butterfly 3 = 4); `Pixie near Legover` = Magellan =
3 ADD (pixie +1 + legover 2 = 3).

**Should the rule generalize: "positional operators in PassBack/FM grammar
carry 0 ADD weight universally"? Or should specific operators (`far`,
`near`, `op`, `os`, `set`-as-surface-shorthand) be ruled separately?**

### Corpus evidence

| operator | inventory rows | sampled math agreement |
|---|---|---|
| `far` | 14 ("Far <X>" or "<mod> Far <X>" form) | all 14 match additive (no Far contribution) |
| `near` | 0 in scrape (present in screenshots) | sampled: Magellan = pixie + legover = 3 ADD (matches) |
| `op` | 2 (Flipwalk, Zipwalk) | sampled: matches additive |
| `os` | 3 (Paradon, Pteradon, Triadon) | sampled: matches additive |
| `set` (surface) | 8 ("Clipper set", "Toe set", "Dragon set") | sampled: matches additive |
| `ss` (already ruled) | 38 | confirmed +0 |

Pattern is consistent across 65 inventory rows. **No counter-example
identified.**

### Three branches Red could choose

- **(a) Class rule**: positional operators carry 0 ADD weight universally.
  Single ruling settles `near`, `far`, `op`, `os`, surface-`set`, and ratifies
  the existing SS rule by extension.
- **(b) Per-operator**: each positional operator gets its own ruling; future
  Red questions for each new operator surfaced. Higher administrative overhead.
- **(c) Conditional**: positional operators carry ADD weight only in specific
  base-modifier interactions. Would require enumerated exceptions; no
  observed cases warrant this branch in the corpus.

### Affected rows / scope

- 65 inventory rows in the positional-operator class
- 54-row `(same side)` display-suffix cohort (already covered by SS ruling)
- Future FM-grammar Phase 2 work depends on this answer

### Promotion impact

Does NOT block any current SCALE promotion. Settles a class question that
clears the path for FM-grammar Phase 2 (educational glossary surface).

### What this question does NOT ask

- Does not propose adding positional operators to the modifier table.
- Does not propose parser changes to handle positionals.
- Does not address the temporal operators (uptime/downtime/midtime) — those
  are a separate question class (purely descriptive; not in dispute).
- Does not address recursive set operators (Sailing, Slaying, etc.) —
  separate Phase 2 question.

---

## Packet summary

| # | question | promotion blocker? | class scope |
|---|---|---|---|
| Q1 | Atomic on Illusion (Omelette) | yes — omelette + atomic-illusion | single-row + atomic-on-X class |
| Q2 | Double-Pixie (Terrage) | yes — terrage + "Double X" class | single-row + multi-row class |
| Q3 | Positional operators ADD weight | no | 65-row class; clears Phase 2 grammar work |

## What this packet does NOT include

- Questions about parser/UI/implementation.
- Settled SS semantics (no re-litigation).
- Q4-class FM-vocab modifiers (fairy/gyro/etc.) — already drafted in
  `RED_PT12_PACKET_Q1_Q4.md`.
- pt12 queue items (Blurry-Whirl, Food Processor, etc.) — separate packet.
- Phase 2 questions (recursive set operators, temporal operators, etc.) —
  queued in `RED_PACKET_PRIORITY_QUEUE.md`.

## Dispatch readiness

Each question is self-contained. The packet may be sent as-is, or any
question may be removed if Red review effort is constrained. Q3 is the
highest-leverage single answer (settles 65 rows in one ruling); Q1 and
Q2 are single-row blockers with class implications.
