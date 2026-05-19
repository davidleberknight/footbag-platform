# Footbag Website Modernization Project -- Proposed User Stories (Groups and Committees, Freestyle Music, Online Registration)

## Document purpose

This document is a **standalone review draft** of proposed additions and amendments to `docs/USER_STORIES.md`. It is not itself a canonical doc. Its contents are intended to be integrated into `docs/USER_STORIES.md` after review.

Three areas are covered:

1. Groups and committees (a new domain not currently represented in `docs/USER_STORIES.md`). Groups are distinct from clubs.
2. Freestyle routine music upload by competitors and playback by organizers.
3. Online registration management for event organizers (per-event registration summary, printable check-in template, and minor amendments to existing event-organizer stories).

All new stories follow the format and conventions of `docs/USER_STORIES.md`: `### STORY_ID` headers, `Access:` / `Story:` / `Success Criteria:` blocks, plain prose with no em dashes, no emojis, no implementation-status language.

## Integration map

Each proposed new story or amendment is labeled with its target section in `docs/USER_STORIES.md`. The role-based distributed structure used by clubs and events is preserved:

- New member-facing group stories land in a new **3.10 Group Membership** subsection (parallel to 3.3 Club Membership).
- New group-owner stories land in a new top-level **Group Owner Stories** section (parallel to Section 5 Club Leader Stories). Integration will renumber Administrator and below accordingly.
- New admin-of-groups stories land in a new **Group Management** subsection within the Administrator section (parallel to 6.2 Data Management and 6.3 Content Moderation).
- New event-organizer stories for online registration land in **4.2 Registration Management** and a new **4.5 Music Operations** subsection (or 4.2 if preferred).
- Routine-music upload by competitors lands in **3.4 Event Participation**.
- Stories that are revised by these additions (`M_Register_For_Event`, `EO_Edit_Event`, `A_Create_Vote`, `A_Manage_Mailing_Lists`, `A_Send_Mailing_List_Email`) are reproduced **in full** below, with the new success criteria integrated, so the reviewer can read the entire revised story in one place. The canonical version of each in `docs/USER_STORIES.md` should be replaced with the revised version at integration time.

## Locked design decisions backing this draft

For context during review. These were settled by Q&A and should not be revisited unless a decision is being changed:

- All group creation is **Admin-only**, regardless of type. There is no member-self-service `M_Create_Group`. Members request a group via `M_Contact_IFPA_Admin`.
- Group ballots reuse the existing voting subsystem. `A_Create_Vote` gains a new eligibility rule `members_of_group(group_id)` evaluated at vote-open snapshot time. Existing `M_View_Vote_Options`, `M_Vote`, `M_Verify_Vote_And_View_Results` flows apply unchanged.
- Group email aliases reuse `MailingList` + `MailingListSubscription`. The group's `MailingList` runs in a new `auto_sync_by_group` subscription mode driven by group membership. `MailingList` gains three new admin-configurable fields (`subject_prefix`, `moderated`, `restricted_sending`).
- Group files are private (signed URLs, S3) and scoped to current group members. Access is symmetric: any group member can upload and view; uploaders delete their own; group owners and Admins delete any.
- Subcommittees are modeled as full independent `Group` entities with a nullable `parent_group_id` field. No inheritance of membership, files, ballots, or email.
- Group membership has a per-group `restrict_membership` boolean, default `true`. When `true`, only owners and Admins add or remove members. When `false`, any Tier 1+ member can self-join.
- Group visibility uses a two-state `policy` flag (`public` or `private`). Public groups are visible to all logged-in members in a member-only directory. Private groups are visible only to current group members and Admins. **No visitor access to any group surface.**
- Group `type` (`group`, `committee`, `board`, `panel`, `fellows`) and `official` are pure display labels. No behavioral linkage to existing HoF/BAP/Board member flags from `A_Grant_HoF_BAP_Board_Status`.
- Freestyle routine music is uploaded by the registering competitor, verifiable by the competitor, and played back by event organizers only. Files are private. After event end, files remain accessible to organizers for an admin-configurable retention window (default 90 days), then auto-purged. No public archive.

---

# 1. Additions to Section 3 Member Stories

## 3.10 Group Membership (new subsection)

Groups (also called committees) are governance, working-group, or social entities distinct from clubs. A member may belong to many groups simultaneously, unlike clubs where membership is one-at-a-time. Group entities have configurable properties controlled by Admins: type, official flag, visibility (`policy`), `restrict_membership`, email enable, `active` flag, alias keyword, and optional `parent_group_id` for subcommittees.

Group operability rule: A group is considered non-operable if it has zero current owners. Non-operable groups are flagged into the admin work queue for remediation. Admin remediation options include assigning a new owner via `A_Reassign_Group_Owner` or archiving the group via `A_Archive_Group` if defunct.

### M_Browse_Groups_Directory

Access: Logged-in members can browse the directory of public groups. Visitors have no access.

Story: As a member, I can browse a directory of public groups so that I can discover groups I might want to join or learn about.

Success Criteria:

- The directory lists all groups where `policy=public` AND `active=true`, regardless of whether the viewing member is a current member of those groups.
- Each entry shows: group name, type label, official badge if `official=true`, short description, parent group name if `parent_group_id` is set, and aggregate member count.
- Private groups never appear in this directory, even to current members of those private groups (private groups are reached via direct link or via the member's "My Groups" list).
- Archived groups never appear.
- Directory sortable alphabetically by name (default) or by type.
- Directory is not visible to visitors. Unauthenticated access returns `V_Access_Denied`.

### M_View_Group

Access: All logged-in members can view a public group's page at a non-member view level. Only current group members and Admins can view a private group's page or see the member-only surfaces of a public group.

Story: As a member, I can view a group's page so that I understand the group's purpose, leadership, membership, and active business.

Success Criteria:

- Public group, non-member viewer: page displays group name, type, official badge if applicable, description, current owner display name(s) and contact, parent group link if applicable, list of subcommittees (groups with `parent_group_id` pointing to this group) if any, and aggregate member count. Roster, files, email composition, and ballot capabilities are not exposed.
- Private group, non-member viewer: returns `V_Access_Denied`. Private groups never appear in any directory.
- Public or private group, current member viewer: page additionally displays full member roster (display name, current Active Player badge where applicable, special flags HoF/BAP/Board, city/country; email shown only if member has opted in to email visibility); link to `M_View_Group_Files`; link to `M_Email_Group` if email is enabled and the member is permitted to compose; group-scoped active or upcoming votes per `M_View_Vote_Options` eligibility.
- Group owner viewing their own group: page additionally surfaces owner management actions (`GO_Edit_Group`, `GO_Manage_Members`, `GO_Manage_CoOwners`, `GO_Configure_Email_Settings`, `GO_Moderate_Email_Queue` count badge if any pending, `GO_Delete_Any_Group_File`).
- Admin viewing any group: page additionally surfaces admin management actions (`A_Edit_Group_Properties`, `A_Reassign_Group_Owner`, `A_Archive_Group`).
- The `active` flag, when false, displays a clear "This group is inactive" notice; inactive groups retain member access but are hidden from the public directory.
- Member roster sorted alphabetically by display name.

### M_Join_Group

Access: Tier 1+ members can self-join groups where `restrict_membership=false` AND `active=true`.

Story: As a member, I can self-join an open group so that I can participate in its activities and receive its communications.

Success Criteria:

- Join action is available only on groups where `restrict_membership=false` AND `active=true`.
- On groups where `restrict_membership=true`, the group page shows an explanation that membership is managed by the group's owners or by Admins, and points the member to `M_Contact_IFPA_Admin` for inquiries.
- Joining creates a `group_member_affiliations` row with `is_current=1`, `role='member'`, and timestamp.
- If the group has an enabled `MailingList`, joining inserts a `MailingListSubscription` row in the auto-sync subtype for that list. The member cannot manually unsubscribe; unsubscription requires leaving the group via `M_Leave_Group`.
- Joining sends a confirmation email to the joining member and a notification email to all current group owners.
- Members may belong to an unlimited number of groups simultaneously. There is no per-member cap on group affiliations, unlike clubs.
- Joining is audit-logged with member ID, group ID, timestamp, reason `member_self_join_group`.

### M_Leave_Group

Access: Any current group member can leave a group they currently belong to.

Story: As a group member, I can leave a group so that I am removed from its roster and no longer receive its communications.

Success Criteria:

- Leaving sets the member's `group_member_affiliations.is_current=0` for the member-group pair.
- A member who is the sole owner of the group cannot leave directly; the UI surfaces the constraint and routes the member to `GO_Manage_CoOwners` to promote a successor first.
- Leaving a group where the member also held an owner or co-owner role removes that role row in the same transaction.
- If the group has an enabled `MailingList`, leaving removes the member's auto-sync `MailingListSubscription` row.
- Leaving sends a confirmation email to the leaving member and a notification email to all current group owners.
- After leaving, the system re-evaluates group operability. If the group has zero owners after the leave, the system creates or updates a "Group Needs Owner" admin work queue item.
- Leaving is audit-logged with actor identity, group ID, before and after affiliation state, timestamp.

### M_Email_Group

Access: Logged-in members can send a message to a group's email alias via web form, subject to the group's `restricted_sending` flag.

Story: As a member, I can send an email to a group's alias so that I can communicate with the group's membership.

Success Criteria:

- The compose form is available only for groups with email enabled by Admin (`email_enabled=true`).
- If `restricted_sending=true` (default for group lists), the compose form is shown only to current group members; non-members may see the alias address as informational on the group page but cannot compose.
- If `restricted_sending=false`, the compose form is available to all logged-in members.
- Form includes: subject, message body, preview. Body is plain text (no HTML), consistent with `A_Send_Mailing_List_Email`.
- If `moderated=true`, on submit the message enters a pending queue visible to group owners via `GO_Moderate_Email_Queue`. The sender sees a "Pending owner approval" confirmation. The message is dispatched only after owner approval; if rejected, the sender is notified by email with the owner's optional reason.
- If `moderated=false`, the message is dispatched immediately via the outbox to all current group members (the auto-sync `MailingListSubscription` rows for the group's `MailingList`).
- Outgoing subject is prefixed by `subject_prefix` if configured, in the form `[prefix] subject`.
- Sender rate-limited per group, admin-configurable (`group_email_rate_limit_per_hour`, default 5 messages per group per member per hour).
- Each dispatched message is archived per the existing `A_Send_Mailing_List_Email` archive rule (subject, body, sender, list, timestamp, recipient count) and browseable by group owners and Admins.
- Bounce list, SES headers, and unsubscribe-link rules apply per existing mailing-list infrastructure. Auto-sync lists do not surface a per-member unsubscribe link; the link instead points to the group's page with a leave-group action.
- All sends and moderation decisions are audit-logged with actor ID, group ID, message ID, action, timestamp.

### M_Upload_Group_File

Access: Any current member of the group can upload files to that group.

Story: As a group member, I can upload a file to my group so that I share documents with the group's members.

Success Criteria:

- Upload form is available only to current group members on the group page.
- Allowed file formats and maximum file size are admin-configurable parameters with defaults: PDF, DOCX, XLSX, TXT, MD, PNG, JPEG; `group_file_max_size_mb` default 25 MB per file. Unsupported formats or oversized files are rejected with a clear error message.
- File is stored in private object storage (e.g., S3) and served via short-lived signed URLs only to current group members. The file is not addressable by visitors or by logged-in members who are not current members of the group.
- Each upload creates a `group_files` row recording: group ID, uploader member ID, original filename, content type, size, storage key, upload timestamp, optional caption (plain text, max 500 chars).
- Member sees the uploaded file in the group's files list immediately after successful upload.
- Upload rate-limited per group, admin-configurable (`group_file_upload_rate_limit_per_hour`, default 10 uploads per group per member per hour).
- Upload action is audit-logged with member ID, group ID, file ID, filename, size, timestamp.

### M_View_Group_Files

Access: Only current members of the group can view its files.

Story: As a group member, I can view and download files attached to the group so that I can access shared documents.

Success Criteria:

- Files list shows all current files for the group, with: filename, uploader display name, upload date, file size, optional caption.
- List sortable by upload date (newest first by default), filename, or uploader.
- Each row provides a download action that issues a short-lived signed URL.
- Visitors and logged-in non-members of the group cannot access the files list or any individual file URL. Direct URL access by a non-member returns `V_Access_Denied`.
- Files are not inherited to or from subcommittees. Each group's files are scoped to that group alone.

### M_Delete_Own_Group_File

Access: A group member can delete a file they originally uploaded to the group.

Story: As a group member, I can delete a file I uploaded so that I control my own contributions.

Success Criteria:

- Delete action is available only on files where the uploader matches the current member.
- Deletion permanently removes the file from object storage and the `group_files` row.
- Group owners and Admins can delete any file via `GO_Delete_Any_Group_File`.
- Deletion is audit-logged with actor member ID, group ID, file ID, original filename, timestamp.

---

# 2. Additions to Section 3.4 Event Participation

### M_Register_For_Event (revised)

Access: Members can register for events.

Story: As a member, I can register for an event so that I can participate.

Success Criteria:

- Event registration with participant tracking and (optional) capacity enforcement.
- Registration confirmation email sent to member.
- System confirms registration and sends reminder email one week before event.
- After tournament, member profile will automatically link to event results page (for every event they have participated in that posted results).
- Registration includes a required selection of registration type: Competitor or Attendee/Supporter (if the organizer has enabled both; otherwise the single available type is implied).
- If Competitor: member selects one or more organizer-defined event categories.
- If a selected category is doubles/team: member provides partner/team information (member-select when possible; otherwise free-text).
- If a selected category is mixed doubles: both member profiles must have sex fields populated, one Male and one Female. Other event categories also require sex fields, such as Women's net. Note that men and women can both play in the Open category.
- If Attendee/Supporter: no categories are required; optional fields may be collected if configured by organizer (e.g., t-shirt size, donation amount).
- Confirmation email includes registration type and selected categories and/or partners (if any).
- Some events are free and others are paid.
- For paid events, the member must complete the Stripe checkout process to be officially registered. Changes are applied only after webhook-confirmed success.
- Event registration payments affect registration status only and do not directly change membership tier.
- When the registered participant count reaches the event's (optional) capacity limit, the event status automatically changes to `registration_full`. Subsequent registration attempts receive the message: "This event has reached capacity and is no longer accepting registrations." No waitlist functionality exists.
- If the registrant selects a category where the event organizer has set `requires_routine_music=true` (a new boolean on event categories, settable in `EO_Edit_Event`), the registration is marked incomplete until the member uploads an mp3 routine-music file via `M_Upload_Routine_Music` for that registration entry.
- If the registrant has not uploaded the required routine music by the event registration deadline, the registration remains incomplete and is treated as not-confirmed for participant counts, exports, and check-in.
- Registrants receive an email reminder at admin-configurable offsets before the deadline (`routine_music_reminder_days_1` default 7 days, `routine_music_reminder_days_2` default 1 day) when a required upload is missing.
- For doubles or team routine categories, the registering member uploads on behalf of the entire entry; partners do not have independent upload access in Phase 1.

### M_Upload_Routine_Music

Access: Members registered in an event category with `requires_routine_music=true` can upload, replace, delete, and play back their own routine-music file for that registration entry.

Story: As a freestyle competitor registered in a routine category, I can upload my routine music as an mp3 file so that the event organizer can play it during my performance, and I can verify my upload before the event.

Success Criteria:

- Upload form is available only to members with a registration in a category where `requires_routine_music=true`, and only before the event's registration deadline.
- Accepted format: mp3 (Phase 1). Other audio formats are rejected with a clear error message. Future-phase support for additional formats is admin-configurable.
- Maximum file size is admin-configurable (`routine_music_max_size_mb`, default 20 MB). Oversized files are rejected with a clear error message.
- File is stored in private object storage (e.g., S3) and served via short-lived signed URLs only to (a) the uploading competitor for playback verification and (b) the event organizer(s) via `EO_Play_Routine_Music`. The file is never publicly accessible.
- Each upload creates or replaces a `routine_music_files` row tied to the specific registration entry (member ID + event ID + category ID). Replacement overwrites the prior file; no version history is retained.
- Competitor can delete their uploaded file before the registration deadline; deletion removes the file from object storage and the row, and reverts the registration to incomplete per the rules in `M_Register_For_Event`.
- After the registration deadline closes, the competitor can no longer upload, replace, or delete; the file is locked for the event.
- Competitor can play back their own file at any time from upload through event end via a short-lived signed URL.
- After event end, the file remains accessible to the event organizer(s) only for an admin-configurable retention window (`routine_music_post_event_retention_days`, default 90 days), after which the file is auto-purged.
- All upload, replace, delete, and purge actions are audit-logged with member ID, event ID, category ID, file ID, action, timestamp.

---

# 3. Group Owner Stories (new top-level section, parallel to Section 5 Club Leader Stories)

Group Owners are members designated by an Admin at group creation time. Owners can invite up to 4 co-owners who share identical group management permissions. Owner permissions are group-scoped: owning one group grants permissions only for that group. Members may own multiple groups simultaneously.

## Group Lifecycle (note)

The group lifecycle (create, archive) is Admin-controlled and lives in `A_Create_Group` and `A_Archive_Group`. Owners do not create or archive groups. Owners can leave the group they own via `GO_Leave_Group` subject to the sole-owner promotion-first rule.

## Group Management

### GO_Edit_Group

Access: Group owners (including co-owners) and Admins can edit the owner-managed group fields.

Story: As a group owner, I can edit my group's description and member-facing notes so that I keep the group's purpose and announcements current.

Success Criteria:

- Owner can edit: description (long-form text) and short member-facing notes (e.g., next meeting time, agenda link).
- Owner cannot edit: name, type, official, policy (public/private), restrict_membership, email_enabled, active, alias_keyword, parent_group_id. Those properties are Admin-only via `A_Edit_Group_Properties`.
- Co-owners can edit all owner-editable fields.
- All edits are audit-logged with actor identity, fields changed, old values, new values, timestamp.
- Owner sees a clear success message on save and clear validation errors otherwise.

### GO_Manage_Members

Access: Group owners (including co-owners) and Admins can add or remove members of the group.

Story: As a group owner, I can add or remove members of my group so that I maintain the group's roster.

Success Criteria:

- Owner can add any Tier 1+ member to the group by member ID or via member search.
- Owner can remove any current member from the group, subject to the sole-owner protection (an owner cannot remove the only owner; a successor must be promoted first via `GO_Manage_CoOwners`).
- Add and remove behavior applies regardless of the group's `restrict_membership` flag; the flag controls only self-join, not owner-driven adds.
- If the group has an enabled `MailingList`, add/remove operations insert or remove the corresponding auto-sync `MailingListSubscription` row in the same transaction.
- Adding a member sends a notification email to the added member and to all current owners.
- Removing a member sends a notification email to the removed member and to all current owners.
- All add and remove actions are audit-logged with actor identity, group ID, target member ID, action, timestamp.
- After any roster change, the system re-evaluates group operability and creates or updates a "Group Needs Owner" admin work queue item if the owner count is zero.

### GO_Manage_CoOwners

Access: Any owner of a group can manage co-owners for that group.

Story: As a group owner, I can add, view, and remove co-owners so that I share group management responsibility. A group owner cannot remove themself if the only owner; they must first promote someone else.

Success Criteria:

- Any owner can add up to 4 co-owners by member ID. Maximum 5 total owners per group.
- System sends an email to a new co-owner with: group name, owner responsibilities.
- Co-owner gains identical group management permissions as the original owner.
- Owners can view the list of all current co-owners; list shows display name, date added.
- Co-owner can opt out of the owner role via the member dashboard.
- The UI hides the remove-self action when the current authenticated owner is the sole owner of the group.
- All co-owner actions are audit-logged.
- After any owner-roster change, the system re-evaluates group operability and creates or updates a "Group Needs Owner" admin work queue item if the count is zero.

### GO_Configure_Email_Settings

Access: Group owners (including co-owners) and Admins can configure the group's mailing-list behavior, when email is enabled by Admin.

Story: As a group owner, I can configure the email-handling behavior for my group's alias so that group communications match the group's working style.

Success Criteria:

- Configuration view is available only when the group has email enabled by Admin (`email_enabled=true`).
- Owner can toggle `moderated` (bool, default false). When true, outgoing messages from `M_Email_Group` enter a pending queue for owner approval via `GO_Moderate_Email_Queue`.
- Owner can toggle `restricted_sending` (bool, default true for group lists). When true, only current group members can compose messages to the alias via `M_Email_Group`. When false, any logged-in member may compose.
- Owner can set `subject_prefix` (string, max 32 chars, may be empty). When non-empty, prepended to outgoing subjects in the form `[prefix] subject`.
- Owner cannot enable or disable the alias itself, nor change the alias keyword. Those are Admin-only via `A_Edit_Group_Properties`.
- All configuration changes are audit-logged with actor identity, group ID, field changed, old value, new value, timestamp.

### GO_Moderate_Email_Queue

Access: Group owners (including co-owners) and Admins can review the moderated message queue for the group when `moderated=true`.

Story: As a group owner, I can review pending moderated messages to my group's alias so that I approve appropriate communications and reject inappropriate ones.

Success Criteria:

- Queue is visible only when the group's `moderated=true`.
- Each pending entry shows: sender display name, subject, full message body, submission timestamp.
- Approve dispatches the message via the outbox to all current group members and creates the standard archive record per `A_Send_Mailing_List_Email`.
- Reject does not dispatch the message; the sender is notified by email with the owner's optional reason text.
- Approve and reject actions are audit-logged with actor identity, message ID, decision, optional reason, timestamp.
- Pending messages older than an admin-configurable threshold (`group_email_moderation_expiry_days`, default 30 days) are auto-rejected with a system reason and the sender is notified.

### GO_Delete_Any_Group_File

Access: Group owners (including co-owners) and Admins can delete any file in the group.

Story: As a group owner, I can delete any file in my group so that I can remove inappropriate or obsolete documents.

Success Criteria:

- Owner-initiated deletion permanently removes the file from object storage and the `group_files` row.
- Deletion sends an email notification to the original uploader (if the uploader was not the deleting owner) with the filename, owner identity, and optional owner-provided reason.
- Deletion is audit-logged with actor member ID, group ID, file ID, original filename, original uploader member ID, timestamp, reason.

### GO_Leave_Group

Access: A group owner can leave the group they own, subject to the sole-owner promotion-first rule.

Story: As a group owner, I can leave my group so that I am removed from it. If I am the sole owner, I must first promote a successor via `GO_Manage_CoOwners`.

Success Criteria:

- If the owner is the sole owner of the group, the leave action is disabled with an explanation pointing to `GO_Manage_CoOwners`.
- If the owner has co-owners, the leave action proceeds with the same semantics as `M_Leave_Group` and additionally removes the owner role row in the same transaction.
- All actions are audit-logged.

---

# 4. Additions to Section 4 Event Organizer Stories

### EO_Edit_Event (revised) (target: 4.1)

Access: Event organizers can edit events they are assigned to, within the constraints for free vs sanctioned events.

Story: As an event organizer, I can edit event details so that I can update information or correct errors.

Success Criteria:

- All fields may be edited except free/sanctioned status.
- Co-organizers can edit all event fields.
- All edits audit-logged with organizer ID, fields changed, old values, new values, timestamp.
- Organizers see a clear success message when event is updated.
- Organizer sees clear error messages for validation failures.
- Organizers can mark any category on the event as `requires_routine_music=true` (default `false`). The flag is freely editable until the first registration in that category is confirmed; after the first confirmed registration, changes to this flag for that category require admin override with a documented reason.
- Organizers can add, rename, or remove categories on an existing event before the first registration in that category is confirmed. After the first confirmed registration, destructive changes to that specific category require admin override.
- Organizers can enable or disable the event's online registration acceptance via a toggle that stops new registrations without changing event status. This is the granular alternative to `EO_Close_Registration`, which closes the entire registration window irreversibly.

## 4.2 Registration Management additions

### EO_View_Registration_Summary

Access: Event organizers can view a per-event registration summary dashboard for events they organize.

Story: As an event organizer, I can view a registration summary dashboard for my event so that I can plan logistics, fees, t-shirts, and capacity at a glance.

Success Criteria:

- Dashboard is scoped to a single event and accessible only to that event's organizer(s) and Admins.
- Dashboard displays: total registered count, breakdown by registration type (Competitor / Attendee-Supporter), per-category registration counts, payment status summary (paid / pending / failed counts and amounts in the event's currency), capacity utilization vs configured capacity limit, registration timeline (count per day from registration open to current time).
- Dashboard displays t-shirt size summary if the event collects t-shirt sizes.
- For categories with `requires_routine_music=true`, dashboard displays a routine-music status summary: count of registrations with file uploaded vs missing.
- Counts update via SQL query on demand; no caching beyond standard request scope.
- Dashboard view is audit-logged with organizer ID, event ID, timestamp.

### EO_Export_Check_In_Template

Access: Event organizers can export a printable check-in template for their events.

Story: As an event organizer, I can export a printable check-in template so that I can run on-site check-in with a paper or PDF roster.

Success Criteria:

- Export generates a print-styled HTML page or PDF, admin-configurable via `checkin_template_format` (default `html`). Distinct from the CSV produced by `EO_Export_Participants`.
- Each row includes: participant display name, registration type, selected categories, partner or team info if applicable, payment status, a check-in checkbox column, and a notes column.
- Rows are sorted alphabetically by participant display name (default) or by registration type.
- Document title or filename format: `eventname_checkin_YYYYMMDD`.
- Export action is audit-logged with organizer ID, event ID, format, timestamp.

## 4.5 Music Operations (new subsection)

### EO_Play_Routine_Music

Access: Event organizers can list, play, and download all routine-music files uploaded for events they organize.

Story: As an event organizer, I can list and play the routine-music files for my event so that I can play the correct music during each competitor's performance.

Success Criteria:

- List shows all routine-music files for the event, grouped by category and sorted alphabetically by competitor display name within each category.
- Each entry shows: competitor display name, partner or team info if applicable, category, original filename, file size, upload timestamp.
- Organizer can play any file directly in the browser via short-lived signed URLs; playback is HTML5 audio with standard controls (play, pause, seek, volume).
- Organizer can download any file for offline use during the event.
- Files are accessible from upload through an admin-configurable post-event retention window (`routine_music_post_event_retention_days`, default 90 days), after which files are auto-purged. After purge, the entry is shown as "expired" with no playback or download.
- All listing, play, and download actions are audit-logged with organizer ID, event ID, file ID, action, timestamp.

---

# 5. Revised story in Section 6.4 Vote Management

### A_Create_Vote (revised)

Access: Only admins can configure and create voting topics.

Story: As an Administrator, I can create a vote (election or issue vote) so that eligible members can participate securely within a defined window.

Success Criteria:

- Admin defines: title, description, vote type (Election / Issue), nomination window (optional), voting window, ballot type (single-choice / multi-choice), and background materials (text + links/attachments).
- Admin defines eligibility rules using member attributes and flags (Tier status, HoF, BAP, Board flags) or an explicit inclusion list. The eligibility rule set also includes `members_of_group(group_id)`: when this rule is configured, eligible voters are members where `group_member_affiliations.group_id = group_id AND is_current = 1`, evaluated and snapshotted at vote-open time. Eligibility predicates can be combined (for example: Tier 2 AND `members_of_group(finance_committee)`).
- System validates: date ordering, required fields, and that eligibility rules are internally consistent.
- System generates a unique vote ID and audit-log record of creation.
- For HoF elections, any member can submit nominations during the nomination window, but to be included in the ballot, the nominated candidates must provide an affidavit that explains their qualifications, basically their footbag career achievements. This information will be included as part of the vote's background materials.
- Eligibility for candidates/options is enforced by the vote's configured rules.
- At ballot open, the set of options is locked.
- Eligibility Changes: Members cannot gain or lose eligibility after vote opens, ensuring fairness.
- Eligibility is evaluated and snapshotted at the moment the vote transitions to `open` status. Eligible members at vote-open time are written as rows into `vote_eligibility_snapshot_base`. Members retain voting rights for the full voting window even if their tier, flags, or group membership change while the vote is open.
- Group-scoped votes follow the same encryption, receipt-token, decrypt-audit, and tally rules as all other votes; there is no lightweight or non-encrypted variant.
- If the referenced group in a `members_of_group` rule is archived after the vote opens but before the vote closes, the open vote continues to completion using the frozen snapshot; the system creates an admin notification but does not cancel the vote automatically.

---

# 6. Revised stories in Section 6.5 Email

### A_Manage_Mailing_Lists (revised)

Access: Only admins can view and manage mailing lists. The only exception is EO_Email_Participants.

Story: As an administrator, I can create, update, and archive mailing lists that are backed by MailingList and MailingListSubscription data objects, so that we can manage bulk email communications in a controlled and auditable way without hard-coding specific lists.

Success Criteria:

- The system seeds an initial set of core MailingList records (for example: newsletter, board-announcements, event-notifications, technical-updates, admin-alerts), but these are only an initial default set, not the full or fixed set of lists.
- Admins can create additional MailingList records at any time (for example: regional lists, project-specific lists), by specifying name, description, and whether the list is member-manageable or admin-only.
- For each MailingList, admins can view key analytics including total subscribers and counts by status (subscribed, unsubscribed, bounced, complained), based on MailingListSubscription records.
- Admins can change a MailingList's status to archived so that it no longer appears in member subscription controls or new email send flows, while all historical mailing data and subscriptions remain preserved for audit and reporting.
- For member-manageable lists, subscription/unsubscription is primarily controlled by the member from their profile page; admins can only make limited manual adjustments in exceptional cases (for example to handle bounced or complaint states), and all such manual changes are audit-logged with admin identity, timestamp, and reason.
- For admin-only lists (for example admin-alerts), subscriptions are controlled by admin configuration or system roles rather than member toggles, and the rules for who is subscribed are clearly documented in the list metadata.
- `MailingList` records support three admin-configurable behavior fields: `subject_prefix` (string, max 32 chars, default empty; when non-empty, prepended to outgoing subjects in the form `[prefix] subject`); `moderated` (bool, default false; when true, outgoing messages are queued for owner approval via `GO_Moderate_Email_Queue`); and `restricted_sending` (bool, default false for general lists and default true for group-auto-sync lists; when true, only the configured allowed-sender population may compose).
- `MailingList` records support an `auto_sync_by_group` mode. When set to a group ID, the list's `MailingListSubscription` rows are managed automatically by the group membership system (`M_Join_Group`, `M_Leave_Group`, `GO_Manage_Members`, `A_Reassign_Group_Owner`). Manual subscription edits by members or by admins on auto-sync lists are blocked except for bounce or complaint state handling.
- Auto-sync `MailingList` records are excluded from the member-facing `M_Manage_Email_Subscriptions` view because the member cannot unilaterally unsubscribe; the member leaves the group to be removed from the list.
- When an Admin enables email on a group via `A_Create_Group` or `A_Edit_Group_Properties`, the system creates the associated `MailingList` in `auto_sync_by_group=<group_id>` mode and seeds the subscription rows from current group membership.
- When an Admin disables email on a group, the associated `MailingList` is archived per the existing archive semantics and accepts no further sends.

### A_Send_Mailing_List_Email (revised)

Access: Only Admins and Event Organizers can send email to general mailing lists from the platform. Exception: the IFPA announce list (announce@footbag.org) may be sent to by any Tier 2 or Tier 3 member, as defined in M_Send_Announce_Email. Group-scoped alias sending is handled via `M_Email_Group`, not via this story; admins retain the ability to send to a group's associated auto-sync `MailingList` via this story for exceptional platform-level notifications.

Story: As an admin, I can send announcements to a platform-configured mailing list so that I communicate with the community.

Success Criteria:

- Admin composes email and selects target list (newsletter, announcements, board-updates, and group auto-sync lists in exceptional cases).
- Organization-wide announce list is retained; only Admins may send to general mailing lists through this story. Exception: the IFPA announce list (announce@footbag.org) may be sent to by any Tier 2 or Tier 3 member via M_Send_Announce_Email; the Admin-only rule applies to all other mailing lists managed through this story.
- Group-scoped alias sending is the responsibility of `M_Email_Group`, including the `restricted_sending`, `moderated`, and `subject_prefix` behaviors. Admin sends via this story to a group's auto-sync `MailingList` bypass owner moderation and `restricted_sending` and are intended for critical platform notifications that must reach the group regardless of owner moderation state. Such admin overrides are audit-logged with admin ID, group ID, list ID, subject, recipient count, and timestamp.
- System enumerates recipients from MailingListSubscription records for the chosen MailingList, applying subscription status.
- Sends to all subscribed members via outbox pattern.
- Email delivery respects bounce list.
- All sends logged to audit trail.
- All bulk emails include unsubscribe or preferences links. For auto-sync lists, the unsubscribe link routes to the group's page with a leave-group action rather than to a per-list unsubscribe page.
- Delivery status visible: senders see sent, bounced, and suppressed counts.
- Each mailing list has a configurable outbound alias/from-identity (e.g., directors@…, sanctioning@…). This can be set to no-reply, a special case.
- Each sent mailing list email is archived (subject/body/sender/list/timestamp/recipient count) and browseable by admins.
- Email body is plain text (no HTML).
- No approval workflow is required; controls are permissions, audit logging, unsubscribe links, and rate limits where applicable.

---

# 7. Group Management (new Administrator subsection, target: new 6.X within Section 6 Administrator Stories)

### A_Create_Group

Access: Only Admins can create groups, regardless of type.

Story: As an Admin, I can create a group with all configurable properties and assign its initial owner so that I provision IFPA governance, working, and social groups.

Success Criteria:

- Form includes: name (required, max 80 chars, not required to be globally unique); description (long-form text); type (enum: `group`, `committee`, `board`, `panel`, `fellows`); official (bool, default false); policy (enum: `public`, `private`, default `private`); restrict_membership (bool, default true); email_enabled (bool, default false); alias_keyword (required and unique if `email_enabled=true`, max 32 chars, lowercase alphanumeric and hyphen); active (bool, default true); parent_group_id (optional, must reference an existing non-archived group); initial owner member ID (required, must be a Tier 1+ member).
- If `email_enabled=true`, the system creates an associated `MailingList` in `auto_sync_by_group=<group_id>` mode with the configured `alias_keyword`, applies admin-set defaults for `subject_prefix`, `moderated`, and `restricted_sending`, and seeds the subscription with the initial owner.
- The initial owner receives an email notification with the group name, type, and owner responsibilities.
- Admin sees a clear success message and a link to the newly created group's page.
- Validation errors (e.g., alias keyword collision, invalid parent_group_id, initial owner not Tier 1+) are surfaced with specific messages and the form preserves user input.
- Creation is audit-logged with admin ID, group ID, all property values, initial owner ID, timestamp.

### A_Edit_Group_Properties

Access: Only Admins can edit admin-controlled group properties.

Story: As an Admin, I can edit admin-controlled group properties so that I can adjust governance settings, rename groups, toggle the official flag, change visibility, enable or disable email, change membership restriction, and reparent subcommittees.

Success Criteria:

- Admin can edit: name, type, official, policy (public/private), restrict_membership, email_enabled, alias_keyword (when email_enabled), active, parent_group_id.
- Admin cannot edit owner-editable fields (description, member-facing notes) via this story; those are managed in `GO_Edit_Group`. An Admin who is also a group owner can edit both surfaces via their respective routes.
- Enabling email on a previously disabled group creates the associated `MailingList` and seeds the subscription from current group membership.
- Disabling email on a previously enabled group archives the associated `MailingList`.
- Setting `active=false` hides the group from `M_Browse_Groups_Directory` but preserves member access via direct URL. Setting `active=true` restores directory visibility.
- Changing `restrict_membership` from false to true does not remove existing members but blocks future self-joins via `M_Join_Group`.
- Changing `parent_group_id` does not move members, files, ballots, or email; the change is navigational only.
- Renaming the group preserves the existing member set, files, ballots, mailing list, and audit history. Changing the `alias_keyword` requires email to be enabled; the rename takes effect for future outgoing messages.
- All edits are audit-logged with admin ID, group ID, fields changed, old values, new values, timestamp.

### A_Reassign_Group_Owner

Access: Only Admins can reassign group ownership and remediate "Group Needs Owner" admin work-queue items.

Story: As an Admin, I have full control over group owner rosters so that groups remain operable when leadership breaks down.

Success Criteria:

- Admin can assign a group owner from the member base (audit-logged).
- Admin can demote a group owner or co-owner back to ordinary group member, or remove their affiliation entirely (audit-logged with mandatory reason text).
- Admin can change a member's role between owner and co-owner within a group, subject to the sole-owner-promotion-first invariant.
- Admin can override the application-level 5-owner cap when adding a new owner, with an explicit `cap-override` reason recorded in the audit row.
- Groups with zero owners are flagged "Group Needs Owner" and appear in an admin work queue.
- Admin can resolve a "Group Needs Owner" item by assigning a new owner via this story, or by archiving the group via `A_Archive_Group` if defunct.
- All admin owner-management actions are audit-logged with actor identity, timestamp, before and after values, and reason text.

### A_Archive_Group

Access: Only Admins can archive a group.

Story: As an Admin, I can archive a defunct group so that I can remove it from active operation while preserving historical record.

Success Criteria:

- Archiving sets the group's status to `archived`. Group records are never permanently deleted and do not use the soft-delete (`deleted_at`) pattern.
- Archived groups are excluded from `M_Browse_Groups_Directory`, from `M_View_Group` access for non-admins, and from all email send flows. Admins retain read access to archived groups for audit purposes.
- Each remaining `group_member_affiliations` row for the archived group has `is_current` set to 0. Rows are preserved so historical affiliation is recoverable.
- The associated `MailingList` (if any) is archived in the same transaction per the existing archive semantics.
- Subcommittees of the archived group (rows with `parent_group_id` pointing to the archived group) are not auto-archived; the Admin must archive them separately if appropriate. The `parent_group_id` reference remains valid for historical navigation, even though the parent is archived.
- Group-scoped active votes (per `A_Create_Vote` with `members_of_group(group_id)` eligibility) are not canceled automatically; the system creates an admin notification recommending review via `A_Cancel_Vote`.
- Archive action is audit-logged with admin ID, group ID, reason, timestamp.

---

# 8. Open product questions deferred for review

These are small TBDs that did not block drafting and can be resolved during integration. None of them changes the structural shape of the proposed stories.

- **Group alias domain:** `<keyword>@footbag.org` vs `<keyword>@ifpa.footbag.org` vs another convention. The success criteria in `A_Create_Group` and `A_Edit_Group_Properties` use the alias keyword without committing to the domain. Confirm the canonical form at integration time so the right phrasing lands in the canonical doc.
- **Group active flag vs archive:** the `active` flag is drafted as a directory-visibility toggle (member access preserved). Archive is terminal. Confirm this two-state separation matches your intent.
- **Group ownership cap:** drafted at 1 owner + 4 co-owners (mirrors clubs and events). Confirm.
- **Subcommittee depth limit:** drafted as unlimited (a subcommittee may itself have subcommittees). Confirm or pick a cap.
- **Routine music post-event retention default:** drafted at 90 days; confirm or set a different default.
- **Routine music format whitelist:** drafted as mp3-only for Phase 1; confirm or expand to include m4a/wav.
- **Group file format whitelist and size limit:** drafted as PDF/DOCX/XLSX/TXT/MD/PNG/JPEG and 25 MB; confirm or adjust.
- **David's preview access:** during integration, an Admin can create a preview group with David as owner so he can exercise the surfaces directly. Not a design question; flagged so it is not forgotten.
- **Where `EO_Play_Routine_Music` lives:** drafted in a new 4.5 Music Operations subsection. If you prefer, fold it into 4.2 Registration Management. Confirm at integration time.

---

# 9. Downstream impact

If approved, this set of additions will likely require downstream updates outside `docs/USER_STORIES.md`:

- **`docs/DATA_MODEL.md` and `database/schema.sql`:** new tables `groups`, `group_member_affiliations`, `group_files`, `routine_music_files`; new columns on `mailing_lists` (`subject_prefix`, `moderated`, `restricted_sending`, `auto_sync_by_group`); new column on event categories (`requires_routine_music`); new eligibility rule type for `A_Create_Vote` snapshot.
- **`docs/VIEW_CATALOG.md`:** new public-page entries for the member groups directory and group page (private and member-only surfaces); registration summary dashboard; check-in template export; routine music playback view.
- **`docs/SERVICE_CATALOG.md`:** new service ownership (`GroupService`, `GroupFileStorageAdapter`, `RoutineMusicService` or extension of `MediaService` for binary audio); extensions to `MailingListService`, `VoteService`, `EventService`.
- **Auth and authorization:** new permission predicates (group member, group owner, group co-owner, group-and-admin); new access-denied paths for non-members of private groups.
- **Object storage:** new private bucket or path namespace for group files and routine music files, served via short-lived signed URLs. Distinct from the existing public photo/video storage.
- **Email / outbox:** moderation queue surface; auto-sync subscription syncing; subject-prefix and restricted-sending enforcement in the send pipeline.
- **Background jobs:** new auto-purge job for expired routine music files; new auto-reject job for stale moderated messages.
- **Admin work queue:** new "Group Needs Owner" item type; surfacing of moderated-message backlog metrics where useful.
- **Tests:** new route tests for all new stories; integration tests for group membership transactions, mailing-list auto-sync, file access enforcement, routine music retention sweep, vote eligibility snapshot including group membership.
