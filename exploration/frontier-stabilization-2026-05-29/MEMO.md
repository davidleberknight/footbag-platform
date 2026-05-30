# Frontier Stabilization — Governance Memo (2026-05-29)

**Scope: governance + presentation + methodology. Read-only on canonical/observational data.**
No canonical trick rows modified, no observational tricks promoted, no parser rules altered, no Red
Wave 2 doctrine resolved. Deliverables are design recommendations and evidence-weighting guidance.
Builds directly on `../frontier-calibration-2026-05-29/` (the 187→129 Bucket-6 calibration).

Three parts (A presentation, B methodology, C documentation) + the four stabilization questions.

---

## PART A — Demoted-family rendering strategy

### Context
The public family layer was refined 23→18 under the **>2-member HARD RULE** (a public family root must
have ≥3 active members) and the **terminal-identity doctrine** (a family root expresses a terminal/
downside structural identity descendants preserve under entry-side modifier stacking). Four 2-member
groupings were demoted: `infinity`, `reverse-drifter`, `superfly`, `down-double-down`. Their canonical
`trick_family` values are untouched; they remain reachable via `?family={slug}` but no longer appear as
first-class browse cards. `freestylePublicFamilies.ts` already anticipates "a future minor/derived band."

### Audit — current appearances and what was lost
All four still exist fully at the canonical layer (DB `trick_family` intact). What demotion removed is
**only the landing browse card + the `?view=family` group header**; member tricks still render
individually and via `?family=`. Members:

| Demoted group | Members (ADD) | Structural read | Classification |
|---|---|---|---|
| **infinity** | barfly (4), ducking-barfly (5) | `barfly`'s own base-label; `barfly` is *already a first-class root* (line 60) and ducking-barfly hangs off it | **pseudo-family** (redundant with the barfly root) |
| **reverse-drifter** | reverse-drifter (3), royale (4) | direction-reverse of the drifter family + one named descendant | **recurring derivational motif** (direction-reverse) |
| **superfly** | spinning-superfly (6), stepping-superfly (6) | two modifier-variants of a `superfly` base (no bare base row active); both high-ADD named tricks | **stylistic / modifier-variant cluster** |
| **down-double-down** | down-double-down (4), scorpions-tail (5) | a named base trick + one folk-named descendant | **small named cluster** (transitional pedagogical) |

What stays culturally valuable: the **named members themselves are real, attested tricks** (royale,
scorpions-tail, the superflies, barfly). What was lost is only the *grouping affordance* — a place to
say "these two hang together." None of the four is a terminal-identity family; three are derivational/
stylistic motifs and one (infinity) is redundant with an existing root.

### Recommended two-band rendering model (design only — rendering impl is Dave-track)
- **Band 1 — Families (canonical, terminal-identity).** The existing 18. Unchanged: full cards, counts,
  prominent.
- **Band 2 — "Minor & derived neighborhoods" (explicitly non-canonical).** A visually subordinate
  strip below Band 1: smaller/muted type, a clear band header, each item a plain text link to
  `?family={slug}` (which already resolves). **No ADD chips, no flagship stars, no member counts** — the
  absence of family chrome is what signals "not a family." Optionally collapsed by default.

Driven by a **new reversible TS content module** parallel to `PUBLIC_DISPLAY_FAMILIES` — e.g.
`MINOR_DERIVED_NEIGHBORHOODS: { slug, label, parentFamily?, kind }[]` — editing one file, no schema, no
canonical change. `kind ∈ {derivational-motif, stylistic-cluster, named-cluster}` documents *why* each
is minor.

### Terminology recommendation
**Use "minor / derived neighborhood." Do NOT use any form of "family" for these.** Rationale:
- "**secondary family**" / "**derived family**" — REJECT. Any "family" wording reopens the terminal-
  identity doctrine and invites the exact re-promotion the brief forbids.
- "**movement neighborhood**" — close, but in the topology skill that term denotes a *cross-family
  topology axis* (ducking/diving/weaving, hippy-vs-leggy). Overloading it here muddies an existing
  concept. Borrow the word "neighborhood" but qualify it ("minor/derived").
- "**legacy cluster**" — REJECT. Implies historical/deprecated; these are live, just minor.
- **"Minor & derived neighborhoods"** — accurate (small, derivative, non-canonical), carries no family
  authority, distinct from the topology-axis sense.

### Suggested glossary placement
A 2–3 sentence note in the glossary **Families** section: families are terminal-identity structures
(downside signature descendants inherit); minor/derived neighborhoods are small derivational or
stylistic clusters that are *reachable and nameable but not families*. This actively **reinforces** the
terminal-identity doctrine by giving the reader the contrast. No per-cluster cards in the glossary.

### Suggested UI treatment
Subordinate strip under the family cards on `/freestyle/tricks` (and the `?view=family` foot): muted
header "Minor & derived neighborhoods", inline comma-separated text links, one line of microcopy
("Small derivational or stylistic groupings — reachable, but not canonical families"). Mobile: wraps as
plain text, no card grid.

### Risks / tradeoffs
1. **Re-inflation** — a Band-2 with no cap drifts back toward a pseudo-family list. *Mitigation:* a
   written inclusion bar (≥2 named, culturally-attested members; explicitly a motif/variant of a parent)
   and a soft cap; review at each refinement.
2. **User confusion** — "why is this separate?" *Mitigation:* the one-line microcopy + glossary note.
3. **Ontology drift** — "neighborhood" creeping toward "family." *Mitigation:* naming discipline (never
   "family"); no family chrome (chips/counts/stars).
4. **Dave-track boundary** — the rendering is Dave's; this memo is design input, not implementation.

### Per-family: does each deserve resurfacing?
- **infinity — NO.** Pseudo-family redundant with the `barfly` root. Fold conceptually under barfly; do
  not list in Band 2. (Note a separate pre-existing quirk for curator: `barfly`'s `trick_family` is
  `infinity` while `barfly` is also a public root slug — a label inconsistency to flag, *not* fixed here.)
- **reverse-drifter — YES (Band 2, parent=drifter).** Clean direction-reverse motif; the exact "low-count
  direction-reverse" case the doctrine names.
- **superfly — YES (Band 2, stylistic-cluster).** Two culturally-named high-ADD variants; worth a nameable
  grouping, clearly not a family.
- **down-double-down — YES (Band 2, named-cluster, parent≈double-over-down lineage).** Real named base +
  descendant; minor but legitimate.

Net: **3 of 4 resurface in Band 2; infinity does not.**

---

## PART B — FM ↔ Stanford lineage-independence audit

Method: `fm_stanford_overlap.py` (read-only) over the symbolic master corpus + Stanford provenance docs.

### Evidence
- **Provenance (decisive).** Stanford shorthand is Ben Lynn's (Stanford) one-character re-notation,
  built *"after stumbling across a big list of footbag moves"* (`stanford-1.txt`). Stanford did **not**
  independently observe/collect tricks — it re-encoded a pre-existing external move list. The whole
  corpus is a derived representation.
- **Overlap structure.** FM 761 slugs, Stanford 1079, intersection 340 (Jaccard 0.23); 45% of FM is in
  Stanford. Moderate, but the composition matters more than the magnitude.
- **Rare-shared set.** **166 obscure tricks are attested by FM + Stanford and by no other independent
  source** (aeon-flux, amadeus, anoxia, arachnophobia, blacula, blue-widow…). Independent observers do
  not both capture 166 of the *same obscure* moves.
- **Naming identity (verified raw, not a normalization artifact).** On shared obscure tricks the raw
  display names are *byte-identical*: "Blacula", "Amadeus", "Aeon Flux", "Arachnophobia" appear verbatim
  in both FM and Stanford. Independent naming of an obscure deliberately-misspelled folk trick to the
  same string does not happen by convergence.

### Independence assessment
**Partially dependent — leaning derivative.** Stanford's move list shares substantial upstream lineage
with FM (Stanford re-notated a found list that is, on this evidence, FM or a near-common ancestor).
Confidence: **probably derivative / shared-upstream**, not independent. (Stated with appropriate
humility: we cannot prove the exact ancestor, only that independence is not credible given identical
obscure-name capture at scale.)

### Recommended evidence-weighting policy
- **FM ∩ Stanford = PARTIAL corroboration, not strong.** Treat co-occurrence as ~"one community-list
  lineage, doubly-encoded," i.e. a notch above single-source but below two independent sources.
- **Genuinely strong** requires an *independent-lineage* second source — **footbag.org (fborg)** or a
  competition/TT-lesson attestation — on top of (or instead of) the FM/Stanford pair.
- PassBack remains a third independent lineage; PassBack + (FM **or** Stanford) is stronger than FM +
  Stanford.

### Impact on the previously-estimated "41 strong" cohort
The calibration's 41 "strongly attested" rested entirely on FM∩Stanford. Re-weighted:
- **3 remain genuinely strong** — also attested by footbag.org: **Paratoxic, Torch-R-Rack, Whirr**
  (FM/Stanford lineage + independent fborg).
- **38 downgrade to "partial"** — FM∩Stanford single-lineage; promote-worthy signal, but not the
  two-independent-source bar.

### Revised confidence language
Replace "strongly attested (≥2 independent sources)" with **"partially corroborated (FM/Stanford shared
lineage)"** for the 38, and reserve **"strongly attested"** for rows with an independent-lineage source
(fborg / competition / TT). Net frontier picture is *more conservative*, as intended: the corroborated-
strong core is ~3, not 41; ~38 are partial; the rest unchanged.

---

## PART C — Frontier governance / documentation hardening (recommend-only)

These are **recommendations**, not edits. Canonical docs (`docs/`, root, `.claude/`) change only with
explicit approval + doc-sync; exploration artifacts I own are amended below where noted.

### Outdated assumptions / wording the calibration changed
1. **"41 strong" everywhere it appears** (calibration MEMO, `project_frontier_canonicalization` memory,
   any skill note) now overstates — should read "3 strong + 38 partial (FM/Stanford shared lineage)."
   *Recommend:* amend the calibration memo's strong-tier caveat from "verify independence" to
   "**resolved: FM/Stanford partially dependent → partial corroboration**," and update the frontier
   memory line.
2. **Observational-layer headers** (`freestyleObservationalUniverse.ts` doc comment, any VIEW_CATALOG
   observational-surface wording) describe `intakeBucket` neutrally but don't state that **reported
   frontier counts overstate the promotable set by ~31%** and that single-source/PassBack-only is a
   *hold*, not a queue. *Recommend:* a one-line "counts are observational and inflation-prone; see
   calibration" note wherever a raw universe/bucket total is surfaced.
3. **"Multi-source corroboration" language** anywhere it implies source *count* = strength. *Recommend:*
   wherever corroboration is described, specify **independent-lineage** count, and name the lineage
   collapse (FM≡Stanford; fm_inventory≡fm_symbolic_grammar; the derived TS/DB projections are not
   sources).

### Candidate glossary / governance language (drop-in)
- **Observational vs canonical:** *"Canonical tricks are community-sanctioned and durable. The
  observational layer is curator-extrapolated coverage — useful for navigation, but never authoritative;
  its counts overstate what is actually promotable."*
- **Corroboration weighting:** *"Evidence is weighted by independent lineage, not raw source count.
  FootbagMoves and the Stanford shorthand share upstream lineage and count as one corroboration, not
  two; an independent source (footbag.org, competition records, TT lessons) is required for 'strong.'"*
- **Single-source / frequency:** *"A name appearing many times in one corpus is vocabulary, not
  authority. Frequency never promotes; corroboration from an independent lineage does."*
- **Lineage collapse (method rule):** *"Before counting sources, collapse same-source projections (a
  corpus split across tables) and our own derived content (generated TS/DB) — they are not attestation."*

### Suggested "frontier philosophy" framing (3 sentences)
*"The frontier is the set of plausibly-real tricks not yet canonical. It is intentionally observational:
we size and weight it honestly rather than promote on appearance, because a wrong canonical commitment
is costlier than a missing one. Promotion waits on independent corroboration and doctrine (Red Wave 2);
until then the frontier is a calibrated holding area, not a backlog to clear."*

### Explaining the observational layer publicly without confusing users
Keep observational content **off** primary public surfaces (it already is). If ever surfaced, label it
plainly ("community-documented, not yet in our canonical dictionary") and never show provisional ADD/
decomposition as if authoritative. Users should never have to distinguish frontier from canonical — the
UI should do it for them by simply not mixing them.

---

## Final — Stabilization assessment (the four questions)

**1. Is the frontier now structurally under control? — Yes, substantially.** Two calibrations bound it:
the genuine PassBack new-trick frontier is ~129 (not 187), and the FM/folk≥7 cohort yielded 0 independent
corroboration. The "strong" core shrank from 41 to ~3 once FM/Stanford dependence was resolved. We now
have honest sizing, a lineage-collapse method, and a holding model. What remains is *bounded and labeled*,
not open-ended.

**2. Methodological vs doctrinal risks.**
- *Methodological (mostly retired):* source-count inflation (fixed by lineage collapse), matcher false-new
  (42, mechanical fix pending), concept/notation leakage (14, filter pending), FM/Stanford double-count
  (resolved). One open: confirm no *third* hidden shared-lineage pair (e.g. is PassBack truly independent
  of fborg?) — low priority.
- *Doctrinal (the real remaining work):* every promotion is gated on Red Wave 2 — blurry transitivity,
  barraging operator class, atomic family scope (X-dex/hidden-carry), operator-vs-trick boundary,
  compression intent, hidden-vs-flat. These are *not* methodological; no amount of analysis resolves them.

**3. Is the project ready for Red Wave 2? — Yes.** The methodological house is in order: the frontier is
sized, weighted, and de-inflated; the promotable candidates are identified and conservatively ranked;
the operator-intake vocabulary is triaged (zulu/flailing genuine, rest HOLD/reject). Red's time is best
spent on doctrine, and we can now hand Red a *clean, honestly-weighted* candidate set rather than an
inflated one. Recommend entering Wave 2.

**4. Which doctrine cluster first, and why? — Atomic family scope (atomic / X-dex / hidden-carry, the
"Q3" cluster).** Rationale: (a) it currently blocks the most concrete, ready rows (`atomic-torque`,
`atomic`, and the rotational-atomic chassis that several frontier candidates depend on); (b) it is the
most *self-contained* of the Wave-2 questions (a single ADD-accounting rule, not a cross-cutting grammar
judgment like compression intent); (c) resolving it unblocks a derivable family chassis rather than a
one-off, so the leverage per ruling is highest. Sequence after it: blurry transitivity (next most
concrete), then the operator-vs-trick boundary (which also settles flailing/railing), leaving compression-
intent and hidden-vs-flat (the most philosophical) for last when the worked examples are richest.

---

### Outputs (this directory)
- `MEMO.md` — this memo (Parts A/B/C + stabilization answers).
- `fm_stanford_overlap.py` — read-only FM/Stanford overlap analysis (re-runnable).
