# IMPLEMENTATION_PLAN.md

This doc holds the accepted deviations from long-term design intent for bootstrapping, security follow-ups, and near-term sprint planning scope for AI.
Long-term design: `docs/`.
Sister IP for data prep: `legacy_data/IMPLEMENTATION_PLAN.md`.

## When to add an entry here

Entries belong here ONLY if current code or infra deviates from canonical design (`docs/`) and a change is needed to close the gap. Go-live and cutover-readiness items go to `docs/MIGRATION_PLAN.md`. Documented future work and intentional dev-vs-staging-vs-prod asymmetries are not deviations.

## Active work

### Wizard tier-gate advisory for club creation not built

`M_Complete_Onboarding_Wizard` specifies that a Tier 0 member selecting "Add a club
not shown" sees a non-blocking advisory ("Creating a club requires IFPA Member
(Tier 1) or above, because you'll be the club leader.") with two paths: "Upgrade to
Tier 1 first" routing to the Tier 1 purchase flow and returning to the advisory with
a "Continue to Create Club" option on success, and "Continue with wizard" returning
to the prior card with no state change. Current code renders only a static notice on
the wrap-up landing (`club-affiliations.hbs`, `canCreateClub=false`) with no purchase
routing. Build the advisory per the story.

### WAF rules (if adopted) must key on forwarded IP

WAF scope under OR3 is an undecided option. If WAF rate-based or IP-match
rules are adopted, they must use the forwarded-IP configuration
(`X-Forwarded-For`, position FIRST): under the front-door arrangement the
TCP client CloudFront sees is the legacy proxy, so source-IP rules would
collapse every visitor into one bucket. The app side already derives client
IP via the integer trust-proxy hop count.

### DOB as auto-link matching signal (F12)

The `classifyAutoLink` function now uses DOB as a disambiguation signal when multiple name candidates match, but the feature is inert until legacy DOB data populates `legacy_members.birth_date` via the legacy data dump.

### Rules/IFPA markdown rendered without HTML sanitization

`src/lib/rulesLoader.ts` and `src/lib/ifpaLoader.ts` emit `marked.parse(...)` output via `{{{ bodyHtml }}}` without sanitization; both call sites carry `Current:`/`Target:` deviation comments.
Current: the source `.md` files are repo-only operator-authored content and the strict CSP blocks inline `<script>` execution, so unsanitized HTML is defense-in-depth only.
Target: pipe `marked` output through a sanitizer (isomorphic-dompurify) before rendering. Required before either surface becomes DB-backed or broadly admin-editable.

### Member account lifecycle beyond the purge primitive is unbuilt

`memberService.purgeAccountPII` performs the row-level erasure (credentials and
contact NULL, identity anonymized, HoF/BAP display preserved, links severed,
anchors deleted, one transaction). Everything around it is missing: no
`deleteAccount` (soft-delete with S3 photo deletion preceding `deleted_at`), no
`markDeceased` (US: deceased members leave search, rosters, and upcoming
events; the sole-leader club drops into the admin Needs Leader queue), no GDPR
data export. Until deceased handling lands, a deceased leader's `club_leaders`
row persists, so the club never surfaces for remediation and the leader's email
keeps rendering to logged-in members as club contact. The designed purge caller
also does not exist: OperationsPlatformService owns purge eligibility
(grace-window scan over soft-deleted and deceased members) and the erasure log,
and no cleanup job or `erasure_log` table is built. Until it lands, purges are
manual service calls.

### CL_Edit_Club full form not built

Leaders edit description and external URL directly via the content-validation
loop's edit form on the club detail page. The full CL_Edit_Club story covers
more: editing the remaining club fields (name, city, country, contact email,
whatsapp), and the blank-contact-email reminder (members reach the club via
the leaders' member-visible emails; admin follow-up only when the club has no
leaders). Those paths do not exist; admin contact remediation exists on the
admin leadership surface.

### Legacy archive stack not provisioned

DD §6.4 / MP §29.15: archive.footbag.org needs the archive S3 bucket behind
Origin Access Control, the CloudFront key group with the trusted-signer
keypair (private half in SSM scoped to the app runtime role), the archive
distribution with signed-cookie enforcement and the 403-redirect to login,
signed-cookie issuance in the app, and the cookie-Domain widening to
`.footbag.org`. Sequencing constraints: the widening lands after the CSRF
Origin-pin (live) and before the archive's first authenticated request.
None of it exists.

### State-4 runbook and pipeline provenance marker

The cutover runbook for MP §24 State-4 steps 3-12 is written when the
procedure first executes against staging (runbooks document validated
procedures, not anticipated ones). Prerequisite with the pipeline
maintainer: `legacy_data/run_pipeline.sh` persists no run-mode marker, so
the pre-cutover checklist cannot assert that the loaded data came from a
full-mode pipeline run; proposal is a small additive manifest
(out/pipeline_run_manifest.json with mode + timestamp) written at run end,
plus a checklist gate that reads it.

### Event v1 build-set (ratified scope)

Everything in USER_STORIES ships at v1: attendee-registration POST routes, the
event-fee Stripe flow, the payment-reconciliation admin surface, and co-organizer /
routine-music write paths. Schema and service read-side flags are largely ready
(`eventService.ts` fee/registration fields); the routes and write paths are absent.

### Deferred test infrastructure (no current-slice work)

- **Playwright tagging** (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`).

