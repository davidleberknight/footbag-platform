# Footbag Website Modernization Project -- User Stories

**Document Purpose:**

This document is the Source of Truth for Functional Requirements, defining all User Stories and their user-facing implications for the Footbag Website Modernization Project. It covers all user roles: Visitor, Member (includes Event Organizer and Club Leader), Administrator, and system background processes, plus special flags for the IFPA Board, Hall of Fame (HoF) and Big Add Posse (BAP). Together these User Stories define the complete scope, describing what functionality must exist for users, and success criteria (system side effects).

## Table of Contents

- [1. Global Behaviors](#1-global-behaviors)
  - [1.1 Hashtags](#11-hashtags)
  - [1.2 IFPA Membership Rules Reference and Terminology](#12-ifpa-membership-rules-reference-and-terminology)
- [2. Visitor Stories](#2-visitor-stories)
  - [2.1 Content Discovery](#21-content-discovery)
    - [V_Browse_Static_Content](#v_browse_static_content)
    - [V_Browse_Clubs](#v_browse_clubs)
    - [V_Browse_Upcoming_Events](#v_browse_upcoming_events)
    - [V_Browse_Past_Events](#v_browse_past_events)
    - [V_View_News_Feed](#v_view_news_feed)
    - [V_View_Tutorials](#v_view_tutorials)
    - [V_View_Gallery](#v_view_gallery)
    - [V_View_Trick_Reference_Videos](#v_view_trick_reference_videos)
    - [V_Browse_Hashtags](#v_browse_hashtags)
    - [V_Access_Denied](#v_access_denied)
    - [V_Not_Found](#v_not_found)
    - [V_Error_or_Maintenance_Mode](#v_error_or_maintenance_mode)
    - [V_Register_Account](#v_register_account)
- [3. Member Stories](#3-member-stories)
  - [3.1 Account Lifecycle](#31-account-lifecycle)
    - [M_Login](#m_login)
    - [M_Verify_Email](#m_verify_email)
    - [M_Reset_Password](#m_reset_password)
    - [M_Change_Password](#m_change_password)
    - [M_Logout](#m_logout)
    - [M_Delete_Account](#m_delete_account)
    - [M_Restore_Account](#m_restore_account)
    - [M_Download_Data](#m_download_data)
    - [M_Browse_Legacy_Archive](#m_browse_legacy_archive)
    - [M_Claim_Legacy_Account](#m_claim_legacy_account)
    - [M_Complete_Onboarding_Wizard](#m_complete_onboarding_wizard)
  - [3.2 Profile Management](#32-profile-management)
    - [M_Edit_Profile](#m_edit_profile)
    - [M_Contact_IFPA_Admin](#m_contact_ifpa_admin)
    - [M_Search_Members](#m_search_members)
    - [M_View_Profile](#m_view_profile)
  - [3.3 Club Membership](#33-club-membership)
    - [M_Join_Club](#m_join_club)
    - [M_Leave_Club](#m_leave_club)
    - [M_View_Club](#m_view_club)
  - [3.4 Event Participation](#34-event-participation)
    - [M_Register_For_Event](#m_register_for_event)
    - [M_Upload_Routine_Music](#m_upload_routine_music)
    - [M_Manage_Routine_Music_Library](#m_manage_routine_music_library)
    - [M_View_Event](#m_view_event)
  - [3.5 Payments](#35-payments)
    - [M_Donate](#m_donate)
    - [M_View_Payment_History](#m_view_payment_history)
  - [3.6 Membership Tiers and Flags](#36-membership-tiers-and-flags)
    - [M_Purchase_Tier_1](#m_purchase_tier_1)
    - [M_Purchase_Tier_2](#m_purchase_tier_2)
    - [M_View_Tier_Status](#m_view_tier_status)
    - [M_Active_Player_Expiry](#m_active_player_expiry)
    - [M_Vouch_For_Active_Player](#m_vouch_for_active_player)
  - [3.7 Voting](#37-voting)
    - [M_View_Vote_Options](#m_view_vote_options)
    - [M_Vote](#m_vote)
    - [M_Verify_Vote_And_View_Results](#m_verify_vote_and_view_results)
    - [M_Nominate_HoF_Candidate](#m_nominate_hof_candidate)
    - [M_Submit_HoF_Affidavit](#m_submit_hof_affidavit)
  - [3.8 Media Sharing](#38-media-sharing)
    - [M_Upload_Photo](#m_upload_photo)
    - [M_Submit_Video](#m_submit_video)
    - [M_Organize_Media_Galleries](#m_organize_media_galleries)
    - [M_Delete_Own_Media](#m_delete_own_media)
    - [M_Flag_Media](#m_flag_media)
  - [3.9 Email](#39-email)
    - [M_Manage_Email_Subscriptions](#m_manage_email_subscriptions)
    - [M_Send_Announce_Email](#m_send_announce_email)
  - [3.10 Group Membership](#310-group-membership)
    - [M_Browse_Groups_Directory](#m_browse_groups_directory)
    - [M_View_Group](#m_view_group)
    - [M_Join_Group](#m_join_group)
    - [M_Leave_Group](#m_leave_group)
    - [M_Email_Group](#m_email_group)
    - [M_Upload_Group_File](#m_upload_group_file)
    - [M_View_Group_Files](#m_view_group_files)
    - [M_Delete_Own_Group_File](#m_delete_own_group_file)
- [4. Event Organizer Stories](#4-event-organizer-stories)
  - [4.1 Event Lifecycle](#41-event-lifecycle)
    - [Event Status Lifecycle](#event-status-lifecycle)
    - [M_Create_Event](#m_create_event)
    - [EO_Edit_Event](#eo_edit_event)
    - [EO_Delete_Event](#eo_delete_event)
    - [EO_Manage_CoOrganizers](#eo_manage_coorganizers)
  - [4.2 Registration Management](#42-registration-management)
    - [EO_View_Participants](#eo_view_participants)
    - [EO_Close_Registration](#eo_close_registration)
    - [EO_Export_Participants](#eo_export_participants)
    - [EO_View_Registration_Summary](#eo_view_registration_summary)
    - [EO_Export_Check_In_Template](#eo_export_check_in_template)
  - [4.3 Communication](#43-communication)
    - [EO_Email_Participants](#eo_email_participants)
  - [4.4 Results Publishing](#44-results-publishing)
    - [EO_Upload_Results](#eo_upload_results)
  - [4.5 Music Operations](#45-music-operations)
    - [EO_Play_Routine_Music](#eo_play_routine_music)
- [5. Club Leader Stories](#5-club-leader-stories)
  - [5.1 Club Lifecycle](#51-club-lifecycle)
    - [M_Create_Club](#m_create_club)
    - [CL_Edit_Club](#cl_edit_club)
    - [CL_Mark_Club_Inactive](#cl_mark_club_inactive)
    - [CL_Archive_Club](#cl_archive_club)
  - [5.2 Leadership Management](#52-leadership-management)
    - [CL_Manage_CoLeaders](#cl_manage_coleaders)
- [6. Group Owner Stories](#6-group-owner-stories)
  - [6.1 Group Management](#61-group-management)
    - [GO_Edit_Group](#go_edit_group)
    - [GO_Manage_Members](#go_manage_members)
    - [GO_Manage_CoOwners](#go_manage_coowners)
    - [GO_Configure_Email_Settings](#go_configure_email_settings)
    - [GO_Moderate_Email_Queue](#go_moderate_email_queue)
    - [GO_Delete_Any_Group_File](#go_delete_any_group_file)
    - [GO_Leave_Group](#go_leave_group)
- [7. Administrator Stories](#7-administrator-stories)
  - [7.1 Event and Payments](#71-event-and-payments)
    - [A_Approve_Sanctioned_Event](#a_approve_sanctioned_event)
    - [A_Reconcile_Payments](#a_reconcile_payments)
  - [7.2 Data Management](#72-data-management)
    - [A_Override_Member_Data](#a_override_member_data)
    - [A_Grant_HoF_BAP_Board_Status](#a_grant_hof_bap_board_status)
    - [A_View_Member_History](#a_view_member_history)
    - [A_View_Official_Roster_Reports](#a_view_official_roster_reports)
    - [A_Reassign_Club_Leader](#a_reassign_club_leader)
    - [A_Reassign_Event_Organizer](#a_reassign_event_organizer)
    - [A_Fix_Event_Results](#a_fix_event_results)
    - [A_Mark_Member_Deceased](#a_mark_member_deceased)
    - [A_Periodic_Club_Cleanup](#a_periodic_club_cleanup)
  - [7.3 Content Moderation](#73-content-moderation)
    - [A_Moderate_Media](#a_moderate_media)
    - [A_Upload_Curated_Media](#a_upload_curated_media)
    - [A_Create_News_Item](#a_create_news_item)
    - [A_Moderate_News_Item](#a_moderate_news_item)
    - [A_Archive_Club](#a_archive_club)
  - [7.4 Vote Management](#74-vote-management)
    - [A_Create_Vote](#a_create_vote)
    - [A_Publish_Vote_Results](#a_publish_vote_results)
    - [A_Cancel_Vote](#a_cancel_vote)
  - [7.5 Email](#75-email)
    - [A_Send_Mailing_List_Email](#a_send_mailing_list_email)
    - [A_Manage_Mailing_Lists](#a_manage_mailing_lists)
  - [7.6 System Configuration](#76-system-configuration)
    - [A_View_Stripe_Config_And_Payments](#a_view_stripe_config_and_payments)
    - [A_Configure_System_Parameters](#a_configure_system_parameters)
    - [A_Manage_Admin_Role](#a_manage_admin_role)
  - [7.7 Configurable Parameters](#77-configurable-parameters)
    - [Membership Pricing / Dues (IFPA-derived)](#membership-pricing-dues-ifpa-derived)
    - [Active Player Windows / Lifecycle](#active-player-windows-lifecycle)
    - [Email / Notifications / Outbox](#email-notifications-outbox)
    - [Auth / Security Tokens](#auth-security-tokens)
    - [Retention / Cleanup](#retention-cleanup)
  - [7.8 Monitoring and Audit](#78-monitoring-and-audit)
    - [A_View_Dashboard](#a_view_dashboard)
    - [A_Resolve_Contact_IFPA_Admin_Request](#a_resolve_contact_ifpa_admin_request)
    - [A_View_System_Health](#a_view_system_health)
    - [A_View_Audit_Logs](#a_view_audit_logs)
    - [A_Acknowledge_Alarm](#a_acknowledge_alarm)
  - [7.9 Group Management](#79-group-management)
    - [A_Create_Group](#a_create_group)
    - [A_Edit_Group_Properties](#a_edit_group_properties)
    - [A_Reassign_Group_Owner](#a_reassign_group_owner)
    - [A_Archive_Group](#a_archive_group)
- [8. Background System Jobs](#8-background-system-jobs)
    - [SYS_Check_Active_Player_Expiry](#sys_check_active_player_expiry)
    - [SYS_Send_Email](#sys_send_email)
    - [SYS_Open_Vote](#sys_open_vote)
    - [SYS_Close_Vote](#sys_close_vote)
    - [SYS_Process_One_Time_Payments](#sys_process_one_time_payments)
    - [SYS_Process_Recurring_Donations](#sys_process_recurring_donations)
    - [SYS_Reconcile_Payments_Nightly](#sys_reconcile_payments_nightly)
    - [SYS_Cleanup_Expired_Tokens](#sys_cleanup_expired_tokens)
    - [SYS_Cleanup_Soft_Deleted_Records](#sys_cleanup_soft_deleted_records)
    - [SYS_Rebuild_Hashtag_Stats](#sys_rebuild_hashtag_stats)
    - [SYS_Handle_Stripe_Webhooks](#sys_handle_stripe_webhooks)
    - [SYS_Handle_SES_Bounce_And_Complaint_Webhooks](#sys_handle_ses_bounce_and_complaint_webhooks)
    - [SYS_Nightly_Backup_Sync](#sys_nightly_backup_sync)
    - [SYS_Continuous_Database_Backup](#sys_continuous_database_backup)
    - [SYS_Cleanup_Static_Asset_Versions](#sys_cleanup_static_asset_versions)
- [9. System Administrator Stories](#9-system-administrator-stories)

# 1. Global Behaviors

The following are general rules for all User Stories, where applicable.

Authentication, roles, and sessions: All stories for Members, Event Organizers, Club Leaders, and Administrators roles assume the user is logged in, has a valid session cookie, and holds the required role(s), membership tier, Active Player status where applicable, or special flags. Visitor stories always represent unauthenticated users with no session. System background stories represent automated processes, not logged-in users.

Security and sessions: Authentication uses an HttpOnly, Secure, SameSite=Lax session cookie (JWT). Authenticated state-changing requests must be protected against CSRF and must not perform state changes over GET. The specific CSRF mechanism and request validation rules are defined in the Design Decisions document and must be applied consistently.

Input validation and sanitization: All user-entered text (names, bios, captions, comments, descriptions, etc.) is validated and sanitized to prevent abuse and visual spoofing while remaining usable for international content.

Payment Processing Guarantees: The system does not grant paid access unless Stripe confirms success. Local payment state transitions are monotonic and keyed by Stripe object IDs; duplicates and reordering do not cause double-application. This ordering ensures the system never grants paid features without successful payment. Webhook event processing is idempotent: duplicate webhook deliveries with the same event_id are safely ignored and return 200 OK without reprocessing. This prevents double-processing when Stripe automatically retries webhook delivery. Two payment models are used and each has its own state machine keyed to the appropriate Stripe object:

- One-time payments (membership dues, event registrations, one-time donations): State transitions are keyed by Stripe's payment_intent_id. The enforced state machine is: pending to completed on payment_intent.succeeded; pending to failed on payment_intent.payment_failed; completed to refunded on charge.refunded. Each state transition is recorded in audit logs with timestamp and Stripe event_id. No action is taken on refunds at launch in any case, so the refund concern is theoretical.

- Recurring donations (Stripe Subscriptions): State transitions are keyed by the Stripe subscription_id and invoice_id. The enforced state machine is: active on customer.subscription.created; active (new payment record created) on invoice.payment_succeeded; past_due on invoice.payment_failed (increments a failure counter; Stripe's configured dunning schedule governs retries); canceled on customer.subscription.deleted (triggered after Stripe exhausts all retries, or when canceled by member or admin). Each subscription event is recorded in audit logs with timestamp and Stripe event_id. All webhook event types are deduplicated via the stripe_events table (keyed on Stripe event_id) regardless of payment model.

Currency: The platform supports multi-currency payments via Stripe. Amounts are stored and displayed in the currency of the original transaction. The `currency` field is recorded on all payment records. Reconciliation and reporting display currency alongside amounts. No currency conversion is performed by the platform; Stripe handles currency settlement.

Security tokens: Email verification tokens and password reset tokens are stored in the database as SHA-256 hashes, never as plaintext, preventing account takeover if the database is compromised. Email verification tokens expire after a configurable TTL (default 24 hours, keyed by `email_verify_expiry_hours`) and are marked used via a used_at timestamp after single use. Password reset tokens expire after one hour due to higher sensitivity. Password reset requests are rate-limited to five requests per email per hour, preventing enumeration attacks that reveal valid emails and token farming. The rate limit applies regardless of whether the email exists in the system, with consistent timing to prevent enumeration via timing analysis. Legacy account claim tokens (`account_claim`) expire after 24 hours (configurable via `account_claim_expiry_hours`), are single-use, and are bound to both the requesting authenticated member account and the imported legacy row being claimed. A claim token may only be consumed while authenticated as the same account that initiated the request.

Privacy, visibility, and moderation: Profiles, club rosters, participant lists, and member search results are member-only unless explicitly stated otherwise. Media galleries and tag gallery pages are public, but uploader details (email/phone, uploaded_by) remain private.

Historical imported people may appear in legacy event results and related read-only historical displays even when they are not current Members. This supports historical accuracy only. It does not imply authenticated-member capabilities, profile ownership, member-search inclusion, club-roster visibility, or any other current-member behavior. See DD §2.4 for the foundational entity-type distinction between `members` and `historical_persons`.

Imported legacy member accounts are stored as rows in the `legacy_members` table, created during the one-time migration from the legacy site. They are not `members` rows: they cannot log in, do not appear in member search results or any current-member surface, and do not affect normal registration or password-reset behavior. A legacy member who wants to connect their historical identity and data to a modern account must use the self-serve legacy claim flow while logged in; the claim links their modern `members` row to the `legacy_members` row rather than converting it.

Moderation flows favor transparency and human oversight: when members flag content, flagged items remain visible until an administrator reviews and decides; no content is hidden or de-ranked automatically by secret algorithms.

File upload safety model: the platform does not run an antivirus scanner on member-uploaded files. All accepted file formats are sanitized by construction: the upload is decoded, re-rendered, or re-encoded through a format-specific transformation tool, and only the transformed output is stored; the original upload is discarded. This malware-by-design approach eliminates non-payload bytes (metadata trailers, embedded scripts, polyglot tricks) at the cost of strict format whitelisting and accepted fidelity loss. Each upload story (`M_Upload_Photo`, `M_Submit_Video`, `M_Upload_Routine_Music`, `M_Upload_Group_File`) lists its own format whitelist and per-format sanitization pipeline.

Unless explicitly stated otherwise, all numeric limits (counts, sizes), time windows (expiry/grace periods), reminder offsets, and security thresholds described in this document are defaults and are Administrator-configurable.

Default values and source of truth: Unless explicitly labeled as Example, numeric values in this document are Default values. Defaults for Administrator-configurable system parameters are defined in this User Stories document and must be seeded into the corresponding database-backed configuration data store during initial database creation. The Design Decisions document may describe parameterization, ranges, and ownership, but does not define normative numeric defaults.

All UI labels and system-generated messages are English-only at launch. User-entered club and event descriptions and other club or event details may be authored in any language.

Reporting scope: Any dashboards/metrics described here are operational metrics (health, payment volume, job success/failure), not advanced BI or custom analytics.

When any task is added to the admin work queue, the system sends an email notification to admin-alerts mailing list containing task type and entity ID only (no sensitive member data such as email addresses, payment amounts, personal information, or content details). Queue items can be viewed after resolution with status, admin who resolved, resolution timestamp, decision label, and reason text.

## 1.1 Hashtags

The website will provide organizational structure through explicit linking for uploaded media to club and event galleries based on standardized hashtags, while trusting members to self-organize through freeform tagging. No approval queues. No hidden algorithms. Immediate visibility with automatic discovery. These tags must always follow the de-facto social-platform standard (alphanumeric plus underscores allowed, but not special characters nor hyphens, except for the leading #.)

Hashtags: Tags are short labels that follow the defined tagging pattern: (with a leading “#”) that apply consistently across events, clubs, tutorials, news items, and media. Tag matching is case-insensitive (for example, Footbag and footbag are the same), and all tag-based views behave the same. Common patterns include event tags, club tags, skill or discipline tags, and tutorial. When a member uses a tag anywhere, it automatically contributes to the shared tag index.

*Standardized hashtags* create unambiguous, collision-free categories for media content. Event hashtags follow the pattern `#event_{year}_{event_slug}` (example: #event_2025_beaver_open). Club hashtags follow pattern `#club_{location_slug}` (example: #club_san_francisco). These patterns enforce globally unique identifiers. The system validates standardized tags during event and club creation, scanning existing entities to prevent duplicates. Once created, the standardized hashtag becomes the canonical identifier for that event or club. Members uploading photos or videos can tag content with this hashtag, and the system automatically links that media to the corresponding event or club gallery. This explicit linking solves the discovery problem: organizers create an event (or club) and its standardized hashtag, members tag their uploads, and galleries populate automatically. The connection is direct, predictable, and immediate. Once created, a standardized hashtag is reserved permanently and cannot be reused.

Standardized tags are case-insensitive for usability (#Event_2025_Portland and #event_2025_portland both match) but stored with original capitalization for display quality. Teaching moments appear on the upload page when the member has no uploaded content, showing recent events, the member's club if applicable, and popular community tags to facilitate discovery. When creating an event or club, the UI pre-fills the hashtag field with a suggested value generated from name and location. Users can edit the suggested hashtag before saving. The system validates: format matches pattern, uniqueness via case-insensitive scan, length max 100 characters. Validation happens on save. If hashtag collides, user receives clear error with suggestion to append differentiator.

*Freeform hashtags* complement standardized tags by enabling personal organization without restrictions. Members can tag content with any set of hashtags they choose: #ripwalk, #spike, #tutorial. These tags require no validation beyond security checks (no scripts, no excessive length, no special characters). They create no automatic linking. They exist purely for member-driven discovery and organization. Freeform tags allow organic vocabulary to emerge. If multiple members independently tag similar content with trick-tutorial say, then that becomes a community convention without centralized enforcement. If someone wants to tag photos #best-tricks-2025 for personal reference, they can. The system imposes no taxonomy.

The distinction between standardized and freeform tags is semantic, not technical. Both are simply strings stored in the tags array of a media file. The difference lies in how they function: standardized tags create automatic gallery linking through event/club page scanning, while freeform tags enable browsing and member-driven organization. tutorial tags specifically will be important to complement the website's initial, curated footbag tutorial pages.

*Uploader hashtags* identify the source of a media item with a tag that matches the uploader's identity. Member uploads carry `#by_{member_slug}` automatically. Curator (FH) uploads carry `#curated`. The system auto-applies these tags on every upload and rejects them when supplied by anyone in input, so they cannot be forged. This makes per-uploader views (a member's Personal Gallery, the all-FH gallery) plain tag-criteria queries that share the same query path as event and club galleries. The slug pattern matches the member URL slug (lowercase letters, digits, underscores), so a member's Personal Gallery is just `criteria_tags = [#by_{member_slug}]`. Member-owned named galleries auto-include `#by_{owner_slug}` in their criteria-tag set on both create and edit, so the gallery's tag-AND filter scopes to the owner's content by default and that scoping cannot be lifted by editing. The bare `#{member_slug}` is an ordinary freeform tag: any member may apply it to mention another member, to pre-tag historical or unsigned persons whose slug does not yet exist in the system, or to organize their own content.

Tag Discovery and Browsing: All hashtags throughout the platform appear as clickable links. Clicking any tag navigates to a tag gallery page showing all photos and videos with that tag. A browse-all tags page shows Popular Tags (the most frequently used tags, top N by usage) and All Tags (community tags listed alphabetically).

A community tag is any tag used by at least two distinct members. The Browse Hashtags page helps new visitors explore user-uploaded content. Tags used only by a single member (even if that member uses the tag many times) are treated as personal tags and are not listed on the Browse Hashtags page. This browsing architecture turns tags into a navigation system, not just metadata. The Browse Hashtags page and per-tag gallery pages are public.

The upload interface for media (photos and video links) from the MyContent page never blocks, never enforces. All tag fields start empty. Members can upload media into named galleries with no tags at all, they simply won't appear in event/club or discoverable galleries. This respects member agency while providing clear pathways to proper organization.

Gallery Auto-Linking: When a user loads an event or club media gallery page, the system scans all photo and video metadata looking for matches against that entity's standardized hashtag. This scan operates on metadata only, not full media files, keeping response time as quick as possible.

To keep gallery pages fast, the system may cache gallery scan results. As a result, newly uploaded media or tag edits may take a few minutes to appear on event/club gallery pages.

Gallery pages can lazy-load photos using JavaScript (an optional user experience enhancement). Initial HTML contains metadata and 300×300 pixel thumbnails. JavaScript requests full-resolution images on scroll. Without JavaScript, users see thumbnails and can click through to full images.

Event and club detail pages automatically detect and link to media galleries when content tagged with the standard event or club hashtag exists. Gallery links appear when content exists: View Event Gallery or View Club Gallery. Gallery listings mix photos and videos naturally. This unified approach simplifies the user experience.

Media gallery links appear from club and event pages when content exists (for example, 'View Event Gallery' or 'View Club Gallery'). The system must perform a lightweight scan to detect the existence of just one media item tagged with the event or club hashtag (it does not compute or display image or video total counts). We avoid scans where possible in the UI to keep things quick. All media galleries can include optional external web page URLs, security validated before publication using the full URL validation pipeline used for profile, event, and club URLs.

Content Ownership and Control: Event pages link to galleries showing all photos tagged with that event's hashtag. Member profile pages link to that member's uploaded photos, which may appear in multiple event galleries. The same photo can belong to both the member's personal collection and multiple event/club galleries simultaneously. No duplication. No complex ownership tracking. Just hashtag matching.

Members own their content completely. They can delete photos, videos and named galleries at any time without approval (permanently, no soft delete). A user can nuke an entire named gallery + all media in it in one click (with a UI confirmation given this is permanent). Deletion removes all the content immediately (but requires some minutes to be visibly changed in the UI due to AWS CloudFront CDN caching, and possibly a page refresh click).

If a member uploads inappropriate content, any member with Tier 1 benefits can flag it, triggering admin review. The admin can delete the content if it violates policies. Deletion is the only removal mechanism, logged as an admin decision with a reason. No shadow banning. No selective visibility. This creates accountability: admins must justify deletions, and members know their content is either fully public or fully removed.

Members can edit tags after upload. Adding #event_2025_Beaver_Open to a photo three days after initial upload causes that photo to appear in the event gallery. Removing a tag removes the photo from that gallery. These changes typically propagate quickly, but may take a few minutes to appear due to caching.

Security and Validation: The hashtag system implements security at input validation. All hashtags (standardized and freeform) undergo processing before storage: must start with `#`, HTML tags stripped, Unicode normalized (preventing homograph attacks where visually similar characters create different hashtags), control characters removed, length limited to 100 characters, and restricted to letters, numbers, and underscores after the leading `#` (no spaces or punctuation). This happens regardless of whether the tag is standardized or freeform.

Photos (Hosted Content): Members upload photos (JPEG and PNG only; GIF not supported) with security processing in a way the eliminates the need for anti-virus scans as part of the system's tech stack. Each photo is re-encoded at 85% quality, stripped of all EXIF/ICC metadata, and generates two variants: a 300×300 pixel thumbnail and an 800px-width display image (or smaller if the original image is narrower than 800px). Processing occurs synchronously.

Captions, Descriptions and other Text: All user-submitted text fields (captions, descriptions, names) undergo input validation before storage. Input sanitization removes HTML tags and normalizes Unicode to prevent homograph attacks; output encoding via Handlebars templates prevents script execution; length limits enforce practical constraints (captions 500 characters, descriptions 2000 characters, names 100 characters after normalization). This multi-layer approach prevents injection attacks (XSS, CSV formulas, template code) while maintaining usability for legitimate international content.

Videos (External Links): Members submit YouTube or Vimeo links rather than uploading video files. The system validates URL patterns (youtube.com/watch?v=, youtu.be/, vimeo.com/), extracts video IDs via regex, and stores metadata only. Videos stream directly from their hosting platforms, eliminating storage and transcoding complexity.

Both photos and video links support:

- Hashtag tagging for discovery using standardized patterns: events use `#event_{year}_{event_slug}` clubs use `#club_{location_slug}`. This standardized hashtag uniqueness is enforced via database UNIQUE constraints.
- Captions (plain text, max 500 characters after Unicode normalization; HTML tags stripped, special characters encoded, control characters removed).
- Personal galleries with optional naming.
- Event galleries via hashtag matching with automatic linking.
- Club galleries via hashtag matching with automatic linking.
- Identical problematic content flagging and admin review workflows.
- Members can organize photos and videos into multiple named galleries for custom content organization, as well as using hashtags.

## 1.2 IFPA Membership Rules Reference and Terminology

The authoritative IFPA membership policy is defined in the ifpa's IFPAMembershipStructure_2026.md doc. Membership-related user stories below must implement that policy. This section does not restate the policy; it defines the terminology used by the stories below so that "Tier 1 benefits", "Active Player", "Official IFPA Roster", and similar terms have a single meaning across the document.

Glossary:

- **Tier 0 (Registered Member):** Free lifetime registered footbag.org account.
- **Tier 1 (IFPA Member):** Purchased lifetime IFPA membership.
- **Tier 2 (IFPA Organizer Member):** Purchased lifetime IFPA organizer membership. Includes all Tier 1 benefits plus organizer privileges.
- **Tier 3 (IFPA Director):** Governance status assigned by IFPA governance. Includes all Tier 2 privileges while active. Reverts to the member's underlying membership tier when governance status ends.
- **Underlying membership tier:** The membership tier a Tier 3 member returns to when governance status ends. A Tier 0 member who becomes Tier 3 has Tier 1 set as the underlying membership tier and never reverts to Tier 0 from Tier 3.
- **Active Player:** Temporary status for Tier 0 members only. While current, gives the Tier 0 member Tier 1 benefits. Active Player does not change membership tier.
- **Qualifying event attendance:** Attendance at any event officially registered through the IFPA website. Grants or extends Active Player for Tier 0 targets only.
- **Vouch:** A Tier 2 or Tier 3 member granting or extending Active Player for a Tier 0 member. No-op against any Tier 1, Tier 2, or Tier 3 target.
- **One-time club-join grant:** A single Active Player period granted when a Tier 0 member who has never previously been Active Player joins their first IFPA club. Not regranted on subsequent joins.
- **No-shorten rule:** An older qualifying event, club-join grant, or vouch must not shorten an existing later Active Player expiry date.
- **Tier 1 benefits:** Shorthand for "Tier 1, Tier 2, or Tier 3 member, or Tier 0 member with current Active Player status." Used in Access lines below where the gate is the Tier 1 capability set rather than strict Tier 1, Tier 2, or Tier 3 membership.
- **Official IFPA Roster:** Tier 1 members, Tier 2 members, Tier 3 members, and Tier 0 members with current Active Player status. Excludes Tier 0 members without current Active Player status. Not public. Tier 2 or Tier 3 members may access it for official IFPA event and organizer purposes.
- **Hall of Fame (HoF) and Big Add Posse (BAP):** Separate permanent honor badges. Each induction grants Tier 2 membership.
- **IFPA Board / Tier 3 governance status:** Set at the start of board service and removed at end of board service.

Implementation notes used by stories below:

- Membership tier and Active Player status are separate concepts; both must be queryable independently and shown distinguishably in any roster, report, or profile surface.
- Membership tiers do not expire. Only Active Player status expires. Numeric defaults (price, duration, reminder offsets) live in §7.7 Configurable Parameters.
- Canonical membership-tier database string values used in code and SQL: `tier0`, `tier1`, `tier2`, `tier3`. Display text ("Tier 1 IFPA Member", etc.) is formatted separately in UI templates. Active Player is represented by separate fields, not by a tier string.
- Site Administrators (the platform admin role) must hold Tier 2 or Tier 3 status.
- Feature access is controlled by membership tier, Active Player status where applicable, and contextual roles or flags (Event Organizer, Club Leader, Administrator, HoF, BAP). These values are fetched from the database on any authenticated request to check authorization rules; JWT tier or flag claims are cached for routing performance but are never authoritative for access control decisions.
- Member counts displayed to the public, where any exist, must clearly indicate whether they represent "all registered accounts" (including Tier 0 without Active Player status) or the "Official IFPA Roster."

# 2. Visitor Stories

Visitors are unauthenticated users. Visitors can browse public content including clubs, events, news, media galleries, and tutorials. To register for events, upload media, join clubs, view the historical archive, or vote, visitors must register for an account.

## 2.1 Content Discovery

### V_Browse_Static_Content

Access: Any visitor can browse the main Footbag website at footbag.org.

Story: As a visitor, I can browse the main Footbag website’s public content.

Success Criteria:

- The modernized Footbag website is served as the primary footbag.org site; visitors can access it without logging in.
- The legacy footbag.org content is preserved as a read-only static archive at archive.footbag.org for authenticated members only.
- The current footbagworldwide.com implementation is the basis of the new and improved footbag.org; domain and URL details for the final layout are deferred to the detailed design document.
- Visitors can follow standard navigation (home, clubs, events, media) without leaving the modernized site. If they click “Legacy Archive,” they are redirected to register/log in; only members can proceed to archive.footbag.org.

### V_Browse_Clubs

Access: Any visitor can browse the public clubs directory. Only authenticated members can see club member rosters and contact details.

Story: As a visitor, I want to browse the clubs directory by country/state/city so that I can discover local clubs (but I cannot see the list of club members).

Success Criteria:

- The system provides a clubs landing view with geographic drill-down navigation (Country, State/Province, City) with club names and member counts.
- Only members can view club member rosters and contact details.

### V_Browse_Upcoming_Events

Access: Any visitor can browse upcoming events and open public event detail pages for publicly visible event statuses. Only authenticated members can register or see member-only organizer contact details. 

Story: As a visitor, I want to browse upcoming events and open their public detail pages so that I can plan participation. 

Success Criteria: 

- Main events landing page shows upcoming public events sorted by start date.
- Each upcoming event card shows the fields needed for public browsing: title, date range, location, host club, description when present, and registration status.
- Each publicly visible upcoming event links to the canonical public event page at `GET /events/:eventKey`.
- Public canonical event pages are available only for events with status `published`, `registration_full`, `closed`, or `completed`.
- Events with status `draft`, `pending_approval`, or `canceled` do not have public detail visibility.
- Organizer contact details, registration actions, payment actions, and member-only state are excluded from this public slice.

### V_Browse_Past_Events

Access: Any visitor can browse past events, view whole-year public results pages, and drill down to canonical public event pages. 

Story: As a visitor, I want to browse past events and their results by year, and then click through to a specific event when I want the event-focused page. 

Success Criteria: 

- The public events landing page shows archive-year links derived from completed public events, showing all years with events in a side list for easy access to a given year. The default year for the landing page is the current year (for example: 2026). Every year page has navigation between that year and previous or next years when those adjacent years contain completed public events.
- All historic events are viewed grouped by year (one page per year), with events sorted by start date. The year page shows the full completed public event list for the selected year even when some events do not have results.
- The year page at `GET /events/year/:year` is a whole-year archive/results page. It is not paginated. The list of events for any given year is short enough that it does not need UI pagination.
- Each year-page event block shows the public summary fields required for browsing historic events: title, date, location, host club when known, description when present, and the standardized event hashtag / canonical key when available.
- The year page shows event summaries only; results are on the canonical event detail page at `GET /events/:eventKey`.
- When no result rows exist for a completed public event, the year page still shows the event; the event detail page explicitly indicates that no results are available yet.
- Each completed public event also has a canonical public page at `GET /events/:eventKey` for event-focused viewing and direct linking.
- If a historical event page is opened and no result rows exist for that event, the page still shows the event and explicitly notes that no results are available yet.
- Public canonical event pages are available only for events with status `published`, `registration_full`, `closed`, or `completed`.
- Events with status `draft`, `pending_approval`, or `canceled` do not have public detail visibility.
- Legacy archive content at `archive.footbag.org` is a separate repository and the historical event and results data hosted there must not be conflated with the public event browsing pages described here. Everything on `archive.footbag.org` is irrelevant to the canonical event/results route contract.

### V_View_News_Feed

Access: Any visitor can read the main news feed.

Story: As a visitor, I want to read the news feed so that I stay informed.

Success Criteria:

- Auto-generated chronological feed of upcoming events, event results published, new clubs, new Hall of Fame (HoF) members, new Big Add Posse (BAP) members, vote results, and any other IFPA announcements.
- The system provides a news view grouped by year, with navigation between current and previous years and one year's news per page.
- Each news feed item is backed by a NewsItem record that links to a specific underlying entity (for example an event, club, member, vote, or announcement).
- NewsItems are created or updated automatically as side effects of those primary flows (e.g., when an event is published, results are posted, a club is created or archived, HoF/BAP/Board Member status is granted, or vote results are published). Admins can create or edit news stories (see separate story below).

### V_View_Tutorials

Access: Any visitor can view tutorials and informational content without logging in.

Story: As a visitor, I can view tutorials, rules, and other reference material so that I learn the sport.

Success Criteria:

- Initial educational pages (trick tutorials, rules, equipment guides, etc.) are static content.
- Developers provide initial content as static files for the website.
- Rules pages are served from the IFPA-governed `ifpa/rules/` content, which IFPA authors and maintains; the published pages are the IFPA rules, and no separate ratification notice is required.
- Members can create their own tutorial galleries freely using photo and video upload features with descriptive captions, hashtags, and named galleries (suggest hashtag tutorial among others). Visitors can view this content too.

### V_View_Gallery

Access: Any visitor can view media galleries.

Story: As a visitor, I can view media gallery pages for a given hashtag (or list of hashtags) so that I see all media matching the tag(s). The public View Media landing page will facilitate discovery of popular hashtags, recent events, and tutorials.

Success Criteria:

- Gallery built dynamically based on tag matching. One gallery page will display all photos and videos matching specified freeform or standardized hashtags.
- Gallery header page displays tag names with proper capitalization, count of total media items.
- Gallery grid shows standard photo/video layout.
- Each gallery item displays thumbnail, caption excerpt, all clickable tags, upload date.
- Opening a gallery item shows its detail (the full display image or a playable video, the full caption, all clickable hashtags, uploader attribution per the visibility rule below, and upload date) on a server-rendered page reached within the site, with a clear path back to the gallery it was opened from.
- From an item's detail view, the viewer can move to the previous and next item in the same gallery without returning to the grid first.
- Every surface that lists an item (gallery grid, item detail, browse results) shows that item's hashtags as clickable tags.
- Empty state displays "No photos or videos found with this tag" with suggestions of 5 popular tags platform-wide (a teachable moment).
- Media galleries are pubic, but only logged-in members will see details about the personal information of the member who uploaded the media (uploaded_by).
- The public hub at `/media` presents a fixed set of collection cards: Browse by hashtag first, the Member galleries card second, then the curated collection cards (Freestyle, Net, Sideline, Related Sports). The Member galleries card is always shown: when no member-owned named gallery exists it renders a "none yet" state with no link, and once at least one exists it links to the member-galleries list page. FH-owned named galleries are reached through the curated collection cards.
- The member-galleries list page at `/media/member-galleries` lists every member-owned named gallery in chronological order by creation date (oldest first); each entry shows the gallery name, description, item count, and owner attribution linking to the owner's profile. Auto-materialized per-member default galleries (Personal Gallery) are excluded from this list; they remain reachable at their `/media/{gallery_id}` URL for direct sharing.
- Named-gallery URL bookmarks live at `/media/{gallery_id}` (e.g., `/media/gallery_curated_freestyle_tricks`, `/media/gallery_tricks_of_the_trade`). The `gallery_id` is the slug; the `member_galleries` row anchors a stable URL plus human-readable name, description, owner, and item-ordering preference (`sort_order`). Content membership is computed at request time by tag-AND match against the gallery's `member_gallery_tags` set, minus any item carrying a tag in the gallery's `member_gallery_exclude_tags` set; an item appears iff it carries every criteria tag AND no exclude tag.
- Item ordering on a named-gallery page is governed by `member_galleries.sort_order` (`upload_desc` default, `upload_asc`, `caption_asc`). Use `caption_asc` for ordered series whose captions encode the position with a zero-padded prefix (e.g. "01 - <title>").
- An admin gallery-management UX at `/admin/curator/galleries` lets the system administrator (acting as the FH system member) create, edit, and delete FH-owned named galleries: edit name, description, sort order, criteria tags, and exclude tags via `/admin/curator/galleries/:id/edit`; create a new gallery via `/admin/curator/galleries/new`; delete via the per-row Delete action. FH gallery writes (create, edit, delete) update the `member_galleries` rows directly; this DB write is the contract. Before go-live, where sidecar writes are enabled, the write also round-trips through the JSON sidecar at `/curated/galleries/<slug>.json` so the git-tracked authoring source stays in step, and the seeder loads the same files on each run. Admin moderation can also edit a member-owned gallery via the same admin URL.
- Members can manage their own named galleries at `/members/{memberKey}/galleries`, including create, edit, and delete. Member-owned galleries are public, reached from the `/media` Member galleries card and its list page, but are stored in the database only (no `/curated/` JSON sidecar); the named-gallery hero links the owner display name to the member's profile.
- Bookmark slug convention: `gallery_{descriptive_snake_case}`. The slug pattern keeps `/media/gallery_*` URLs distinguishable from S3-keyed media paths under `/media/{member-id}/...`, which matters at the CDN cache-behavior layer.
- All content surfaces in a named gallery purely via tag-AND match against the gallery's criteria-tag set, minus the exclude set; both curator URL-reference content and member-uploaded content use the same mechanism. One media item can appear in many galleries when its tags satisfy each gallery's filter.

### V_View_Trick_Reference_Videos

Access: Any visitor can view freestyle trick reference videos. No authentication required.

Story: As a visitor browsing a freestyle trick page, I see a gallery of curator-uploaded reference videos for that trick so that I can watch demonstrations, tutorials, and competition record clips relevant to the trick.

Success Criteria:

- The trick detail page at `/freestyle/tricks/{slug}` renders a "Reference Videos" section showing all curator-tagged videos for the trick (assets in `media_items` carrying `#curated`, `#freestyle`, `#trick`, and the trick's bare-slug tag).
- For YouTube and Vimeo videos, the page renders an embedded player (iframe via `youtube-nocookie` for YouTube; equivalent for Vimeo).
- For S3-hosted MP4 videos, the page renders an HTML5 `<video>` player.
- Each video displays its title, creator, and source attribution (source name, with link to source URL when available).
- When the trick has no curator-tagged videos, the Reference Videos section is omitted (no empty section).
- The page browser-tab title follows the convention `Footbag Trick #{slug}` (e.g. `Footbag Trick #ripwalk`), parallel to the event-page title convention.
- Member-uploaded videos tagged with the trick's slug do NOT appear in this section; only curator-tagged videos (`#curated`) do. Member-uploaded content with the trick tag remains discoverable via the trick's tag page.

### V_Browse_Hashtags

Access: Any visitor can browse standardized and freeform hashtags on the public Browse Hashtags page and see public content tagged with them. This page will always highlight popular hashtags, recent events, and tutorials.

Story: As a visitor, I can browse all freeform and standard hashtags so that I discover content vocabulary without searching.

Success Criteria:

- Popular Tags section displays the most frequently used public tags (top 30 by usage across the site).
- Recent events and tutorial will be given special treatment to facilitate discovery.
- This feature lists public tags. A tag is public when at least two distinct members have used it (a community tag) or it appears on curator-published content (the curated catalog is public even though one system account owns it). A tag used by a single ordinary member is a personal tag, private to that member's gallery, and stays off the public Browse Hashtags page. A background job recomputes tag usage statistics, recording both total usage and the distinct-member count per tag. The Popular Tags section shows the top 30 public tags ranked by usage.

### V_Access_Denied
Access: Any user. This is an exceptional error user story. It should only happen if there is a system bug, because no User Interface field should ever be available for any user to click on if they are not both authorized and authenticated (active session).

Story: As a user, if I attempt an action I’m not permitted to perform, I see a clear Access Denied page so I understand what happened and recover.

Example authorization flags are: Tier0, Tier1, Tier2, Tier3, Admin, Event_Organizer, Club_Leader, HoF, BAP. This list is not exclusive, as other User Stories may define other critera for accessing content.

Success Criteria:

- Returns an Access Denied page with a short explanation and a link back to a safe page (e.g., dashboard or home).
- Does not reveal private data.

### V_Not_Found

Access: Any user. This is an exceptional error user story. It should only happen if there is a system bug, because no User Interface field should ever lead to an unknown URL.

Story: As a user, if I navigate to an unknown URL (404 HTTP code), I see a clear Not Found page so I can I understand what happened and recover.

Success Criteria:

- Returns an Not Found page with a short explanation and a link back to a safe page (e.g., dashboard or home).
- Does not reveal private data.

### V_Error_or_Maintenance_Mode
Access: Any user. This is an exceptional error user story. It should only happen if there is a system bug.

Story: As a user, if the system is down or encounters an internal error (50x HTTP code), I see a clear error/maintenance page so I know the issue is not my fault.

Success Criteria:

- Shows a friendly error message with next steps (retry later, contact link).
- Does not reveal stack traces or sensitive internals.

### V_Register_Account

Access: Visitors who are not logged in can create an account. A successful registration creates a new member (Tier 0, free lifetime).

Story: As a visitor, I can register with email, password, real full name, real location, and display name so that I can become a member. Registration also serves as the data-cleanup funnel for legacy identity linking and club questions.

Success Criteria:

- New member registration with email verification.
- **Name model:** Registration collects two name fields:
  - **Full legal name** (`real_name`): required. Must be at least two words, no digits. Capitalization is normalized on save (no policing of input casing).
  - **Display name** (`display_name`): optional. Defaults to `real_name` if left blank. Must share a surname with `real_name` (surname extracted with suffix stripping: Jr, Sr, II, III, IV). Display name is permanent and cannot be changed after registration; the registration form must make this clear.
  - **Slug selection:** The member's URL slug is generated from display name by default but the member can customize it during registration. The slug must contain their surname (same suffix-stripping rule). Two members may share the same display name; slug uniqueness is enforced. Slug is permanent after registration.
- This registration MUST use the human’s real and full name, spelled out, with no initials or abbreviations. Bogus registrations that do not follow this rule, upon discovery, will be deleted.
- This registration MUST use the human’s city, state, country. USA members must use the official two-letter state name (eg: CO, CA, NY).
- System sends verification email.
- After clicking link, user can log in and create profile.
- Email must be unique across all members including accounts in their deletion grace period (reuse only after the grace period completes and PII is cleared).
- Registration enforces email uniqueness. If a submitted email belongs to an active account or one in its deletion grace period, the form re-renders at 422 with an inline error directing the user to log in or reset their password. Rate limiting prevents enumeration abuse.
- Registration submissions are gated by a Cloudflare Turnstile CAPTCHA verified server-side before any DB read.
- Display names are constrained to prevent homograph attacks (for example: no mixed scripts or confusable characters, and reasonable length limits).
- New members automatically assigned Tier 0 (free lifetime) status.
- **Legacy-link check:** After account creation, the system checks whether the registrant’s verified email matches an imported `legacy_members` row’s `legacy_email` or a historical person’s legacy email. If a match is found, the member is prompted inline to confirm the link ("We found a history record, is this you?"). For high-confidence matches (exact name match) and medium-confidence matches (known variant name match), the prompt defaults to yes (pre-checked). For low-confidence matches (email match but name mismatch), the prompt defaults to no (member must actively opt in). The member’s decision is audit-logged. No admin involvement at registration time; the member is the authority on their own identity.
- **Post-verify onboarding:** After email verification, the member is routed to `M_Complete_Onboarding_Wizard` with applicable outstanding tasks. The wizard owns the club affiliation flow (Stages 1A, 1B, and the wrap-up landing). `gender`, `first_competition_year`, and `show_competitive_results` are collected as fields within the `personal_details` task. Registration itself does not block on these tasks; they are skippable and resumable from the dashboard task widget.
- Member sees a clear success message after registration: "Registration successful! Please check your email to verify your account."
- Member sees clear error messages for validation failures with hints about what to fix.
- Passwords are stored securely using one-way hashing; they are never stored or logged in plaintext.
- Password Requirements: Minimum 8 characters, maximum 128 characters, no complexity requirements to allow passphrases.
- Password Validation: Client-side validation provides immediate feedback, server-side validation provides authoritative enforcement.
- If registration validation detects rule violations at registration time (invalid format, prohibited characters, not using a full name), the system rejects registration immediately with clear error message. Admin deletion authority is for cases where invalid registrations pass initial validation and are discovered later through manual review or reports.

# 3. Member Stories

Members are authenticated users who have completed email verification. All new members start at Tier 0 (free, lifetime). Members can upgrade to Tier 1 or Tier 2 to unlock additional features. Members can hold multiple contextual roles simultaneously: a member can organize events (Event Organizer) and lead a club (Club Leader) without separate accounts. Tier 3 is governance status assigned by IFPA governance.

Important note: All stories below (except for M_Login) assume that the member has an active authenticated session for access.

## 3.1 Account Lifecycle

### M_Login

Access: All members with a verified email can log in with email and password.

Story: As a member, I can log in and receive a secure session cookie so that I can use member features.

Success Criteria:

- Logging in is only allowed after email verification is complete.
- Login attempts are rate-limited using a simple fixed-window limiter keyed by IP address and email/account identifier. Thresholds, windows, and cooldown durations are Administrator-configurable (safe defaults).
- Login submissions are gated by a Cloudflare Turnstile CAPTCHA verified server-side before any DB read; identical UX whether credentials are valid, invalid, or unverified.
- Member sees clear error message for failed login: "Invalid email or password. Please try again.".
- Member sees success confirmation after login.
- On successful login, the system issues the authenticated session (HttpOnly, Secure, SameSite=Lax session cookie).
- Individual failed login attempts are not persisted to the audit log. When the login rate limit threshold is crossed, a single audit log entry is created recording that the threshold was exceeded for the given account identifier (no IP address stored). This preserves the privacy-first audit log design while retaining security traceability.

### M_Verify_Email

Access: Visitors who just registered, and existing unverified members, can request and consume a verification link. Logging in is blocked until verification is complete.

Story: As a newly registered visitor, I can open a verification link delivered to my email address so that I can prove mailbox control before my account becomes usable.

Success Criteria:

- On successful registration the system enqueues a verification email containing a unique single-use link with an Administrator-configurable TTL (default: 24 hours). The registration response does not include a session cookie; the visitor lands on a generic "check your email" page.
- The verify link is a single-use, unguessable token stored hashed at rest (SHA-256); the raw token is never persisted.
- Opening the verify link marks the member's email as verified, issues the authenticated session (HttpOnly, Secure, SameSite=Lax cookie), and redirects to the member dashboard, or to the legacy-link check when the member's email matches a `legacy_members` row or historical-person record.
- Successful verification appends an `audit_entries` row (the account-lifecycle transition that activates the account is auditable, like registration and password events).
- Consuming the link a second time is rejected with a generic "invalid, expired, or already used" response. Unknown or expired tokens render the same response (enumeration-safe).
- Unverified members cannot log in. The login failure response is identical to the wrong-password response (enumeration-safe).
- Unverified members do not appear in the authenticated member search.
- Members can request a new verification email by submitting their email address to a resend form. The response is identical regardless of whether an unverified member exists for that address. Resends are rate-limited per normalized email address (safe default).
- Resend submissions are gated by a Cloudflare Turnstile CAPTCHA verified server-side before any DB read; identical UX whether an unverified member exists for the address or not.
- If an email is submitted to the registration form and an account already exists for that address, the response is identical to a successful new registration; no new verification email is sent, and no indication is given that the email is already registered.
- Admins are not involved in verification; the flow is self-service.

### M_Reset_Password

Access: Members with a registered email can request a password reset.

Story: As a member, I can request a password reset so that I can recover access.

Success Criteria:

- Reset link valid for an Administrator-configurable duration (default: one hour).
- Reset link implemented as a single-use, unguessable token that is invalidated after use or expiration.
- Password reset responses do not reveal whether an email is registered (enumeration-safe message such as "If an account exists for this email, a password reset link has been sent.").
- Password reset requests are rate-limited per email address to mitigate abuse (Administrator-configurable threshold and window; safe defaults).
- Password reset submissions are gated by a Cloudflare Turnstile CAPTCHA verified server-side before any DB read; identical UX whether the email is registered or not.
- Once used, old password invalidated.
- Passwords are stored securely using one-way hashing; they are never stored or logged in plaintext.
- passwordVersion field incremented for immediate token invalidation.
- Reset token is single-use and invalidated immediately after successful reset or after expiration.
- Member receives a confirmation email that their password has been changed.
- Reset flow follows the same validation and session security assumptions defined in Global Behaviors and Constraints (sanitization, secure session handling, etc.).

### M_Change_Password

Access: Logged-in members can change their password while authenticated (different from M_Reset_Password which is for forgotten passwords).

Story: As a member, I can change my password while logged in so that I can update my credentials for security reasons.

Success Criteria:

- Change password form requires: current password (for verification), new password, confirm new password.
- System validates that current password is correct before allowing change.
- New password must meet the same security requirements as registration (minimum length, complexity as defined in validation rules).
- System validates that new password matches confirmation field.
- On successful password change: passwordVersion field is incremented (invalidates all existing JWT sessions immediately), new password hash replaces old password hash, member receives confirmation email at verified email address, member sees success message.
- Current device stays logged in because the system issues a new session JWT (with updated passwordVersion) immediately after the password change; all other sessions become invalid.
- All other active sessions on other devices are immediately invalidated (due to passwordVersion increment).
- On failure: clear error messages guide the member: "Current password is incorrect" (if current password wrong), "New password does not meet requirements: specific requirements" (if validation fails), "Passwords do not match" (if new and confirm don't match).
- Failed change password attempts are rate-limited per member account to prevent brute-force attacks on current password verification (same rate limiting as login).
- All password changes audit-logged with member ID, timestamp (but never log actual passwords).
- Passwords are stored securely using one-way hashing with argon2id; they are never stored or logged in plaintext.

### M_Logout
Access: Logged-in members.

Story: As a member, I can log out so that my current session ends and the site no longer treats me as authenticated.

Success Criteria:

- Logout action clears the authentication session cookie.
- After logout, any attempt to access member-only pages redirects to login page.
- Member sees a clear confirmation message that they are logged out.

### M_Delete_Account

Access: Members can request to delete their own account. Notable exception: HoF and BAP members will always be preserved on the site to preserve history. These members will be allowed to delete their accounts for personal and data privacy reasons, but special rules will apply to their names and brief bios.

Story: As a member, I can delete my account so that I can leave the platform.

Success Criteria:

- Member can request account deletion from their profile page.
- System explains the deletion consequences and the grace period before permanent deletion (account enters a grace-period deletion state; Administrator-configurable grace period length).
- After confirmation, the account enters a deleted state; member cannot log in or use the site, except to restore the account within the grace period.
- After deletion, member no longer appears in member search results or active member lists. Historical records (e.g., past event results, archives, and logs) preserve the member as a non-clickable “Deleted Member” placeholder to maintain history and data referential integrity.
- **Person-link reversion:** When a member deletes their account, any historical person links (in event results and other historical surfaces) that were pointing to `/members/:slug` must revert to `/history/:personId`. The `personHref()` helper handles this automatically when `member_id` is cleared or the member row is soft-deleted.
- **Declared-anchor purge:** PII purge clears the member's declared former surnames and declared old emails (see M_Edit_Profile) alongside `members.historical_person_id` and `members.legacy_member_id`. Declared anchors are member-asserted personal data; they do not persist past the member's account.
- Members with HoF or BAP flags receive special treatment during deletion. Admin-configurable soft-delete grace period applies. After this grace period expires: email/phone/passwordHash removed like all members, but displayName and bio fields are always preserved regardless of deletion. Deleted HoF/BAP profiles continue showing: special status badges (HoF or BAP flag), preserved displayName (not changed to "Deleted Member"), preserved bio text, memberId for referential integrity. Historical event results, leadership records, and community contributions remain attributed to these members by preserved displayName. This preserves community history and honors that are meant to be permanent regardless of account status.
- Financial and audit records anonymized after the configured grace period. Transaction IDs retained for a configurable compliance period (default: 7 years).
- Audit logs retain for a configurable compliance period (default: 7 years) with no personal identifiers (except member id).
- Attempts to access the profile of a member in the deletion grace period show "Account not found" message, but this would be an exceptional error case, as links to deleted members should not be shown.
- Media uploaded by the deleted member (photos, videos, and galleries) is deleted immediately and permanently at the deletion request (no soft delete for photo data). This media is NOT restored if the member reactivates within the grace period; restore brings back the account, profile, and club affiliations only.
- Member receives email confirmation of the deletion request and information about how to restore the account during the grace period.
- Member sees clear confirmation message before deletion that includes the configured grace period value (for example, this might be: 90 days), e.g.: "You can restore it within {gracePeriodDays} days by logging in. Your photos, videos, and galleries are permanently deleted now and are not restored if you reactivate."
- Member sees success message after deletion that includes the admin-configured grace period value, e.g.: "Account deleted. You have {gracePeriodDays} days to restore by logging in. Your uploaded media has been permanently deleted and will not return if you restore."
- If the member was the club's only co-leader, the club becomes leaderless, a tolerated state (see §5.1): the club persists and stays joinable, and surfaces on the low-priority "could use a leader" admin list (label "Needs Leader") as an opportunity, not a remediation obligation. If the member was the only event organizer, the event is added to the admin work queue with the "Needs Organizer" label for reassignment.
- Photo deletion from S3 occurs synchronously during the account deletion request. If S3 deletion fails, the deletion request fails and the member account is NOT deleted (transactional consistency: the account is only marked deleted after all photos are confirmed removed from S3).
- Named gallery records belonging to the deleted member are hard-deleted when the member's photos are deleted. Gallery rows have no downstream referential integrity concerns (they are leaf nodes). Gallery deletion is part of the same atomic operation as photo deletion.

### M_Restore_Account

Access: Members whose accounts are within the deletion grace period can restore their account by logging in.

Story: As a member who has requested account deletion, I can log in within the grace period to restore my account so that I can reverse an accidental or regretted deletion.

Success Criteria:

- During the grace period, the login flow detects that valid credentials belong to an account in a deleted state (deleted_at IS NOT NULL, grace period not yet expired).
- The system presents a restoration confirmation screen; not the normal dashboard; explaining the account is pending deletion and asking whether to restore it.
- If the member confirms restoration, the system clears deleted_at, reinstates the account to active status, and logs the restoration in the audit log with actor, timestamp, and action type.
- If the member dismisses the screen without confirming, they are not logged in and the account remains in its deleted state.
- After restoration, the member is redirected to the normal post-login destination and sees a success message: "Your account has been restored."
- The restoration confirmation screen and the post-restore success message state that uploaded media (photos, videos, galleries) was permanently deleted at deletion time and is not recovered by restore; the account, profile, and club affiliations are restored.
- Restoration is only available within the configured grace period (member_cleanup_grace_days). After that period expires and PII has been purged, login is permanently rejected.
- Restoration is audit-logged with member ID and timestamp.

### M_Download_Data

Access: Members can request a download of their own personal data and account records.

Story: As a member, I can download all my personal data as JSON so that I can exercise my data rights (provided by GDPR data privacy rules).

Success Criteria:

- Member can request a personal data export from their profile page.
- The system generates a JSON export that includes: Member profile data (identity, contact, membership tier, Active Player status, etc.). Payment history associated with the member. Event registrations and participation data. Media metadata uploaded by the member (e.g., file names, timestamps, captions, tags). Audit log entries where the member is the actor.
- Vote data in the export: Indicates which votes the member participated in and relevant metadata (vote title, vote ID, submission timestamp). Does not include raw ballot content, receipt tokens, or receipt token hashes. Members who need to verify a ballot must use the receipt information from their original vote-confirmation email; the system does not store plaintext receipt tokens.
- The data export is delivered as a human-readable JSON file with a documented structure.
- Export contents include: member profile, membership tier and Active Player status, email subscription settings, club memberships/roles, event registrations, uploaded media metadata owned by the member (including tags/captions/links), payment history entries that reference the member, and vote participation records (but never vote selections).
- Delivery: Member clicks an Export My Data link from their dashboard page, and the system generates a file and provides a time-limited download link (expires after the configured duration, default 72 hours, keyed by `data_export_link_expiry_hours`), and also emails the same link to the member's verified email address.

### M_Browse_Legacy_Archive

Access: Members can access the read-only legacy content at archive.footbag.org. Visitors cannot access the archive because it contains private member data.

Story: As a member, I can browse the historical archive of the old footbag.org site so that I can access content (especially media) that has not been migrated into the new system.

Success Criteria:

- After logging into the main site, a member can click a clearly labeled "Legacy Archive" link.
- The member is transparently authenticated to the legacy archive and can browse historical content without re-entering credentials.
- Legacy archive access is gated by the main site session JWT. Access expires when the main site JWT expires. The JWT expiry duration is Administrator-configurable (default: 24 hours, keyed by `jwt_expiry_hours`). No separate archive session token is issued; the platform validates the member's session transparently at the archive edge.
- If the member's session expires, attempts to use the archive cause a redirect back to the main site login.
- Direct access attempts to the legacy archive by unauthenticated users redirect to the main site login with a suitable message.
- The legacy archive is read-only, static HTML content (no DB or JavaScript).
- The archive preserves the historical structure and content of the old footbag.org site as closely as practical (pages, articles, event reports, and media that were mirrored). Notably however, all videos (many of which had old, obsolete video formats) have been converted to .mp4 format, and all images have been converted to .jpg.
- Archive search is not provided and no new content is added to the archive (it is strictly historical).
- From the member's perspective, the main site is the primary place for new content and participation; the archive is explicitly presented as historical reference only.
- Security note: Archive access does not perform the passwordVersion check used by the main site (this check requires a database query unavailable at the CloudFront edge). A password change does not immediately revoke archive access; archive access expires naturally when the JWT expires (up to jwt_expiry_hours, default 24 hours). This is an accepted operational trade-off.

### M_Claim_Legacy_Account

Access: Logged-in members.

Story: As a logged-in member, I can find and confirm my pre-existing identity on the new platform (an old website account, a competition record, or both) so that my historical identity, honors, migrated profile data, competition history, and relevant club affiliations are associated with my real modern account, with the platform doing as much of the discovery work as possible and admin involvement reserved for the cases the platform cannot resolve.

Success Criteria:

This story is the umbrella for the member's claim experience. Sub-mechanisms (auto-link card confirmation, declared-anchor entry, optional mailbox-control round-trip, direct historical-record claim, cross-source candidate prompt, registration-time conflict prompt) compose into one act from the registrant's perspective. The wizard's claim task is the primary entry surface (see M_Complete_Onboarding_Wizard); the profile and the historical-record pages are secondary entry surfaces.

Identity-reconciliation cases covered:

- Case A: Fresh player. No pre-existing record; this story is a no-op.
- Case B: Old website account only. Linking the modern account to a `legacy_members` row applies the blanket annual-to-lifetime tier mapping.
- Case C: Competition record only. Linking the modern account to a `historical_persons` row via the direct-claim affordance.
- Case D: Both, pipeline did not link them. Member claims each separately, or the platform offers the second source after the first is confirmed.
- Case E: Both, pipeline linked them. Claiming either transitively claims the other in one transaction.

Card-at-login confirmation:

- The wizard's universal claim task surfaces any candidates the platform staged for this member (via batch auto-link at cutover) or matched at sign-in. Each candidate appears as a card showing the legacy display name, country, year of first competition (if available), and the evidence anchor(s) the platform used to find it. The card never echoes the matched email or other anchor inputs.
- The member can Confirm, Decline, or Defer each card.
- Confirmation applies effects atomically: writes `members.legacy_member_id` and / or `members.historical_person_id`; marks the legacy row claimed (`claimed_by_member_id` + `claimed_at`); merges allowed profile fields (import fills only if active value is empty); applies `first_competition_year` via COALESCE; writes a single tier grant applying the blanket annual-to-lifetime mapping (honors-only fallback if the legacy tier-state fields are unavailable); writes confirmed club affiliations; may promote confirmed leadership; preserves the `legacy_members` row as the permanent archival record. The audit row records the evidence-strength tag.
- Confirmation is race-safe: when two members confirm the same legacy account or the same historical person concurrently, exactly one claim lands; the other member sees the same "already claimed by another member" response the synchronous already-claimed check renders, and no partial effects (tier grant included) persist.
- Decline discards the candidate; nothing applies. The audit row records the declined candidate. The candidate may resurface later if newly-declared anchors produce it again, but the platform tracks declines to avoid re-prompting for the same candidate without new signal.
- Defer keeps the card on the dashboard task widget for later action.
- Staged candidates expire after an administrator-configurable window (default 365 days, keyed by `auto_link_staged_expiry_days`). Expiry resolves the card without member action; if the anchors still match when staging next runs, the candidate is staged again. Re-running the staging pass never duplicates an open candidate for the same member/target pair, and a declined candidate is not re-staged without new signal.

Declared-anchor entry:

- Within the wizard's claim task, which is the surface for declaring anchors (reached during onboarding and afterward from the profile's legacy-claim link, see M_Edit_Profile), the member can declare optional anchors: one or more former surnames and one or more old email addresses. Anchors are self-asserted; no proof required for the declaration itself. Anchors are always private (member-and-admin only) per M_Edit_Profile.
- When the member declares a new anchor, the platform re-runs candidate matching against the new value synchronously within the same wizard task; any resulting cards surface in-screen without requiring a sign-out or sign-in cycle. Declared anchors persist; subsequent matching also runs at sign-in for cases where the platform later receives new data (cross-source candidates appearing post-claim, mirror updates, etc.).

Email-matching surface:

- A member's verified login email and each declared old email are matched against every email a legacy account carried (the primary plus up to two secondary addresses), so a member who reaches the platform under a secondary legacy address still matches.
- An email address held by more than one legacy account is a cross-account collision; collisions are detected and resolved during the legacy-data validation, before matching runs. An address still ambiguous after that surfaces no auto candidate, and the member falls back to another declared anchor or the admin help request.

Optional mailbox-control upgrade:

- For any declared old email, the member can request a confirmation-link round-trip: the platform sends a single-use, time-limited link (Administrator-configurable, default 24 hours, keyed by `account_claim_expiry_hours`) to the declared address. Clicking the link while logged into the same modern account upgrades the audit evidence tier from `declared_anchor_only` to `mailbox_control_via_link_click`.
- The round-trip is opt-in; soft-evidence declaration is sufficient to confirm cards. The round-trip provides a stronger audit trail for members who prefer it.
- Tokens are single-use, time-limited, account-bound, and rate-limited per requesting account, per target legacy row, and per session/IP.

Direct historical-record claim:

- Entry point: the historical detail page (`GET /history/:personId`). When the viewer's current real-name surname OR any declared former surname matches the historical record's surname, the record is unclaimed, and the record is not flagged deceased (`historical_persons.is_deceased = 0`), the page surfaces a "Claim this identity" CTA.
- The confirmation page shows the record's country, honor status (HoF / BAP if any), and a first-name warning when the member's first name is a variant of the record's first name (per the `name_variants` table seeded from mirror-mined pairs).
- On confirm, the system writes `members.historical_person_id`, carries forward `historical_persons`-sourced fields (country, honor flags, induction year, first competition year) under fill-if-empty merge semantics, and (in case E) transitively claims the back-linked legacy account, applying the full legacy-account claim effects in the same transaction, including the tier grant.
- Honors-bearing direct claims apply without admin pre-screening (no platform gate); honors data is validated a priori against the public rosters and an admin can review such claims on demand and revert a wrong one (see `A_View_Honors_Oversight_Feed`).
- A record flagged deceased (`historical_persons.is_deceased = 1`) is not self-claimable: the "Claim this identity" CTA is suppressed and the claim-confirm route (`/history/:personId/claim`) returns the standard non-claimable response, because a living member cannot claim a deceased person's identity as their own account. A member who believes a record was wrongly flagged uses the member-initiated admin help request (`A_Review_Member_Link_Help_Requests`).
- A historical record that is still linked to a deceased member is likewise not open for another member to claim: the deceased member keeps the historical-person link through the contact scrub (the record goes on honoring their contributions), so the record is treated as already held. The "Claim this identity" CTA is suppressed and the claim-confirm route returns the standard non-claimable response; a member who believes the record is genuinely theirs uses the member-initiated admin help request (`A_Review_Member_Link_Help_Requests`).

Cross-source candidate prompt:

- Immediately after a successful claim of one source, the platform searches the other source for a plausible candidate (surname agreement using current or declared former surname; country agreement; no other claimant). If a candidate is found, the wizard surfaces an inline follow-up card within the same `legacy_claim` task: "we also found a record that might be you, is this you?" The member can confirm, defer, or decline. Deferring or declining does not block progression to the `club_affiliations` task; a deferred cross-source card remains on the dashboard task widget for later resolution.

Registration-time conflict prompt:

- When the registrant actively navigates to a historical-record claim page (`/history/:personId/claim` or the wizard's claim task surface) and the platform detects that the registrant's surname (current or declared former) matches the surname on an already-claimed record, the wizard surfaces an inline "we already have a claim under this name, is one of these you?" prompt with details of the existing claim. The prompt is reactive (triggered by the registrant's navigation), not a proactive survey at signup. The real member arriving after an impersonator confirmed has an inline path to dispute through this affordance.

Anti-enumeration and rate limiting:

- User-visible messages never reveal whether a submitted identifier matched zero rows, multiple rows, an ineligible row, or an eligible row.
- Identifier lookups, declared-anchor changes, claim confirmations, and optional mailbox-link-click round-trips are rate-limited per requesting account, per target legacy row, and per session/IP.
- Claim-initiation surfaces are gated by a Cloudflare Turnstile CAPTCHA verified server-side before any DB read; identical UX regardless of match condition.

Stuck recovery:

- If the platform surfaces no candidate, the member's declared anchors do not resolve a candidate, and the mailbox-link round-trip is not viable (old mailbox unreachable, declared address malformed in the export, etc.), the member can invoke the admin help request affordance: a self-serve form collects an identity statement plus any evidence (free-text statement, attachments, references to known board / club members who can vouch). The request enters an admin queue per A_Review_Member_Link_Help_Requests.

All claim, declaration, mailbox-link, dispute, and revert events are audit-logged with the evidence-strength tag and the original-claim audit row identifier where applicable. A name-only confirmation (a medium-confidence staged candidate, or a direct historical-record claim passing only the surname rule) records the floor tier `declared_anchor_only`; an email anchor records `currently_controls_modern_email_matching_legacy` only when it is the member's verified login email; a declared old email records the floor tier until its mailbox-control round-trip completes.

### M_Complete_Onboarding_Wizard

Access: Newly verified members reach the wizard immediately after email verification. The wizard is the primary entry point for the onboarding task list managed by `MemberOnboardingService` and the primary cleanup channel for legacy club data.

Story: As a newly verified member, I am routed through outstanding onboarding tasks in fixed order (legacy account claim, club affiliations, optional metadata) so my account is bound to my pre-existing identity if any, my club affiliations are confirmed or corrected, the legacy club data I have authority over is cleaned up, and my profile is ready to use.

Success Criteria:

- After email verification, the member lands on the first wizard task without an intermediate landing page.
- The `legacy_claim` task is **universal** (always rendered): the task surfaces any staged candidates the platform found for this member's verified email or earlier-declared anchors, plus a prompt to declare optional anchors (former surnames, old emails) so the platform can look harder, plus a CTA into the direct historical-record claim affordance. Brand-new players with no pre-existing identity see the task and skip in one motion; returning members whose anchors did not auto-match see the prompt as an invitation to declare. Card-level UX and the claim mechanics are specified by `M_Claim_Legacy_Account`.
- The `club_affiliations` task content covers Stages 1A, 1B, and the wrap-up landing, plus a no-match exit that links to `M_Create_Club`. The wizard asks club questions only about the member's own mirror-suggested affiliations; a member with no suggested affiliation has no club to be asked about.
- On submission, the underlying state is written via the owning service and the `member_onboarding_tasks` row transitions to `completed`.
- `gender`, `first_competition_year`, and `show_competitive_results` are collected as fields within the `personal_details` task. The task itself is skippable, but on submission city, country, and date of birth are required; region is optional. Gender defaults to `undisclosed`.
- Applicability is computed against the claiming member's own account state, not against any historical-persons record the member has claimed. `members.is_deceased` and `historical_persons.is_deceased` are two independent fields: claiming a historical record never propagates the record's deceased flag to the living member's account, and the member runs the wizard normally.
- Every task offers a `Skip for now` action that transitions the `member_onboarding_tasks` row to `skipped`. Skipping does not block sign-in or any otherwise-authenticated surface; each skip emits an `audit_entries` row.
- The dashboard task widget (rendered on the personal-home view) queries `MemberOnboardingService.getTaskWidget(memberId)` and lists outstanding tasks (`pending` or `skipped`) ordered by catalog position, each with a `Resume` button that opens the same task UI used at registration (identical service contract regardless of entry point). Completing a task removes it from the widget. When no outstanding tasks remain, or when none are applicable, the widget renders nothing on the dashboard (no empty-state banner, no "all done" message). Skip-resume cycles emit one audit row per transition.

Club-affiliation task acceptance criteria:

- When mirror-derived club affiliation, leadership, or candidate suggestions exist for the member, the `club_affiliations` task presents them.
- Each suggestion shows the club name, city, country, and the member's inferred role (contact, member, leader, co-leader).
- Stage 1A (listed contact) and Stage 1B (affiliated but not listed contact) present two orthogonal questions per card, each in its own clearly-labeled fieldset: (1) membership confirmation, asked as "Were you a member of {clubName}?" with Yes / No options, and (2) activity signal, asked as "Is {clubName} still active?" with Still active / Not active anymore / Not sure options. Both answers are required; either may be answered first. The card submits via a dedicated "Save answers" button at the end of the form. The card also surfaces a "Not the right club? Browse all clubs" link that lets the member leave the wizard, search the clubs browse or map for the correct club, and return; the dashboard widget's "Continue onboarding" entry returns the member to the same un-signaled card. The membership question determines affiliation; the activity question feeds the `crowdsource_club_viability` predicate (see `A_Periodic_Club_Cleanup`). "Not sure" on the activity question is a safe escape that records no activity evidence. Content-editing gates key off membership confirmation and contact status, not the activity signal: Stage 1A confirmed members (listed contacts) edit club metadata directly; other members report inaccuracies to a co-leader out of band.
- The wizard does not offer in-wizard club search. After every Stage 1 card resolves, the task completes if a club affiliation was written during the run; otherwise it advances to the wrap-up landing. The wrap-up links to the clubs browse page filtered to the registrant's country (`/clubs/{countrySlug}`) where the member can browse clubs and use the regular join flow. The wizard never creates a `clubs` row except by promoting a confirmed candidate.
- Per-card actions persist immediately; on resume from the dashboard widget, the task re-renders only cards that have no signal recorded yet. Skipping the task transitions the row to `skipped`; resume returns the registrant to the first un-signaled card.
- Bootstrap leadership candidates carry a strong / weak / none classification derived at read time from structural signals recorded per (member, club): `listed_contact` (the legacy club page names the person as contact), `affiliation` (a legacy person-club affiliation row links them), `hosting` (the club hosted IFPA-registered events during the person's active competitive years), `roster` (the legacy member roster lists the person), and `mirror_text` (the club page narrative mentions the person by name or known alias). Strong requires `(listed_contact AND affiliation)` or `(hosting AND roster)` or `(listed_contact AND hosting)`; weak is any structural signal set that satisfies no strong gate; none is zero structural signals. Context modifiers (`tier_signal`, `recent_activity`, `geographic_alignment`) display alongside the signals but never change the classification. The classification is display-only: it labels the candidate badge and audit metadata and never gates promotion.
- Confirmed (or corrected) leadership promotes the bootstrap row (if any) into a live `club_leaders` co-leader row. Co-leaders are a flat equal set, capped at five per club; a member co-leads at most one club (`ux_one_club_leader_per_member`), so a registrant who already co-leads another club is affiliated to this club but not made a co-leader (an admin can resolve this via `A_Reassign_Club_Leader`). Cap-hit or already-co-leading claims still affiliate the member but insert no `club_leaders` row. The bootstrap claim is tier-exempt (a legacy leader reclaims their own club regardless of tier); confirming the affiliation grants the one-time club-join Active Player period, which gives a Tier 0 member Tier 1 benefits. Without a bootstrap row, co-leadership is offered to a registrant with Tier 1 benefits (Tier 1+ or Active Player) who confirms affiliation (the leadership-assumption offer; see `V_Volunteer_To_CoLead`). A leadership claim is never blocked by club status: a successful claim of an inactive or archived club returns the club to `'active'` in the same transaction, audit-logged as a revival.
- Confirming a club affiliation creates a new `member_club_affiliations` row with `source='legacy_claim'`. A member may hold at most two current club affiliations (primary and secondary); the first confirmed club is primary, the second is secondary. When the registrant already has two `is_current=1` affiliations, the cap is hit: no `member_club_affiliations` row is written, the legacy affiliation row is NOT marked `'confirmed_current'` (it stays actionable), and the card surfaces a cap message ("You are at the two current-club limit; mark one as former to add this"), mirroring the affiliated-only branch used when the five-leader cap is hit. Transferring current-affiliation status requires the explicit `M_Join_Club` / `M_Leave_Club` surface or admin remediation via `A_Reassign_Club_Leader`.
- Members can detour out of any Stage 1 club card to `M_Join_Club` or `M_Create_Club` without resolving the current card. Unsignaled cards remain unsignaled and signaled cards retain their signals. On detour, the `club_affiliations` task transitions to `in_progress_paused` in `MemberOnboardingService`; the dashboard task widget surfaces "Resume onboarding" which returns the member to the same card. Detour decisions are audit-logged with member ID, target story, source wizard card, and timestamp.
- On the wrap-up landing, members below Tier 1 see the create-club action replaced by a notice stating that creating a club requires IFPA Membership (Tier 1) because they become the club's first co-leader, with a pointer to the upgrade surface on their profile; after upgrading, the wrap-up renders the "Create a new club" action directly. Tier 1, Tier 2, and Tier 3 members route directly to `M_Create_Club`. The notice does not block; the member can browse clubs or skip regardless of tier.
- At the end of the `club_affiliations` task, if no `member_club_affiliations` row was written during the wizard run, the wizard's final screen displays a "Find or create your club" landing with three options: "Join an existing club" routes to the clubs browse surface and `M_Join_Club`, "Create a new club" routes to `M_Create_Club` (members below Tier 1 see the tier-requirement notice above instead of the create action), and "Skip for now" completes the wizard with no club affiliation. The dashboard task widget surfaces "Continue onboarding" until the member explicitly dismisses or completes the task.
- The dashboard task widget reflects the `club_affiliations` task state across the lifecycle: `in_progress` (one or more cards remain unsignaled) shows "Continue onboarding"; `in_progress_paused` (member detoured) shows "Resume onboarding" and returns to the same card on click; `skipped` shows "Continue onboarding" until explicit dismissal or completion; `completed` follows the existing completed-task pattern.
- Promotion of onboarding-visible or dormant candidates to live `clubs` rows happens on member confirmation in the wizard.
- All outcomes (current, former, rejected, historical, reported-inactive) are persisted so the member is not repeatedly prompted.
- Wizard activity signals are recorded as structured rows in `club_viability_signals`; membership confirmations and rejections persist as `legacy_person_club_affiliations` and bootstrap-row status transitions. The onboarding wizard is the only surface that collects activity signals, and club pages carry no feedback affordance. Activity signals feed the `crowdsource_club_viability` predicate in `A_Periodic_Club_Cleanup`, counted one vote per member (a member's latest signal for a club supersedes their earlier ones), combined with legacy classification and operational state; when an admin opens the cleanup queue it surfaces a one-click recommendation (demote for concordant inactivity, or review for the sole ambiguous case of a single negative signal contradicting strong legacy with no operational life).
- Junk candidates are never shown in any stage.

Optional metadata task acceptance criteria:

- `first_competition_year`: collected as a field within the `personal_details` task alongside city, region, country, and date of birth. Prefilled from `historical_persons.first_year` when a legacy claim has linked an HP record, otherwise blank. The value is editable later via M_Edit_Profile.
- `show_competitive_results`: collected as a checkbox within the `personal_details` task. Default on. The toggle is editable later via M_Edit_Profile.
- `gender` (competition eligibility): collected as a Male / Female / Prefer-not-to-say field within the `personal_details` task, alongside date of birth, stored as `male` / `female` / `undisclosed` and defaulting to `undisclosed`. Owner-and-admin by default; a member may later opt in (via M_Edit_Profile) to show it to signed-in members on the profile, in member search, and on club rosters. Used only for gender-gated event-category eligibility. The value and its visibility are editable later via M_Edit_Profile.

## 3.2 Profile Management

### M_Edit_Profile

Access: Members can edit their own profile information, subject to validation rules.

Story: As a member, I can view and edit my profile (bio, avatar, contact prefs, competition history, external URLs) so that others see accurate info.

Success Criteria:

- Member profile creation and editing (photo, bio, contact preferences).
- **Name display:** Display name is set at registration and cannot be changed. The surname constraint is enforced at registration: display name must share a surname with `real_name` (suffix-stripped: Jr, Sr, II, III, IV). Contact IFPA admin for corrections.
- City, country, and email are mandatory fields; phone is optional.
- **Contact fields and per-field visibility:** `phone` and `whatsapp` are optional, both editable here (`whatsapp` format-validated, rendered as a chat link). Each contact field (contact email, phone, WhatsApp) has its own visibility toggle, default off. When toggled on, the field is shown to authenticated members only (Sensitivity 2), never on public surfaces. Holding a club co-leader or event organizer role forces that member's contact email visible to authenticated members and locks its toggle on while the role is held (see DATA_GOVERNANCE §3). Changes are audit-logged.
- **Gender (competition eligibility):** editable (Male / Female / Prefer not to say; stored `male` / `female` / `undisclosed`). Owner-and-admin by default; a member may opt in via a "Show my gender on my public profile" toggle (default off) to make it visible to signed-in members on the member profile, in member search, and on club rosters. Only Male / Female render when opted in (Prefer not to say stays hidden), and it is never shown to an unauthenticated visitor. Used only for gender-gated event-category eligibility (see M_Register_For_Event). The value and the visibility toggle are both editable here; changes are audit-logged.
- **Discoverable in member search** (`searchable`, default on): a self-service toggle labeled "Allow other members to find me in member search." When off, the member is excluded from `M_Search_Members` results (enforced by the `members_active` view), but their profile remains reachable by direct link and they still appear to club co-members on rosters; the toggle governs search inclusion only. Changes are audit-logged.
- **Competition history fields:**
  - `first_competition_year` (optional): editable integer field. Shown as "Competing since {year}" on profile. Leave blank to hide (opt-out by clearing). Pre-populated from `historical_persons.first_year` during legacy claim if the member has not already set a value.
  - `show_competitive_results` (default on): toggle controlling whether competition results appear on the member's public profile. The member's own profile view always shows their results regardless of toggle state.
- **Declared identity anchors (always private; declared in the legacy-claim task reached from this page, not edited inline here):**
  - `former_surnames` (optional, multi-valued): zero or more surnames the member previously used (e.g. before marriage). Participates in legacy-claim matching alongside the current real-name surname. Never displayed on public surfaces, member search, or any cross-member listing. Visible only to the member and to admin.
  - Declared old emails (optional, multi-valued): email addresses the member previously controlled. Participate in legacy-claim matching against every email a legacy account carried (the primary `legacy_email` plus up to two secondary addresses). Each declared address may optionally be promoted to mailbox-verified evidence via a confirmation-link round-trip (see the umbrella legacy-claim story). Never displayed on public surfaces. Visible only to the member and to admin.
  - Declared anchors are cleared along with claim back-links during PII purge (see M_Delete_Account).
- Member search is authenticated members only, never public. Search results show display name and country, plus gender when the member has opted in to gender visibility; email and contact fields are never exposed in search results.
- Public visibility (visible to all including visitors): Events list, news feed, public galleries (if explicitly marked public).
- Members-only visibility (visible to logged-in members): Member profiles, club rosters, event participant lists, member search results.
- Private visibility (visible only to owner or admins): contact email, phone, and WhatsApp (each unless the member opts that field in to authenticated-member visibility, or a co-leader/organizer role forces the email visible), payment history, audit records.
- Membership tier badges and current Active Player badges visible to logged-in members on: profiles, club rosters, event participant lists, search results, media author info.
- Membership tier badges and Active Player badges NOT visible to anonymous visitors.
- External URLs on profiles (maximum 3) are validated before publication and presented safely (e.g., clearly labeled and protected against malicious links).
- Key actions are recorded in the audit log.
- Member profile will automatically show club affiliation, media galleries, and links to event results, if participated.
- Display names are constrained to prevent homograph attacks (for example: no mixed scripts or confusable characters, and reasonable length limits).

### M_Contact_IFPA_Admin

Access: Authenticated members can submit a structured contact request to the IFPA administrator for issues the self-service tools do not handle (display-name corrections, profile-URL corrections, tier-status questions, identity-link disputes, anything else that requires admin action).

Story: As a member, I can submit a structured contact request to the IFPA administrator from my profile edit page so that I can resolve account issues without leaving the platform and so the administrator sees my request alongside other admin work.

Success Criteria:

- The profile edit page surfaces a "Contact IFPA admin" link next to the read-only identity block.
- The link opens a slug-scoped owner-only form (`/members/:slug/contact-admin`) with: a category dropdown (Display name correction, Profile URL correction, Tier-status question, Identity-link issue, Group creation request, Vote creation request, Other), a free-text message textarea (required, up to 2000 characters), and a submit button.
- On submit, the member sees a confirmation banner: "Your request has been sent to the IFPA administrator. We will reply by email."
- Submitting writes one `work_queue_items` row with `queue_category='membership'`, `task_type='member_contact_request'`, `entity_type='member'`, `entity_id=<requesting_member_id>`, `status='open'`, `priority=5`, `reason_text=<category-label>: <first 200 chars of message>` (operational summary), and `detail_text=<full message body>` (the admin reads the whole request from this purgeable column).
- Submitting writes one `audit_entries` row with `actor_type='member'`, `action_type='support.contact_request_submitted'`, `category='support'`, `reason_text=<category-label>`, and `metadata_json` carrying the category enum value and the message length. The full message body is held in the purgeable `work_queue_items.detail_text` column (cleared on account erasure), keeping member-authored free text out of the append-only audit ledger.
- A member can hold at most 3 `status='open'` contact requests at a time. A 4th submission returns HTTP 429 with a clear error message that points to the member's open requests.
- Anonymous visitors do not see this form. The visitor-facing contact path remains the `admin@footbag.org` address surfaced on `/legal`.
- The form is not exposed on any other member's profile: slug mismatch returns 404 (anti-enumeration), matching the owner-only-slug pattern used elsewhere.
- HTML, unicode, and other adversarial input in the message body is stored verbatim in the purgeable `work_queue_items.detail_text` operational copy and escaped when rendered on the admin queue view. The templated resolution email does not echo the member's message back.

### M_Search_Members

Access: Members an search for other members within the visibility and privacy rules.

Story: As a member, I want to search for other members by name so that I can find and connect with other players in the community.

Success Criteria:

- Search by Display Name.
- Support substring matching (e.g., "foot" matches "Jane Footbag").
- Minimum 2-character query length; maximum 20 results per page.
- Members may opt out via `searchable: false` profile flag. `searchable` means eligible for authenticated member lookup only; it does not mean publicly discoverable or contactable. Members set this via the "Discoverable in member search" toggle in M_Edit_Profile.
- Search results exclude: (a) members with `searchable: false`, (b) members currently in the deletion grace period (account deleted but not yet purged), and (c) deceased members. Only active members with `searchable: true` are returned.
- Broad queries return a capped result set with a "refine your query" prompt; no exhaustive browse-all or full pagination.
- This is the only member search feature. It is authenticated-only and deliberately narrowing; not a member directory.

### M_View_Profile

Access: Members can view other members' profiles according to each profile's visibility settings.

Story: As a member, I can view member profiles so that I learn about other members or see how my own profile appears to others.

Success Criteria:

- Member can view any member profile (own or others).
- Profile displays: photo, display name, city, country, bio, tier badge, external URLs, club affiliation (if any), and gender when the member has opted in to gender visibility (shown to signed-in members only).
- **Historical name:** When a member has a linked historical person whose name differs from the member's current display name, the historical name is shown on the profile (e.g., "Also known as {historical name} in competition records").
- **Competition history:** If `first_competition_year` is set, display "Competing since {year}" on the profile. If `show_competitive_results` is on (or the viewer is the profile owner), display the member's competition results section. Results section includes the caveat text: "Published event results only. Historical records may be incomplete."
- Email address shown only if: (viewer is profile owner) OR (profile owner opted in to email visibility).
- Membership tier badges and current Active Player badges visible to logged-in members only on profiles, club rosters, event participant lists, search results, media author info. Honor badges such as Hall of Fame (HoF), Big Add Posse (BAP), and Board Member are visible to all users (including visitors) wherever the member appears.
- Profile shows member's uploaded photos and videos in thumbnail grid.
- When viewing own profile: link to edit profile, clear indication of current membership tier and Active Player status with expiry date (if applicable).
- When viewing other profile: no access to private information (payment history, audit logs).

## 3.3 Club Membership

### M_Join_Club

Access: Members can join up to two clubs.

Story: As a member, I can join a club so that I appear on its roster.

Success Criteria:

- A member may hold at most two current club memberships (primary and secondary). The first club joined is primary; the second is secondary. Joining a second club does not affect the first. Attempting to join a third current club is blocked with a clear message directing the member to leave an existing club first.
- Club roster retrieved by aggregating members where clubId matches.
- Club member roster visible to all logged-in members (not visitors).
- Roster shows member display name, membership tier badge, current Active Player badge where applicable, any special flags (HoF, BAP, Board), and city/country.
- Roster does NOT show member email addresses unless member has opted in to email visibility.
- Joining sends an email notification to the member, and all current co-leaders.
- When joining a club, the member sees the club's current description and external URL. Co-leaders edit these directly via `CL_Edit_Club` or wizard Stage 1A; other members report inaccuracies to a co-leader out of band (a co-leader's contact email is visible to authenticated members). Club content has no in-app suggestion or review queue.
- If the joining member is Tier 0 and has never previously been an Active Player, the first IFPA club join grants one 730-day Active Player period.
- The one-time club-join Active Player grant does not change membership tier.
- Joining additional clubs does not grant additional Active Player periods.
- The club-join Active Player grant is audit-logged with member ID, club ID, grant date, old Active Player expiry if any, new Active Player expiry, and reason `club_join_one_time_active_player_grant`.

### M_Leave_Club

Access: Members can leave a club they currently belong to.

Story: As a member, I can leave a current club to be removed from the roster.

Success Criteria:

- Leaving sets `member_club_affiliations.is_current=0` and `is_primary=0` for the member-club pair.
- If the member leaves their primary club and still has a secondary club, the UI reminds them they have a remaining club and prompts them to designate it as primary. The secondary club is not auto-promoted.
- A member who is the club's only co-leader is warned before leaving ("You are the only co-leader; the club will have no member-visible contact until someone steps up") and may invite a successor first via `CL_Manage_CoLeaders` or proceed. Leaving as the last co-leader leaves the club leaderless, a tolerated state per §5.1, not blocked.
- Leaving a club where the member also held a `club_leaders` row removes that co-leader row in the same transaction.
- Leaving sends an email notification to the leaving member and to all current co-leaders.
- The leave action is audit-logged with actor identity, club id, before and after affiliation state, and timestamp.

### M_View_Club

Access: Members can view full club details and rosters. Visitors see only public club information.

Story: As a member, I can view club details and member roster so that I learn about clubs and see who belongs. Also I can find the contact information of the club's co-leaders.

Success Criteria:

- Club page displays: club name, logo, description, city, country, external URL (if provided), standardized hashtag. To authenticated members it also shows each co-leader's contact email (and that co-leader's WhatsApp where they opted in).
- Member roster shows all members where clubId matches the club.
- Roster displays: member display name, membership tier badge, current Active Player badge where applicable, city, country, and gender when the member has opted in to gender visibility.
- Email addresses shown only if member has opted in to email visibility.
- Roster sorted alphabetically by display name.
- Club detail page includes a link to the club media gallery (for example, "View Club Gallery") when at least one media item exists, without showing image or video counts in the link text.
- Co-leaders array displayed on club detail page showing all current co-leaders.

## 3.4 Event Participation

### M_Register_For_Event

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
- Gender-gated categories require a declared gender to enter the gendered draw. Mixed doubles requires one member with gender Male and one with gender Female; women's categories (such as women's net) require gender Female. A member whose gender is "Prefer not to say" (stored as undisclosed) is not eligible for gender-gated categories but is eligible for Open, where men and women both play; that member can record a gender in their profile at any time to unlock the gendered draws. Gender validation applies only between two member profiles. For a free-text (non-member) partner, the registrant attests and the organizer verifies eligibility at check-in.
- When a member selects a gender-gated category while their stored gender is `undisclosed`, the registration surface warns them that the gendered draw requires a declared gender and points them to set it in their profile; the member may still register for Open categories.
- If Attendee/Supporter: no categories are required; optional fields may be collected if configured by organizer (e.g., t-shirt size, donation amount).
- Confirmation email includes registration type and selected categories and/or partners (if any).
- Some events are free and others are paid.
- For paid events, the member must complete the Stripe checkout process to be officially registered. Changes are applied only after webhook-confirmed success.
- Event registration payments affect registration status only and do not directly change membership tier.
- When the registered participant count reaches the event's (optional) capacity limit, the event status automatically changes to `registration_full`. Subsequent registration attempts receive the message: "This event has reached capacity and is no longer accepting registrations." No waitlist functionality exists.
- If the registrant selects a category where the event organizer has set `requires_routine_music=true` (a new boolean on event categories, settable in `EO_Edit_Event`), the registration is marked incomplete until the member uploads an mp3 routine-music file via `M_Upload_Routine_Music` for that registration entry.
- If the registrant has not uploaded the required routine music by the event registration deadline, the registration remains incomplete and is treated as not-confirmed for participant counts, exports, and check-in.
- Registrants receive an email reminder at admin-configurable offsets before the deadline (`routine_music_reminder_days_1` default 7 days, `routine_music_reminder_days_2` default 1 day) when a required upload is missing.
- For doubles or team routine categories, the registering member uploads on behalf of the entire entry; partners do not have independent upload access at launch.

### M_Upload_Routine_Music

Access: Members registered in an event category with `requires_routine_music=true` can upload, attach, replace, detach, and play back their own routine-music files. Members manage their personal routine-music library outside any single event via `M_Manage_Routine_Music_Library`. For doubles or team routine entries, the non-uploading partner(s) can play back the attached track for verification but cannot upload, replace, detach, or delete.

Story: As a freestyle competitor registered in a routine category, I can upload my routine music as an mp3 file so that the event organizer can play it during my performance, I can verify my upload before the event, and I can reuse the same track for future event registrations without re-uploading.

Success Criteria:

- The form is available to members with a registration in a category where `requires_routine_music=true`, and only before the event's registration deadline.
- The form offers two paths: (a) upload a new mp3 file, or (b) attach an existing file from the member's personal routine-music library on S3 without re-uploading.
- Accepted format at launch: mp3 only. Other audio formats are rejected with a clear error message. Support for additional formats is a future addition, admin-configurable when added.
- Sanitization (per §1 file upload safety model): the audio is processed through FFmpeg with arguments `-map 0:a:0 -map_metadata -1 -c:a libmp3lame -b:a 128k -ar 44100`, which selects only the audio stream, drops all metadata and embedded album art, and re-encodes to a normalized 128 kbps / 44.1 kHz mp3. The re-encoded output is stored; the original upload is discarded. This eliminates any non-audio payload (id3-tag malware, trailers, polyglot tricks) by construction.
- Future scope (proposed, not at launch): screen uploaded tracks against third-party copyright-block matchers (for example YouTube Content ID) and warn or reject uploads likely to trigger blocks when event video is later published.
- Maximum file size is admin-configurable (`routine_music_max_size_mb`, default 20 MB), measured against the original upload before transcoding. Oversized files are rejected with a clear error message.
- Files are stored in private object storage (S3) as durable member-owned media, on the same storage pipeline as member-uploaded photos. Files persist permanently in the member's library; there is no auto-purge.
- Files are served via short-lived signed URLs only to (a) the uploading competitor at any time, (b) the non-uploading partner(s) on any joint registration the file is attached to, and (c) the event organizer(s) of any event the file is currently attached to via a registration entry, through and after event end. Files are never publicly accessible.
- At upload, the member supplies a short library label (required, max 60 characters, for example "Worlds 2026 routine"). The label is stored on the library row as that file's default.
- Each upload creates one row in the member's routine-music library. Attaching a library file to a registration entry creates a separate join row tying the file to that registration's (event_id, event_category_id) pair. A single library file may be attached to many registration entries across events. Event categories on attachment rows align with the EO-defined event categories from `M_Create_Event` and `EO_Edit_Event` (freeform per event, as the EO defines them).
- At attachment time the member may override the library file's default label for that specific attachment. The override is stored on the attachment row; the library default is unchanged.
- Within a single registration entry, replacement swaps which library file is attached; replacement does not delete the previously attached file from the member's library.
- After the registration deadline closes, the competitor can no longer attach, replace, or detach the file for that event; the attachment is locked for the event.
- Competitor can delete a library file at any time. Deletion removes the file from object storage and all attachment rows for past, current, and future events. Past-event registration records retain a tombstone reference noting the file was deleted by the competitor.
- All upload, attach, replace, detach, delete actions are audit-logged with member ID, event ID (if applicable), event category ID (if applicable), file ID, action, timestamp.

### M_Manage_Routine_Music_Library

Access: Any member can view, play back, upload, label, and delete their own routine-music library files at any time.

Story: As a member who uses routine music for footbag events, I can manage my personal routine-music library so that I can reuse tracks across events, replace stale uploads, update labels, and remove tracks I no longer want stored.

Success Criteria:

- Library view lists all routine-music files the member has uploaded, showing label, filename, file size, upload date, and the list of past/current attachments rendered as (event name, EO-defined event category) pairs.
- Member can play back any library file via a short-lived signed URL.
- Member can upload a new library file independent of any event registration, supplying a label at upload.
- Member can edit a library file's default label at any time. Editing the default does not retroactively change per-attachment label overrides; those remain on the attachment rows.
- Member can delete any library file. Deletion follows the cascade defined in `M_Upload_Routine_Music`: file removed globally, past-event registration records show a tombstone.
- Library is private to the member. Not visible to other members. Event organizers see only files attached to events they organize, via `EO_Play_Routine_Music`. Doubles/team partners see only files attached to joint registrations they are also on.
- All library actions are audit-logged with member ID, file ID, action, timestamp.

### M_View_Event

Access: Members can view their full event details, including their own registration status and member-only information.

Story: As a member, I see my own registered events in two sections: upcoming events and past events with results.

Success Criteria:

- Upcoming Events section shows events where member is registered AND startDate greater than today AND status in (published, registration_full, closed).
- Past Events with Results section shows events where member participated AND the event has published results records.
- Each entry shows event title, date, location, status or placement.
- One-click access to event details, results, and media galleries.
- For events the member is registered for, the event detail view displays the member’s registration type and selected categories/partner info (if applicable).

## 3.5 Payments

### M_Donate

Access: Members can make one-time or recurring donations using the site's Stripe-powered checkout.

Story: As a member, I can make a one-time or recurring annual donation to support IFPA and its activities, optionally including a short comment that will be stored with my donation, so that I can financially support the community and, if I want, include context or a personal note with my contribution.

Success Criteria:

- From my member account, I can open a donations page that clearly shows suggested donation amounts, an optional custom amount field, and whether this donation is one-time or recurring annual before I proceed to payment.
- I can enter an optional short comment or note with my donation (for example: In memory of…). This comment is stored as part of the structured payment record.
- For HoF members, this comment should default to HoF Fund. For BAP members, this comment should default to BAP Fund. If a member is both HoF and BAP, use the HoF default.
- One-time donations use Stripe Checkout so that card details never touch IFPA servers. The payment record stores Stripe payment_intent_id, amount, currency, and status.
- Recurring annual donations use Stripe Subscriptions via Stripe Checkout (with the subscription mode parameter). The system creates or reuses a Stripe Customer object for the member (storing the resulting stripeCustomerId on the member record) and creates a Stripe Subscription billed yearly. The platform stores the Stripe subscription_id and the associated stripeCustomerId in the donation record. The platform does not manage the billing schedule itself; Stripe owns the renewal cycle and retry logic.
- The donation comment is stored in Stripe Subscription metadata and also in the local payment record so that it survives across all subsequent billing cycles.
- For recurring donations, the local database stores: stripeSubscriptionId, stripeCustomerId, status (active, canceled, past_due), the donation amount, currency, interval (yearly), start date, and the donation comment. The platform records each successful charge as a new payment record when the invoice.payment_succeeded webhook is received. No next_charge_date field is maintained by the platform; Stripe owns the schedule.
- After a successful donation setup, I see a clear confirmation message in the UI and receive a confirmation email with amount, date, interval (one-time or yearly recurring), and basic reference information, but not full card details.
- If the payment fails or is canceled during checkout, I see a clear error or cancellation message and no donation record is created.
- I can cancel an active recurring donation from my Payment History page at any time. Cancellation sets the Stripe Subscription to cancel_at_period_end=true so I retain the current period's donation intent and no further charges occur. I see a clear confirmation message and receive a cancellation confirmation email. The local subscription status updates to canceled when the customer.subscription.deleted webhook is received.
- All donation records (including comment, amount, recurrence info, Stripe subscription_id, and stripeCustomerId) are stored in a way that can be aggregated later for reporting, reconciliation, and tax-related exports where applicable.

### M_View_Payment_History

Access: Members can view their own donation and payment history.

Story: As a member, I can see a history of all my payments to IFPA (donations, membership purchases, and event registration fees), including key details and any comments provided for donations, so that I can keep track of what I have paid, reconcile my own records, and confirm that charges are correct.

Success Criteria:

- From my account area, I can open a Payment History page that lists my payments in reverse chronological order.
- The history includes at least: date, type (Donation, Membership, Event Registration, etc.), amount, payment status (succeeded, pending, etc.), and a concise descriptor (for example “Membership: Tier 2 IFPA Organizer Member”, “Donation: HoF Fund”, “Event Registration: Worlds 2027 – Singles”).
- For donation entries, any comment I provided in the donation flow is visible to me as a “Note” or similar field in the history, so I can confirm that the note was recorded correctly.
- Each payment entry includes a stable payment reference (for example a truncated Stripe payment intent ID or a friendly reference) so that support or admins can correlate my view with internal reconciliation tools.
- Recurring donations are clearly labeled as such, and it is straightforward to distinguish the original subscription setup from subsequent annual renewal charges. Active recurring donations show a Cancel Recurring Donation action. canceled or past_due subscriptions are clearly indicated with their status. The Payment History page does not allow me to edit historical payments, but provides links or obvious instructions for how to get support if I find a problem.

## 3.6 Membership Tiers and Flags

Refer to IFPA Membership Rules Reference and Terminology in section 1.2 above, as all those rules must be enforced in all User Stories given below.

In user stories below, "Access: Tier X+" means the authenticated member's current tier is X or higher. Tier 1 includes all Tier 0 privileges. Tier 2 includes all Tier 1 privileges. Tier 3 includes all Tier 2 privileges.

### M_Purchase_Tier_1

Access: Logged-in members at Tier 0 can use this flow to purchase Tier 1 IFPA Member lifetime membership. Members who are already Tier 1, Tier 2, or Tier 3 do not see this option.

Story: As a Tier 0 Member, I can upgrade to Tier 1 IFPA Member lifetime membership by paying the configured Tier 1 price through Stripe Checkout so that my account reflects my lifetime IFPA membership.

Success Criteria:

- Member must be logged in (Tier 0 members can purchase, visitors must register first).
- Member sees a clear "Upgrade to Tier 1 IFPA Member" option from their account/dashboard when eligible.
- System creates Stripe Checkout Session with configurable amount.
- Member redirects to Stripe-hosted payment page.
- After successful payment confirmation via Stripe webhook, the account membership tier changes to Tier 1 and this is visible in the profile and dashboard. Tier changes are applied only after webhook-confirmed success. If the buyer was a Tier 0 Active Player, Active Player status ends because Active Player applies only to Tier 0 members.
- If payment fails or is canceled, tier does not change and member sees a clear error message explaining that the upgrade did not complete.
- Payment confirmation email sent to member.
- Payment appears in member's payment history with note to explain.
- All payment events are audit-logged.
- Member sees a clear success message when the action completes successfully, including next steps: Tier 1 IFPA Member activated! You can now vote in IFPA elections, participate on IFPA committees, and access IFPA-member-only areas of footbag.org.
- Member sees a clear error message when the action fails.

### M_Purchase_Tier_2

Access: Logged-in members at Tier 0 or Tier 1 can purchase Tier 2 IFPA Organizer Member lifetime membership. Visitors must register for an account before purchasing. Members who are already Tier 2 or Tier 3 do not see this option.

Story: As a Tier 0 or Tier 1 member, I can purchase Tier 2 IFPA Organizer Member lifetime membership through Stripe Checkout so that I can access Tier 2 organizer benefits.

Success Criteria:

- Member must be logged in (Tier 0 or Tier 1 members can purchase, visitors must register first).
- Eligible members see a clear "Upgrade to Tier 2 IFPA Organizer Member" option.
- System creates Stripe Checkout Session using the configured Tier 2 price.
- Member redirects to Stripe-hosted payment page.
- Tier changes are applied only after webhook-confirmed payment success.
- After successful payment confirmation via Stripe webhook, the account membership tier changes to Tier 2 and this is visible in the profile and dashboard. If the buyer was a Tier 0 Active Player, Active Player status ends because Active Player applies only to Tier 0 members.
- Tier 2 status is lifetime and has no expiry date.
- If payment fails or is canceled, membership tier does not change and a clear error message is shown.
- Payment confirmation email sent to member.
- Payment appears in member's payment history labeled "Membership: Tier 2 IFPA Organizer Member".
- All payment events are audit-logged.
- Member sees a clear success message when the action completes successfully, including next steps: Tier 2 IFPA Organizer Member activated! You can now access organizer features, including applying for event sanctioning, requesting sponsorship, sending community announcements to [announce@footbag.org](mailto:announce@footbag.org), and accessing organizer-only areas of footbag.org.
- Member sees a clear error message when the action fails.

### M_View_Tier_Status

Access: Members can view their current membership tier, Active Player status if applicable, and Active Player expiry date.

Story: As a Member, I can view my current lifetime membership tier, Active Player status if applicable, tier-related benefits, and any upgrade options in one place so that I understand my IFPA status.

Success Criteria:

- Page shows current membership tier with badge display: "Tier 0 Registered Member", "Tier 1 IFPA Member", "Tier 2 IFPA Organizer Member", or "Tier 3 IFPA Director".
- Page shows whether the member currently has Active Player status. If current, the page shows the Active Player expiry date and explains that Active Player gives a Tier 0 member Tier 1 benefits while current. If expired, the page indicates that Tier 1 benefits and Official IFPA Roster inclusion have ended.
- Page describes, at a high level, the benefits associated with the current membership tier and, separately, Active Player status.
- Page provides a clear "Upgrade Now" button (where applicable) that initiates Stripe Checkout flow. Tier 0 members see upgrade options for Tier 1 and Tier 2; Tier 1 members see an upgrade option for Tier 2; Tier 2 and Tier 3 members do not see upgrade prompts.
- Membership tiers have no expiry date.
- Tier 3 members see their underlying membership tier, which is the tier they will revert to when Tier 3 governance status ends.
- Membership tier badges and current Active Player badges visible to logged-in members on: profiles, club rosters, event participant lists, search results, media author info.
- Membership tier badges and Active Player badges NOT visible to anonymous visitors.

### M_Active_Player_Expiry

Access: Tier 0 members with current or recently expired Active Player status.

Story: As a Tier 0 Active Player, I can understand when my Active Player status expires and what access changes when it expires, so that I know whether I still have Tier 1 benefits and Official IFPA Roster inclusion.

Success Criteria:

- Active Player expiry affects only Tier 0 members; membership tier is never changed by Active Player expiry.
- When Active Player status expires, the member remains Tier 0, loses Tier 1 benefits, and is no longer included in the Official IFPA Roster.
- Existing event registrations remain valid for that event regardless of Active Player expiry timing.
- Member receives email notification at Administrator-configurable offset(s) before Active Player expiry (defaults: 30 and 7 days) reminding them how to regain Active Player status (later qualifying event attendance, vouch from a Tier 2 or Tier 3 member, or, if not previously used, a one-time first-club-join grant).
- Member receives a built-in day-of expiry notification (T+0; not separately administrator-configurable) confirming Active Player status has ended and explaining which features are now restricted.
- The one-time club-join Active Player grant cannot be repeated after Active Player expiry; it is consumed by first use.
- Active Player expiry events are audit-logged with member ID, previous Active Player expiry date, expiry processing date, and reason `active_player_expired`.
- The actual expiry processing is performed automatically by the SYS_Check_Active_Player_Expiry system job; no manual admin action is required.
- Event Organizer continuity: If the member is serving as an Event Organizer for events in `published`, `registration_full`, `closed`, or `completed` status when Active Player status expires, the member retains Event Organizer role permissions for those specific events until each event reaches `completed` status. This prevents organizers from being locked out of managing active events mid-lifecycle.

### M_Vouch_For_Active_Player

Access: Tier 2 or Tier 3 members can vouch for Tier 0 members to receive or extend Active Player status.

Story: As a Tier 2 or Tier 3 member, I can vouch for a Tier 0 member so that they receive or extend Active Player status and gain Tier 1 benefits while Active Player status is current.

Success Criteria:

- Vouching action is available to Tier 2 and Tier 3 members at any time. There is no time-windowed direct-roster-access mechanism and no admin-approval workflow.
- The target member must be Tier 0. If the target is Tier 1, Tier 2, or Tier 3, the action is a no-op and the UI displays "No change needed - Active Player status applies only to Tier 0 members."
- If the target is Tier 0 with no current Active Player status, vouching grants Active Player for the configured duration (default: 730 days from the vouch date).
- If the target is Tier 0 with current Active Player status, vouching extends Active Player only if the new expiry date (vouch date + 730 days) would be later than the existing expiry date. An older vouch must not shorten an existing later Active Player expiry date.
- Vouching never changes membership tier.
- Vouching action is audit-logged with: voucher member ID, target member ID, target tier at vouch time, old Active Player expiry, new Active Player expiry, timestamp, reason `tier2_vouch_active_player`.
- Vouched member receives an email notification: "You have received Active Player status from Voucher Name. Your Active Player status is now active until expiry date. As an Active Player you have Tier 1 benefits while current."
- Vouching submissions are rate-limited per voucher to prevent abuse (Administrator-configurable; safe defaults).

## 3.7 Voting

The following stories are for (non-admin) Members. More voting-related stories are given as Admin stories below (primarily A_Create_Vote).

### M_View_Vote_Options

Access: Different specific votes have different access rules (based on inclusion list, Tier status, HoF or BAP or Board flag). Therefore this workflow must mimic these access rules exactly. If the member can not vote for a given topic then they cannot see the options.

Story: As an eligible member, I can view the details of an active or upcoming vote (election or issue vote) so that I understand what is being decided and what my options are.

Success Criteria:

- Vote detail contains: title, description, eligibility rule summary, nomination window (optional), voting window, and background materials per option.
- Eligibility to vote is determined by the vote's configured rules (as defined in A_Create_Vote), not hard-coded in this story. For example, a HoF election is typically configured by the admin to restrict eligibility to members with the HoF flag, but this is a configuration choice, not a system constraint. Admins may configure any combination of tier, flag, or explicit inclusion list per A_Create_Vote.
- HoF elections also require that members be nominated during the nomination window, and that every candidate submits an affidavit to be included in the ballot, which will be included in the background materials.
- Page shows the list of choices (candidates or issue options) once the vote is open (or earlier if configured by admins).
- If the member is not eligible, then they will not see this option in the UI.
- Only eligible members can see voting details and submit a ballot.
- Member can submit exactly one ballot per vote.
- Ballot is stored in a way that preserves voter privacy and supports later tallying and cryptographic receipt verification. The server generates a random receipt token at submission time, emails the raw token to the member (and includes the SHA-256 hash in the email for reference), and stores only a SHA-256 hash of that token, never the raw token itself.
- Member receives a verification receipt by email after voting.
- Once a vote's status is 'published', vote results are visible to all members regardless of eligibility. The eligibility restriction applies only during the active voting period. This provides maximum transparency.

### M_Vote

Access: Different specific votes have different access rules (based on inclusion list, Tier status, HoF or BAP or Board flag).

Story: As an eligible member, I can cast an encrypted ballot in any active vote, so that my vote is recorded privately and counted in the final tally.

Success Criteria:

- Eligibility determined at vote opening time with a snapshot frozen for vote duration (UTC timestamps).
- After a ballot is accepted, the server generates a cryptographically random receipt token (UUID v4), emails the raw token to the member (and includes the SHA-256 hash in the email for reference), and stores only SHA-256(token) in the database. The raw token is never persisted. The member must retain this email to use receipt verification; the system cannot recover a lost token.
- Ballots are encrypted before storage and remain secret. Admins can only decrypt aggregated results via an automated process; nobody can see how an individual member voted. All decrypt operations are fully audit logged.
- Member sees a clear success message when vote is successfully recorded.
- Member sees a clear error message if voting fails, including a short explanation.

### M_Verify_Vote_And_View_Results

Access: Different specific votes have different access rules, and therefore this verification workflow must mimic these access rules exactly. If the member did not vote then they cannot verify that (non-existent) vote, but they can see the results if they were eligible.

Story: As a member who voted (or was eligible to vote) for a given topic, I can see the aggregated results. I can also verify that my ballot was included in the final tally using my verification receipt, so that the result is transparent and trustworthy.

Success Criteria:

- Voter submits the raw receipt token from their email to the verification page. The system computes SHA-256(submitted token) and checks it against the stored hash for that vote. A match confirms the ballot was recorded; no match (or no token) returns a generic "not found" response that does not reveal whether the token was wrong or was never issued.
- Vote privacy maintained through encryption.
- The system does not provide automated lost-token recovery; if a member loses their receipt token, verification cannot be completed unless the token is found.
- Verification does not reveal how the member voted, only that their ballot was included.
- Aggregated results will be viewable for every vote run on the site, with the authorization rule being simply that the viewer was eligible to cast a ballot.

### M_Nominate_HoF_Candidate

Access: Any member can nominate another eligible member to the Footbag Hall of Fame during the annual nomination window.

Story: Eligibility for the Footbag Hall of Fame is based on Year of First Involvement (YFI) in the sport. YFI includes competing as a Player or as a Contributor (organizing/producing tournaments, promotions, festivals and more). All nominees for the Footbag Hall of Fame must have a YFI that is 15 years or more from the year they are nominated.Nominations are focused on two banners: PLAYER: whose footbag history has displayed: Significance and Excellence in Competition, by winning and placing in the top 3 consistently at sanctioned IFPA Events. CONTRIBUTOR: whose footbag history has displayed: Significance and Excellence in Leadership Rolls, by producing and organizing tournaments, clubs, touring team activities, coaching and more.

The nomination process begins by selecting the member, and providing their full name and current contact information, also the nomination category (Player or Contributor), plus other freeform information in the Nomination Form.

Success Criteria:

- Nominating a member will create a Work Queue task for the Admin to approve, because the Admin must manually confirm the eligibility criteria have been met. Upon acceptance, this will send an email to the nominated member and also [director@footbaghalloffame.net](mailto:director@footbaghalloffame.net).
- The nominated member must then submit an affidavit before the nomination window closes, which is crucial background information, and is required to be eligible for the vote. The nomination and affidavit must be submitted during the Admin-configured nomination timeframe.
- Nominations are NOT carried forward to the next year automatically.
- Upon admin approval of a nomination, the system sets the `HoF_Nominated` flag on the nominated member. This flag indicates the member is an active HoF candidate for the current nomination cycle. 

### M_Submit_HoF_Affidavit

Access: A member who has been nominated to the Footbag Hall of Fame, and approved by an Admin as eligible, can submit an affidavit during the admin-configured nomination timeframe.

Story: As a member who has been nominated to the HoF, I can submit an affidavit in order to provide my footbag career background information, and to be eligible for the vote.

Success Criteria:

- The nominated member must submit an affidavit before the nomination window closes, which is crucial background information. The affidavit must be submitted during the Admin-configured nomination timeframe.
- Submitting the affidavit will make the member eligible for the vote, and the member will be included on the ballot along with the affidavit’s background information.

## 3.8 Media Sharing

All member-published media is public from the moment it is saved. An Administrator can remove an item through moderation; that is the only visibility control, and members do not set per-item visibility. Members own their content: deleting a photo or a video link removes it permanently, while deleting a named gallery removes only that gallery's saved view and leaves its items in place.

Named galleries are saved tag-query albums. Each gallery is defined by the hashtags its items must carry, optionally hashtags to exclude, and a sort order; any item whose tags satisfy that query appears in the gallery, and the same item can appear in several galleries at once. A member organizes media by tagging it and naming galleries rather than filing each item into a single folder. The criteria, exclusions, and sort sit behind an Advanced disclosure so the common path (name a gallery, upload into it) stays simple. The member gallery experience and the curator gallery experience share one interface; the differences are that the curator (the system member) may upload binary video and apply the curated marker, while members submit video as YouTube or Vimeo links and their uploads carry their own uploader tag.

Popular-tag suggestions (shown near the tag field and on the empty-state teaching block) are composed in three priority tiers and capped at a short list. Real community-popular tags lead, ranked by usage; a tag becomes community-popular once at least two distinct members share it. A set of pinned starter tags follows (a few community-representative event, club, and style tags), so the discovery feature is demonstrable while community usage is still light. Curator-published tags backfill any remaining slots. The pinned starters are phased out automatically as people make new uploads: real community-popular tags rank above the starters and take the high slots as that usage accrues, so the suggestions converge on genuine community usage on their own. When a member's content area is empty, a teaching block shows recent example photos with their hashtags, the popular-tag suggestions, and aggregated hashtag statistics, each clickable to insert a tag.

### M_Upload_Photo

Access: Members with Tier 1 benefits can upload photos to personally named galleries.

Story: As a member, I can upload photos so that I share visual content.

Success Criteria:

- Upload photos via named gallery interface. For each member, the initial, default photo gallery name is Personal Gallery. Member can rename this, and/or create multiple named galleries to organize photos.
- JPEG and PNG only; GIF not supported. Animated content should be uploaded to YouTube or Vimeo and embedded via video links.
- Photo processing generates two variants only: Thumbnail (300×300 pixels) and Display (800px width maximum). Both stored as JPEG at 85% quality, sufficient quality for web viewing and sharing. Original uploaded file is discarded after processing,
- Add caption to photo optionally (plain text, max 500 chars).
- Optional external URL on each uploaded photo (for example a link to a source article or creator page), validated at the service boundary (see DD §3.17). The upload form works without JavaScript.
- Tag optionally with hashtags for discovery (standardized tags for events and clubs, plus freeform tags such as tutorial, golf).
- Hashtag matching is case-insensitive for all tag operations (example: #Event_2025_beaver_open and #event_2025_Beaver_Open match identically).
- Hashtags stored with original capitalization for display quality (example: #Event_2026_Japan_Worlds displays as entered, not lowercased).
- Tag suggestions and the empty-state teaching block follow the §3.8 popular-tag rule; clicking a suggested tag inserts it into the field, with no per-keystroke autocomplete.
- Photo upload rate limited to 10 uploads per hour per member to prevent abuse.
- Photo upload controls are only rendered for members with Tier 1 benefits.
- Visitors (not logged in) never see upload controls.
- See photo immediately after upload (synchronous processing).
- Photo tagged with event hashtag appears in that event's media gallery.
- Photo tagged with club hashtag appears in that club's media gallery.
- Upload completes during the request/response flow, so the user receives immediate success or failure feedback after upload/processing.
- On success, the UI receives sufficient data to display the uploaded photo and related metadata immediately.
- If upload/processing does not complete within the configured request timeout, the UI displays a clear error message and allows retry.

### M_Submit_Video

Access: Members with Tier 1 benefits can submit video links for inclusion in media galleries.

Story: As a member, I can submit YouTube or Vimeo video links so that I share video content.

Success Criteria:

- Accept URL patterns: youtube.com/watch?v=, youtu.be/, vimeo.com/
- System validates URL format and extracts video ID.
- Video metadata stored in video entity (uploaderId, platform, videoId, videoUrl, thumbnailUrl, caption, tags, status).
- Optional external URL on each submitted video (for example a link to the creator's page or an article about the video), validated at the service boundary (see DD §3.17). The submission form works without JavaScript.
- Video thumbnails fetched from YouTube/Vimeo APIs for preview.
- Members submit video as YouTube or Vimeo links only; binary video upload (MP4/WebM/MOV) is the admin/curator path (see A_Upload_Curated_Media). The member video path rejects a binary-upload submission at the service boundary (see DD §6.8).
- Hashtag matching is case-insensitive for video tag operations (example: Tutorial and tutorial match identically).
- Video link submissions are rate-limited per member to prevent abuse (for example, up to 5 submissions per hour).
- Tag suggestions follow the §3.8 popular-tag rule; clicking a suggested tag inserts it into the field, with no per-keystroke autocomplete.
- Videos and photos can be mixed in named galleries.
- Video link submission controls are only rendered for members with Tier 1 benefits; Tier 0 members without current Active Player status never see any video link submission controls.
- Visitors (not logged in) never see video link submission controls.

### M_Organize_Media_Galleries

Access: Members with Tier 1 benefits can organize their own media into named galleries and adjust gallery-level settings.

Story: As a member, I can organize photos and videos into named galleries with hashtags, captions, and optional external web page URLs.

Success Criteria:

- Photos and videos support same hashtag tagging system.
- Captions supported for both media types (max 500 chars, plain text).
- Can create named galleries mixing photos and videos.
- Each gallery can include optional external links that are validated before publication, with clear error messages and a simple retry path if validation fails.
- Media appears in personal galleries and event galleries via hashtag matching.
- Personal Gallery is the default per-member named gallery: it collects everything that member uploads, because every member upload automatically carries that member's uploader hashtag (per §1.1 Uploader hashtags) and Personal Gallery's criteria is that tag. Avatars are excluded from every named gallery platform-wide, not only from Personal Gallery.
- Club and Event galleries aggregate both content types by hashtag matching.
- Video tiles render as click-to-play facades with lazy-loaded thumbnails, so a gallery can mix any number of videos without a performance penalty.
- Gallery creation and rename controls are only rendered for members with Tier 1 benefits; Tier 0 members without current Active Player status never see gallery creation or rearrangement controls.

### M_Delete_Own_Media

Access: Members with Tier 1 benefits can delete media items they originally uploaded.

Story: As a member, I can delete my own photo, video link, or named gallery so that I control my content.

Success Criteria:

- Uploader can delete own media anytime, with immediate permanent effect (no soft delete for media).
- Delete controls for user-owned media are only rendered for members with Tier 1 benefits; Tier 0 members without current Active Player status never see delete controls because they cannot upload media.
- When deleting a media item, the deletion is permanent and has a cascading deletion of all the associated tags.
- Deleting a named gallery removes only that gallery (its saved query: name, criteria tags, exclude tags, sort order). The items it displayed are not deleted; they stay published and continue to appear wherever else their tags match. Deleting an item is the separate, permanent action above.

### M_Flag_Media

Access: Members with Tier 1 benefits can flag media they believe violates community guidelines. Visitors cannot flag content.

Story: As a member, I can flag photos or videos so that harmful/low-quality content is reviewed.

Success Criteria:

- Flagged items remain visible until an administrator reviews and decides; visibility never changes automatically.
- The system shall not alter visibility or ranking without explicit administrator action (no shadow banning).
- A work queue item is created and an email notification is sent to the admin-alerts mailing list per Global Behaviors rules (task type and entity ID only; no sensitive member data).
- Uploader can remove own media anytime without admin approval.
- Multiple flags from same user for same media not counted separately.
- Flagging is rate-limited to prevent abuse; limit is admin-configurable via `media_flag_rate_limit_per_hour` (default: 10 flags per member per hour).
- Flagging is available to members with Tier 1 benefits.

## 3.9 Email

### M_Manage_Email_Subscriptions

Access: Members can manage their mailing-list subscriptions.

Story: As a member, I can manage my mailing list subscriptions so that I control IFPA communications.

Success Criteria:

- Member profile includes a subscriptions list with categories: newsletter, board-announcements, event-notifications, technical-updates.
- Member can subscribe or unsubscribe via profile settings.
- System uses the subscriptions list to determine which bulk emails the member receives in each category.
- Changes made in the member's profile are respected by all future bulk emails for those categories.
- Event-specific communications may have separate, explicit opt-ins (for example, event reminders for registered participants).
- Unsubscribe is persistent: once unsubscribed from a category, the member does not receive emails in that category until they explicitly opt back in.
- Subscription changes logged to audit trail.

### M_Send_Announce_Email
Access: Tier 2 or Tier 3 members.

Story: As a Tier 2 or Tier 3 member, I can send an email to the IFPA announce mailing list so that I can create community announcements.

Success Criteria:  
- Email form includes: subject, message body, preview.  
- System sends to configured announce list address (default [announce@footbag.org](mailto:announce@footbag.org)).  
- Rate limiting to prevent abuse (admin-configurable).  
- All sends audit-logged (actor ID, subject, timestamp).

## 3.10 Group Membership

Groups (also called committees) are governance, working-group, or social entities distinct from clubs. A member may belong to many groups simultaneously; clubs are capped at two current memberships per member (primary and secondary). Group entities have configurable properties controlled by Admins: type, official flag, visibility (`policy`), `restrict_membership`, email enable, `active` flag, alias keyword, and optional `parent_group_id` for subcommittees.

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

Access: Tier 1+ members can send a message to a group's email alias via web form, subject to the group's `restricted_sending` flag.

Story: As a member, I can send an email to a group's alias so that I can communicate with the group's membership.

Success Criteria:

- The compose form is available only for groups with email enabled by Admin (`email_enabled=true`).
- If `restricted_sending=true` (default for group lists), the compose form is shown only to current group members; non-members may see the alias address as informational on the group page but cannot compose.
- If `restricted_sending=false`, the compose form is available to all Tier 1+ members.
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
- Accepted formats at launch: PDF, TXT, MD, PNG, JPEG. Office formats (DOCX, XLSX, PPTX) and other unlisted formats are rejected with a clear error message. Members convert Word and Excel documents to PDF before upload. Office formats are excluded because no free-tool transcoding pipeline preserves their editability while sanitizing macros; the platform keeps its malware-by-design posture by accepting only formats it can sanitize by construction.
- Sanitization (per §1 file upload safety model):
  - PDF: re-rendered through Ghostscript two-pass (PDF → PostScript 2 → PDF). PostScript 2 cannot carry JavaScript, embedded files, or launch actions, so the round-trip eliminates them by construction. Re-rendered PDF stored; original discarded.
  - PNG / JPEG: re-encoded via the `sharp` library, which strips EXIF and embedded metadata by default. Re-encoded image stored; original discarded.
  - TXT / MD: validated as UTF-8; invalid charset rejected. Stored as-validated.
- File size cap: 25 MB per file (admin-configurable, `group_file_max_size_mb`), measured against the original upload before sanitization. Oversized files are rejected with a clear error message.
- File is stored in private object storage (S3) and served via short-lived signed URLs only to current group members. The file is not addressable by visitors or by logged-in members who are not current members of the group.
- Each upload creates a `group_files` row recording: group ID, uploader member ID, original filename, content type, size (post-sanitization), storage key, upload timestamp, optional caption (plain text, max 500 chars).
- Member sees the uploaded file in the group's files list immediately after successful sanitization.
- Upload rate-limited per group, admin-configurable (`group_file_upload_rate_limit_per_hour`, default 10 uploads per group per member per hour).
- Upload action is audit-logged with member ID, group ID, file ID, filename, size, sanitization outcome, timestamp.

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

# 4. Event Organizer Stories

Event Organizers are members who create events. Organizers can invite up to 4 co-organizers who share identical event management permissions. Members can organize multiple events simultaneously. Organizer permissions are event-scoped, meaning that being an organizer (or co-organizer) for one event grants permissions only for that event. Any EO can send bulk emails to registered participants, upload results, and the other functionality specified below.

Members with Tier 1 benefits can create basic/local events; Tier 2 or Tier 3 required for sanctioned and paid events.

## 4.1 Event Lifecycle

### Event Status Lifecycle

Valid event statuses and their transitions:

- `draft`; initial state on creation.
- `pending_approval`; paid or sanctioned event submitted for admin review (from `draft`).
- `published`; visible and open for registration. Free events transition `draft → published` on creation. Paid/sanctioned events transition `pending_approval → published` on admin approval.
- `registration_full`; capacity limit reached; no new registrations accepted (from `published`).
- `closed`; registration deadline passed or organiser manually closed registration (from `published` or `registration_full`).
- `completed`; event has concluded and results may be posted (from `closed`). The `completed` state is terminal. Events with published results cannot be canceled, deleted, or transitioned to any other status.
- `canceled`; event canceled at any point before `completed`; registrants are notified. The `canceled` state is terminal; canceled events cannot be re-opened or completed. A canceled event never surfaces publicly: no event detail page, no year-archive listing, and no result rows on any public results view (historical-person and player pages included), regardless of how result rows came to exist.

No other status values are valid. All queries and conditional logic must use only these canonical strings.

### M_Create_Event

Access: Members with Tier 1 benefits can create events. This is how a member becomes an Event Organizer.

Story: As a member, I can create an event with all necessary details and optionally configure payment, so that I can become an Event Organizer, and host tournaments and gatherings.

Success Criteria:

- Members with Tier 1 benefits can create basic free events; Tier 2 or Tier 3 members can request sanctioned events and enable paid registration.

Event creation form includes: title, description, start date, end date, location (city, state or province (optional), country), registration deadline, capacity limit (optional), competitor registration fee (optional, requires Tier 2 or Tier 3 and admin approval to set up), participant (spectator) fee (optional), t-shirt size (optional). Organizer defines a flexible list of event disciplines (freeform names such as shred-30 or ruler-of-the-court). For each discipline, organizer specifies whether it requires single/doubles/mixed doubles designation, and category (net, freestyle, golf, sideline). Sideline includes formats such as 2-square, 4-square, consecutive variants, one-pass, and social.

- Members with Tier 1 benefits can create basic/local events without fees.
- Tier 2 or Tier 3 members can request sanctioned events and configure paid registration (subject to admin approval). Payment configuration (if enabled): competitor registration fee, (optional) spectator fee.
- Sanction request sends notification to admins for review, and such events are only published upon approval.
- Organizer sees a clear success message when event is created.
- Organizer sees clear error messages for validation failures with hints about what to fix.
- Member gains Event Organizer status for this event (only).
- An Event Organizer may organize more than one event at a time.
- For free events, event status changes to published, Email sent to all event organizers to confirm. News item is created. Event will appear in Upcoming Events list. For paid events, these actions must wait for Admin approval.

As an event organizer with Tier 2 or Tier 3 membership, I can select the sanctioned option for my event so that it gains credibility and access to paid features (upon admin approval).

- Only Tier 2 or Tier 3 organizers can request sanction.
- Sanction request form includes: fee justification.
- Organizer receives email confirmation that request is pending.
- Sanction status visible on event detail page: pending, approved, rejected.
- Approved sanction enables: paid registration.
- Rejected sanction includes admin reason for rejection.
- All sanction requests audit-logged.
- Selecting the sanctioned event option creates email to all Admins for review, and appears in the Admin work-to-do queue.

### EO_Edit_Event

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

### EO_Delete_Event

Access: Event organizers can delete their own events only when allowed by status (for example, drafts without registrations), following the event-lifecycle rules.

Story: As an event organizer, I can delete my event so that I can remove canceled or duplicate events.

Success Criteria:

- Cannot delete event with confirmed registrations (must close registration and contact participants first).
- Deletion is permanent (hard delete). The event record is immediately removed from the database, except that events with published results are never deleted, as they are preserved permanently for historical record.
- Deleted events are hidden from public listings immediately upon deletion.
- All participants notified via email of event deletion.
- Deletion audit-logged with organizer ID, reason, timestamp.
- Organizer sees confirmation dialog before deletion: "Delete Event Name? This will cancel the event and notify all X registered participants."

### EO_Manage_CoOrganizers

Access: Any organizer of an event can manage co-organizers for that event.

Story: As an event organizer, I can add, view, and remove co-organizers so that I manage my event team. An event organizer cannot remove oneself if the only organizer, but first must promote someone else.

Success Criteria:

- An organizer can add up to 4 co-organizers by member id.
- System sends email to new organizer with key points: event name, event date, co-organizer responsibilities.
- Co-organizer gains identical event management permissions as original organizer.
- Maximum 5 total organizers per event.
- Organizer can view list of all current co-organizers. List shows: co-organizer name, member id, date added.
- Co-organizer can opt out of leadership role via the member dashboard.
- All co-organizer actions are audit-logged.
- Organizers see a clear success message when co-organizer is added or removed.
- Organizers array displayed on event detail page showing all current organizers (names only on public page); contact info visible to authenticated members only.
- The user interface hides remove-self functionality (button or link) when the current authenticated user is the sole organizer of the event.

## 4.2 Registration Management

### EO_View_Participants

Access: Event organizers can view full participant lists for their events.

Story: As an event organizer, I can view the list of registered participants so that I can plan the event.

Success Criteria:

- Participant list shows: member name, registration date, membership tier and Active Player status, city, country, email (if opted in).
- List sortable by registration date or name.
- Total participant count displayed.
- Payment status visible if event has fees.
- Participant list and exports include registration type (Competitor/Attendee-Supporter), selected categories (if competitor), and partner/team fields (if applicable).

Impact: For events officially registered through the IFPA website (including sanctioned events), the participant list supports marking confirmed participants as "Attended" after the event ends. Organizers can mark individual participants or use bulk-select to mark multiple participants at once. All attendance marks and any resulting Active Player grants or extensions are audit-logged with: actor member ID, affected member ID, event ID, old Active Player expiry, new Active Player expiry, timestamp, reason "official_event_attendance".

When a participant is marked Attended:

- If the member is Tier 0 with no current Active Player status, grant Active Player for 730 days from the event end date. For a single-day event, the event date is used. If the event end date is unknown, the event start date is used.

- If the member is Tier 0 with current Active Player status, extend Active Player only if the new expiry date (computed as above) would be later than the existing expiry date. An older event must not shorten an existing later Active Player expiry date.

- If the member is Tier 1, Tier 2, or Tier 3, the action is a no-op for membership and Active Player; attendance is recorded but no Active Player grant occurs because Active Player applies only to Tier 0.

- Attendance marking never changes membership tier.

### EO_Close_Registration

Access: Event organizers can close registration for their events according to the registration rules.

Story: As an event organizer, I can close event registration so that I can stop accepting new participants.

Success Criteria:

- Organizer can close registration at any time.
- Closed registration prevents new signups.
- Event page displays "Registration Closed" status.
- All registration status changes audit-logged.

### EO_Export_Participants

Access: Event organizers can export participant lists for their events as CSV.

Story: As an event organizer, I can export the participant list so that I can use it for external tools and planning.

Success Criteria:

- Export generates CSV file with: member name, email (if opted in), city, country, registration date, membership tier and Active Player status, payment status.
- Export includes only confirmed participants (not pending or rejected).
- Export filename: eventname_participants_YYYYMMDD.csv
- Participant list and exports include registration type (Competitor/Attendee-Supporter), selected categories (if competitor), and partner/team fields (if applicable).

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

## 4.3 Communication

### EO_Email_Participants

Access: Event organizers can send an email to participants of their events.

Story: As an event organizer, I can send an email to all registered participants so that I can communicate important event information.

Success Criteria:

- Email form includes: subject, message body, preview.
- Email sent to all confirmed participants (not pending or rejected).
- Emails sent via SES with proper headers and unsubscribe links.
- Send rate limited to prevent abuse: maximum 1 email per event per day.
- All bulk emails audit-logged with organizer ID, event ID, recipient count, subject, timestamp.
- Organizer sees confirmation: "Email sent to X participants."
- Recipients are event registrants (competitors and attendee/supporters).
- Email body is plain text (no HTML).
- System stores an archive record of each sent event email (subject, body, sender, timestamp, recipient count) visible to the organizer for that event and to admins globally.

## 4.4 Results Publishing

### EO_Upload_Results

Access: Event organizers can upload results for events they organize, including sanctioned events where results feed into rankings.

Story: As an event organizer, I can upload event results so that participants and the community can view outcomes.

Success Criteria:

- Results upload accepts CSV with enough information to create `event_results_uploads`, `event_result_entries`, and `event_result_entry_participants` database rows for singles and multi-participant placements (if that data is available for the event).
- Results visible on event detail page after upload.
- Results displayed as sortable table.
- Results also added to participant profiles (if participant linked to member account).
- Results publication generates news feed item.
- Only organizers can upload results.
- Results upload audit-logged.
- Results can be uploaded for any event (sanctioned status does not affect results posting).
Impact:

For events officially registered through the IFPA website (including sanctioned events), uploading results triggers a two-step attendance confirmation process: Step 1: Automatic attendance for winners: any member accounts appearing in the uploaded results are automatically marked as "Attended". Step 2: Attendance confirmation for non-placing participants: after results upload completes, the system displays an attendance confirmation screen showing all registered participants (confirmed registrations) who do NOT appear in the uploaded results with checkboxes, allowing the organizer to verify additional attendees. For each confirmed Tier 0 attendee, the system grants or extends Active Player status for 730 days from the event end date (single-day event: event date; unknown end date: event start date). An older event must not shorten an existing later Active Player expiry date. For Tier 1, Tier 2, or Tier 3 attendees, attendance is recorded but no Active Player grant occurs because Active Player applies only to Tier 0; attendance never changes membership tier. All attendance confirmations and resulting Active Player grants/extensions are audit-logged with: organizer member ID, affected member ID, event ID, old Active Player expiry, new Active Player expiry, timestamp, reason "official_event_attendance". Tier 0 members who receive or extend Active Player status are sent a notification email explaining they received Active Player status for participating in Event Name, including the new expiry date and a brief explanation of Tier 1 benefits while Active Player status is current.

## 4.5 Music Operations

Organizer-side audio operations during events. The initial scope is routine-music playback; the subsection's scope is expected to broaden over time to cover other tournament operations (bracket draws, judging sheets, live scoring, projection control) when those features are added.

### EO_Play_Routine_Music

Access: Event organizers can list, play, and download routine-music files attached to registrations in events they organize.

Story: As an event organizer, I can list and play the routine-music files for my event so that I can play the correct music during each competitor's performance.

Success Criteria:

- List shows all routine-music files currently attached to confirmed registrations in the event, grouped by event category and sorted alphabetically by competitor display name within each category.
- Each entry shows: competitor display name, partner or team info if applicable, event category, the per-attachment label (the attachment's override if set, otherwise the library default), original filename, file size, upload timestamp.
- Organizer can play any attached file directly in the browser via short-lived signed URLs; playback is HTML5 audio with standard controls (play, pause, seek, volume).
- Organizer can download any attached file for offline use during the event.
- Files persist indefinitely on the member's S3 library (see `M_Upload_Routine_Music`); organizer access is gated by the attachment row remaining present and the organizer being assigned to the event.
- If a competitor deletes a library file that was attached to a past or current registration, the corresponding entry in this list shows a tombstone "Deleted by competitor" with no playback or download. The attachment metadata (event, category, competitor identity, label) is preserved for audit and historical reference.
- All listing, play, and download actions are audit-logged with organizer ID, event ID, file ID, action, timestamp.

# 5. Club Leader Stories

Club leadership is a flat set of equal co-leaders (up to 5 per club), each with identical club-editing and member-visible-contact powers; there is no separate head-leader role. The member who creates a club becomes its first co-leader, and a member co-leads at most one club.

## 5.1 Club Lifecycle

Club leadership rule: a club should have at least one co-leader, but a club with none is still a valid, persisting entity: it keeps its roster, stays joinable, and stays listed. A club is reachable through its co-leaders' member-visible contact emails; there is no separate club-level contact field, so a club with no co-leaders simply has no platform-surfaced contact and no platform-side editor until a member steps up. Such clubs surface on a single low-priority "could use a leader" admin list (an opportunity, not a remediation obligation, with no deadline and no escalation); a current member can volunteer to co-lead (see V_Volunteer_To_CoLead), an existing co-leader can invite one, or an admin can assign one. Governance groups are different: a committee with zero owners is genuinely adrift (see §3.10).

### M_Create_Club

Access: Members with Tier 1 benefits who do not already co-lead a club can create a new club.

Story: As an eligible member, I can create a club so that I can become its first co-leader, and organize a local footbag community.

Success Criteria:

- Club creation form includes: club name, description, city, country. The creator becomes the club's first co-leader, and the club is reached through that co-leader's member-visible contact email; there is no separate club contact field. A club that later loses all co-leaders still persists and surfaces only on the low-priority "could use a leader" admin list (see §5.1).
- Before creating a club, the form runs a duplicate-prevention check against live clubs, onboarding-visible candidates, and dormant candidates. Exact name plus same country blocks creation and surfaces the existing entry instead, with options to confirm affiliation (routing to the relevant club's join page) or report the match as a different club with the same name (which logs a flag and allows creation to proceed).
- Near-match candidates (high name similarity in the same country, below the exact-match threshold) trigger a warning that lists the candidates with their location; the creator may proceed if confident the new club is distinct or pick an existing entry. Junk-flagged candidates are not surfaced as potential duplicates.

- Standardized hashtag follows pattern club_{location_slug}.
- Only members with Tier 1 benefits can create clubs.
- Leader sees a clear success message when club is created.
- Leader sees clear error messages for validation failures.
- Member becomes the club's first co-leader. A member may co-lead only one club at a time.
- If the authenticated member already co-leads any club, the create-club option is not shown in the UI. If attempted via direct URL or API, the service returns a validation error: "You already co-lead [Club Name]. You must step down before creating a new club."
- Club display names are not required to be globally unique (for example the name could be "Hacky Crew"). Two clubs may share the same display name. The standardised club hashtag (derived from the club name at creation and globally unique) is the canonical identifier. The UI makes the club hashtag visible at creation so leaders understand it is the persistent unique handle.

### CL_Edit_Club

Access: Club leaders can edit their club's information and settings.

Story: As a co-leader, I can edit club information so that I can keep club details current.

Success Criteria:

- Co-leaders can edit all club information.
- All edits audit-logged with leader ID, fields changed, old values, new values, timestamp.
- Co-leaders see a clear success message when the club is updated.

### CL_Mark_Club_Inactive

Access: A co-leader can mark the club inactive or reactivate it later.

Story: As a co-leader, I can mark my club as inactive so that it's hidden from active listings but preserved for history.

Success Criteria:

- Inactive clubs hidden from public club directory.
- Inactive clubs still accessible via direct link.
- Club members' `member_club_affiliations` rows are preserved with `is_current=1`; the club detail surface shows a warning that the club is inactive.
- A co-leader can reactivate the club at any time.
- Inactive status change audit-logged.

### CL_Archive_Club

Access: A co-leader can archive the club if it is inactive.

Story: As a co-leader, I can delete my club from the active clubs so that I can remove defunct clubs.

Success Criteria:

- Cannot delete club with active members (must remove all members first or mark inactive).
- Club deletion sets the club's status to 'archived'. Club records are never permanently deleted and do not use the soft-delete (deleted_at) pattern. Archived clubs remain in the database and are excluded from public listings, but are preserved for historical reference and referential integrity.
- Deleted clubs hidden from all listings immediately.
- Each remaining `member_club_affiliations` row for the club has `is_current` set to 0 upon archival; the row is preserved so the historical affiliation is recoverable.
- Deletion audit-logged with leader ID, reason, timestamp.
- Leader sees confirmation dialog before deletion.

## 5.2 Leadership Management

### CL_Manage_CoLeaders

Access: Any co-leader can invite a member to co-lead, view the current co-leaders, and step down. Co-leaders are equal; a co-leader cannot remove or modify another co-leader. Removing another co-leader is an admin action (see A_Reassign_Club_Leader).

Story: As a co-leader, I can invite additional co-leaders, see the current co-leaders, and step down, so that I help maintain my club's leadership team.

Success Criteria:

- Any co-leader can invite a member to co-lead, up to a maximum of 5 co-leaders per club. Co-leadership requires Tier 1+ benefits.
- An invited member must accept before the co-leader row is written; acceptance is the member's consent to having their contact email shown to authenticated members. An invitee who already co-leads another club cannot accept (a member co-leads at most one club).
- The invite email states club name and responsibilities and directs the invitee to the standing "volunteer to co-lead" affordance on the club page; accepting is the invitee using it. The invitee must already be a current member of the club (a non-member joins first), and acceptance is their consent to contact-email exposure.
- Upon acceptance, the new co-leader gains club-editing permissions, and their contact email becomes visible to authenticated members.
- Any co-leader can view the list of current co-leaders (name, date added).
- A co-leader can step down at any time via the member dashboard. Stepping down removes only the co-leader role, not club membership; if they were the last co-leader, the club becomes leaderless (a tolerated state per §5.1).
- A co-leader cannot remove or modify another co-leader; that is an admin action (A_Reassign_Club_Leader).
- All co-leader actions (invite, accept, step down, admin removal) are audit-logged, and the acting co-leader sees a clear success message.
- All co-leaders are displayed on the club detail page (names only on the public page). Each co-leader's contact email is visible to authenticated members; holding the co-leader role is the consent and the email cannot be hidden while the role is held. A co-leader's WhatsApp shows to authenticated members only if that co-leader opts in. Provisional (unclaimed) bootstrap entries never show contact information.
- After any co-leader change, a club with at least one co-leader is reachable through that co-leader's contact; a club with zero co-leaders is leaderless (tolerated per §5.1) and surfaces on the single low-priority "could use a leader" admin list under the "Needs Leader" label.

### V_Volunteer_To_CoLead

Access: A current member of a club with Tier 1 benefits (Tier 1+ or Active Player), who does not already co-lead another club, can volunteer to co-lead it.

Story: As a current member of a club, I can volunteer to become a co-leader so that a club without one gains a co-leader and any club can grow its leadership without waiting for an invite.

Success Criteria:

- One service operation backs the volunteer write, reached via the onboarding wizard's leadership-assumption offer and the standing "volunteer to co-lead" affordance on the club detail page. The admin "contact members" action in the cleanup queue (A_Periodic_Club_Cleanup) sends an invitation that routes members to the standing affordance; it is not a separate write path.
- Eligibility (all required): the member is a current, confirmed affiliate of the club; has Tier 1 benefits; does not already co-lead another club; the club has fewer than 5 co-leaders; the member is not already a co-leader of this club.
- Volunteering is immediate: an eligible member self-adds as a co-leader of any club, at any time, whether the club is leaderless or already has co-leaders. There is no approval step.
- On a self-add to a club that already has co-leaders, all existing co-leaders are notified that the member joined the leadership. Every volunteer add is audit-logged.
- The new co-leader gains club-editing permissions, and their contact email becomes visible to authenticated members (holding the role is the consent; the email cannot be hidden while the role is held). The member may additionally opt their WhatsApp visible.
- A member who already co-leads another club is shown the one-club rule and directed to step down there first; the standing affordance is not offered to them.
- When a club becomes leaderless, it surfaces in the admin club-cleanup queue (A_Periodic_Club_Cleanup), where an admin can send the volunteer-to-co-lead invitation to the club's current members or defer; the standing affordance remains available for members to self-volunteer at any time.
- The standing club-page affordance is shown only to a viewer who meets the eligibility rules above.

# 6. Group Owner Stories

Group Owners are members designated by an Admin at group creation time. Owners can invite up to 4 co-owners who share identical group management permissions. Owner permissions are group-scoped: owning one group grants permissions only for that group. Members may own multiple groups simultaneously.

The group lifecycle (create, archive) is Admin-controlled and lives in `A_Create_Group` and `A_Archive_Group`. Owners do not create or archive groups. Owners can leave the group they own via `GO_Leave_Group` subject to the sole-owner promotion-first rule.

## 6.1 Group Management

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

- Any owner can add up to 4 co-owners by member ID; co-owners must be Tier 1+ members (consistent with the Tier 1+ floor enforced for initial owners in `A_Create_Group` and for added members in `GO_Manage_Members`). Maximum 5 total owners per group.
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
- Owner can toggle `restricted_sending` (bool, default true for group lists). When true, only current group members can compose messages to the alias via `M_Email_Group`. When false, any Tier 1+ member may compose.
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

# 7. Administrator Stories

Administrators are member volunteers with elevated privileges for platform operations, content moderation, and system configuration. Administrators are assigned manually and must be IFPA members with Tier 2 or Tier 3 status. All admin actions that modify data are audit-logged with admin ID, action type, reason, and timestamp. There is no UI for becoming an Admin, as this is done usually by another Admin, but could be done also by a System Administrator (a developer role not a user role) in order to grant system privileges.

## 7.1 Event and Payments

### A_Approve_Sanctioned_Event

Access: Only admins can review and approve Stripe configuration for paid events. In this system, paid registration is only enabled after an event's sanction request is approved; sanction status and payment enablement are linked by policy.

Story: As an admin, I can approve or reject an event's payment configuration so that paid events are controlled.

Success Criteria:

- Review event details and fee structure in approval queue.
- Approve or reject with reason.
- On approval: event status changes to published, payment configuration enabled, Email sent to all event organizers to confirm. News item is created. Event will appear in Upcoming Events list.
- On rejection: event status remains draft, Outbox sends organizer notification with reason.
- Payment approval is event-specific configuration, not persistent eventOrganizer permission (which is separate).
- All approval actions logged.
- Admin reviews pending sanction requests in queue (scan events where status === 'pending_approval').
- Admin can see: event details, organizer history, fee amount, organizer tier status.
- Approval simultaneously: marks event as sanctioned AND enables paid registration.
- All approval/rejection decisions audit-logged with admin ID, decision, reason, timestamp.
- Admin cannot approve sanction if organizer lacks Tier 2 or Tier 3 status.
- Admin sees a clear success message when approval/rejection completes successfully.
- Admin sees a clear error message when action fails, including a short explanation.
- The actual payment of funds to the Event Organizer’s bank account happens outside of this system by the IFPA Treasurer.

### A_Reconcile_Payments

Access: Only admins can run or review payment reconciliation and view the complete list of inbound payments.

Story: As an administrator, I can view all inbound payments (donations, membership fees, and event registrations) and see a separate list of reconciliation issues, so that I can confirm our records match Stripe, investigate discrepancies, and, when needed, see donation comments in context.

Success Criteria:

- There is an admin-only All Payments view that lists all inbound payments recorded by the system, including donations, membership purchases/upgrades, and event registration fees.
- The All Payments view allows filtering and sorting by type, date range, status, member, event, and payment reference, and shows at least: type, date, amount, currency, status, related member ID, related event/club where applicable, and Stripe payment reference.
- For donation payments, the admin can see the member’s donation comment as a read-only field when viewing payment details, so that reconciliation and investigations can take the comment into account without allowing admins to edit it.
- A nightly worker (or equivalent scheduled job) performs reconciliation against Stripe (or the payment provider) and records mismatches (for example missing webhooks, amount discrepancies, status mismatches, or unexpected duplicates).
- The Reconciliation Issues view includes a status filter with options: Outstanding (default) / Resolved / All. Resolved reconciliation issues show: admin who resolved the issue, resolution timestamp, resolution note explaining action taken. This allows multiple administrators to see what reconciliation issues have already been handled and by whom.
- A periodic summary is sent to admins at the configured cadence (default: every 7 days, keyed by `reconciliation_summary_interval_days`) with a digest of outstanding or recently resolved reconciliation issues.

## 7.2 Data Management

### A_Override_Member_Data

Access: Only admins can override member data in exceptional cases where manual correction is required, for example, to fix a data bug, clean up if a member dies, or delete a bogus registration.

Story: As an Admin, I can manually override member data in exceptional cases so that I resolve issues, grant access, correct errors, or anything else allowed by the system.

Admin can delete member accounts that violate registration rules (real full name, correct location) upon discovery. This is designed for exceptional cases where a member account was created with invalid data (fake name, bogus location) that was not caught by initial validation. Member receives notification email that account was deleted for policy violation."

Success Criteria:

- Admin can access member profile from admin member management interface.
- Admin can change membership tier to any valid state: `tier0`, `tier1`, `tier2`, `tier3` (using canonical database string values). Active Player status is managed separately from membership tier.
- Admin can correct the Active Player expiry date when needed for exceptional remediation, with mandatory reason and audit logging.
- Admin should not edit member-editable fields (email, city, country, club affiliation) via this interface; members must edit these themselves, except in the case of a member death. Display name corrections require admin action (contact IFPA).
- Event results and other data fields that could be buggy can also be edited via this interface, but will require additional UI support.
- Mandatory reason field for manual adjustment (typically: payment issue resolution, complimentary access, error correction).
- Confirmation dialog before applying with member name, old tier, new tier, and reason.
- Member receives email notification of membership-status change with key points: new membership tier, Active Player status or expiry where changed, reason.
- All manual data overrides audit-logged with admin ID, member ID, old values, new values, reason, timestamp.
- Admin sees a clear success message when adjustment completes successfully.
- Admin sees a clear error message when adjustment fails, including a short explanation.

### A_Grant_HoF_BAP_Board_Status

Access: Only admins can grant Hall of Fame (HoF), Big Add Posse (BAP), and IFPA Board status to eligible members.

Story: As an admin, I can grant special status badges to a member if they qualify.

Success Criteria:

- Admin can select member and grant Hall of Fame (HoF) or Big Add Posse (BAP) status flags (assuming they qualify per IFPA criteria). HoF and BAP badges are permanent lifetime honors that persist indefinitely. The act of assigning either badge automatically grants Tier 2 membership. If the member is currently Tier 3, the member remains Tier 3 while governance status is active and the underlying membership tier is set to Tier 2 for later reversion. Granting these badges sends a congratulatory email to the member.
- The IFPA Board flag (Tier 3 governance status) is temporary and applies only while the member is an active board member. When the IFPA Board flag is set active, the system sets the member's membership tier to Tier 3 (IFPA director) and records the underlying membership tier for later reversion. If a Tier 0 member becomes Tier 3, the underlying membership tier is set to Tier 1 and any current Active Player status ends. When the IFPA Board flag is removed (member no longer on board), membership tier reverts to the underlying tier: Tier 1 if the member entered Tier 3 from Tier 0 or Tier 1, or Tier 2 if the member entered from Tier 2, Hall of Fame, or BAP. All Board flag changes and resulting tier changes are audit-logged.
- Badges are visible on member profile and anywhere member tier is displayed.
- The IFPA Board flag is temporary, as long as the member is an active board member only.
- All status grants audit-logged with admin ID, member ID, reason, timestamp.

### A_View_Member_History

Access: Only admins can review member history data.

Story: As an admin, I can view a member's complete tier and special flag change history so that I can investigate discrepancies or disputes.

Success Criteria:

- Admin can view audit log for specific member showing all tier changes, HoF grants, BAP grants, manual overrides.
- History displays: timestamp, action type, old values, new values, admin who performed action, reason.
- History sortable by timestamp (newest first by default).
- History includes system-initiated and event-triggered changes: payment-triggered membership upgrades, Active Player grants/extensions/expiry, HoF and BAP grants, Tier 3 governance changes, and underlying-tier changes.

### A_View_Official_Roster_Reports

Access: Only admins can view Official IFPA Roster reports and exports.

Story: As an admin, I can view the Official IFPA Roster count and membership breakdowns so that I can report accurate membership statistics to the IFPA Board and authorized IFPA organizers, distinguishing membership tier from Active Player status.

Success Criteria:
- Admin dashboard includes an "Official IFPA Roster" section. The Official IFPA Roster includes Tier 1 members, Tier 2 members, Tier 3 members, and Tier 0 members with current Active Player status. Tier 0 members without current Active Player status are excluded.
- Dashboard shows total Official IFPA Roster count and a breakdown by membership state: Tier 0 Active Player count, Tier 1 count, Tier 2 count, Tier 3 count. Breakdown by special flags: HoF count, BAP count, Board / Tier 3 governance count (these may overlap with tier counts). Total registered accounts (including Tier 0 members without Active Player status) for comparison, with clear label: "Total Registered Accounts (including Tier 0 without current Active Player status)". Counts update via SQL query on demand.
- Admin can export the Official IFPA Roster as CSV with columns: member ID, display name, membership tier, Active Player status, Active Player expiry date (if applicable), special flags (HoF/BAP/Board), email (opt-in only), city, country.
- Export filename: official_roster_YYYYMMDD.csv.
- Export explicitly excludes Tier 0 members without current Active Player status.
- Export includes a header comment line: "# Official IFPA Roster - Tier 1, Tier 2, Tier 3, and Tier 0 Active Player members - Generated YYYY-MM-DD by admin name".
- The Official IFPA Roster is not public. Tier 2 or Tier 3 members may access it for official IFPA event and organizer purposes through admin-provisioned access; the platform does not expose roster data to general member queries.
- All roster report views and exports are audit-logged with admin ID, export type, member count, timestamp.

### A_Reassign_Club_Leader

Access: Only admins can add or remove a club's co-leaders on a member's behalf, and help clubs that have no co-leader.  

Story: As an Administrator, I have full control over club co-leader rosters so that a club can regain a co-leader when it has none, a mis-added or unwanted co-leader can be removed, and the 5-co-leader cap can be overridden for legitimate growth.

Success Criteria:

- Admin can add a co-leader from the member base (audit-logged); the added member becomes a current affiliate if not already.
- Admin can remove a co-leader (returning them to ordinary club member), or remove their affiliation entirely (audit-logged with mandatory reason text). Admin removal is the only way to remove a co-leader other than the co-leader stepping down themselves.
- A member co-leads at most one club; to make a member a co-leader of a different club, the admin first removes them from their current club's co-leader set (a single admin transaction).
- Admin can override the 5-co-leader cap when adding a co-leader, with an explicit "cap-override" reason recorded in the audit row.
- Admin can make an affiliated-only member (one whose wizard claim was capped out) a co-leader at any time.
- Clubs with zero co-leaders are flagged "Needs Leader" and surface on the low-priority admin opportunity list (§5.1).
- Admin can resolve a "Needs Leader" item by adding a co-leader, or by archiving the club only if it is confirmed defunct. Leaderless is a tolerated state (§5.1), so this is an opportunity, not an obligation.
- Reassignment restores normal club management capabilities when a leadership gap was the blocking issue.
- When resolving leadership for a bootstrapped club, the system marks the relevant `club_bootstrap_leaders` row as superseded.
- All admin leadership actions are audit-logged with actor identity, timestamp, before/after values, and reason text; the audit trail is the canonical history and cannot be edited by admins.

### A_Reassign_Event_Organizer

Access: Only admins can reassign event leadership.

Story: As an Administrator, I can reassign event leadership so that events remain operable if an event organizer leaves or deletes their account, leaving no more organizers.

Success Criteria:

- Admin can assign an event organizer from the member base (audit-logged).
- Events with zero organizers are flagged "Needs Organizer" and appear in an admin work queue.
- Reassignment restores normal event management capabilities.

### A_Fix_Event_Results

Access: Only admins can correct official event results and related event records.

Story: As an administrator, I can correct event results and other official event records when organizers make mistakes, so that historical records remain accurate while all corrections are fully auditable.

Success Criteria:

- Admins can open a specific event and view its official results (for example divisions, placements, scores, and medalists) and other key event metadata that are treated as official records.
- Admins can make limited corrections to official event results and metadata (for example fixing a misspelled competitor name, wrong placement, or swapped divisions) without editing free-form content such as news posts or arbitrary descriptions.
- Every correction requires a mandatory “reason for correction” note entered by the admin.
- Each correction is recorded in an audit log that includes before/after values, admin identity, timestamp, and the reason for correction.
- Participants and organizers see the corrected results in all normal views; where appropriate.
- Corrections do not bypass normal publishing or sanctioning rules: only events that are otherwise valid (for example sanctioned where required) can have their official results corrected.

### A_Mark_Member_Deceased

Access: Only admins can mark members as deceased.

Story: As an administrator, I can mark a member as deceased so that their account is handled appropriately while preserving their historical contributions and honoring their privacy.

Success Criteria:

- Admin can select a member and mark them as deceased via a dedicated action.
- System adds a deceased: true flag and deceasedAt timestamp to the member record.
- If the member has a linked `historical_person_id`, the same action sets `historical_persons.is_deceased = 1` on that record (cascade), audit-logged, so the member and historical surfaces stay consistent.
- Deceased member accounts are immediately removed from active member search results, removed from club rosters, and unregistered from any upcoming events.
- If member has HoF or BAP status, these honors remain visible with the member's name and brief bio to preserve community history.
- Member's uploaded media (photos/videos) remains published with attribution preserved to honor their contributions.
- Member's historical event results, club affiliations, and other community contributions remain visible in archives and historical records.
- Login is disabled for deceased member accounts (cannot authenticate).
- Email address and other private contact information are permanently removed after a admin-configurable grace period (in case of error).
- Admin action requires mandatory reason field (typically: "Member deceased" or similar).
- Confirmation dialog required.
- All marking actions audit-logged with admin ID, member ID, reason, timestamp.
- Admin sees a clear success message when action completes.
- If marking was done in error, admin can remove the deceased flag within a configurable grace period with audit logging; after grace period, only full account deletion is available.
- A parallel admin affordance can set or unset `historical_persons.is_deceased` on an unlinked historical record (a historical person with no member account), audit-logged with a reason and reversible. The `historical_persons.is_deceased` flag is affirmative-only (its presence marks a person recognized as deceased; its absence asserts nothing) and is consumed only to suppress the direct historical-record claim CTA (see M_Claim_Legacy_Account). No public memorial display is driven by this flag; an "In Memoriam" presentation on historical and HoF/BAP surfaces is deferred to its own future story.

### A_Review_Member_Link_Help_Requests

Access: Admins only.

Story: As an admin, I can review and resolve member-initiated help requests for legacy-identity claims when the platform's self-serve mechanisms (auto-link card confirmation, declared-anchor entry, optional mailbox-link-click round-trip, direct historical-record claim) did not produce a candidate the member could confirm. I can also handle after-the-fact disputes where a member believes a previously-confirmed claim is wrong.

Success Criteria:

- Admin can view the help-request queue (`work_queue_items` with `task_type='member_link_help_request'`). Each item shows the member's identity statement, any structured fields the member supplied (claimed legacy username, claimed legacy email, references to known board / club members who can vouch), and any attachments.
- Admin can communicate with the member out-of-band if more information is needed; the form's outbound channel is the member's verified login email.
- Admin can approve and apply the link. Approval writes an `audit_entries` row carrying `evidence_strength='admin_vetted_evidence'`. The link transaction follows the same field-level merge and tier-grant rules as a member-confirmed card claim.
- Admin can reject with a reason. Rejection is audit-logged.
- Admin can defer for further investigation.
- Approval never auto-promotes legacy `is_admin` metadata to a live admin role.
- The legacy banned flag is recorded as audit metadata only and does not gate admin approval; any disciplinary state on the new platform is handled by the new platform's discipline mechanisms.
- Dispute reverts (member confirmed a wrong card or impersonator-confirmed claim): admin can revert a previously-confirmed claim, clearing the back-link columns and revoking the tier grant. The revert is audit-logged with the original-claim audit row identifier for traceability.

### A_View_Honors_Oversight_Feed

Access: Admins only.

Story: As an admin, I have on-demand, post-facto visibility into honors-bearing direct historical-record claims (a category the platform applies without admin pre-screening), backed by a-priori validation of the honors data itself, so the community can trust honors-driven outcomes without a pre-screen gate and without a daily push email.

Success Criteria:

- Honors trustworthiness is established before go-live: imported `is_hof` / `is_bap` flags are cross-checked against the authoritative public rosters (footbaghalloffame.net for Hall of Fame, bigaddposse.com for Big Add Posse), and mismatches are curated out, so an honor-driven tier grant never rests on a wrong flag.
- There is no daily oversight email. After go-live the small, visible community self-polices honors claims, and an admin reverts any wrong claim using the dispute revert affordance from A_Review_Member_Link_Help_Requests.
- An admin can review honors-bearing claims on demand: a read-only view lists direct historical-record claims where the linked record carries an honor flag (Hall of Fame, Big Add Posse), each row showing the confirming member's display name, the linked historical record, the confirmation timestamp, and the evidence-strength tag.
- The view is read-only and never gating; the claim has already applied. The admin can navigate from a row to the member's profile and to the historical record to spot suspect claims.

### A_Periodic_Club_Cleanup

Access: Admins only (admin cleanup queue). There is no unattended background process; the queue evaluates its predicates on demand when an admin opens it.

Story: As an admin, I work a single on-demand cleanup queue. When I open it, the platform evaluates club-viability and leadership-staleness signals and surfaces only the clubs that need a human decision, each resolved in one click. Unconfirmed legacy affiliations that no member ever confirms are retired by an explicit per-club de-list, on my judgment rather than on a timer. I work the queue at my own cadence; a backlog badge on the admin home page surfaces the count and age of the oldest open item.

Success Criteria; On-demand evaluation:

- The queue runs no unattended background process. When an admin opens it, the platform evaluates the following predicates fresh against current data and surfaces only the clubs that need a human decision; each item carries a recommended one-click action and resolves without any automatic state change. Each admin action writes one `audit_entries` row with `actor_type='admin'`.
  - `leaderless_active_club`: a live `clubs` row with `status='active'` that has no `club_leaders` rows surfaces as a low-priority "could use a leader" opportunity item. Leaderless is a tolerated state (§5.1), so the recommended action is to add a co-leader (via `A_Reassign_Club_Leader`), not to demote; demotion to inactive is driven only by the `crowdsource_club_viability` inactivity signals below. The item offers two further one-click choices: **contact members** (sends the volunteer-to-co-lead invitation, see `V_Volunteer_To_CoLead`, to the club's current members, audit-logged) or **defer** (take no action now; while the club stays leaderless the item resurfaces on a later open). As soon as anyone becomes a co-leader (self-volunteer, invite-accept, or admin add), the club is no longer leaderless and the item drops from the queue automatically on the next evaluation (the predicate is computed fresh on each open). A member stepping up to co-lead is also a strong positive viability signal, equivalent to a member-reported "active" vote: it resets the club's inactivity staleness, so the `crowdsource_club_viability` gates do not recommend demotion. Any future co-leader claim or current-affiliation insert is recorded normally and the club stays `'active'`.
  - `stale_provisional_leader`: `club_bootstrap_leaders` rows still `status='provisional'`, grouped by club, surface as a review-or-dismiss item.
  - `crowdsource_club_viability`: weighs the activity signals members left in the onboarding wizard ("active" / "not active" / "not sure", where "not sure" counts for nothing) against the club's legacy classification and whether it still has any current leaders or members. Signals are counted one vote per member: a member's latest signal for a club supersedes their earlier ones, so re-submissions and changed answers never inflate the thresholds. The queue item names the members whose latest answer was negative, because negative votes are rare and the admin judges them by who cast them; authorship renders only on this admin surface. The first matching case wins:
    - G1 (confirmed active): at least one member said the club is active, or a member has stepped up as a co-leader. A positive signal wins outright, even if others said it was inactive. No queue item, and the club's leaderless-club staleness resets.
    - G2 (concordant inactive): two or more members said inactive, none said active, and the club has no current leaders or members. The queue recommends demoting it to inactive.
    - G3 (weak inactive): exactly one member said inactive, none said active, the club has no current leaders or members, and its legacy classification is weak (not `pre_populate`). The queue recommends demoting it to inactive.
    - G4 (needs review): exactly one member said inactive, none said active, the club has no current leaders or members, but its legacy classification is strong (`pre_populate`). Because that lone negative contradicts strong legacy evidence, the queue routes it for human review rather than recommending a demote.
    - Otherwise: if there are negative signals but the club still has current leaders or members, operations are authoritative and nothing surfaces; if there are no signals at all, nothing surfaces.
- Unconfirmed `legacy_person_club_affiliations` residue (`'pending'` rows) is retired by an explicit per-club admin de-list, never on a timer; see the residue de-list under the admin residue queue below.
- Each predicate evaluation is idempotent and read-only until the admin acts; re-opening the queue produces no state change. Adding a new predicate or loosening a threshold requires an explicit story extension; admins do not configure predicates from the queue surface.

Success Criteria; Admin residue queue:

- The admin cleanup queue surfaces the items that need human judgment.
- An admin-home backlog badge shows the count of open queue items and the age of the oldest open item, so the admin sees backlog without opening the queue. Recommended cadence is monthly during steady-state operation; weekly during periods of high member activity (post-migration cutover, after major data imports). There is no automated escalation, deadline, or service-level target.
- Admin views a single residue queue aggregating:
  - Wizard-generated flags grouped by candidate or live club.
  - Junk-flagged candidates and admin force-keep or force-junk requests.
  - Non-junk `legacy_club_candidates` not yet promoted to live `clubs` rows.
  - `legacy_person_club_affiliations` rows still in `resolution_status='pending'` (unconfirmed legacy residue), grouped by live club, each with the club's pending count and the age of its oldest row.
- Each queue item shows: the candidate or club or affiliation id, the source surface, the signal or pending counts, and the display names of members whose latest activity answer was negative (when applicable).
- Items render collapsed by source / category by default; admin expands a group to per-row view. Each group exposes a group-level bulk action where applicable.
- Resolution actions available per item type:
  - **Flag (any source)**: dismiss with optional reason (terminal), or defer for 30, 90, or 180 days. Deferred items re-surface after the duration with a "previously deferred by Admin X, reason ..." annotation. There is no unbounded defer.
  - **Junk-flagged candidate**: confirm junk, add to force-keep (return to classifier normal evaluation), or promote to dormant for further evaluation.
  - **Force-keep or force-junk request**: apply, modify, or reject.
  - **Unpromoted candidate (onboarding-visible or dormant)**: promote to a live `clubs` row, demote (onboarding-visible to dormant), archive, or defer.
  - **Live club with accumulated flags**: mark `status='inactive'`, archive (`status='archived'`), demote to dormant, or dismiss the flags. Merging two live clubs is deliberately not a queue action: duplicate clubs are resolved upstream by the curator pipeline's duplicate merge during data preparation.
  - **Unconfirmed legacy residue (per live club)**: one click de-lists a club's `'pending'` rows, transitioning them to `'former_only'` (preserves historical fact, drops from the current-roster filter) in a single transaction. Each affected row carries the actor and timestamp; one summary audit row records the action and the de-listed count. The same de-list runs automatically when a club is demoted or archived. The oldest-row age shown on the item is an advisory grace signal; nothing transitions on a timer. Safe to re-run.
- All resolutions are audit-logged with actor identity, item type, club or candidate or affiliation id, decision, optional note, and timestamp.
- Concurrent admin coordination: when an admin opens an item for review, a lightweight "claimed by Admin X at time T" marker becomes visible to other admins. The marker auto-releases on resolve, dismiss, defer, or after a 30-minute stale-claim timeout. The marker does not block other admins; it is a coordination signal.
- The queue is sortable and filterable by category, age, region, flag count, and source surface.
- The queue surface respects the privacy and anti-enumeration rules that apply to legacy data: admin-only access, no public exposure of registrant signal authorship.
- The `legacy_club_candidates` table may be dropped only after every non-junk candidate has reached a terminal state.

## 7.3 Content Moderation

### A_Moderate_Media

Access: Only admins can review and act on flagged media, including deleting items.

Story: As an admin, I can review flagged media and Delete or take No Action with reason so

that I resolve cases.

Success Criteria:

- Admins see Takedown Queue (typically 0 to 10 items).
- Display flag reasons and sample thumbnails.
- Visibility into flagging patterns: who flagged what, when, and any relevant aggregate patterns (for example: repeated flagging by the same accounts), without storing IP-derived data.
- Admin decision buttons: Delete hides immediately and removes origin access immediately; cached CDN copies may persist briefly per TTL/invalidation.
- All actions append to immutable audit log with actor, reason, and affected mediaId.
- System emails uploader with decision.
- Administrators can set or unset any flags to maintain consistency; all changes audit-logged.

### A_Upload_Curated_Media

Access: Only admins can upload, edit, delete, or organize curated media on behalf of the system member account (the platform's curator identity, see DD §2.8). Members and visitors do not see these controls.

Story: As an admin, I can manage curated photos and videos that the platform attributes to the system member account, uploading, editing, deleting, and organizing them into category subdirectories, so that I publish and maintain curator content (landing-page demo loops, page illustrations, well-known event photos, freestyle trick reference videos, hero features, promotional assets, and similar items) without requiring a member to author them.

Success Criteria, Upload:

- Admin upload UI is accessible only to authenticated admins. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login.
- Admin can upload photos (JPEG, PNG; same format whitelist as M_Upload_Photo) and videos (formats per DD §6.8 Curator Media Processing). MP4 binary upload is admin-only; members cannot upload MP4. URL-only video references (YouTube, Vimeo) are also supported: admin pastes the video URL, the system extracts platform and video_id, and no binary upload is required. sourceId and clip ranges (startSeconds, endSeconds) are optional for URL-only references. Posters for video are provided as a companion image upload.
- Uploaded photos go through the standard Sharp pipeline (DD §6.8): re-encode, strip metadata, generate thumb + display variants.
- Uploaded videos go through the curator video pipeline (DD §6.8): ffmpeg full transcode with explicit malware-stripping options, producing a single standardized output rendition. Companion poster goes through the Sharp pipeline.
- The resulting media_items row has uploader_member_id set to the system member id (the row where is_system=1). Admin actor is not stored on the media_items row.
- Admin can specify a caption (plain text, max 500 characters; same security validation as M_Upload_Photo), source attribution (sourceId referencing an existing media_sources row, or a new source created inline by the admin), and clip ranges (startSeconds, endSeconds) for video reference media.
- Admin assigns the upload to a category subdirectory under /curated/. The admin UI accepts an existing category or a new category name; entering a name not yet used creates the subdirectory on next deploy. Filesystem-driven; any /curated/{name}/ subdirectory is a valid category.
- Admin can specify tags at upload time. Standardized event/club hashtags auto-link to the corresponding gallery per §1.1. Freeform tags appear on /tags/{tag} pages. The `#curated` tag is auto-applied by the curator pipeline as the FH/admin uploader marker; it is reserved for system use and rejected if supplied by the admin in the input. Per-category default tag stacks are also auto-applied (e.g. /curated/freestyle_tricks/ adds `#freestyle #trick`; /curated/demos/ adds `#demo`). Filtering by `#curated` returns the all-FH gallery.
- Tag autocomplete is category-aware: /curated/freestyle_tricks/ uploads autocomplete trick-slugs from the freestyle dictionary (`freestyle_tricks.slug`); admin sees a warning if a tricklike tag matches no known dictionary slug, but the upload still completes. Alias-shaped trick tags (matching `freestyle_trick_aliases.alias_slug`) are canonicalized to the parent trick's slug before insertion; the saved tag set shows the canonical form.
- Admin can specify an optional external URL on each uploaded item (media_items.external_url; e.g. link to creator page, source article, related event). Validated at the service boundary per DD §3.17. Persists on the row and on the file-paired sidecar (DD §1.13). The upload form works without JavaScript for photo and URL-reference uploads; admin S3-mode video uploads require JavaScript (the noscript banner warns).
- Admin can specify gallery assignment: detached (no gallery) or attached to a system-member-owned gallery. Curator-gallery management is out of scope for this story; for the initial phase, all curator content uploaded via this path is detached.
- Upload completion model varies by media type:
    - Photo and URL-reference uploads complete synchronously: admin sees success or failure in the request-response cycle.
    - Video uploads complete asynchronously (DD §6.8 "Asynchronous orchestration"). The browser uploads source bytes directly to S3 via presigned PUT URLs; the admin's HTTP request returns immediately with a status-page URL, and the transcode runs in the worker container after the fact. Transcode itself takes approximately 1-2 minutes per video; the admin watches the status page for live updates. The status page does not poll: state changes arrive via Server-Sent Events pushed from the worker through the web container. Video upload requires JavaScript; the upload form surfaces this with a noscript banner. Photo and URL-reference uploads remain JavaScript-optional.
- Admin uploads are not rate-limited at the member-tier rate. The audit_log is the accountability surface for admin actions.
- Curator media is subject to the standard moderation flow per A_Moderate_Media. Curator media is public per §3.8 (the system member is a member for that rule's purpose; FH is treated like any HoF member by every other rule).
- The system member's display_name (default "Footbag Hacky") is the uploader attribution shown on the resulting media's public render, parallel to how member-uploaded media shows the member's display_name. The display_name is editable by admin via A_Override_Member_Data.
- The operator-run bulk curator-content seeding mechanism is a parallel path for pre-go-live content; it writes the same media_items row shape and is subject to the same processing pipeline. Operational specifics in DEVOPS_GUIDE.

Success Criteria, Edit:

- Admin edit UI is accessible only to authenticated admins. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login.
- Editable fields are caption, tags, source attribution (sourceId), and clip ranges (startSeconds, endSeconds). Same validation rules as upload.
- File replacement is not supported in-place. To change the file bytes, admin deletes the existing item and uploads a new one.
- The `#curated` tag is auto-applied on every save and rejected if supplied in the tags input. Per-category default tags are preserved across edits.
- Tags are rewritten atomically: the existing tag set is replaced by the new set in a single transaction. The auto-applied tags are preserved across edits.
- For URL-reference items (YouTube, Vimeo), edit updates the `media_items` row directly; this DB write is the contract. Before go-live, where sidecar writes are enabled, the edit also writes through to the `/curated/` sidecar (DD §1.13) so the git-tracked authoring source stays in step. Caption maps to `sidecar.title`; URL-reference fields (creator, sourceId, tier, startSeconds, endSeconds, Vimeo thumbnailUrl) merge into the sidecar.
- Editing a media item that does not exist (or is not FH-owned) returns 404.

Success Criteria, Delete:

- Admin delete UI is accessible only to authenticated admins. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login.
- Deletion is hard delete (per DD §2.3 hard-delete rule for media): the media_items row is removed, all associated media_tags rows are cascaded, and the underlying S3 keys (variants and poster) are removed.
- For URL-reference items (YouTube, Vimeo), delete removes the `media_items` row directly. Before go-live, where sidecar writes are enabled, delete also unlinks the `/curated/` sidecar (DD §1.13) so the authoring source stays in step.
- Deletion is permanent. There is no soft-delete or restore. The admin sees a confirmation gate before the operation runs.
- Deleting a media item that does not exist (or is not FH-owned) returns 404.

Success Criteria, Category creation:

- Admin enters a new category name during upload (e.g. `tutorials`, `news`); the seeder creates `/curated/{name}/` on next deploy.
- Filesystem is the source of truth for category existence; no code-side whitelist of valid categories. Category names follow a slug convention (lowercase, alphanumeric plus underscore or hyphen).
- The new category's default tag stack is `#curated #{name}` plus admin-selected tags. Per-category tag-autocomplete dictionaries are configured separately as new categories require them; the default fallback is no autocomplete.

Audit:

- An audit_log entry is appended for every upload, edit, and delete, recording admin actor, timestamp, action type, source filename (delete only), and affected media_id, parallel to A_Moderate_Media, A_Override_Member_Data, and A_Fix_Event_Results.

### A_Create_News_Item

Access: Only admins can manually create a news item.

Story: As an admin, I can manually author a news item so that I can publish announcements not auto-generated by system events.

Success Criteria:

- Admin can create a news item with: title (required, max 200 chars), body text (required, Markdown-safe), optional linked entity reference (event ID, club ID, vote ID, or none), and publish date (defaults to now).
- Created news item is immediately visible in the news feed (or at the specified publish date if future-dated).
- Creation is audit-logged with admin ID, timestamp, and news item ID.
- Manually created news items can be edited or deleted via A_Moderate_News_Item.

### A_Moderate_News_Item

Access: Only admins can edit, or remove news feed items.

Story: As an admin, I can review and moderate auto-generated news feed items so that I ensure content quality.

Success Criteria:

- Admin can edit, or reject news items.
- Rejected items are hidden from news feed.
- Edited items will reflect updated text in news feed.
- Admin can delete a NewsItem permanently (hard delete). Deletion is immediate and irreversible.
- Delete action requires a reason (mandatory text field, max 500 chars).
- Confirmation dialog before deletion, clearly stating the action is permanent.
- On delete: NewsItem is immediately and permanently removed from the database and hidden from the public feed. The deletion is recorded in the audit log with admin ID, news item ID, reason, and timestamp.
- All actions audit-logged.

### A_Archive_Club

Access: Only admins can archive or mark clubs defunct beyond what club leaders can do.

Story: As an admin, I can mark a club defunct/archived and notify members so that directories stay accurate. Archiving may be used for a club that has no co-leader (for example, a lingering “Needs Leader” item) when the club is confirmed defunct; a leaderless club is not archived merely for lacking a co-leader, since that state is tolerated per §5.1.

Success Criteria:

- Sets status: "archived" in club data.
- All current club members' `member_club_affiliations.is_current` is set to 0 (they become unaffiliated); the affiliation rows themselves are preserved so historical membership remains queryable. Affected members receive an email notification explaining the club was archived and their membership has ended.
- Preserves club data for 7 years per retention policy.
- Records an audit log entry.

## 7.4 Vote Management

**Vote Status Lifecycle**

All votes have a status field constrained to the following valid values. No other status values are valid.

- `draft`; Vote created but not yet open. Valid transitions: → `open` (automatically when open_datetime is reached), → `canceled` (A_Cancel_Vote).
- `open`; Active voting period; eligible members can submit ballots. Valid transitions: → `closed` (automatically via SYS_Close_Vote when close_datetime is reached), → `canceled` (A_Cancel_Vote).
- `closed`; Voting period ended; awaiting tally. Valid transitions: → `published` (A_Publish_Vote_Results), → `canceled` (A_Cancel_Vote).
- `published`; Results published and visible to all eligible members. Terminal state; cannot be canceled or reversed.
- `canceled`; Vote voided before results were published. Terminal state.

### A_Create_Vote

Access: Only admins can configure and create voting topics.

Story: As an Administrator, I can create a vote (election or issue vote) so that eligible members can participate securely within a defined window.

Success Criteria:

- Admin defines: title, description, vote type (Election / Issue), nomination window (optional), voting window, ballot type (single-choice / multi-choice), and background materials (text + links/attachments).
- Admin defines eligibility rules using member attributes and flags (Tier status, HoF, BAP, Board flags) or an explicit inclusion list. The eligibility rule set also includes `members_of_group(group_id)`: when this rule is configured, eligible voters are members where `group_member_affiliations.group_id = group_id AND is_current = 1`, evaluated and snapshotted at vote-open time. Eligibility predicates can be combined (for example: Tier 2 AND `members_of_group(finance_committee)`).
- System validates: date ordering, required fields, and that eligibility rules are internally consistent.
- System generates a unique vote ID and audit-log record of creation.
- For HoF elections, any member can submit nominations during the nomination window, but to be included in the ballot, the nominated candidates must provide an affidavit that explains their qualifications, basically their footbag career achievements. This information will be included as part of the vote’s background materials.
- Eligibility for candidates/options is enforced by the vote’s configured rules.
- At ballot open, the set of options is locked.
- Eligibility Changes: Members cannot gain or lose eligibility after vote opens, ensuring fairness.
- Eligibility is evaluated and snapshotted at the moment the vote transitions to `open` status. Eligible members at vote-open time are written as rows into `vote_eligibility_snapshot`. Members retain voting rights for the full voting window even if their tier, flags, or group membership change while the vote is open.
- Group-scoped votes follow the same encryption, receipt-token, decrypt-audit, and tally rules as all other votes; there is no lightweight or non-encrypted variant.
- If the referenced group in a `members_of_group` rule is archived after the vote opens but before the vote closes, the open vote continues to completion using the frozen snapshot; the system creates an admin notification but does not cancel the vote automatically.
- Members may request a vote via `M_Contact_IFPA_Admin` using the "Vote creation request" category. The admin reviews the request through `A_Resolve_Contact_IFPA_Admin_Request` and then configures the vote through this story if approved.

### A_Publish_Vote_Results

Access: Only admins can publish vote results.

Story: As an Administrator, I can publish the results of a vote so that members can see outcomes.

Success Criteria:

- All decryptions logged to audit trail.
- Publish tally with transparent vote counts visible to all members**.**
- System provides tallies according to the configured ballot type.
- Admin can publish results and optionally include a short written summary.
- Publish creates a news item linking to the vote results page.
- System provides vote receipts/verification support as described in member voting stories.
- Publishing results does NOT automatically change member roles/flags (e.g., boardMember). Admins apply outcomes manually outside the vote system.
- Tallying is permitted only when vote.status equals 'closed' AND current server timestamp exceeds vote.close_datetime. The system enforces both conditions to prevent early result access.
- Audit records TALLY_VOTE_START event containing admin_id, vote_id, and start timestamp when tally operation begins. Individual decrypted ballots are never logged or stored in plaintext. The system aggregates vote totals in memory and discards individual ballot contents immediately after counting. Audit records TALLY_VOTE_COMPLETE event containing admin_id, vote_id, aggregate result summary (totals only, not individual votes), and completion timestamp.
- Data Export / vote participation records: for each vote the member participated in, the export includes vote title, vote ID, and submission timestamp. The raw receipt token is not included in the export. Members who need to verify their ballot must use the receipt token from their original email.
- After HoF election results are published (or the vote is canceled), the system clears the `HoF_Nominated` flag from all members who held it during that cycle, resetting the flag for the next nomination cycle.

### A_Cancel_Vote

Access: Only admins can cancel a vote.

Story: As an admin, I can cancel a vote that has not yet had results published so that erroneous or compromised elections can be voided.

Success Criteria:

- Admin can cancel a vote in `draft`, `open`, or `closed` state. Votes in `published` state cannot be canceled.
- On cancellation: vote status set to `canceled`. All eligible members who have not yet voted receive a cancellation notification email. Already-cast ballots are retained in encrypted form for audit purposes but results are never published.
- Cancellation reason is required (free-text field, mandatory) and is audit-logged with admin ID, vote ID, reason, and timestamp.
- canceled votes are visible in vote history with status `canceled` and the cancellation reason displayed.

## 7.5 Email

### A_Send_Mailing_List_Email

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

### A_Manage_Mailing_Lists

Access: Only admins can view and manage mailing lists. The only exception is EO_Email_Participants.

Story: As an administrator, I can create, update, and archive mailing lists that are backed by MailingList and MailingListSubscription data objects, so that we can manage bulk email communications in a controlled and auditable way without hard-coding specific lists.

Success Criteria:

- The system seeds an initial set of core MailingList records (for example: newsletter, board-announcements, event-notifications, technical-updates, admin-alerts), but these are only an initial default set, not the full or fixed set of lists.
- Admins can create additional MailingList records at any time (for example: regional lists, project-specific lists), by specifying name, description, and whether the list is member-manageable or admin-only.
- For each MailingList, admins can view key analytics including total subscribers and counts by status (subscribed, unsubscribed, bounced, complained), based on MailingListSubscription records.
- Admins can change a MailingList’s status to archived so that it no longer appears in member subscription controls or new email send flows, while all historical mailing data and subscriptions remain preserved for audit and reporting.
- For member-manageable lists, subscription/unsubscription is primarily controlled by the member from their profile page; admins can only make limited manual adjustments in exceptional cases (for example to handle bounced or complaint states), and all such manual changes are audit-logged with admin identity, timestamp, and reason.
- For admin-only lists (for example admin-alerts), subscriptions are controlled by admin configuration or system roles rather than member toggles, and the rules for who is subscribed are clearly documented in the list metadata.
- `MailingList` records support three admin-configurable behavior fields: `subject_prefix` (string, max 32 chars, default empty; when non-empty, prepended to outgoing subjects in the form `[prefix] subject`); `moderated` (bool, default false; when true, outgoing messages are queued for owner approval via `GO_Moderate_Email_Queue`); and `restricted_sending` (bool, default false for general lists and default true for group-auto-sync lists; when true, only the configured allowed-sender population may compose).
- `MailingList` records support an `auto_sync_by_group` mode. When set to a group ID, the list's `MailingListSubscription` rows are managed automatically by the group membership system (`M_Join_Group`, `M_Leave_Group`, `GO_Manage_Members`, `A_Reassign_Group_Owner`). Manual subscription edits by members or by admins on auto-sync lists are blocked except for bounce or complaint state handling.
- Auto-sync `MailingList` records are excluded from the member-facing `M_Manage_Email_Subscriptions` view because the member cannot unilaterally unsubscribe; the member leaves the group to be removed from the list.
- When an Admin enables email on a group via `A_Create_Group` or `A_Edit_Group_Properties`, the system creates the associated `MailingList` in `auto_sync_by_group=<group_id>` mode and seeds the subscription rows from current group membership.
- When an Admin disables email on a group, the associated `MailingList` is archived per the existing archive semantics and accepts no further sends.

## 7.6 System Configuration

### A_View_Stripe_Config_And_Payments

Access: Only admins can view Stripe configuration and payment details.

Story: As an administrator, I can view a Stripe configuration and payments dashboard that shows test/live mode, webhook health, API key age, and recent payment volumes by category, so that I can quickly confirm that payments infrastructure is healthy and decide when to investigate deeper using the detailed payments and reconciliation views.

Success Criteria:

- The admin Stripe dashboard clearly shows whether the system is currently in test or live mode and when this mode was last changed.
- The dashboard shows webhook health, including the timestamp of the last successful webhook and counts of failures over a recent window (for example the last 24 hours), with obvious warning states when webhooks are failing or have been silent for too long.
- The dashboard shows API key information in a safe, non-sensitive way (for example key labels and age), and highlights when keys are older than a threshold or when rotation is recommended.
- The dashboard summarizes recent payment volume, broken down by category (donations, membership fees, event registrations) for a configurable time window (for example last 30 days), including both count and total amount.
- From this dashboard, admins can navigate directly to the “All Payments” view and the “Reconciliation Issues” view described in A_Reconcile_Payments for deeper inspection.
- The dashboard provides clear, explicit actions for key operations such as “View Webhook Logs”, with appropriate confirmations and warnings; all such actions are audit-logged with admin identity and timestamp.

### A_Configure_System_Parameters

Access: Only admins can configure system-wide parameters.

Story: As an admin, I can view and adjust key system parameters in one place so that policies remain consistent, small changes do not require code deployments, and system behavior matches IFPA’s current decisions. Note that some parameters must be configured by an AWS System Administrator instead.

Success Criteria:

- There is a single System Parameters admin view that shows all supported configuration settings grouped into clear sections (for example: Membership and Pricing, Donations and Payments, Email and Notifications, Data Retention and Cleanup, Grace Periods, System Health and Alarms, Session Timeout).
- All Administrator-configurable system parameters have normative default values defined in the Configurable Parameters subsection of this document. The initial database creation process must load those defaults into the corresponding tables. Defaults reflect IFPA rules where applicable, and otherwise reflect privacy, security, and legal-retention requirements.
- The Membership and Pricing section allows an admin to view and adjust: Tier 1 IFPA Member price (USD). Tier 2 IFPA Organizer Member price (USD).
- The Email and Notifications section allows an admin to view and adjust: Maximum email retry attempts for the outbox / notification sender (default: 5 attempts with exponential backoff; after max attempts the item is moved to a dead-letter queue/folder visible to admins). Time between outbox scans / notification runs (configurable; default 30 seconds via `outbox_poll_interval_seconds`) for SYS_Send_Email. "Pause sending" emergency toggle (default: off) that stops the worker from sending new outbox items while keeping newly enqueued items pending. Days-before-event for registration reminder emails in M_Register_For_Event (default: 7 days before event start). Two administrator-configurable days-before-Active-Player-expiry reminder offsets (defaults: 30 and 7 days). Day-of Active Player expiry notification (T+0) is built in and not separately configurable.
- All parameters on this screen: Show current values and defaults, with short helper text explaining how each value is used (for example “Used by recurring donations job; do not set below X days without board approval”). Enforce safe ranges and validation so that admins cannot set obviously invalid values (for example negative days, zero retry count, or unparseable expressions). Are audit-logged when changed, including old value, new value, admin ID, and timestamp, and these changes appear in A_View_Audit_Logs / A_View_System_Health where appropriate.
- Changing any of these parameters does not require code deployment: the updated values are read from the SystemConfig data store and automatically picked up by the relevant jobs, flows, and admin views the next time they run.
- The Data Retention Configuration section allows an admin to view and adjust entity-specific retention periods enforced by SYS_Cleanup_Soft_Deleted_Records background job: Member account deletion grace period, Payment record compliance retention, Audit log retention, Ballot retention.
- Admin can create a new dues schedule entry with: tier product (eg: Tier 1 IFPA Member), amount, currency, effectiveStartDate, and required reason (“official rule change”, “board decision”, etc.).
- Only one schedule entry per tier product may be active for a given effectiveStartDate.
- Price schedule changes are audit-logged with admin ID, old active price, new price, effectiveStartDate, reason, timestamp.
- Past entries are immutable/read-only (no edit/delete); admins can only supersede by adding a new entry.

### A_Manage_Admin_Role

Access: Only admins can grant or revoke the admin role for authorized members.

Story: As an admin, I can grant or revoke admin privileges so that I manage the admin team.

Success Criteria:

- Admin can select member and grant/revoke admin role.
- Granting admin requires: member has Tier 2 or Tier 3 status, confirmation dialog, mandatory reason.
- Revoking admin requires: confirmation dialog, mandatory reason.
- Admin cannot revoke their own admin status (ensures there is always at least one admin).
- All role changes send email notification to affected member.
- All role changes audit-logged with admin ID, target member ID, action, reason, timestamp.
- Granting the admin role automatically subscribes the member to the Admin mailing list used for admin alerts.
- Revoking the admin role automatically unsubscribes the member from the Admin mailing list, without changing any of their other email subscriptions.

## 7.7 Configurable Parameters

Seed these defaults into the database-backed configuration store during initial database creation. Admins may change values only within validated ranges; all changes must be audit-logged. Story text may reference these defaults but must not redefine them. IFPA-derived values reflect the IFPA Memberships document (authoritative source). For membership pricing, the keys below are `system_config.config_key` literals.

### Membership Pricing / Dues (IFPA-derived)

- `tier1_price_cents = 1000` (Tier 1 IFPA Member dues; integer cents; valid `> 0`)
- `tier2_price_cents = 5000` (Tier 2 IFPA Organizer Member dues; integer cents; valid `> 0`)

### Active Player Windows / Lifecycle (IFPA-derived)

- `active_player_duration_days = 730 days` (Active Player grant duration; IFPA-rule-derived; changes only when IFPA adopts a later rule)
- `active_player_expiry_reminder_days_1 = 30 days` (valid `>= 1`)
- `active_player_expiry_reminder_days_2 = 7 days` (valid `>= 1` and `< active_player_expiry_reminder_days_1`)
- `active_player_expiry_check_interval_seconds = 86400 seconds` (Active Player expiry sweep worker tick interval; daily)
- `vouch_rate_limit_max_per_hour = 5` (max vouch submissions per voucher per window)
- `vouch_rate_limit_window_minutes = 60` (sliding window in minutes for counting vouch submissions per voucher)

### Email / Notifications / Outbox

- `outbox_max_retry_attempts = 5`
- `outbox_poll_interval_seconds = 30 seconds`
- `email_outbox_paused = 0` (admin-only emergency kill switch; DB literal `0/1`)
- `event_registration_reminder_days = 7 days`

### Auth / Security Tokens

- `email_verify_expiry_hours = 24 hours`
- `password_reset_expiry_hours = 1 hour`
- `token_cleanup_threshold_days = 7 days`
- `data_export_link_expiry_hours = 72` (hours before a personal data export download link expires)
- `login_rate_limit_max_attempts = 10` (maximum failed login attempts within the window before the account is locked)
- `login_rate_limit_window_minutes = 15` (sliding window in minutes for counting failed attempts)
- `login_cooldown_minutes = 30` (lockout duration after threshold is exceeded)
- `password_reset_rate_limit_max_attempts = 5` (maximum password reset requests per email address within the window before requests are silently rate-limited)
- `password_reset_rate_limit_window_minutes = 60` (sliding window in minutes for counting password reset requests per email)
- `jwt_expiry_hours = 24` (lifetime of the main site session JWT; governs archive access expiry since no separate archive session is issued)
- `photo_upload_rate_limit_per_hour = 10` (maximum photo uploads per member per hour)
- `video_submission_rate_limit_per_hour = 5` (maximum video link submissions per member per hour)
- `media_flag_rate_limit_per_hour = 10` (maximum media flags per member per hour to prevent abuse)
- `password_change_rate_limit_max_attempts = 10` (maximum authenticated password-change attempts per member per window)
- `password_change_rate_limit_window_minutes = 15` (sliding window in minutes for counting password-change attempts per member)
- `verify_resend_rate_limit_max_attempts = 3` (maximum verify-email resend requests per email address per window)
- `verify_resend_rate_limit_window_minutes = 60` (sliding window in minutes for counting verify-email resend requests per email)
- `account_claim_expiry_hours = 24` (legacy account claim token TTL in hours; per `M_Claim_Legacy_Account`)

### Retention / Cleanup

- `member_cleanup_grace_days = 90 days` (aligns with `M_Delete_Account` and `SYS_Cleanup_Soft_Deleted_Records`)
- `deceased_cleanup_grace_days = 30 days` (grace period before contact data is cleared from a deceased member record, per `A_Mark_Member_Deceased`; allows correction of erroneous deceased flags)
- `payment_retention_days = 2555 days` (minimum 7 years; do not reduce below minimum)
- `audit_retention_days = 2555 days`
- `ballot_retention_days = 2555 days` (governance/audit defensibility baseline)
- `reconciliation_expiry_days = 90 days`
- `reconciliation_summary_interval_days = 7` (cadence in days for the automated reconciliation digest email sent to admins)
- `primary_snapshot_version_days = 30` (number of days of point-in-time snapshot versions retained in the primary S3 backup bucket; governs the S3 versioning lifecycle setting)
- `cross_region_backup_retention_days = 90` (Object Lock retention window for backup objects in the cross-region disaster-recovery bucket)
- `continuous_backup_interval_minutes = 5` (interval in minutes between continuous SQLite backup runs)

## 7.8 Monitoring and Audit

### A_View_Dashboard

Access: Only admin users can view the admin dashboard.

Story: As an admin, I can view a consolidated dashboard Work Queue, an ordered list of items generated by the system so that I can quickly see what needs my attention.

Success Criteria:

- Dashboard shows a summarized Work Queue panel with details such as: pending event approvals, flagged media, election tasks (if any), payment reconciliation discrepancies, recurring donation failures, club without a leader, event without an organizer, email outbox failures/dead-letter items, any active unacknowledged alarms (acknowledged alarms are visible in A_Acknowledge_Alarm view but not counted in the dashboard summary), vote management.
- This dashboard does NOT show information that requires AWS console access (which is instead intended for the System Administrator role).
- Each count links to the corresponding detailed queue or screen (for example, event approval queue, moderation queue, payment reconciliation view).
- Items are grouped by category (Events, Media, Membership, Payments, Elections, System) with clear labels.
- Dashboard highlights any categories with urgent items (for example, failed backups, alarmed cost thresholds, many failed payments, email outbox dead-letter growth) using a simple visual indicator.
- Admin sees only data they are permitted to act on; no member personal data beyond what existing admin stories allow.
- Dashboard view is read-only; all state changes happen in the underlying queues and flows already defined in other admin stories.

### A_Resolve_Contact_IFPA_Admin_Request

Access: Administrators can review, respond to, and resolve `member_contact_request` items in the admin work queue.

Story: As an administrator, I can review a member's contact request from the admin work queue, take the requested action (or document why no action is taken), and resolve the queue item so that the member's account issue is handled and the resolution is auditable.

Success Criteria:

- The admin work-queue dashboard at `/admin/work-queue` lists every `work_queue_items` row with `status='open'`, grouped by `queue_category`, including `task_type='member_contact_request'` items under Membership.
- Each item displays the task-type label, the member's display name with a link to their profile, the opened date, and the `reason_text` (category label + first 200 chars of the message).
- Each item carries an inline resolve form with a decision-label dropdown (Corrected, Denied, Duplicate, Out of scope) and a required free-text resolution note (up to 500 characters).
- On resolve, `work_queue_items` is updated with `status='resolved'`, `resolved_at`, `resolved_by_member_id=<admin>`, `decision_label`, and `reason_text=<resolution note>`.
- On resolve, one `audit_entries` row is written with `actor_type='admin'`, `action_type='support.contact_request_resolved'`, `category='support'`, `reason_text=<decision_label>`, and `metadata_json` carrying the resolution note and original queue item id.
- On resolve, an email reply is dispatched to the member's `login_email` via the `SesAdapter` containing the decision label, the resolution note, and instructions to submit a new request if further assistance is needed. The templated reply does not echo the member's original message back.
- If the resolution requires changing a member field (display_name, slug, tier, identity link), the admin performs that change through the relevant admin tool. The contact-request resolution itself never mutates member rows; it only transitions queue state, writes audit, and sends email.
- Resolving an item with an invalid decision label or empty resolution note returns 422 with a field-level error. Resolving an unknown or already-resolved queue id returns 404.
- Non-admin authenticated users receive 403 from `/admin/work-queue` and the resolve action; unauthenticated traffic is redirected to login.

### A_View_System_Health

Access: Only admins can view overall system health, cost, and performance metrics in the application UI. Important note: AWS/System Administrator features related to AWS health/cost/performance (including AWS console/CloudWatch access and infrastructure operations) require special access and are out of scope for this document. We describe only Application Admin role features here, not AWS System Administrator features.

Story: As an admin, I receive alerts on flagged media, webhook failures, backups, and budget alarms so that I can act quickly.

Success Criteria:

- Grid of metric cards: CPU, Memory, Storage, Backup Status, Cost.
- Refresh button with auto-refresh toggle (default: every 5 minutes).
- No direct links to AWS consoles (including CloudWatch), CLI tooling, or infrastructure controls are exposed in the Application Administrator UI.
- Health view shows at least: Email delivery status (bounce and complaint rates). Email outbox status: pending, sent, failed, and dead-letter counts (for a configurable recent window), plus whether “pause sending” is currently enabled. Backup job status (last run time and success or failure). Origin availability / maintenance mode status (normal vs maintenance page), including current origin 5xx rate (or equivalent) and when the maintenance page was last served. Storage usage (e.g., S3 usage and trends).
- Monthly cost projection vs budget (current spend and projected end-month spend).

### A_View_Audit_Logs

Access: Only admins can view detailed audit logs.

Story: As an admin, I can view and filter audit logs and periodic summaries so that I maintain oversight of key actions and investigate issues.

Success Criteria:

- Audit log view lists entries with at least: timestamp, actor (admin, system, or member), action type, affected entity (such as member, event, media, payment, election), and a short description or reason where available.
- Entries are sorted by timestamp, newest first by default.
- Admin can filter logs by: date range (from/to); topic/category (for example: membership changes, pricing changes, elections, content moderation, payments, system alarms, configuration changes); actor type (admin vs system vs member).
- Admin cannot search logs via the app at launch but must instead use an external tool if searching logs is required operationally.
- Audit coverage includes at least: membership tier changes, pricing updates, event sanction approvals, media takedown decisions, election operations (create, publish, decrypt), admin role changes, alarm acknowledgments, and system cleanup or reconciliation processes.
- Monthly summary view shows counts per category (for example: number of tier changes, number of event approvals, number of takedowns) to support lightweight reporting.
- Logs retain limited identifiers necessary for traceability (IDs, not email addresses), consistent with privacy rules in Global Behaviors and Technical Requirements.
- All audit log data is read-only; no UI allows editing or deleting existing entries.

### A_Acknowledge_Alarm

Access: Only admins can acknowledge platform alarms and document responses.

Story: As an admin, I can acknowledge AWS alarms so that I record incident handling.

Success Criteria:

- Alarm dashboard with acknowledge action.
- Acknowledgment recorded in audit log.
- Alarms include at least: Abnormally high email bounce or complaint rates. Backup failures or missed runs. Approaching or exceeding monthly cost thresholds.
- When an alarm is acknowledged, the system records: Who acknowledged it. When it was acknowledged. An optional note describing actions taken.

## 7.9 Group Management

### A_Create_Group

Access: Only Admins can create groups, regardless of type. Members may request group creation via `M_Contact_IFPA_Admin` using the "Group creation request" category. The admin reviews the request through `A_Resolve_Contact_IFPA_Admin_Request` and then configures the group through this story if approved.

Story: As an Admin, I can create a group with all configurable properties and assign its initial owner so that I provision IFPA governance, working, and social groups.

Success Criteria:

- Form includes: name (required, max 80 chars, not required to be globally unique); description (long-form text); type (enum: `group`, `committee`, `board`, `panel`, `fellows`); official (bool, default false); policy (enum: `public`, `private`, default `private`); restrict_membership (bool, default true); email_enabled (bool, default false); alias_keyword (required and unique if `email_enabled=true`, max 32 chars, lowercase alphanumeric and hyphen; resulting email address is `<alias_keyword>@groups.footbag.org`); active (bool, default true); parent_group_id (optional, must reference an existing non-archived group; subcommittee nesting depth is unlimited); initial owner member ID (required, must be a Tier 1+ member).
- If `email_enabled=true`, the system creates an associated `MailingList` in `auto_sync_by_group=<group_id>` mode with the configured `alias_keyword` resolved to `<alias_keyword>@groups.footbag.org`, applies admin-set defaults for `subject_prefix`, `moderated`, and `restricted_sending`, and seeds the subscription with the initial owner.
- Platform-native group aliases (`<alias_keyword>@groups.footbag.org`) are distinct from legacy IFPA `@ifpa.footbag.org` aliases. This story provisions new platform groups only; it does not migrate, reproduce, or accept inbound posting to legacy `@ifpa.footbag.org` list aliases, which are dispositioned separately as part of the legacy email transition. The platform does not receive inbound email; group mail is composed via the web form and distributed via SES.
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

- Admin can assign a group owner from the Tier 1+ member base (audit-logged).
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

# 8. Background System Jobs

System jobs are not User Stories. Instead they represent automated processes that execute on schedules (a DevOps concern), or in response to system events (webhooks). All system job actions are logged so that they can be viewed via the admin dashboard. These jobs are required in order to ensure the success criteria for the User Stories given above are met.

### SYS_Check_Active_Player_Expiry

Access: This scheduled process runs under the system role.

Story: The system automatically checks Active Player expiry every day so that Tier 0 members' temporary Tier 1 benefits and Official IFPA Roster inclusion stay in sync with the IFPA membership rules.

Success Criteria:

- System runs a daily job that evaluates Active Player expiry dates for Tier 0 members, using two configured pre-expiry reminder offsets (for example T-30 and T-7), plus a built-in day-of expiry notification (T+0).
- For each Tier 0 Active Player with an upcoming expiry, the job determines whether a reminder is due today based on those configured offsets and whether a reminder for that offset has already been sent; if due, it enqueues an Active Player expiry reminder email via the notification outbox.
- Reminder emails describe Active Player expiry and ways to regain Active Player status (later qualifying event attendance, vouch from a Tier 2 or Tier 3 member, or, if not previously used, a one-time first-club-join grant). They must not describe membership-tier expiry or renewal. Reminders are never sent more than once per day per member or more than once per configured offset.
- Reminders are not sent for members whose Active Player status has already been extended past the offset window, and the job respects member email preferences and unsubscribes for the relevant reminder category.
- Membership tiers are never downgraded by this job because membership tiers are lifetime.
- When a Tier 0 member's Active Player expiry date has passed, the member remains Tier 0 and Active Player status is marked expired or treated as no longer current. Expired Active Player status ends Tier 1 benefits and Official IFPA Roster inclusion.
- The job does not affect Tier 1, Tier 2, or Tier 3 members because Active Player applies only to Tier 0.
- Each Active Player expiry action writes an audit-log entry including member ID, previous Active Player expiry date, processing date, reason `active_player_expired`, and timestamp.
- All reminder sending and automatic Active Player expiry processing performed by this job are logged to CloudWatch (or equivalent monitoring), including counts and failure metrics.

### SYS_Send_Email

Access: This scheduled polling process runs under the system role to send queued emails by polling the email outbox on a configurable interval (default: every 30 seconds via `outbox_poll_interval_seconds`). Only admins can view delivery logs.

Story: The system automatically sends transactional emails so that members stay informed of important events.

Success Criteria:

- System sends emails for: account registration, email verification, password reset, membership purchase or upgrade, Active Player grant/extension/expiry, payment receipt, event registration confirmation, club membership changes, co-organizer/co-leader additions, and other cases. As this is a flexible list, it is not necessary to hard-code all cases now.
- All emails sent via SES with proper headers, unsubscribe links, and deliverability tracking.
- Worker respects the admin Pause Sending toggle: when enabled, the worker does not attempt new sends, but enqueued items remain pending.
- Emails are sent only via the outbox pattern: request-time controllers enqueue outbox entries and never call SES directly; a background worker polls the outbox on a configurable interval (default: every 30 seconds), sends via SES, and records sent/failed status.
- Failed email deliveries are logged and retried up to 5 times with exponential backoff; after the maximum retry count the outbox item is moved to a dead-letter queue/folder for admin review and possible replay.
- Email templates are stored as plain text in the database and are editable by Administrators via the configuration interface. Template changes are audit-logged. 
- Different mailing lists can have different from addresses configured and this job will use them. The special no-reply from address will be an option. Otherwise, all other reply addresses must go to a real inbox for a human to receive replies.
- All sent emails are logged to CloudWatch with template ID, member ID, outbox message ID, timestamp, and delivery result (do not log raw email addresses or full subject lines).

### SYS_Open_Vote

Access: This scheduled process runs under the system role.

Story: The system automatically opens votes at their configured open_datetime so that voting begins on schedule without manual admin action.

Success Criteria:

- System runs a job (at minimum hourly) that checks all votes in `draft` status with open_datetime <= now (UTC).
- For each such vote, the job transitions vote.status to `open` and writes eligibility snapshot rows to `vote_eligibility_snapshot` (same logic as A_Open_Vote).
- The system sends notification to all eligible members that the vote is now open (if configured).
- Each transition is audit-logged: vote_id, old status, new status, eligible member count, job run timestamp.
- An admin-alerts email is sent for each automatically opened vote.

### SYS_Close_Vote

Access: This scheduled daily process runs under the system role.

Story: The system automatically transitions votes from `open` to `closed` when their close_datetime has passed, so that tally operations can proceed without manual admin intervention.

Success Criteria:

- System runs a daily job (or more frequently; at minimum once per hour is recommended) that checks all votes with status `open` and close_datetime in the past (UTC).
- For each such vote, the job sets vote.status to `closed` and records a close timestamp.
- The job audit-logs each transition: vote_id, old status (`open`), new status (`closed`), close_datetime, job run timestamp.
- The system sends an email notification to the admin-alerts mailing list when a vote is automatically closed, including the vote title and vote ID.
- No member notifications are sent at close time (only at result publication via A_Publish_Vote_Results).

### SYS_Process_One_Time_Payments

Access: This event-driven process runs under the system role when Stripe sends payment-related webhook events. Only admins can view logs and failure metrics.

Story: The system handles Stripe webhook events for one-time payments (membership dues, event registrations, one-time donations) so that local payment records are kept in sync with Stripe.

Success Criteria:

- On payment_intent.succeeded: local payment record transitions to `completed`. Tier upgrade or event registration confirmation applied as appropriate. Receipt email enqueued to member. Audit-logged with payment_intent_id, amount, currency, and timestamp.
- On payment_intent.payment_failed: local payment record transitions to `failed`. Failure notification email enqueued to member. Audit-logged.
- On charge.refunded: local payment record transitions to `refunded`. Audit-logged with Stripe charge ID, refund amount, currency, and timestamp. No automatic tier or registration changes are applied by the platform; any required access changes are handled manually by admins via A_Override_Member_Data using "payment issue resolution" as the reason.
- All one-time payment webhook processing is idempotent via the stripe_events table (keyed on Stripe event_id), consistent with the global Payment Processing Guarantees.
- All events audit-logged with payment_intent_id, member_id, event type, old status, new status, and timestamp.

### SYS_Process_Recurring_Donations

Access: This event-driven process runs under the system role when Stripe sends subscription-related webhook events. Only admins can view logs and failure metrics. Recurring donation billing schedules are owned entirely by Stripe; the platform does not drive charges.

Story: The system handles Stripe Subscription webhook events for recurring donations so that local payment records, member-facing history, and admin reconciliation data are kept in sync with Stripe's billing activity.

Success Criteria:

- The platform does not run a scheduled cron job to initiate recurring donation charges. Stripe owns the annual billing cycle and all retry logic based on the Stripe Billing dunning configuration set by a System Administrator in the Stripe Dashboard.
- On invoice.payment_succeeded for a donation subscription: the system creates a new local payment record (linked to the existing donation subscription record via stripeSubscriptionId), enqueues a receipt email to the member, and audit-logs the event with subscription_id, invoice_id, amount, and timestamp.
- On invoice.payment_failed for a donation subscription: the system updates the local subscription status to past_due and enqueues a failure notification email to the member. No retry logic is implemented in the platform; Stripe's configured dunning schedule governs further retry attempts.
- On customer.subscription.deleted for a donation subscription (triggered when Stripe exhausts all retries, or when the member cancels via the platform): the system sets the local subscription status to canceled, enqueues a final notification email to the member and an admin alert, and audit-logs the cancellation with subscription_id and reason.
- On customer.subscription.updated (e.g., amount or status changes made in the Stripe Dashboard by a System Administrator): the system updates the local subscription record to reflect the new state and audit-logs the change.
- All subscription webhook processing is idempotent via the stripe_events table (keyed on Stripe event_id) consistent with the global Payment Processing Guarantees.
- All subscription lifecycle events are audit-logged with subscription_id, invoice_id (where applicable), member_id, event type, old status, new status, and timestamp.

### SYS_Reconcile_Payments_Nightly

Access: This nightly process runs under the system role to reconcile payments with external providers. Only admins can view its reports.

Story: The system automatically reconciles local payment records against Stripe every night so that discrepancies are detected promptly across both one-time payments and recurring donation subscriptions.

Success Criteria:

System runs nightly cron job at 2 AM UTC in two passes:

Pass 1; One-time payments: Compares local payment records (membership dues, event registrations, one-time donations) against Stripe PaymentIntent records for the reconciliation window. Discrepancies flagged: local records with no matching Stripe PaymentIntent, Stripe PaymentIntents with no matching local record, amount or status mismatches.

Pass 2; Recurring donation subscriptions: Compares local donation subscription records against Stripe Subscription objects and their associated Invoice records. Discrepancies flagged: active local subscriptions with no matching active Stripe Subscription, Stripe Subscriptions with no matching local record, local subscription status out of sync with Stripe status (e.g., local shows active but Stripe shows canceled or past_due), Invoice charges recorded in Stripe but missing as local payment records.

Amount discrepancy checks compare both the amount AND the currency field: a local record and a Stripe record for the same payment_intent_id that have matching amounts but different currency values MUST be flagged as a discrepancy. Reconciliation reports display amounts alongside currency codes.

Discrepancies from both passes are stored as durable reconciliation issues with status (Outstanding/Resolved), resolver, timestamps, and resolution notes; shown in admin dashboard; retained 90 days.

### SYS_Cleanup_Expired_Tokens

Access: This scheduled process runs under the system role. Only admins can view its summary logs.

Story: The system deletes expired or consumed email verification and password reset token rows so that token tables remain small and old tokens cannot be reused.

Success Criteria:

- System runs a daily job to delete token rows that are expired or consumed and older than a configured cleanup threshold (default: 7 days).
- Cleanup covers at least: email verification tokens and password reset tokens.
- Each run logs counts of deleted rows by token type and the oldest remaining token age (if any) to CloudWatch (or equivalent monitoring).
- Cleanup is safe and idempotent (re-running does not affect correctness).

### SYS_Cleanup_Soft_Deleted_Records

Access: This scheduled process runs under the system role to purge member records after their deletion grace period. Only admins can view or adjust its configuration and logs.

Story: The system anonymizes member records after the deletion grace period so that PII is removed while referential integrity and audit history are preserved.

Success Criteria:

- System runs a daily cron job.
- Member Cleanup (admin-configurable grace period default: 90 days, parameter key: member_cleanup_grace_days): After member_cleanup_grace_days days past deletedAt timestamp, the job performs the following selective operations. PII purge: credential and contact fields (email, phone, passwordHash) are set to NULL. The member row is retained as an anonymized record for referential integrity. For retained non-nullable identity/location fields, the application writes anonymized placeholder values where required by schema. HoF/BAP flagged members receive the same PII NULLing treatment; however, their display name, bio, honor badges (HoF, BAP), and event result history are preserved to honor community history.
- Photo Cleanup (zero grace period): no job concern required for this. No referential integrity concerns because photos are leaf nodes in data model. When member deletes account, member's photos are deleted immediately.
- Payment Record Cleanup (7-year retention for compliance). This period satisfies financial compliance requirements while enabling GDPR data deletion.
- Vote Ballot Preservation (7-year retention).
- Clubs are NEVER hard deleted (historical record preservation); instead they are archived. 
- Events with result rows are never hard-deleted once official event-result rows exist for that event (historical record preservation).
- Events and clubs can be marked archived or inactive via admin actions but database records remain indefinitely. When an event organizer or co-leader deletes an account, leadership foreign keys continue to point to the retained/anonymized member record to preserve historical leadership. For non-HoF/BAP members, the display name may be anonymized to "Deleted Member" where required by schema/app policy; for HoF/BAP members, preserve displayName and bio per the deletion policy. Historical event results, participant lists, and club rosters remain intact for community record.
- Each run writes a comprehensive summary entry to application logs and audit trail including: job start/end timestamps, entity types processed (members, payments, ballots), counts per entity type (records eligible for cleanup, records anonymized, records preserved due to special rules, records skipped due to errors), errors encountered with entity IDs and error messages.

### SYS_Rebuild_Hashtag_Stats

Access: This scheduled process runs under the system role.

Story: The System recomputes hashtag usage statistics daily so that member-facing pages can show fast, accurate counts for popular hashtags in real time. Hashtag usage can be sorted by popularity

Success Criteria:

- A scheduled background job runs once per day to recompute aggregated hashtag usage counts from recent media.
- The job reads MediaItem records, normalizes each tag, and updates a stats structure containing {tag, usageCount, lastUpdated}.
- The stats are stored in a format that can be read quickly by the Browse Hashtags page and any “popular tags” UI elements.
- If the job fails, existing stats remain in place and the failure is logged for later investigation.
- The system exposes basic metrics for the job (run time, success/failure) to operations/admins.

### SYS_Handle_Stripe_Webhooks
Access: This event-driven process runs under the system role when Stripe sends webhook events. Only admins can view logs and failure metrics.

Story: The system validates and processes Stripe webhook events so that payments are confirmed reliably and local records reflect Stripe’s source of truth.

Success Criteria:

- Webhook handler validates Stripe webhook signatures using the configured webhook secret.
- Processing is idempotent (replayed events do not double-apply tier changes or create duplicate payment records).
- On successful payment events, the system updates the relevant local payment records and triggers the correct downstream effects (e.g., membership tier upgrades, receipts) consistent with the relevant member/admin stories.
- Failures are logged with sufficient metadata for debugging, and webhook failure counts/time-since-last-success are surfaced in the admin Stripe dashboard health indicators.

### SYS_Handle_SES_Bounce_And_Complaint_Webhooks
Access: This event-driven process runs under the system role when SES reports bounces/complaints. Only admins can view detailed logs.

Story: The system processes SES bounce/complaint notifications so that mailing lists remain healthy and future sends avoid problematic addresses.

Success Criteria:

- SES webhook events update MailingListSubscription status (bounced/complained) and any global member email suppression as applicable.
- Member subscriptions stay consistent with subscription status so future sends skip suppressed addresses.
- Bounce/complaint rates are tracked and can trigger alarms.

### SYS_Nightly_Backup_Sync
Access: This process runs under the system role.

Story: The system performs a nightly backup sync so that recovery is possible within the defined RPO/RTO.

Success Criteria:

- Nightly backups are incremental and designed to complete quickly; the run includes a nightly integrity verification step appropriate to S3 (at minimum: verify required prefixes and objects exist).
- Failures are logged and raise an alarm; job metadata (last-run time, duration, success/failure) is recorded for admin visibility.
- A nightly job syncs the primary S3 bucket to a separate cross-region backup bucket (disaster recovery target) and records last-run time, duration, and success/failure status for admin visibility.
- The backup bucket is protected with S3 Object Lock (WORM) and lifecycle rules to enforce retention.
- Backup retention defaults (admin-configurable): ≤90 days for general backup objects/snapshots; ≤7 years for audit logs.
- Recovery objectives (admin-visible targets): Disaster recovery (cross-region) targets are RTO = 2 hours, RPO = 24 hours. Primary recovery uses the frequent SQLite snapshot mechanism (see SYS_Continuous_Database_Backup) for a much smaller RPO under common failure modes.
- For key datasets (at minimum audit logs and payments), cross-region replication runs continuously; the nightly job also acts as an integrity verification pass (e.g., verifies expected objects/prefixes exist in the backup bucket).
- Failures are logged and raise an alarm; status is shown in A_View_System_Health as Backup job status.

### SYS_Continuous_Database_Backup

Access: This process runs under the system role on a configurable interval (default: every 5 minutes; see `continuous_backup_interval_minutes`).

Story: The system continuously backs up the SQLite database to the primary S3 bucket so that recovery is possible with minimal data loss from common issues like corruption, bugs, or accidental deletion. This is the most frequently used recovery mechanism and is separate from the nightly cross-region disaster recovery sync.

Success Criteria:

- Background worker runs every 5 minutes.
- Process executes: (1) WAL checkpoint commits pending writes to the main database file, (2) SQLite backup API creates a consistent point-in-time snapshot, (3) Upload snapshot to primary S3 bucket with retry (3 attempts, exponential backoff), (4) Update health timestamp. The technical implementation of the WAL checkpoint (including specific PRAGMA commands and busy-timeout handling) is specified in Design Decisions.
- S3 versioning enabled on primary bucket provides 30-day point-in-time recovery (restore any snapshot from last 30 days).
- Upload failures trigger retry with exponential backoff (max 3 attempts per cycle).
- After 3 consecutive failures, alarm raised and logged for admin investigation.
- Health timestamp tracks last successful backup for monitoring dashboard.
- Cost remains minimal.
- Backup does not interfere with application performance (WAL mode allows concurrent reads).
- Container shutdown waits for in-flight backup to complete before final upload and exit.

### SYS_Cleanup_Static_Asset_Versions

Access: This process runs under the system role.

Story: The system runs a daily (off-peak) cleanup of old static asset versions (or uses an equivalent S3 Lifecycle expiration rule) so storage does not grow without bound while preserving rollback safety.

Success Criteria:

The job deletes obsolete content-hash asset versions older than the configured retention window (default: 90 days) to preserve rollback capability while controlling storage growth and cost. All deletions are logged and failures raise alarms. Retention window (default: 90 days) is admin-configurable.

# 9. System Administrator Stories

System Administrator stories are not application User Stories, but instead they are DevOps actions performed by technical staff with access to the AWS console, CLI, and related operational tooling. This summary is not an exhaustive list, but it clarifies the boundary between what an Application Administrator (user-role) can do and what must be handled by a System Administrator (developer role) responsible for infrastructure provisioning, deployment operations, and ongoing platform maintenance. All System Administrator AWS actions are logged via CloudTrail.

The System Administrator role covers the operational work required to deploy, secure, and operate the platform in production. Responsibilities include provisioning and maintaining AWS infrastructure (e.g., Lightsail, S3, CloudFront, SES, IAM, Parameter Store/KMS) using infrastructure as code; managing environments and deployments (CI/CD, configuration, rollbacks); rotating and safeguarding secrets/keys and webhook credentials; configuring domains/DNS and TLS certificates; SQLite data storage (versioning, backups, restore testing, and configuration); configuring and monitoring scheduled/background jobs; setting up logging/metrics/alerts and cost controls; applying security updates and access reviews; and leading incident response and operational troubleshooting.

**END OF User Stories DOCUMENT**