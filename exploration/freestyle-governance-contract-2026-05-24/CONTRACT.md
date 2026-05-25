# Freestyle Dictionary Governance / Style Contract (2026-05-24)

Authoritative style + orientation contract emerging from the governance/polish slice. Not an audit (not observations); not an ontology rewrite. This document codifies HOW formulas / notations / display fields are written across the freestyle dictionary so curators authoring new entries have a single source of truth.

Scope: rendering style, governance structure, browse-axis discipline, status separation. NOT ontology — the operator vocabulary, modifier semantics, and family taxonomy remain untouched.

## Part 1 — Browse-axis discipline

Five DICTIONARY browse axes earn their toggle-bar slot. Each is a structural axis a learner navigates by:

| Axis | URL | What it groups by |
|---|---|---|
| By ADD | `?view=add` | Numeric difficulty score |
| By family | `?view=family` | Conserved terminal mechanics |
| By movement system | `?view=movement-system` | Exploratory modifier-axis projection (labeled exploratory) |
| Movement Neighborhoods | `?view=topology` | Exploratory observational topology (labeled exploratory) |
| By dex count | `?view=dex-count` | Number of `[DEX]` tokens in op_notation |
| By set | `?view=sets` | Set primitive that initiates the trick (Core sets / Secondary systems / Alternate-surface systems — surface systems explicitly framed as distinct ontology layer) |

Operators & Modifiers is NOT a dictionary browse axis. It is reference vocabulary that helps a reader parse trick names. It lives at `/freestyle/operators` and is linked from a toggle aside, not from the toggle nav.

This is a forever-rule: **operators / modifiers are vocabulary, not a dictionary grouping axis.** They are the words; the dictionary groups the tricks.

## Part 2 — Ontology layer distinctions (preserve)

Five distinct ontology layers exist. Each carries different meaning and different interchange rules. They MUST NOT be conflated:

| Layer | Examples | Where it surfaces |
|---|---|---|
| **Set systems** | pixie, fairy, atomic, quantum, nuclear, stepping, surging | `?view=sets` Core + Secondary cohorts; freestyleMovementSystems.ts set-axis; compositional-sets page |
| **Body modifiers** | spinning, ducking, paradox, symposium, gyro, diving, weaving, tapping, blurry, barraging, blazing, furious, miraging, terraging, etc. | Operators & Modifiers reference page; freestyle_trick_modifiers table; freestyleMovementSystems.ts midtime-body axis |
| **Surface mechanics** | sole, heel, cloud, knee, head, neck, shoulder, forehead, inside, outside, dragonfly entry, flying entry, cross-body | Alternate-surface cohort on `?view=sets` (with explicit "distinct ontology layer" framing); alt-surfaces subsection on `?view=movement-system`; freestyleAlternativeSurfaces.ts; a future `/freestyle/alternative-surfaces` reference page may consolidate |
| **Terminal families** | whirl, mirage, osis, butterfly, drifter, clipper-stall, legover, pickup, illusion, swirl, blender, dyno, nemesis, atomic-butterfly | `?view=family` (conserved terminal mechanics); trick_family column; freestyleFamilyOverrides.ts |
| **Exploratory neighborhoods** | hippy downtime dex · leggy dex · whirl/swirl structures · pixie uptime dex · symposium clipper structures · ducking clipper structures | `?view=topology` (Movement Neighborhoods); freestyleEquivalenceTopology.ts |

**A set is NOT a modifier.** Sets are uptime entry primitives. Modifiers are body or motion modifications applied to a base trick. They overlap in the registry (a modifier may have `modifier_type='set'`) but the semantic role is distinct.

**A surface is NOT a set.** Surface mechanics live in their own dimension. Toe and clipper dominate; head / knee / sole / cloud etc. are alternative control regimes. Don't force them into the set or modifier taxonomy. (Surface mechanics ARE rendered as the third cohort on `?view=sets` for entry-mechanic discoverability — the cohort heading carries explicit "Distinct ontology layer" framing so this exposure does not collapse the layer distinction.)

**A terminal family is NOT a topology neighborhood.** Family = conserved terminal mechanics (canonical taxonomy). Neighborhood = observational similarity grouping (exploratory). The family view IS canonical; the neighborhoods view IS NOT.

## Part 3 — Formula orientation style contract

Formulas on trick cards follow a fixed orientation. NOT an ontology rule — a STYLE rule. Curator-authored prose for new entries should match the style for consistency.

### Set-derived tricks

When a trick's name starts with a set primitive, the formula reads as `<set>(+N) + <base>(M) = N+M ADD`. The set entry analogy is on a separate "Uptime motion" line if applicable, NOT mixed into the formula.

| Pattern | Formula style | Optional analogy line |
|---|---|---|
| `pixie-X` | `pixie(+1) + X(N) = N+1 ADD` | "Uptime motion echoes the ATW shape." |
| `fairy-X` | `fairy(+1) + X(N) = N+1 ADD` | "Uptime motion echoes the orbit shape." |
| `atomic-X` | `atomic(+1 non-rotational) + X(N) = N+1 ADD` (or `+2 rotational`) | "Uptime motion echoes the pickup crossing." |
| `quantum-X` | `quantum(+1) + X(N) = N+1 ADD` | "Compressed pre-base motion in the atomic family." |
| `nuclear-X` | `nuclear(+2) + X(N) = N+2 ADD` | "Nuclear = paradox+atomic; introduces [PDX]." |
| `stepping-X` | `stepping(+1) + X(N) = N+1 ADD` | "Set-foot relocation." |
| `tapping-X` | `tapping(+1) + X(N) = N+1 ADD` | (no analogy required) |

### Body-modifier compounds

Modifier prefix + base reads as `<modifier-1>(+N1) + <modifier-2>(+N2) + ... + <base>(M) = total ADD`. List modifiers in slug order (matches the slug-prefix sequence). Atomic note about each modifier's bonus (`+1 universal`, `+1 non-rot / +2 rot`, etc.) inline.

### Folk-named tricks

For folk-named tricks (no modifier prefix in slug), include the FM technical decomposition in the description and derive the formula from THAT decomposition:

- `bladerunner` → "FM technical: Atomic Eggbeater. Formula: atomic(+1 non-rot) + eggbeater(3) = 4 ADD"
- `mobius` → "Gyro Torque. gyro(+1) + torque(4) = 5 ADD"

### Notation reorientation (paradox, x-dex, etc.)

When a trick reorients the standard dex pattern, the formula notes the structural difference but does NOT invent new doctrine:

- Paradox from toe: when a paradox-X trick enters from toe instead of clipper (unusual), the formula notes `(toe entry; paradox typically clipper-entry)` but the [PDX] token still adds +1.
- Hidden X-dex: when a trick carries an `[XDEX]` flag (additional dex event), the formula lists `xdex(+1)` as a separate token.
- near / far / same / op: these are directional qualifiers in the FM-parens convention. In canonical-bracket form they become `SAME IN` / `OP OUT` / etc. — purely directional, no ADD contribution.

### Cross-source attribution

When canonical and FM disagree on ADD, the canonical value is published. The FM claim surfaces in scoring-notes (collapsible advanced detail), framed as observational divergence. PassBack as sole divergent source = non-authoritative (per `feedback_passback_outlier_non_authoritative`).

## Part 4 — Canonical display hierarchy

Every canonical trick row publishes the following fields in this order. Empty fields are suppressed from rendering (no placeholders).

| Position | Field | Source | Rendering |
|---|---|---|---|
| 1 | Canonical name | `freestyle_tricks.canonical_name` | `<h1>` on detail page; card title on browse |
| 2 | Hashtag chip | `#{slug}` | Small monospace chip next to name |
| 3 | Folk / equivalent names | `freestyle_trick_aliases` + `freestyleSymbolicEquivalences.ts` | Alias chips on detail page; first reading on browse cards via ≡ |
| 4 | Operational notation (JOB / Set notation) | `freestyle_tricks.operational_notation` | "Set notation" section on detail (was "JOB notation"); tokenized inline |
| 5 | Movement notation (Job's grammar) | `freestyle_tricks.notation` | "Movement notation" section on detail (was "Notation") |
| 6 | Formula line (ADD breakdown) | Curator-authored in `description` or derived from `modifier_links` + `adds` | `trick-add-analysis.hbs` "ADD breakdown" section |
| 7 | ADD chip | `freestyle_tricks.adds` | Card chip; trick-detail hero |
| 8 | Alternate reading (ALT) | `freestyleSemanticOverrides.ts` rev(0) entries only | `trick-transform.hbs` ALT section (5 curator-locked entries) |
| 9 | Source / provenance | `freestyle_trick_source_links` + `freestyleObservationalTricks.ts` source citation | Muted italic line; collapsible scoring-notes advanced section |
| 10 | Status flag | Derived: canonical (`is_active=1`) / promotion-queue / formula-review / source-only / doctrine-blocked | Observational layer only (lane-based); canonical rows render without a status flag |

Observational entries DO NOT have positions 4-7 in published form; they have proposed-readings and external-claim labels only.

## Part 5 — Observational lane governance

Four explicit governance lanes on `/freestyle/observational`. Each lane is **curator-authored** via the `governanceLane` field on `ObservationalTrick`. NOT keyword-derived; the curator hand-promotes entries.

| Lane | Definition | Default for new entries |
|---|---|---|
| `promotion-queue` | Source-backed name with plausible JOB notation + ADD accounting; near-ready after final curator review | NO (curator must promote explicitly) |
| `formula-review` | Has a proposed decomposition but the ADD / formula reading is inconsistent or unresolved | NO |
| `doctrine-blocked` | Blocked by an unresolved doctrine issue. Current open questions include: classification of bare-named compounds whose observational notation carries FM-paren `(PDX)` or canonical-bracket `[PDX]` without a paradox prefix in the name (hidden-paradox interpretive lens vs cross-body character vs x-dex-like uptime structure vs compositional shorthand); inspinning / shooting / backside readings; fairy/orbit equivalence; productive-multiplicity exception scope. **Not on this list:** explicit paradox-X compounds (`paradox-mirage`, `paradox-blizzard`, `paradox-ripwalk`, `paradox-double-leg-over`) — these are well-defined and their `[PDX]` token adds +1 per the formula style contract in Part 3. | NO |
| `source-only` | Known name from a documented corpus without enough verified structure for promotion review | YES (default for all new + uncurated entries) |

Curators promote an entry by editing its `governanceLane` field in `src/content/freestyleObservationalTricks.ts`. The render layer just buckets — no automatic reclassification.

## Part 6 — Dynamic counts

Wherever a published number can be derived from current data, use the derived number — not "hundreds" or "many" or "a lot of". Examples replaced 2026-05-24:

- Trick Dictionary SEO description: now reads `{N} named canonical tricks`
- Dictionary intro paragraph: now reads `{N} canonical tricks documented to date`
- Emerging Vocabulary count strip: `{N} observational tricks pending canonical review`
- Per-family count: `{cards.length}` per family group
- Per-axis count: `{groups.length}` per Movement System axis
- Per-modifier count: `{memberCount}` per modifier group
- Per-neighborhood count: `{memberCount}` per topology group
- Per-dex-bucket count: `{cards.length}` per dex-count group
- Per-set count: `{trickCount}` per Set group

Outstanding (glossary.hbs:85 still reads "hundreds of named tricks") — surfaced for next cleanup pass.

**Forever-rule**: never publish a vague-count phrase in public prose when the actual count is queryable from the DB. The dynamic count carries integrity; the vague phrase does not.

## Part 7 — Surface mechanics: distinct ontology layer

Alternative surfaces (sole / heel / cloud / knee / head / neck / shoulder / forehead / inside / outside / dragonfly / flying / cross-body) form a distinct ontology layer. They are NOT modifiers and NOT sets. They live as a compact educational subsection on `?view=movement-system` (rendered after the 4 axes), framed as "alternative balance/control regimes" not "weird tricks".

Coverage (2026-05-24):

- Sole and heel: 4 tricks
- Inside and outside: 2 tricks
- Head, neck, shoulder, forehead: 4 tricks
- Cloud and knee: 3 tricks
- Flying and airborne variants: 5 tricks (flying-clipper, flying-inside, flying-outside, dragonfly-kick, butterfly-kick)

Future expansion may include: flapper-style mechanics (currently surfaced as `cross-body-sole-stall`); xbody surface variants (currently absent from canonical); additional body-contact stalls if added.

## Part 8 — What this contract explicitly does NOT do

- ❌ Redefine modifier semantics
- ❌ Reclassify any modifier from body to set or vice versa
- ❌ Extend the productive-multiplicity exception list (triple-ATW etc. remain blocked)
- ❌ Resolve any pending Red consultation questions
- ❌ Change family-view ordering or membership
- ❌ Touch the parser / editorial / operational layer separation
- ❌ Mandate UI implementation of any specific component
- ❌ Override curator authority on individual trick decisions

## Sequencing if curators adopt

1. Apply the contract to new trick additions immediately (style enforced on red_additions / red_corrections review).
2. For existing trick descriptions / formulas, apply the contract opportunistically when the row is touched for other reasons. NO bulk rewrite.
3. Migrate the existing observational `status` field usage to the new `governanceLane` field over time (curator-paced; default 'source-only' carries the existing pending-review entries safely).
4. Surface contract-misaligned descriptions in future audits as actionable findings.

The contract is durable. It does not expire after the slice closes.
