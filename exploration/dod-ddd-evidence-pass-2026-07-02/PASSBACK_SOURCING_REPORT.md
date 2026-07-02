# PassBack sourcing pass: the 33 NOJOB rows (and 5 ADJ-OTHER rows)

Date: 2026-07-02. Companion to `RED_PACKET_A1_REVISED.md` and `ROW_CLASSIFICATION.md`.
Evidence pass only: nothing promoted, no canonical data changed, no JOBs invented.

## 1. Executive summary

PassBack holds **no JOB notation** for the down family (`asserted_notation` is empty on every
relevant row of `passback_source_links_staging.csv`). It holds something more consequential:
`exploration/passback-intake/passback_trick_sources.csv` (from `passback-dicrionary.txt`, 282
rows) gives each folk-named trick a **compositional technical name**, and those technical names
ARE the frontier row names. The PB rows in the observational universe are not 33 unknown
tricks awaiting JOBs: they are **PassBack technical names that were ingested as if they were
separate tricks**. Each maps back to a folk-named trick, six of them to already-active
canonicals.

Three structural discoveries follow (sections 3-5), one prior classification is overturned
(section 7), and the cluster's remaining doctrine load shrinks to one sharp question: the
clipper-column naming crossing (section 5).

## 2. Evidence inventory

| artifact | down-family payload |
|--|--|
| `passback_trick_sources.csv` | 34 down-family rows: folk name, technical name, uptime/downtime components, dex count |
| `passback_source_links_staging.csv` | no notation for down rows (asserted_notation empty) |
| `passback_playlist_inventory.csv` | video evidence for Spanishfly (R801PtQ-LNs), Dimmiest (a5PkWHdlm8U), Scorpion's Tail (WG4xuuHIdOU), Fusion (ColWUylKEJc) |

## 3. The PassBack technical-name grammar

Technical names compose as `[operators] + [Toe|Clipper] + [near|far] + Double Down`, where:

- **"Double Down" is the generic double-dex motif, not FB.org's DDD.** PassBack's own bare
  row: `Double Down = double-dex Butterfly`. This independently confirms the packet's
  suspicion (old option C) that "down" naming is a folk layer over a motif.
- **near/far selects which leg performs the dexes**: near = first base dex on the same side as
  the previous contact (contact-relative SAME), far = opposite side (OP). Validated against
  every trick holding both a PassBack tech name and an FB.org JOB: **7 of 9 exact matches**
  (DOD, Paradon, Scorpion's Tail, Bullwhip, Blurrier, Fusion, Plasma). The two misses are
  informative, not random: the DDD row itself (section 5) and Torch-R-Rack (multi-operator,
  symposium-fused token; anchor ambiguous; residual).
- **Dex-count arithmetic cross-validates the identities**: PassBack dex count plus non-dex
  brackets equals the platform ADD on all 11 checkable rows (fusion 3+2=5, plasma 3+2=5,
  blurriest 3+2=5, superfly 2+3=5, venom 3+3=6, nemesis 4+2=6, bullwhip 2+3=5, barfly 2+2=4,
  paradon 2+2=4, DOD 2+2=4, DDD 2+2=4).

**Consequence for the prior pass: "far"/"near" in these row names are NOT receiver qualifiers**
(the X-Dex far-receiver sense assumed in `ROW_CLASSIFICATION.md`). They are leg-selection
tokens, and each near/far pair names two different folk tricks, not two variants of one.

## 4. Grand unification: the grid is already folk-named, and half of it is already shipped

PassBack independently populates all four cells of the packet's 2x2 topology grid (F4), with
folk names:

| | near (SAME-leg dexes) | far (OP-leg dexes) |
|--|--|--|
| **Toe entry** | DOD ("Toe near Double Down") | Paradon ("Toe far Double Down") |
| **Clipper entry** | DDD ("Clipper near Double Down") | Barfly ("Clipper far Double Down") |

- **Paradon is already an active canonical** (4 ADD in the platform DB). Cell 3 is shipped.
- **The platform's barfly family IS the clipper-entry column.** Active canonicals blurriest,
  nemesis, venom, and superfly all carry `base_trick = barfly` (4 ADD, base infinity), and
  PassBack decomposes every one of them as a clipper-entry Double Down compound. The "down
  family" and the "barfly family" are the same structure seen from two naming traditions.
  Red's ruling should reconcile DOD / DDD / Paradon / Barfly as the four cells of one grid
  rather than treating DOD/DDD as an isolated pair.

## 5. The clipper-column crossing (SUPERSEDED, same day)

> **This section is superseded by `DOWN_FAMILY_ADVERSARIAL_AUDIT.md` section 3.** The
> crossing was an artifact of assuming near/far is contact-relative; it is bag-relative
> (with spin inversion), and under that decoding the two sources agree everywhere. Section 3
> of this file ("7 of 9") is likewise refined to 13 of 14. Kept for the audit trail.

The two sources disagree about which cell the name "Down Double-Down" occupies:

- FB.org JOB 98 (DDD): first dex OP-side, same-side clipper return. That is the **far** pattern.
- PassBack: DDD = "Clipper **near** Double Down", and **Barfly** = "Clipper far Double Down",
  which is exactly the shape FB.org's JOB 98 describes.

So PassBack's DDD and Barfly are the mirror-swap of FB.org's assignments (or PassBack's DDD
names the leg-mirrored structure). Every other validated pair agrees across sources; this is
the single genuine cross-source structural conflict in the whole cluster. It is decidable by
one video review of a DDD performance or by Red fiat. Also register (do not resolve): the
platform ships barfly at 4 ADD with base infinity; PassBack reads it as a 2-dex clipper
Double Down. Both are 4 total by bracket arithmetic, so scoring again does not move.

## 6. Identity table: all 38 open rows

"Collision" = active canonical row in the platform DB. Classes:
- **ID-CANON**: frontier row is a technical name for an active canonical; reconcile as
  alias/dedup, nothing to promote.
- **ID-JOB**: identity gives the row an FB.org JOB transitively; parity-traceable now.
- **ID-NEW**: identity established to a PassBack folk trick with no canonical row; promotable
  as a normal folk-named trick (dex count + components sourced; JOB still absent).
- **ID-PROB**: probable identity (FM-row wording maps onto a PassBack tech name via os/ss ~
  near/far correspondence); needs confirmation.
- **UNSOURCED**: no PassBack row.

| # | frontier slug | PassBack identity | evidence | class |
|--|--|--|--|--|
| 1 | atomic-far-double-down | **Fusion** | tech "Atomic far Double Down", dex 3; = active canonical fusion (5 ADD, base dod); FB JOB 167 | ID-CANON |
| 2 | quantum-far-double-down | **Plasma** | tech "Quantum far Double Down", dex 3; = active canonical plasma; FB JOB 249 | ID-CANON |
| 3 | surging-far-double-down | **Venom** | tech "Surging far Double Down", dex 3; = active canonical venom (6 ADD, base barfly) | ID-CANON |
| 4 | stepping-far-double-down | **Blurriest** | tech "Stepping far Double Down", dex 3; = active canonical blurriest (5 ADD, base barfly) | ID-CANON |
| 5 | clipper-far-symp-double-down | **Superfly** | tech "Clipper far Symp. Double Down", dex 2; = active canonical superfly (5 ADD, base barfly). Superfly-chain naming (packet F7) now decodes: superfly = symposium + clipper-far-DD | ID-CANON |
| 6 | barraging-far-double-down | **Nemesis** | tech "Barraging far Double Down", dex 4; = active canonical nemesis (6 ADD, base barfly) | ID-CANON |
| 7 | pogo-nuclear-far-double-down | **Shooting Star** | PB lists "Pogo Nuclear far Double Down" as an ALTERNATIVE tech reading of Shooting Star itself (dex 4, FB JOB 265). Not a pogo trick: the pogo entanglement dissolves | ID-CANON |
| 8 | stepping-near-double-down | **Blurrier** | tech "Stepping near Double Down", dex 3; FB JOB 243 via identity; parity trace = DDD cell | ID-JOB |
| 9 | stepping-far-symp-double-down | **Torch-R-Rack** | tech "Stepping far Symp. Double Down" (alt "BS Blurriest"), dex 3; FB JOB 281 via identity (with the packet F7 prose caveat) | ID-JOB |
| 10 | pixie-near-double-down | **POD (Pixie DOD)** and/or **Dimmier** | PB explicitly equates "Pixie DOD, Pixie near Double Down" (POD row, dex 3), which makes this the shipped pixie_double_over_down (FB JOB 244, DOD cell). But Dimmier ALSO carries tech "Pixie near Double Down" (dex 3): PassBack-internal duplicate naming. One video check would split or merge them | ID-JOB (flag) |
| 11 | pixie-far-double-down | **Dimmiest** | tech "Pixie far Double Down", dex 3; video a5PkWHdlm8U | ID-NEW (video) |
| 12 | clipper-ducking-far-double-down | **Spanishfly** | tech "Clipper Ducking far Double Down", dex 2; video R801PtQ-LNs | ID-NEW (video) |
| 13 | clipper-near-symp-double-down | **Shaft** | tech "Clipper near Symp. Double Down", alt "Symp. DDD", dex 2 | ID-NEW |
| 14 | stepping-ducking-far-double-down | **Leviathon** | tech "Stepping Ducking far Double Down", dex 3 (PB down-component says "Symp. Double Down": minor internal wobble, flag) | ID-NEW |
| 15 | toe-far-symp-double-down | **Dolomite** | tech "Toe far Symp. Double Down", dex 2 | ID-NEW |
| 16 | toe-near-symp-double-down | **Blackula** | tech "Toe near Symp. Double Down", alt "Symp DOD", dex 2 | ID-NEW |
| 17 | miraging-far-symp-double-down | **Mofly** | tech "(downtime) Miraging far Symp. Double Down", dex 3 | ID-NEW |
| 18 | atomic-ducking-far-double-down | **Id** | tech "Atomic Ducking far Double Down", alt "Alpine Fusion" | ID-NEW |
| 19 | atomic-far-symp-double-down | **Your Mom** | tech "Atomic far Symp. Double Down", alt "BS Fusion", dex 3 | ID-NEW |
| 20 | nuclear-far-double-down | **Cold Fusion** | tech "Nuclear far Double Down", alt "Pdx. Fusion", dex 3 | ID-NEW |
| 21 | nuclear-ddd-cold-fusion-geesha | **Cold Fusion** | same trick as row 20 (the SG row even carries the name); dedup the pair | ID-NEW (dedup w/ 20) |
| 22 | frantic-far-double-down-swirl | **Heart** | tech "Frantic far Double Down Swirl", dex 5 | ID-NEW |
| 23 | tapping-double-down | **Kiwi** | tech "Tapping Double Down"; PB uptime component reads "Atomic" (internal inconsistency, flag); prior conflict-flag vs shipped tapping_double_over_down stands | ID-NEW (flag) |
| 24 | double-down-near-osis | **Motion** | tech "Double Down near Osis", dex 2; identity found but still osis-gated | ID-NEW (osis-gated) |
| 25 | barraging-near-double-down | **Archnemesis** | tech "Barraging near Double Down", dex 4 | ID-NEW |
| 26 | atomic-os-symposium-double-over-down | Your Mom? | FM "os" plausibly = PB "far" here; unconfirmed | ID-PROB (19) |
| 27 | clipper-set-ss-symposium-double-over-down | Shaft? | FM "ss" plausibly = PB "near"; Shaft's alt name is "Symp. DDD" | ID-PROB (13) |
| 28 | symposium-down-double-down | Shaft? | bare "Symposium DDD" matches Shaft's alt name; Superfly is the far twin | ID-PROB (13) |
| 29 | stepping-ducking-far-double-over-down | Leviathon? | FM DOD-form of row 14's DDD-form; the folk-conflict pair collapses if both = Leviathon | ID-PROB (14) |
| 30 | nuclear-double-over-down | Cold Fusion? | FM DOD-form of rows 20/21 | ID-PROB (20) |
| 31 | barraging-ss-double-double-down | Archnemesis? | FM "ss" ~ PB "near"; "double double" wobble unexplained | ID-PROB (25) |
| 32 | sailing-dod | none | SG-only | UNSOURCED |
| 33 | dod-reverse-swirl | none | SG-only (PB has "Paradon Swirl", tech empty: adjacent, not a match) | UNSOURCED |
| 34 | fairy-spinning-double-over-down | none | FM-only | UNSOURCED |
| 35 | pixie-spinning-double-over-down | none | FM-only | UNSOURCED |
| 36 | toe-set-spinning-double-over-down | none | FM-only | UNSOURCED |
| 37 | pixie-quantum-double-over-down-swirl | none | FM-only | UNSOURCED |
| 38 | flailing-ss-symposium-double-over-down | none | FM-only (PB Atom Bomb is "Flailing far Symp. Mirage": different terminal) | UNSOURCED |

## 7. Corrections to `ROW_CLASSIFICATION.md` (2026-07-02, same day)

The near/far discovery overturns the receiver-qualifier assumption used there:

1. **spinning-near-double-down: the C-DDD call was WRONG.** It is **Bullwhip** ("Spinning near
   Double Down", active canonical, FB JOB 290), which sits in the hybrid cells, not DDD. The
   prior call treated near/far as receiver qualifiers on Scorpion's Tail; they are different
   tricks.
2. **spinning-far-double-down**: C-DDD stands, but the row IS Scorpion's Tail (shipped
   scorpions_tail), so it is a dedup, not a promotion.
3. **shooting-far-double-down**: C-DDD chassis stands, but the row IS Shooting Star itself
   (shipped shooting_star), a dedup, not a "far" variant.
4. **quantum-far-double-down**: prior note said "claims a different trick (quantum + DDD)".
   Wrong: PassBack says Plasma ITSELF is "Quantum far Double Down".
5. **Barraging rows DO contain the Double Down motif**: Nemesis dex 4 = barraging 2 + DD 2;
   the prior "may not contain a down base at all" speculation is retracted. They leave
   ADJ-OTHER and become identity rows.
6. **pixie-near-double-down**: prior conflict-flag partly resolves; PassBack equates Pixie DOD
   with "Pixie near Double Down" (POD row), so folk "Double Down" wording never implied DDD.
   Residual: POD vs Dimmier duplicate naming.

A supersession banner has been added to `ROW_CLASSIFICATION.md`.

## 8. Revised cluster arithmetic (46 rows)

| bucket | count | notes |
|--|--|--|
| resolved pre-sourcing (C/CONFLICT, minus the overturned call) | 7 | includes 3 dedups vs shipped rows |
| corrected to dedups vs shipped canonicals | 3 | spinning-far, spinning-near, shooting-far |
| ID-CANON (alias/dedup wiring, nothing new to promote) | 7 | rows 1-7 above |
| ID-JOB (parity-traceable now via identity) | 3 | Blurrier, Torch-R-Rack, pixie-near (POD reading) |
| ID-NEW (promotable folk tricks, evidence sourced, no JOB) | 12 | 2 with video (Spanishfly, Dimmiest); Motion osis-gated; Kiwi flagged |
| ID-PROB (probable dedups into ID rows) | 6 | confirmable by one curator read of near/far vs os/ss |
| UNSOURCED (FM/SG-only) | 7 | genuine JOB-sourcing residue |
| double-counted overlap adjustment | -1 | nuclear-ddd/nuclear-far pair counted once each above |

**Bottom line.** After this pass, the "~33 rows awaiting sourced JOBs" story is dead. The
cluster decomposes into: ~17 alias/dedup reconciliations against tricks the platform already
carries, ~12 ordinary folk-trick promotions with sourced structure, ~7 genuinely unsourced
rows, and **one doctrine decision**: the clipper-column crossing (section 5), which also
settles what the barfly family is. The pogo entanglement is gone; only osis remains as a
foreign gate (1 row).

## 9. Residual flags (do not lose)

- POD vs Dimmier: identical PassBack tech names, two folk names (one video check).
- Kiwi: PB uptime component "Atomic" under tech "Tapping Double Down" (internal inconsistency).
- Leviathon: PB down-component says "Symp. Double Down" while its tech name has no Symp.
- Torch-R-Rack: near/far anchor unresolved for multi-operator symposium-fused tokens.
- Barfly: platform base infinity (4 ADD) vs PassBack "Clipper far Double Down" (register in
  the cross-source divergence register; scoring unaffected).
- FM "os"/"ss" vs PB "near"/"far" correspondence is assumed in the ID-PROB rows; a curator
  should ratify the mapping before the dedups apply.
