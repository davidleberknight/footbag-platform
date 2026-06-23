# Positional names — corpus & evidence audit (2026-06-23)

Read-only. Doctrine settled; question is historical existence, not derivability.

Reproduce: `python3 exploration/positional-evidence-audit-2026-06-23/audit.py`

## Candidate set

Positional-NAMED rows in the corpus census (`CLASSIFIED_UNIVERSE.csv`) that are not already canonical (not promoted, not in the live DB).

- Total remaining positional candidates: **387**

## Classification counts

| Class | Meaning | Count |
|---|---|---:|
| A | Historically documented | **372** |
| B | Existing alias / naming variant | **13** |
| C | Derivable but not evidenced | **0** |
| D | Genuine unresolved conflict | **2** |

## A — historical evidence breakdown

- Multi-source corroborated (n_sources >= 2): **5**
- Attested in tournament records: **1**
- In the FootbagMoves same-side inventory: **15**
- Alias-suspect (qualifier-stripped base is itself an active canonical): **139** (documented, but may read as a naming variant of the base rather than a distinct trick; curator call)
- By source corpus (A rows, a name may have several):
  - passback: 177
  - stanford: 121
  - footbagmoves: 70
  - fborg: 9

## D — genuine conflicts

Name asserts same-side; operational notation shows OP only.

- `inspinning-same-side-illusion` — Inspinning Same Side Illusion
- `inspinning-same-side-mirage` — Inspinning Same Side Mirage
- `whirl-same-side` — Whirl (same side) (the third conflict; already in the live DB, so outside the remaining-candidate set, but still an unresolved name/notation conflict)

## Derivable-frontier probe (targeting-rule candidates vs corpus)

The relative-side targeting rule yields mechanically-derivable forms. This probe checks each against corpus attestation, so C is measured, not assumed.

- Targeting-rule candidates probed: **54**
- Corpus-attested (would be A): **40**
- Derivable-only, no attestation (would be C): **14**

### Targeting candidates with NO corpus attestation (true C — do not author):
- `assassin-ss`
- `fairy-illusion-same-side`
- `fairy-legover-ss`
- `fairy-mirage-same-side`
- `fairy-pickup-ss`
- `fairy-torque-same-side`
- `far-butterfly`
- `far-double-pickup`
- `paste-ss`
- `pixie-double-pickup-ss`
- `pixie-mirage-same-side`
- `quantum-butterfly-same-side`
- `stepping-clipper-same-side`
- `stepping-ducking-butterfly-same-side`

> Caveat: attestation is matched on the exact positional slug/name. A C entry may be an alternative SPELLING of a form attested under another spelling (the same spelling collisions flagged earlier); slug normalization is frozen, so these are reported as-is.

## Batch-1 cross-check (already staged to red_additions; NOT yet in live DB)

Re-checking the 6 entries already authored against historical attestation, now that the bar is evidence rather than derivability:

| slug | corpus-attested? | class |
|---|:--:|:--:|
| `blender-same-side` | YES | A |
| `butterfly-same-side` | YES | A |
| `far-butterfly` | NO | C |
| `stepping-clipper-same-side` | NO | C |
| `stepping-osis-same-side` | YES | A |
| `surging-ss-osis` | YES | A |

`far-butterfly` and `stepping-clipper-same-side` have no standalone historical attestation: "far butterfly" / "stepping clipper (ss)" appear only as substrings inside larger compound names, never as a documented trick on their own. They were authored on derivability alone. None of the 6 are loaded into the live DB yet, so they remain pullable from `red_additions` before any rebuild. (Report only; nothing changed.)

## Full candidate table

| slug | class | name | sources | n | rec | fm_ss | alias→ |
|---|---|---|---|--:|:--:|:--:|---|
| `atomic-ducking-far-double-down` | A | Atomic Ducking far Double Down | passback | 1 |  |  |  |
| `atomic-ducking-far-mirage` | A | Atomic Ducking far Mirage | passback | 1 |  |  |  |
| `atomic-ducking-far-torque` | A | Atomic Ducking far Torque | passback | 1 |  |  |  |
| `atomic-far-blender` | A | Atomic far Blender | passback | 1 |  |  |  |
| `atomic-far-butterfly` | A | Atomic far Butterfly | passback | 1 |  |  |  |
| `atomic-far-dlo` | A | Atomic far DLO | passback | 1 |  |  |  |
| `atomic-far-double-down` | A | Atomic far Double Down | passback | 1 |  |  |  |
| `atomic-far-eggbeater` | A | Atomic far Eggbeater | passback | 1 |  |  |  |
| `atomic-far-mirage` | A | Atomic far Mirage | passback | 1 |  |  |  |
| `atomic-far-symp-double-down` | A | Atomic far Symp. Double Down | passback | 1 |  |  |  |
| `atomic-far-symp-whirl` | A | Atomic far Symp. Whirl | passback | 1 |  |  |  |
| `atomic-far-whirl` | A | Atomic far Whirl | passback | 1 |  |  |  |
| `atomic-near-butterfly` | A | Atomic near Butterfly | passback | 1 |  |  |  |
| `atomic-near-mirage` | A | Atomic near Mirage | passback | 1 |  |  |  |
| `atomic-ss-osis` | A | Atomic ss Osis | footbagmoves | 1 |  |  |  |
| `baragging-far-symp-mirage` | A | Baragging far Symp. Mirage | passback | 1 |  |  |  |
| `barraging-butterfly-same-side` | A | Barraging Butterfly (same side) | footbagmoves | 1 |  |  |  |
| `barraging-far-butterfly` | A | Barraging far Butterfly | passback | 1 |  |  |  |
| `barraging-far-dlo` | A | Barraging far DLO | passback | 1 |  |  |  |
| `barraging-far-double-down` | A | Barraging far Double Down | passback | 1 |  |  |  |
| `barraging-far-eggbeater` | A | Barraging far Eggbeater | passback | 1 |  |  |  |
| `barraging-far-illusion` | A | Barraging far Illusion | passback | 1 |  |  |  |
| `barraging-far-legover` | A | Barraging far Legover | passback | 1 |  |  |  |
| `barraging-far-mirage` | A | Barraging far Mirage | passback | 1 |  |  |  |
| `barraging-far-motion` | A | Barraging far Motion | passback | 1 |  |  |  |
| `barraging-far-osis` | A | Barraging far Osis | passback | 1 |  |  |  |
| `barraging-far-whirl` | A | Barraging far Whirl | passback | 1 |  |  |  |
| `barraging-near-butterfly` | A | Barraging near Butterfly | passback | 1 |  |  |  |
| `barraging-near-double-down` | A | Barraging near Double Down | passback | 1 |  |  |  |
| `barraging-ss-double-double-down` | A | Barraging ss Double Double Down | footbagmoves | 1 |  |  |  |
| `bubba-ss-mirage` | A | Bubba ss Mirage | stanford | 1 |  |  |  |
| `butterfly-symp-twisting-near-toe` | A | Butterfly Symp. Twisting near Toe | passback | 1 |  |  |  |
| `butterfy-near-osis` | A | Butterfy near Osis | passback | 1 |  |  |  |
| `clipper-diving-near-whirl` | A | Clipper Diving near Whirl | passback | 1 |  |  |  |
| `clipper-ducking-far-blender` | A | Clipper Ducking far Blender | passback | 1 |  |  |  |
| `clipper-ducking-far-double-down` | A | Clipper Ducking far Double Down | passback | 1 |  |  |  |
| `clipper-ducking-far-drifter` | A | Clipper Ducking far Drifter | passback | 1 |  |  |  |
| `clipper-ducking-far-symp-whirl` | A | Clipper Ducking far Symp. Whirl | passback | 1 |  |  |  |
| `clipper-ducking-far-whirl` | A | Clipper Ducking far Whirl | passback | 1 |  |  |  |
| `clipper-far-double-down` | A | Clipper far Double Down | passback | 1 |  |  |  |
| `clipper-far-downtime-miraging-symp-mirage` | A | Clipper far (downtime) Miraging Symp. Mirage | passback | 1 |  |  |  |
| `clipper-far-dso` | A | Clipper far DSO | passback | 1 |  |  |  |
| `clipper-far-grifter` | A | Clipper far Grifter | passback | 1 |  |  |  |
| `clipper-far-symp-double-down` | A | Clipper far Symp. Double Down | passback | 1 |  |  |  |
| `clipper-far-symp-whirl` | A | Clipper far Symp Whirl | passback | 1 |  |  |  |
| `clipper-far-triple-dex-butterfly` | A | Clipper far triple-dex Butterfly | passback | 1 |  |  |  |
| `clipper-near-double-down` | A | Clipper near Double Down | passback | 1 |  |  |  |
| `clipper-near-symp-double-down` | A | Clipper near Symp. Double Down | passback | 1 |  |  |  |
| `clipper-set-ss-double-over-down` | A | Clipper set ss Double Over Down | footbagmoves | 1 |  |  |  |
| `clipper-set-ss-symposium-double-over-down` | A | Clipper set ss Symposium Double Over Down | footbagmoves | 1 |  |  |  |
| `double-dex-drifter-midtime-barraging-far-clipper` | A | double-dex Drifter/(midtime) Barraging far Clipper | passback | 1 |  |  |  |
| `double-down-near-osis` | A | Double Down near Osis | passback | 1 |  |  |  |
| `dragon-set-stepping-op-firewalk` | A | Dragon set Stepping op Firewalk | footbagmoves | 1 |  |  |  |
| `ducking-far-legover` | A | Ducking Far Legover | stanford | 1 |  |  |  |
| `ducking-far-osis` | A | Ducking Far Osis | stanford | 1 |  |  |  |
| `ducking-far-pickup` | A | Ducking Far Pickup | stanford | 1 |  |  |  |
| `ducking-far-symposium-reverse-whirl` | A | Ducking Far Symposium Reverse Whirl | stanford | 1 |  |  |  |
| `fairy-dlo` | A | Fairy DLO (ss) | passback | 1 |  |  |  |
| `fairy-far-butterfly` | A | Fairy far Butterfly | passback | 1 |  |  |  |
| `fairy-far-illusion` | A | Fairy far Illusion | passback | 1 |  |  |  |
| `fairy-far-mirage` | A | Fairy far Mirage | passback | 1 |  |  |  |
| `fairy-illusion` | A | Fairy Illusion (same side) | footbagmoves | 1 |  | Y |  |
| `fairy-legover-toe-ss-eggbeater` | A | Fairy Legover / Toe ss Eggbeater | passback | 1 |  |  |  |
| `fairy-near-pickup` | A | Fairy near Pickup | passback | 1 |  |  |  |
| `fairy-near-swirling-near-swirl` | A | Fairy near Swirling near Swirl | passback | 1 |  |  |  |
| `fairy-same-side-mirage` | A | Fairy Same Side Mirage | fborg | 1 |  |  |  |
| `fairy-same-side-whirl` | A | Fairy Same Side Whirl | fborg | 1 |  |  |  |
| `fairy-spinning-near-barraging-far-buterfly` | A | Fairy Spinning near Barraging far Buterfly | passback | 1 |  |  |  |
| `fairy-ss-barrage` | A | Fairy ss Barrage | stanford | 1 |  |  |  |
| `fairy-ss-blender` | A | Fairy ss Blender | stanford | 1 |  |  |  |
| `fairy-ss-butterfly` | A | Fairy ss Butterfly | footbagmoves | 1 |  |  |  |
| `fairy-ss-butterfly-park-avenue` | A | Fairy ss Butterfly (Park Avenue) | stanford | 1 |  |  |  |
| `fairy-ss-clipper` | A | Fairy ss Clipper | stanford | 1 |  |  |  |
| `fairy-ss-dlo-glaucoma` | A | Fairy ss DLO (Glaucoma) | stanford | 1 |  |  |  |
| `fairy-ss-double-legover` | A | Fairy ss Double Legover | footbagmoves | 1 |  |  |  |
| `fairy-ss-double-pickup` | A | Fairy ss Double Pickup | stanford | 1 |  |  |  |
| `fairy-ss-drifter` | A | Fairy ss Drifter | footbagmoves | 1 |  |  |  |
| `fairy-ss-drifter-casket` | A | Fairy ss Drifter (Casket) | stanford | 1 |  |  |  |
| `fairy-ss-dyno` | A | Fairy ss Dyno | stanford | 1 |  |  |  |
| `fairy-ss-eggbeater` | A | Fairy ss Eggbeater | footbagmoves | 1 |  |  |  |
| `fairy-ss-eggbeater-flaming-homer` | A | Fairy ss Eggbeater (Flaming Homer) | stanford | 1 |  |  |  |
| `fairy-ss-guay` | A | Fairy ss Guay | stanford | 1 |  |  |  |
| `fairy-ss-illusion` | A | Fairy ss Illusion | stanford | 1 |  |  |  |
| `fairy-ss-legover` | A | Fairy ss Legover | passback | 1 |  |  |  |
| `fairy-ss-mirage` | A | Fairy ss Mirage | stanford | 1 |  |  |  |
| `fairy-ss-osis` | A | Fairy ss Osis | footbagmoves | 1 |  |  |  |
| `fairy-ss-pickup-nallegam` | A | Fairy ss Pickup (Nallegam) | stanford | 1 |  |  |  |
| `fairy-ss-reverse-guay` | A | Fairy ss Reverse Guay | stanford | 1 |  |  |  |
| `fairy-ss-reverse-swirl` | A | Fairy ss Reverse Swirl | stanford | 1 |  |  |  |
| `fairy-ss-reverse-whirl` | A | Fairy ss Reverse Whirl | stanford | 1 |  |  |  |
| `fairy-ss-swirl` | A | Fairy ss Swirl | stanford | 1 |  |  |  |
| `fairy-ss-symposium-mirage` | A | Fairy ss Symposium Mirage | stanford | 1 |  |  |  |
| `fairy-ss-symposium-whirl` | A | Fairy ss Symposium Whirl | stanford | 1 |  |  |  |
| `fairy-ss-torque` | A | Fairy ss Torque | footbagmoves | 1 |  |  |  |
| `fairy-ss-torque-muerto` | A | Fairy ss Torque (Muerto) | stanford | 1 |  |  |  |
| `fairy-ss-whirl` | A | Fairy ss Whirl | stanford | 1 |  |  |  |
| `fairy-ss-xbd-rake-swish` | A | Fairy ss XBD Rake (Swish) | stanford | 1 |  |  |  |
| `fairy-torque` | A | Fairy Torque (same side) | footbagmoves | 1 |  | Y |  |
| `fairy-whirl-same-side` | A | Fairy Whirl (same side) | footbagmoves | 1 |  | Y |  |
| `far-butterfly-infinity` | A | Far Butterfly (Infinity) | stanford | 1 |  |  |  |
| `far-clipper` | A | Far Clipper | stanford | 1 |  |  |  |
| `far-crossbody-rake` | A | Far Crossbody Rake | stanford | 1 |  |  |  |
| `far-double-over-down` | A | Far Double Over Down | footbagmoves | 1 |  |  |  |
| `far-double-pickup-reverse-reaper` | A | Far Double Pickup (Reverse Reaper) | stanford | 1 |  |  |  |
| `far-double-switchover` | A | Far Double Switchover | footbagmoves | 1 |  |  |  |
| `far-double-switchover-reaper` | A | Far Double Switchover (Reaper) | stanford | 1 |  |  |  |
| `far-dyno` | A | Far Dyno | footbagmoves | 1 |  |  |  |
| `far-guay` | A | Far Guay | stanford | 1 |  |  |  |
| `far-legover` | A | Far Legover | stanford | 1 |  |  |  |
| `far-osis` | A | Far Osis | stanford | 1 |  |  |  |
| `far-pickup` | A | Far Pickup | stanford | 1 |  |  |  |
| `far-reverse-guay` | A | Far Reverse Guay | stanford | 1 |  |  |  |
| `far-reverse-swirl` | A | Far Reverse Swirl | stanford | 1 |  |  |  |
| `far-reverse-whirl` | A | Far Reverse Whirl | footbagmoves | 1 |  |  |  |
| `far-swirl` | A | Far Swirl | stanford | 1 |  |  |  |
| `far-symposium-reverse-whirl` | A | Far Symposium Reverse Whirl | stanford | 1 |  |  |  |
| `far-triple-over-down` | A | Far Triple Over Down | footbagmoves | 1 |  |  |  |
| `far-whirling-bent-symposium-swirling-osis` | A | Far Whirling Bent Symposium Swirling Osis | footbagmoves | 1 |  |  |  |
| `flailing-far-butterfly` | A | Flailing far Butterfly | passback | 1 |  |  |  |
| `flailing-far-symp-mirage` | A | Flailing far Symp. Mirage | passback | 1 |  |  |  |
| `flailing-ss-symposium-double-legover` | A | Flailing ss Symposium Double Legover | footbagmoves | 1 |  |  |  |
| `flailing-ss-symposium-double-over-down` | A | Flailing ss Symposium Double Over Down | footbagmoves | 1 |  |  |  |
| `flailing-ss-symposium-mirage` | A | Flailing ss Symposium Mirage | footbagmoves | 1 |  |  |  |
| `flailing-ss-symposium-mirage-stampede` | A | Flailing ss Symposium Mirage (Stampede) | stanford | 1 |  |  |  |
| `flailing-ss-symposium-reverse-whirl-gromitron` | A | Flailing ss Symposium Reverse Whirl (Gromitron) | stanford | 1 |  |  |  |
| `flailing-ss-symposium-whirl` | A | Flailing ss Symposium Whirl | stanford | 1 |  |  |  |
| `frantic-far-double-down-swirl` | A | Frantic far Double Down Swirl | passback | 1 |  |  |  |
| `frantic-op-butterfly` | A | Frantic op Butterfly | passback | 1 |  |  |  |
| `frantic-ss-butterfly` | A | Frantic ss Butterfly | stanford | 1 |  |  |  |
| `frantic-ss-illusion` | A | Frantic ss Illusion | stanford | 1 |  |  |  |
| `frantic-ss-mirage` | A | Frantic ss Mirage | stanford | 1 |  |  |  |
| `fusing-ss-illusion` | A | Fusing ss Illusion | stanford | 1 |  |  |  |
| `fusing-ss-mirage` | A | Fusing ss Mirage | stanford | 1 |  |  |  |
| `illusioning-far-clipper` | A | Illusioning far Clipper | passback | 1 |  |  |  |
| `illusioning-far-osis` | A | Illusioning far Osis | passback | 1 |  |  |  |
| `illusioning-far-symp-butterfly` | A | Illusioning far Symp. Butterfly | passback | 1 |  |  |  |
| `jolimont-ss-mirage` | A | Jolimont ss Mirage | footbagmoves | 1 |  |  |  |
| `leaning-ss-mirage` | A | Leaning ss Mirage | footbagmoves | 1 |  |  |  |
| `midtime-toe-near-illusion` | A | Midtime Toe near Illusion | passback | 1 |  |  |  |
| `midtime-toe-near-mirage` | A | Midtime Toe near Mirage | passback | 1 |  |  |  |
| `miraging-far-clipper` | A | Miraging far Clipper | passback | 1 |  |  |  |
| `miraging-far-legover` | A | Miraging far Legover | passback | 1 |  |  |  |
| `miraging-far-osis` | A | Miraging far Osis | passback | 1 |  |  |  |
| `miraging-far-symp-butterfly` | A | Miraging far Symp. Butterfly | passback | 1 |  |  |  |
| `miraging-far-symp-double-down` | A | Miraging far Symp. Double Down | passback | 1 |  |  |  |
| `miraging-far-symp-whirl` | A | Miraging far Symp. Whirl | passback | 1 |  |  |  |
| `miraging-pincher-stepping-op-squeeze` | A | Miraging Pincher (Stepping op Squeeze) | fborg | 1 |  |  |  |
| `nuclear-far-butterfly` | A | Nuclear far Butterfly | passback | 1 |  |  |  |
| `nuclear-far-double-down` | A | Nuclear far Double Down | passback | 1 |  |  |  |
| `nuclear-far-mirage` | A | Nuclear far Mirage | passback | 1 |  |  |  |
| `nuclear-near-butterfly` | A | Nuclear near Butterfly | passback | 1 |  |  |  |
| `nuclear-ss-butterfly` | A | Nuclear ss Butterfly | footbagmoves | 1 |  |  |  |
| `nuclear-ss-butterfly-barfry` | A | Nuclear ss Butterfly (Barfry) | stanford | 1 |  |  |  |
| `nuclear-ss-dyno` | A | Nuclear ss Dyno | footbagmoves | 1 |  |  |  |
| `nuclear-ss-dyno-godzilla` | A | Nuclear ss Dyno (Godzilla) | stanford | 1 |  |  |  |
| `nuclear-ss-guay` | A | Nuclear ss Guay | stanford | 1 |  |  |  |
| `nuclear-ss-illusion` | A | Nuclear ss Illusion | stanford | 1 |  |  |  |
| `nuclear-ss-legover` | A | Nuclear ss Legover | stanford | 1 |  |  |  |
| `nuclear-ss-mirage` | A | Nuclear ss Mirage | stanford | 1 |  |  |  |
| `nuclear-ss-pickup` | A | Nuclear ss Pickup | stanford | 1 |  |  |  |
| `nuclear-ss-reverse-guay` | A | Nuclear ss Reverse Guay | stanford | 1 |  |  |  |
| `nuclear-ss-reverse-whirl` | A | Nuclear ss Reverse Whirl | stanford | 1 |  |  |  |
| `nuclear-ss-whirl` | A | Nuclear ss Whirl | footbagmoves | 1 |  |  |  |
| `nuclear-ss-whirl-hurl` | A | Nuclear ss Whirl (Hurl) | stanford | 1 |  |  |  |
| `phasing-near-swirl` | A | Phasing near Swirl | passback | 1 |  |  |  |
| `phasing-ss-dyno` | A | Phasing ss Dyno | footbagmoves | 1 |  |  |  |
| `phasing-ss-mirage` | A | Phasing ss Mirage | footbagmoves | 1 |  |  |  |
| `phasing-ss-swirl` | A | Phasing ss Swirl | footbagmoves | 1 |  |  |  |
| `phasing-ss-swirl-frankenstein` | A | Phasing ss Swirl (Frankenstein) | stanford | 1 |  |  |  |
| `pixie-diving-near-butterfly` | A | Pixie Diving near Butterfly | passback | 1 |  |  |  |
| `pixie-double-pickup` | A | Pixie Double Pickup (ss) | passback | 1 | Y |  |  |
| `pixie-ducking-far-dlo` | A | Pixie Ducking far DLO | passback | 1 |  |  |  |
| `pixie-ducking-far-mirage` | A | Pixie Ducking far Mirage | passback | 1 |  |  |  |
| `pixie-far-butterfly` | A | Pixie far Butterfly | passback | 1 |  |  |  |
| `pixie-far-dlo` | A | Pixie far DLO | passback | 1 |  |  |  |
| `pixie-far-double-down` | A | Pixie far Double Down | passback | 1 |  |  |  |
| `pixie-far-drifter` | A | Pixie far Drifter | passback | 1 |  |  |  |
| `pixie-far-eggbeater` | A | Pixie far Eggbeater | passback | 1 |  |  |  |
| `pixie-far-legover` | A | Pixie far Legover | passback | 1 |  |  |  |
| `pixie-far-pickup` | A | Pixie far Pickup | passback | 1 |  |  |  |
| `pixie-far-symp-eggbeater` | A | Pixie far Symp. Eggbeater | passback | 1 |  |  |  |
| `pixie-mirage` | A | Pixie Mirage (same side) | footbagmoves | 1 |  | Y |  |
| `pixie-near-butterfly` | A | Pixie near Butterfly | passback | 1 |  |  |  |
| `pixie-near-double-down` | A | Pixie near Double Down | passback | 1 |  |  |  |
| `pixie-near-drifter` | A | Pixie near Drifter | passback | 1 |  |  |  |
| `pixie-near-legover` | A | Pixie near Legover | passback | 1 |  |  |  |
| `pixie-op-toe-toe-ss-mirage` | A | Pixie op Toe / Toe ss Mirage | passback | 1 |  |  |  |
| `pixie-same-side-illusion` | A | Pixie Same Side Illusion | fborg | 1 |  |  |  |
| `pixie-ss-barrage` | A | Pixie ss Barrage | stanford | 1 |  |  |  |
| `pixie-ss-blender` | A | Pixie ss Blender | stanford | 1 |  |  |  |
| `pixie-ss-butterfly-swirl-park-walk-swirl` | A | Pixie ss Butterfly Swirl (Park Walk Swirl) | stanford | 1 |  |  |  |
| `pixie-ss-clipper` | A | Pixie ss Clipper | stanford | 1 |  |  |  |
| `pixie-ss-da-da-curve` | A | Pixie ss Da Da Curve | stanford | 1 |  |  |  |
| `pixie-ss-dlo` | A | Pixie ss DLO | stanford | 1 |  |  |  |
| `pixie-ss-double-over-down` | A | Pixie ss Double Over Down | footbagmoves | 1 |  |  |  |
| `pixie-ss-double-switchover` | A | Pixie ss Double Switchover | stanford | 1 |  |  |  |
| `pixie-ss-drifter` | A | Pixie ss Drifter | footbagmoves | 1 |  |  |  |
| `pixie-ss-drifter-catacomb` | A | Pixie ss Drifter (Catacomb) | stanford | 1 |  |  |  |
| `pixie-ss-dyno` | A | Pixie ss Dyno | footbagmoves | 1 |  |  |  |
| `pixie-ss-dyno-majello` | A | Pixie ss Dyno (Majello) | stanford | 1 |  |  |  |
| `pixie-ss-eggbeater` | A | Pixie ss Eggbeater | stanford | 1 |  |  |  |
| `pixie-ss-flail` | A | Pixie ss Flail | stanford | 1 |  |  |  |
| `pixie-ss-grifter` | A | Pixie ss Grifter | stanford | 1 |  |  |  |
| `pixie-ss-guay` | A | Pixie ss Guay | stanford | 1 |  |  |  |
| `pixie-ss-illusion` | A | Pixie ss Illusion | stanford | 1 |  |  |  |
| `pixie-ss-legover-magellan` | A | Pixie ss Legover (Magellan) | stanford | 1 |  |  |  |
| `pixie-ss-mirage` | A | Pixie ss Mirage | passback | 1 |  |  |  |
| `pixie-ss-original-tap` | A | Pixie ss Original Tap | footbagmoves | 1 |  |  |  |
| `pixie-ss-osis` | A | Pixie ss Osis | footbagmoves | 1 |  |  |  |
| `pixie-ss-osis-maverick` | A | Pixie ss Osis (Maverick) | stanford | 1 |  |  |  |
| `pixie-ss-pickup` | A | Pixie ss Pickup | passback | 1 |  |  |  |
| `pixie-ss-reverse-guay` | A | Pixie ss Reverse Guay | stanford | 1 |  |  |  |
| `pixie-ss-reverse-swirl` | A | Pixie ss Reverse Swirl | stanford | 1 |  |  |  |
| `pixie-ss-reverse-whirl` | A | Pixie ss Reverse Whirl | stanford | 1 |  |  |  |
| `pixie-ss-swirl` | A | Pixie ss Swirl | stanford | 1 |  |  |  |
| `pixie-ss-symposium-eggbeater` | A | Pixie ss Symposium Eggbeater | stanford | 1 |  |  |  |
| `pixie-ss-symposium-mirage` | A | Pixie ss Symposium Mirage | stanford | 1 |  |  |  |
| `pixie-ss-symposium-reverse-whirl` | A | Pixie ss Symposium Reverse Whirl | stanford | 1 |  |  |  |
| `pixie-ss-symposium-reverse-whirling-xbd-rake` | A | Pixie ss Symposium Reverse Whirling XBD Rake | stanford | 1 |  |  |  |
| `pixie-ss-torque` | A | Pixie ss Torque | stanford | 1 |  |  |  |
| `pixie-ss-whirl` | A | Pixie ss Whirl | stanford | 1 |  |  |  |
| `pixie-ss-xbd-rake` | A | Pixie ss XBD Rake | stanford | 1 |  |  |  |
| `plo-pixie-legover-toe-ss-dlo` | A | PLO (Pixie Legover) / Toe ss DLO | passback | 1 |  |  |  |
| `pogo-far-mirage` | A | Pogo far Mirage | passback | 1 |  |  |  |
| `pogo-nuclear-far-double-down` | A | Pogo Nuclear far Double Down | passback | 1 |  |  |  |
| `pogo-paradox-blender-pogo-op-blender` | A | Pogo Paradox Blender (Pogo Op Blender) | fborg | 1 |  |  |  |
| `pogo-paradox-da-da-curve-pogo-op-da-da-curve` | A | Pogo Paradox Da Da Curve (Pogo Op Da Da Curve) | fborg | 1 |  |  |  |
| `pogo-paradox-torque-pogo-op-torque` | A | Pogo Paradox Torque (Pogo Op Torque) | fborg | 1 |  |  |  |
| `pogo-paradox-whirling-swirl-pogo-op-whirling-swirl` | A | Pogo Paradox Whirling Swirl (Pogo Op Whirling Swirl) | fborg | 1 |  |  |  |
| `pogo-ss-clipper` | A | Pogo ss Clipper | stanford | 1 |  |  |  |
| `pogo-ss-flail` | A | Pogo ss Flail | stanford | 1 |  |  |  |
| `pogo-ss-illusion` | A | Pogo ss Illusion | stanford | 1 |  |  |  |
| `pogo-ss-legover` | A | Pogo ss Legover | stanford | 1 |  |  |  |
| `pogo-ss-mirage` | A | Pogo ss Mirage | stanford | 1 |  |  |  |
| `pogo-ss-pickup` | A | Pogo ss Pickup | stanford | 1 |  |  |  |
| `pogo-ss-symposium-mirage` | A | Pogo ss Symposium Mirage | stanford | 1 |  |  |  |
| `quantum-far-butterfly` | A | Quantum far Butterfly | passback | 1 |  |  |  |
| `quantum-far-double-down` | A | Quantum far Double Down | passback | 1 |  |  |  |
| `quantum-far-mirage` | A | Quantum far Mirage | passback | 1 |  |  |  |
| `quantum-far-torque` | A | Quantum far Torque | passback | 1 |  |  |  |
| `quantum-near-butterfly` | A | Quantum near Butterfly | passback | 1 |  |  |  |
| `railing-ss-butterfly` | A | Railing ss Butterfly | footbagmoves | 1 |  |  |  |
| `railing-ss-double-legover` | A | Railing ss Double Legover | footbagmoves | 1 |  |  |  |
| `sailing-ss-butterfly` | A | Sailing ss Butterfly | footbagmoves | 1 |  |  |  |
| `sailing-ss-butterfly-sail-down` | A | Sailing ss Butterfly (Sail Down) | stanford | 1 |  |  |  |
| `sailing-ss-dlo-fracture` | A | Sailing ss DLO (Fracture) | stanford | 1 |  |  |  |
| `sailing-ss-double-legover` | A | Sailing ss Double Legover | footbagmoves | 1 |  |  |  |
| `sailing-ss-illusion` | A | Sailing ss Illusion | stanford | 1 |  |  |  |
| `sailing-ss-legover` | A | Sailing ss Legover | stanford | 1 |  |  |  |
| `sailing-ss-mirage` | A | Sailing ss Mirage | stanford | 1 |  |  |  |
| `sailing-ss-pickup` | A | Sailing ss Pickup | stanford | 1 |  |  |  |
| `shooting-far-double-down` | A | Shooting far Double Down | passback | 1 |  |  |  |
| `shooting-ss-clipper` | A | Shooting ss Clipper | stanford | 1 |  |  |  |
| `shooting-ss-illusion` | A | Shooting ss Illusion | stanford | 1 |  |  |  |
| `shooting-ss-legover` | A | Shooting ss Legover | stanford | 1 |  |  |  |
| `shooting-ss-mirage` | A | Shooting ss Mirage | stanford | 1 |  |  |  |
| `shooting-ss-pickup` | A | Shooting ss Pickup | stanford | 1 |  |  |  |
| `slaying-ss-flail` | A | Slaying ss Flail | stanford | 1 |  |  |  |
| `slaying-ss-symposium-mirage` | A | Slaying ss Symposium Mirage | stanford | 1 |  |  |  |
| `slicing-far-butterfly` | A | Slicing far Butterfly | passback | 1 |  |  |  |
| `smear-fairy-ss-legover-pickup` | A | Smear>Fairy ss [Legover/Pickup] | passback | 1 |  |  |  |
| `smiling-far-butterfly` | A | Smiling Far Butterfly | footbagmoves | 1 |  |  |  |
| `spinning-diving-near-symp-whirl` | A | Spinning Diving near Symp. Whirl | passback | 1 |  |  |  |
| `spinning-ducking-far-blender` | A | Spinning Ducking far Blender | passback | 1 |  |  |  |
| `spinning-ducking-far-drifter` | A | Spinning Ducking far Drifter | passback | 1 |  |  |  |
| `spinning-ducking-far-symp-torque` | A | Spinning Ducking far Symp.Torque | passback | 1 |  |  |  |
| `spinning-ducking-far-symp-whirl` | A | Spinning Ducking far Symp. Whirl | passback | 1 |  |  |  |
| `spinning-ducking-far-whirl` | A | Spinning Ducking far Whirl | passback | 1 |  |  |  |
| `spinning-far-blender` | A | Spinning far Blender | passback | 1 |  |  |  |
| `spinning-far-double-down` | A | Spinning far Double Down | passback | 1 |  |  |  |
| `spinning-far-drifter` | A | Spinning far Drifter | passback | 1 |  |  |  |
| `spinning-far-miraging-symp-miraging-refraction` | A | Spinning far Miraging Symp. Miraging Refraction | passback | 1 |  |  |  |
| `spinning-far-miraging-symp-torque` | A | Spinning far Miraging Symp. Torque | passback | 1 |  |  |  |
| `spinning-far-motion` | A | Spinning far Motion | passback | 1 |  |  |  |
| `spinning-far-symp-torque` | A | Spinning far Symp. Torque | passback | 1 |  |  |  |
| `spinning-far-symp-whirl` | A | Spinning far Symp. Whirl | passback | 1 |  |  |  |
| `spinning-far-symp-whirling-swirl` | A | Spinning far Symp. Whirling Swirl | passback | 1 |  |  |  |
| `spinning-near-double-down` | A | Spinning near Double Down | passback | 1 |  |  |  |
| `spinning-near-drifter` | A | Spinning near Drifter | passback | 1 |  |  |  |
| `spinning-near-eggbeater` | A | Spinning near Eggbeater | passback | 1 |  |  |  |
| `spinning-near-symp-flux` | A | Spinning near Symp. Flux | passback | 1 |  |  |  |
| `spinning-near-symp-torque` | A | Spinning near Symp. Torque | passback | 1 |  |  |  |
| `splicing-ss-blender-liquifier` | A | Splicing ss Blender (Liquifier) | stanford | 1 |  |  |  |
| `stepping-blender` | A | Stepping Blender (same side) | footbagmoves | 1 |  | Y |  |
| `stepping-butterfly-same-side` | A | Stepping Butterfly (same side) | footbagmoves | 1 |  |  |  |
| `stepping-clipper` | A | Stepping Clipper (same side) | footbagmoves,passback | 2 |  | Y |  |
| `stepping-diving-ss-butterfly` | A | Stepping Diving ss Butterfly | passback | 1 |  |  |  |
| `stepping-ducking-far-butterfly` | A | Stepping Ducking Far Butterfly | footbagmoves | 1 |  |  |  |
| `stepping-ducking-far-butterfly-swirl` | A | Stepping Ducking Far Butterfly Swirl | footbagmoves | 1 |  |  |  |
| `stepping-ducking-far-double-down` | A | Stepping Ducking far Double Down | passback | 1 |  |  |  |
| `stepping-ducking-far-double-over-down` | A | Stepping Ducking Far Double Over Down | footbagmoves | 1 |  |  |  |
| `stepping-ducking-far-double-pickup` | A | Stepping Ducking Far Double Pickup | footbagmoves | 1 |  |  |  |
| `stepping-ducking-far-drifter` | A | Stepping Ducking far Drifter | passback | 1 |  |  |  |
| `stepping-ducking-far-grifter` | A | Stepping Ducking far Grifter | passback | 1 |  |  |  |
| `stepping-ducking-far-motion` | A | Stepping Ducking Far Motion | footbagmoves | 1 |  |  |  |
| `stepping-ducking-far-swivel` | A | Stepping Ducking far Swivel | passback | 1 |  |  |  |
| `stepping-ducking-far-symp-eggbeater` | A | Stepping Ducking far Symp. Eggbeater | passback | 1 |  |  |  |
| `stepping-far-barrage` | A | Stepping far Barrage | passback | 1 |  |  |  |
| `stepping-far-blender` | A | Stepping far Blender | passback | 1 |  |  |  |
| `stepping-far-butterfly` | A | Stepping Far Butterfly | footbagmoves,passback | 2 |  |  |  |
| `stepping-far-butterfly-swirl` | A | Stepping Far Butterfly Swirl | footbagmoves,passback | 2 |  |  |  |
| `stepping-far-clipper` | A | Stepping far Clipper | footbagmoves | 1 |  |  |  |
| `stepping-far-dlo` | A | Stepping far DLO | passback | 1 |  |  |  |
| `stepping-far-double-down` | A | Stepping far Double Down | passback | 1 |  |  |  |
| `stepping-far-dyno` | A | Stepping Far Dyno | footbagmoves,passback | 2 |  |  |  |
| `stepping-far-eggbeater` | A | Stepping far Eggbeater | passback | 1 |  |  |  |
| `stepping-far-illusion` | A | Stepping far Illusion | passback | 1 |  |  |  |
| `stepping-far-mirage` | A | Stepping far Mirage | passback | 1 |  |  |  |
| `stepping-far-motion` | A | Stepping Far Motion | footbagmoves,passback | 2 |  |  |  |
| `stepping-far-swirl` | A | Stepping far Swirl | passback | 1 |  |  |  |
| `stepping-far-symp-double-down` | A | Stepping far Symp. Double Down | passback | 1 |  |  |  |
| `stepping-far-symp-whirl` | A | Stepping far Symp. Whirl | passback | 1 |  |  |  |
| `stepping-mirage` | A | Stepping Mirage (same side) | footbagmoves | 1 |  | Y |  |
| `stepping-near-butterfly` | A | Stepping near Butterfly | passback | 1 |  |  |  |
| `stepping-near-butterfly-swirl` | A | Stepping near Butterfly Swirl | passback | 1 |  |  |  |
| `stepping-near-double-down` | A | Stepping near Double Down | passback | 1 |  |  |  |
| `stepping-near-drifter` | A | Stepping near Drifter | passback | 1 |  |  |  |
| `stepping-near-legover` | A | Stepping near Legover | passback | 1 |  |  |  |
| `stepping-near-torque` | A | Stepping near Torque | passback | 1 |  |  |  |
| `surfing-ss-pickup` | A | Surfing ss Pickup | stanford | 1 |  |  |  |
| `surfing-ss-swivel-serval` | A | Surfing ss Swivel (Serval) | stanford | 1 |  |  |  |
| `surging-ducking-far-blender` | A | Surging Ducking far Blender | passback | 1 |  |  |  |
| `surging-far-double-down` | A | Surging far Double Down | passback | 1 |  |  |  |
| `surging-far-mirage` | A | Surging far Mirage | passback | 1 |  |  |  |
| `surging-far-whirl` | A | Surging far Whirl | passback | 1 |  |  |  |
| `surging-ss-osis` | A | Surging ss Osis | footbagmoves | 1 |  |  |  |
| `surging-ss-osis-nobius` | A | Surging ss Osis (Nobius) | stanford | 1 |  |  |  |
| `swirling-near-swirl` | A | Swirling near Swirl | passback | 1 |  |  |  |
| `swirling-ss-mirage` | A | Swirling ss Mirage | stanford | 1 |  |  |  |
| `symp-atomic-far-butterfly` | A | Symp. Atomic far Butterfly | passback | 1 |  |  |  |
| `symp-illusion-same-side` | A | Symp Illusion (same side) | footbagmoves | 1 |  | Y |  |
| `symp-mirage-same-side` | A | Symp Mirage (same side) | footbagmoves | 1 |  | Y |  |
| `symp-miraging-far-mirage` | A | Symp. Miraging far Mirage | passback | 1 |  |  |  |
| `symp-swirl` | A | Symp Swirl (op) | passback | 1 |  |  |  |
| `symp-whirl-same-side` | A | Symp Whirl (same side) | footbagmoves | 1 |  | Y |  |
| `symp-whirling-far-mirage` | A | Symp. Whirling far Mirage | passback | 1 |  |  |  |
| `symple-butterfly-same-side` | A | Symple Butterfly (same side) | footbagmoves | 1 |  | Y |  |
| `symple-reverse-swirl` | A | Symple Reverse Swirl (far) | footbagmoves | 1 |  | Y |  |
| `symple-reverse-swirl-same-side` | A | Symple Reverse Swirl (same side) | footbagmoves | 1 |  | Y |  |
| `symple-swirl` | A | Symple Swirl (far) | footbagmoves | 1 |  | Y |  |
| `symple-swirl-same-side` | A | Symple Swirl (same side) | footbagmoves | 1 |  | Y |  |
| `terraging-near-clipper` | A | Terraging near Clipper | passback | 1 |  |  |  |
| `terraging-opposite-clipper` | A | Terraging Opposite Clipper | fborg | 1 |  |  |  |
| `terraging-ss-clipper-terawhirl` | A | Terraging ss Clipper (Terawhirl) | stanford | 1 |  |  |  |
| `terraging-ss-illusion` | A | Terraging ss Illusion | stanford | 1 |  |  |  |
| `terraging-ss-legover` | A | Terraging ss Legover | stanford | 1 |  |  |  |
| `terraging-ss-mirage` | A | Terraging ss Mirage | stanford | 1 |  |  |  |
| `toe-far-double-down` | A | Toe far Double Down | passback | 1 |  |  |  |
| `toe-far-symp-double-down` | A | Toe far Symp. Double Down | passback | 1 |  |  |  |
| `toe-midtime-near-whirr` | A | Toe midtime near Whirr | passback | 1 |  |  |  |
| `toe-near-double-down` | A | Toe near Double Down | passback | 1 |  |  |  |
| `toe-near-flurry` | A | Toe near Flurry | passback | 1 |  |  |  |
| `toe-near-symp-double-down` | A | Toe near Symp. Double Down | passback | 1 |  |  |  |
| `toe-near-triage` | A | Toe near Triage | passback | 1 |  |  |  |
| `toe-set-ss-triple-over-down` | A | Toe set ss Triple Over Down | footbagmoves | 1 |  |  |  |
| `toe-spinning-near-torque` | A | Toe Spinning near Torque | passback | 1 |  |  |  |
| `toe-ss-symp-swirl` | A | Toe ss Symp Swirl | passback | 1 |  |  |  |
| `twinspinning-ss-mirage` | A | Twinspinning ss Mirage | footbagmoves | 1 |  |  |  |
| `twisting-near-osis` | A | Twisting near Osis | passback | 1 |  |  |  |
| `twisting-near-pickup` | A | Twisting near Pickup | passback | 1 |  |  |  |
| `twisting-near-toe` | A | Twisting near Toe | passback | 1 |  |  |  |
| `whirling-far-butterfly` | A | Whirling far Butterfly | footbagmoves | 1 |  |  |  |
| `whirling-far-mirage` | A | Whirling far Mirage | passback | 1 |  |  |  |
| `whirling-far-whirl` | A | Whirling far Whirl | passback | 1 |  |  |  |
| `whirling-near-whip` | A | Whirling near Whip | passback | 1 |  |  |  |
| `whirling-ss-mirage` | A | Whirling ss Mirage | stanford | 1 |  |  |  |
| `whirling-ss-pickup` | A | Whirling ss Pickup | stanford | 1 |  |  |  |
| `wonton-ss-symposium-mirage` | A | Wonton ss Symposium Mirage | stanford | 1 |  |  |  |
| `zipper-stepping-op-butterfly-zipper` | A | Zipper Stepping Op Butterfly Zipper | footbagmoves | 1 |  |  |  |
| `zulu-far-clipper-red-ribbon` | A | Zulu Far Clipper (Red Ribbon) | stanford | 1 |  |  |  |
| `zulu-far-legover` | A | Zulu Far Legover | stanford | 1 |  |  |  |
| `zulu-far-pickup` | A | Zulu Far Pickup | stanford | 1 |  |  |  |
| `atomic-legover` | B | Atomic Legover (same side) | footbagmoves | 1 |  | Y |  |
| `atomic-pickup` | B | Atomic Pickup (same side) | footbagmoves,passback | 2 |  | Y |  |
| `double-switchover` | B | Double Switchover (far) | footbagmoves | 1 |  |  |  |
| `flailing-ss-symposium-eggbeater` | B | Flailing ss Symposium Eggbeater | footbagmoves | 1 |  |  |  |
| `grifter-same-side` | B | Grifter (same side) | footbagmoves | 1 |  | Y |  |
| `inspinning-same-side-butterfly` | B | Inspinning Same Side Butterfly | fborg | 1 |  |  |  |
| `splicing-ss-blender` | B | Splicing ss Blender | footbagmoves | 1 |  |  |  |
| `stepping-illusion` | B | Stepping Illusion (same side) | footbagmoves | 1 |  | Y |  |
| `stepping-legover` | B | Stepping Legover (same side) | footbagmoves | 1 |  | Y |  |
| `stepping-opposite-reaper` | B | Stepping Opposite Reaper | fborg | 1 |  |  |  |
| `stepping-opposite-side-reverse-whirl` | B | Stepping Opposite Side Reverse Whirl | fborg | 1 |  |  |  |
| `surfing-ss-blender` | B | Surfing ss Blender | footbagmoves | 1 |  |  |  |
| `toe-near-barrage` | B | Toe near Barrage | passback | 1 |  |  |  |
| `inspinning-same-side-illusion` | D | Inspinning Same Side Illusion | fborg | 1 |  |  |  |
| `inspinning-same-side-mirage` | D | Inspinning Same Side Mirage | fborg | 1 |  |  |  |
