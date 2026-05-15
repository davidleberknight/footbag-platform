# WAVE-1C family-preview mockup

**Static rendering preview** of three families post-Wave-1C apply, using the locked REGISTRY-MODE-PROTOTYPE-1 spec. Evaluates notation rhythm, family cadence, topology continuity, and visual scanability before the transaction lands.

No implementation. Static text only.

---

## Reading conventions

The ASCII below approximates the production CSS rendering:

- **Two-line per row** (Format B from `REGISTRY_MODE_PROTOTYPE_1.md` §2)
- **ADD bucket header** = horizontal rule with the bucket value
- **Family cluster header** = lowercase family name, with optional `terminal:` annotation surfacing the family's terminal signature
- **Slug** rendered at column 0 as `#{slug}`
- **ADD value** right-aligned at column ~74
- **Operational notation** indented 2 spaces on visual line 2
- **`≡` chain readings** indented 4 spaces below the notation, max 2 per row
- **Dimmed family terminal** — represented in ASCII by **a single space wider than usual** before the terminal pattern (visual gap signals "eye, skip past this; it's the family terminal"). Production CSS uses 70% opacity on the trailing N characters within a family cluster.
- **Pending rows filtered** — only rows with populated `operational_notation` appear

The atom-layer (foundational `base_trick == slug` rows) renders in lowercase descriptive style per §13.9. The compound-layer renders in UPPERCASE structured style per §13.2–§13.8. The visual register difference is intentional.

---

## Mockup 1 — Butterfly family (post-Wave-1C)

Pre-Wave-1C populated: butterfly, dimwalk, parkwalk, ripwalk, tripwalk, bigwalk, matador, phoenix (8 of 11)
Wave-1C adds: atomic-butterfly, sidewalk (closes 4-ADD ladder)
Post-Wave-1C populated: 10 of 11 — **91% complete**, only spinning-butterfly + ducking-butterfly still pending (Wave-1D candidates).

```
─── 3 ADD ──────────────────────────────────────────────────────────────────────

butterfly  family

  #butterfly                                                              3
    [set] > hippy out dex > ss clipper


─── 4 ADD ──────────────────────────────────────────────────────────────────────

butterfly  family                              terminal:  OP CLIP [XBD] [DEL]

  #atomic-butterfly                                                       4
    TOE > OP OUT [DEX]  >>  OP OUT [DEX]  >  OP CLIP [XBD] [DEL]

  #dimwalk                                                                4
    TOE > SAME IN [DEX]  >>  OP OUT [DEX]  >  OP CLIP [XBD] [DEL]
      ≡ pixie butterfly

  #parkwalk                                                               4
    TOE > SAME IN [DEX]  >>  SAME OUT [DEX]  >  OP CLIP [XBD] [DEL]

  #ripwalk                                                                4
    CLIP > OP IN [DEX]  >>  OP OUT [DEX]  >  OP CLIP [XBD] [DEL]
      ≡ stepping butterfly

  #sidewalk                                                               4
    CLIP > OP IN [DEX]  >>  SAME OUT [DEX]  >  OP CLIP [XBD] [DEL]

  #tripwalk                                                               4
    TOE > OP IN [DEX]  >>  OP OUT [DEX]  >  OP CLIP [XBD] [DEL]


─── 5 ADD ──────────────────────────────────────────────────────────────────────

butterfly  family                              terminal:  OP CLIP [XBD] [DEL]

  #bigwalk                                                                5
    CLIP > (BACK) SPIN [BOD] > SAME IN [DEX]  >>  OP OUT [DEX]  >  OP CLIP [XBD] [DEL]
      ≡ surging butterfly

  #matador                                                                5
    CLIP > SAME OUT [DEX] [PDX]  >>  OP OUT [DEX]  >  OP CLIP [XBD] [DEL]
      ≡ nuclear butterfly
      ≡ paradox atomic butterfly

  #phoenix                                                                5
    TOE > SAME IN [DEX]  >>  DUCK [BOD]  >>  OP OUT [DEX]  >  OP CLIP [XBD] [DEL]
      ≡ pixie ducking butterfly
```

### Butterfly observations

- **Plant pivot at ADD 4**: 4 of 6 rows start TOE, 2 start CLIP. The TOE/CLIP split reveals two sub-family lineages emerging at the same ADD level.
- **Middle-dex rhythm is fully scannable**: every 4-ADD row has the pattern `{plant} > [DEX] >> [DEX] > terminal`. The differentiating word in each row is the side+direction of the two dexes. Reading the family becomes "what's the dex pair?".
- **Sidewalk and ripwalk parallel structure** is striking: both are `CLIP > OP IN [DEX] >> {DEX} > OP CLIP [XBD] [DEL]`. The only difference is `OP OUT` vs `SAME OUT` for the second dex. The notation makes this neighborhood relation visible.
- **ADD 5 introduces body operators**: bigwalk adds spin, matador adds PDX, phoenix adds DUCK. The 5-ADD bucket reads as "what body operator joins the dex sequence?".
- **Topology continuity = excellent**. Visual rhythm settles.

---

## Mockup 2 — Mirage family (post-Wave-1C)

Pre-Wave-1C populated: mirage, tap, blur, surge (4 of 10)
Wave-1C adds: smear, witchdoctor, fury, sumo (4 new rows; lifts to 8 of 10 = **80%**)
Still pending (filtered out): paradox-mirage, symposium-mirage, atom-smasher (3 rows; Wave-1D candidates)

```
─── 2 ADD ──────────────────────────────────────────────────────────────────────

mirage  family

  #mirage                                                                 2
    [set] > hippy in dex > op toe


─── 3 ADD ──────────────────────────────────────────────────────────────────────

mirage  family                                 terminal:  OP TOE [DEL]

  #smear                                                                  3
    TOE > SAME IN [DEX]  >>  OP IN [DEX]  >  OP TOE [DEL]

  #tap                                                                    3
    TOE > OP OUT [DEX]  >>  SAME IN [DEX]  >  OP TOE [DEL]


─── 4 ADD ──────────────────────────────────────────────────────────────────────

mirage  family                                 terminal:  OP TOE [DEL]

  #blur                                                                   4
    CLIP > OP IN [DEX]  >>  OP IN [DEX] [PDX]  >  OP TOE [DEL]

  #witchdoctor                                                            4
    TOE > OP OUT [DEX]  >>  (NO PLANT WHILE) OP IN [DEX] [XDEX] [BOD]  >  OP TOE [DEL]


─── 5 ADD ──────────────────────────────────────────────────────────────────────

mirage  family                                 terminal:  OP TOE [DEL]

  #fury                                                                   5
    CLIP > OP IN [DEX] > SAME IN [DEX]  >>  OP IN [DEX] [PDX] [XDEX]  >  OP TOE [DEL]

  #sumo                                                                   5
    CLIP > SAME OUT [DEX] [PDX]  >>  OP IN [DEX] [XDEX]  >  OP TOE [DEL]

  #surge                                                                  5
    CLIP > (BACK) SPIN [BOD] > SAME IN [DEX]  >>  OP IN [DEX] [PDX]  >  OP TOE [DEL]
      ≡ surging paradox mirage
```

### Mirage observations

- **Terminal `OP TOE [DEL]` is the distinguishing family signature.** Reading down the family, every compound terminates with this same surface, separating mirage compounds from butterfly compounds (which end `OP CLIP [XBD] [DEL]`) at a glance.
- **PDX visibility on the final dex** is a strong pattern: blur, fury, sumo, surge all carry `[PDX]` on the final or near-final dex. The mirage family teaches PDX clearly.
- **XDEX cluster at ADD 4-5**: witchdoctor, fury, sumo all carry [XDEX]. The mirage family becomes a teaching ground for XDEX semantics (and its Red pt1 governance dependency).
- **Chain decompositions are sparse** in this family — only surge has a `≡` reading. That's an honest data state (the chain registry simply doesn't cover most mirage compounds yet); registry mode reveals it without misrepresenting.
- **Topology continuity = strong rhythm; weaker decomposition coverage**. The notation alone teaches the family; the `≡` reading layer would benefit from curator authoring of chain decompositions for tap, blur, witchdoctor, fury, sumo.

---

## Mockup 3 — Barfly family (post-Wave-1C)

Pre-Wave-1C populated: barfly, venom (2 of 5)
Wave-1C adds: blurriest, superfly, nemesis (3 new rows; lifts to 5 of 5 = **100%**)
Family closed.

```
─── 4 ADD ──────────────────────────────────────────────────────────────────────

barfly  family                                 terminal:  OP CLIP [XBD] [DEL]

  #barfly                                                                 4
    CLIP  >>  SAME OUT [DEX]  >  SAME OUT [DEX]  >  OP CLIP [XBD] [DEL]


─── 5 ADD ──────────────────────────────────────────────────────────────────────

barfly  family                                 terminal:  OP CLIP [XBD] [DEL]

  #blurriest                                                              5
    CLIP > OP IN [DEX]  >>  OP OUT [DEX]  >  SAME OUT [DEX]  >  OP CLIP [XBD] [DEL]

  #superfly                                                               5
    CLIP  >>  (NO PLANT WHILE) SAME OUT [DEX] [BOD]  >  SAME OUT [DEX]  >  OP CLIP [XBD] [DEL]


─── 6 ADD ──────────────────────────────────────────────────────────────────────

barfly  family                                 terminal:  OP CLIP [XBD] [DEL]

  #nemesis                                                                6
    CLIP > OP IN [DEX] > SAME IN [DEX]  >>  OP OUT [DEX] [XDEX] > SAME OUT [DEX]  >  OP CLIP [XBD] [DEL]

  #venom                                                                  6
    CLIP > (BACK) SPIN [BOD] > SAME IN [DEX]  >>  OP OUT [DEX] > SAME OUT [DEX]  >  OP CLIP [XBD] [DEL]
      ≡ surging barfly
```

### Barfly observations

- **The barfly signature `SAME OUT [DEX] > SAME OUT [DEX]` (or `OP OUT > SAME OUT`) double-dex tail is visible across every row.** The family's defining structural fingerprint reads off the page once you see one row.
- **Each ADD step adds one element** to the row, scaffolding the difficulty progression visually:
  - barfly (4): the bare double-dex tail
  - blurriest (5): + stepping prefix (`CLIP > OP IN [DEX]` before the tail)
  - superfly (5): + (NO PLANT WHILE) modifier on first dex
  - nemesis (6): + stepping double-dex prefix (`CLIP > OP IN [DEX] > SAME IN [DEX]`) + XDEX on tail
  - venom (6): + surging body-spin opening
- **Topology continuity = exceptional**. Barfly post-Wave-1C is a textbook teaching ladder. ADD ascends through structural elaboration in visible steps. A reader scanning this family understands the barfly difficulty progression purely from notation rhythm.
- **This is the cleanest demonstration of why family-clustered registry mode is pedagogically powerful**. The family teaches itself.

---

## Cross-family comparison

| Family | Pre-1C | Post-1C | Terminal | Rhythm | Decomposition density | Verdict |
|---|---|---|---|---|---|---|
| butterfly | 73% | 91% | `OP CLIP [XBD] [DEL]` | TOE/CLIP split at ADD 4; clean | Moderate (4 of 9 rows have `≡`) | Topologically coherent |
| mirage | 40% | 80% | `OP TOE [DEL]` | Strong PDX + XDEX teaching | Sparse (1 of 7 has `≡`) | Coherent on notation; thin on decomposition |
| barfly | 40% | 100% | `OP CLIP [XBD] [DEL]` | Cleanest difficulty ladder in the corpus | Light (1 of 5 has `≡`) | Exemplary; closed family |

**Cross-family terminal signatures are immediately scannable** — a reader landing on a registry-mode page can tell butterfly from mirage from drifter from pickup by the row's last 9-15 characters, without parsing the rest. Family terminals are the single strongest scanability lever in registry mode.

**Chain-decomposition density varies by family.** The chain registry (`freestyleSymbolicEquivalences.ts`) has 39 entries; many are deep flagship compounds (mobius, gauntlet, matador). Mid-family rows (tap, blur, witchdoctor, fury, blurriest, superfly) are absent from the registry. This is a separate curator-authoring gap from operational-notation coverage — and would be a natural Wave-1E or post-Wave-1 cleanup pass.

---

## Verdict on Wave-1C readiness

**Notation rhythm: yes.** Each family reads as a coherent rhythm pattern, distinguishable from neighboring families.

**Family cadence: yes.** Family terminals anchor recognition; differentiating middles read as variations on a theme.

**Topology continuity: yes for butterfly, mirage, barfly.** Other families (drifter, osis, legover, pickup) will reach similar coherence post-Wave-1C apply.

**Visual scanability: yes** within a single family's vertical block. The dimmed family terminal (production CSS at 70% opacity) further compresses scan effort; the differentiating middle dominates the eye.

**Cross-family scanability: yes** via terminal signature recognition.

### What's still soft

- **Whirl/swirl family stays under-populated** (only mullet/surreal/montage at ADD 6+; the entire 4-ADD single-modifier ladder remains pending Wave-1D curator drafting). Skipping whirl from the Wave-1C mockup is honest — it would not yet feel coherent.
- **Chain-decomposition `≡` reading density** is uneven. Butterfly has moderate coverage; mirage and barfly have light coverage. This is a separate dimension from operational-notation coverage, and is curator-authoring work in `freestyleSymbolicEquivalences.ts`.
- **Pending-row state** (filtered by default) hides the in-progress nature of the dictionary. The curator-coverage toggle (`?include_pending=1`) is the safety valve for that.

### Recommendation

Wave-1C transaction-apply is safe to proceed on these three families' evidence. The 21-row batch creates substantially more pedagogical coherence than its raw coverage increment (+13.1%) suggests — because the rows are selected for **topology completion**, not generic coverage.
