# Branch B — Movement Composition (parked)

Status: exploratory research under `exploration/`, intentionally paused. Not production data, not doctrine, not a change to the live dictionary. This index is the whole of the branch for now; do not extend it until the branch is formally resumed.

## The two branches

The Trick Universe research is split into two independent branches:

- **Branch A — Movement Universe (primary, active).** Question: *what movement formulas exist?* It discovers the grammar of freestyle movement and enumerates the mechanically well-formed movement universe. It continues now.
- **Branch B — Movement Composition (secondary, this branch, parked).** Question: *when can one movement follow another?* It studies which movements can be sequenced into a combo, and why some cannot.

Branch A asks what a single move is. Branch B asks how moves chain. They are genuinely separate problems, and mixing them slowed both. This index parks Branch B cleanly so Branch A can proceed unencumbered.

## Motivation

The movement-language work surfaced, as a side effect, that combo compatibility is a real research topic with its own structure, not a footnote to the single-move grammar. Some pairs of moves connect and some do not, for reasons that are systematic rather than incidental, which is the signature of an underlying algebra waiting to be described.

## Red Husted's observation (the seed)

The rules expert's Frontier answer supplied the founding observation. The frontier of unhit tricks and combos is too vast to enumerate, and "physically impossible" is a dangerous permanent category. The one hard, useful distinction is combo compatibility: whether the terminal contact and state one move leaves the bag in can serve as the entry the next move requires. His worked example is the anchor: Fog does not chain into Blurry Whirl, because Fog ends on a toe stall while Blurry Whirl must launch from a clipper, so the ending contact does not feed the required entry. That link is state-transition incompatible, not impossible. The ruling is recorded in `freestyle/doctrine/papers/4_Frontier.md`.

## The documented-sequence validation corpus

Branch B is unusual in that it already has evidence to validate against before any model is built:

- **Real competition sequences.** The documented sequence archive, including the archived Sick 3 timed-format sequences surfaced on the freestyle insights page and the run and combo data in the records surfaces, records moves that *did* connect in performance. A correct transition model must mark every documented real sequence compatible.
- **Red's confirmed negative.** Fog into Blurry Whirl is a confirmed incompatible pairing. A correct model must mark it incompatible.

Together these give the branch a two-sided test set (known-good sequences plus a known-bad link) before a single line of a checker is written.

## The proposed transition-state research

The concept for a compatibility checker is already drafted at `exploration/state-transition-checker/CONCEPT_SPEC.md`. In brief, it models each move by its entry contact and its terminal contact and state (entry surface and contact, terminal surface and contact, side or leg relation where it matters, terminal body and support state, and whether a kick terminal or a bridging set resets the state), and reports a link as compatible when the terminal contact of one move can serve as the entry contact the next requires, directly or through a defined bridging set. The notation already provides the entry and terminal contacts for fully-notated tricks; the missing piece is the curator-ruled matrix of which endings may bridge into which beginnings.

## Why this is intentionally paused

Branch B is paused not because it is unpromising but because it is self-contained and does not block anything. It has a clear research question, independent evidence, a ready validation corpus, and an obvious roadmap. None of that needs the movement-universe grammar to be finished first, and forcing the two branches to advance together would slow the primary mission. Parking it protects both: Branch A proceeds on the single-move grammar, and Branch B waits with its evidence intact.

## Where it should resume

Branch B resumes when either of these is true:

- Branch A reaches a stable, closed single-move grammar, so a transition algebra can be built on a settled description of what a move is; or
- a curator is ready to seed the surface-to-surface transition matrix (which endings may bridge into which beginnings), which is the one input the checker cannot read from notation.

The natural first step on resumption is the read-only prototype described in the concept spec: extract entry and terminal contacts from the corpus notation, apply a small curator-seeded compatibility matrix, and validate against the documented sequences and Red's Fog into Blurry Whirl negative. Nothing before that requires new work here.
