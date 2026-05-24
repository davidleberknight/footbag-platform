# Part D — Family / Generation Insights from the Stanford Lattice

The Stanford shorthand collapses `<set>` + `<sequence of dex events>` + `<terminal surface>` into a compact form. Reading the 994-row corpus through that lattice exposes structural symmetries that the prose-only trick dictionary obscures.

## Entry-surface distribution

Of the 994 Stanford rows, the first token (entry surface) distributes as:

| First token | Count | Share |
|---|---:|---:|
| `Z` (toe set) | 485 | 48.8% |
| `X` (clipper set) | 456 | 45.9% |
| `*` (any set) | 38 | 3.8% |
| `D` (dragon set) | 7 | 0.7% |
| `F` (frigid osis) | 3 | 0.3% |
| `L` (inside set) | 3 | 0.3% |
| `U` (pendulum) | 1 | 0.1% |
| `xS` (crossbody sole) | 1 | 0.1% |

**Insight:** the freestyle vocabulary is **toe-or-clipper dominant**. 94.7% of Stanford-corpus tricks open from either a toe-set or a clipper-set. Other entries (dragon, inside, pendulum-as-set, frigid-osis) are rare; this is a structural reality the user-facing dictionary doesn't currently surface as a stats panel.

## Single-dex set patterns: named clusters

Each `<set> + <signed dex>` combination has been independently named by multiple traditions. The Stanford corpus highlights clusters where one structural shape carries 2-4 names:

| Stanford pattern | Cluster |
|---|---|
| `X-1.` (clipper + op-in dex) | Stepping / Blurry / Whirling / Blazing — **4-way folk-name cluster** |
| `X-0.` (clipper + op-out dex) | Bubba / Hopping / Scattered / Shattered — **4-way cluster** |
| `Z-1.` (toe + op-in dex) | Quantum / Slapping — 2-way |
| `Z-0.` (toe + op-out dex) | Atomic / Tapping — 2-way |
| `X-1+1.` (clipper + op-in dex + same-in dex) | High Stepping / Barraging / Furious — **3-way cluster** |

**Insight:** the folk-name proliferation around `X-1.` and `X-0.` is a tradition-overlap signal. The dictionary today treats Stepping / Whirling / Blurry / Blazing as **distinct modifiers** (each with its own per-modifier ADD-bonus row), but Stanford's shorthand says they're structurally identical at the entry layer. The community-level distinction lives in:

- **Body-state during the dex** (which the Stanford notation captures via `!` / `^` / `&` / `/` / `\`, but the dictionary's modifier-stack model captures via separate modifier rows).
- **Pedagogical lineage** (who teaches which one with which entry).

This is a real ontology tension the curator should make explicit somewhere visible — the Stanford lattice is the cleanest place to start.

## Unnamed combinatorial gaps

Ben Lynn's spec (stanford-1.txt §"In this form, it's easy to see, for example, which double dex sets (that don't involve symposium) are unnamed") explicitly calls out **unnamed combinations**:

| Stanford pattern | Implication |
|---|---|
| `Z+0-1.` | Fairy quantum — unnamed but mechanically valid |
| `Z-0-0.` | Atomic atomic (a.k.a. "nonsymposium Warping") — exists structurally |
| `Z-0-1.` | Atomic quantum — unnamed |
| `Z-0+1.` | Atomic pixie — unnamed |
| `Z-1 0\|1.` | Quantum + any second dex — open slot |
| `X-1+0.` | Stepping atomic (nonsymposium Null) — has folk variants |
| `X-1-0.` | Stepping nuclear (nonsymposium Shooting) — folk-name cluster |
| `X-1-1.` | Stepping mirage (nonsymposium Sliding) — folk-name cluster |
| `X+1 0\|1.` | Quasi + any second dex — open slot |

**Insight:** the symbolic lattice has **structural holes** the folk-naming tradition hasn't filled. A future "discover unnamed tricks" feature (Part G recommendation) could enumerate these.

## Modifier symmetry: `+1+1+` vs `-1-1-` chains

Stanford notation makes it visible that some compound chains compose multiple dex events of the same sign (`Z+1+1.` = Terraging) while others alternate signs (`Z+1-0.` = Sailing). This sign-pattern dimension is **invisible** in the modifier-stack model the dictionary uses today, but it's a primary axis of how a trick *feels* to perform.

| Sign pattern | Example Stanford | Folk-name |
|---|---|---|
| `++` repeat | `Z+1+1.` | Terraging (double-pixie) |
| `+−` alternate | `Z+1-0.` | Sailing |
| `−−` repeat | `Z-0-0.` | Atomic atomic ("Nonsymposium Warping") |
| `−+` alternate | `Z-0+0.` | Delusional |

**Insight:** sign-alternation patterns map to canonical-bracket form as "side switching mid-trick" — a feature the dictionary today either elides or buries inside per-modifier conventions. The master CSV preserves the Stanford shorthand verbatim so curator review can decide whether to surface sign-pattern as a first-class facet.

## Surface-switching patterns

Stanford `<entry-set>...<terminal-set>` shows that many tricks switch surfaces mid-trick. The 6 patterns:

| Pattern | Description | Examples |
|---|---|---|
| `Z...Z` | Toe-to-toe | ATW, fairy, mirage |
| `Z...X` | Toe-to-clipper | many "stepping" compounds |
| `X...X` | Clipper-to-clipper | barfly, ripwalk |
| `X...Z` | Clipper-to-toe | many illusion / blur compounds |
| `Z...L` | Toe-to-inside | pickup, guay |
| `*...*` | Wildcard surface | "any set" compounds |

**Insight:** surface-switching is the structural axis that distinguishes families like "barfly family" (X-to-X) from "ripwalk family" (X-to-X via two same-out dex). Today the dictionary's `trick_family` column collapses this distinction into a single name (e.g. "butterfly family"); the Stanford lattice could power a richer family-and-topology view.

## Movement-system clusters

When you sort Stanford rows by entry surface and dex-event count, natural clusters emerge:

| Cluster | Stanford signature | Count (approx) |
|---|---|---|
| Toe-single-dex (atom-like) | `Z(.|+|-)<digit>(.|+|-)Z` | ~30 |
| Toe-double-dex | `Z(.|+|-)<digit>(.|+|-)<digit>(.|+|-)Z` | ~150 |
| Toe-triple-dex | `Z...<3+dex>...Z` | ~120 |
| Clipper-single-dex (atom-like) | `X(.|+|-)<digit>(.|+|-)X` | ~25 |
| Clipper-double-dex | `X(.|+|-)<digit>(.|+|-)<digit>(.|+|-)X` | ~140 |
| Clipper-triple-dex | `X...<3+dex>...X` | ~110 |
| With body-flag (`!`, `^`, `&`, `/`, `\`) | (any entry) + body operator | ~250 |
| Surface-switch (`Z...X` or `X...Z`) | mixed entry/terminal | ~150 |

(Rough counts; exact tabulation is in the master CSV, filterable by `stanford_components`.)

## What this enables (recommendations only — not in this slice)

1. **Family-lattice visualization.** A grid view where rows = entry surface, columns = dex pattern, cells = named tricks. Empty cells = unnamed combinations.
2. **"Missing tricks" discovery surface.** A reader could see that `Z-0-1.` (atomic quantum) is structurally valid but unnamed, then propose names.
3. **Compact advanced-notation mode on trick detail pages.** Below the canonical-bracket JOB row, show the Stanford shorthand as an optional compact reference.
4. **Symbolic search.** Search by Stanford shorthand string → trick name / canonical row.
5. **Curator triage clustering.** Group the 869 Stanford-only tricks by structural pattern → curator approves whole clusters per slice instead of per-row.

All deferred to future slices. **This slice is review-only.**
