# Emerging Vocabulary reconciliation — 78 observational names

`AUDIT.csv` has one row per observed EV name with: disposition, target slug,
strongest candidate tested, source notation, candidate notation, structural
mismatch, whether ADD disagreement is structural or historical, why an alias would
be false (for holds), positional-qualifier preservation, and public status.

## Method (structure-first, ADD as provenance)

Each name was compared against active AND inactive/retired canonicals, all
registered aliases, tracked-name mappings, and every canonical's operational
notation (order-preserving structural signature, X-Dex-optional). Vocabulary
translations (BS=Backside, Xbd=cross-body, ss/os, Rev.=Reverse, Symp.=Symposium,
Gryo=Gyro, Reverse ATW->Orbit, Whipping=reverse-whirling) were applied before
concluding no target exists. Source ADD disagreement was never a rejection on its
own: where movement structure, position, timing, dex order and terminal match a
canonical, the name resolves and the source ADD is kept as provenance.

## Disposition tally (78)

- **register-alias — 9**, **spelling-normalization — 1** (10 resolved; see below)
- **hold-structural — 65**, **hold-doctrine — 3** (68 held)

### The 10 resolutions (now public, as aliases in the archive)

| observed | -> canonical | basis |
|---|---|---|
| BS Paste | backside_paste | BS=Backside abbreviation |
| Xbd Sole Stall | cross_body_sole_stall | Xbd=cross-body abbreviation |
| Gryo DLO | gyro_double_leg_over | Gryo typo for Gyro; DLO=double leg over |
| double-dex ATW | double_around_the_world | two repeated inward dexes = Double ATW |
| triple-dex ATW | triple_around_the_world | three repeated inward dexes = Triple ATW |
| Double Reverse ATW | double_orbit | Reverse ATW = Orbit (ratified); double form |
| Triple Reverse ATW | triple_orbit | Reverse ATW = Orbit; triple form |
| Rasmus | atomic_ducking_mirage | **structural**: identical dex/body/terminal order; source 5-ADD X-Dex reading kept as provenance vs canonical 4 |
| Leaning Jowler | surging_mirage | **structural**: exact match (clip op-in dex > front-spin > same-in dex > op-toe) |
| Grifter (same side) | reverse_drifter | **structural**: exact match incl the same-side (SAME CLIP) terminal |

Rasmus / Leaning Jowler / Grifter (same side) are the rows the first pass wrongly
held on ADD disagreement or "not a tracked base"; structure resolves them.

## Cluster-by-cluster

**Backside (BS).** BS = Backside. `backside_paste` (active, 4) exists, so **BS Paste
resolves**. But there is no `backside_fusion`, `backside_pigbeater`, or
`backside_reactor` canonical (the corpus has backside_paste / backside_magellan /
backside_symposium_smear / backside_symposium_toe_blizzard only). `fusion`,
`pigbeater`, `reactor` exist as their own non-backside tricks; a backside execution
is a distinct row that has not been authored, so **BS Fusion / BS Pigbeater / BS
Reactor are held** (backside qualifier preserved), not aliased to the non-backside
form.

**Xbd (cross-body).** Xbd = cross-body. `cross_body_sole_stall` (active, 3) exists,
so **Xbd Sole Stall resolves**. There is no `cross_body_outside_stall` (only
`outside_stall`, 1 ADD, and the distinct cross-body SOLE stall), so **Xbd Outside
Stall is held** — the cross-body outside surface has no canonical and is not the
same trick as either existing stall.

**Grifter.** The registered alias `grifter -> reverse_drifter` and the exact
structural match (`CLIP > OP OUT [DEX] > SAME CLIP [XBD] [DEL]`) resolve **Grifter
(same side) -> reverse_drifter** (the SAME CLIP terminal is the same-side form, so
no positional information is lost). **Clipper far Grifter** is held: the FAR grifter
on a clipper set has no separate canonical and no source notation to confirm it
equals reverse_drifter, and far != same-side.

**Whipping / WHTP.** Conclusion: **Whipping Osis remains held because WHTP is not a
real source token (zero occurrences anywhere in inputs or code; the actual token is
"Whipping", which the existing alias `whip -> rev_whirl` confirms means
reverse-whirling); its strongest candidate is `reverse_swirling_osis` (the only
osis-with-a-reversed-rotation canonical, active or inactive); and the exact mismatch
is that `reverse_swirling_osis` is a reverse-SWIRLING front-spin construction
(`SET > OP IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]`), not a whirl — swirl
!= whirl — a different movement, not a spelling of the same one.** The four
comparisons run: (a) reverse-whirling osis construction — none exists; (b) any
reverse-whirl + osis canonical — none (the only osis-reversal is the swirl above); (c)
active AND inactive aliases — `whip -> rev_whirl` exists for the bare whip, but no
whipping-osis / rev-whirl-osis alias; (d) source notation using WHTP — no WHTP token
and no Whipping Osis notation in the symbolic-grammar master, so no structure to
match. No reverse-whirling osis canonical exists to alias to, and mapping a whirl name
onto the swirl canonical would be false.

**ATW.** ATW is inward, Orbit is the outward/reverse counterpart (ratified; `orbit`
already carries the `reverse atw` aliases). Repeated-inward forms resolve
(**double-dex / triple-dex ATW -> double / triple around the world**); reverse forms
resolve to Orbit (**Double / Triple Reverse ATW -> double / triple orbit**).
**Triple ATW in-out** and **Triple ATW out-in** are held: mixed-direction order is
structurally significant and matches neither the all-inward Triple ATW nor the
all-outward Triple Orbit. **Symple ATW / Symple Reverse ATW** are held on doctrine:
"Symple" is a distinct, undefined FootbagMoves operator (Symple Butterfly, Symple
Swirl, Symple Reverse Swirl all appear in the source), not Symposium and not Simple;
it needs an operator ruling before any ATW-under-Symple can be structured.

## Why the remaining holds are genuine, not obvious aliases

The FootbagMoves folk names with source notation (Frenzy, Ill/Kill Frenzy, Johny
Quest, Johny Vodka, Kiss Of The Scorpion, Massacre, Neutron Smasher, Super Ego,
Bubba Beater, Double Helix, Flaming Homer, Flaming Tard, Torquescrew, Your Mom, Your
Sister, Zulu Le Loup, Scorpions Toe Nail) were each compared structurally against
the whole corpus; none has an order-preserving match to any canonical (the mismatch,
not the ADD, is recorded per row). Several tracked "Canonical (Folk)" mappings point
at bases that are not canonicals at all (atomic_blacula, bubba_flail,
flailing_dolomite, leaning_mirage, illusioning_clipper), so those names cannot be
aliased to a non-existent target. Super Ego differs from atomic_ducking_blender by an
Op-Front-Whirl dex and a trailing back-spin (a structural difference, not just ADD).
The no-notation SG/PB names (Butterfly Swivel, Delusional/Null/Wiggle Butterfly,
Frantic/Fusing/Slapping Clipper, Peeking Osis, Quasi/Scattered Whirl, Splicing
Infinity, Reverse Walkover, etc.) are distinct documented compounds with no canonical
or alias and no notation to structurally match; they are genuinely unpromoted, not
alternate names.

## Two distinct statuses

**Public EV publication: UNBLOCKED — safe to ship.** Every review-incomplete row is
suppressed from public payloads, so nothing on the public site misrepresents an
unresolved name. The suppression is applied once at the service boundary
(`publicObservationalUniverse` in `freestyleService`, driven by
`src/content/freestyleEvReviewHold.ts`), so both public consumers — the
`/freestyle/observational` page and the dictionary Emerging Vocabulary tile count —
get the same gated payload; the internal workbench
(`/internal/freestyle/emerging-vocabulary`) still shows everything with provenance.
A regression test asserts no held name renders on the public surface. Because the
whole archive-observational sub-section is now empty, its disclosure block does not
render at all (the template guards it with an `{{#if total}}`); there is no empty
heading or misleading "(0)".

**78-name reconciliation: INCOMPLETE.** 68 rows still require maintainer confirmation
or further evidence before they could be published as genuinely-unresolved vocabulary.
The publication gate is what makes the site shippable while that work continues.

- **Temporarily suppressed pending review: 68.**
- **Publicly resolved (archive, as alias): 10.**

The pass is complete for a held name only when it either resolves to a canonical (an
alias is registered and it drops from the hold on its own) or a maintainer confirms
it is a genuinely unresolved trick and clears it from the hold. Until then it stays
off the public surface.
