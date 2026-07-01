# Frontier reclassification — 2026-06-30

> **STALENESS CORRECTION.** The counts first published here (e.g. **237 "Ready for Authoring"**) were
> inflated: the source `freestyleObservationalUniverse.ts` was stale and still carried rows that had
> since become canonical. A slug-normalization bug in the generator's canonical dual-gate (hyphen vs
> underscore) let published slugs through. After fixing the gate and regenerating, this CSV holds
> **218 rows** (from 346) — the old "ready" section collapsed 72 → 2 — and `ready+frontier` no longer
> overlaps any active canonical. Current primaries: **Ready 130, Needs Curator Review 52, Doctrine
> Blocked 29, Parser Limitation 7.** See `../promotion-queue-2026-06-30/README.md` for the fix and the
> true promotion runway.

A classification / information-architecture artifact. It re-buckets every row in the three
Emerging-Vocabulary **card sections** by **today's** blocker, so each unresolved trick answers one
question: **what is the next concrete action before it can become canonical?**

No behavioral code changed. This is the data the `section` / `classifyFrontier` refactor would be
driven from later.

## Scope

All 346 rows of the three frontier card sections in `getObservationalLayerPage()`
(`src/services/freestyleService.ts`), sourced from the generated
`src/content/freestyleObservationalUniverse.ts`:

| Current section (display label) | rows |
|---|---|
| `ready` — **"Awaiting Ruling"** | 72 |
| `frontier` — **"Needs Authoring"** | 188 |
| `doctrine` — **"Doctrine & governance clusters"** (dod-ddd 47 / weaving 32 / other 7) | 86 |

The `folk` (587) and `parser` (339) long-tail disclosures are out of scope.

## Classification model

Every row gets exactly **one primary blocker**, assigned by precedence (most-binding first):

```
Doctrine Blocked  >  Parser Limitation  >  Needs Curator Review  >  Ready for Authoring
```

| Primary | Meaning — next action |
|---|---|
| **Doctrine Blocked** | Needs a Red ruling or an operator definition that does not exist yet. |
| **Parser Limitation** | Operators are known but the parser/notation genuinely cannot resolve the syntax. |
| **Needs Curator Review** | Structure understood; a human must make an editorial / canonical choice. |
| **Ready for Authoring** | Operators + doctrine settled; write the notation/decomposition (and promote). |

**Flags** are orthogonal and stack (a row may carry several):

- `positional_variant` — differs from a base only by a near/far/ss/op/os side qualifier.
- `duplicate_or_alias_candidate` — folds to an existing slug (the generator's `duplicate_variant`/alias rows, or a name with multiple canonical-alias parentheticals).
- `verification_needed` — a per-row check is owed (DOD-vs-DDD decomposition, far X-Dex +1, an unresolved token, a malformed ADD).
- `depends_on_parent` — promotion waits on another canonical base being authored first. *(Not auto-assigned in this pass; it needs a DB cross-check of which bases are already canonical — a follow-up.)*

## Result distribution

| Primary | count | share |
|---|---:|---:|
| Ready for Authoring | 237 | 68% |
| Needs Curator Review | 54 | 16% |
| Doctrine Blocked | 42 | 12% |
| Parser Limitation | 13 | 4% |

Flags: `positional_variant` 100 · `verification_needed` 68 · `duplicate_or_alias_candidate` 18.

By section:

| section | Ready | Needs Curator Review | Parser | Doctrine Blocked |
|---|---:|---:|---:|---:|
| ready (was "Awaiting Ruling") | 72 | 0 | 0 | 0 |
| frontier (was "Needs Authoring") | 164 | 6 | 13 | 5 |
| doctrine | 1 | 48 | 0 | 37 |

The frontier is **execution-bound, not doctrine-bound**: genuine Doctrine Blocked is 42 rows,
dominated by **weaving (32)**.

## Key decisions encoded

1. **"Awaiting Ruling" is eliminated.** All 72 `ready` rows carry a complete decomposition built
   only from settled operators — none awaits a ruling. They are all **Ready for Authoring**.
2. **Doctrine Blocked narrowed** to genuine cases only: an undefined / open operator —
   **weaving, zulu, motion/locomotion, alpine, dragon, slapping, swivel, fusing**. Everything whose
   operator has since settled left this bucket.
3. **DOD / DDD rows → Needs Curator Review + `verification_needed`** (the whole `dod-ddd` cluster,
   47 rows). Per today's doctrine the down family is a per-trick *verification* (DOD vs DDD, "down"
   structure), not a Red ruling.
4. **Rooting/Rooted → Ready for Authoring** (rooted is a settled set-primitive, 0 ADD; the
   "definition pending" framing was stale).
5. **Stale parser fail-classes folded out.** A historical `compression-ambiguity` /
   `unknown-modifier-token` whose every token now resolves to a settled operator is **not** a
   parser blocker — it becomes **Ready for Authoring** (e.g. Blurry Clipper, Nuclear Butterfly).
   Only genuine `ambiguous-terminal-mechanic` / `parser-ambiguity` / `unresolved-directional-syntax`
   rows stay **Parser Limitation** (13 — chiefly Pogo/Shooting terminal-mechanic cases). A
   compression name with ≥2 canonical-alias parentheticals (e.g. Nuclear Osis / Nucleosis / Aeon
   Flux / Paradox Flux) is an *identity* question → Needs Curator Review, not parser.
6. **Far X-Dex** — a `far` qualifier on an X-Dex receiver base (mirage / illusion / whirl / torque /
   drifter) after a non-paradox dex stays **Ready for Authoring** but carries `verification_needed`:
   the +1 is mechanical (X-Dex doctrine settled) but must be confirmed in the stored decomposition.

## Doctrine basis (settled as of 2026-06-30)

From the newest docs (`red-doctrine-integration-2026-06-26`, `emerging-vocab-reclassification-2026-06-25`,
`doctrine-refresh-2026-06-20/DOCTRINE_AUDIT.md`):

- **Settled** (→ Ready-eligible): atomic +1 · illusioning +1 · shooting (set, +3) · backside +1 ·
  furious / barraging +2 · blurry = Stepping[+Paradox] · blurry-rotational · nuclear 2 ADD ·
  quantum +1 · flailing +2 · tapping +1 · inspinning +1 · pogo (mechanical; registry +0 vs corpus
  +1 is a cleanup, not a ruling) · drifter / grifter · rooted 0 · Mobius = Gyro Torque 5 ·
  far/near/ss positional +0.
- **Open** (→ Doctrine Blocked): **weaving** (Red gave a definition 06-26 but the notation-token
  grammar is unresolved — the one true Red blocker) · **zulu** (highest-leverage undefined operator)
  · **motion / locomotion · alpine · dragon · slapping · swivel · fusing** (undefined).
- **Open but not doctrine** (→ Needs Curator Review): **DOD / DDD** (verification) · **sailing /
  frantic** (identification — no canonical row) · far/near per-row execution (alias vs distinct
  variant) · SS-as-dex-identity (held for the next Red packet).

## Two separate code defects noted during the audit (fix later, with the refactor)

- The metric-tile label **"Needs authoring"** (`classifyFrontier` category) and the card section
  **"Needs Authoring"** (`section==='frontier'`) are different populations under the same words.
- The `doctrine` card section does **not** net out the alias archive while `ready`/`frontier` do, so
  its count is not on the same basis.

## Files / reproduction

- `CLASSIFICATION.csv` — one row per trick. Columns:
  `name, section, current_bucket, primary, flags, next_action, rationale, provisional_add, decomposition`.
- `classify_frontier.py` — the deterministic generator. Reads
  `src/content/freestyleObservationalUniverse.ts`, filters to the three card sections, and applies
  the precedence + flag rules above. Re-run from the repo root:
  `python3 exploration/frontier-reclassification-2026-06-30/classify_frontier.py > CLASSIFICATION.csv`.

## Caveats

A small number of edge rows sit on a real Ready / Needs-Curator-Review boundary and want a human
eye: the far-X-Dex value rows, multi-alias identities, and a few `unknown-modifier-token` rows whose
token may since have settled. `depends_on_parent` is not populated (needs a canonical-base DB pass).
