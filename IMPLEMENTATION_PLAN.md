# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md` (even if they are also in Design Decisions as a long-term intent). Documented future work and intentional development versus staging versus production asymmetries are not deviations.

## Active deviations

### Club leader bootstrap classification and wizard step (W2)

**Design intent** (`docs/MIGRATION_PLAN.md` §2 "Bootstrap rule" and "Leadership model"; `docs/USER_STORIES.md` `M_Complete_Onboarding_Wizard` detour, tier-advisory, and wrap-up acceptance criteria; `docs/USER_STORIES.md` `A_Review_Club_Cleanup_Signals` new task type): combination-gate classification over five structural signals (`listed_contact`, `affiliation`, `hosting`, `roster`, `mirror_text`) with three context-only modifiers (`tier_signal`, `recent_activity`, `geographic_alignment`); strong + user-confirms → silent promotion to `club_leaders`; weak + user-evidence → admin queue with `task_type='club_leader_evidence_review'`; user declines → `status='rejected'`. Wizard supports detour to `M_Join_Club` or `M_Create_Club` with task transition to `in_progress_paused`; Tier 0 sees tier-gate advisory before routing to `M_Create_Club`; wrap-up landing presents three options when no affiliations were written.

**To close the gap:**

- Pipeline: emit per-signal evidence rows into `club_bootstrap_leader_signals` from the legacy_data build steps (tracked separately in `legacy_data/IMPLEMENTATION_PLAN.md`).
- Service: implement `submitTaskResponse('club_affiliations', ...)` driving the strong / weak / declined branches via `classifyBootstrapLeader` (silent promotion to `club_leaders` and `club_bootstrap_leaders.status='claimed'`; evidence enqueue with `task_type='club_leader_evidence_review'`; `status='rejected'`).
- Service: detour state transition with audit logging (member id, target story, source wizard card, timestamp). Dashboard task widget renders "Resume onboarding" for `in_progress_paused`.
- Controllers: tier-gate advisory for Tier 0 on club creation detour; wrap-up "Find or create your club" landing; detour routing from any Stage 1/2/3 card. `M_Create_Club` route accepts return-to-wizard origin; successful upgrade through `M_Purchase_Tier_1_IFPA_Member` returns to the advisory with a "Continue to Create Club" option.
- Tests: classification matrix (strong / weak / none × confirm / correct / decline = 9 cells); wizard POST per branch; detour state and audit; dashboard widget per state; tier advisory; wrap-up landing; idempotency; two-member-same-club conflict rejection.
- Verify with `npm test` and `npm run build`.
