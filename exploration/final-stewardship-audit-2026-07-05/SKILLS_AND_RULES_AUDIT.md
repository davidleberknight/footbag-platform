# Skills and Rules Audit — The Instruction Layer

Would a context-free future session, steered only by `.claude/skills/*` and
`.claude/rules/*`, act correctly on release-ready freestyle? **No — three skills would
actively mislead it.** Everything else is clean. Verified against the live code and
`freestyle/doctrine/` during this audit; the worst claims were independently confirmed
(the family routes ARE mounted; the skill saying otherwise is flatly false).

## The clean list (keep as-is; say so and move on)

`bug-hunt` (+ its reference sidecars), `freestyle-bug-hunt`, `doc-sync`, `write-tests`,
`extend-service-contract`, `add-public-page`, `browser-qa`, `migrate-browse-view`
(every exploration path it cites verified present), `pipeline-invariant-enforcer`,
`prepare-pr`, `audit-implementation-plan`, `audit-memory`. Zero dated status, zero
dangerous instructions. The process layer of this harness is genuinely good; do not
"improve" it.

`footbag-curated-media` (301 lines): keep, light trim — a few dated worked-example
markers ("added 2026-05-06") that read as precedent, not live status. Low risk.

The rules layer (`.claude/rules/*`): **no stale rule found, no rule-vs-skill
contradiction inside the rules themselves.** All freestyle mentions in the generic
rules are durable conventions.

## The three problem skills

### 1. `footbag-freestyle-dictionary` — 858 lines, ~55-60% dated campaign history. REWRITE + SPLIT.

The single worst instruction-layer risk in the repository, and the harness's own worst
violation of its own governance rule (skills under ~500 lines; no dated implementation
status in a skill body).

- **Worst stale claim:** "first-class 536 → 651; clean no-cascade Tier-1 runway
  EXHAUSTED... frontier 1844" — a whole strategic-posture section (~250 lines) that
  reads as a live promotion campaign. The IP says the promotion arc is *finished* and
  release-ready.
- **Worst dangerous instruction:** a "What to do next (when starting freestyle work)"
  block giving eight numbered marching orders for running promotion slices (backup DB →
  red_additions row → loader 19 → regen → test → stage) *as the default posture for any
  freestyle work*. A context-free session obeying this would self-direct into
  large-scale unscoped promotion work the maintainer has explicitly closed.
- Also: a broken citation (`exploration/nonstandard-topology-audit-2026-05-24/` is
  gone) and a media-deprecation status note ("Phase E") whose currency a reader cannot
  check from the text.
- **Remedy:** rewrite to a ~200-line durable skill: the layer-separation core rule, the
  four-layer ontology, the forever-rules (ADD-math check, loader-19 family override,
  source-provenance order, bracket==ADD), and an explicit pointer: *all status lives in
  IMPLEMENTATION_PLAN.md's State of Freestyle; this skill carries none.* The dated
  history moves to memory topic files or is deleted (the IP and RED_RULINGS already own
  the durable outcomes). This is already tracked as Dave's cross-track item; this audit
  is the James-side content review it was waiting on.

### 2. `freestyle-dictionary-surface` — 288 lines. REWRITE (the status spine is false).

- **Flatly false claim:** "family pages do not yet exist" / family routes "exploration
  only." `/freestyle/families` and `/freestyle/families/:slug` are live, mounted, and
  passed the release audit. The skill's own §9 tells readers it is "not yet
  load-bearing" — so a session maintaining the *live* family pages would be told the
  contract rules for them are inapplicable exploration notes. That is the inversion of
  a skill's job.
- Also: four citations to `exploration/freestyle-dictionary-ux/` — the directory no
  longer exists.
- **Remedy:** keep the genuinely good durable content (projection-over-extension, the
  alias five-category taxonomy, disclosure-depth-never-auth, anti-patterns), delete the
  phase-boundary and status sections outright, mark the surface contracts as LIVE, and
  drop the dead citations. Half the file survives.

### 3. `freestyle-topology-governance` — 208 lines. TRIM.

- **Stale block:** "Red-wave governance caution" cites Wave 2 (sent 2026-05-15) as
  "still in flight." Wave 3 went out 2026-07-02; several named Wave-2 items are ruled
  and recorded in RED_RULINGS.md. The block gates the *wrong list* of doctrine areas —
  a future session would apply freeze-holds to settled doctrine while missing the real
  current blockers (which live correctly in RED_QUEUE.md).
- **Remedy:** delete the dated caution block; replace with one durable sentence: "Before
  doctrine-adjacent freestyle work, read `freestyle/doctrine/RED_QUEUE.md` for what is
  currently held; never trust a remembered or skill-embedded hold list." Keep the
  timeless topology doctrine, which is fine.

## The structural finding

The root cause is one pattern, not three accidents: **these skills were written as live
working logs during the promotion campaign and never pruned when the campaign closed.**
The repo's own doc-governance rule solves exactly this for docs — status lives only in
the IP — but was never applied to skills. The durable fix is a one-line principle added
to the harness governance (needs Dave, since `.claude/` is approval-gated):

> A skill body carries zero project status. Any "current state / what to do next"
> content defers to IMPLEMENTATION_PLAN.md by pointer. A skill that needs status to
> make sense is a working log misfiled as a skill.

## The five most dangerous instructions for a context-free session (ranked)

1. `freestyle-dictionary-surface`: "family pages do not yet exist" — false about a live
   public surface; invites duplicate build or contract-ignoring maintenance.
2. `footbag-freestyle-dictionary` §B strategic posture — marching orders for a closed
   promotion campaign; invites large unscoped work.
3. `freestyle-topology-governance` Wave-2 caution — stale freeze-holds on settled
   doctrine; misses the real current holds.
4. `footbag-freestyle-dictionary` "if Red Wave 2/3 answers land, integrate per the
   queued follow-up slices (see memory)" — routes a doctrine-integration trigger
   through an unverifiable memory-pointer chain instead of RED_QUEUE.md.
5. `footbag-freestyle-dictionary` media-deprecation "Phase E" status note — durable-
   sounding, uncheckable from the text, inside the layer that is supposed to be
   timeless.

## Execution note

All skill edits are `.claude/`-gated (human approval; the tidy work is tracked in
Dave's cross-track lane). Nothing here should be edited by an agent unprompted. The
deliverable that unblocks Dave is ready-to-review replacement text per skill — a
mechanical drafting task for an ordinary session, now that the verdicts exist.

Separately: the persistent **memory index** shows the same disease (over its size cap,
with entries duplicating what IP/RED_RULINGS now own — promotion-arc status, wave
states). Same root cause, same remedy, different gate (memory writes). Needs James's
go-ahead; one pruning session.
