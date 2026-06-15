# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### Internal QC subsystem build-excluded pending retirement

The `src/internal-qc/` QC subsystem (net-correction and persons-QC operator tooling mounted
at `/internal/*` in dev and staging) ships in source but must never reach a production
runtime. Current: the production image build strips `dist/internal-qc` and replaces
`dist/routes/internalRoutes.js` with a null stub alongside the dev-shortcuts strip
(`INCLUDE_DEV_SHORTCUTS=0`), so the routes are unreachable in production. Target: QC
retirement removes the source subtree and this strip together.

### Dev/staging admin bootstrap rides registration

`identityAccessService.registerMember` calls `applyDevStagingBootstrapAdmin`
(the operator-supplied email allowlist) so dev and staging get admin accounts
without manual SQL. Canonical design has exactly one admin-creation path: the
single-shot SSM-token claim at `/admin/bootstrap-claim`. The allowlist and
every related shortcut are tagged `CUTOVER-REMOVE` in code, and the removal
procedure in `src/dev-bootstrap/README.md` deletes them at production
go-live. Until then, production safety rests on the env-config fail-fast
guards plus the production image build stripping `dist/dev-bootstrap/`.

### Club classification overrides ride the pipeline CSV pre-go-live

Until go-live, club force-keep / force-junk classification overrides are
hand-edited rows in `legacy_data/overrides/club_classification_overrides.csv`
(`club_key,name,force_category,reason`), because pipeline reloads rebuild the
DB from the CSVs and the override must survive each reload. After go-live,
reloads stop, the production DB owns club truth, and the admin queue actions
(USER_STORIES `A_Periodic_Club_Cleanup`, MIGRATION_PLAN §10.4) become the
override path. Delete this entry when those queue actions ship.

### Freestyle surfaces deviate from the VC §4.5 token standard

The non-freestyle site is on the VC §4.4-§4.5 standard: `--font-body` /
`--font-mono` tokens behind every `font-family`, token-only
colors/radii/shadows, canonical 480/768 breakpoints, three button variants,
no undefined template classes. Fonts are now tokenized site-wide (the
`assert_conventions.sh` font gate scans the whole stylesheet). The
freestyle sections of `src/public/css/style.css` (below the "Freestyle
records" banner) still predate the rest of the standard:
~360 long-tail hex literals (the recurring palette is tokenized; what
remains is low-frequency one-offs needing consolidate-or-name calls),
breakpoints 520/600/640/680/720/1023/1024, and ~40 undefined
class tokens (every dead token is removed; the remainder are
test-anchored contract classes that need real styling decisions) across
`src/views/freestyle/**` plus 8 still-excluded freestyle partials, and
bespoke card families that do not inherit the shared tokens.
One gate enforces the standard but excludes freestyle for now: the
template-class-vocabulary test (`tests/unit/template-class-vocabulary.test.ts`,
explicit `EXCLUDED_DIRS` / `EXCLUDED_FILES`). The
exclusions are self-tightening: companion tests in the same file fail the
moment an excluded surface becomes compliant, naming the exclusion to prune.
Closure rides
the freestyle-pages-fixes list in `legacy_data/IMPLEMENTATION_PLAN.md`.

### Persona harness: classes blocked on unbuilt features

`src/testkit/canonicalPersonas.ts` seeds a persona for every §4.6 class whose code
path has landed. The classes still unseeded are blocked on features that do not yet
exist, not on the harness:

- event organizer / co-organizer — `event_organizers` exists, no organizer-gated edit routes do.
- group owner / co-owner / member — designed in USER_STORIES §3.10 and §6, no schema or routes yet.
- vote-eligibility by inclusion list — no voting routes or eligibility code yet.
- the claimed-legacy banned subject — `legacy_members` has no banned column yet.

Add each persona (plus its adjacent-owner negative where the route is ownership-scoped)
in the change that lands its feature. The system / internal-caller actor is not a catalog
persona: it is exercised by the secret-gated `/ipc` request, not a `/dev/switch` session.

### Accessibility (`@a11y`) axe checks specified but not wired

`docs/TESTING.md` §14.1 specifies automated accessibility checks via
`@axe-core/playwright`, tagged `@a11y`, on every business-critical surface
against WCAG 2.1 AA, with a `@smoke @a11y` subset on high-traffic public pages.
The dependency is installed, but no `@a11y` test exists and the runner has no
accessibility-only gate. To close the gap:

- Add `@a11y` axe assertions (`new AxeBuilder({ page }).analyze()` against the
  WCAG 2.1 AA ruleset, failing on new violations) to the lightweight Playwright
  suite, one per business-critical surface; tag the high-traffic public subset
  `@smoke @a11y`.
- Add an `--axe` flag to `run_all_tests.sh` that runs only the `@a11y`-tagged
  Playwright tests, and ensure `--full` exercises them.

Delete this entry when the `@a11y` axe gate runs green in CI and via
`./run_all_tests.sh --axe`.

### Production Stripe webhook secret is hand-set in host env, not SSM-sourced

DESIGN_DECISIONS §6.10 specifies that production sources the Stripe webhook
signing secret from AWS SSM Parameter Store, and the deployment populates
`STRIPE_WEBHOOK_SECRET` from SSM at container start alongside the other §3.6
secrets; DEVOPS_GUIDE §5.1/§5.2 and `.env.example` agree. Current:
`terraform/{staging,production}/ssm.tf` provisions only the `stripe_secret_key`
SecureString, no parameter exists for the webhook secret, and DEVOPS_GUIDE §5.5
has the operator hand-set `STRIPE_WEBHOOK_SECRET` in `/srv/footbag/env`. The web
app already reads the value as a single env var at boot with the empty-and-stub
guards (`src/config/env.ts`), so only the deploy-time source deviates. Close by
adding the webhook-secret SecureString to both `ssm.tf` files, extending the
instance IAM read policy to the new path, sourcing `STRIPE_WEBHOOK_SECRET` from
SSM when the deploy seeds `/srv/footbag/env`, and updating DEVOPS_GUIDE §5.5 to
the SSM-sourced procedure. DEVOPS_GUIDE §15.7 already points at the SSM path.

### Notification side-effects declared in service JSDoc are not yet wired

Three service file-header JSDoc contracts list `outbox_emails` /
`mailing_list_subscriptions` side-effects that the service bodies do not yet
perform. The notifications are design intent (USER_STORIES: granting HoF or BAP
sends a congratulatory email; the tier-change and vouch flows follow the
post-commit confirmation-email pattern), so the JSDoc contracts stand and the
wiring is the gap. Current:

- `membershipTieringService.ts` declares tier-change and congratulatory HoF/BAP
  emails plus an `admin-alerts` mailing-list subscription update on the is_admin
  change; the body writes only tier-grant ledger and audit rows.
- `activePlayerService.ts` declares a vouch-confirmation email; `applyVouch`
  writes grant and audit rows with no enqueue.
- `eventService.ts` declares organizer-confirmation, participant-notice, and
  sanction-decision emails; these ride the unbuilt event-organizer write routes
  (see the persona-harness entry above).

Close by enqueuing each email after its transaction commits (the outbox and
`communicationService` infra is built and tested) and writing the admin-alerts
mailing-list row inside the tiering transaction; the eventService notifications
land with the event-organizer feature. Trim nothing from the JSDoc: the
contracts describe the target.

## Audit-surfaced deployed-story gaps

Verified gaps between deployed user stories and code. Each is a real deviation to close;
delete the entry when its target ships with a test.

### N1 — trick Reference Videos admit member uploads

Current: `/freestyle/tricks/:slug` Reference Videos include member-uploaded videos tagged with a
trick slug. `db.ts listMediaByTrickTag` has no provenance filter and `freestyleService` tier
dispatch routes `tierOf(null)` (member uploads, no `source_id`) into the tutorial bucket.
Target: the curated Reference Videos band requires curator source provenance (`source_id` /
source-tier registry); member uploads are excluded from the curated band but remain discoverable
via hashtag browse (`/media/browse`) and in the member's own gallery. Do NOT key the filter on the
`#curated` tag.

### N2 — public profile omits club affiliation

Current: `PublicProfileContent` has no club field; `public-profile.hbs` renders none.
Target: surface the member's club affiliation on the public profile (M_View_Profile).

### N3 — profile omits the member media thumbnail grid

Current: neither `profile.hbs` nor `public-profile.hbs` shows the member's uploaded photos/videos.
Target: render a thumbnail grid of the member's media (M_View_Profile).

### N5 — leaving as the only co-leader is not warned

Current: `clubService.leaveClub` executes unconditionally; no last-co-leader signal reaches the UI.
Target: warn before the leave completes when the member is the club's only co-leader (M_Leave_Club).

### N6 — no club reactivation path

Current: only `markClubInactive` exists; no reactivate route/service.
Target: a co-leader can reactivate an inactive club at any time (CL_Mark_Club_Inactive).

### N9 — member hashtags forced lowercase

Current: the member upload path rejects mixed-case tags and stores `tag_display` lowercased; the
schema's separate `tag_display` column exists to preserve capitalization.
Target: preserve original capitalization in `tag_display` while normalizing `tag_normalized`
(M_Upload_Photo).

### N10 — no teaching-moment empty state on member upload

Current: the gallery empty state is a bare string.
Target: a My Content empty state showing example photos, clickable popular tags, and aggregated
hashtag statistics (M_Upload_Photo, M_Submit_Video).

### N11 — named-gallery empty state lacks popular-tag suggestions

Current: the named-gallery empty state has corrected wording but no popular-tag suggestions; the
content shape has no `popularTags` field.
Target: show 5 platform-wide popular tags on the empty named-gallery state (V_View_Gallery).

### N12 — daily hashtag-stats rebuild is not scheduled

Current: `hashtagDiscoveryService.rebuildTagStats` exists and is tested but no worker /
`OperationsPlatformService` invocation calls it; only incremental updates run.
Target: schedule the daily rebuild via `OperationsPlatformService` + the worker, wrapped in
`recordJobRun` (SYS_Rebuild_Hashtag_Stats, V_Browse_Hashtags).

### N13 — reference videos lack creator + source link

Current: `listMediaByTrickTag` does not join `media_sources`; `shapeReferenceMedia` produces only a
hardcoded `sourceLabel`.
Target: each reference video shows its creator and a link to the source URL when available
(V_View_Trick_Reference_Videos).

### N14 — admin dashboard lacks the work-queue summary panel

Current: the dashboard renders static cards with no per-category counts or urgency.
Target: a summarized work-queue panel with per-category counts linking to sub-queues, urgent
categories highlighted (A_View_Dashboard).

### N15 — soft-delete cleanup covers only members

Current: `runPiiPurgeScan` processes only deleted/deceased members.
Target: also run payment 7-year cleanup and ballot 7-year preservation, with per-entity-type
counts in the run summary (SYS_Cleanup_Soft_Deleted_Records).

### N16 — email templates are not DB-driven

Current: email bodies are hardcoded inline; the `email_templates` table is seeded but never read;
no admin editing surface.
Target: load templates from the DB, admin-editable, with audit-logged changes (SYS_Send_Email).

### N17 — continuous DB backup omits hardening steps

Current: `scripts/backup-db.sh` does a single-attempt backup with a CloudWatch staleness metric.
Target: add the WAL checkpoint, retry with exponential backoff, health-timestamp update,
3-consecutive-failure alarm, and graceful-shutdown wait (SYS_Continuous_Database_Backup).

### N18 — expired Active Player state lacks explanatory copy

Current: an expired Active Player shows only a badge plus the generic Tier 0 blurb.
Target: explain that Tier 1 benefits and Official IFPA Roster inclusion have ended
(M_Active_Player_Expiry).

### N20 — inactive clubs are not hidden from the directory

Current: `clubs_open` is `status IN ('active','inactive')`, and the directory index and country
list both read it, so inactive clubs still appear in the public directory.
Target: hide inactive clubs from the public directory while keeping them reachable by direct link
(CL_Mark_Club_Inactive).
