# Freestyle Dictionary -- Open Questions

Scope: outstanding questions and current state for the freestyle trick dictionary, alias system, and curated media after the expert reviewer's pt4 reply (2026-05-02) and the alias-policy cleanup. Companion to `red-corrections-pt1.txt` ... `pt4.txt` and to `red_corrections_consolidated.csv`. AI-facing.

## 1. Expert pt4 integrated

| Slug / item | State |
|---|---|
| barrage | adds=3, expert_reviewed, active |
| merkon | adds=3, expert_reviewed, active |
| terrage | adds=4, expert_reviewed, active (terraging modifier row still pending) |
| ripstein | adds=4, expert_reviewed, active (base trick still unspecified) |
| fury | adds=5, expert_reviewed, active (corrected from 4) |
| atom-smasher | adds=4, locked (X-Dex contributes the +1) |
| flurry | adds=4, locked (3 dexes + 1 stall) |
| double-leg-over | adds=3, curated, active. Canonical: "Double Leg Over". Aliases: dlo, miraging legover |
| sumo | adds=5, base=mirage, modifier_links=nuclear, expert_reviewed, active. Resolved Red pt9 2026-05-09 (Nuclear Mirage via X-Dex escalation on the Mirage; see §1B). Alias: nuclear mirage |
| baroque | alias on `barraging-osis` (canonical) |
| silo | alias on `atomic-torque` (canonical) |
| barroque | typo absorbed via alias to `barraging-osis` |
| X-Dex | only fires in specific named tricks (atom-smasher); not a broad modifier |
| illusioning legover | alias rejected (expert pt2: eggbeater = atomic legover, not illusioning) |
| atomsmasher (no hyphen) | media link renamed to canonical `atom-smasher` |

## 1B. Post-pt9 resolutions integrated (2026-05-09)

| Slug / item | State |
|---|---|
| sumo | adds=5, base=mirage, modifier_links=nuclear, expert_reviewed, active. Red pt9: "Nuclear Mirage = Sumo. Sumo gets an X dex ADD on the Mirage, making it a 5 ADD move." Alias: nuclear mirage. |
| shooting | rotational caveat resolved. Red pt9 confirms +3 holds on rotational tricks (Yes to "Does Shooting stay +3 on rotational tricks too?"). trick_modifiers values (3,3,set) unchanged. |
| nuclear | RESOLVED by pt10 (2026-05-10): generic Nuclear modifier value confirmed +2 (Yes to "Should Nuclear itself still be treated as a flat +2 set modifier generally?"). Structural definition volunteered: "Nuclear is a Paradox Atomic set" (= Paradox(+1) + Atomic(+1) = +2). trick_modifiers.csv nuclear (+2,+2) Uncertain caveat retired. Sumo (Nuclear Mirage=5) X-Dex construction-specific escalation per pt9 still applies; not subsumed by the generic rule. |
| backside | new row in trick_modifiers: backside,1,1,body. Red pt9 promotes from pending (modifier vs naming-adjective) to confirmed +1 body modifier. The "Stepping Paradox Symposium Mirage" expansion is explanatory decomposition for the "Backside Blur" compound, NOT additive +3 (James adjudication 2026-05-09). |
| sailing | new row in red_additions: sailing,2,sailing,set, expert_reviewed, active. Red pt9: "Sailing as a set is 2 ADDS. It is Pixie Quantum set." Set-as-modifier behavior NOT yet classified (Red's wording was set-only). |
| blistering | NOT resolved by pt9 (Red grouped with sailing but answered only for sailing). Promoted to lone pt9-pending item — see §2 HIGH. |

Audit log: `red_corrections_pt9.csv`. Strong recommendation per James 2026-05-09: pt9 wave is ontology enrichment; do NOT rebuild parser logic, alter policy-dependent machinery, or change rotational escalation weights yet.

## 1C. Post-pt10 resolutions integrated (2026-05-10)

| Slug / item | State |
|---|---|
| quantum | RESOLVED. Red pt10 confirms Quantum is +1 generically. trick_modifiers.csv quantum (1,1,set) values unchanged; uncertainty caveat note retired. Existing examples re-validated: Quantum Mirage=3, Quantum Butterfly=4. Sailing pt9 cross-reference holds (Pixie Quantum set = 1+1 = 2). |
| nuclear | RESOLVED. Red pt10 confirms Nuclear is +2 generically + volunteers structural definition "Nuclear is a Paradox Atomic set". trick_modifiers.csv nuclear (2,2,set) values unchanged; uncertainty caveat note retired. Sumo X-Dex construction (pt9) preserved as the named exception. |
| rotational_escalation | RESOLVED. Red pt10 example "Spinning Symposium Whirl = Whirl(3) + Spinning(1) + Symposium(1) = 5" + James adjudication 2026-05-10 ("Whirl's 3 ADD already includes the delay/stall component; do not count a separate stall ADD") finalize the rule: Spinning / Whirling / Swirling stay flat +1 even on rotational bases. trick_modifiers.csv migration applied: spinning add_bonus_rotational 2→1, swirling add_bonus_rotational 2→1 (whirling already 1,1). parse_freestyle_notation.py rotational_escalation_policy_pending_red warning retired. Spinning Whirl ADD shifts 5→4 (and parallel for spinning-rotational + swirling-rotational compounds). |
| candidate-core families (blur, blender, barfly, ripwalk, stepping_*) | RESOLVED at the disposition level. Red pt10 'b' to all five — each is a named compound built from another base, NOT a true base family. Per James adjudication 2026-05-10: blur decomposition is Stepping Paradox Mirage (= +1+1+2 = 4 ADD), superseding the candidate yaml's provisional 'quantum mirage' reading_b. Barfly operational decomposition approved (specifics carried into planning/audit artifacts). candidate_core_families.yaml dispositions updated (blur/blender/barfly/ripwalk → answered_b; stepping_star → answered_a). Data-side migrations (dictionary row removal + alias on resolved base) deferred to S5 staged commits. |

Audit log: `red_corrections_pt10.csv`. James adjudication 2026-05-10 confirms it is now safe to apply modifier-value migration + parser-warning retirement (S3 + S4 from the pt10 plan).

## 2. Remaining dictionary questions

### HIGH (blocks correctness)

- `royale` ADD value. Expert pt4: "?" (will look into). Currently pending, not active.
- Eggbeater construction. Expert pt2 says "Eggbeater = Atomic Legover". Current canonical row description says "Illusion-modified legover". Either the description is wrong, or "atomic" and "illusioning" are interchangeable in the legover branch. Needs expert confirmation.
- `flail` and `omelette` canonical mappings. Expert pt1 said both "should be added". footbag.org suggests Symposium Illusion (flail) and Atomic Illusion (omelette). Expert pt4 silent. Re-ask.
- Blistering existence + ADD value. Red pt9 2026-05-09 silently skipped this when answering Sailing in same question batch ("Sailing and Blistering: real freestyle modifiers in actual usage / historical terms only / or effectively nonexistent?"). Sailing resolved as 2-ADD set primitive (Pixie Quantum equivalence); Blistering remains unresolved. Re-ask in next expert-review packet.

### MED (improves system)

- Inspinning family activation. Expert pt3 confirmed Inspinning is distinct from Spinning (clipper-set spin direction). All `inspinning-*` rows in dictionary are pending; need ADD values to activate.
- `pendulum` (TT #25), `dragonfly` (TT #21), `da-da-curve` (TT #40 Dada Curve) activation. All currently pending. Slug `da-da-curve` may need rename to `dada-curve` to match expert pt4 / TT title spelling.
- Missing surface-delay slugs: `inside-stall`, `clipper-stall`, `knee-stall`. Held media rows reference these (TT #3, TT #18, TT #5). Expert pt1 endorsed surface delays as 1-ADD entries.
- `barroque` (typo) pending row in DB. Currently absorbed via alias; pending row will be wiped on next script-17 reset and skipped on future script-21 runs by the alias.

### LOW (nice-to-have)

- Pogo set handling. Expert pt2: Pogo is a set, no ADD bonus. Many `pogo-*` rows are pending; decide whether to mark non-scoring set entries or leave pending.
- Glossary floor labels: guiltless, tiltless, fearless, tripless, beastly, godly, shoutless. Expert pt4 silent on followup §C. Belongs in glossary layer, not trick dictionary. Re-ask the expert reviewer on which terms are still in active use.
- "Toe" and "outside" inline aliases on `toe-stall` and `outside-stall` rows. Per the alias-policy cleanup (Commit 3), these are borderline conceptual terms mapping to a single trick. Decision pending: demote, remove, or keep.

## 3. Media coverage status

Post-reset state (Commits 1, 2, 3 applied):

| Metric | Count |
|---|---|
| Active tricks | 91 |
| Strong tutorial primary | 12 |
| Weak primary (record clip only) | 32 |
| No primary | 47 |

### Strong primary (12)

toe-stall, heel-stall, outside-stall (Anz' Trikz Basic Stalls); whirl, rev-whirl (Anz Whirl & Whip); swirl (Anz Swirl & Reverse); drifter (Anz Drifter & Grifter); eggbeater (Anz DLO & Eggbeater); pixie, fairy (Anz Pixie & Fairy / Open & Shut); osis (Shred Global, Zac Miley); paradox-mirage (FootbagSpot Level 5 BOPs).

### Top missing-primary targets

illusion, pickup, guay, flying-inside, flying-outside, rev-up, sidewalk, tombstone, vortex, surging, symposium-whirl, hop-over, walk-over, double-spin, double-leg-over, fury, barrage, merkon, terrage, ripstein, atomic, atomic-butterfly, atomic-torque.

### Top weak-primary upgrade targets (record-only primary)

mirage, torque, blender, around-the-world, clipper, legover, butterfly, atom-smasher, paradox-torque, paradox-blender, paradox-symposium-whirl, paradox-drifter, double-around-the-world, eclipse, mobius, smear, food-processor, ripwalk, blurriest, blurry-whirl, ducking-butterfly, ducking-clipper, ducking-osis, spinning-butterfly, spinning-clipper, spinning-osis, spinning-symposium-whirl, spinning-whirl, stepping-osis, superfly, tomahawk, barfly.

## 4. Held media rows / dictionary candidates

Verified YouTube URLs (oembed-confirmed) on hold pending dictionary decisions. Source: WorldFootbag channel (Tricks of the Trade, "tt_youtube").

| Slug (proposed) | TT lesson | YouTube ID | ADD | Hold reason |
|---|---|---|---|---|
| inside-stall | TT #3 Inside Stall | MGZWuP7WlQ0 | 1 | Surface-delay slug not yet in dictionary |
| clipper-stall | TT #18 Clipper Stall (2 add) | FEiAC9wfin8 | 1 | Surface-delay slug not yet in dictionary |
| knee-stall | TT #5 Knee Stall | (URL not surfaced) | 1 | Surface-delay slug not yet in dictionary AND no verified URL |
| dragonfly | TT #21 Dragonfly (2 add) | FK2PLG-rlQ0 | 2 | Trick slug not in dictionary; review pending |
| dada-curve | TT #40 Dada Curve (4 add) | GFUjH3p2l0c | 4 | Slug exists as `da-da-curve` (pending); rename + activate decision pending |
| pendulum | TT #25 Pendulum (2 add) | (URL not surfaced) | 2 | Slug pending; URL still missing |

Also previously-drafted-but-unappended rows from the 2026-05-02 batch (still held; user declined the bulk append): TT #2 Toe Stall, TT #6 Spin (dropped per user), TT #7 Flying Outside, TT #9 Clipper, TT #14 ATW, TT #15 ATW Toe Stall, TT #30 DLO Stall, TT #42 Symposium Whirl; Anz' Trikz Atomic & Quantum, Double Dexes, Flying (Jester); plus the safe existing-asset reuse link `48a1464e... -> double-leg-over (is_primary=0)`.

## 5. Rules now in force

1. **Slug = canonical trick or set name only.** Do not encode mechanics (direction, set type, delay) in slugs.
2. **Direction is structural, not a qualifier.** mirage != illusion, spinning != inspinning, ATW != reverse-ATW. Each gets its own slug.
3. **Recognized named compounds become slugs.** Sumo, Baroque, Silo (and similar) are canonical entries. Their alt-construction names (Nuclear Mirage, Barraging Osis, Atomic Torque) live as aliases or as the aliased canonical, depending on which form the community uses.
4. **Surface delays keep "stall".** toe-stall, heel-stall, outside-stall, inside-stall, clipper-stall, knee-stall. These are 1-ADD canonical rows, not categories.
5. **Categories are not aliases.** "double dex", "dex", and similar tag-shape terms stay out of the alias table.
6. **Instructional phrases are not slugs.** "ATW Toe Stall (2 add)", "Mirage Stall (2 add)", "Clipper Stall (2 add)" map to their base trick or to their surface delay; they do not generate `*-2add` slugs.
7. **Aliases must map to exactly one canonical slug.** Otherwise reject, or store as informal/teaching only (not used for automatic mapping). Ambiguous shorthand (e.g. "open", "shut") is informal; not added until the alias schema supports tiers.
8. **Alias targets must resolve.** A row in `trick_aliases.csv` whose `trick_canon` is not a canonical name in `freestyle_tricks` is logged as unresolved and dropped. Run `script 17` after adding aliases; broken targets surface there.
9. **Pending rows do not surface publicly.** `is_active=0` is enforced by `freestyleTricks.listAll/getBySlug/listByFamily`. Pending rows preserve provenance via `freestyle_trick_source_links`.
10. **Curated media stays separate from member uploads.** `freestyle_media_*` and `media_items` are parallel layers; never merged.
11. **Verify external media URLs before promotion.** Pattern-extrapolation is not verification. Use HTTP fetch (or oembed for YouTube) and capture the verification fact in row notes.
