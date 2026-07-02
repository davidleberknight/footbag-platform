# A1 final: the down/barfly family is one four-cell topology grid

Date: 2026-07-02 (rewritten same day after the adversarial audit; the earlier draft of this
file framed base identification as the open question and treated cell 4 as unnamed. Both
are superseded by `DOWN_FAMILY_ADVERSARIAL_AUDIT.md`). Supersedes
`exploration/doctrine-audit-2026-06-19/DECISION_PACKET.md` section A1.
Evidence pass only: nothing promoted, no canonical data changed.

## Bottom line

The original A1 question ("Is DOD the same as DDD, or is one description erroneous?") is
**dissolved, not answered**: neither description is erroneous, and they are two of FOUR
distinct 4-ADD bases forming a clean 2x2 grid that survived an adversarial falsification
pass. All four bases are already in the platform. Scoring is unaffected everywhere (bracket
count equals ADD under every reading). What remains for Red is one ratification and one
small assignment rule, plus a curator-level identity batch.

## The grid (all cells bare-attested by FB.org JOBs, all already platform rows)

Axes: set surface x which leg performs the two out-to-in dexes (entry-relative).

| | setting-side leg dexes | other leg dexes |
|--|--|--|
| **Toe set** | **Double-Over Down** (97; shipped) | **Paradon** (120; active canonical) |
| **Clipper set** | **Barfly** (78; active canonical) | **Down Double-Down** (98; shipped) |

- Every traceable down/barfly-family JOB in the corpus (24) lands in exactly one cell; zero
  violations found by an audit that searched only for counterexamples.
- Folk "Double Down" is the generic motif (PassBack's own bare row: "double-dex Butterfly"),
  not a base. The four cell names are the bases.
- The platform's existing barfly family (blurriest, nemesis, venom, superfly, base_trick =
  barfly) is the clipper column of this grid: the "down family" and the "barfly family" are
  one family under two naming traditions.
- FB.org and PassBack fully agree once coordinate frames are decoded: folk base names are
  entry-relative; PassBack technical near/far is bag-relative (near = leg beside the bag;
  for a clipper delay the bag sits beside the SUPPORT leg), with a body spin inverting the
  frame (two exhibits: Scorpion's Tail, Bullwhip). 13 of 14 cross-source pairs reconcile
  exactly; the 14th (Torch-R-Rack) is a parked one-leg residual.
- Boundary: the grid is the OUT-direction motif. IN-direction double-dex structures
  (double around the world, double pickup) fall outside on the direction axis, as intended.

## Red question set (reduced to minimum)

**Q1 (ratify; near-formality given the evidence).** The down/barfly family = one 2x2 grid
with four distinct canonical bases: Double-Over Down, Paradon, Barfly, Down Double-Down,
all 4 ADD; "double down" folk usage names the motif, never a base; grid membership is
computed by contact-relative leg-parity trace of the JOB (`parity_trace.py`, this
directory). This simultaneously closes the old A1 (distinct: yes, four-way) and the old
option C ("down" as naming layer: true for the motif word, false for the four bases).

**Q2 (one line of doctrine).** For operator compounds, the embedded base is assigned
entry-relative after stripping operator contacts, using the body-spin inversion convention
suggested by the evidence (two exhibits, not yet doctrine; see the audit, section 4). This
is the only genuinely open structural question; it decides three shipped base labels (no
ADD changes anywhere):
  - shooting_star: shipped base double-over-down; trace says DDD cell (folk aliases split).
  - tapping_double_over_down: shipped base double-over-down; trace and the archive alias
    "Tapping Paradon (Kiwi)" both say Paradon cell.
  - venom: shipped base barfly; Barfly cell only via spin inversion (FB prose "a gyro
    blurriest" supports it), otherwise DDD cell.

**Q3 (curator-level identity batch; can be delegated).** Ratify the PassBack identity map
(`PASSBACK_SOURCING_REPORT.md` section 6): ~17 frontier rows are alias/dedups of existing
tricks, ~12 are ordinary folk-trick promotions (Shaft, Dolomite, Blackula, Mofly, Id,
Your Mom, Cold Fusion, Heart, Kiwi, Leviathon, Archnemesis, Spanishfly), including the
os/ss to near/far correspondence. Post-audit closures already in evidence: Dimmier = POD =
Pixie DOD (one trick); Kiwi = Tapping Paradon; Fairy Spinning Double Down = Fairy Tail;
Symposium DDD = Shaft; Symposium DOD = Blacula; Superfly = Symposium Barfly (FB.org's own
alt name).

## Residuals (parked, non-blocking)

1. Torch-R-Rack: off by one leg under every reading (possible symposium fused-token frame
   inversion, or a bad source token). Evidence parked in the audit file.
2. Motion (Double Down near Osis): identity found, still gated on the osis token, a
   separate open item.
3. Seven FM/SG-only rows remain genuinely unsourced (sailing-dod, dod-reverse-swirl, three
   FM spinning/pixie DOD variants, pixie-quantum-DOD-swirl, atomic-os-symposium-DOD);
   fairy-spinning now has a folk identity (Fairy Tail) but still no structural source.
4. Pogo Barfly (FB.org 184) contains an inserted bare hop-dex: evidence for the open pogo
   ADD question (+1 side), recorded for that packet, not this one.

## Impact if Q1+Q2 ratified

The 46-row frontier cluster fully drains: ~17 dedups/aliases, ~12 mechanical promotions,
3 shipped base-label corrections, 7 unsourced rows left as ordinary backlog, 1 osis-gated.
The DOD/DDD doctrine blocker ceases to exist as a category.

## File map (this directory)

- `DOWN_FAMILY_ADVERSARIAL_AUDIT.md`: the falsification pass and its verdict (start here
  for evidence).
- `PASSBACK_SOURCING_REPORT.md`: identity map + PassBack grammar (section 5 crossing is
  superseded by the audit).
- `ROW_CLASSIFICATION.md`: initial 46-row pass (partially superseded; see its banner).
- `parity_trace.py`: deterministic classifier prototype over the FB.org scrape.
