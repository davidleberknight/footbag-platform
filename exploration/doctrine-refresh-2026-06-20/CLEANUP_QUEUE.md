# Freestyle UI/Content Cleanup Queue (2026-06-20)

Four curator-requested cleanup tasks, scoped against the live surfaces. Ordered smallest→largest;
each notes its surface, current state, the embedded design decision, governing doctrine, and risk.
**No code written yet** — this is the scoping pass.

## Q1 — "family" → "related" wording on trick detail pages  *(smallest; clear doctrine)*

- **Surface:** `src/views/partials/trick-family.hbs:10` — `<h2>{{page.title}} Family</h2>`; "Family" is **hardcoded**.
- **Doctrine:** `src/content/freestyleFamilyTiers.ts` already exposes `familyTier(slug)` →
  `'family-parent' | 'minor-lineage' | 'foundational-terminal-surface'`. The 16 true parents =
  `familyTier === 'family-parent'`.
- **Change:** for non-parents render "{title} Related"; keep "{title} Family" only for the 16 parents.
- **Decision:** shape a tier-aware `familyHeadingLabel` in the service (preferred — keeps the template
  dumb, matches slot-governance) vs a template boolean. **Recommend service-side label.**
- **Risk:** low. Public wording change — explicitly authorized. Verify no test asserts the literal "Family".

## Q2 — aliases in the browse alt-reading slot  *(search already done)*

- **Already satisfied:** search matches aliases — `db.ts:2261-2279` UNIONs `freestyle_trick_aliases`
  (`alias_text LIKE ?`), canonical-match ranked above alias-match. **No search work needed.**
- **Remaining:** browse cards (`dictionary-trick-row.hbs:41-46`, `dictionary-trick-card.hbs:107-115`)
  render `tokenizedEquivalences` (the `≡` structural chain) in slot 3 — **not** aliases.
- **Decision (slot governance, [[project_slot_governance_doctrine]]):** aliases and `≡` equivalence
  chains are different layers; strict slot ownership says a reading lives in exactly one slot. So:
  add a distinct **"also called"** alias line, OR have the curator confirm aliases may share the
  existing `≡` slot (the task text says "existing alternate-reading spot"). **This is the one
  cross-cutting decision** — it also governs how Q3/Q4 render aliases on set pages.
- **Risk:** low-medium. Browse-detail presentation contract is test-pinned
  (`freestyle.browse-detail-contract.routes.test.ts`) — a new browse line must respect it.

## Q3 — set-name equivalences on set pages

- **Surface:** `src/views/freestyle/set-detail.hbs` + `sets-encyclopedia.hbs`;
  content in `src/content/freestyleCanonicalSets.ts` (`CanonicalSet.equivalenceNotes`) and
  `freestyleCompositionalSets.ts` (`UPTIME_REINTERPRETATION_LADDERS`).
- **Current state:** **no formal set-alias structure.** `atomic ≡ illusioning` exists only as an
  uptime/downtime **ladder step**; `furious ≡ barraging` (doctrinally "the same thing", `DOCTRINE_AUDIT`
  §1) isn't represented as a set equivalence at all.
- **Doctrine nuance:** atomic↔illusioning is a **reinterpretation** (same operator, different timing),
  not a flat synonym; furious↔barraging **is** a flat equivalence. Presenting both as undifferentiated
  "aliases" would flatten a real distinction — the display should distinguish *equivalent name* from
  *uptime/downtime reading*.
- **Change:** add a curator-authored `equivalentNames` field (reversible TS, per
  [[feedback_reversible_content_governance]]) to the affected `CanonicalSet`s and render canonical +
  alternate readings on the set page. Seed: furious/barraging, atomic/illusioning, + any others doctrine
  already supports (sailing≡frantic per `DOCTRINE_AUDIT` §1).
- **Risk:** medium. Touches set ontology — keep it a reversible content field, no schema.

## Q4 — set/trick detail-page format consistency  *(largest; doctrine-gated)*

- **Surface:** trick = `src/views/freestyle/trick-shell.hbs` (28 slots, top-loaded: notation→about→
  structural-facts near top); set = `set-detail.hbs` (10 slots, no published grammar).
- **Doctrine gate:** the universal detail-page grammar is **locked**
  (`exploration/trick-detail-ontology-doctrine-2026-05-25/PHASE_B_LOCK.md §8.4`) and explicitly says
  set-detail must be **reviewed under that lens before** any set-detail refactor. So Q4 starts with a
  doctrine-review, not edits.
- **Good news:** the user's requested top-order (name · ADD/contribution · notation · aliases ·
  related/examples) **matches trick-shell's existing top-loading** — so aligning set-detail to it is
  consistent, not a conflict. It mainly **reorders set-detail** to surface formula/ADD/equivalences/
  related above the prose, and folds in Q3's equivalent-names + Q2's alias slot.
- **Depends on:** Q2 (alias slot pattern) + Q3 (set equivalences) — do Q4 last so it unifies them.
- **Risk:** medium-high. Most surface area; needs the doctrine review + likely a per-slot decision.

## Recommended order & dependencies

```
Q1 (family→related)         standalone quick win
Q2 (browse alias slot)      establishes the alias-display pattern  ─┐
Q3 (set equivalences)       set-page analog of Q2                  ─┼─► Q4 unifies into the
Q4 (format consistency)     doctrine review, then reorder set pages ┘    shared top-loaded shell
```

**Single gating decision (affects Q2/Q3/Q4):** do aliases/equivalent-names get a **distinct "also
called" slot**, or **share the existing `≡` alternate-reading slot**? Recommend distinct, per strict
slot ownership. Everything else can proceed once that's set.
