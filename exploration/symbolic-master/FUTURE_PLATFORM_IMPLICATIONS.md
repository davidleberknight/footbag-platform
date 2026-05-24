# Part G — Future Platform Implications

**Nothing in this list is in scope for this slice.** These are recommendations the master CSV makes possible. Each is a separate future curator-approved slice.

## 1. Compact advanced-notation mode on trick detail pages

On `/freestyle/tricks/:slug`, below the canonical JOB row, add an optional `Stanford` row:

```
JOB:       TOE > SAME IN [DEX] > SAME TOE [DEL]
ADD:       dex(1) + stall(1) = 2 ADD
Stanford:  Z.+1+Z
```

Renders only for rows where `stanford_symbolic` is populated. Tiny visual treatment (muted monospace). Lets advanced readers reference a third notation without cluttering the primary layout.

## 2. Family-lattice visualization

A grid view at `/freestyle/family-lattice` (or similar):

- Rows = entry surface (toe / clipper / dragon / inside / ...).
- Columns = dex-event count (1 / 2 / 3 / 4+).
- Cells = named tricks fitting that signature.
- Empty cells = "unnamed combinations" the lattice exposes.

Curator could deep-link from family-anchor trick-detail pages to the lattice.

## 3. Symbolic search

A search input on `/freestyle/tricks` accepting:

- Canonical bracket form: `TOE > SAME IN [DEX] > SAME TOE [DEL]`
- Stanford shorthand: `Z.+1+Z`
- FM-parens form: `Toe > Same In (DEX) > Same Toe (DEL)`

All three resolve to the same trick. Implementation requires:
- Reverse-index Stanford shorthand → slug (already in master CSV).
- A small grammar canonicalizer for case + whitespace.
- Fallback to fuzzy name-match.

## 4. Auto-generation of variant families

A "what are all the spinning-X variants?" view. The Stanford lattice + modifier list makes this enumerable:

- Take a modifier (e.g. `spinning`).
- Enumerate all canonical bases.
- For each `<spinning + base>` pair, show: published canonical OR Stanford-shorthand entry OR "unnamed".

Useful for curator triage and learner exploration.

## 5. Promotion-wave clustering

For curator-paced canonical expansion:

- Group the 869 Stanford-only rows by `<entry surface, base trick, modifier signature>`.
- Surface clusters with ≥3 members for batch curator review.
- Approve whole clusters per slice (e.g. "all pixie + X-base compounds in the 3-ADD bucket").

Reduces the per-row triage cost the prior reviews surfaced as a bottleneck.

## 6. Operator graph generation

Each Stanford row has structured components (`stanford_components` JSON column). A graph could connect tricks that share components:

- Node = trick.
- Edge = shares entry-surface OR shares dex pattern OR shares terminal surface.

Useful for "related tricks" recommendations and movement-path exploration on the trick-detail page.

## 7. Educational "movement algebra" displays

The Stanford lattice teaches that:

> `<set>` + `<signed dex>` + `<terminal>` = trick

A glossary appendix could surface this as a learning tool: "Try changing the sign — what trick do you get?" Encourages curiosity-driven exploration rather than rote name memorization.

## 8. Missing-combination discovery feature

A discoverability surface where the lattice highlights cells the community hasn't named. Could power a "Have you considered this combination?" prompt for advanced learners or curator-facing "candidate canonical entry" suggestions.

Per `stanford-1.txt`:

> "In this form, it's easy to see, for example, which double dex sets (that don't involve symposium) are unnamed."

The Stanford spec already framed this as a primary value of the system. The master CSV captures the data; a future view would surface it.

## 9. Parser-assisted ADD derivation

Today the dictionary derives ADD via modifier-stack arithmetic (`modifier + base = adds`) plus per-trick ATOMIC_FLAG_DECOMPOSITIONS overrides. The Stanford shorthand exposes the structural primitives directly:

- Each `(DEX)` event contributes +1 (FM convention) OR is one of several flagged buckets (canonical-bracket convention).
- Each `[XBD]` / `[BOD]` / `[PDX]` / `[UNS]` adds +1 in canonical-bracket counting.
- Each terminal `[DEL]` adds +1 in canonical-bracket counting (the FM convention treats it as implicit).

A future parser slice could **machine-translate** Stanford → canonical-bracket → ADD breakdown, then cross-check against the published `adds` column for QC. Misalignments surface as either parser bugs or doctrine questions for the curator.

The master CSV is the prerequisite for this — every row needs both representations available.

## 10. Expert compact glossary appendix

A new glossary section dedicated to the Stanford shorthand:

- Token dictionary (mirrors `STANFORD_TOKEN_DICT.md`).
- Worked examples (the 4-name `X-1.` cluster; the `Z.+1+Z` ATW).
- Cross-link from the existing `#jobs-notation` glossary section: "For an even more compact form, see Stanford shorthand."

Ben Lynn's authorship is the same notation-tradition exception that lets us name Job; same exception applies.

## Sequencing recommendation

If the curator decides to pursue these:

1. **Token-dict glossary section + opt-in detail-page row** (low risk; pure UI add)
2. **Symbolic search** (search-first; low data risk)
3. **Promotion-wave clustering** (curator-paced; the prior review pushback already shaped this preference)
4. **Family lattice + missing-combination feature** (richer; once curator validates the data)
5. **Parser-assisted ADD derivation** (highest ambition; needs settled doctrine on the dual-convention rule + composite modifiers)

Anything before #1 is premature.

## What this slice intentionally does NOT do

- ❌ Add Stanford rendering to any trick page
- ❌ Modify the `freestyle_tricks` table
- ❌ Promote any Stanford-only entry to canonical
- ❌ Auto-translate Stanford ↔ Job notation in production code
- ❌ Take any doctrine decision on disagreement examples
- ❌ Add a new schema field to the canonical DB

The master CSV is **review surface only**.
