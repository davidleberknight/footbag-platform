# Groups Feature Notes

Sources:
- `docs/USER_STORIES.md` §3.10 (member stories), §6 (group owner stories), §7.9 (admin stories), and §7.8 (mailing list integration)
- Legacy site feature comparison: member page, Board of Directors group page (member/admin view + public view), 2003 Worlds Organizing Committee group page

---

## What Groups Are

Groups (also called committees) are governance, working-group, or social entities. They are distinct from clubs:

- A member may belong to **unlimited groups simultaneously** (no cap, unlike clubs which are capped at two: one primary, one secondary).
- Groups are provisioned and archived only by Admins. Members cannot create or archive groups.
- Members may request group creation via `M_Contact_IFPA_Admin` using the "Group creation request" category.

---

## Group Properties

All group properties are set by Admins at creation time or via `A_Edit_Group_Properties`. Owners can edit only `description`, `short member-facing notes`, and the email behavior settings (`moderated`, `restricted_sending`, `subject_prefix`) via `GO_Configure_Email_Settings`.

| Property | Type | Default | Who controls |
|---|---|---|---|
| `name` | string, max 80 chars | — | Admin only |
| `description` | long-form text | — | Owner-editable |
| `short member-facing notes` | text (e.g. next meeting time, agenda link) | — | Owner-editable |
| `type` | enum: `group`, `committee`, `board`, `panel`, `fellows` | — | Admin only |
| `official` | bool | false | Admin only |
| `policy` | enum: `public`, `private` | `private` | Admin only |
| `restrict_membership` | bool | true | Admin only |
| `email_enabled` | bool | false | Admin only |
| `alias_keyword` | string, max 32 chars, lowercase alphanumeric + hyphen; required when email_enabled | — | Admin only |
| `active` | bool | true | Admin only |
| `parent_group_id` | optional FK to another non-archived group | null | Admin only |
| `moderated` | bool | false | Owner (via `GO_Configure_Email_Settings`) |
| `restricted_sending` | bool | true | Owner (via `GO_Configure_Email_Settings`) |
| `subject_prefix` | string, max 32 chars | — | Owner (via `GO_Configure_Email_Settings`) |

Email address format when enabled: `<alias_keyword>@groups.footbag.org`

Platform-native group aliases (`@groups.footbag.org`) are distinct from legacy IFPA `@ifpa.footbag.org` aliases. The platform does not receive inbound email; group mail is composed via web form and distributed via SES.

---

## Group Lifecycle

Groups are **never permanently deleted**. They do not use the soft-delete (`deleted_at`) pattern.

- Created by Admin (`A_Create_Group`). Starts `active=true` by default.
- Admin can set `active=false` to hide from directory while preserving member access (`A_Edit_Group_Properties`).
- Admin archives defunct groups (`A_Archive_Group`). Archived status is terminal.

**Operability rule:** A group with zero current owners is non-operable. Non-operable groups are flagged into the admin work queue ("Group Needs Owner") for remediation. Admin can either assign a new owner (`A_Reassign_Group_Owner`) or archive the group (`A_Archive_Group`) if defunct.

---

## Roles

**Members:** Any Tier 1+ member who has joined (self-join if `restrict_membership=false`) or been added by an owner.

**Owners / Co-owners:** Designated by Admin at creation (`A_Create_Group`). Owners can add up to 4 co-owners (max 5 total owners per group). Co-owners have identical permissions to the original owner. Owner permissions are group-scoped: owning one group does not grant permissions over any other group. Members may own multiple groups simultaneously.

**Admins:** Full access to all groups. Admin management actions (`A_Edit_Group_Properties`, `A_Reassign_Group_Owner`, `A_Archive_Group`) surface on the group page for Admin viewers.

---

## Subcommittees

A group can have a `parent_group_id` pointing to another non-archived group. Nesting depth is unlimited.

- The parent group page lists all subcommittees (groups with `parent_group_id` pointing to it).
- Changing `parent_group_id` is navigational only: it does not move members, files, ballots, or email.
- Files are not inherited between a group and its subcommittees. Each group's files are scoped to that group alone.
- Archiving a parent does not auto-archive subcommittees; admin must archive each separately. The `parent_group_id` reference remains valid for historical navigation even after the parent is archived.

---

## Member Stories

### M_Browse_Groups_Directory

Access: Logged-in members only. Visitors get `V_Access_Denied`.

Directory lists all groups where `policy=public` AND `active=true`. Each entry shows: group name, type label, official badge (if `official=true`), short description, parent group name (if `parent_group_id` is set), and aggregate member count. Sortable alphabetically by name (default) or by type.

Private groups never appear in the directory, even to their own members. Archived groups never appear.

### M_View_Group

Access: All logged-in members can view a public group's page at non-member level. Only current group members and Admins can view a private group's page or member-only surfaces.

What each viewer sees:

- **Public group, non-member:** group name, type, official badge, description, current owner display name(s) and contact, parent group link, list of subcommittees, aggregate member count. Roster, files, email compose, and ballot capabilities are NOT exposed.
- **Private group, non-member:** `V_Access_Denied`. Private groups never appear in any directory.
- **Public or private group, current member:** adds full member roster (display name, Active Player badge, HoF/BAP/Board special flags, city/country; email shown only if member opted in to email visibility); link to files (`M_View_Group_Files`); link to email compose (`M_Email_Group`) if email is enabled and member is permitted; group-scoped active/upcoming votes.
- **Group owner:** adds owner management actions (`GO_Edit_Group`, `GO_Manage_Members`, `GO_Manage_CoOwners`, `GO_Configure_Email_Settings`, `GO_Moderate_Email_Queue` count badge if pending, `GO_Delete_Any_Group_File`).
- **Admin:** adds admin management actions (`A_Edit_Group_Properties`, `A_Reassign_Group_Owner`, `A_Archive_Group`).

The `active=false` flag displays a clear "This group is inactive" notice. Inactive groups retain member access but are hidden from the public directory.

Member roster sorted alphabetically by display name.

### M_Join_Group

Access: Tier 1+ members. Group must have `restrict_membership=false` AND `active=true`.

- Creates a `group_member_affiliations` row: `is_current=1`, `role='member'`, timestamp.
- If email is enabled, inserts an auto-sync `MailingListSubscription` row. Member cannot manually unsubscribe; must leave the group instead.
- Sends confirmation email to joining member and notification email to all current group owners.
- Audit-logged: member ID, group ID, timestamp, reason `member_self_join_group`.

On groups where `restrict_membership=true`, the page shows an explanation that membership is owner/admin-managed, and points the member to `M_Contact_IFPA_Admin`.

### M_Leave_Group

Access: Any current group member.

- Sets `group_member_affiliations.is_current=0` for the member-group pair.
- If the member was the sole owner, the leave action is blocked; UI routes them to `GO_Manage_CoOwners` to promote a successor first.
- Leaving also removes the owner/co-owner role row (if applicable) in the same transaction.
- If email is enabled, removes the auto-sync `MailingListSubscription` row.
- Sends confirmation email to leaving member and notification email to all current group owners.
- After leaving, the system re-evaluates group operability and creates/updates a "Group Needs Owner" admin work queue item if owner count is zero.
- Audit-logged: actor identity, group ID, before/after affiliation state, timestamp.

### M_Email_Group

Access: Tier 1+ members, subject to the group's `restricted_sending` flag.

- Available only for groups with `email_enabled=true`.
- If `restricted_sending=true` (default for group lists): compose form is shown only to current group members; non-members see the alias address as informational only.
- If `restricted_sending=false`: any Tier 1+ member may compose.
- Form: subject, message body (plain text, no HTML), preview.
- If `moderated=true`: message enters pending queue for owner approval via `GO_Moderate_Email_Queue`. Sender sees "Pending owner approval." If rejected, sender is notified with optional owner reason.
- If `moderated=false`: message dispatched immediately via outbox to all current group members.
- Subject is prefixed by `[subject_prefix]` if `subject_prefix` is set.
- Sender rate-limited per group (admin-configurable via `group_email_rate_limit_per_hour`, default 5 per group per member per hour).
- Each dispatched message is archived (subject, body, sender, list, timestamp, recipient count) and browseable by group owners and Admins.
- Auto-sync lists do not surface a per-member unsubscribe link; the link points to the group page's leave-group action.
- Audit-logged: actor ID, group ID, message ID, action, timestamp.

### M_Upload_Group_File

Access: Current group members only.

- Accepted formats at launch: PDF, TXT, MD, PNG, JPEG. Office formats (DOCX, XLSX, PPTX) are rejected. Members must convert to PDF before upload. (Office formats excluded because no free-tool transcoding pipeline preserves editability while sanitizing macros.)
- Sanitization pipeline:
  - PDF: re-rendered through Ghostscript two-pass (PDF → PostScript 2 → PDF). Eliminates JavaScript, embedded files, and launch actions.
  - PNG/JPEG: re-encoded via `sharp`, which strips EXIF and metadata.
  - TXT/MD: validated as UTF-8; invalid charset rejected.
  - Original upload is always discarded; only the sanitized output is stored.
- File size cap: 25 MB (admin-configurable via `group_file_max_size_mb`), measured against original before sanitization.
- Stored in private S3; served via short-lived signed URLs to current group members only.
- Creates a `group_files` row: group ID, uploader member ID, original filename, content type, size (post-sanitization), storage key, upload timestamp, optional caption (plain text, max 500 chars).
- Upload rate-limited (admin-configurable via `group_file_upload_rate_limit_per_hour`, default 10 per group per member per hour).
- Audit-logged: member ID, group ID, file ID, filename, size, sanitization outcome, timestamp.

### M_View_Group_Files

Access: Current group members only.

- Lists all current files: filename, uploader display name, upload date, file size, optional caption.
- Sortable by upload date (newest first by default), filename, or uploader.
- Each row provides a download action that issues a short-lived signed URL.
- Non-members and visitors get `V_Access_Denied`; direct URL access by a non-member also returns `V_Access_Denied`.

### M_Delete_Own_Group_File

Access: The member who originally uploaded the file.

- Delete available only where uploader matches current member.
- Permanently removes file from S3 and the `group_files` row.
- Audit-logged: actor member ID, group ID, file ID, original filename, timestamp.

---

## Group Owner Stories

Group Owners are designated by Admin at creation. Owners can add up to 4 co-owners (max 5 total owners per group). Co-owners share identical permissions. Owners do not create or archive groups. Owner permissions are group-scoped.

### GO_Edit_Group

Access: Owners (including co-owners) and Admins.

Owner-editable fields: `description` (long-form text) and short member-facing notes (e.g. next meeting time, agenda link).

Owner CANNOT edit: name, type, official, policy, restrict_membership, email_enabled, active, alias_keyword, parent_group_id. Those are Admin-only via `A_Edit_Group_Properties`.

All edits audit-logged: actor identity, fields changed, old values, new values, timestamp.

### GO_Manage_Members

Access: Owners (including co-owners) and Admins.

- Owner can add any Tier 1+ member by member ID or via member search.
- Owner can remove any current member, subject to sole-owner protection (cannot remove the only owner; must promote successor first via `GO_Manage_CoOwners`).
- The `restrict_membership` flag controls self-join only; owner-driven adds/removes work regardless.
- If email is enabled, add/remove operations insert/remove the auto-sync `MailingListSubscription` row in the same transaction.
- Adding sends notification to added member and all current owners.
- Removing sends notification to removed member and all current owners.
- After any roster change, system re-evaluates operability and creates/updates "Group Needs Owner" work queue item if owner count is zero.
- All actions audit-logged: actor identity, group ID, target member ID, action, timestamp.

### GO_Manage_CoOwners

Access: Any owner of the group.

- Any owner can add up to 4 co-owners (max 5 total owners). Co-owners must be Tier 1+ members.
- New co-owner receives an email with group name and owner responsibilities.
- Co-owners gain identical group management permissions.
- Owners can view the list of current co-owners (display name, date added).
- Co-owner can opt out of the owner role via the member dashboard.
- The UI hides the remove-self action when the authenticated owner is the sole owner of the group.
- After any owner-roster change, system re-evaluates operability and creates/updates "Group Needs Owner" work queue item if count is zero.
- All actions audit-logged.

### GO_Configure_Email_Settings

Access: Owners (including co-owners) and Admins. Available only when `email_enabled=true`.

Owner-configurable fields:
- `moderated` (bool, default false): when true, outgoing messages enter a pending queue for owner approval.
- `restricted_sending` (bool, default true for group lists): when true, only current group members can compose; when false, any Tier 1+ member may compose.
- `subject_prefix` (string, max 32 chars): when non-empty, prepended to outgoing subjects as `[prefix] subject`.

Owner CANNOT enable/disable the alias or change the alias keyword. Those are Admin-only via `A_Edit_Group_Properties`.

All configuration changes audit-logged: actor identity, group ID, field changed, old value, new value, timestamp.

### GO_Moderate_Email_Queue

Access: Owners (including co-owners) and Admins. Available only when `moderated=true`.

Each pending entry shows: sender display name, subject, full message body, submission timestamp.

- **Approve:** dispatches the message via outbox to all current group members; creates the standard archive record.
- **Reject:** does not dispatch; sender is notified with the owner's optional reason text.
- Pending messages older than admin-configurable threshold (`group_email_moderation_expiry_days`, default 30 days) are auto-rejected with a system reason; sender is notified.
- Approve and reject actions audit-logged: actor identity, message ID, decision, optional reason, timestamp.

### GO_Delete_Any_Group_File

Access: Owners (including co-owners) and Admins.

- Permanently removes the file from S3 and the `group_files` row.
- Sends email notification to the original uploader (if not the deleting owner) with filename, owner identity, and optional reason.
- Audit-logged: actor member ID, group ID, file ID, original filename, original uploader member ID, timestamp, reason.

### GO_Leave_Group

Access: A group owner.

- If the owner is the sole owner: leave action is disabled with an explanation pointing to `GO_Manage_CoOwners`.
- If the owner has co-owners: leave proceeds with the same semantics as `M_Leave_Group` and additionally removes the owner role row in the same transaction.
- Audit-logged.

---

## Admin Stories

### A_Create_Group

Access: Admins only. Members may request creation via `M_Contact_IFPA_Admin` ("Group creation request" category); admin resolves via `A_Resolve_Contact_IFPA_Admin_Request` then provisions here.

Form fields: name, description, type, official, policy, restrict_membership, email_enabled, alias_keyword (required and unique if email_enabled; resulting address is `<alias_keyword>@groups.footbag.org`), active, parent_group_id (optional; must reference an existing non-archived group), initial owner member ID (required; must be Tier 1+).

If `email_enabled=true`:
- System creates an associated `MailingList` in `auto_sync_by_group=<group_id>` mode.
- Seeds the subscription with the initial owner.
- Applies admin-set defaults for `subject_prefix`, `moderated`, and `restricted_sending`.

Initial owner receives email notification with group name, type, and owner responsibilities.

Validation errors (alias keyword collision, invalid parent_group_id, initial owner not Tier 1+) surface with specific messages; form preserves user input.

Audit-logged: admin ID, group ID, all property values, initial owner ID, timestamp.

### A_Edit_Group_Properties

Access: Admins only.

Admin-editable fields: name, type, official, policy, restrict_membership, email_enabled, alias_keyword (when email_enabled), active, parent_group_id.

Admin CANNOT edit owner-editable fields (description, member-facing notes) via this story.

Behavioral effects of specific edits:
- Enabling email (previously disabled): creates the associated `MailingList` and seeds subscriptions from current membership.
- Disabling email (previously enabled): archives the associated `MailingList`.
- Setting `active=false`: hides group from directory; preserves member access via direct URL.
- Setting `active=true`: restores directory visibility.
- Changing `restrict_membership` from false to true: does not remove existing members; blocks future self-joins only.
- Changing `parent_group_id`: navigational change only; does not move members, files, ballots, or email.
- Renaming: preserves existing member set, files, ballots, mailing list, and audit history.
- Changing `alias_keyword`: takes effect for future outgoing messages; requires email to be enabled.

All edits audit-logged: admin ID, group ID, fields changed, old values, new values, timestamp.

### A_Reassign_Group_Owner

Access: Admins only.

- Admin can assign a group owner from the Tier 1+ member base.
- Admin can demote a group owner or co-owner back to ordinary group member, or remove their affiliation entirely (mandatory reason text required).
- Admin can change a member's role between owner and co-owner, subject to the sole-owner-promotion-first invariant.
- Admin can override the 5-owner cap when adding a new owner, with an explicit `cap-override` reason recorded in the audit row.
- Groups with zero owners are flagged "Group Needs Owner" in the admin work queue.
- Admin can resolve "Group Needs Owner" by assigning a new owner here, or by archiving via `A_Archive_Group`.
- All actions audit-logged: actor identity, timestamp, before/after values, reason text.

### A_Archive_Group

Access: Admins only.

- Sets group's status to `archived`. Records are never permanently deleted; no soft-delete (`deleted_at`) pattern.
- Archived groups are excluded from `M_Browse_Groups_Directory`, from `M_View_Group` for non-admins, and from all email send flows. Admins retain read access for audit purposes.
- All remaining `group_member_affiliations` rows have `is_current` set to 0. Rows are preserved for historical affiliation recovery.
- Associated `MailingList` (if any) is archived in the same transaction.
- Subcommittees are NOT auto-archived; admin must archive each separately if appropriate.
- Group-scoped active votes are NOT auto-canceled; system creates an admin notification recommending review via `A_Cancel_Vote`.
- Audit-logged: admin ID, group ID, reason, timestamp.

---

## Email / Mailing List Integration

When `email_enabled=true` on a group, an associated `MailingList` record is created in `auto_sync_by_group=<group_id>` mode. The subscription rows are managed automatically by group membership operations:

| Operation | Effect on MailingListSubscription |
|---|---|
| `M_Join_Group` | Inserts auto-sync subscription row |
| `M_Leave_Group` | Removes auto-sync subscription row |
| `GO_Manage_Members` add | Inserts auto-sync subscription row |
| `GO_Manage_Members` remove | Removes auto-sync subscription row |
| `A_Reassign_Group_Owner` | Manages subscription row |
| `A_Archive_Group` | Archives the MailingList |

Manual subscription edits by members or admins on auto-sync lists are blocked (except for bounce or complaint state handling). Auto-sync lists are excluded from `M_Manage_Email_Subscriptions` because members cannot unilaterally unsubscribe; they must leave the group.

Admins can send to a group's auto-sync `MailingList` via `A_Send_Mailing_List_Email` for exceptional platform-level notifications. These bypass owner moderation and `restricted_sending`, and are audit-logged with admin ID, group ID, list ID, subject, recipient count, and timestamp.

---

## DB Tables (Inferred from User Stories)

The schema for groups is not yet in `database/schema.sql`. Based on the user stories, the group feature will need:

- `groups` — main group entity with all configurable properties.
- `group_member_affiliations` — membership rows (`group_id`, `member_id`, `is_current`, `role` (`member`/`owner`/`co_owner`), timestamps).
- `group_files` — uploaded files (`group_id`, `member_id` uploader, `original_filename`, `content_type`, `size`, `storage_key`, `upload_timestamp`, `caption`).
- Integration with existing `mailing_lists` and `mailing_list_subscriptions` tables via `auto_sync_by_group` mode.

---

## Legacy Site Comparison

Analysis based on the legacy footbag.org group pages (Board of Directors and 2003 Worlds Organizing Committee).

### Configuration page: what owners can edit

In the legacy, group owners/admins can edit nearly all group properties via a single "Edit Board Properties" form. The new design significantly restricts this — most of those fields are Admin-only.

| Field | Legacy: who can edit | New design: who can edit |
|---|---|---|
| Name | Group owner | Admin only |
| Active | Group owner | Admin only |
| Policy (public/private) | Group owner | Admin only |
| Official flag | IFPA admins only (note on form) | Admin only |
| Type | Group owner | Admin only |
| Restrict membership | Group owner (with richer options — see below) | Admin only |
| Keyword / alias | Group owner | Admin only |
| Email on/off | Group owner | Admin only |
| Email subject prefix | Group owner | Owner (via `GO_Configure_Email_Settings`) |
| Email restricted | Group owner | Owner (via `GO_Configure_Email_Settings`) |
| Email moderated | Group owner | Owner (via `GO_Configure_Email_Settings`) |
| Email archived | Group owner | not in new design |
| Description | Group owner | Owner (via `GO_Edit_Group`) |

This is a significant reduction in owner empowerment. In the legacy, owners manage their own group's structure. In the new design, owners can only edit description, member-facing notes, and email behavior settings.

### Restrict Membership: richer legacy model

Legacy offers a dropdown, not just a boolean:
- "All IFPA members" (open self-join)
- A specific existing group or committee (membership restricted to members of a parent/peer group — "you must be a member of that group")

The new design has only a boolean `restrict_membership` flag. The legacy's "restrict to members of another group" concept has no equivalent.

### Email moderation: important behavioral difference

Legacy moderation note: *"if you have not checked 'Restricted' above, then your list is 'open', and moderation only applies to non-members (members will still be able to e-mail the list without approval)."*

So in the legacy:
- `moderated=true` + `restricted=false` → members post freely; only non-members are moderated
- `moderated=true` + `restricted=true` → all messages are moderated (the fully closed mode)

In the new design, `moderated=true` applies to all messages regardless of `restricted_sending`. This is a behavioral difference.

### Email archive: not in new design

Legacy has an "Archived?" toggle: should messages be archived online, with visibility tied to the group's public/private policy. The new design archives dispatched messages (for owner and admin review) but there is no per-group toggle for it, and there is no concept of making the archive public.

### Member display ordering

The legacy group admin page shows `^` and `v` reorder controls next to each member row, and a per-member `edit` link. This means legacy owners could explicitly set the display order of members on the group page. The new design has no equivalent — the roster is sorted alphabetically by display name only.

### Keyword used for URL too

Legacy describes the keyword as used for both the email alias AND for a "simpler web page address" for the group's home page. The new design uses `alias_keyword` for email only; group URLs presumably use the group ID or a slug.

### Official flag and IFPA home page

Legacy note on the Official flag: *"any committee or group marked 'official' will show up on the IFPA home page."* The new design has the `official` flag and `official badge` but doesn't specify IFPA home page integration.

### Access tier model: legacy vs. new design

The legacy site has three distinct access tiers; the new design has two (logged-in non-member vs. member):

| Surface | Legacy: public (no login) | Legacy: logged-in member | New design: logged-in non-member | New design: logged-in member |
|---|---|---|---|---|
| Description | yes | yes | yes | yes |
| Email alias | yes | yes | informational only | yes |
| Full roster with titles + countries | yes | yes | no (count only) | yes |
| Public files | yes | yes | no | yes (all files) |
| Private files | no | yes | no | yes |
| Ballots | no | yes | no | yes |
| Admin/owner management links | no | if group admin | no | yes (for owners/admins) |

**Key gap:** The new design requires login even to browse the public groups directory — visitors get `V_Access_Denied`. Legacy public groups are world-readable with no login. For IFPA governance groups (Board of Directors roster, public financial documents), this is likely an intentional transparency requirement worth an explicit decision.

### Member titles within a group

Legacy supports free-form per-member titles: Executive Director, Secretary, Treasurer, Board Member, Rules Director (non-voting), Consultant (non-voting), Tournament Director, Freestyle Co-Director, Net Director, Event Production Consultant. Titles are optional — members without a title just show their name.

The new design's `group_member_affiliations` has no title field. The design only tracks `role` (`member`/`owner`/`co_owner`). For governance groups this is a significant gap.

### Per-file public/private flag

Legacy files have an individual `public` or `private` status. Public files are world-readable (no login required). Private files are group-members only.

The new design has no per-file flag: all files are private to current group members, served via signed URLs. This is a deliberate policy change but means public IFPA documents (Board minutes, financial reports) would no longer be publicly accessible without login.

### File formats

Legacy accepted: `.rtf`, `.doc`, `.xls`, `.ppt`, `.eps`, `.mpg`, `.pdf`, `.txt` — basically anything. The Board of Directors page had 31 files including Office formats and a video (`.mpg`).

New design accepts: PDF, TXT, MD, PNG, JPEG only. Office formats (.doc, .xls, .ppt, .rtf) and video are explicitly rejected. Members must convert to PDF first. This is a significant workflow change for governance groups that share working documents.

### Ballots integrated on the group page

Legacy has a Ballots section directly on the group page with a "new ballot" button and a full historical list (title, deadline, vote count). The Board of Directors page showed 34 historical ballots going back to 2002.

The new design references group-scoped votes but treats them as a separate voting system; ballots are not a first-class section of the group page in the user stories.

### Subgroups: confirmed in production use

The 2003 Worlds Organizing Committee has "Freestyle Judging Panel Committee" as a subgroup. This confirms `parent_group_id` is needed and was actively used, not just hypothetical.

### Event organizing committees as groups

In the legacy, Worlds organizing committees are managed as groups (Board of Directors, 2003/2007/2008 Worlds Organizing Committee, etc.). The new design has a separate Event Organizer role and events system. It's an open question whether organizing committees should continue to live as groups on the new platform, or whether they should be linked to the events system.

### "Group-Member View" toggle

Legacy provides an explicit toggle on the group page for admins/owners to switch between the member view and the public view. The new design doesn't specify this.

### Admin link on member page: group-specific vs. site-wide

On the legacy member page's "Your IFPA Groups" list, the `admin` shortcut link appears only when the user is explicitly designated as admin for that specific group. A site-wide admin has full access on the group page itself, but the `admin` shortcut does not appear next to every group in their list. This keeps the list clean for site admins who may belong to many groups.

The new design surfaces admin actions on the group page for any platform Admin — the equivalent treatment for the member page's group list is not yet specified.

---

## Decisions Needed Before Building

### From legacy comparison (new)

1. **Should public groups be visible without login?** Legacy says yes for governance groups. New design says no for everything. IFPA transparency may require public-access roster and documents for the Board and official committees.

2. **Should the new design support per-member titles within a group?** Legacy shows free-form titles (Executive Director, Treasurer, non-voting Consultant, etc.). Without this, the Board of Directors roster loses its role designations.

3. **Should files have a per-file public/private flag?** Legacy uses it heavily. New design has no equivalent — all files are group-member-only. Public IFPA financial documents and board minutes are currently world-readable.

4. **Should Office formats be accepted?** Legacy accepted .doc, .xls, .rtf, .ppt, .mpg. New design PDF/TXT/MD/PNG/JPEG only. Boards and committees rely on working documents in native formats.

5. **Where should organizing committees live?** As groups (legacy approach) or linked to events (new approach)?

6. **How much should owners control?** Legacy lets owners edit name, active, policy, type, restrict-membership, keyword, and all email settings. New design restricts owners to description and notes only — everything structural requires a platform admin. This may be appropriate for a small admin team but is a large reduction in group self-governance.

7. **Should restrict-membership support "members of another group" mode?** Legacy allows constraining a group's membership to members of a specific other group (for subcommittees). New design has a boolean only.

8. **Should moderation apply to members too, or only non-members?** Legacy: with `restricted=false`, moderation applies only to non-members; members post freely. New design: `moderated=true` applies to everyone. The legacy nuance may be valuable for open lists that want to screen outsiders without burdening members.

9. **Should the email archive be a per-group toggle with public visibility option?** Legacy archives can be public (tied to group policy). New design archives all dispatched messages for owner/admin review but no public option and no toggle.

10. **Should official groups appear on the IFPA home page?** Legacy does this automatically when `official=true`. Not specified in the new design.

### From IMPLEMENTATION_PLAN.md (pre-existing)

11. **Which legacy groups are still alive.** The legacy `ifpa_committees` table has ~170 records (IDs run to 172, many likely inactive). Which committees, groups, and email discussion lists are still actively used, who runs them, and who would be affected by changes?

12. **Where each group's conversation should live.** For each group to keep, should its discussion live on the new platform, in Google Groups, in an external chat tool, or be retired?

13. **Whether kept groups need moderators.** Does each group need a real owner/moderator, or is informal admin moderation enough?

14. **Who to notify when something changes.** When a group or address is retired or archived, who needs to be notified and how?

15. **Running the email side.** Help administering the IFPA Google Workspace (groups, aliases, spam settings) once decisions are made.

No in-app group feature gets built until these questions are decided.
