# Skill: club-leadership-surface

## When to use

Invoke this skill when work touches:

- Rendering club leaders, contacts, or organizers on any public surface
- The `club_bootstrap_leaders` data path (read or write)
- Privacy gates around contact-information exposure
- Designing claim, verify, reassign, or member-link flows for clubs
- Any decision about whether to display, suppress, or hide provisional/historical leadership data

If the work is club lifecycle (create/edit/archive), club membership (join/leave), Tier-1 enforcement, or club-level governance roles other than leader visibility, this skill is **adjacent** but not authoritative — fall through to USER_STORIES and DESIGN_DECISIONS.

---

## 1. Purpose and intent

Bootstrap leaders are **institutional knowledge**, not import junk.

The platform inherits decades of community structure from the legacy site. Bootstrap leaders are the pipeline-derived identity of who actually ran each club, recovered from historical records before the live member system existed. Their presence on a club page exists to:

- Preserve institutional knowledge that would otherwise vanish
- Humanize club pages (a club without visible humans feels dead)
- Bridge historical record → verified community systems as the platform onboards real members

Future sessions sometimes look at provisional/legacy data and try to "clean it up" by hiding it. **That instinct is wrong here.** Provisional ≠ broken. Provisional = honest, partial, attributed. The whole point of the bootstrap pipeline is to recover this knowledge for surfacing, not staging-then-hiding.

---

## 2. Phase boundaries

The current authoritative scope is **read-only observational surfacing**.

### In scope

- Reading bootstrap leader rows
- Rendering names, roles, badges, and notes publicly
- Linking display names to historical-person profile pages where personId resolves
- Sorting and minimal text labeling

### Out of scope (do not bundle)

- Claim flows (member claiming a legacy leadership entry)
- Role editing or co-leader add/remove
- Leadership reassignment by admins
- Public contact exposure
- Tier-1 enforcement on the club view path
- Moderation affordances or reporting flows
- Lifecycle transitions (active/inactive/archived) when triggered from the leader surface

If a request blurs these, escalate before scope-creeping. Each future phase ships independently and is **not blocked** by Phase 1 surfacing.

---

## 3. Privacy invariants (security-grade)

These are non-negotiable. Future work that quietly relaxes them is a regression even when tests pass.

- **Provisional leaders MAY be publicly named.** Names are recovered institutional knowledge; public exposure is the entire point.
- **Provisional leaders MUST NOT expose contact information.** Email or phone for a provisional row is a privacy violation, full stop. Until the leader is claimed AND has explicitly opted in, contact stays gated.
- **The service layer is the privacy gate.** Templates render only what the service hands them; they MUST NOT infer policy from `status`, `personId`, or any other field. The `showContact` boolean is the single decision point and templates branch only on it.
- **Closed-by-default for new statuses.** When a future status (`claimed`, `verified`, or anything new) lands, its mapping must explicitly choose `showContact = true` with documented justification. The default for unknown/uncategorized statuses is gated.
- **No HTML side-channels.** When `showContact === false`, there is no `mailto:` anchor, no rendered email class, no copy-paste fallback, nothing. Tests must assert absence, not just non-display.
- **Claiming a leader row links identity, not authority.** A `claimed` status records that a member acknowledges the historical leadership identity attached to a `legacy_member_id`. It does NOT grant operational control of the club, contact-channel exposure, edit permissions, member roster visibility, or any other governance affordance. Operational authority is granted only via explicit governance flows (yet to be designed); claim is identity linkage and nothing more.

This invariant is the architectural decision most likely to silently break in future work. It is worth defending aggressively.

---

## 4. Canonical service contract

Every leader rendering must conform to this view-model shape:

```typescript
type ClubLeader = {
  personId?: string            // historical_persons identifier; enables profile link
  claimedMemberId?: string     // members.id once a leader has claimed the legacy entry
  displayName: string
  role: 'leader' | 'co-leader'
  status: 'provisional' | 'claimed' | 'verified'
  badgeLabel?: string          // pre-shaped display text (e.g. "Provisional leader")
  badgeNote?: string           // pre-shaped explanatory text rendered under the badge
  showContact: boolean         // privacy gate; the single decision point
  contactEmail?: string        // present only when showContact === true
}
```

### Layering rules

- **`db.ts` returns flat rows only.** No business logic, no enum mapping, no privacy decisions. SQL filters out fully suppressed statuses (e.g. `superseded`, `rejected`) so they never reach the service.
- **Service layer owns the entire mapping**: status → badge text, status → `showContact`, status → which fields are populated. Single mapping site, single source of truth.
- **Rendering does not branch on `status` for text.** Templates render `badgeLabel`/`badgeNote` if present and otherwise omit. New statuses do not require template changes — only a new branch in the service mapping.
- **Sorting is service-computed, not template-computed.** Display order is a contract output, not a presentation accident.

### Sort semantics

- `role='leader'` rows before `role='co-leader'` rows
- Alphabetical (case-insensitive) by `displayName` within each role bucket
- Hardcoded; not user-configurable

---

## 5. Rendering philosophy

The product stance:

- **Transparency over perfection.** Show provisional data with honest labels rather than hiding it for cleanliness.
- **Provisional visibility over empty pages.** A page with a flagged historical leader is more useful than a page with no humans on it.
- **Lightweight labeling over suppression.** A small badge plus an attribution note makes the data trustworthy without needing it to be perfect.

### Wording defaults (current)

- Badge: `Provisional leader` — calm, technical, neutral
- Note: `imported from historical records` — explains origin without sounding broken

### Wording to avoid

- "Unclaimed" — sounds technical and slightly negative
- "Unverified" — implies untrustworthiness
- "Pending" — implies the leader is awaiting their own action
- "Stale" / "Old" — undermines confidence in clubs that recovered their history accurately

When new statuses land (`claimed`, `verified`), prefer warm and specific labels like "Verified club contact" or "Club organizer" over enum-mirror text.

---

## 6. Future direction (non-binding sequencing)

Probable future work, in approximately the right order:

1. **Public leader surfacing** ← **current**
2. Claimed/verified state plumbing (member claims a legacy leadership row)
3. Leader self-service flows (opt-in contact, edit profile, leave role)
4. Join/create club flows for members
5. Admin leadership reassignment + work-queue resolution

Each is independently shippable. Current work is **not blocked** on any of them. The contract shape (`ClubLeader`) is designed to extend without breaking the view contract — only service-layer mapping evolves.

---

## 7. Anti-patterns and prohibited assumptions

These have surfaced in design conversations and represent the failure modes most likely to recur in future sessions:

- Do not assume provisional leaders are verified members.
- Do not expose contact emails for provisional leaders.
- Do not require Tier-1 linkage before rendering historical leadership.
- Do not collapse historical bootstrap data into live governance state.
- Do not treat absence of member linkage as invalid data — many leaders pre-date the live member system by years.
- Do not introduce "Unclaimed" or other technical-negative wording in user-facing text.
- Do not add status-to-text branching in templates; map at the service layer once.
- Do not remove provisional leaders to "clean up" data — they are the data.
- Do not hide provisional leaders pre-launch waiting for claims; that creates a chicken-and-egg problem (no one claims a leadership they cannot see).
- Do not add card layouts, avatar images, role-color systems, or moderation affordances to Phase 1 — minimal textual hierarchy is the agreed design.
- Do not introduce mutable leader management UI as part of read-side work.
- Do not interpret `claimed` status as a governance grant. See §3: claim ≠ operational control.

---

## 8. Source-of-truth references

For design intent, not implementation:

- `docs/USER_STORIES.md` — `M_View_Club` ("Leaders array displayed on club detail page"), `V_Browse_Clubs` (visitor-public surface)
- `docs/VIEW_CATALOG.md` — the club-detail entry in the public-page matrix and the club-detail-leader-contact-gate sensitive-page subsection (leaders rendering rules and view-model contract)
- `docs/SERVICE_CATALOG.md` — the `ClubService` entry (boundary and consumer list)
- `docs/DESIGN_DECISIONS.md` — the entity-distinction decision for `members` vs `historical_persons`
- `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` — the under-classification-beats-pollution philosophy section (parallel reasoning for the freestyle ontology, applies analogously here)

For implementation specifics (SQL, factories, test fixtures, file paths), consult the codebase at the time of work. Those details rot; the principles in this skill do not.
