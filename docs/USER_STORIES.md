# Footbag Website Modernization Project -- User Stories

**Document Purpose:**

This document is the Source of Truth for Functional Requirements, defining all User Stories and their user-facing implications for the Footbag Website Modernization Project. It covers all user roles: Visitor, Member (includes Event Organizer and Club Leader), Administrator, and system background processes, plus special flags for the IFPA Board, Hall of Fame (HoF) and Big Add Posse (BAP). Together these User Stories define the complete scope, describing what functionality must exist for users, and success criteria (system side effects).

Version markers: a story, section, or individual success criterion headed `<< V2 SCOPE >>` or
`<< V3 SCOPE >>` is design intent for a post-launch build and is not part of the v1 launch; text
with no marker is v1. The
allocation is decided in the Migration Plan's feature-scope-by-version section, which this
document follows.

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
  - [2.2 Freestyle Encyclopedia](#22-freestyle-encyclopedia)
    - [V_Browse_Trick_Dictionary](#v_browse_trick_dictionary)
    - [V_View_Trick_Detail](#v_view_trick_detail)
    - [V_Search_Tricks](#v_search_tricks)
    - [V_View_Trick_Records](#v_view_trick_records)
    - [V_View_Freestyle_Reference](#v_view_freestyle_reference)
    - [V_View_Set_Encyclopedia](#v_view_set_encyclopedia)
    - [V_Learn_Freestyle](#v_learn_freestyle)
    - [V_View_Emerging_Vocabulary](#v_view_emerging_vocabulary)
    - [V_View_Freestyle_Media_Hub](#v_view_freestyle_media_hub)
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
    - [M_View_Dashboard](#m_view_dashboard)
    - [M_View_Profile](#m_view_profile)
  - [3.3 Club Membership](#33-club-membership)
    - [M_Join_Club](#m_join_club)
    - [M_Leave_Club](#m_leave_club)
    - [M_View_Club](#m_view_club)
  - [3.4 Event Participation](#34-event-participation)
    - [M_Register_For_Event](#m_register_for_event)
    - [M_Withdraw_Registration](#m_withdraw_registration)
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
    - [M_Unsubscribe_One_Click](#m_unsubscribe_one_click)
    - [M_Send_Announce_Email](#m_send_announce_email)
  - [3.10 Group Membership](#310-group-membership)
    - [M_Browse_Groups_Directory](#m_browse_groups_directory)
    - [M_View_My_Groups](#m_view_my_groups)
    - [M_View_Group](#m_view_group)
    - [M_Read_Group_Discussion](#m_read_group_discussion)
    - [M_Join_Group](#m_join_group)
    - [M_Leave_Group](#m_leave_group)
    - [M_Email_Group](#m_email_group)
- [4. Event Organizer Stories](#4-event-organizer-stories)
  - [4.1 Event Lifecycle](#41-event-lifecycle)
    - [Event Status Lifecycle](#event-status-lifecycle)
    - [M_Create_Event](#m_create_event)
    - [EO_Request_Sanction](#eo_request_sanction)
    - [EO_Edit_Event](#eo_edit_event)
    - [EO_Delete_Event](#eo_delete_event)
    - [EO_Cancel_Event](#eo_cancel_event)
    - [EO_Manage_CoOrganizers](#eo_manage_coorganizers)
  - [4.2 Registration Management](#42-registration-management)
    - [EO_View_Participants](#eo_view_participants)
    - [EO_Cancel_Registration](#eo_cancel_registration)
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
  - [4.6 Tournament Operations](#46-tournament-operations)
    - [EO_Configure_Tournament_Disciplines](#eo_configure_tournament_disciplines)
    - [EO_Manage_Discipline_Entries](#eo_manage_discipline_entries)
    - [EO_Check_In_Competitors](#eo_check_in_competitors)
    - [EO_Seed_Discipline](#eo_seed_discipline)
    - [EO_Generate_Draw](#eo_generate_draw)
    - [EO_Schedule_Matches](#eo_schedule_matches)
    - [EO_Record_Match_Result](#eo_record_match_result)
    - [EO_Correct_Match_Result](#eo_correct_match_result)
    - [EO_Configure_Freestyle_Judging](#eo_configure_freestyle_judging)
    - [EO_Score_Freestyle_Run](#eo_score_freestyle_run)
    - [EO_Print_Tournament_Sheets](#eo_print_tournament_sheets)
    - [V_Follow_Live_Tournament](#v_follow_live_tournament)
    - [EO_Finalize_Discipline_Results](#eo_finalize_discipline_results)
- [5. Club Leader Stories](#5-club-leader-stories)
  - [5.1 Club Lifecycle](#51-club-lifecycle)
    - [M_Create_Club](#m_create_club)
    - [CL_Edit_Club](#cl_edit_club)
    - [CL_Mark_Club_Inactive](#cl_mark_club_inactive)
  - [5.2 Leadership Management](#52-leadership-management)
    - [CL_Manage_CoLeaders](#cl_manage_coleaders)
- [6. Group Owner Stories](#6-group-owner-stories)
  - [6.1 Group Management](#61-group-management)
    - [GO_Edit_Group](#go_edit_group)
    - [GO_Manage_Members](#go_manage_members)
    - [GO_Manage_CoOwners](#go_manage_coowners)
    - [GO_Configure_Email_Settings](#go_configure_email_settings)
    - [GO_Leave_Group](#go_leave_group)
- [7. Administrator Stories](#7-administrator-stories)
  - [7.1 Event and Payments](#71-event-and-payments)
    - [A_Approve_Sanctioned_Event](#a_approve_sanctioned_event)
    - [A_Reconcile_Payments](#a_reconcile_payments)
  - [7.2 Data Management](#72-data-management)
    - [A_Override_Member_Data](#a_override_member_data)
    - [A_Message_Member](#a_message_member)
    - [A_Grant_HoF_BAP_Board_Status](#a_grant_hof_bap_board_status)
    - [A_View_Member_History](#a_view_member_history)
    - [A_View_Official_Roster_Reports](#a_view_official_roster_reports)
    - [A_Reassign_Club_Leader](#a_reassign_club_leader)
    - [A_Reassign_Event_Organizer](#a_reassign_event_organizer)
    - [A_Fix_Event_Results](#a_fix_event_results)
    - [A_Correct_Event_Data](#a_correct_event_data)
    - [A_Mark_Member_Deceased](#a_mark_member_deceased)
    - [A_Periodic_Club_Cleanup](#a_periodic_club_cleanup)
  - [7.3 Content Moderation](#73-content-moderation)
    - [A_Moderate_Media](#a_moderate_media)
    - [A_Upload_Curated_Media](#a_upload_curated_media)
    - [A_Manage_Curated_Gallery](#a_manage_curated_gallery)
    - [A_Browse_Freestyle_Content](#a_browse_freestyle_content)
    - [A_Review_Emerging_Vocabulary](#a_review_emerging_vocabulary)
    - [A_Edit_Freestyle_Trick](#a_edit_freestyle_trick)
    - [A_Register_Freestyle_Source](#a_register_freestyle_source)
    - [A_Edit_Freestyle_Record](#a_edit_freestyle_record)
    - [A_Edit_Consecutive_Kicks_Record](#a_edit_consecutive_kicks_record)
    - [A_Moderate_Freestyle_Trick_Tip](#a_moderate_freestyle_trick_tip)
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
    - [A_Manage_Email_Templates](#a_manage_email_templates)
    - [A_Manage_Admin_Role](#a_manage_admin_role)
  - [7.7 Configurable Parameters](#77-configurable-parameters)
    - [Membership Pricing / Dues (IFPA-derived)](#membership-pricing--dues-ifpa-derived)
    - [Active Player Windows / Lifecycle (IFPA-derived)](#active-player-windows--lifecycle-ifpa-derived)
    - [Email / Notifications / Outbox](#email--notifications--outbox)
    - [Auth / Security Tokens](#auth--security-tokens)
    - [Retention / Cleanup](#retention--cleanup)
  - [7.8 Monitoring and Audit](#78-monitoring-and-audit)
    - [A_View_Dashboard](#a_view_dashboard)
    - [A_Manage_Work_Queue](#a_manage_work_queue)
    - [A_Resolve_Contact_IFPA_Admin_Request](#a_resolve_contact_ifpa_admin_request)
    - [A_View_System_Health](#a_view_system_health)
    - [A_View_Audit_Logs](#a_view_audit_logs)
    - [A_Acknowledge_Alarm](#a_acknowledge_alarm)
  - [7.9 Group Management](#79-group-management)
    - [A_Create_Group](#a_create_group)
    - [A_Edit_Group_Properties](#a_edit_group_properties)
    - [A_Manage_Group_Roster](#a_manage_group_roster)
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
    - [SYS_Freestyle_Content_Source_Of_Truth_Cutover](#sys_freestyle_content_source_of_truth_cutover)
    - [SYS_Handle_Stripe_Webhooks](#sys_handle_stripe_webhooks)
    - [SYS_Handle_SES_Bounce_And_Complaint_Webhooks](#sys_handle_ses_bounce_and_complaint_webhooks)
    - [SYS_Cross_Region_Replication](#sys_cross_region_replication)
    - [SYS_Continuous_Database_Backup](#sys_continuous_database_backup)
- [9. System Administrator Stories](#9-system-administrator-stories)

# 1. Global Behaviors

The following are general rules for all User Stories, where applicable.

Authentication, roles, and sessions: All stories for Members, Event Organizers, Club Leaders, and Administrators roles assume the user is logged in, has a valid session cookie, and holds the required role(s), membership tier, Active Player status where applicable, or special flags. Visitor stories always represent unauthenticated users with no session. System background stories represent automated processes, not logged-in users.

Security and sessions: Authentication uses an HttpOnly, Secure, SameSite=Lax session cookie (JWT). Authenticated state-changing requests must be protected against CSRF and must not perform state changes over GET. The specific CSRF mechanism and request validation rules are defined in the Design Decisions document and must be applied consistently.

Input validation and sanitization: All user-entered text (names, bios, captions, comments, descriptions, etc.) is validated and sanitized to prevent abuse and visual spoofing while remaining usable for international content.

Payment Processing Guarantees: The system does not grant paid access unless Stripe confirms success. Local payment state transitions are monotonic and keyed by Stripe object IDs; duplicates and reordering do not cause double-application. This ordering ensures the system never grants paid features without successful payment. Webhook event processing is idempotent: duplicate webhook deliveries with the same event_id are safely ignored and return 200 OK without reprocessing. This prevents double-processing when Stripe automatically retries webhook delivery. Two payment models are used and each has its own state machine keyed to the appropriate Stripe object:

- One-time payments (membership dues, event registrations, one-time donations): State transitions are keyed by Stripe's payment_intent_id. The enforced state machine is: pending to completed on payment_intent.succeeded; pending to canceled on checkout.session.expired; completed to refunded on charge.refunded. A declined card is not a state transition: while the checkout session is open the buyer may try another card, so payment_intent.payment_failed records the attempt and leaves the record pending. The session, not the attempt, is the unit of failure. Each state transition is recorded in audit logs with timestamp and Stripe event_id. No action is taken on refunds at launch in any case, so the refund concern is theoretical.

- Recurring donations (Stripe Subscriptions): State transitions are keyed by the Stripe subscription_id and invoice_id. The enforced state machine is: active on customer.subscription.created; active (new payment record created) on invoice.payment_succeeded; past_due on invoice.payment_failed (increments a failure counter; Stripe's configured dunning schedule governs retries); canceled on customer.subscription.deleted (triggered after Stripe exhausts all retries, or when canceled by member or admin). Each subscription event is recorded in audit logs with timestamp and Stripe event_id. All webhook event types are deduplicated via the stripe_events table (keyed on Stripe event_id) regardless of payment model.

Currency: The platform supports multi-currency payments via Stripe. Amounts are stored and displayed in the currency of the original transaction. The `currency` field is recorded on all payment records. Reconciliation and reporting display currency alongside amounts. No currency conversion is performed by the platform; Stripe handles currency settlement.

Security tokens: Email verification tokens and password reset tokens are stored in the database as SHA-256 hashes, never as plaintext, preventing account takeover if the database is compromised. Email verification tokens expire after a configurable TTL (default 24 hours, keyed by `email_verify_expiry_hours`) and are marked used via a used_at timestamp after single use. Password reset tokens expire after one hour due to higher sensitivity. Password reset requests are rate-limited to five requests per email per hour, preventing enumeration attacks that reveal valid emails and token farming. The rate limit applies regardless of whether the email exists in the system, with consistent timing to prevent enumeration via timing analysis. Legacy account claim tokens (`account_claim`) expire after 24 hours (configurable via `account_claim_expiry_hours`), are single-use, and are bound to both the requesting authenticated member account and the imported legacy row being claimed. A claim token may only be consumed while authenticated as the same account that initiated the request.

Privacy, visibility, and moderation: Profiles, club rosters, participant lists, and member search results are member-only unless explicitly stated otherwise. Media galleries and tag gallery pages are public. A member upload is publicly attributed by the uploader's display name linked to that member's public gallery (the `#by_<slug>` view); the uploader's contact fields (email, phone) and the link to their member profile stay member-only.

Historical imported people may appear in legacy event results and related read-only historical displays even when they are not current Members. This supports historical accuracy only. It does not imply authenticated-member capabilities, profile ownership, member-search inclusion, club-roster visibility, or any other current-member behavior. See DD §2.4 for the foundational entity-type distinction between `members` and `historical_persons`.

Imported legacy member accounts are stored as rows in the `legacy_members` table, created during the one-time migration from the legacy site. They are not `members` rows: they cannot log in, do not appear in member search results or any current-member surface, and do not affect normal registration or password-reset behavior. A legacy member who wants to connect their historical identity and data to a modern account must use the self-serve legacy claim flow while logged in; the claim links their modern `members` row to the `legacy_members` row rather than converting it.

Moderation flows favor transparency and human oversight: when members flag content, flagged items remain visible until an administrator reviews and decides; no content is hidden or de-ranked automatically by secret algorithms.

File upload safety model: the platform does not run an antivirus scanner on member-uploaded files. All accepted file formats are sanitized by construction: the upload is decoded, re-rendered, or re-encoded through a format-specific transformation tool, and only the transformed output is stored; the original upload is discarded. This malware-by-design approach eliminates non-payload bytes (metadata trailers, embedded scripts, polyglot tricks) at the cost of strict format whitelisting and accepted fidelity loss. Each upload story (`M_Upload_Photo`, `M_Submit_Video`, `M_Upload_Routine_Music`) lists its own format whitelist and per-format sanitization pipeline.

Unless explicitly stated otherwise, all numeric limits (counts, sizes), time windows (expiry/grace periods), reminder offsets, and security thresholds described in this document are defaults and are Administrator-configurable.

Default values and source of truth: Unless explicitly labeled as Example, numeric values in this document are Default values. Defaults for Administrator-configurable system parameters are defined in this User Stories document and must be seeded into the corresponding database-backed configuration data store during initial database creation. The Design Decisions document may describe parameterization, ranges, and ownership, but does not define normative numeric defaults.

All UI labels and system-generated messages are English-only at launch. User-entered club and event descriptions and other club or event details may be authored in any language.

Reporting scope: Any dashboards/metrics described here are operational metrics (health, payment volume, job success/failure), not advanced BI or custom analytics.

Times: every timestamp is stored and displayed in UTC, and every admin surface that renders one names the zone on the face of the figure (for example `2026-08-20 15:21:21 UTC`). The platform holds no per-member time zone and does not convert to a viewer's local clock: an admin reconstructing an incident, or reconciling against a payment provider's dashboard, must be able to read a time without knowing which clock produced it.

Admin work-queue notifications are routed by urgency, never broadcast per event to every administrator. Task types classified urgent (security, data-integrity, or administrative-continuity events needing same-day action) send an immediate email to the admin-alerts mailing list when enqueued. Routine task types send no per-event email: administrators read them on the work-queue dashboard, and a periodic digest emails each administrator a rollup of open routine items. An administrator who claims an item removes it from the other administrators' digests; an item unclaimed past a configured stale threshold escalates once with a single email to admin-alerts naming the item. Every such notification contains task type and entity ID only (no sensitive member data such as email addresses, payment amounts, personal information, or content details). Queue items can be viewed after resolution with status, admin who resolved, resolution timestamp, decision label, and reason text.

Member action items follow the mirror-image rule. Anything the platform is waiting on a member for surfaces on that member's dashboard (`M_View_Dashboard`), which is where every login lands, so a member is shown what they owe rather than having to remember where to look for it. Urgency is set by the part of the platform that owns the obligation, since only it knows its deadline: needs-attention-now items lead the dashboard's action block and put a compact banner on every other member page, while pending items sit quietly on the dashboard alone. Neither the block nor the banner carries private content; each item shows a headline, an optional non-private detail line, and its options, and anything private is read on the owner-only surface the item links to. Notification email is unchanged by this: each obligation keeps whatever reminder its own story specifies, and members receive no rollup digest.

## 1.1 Hashtags

The website will provide organizational structure through explicit linking for uploaded media to club and event galleries based on standardized hashtags, while trusting members to self-organize through freeform tagging. No approval queues. No hidden algorithms. Immediate visibility with automatic discovery. These tags must always follow the de-facto social-platform standard (alphanumeric plus underscores allowed, but not special characters nor hyphens, except for the leading #.)

Hashtags: Tags are short labels that follow the defined tagging pattern: (with a leading “#”) that apply consistently across events, clubs, tutorials, news items, and media. Tag matching is case-insensitive (for example, Footbag and footbag are the same), and all tag-based views behave the same. Common patterns include event tags, club tags, skill or discipline tags, and tutorial. When a member uses a tag anywhere, it automatically contributes to the shared tag index.

*Standardized hashtags* create unambiguous, collision-free categories for media content. Event hashtags follow the pattern `#event_{year}_{event_slug}` (example: #event_2025_beaver_open). Club hashtags follow pattern `#club_{location_slug}` (example: #club_san_francisco). These patterns enforce globally unique identifiers. The system validates standardized tags during event and club creation, scanning existing entities to prevent duplicates. Once created, the standardized hashtag becomes the canonical identifier for that event or club. Members uploading photos or videos can tag content with this hashtag, and the system automatically links that media to the corresponding event or club gallery. This explicit linking solves the discovery problem: organizers create an event (or club) and its standardized hashtag, members tag their uploads, and galleries populate automatically. The connection is direct, predictable, and immediate. Once created, a standardized hashtag is reserved permanently and cannot be reused.

Standardized tags are case-insensitive for usability (#Event_2025_Portland and #event_2025_portland both match) but stored with original capitalization for display quality. Teaching moments appear on the upload page when the member has no uploaded content, showing recent events, the member's club if applicable, and popular community tags to facilitate discovery. When creating an event or club, the UI pre-fills the hashtag field with a suggested value generated from name and location. Users can edit the suggested hashtag before saving. The system validates: format matches pattern, uniqueness via case-insensitive scan, length max 100 characters. Validation happens on save. If hashtag collides, user receives clear error with suggestion to append differentiator.

*Freeform hashtags* complement standardized tags by enabling personal organization without restrictions. Members can tag content with any set of hashtags they choose: #ripwalk, #spike, #tutorial. These tags require no validation beyond security checks (no scripts, no excessive length, no special characters). They create no automatic linking. They exist purely for member-driven discovery and organization. Freeform tags allow organic vocabulary to emerge. If multiple members independently tag similar content with trick-tutorial say, then that becomes a community convention without centralized enforcement. If someone wants to tag photos #trick #double_around_the_world for personal reference, they can. The system imposes no taxonomy.

The distinction between standardized and freeform tags is semantic, not technical. Both are simply strings stored in the tags array of a media file. The difference lies in how they function: standardized tags create automatic gallery linking through event/club page scanning, while freeform tags enable browsing and member-driven organization. tutorial tags specifically will be important to complement the website's initial, curated footbag tutorial pages.

*Uploader hashtags* identify the source of a media item with a tag that matches the uploader's identity. Member uploads carry `#by_{member_slug}` automatically. Curator (FH) uploads carry `#curated`. The system auto-applies these tags on every upload and rejects them when supplied by anyone in input, so they cannot be forged. This makes per-uploader views (a member's Personal Gallery, the all-FH gallery) plain tag-criteria queries that share the same query path as event and club galleries. The slug pattern matches the member URL slug (lowercase letters, digits, underscores), so a member's Personal Gallery is just `criteria_tags = [#by_{member_slug}]`. Member-owned named galleries auto-include `#by_{owner_slug}` in their criteria-tag set on both create and edit, so the gallery's tag-AND filter scopes to the owner's content by default and that scoping cannot be lifted by editing. The bare `#{member_slug}` is an ordinary freeform tag: any member may apply it to mention another member, to pre-tag historical or unsigned persons whose slug does not yet exist in the system, or to organize their own content.

Tag Discovery and Browsing: A hashtag links to its tag gallery wherever at least one media item carries it (the same lightweight existence check used for event and club gallery links, with no total computed), and clicking it navigates to a tag gallery page showing all photos and videos with that tag. On a surface that lists a media item every hashtag shown is on that item, so it always links; where a hashtag is shown apart from any media, such as a freestyle trick with no media yet, it renders as a plain non-clickable token. The media browse landing at /media/browse carries the hashtag index: Popular Tags and All Tags (community tags listed alphabetically). There is no separate hashtag index page.

A community tag is any tag used by at least two distinct members. The hashtag index on the browse landing helps new visitors explore user-uploaded content. Tags used only by a single member (even if that member uses the tag many times) are treated as personal tags and are not listed in the All Tags index. This browsing architecture turns tags into a navigation system, not just metadata. The browse landing and per-tag gallery pages are public.

The upload interface for media (photos and video links) from the MyContent page never blocks, never enforces. All tag fields start empty. Members can upload media into named galleries with no tags at all, they simply won't appear in event/club or discoverable galleries. This respects member agency while providing clear pathways to proper organization.

Gallery Auto-Linking: When a user loads an event or club media gallery page, the system scans all photo and video metadata looking for matches against that entity's standardized hashtag. This scan operates on metadata only, not full media files, keeping response time as quick as possible.

To keep gallery pages fast, the system may cache gallery scan results. As a result, newly uploaded media or tag edits may take a few minutes to appear on event/club gallery pages.

Gallery pages can lazy-load photos using JavaScript (an optional user experience enhancement). Initial HTML contains metadata and thumbnails. JavaScript requests full-resolution images on scroll. Without JavaScript, users see thumbnails and can click through to full images.

Event and club detail pages automatically detect and link to media galleries when content tagged with the standard event or club hashtag exists. Gallery links appear when content exists: View Event Gallery or View Club Gallery. Gallery listings mix photos and videos naturally. This unified approach simplifies the user experience.

Media gallery links appear from club and event pages when content exists (for example, 'View Event Gallery' or 'View Club Gallery'). The system must perform a lightweight scan to detect the existence of just one media item tagged with the event or club hashtag (it does not compute or display image or video total counts). We avoid scans where possible in the UI to keep things quick. All media galleries can include optional external web page URLs, security validated before publication using the full URL validation pipeline used for profile, event, and club URLs.

Content Ownership and Control: Event pages link to galleries showing all photos tagged with that event's hashtag. Member profile pages link to that member's uploaded photos, which may appear in multiple event galleries. The same photo can belong to both the member's personal collection and multiple event/club galleries simultaneously. No duplication. No complex ownership tracking. Just hashtag matching.

Members own their content completely. They can delete photos, videos and named galleries at any time without approval (permanently, no soft delete). Deleting a named gallery removes the gallery itself, its saved query, and nothing else: the items it displayed stay published and keep appearing wherever else their tags match, because a gallery is a saved tag query rather than a container. Deleting an item is the separate, permanent action. Both deletions ask for confirmation first, since neither can be undone. Item deletion removes the content immediately (but requires some minutes to be visibly changed in the UI due to AWS CloudFront CDN caching, and possibly a page refresh click).

If a member uploads inappropriate content, any member with Tier 1 benefits can flag it, triggering admin review. The admin can delete the content if it violates policies. Deletion is the only removal mechanism, logged as an admin decision with a reason. No shadow banning. No selective visibility. This creates accountability: admins must justify deletions, and members know their content is either fully public or fully removed.

Members can edit tags after upload. Adding #event_2025_Beaver_Open to a photo three days after initial upload causes that photo to appear in the event gallery. Removing a tag removes the photo from that gallery. These changes typically propagate quickly, but may take a few minutes to appear due to caching.

Security and Validation: The hashtag system implements security at input validation. All hashtags (standardized and freeform) undergo processing before storage: must start with `#`, HTML tags stripped, Unicode normalized (preventing homograph attacks where visually similar characters create different hashtags), control characters removed, length limited to 100 characters, and restricted to letters, numbers, and underscores after the leading `#` (no spaces or punctuation). This happens regardless of whether the tag is standardized or freeform.

Photos (Hosted Content): Members upload photos (JPEG and PNG only; GIF not supported) with security processing in a way the eliminates the need for anti-virus scans as part of the system's tech stack. Each photo is re-encoded at 85% quality, stripped of all EXIF/ICC metadata, and generates two variants: a thumbnail bounded at 600 pixels on its longest edge, which keeps the photo's own shape, and an 800px-width display image (or smaller if the original image is narrower than 800px). Processing occurs synchronously.

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
- **One-time club-join grant:** A single Active Player period granted when a Tier 0 member who has never previously been Active Player joins their first existing IFPA club. Not regranted on subsequent joins. Creating a club is not a qualifying join and grants no Active Player period.
- **No-shorten rule:** An older qualifying event, club-join grant, or vouch must not shorten an existing later Active Player expiry date.
- **Tier 1 benefits:** Shorthand for "Tier 1, Tier 2, or Tier 3 member, or Tier 0 member with current Active Player status." Used in Access lines below where the gate is the Tier 1 capability set rather than strict Tier 1, Tier 2, or Tier 3 membership.
- **Official IFPA Roster:** Tier 1 members, Tier 2 members, Tier 3 members, and Tier 0 members with current Active Player status. Excludes Tier 0 members without current Active Player status. Not public, and served on screen only. Tier 2 or Tier 3 members and administrators may view it for official IFPA event and organizer purposes.
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
- The top-level sport sections are public pages readable without logging in, rendering identically for every viewer: the Net section (`/net`, `/net/events`, `/net/teams`, `/net/teams/:teamId`), the Sideline landing page (`/sideline`), the cross-sport Records page (`/records`), the Hall of Fame landing page (`/hof`), and the Big Add Posse landing page (`/bap`). Their content is pipeline-authoritative and read-only on the running site.
- The Net section presents footbag net: the `/net` home page carries the introduction, competition formats, a demonstration video, and notable-team and notable-player highlights; `/net/teams` lists teams with discipline and player-search filters, linking each team to `/net/teams/:teamId` (players, summary statistics, competition history by year); `/net/events` lists net events. Only canonical competition evidence reaches these public statistics, and a player name links to the member's profile when the person has a claimed account, otherwise to their historical-person page.
- `/sideline` is an editorial landing page presenting the sideline games (circle kicking, 2-square, 4-square, consecutive kicks, footbag golf) with demonstration clips and internal links to the matching rules pages and to `/records`; the page renders zero offsite links.
- `/records` presents the official cross-sport records: consecutive-kicks current world records, highest official scores, record progression, and milestone firsts, plus the freestyle passback records. A passback record's trick name links to the canonical trick page only when the recorded name resolves to a canonical trick directly or through an alias; an unresolvable name renders as plain text, never a broken link. Record holders link per the standard person-link rule.
- `/hof` and `/bap` are editorial landing pages telling each honor's history and linking to its authoritative external home; in-site inductee rosters and per-person honor pages are out of scope by design, and honor badges on member and historical-person surfaces are governed by the Hall of Fame and Big Add Posse global behavior.
- The freestyle encyclopedia is a separate regime: its visitor surfaces are specified by the Freestyle Encyclopedia stories, and its content is curated in-app after cutover rather than served as read-only pipeline content.

### V_Browse_Clubs

Access: Any visitor can browse the public clubs directory. Only authenticated members can see club member rosters and contact details.

Story: As a visitor, I want to browse the clubs directory by country, then by state or province, so that I can discover local clubs (but I cannot see the list of club members).

Success Criteria:

- The system provides a clubs landing view with geographic drill-down navigation from country to a country page, which groups clubs by state or province wherever those are recorded, with club names, city labels, and member counts. City is a label on the club row, not a navigation level.
- Only members can view club member rosters and contact details.

### V_Browse_Upcoming_Events

Access: Any visitor can browse upcoming events and open public event detail pages for publicly visible event statuses. Only authenticated members can register or see member-only organizer contact details. 

Story: As a visitor, I want to browse upcoming events and open their public detail pages so that I can plan participation. 

Success Criteria: 

- Main events landing page shows upcoming public events sorted by start date.
- Each upcoming event card shows the fields needed for public browsing: title, date range, location, host club, description when present, and registration status.
- Each publicly visible upcoming event links to the canonical public event page at `GET /events/:eventKey`.
- Public canonical event pages are available only for events with status `reg_open`, `closed`, or `completed`.
- Events with status `draft`, `pending_approval`, or `canceled` do not have public detail visibility.
- Organizer contact details, registration actions, payment actions, and member-only state are excluded from this public slice.
- The public event page shows how many competitors are registered in each discipline, as counts only. Registrant names are member-visible rather than public, and appear to authenticated members per `M_View_Event`.

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
- Public canonical event pages are available only for events with status `reg_open`, `closed`, or `completed`.
- Events with status `draft`, `pending_approval`, or `canceled` do not have public detail visibility.
- Legacy archive content at `archive.footbag.org` is a separate repository and the historical event and results data hosted there must not be conflated with the public event browsing pages described here. Everything on `archive.footbag.org` is irrelevant to the canonical event/results route contract.

### V_View_News_Feed

<< V2 SCOPE >> The news feed is version-two scope. This story is design intent for that build and
is not part of the v1 launch. The v1 flows whose success criteria name a news item as a side effect
are built without a news dependency and begin emitting news items when the feed lands.

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
- Empty state displays "No photos or videos found." with suggestions of 5 popular tags platform-wide (a teachable moment). It never says the site holds nothing, and it does not restate the criteria: the set header above already names the set and shows a zero count.
- Media galleries are pubic, but only logged-in members will see details about the personal information of the member who uploaded the media (uploaded_by).
- The public hub at `/media` presents a fixed set of collection cards: Browse by hashtag first, the Member galleries card second, then the curated collection cards (Freestyle, Net, Sideline, Related Sports). The Member galleries card follows the same has-content rule as the other collection cards: it appears once at least one member-owned named gallery exists, linking to the member-galleries list page, and is not shown before then. FH-owned named galleries are reached through the curated collection cards.
- The member-galleries list page at `/media/member-galleries` lists every member-owned named gallery in chronological order by creation date (oldest first); each entry shows the gallery name, description, item count, and owner attribution linking to the owner's profile. Auto-materialized per-member default galleries (Personal Gallery) are excluded from this list; they remain reachable at their `/media/{gallery_id}` URL for direct sharing.
- Named-gallery URL bookmarks live at `/media/{gallery_id}` (e.g., `/media/gallery_curated_freestyle_tricks`, `/media/gallery_tricks_of_the_trade`). The `gallery_id` is the slug; the `member_galleries` row anchors a stable URL plus human-readable name, description, owner, and item-ordering preference (`sort_order`). Content membership is computed at request time by tag-AND match against the gallery's `member_gallery_tags` set, minus any item carrying a tag in the gallery's `member_gallery_exclude_tags` set; an item appears iff it carries every criteria tag AND no exclude tag.
- Item ordering on a named-gallery page is governed by `member_galleries.sort_order` (`upload_desc` default, `upload_asc`, `caption_asc`). Use `caption_asc` for ordered series whose captions encode the position with a zero-padded prefix (e.g. "01 - <title>").
- Members can manage their own named galleries at `/members/{memberKey}/galleries`, including create, edit, and delete. Member-owned galleries are public, reached from the `/media` Member galleries card and its list page, but are stored in the database only (no `/curated/` JSON sidecar); the named-gallery hero links the owner display name to the member's profile.
- Bookmark slug convention: `gallery_{descriptive_snake_case}`. The slug pattern keeps `/media/gallery_*` URLs distinguishable from S3-keyed media paths under `/media/{member-id}/...`, which matters at the CDN cache-behavior layer.
- All content surfaces in a named gallery purely via tag-AND match against the gallery's criteria-tag set, minus the exclude set; both curator URL-reference content and member-uploaded content use the same mechanism. One media item can appear in many galleries when its tags satisfy each gallery's filter.
- Dynamic tag galleries carry an editable, context-aware filter. The active tags (a named gallery's topic criteria plus any refinement) prefill two chip-input fields, one to include and one to exclude, each rendering its tags as removable chips and offering type-ahead autocomplete; the visitor refines or broadens the initial set by adding or removing chips and applies every change at once with an "Apply hashtag filters" control, so nothing changes until applied. Context-aware suggested tags (co-occurring in the current results, with counts) are offered as quick-add chips. `#curated` is an ordinary include/exclude tag (include it for the curator-published subset, exclude it for community). The only locked tag is the owner-scoping `#by_*` (it cannot be lifted by editing); every other tag, including a club/event/trick context arrived at via `?context=`, is editable. Applying submits to `/media/browse`, so refining or broadening a named gallery continues on the dynamic surface. The bar appears whenever there is an active tag, a suggestion, or a set large enough to be worth filtering. Every filter state is a shareable `?tag=`/`?exclude=`/`?context=` URL and works without JavaScript. A saved named gallery (`member_galleries` row) is never mutated by a visitor's refinement, which is transient and lives only in the URL.
- A named gallery's filter applies on the paginated `/media/browse` surface: the gallery's topic criteria carry as `?tag=` (editable), its owner `#by_*` scoping as locked `?context=`, and its excludes as `?exclude=`, so the full matching set stays reachable past the named-gallery render cap by applying or editing the filter. The saved gallery row is not mutated.

### V_View_Trick_Reference_Videos

Access: Any visitor can view freestyle trick reference videos. No authentication required.

Story: As a visitor browsing a freestyle trick page, I see a gallery of reference videos for that trick, both curator-published and member-uploaded, with an editable tag filter (shown only when the set is large enough to be worth filtering) so that I can narrow to what I want, for example curator clips only, and watch demonstrations, tutorials, and competition record clips relevant to the trick.

Success Criteria:

- The trick detail page at `/freestyle/tricks/{slug}` renders a "Media" section that links to the trick's reference-video gallery (the dynamic tag-set gallery for its bare-slug tag), covering both curator-published assets (carrying `#curated`, `#freestyle`, `#trick`) and member-uploaded clips. Videos are watched and filtered in the gallery, not embedded on the trick page.
- When the trick has no tagged videos at all, the Media section is omitted (no gallery link).
- The page browser-tab title follows the convention `Footbag Trick #{slug}` (e.g. `Footbag Trick #ripwalk`), parallel to the event-page title convention.
- The trick's Media section links to its full video gallery at `/media/browse?context=<slug>`, with the trick slug as a locked context tag; member-uploaded videos tagged with the trick appear there by default alongside curator-published clips, and all narrowing happens in that gallery.
- Navigation from a trick hashtag and from the Detail link are distinct and unambiguous. On a trick page, a trick's media hashtag (`#ripwalk`, the same token as the slug `ripwalk` and the `/freestyle/tricks/ripwalk` segment, differing only by the leading `#`) opens that trick's media gallery at `/media/browse?context=<slug>` when the trick has media, and renders as a plain non-clickable token otherwise; it does not open the trick detail page. The plain-English trick name is display text only; the trick detail page at `/freestyle/tricks/{slug}` is reached from a separate "Detail" link shown beside the name, and a "Media" link beside it opens the same gallery as the hashtag, appearing only when the trick has media. The gallery path and the detail path never have to be guessed from one control, and media presence is signalled twice rather than once.
- Freestyle concepts that are not tricks carry their hashtag by role, not by the bare slug: a set is `#set_{slug}` (e.g. `#set_pixie`), an operator or modifier is `#operator_{slug}` (e.g. `#operator_spinning`), and a trick family is `#family_{slug}`. The bare `#{slug}` is reserved for a trick's media, so a set or operator never shows a bare trick hashtag. Pixie and fairy are both a trick and a set, so each shows the bare trick hashtag on its trick surface and the `#set_` hashtag on set surfaces. Because a modifier or operator is not a trick, `/freestyle/tricks/{slug}` redirects it to its modifier detail page at `/freestyle/modifier/{slug}`, and trick search lists tricks and sets, not operators.
- On the trick dictionary at `/freestyle/tricks`, the family filter and the by-family, by-ADD, by-movement-system, movement-neighborhoods, by-dex, and by-modifier views open the filtered dictionary, and the search box opens search results. Each hashtag, filter, Detail control, and Media control is a real link the visitor can follow directly or deep-link to.

### V_Browse_Hashtags

Access: Any visitor can browse standardized and freeform hashtags on the public browse landing at /media/browse and see public content tagged with them. The landing always highlights popular hashtags, and highlights recent events and tutorials whenever any of them carry media.

Story: As a visitor, I can browse all freeform and standard hashtags so that I discover content vocabulary without searching.

Success Criteria:

- Popular Tags section displays up to 30 public tags, community-popular tags first and curator-published tags filling the remaining slots. Every chip is a tag that content already carries, so each one leads to media; while no public tag exists the section says so in place of the list.
- Recent events and tutorial will be given special treatment to facilitate discovery.
- This feature lists public tags. A tag is public when at least two distinct members have used it (a community tag) or it appears on curator-published content (the curated catalog is public even though one system account owns it). A tag used by a single ordinary member is a personal tag, private to that member's gallery, and stays out of the public hashtag index. A background job recomputes tag usage statistics, recording both total usage and the distinct-member count per tag. The Popular Tags section composes up to 30 chips in two tiers: community-popular tags first, then curator-published tags. Both tiers are drawn from recorded usage, so a tag reaches the section only once content carries it.

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

- Shows a friendly error message that invites the visitor to try again shortly, and offers one control: a link to the home page. Where the refusal is an authentication one, a missing or expired session, that control is the sign-in page instead.
- The status code shown on the page is the status the response carries.
- Does not reveal stack traces or sensitive internals.

### V_Register_Account

Access: Visitors who are not logged in can create an account. A successful registration creates a new member (Tier 0, free lifetime).

Story: As a visitor, I can register with email, password, real full name, and display name so that I can become a member. Registration also serves as the data-cleanup funnel for legacy identity linking and club questions.

Success Criteria:

- New member registration with email verification.
- **Name model:** Registration collects two name fields:
  - **Family name** (`family_name`): required. It is the anchor every claim path matches on, so it is the part that must always be there. A member whose legal name is a single word, which is ordinary in much of the world, records that one name here; requiring both parts is what would refuse those members.
  - **Given name(s)** (`given_names`): optional. No digits in either field, and no restriction on script, accents, apostrophes, hyphens or internal spaces. The two are stored as given and assembled into `real_name` with the given names first. The fields are labelled given and family rather than first and last, which encode an ordering that is wrong for the many members who write their family name first.
  - **Display name** (`display_name`): optional. Defaults to `real_name` if left blank. Must end with the member's recorded family name, after suffix stripping (Jr, Sr, II, III, IV, PhD, MD), so a member whose family name is several words is held to the whole of it. Display name is permanent and cannot be changed after registration; the registration form must make this clear.
  - **Slug selection:** The member's URL slug is generated from display name by default but the member can customize it during registration. The slug must contain the final word of the recorded family name, because a profile URL carries no spaces and a family name of several words could never be contained in one. Two members may share the same display name; slug uniqueness is enforced. Slug is permanent after registration.
- This registration MUST use the human’s real and full name, spelled out, with no initials or abbreviations. Bogus registrations that do not follow this rule, upon discovery, will be deleted.
- Location is not collected at registration. City, region, and country are collected in the onboarding wizard's personal-details task, which every registrant must complete to become a member. The rules apply there: city and country are required, region is required for the USA and Canada and optional elsewhere, and a required region must be the official two-letter code (eg: CO, CA, NY), validated server-side. A country the member chooses or changes must be one the picker offers, and is stored as that single canonical name, so one country cannot reach the Official IFPA Roster under several spellings; an alias or ISO code is folded to the canonical name rather than refused. A country already on file from a legacy import is left alone until the member changes it, so a migrated profile is never blocked over a value its owner never chose.
- System sends verification email.
- After clicking link, user can log in and create profile.
- Email must be unique across all members including accounts in their deletion grace period (reuse only after the grace period completes and PII is cleared).
- Registration enforces email uniqueness without disclosing account existence. The form responds identically whether or not the submitted email already belongs to an account (active or in its deletion grace period): the same generic "check your email" confirmation, with no inline indication that the address is already registered, so registration cannot be used to probe which emails have accounts. When the address already has an account, the platform emails that address an "account already exists" notice with links to log in or reset the password (never a new verification link), so the legitimate owner is helped through a channel only they control. Rate limiting and the server-side CAPTCHA apply regardless of match.
- Registration submissions are gated by a Cloudflare Turnstile CAPTCHA verified server-side before any DB read.
- Display names are constrained to prevent homograph and impersonation attacks, within a reasonable length limit. Each display name is NFC-normalized, must carry no invisible or control characters, and must draw its letters from a single writing system, so a name that mixes Latin and Cyrillic letters is rejected.
- Registration refuses a real name, display name, or member-chosen profile URL that claims platform or role authority. Words are compared whole, case-insensitively, with accents and digit-for-letter substitutions folded away, so a name whose own word is a reserved role or platform word is rejected, while a longer name that merely contains one, such as the surname Stafford, is accepted. The rejection names the failed check without listing the reserved words.
- New members automatically assigned Tier 0 (free lifetime) status.
- **Legacy-link check:** After account creation, the system checks whether the registrant’s verified email matches an imported `legacy_members` row’s `legacy_email` or a historical person’s legacy email. If a match is found, the member is prompted inline to confirm the link ("We found a history record, is this you?"). For high-confidence matches (exact name match) and medium-confidence matches (known variant name match), the prompt defaults to yes (pre-checked). For low-confidence matches (email match but name mismatch), the prompt defaults to no (member must actively opt in). The member’s decision is audit-logged. No admin involvement at registration time; the member is the authority on their own identity.
- **Post-verify onboarding:** After email verification, the member is routed to `M_Complete_Onboarding_Wizard` with applicable outstanding tasks. The wizard owns the club affiliation flow (Stages 1A, 1B, and the wrap-up landing). `gender`, `first_competition_year`, and `show_competitive_results` are collected as fields within the `personal_details` task. A member becomes a full member by completing all three tasks: `personal_details` (its required fields saved), the `legacy_claim` decision, and the `club_affiliations` answer; an account is pending until all three are answered, and a pending registrant holds a session but no member authorization: every member, club, and admin capability routes them to their next outstanding task, and they reach only public browse as an anonymous visitor sees it, the wizard and its claim affordances, and logout. A pending account has no profile page for any viewer and does not appear in member search. Completing the club task never requires joining a club: the explicit no-club answer completes it. Signing in resumes the wizard: the pending registrant is routed to their next outstanding task from wherever they land.
- Member sees a clear success message after registration: "Registration successful! Please check your email to verify your account."
- Member sees clear error messages for validation failures with hints about what to fix.
- Passwords are stored securely using one-way hashing; they are never stored or logged in plaintext.
- Password Requirements: Minimum 8 characters, maximum 128 characters, no complexity requirements to allow passphrases.
- Password Validation: Client-side validation provides immediate feedback, server-side validation provides authoritative enforcement.
- If registration validation detects rule violations at registration time (invalid format, prohibited characters, not using a full name), the system rejects registration immediately with clear error message. Admin deletion authority is for cases where invalid registrations pass initial validation and are discovered later through manual review or reports.

## 2.2 Freestyle Encyclopedia

The freestyle encyclopedia is the public, read-only projection of the curated freestyle corpus: the trick dictionary, its reference and learning layers, sets, families, records, emerging vocabulary, and media. Every surface is public with no authentication; depth is controlled by page structure (views, disclosure, deep links), never by login or role. Content curation happens through the admin stories (A_Browse_Freestyle_Content, A_Edit_Freestyle_Trick, and their siblings). Hashtag and media-link semantics shared across the site are defined in V_View_Trick_Reference_Videos and are not restated per story.

### V_Browse_Trick_Dictionary

Access: Any visitor can browse the trick dictionary without logging in.

Story: As a visitor, I can browse the canonical trick dictionary through multiple structural views so that I can explore the vocabulary along the axis that suits me: difficulty, family, set, movement, or components.

Success Criteria:

- The dictionary index at `/freestyle/tricks` lists every active canonical trick. Every browse view renders the same shared trick row, so a trick reads identically whichever axis the visitor arrived by. The row carries what a visitor needs to recognise a trick and act on it: its plain-English name, its difficulty value, its hashtag, a Detail control, and a Media control. Movement notation sits beside that identity as reference material and never displaces it. Statements about our own authoring progress, such as notation not yet written or a decomposition under review, do not appear on a browse row.
- Browse views are selected with a `?view=` query parameter, so every view is a shareable deep link that works without JavaScript. Supported views: by ADD (the default), family, set, category, modifier, component, topology, movement system, and dex count. An unrecognized view value renders the default view rather than erroring.
- `/freestyle/families` redirects to the dictionary's family view.
- Canonical browse excludes tracked external vocabulary that has not been adjudicated into the canon (see V_View_Emerging_Vocabulary). A canonical trick whose authoring is incomplete stays visible with an incomplete marker rather than being hidden.
- Each view groups tricks by data derived from the canonical corpus itself (stored notation, family, modifier links); views are projections of one corpus, never separately maintained lists.

### V_View_Trick_Detail

Access: Any visitor can view any trick detail page without logging in.

Story: As a visitor, I can open a trick's detail page so that I understand its identity, structure, difficulty derivation, lineage, records, community tips, and media in one place.

Success Criteria:

- One canonical URL per trick: `/freestyle/tricks/{slug}` renders at the trick's canonical slug, and the page is titled by the trick's canonical name.
- An alias slug (historical name, abbreviation, or folk spelling) permanently redirects (301) to the canonical trick URL. Internal links always use canonical slugs, so the redirect is a safety net for external links.
- An operator or modifier slug permanently redirects to its modifier detail page at `/freestyle/modifier/{slug}`; a slug for a set that migrated out of the trick corpus permanently redirects to its set detail page; an unknown slug returns 404.
- The page opens by orienting the reader: what the trick is, in plain words a beginner can read, before any notation or taxonomy. It then presents the trick's identity (canonical name, hashtag, ADD), its notation, its ADD derivation (the scoring-component breakdown), and its structural facts (family, base, movement system, neighborhood). That structural material is always present and never gated; its placement is below the plain-words opening, not above it.
- Known aliases in community use are listed on the page. Search resolves every alias; display surfaces the helpful ones.
- Relationship blocks have strict ownership: same-family progression, conceptual related tricks, and structural neighbors are distinct sections that do not duplicate one another, and each entry links to a canonical trick page that renders (never an alias URL, never a dead link).
- Freestyle world records set on the trick render on the page.
- Published community tips render in a clearly labeled collapsible section, visually distinct from canonical content; unpublished or rejected tips never appear (moderation per A_Moderate_Freestyle_Trick_Tip).
- The Media section and the browser-tab title follow V_View_Trick_Reference_Videos.

### V_Search_Tricks

Access: Any visitor can search without logging in.

Story: As a visitor, I can search tricks and family pages by name so that I reach the right page without knowing the exact canonical spelling.

Success Criteria:

- `/freestyle/search` is a server-rendered search page that works without JavaScript; `/freestyle/search/suggest` is the JSON endpoint backing the typeahead.
- The page intro reads "Find a trick or family page by name."
- Matching covers canonical names, slugs (a spaced query matches an underscore slug), and alias text. An alias hit resolves to the canonical trick and surfaces the matched alias alongside the result.
- Inactive tricks never appear in results or suggestions.
- Family-page results render in their own band with a Family label, and only for family pages that actually render, so a search result never links to a page that would 404. The suggest endpoint prepends family items with a type label while trick items keep their own shape.
- A query shorter than 2 characters yields a min-length notice; an over-long query yields no results; the page renders usably with no query at all.
- The no-results state reads "No tricks or family pages found matching" the query.

### V_View_Trick_Records

Access: Any visitor can view freestyle records and leaders without logging in.

Story: As a visitor, I can view freestyle world records and their leaders so that I see the sport's documented achievements and who holds them.

Success Criteria:

- `/freestyle/records` lists the curated freestyle world records; `/freestyle/leaders` aggregates record counts by player.
- A record links to a canonical trick detail page when its recorded trick name resolves to a canonical trick, directly or through an alias; a legacy name that resolves to nothing renders as plain text, never a broken link.
- Where a record's recorded difficulty differs from the trick's canonical ADD, both are presented honestly as distinct facts; neither silently overwrites the other.
- Provenance and verification status are stated plainly. Unknown data stays unknown: no fabricated dates, names, or values, and placeholder source dates are never displayed as real dates.

### V_View_Freestyle_Reference

Access: Any visitor can read the reference layer without logging in.

Story: As a visitor, I can read the freestyle reference layer (the A–Z glossary, Freestyle Concepts, operators, notation article, scoring and combo analysis, corpus insights) so that I can learn the movement language and how difficulty is derived.

Success Criteria:

- `/freestyle/glossary` is the alphabetical A–Z term lookup: one entry per freestyle term with a concise plain-English definition and, where deeper material exists, a link to it. Entries are ordered alphabetically and deterministically; the page coins no doctrine of its own.
- `/freestyle/concepts` (Freestyle Concepts) is the chapter-based conceptual reference: it defines the movement vocabulary (surfaces, dexterities, sets, operators, families, notation, composition) as pedagogy layered over the canonical data: it explains canonical facts and links to them, and never contradicts or redefines them.
- "Reading the Dictionary" (the trick-row contract, the browse views, and the kinds of object the platform keeps separate) lives on `/freestyle/tricks` as a collapsed disclosure above the browse controls, not on the Concepts page.
- Deep links into Freestyle Concepts (term and section anchors) land on content the reader can see; a link into a collapsed region opens it.
- `/freestyle/operators` presents the operator and modifier reference derived from the canonical operator registry, the single authority for operator difficulty contribution and structure.
- `/freestyle/modifier/{slug}` renders a modifier's detail page: a visitor can open it to read its definition, scoring and structural role, related examples, and any clearly labeled stub state when fuller teaching content is not yet available.
- `/freestyle/notation-article` reproduces Ben Job's notation article verbatim with its source attribution.
- `/freestyle/add-analysis` walks worked examples of difficulty scoring against the live dictionary. Every trick reference links to an active canonical page, resolves through an alias to the canonical page when the referenced name is superseded, or renders as plain text; it never links to a page that would 404.
- `/freestyle/combo-analysis` presents run-level (sequence) analysis; `/freestyle/insights` presents corpus statistics computed from the live dictionary, so counts reflect the loaded data rather than hand-maintained numbers.

### V_View_Set_Encyclopedia

Access: Any visitor can browse the set encyclopedia without logging in.

Story: As a visitor, I can browse the set encyclopedia so that I understand the sets that begin tricks, as first-class pages distinct from tricks and operators.

Success Criteria:

- `/freestyle/sets` is the set encyclopedia index; `/freestyle/sets/{slug}` renders a set's detail page; a legacy set alias slug permanently redirects to the canonical set URL; an unknown slug returns 404.
- `/freestyle/sets/reference` renders the flat set reference table with its source credited.
- `/freestyle/compositional-sets` is a sibling hub grouping sets compositionally (family groups and progression ladders); it complements the encyclopedia index and does not replace it.
- Set surfaces carry `#set_{slug}` hashtags per V_View_Trick_Reference_Videos. A name that is both a trick and a set (pixie, fairy) has both pages, each carrying its role's hashtag.
- Classification follows compositional role: a set launches a trick, an operator modifies one. A set page never presents its subject as a trick.

### V_Learn_Freestyle

Access: Any visitor can use the learning and orientation surfaces without logging in.

Story: As a visitor new to freestyle, I can start from the freestyle landing page and follow the learning and orientation surfaces so that I find my way into the discipline before I can read notation.

Success Criteria:

- `/freestyle` is the landing page: it previews and links into the encyclopedia's surfaces (dictionary, search, records, learning, media, reference) without embedding any of them wholesale.
- `/freestyle/start` is the novice entry page targeted by the landing page's "Start here" call to action; `/freestyle/learn` presents the broader index of learning pathways and observational educational surfaces; `/freestyle/progression/walking-family` presents a worked progression through one family.
- `/freestyle/families/{slug}` renders a family detail page for each official family. A lineage below the family-page threshold has no page (404), and no other surface links to it.
- Family pages own same-family progression: ladders and next-step guidance within a family live on the family page, and trick pages link into them rather than duplicating them.
- `/freestyle/about`, `/freestyle/history`, `/freestyle/competition`, and `/freestyle/partnerships` present editorial orientation content.

### V_View_Emerging_Vocabulary

Access: Any visitor can view the emerging-vocabulary page without logging in.

Story: As a visitor, I can view tracked emerging vocabulary so that I see what the community is naming, clearly separated from the canonical dictionary.

Success Criteria:

- `/freestyle/observational` lists externally observed, not-yet-canonical vocabulary.
- The page frames tracking honestly: tracked entries are observations, not official tricks, and tracking is not canonization.
- Emerging entries are excluded from canonical browse views and from search.
- Each entry presents its distance to the canonical vocabulary: whether it matches, extends, or stands apart from existing canonical structure, and what would be needed for curation.
- The dictionary's `?view=emerging` parameter redirects here, so the vocabulary is reachable but never mixed into canonical browse.

### V_View_Freestyle_Media_Hub

Access: Any visitor can browse the freestyle media hub without logging in.

Story: As a visitor, I can browse the freestyle media hub so that I find the curated freestyle video collections in one organized place.

Success Criteria:

- `/freestyle/media` presents the curated freestyle collections as a structured set of sections and folders, each folder linking to its named gallery.
- A planned folder whose gallery does not exist yet stays visible as an unavailable entry, so the published structure does not silently shrink.
- `/media/freestyle-tutorials` permanently redirects to `/freestyle/media` (the former tutorials index folded into the hub).
- Per-trick media semantics (bare-slug hashtag galleries, the Media section on trick pages) are owned by V_View_Trick_Reference_Videos; this hub is the collection-level entrance.

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
- Opening the verify link marks the member's email as verified, issues the authenticated session (HttpOnly, Secure, SameSite=Lax cookie), and takes the member to the onboarding wizard's first outstanding task. A newly verified account is pending, not yet a member: it has no profile page and no dashboard to land on, so the wizard is the single post-verification destination, and the member reaches their profile once all three tasks are answered. Any legacy-record match the platform found for their email surfaces inside the wizard's claim task rather than as a separate destination.
- Consuming a valid verify link appends an `audit_entries` row, whether or not it is the click that flips the account to verified: the row records that a session was issued off a verify link, and a repeat click is flagged so it does not read as a second activation. The account-lifecycle transition is auditable like registration and password events.
- Consuming the link a second time is rejected with a generic "invalid, expired, or already used" response. Unknown or expired tokens render the same response (enumeration-safe).
- Unverified members cannot log in. The login failure response is identical to the wrong-password response (enumeration-safe).
- Unverified members do not appear in the authenticated member search.
- Members can request a new verification email by submitting their email address to a resend form. The response is identical regardless of whether an unverified member exists for that address. Resends are rate-limited per normalized email address (safe default).
- Resend submissions are gated by a Cloudflare Turnstile CAPTCHA verified server-side before any DB read; identical UX whether an unverified member exists for the address or not.
- If an email is submitted to the registration form and an account already exists for that address, the web response is identical to a successful new registration and gives no indication that the address is already registered. No verification email is sent; instead an "account already exists" notice is emailed to that address with links to log in or reset the password, so the real owner is assisted without the web response revealing account existence.
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
- Logging out happens on a POST and there is no GET route that reaches it, so a link on another site cannot log a member out. A page that submitted such a form for the visitor would be the same defect wearing a disguise, because the submission would carry this site's own origin.
- After logout, any attempt to access member-only pages redirects to login page.
- Member sees a clear confirmation message that they are logged out.

### M_Delete_Account

Access: Members can request to delete their own account. Notable exception: HoF and BAP members will always be preserved on the site to preserve history. These members will be allowed to delete their accounts for personal and data privacy reasons, but special rules will apply to their names and brief bios.

Story: As a member, I can delete my account so that I can leave the platform.

Success Criteria:

- Member can request account deletion from their profile page.
- System explains the deletion consequences and the grace period before permanent deletion (account enters a grace-period deletion state; Administrator-configurable grace period length).
- After confirmation, the account enters a deleted state; member cannot log in or use the site, except to restore the account within the grace period.
- After deletion, member no longer appears in member search results or active member lists. The member row is retained so historical records (past event results, archives, and logs) keep their references intact. The retained row carries the placeholder name “Deleted Member”, which serves referential integrity alone.
- **Person-link reversion:** When a member deletes their account, any historical person links (in event results and other historical surfaces) that were pointing to `/members/:slug` must revert to `/history/:personId`. The `personHref()` helper handles this automatically when `member_id` is cleared or the member row is soft-deleted.
- **Declared-anchor purge:** PII purge clears the member's declared former surnames and declared old emails (see M_Edit_Profile) alongside `members.historical_person_id` and `members.legacy_member_id`. Declared anchors are member-asserted personal data; they do not persist past the member's account.
- **Outbound mail:** the messages the platform sent or queued to the member are erased alongside the rest of their personal data. The recipient address and the message body are cleared and the subject is replaced with a placeholder, while the row itself is kept so the send record stays complete.
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

This story is the umbrella for the member's claim experience. Sub-mechanisms (auto-link card confirmation, declared-anchor entry, the mailbox-control round-trip that proves a declared old email, direct historical-record claim, cross-source candidate prompt, registration-time conflict prompt) compose into one act from the registrant's perspective. The wizard's `legacy_claim` task is the sole mechanism for linking a legacy account (see M_Complete_Onboarding_Wizard); other pages, such as the member's profile and the historical-record pages, route the member into that task and never provide a separate claim path.

Identity-reconciliation cases covered:

- Case A: Fresh player. No pre-existing record; this story is a no-op.
- Case B: Old website account only. Linking the modern account to a `legacy_members` row applies the blanket annual-to-lifetime tier mapping.
- Case C: Competition record only. Linking the modern account to a `historical_persons` row via the direct-claim affordance.
- Case D: Both, pipeline did not link them. Member claims each separately, or the platform offers the second source after the first is confirmed.
- Case E: Both, pipeline linked them. Claiming either transitively claims the other in one transaction.

Match confidence bands:

- A match's confidence band decides one thing: how far the platform goes on its own before it asks the member. `high` and `medium` both stage a candidate the member confirms or declines on a card, and differ in how the card describes the match to them; `low` reaches an administrator as a work-queue item to resolve by hand; `none` covers a member the classifier finds no email anchor for, and stages nothing.
- The facts that move a member between bands are the ones the classifier reads: the legacy account an anchor email matches, the historical person that account provenances to, the name candidates that person's real name returns, and the date of birth that corroborates a name-variant match.
- Evidence strength is the separate axis and carries the proof. Which anchor the match came through sets the evidence-strength tag recorded on the confirmed claim, per the audit rules below, and that tag is what a later dispute is judged on. The anchor never raises or lowers the band itself: how much automation is safe for a match and how much proof the resulting claim rests on are different questions, and answering one with the other would leave a claim's defensibility inferred from a staging decision rather than recorded from what the member actually proved.

Card-at-login confirmation:

- The wizard's universal claim task surfaces any candidates the platform staged for this member (via batch auto-link at cutover) or matched at sign-in. Each candidate appears as a card showing the legacy display name, country, year of first competition (if available), and the evidence anchor(s) the platform used to find it. The card never echoes the matched email or other anchor inputs.
- The member can Confirm or Decline each card. The wizard presents every outstanding card together, so a member who is unsure about one resolves the others and comes back to it.
- Confirmation applies effects atomically: writes `members.legacy_member_id` and / or `members.historical_person_id`; marks the legacy row claimed (`claimed_by_member_id` + `claimed_at`); merges allowed profile fields, filling only where the member's own value is empty and taking the curated historical record ahead of the legacy dump wherever both carry a value; applies `first_competition_year` via COALESCE; writes a single tier grant per the tier-grant mapping in this story; preserves the `legacy_members` row as the permanent archival record. The audit row records the evidence-strength tag. Club affiliations and leadership are confirmed in the wizard's own club task, which asks the member about each candidate club, so those writes belong to that task's transactions.
- Confirmation is race-safe: when two members confirm the same legacy account or the same historical person concurrently, exactly one claim lands; the other member sees the same "already claimed by another member" response the synchronous already-claimed check renders, and no partial effects (tier grant included) persist.
- Decline discards the candidate; nothing applies. The audit row records the declined candidate. The candidate may resurface later if newly-declared anchors produce it again, but the platform tracks declines to avoid re-prompting for the same candidate without new signal.
- The legacy_claim task must be completed before onboarding can finish, so no legacy-claim card lingers once onboarding is complete. It completes in one of three ways: claiming a record, stating that they never held an old-site account, or stating that they held one but cannot find it. The last two are separate answers because they are different facts, and a registrant who did have an account must never be made to assert that they did not in order to finish signing up, nor pushed into claiming a record that is not clearly theirs. Both non-claiming answers resolve every card still open for them as declined in the same transaction that completes the task. Choosing the cannot-find-it answer also opens a last attempt at the match, offering the date of birth on file for correction and taking a former surname and an old email address, then searching again; that attempt never gates completion, which has already happened.
- Staged candidates expire after an administrator-configurable window (default 365 days, keyed by `auto_link_staged_expiry_days`). Expiry resolves the card without member action; if the anchors still match when staging next runs, the candidate is staged again. Re-running the staging pass never duplicates an open candidate for the same member/target pair, and a declined candidate is not re-staged without new signal.

Tier grant on claim:

- A confirmed claim writes one `member_tier_grants` row (`reason_code = 'legacy.claim_tier_grant'`) for the standing the legacy account held at cutover, under the IFPA-approved blanket policy that maps each legacy standing to its 2026 equivalent (annual maps to lifetime). The bases are evaluated together in precedence order; the first match sets the tier:
  1. Hall of Fame or Big Add Posse → `tier2`.
  2. Held Tier 2 standing at cutover (lifetime or annual, expired or not) → `tier2`.
  3. Paid Tier 1 Lifetime → `tier1`.
  4. Tier 1 Annual active at cutover (attendance or vouch within 365 days) → `tier1`.
  5. Anything else, including expired Tier 1 Annual and no IFPA history → `tier0`.
- Board / Tier 3 governance status is not granted by a claim. A sitting director receives it from an administrator setting the IFPA Board flag, which sets Tier 3 and records the underlying tier for later reversion, per `A_Grant_HoF_BAP_Board_Status`. A director who claims a legacy account is granted on their honors and paid history like any other claimant, and that grant becomes the underlying tier the Board flag reverts to.
- A member is granted on whatever standings their legacy record carries; a record showing only honors is granted on that basis. This is one outcome of the single mapping, not a separate mode. Honors are validated against the public rosters before go-live, so an honor-driven grant never rests on a wrong flag.
- The grant is written once, inside the claim transaction; concurrent claims resolve to exactly one grant, with no partial tier grant persisting.

Declared-anchor entry:

- Within the wizard's claim task, which is the surface for declaring anchors and is reached during onboarding only, the registrant can declare optional anchors: one or more former surnames and one or more old email addresses. The member's date of birth, a matching anchor, is collected earlier in the required personal-details task, which precedes and gates this claim task; it is not collected here. Anchors are self-asserted; no proof required for the declaration itself. Anchors are always private (member-and-admin only) per M_Edit_Profile.
- When the member declares a new anchor, the platform re-runs candidate matching against the new value synchronously within the same wizard task; any resulting cards surface in-screen without requiring a sign-out or sign-in cycle. Declared anchors persist; subsequent matching also runs at sign-in for cases where the platform later receives new data (cross-source candidates appearing post-claim, mirror updates, etc.).
- The old-email entry field carries plain helper copy telling the member that matching the email they used on the old footbag.org helps confirm their legacy claim is really them. Saving or removing an anchor confirms the save and the re-check with a state-independent notice; neither the helper copy nor the notice ever states whether a given value matched.

Email-matching surface:

- A member's verified login email and each declared old email are matched against every email a legacy account carried (the primary plus up to two secondary addresses), so a member who reaches the platform under a secondary legacy address still matches.
- An email address held by more than one legacy account is a cross-account collision; collisions are detected and resolved during the legacy-data validation, before matching runs. An address still ambiguous after that surfaces no auto candidate, and the registrant falls back to another declared anchor, or finishes signing up and asks an administrator afterwards.

Mailbox-control proof for a declared old email:

- A declared old email can serve as claim evidence only after the member proves control of it. The platform sends a single-use, time-limited link (Administrator-configurable, default 24 hours, keyed by `account_claim_expiry_hours`) to the declared address, and the member must click it while logged into the same modern account. Clicking records the evidence tier `mailbox_control_via_link_click`; until then the declared old email stays `declared_anchor_only` and cannot on its own confirm a claim.
- The round-trip is mandatory for confirming on an old-email anchor: an old email the member has not proven control of is not sufficient on its own to confirm a claim. A registrant whose old mailbox is unreachable falls back to another sufficient anchor (their verified login email or a former surname), or finishes signing up and asks an administrator afterwards (see A_Review_Member_Link_Help_Requests).
- Tokens are single-use, time-limited, account-bound, and rate-limited per requesting account, per target legacy row, and per session/IP.

Direct historical-record claim:

- Entry point: the historical detail page (`GET /history/:personId`). When the historical record's name ends with the viewer's recorded family name OR with any declared former surname, the record is unclaimed, and the record is not flagged deceased (`historical_persons.is_deceased = 0`), the page surfaces a "Claim this identity" CTA.
- The confirmation page shows the record's country, honor status (HoF / BAP if any), and a first-name warning when the member's first name is a variant of the record's first name (per the `name_variants` table seeded from mirror-mined pairs).
- On confirm, the system writes `members.historical_person_id`, carries forward `historical_persons`-sourced fields (country, honor flags, induction year, first competition year) under fill-if-empty merge semantics, and (in case E) transitively claims the back-linked legacy account, applying the full legacy-account claim effects in the same transaction, including the tier grant.
- A confirmed honors-bearing direct claim carries the honor forward as part of the single tier mapping. The claim is gated by the identity-link matching rule (the claimant's current or declared former surname must match the record, with declared old emails and date of birth as additional private matching anchors where the record carries them), and the honor flag is validated a priori against the public rosters, so the grant rests on a matched claim and a correct flag. A wrong claim is reverted through the dispute path in `A_Review_Member_Link_Help_Requests`.
- A record flagged deceased (`historical_persons.is_deceased = 1`) is not self-claimable: the "Claim this identity" CTA is suppressed and the claim-confirm route (`/history/:personId/claim`) returns the standard non-claimable response, because a living member cannot claim a deceased person's identity as their own account. A member who believes a record was wrongly flagged uses the member-initiated admin help request (`A_Review_Member_Link_Help_Requests`).
- A historical record that is still linked to a deceased member is likewise not open for another member to claim: the deceased member keeps the historical-person link through the contact scrub (the record goes on honoring their contributions), so the record is treated as already held. The "Claim this identity" CTA is suppressed and the claim-confirm route returns the standard non-claimable response; a member who believes the record is genuinely theirs uses the member-initiated admin help request (`A_Review_Member_Link_Help_Requests`).
- A member whose legal name changed between their legacy identity and current account declares the former surname in the wizard's claim task; the claim path then resolves normally. A mismatch the platform cannot resolve through declared anchors routes to the member-initiated admin help request.
- A refusal names the two self-serve remedies, a former surname and an old email address used on the old site, rather than naming an administrator, and never points a registrant at a surface only members can reach.
- Opening a record records nothing: only an attempted confirmation is recorded, because a member reaches a record by following a link or by clicking a card the platform itself composed. An attempted confirmation that is refused carries the date-of-birth comparison on its audit row and is classified by it: a date that actively contradicts the claim is the only case recorded as evidence against the member, a date that matches reads as a name change, and where the record carries no date nothing is corroborated either way and the row says so.

Cross-source candidate prompt:

- Immediately after a successful claim of one source, the platform searches the other source for a plausible candidate (surname agreement using current or declared former surname as the required criterion; no other claimant; country is a corroborating signal, a country mismatch weighs against the candidate but never by itself blocks the match). If a candidate is found, the wizard surfaces an inline follow-up card within the same `legacy_claim` task: "we also found a record that might be you, is this you?" The member can confirm or decline. Declining does not block progression to the `club_affiliations` task, and no legacy-claim card persists on the dashboard after onboarding.

Registration-time conflict prompt:

- When the registrant actively navigates to a historical-record claim page (`/history/:personId/claim` or the wizard's claim task surface) and the platform detects that the registrant's surname (current or declared former) matches the surname on an already-claimed record, the wizard surfaces an inline "we already have a claim under this name, is one of these you?" prompt with details of the existing claim. The prompt is reactive (triggered by the registrant's navigation), not a proactive survey at signup. The real member arriving after an impersonator confirmed has an inline path to dispute through this affordance.

Anti-enumeration and rate limiting:

- User-visible messages never reveal whether a submitted identifier matched zero rows, multiple rows, an ineligible row, or an eligible row.
- Identifier lookups, declared-anchor changes, claim confirmations, and mailbox-link-click round-trips are rate-limited per requesting account, per target legacy row, and per session/IP.
- Claim-initiation surfaces are gated by a Cloudflare Turnstile CAPTCHA verified server-side before any DB read; identical UX regardless of match condition.

Stuck recovery:

- If the platform surfaces no candidate, the member's declared anchors do not resolve a candidate, and the mailbox-link round-trip is not viable (old mailbox unreachable, declared address malformed in the export, etc.), the member finishes signing up without linking and asks an administrator afterwards, through the identity-link category of `M_Contact_IFPA_Admin`. Registration never waits on a human: a registrant can always complete onboarding alone, and the wizard offers no way to write to an administrator, because a registrant cannot reach the surface an administrator would answer on. Once they are a member the request enters the admin queue per `A_Review_Member_Link_Help_Requests`, where the administrator adjudicates it on the evidence recorded against the attempted claims and holds the tools to apply the link.

All claim, declaration, mailbox-link, dispute, and revert events are audit-logged with the evidence-strength tag and the original-claim audit row identifier where applicable. A name-only confirmation (a medium-confidence staged candidate, or a direct historical-record claim passing only the surname rule) records the floor tier `declared_anchor_only`; an email anchor records `currently_controls_modern_email_matching_legacy` only when it is the member's verified login email; a declared old email records the floor tier until its mailbox-control round-trip completes; a claim an admin approves through the link-help request path records `admin_vetted_evidence`. The date of birth is the strongest identity signal the archive holds, and it is read on every match rather than only on a tie. Every registrant supplies one before any matching runs, so the member's side is always present; the record's side is reachable only through a linked legacy account, and not every legacy account carries one. An identical date corroborates a match and raises it; a date that does not match simply fails to corroborate, however near it is; a record carrying no date settles nothing and is recorded as settling nothing. It never blocks a claim, never weakens one, and never enqueues a review item, because nobody would be required to act on one. The comparison outcome is recorded permanently in the claim's audit metadata, and the admin claim-review surfaces render it, because an administrator adjudicating a doubtful or disputed link needs that evidence in front of them. The ledger entry is what a disputed link is reconstructed from.

### M_Complete_Onboarding_Wizard

Access: Newly verified members reach the wizard immediately after email verification. The wizard is the primary entry point for the onboarding task list managed by `MemberOnboardingService` and the primary cleanup channel for legacy club data.

Story: As a newly verified member, I am routed through outstanding onboarding tasks in fixed order (personal details, legacy account claim, club affiliations) so my required details are on file before any matching runs, my account is bound to my pre-existing identity if any, my club affiliations are confirmed or corrected, the legacy club data I have authority over is cleaned up, and my profile is ready to use.

Success Criteria:

- After email verification, the member lands on the first wizard task without an intermediate landing page.
- The `legacy_claim` task is **universal** (always rendered): the task surfaces any staged candidates the platform found for this member's verified email or earlier-declared anchors, plus a prompt to declare optional anchors (former surnames, old emails) so the platform can look harder, plus a CTA into the direct historical-record claim affordance. Brand-new players with no pre-existing identity see the task and resolve it in one motion, by stating that they never held an old-site account; a registrant who did hold one but cannot find it says that instead, which finishes the task just as completely and opens one last attempt at the match. Returning members whose anchors did not auto-match see the prompt as an invitation to declare. Card-level UX and the claim mechanics are specified by `M_Claim_Legacy_Account`.
- The `club_affiliations` task is universal (always rendered), like `legacy_claim`. Its content covers Stages 1A, 1B, and the wrap-up landing, whose no-match exit is the explicit no-club answer. The wizard asks Stage 1 club questions only about the member's own mirror-suggested affiliations; a member with no suggested affiliation has no Stage 1 card and lands directly on the wrap-up landing, which states that no legacy club affiliation was found and that clubs can be joined or created from the clubs pages once onboarding is complete.
- On submission, the underlying state is written via the owning service and the `member_onboarding_tasks` row transitions to `completed`.
- `gender`, `first_competition_year`, and `show_competitive_results` are collected as fields within the `personal_details` task. The task is required to become a member and is completed by saving its fields: city, country, and date of birth are required; region is required for the USA and Canada and optional elsewhere; a changed country must be one the picker offers and is stored as that canonical name; gender defaults to `undisclosed`. The same field rules apply on the profile edit form, so nothing the wizard refuses can be stored by editing the profile afterwards: city, region, and country are capped at 64 characters on both, and a first-competition year outside 1972 to the current year is refused on both rather than silently cleared.
- The date-of-birth field carries plain helper copy saying it is used to match the member's old footbag.org records and stays private, never shown publicly. It serves as a private matching anchor and is the strongest one the platform holds: it corroborates a match and separates same-name candidates, reaching a competition record through the old-site account that record is linked to, since the archive itself holds no dates. It is required here so it is on file before any matching runs (posture per DATA_GOVERNANCE), and it never alters an anti-enumeration response.
- The three tasks are answered in order: personal details, then the legacy claim, then club affiliations. The order is enforced on every request, not merely offered, so a task cannot be answered before the one ahead of it has been. This is what keeps the matcher from running before the disambiguation anchors exist: no candidate matching, search, direct historical-record claim, or continue-without-linking decision runs until the required personal details (including date of birth) are on file. It also fixes which answer completes signing up, since the last task in the order is always the last one answered.
- Applicability is computed against the claiming member's own account state, not against any historical-persons record the member has claimed. `members.is_deceased` and `historical_persons.is_deceased` are two independent fields: claiming a historical record never propagates the record's deceased flag to the living member's account, and the member runs the wizard normally.
- The `club_affiliations` task is optional to fulfil but not to answer: the member never has to end up in a club, but the task completes only on a recorded explicit answer (a wizard submission, or an affiliation written by an explicit act such as an admin assignment), never on a bare page render. Confirming a club completes it, and so does the explicit no-club answer, which also resolves any still-unanswered suggestion card in the same transaction, so the task can never finish with a card left open, mirroring how the `legacy_claim` attestation resolves open candidate cards. All three tasks therefore complete instead of skipping: `personal_details` by saving its fields, `legacy_claim` by an explicit decision (claiming a record, or one of the two continue-without-linking answers: that they never had an account on the old footbag.org, or that they had one and cannot find it), and `club_affiliations` by a written club affiliation or the no-club answer. An account is pending until all three are answered, and a pending registrant holds a session but no member authorization: every member, club, and admin capability routes them to their next outstanding task, and they reach only public browse as an anonymous visitor sees it, the wizard and its claim affordances, and logout. A pending account has no profile page for any viewer and does not appear in member search. Each task transition emits an `audit_entries` row.
- Resume needs no separate affordance: a pending registrant has no profile page to carry one, so any request they make to a member capability routes them to their lowest-position outstanding task, which is the same task UI used at registration (identical service contract regardless of entry point). Every answer is given inside the wizard task itself. Each task transition emits one audit row, and the transition that answers the last task emits the one-time membership-completion row.

Club-affiliation task acceptance criteria:

- When mirror-derived club affiliation, leadership, or candidate suggestions exist for the member, the `club_affiliations` task presents them.
- Each suggestion shows the club name, city, country, and the member's inferred role (contact, member, leader, co-leader).
- Stage 1A (listed contact) and Stage 1B (affiliated but not listed contact) present two orthogonal questions per card, each in its own clearly-labeled fieldset: (1) membership confirmation, asked as "Were you a member of {clubName}?" with Yes / No options, and (2) activity signal, asked as "Is {clubName} still active?" with Still active / Not active anymore options. Both answers are required; either may be answered first. The card submits via a dedicated "Save answers" button rendered once, below both questions, so the member reaches the action having already read what it submits. The wizard carries no outward links, so a member never leaves it to research a suggestion, and a member who returns later is routed to the first un-signaled card. The membership question determines affiliation; the activity question feeds the `crowdsource_club_viability` predicate (see `A_Periodic_Club_Cleanup`). Content-editing gates key off membership confirmation and contact status, not the activity signal: Stage 1A confirmed members (listed contacts) edit club metadata directly; other members report inaccuracies to a co-leader out of band.
- When several suggestions plausibly describe the same membership, the wizard groups them on one disambiguation card that resolves which club, if any, the member belonged to. The club the member confirms there then presents its standard card, so its activity signal is still collected; clubs declined on the grouped card record no activity evidence.
- The wizard does not offer in-wizard club search. After every Stage 1 card resolves, the task completes if a club affiliation was written during the run; otherwise it advances to the wrap-up landing. The wizard never creates a `clubs` row except by promoting a confirmed candidate.
- Per-card actions persist immediately; on resume, the task re-renders only the cards with no signal recorded yet, starting at the first. The no-club answer is offered only on the wrap-up landing, where no card is left open, so a member with a suggestion answers it on its own card and every answer carries an activity signal; the answer still resolves any remaining un-signaled card in the same transaction.
- Bootstrap leadership candidates carry a strong / weak / none classification derived at read time from structural signals recorded per (member, club): `listed_contact` (the legacy club page names the person as contact), `affiliation` (a legacy person-club affiliation row links them), `hosting` (the club hosted IFPA-registered events during the person's active competitive years), `roster` (the legacy member roster lists the person), and `mirror_text` (the club page narrative mentions the person by name or known alias). Strong requires `(listed_contact AND affiliation)` or `(hosting AND roster)` or `(listed_contact AND hosting)`; weak is any structural signal set that satisfies no strong gate; none is zero structural signals. Context modifiers (`tier_signal`, `recent_activity`, `geographic_alignment`) display alongside the signals but never change the classification. The classification is display-only: it labels the candidate badge and audit metadata and never gates promotion.
- Confirmed (or corrected) leadership promotes the bootstrap row (if any) into a live `club_leaders` co-leader row. Co-leaders are a flat equal set, capped at five per club; a member co-leads at most one club (`ux_one_club_leader_per_member`), so a registrant who already co-leads another club is affiliated to this club but not made a co-leader. Cap-hit or already-co-leading claims still affiliate the member but insert no `club_leaders` row. A registrant already holding two current clubs is made a co-leader without the club becoming one of their clubs, and the card says so rather than reporting the club added. The bootstrap claim is tier-exempt (a legacy leader reclaims their own club regardless of tier); confirming the affiliation grants the one-time club-join Active Player period, which gives a Tier 0 member Tier 1 benefits. A leadership claim is never blocked by club status: a successful claim of an inactive or archived club returns the club to `'active'` in the same transaction, audit-logged as a revival.
- Confirming a club affiliation creates a new `member_club_affiliations` row with `source='legacy_claim'`. A member may hold at most two current club affiliations (primary and secondary); the first confirmed club is primary, the second is secondary. When the registrant already has two `is_current=1` affiliations, the cap is hit: no `member_club_affiliations` row is written, and the confirmed Yes is recorded as former membership (the legacy affiliation row resolves `'former_only'`, keeping the answer and its activity signal), so the card resolves and never blocks completing the task. The card surfaces a cap message ("You are at the two current-club limit; this club is recorded as a former membership"). A member who wants this club current instead swaps affiliations themselves through the explicit `M_Join_Club` / `M_Leave_Club` surface after onboarding.
- The wizard carries no path to `M_Join_Club` or `M_Create_Club` and no outward links at all: joining and creating clubs are member capabilities, fenced until onboarding completes, so the wizard never links a registrant to an action they cannot yet take. A member who navigates away on their own leaves the task `pending`; unsignaled cards remain unsignaled, signaled cards retain their signals, and their next request to any member capability returns them to the first un-signaled card.
- Club cards derive from the member's whole claimed identity, not one anchor of it: a suggestion anchored on the member's historical record surfaces even when they hold no old-site account, so a member who claims a competition record still resolves that record's club data. A card is the member's own only when an anchor on the row matches the member's own anchor of the same kind.
- One club, one question: while a leadership card for a club is open, the membership suggestion for that same club is not also shown. Confirming leadership answers the relationship and collects the club's activity signal, and supersedes the membership suggestion in the same transaction; declining leadership leaves it pending, so the membership question then surfaces on its own card.
- The wrap-up landing renders no join, create, or browse action: it explains that joining or creating a club happens from the clubs pages once onboarding is complete. The tier requirement for creating a club is `M_Create_Club`'s own and is enforced there, not previewed in the wizard.
- At the end of the `club_affiliations` task, if no `member_club_affiliations` row was written during the wizard run, the wizard's final screen displays the wrap-up landing described above, whose single completing action is the explicit no-club answer, which completes the task with no affiliation. Rendering the landing completes nothing; the member must answer. A member who wants a club joins or creates one from the clubs pages after onboarding.
- The `club_affiliations` task is `pending` while cards remain unsignaled or the landing awaits its answer, and a pending registrant returning to the site is routed to the first un-signaled card; it is `completed` by a written affiliation or by the no-club answer.
- Promotion of onboarding-visible or dormant candidates to live `clubs` rows happens on member confirmation in the wizard.
- All outcomes (current, former, rejected, historical, reported-inactive) are persisted so the member is not repeatedly prompted.
- Alongside the two fixed answers, the club step invites one optional free-text note: on the member's last club card, asking what else they know about that club or any club in their area, and on the wrap-up landing, asking what they know about clubs in their area, so a member with no suggested club can still contribute local knowledge. It is asked once per member and never required. Notes are recorded in `club_insight_notes`, keyed to the club, to the candidate when no live club exists yet, or to neither when the note concerns the member's area. They are evidence for `A_Periodic_Club_Cleanup` and render on that admin surface only.
- Wizard activity signals are recorded as structured rows in `club_viability_signals`; membership confirmations and rejections persist as `legacy_person_club_affiliations` and bootstrap-row status transitions. The onboarding wizard is the only surface that collects activity signals, and club pages carry no feedback affordance. Activity signals feed the `crowdsource_club_viability` predicate in `A_Periodic_Club_Cleanup`, counted one vote per member (a member's latest signal for a club supersedes their earlier ones), combined with legacy classification and operational state; when an admin opens the cleanup queue, the rules demote the clubs whose own record leaves nothing to decide and surface for review only the clubs whose record contradicts the member who reported them inactive.
- Junk candidates are never shown in any stage, and neither are candidates an admin has archived: archiving is a terminal decision, so a card must never offer one back to a registrant.

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
- Avatar upload: JPEG or PNG up to 5 MB, with the same image dimension limits as M_Upload_Photo (at least 200×200, at most 16.8 megapixels (4096×4096 pixels), aspect within 4:1). A rejected image re-renders the profile-edit form with a clear inline error.
- **Name display:** Display name is set at registration and cannot be changed. The surname constraint is enforced at registration: the display name must end with the member's recorded family name. Contact IFPA admin for corrections.
- **Date of birth:** editable, entered as three labelled parts (day, a month chosen by name, and a four-digit year). It is owner-and-admin private and never appears on any other surface. It is editable because it is the private matching anchor that ties a member to their old footbag.org account and their competition records, so a member who registered with a wrong one must be able to put it right. A change is audit-logged, naming the field but never the value, and raises nothing for an administrator: the member owns this field, so putting it right is an ordinary profile edit.
- City, country, and email are mandatory fields; phone is optional.
- **Contact fields and per-field visibility:** `phone` and `whatsapp` are optional, both editable here (`whatsapp` format-validated, rendered as a chat link). Each contact field (contact email, phone, WhatsApp) has its own visibility toggle, default off. When toggled on, the field is shown to authenticated members only (Sensitivity 2), never on public surfaces. Holding a club co-leader or event organizer role forces that member's contact email visible to authenticated members and locks its toggle on while the role is held (see DATA_GOVERNANCE §3). Changes are audit-logged.
- **Gender (competition eligibility):** editable (Male / Female / Prefer not to say; stored `male` / `female` / `undisclosed`). Owner-and-admin by default; a member may opt in via a "Show my gender on my public profile" toggle (default off) to make it visible to signed-in members on the member profile, in member search, and on club rosters. Only Male / Female render when opted in (Prefer not to say stays hidden), and it is never shown to an unauthenticated visitor. Used only for gender-gated event-category eligibility (see M_Register_For_Event). The value and the visibility toggle are both editable here; changes are audit-logged.
- **Discoverable in member search** (`searchable`, default on): a self-service toggle labeled "Allow other members to find me in member search." When off, the member is excluded from `M_Search_Members` results (enforced by the `members_searchable` view), but their profile remains reachable by direct link and they still appear to club co-members on rosters; the toggle governs search inclusion only. Changes are audit-logged.
- **Competition history fields:**
  - `first_competition_year` (optional): editable integer field. Shown as "Competing since {year}" on profile. Leave blank to hide (opt-out by clearing). Pre-populated from `historical_persons.first_year` during legacy claim if the member has not already set a value.
  - `show_competitive_results` (default on): toggle controlling whether competition results appear on the member's public profile. The member's own profile view always shows their results regardless of toggle state.
- **Declared identity anchors (always private; declared in the onboarding wizard's legacy-claim task, shown here read-only and not edited inline):**
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
- Display names are constrained to prevent homograph attacks (for example: no mixed scripts or invisible characters, and reasonable length limits).

### M_Contact_IFPA_Admin

Access: Authenticated members can submit a structured contact request to the IFPA administrator for issues the self-service tools do not handle (display-name corrections, profile-URL corrections, tier-status questions, identity-link disputes, anything else that requires admin action).

Story: As a member, I can submit a structured contact request to the IFPA administrator from my profile edit page so that I can resolve account issues without leaving the platform and so the administrator sees my request alongside other admin work.

Success Criteria:

- The profile edit page surfaces a "Contact IFPA admin" link next to the read-only identity block.
- The link opens a slug-scoped owner-only form (`/members/:slug/contact-admin`) with: a category dropdown (Display name correction, Profile URL correction, Tier-status question, Identity-link issue, Group creation request, Vote creation request, Other), a free-text message textarea (required, up to 2000 characters), and a submit button.
- The Tier-status question category covers a member's report that a held Hall of Fame or Big Add Posse honor, or a membership tier, is not reflected on their account (the case of an honoree with no claimable legacy or historical record). The admin resolves it through the honor grant in `A_Grant_HoF_BAP_Board_Status` (which auto-grants Tier 2) or a tier correction. The form routes the request for admin review and never lets a member self-assert an honor or tier.
- On submit, the member sees a confirmation banner: "Your request has been sent to the IFPA administrator. We will reply by email."
- Submitting writes one `work_queue_items` row with `queue_category='membership'`, `task_type='member_contact_request'`, `entity_type='member'`, `entity_id=<requesting_member_id>`, `status='open'`, `priority=5`, `reason_text=<category-label>: <first 200 chars of message>` (operational summary), and `detail_text=<full message body>` (the admin reads the whole request from this purgeable column).
- Submitting writes one `audit_entries` row with `actor_type='member'`, `action_type='support.contact_request_submitted'`, `category='support'`, `reason_text=<category-label>`, and `metadata_json` carrying the category enum value and the message length. The full message body is held in the purgeable `work_queue_items.detail_text` column (cleared on account erasure), keeping member-authored free text out of the append-only audit ledger.
- The Identity-link issue category is the one exception to the two rows above, because an administrator answers it by applying a link rather than by writing back. It raises the link-help item instead (`task_type='member_link_help_request'`, `action_type='support.help_request_submitted'`) and is governed by that workflow's own limits: one open request per member, a re-submission replacing the payload on the row already on file rather than stacking a second, and its own per-member rate limit. Whether the request is a conflict dispute is detected from the records at submission, never declared on the form, so the records an administrator's later revert is bound to are the ones the platform saw. Everything else about the submission is unchanged: the same form, the same confirmation banner, the same free text held in a purgeable column and kept out of the audit ledger.
- A member can hold at most 3 open requests at a time, counted across every request the member raised themselves, whichever queue answers it, and freed as each one is answered. Work the platform raised about a member never counts toward it: those items are not theirs to clear, so counting them would let a run of system-raised tasks silence someone who has asked for nothing. A 4th submission returns HTTP 429 with a clear error message that points to the member's open requests. The one submission the cap does not refuse is a second identity-link request from a member who already has one open, because it replaces the payload on that row rather than opening another; refusing it would strand a member at the cap who came back to correct the very request an administrator most needs to understand.
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
- Search results exclude: (a) members with `searchable: false`, (b) members currently in the deletion grace period (account deleted but not yet purged), and (c) deceased members. Alongside the members it returns, the search also returns matching canonical historical-person records, each marked as historical and linking to its public history page rather than to a member profile, so a member searching for someone who competed before the platform existed finds the historical record. A historical result carries only the name and that link; it does not make the person a member, a searchable current member, or contactable.
- Broad queries return a capped result set with a "refine your query" prompt; no exhaustive browse-all or full pagination.
- This is the only member search feature. It is authenticated-only and deliberately narrowing; not a member directory.

### M_View_Dashboard

Access: An authenticated member sees their own dashboard on their own profile page. It is owner-only and slug-scoped, matching the owner-only-slug pattern used elsewhere; another member's profile never shows it.

Story: As a member, I see everything the platform is waiting on me for in one unmissable place the moment I log in, so that a request, a deadline, or an expiring standing is something I am shown rather than something I have to remember to go looking for.

Success Criteria:

- Signing in lands the member on their own profile page, which serves as their dashboard.
- When the platform is waiting on the member for anything, the dashboard renders an action block above the profile content, styled so it cannot be missed. Each entry shows a short imperative headline, an optional single line of detail, and the options that resolve it.
- Every action item carries one of two urgency levels, set by the part of the platform that owns the obligation because only that part knows its deadline: needs attention now, or pending. Needs-attention-now items lead the action block; pending items follow in a quieter list beneath.
- While the member holds any needs-attention-now item, every other member-facing page carries one compact banner line linking back to the dashboard. A member holding only pending items sees the dashboard block and no banner.
- The action block is advisory: the member keeps full use of the site while an item is outstanding, and the item stays until it is resolved.
- With nothing outstanding, the action block and the banner render nothing (no empty-state panel, no "all caught up" message), and the dashboard is the member's profile as usual.
- The action block and the banner carry only non-private content: a headline, an optional detail line, and the options. Private content, including an administrator's message body, is read on the owner-only surface the item links to.
- Ordering is needs-attention-now before pending, then soonest deadline first, then a stable order among items with no deadline.
- Every item resolves in exactly one of three ways, and its options follow from which one it is.
- **Resolved by acting.** One option, and the item clears when the underlying record changes, with no separate dismissal step: an unanswered administrator message, "Answer" (`A_Message_Member`); a completed event the member organizes with no results uploaded, "Upload results" (`EO_Upload_Results`); routine music missing on a registration before its upload deadline, "Upload music" (`M_Upload_Routine_Music`); a failed membership purchase, "Try again" (`M_Purchase_Tier_1`, `M_Purchase_Tier_2`); an approved Hall of Fame nomination with no affidavit while the nomination window is open, "Submit affidavit" (`M_Submit_HoF_Affidavit`).
- **Resolved by acting or by declining.** Two options, because a decline is a legitimate final answer, and the decline is recorded so the item does not return: staged identity-claim candidates, "Confirm" or "Decline" (`M_Claim_Legacy_Account`).
- **Resolved by acting, or by time.** Active Player status approaching or past expiry appears from the first reminder offset through 30 days past the expiry date, pending while the status still stands and needs-attention-now once it has lapsed (`M_Active_Player_Expiry`). It offers the two routes back the member can take for themselves: an upgrade naming both paid tiers, which removes the dependence on the status altogether and points at the membership block that sells them, and the events list, since attendance earns the status again. A vouch is the third route the rules allow and is stated on the item's detail line rather than offered as a control, because a Tier 2 or Tier 3 member gives a vouch and it is not this member's action to take. The one-time club-join grant is not offered, because it reaches only a member who has never previously been an Active Player and every member this item can appear for already has been. A recurring donation whose charge failed stays pending, offers "View your recurring donation" on the payment-history page, and clears when Stripe collects or cancels, since retries run on Stripe's dunning schedule (`M_Donate`).
- An open vote the member is eligible for and has not cast appears as a pending item with a "Vote" option (`M_Vote`). It never escalates to needs-attention-now and carries no decline option, so the platform creates no record of a member's abstention; it clears when the member votes or the vote closes.
- A completed event with no uploaded results raises one item for each of that event's organizers, and the item clears when results are uploaded.
- Actions the member takes from the dashboard are audit-logged by the stories that own them.
- Each obligation keeps whatever reminder email its own story specifies; appearing on the dashboard changes no email behaviour.

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
- A member who holds any current club affiliation holds exactly one primary. If leaving the primary club leaves exactly one current affiliation, that affiliation becomes primary in the same transaction. A member holding two current affiliations changes which is primary through the explicit swap control, never automatically.
- A member who is the club's only co-leader is warned before leaving ("You are the only co-leader; the club will have no member-visible contact until someone steps up") and may invite a successor first via `CL_Manage_CoLeaders` or proceed. Leaving as the last co-leader leaves the club leaderless, a tolerated state per §5.1, not blocked.
- Leaving a club where the member also held a `club_leaders` row removes that co-leader row in the same transaction.
- Leaving sends an email notification to the leaving member and to all current co-leaders.
- The leave action is audit-logged with actor identity, club id, before and after affiliation state, and timestamp.

### M_View_Club

Access: Members can view full club details and rosters. Visitors see only public club information.

Story: As a member, I can view club details and member roster so that I learn about clubs and see who belongs. Also I can find the contact information of the club's co-leaders.

Success Criteria:

- Club page displays: club name, description, city, country, external URL (if provided), standardized hashtag. To authenticated members it also shows each co-leader's contact email (and that co-leader's WhatsApp where they opted in).
- Member roster shows all members where clubId matches the club.
- Roster displays: member display name, membership tier badge, current Active Player badge where applicable, city, country, and gender when the member has opted in to gender visibility.
- Email addresses shown only if member has opted in to email visibility.
- Roster sorted alphabetically by display name.
- Club detail page includes a link to the club media gallery (for example, "View Club Gallery") when at least one media item exists, without showing image or video counts in the link text.
- Co-leaders array displayed on club detail page showing all current co-leaders.
- For a club with no bootstrap leader rows (outside the pre-populated cohort), the page also surfaces its mirror-inferred historical leader / co-leader / contact affiliations as provisional leaders: names only, labeled as imported from historical records, never with contact information, deduplicated against any bootstrap entry, and dropped once a real member claims leadership.

## 3.4 Event Participation

### M_Register_For_Event

Access: Members can register for events.

Story: As a member, I can register for an event so that I can participate.

Success Criteria:

- Event registration with participant tracking.
- Registration confirmation email sent to member.
- System confirms registration and sends reminder email one week before event.
- After tournament, member profile will automatically link to event results page (for every event they have participated in that posted results).
- Registration includes a required selection of registration type: Competitor or Attendee/Supporter (if the organizer has enabled both; otherwise the single available type is implied).
- If Competitor: member selects one or more organizer-defined event disciplines.
- If a selected discipline is doubles/team: member provides partner/team information (member-select when possible; otherwise free-text).
- A discipline's gender eligibility is enforced at registration from the discipline's own gender part. A women's discipline requires every member on the entry to have declared female. A mixed discipline requires one member with gender Male and one with gender Female. An open discipline admits anyone, and is where men and women both play. A member whose gender is "Prefer not to say" (stored as undisclosed) enters open disciplines; recording a gender in their profile at any time unlocks the women's and mixed draws. Gender validation applies only between two member profiles. For a free-text (non-member) partner, the registrant attests and the organizer verifies eligibility at check-in. A discipline's class is self-selection, and the platform records the class the competitor entered.
- When a member selects a gender-gated discipline while their stored gender is `undisclosed`, the registration surface warns them that the gendered draw requires a declared gender and points them to set it in their profile; the member may still register for Open disciplines.
- If Attendee/Supporter: no disciplines are required; optional fields may be collected if configured by organizer (e.g., t-shirt size, donation amount).
- Confirmation email includes registration type and selected disciplines and/or partners (if any).
- Some events are free and others are paid.
- For paid events, the member must complete the Stripe checkout process to be officially registered. Changes are applied only after webhook-confirmed success.
- Event registration payments affect registration status only and do not directly change membership tier.
- A registration reaches `confirmed` once payment is webhook-confirmed (paid events); until then it is `pending`. A member can withdraw their own registration up to the registration deadline, and an organizer or admin can cancel a registration with a reason; a canceled registration is excluded from participant counts, exports, check-in, and event email. When a checkout session expires, the pending registration it belongs to is canceled with it.

<< V2 SCOPE >> The five criteria below ship with routine music in version two. They are design
intent for that build and are not part of the v1 launch.

- A registration in a discipline that requires routine music additionally reaches `confirmed` once the required upload is attached.
- If the registrant selects a discipline where the event organizer has set `requires_routine_music=true` (a boolean on event disciplines, settable in `EO_Edit_Event`), the registration is marked incomplete until the member uploads an mp3 routine-music file via `M_Upload_Routine_Music` for that registration entry.
- If the registrant has not uploaded the required routine music by the event registration deadline, the registration remains incomplete and is treated as not-confirmed for participant counts, exports, and check-in.
- Registrants receive an email reminder at admin-configurable offsets before the deadline (`routine_music_reminder_days_1` default 7 days, `routine_music_reminder_days_2` default 1 day) when a required upload is missing.
- For doubles routine disciplines, the registering member uploads on behalf of the entire entry, and the partner plays the attached track back for verification.

### M_Withdraw_Registration

Access: Members can withdraw their own registration from an event up to that event's registration deadline.

Story: As a member, I can withdraw from an event I registered for so that the organizer knows I am not coming and my place is released.

Success Criteria:

- Member can withdraw a registration they hold while the event's registration deadline has not passed. After the deadline, withdrawal is handled by the organizer (see `EO_Cancel_Registration`).
- Withdrawal sets the registration to `canceled`, so it is excluded from participant lists, exports, check-in, and event email.
- The organizer is notified by email that the member withdrew.
- For a paid registration, the withdrawal screen states that any refund is arranged by the IFPA Treasurer outside the platform.
- A withdrawn member can register again while registration remains open; withdrawal is not a bar to re-entry.
- Withdrawal is audit-logged with member ID, event ID, and timestamp.
- Withdrawing a doubles or team entry withdraws the whole entry, and the registering member's partner information is retained on the canceled row for the organizer's reference.

### M_Upload_Routine_Music

<< V2 SCOPE >> Routine music is version-two scope, shipping with the freestyle routine
disciplines it serves. This story is design intent for that build and is not part of the v1
launch.

Access: Members registered in an event discipline with `requires_routine_music=true` can upload, attach, replace, detach, and play back their own routine-music files. Members manage their personal routine-music library outside any single event via `M_Manage_Routine_Music_Library`. For doubles or team routine entries, the non-uploading partner(s) can play back the attached track for verification but cannot upload, replace, detach, or delete.

Story: As a freestyle competitor registered in a routine discipline, I can upload my routine music as an mp3 file so that the event organizer can play it during my performance, I can verify my upload before the event, and I can reuse the same track for future event registrations without re-uploading.

Success Criteria:

- The form is available to members with a registration in a discipline where `requires_routine_music=true`, and only before the event's registration deadline.
- The form offers two paths: (a) upload a new mp3 file, or (b) attach an existing file from the member's personal routine-music library on S3 without re-uploading.
- Accepted format at launch: mp3 only. Other audio formats are rejected with a clear error message. Support for additional formats is a future addition, admin-configurable when added.
- Sanitization (per §1 file upload safety model): the audio is processed through FFmpeg with arguments `-map 0:a:0 -map_metadata -1 -c:a libmp3lame -b:a 128k -ar 44100`, which selects only the audio stream, drops all metadata and embedded album art, and re-encodes to a normalized 128 kbps / 44.1 kHz mp3. The re-encoded output is stored; the original upload is discarded. This eliminates any non-audio payload (id3-tag malware, trailers, polyglot tricks) by construction.
- Future scope (proposed, not at launch): screen uploaded tracks against third-party copyright-block matchers (for example YouTube Content ID) and warn or reject uploads likely to trigger blocks when event video is later published.
- Maximum file size is admin-configurable (`routine_music_max_size_mb`, default 20 MB), measured against the original upload before transcoding. Oversized files are rejected with a clear error message.
- Files are stored in private object storage (S3) as durable member-owned media, on the same storage pipeline as member-uploaded photos. Files persist permanently in the member's library; there is no auto-purge.
- Files are served via short-lived signed URLs only to (a) the uploading competitor at any time, (b) the non-uploading partner(s) on any joint registration the file is attached to, and (c) the event organizer(s) of any event the file is currently attached to via a registration entry, through and after event end. Files are never publicly accessible.
- At upload, the member supplies a short library label (required, max 60 characters, for example "Worlds 2026 routine"). The label is stored on the library row as that file's default.
- Each upload creates one row in the member's routine-music library. Attaching a library file to a registration entry creates a separate join row tying the file to that registration's (event_id, discipline_id) pair. A single library file may be attached to many registration entries across events. Disciplines on attachment rows align with the EO-defined disciplines from `M_Create_Event` and `EO_Edit_Event` (freeform per event, as the EO defines them).
- At attachment time the member may override the library file's default label for that specific attachment. The override is stored on the attachment row; the library default is unchanged.
- Within a single registration entry, replacement swaps which library file is attached; replacement does not delete the previously attached file from the member's library.
- After the registration deadline closes, the competitor can no longer attach, replace, or detach the file for that event; the attachment is locked for the event.
- Competitor can delete a library file at any time. Deletion removes the file from object storage and all attachment rows for past, current, and future events. Past-event registration records retain a tombstone reference noting the file was deleted by the competitor.
- All upload, attach, replace, detach, delete actions are audit-logged with member ID, event ID (if applicable), discipline ID (if applicable), file ID, action, timestamp.

### M_Manage_Routine_Music_Library

<< V2 SCOPE >> Ships with routine music in version two; not part of the v1 launch.

Access: Any member can view, play back, upload, label, and delete their own routine-music library files at any time.

Story: As a member who uses routine music for footbag events, I can manage my personal routine-music library so that I can reuse tracks across events, replace stale uploads, update labels, and remove tracks I no longer want stored.

Success Criteria:

- Library view lists all routine-music files the member has uploaded, showing label, filename, file size, upload date, and the list of past/current attachments rendered as (event name, EO-defined discipline) pairs.
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

- Upcoming Events section shows events where member is registered AND startDate greater than today AND status in (reg_open, closed).
- Past Events with Results section shows events where member participated AND the event has published results records.
- Each entry shows event title, date, location, status or placement.
- One-click access to event details, results, and media galleries.
- For events the member is registered for, the event detail view displays the member’s registration type and selected disciplines/partner info (if applicable).
- On any event detail page, an authenticated member sees who else is registered: display name, registration type, the disciplines each competitor entered, and partner or team information where the entry is a doubles or team entry. Only confirmed registrations are listed. Entering a competition is a public act within the community, so registrants appear on this list without an opt-out; the list carries no contact details.

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
- For recurring donations, the local database stores: stripeSubscriptionId, stripeCustomerId, status (incomplete, active, canceled, past_due, where incomplete is the opening state held while the member is at the payment provider), the donation amount, currency, interval (yearly), start date, and the donation comment. The platform records each successful charge as a new payment record when the invoice.payment_succeeded webhook is received. No next_charge_date field is maintained by the platform; Stripe owns the schedule.
- After a successful donation setup, I see a clear confirmation message in the UI and receive a confirmation email with amount, date, interval (one-time or yearly recurring), and basic reference information, but not full card details.
- If the payment fails or is canceled during checkout, I see a clear error or cancellation message. A donation record does exist: it is written before the redirect to Stripe because it carries the checkout-session and payment-intent ids every webhook lookup matches on, and a webhook cannot be matched to a donation that was never recorded. An abandoned or failed checkout settles that record as `canceled`, and my payment history shows it as such rather than hiding it.
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
- Member sees a clear "Upgrade to Tier 1" option from their account/dashboard when eligible.
- The configured Tier 1 price is shown beside that option, so the member knows the amount before being handed to the payment page.
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
- Eligible members see a clear "Upgrade to Tier 2" option.
- The configured Tier 2 price is shown beside that option, so the member knows the amount before being handed to the payment page.
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
- Page provides a clear "Upgrade to Tier 1" or "Upgrade to Tier 2" button (where applicable) that initiates Stripe Checkout flow. Tier 0 members see upgrade options for Tier 1 and Tier 2; Tier 1 members see an upgrade option for Tier 2; Tier 2 and Tier 3 members do not see upgrade prompts.
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
- Member receives email notification at Administrator-configurable offset(s) before Active Player expiry (defaults: 30 and 7 days) reminding them how to regain Active Player status (later qualifying event attendance, or a vouch from a Tier 2 or Tier 3 member). They do not describe the one-time first-club-join grant, which reaches only a member who has never previously been an Active Player and so can never apply to anyone receiving one of these reminders.
- Member receives a built-in day-of expiry notification (T+0; not separately administrator-configurable) confirming Active Player status has ended and explaining which features are now restricted.
- The one-time club-join Active Player grant cannot be repeated after Active Player expiry; it is consumed by first use.
- Active Player expiry events are audit-logged with member ID, previous Active Player expiry date, expiry processing date, and reason `active_player_expired`.
- The actual expiry processing is performed automatically by the SYS_Check_Active_Player_Expiry system job; no manual admin action is required.
- Event Organizer continuity: If the member is serving as an Event Organizer for events in `reg_open`, `closed`, or `completed` status when Active Player status expires, the member retains Event Organizer role permissions for those specific events until each event reaches `completed` status. This prevents organizers from being locked out of managing active events mid-lifecycle.

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

<< V2 SCOPE >> Voting and elections are version-two scope. The stories in this section are
design intent for that build and are not part of the v1 launch.

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

<< V2 SCOPE >> Ships with the Hall of Fame nomination and voting flow in version two, the first
consumer of the voting subsystem; not part of the v1 launch. The administrator honor grant that
sets the Hall of Fame badge stays v1.

Access: Any member can nominate another eligible member to the Footbag Hall of Fame during the annual nomination window.

Story: Eligibility for the Footbag Hall of Fame is based on Year of First Involvement (YFI) in the sport. YFI includes competing as a Player or as a Contributor (organizing/producing tournaments, promotions, festivals and more). All nominees for the Footbag Hall of Fame must have a YFI that is 15 years or more from the year they are nominated.Nominations are focused on two banners: PLAYER: whose footbag history has displayed: Significance and Excellence in Competition, by winning and placing in the top 3 consistently at sanctioned IFPA Events. CONTRIBUTOR: whose footbag history has displayed: Significance and Excellence in Leadership Rolls, by producing and organizing tournaments, clubs, touring team activities, coaching and more.

The nomination process begins by selecting the member, and providing their full name and current contact information, also the nomination category (Player or Contributor), plus other freeform information in the Nomination Form.

Success Criteria:

- Nominating a member will create a Work Queue task for the Admin to approve, because the Admin must manually confirm the eligibility criteria have been met. Upon acceptance, this will send an email to the nominated member and also [director@footbaghalloffame.net](mailto:director@footbaghalloffame.net).
- The nominated member must then submit an affidavit before the nomination window closes, which is crucial background information, and is required to be eligible for the vote. The nomination and affidavit must be submitted during the Admin-configured nomination timeframe.
- Nominations are NOT carried forward to the next year automatically.
- Upon admin approval of a nomination, the nomination row's status becomes approved, which is what records the member's candidacy for that nomination year. This flag indicates the member is an active HoF candidate for the current nomination cycle. 

### M_Submit_HoF_Affidavit

<< V2 SCOPE >> Ships with the Hall of Fame nomination and voting flow in version two; not part of
the v1 launch.

Access: A member who has been nominated to the Footbag Hall of Fame, and approved by an Admin as eligible, can submit an affidavit during the admin-configured nomination timeframe.

Story: As a member who has been nominated to the HoF, I can submit an affidavit in order to provide my footbag career background information, and to be eligible for the vote.

Success Criteria:

- The nominated member must submit an affidavit before the nomination window closes, which is crucial background information. The affidavit must be submitted during the Admin-configured nomination timeframe.
- Submitting the affidavit will make the member eligible for the vote, and the member will be included on the ballot along with the affidavit’s background information.

## 3.8 Media Sharing

All member-published media is public from the moment it is saved. An Administrator can remove an item through moderation; that is the only visibility control, and members do not set per-item visibility. Members own their content: deleting a photo or a video link removes it permanently, while deleting a named gallery removes only that gallery's saved view and leaves its items in place.

Named galleries are saved tag-query albums. Each gallery is defined by the hashtags its items must carry, optionally hashtags to exclude, and a sort order; any item whose tags satisfy that query appears in the gallery, and the same item can appear in several galleries at once. A member organizes media by tagging it and naming galleries rather than filing each item into a single folder. The criteria, exclusions, and sort sit behind an Advanced disclosure so the common path (name a gallery, upload into it) stays simple. The member gallery experience and the curator gallery experience share one interface; the differences are that the curator (the system member) may upload binary video and apply the curated marker, while members submit video as YouTube or Vimeo links and their uploads carry their own uploader tag.

Popular-tag suggestions (shown near the tag field and on the empty-state teaching block) are composed in two priority tiers and capped at a short list. Real community-popular tags lead, ranked by usage; a tag becomes community-popular once at least two distinct members share it. Curator-published tags backfill any remaining slots. Every suggested tag is one that content already carries, so each suggestion leads to media; while nothing qualifies, the block shows its other teaching content and the suggestion list stays empty until real usage arrives. When a member's content area is empty, a teaching block shows recent example photos with their hashtags, the popular-tag suggestions, and aggregated hashtag statistics, each clickable to insert a tag.

### M_Upload_Photo

Access: Members with Tier 1 benefits can upload photos to personally named galleries.

Story: As a member, I can upload photos so that I share visual content.

Success Criteria:

- Upload photos via named gallery interface. Each member has a Personal Gallery, materialized on first upload, which collects everything they upload. It is not a named gallery: the member cannot rename or delete it, and cannot give one of their own galleries its name, because both its identity and its automatic re-creation key on that fixed name. Members create their own named galleries to organize photos further.
- JPEG and PNG only; GIF not supported. Animated content should be uploaded to YouTube or Vimeo and embedded via video links.
- Accepted image dimensions: at least 200×200 pixels, at most 16.8 megapixels (4096×4096 pixels), and an aspect ratio no more extreme than 4:1 (longer side at most 4× the shorter). An image outside these bounds is rejected with a clear inline error naming the limit it missed (too small, too large, or too long and thin), and the form re-renders for retry.
- Photo processing generates two variants only: Thumbnail (600 pixels on the longest edge, aspect ratio preserved) and Display (800px width maximum). Both stored as JPEG at 85% quality, sufficient quality for web viewing and sharing. Original uploaded file is discarded after processing,
- Add caption to photo optionally (plain text, max 500 chars).
- Optional external URL on each uploaded photo (for example a link to a source article or creator page), validated at the service boundary (see DD §3.17). The upload form works without JavaScript.
- Tag optionally with hashtags for discovery (standardized tags for events and clubs, plus freeform tags such as tutorial, golf).
- Hashtag matching is case-insensitive for all tag operations (example: #Event_2025_beaver_open and #event_2025_Beaver_Open match identically).
- Hashtags stored with original capitalization for display quality (example: #Event_2026_Japan_Worlds displays as entered, not lowercased).
- Tag suggestions and the empty-state teaching block follow the §3.8 popular-tag rule; clicking a suggested tag inserts it into the field, with no per-keystroke autocomplete.
- Photo upload rate limited to 10 uploads per hour per member to prevent abuse.
- Photo upload controls are rendered for members with Tier 1 benefits. A member without them sees, in the same place, text naming the benefit and how to get it, for example "Become a Tier 1 member to share media", with the ways to qualify: joining a club, attending a qualifying event, being vouched for, or upgrading tier.
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
- Video metadata is stored as a row in the shared `media_items` table (uploaderId, platform, videoId, videoUrl, thumbnailUrl, caption, moderationStatus), with tags held in the separate `media_tags` table.
- Optional external URL on each submitted video (for example a link to the creator's page or an article about the video), validated at the service boundary (see DD §3.17). The submission form works without JavaScript.
- Video thumbnails fetched from YouTube/Vimeo APIs for preview.
- Members submit video as YouTube or Vimeo links only; binary video upload (MP4/WebM/MOV) is the admin/curator path (see A_Upload_Curated_Media). The member video path rejects a binary-upload submission at the service boundary (see DD §6.8).
- Hashtag matching is case-insensitive for video tag operations (example: Tutorial and tutorial match identically).
- Video link submissions are rate-limited per member to prevent abuse (for example, up to 5 submissions per hour).
- Tag suggestions follow the §3.8 popular-tag rule; clicking a suggested tag inserts it into the field, with no per-keystroke autocomplete.
- Videos and photos can be mixed in named galleries.
- Video link submission controls are rendered for members with Tier 1 benefits. A Tier 0 member without current Active Player status sees the benefit text in their place rather than the control.
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
- Personal Gallery is the default per-member gallery rather than a named gallery the member manages: it collects everything that member uploads, because every member upload automatically carries that member's uploader hashtag (per §1.1 Uploader hashtags) and Personal Gallery's criteria is that tag. It cannot be renamed or deleted. Avatars are excluded from every named gallery platform-wide, not only from Personal Gallery.
- Club and Event galleries aggregate both content types by hashtag matching.
- Video tiles render as click-to-play facades with lazy-loaded thumbnails, so a gallery can mix any number of videos without a performance penalty.
- Gallery creation and rename controls are rendered for members with Tier 1 benefits. A Tier 0 member without current Active Player status sees the benefit text in their place rather than the controls.

### M_Delete_Own_Media

Access: Members with Tier 1 benefits can delete media items they originally uploaded.

Story: As a member, I can delete my own photo, video link, or named gallery so that I control my content.

Success Criteria:

- Uploader can delete own media anytime, with immediate permanent effect (no soft delete for media).
- Delete controls for user-owned media are rendered for members with Tier 1 benefits. A Tier 0 member without current Active Player status has no media to delete, so no control and no benefit text appears.
- When deleting a media item, the deletion is permanent and has a cascading deletion of all the associated tags.
- Deleting a named gallery removes only that gallery (its saved query: name, criteria tags, exclude tags, sort order). The items it displayed are not deleted; they stay published and continue to appear wherever else their tags match. Deleting an item is the separate, permanent action above.

### M_Flag_Media

Access: Members with Tier 1 benefits can flag media they believe violates community guidelines. Visitors cannot flag content.

Story: As a member, I can flag photos or videos so that harmful/low-quality content is reviewed.

Success Criteria:

- Flagged items remain visible until an administrator reviews and decides; visibility never changes automatically.
- The system shall not alter visibility or ranking without explicit administrator action (no shadow banning).
- A work queue item is created and its notification is routed per the Global Behaviors work-queue rules (task type and entity ID only; no sensitive member data).
- Uploader can remove own media anytime without admin approval.
- Multiple flags from same user for same media not counted separately.
- Flagging is rate-limited to prevent abuse; limit is admin-configurable via `media_flag_rate_limit_per_hour` (default: 10 flags per member per hour).
- Flagging is available to members with Tier 1 benefits.

## 3.9 Email

### M_Manage_Email_Subscriptions

Access: Members can manage their mailing-list subscriptions.

Story: As a member, I can manage my mailing list subscriptions so that I control IFPA communications.

Success Criteria:

- Member profile includes a subscriptions list with categories: all-members, newsletter, board-announcements, event-notifications, technical-updates, active-player-reminders, announce.
- Member can subscribe or unsubscribe via profile settings.
- System uses the subscriptions list to determine which bulk emails the member receives in each category.
- Changes made in the member's profile are respected by all future bulk emails for those categories.
- Event-specific communications may have separate, explicit opt-ins (for example, event reminders for registered participants).
- Unsubscribe is persistent: once unsubscribed from a category, the member does not receive emails in that category until they explicitly opt back in.
- Subscription changes logged to audit trail.

### M_Unsubscribe_One_Click

Access: The recipient of a bulk email, acting from their mail client without signing in. The signed token in the request is the whole of the authority; no session is involved and none is created.

Story: As a member who has received a bulk email, I can unsubscribe from that mailing list using my mail client's own unsubscribe control, so that I can stop mail I no longer want without hunting for the setting or signing in.

Success Criteria:

- Every bulk send to a subscription-backed mailing list that members may manage carries `List-Unsubscribe` and `List-Unsubscribe-Post` headers, which the recipient's mail client renders as its own unsubscribe control. This is what major receivers expect of a bulk sender, and its absence costs deliverability.
- The control resolves to a platform endpoint that accepts the mail client's POST without a session and without an `Origin` header, and answers success. The mail client shows its own confirmation, so no page is rendered.
- The URL carries a signed token naming exactly one member and one mailing list. Acting on it withdraws that member's subscription to that list and nothing else: no other list of theirs, and no other member's subscription to the same list.
- The token proves only that request. It cannot sign the holder in, read anything, or be edited to name a different member or list; an edited, foreign, or unreadable token changes nothing.
- Every outcome answers alike, whether the token is valid, tampered with, or absent, so the endpoint cannot be used to discover whether an address, a member, or a subscription exists.
- Acting twice is the same as acting once, because mail clients fire the control more than once.
- A subscription an administrator suppressed, or that the mail provider marked bounced or complained, keeps that state: the control withdraws a member's own consent and does not overwrite an operational decision.
- The token carries no expiry, because the control must keep working for as long as the message survives in the member's mailbox. Rotating the platform's signing secret invalidates outstanding controls; the member can still manage subscriptions through `M_Manage_Email_Subscriptions`, which is the affordance every message names.
- A successful withdrawal writes an audit row naming the member and the list. A repeat that changes nothing writes none.
- Transactional email carries no unsubscribe control: it answers an action the member took, and offering to switch it off would let a member turn off their own security mail.
- A list members are not allowed to manage carries no unsubscribe control. The operational alert lists are the case: the platform offers administrators no way to leave them, so a mail-client button that removed one from urgent alerts would grant through the envelope a capability the interface withholds.
- Group email and event-participant email carry no unsubscribe control either. In both, membership of the group or registration for the event is what makes the member a recipient, so there is no mailing preference to withdraw. Each message instead tells the reader in its own text how to act on the site: leave the group from the group's page, or manage the registration from the event's page.

### M_Send_Announce_Email
Access: Tier 2 or Tier 3 members.

Story: As a Tier 2 or Tier 3 member, I can send an email to the IFPA announce mailing list so that I can create community announcements.

Success Criteria:  
- Email form includes: subject, message body, preview.  
- System sends to configured announce list address (default [announce@footbag.org](mailto:announce@footbag.org)).  
- Rate limiting to prevent abuse (admin-configurable).  
- All sends audit-logged (actor ID, subject, timestamp).

## 3.10 Group Membership

Groups (also called committees) are governance, working-group, or social entities distinct from clubs. A member may belong to many groups simultaneously; clubs are capped at two current memberships per member (primary and secondary). Group entities have configurable properties controlled by Admins: `type`, `official` flag, visibility (`policy`), `restrict_membership`, email enable, lifecycle `state`, and optional `parent_group_id` for subcommittees.

One group is planned at launch: the IFPA Board of Directors. The IFPA secretary has ruled that the European Footbag Committee, the Worlds Operating Committee and the International Footbag Committee are archived rather than carried onto the platform. The mechanism is general: administrators stand up any further group through `A_Create_Group` without new code, so which groups exist is data an administrator enters rather than a property of the design. Exactly one group may carry `type='board'`, and that group is the IFPA Board of Directors; only its roster confers standing, and a committee's roster confers no flag and no tier.

A group's lifecycle is one field, `state`, with three values. `active` is the normal state. `inactive` hides the group from the public directory while preserving member access and its mail. `archived` ends the group: it leaves the directory, its mailing list is archived, its roster rows are set not-current, and it accepts no further messages. Group records are never deleted and do not use the soft-delete (`deleted_at`) pattern.

**The standing is the record, and the roster reflects it.** Board standing is conferred in exactly one place, by an administrator through `A_Grant_HoF_BAP_Board_Status`, which sets the IFPA Board flag and Tier 3 and records the underlying tier for later reversion. A `type='board'` group's roster is the published list of who sits on the board and follows that standing rather than conferring it: setting a member's board standing adds their roster row, and clearing it ends that row. The roster confers no flag and no tier by itself, so a roster row can never disagree with the standing it reflects. Board standing and voting are separate facts: a director may hold standing without a vote, because a seat can be filled by appointment under a bylaw provision, or by election ahead of the vote that seats it. Every row on a `type='board'` roster is a director; a group's roster is not the place for observers or advisors.

Each `group_member_affiliations` row records, besides the member and the group: `role` (`owner` or `member`), `office` (free text, e.g. President, Secretary, Treasurer, Director; may be empty), `is_voting` (bool), `seat_basis` (`elected` or `appointed`), `seat_reference` (free text naming the election or the bylaw provision behind the seat), `term_start` (date), `term_end` (date, empty while serving), and `display_order` (integer, for precedence on the roster).

Group communication is composed on the platform and kept there. A group carries no address of its own: the platform accepts no inbound mail, so a member composes on the group page and the platform distributes the message. Every outbound message rides a mailing list, so group mail reaches its recipients through the same send path, archive, and deliverability handling as every other list. A group's list resolves its recipients from the group's current roster when the send fans out; groups have members, and the roster is the single record of who those members are. Subscription rows for a group's list carry deliverability state (bounced, complained, suppressed), and a member who wants no further mail from a group leaves the group.

A group's list sends from a no-reply identity. A reply in a mail client therefore reaches nobody, and replying to a group means composing on the group page, which is what keeps the group's record whole: every message a group has ever sent is on the group page, in the thread it belongs to, and nothing anyone said to the group is missing from it because it happened in somebody's mailbox. That matters most for the IFPA Board, whose business is official rules debate and whose decisions are taken by the platform's own vote stories.

Everything is kept. Group messages, threads, roster rows including ended ones with their offices and term dates, and the audit trail are retained indefinitely, so the composition of the board on any past date and the debate behind any decision are both recoverable. Archiving a group preserves both. The only removal is account erasure clearing the sender identity on a retained message, which leaves the message itself in place.

Group operability rule: A group is considered non-operable if it has zero current owners. Non-operable groups are flagged into the admin work queue for remediation. Admin remediation options include assigning a new owner via `A_Reassign_Group_Owner` or archiving the group via `A_Archive_Group` if defunct.

### M_Browse_Groups_Directory

Access: Logged-in members can browse the directory of public groups. Visitors have no access.

Story: As a member, I can browse a directory of public groups so that I can discover groups I might want to join or learn about.

Success Criteria:

- The directory lists all groups where `policy=public` AND `state='active'`, regardless of whether the viewing member is a current member of those groups.
- Each entry shows: group name, type label, official badge if `official=true`, short description, parent group name if `parent_group_id` is set, and aggregate member count.
- Private groups never appear in this directory, even to current members of those private groups. Members reach their own groups through `M_View_My_Groups`.
- Groups whose `state` is `inactive` or `archived` never appear.
- Directory sortable alphabetically by name (default) or by type.
- Directory is not visible to visitors. Unauthenticated access returns `V_Access_Denied`.

### M_View_My_Groups

Access: Any logged-in member sees their own groups. The list is owner-only: no member sees another member's group list, and a visitor sees nothing.

Story: As a member, I can see the groups I belong to so that I can reach a group whose page I would otherwise have no way to find.

Success Criteria:

- The member's own profile page carries a My Groups section listing every group where the member has a current affiliation, whatever the group's `policy` or `state`, because a private group is reachable no other way and an inactive one is still the member's.
- Each entry shows group name, type label, official badge if applicable, the member's own `office` where set, and links to the group page.
- An entry for a group whose `state` is `inactive` carries the inactive notice; one whose `state` is `archived` is shown as archived and still links to the group page, which renders read-only.
- With no current affiliations the section renders nothing at all, with no empty-state panel.
- The section is never shown on another member's profile, matching the owner-only-slug pattern used elsewhere.

### M_View_Group

Access: All logged-in members can view a public group's page at a non-member view level. Only current group members and Admins can view a private group's page or see the member-only surfaces of a public group. The roster of a `type='board'` group is public to signed-in members, per the criteria below.

Story: As a member, I can view a group's page so that I understand the group's purpose, leadership, membership, and active business.

Success Criteria:

- Public group, non-member viewer: page displays group name, type, official badge if applicable, description, current owner display name(s) and contact, parent group link if applicable, list of subcommittees (groups with `parent_group_id` pointing to this group) if any, aggregate member count, and the roster at its public level: each member's display name, `office`, `term_start` and `term_end`, ordered by `display_order` then by display name. The public level never shows `is_voting`, `seat_basis`, or `seat_reference`. Email composition, the discussion, and ballot capabilities are reserved for current members.
- Who sits on the IFPA Board and in what office is a published governance fact, which is why a `type='board'` roster renders at the public level to any signed-in member. How a seat was filled and whether it votes are internal to the group.
- Private group, non-member viewer: returns `V_Access_Denied`. Private groups never appear in any directory.
- Public or private group, current member viewer: page additionally displays the roster at its member level (adding current Active Player badge where applicable, special flags HoF/BAP/Board, city/country, `is_voting`, `seat_basis`, and `seat_reference`; email shown only if member has opted in to email visibility); the group's discussion per `M_Read_Group_Discussion`; the compose action per `M_Email_Group` if email is enabled and the member is permitted to compose; group-scoped active or upcoming votes per `M_View_Vote_Options` eligibility.
- Group owner viewing their own group: page additionally surfaces owner management actions (`GO_Edit_Group`, `GO_Manage_Members`, `GO_Manage_CoOwners`, `GO_Configure_Email_Settings`) and the per-message delivery counts on the discussion.
- Admin viewing any group: page additionally surfaces admin management actions (`A_Edit_Group_Properties`, `A_Reassign_Group_Owner`, `A_Archive_Group`).
- `state='inactive'` displays a clear "This group is inactive" notice; inactive groups retain member access and mail but are hidden from the public directory.
- `state='archived'` renders the page read-only for members and admins: roster and discussion are readable, and no compose, join, leave, or configuration action is offered.
- Member roster sorted by `display_order` ascending, then alphabetically by display name.

### M_Read_Group_Discussion

Access: Current group members and Admins. A non-member, including a signed-in member viewing a public group, sees that the group has a discussion and no part of its content.

Story: As a group member, I can read everything the group has said to itself, in threads, so that I can follow a debate I joined late and so the group's record is one place rather than scattered across mailboxes.

Success Criteria:

- The group page renders the group's messages as threads: a thread is a message with no parent plus every message answering it, directly or indirectly.
- Threads are ordered by most recent activity in the thread, newest first. Within a thread, messages are in send order, oldest first.
- Each message shows sender display name linked to their profile, subject, full body as plain text, and sent timestamp. Owners and Admins additionally see the recipient count at send time.
- A message whose sender's account has been erased shows the message unchanged, with the sender rendered as a removed member.
- Every message carries a reply action for members permitted to compose, per `M_Email_Group`.
- The discussion is readable for an archived group and accepts no new messages.
- Nothing in the discussion is aged out or deleted. There is no edit and no delete: a correction is a reply, which is what makes the record trustworthy.
- Access is checked per group on every request; a direct link to a message in a group the viewer does not belong to returns `V_Access_Denied`.

### M_Join_Group

Access: Tier 1+ members can self-join groups where `restrict_membership=false` AND `state='active'`.

Story: As a member, I can self-join an open group so that I can participate in its activities and receive its communications.

Success Criteria:

- Join action is available only on groups where `restrict_membership=false` AND `state='active'`.
- Self-join is never available on a `type='board'` group, whatever its `restrict_membership` value: board membership is conferred by IFPA, not taken, and the roster reflects standing an administrator has already set.
- On groups where `restrict_membership=true`, the group page shows an explanation that membership is managed by the group's owners or by Admins, and points the member to `M_Contact_IFPA_Admin` for inquiries.
- Joining creates a `group_member_affiliations` row with `is_current=1`, `role='member'`, `is_voting=0`, empty `office`, `seat_basis`, and `seat_reference`, `term_start` set to the join date, and timestamp.
- If the group has an enabled `MailingList`, the member is a recipient of that list from the moment they join, because the list resolves its recipients from the current roster. The member's own subscription controls do not offer the list; leaving the group via `M_Leave_Group` is how a member stops receiving it.
- Joining sends a confirmation email to the joining member and a notification email to all current group owners.
- Members may belong to an unlimited number of groups simultaneously. There is no per-member cap on group affiliations, unlike clubs.
- Joining is audit-logged with member ID, group ID, timestamp, reason `member_self_join_group`.

### M_Leave_Group

Access: Any current group member can leave a group they currently belong to.

Story: As a group member, I can leave a group so that I am removed from its roster and no longer receive its communications.

Success Criteria:

- Leaving sets the member's `group_member_affiliations.is_current=0` and stamps `term_end` with the leave date for the member-group pair. The row is retained with its `office`, `seat_basis`, `seat_reference`, and `term_start` intact, so the group's past composition stays recoverable.
- Leaving a `type='board'` group is not a member's own action, because the roster reflects standing rather than conferring it. A director leaves the board when an administrator clears their board standing through `A_Grant_HoF_BAP_Board_Status`, which ends their roster row in the same transaction.
- A member who is the sole owner of the group cannot leave directly; the UI surfaces the constraint and routes the member to `GO_Manage_CoOwners` to promote a successor first.
- Leaving a group where the member also held an owner or co-owner role removes that role row in the same transaction.
- If the group has an enabled `MailingList`, the member stops being a recipient of that list on the same transaction that ends their affiliation, because the list resolves its recipients from the current roster.
- A former member no longer reads the group's discussion. What they already received by email is theirs and is not recalled.
- Leaving sends a confirmation email to the leaving member and a notification email to all current group owners.
- After leaving, the system re-evaluates group operability. If the group has zero owners after the leave, the system creates or updates a "Group Needs Owner" admin work queue item.
- Leaving is audit-logged with actor identity, group ID, before and after affiliation state, timestamp.

### M_Email_Group

Access: Tier 1+ members can post a message to a group via web form, subject to the group's `restricted_sending` flag. Composing on the group page is the only way to write to a group: the platform accepts no inbound mail and the group's list sends from a no-reply identity.

Story: As a member, I can post a message to a group so that I can put something to the group's members, have it delivered to them by email, and have it kept in the group's record.

Success Criteria:

- The compose form is available only for groups with email enabled by Admin (`email_enabled=true`) and `state` of `active` or `inactive`. An archived group accepts no messages.
- If `restricted_sending=true` (default for group lists), the compose form is shown only to current group members; a non-member sees that the group can be written to by its members and cannot compose.
- If `restricted_sending=false`, the compose form is available to all Tier 1+ members.
- Form includes: subject, message body, preview. Body is plain text (no HTML), consistent with `A_Send_Mailing_List_Email`.
- A reply carries the parent message's identifier and its subject, and the member edits neither.
- On submit the message is dispatched through the outbox to the group's `MailingList`, whose recipients are the group's current members at the moment the send fans out.
- Outgoing subject is prefixed by `subject_prefix` if configured, in the form `[prefix] subject`.
- Sender rate-limited per group, admin-configurable (`group_email_rate_limit_per_hour`, default 30 messages per group per member per hour), specified with the platform's other rate limits in the Configurable Parameters section. The limit is an abuse ceiling, not a pacing rule: a member taking part in a live debate posts as often as the debate needs and never meets it, and a runaway client or a member posting in bad faith does.
- Each dispatched message is retained as the group's record, with its parent where it is a reply, carrying subject, body, sender, list, timestamp, and recipient count, and is read on the group page per `M_Read_Group_Discussion`.
- The send honors the bounce and complaint suppression every list send honors, and carries no unsubscribe control. Membership of the group is what makes a member a recipient, so an unsubscribe would either leave them on the roster still receiving, or remove them from a committee, which is a governance act rather than something a mail client's button performs.
- Every group message ends with a standing line telling the reader they receive it as a member of the group, that replies are written on the group's page rather than by replying to the mail, and how to leave the group on the site, naming the group's page and its leave action. That line is part of the message template rather than something a sender types, so it is on every group message and worded the same way each time. It is instructional text, not a link, per the anti-phishing link policy.
- Every send is audit-logged with actor ID, group ID, message ID, action, timestamp.

# 4. Event Organizer Stories

Event Organizers are members who create events. Organizers can invite up to 4 co-organizers who share identical event management permissions. Members can organize multiple events simultaneously. Organizer permissions are event-scoped, meaning that being an organizer (or co-organizer) for one event grants permissions only for that event. Any EO can send bulk emails to registered participants, upload results, and the other functionality specified below.

Members with Tier 1 benefits can create basic/local events; Tier 2 or Tier 3 required for sanctioned and paid events.

## 4.1 Event Lifecycle

### Event Status Lifecycle

Valid event statuses and their transitions:

- `draft`; initial state on creation.
- `pending_approval`; sanction request submitted for admin review (from `draft`). Charging any fee requires sanctioning, so every paid event is a sanctioned event and one approval decides both.
- `reg_open`; visible and open for registration. Free events transition `draft → reg_open` on creation. Sanctioned events, which includes every event that charges a fee, transition `pending_approval → reg_open` on admin approval. A rejected request returns to `draft` (`pending_approval → draft`), where the organizer can revise it and resubmit.
- `closed`; registration deadline passed or organiser manually closed registration (from `reg_open`).
- `completed`; event has concluded and results may be posted (from `closed`). The `completed` state is terminal. Events with published results cannot be canceled, deleted, or transitioned to any other status.
- `canceled`; event canceled at any point before `completed`; registrants are notified. The `canceled` state is terminal; canceled events cannot be re-opened or completed. A canceled event never surfaces publicly: no event detail page, no year-archive listing, and no result rows on any public results view (historical-person and player pages included), regardless of how result rows came to exist.

No other status values are valid. All queries and conditional logic must use only these canonical strings. The status names the registration lifecycle, distinct from results publication: `reg_open` means registration is open, and results are published separately once the event is `completed`.

Every event created on the platform is an event officially registered through the IFPA website, which is the qualifying condition the IFPA membership structure sets for Active Player grants. Attendance marking therefore applies to every platform event.

### M_Create_Event

Access: Members with Tier 1 benefits can create events. This is how a member becomes an Event Organizer.

Story: As a member, I can create an event with all necessary details and optionally configure payment, so that I can become an Event Organizer, and host tournaments and gatherings.

Success Criteria:

- Members with Tier 1 benefits can create basic free events; Tier 2 or Tier 3 members can request sanctioned events and enable paid registration.

Event creation form includes: title, description, start date, end date, location (city, state or province (optional), country), registration deadline, competitor registration fee (optional, requires Tier 2 or Tier 3 and admin approval to set up), participant (spectator) fee (optional), t-shirt size (optional).

The organizer then adds the disciplines the event contests. A discipline is a structured record: it names its game, its entry size (singles or doubles), its gender eligibility (open, women's, or mixed), and its class (novice, intermediate, open, or masters). The display name, for example "Women's Singles Net" or "Intermediate Doubles Net", is generated from those parts. Mixed is the doubles entry size with mixed gender, so a mixed doubles discipline is the pairing of those two parts.

The game comes from a maintained list per category (net, freestyle, golf, sideline), and each game declares which entry sizes, genders and classes apply to it, so the form offers doubles for routines and singles for a thirty-second shred. The lists are reference data seeded into the database and maintained without a software release; IFPA ratifies their contents through the published competition rules. Where an event runs a game the lists do not yet carry, the organizer supplies the game name directly and still chooses the entry size, gender and class from the standard parts, so the discipline stays legible while its game is new.

Social kicking, also called free-flow or cooperative kicking, and circle kicking are recreational forms of the sport rather than competitive formats, so the game lists carry the contested formats only.

- Members with Tier 1 benefits can create basic/local events without fees.
- Tier 2 or Tier 3 members can request sanctioned events and configure paid registration (subject to admin approval). Payment configuration (if enabled): competitor registration fee, (optional) spectator fee.
- Sanction request sends notification to admins for review and an email to the IFPA Sanctioning Director, and such events are only published upon approval.
- Organizer sees a clear success message when event is created.
- Organizer sees clear error messages for validation failures with hints about what to fix.
- Member gains Event Organizer status for this event (only).
- An Event Organizer may organize more than one event at a time.
- For free events, event status changes to `reg_open`, Email sent to all event organizers to confirm. Event will appear in Upcoming Events list. For sanctioned events, which includes every event that charges a fee, these actions wait for Admin approval. The news item this emits ships with the news feed in version two.

### EO_Request_Sanction

Access: Event organizers with Tier 2 or Tier 3 membership can request IFPA sanctioning for an event they organize.

Story: As an event organizer with Tier 2 or Tier 3 membership, I can request IFPA sanctioning for my event so that it gains credibility and access to paid registration (upon admin approval).

Success Criteria:

- Only Tier 2 or Tier 3 organizers can request sanction.
- Sanctioning is requested and decided entirely in the platform. The organizer submits no application by email, and the request reaches the administrator as a work-queue item rather than as correspondence.
- Submitting the request emails the IFPA Sanctioning Director directly, carrying the event details and the organizer's details, so the officeholder can take it up with the organizer before the decision is made. The Sanctioning Director also holds an administrator account and sees the request in the admin work queue like any other administrator; the direct email is required in addition, because a queue entry alone does not reach the officeholder. It is addressed to the officeholder's own address, because the apex sanctioning alias carries inbound correspondence and forwards it onward, and platform mail keeps its bounce and complaint signal by going direct. It is sent through the platform's own mail path so it is templated, logged and bounce-tracked like every other platform mail.
- The request form carries the organizer's sanctioning attestation, which the organizer must affirm to submit: that the event will abide by IFPA's guidelines for sanctioned events, that it will use IFPA-approved formats and judging systems or disclose where it deviates, and that any alternative judging system will be communicated to all players in advance of competition.
- The request form carries a fee justification when the organizer has configured registration fees.
- Organizer receives email confirmation that request is pending.
- Sanction status visible on event detail page: pending, approved, rejected.
- Approved sanction enables paid registration when fees are configured; a sanctioned event that charges nothing is equally valid.
- Rejected sanction includes admin reason for rejection, and the event returns to `draft` so the organizer can revise and resubmit.
- All sanction requests audit-logged.
- Submitting the request moves the event to `pending_approval`, notifies admins, and appears in the Admin work-to-do queue.

### EO_Edit_Event

Access: Event organizers can edit events they are assigned to, within the constraints for free vs sanctioned events.

Story: As an event organizer, I can edit event details so that I can update information or correct errors.

Success Criteria:

- All fields may be edited except free/sanctioned status.
- Co-organizers can edit all event fields.
- All edits audit-logged with organizer ID, fields changed, old values, new values, timestamp.
- Organizers see a clear success message when event is updated.
- Organizer sees clear error messages for validation failures.
- Organizers can add, rename, or remove disciplines on an existing event before the first registration in that discipline is confirmed. After the first confirmed registration, destructive changes to that specific discipline require admin override.
- << V2 SCOPE >> Ships with routine music in version two: organizers can mark any discipline on the event as `requires_routine_music=true` (default `false`). The flag is freely editable until the first registration in that discipline is confirmed; after the first confirmed registration, changes to this flag for that discipline require admin override with a documented reason.
- Organizers can enable or disable the event's online registration acceptance via a toggle that stops new registrations without changing event status. This is the granular alternative to `EO_Close_Registration`, which closes the entire registration window irreversibly.

### EO_Delete_Event

Access: Event organizers can delete their own events only when allowed by status (for example, drafts without registrations), following the event-lifecycle rules.

Story: As an event organizer, I can delete my event so that I can remove canceled or duplicate events.

Success Criteria:

- Cannot delete event with confirmed registrations; an event that has taken registrations is canceled rather than deleted (see `EO_Cancel_Event`), so the record and its registrants' history survive.
- Deletion is permanent (hard delete). The event record is immediately removed from the database, except that events with published results are never deleted, as they are preserved permanently for historical record.
- Deleted events are hidden from public listings immediately upon deletion.
- All participants notified via email of event deletion.
- Deletion audit-logged with organizer ID, reason, timestamp.
- Organizer sees confirmation dialog before deletion: "Delete Event Name? This permanently removes the event and notifies all X registered participants."

### EO_Cancel_Event

Access: Event organizers can cancel an event they organize at any status before `completed`. Administrators can cancel any event (see `A_Correct_Event_Data`).

Story: As an event organizer, I can cancel my event so that registrants are told it is not happening and the event stops appearing publicly, while the record of it survives.

Success Criteria:

- Organizer can cancel an event in `draft`, `pending_approval`, `reg_open`, or `closed` status. A `completed` event cannot be canceled, and a canceled event cannot be re-opened.
- Cancellation requires a reason entered by the organizer.
- All registrants are notified by email of the cancellation, and the reason is included.
- The event moves to `canceled` and stops surfacing publicly per the event-status lifecycle.
- For an event with paid registrations, the confirmation screen states that refunds are arranged by the IFPA Treasurer outside the platform, so the organizer knows cancellation does not refund anyone by itself.
- Cancellation is audit-logged with actor ID, event ID, reason, registrant count notified, and timestamp.
- Organizer sees a confirmation dialog before cancelling: "Cancel Event Name? This notifies all X registered participants and cannot be undone."

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
- Participant list and exports include registration type (Competitor/Attendee-Supporter), selected disciplines (if competitor), and partner/team fields (if applicable).

Impact: For events officially registered through the IFPA website (including sanctioned events), the participant list supports marking confirmed participants as "Attended" after the event ends. Organizers can mark individual participants or use bulk-select to mark multiple participants at once. All attendance marks and any resulting Active Player grants or extensions are audit-logged with: actor member ID, affected member ID, event ID, old Active Player expiry, new Active Player expiry, timestamp, reason "official_event_attendance".

When a participant is marked Attended:

- If the member is Tier 0 with no current Active Player status, grant Active Player for 730 days from the event end date. For a single-day event, the event date is used. If the event end date is unknown, the event start date is used.

- If the member is Tier 0 with current Active Player status, extend Active Player only if the new expiry date (computed as above) would be later than the existing expiry date. An older event must not shorten an existing later Active Player expiry date.

- If the member is Tier 1, Tier 2, or Tier 3, the action is a no-op for membership and Active Player; attendance is recorded but no Active Player grant occurs because Active Player applies only to Tier 0.

- Attendance marking never changes membership tier.

### EO_Cancel_Registration

Access: Event organizers can cancel a registration in an event they organize. Administrators can cancel any registration (see `A_Correct_Event_Data`).

Story: As an event organizer, I can cancel a participant's registration so that my participant list matches who is actually coming.

Success Criteria:

- Organizer can cancel any registration in their event, at any point before the event reaches `completed`.
- Cancellation requires a reason entered by the organizer.
- The registration moves to `canceled` and leaves participant lists, exports, check-in, and event email.
- The member is notified by email that their registration was canceled, and the reason is included.
- For a paid registration, the confirmation screen states that any refund is arranged by the IFPA Treasurer outside the platform.
- Cancellation is audit-logged with actor ID, affected member ID, event ID, reason, and timestamp.

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
- Export includes only confirmed participants (not pending or canceled).
- Export filename: eventname_participants_YYYYMMDD.csv
- Participant list and exports include registration type (Competitor/Attendee-Supporter), selected disciplines (if competitor), and partner/team fields (if applicable).

### EO_View_Registration_Summary

Access: Event organizers can view a per-event registration summary dashboard for events they organize.

Story: As an event organizer, I can view a registration summary dashboard for my event so that I can plan logistics, fees, and t-shirts at a glance.

Success Criteria:

- Dashboard is scoped to a single event and accessible only to that event's organizer(s) and Admins.
- Dashboard displays: total registered count, breakdown by registration type (Competitor / Attendee-Supporter), per-discipline registration counts, payment status summary (paid / pending / failed counts and amounts in the event's currency), registration timeline (count per day from registration open to current time).
- Dashboard displays t-shirt size summary if the event collects t-shirt sizes.
- << V2 SCOPE >> Ships with routine music in version two: for disciplines with `requires_routine_music=true`, dashboard displays a routine-music status summary, counting registrations with a file uploaded against those still missing one.
- Counts update via SQL query on demand; no caching beyond standard request scope.
- Dashboard view is audit-logged with organizer ID, event ID, timestamp.

### EO_Export_Check_In_Template

Access: Event organizers can export a printable check-in template for their events.

Story: As an event organizer, I can export a printable check-in template so that I can run on-site check-in with a paper or PDF roster.

Success Criteria:

- Export generates a print-styled HTML page or PDF, admin-configurable via `checkin_template_format` (default `html`). Distinct from the CSV produced by `EO_Export_Participants`.
- Each row includes: participant display name, registration type, selected disciplines, partner or team info if applicable, payment status, a check-in checkbox column, and a notes column.
- Rows are sorted alphabetically by participant display name (default) or by registration type.
- Document title or filename format: `eventname_checkin_YYYYMMDD`.
- Export action is audit-logged with organizer ID, event ID, format, timestamp.

## 4.3 Communication

### EO_Email_Participants

Access: Event organizers can send an email to participants of their events.

Story: As an event organizer, I can send an email to all registered participants so that I can communicate important event information.

Success Criteria:

- Email form includes: subject, message body, preview.
- Email sent to all confirmed participants (not pending or canceled).
- Sent through the outbox to the event's confirmed participants, honoring the bounce and complaint suppression every send honors. The send carries no unsubscribe control: a participant is a recipient by having entered this event, so the thing to withdraw from is the registration, not a mailing preference, and an unsubscribe header here would offer something it cannot do.
- Send rate limited to prevent abuse: maximum 1 email per event per day.
- All bulk emails audit-logged with organizer ID, event ID, recipient count, subject, timestamp.
- Organizer sees confirmation: "Email sent to X participants."
- Recipients are event registrants (competitors and attendee/supporters).
- Email body is plain text (no HTML).
- System stores an archive record of each sent event email (subject, body, sender, timestamp, recipient count) visible to the organizer for that event and to admins globally.

## 4.4 Results Publishing

### EO_Upload_Results

Access: Event organizers can upload results for events they organize.

Story: As an event organizer, I can upload event results so that participants and the community can view outcomes, and so the results are recorded completely enough to compute rankings from later.

Success Criteria:

- Results upload accepts CSV with enough information to create `event_results_uploads`, `event_result_entries`, and `event_result_entry_participants` database rows for singles and multi-participant placements (if that data is available for the event).
- The upload is a two-step flow: the file is parsed into a preview the organizer reviews, and nothing is written to the event's public results, no participant profile is touched, and no attendance step runs until the organizer commits that preview.
- The preview reports, per row, whether each named participant matched a confirmed registration in that event. Matching is quality assurance rather than a gate: an unmatched participant is flagged for the organizer to correct or accept, and accepting one records the participant by display name without a member link. This is expected rather than exceptional, because partners change on the day, non-members compete, and competitors are moved between disciplines as entries are combined or split at the event.
- The preview refuses to commit a file that is malformed as results: a placement missing, a discipline the event does not carry and the organizer has not confirmed as contested, or a duplicate placement that the organizer has not declared as a tie.
- Each group of results names the discipline that actually ran, whether or not it matches what the event advertised beforehand.
- Ties are recorded as a shared placement: tied competitors take the same, lower place and the next place is skipped, as the IFPA competition rules specify.
- Results record every competitor's placement, down to last place, and carry the scores of matches played where the discipline produces them, so a later ranking computation has the inputs the IFPA rules require without the organizer being asked for the data twice.
- Results visible on event detail page after commit.
- Results displayed as sortable table.
- Results also added to participant profiles (if participant linked to member account).
- Results publication emits a news feed item, which ships with the news feed in version two; in version one results publish on the event page directly.
- Only organizers can upload results.
- Results upload audit-logged, including the committed upload's row count and the count accepted without a registration match.
- Results can be uploaded for any event (sanctioned status does not affect results posting).
Impact:

For events officially registered through the IFPA website (including sanctioned events), uploading results triggers a two-step attendance confirmation process: Step 1: Automatic attendance for winners: any member accounts appearing in the uploaded results are automatically marked as "Attended". Step 2: Attendance confirmation for non-placing participants: after results upload completes, the system displays an attendance confirmation screen showing all registered participants (confirmed registrations) who do NOT appear in the uploaded results with checkboxes, allowing the organizer to verify additional attendees. For each confirmed Tier 0 attendee, the system grants or extends Active Player status for 730 days from the event end date (single-day event: event date; unknown end date: event start date). An older event must not shorten an existing later Active Player expiry date. For Tier 1, Tier 2, or Tier 3 attendees, attendance is recorded but no Active Player grant occurs because Active Player applies only to Tier 0; attendance never changes membership tier. All attendance confirmations and resulting Active Player grants/extensions are audit-logged with: organizer member ID, affected member ID, event ID, old Active Player expiry, new Active Player expiry, timestamp, reason "official_event_attendance". Tier 0 members who receive or extend Active Player status are sent a notification email explaining they received Active Player status for participating in Event Name, including the new expiry date and a brief explanation of Tier 1 benefits while Active Player status is current.

## 4.5 Music Operations

<< V2 SCOPE >> Routine music is version-two scope, shipping with the freestyle routine
disciplines it serves. The stories in this section are design intent for that build and are
not part of the v1 launch.

Organizer-side audio operations during events. The scope is routine-music playback; draws, seeding, scheduling, live scoring and the rest of the tournament day are in Tournament Operations below.

### EO_Play_Routine_Music

Access: Event organizers can list, play, and download routine-music files attached to registrations in events they organize.

Story: As an event organizer, I can list and play the routine-music files for my event so that I can play the correct music during each competitor's performance.

Success Criteria:

- List shows all routine-music files currently attached to confirmed registrations in the event, grouped by discipline and sorted alphabetically by competitor display name within each discipline.
- Each entry shows: competitor display name, partner or team info if applicable, discipline, the per-attachment label (the attachment's override if set, otherwise the library default), original filename, file size, upload timestamp.
- Organizer can play any attached file directly in the browser via short-lived signed URLs; playback is HTML5 audio with standard controls (play, pause, seek, volume).
- Organizer can download any attached file for offline use during the event.
- Files persist indefinitely on the member's S3 library (see `M_Upload_Routine_Music`); organizer access is gated by the attachment row remaining present and the organizer being assigned to the event.
- If a competitor deletes a library file that was attached to a past or current registration, the corresponding entry in this list shows a tombstone "Deleted by competitor" with no playback or download. The attachment metadata (event, category, competitor identity, label) is preserved for audit and historical reference.
- All listing, play, and download actions are audit-logged with organizer ID, event ID, file ID, action, timestamp.

## 4.6 Tournament Operations

<< V3 SCOPE >> Native tournament-day operations are version-three scope, to be complete in time
for Worlds 2027. These stories are design intent for that build and are not part of the v1 launch.
They cover net, which runs on seeded pools and elimination draws, and freestyle, which runs on
pools judged by a panel; golf scoring is a third format that the same machinery accommodates.

Until this build lands, IFPA net championships run on an external tournament product under an
IFPA organization account, and their draws, match scores and cross-event player history live
there rather than on the platform. From Worlds 2027 the platform runs them, and that record is
imported.

How the published rules bind these stories: where a rulebook states a requirement, the platform
holds the organizer to it. Where a rulebook recommends, the platform supplies the recommended
value as the default, lets the organizer change it, names the rule the change departs from at the
moment it is made, and records the departure with the discipline's results so a later dispute and
a later ranking both see what was actually run. Organizers decide the details their venue and
their day demand.

### EO_Configure_Tournament_Disciplines

Access: Event organizers and co-organizers, for events they organize.

Story: As an event organizer, I can define the disciplines my tournament actually contests so that
entries, seeding, draws, scheduling and results all hang off one discipline list.

Success Criteria:

- A discipline is the structured record defined in `M_Create_Event`: its category, its game, its
  entry size, its gender eligibility and its class, with the display name generated from those
  parts. The vocabulary is singles or doubles for entry size, open, women's or mixed for gender,
  and novice, intermediate, open (also called pro) or masters for class, so mixed doubles is the
  doubles entry size with mixed gender. Gender is enforced at entry; class is self-selection.
  The older names in the historical record are superseded aliases for these, stay exactly as they
  were run, and carry the structured parts where those can be inferred confidently. An event
  carries as many disciplines as it contests, and a competitor may enter more than one.
- A discipline carries its scoring system, from the approved set its category publishes. For net
  those are classic side-out scoring, rally scoring, and game-set-match, where games run to four
  points, six games make a set and a match is the best of three sets, so the match structure
  differs by system and the model carries sets as well as games. The tournament director chooses
  per discipline, competitors are told which system at least twenty-four hours before play, and the
  system stays fixed for every round of that discipline, which the rules state as a requirement
  rather than a recommendation.
- A discipline carries its match format: how many games decide a match, the points that win a game,
  whether a game must be won by two, and any points cap. Defaults come from the IFPA published
  rules for that category, an organizer may vary them, and the variation is recorded with the
  discipline's results.
- A discipline's match format can differ by where the match sits in the draw, because the published
  rules already do this: net's double-elimination default is best of three games to eleven in the
  winners' bracket, a single game to fifteen in the losers' bracket, and best of three games to
  fifteen for the last four matches of the event, meaning the final, the winners'-bracket final,
  and the last two losers'-bracket matches. The format is therefore set per bracket and per round
  within a discipline, with the rulebook's pattern offered as the default.
- Disciplines can be combined, split, or renamed after entries open, and every entry, draw and
  result follows the change rather than being re-keyed by hand.
- Discipline setup and every later change to it are audit-logged.

### EO_Manage_Discipline_Entries

Access: Event organizers and co-organizers, for events they organize.

Story: As an event organizer, I can manage who is entered in each discipline, including doubles
pairs, so that the draw is made from an accurate entry list.

Success Criteria:

- An entry is one competitor for a singles discipline and one team for a doubles or mixed discipline.
  A team is an entity in its own right: it has its own entry, seed, draw position and result.
- A team entry survives the day: a partner can be added, replaced, or removed after entry, an
  entry can sit incomplete while a partner is sought, and the change is recorded rather than
  overwriting the original pairing silently.
- An entry links to a platform member where one exists and otherwise records a display name and
  country, because non-members compete and partners are found on site.
- Entries carry the state the day needs: entered, waitlisted, checked in, withdrawn, no-show.
- Entry caps, entry deadlines and withdrawal deadlines are per discipline.
- Entry changes are audit-logged with who made them.

### EO_Check_In_Competitors

Access: Event organizers and co-organizers, for events they organize.

Story: As an event organizer, I can check competitors in per discipline before the draw is made so
that no-shows do not end up in the bracket.

Success Criteria:

- Check-in is per discipline and per entry, works from a phone at the venue, and shows who is still
  outstanding as the deadline approaches.
- An entry not checked in by the discipline's check-in deadline is marked no-show and is excluded
  from the draw, and the organizer can reverse that up until the draw is made.
- Check-in state is visible to every organizer of the event at once.

### EO_Seed_Discipline

Access: Event organizers and co-organizers, for events they organize.

Story: As an event organizer, I can seed a discipline so that the strongest competitors do not meet
in the first round.

Success Criteria:

- The system proposes a seeding order from the IFPA rankings where the discipline's category
  carries them, and from prior results at the same event series otherwise. The proposal is a
  starting point, never a lock.
- The organizer can set, reorder and remove seeds by hand, and the final seeding is what the draw
  uses.
- The number of seeds is the organizer's choice within what the draw size allows.
- Separation rules are applied when the draw is made: seeds are distributed across pools or
  bracket quarters, and the organizer can additionally ask that competitors from the same country
  or the same club be separated where the entry count allows.
- Seeding into a subsequent round follows the pool result, and defaults to the constraint the net
  rules set: a pool runner-up is seeded no higher than one above the number of pools and no lower
  than twice it, and competitors level on match record are separated by their initial seeding.
- The seeding used for a discipline is retained with its results, so a later ranking computation
  and a later dispute both have the input that was actually used.

### EO_Generate_Draw

Access: Event organizers and co-organizers, for events they organize.

Story: As an event organizer, I can generate the draw for a discipline so that play can start.

Success Criteria:

- A discipline's draw is one of: round-robin pools that qualify competitors into a main elimination
  draw, a single elimination draw, a double elimination draw, or a round robin that stands alone
  and decides placement on standings.
- A double elimination draw carries a winners' bracket and a losers' bracket, as the net rules
  describe: a first loss moves a competitor to the losers' bracket, a second loss ends their
  event, and the losers'-bracket winner meets the winners'-bracket winner in the final, where the
  unbeaten finalist can take the title in one match. This is distinct from a consolation draw,
  whose winner wins that bracket alone and meets no other bracket's winner.
- Pool play supports uneven pool sizes. Pools default to the sizes the net rules recommend, three
  to five with five avoided where time is short, and the number of pools and the number qualifying
  from each are the organizer's choice, with the rules' default of the top two advancing offered.
- Within a pool, the order of matches defaults to the sequence the published rules set out for
  that pool size, including which pairs of matches are played simultaneously in pools of four and
  five, and the organizer can reorder it.
- An elimination draw supports byes, a consolation or back draw, and a third-place playoff.
- A freestyle discipline runs on pools throughout rather than on a bracket, and the platform carries
  that shape: pools sized as the freestyle rules recommend, competitors advancing from preliminary
  pools through a qualifying round to a final, running order ranked so the top seed performs last,
  and the option to place competitors from more than one discipline in a single pool so a panel can
  judge them together while each is placed only against their own discipline.
- Pool standings are computed and shown: matches played, won and lost, match record, game record,
  total points for and against, and standings points. Placement within a pool follows the net
  rules: match record first, then the head-to-head result where two competitors are level. Where
  three or more are level in a circle that head-to-head cannot break, the rules' own order applies:
  the highest ratio of games won to games lost across every match played in the pool, including
  those against competitors outside the tie, then the fewest points conceded in games won against
  the others in the tie. A tie surviving all of them is surfaced for the organizer to break, which
  is where the rules put it too.
- A draw can be regenerated before its first match is played, and after that it is edited rather
  than regenerated: an entry can be replaced by an alternate, and a walkover, retirement or
  disqualification is recorded on the match rather than by rewriting the bracket.
- Draw generation records the seeding and the method used, and is audit-logged.

### EO_Schedule_Matches

Access: Event organizers and co-organizers, for events they organize.

Story: As an event organizer, I can schedule matches onto courts and times so that the event runs
without collisions.

Success Criteria:

- The event carries its playing surfaces (courts or fields) and their availability windows, and a
  match is assigned to a surface and a time slot or to a running order on that surface.
- The schedule refuses, or warns on, a competitor assigned to two matches at once, including a
  competitor entered in more than one discipline, and a match scheduled before the match that feeds
  it has been played.
- The order of play is publishable and re-orderable during the day, because tournaments run late.
- An official can be assigned to a match where the discipline uses officials.

### EO_Record_Match_Result

Access: Event organizers, co-organizers, and anyone an organizer designates as a scorer for a
surface or a discipline.

Story: As whoever is running a court, I can enter a match result from my phone as it finishes so
that the draw advances and spectators see it immediately.

Success Criteria:

- Entry is per game, in the discipline's match format, and the match's winner and the advancement
  that follows are computed rather than typed.
- A match can also be closed as a walkover, a retirement, a disqualification or a no-show, with
  the reason recorded.
- Entering a result advances the winner into the next draw position and recomputes the affected
  pool standings without any further step.
- The screen is usable one-handed at the side of a court, shows only the match being scored and
  what comes next on that surface, and needs no page hunting between matches.
- A result entered while the connection is down is held on the device and submitted when the
  connection returns, and the person entering it can see which of their results have landed.
- Every result carries who entered it and when.

### EO_Correct_Match_Result

Access: Event organizers and co-organizers, for events they organize.

Story: As an event organizer, I can correct a result that was entered wrongly so that the draw and
the standings are right, without losing what was originally recorded.

Success Criteria:

- A committed result can be corrected, including after the winner has advanced, and every
  downstream draw position and pool standing recomputes.
- A correction that would unmake a match already played is refused, and the organizer is told what
  blocks it and what to undo first.
- The original result, the correction, and who made each are all retained and audit-logged.

### EO_Configure_Freestyle_Judging

Access: Event organizers and co-organizers, for events they organize.

Story: As an event organizer, I can set up how a freestyle discipline is judged so that judges score
into the platform and placings come out of it.

Success Criteria:

- A freestyle discipline names the judging system it runs. The judging systems are an extensible set
  the platform holds as reference data, so one is added or amended between events without a
  software release. The published freestyle rules are where each system's criteria and formula
  live; the platform implements them rather than restating them.
- The platform computes the systems it carries, and for a system it does not yet carry it records
  the placings and scores the panel produced, on the same path an uploaded result takes. A
  director whose chosen system is not yet computed still runs the discipline on the platform.
- A judging panel is assigned per pool. Competitors may be assigned to judge other pools, which is
  how the sport staffs a panel, and pool assignments and judging assignments are published
  together so the day can be planned from one sheet.
- A competitor who does not appear for a judging assignment is flagged on the discipline, and what
  follows is the tournament director's to decide and to record.
- Where a system counts difficulty from add values, the count is entered by two people in the
  roles the rules describe: one calling the add value of each move aloud, one recording it, with
  an explicit correction action for a miscall.
- Judging setup and every later change to it are audit-logged.

### EO_Score_Freestyle_Run

Access: Judges assigned to a pool, and the event's organizers and co-organizers.

Story: As a judge, I can score a run from my phone at the side of the circle so that the standing
updates as soon as the panel has finished.

Success Criteria:

- The screen shows only the competitor being judged and what comes next in the pool, and takes the
  criteria the discipline's judging system asks that judge for.
- A score entered while the connection is down is held on the device and submitted when it
  returns, and the judge can see which of their scores have landed.
- Once every judge on the panel has submitted for a competitor, the run's result is computed and
  the pool standing updates without a further step.
- A judge can correct a score they entered until the pool closes; after that a correction is the
  organizer's, and both the original and the correction are retained.
- What a panel has completed becomes public; a partly judged run does not.
- Every score carries the judge who entered it and when.

### EO_Print_Tournament_Sheets

Access: Event organizers and co-organizers, for events they organize.

Story: As an event organizer, I can print the paperwork the day runs on so that the tournament
survives a venue with no usable network.

Success Criteria:

- Printable, page-sized output for: the draw sheet of a discipline, its pool sheets, blank and
  partly filled match score sheets, the order of play for a surface, and the entry list of a
  discipline.
- Output is a document the organizer can save and reprint, and it carries the event, discipline,
  and the time it was produced, so a stale sheet on a wall is identifiable as stale.
- Printed sheets are produced from the current state of the draw at the moment they are made, and
  producing them changes nothing.

### V_Follow_Live_Tournament

Access: Public. This is the public surface of the tournament-operations build.

Story: As anyone following the event, I can watch the draws, scores and standings update as the
tournament is played.

Success Criteria:

- The event page carries, per discipline, the current draw, the pool standings, the completed match
  scores, and what is on court now or next, and it updates as results are entered without the
  reader reloading.
- Each competitor shown links to their platform profile where they have one, and carries their
  country.
- The page is usable on a phone at the venue and readable on a projection screen at the site.
- What is shown is what has been committed by a scorer; nothing provisional is public.

### EO_Finalize_Discipline_Results

Access: Event organizers and co-organizers, for events they organize.

Story: As an event organizer, I can finalize a discipline so that its placements become the event's
published results.

Success Criteria:

- Finalizing computes every competitor's placement down to last place from the draw and the pool
  standings, applying the IFPA tie convention that tied competitors take the same, lower place and
  the next place is skipped.
- For a freestyle discipline, the placings come from the final round alone, with earlier rounds
  feeding the seeding rather than the score, and a tie within a pool is broken as the freestyle
  rules direct: counting how many judges placed each tied competitor first, then second, and on
  down, before the shared-placement convention applies to whatever survives.
- Seeding from one freestyle round to the next follows the rules' principle that a competitor
  keeps their seed unless a lower seed beat them in their own pool, so the whole field is re-seeded
  in order before the next pools are drawn.
- The organizer reviews the computed placements and commits them, and committing writes the same
  event results the platform already publishes, so a tournament run natively and a tournament
  whose results were uploaded from elsewhere are indistinguishable to everything downstream,
  including attendance, Active Player grants, participant profiles and ranking computation.
- The match scores that produced the placements are retained with them, not discarded at
  finalization.
- A discipline cannot be finalized while any of its matches is unplayed, unless the organizer
  records why (an abandoned discipline, a format cut short) and that reason is retained.
- Finalization is audit-logged, and a finalized discipline can be reopened by an administrator.

# 5. Club Leader Stories

Club leadership is a flat set of equal co-leaders (up to 5 per club), each with identical club-editing and member-visible-contact powers; there is no separate head-leader role. The member who creates a club becomes its first co-leader, and a member co-leads at most one club: a club is a local group, so a member leads the club they are local to and is a guest at any other. This is why a member may hold two current club affiliations but only one co-leadership.

## 5.1 Club Lifecycle

Club leadership rule: a club should have at least one co-leader, but a club with none is still a valid, persisting entity: it keeps its roster, stays joinable, and stays listed. A club is reachable through its co-leaders' member-visible contact emails; there is no separate club-level contact field, so a club with no co-leaders simply has no platform-surfaced contact and no platform-side editor until a member steps up. Such clubs surface on a single low-priority "could use a leader" admin list (an opportunity, not a remediation obligation, with no deadline and no escalation); a current member can volunteer to co-lead (see V_Volunteer_To_CoLead), an existing co-leader can invite one, or an admin can assign one. Governance groups are different: a committee with zero owners is genuinely adrift (see §3.10).

### M_Create_Club

Access: Members who do not already co-lead a club and who hold Tier 1 benefits can create a new club. A Tier 0 member without current Active Player status cannot create a club; they first earn Active Player by joining an existing club, attending a qualifying event, or being vouched for.

Story: As an eligible member, I can create a club so that I can become its first co-leader, and organize a local footbag community.

Success Criteria:

- Club creation form includes: club name, description, city, state or province, country. The creator becomes the club's first co-leader, and the club is reached through that co-leader's member-visible contact email; there is no separate club contact field. A club that later loses all co-leaders still persists and surfaces only on the low-priority "could use a leader" admin list (see §5.1).
- A club in a country that writes its addresses with states or provinces must name one, and it is stored as the full name ("New York"), with a submitted two-letter code folded to that name. The requirement exists because the country page groups clubs by state or province only when every club in that country has one, so a single club without it flattens the whole country into one list. This is the opposite of the member location rule, where the region is stored as the two-letter code because that column feeds the Official IFPA Roster and a fixed code is the reconcilable form there. The two are deliberately spelled differently and are never joined. A country with no official state or province set keeps a free-text region, which may be blank.
- The same rule holds wherever a club row is created, not only on this form. Promoting a legacy club candidate applies it too: the candidate's own state wins when it has one, since that value descends from the curated club seed, and otherwise whoever triggered the promotion is asked for it, in the onboarding wizard's club card for a member and in the cleanup queue for an administrator.
- Before creating a club, the form runs a duplicate-prevention check against live clubs, onboarding-visible candidates, and dormant candidates. Exact name plus same country blocks creation and surfaces the existing entry instead, with the option to view it and confirm affiliation. Two clubs never share an exact name within one country: where a match appears, one of the records is junk, and an admin archives that record, which frees the name for creation.
- Near-match candidates (high name similarity in the same country, below the exact-match threshold) trigger a warning that lists the candidates with their location; the creator may proceed if confident the new club is distinct or pick an existing entry. Junk-flagged candidates are not surfaced as potential duplicates.

- The standardised hashtag is `#club_` followed by a slug the creating member supplies, defaulting to a slug of the club's city and overridable by the member. The slug is at least two characters of lowercase letters, digits and single underscores, starts and ends with a letter or digit, and the whole hashtag is globally unique and at most 100 characters.
- Creating a club requires Tier 1 benefits and grants no Active Player period. A Tier 0 member without current Active Player status cannot create a club and is shown that creating requires Tier 1 benefits, with a pointer to the ways to earn Active Player (join an existing club, attend a qualifying event, or be vouched for) or to upgrade their membership tier.
- Leader sees a clear success message when club is created.
- Leader sees clear error messages for validation failures.
- Member becomes the club's first co-leader. A member may co-lead only one club at a time.
- If the authenticated member already co-leads any club, the create-club option is not shown in the UI. If attempted via direct URL or API, the member is shown: "You already co-lead [Club Name]. Clubs are local groups, so you lead your own club and are a guest at any other. To create a new club, step down there first." A member who already holds two current club affiliations is refused for that reason instead, and is asked to leave one first.
- Club display names are not required to be globally unique (for example the name could be "Hacky Crew"). Two clubs may share the same display name. The standardised club hashtag, globally unique, is the canonical identifier. The UI makes the club hashtag visible at creation so leaders understand it is the persistent unique handle.

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
- Inactive is the parked state: the club is out of the active listings and comes back the moment anyone joins, claims or reactivates it. Any co-leader may park a club at any time, and parking is what a club that has simply finished gets. Parking is the co-leader's only lifecycle action on the club record; archiving is for a junk club record, is terminal, and is an admin action.

## 5.2 Leadership Management

### CL_Manage_CoLeaders

Access: Any co-leader can invite a member to co-lead, view the current co-leaders, and step down. Co-leaders are equal; a co-leader cannot remove or modify another co-leader. Removing another co-leader is an admin action (see A_Reassign_Club_Leader).

Story: As a co-leader, I can invite additional co-leaders, see the current co-leaders, and step down, so that I help maintain my club's leadership team.

Success Criteria:

- Any co-leader can invite a member to co-lead, up to a maximum of 5 co-leaders per club. Co-leadership requires Tier 1+ benefits.
- An invited member must accept before the co-leader row is written; acceptance is the member's consent to having their contact email shown to authenticated members. An invitee who already co-leads another club cannot accept (a member co-leads at most one club).
- The invite email states club name and responsibilities and directs the invitee to the standing "volunteer to co-lead" affordance on the club page; accepting is the invitee using it. The invitee must already be a current member of the club (a non-member joins first), and acceptance is their consent to contact-email exposure.
- Upon acceptance, the new co-leader gains club-editing permissions, and their contact email becomes visible to authenticated members.
- Any co-leader can view the list of current co-leaders by name.
- A co-leader can step down at any time via the member dashboard. Stepping down removes only the co-leader role, not club membership; if they were the last co-leader, the club becomes leaderless (a tolerated state per §5.1).
- A co-leader cannot remove or modify another co-leader; that is an admin action (A_Reassign_Club_Leader).
- All co-leader actions (invite, accept, step down, admin removal) are audit-logged, and the acting co-leader sees a clear success message.
- All co-leaders are displayed on the club detail page (names only on the public page). Each co-leader's contact email is visible to authenticated members; holding the co-leader role is the consent and the email cannot be hidden while the role is held. A co-leader's WhatsApp shows to authenticated members only if that co-leader opts in. Provisional (unclaimed) bootstrap entries, and the mirror-inferred affiliation entries shown as provisional leaders for clubs with no bootstrap rows, never show contact information.
- After any co-leader change, a club with at least one co-leader is reachable through that co-leader's contact; a club with zero co-leaders is leaderless (tolerated per §5.1) and surfaces on the single low-priority "could use a leader" admin list under the "Needs Leader" label.

### V_Volunteer_To_CoLead

Access: A current member of a club with Tier 1 benefits (Tier 1+ or Active Player), who does not already co-lead another club, can volunteer to co-lead it.

Story: As a current member of a club, I can volunteer to become a co-leader so that a club without one gains a co-leader and any club can grow its leadership without waiting for an invite.

Success Criteria:

- One service operation backs the volunteer write, reached via the standing "volunteer to co-lead" affordance on the club detail page. The admin "contact members" action in the cleanup queue (A_Periodic_Club_Cleanup) sends an invitation that routes members to the standing affordance; it is not a separate write path.
- Eligibility (all required): the member is a current, confirmed affiliate of the club; has Tier 1 benefits; does not already co-lead another club; the club has fewer than 5 co-leaders; the member is not already a co-leader of this club.
- Volunteering is immediate: an eligible member self-adds as a co-leader of any club, at any time, whether the club is leaderless or already has co-leaders. There is no approval step.
- On a self-add to a club that already has co-leaders, all existing co-leaders are notified that the member joined the leadership. Every volunteer add is audit-logged.
- The new co-leader gains club-editing permissions, and their contact email becomes visible to authenticated members (holding the role is the consent; the email cannot be hidden while the role is held). The member may additionally opt their WhatsApp visible.
- A member who already co-leads another club is shown the one-club rule and directed to step down there first; the standing affordance is not offered to them.
- When a club becomes leaderless, it surfaces in the admin club-cleanup queue (A_Periodic_Club_Cleanup), where an admin can send the volunteer-to-co-lead invitation to the club's current members or park the item; the standing affordance remains available for members to self-volunteer at any time.
- The standing club-page affordance is shown only to a viewer who meets the eligibility rules above.

# 6. Group Owner Stories

Group Owners are members designated by an Admin at group creation time. Owners can invite co-owners who share identical group management permissions. Owner permissions are group-scoped: owning one group grants permissions only for that group. Members may own multiple groups simultaneously.

The group lifecycle (create, archive) is Admin-controlled and lives in `A_Create_Group` and `A_Archive_Group`. Owners do not create or archive groups. Owners can leave the group they own via `GO_Leave_Group` subject to the sole-owner promotion-first rule.

A `type='board'` group is the exception to owner-managed rosters. Its membership reflects board standing, which only an administrator confers, so adding and removing members is an administrator's act and never an owner's, and the governance fields on a roster row (`office`, `is_voting`, `seat_basis`, `seat_reference`, `term_start`, `term_end`, `display_order`) are set only by an administrator through `A_Manage_Group_Roster`. A board group's owner still edits the group's description and notes, configures its mail, and manages co-owners.

## 6.1 Group Management

### GO_Edit_Group

Access: Group owners (including co-owners) and Admins can edit the owner-managed group fields.

Story: As a group owner, I can edit my group's description and member-facing notes so that I keep the group's purpose and announcements current.

Success Criteria:

- Owner can edit: description (long-form text) and short member-facing notes (e.g., next meeting time, agenda link).
- Owner cannot edit: name, type, official, policy (public/private), restrict_membership, email_enabled, state, parent_group_id. Those properties are Admin-only via `A_Edit_Group_Properties`.
- Co-owners can edit all owner-editable fields.
- All edits are audit-logged with actor identity, fields changed, old values, new values, timestamp.
- Owner sees a clear success message on save and clear validation errors otherwise.

### GO_Manage_Members

Access: Group owners (including co-owners) and Admins can add or remove members of the group. On a `type='board'` group this story is Admin-only: its roster grants Tier 3, which is not an owner's to confer.

Story: As a group owner, I can add or remove members of my group so that I maintain the group's roster.

Success Criteria:

- Owner can add any Tier 1+ member to the group by member ID or via member search.
- Owner can remove any current member from the group, subject to the sole-owner protection (an owner cannot remove the only owner; a successor must be promoted first via `GO_Manage_CoOwners`).
- On a `type='board'` group the add and remove actions are not offered to owners at all; the roster is managed by an administrator through `A_Manage_Group_Roster`, which also sets the governance fields on each row.
- On every other group, a row added here carries `is_voting=0`, empty `office`, `seat_basis`, and `seat_reference`, `term_start` set to the add date, and no `display_order`; those fields exist for governance groups and are set by an administrator where they apply.
- Add and remove behavior applies regardless of the group's `restrict_membership` flag; the flag controls only self-join, not owner-driven adds.
- If the group has an enabled `MailingList`, an added member is a recipient of it and a removed member is not, from the moment the roster change commits, because the list resolves its recipients from the current roster.
- Adding a member sends a notification email to the added member and to all current owners.
- Removing a member sends a notification email to the removed member and to all current owners.
- Removing a member sets `is_current=0` and stamps `term_end`; the row and its governance fields are retained, because the group's past composition is part of its record.
- All add and remove actions are audit-logged with actor identity, group ID, target member ID, action, timestamp.
- After any roster change, the system re-evaluates group operability and creates or updates a "Group Needs Owner" admin work queue item if the owner count is zero.

### GO_Manage_CoOwners

Access: Any owner of a group can manage co-owners for that group.

Story: As a group owner, I can add, view, and remove co-owners so that I share group management responsibility. A group owner cannot remove themself if the only owner; they must first promote someone else.

Success Criteria:

- Any owner can add co-owners by member ID; co-owners must be Tier 1+ members (consistent with the Tier 1+ floor enforced for initial owners in `A_Create_Group` and for added members in `GO_Manage_Members`). A group carries as many owners as its work needs.
- System sends an email to a new co-owner with: group name, owner responsibilities.
- Co-owner gains identical group management permissions as the original owner.
- Owners can view the list of all current co-owners; list shows display name, date added.
- Co-owner can opt out of the owner role via the member dashboard.
- The UI hides the remove-self action when the current authenticated owner is the sole owner of the group.
- All co-owner actions are audit-logged.
- After any owner-roster change, the system re-evaluates group operability and creates or updates a "Group Needs Owner" admin work queue item if the count is zero.

### GO_Configure_Email_Settings

Access: Group owners (including co-owners) and Admins can configure the group's mailing-list behavior, when email is enabled by Admin.

Story: As a group owner, I can configure how my group's mail behaves so that group communications match the group's working style.

Success Criteria:

- Configuration view is available only when the group has email enabled by Admin (`email_enabled=true`).
- `subject_prefix` and `restricted_sending` have one owner between them and one seeding point: the administrator sets their initial values when enabling the group's mail in `A_Create_Group` or `A_Edit_Group_Properties`, and the group's owner maintains them from then on. Only an administrator enables or disables the mail itself.
- Owner can toggle `restricted_sending` (bool, default true for group lists). When true, only current group members can compose messages to the group via `M_Email_Group`. When false, any Tier 1+ member may compose.
- Owner can set `subject_prefix` (string, max 32 chars, may be empty). When non-empty, prepended to outgoing subjects in the form `[prefix] subject`.
- Owner cannot enable or disable the group's mail. That is Admin-only via `A_Edit_Group_Properties`.
- The group's list sends from a no-reply identity and the owner cannot change it, because a reachable reply address would take part of the group's record off the platform.
- All configuration changes are audit-logged with actor identity, group ID, field changed, old value, new value, timestamp.

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

Access: Only admins can approve an event's sanction request. A single administrator decides, working the review checklist below; where a request needs an IFPA ruling rather than an administrative decision, the administrator coordinates with the IFPA board outside the platform and records the outcome in the approval reason. Paid registration is enabled only after an event's sanction request is approved, so an event that charges fees is always a sanctioned event; a sanctioned event that charges nothing is the ordinary case and needs no payment configuration.

Story: As an admin, I can approve or reject an event's sanction request, and with it any payment configuration the organizer has proposed, so that sanctioned events meet IFPA's requirements.

Success Criteria:

- Review event details, the organizer's sanctioning attestation, and any fee structure in the approval queue.
- Approve or reject with reason.
- On approval: event status changes to `reg_open`, payment configuration enabled where the organizer configured fees, Email sent to all event organizers to confirm. Event will appear in Upcoming Events list. The news item this emits ships with the news feed in version two.
- On rejection: event status returns to `draft`, Outbox sends organizer notification with reason, and the organizer can revise and resubmit.
- Payment approval is event-specific configuration, not persistent eventOrganizer permission (which is separate).
- All approval actions logged.
- Admin reviews pending sanction requests in the admin work queue, where submitting a request raises an item; the event itself holds `pending_approval` status until the decision is made.
- Admin can see: event details, organizer history, the organizer's sanctioning attestation, fee amount where fees are configured, organizer tier status.
- Approval marks the event as sanctioned, and enables paid registration when the organizer configured fees.
- A single administrator's approval completes the decision; no second approver and no in-app committee step is required.
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
- The All Payments view allows filtering and sorting by type, date range, status, member, event, and payment reference, and shows at least: type, date, amount, currency, status, related member ID, the related event where the payment is a registration fee, resolved through the registration that carries both, and Stripe payment reference. Clubs take no payments, so no payment carries a club.
- For donation payments, the admin can see the member’s donation comment as a read-only field when viewing payment details, so that reconciliation and investigations can take the comment into account without allowing admins to edit it.
- A nightly worker (or equivalent scheduled job) performs reconciliation against Stripe (or the payment provider) and records mismatches (for example missing webhooks, amount discrepancies, status mismatches, or unexpected duplicates).
- The Reconciliation Issues view includes a status filter with options: Outstanding (default) / Resolved / All. Resolved reconciliation issues show: admin who resolved the issue, resolution timestamp, resolution note explaining action taken. This allows multiple administrators to see what reconciliation issues have already been handled and by whom.
- A periodic summary is sent at the configured cadence (default: every 30 days, keyed by `reconciliation_summary_interval_days`) to the IFPA treasurer contact address (`ifpa-treasurer@footbag.org`, from the canonical address list in the design decisions), carrying outstanding discrepancies oldest first and the ones resolved during the period, each naming who resolved it and when, and stating which provider mode the last pass compared and how many local rows of the other mode it set aside. It is sent every cadence whether or not anything is outstanding: the reader answerable for the money has no scheduled-job health surface, so for them silence and a job that died months ago look identical, and the nil report is what tells them the check still runs. It is written for a non-technical reader, with amounts carrying their currency and plain descriptions rather than issue-type codes. The recipient is a fixed platform address with no application write path; who reads that mailbox is an IFPA decision recorded outside the platform.
- There is an admin-only Financial Reports view, open to every administrator. Every daily reconciliation run leaves a report, retained with the run: the window and provider mode it compared, how many local rows of the other mode it set aside, what each pass found, the issues it raised, the issues resolved since the previous run and by whom, and gross totals by category and currency counting live rows only. The view lists the reports newest first and an administrator opens any one of them; the newest is what the site shows as the current state of the money, refreshed by the next run. The view also shows when the emailed digest last went out, when the next is due, and the address it goes to. The email is a copy of the newest report at the cadence; nothing depends on it being read, because the same report is on the site the morning after every run. The view is read-only and offers no state-changing control.
- The All Payments view, the Financial Reports view and the Stripe dashboard state that processing fees, payouts and net proceeds are read at the payment provider, which is the book of record for money movement; the platform's figures are gross, dated by charge, and are not expected to match a bank deposit.

## 7.2 Data Management

### A_Override_Member_Data

Access: Only admins can override member data in exceptional cases where manual correction is required, for example, to fix a data bug, clean up if a member dies, or delete a bogus registration.

Story: As an Admin, I can manually override member data in exceptional cases so that I resolve issues, grant access, correct errors, or anything else allowed by the system.

Admin can delete member accounts that violate registration rules (real full name, correct location) upon discovery. This is designed for exceptional cases where a member account was created with invalid data (fake name, bogus location) that was not caught by initial validation. Member receives notification email that account was deleted for policy violation."

Success Criteria:

- Admin member management is a single admin-only surface: a member lookup and a per-member detail view. Every other admin action on an individual member is reached from that detail view rather than from a page of its own, including the tier change, the Active Player expiry correction, the deceased marking, and the member history in A_View_Member_History. A question to a member is not reached from here: it belongs to the work-queue item that raised it, so that the answer returns to where the administrator was already working.
- The lookup finds a member by exact member id, profile URL slug, or login email, or by a fragment of the display name, matching the admin lookup the payments views already use. It reads the whole member population rather than the member-facing search view, because an admin must reach members that view excludes by design: members who opted out of member search, members inside the deletion grace period, and deceased members whose flag may need reversing.
- The member detail view is admin-only and may show the member's owner-and-admin-private fields, including birth date, gender, and contact fields, because it sits at the internal-and-admin-only sensitivity level. It shows the member's identity, membership standing, account state, and identity links, and links to their public profile.
- Admin can correct a member's display name from the member detail view. The corrected name passes the same validation a name passes at registration, so a correction is not a way to take a name registration would refuse. The correction requires a mandatory reason, is audit-logged with the old and the new value, and leaves the member's profile URL unchanged, since a profile URL correction is a separate request.
- The correction covers the member's recorded legal name as well as the display name, in one action with one reason and one audit row carrying every before-and-after value. The recorded family name is the anchor the display-name rule and every claim path match on, and the member's own surfaces leave it to an administrator to correct, so correcting the display name alone would leave the two drifting apart and hold the member to a name they no longer carry. The correction rewrites the recorded name and nothing else: it re-runs no identity matcher, and it neither creates nor unwinds an identity link the member already holds.
- Admin can correct a member's profile URL from the member detail view, as a separate action from the name correction. The corrected URL passes the same rules a profile URL passes at registration. The member's uploader tag moves with them, so their uploaded media and the galleries built on that tag keep resolving; gallery identifiers, which were fixed when each gallery was created, keep the spelling they were created with. The correction requires a mandatory reason and is audit-logged with the old and the new value. The old URL stops resolving and nothing redirects from it, so a link the member has already shared leads nowhere, and the surface says so before the correction is made.
- The system member account is reached and corrected through this surface like any other member. It is exempt from the reserved-word rule that refuses a name claiming an official IFPA or site role, because that rule refuses a name asserting a position its holder does not hold, and the platform's own account is the one holder of that position. Every other name rule applies to it unchanged.
- Auditing on this surface records the writes: every correction appends an audit row naming the administrator, the member, the reason, and each value before and after. Opening the member record is an administrator surface read and is treated as every other administrator surface read is.
- Admin can change membership tier from the member detail view to any of the three membership tiers: `tier0`, `tier1`, `tier2` (using canonical database string values). Director standing (`tier3`) is not set here: it is governance standing rather than a membership tier, and it is conferred in one place, through `A_Grant_HoF_BAP_Board_Status`, which also records the tier the member returns to and sets the board badge. Active Player status is managed separately from membership tier.
- Admin can correct the Active Player expiry date when needed for exceptional remediation, with mandatory reason and audit logging.
- Admin should not edit member-editable fields (email, city, country, club affiliation) via this interface; members must edit these themselves, except in the case of a member death. Display name corrections require admin action (contact IFPA).
- Event results and other data fields that could be buggy can also be edited via this interface, but will require additional UI support.
- Mandatory reason field for manual adjustment (typically: payment issue resolution, complimentary access, error correction).
- Confirmation dialog before applying with member name, old tier, new tier, and reason.
- Member receives email notification of membership-status change with key points: new membership tier, Active Player status or expiry where changed, reason.
- All manual data overrides audit-logged with admin ID, member ID, old values, new values, reason, timestamp.
- Admin sees a clear success message when adjustment completes successfully.
- Admin sees a clear error message when adjustment fails, including a short explanation.

### A_Message_Member

Access: An IFPA administrator can send a direct message or question to a specific member, in one click from the work-queue item that concerns them. Members read and answer in-app; the channel never carries message content over email.

Story: As an Admin, I can send a member a message or question and receive their answer back in my work queue, so that I can resolve an account or data-quality matter that needs the member's input (for example, asking a member who cannot find their old records to confirm the date of birth the matcher runs on) without falling back to out-of-band email and without exposing private data.

Success Criteria:

- A work-queue item that needs the member's own answer surfaces an "Ask the member" control, opening a composer with a subject and an admin-authored message body (up to 2000 characters). The control is offered on any item that resolves to exactly one live, signed-up member, because that resolution is what makes the recipient unambiguous; there is no list of eligible matters. The administrator also chooses how the member answers, from the structured answer kinds the platform holds: acknowledge, or confirm and correct a date of birth. The member link-help request is the case that motivated the channel, being the one only the member can settle: they are the only source for which record is theirs, and for the date of birth that lets the matcher place them without an administrator linking anything by hand. There is no free-standing composer: a question always belongs to the item that raised it. The control appears only once that member has finished signing up, because the surface a question is read on is a member surface the onboarding gate holds an unfinished registrant out of, and the card says so when it is withheld for that reason. It is withheld outright for a member who has died: their account and their mailbox both outlive the marking until the cleanup pass reaches them, so nothing else would stop a question and a nudge email being sent to them.
- A member work-queue item that needs the member's input deep-links into the same composer, prefilled, and records the message's link to that originating item.
- Sending writes one `member_messages` row (recipient member ID, sender admin ID, the originating `work_queue_items` ID, subject, purgeable message body, expected answer kind, `status='sent'`, created timestamp) and one `audit_entries` row (`actor_type='admin'`, `action_type='member_message.sent'`, `metadata_json` carrying the expected answer kind and the body length; never the body).
- The item's status is unchanged while it waits. Its card reports how long the question has been outstanding, so an administrator reading the queue can see the matter is blocked on someone outside it. A parked status was considered and rejected: it would hide the row from the de-duplication probe and from both close paths.
- The member receives a content-free email nudge to their verified login address ("An IFPA administrator has sent you a message. Log in to read it."). The message body never appears in email, because it may concern date of birth, which is owner-and-admin private.
- An unanswered message appears as a needs-attention-now item on the member's own profile, which is their dashboard and where signing in lands them, carrying the cross-page banner that urgency level brings with it (`M_View_Dashboard`). The item names that an IFPA administrator has a question and carries no part of it; the private body is read and answered on an owner-only page of its own.
- The read and answer surface is owner-only and slug-scoped; a slug mismatch returns 404 (anti-enumeration), matching the owner-only-slug pattern used elsewhere.
- The member answers with the structured control the message specifies (Acknowledge, or Confirm/Correct date of birth, a correction writing the new value back to the member's record through the owning service), plus an optional free-text note up to 2000 characters.
- Answering sets the `member_messages` row to `status='answered'` and records the structured outcome (acknowledged, confirmed, or corrected-to-value), the optional note (purgeable), and the answered timestamp; it clears the login prompt and the banner.
- The member's answer returns to the admin as a work-queue item, routed per the Global Behaviors work-queue rules (task type and entity ID only in any notification; no member data). A message that originated from a work-queue item reactivates that original item with the answer attached rather than creating a duplicate.
- The admin sees in one place the question they asked, the structured outcome, the member's optional note (escaped on render), and the timestamps. A date-of-birth correction needs nothing from the administrator: the member owns that field, so their answer writes it through the service that owns it, in the same transaction that records the answer, and the card reports whether they confirmed the date or corrected it.
- HTML, unicode, and other adversarial input in the member's free-text note is stored verbatim in the purgeable column and escaped when rendered on the admin surface, matching the `M_Contact_IFPA_Admin` handling.
- The message body and the member's note are owner-and-admin-private content held in purgeable columns; both are cleared on account erasure and on the deceased contact-scrub, each appending an `erasure_log` row, consistent with `birth_date` and other Sensitivity-4 handling.

### A_Grant_HoF_BAP_Board_Status

Access: Only admins can grant Hall of Fame (HoF), Big Add Posse (BAP), and IFPA Board status to eligible members.

Story: As an admin, I can grant special status badges to a member if they qualify.

Success Criteria:

- Admin can select member and grant Hall of Fame (HoF) or Big Add Posse (BAP) status flags (assuming they qualify per IFPA criteria). HoF and BAP badges are permanent lifetime honors that persist indefinitely. The act of assigning either badge automatically grants Tier 2 membership. If the member is currently Tier 3, the member remains Tier 3 while governance status is active and the underlying membership tier is set to Tier 2 for later reversion. Granting these badges sends a congratulatory email to the member.
- The IFPA Board flag (Tier 3 governance status) is temporary and applies only while the member is an active board member. When the IFPA Board flag is set active, the system sets the member's membership tier to Tier 3 (IFPA director) and records the underlying membership tier for later reversion. If a Tier 0 member becomes Tier 3, the underlying membership tier is set to Tier 1 and any current Active Player status ends. When the IFPA Board flag is removed (member no longer on board), membership tier reverts to the underlying tier: Tier 1 if the member entered Tier 3 from Tier 0 or Tier 1, or Tier 2 if the member entered from Tier 2, Hall of Fame, or BAP. All Board flag changes and resulting tier changes are audit-logged.
- Badges are visible on member profile and anywhere member tier is displayed.
- The IFPA Board flag is temporary, as long as the member is an active board member only.
- This story is the one place board standing is conferred or cleared. The member record's tier control sets the three membership tiers and not this one, because director standing carries a badge and a record of the tier the member returns to that a plain tier correction would not write. Where a `type='board'` group exists, setting a member's standing adds their roster row and clearing it ends that row, in the same transaction, so the published roster and the standing can never disagree; the roster reflects standing and never confers it (see `A_Manage_Group_Roster`).
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

Access: Tier 2 and above. The IFPA membership rules grant Tier 2 (IFPA Organizer Member), Tier 3 and administrators access to the Official IFPA Roster for official IFPA event and organizer purposes. Site administrators must already hold Tier 2 or Tier 3, so one tier gate serves all three. Tier 1 and Tier 0 members, including a Tier 0 member holding current Active Player status, are refused.

Story: As a Tier 2 or Tier 3 member or an administrator, I can view the Official IFPA Roster and its membership breakdown so that I can run official IFPA events, carry out organizer work, and report accurate membership statistics to the IFPA Board, distinguishing membership tier from Active Player status.

Success Criteria:
- The roster is reached at its own page in the IFPA section, and the admin dashboard links to it. The Official IFPA Roster includes Tier 1 members, Tier 2 members, Tier 3 members, and Tier 0 members with current Active Player status. Tier 0 members without current Active Player status are excluded, as are deceased and soft-deleted members.
- The page shows the total Official IFPA Roster count and a breakdown by membership state: Tier 0 Active Player count, Tier 1 count, Tier 2 count, Tier 3 count. Breakdown by special flags: HoF count, BAP count, Board / Tier 3 governance count (these may overlap with tier counts). Total registered accounts (including Tier 0 members without Active Player status) for comparison, with clear label: "Total Registered Accounts (including Tier 0 without current Active Player status)". Counts update via SQL query on demand.
- The roster is browsable in full: every roster member listed in display-name order, paged, with a name search and a tier filter that compose with each other.
- Each member shows display name (linked to their profile), membership tier, the underlying tier a Tier 3 member reverts to, Active Player status with its expiry date, the Hall of Fame, Big Add Posse and IFPA Board honors, and location.
- A member's sign-in email address appears when that member set their email visibility to members; otherwise the cell states that it is not shared. This is the same address any signed-in member already sees on that member's profile, so the roster keeps the member's own visibility choice exactly as the profile does.
- The roster is served as an on-screen page only, and stays inside the platform where the tier gate and the audit record reach it. The IFPA governing documents grant access and say nothing about taking a copy, and they require the roster stay not public, so no surface hands it over as a file, to anyone including an administrator. The Board's membership reporting is served by the on-screen summary counts.
- The Official IFPA Roster is not public, and the platform serves roster data only through this tier-gated page.
- Every roster view is audit-logged under category roster_access with the viewer's member id, the filter applied, the row count, and the timestamp.
- A member is told on their own profile whether they are currently on the Official IFPA Roster, and for a Tier 0 Active Player that it ends when the status expires. That statement belongs to the member's own profile, because the roster's audience is Tier 2 and above and a per-profile statement would let any signed-in member rebuild the roster one profile at a time.

### A_Reassign_Club_Leader

Access: Only admins can add or remove a club's co-leaders on a member's behalf, and help clubs that have no co-leader.  

Story: As an Administrator, I have full control over club co-leader rosters so that a club can regain a co-leader when it has none, a mis-added or unwanted co-leader can be removed, and the 5-co-leader cap can be overridden for legitimate growth.

Success Criteria:

- Admin can add a co-leader from the member base (audit-logged); the added member becomes a current affiliate if not already.
- Admin can remove a co-leader (returning them to ordinary club member), or remove their affiliation entirely (audit-logged with mandatory reason text). Admin removal is the only way to remove a co-leader other than the co-leader stepping down themselves.
- A member co-leads at most one club. Changing which club a member co-leads is the member's own action: they step down at their current club, then volunteer or accept an invitation at the other.
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

- Admins can open a specific event and view its official results (for example disciplines, placements, scores, and medalists) and other key event metadata that are treated as official records.
- Admins can make limited corrections to official event results and metadata (for example fixing a misspelled competitor name, wrong placement, or swapped disciplines) without editing free-form content such as news posts or arbitrary descriptions.
- Every correction requires a mandatory “reason for correction” note entered by the admin.
- Each correction is recorded in an audit log that includes before/after values, admin identity, timestamp, and the reason for correction.
- Participants and organizers see the corrected results in all normal views; where appropriate.
- Corrections do not bypass normal publishing or sanctioning rules: only events that are otherwise valid (for example sanctioned where required) can have their official results corrected.

### A_Correct_Event_Data

Access: Only admins can correct event and registration data outside the organizer's own tools.

Story: As an administrator, I can correct any event or registration record when an organizer or member has left it wrong and cannot fix it themselves, so that data problems arising from ordinary use have a remedy without database access.

Success Criteria:

- Admin can edit any event's fields, including fields the organizer is barred from changing after the fact, such as an event's sanctioned status or a discipline whose entries are already confirmed.
- Admin can cancel any event, with the same registrant notification, reason, and audit trail the organizer's own cancellation carries.
- Admin can cancel any registration, with the same member notification, reason, and audit trail the organizer's own cancellation carries.
- Admin can assign an event organizer from the member base where an event has none (see `A_Reassign_Event_Organizer`).
- Every correction requires a reason entered by the admin, and writes an audit row carrying the before and after values, the admin's identity, the timestamp, and the reason.
- Corrections appear in the normal public and member-facing views immediately, with no separate publication step.
- Purpose-built surfaces remain the ordinary path: an organizer edits their own event, results corrections go through `A_Fix_Event_Results`, and member records go through `A_Override_Member_Data`. This story is the backstop for what those do not reach.
- Four record classes are outside this story, each protected by its own design: audit logs are append-only and are never corrected retroactively; payment records follow the payment provider through reconciliation rather than free-hand edits; imported historical results are corrected at their source and rebuilt; and vote records carry their own integrity model.

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

Story: As an admin, I can review and resolve member-initiated help requests for legacy-identity claims when the platform's self-serve mechanisms (auto-link card confirmation, declared-anchor entry, mailbox-link-click round-trip, direct historical-record claim) did not produce a candidate the member could confirm. I can also handle after-the-fact disputes where a member believes a previously-confirmed claim is wrong. Because self-serve legacy claiming is confined to the onboarding wizard, this admin path is also how a member links or corrects a legacy identity after onboarding is complete — a record they did not claim during the wizard, a newly surfaced match, or a correction.

Success Criteria:

- Admin can view the help-request queue (`work_queue_items` with `task_type='member_link_help_request'`). The queue is raised from the identity-link category of `M_Contact_IFPA_Admin`, which is the one contact category an administrator answers by applying a link rather than by writing back. Each item shows the member's identity statement and, where the platform detected that another account already holds a record the member's own anchors reach, the conflicting records and who holds each of them.
- Admin can communicate with the member out-of-band if more information is needed; the form's outbound channel is the member's verified login email.
- Admin can approve and apply the link. Approval writes an `audit_entries` row carrying `evidence_strength='admin_vetted_evidence'`. The link transaction follows the same field-level merge and tier-grant rules as a member-confirmed card claim. An admin who is also the requesting member cannot approve their own request: admin-vetted evidence stands in for the surname check, so the approving admin must be someone other than the member being linked.
- Post-onboarding linking is admin-only: self-serve legacy claiming is confined to the onboarding wizard, so a member who needs to link an identity after completing onboarding submits a request via `M_Contact_IFPA_Admin` with the Identity-link issue category and an admin performs the link on their behalf. Admin can link either target type — a `legacy_members` account or a `historical_persons` record — applying the same field-level merge and tier-grant rules as a wizard claim, including that a claim never lowers the member's existing tier.
- Admin can reject with a reason. Rejection is audit-logged.
- Both answers reach the member. Submitting the request promised a reply, and this is the one contact category an administrator answers by applying a link rather than by writing back, so neither answer may be silent. An approval tells the member their records are now linked and that they will find them on their profile, which is where the in-app half of the answer lives; a rejection carries the administrator's reason, because a refusal a member cannot see the reason for leaves them with no way to answer it. The member's own submitted words are never echoed back, matching the contact-request resolution reply. The notice is enqueued after the decision commits, so the decision stands whatever the outbox does, and a notice that cannot be enqueued records an operational failure for an operator rather than being dropped in silence.
- Admin can defer for further investigation, which parks the request: it leaves the working queue with a reason on it until the member answers or an administrator takes it back.
- The card carries what the platform can already see for the member: the old accounts their own anchors reach, the competition records under their name, and the date of birth held on each, alongside the member's own past claim attempts. Where nothing on file reaches a record, the card says so rather than falling silent.
- An administrator can search the old accounts nobody has claimed, by name, account id, username, or an exact email address, because approving a request asks for an account id and no other admin surface can produce one. Only unclaimed accounts are listed; an account someone holds is reached from that member's record. An email address is matched whole rather than by fragment, so the search cannot be used to read through the archived addresses.
- Approval shows the member and the record it is about to bind, naming both, and applies only on confirmation. An unknown identifier, and a record another member already holds, are refused at that step with the request left open.
- Approval never auto-promotes legacy `is_admin` metadata to a live admin role.
- The legacy banned flag is recorded as audit metadata only and does not gate admin approval; any disciplinary state on the new platform is handled by the new platform's discipline mechanisms.
- Dispute reverts (member confirmed a wrong card or impersonator-confirmed claim): admin can revert a previously-confirmed claim, clearing the back-link columns and revoking the tier grant. The admin names the disputed record — a `legacy_members` account or a `historical_persons` record — and the platform reverts whichever member currently holds it; the member to revert is never supplied directly. The record is bounded as well: a dispute records the conflicting records the platform detected when it was filed, together with who held each of them, and the revert refuses any record outside that set and any record that has since changed hands. A revert therefore reaches only the member the dispute was actually filed against, and a second dispute naming the same record cannot strip a holder an admin has since vetted onto it. Upholding a dispute clears the disputed record itself whatever its provenance, along with the rest of that member's claimed identity links and the tier grant they conferred. An admin cannot resolve a dispute they raised themselves. Where no member holds the record, the revert reports that there is nothing to revert and the queue item stays open. The revert is audit-logged with the original-claim audit row identifier for traceability.

### A_Periodic_Club_Cleanup

Access: Admins only (admin cleanup queue). There is no unattended background process; the queue evaluates its predicates on demand when an admin opens it.

Story: As an admin, I work a single on-demand cleanup queue. When I open it, the platform evaluates club-viability and leadership-staleness signals and surfaces only the clubs that need a human decision, each resolved in one click. Unconfirmed legacy affiliations that no member ever confirms are retired by an explicit per-club de-list, on my judgment rather than on a timer. I work the queue at my own cadence; a backlog badge on the admin home page surfaces the count and age of the oldest open item.

Success Criteria; On-demand evaluation:

- The queue runs no unattended background process. When an admin opens it, the platform evaluates the following predicates fresh against current data and surfaces only the clubs that need a human decision; the rules demote the clubs whose own record leaves nothing to decide, writing one `audit_entries` row with `actor_type='system'` for each; every remaining item carries a recommended one-click action that only an admin applies. The rules never archive a club, because demotion to inactive keeps it listed and revivable while archival would lose sight of it. Each admin action writes one `audit_entries` row with `actor_type='admin'`.
  - `leaderless_active_club`: a live `clubs` row with `status='active'` that has no co-leader able to act surfaces as a low-priority "could use a leader" opportunity item. A leadership row whose member has deleted their account or died does not count, because the club has nobody who can lead it; the row itself is kept so historical leadership stays attributable. Leaderless is a tolerated state (§5.1), so the recommended action is to add a co-leader (via `A_Reassign_Club_Leader`), not to demote; demotion to inactive is driven only by the `crowdsource_club_viability` inactivity signals below. The item offers two further one-click choices: **contact members** (sends the volunteer-to-co-lead invitation, see `V_Volunteer_To_CoLead`, to the club's current members, audit-logged) or **park** (take no action now; the item leaves the working queue and waits in the parked listing). As soon as anyone becomes a co-leader (self-volunteer, invite-accept, or admin add), the club is no longer leaderless and the item drops from the queue automatically on the next evaluation (the predicate is computed fresh on each open). A member stepping up to co-lead is also a strong positive viability signal, equivalent to a member-reported "active" vote: it resets the club's inactivity staleness, so the `crowdsource_club_viability` gates do not recommend demotion. Any future co-leader claim or current-affiliation insert is recorded normally and the club stays `'active'`.
  - `stale_provisional_leader`: `club_bootstrap_leaders` rows still `status='provisional'`, grouped by club, surface as a review-or-dismiss item.
  - `crowdsource_club_viability`: one verdict per club, from facts that are true or false rather than from weighted signals. Activity answers are counted one vote per member, a member's latest answer superseding their earlier ones. The queue item names the members whose latest answer was negative, because negative answers are rare and the admin judges them by who cast them; authorship renders only on this admin surface. The first matching rule wins:
    - Alive: the club has a current co-leader, a current member, or a member who answered "active". Nothing surfaces and nothing changes.
    - Defunct: a member answered "not active" and the club's own record agrees, meaning it never hosted an event, the import pipeline did not classify it `pre_populate`, no admin promoted it from the legacy record, and no member left a note about it. The club is demoted to inactive, and its unconfirmed legacy residue is de-listed with it.
    - Needs review: a member answered "not active" but the club's record contradicts them, because it hosted an event, the pipeline classified it `pre_populate`, an admin promoted it, or a member left a note about it. An admin's promotion is the strongest form of the record: a person looked at the candidate and decided the club is real, so the rules never undo it. A note is the record speaking in words the rules cannot read, so it goes to someone who can.
    - Defunct with no answer at all: no member has answered, the pipeline classified the club `junk` or `dormant`, it never hosted an event, no admin promoted it, and no member left a note about it. Nothing on any side says the club exists, so it is demoted. Most clubs carry no answer and many never will, so the rules must be able to reach a verdict without one. A club carrying a member note instead reaches an admin, with the note on the row.
    - Waiting: no member has answered and the record is not empty enough to rule on, which is every club the pipeline marked for members to confirm during onboarding. These are neither demoted nor queued; they wait for an answer.
- Unconfirmed `legacy_person_club_affiliations` residue (`'pending'` rows) is retired by an explicit per-club admin de-list, never on a timer; see the residue de-list under the admin residue queue below.
- Evaluation is idempotent: a club the rules have already demoted is skipped on the next open, and re-opening the queue changes nothing else. Adding a new predicate or loosening a threshold requires an explicit story extension; admins do not configure predicates from the queue surface.

Success Criteria; Admin residue queue:

- The admin cleanup queue surfaces the items that need human judgment.
- An admin-home backlog badge shows the count of open queue items and the age of the oldest open item, so the admin sees backlog without opening the queue. Recommended cadence is monthly during steady-state operation; weekly during periods of high member activity (post-migration cutover, after major data imports). There is no automated escalation, deadline, or service-level target.
- Admin views a single residue queue aggregating:
  - Wizard-generated flags grouped by candidate or live club.
  - Junk-flagged candidates and admin force-keep or force-junk requests.
  - Non-junk `legacy_club_candidates` not yet promoted to live `clubs` rows.
  - `legacy_person_club_affiliations` rows still in `resolution_status='pending'` (unconfirmed legacy residue), grouped by live club, each with the club's pending count and the age of its oldest row.
- Each queue item shows: the candidate or club or affiliation id, the source surface, the signal or pending counts, the display names of members whose latest activity answer was negative (when applicable), and any free-text notes members left about that club in the wizard, each with its author. Notes concerning a member's area rather than one club have no queue row and are listed in their own section of the queue surface.
- Items render collapsed by source / category by default; admin expands a group to per-row view. Each group exposes a group-level bulk action where applicable.
- Resolution actions available per item type:
  - **Flag (any source)**: dismiss with optional reason (terminal), or park. Parking carries no deadline and no expiry: the item leaves the working queue, keeps its place in a parked listing that names who parked it and why, and returns to the working queue by itself when evidence about that club arrives later than the park. Changed evidence, not an elapsed window, is what brings an item back.
  - **Junk-flagged candidate**: confirm junk, add to force-keep (return to classifier normal evaluation), or promote to dormant for further evaluation.
  - **Force-keep or force-junk request**: apply, modify, or reject.
  - **Unpromoted candidate (onboarding-visible or dormant)**: promote to a live `clubs` row, demote (onboarding-visible to dormant), archive, or park.
  - **Live club with accumulated flags**: mark `status='inactive'`, archive (`status='archived'`), demote to dormant, or dismiss the flags. Merging two live clubs is deliberately not a queue action: duplicate clubs are resolved upstream by the curator pipeline's duplicate merge during data preparation.
  - **Unconfirmed legacy residue (per live club)**: one click de-lists a club's `'pending'` rows, transitioning them to `'former_only'` (preserves historical fact, drops from the current-roster filter) in a single transaction. Each affected row carries the actor and timestamp; one summary audit row records the action and the de-listed count. The same de-list runs automatically when a club is demoted or archived. The oldest-row age shown on the item is an advisory grace signal; nothing transitions on a timer. Safe to re-run.
- All resolutions are audit-logged with actor identity, item type, club or candidate or affiliation id, decision, optional note, and timestamp.
- Concurrent admin coordination: when an admin opens an item for review, a lightweight "claimed by Admin X at time T" marker becomes visible to other admins. The marker auto-releases on resolve, dismiss, park, or after a 30-minute stale-claim timeout. The marker does not block other admins; it is a coordination signal.
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
- Moderation reaches a member's named gallery, not only individual items: an admin can edit a member-owned gallery — its name, description, item ordering, and criteria and exclude tag sets — through the same admin gallery URL that manages Footbag Hacky's own. This is moderation of a member's media, not curation; curation is an admin adding or editing Footbag Hacky's own media as the system member, specified in A_Upload_Curated_Media and A_Manage_Curated_Gallery. Deleting a member-owned gallery is not a moderation action and returns 404 there; removing a member's media is done per item through the takedown decision above. Every such edit appends an audit row naming the acting admin and the affected gallery.

### A_Upload_Curated_Media

Access: Only admins can upload, edit, delete, or organize curated media on behalf of the system member account (the platform's curator identity, see DD §2.8). Members and visitors do not see these controls.

Curation means an admin adding or editing Footbag Hacky's own media, acting as the system member. It is not editing a member's media, which A_Moderate_Media specifies separately.

Story: As an admin, I can manage curated photos and videos that the platform attributes to the system member account, uploading, editing, deleting, and organizing them into category subdirectories, so that I publish and maintain curator content (landing-page demo loops, page illustrations, well-known event photos, freestyle trick reference videos, hero features, promotional assets, and similar items) without requiring a member to author them.

Success Criteria, Upload:

- Admin upload UI is accessible only to authenticated admins. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login.
- Admin can upload photos (JPEG, PNG; same format whitelist and image dimension limits as M_Upload_Photo) and videos (formats per DD §6.8 Curator Media Processing). MP4 binary upload is admin-only; members cannot upload MP4. URL-only video references (YouTube, Vimeo) are also supported: admin pastes the video URL, the system extracts platform and video_id, and no binary upload is required. sourceId and clip ranges (startSeconds, endSeconds) are optional for URL-only references. Posters for video are provided as a companion image upload.
- Uploaded photos go through the standard Sharp pipeline (DD §6.8): re-encode, strip metadata, generate thumb + display variants.
- Uploaded videos go through the curator video pipeline (DD §6.8): ffmpeg full transcode with explicit malware-stripping options, producing a single standardized output rendition. Companion poster goes through the Sharp pipeline.
- The resulting media_items row has uploader_member_id set to the system member id (the row where is_system=1). Admin actor is not stored on the media_items row.
- Admin can specify a caption (plain text, max 500 characters; same security validation as M_Upload_Photo), source attribution (sourceId referencing an existing media_sources row, or a new source created inline by the admin), and clip ranges (startSeconds, endSeconds) for video reference media.
- Admin assigns the upload to a category subdirectory under /curated/. The admin UI accepts an existing category or a new category name; entering a name not yet used creates the subdirectory on next deploy. Filesystem-driven; any /curated/{name}/ subdirectory is a valid category.
- Admin can specify tags at upload time. Standardized event/club hashtags auto-link to the corresponding gallery per §1.1. Freeform tags are browsable via the tag gallery at /media/browse?tag=<tag>. The `#curated` tag is auto-applied by the curator pipeline as the FH/admin uploader marker; it is reserved for system use and rejected if supplied by the admin in the input. Per-category default tag stacks are also auto-applied (e.g. /curated/freestyle_tricks/ adds `#freestyle #trick`; /curated/freestyle_demos/ adds `#demo`). Filtering by `#curated` returns the all-FH gallery.
- Tag autocomplete is category-aware: /curated/freestyle_tricks/ uploads autocomplete trick-slugs from the freestyle dictionary (`freestyle_tricks.slug`); admin sees a warning if a tricklike tag matches no known dictionary slug, but the upload still completes. Alias-shaped trick tags (matching `freestyle_trick_aliases.alias_slug`) are canonicalized to the parent trick's slug before insertion; the saved tag set shows the canonical form.
- Admin can specify an optional external URL on each uploaded item (media_items.external_url; e.g. link to creator page, source article, related event). Validated at the service boundary per DD §3.17. Persists on the row and on the file-paired sidecar (DD §1.13). The upload form works without JavaScript for photo and URL-reference uploads; admin S3-mode video uploads require JavaScript (the noscript banner warns).
- Curator uploads are detached. A gallery is a saved tag query rather than a container of items, so uploaded content joins a gallery by carrying that gallery's include tags. The `#curated` tag marks curator content and is applied automatically to uploads made by an administrator acting as the Footbag Hacky system member; it is reserved, and rejected if supplied as input. Curator gallery management is its own story.
- Upload completion model varies by media type:
    - Photo and URL-reference uploads complete synchronously: admin sees success or failure in the request-response cycle.
    - Video uploads complete asynchronously (DD §6.8 "Asynchronous orchestration"). The browser uploads source bytes directly to S3 via presigned PUT URLs; the admin's HTTP request returns immediately with a status-page URL, and the transcode runs in the worker container after the fact. Transcode itself takes approximately 1-2 minutes per video; the admin watches the status page for live updates. The status page does not poll: state changes arrive via Server-Sent Events pushed from the worker through the web container. Video upload requires JavaScript; the upload form surfaces this with a noscript banner. Photo and URL-reference uploads remain JavaScript-optional.
- One configured ceiling governs the accepted video size, and the admin meets the same number everywhere: the upload form states it, the refusal names it, and a browser-side check refuses an oversized file before any bytes leave the page. A file that reaches the server over the ceiling is refused as soon as the overrun is detected, without waiting for the rest of the transfer to arrive.
- Admin uploads are not rate-limited at the member-tier rate. The `audit_entries` ledger is the accountability surface for admin actions.
- Curator media is subject to the standard moderation flow per A_Moderate_Media. Curator media is public per §3.8 (the system member is a member for that rule's purpose; FH is treated like any HoF member by every other rule).
- The system member's display_name (default "Footbag Hacky") is the uploader attribution shown on the resulting media's public render, parallel to how member-uploaded media shows the member's display_name. The display_name is editable by admin via A_Override_Member_Data.
- The operator-run bulk curator-content seeding mechanism is a parallel path for pre-go-live content; it writes the same media_items row shape and is subject to the same processing pipeline. Operational specifics in DEVOPS_GUIDE.md (private GitHub repo).

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
- The `#curated` marker is auto-applied to every FH upload regardless of category; a category may additionally define its own default concept-tag stack (as `/curated/freestyle_tricks/` adds `#freestyle #trick`), applied on top of `#curated` plus admin-selected tags. A new category with no defined stack gets only `#curated` plus admin-selected tags. Per-category tag-autocomplete dictionaries are configured separately as new categories require them; the default fallback is no autocomplete.

Audit:

- An `audit_entries` row is appended for every upload, edit, and delete, recording admin actor, timestamp, action type, source filename (delete only), and affected media_id, parallel to A_Moderate_Media, A_Override_Member_Data, and A_Fix_Event_Results.

### A_Manage_Curated_Gallery

Access: Only admins can create, edit, delete, or organize the named galleries the platform attributes to the system member account (the platform's curator identity, see DD §2.8). Members and visitors do not see these controls.

Story: As an admin, I can manage the system member account's named galleries — creating them, editing their name, description, sort order, and the include and exclude tag sets that define their contents, and deleting them — so that curator media is organized into browsable collections without requiring a member to own them.

A named gallery is a saved tag query, not a fixed list of items: its membership is computed at request time by matching each media item's tags against the gallery's include set (every include tag must be present) minus its exclude set. Curator content joins a gallery by carrying the gallery's include tags, not by being individually attached, so the same item can appear in several galleries.

Curation means an admin adding or editing Footbag Hacky's own media, acting as the system member. It is not editing a member's media, which A_Moderate_Media specifies separately. This story owns the admin surface at `/admin/curator/galleries` that creates and maintains Footbag Hacky's galleries; the member-facing view of them is described in V_View_Gallery.

Success Criteria, List:

- The gallery list is accessible only to authenticated admins. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login.
- The list shows every system-member-owned named gallery with its name and defining tags, and offers create, edit, and delete actions. An empty state is shown when no galleries exist.

Success Criteria, Create:

- Admin supplies a short id slug, a display name, an optional description, a sort order, and the include and exclude tag sets. The stored gallery id is `gallery_` followed by the slug; an id that collides with an existing gallery is rejected with an inline error and the submitted values preserved.
- Include and exclude tags follow the same tag rules as elsewhere; the system-managed uploader namespace (`#by_*`) cannot be supplied. Invalid input re-renders the form with the error and the submitted values.
- A catch-all gallery (one meant to collect everything not already in another gallery) must list every other source gallery's tag in its exclude set, or its contents double-list; defining the tag sets correctly is the admin's responsibility.
- On success the gallery is created owned by the system member account; the DB write is the contract. Before go-live, where sidecar writes are enabled, create additionally writes the gallery's `/curated/galleries/` sidecar (DD §1.13) so the git-tracked authoring source stays in step. After go-live the persistent DB is the source of truth and no sidecar is written.

Success Criteria, Edit:

- The edit form has the same admin gate as the list. Editing a gallery that does not exist returns 404. Curation here means Footbag Hacky's own galleries, authored by an admin as the system member; a member-owned gallery reached through the same URL is not curation but moderation of a member's media, specified in A_Moderate_Media.
- Editable fields are name, description, sort order, the include and exclude tag sets, and optional external links (each link URL validated at the service boundary per DD §3.17). The form previews the gallery's current contents so the admin can see the effect of a tag change.
- Tag sets are rewritten atomically: the saved include and exclude sets are replaced by the submitted sets in a single transaction. The DB write is the contract. Invalid input re-renders the form with the error and the submitted values.
- Before go-live, where sidecar writes are enabled, edit additionally writes through to the gallery's `/curated/galleries/` sidecar (DD §1.13) so the authoring source stays in step; after go-live the persistent DB is the source of truth and no sidecar is written.

Success Criteria, Delete:

- The delete action has the same admin gate as the list. Deleting a gallery that does not exist (or is not system-member-owned) returns 404.
- Deletion is hard delete: the gallery row is removed; this DB write is the contract. It removes only the collection, never the media items the gallery listed — those are defined by their own tags and remain. Before go-live, where sidecar writes are enabled, delete additionally unlinks the gallery's `/curated/galleries/` sidecar (DD §1.13); after go-live the persistent DB is the source of truth and no sidecar is touched.
- The admin sees a confirmation gate before the operation runs. Deletion is permanent; there is no soft-delete or restore.

Audit:

- An `audit_entries` row is appended for every gallery create, edit, and delete, recording admin actor, timestamp, action type, and affected gallery id, parallel to A_Upload_Curated_Media and the other admin curator actions.

### A_Browse_Freestyle_Content

Access: Only admins can browse and search the freestyle dictionary curation surface. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login.

Story: As an admin, I can list and search the freestyle dictionary content so that I can find the trick I want to edit.

Success Criteria:

- The curation index lists freestyle trick rows with their canonical name, slug, ADD value, trick family, active flag, and review status.
- Admin can search by text over the canonical name and slug, and filter by active flag and by review status (curated, expert-reviewed, or pending).
- Each listed row links to its edit surface (A_Edit_Freestyle_Trick).
- An empty search or an empty filter result shows a clear empty state.
- This surface is read-only: it performs no writes and records no audit entry.

### A_Review_Emerging_Vocabulary

Access: Only admins can open the emerging-vocabulary workbench. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login.

Story: As an admin, I can review the observed-but-not-yet-canonical freestyle vocabulary together with the open questions blocking its adjudication, so that I can prepare a ruling with the evidence in front of me.

Success Criteria:

- The workbench presents the open decisions as a packet. Each decision carries its question, the recommended answer, the alternatives considered, the evidence behind it, the consequences of deciding either way, and the observed names it covers.
- A decision's coverage includes both names observed in the corpus and names already adjudicated outside the platform, counted together so the size of the decision is visible at a glance.
- Decisions with no remaining names are omitted, so the packet shows only what is still open.
- Alongside the packet, the full observed vocabulary lists as a table, filterable by one dimension at a time: object type, evidence state, blocking decision, owner, publication state, public section, and source. An unrecognized dimension shows the unfiltered table.
- Curation diagnostics appear only here: parser confidence, failure class, and the provenance of a prior ruling. The public observational page shows none of them.
- A name already published to the public observational page is excluded from the packet, so the workbench shows only what still needs a decision.
- This surface is read-only. It performs no writes and records no audit entry; a ruling is recorded through the freestyle ruling ledger, not here.

### A_Edit_Freestyle_Trick

Access: Only admins can edit freestyle dictionary content, on behalf of the platform's freestyle curator identity. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login. Editing a slug that has no trick row returns 404.

Story: As an admin, I can edit a freestyle trick dictionary row and the aliases, sources, and modifier links attached to it, with curator-grade validation and an audit trail, so that freestyle content is maintained in the running application once the live database is the source of truth for it.

Success Criteria, Row fields:

- Editable row fields are the canonical name, the ADD value, the movement and execution notation, the trick family, the base trick, the category, the active flag, the core-primitive marker, the browse sort position, the review status (curated, expert-reviewed, or pending), and the editorial prose fields: the description, the short description, the execution summary, the learning notes, the prerequisite notes, the pronunciation, and the execution-notation source note. Every database-backed field on the trick row has an in-app edit path, so no trick content freezes once the live database is the source of truth.
- A save that passes validation writes the trick row through a prepared statement; the database write is the contract.

Success Criteria, Validation (enforced at the write; a save that fails any check is rejected with a clear message and the submitted values preserved):

- The notation's scoring-bracket count equals the stored ADD value.
- The trick terminates in one of the twelve core atoms.
- A modifier's or operator's ADD stays consistent with the single operator-reference source of truth.
- The display-name-to-slug naming rule holds: the normalized canonical name reproduces the slug, honoring the curator-maintained genuine-hyphen exception list. This check applies to a name the admin changes; an existing row whose stored name predates the one-time name normalization stays editable in its other fields without the naming check blocking the save.
- These are the same structural validations the freestyle content pipeline applies when it loads the dictionary, so a save that would fail the pipeline's quality gate is refused in the application rather than accepted and reconciled later.

Success Criteria, Aliases:

- Admin can add and remove alias rows for the trick. Alias slugs use the lowercase-underscore form. An alias slug that collides with an existing canonical trick slug is rejected with an inline error.

Success Criteria, Sources and modifier links:

- Admin can attach and detach the trick's source rows and source links, and add and remove its modifier links.

Success Criteria, Activation and publication:

- Admin can set the active flag and the review status. A trick whose ADD is settled but whose structure is contested can be held (kept inactive or unpublished) rather than published, preserving the held-not-published publication rule for contested structures.

Success Criteria, Atomicity:

- Each save rewrites the trick row and its attached alias, source, and modifier-link rows in a single transaction; a partial write never lands.

Audit:

- Every create, edit, and delete of a trick row or an attached alias, source, or modifier-link row appends one audit_entries row recording the admin actor, timestamp, a freestyle-namespaced action type (for example `freestyle.trick.updated`), and the affected trick slug or row id, parallel to A_Upload_Curated_Media, A_Override_Member_Data, and the other admin content actions.

### A_Register_Freestyle_Source

Access: Only admins can list or create dictionary provenance sources. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login.

Story: As an admin, I can register a provenance source for the freestyle dictionary, so that a trick's attribution can point at a stable, citable record of where its information came from.

Success Criteria:

- The registry lists the existing provenance sources with their permanent identifier, type, label, and retrieval timestamp.
- Admin can create a source by supplying its permanent identifier, its type, its label, and the timestamp at which the source material was retrieved. The retrieval timestamp is required, because a provenance claim without a retrieval date cannot be re-checked against a source that has since changed.
- The permanent identifier is curator-supplied rather than generated, so a source keeps the same identity across a rebuild of the dictionary and the attributions pointing at it stay valid. It uses lowercase letters, digits, hyphens, and underscores, beginning and ending with a letter or digit, and a value already in use is rejected.
- A source may also carry a URL and curator notes.
- A trick's own source attachment and detachment is a separate capability (A_Edit_Freestyle_Trick); this surface owns only the registry the attachments point at.
- This registry is distinct from the media-source registry, whose entries are created inline while publishing curated media (A_Upload_Curated_Media).
- Creating a source appends one audit entry, in the same transaction as the row it records.

### A_Edit_Freestyle_Record

Access: Only admins can add or edit freestyle world-record rows, on behalf of the platform's freestyle curator identity. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login. Editing a record id that has no row returns 404.

Story: As an admin, I can add a new freestyle world-record row and edit an existing one, with validation and an audit trail, so that the freestyle records the site publishes stay current and correct once the live database is the source of truth for them.

Success Criteria, Listing:

- Admin can list and search the records by holder, trick name, and record type, and open one to edit.

Success Criteria, Row fields:

- Editable fields are the record type, the record holder (either a linked historical person or a free-text display name), the trick name, the structured sort name, the adds count, the numeric or text value, the achieved date and its date precision, the source, the confidence rating, the video link and timecode, and the notes, plus the superseded-by pointer to the record that later beat this one.
- The record id and the created and updated timestamps are read-only; the timestamps are stamped on write.
- A save that passes validation writes the record row through a prepared statement; the database write is the contract.

Success Criteria, Validation (enforced at the write; a save that fails any check is rejected with a clear message and the submitted values preserved):

- The record type and the source are non-empty.
- At least one of a linked historical person or a free-text display name is present; a linked person must reference an existing historical-person row.
- The date precision is one of day, month, year, or approximate, and the achieved date is consistent with it.
- The confidence rating is one of verified, probable, provisional, or disputed.
- The adds count and the numeric value are each empty or a number.
- The superseded-by pointer, when set, references an existing record other than the row itself.

Success Criteria, Superseding and status (no ordinary delete):

- A record beaten by a later one is retired by pointing its superseded-by at the newer record, never by deletion.
- A record whose accuracy is in question is marked disputed or provisional through its confidence rating rather than removed.
- This story provides add, edit, correction, confidence change, and superseding. It does not provide an ordinary hard delete; removing a duplicate or bad row is an exceptional maintainer correction or a future soft-delete design, not default story behavior.

Audit:

- Every add and edit of a record row appends one audit_entries row recording the admin actor, timestamp, a freestyle-namespaced action type (for example `freestyle.record.updated`), and the record id, parallel to A_Edit_Freestyle_Trick and the other admin content actions.

### A_Edit_Consecutive_Kicks_Record

Access: Only admins can add or edit consecutive-kicks record rows, on behalf of the platform's freestyle curator identity. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login.

Story: As an admin, I can add, edit, and remove a consecutive-kicks record row and set its display position, with validation and an audit trail, so that the consecutive-kicks records the site publishes stay current once the live database is the source of truth for them.

Success Criteria, Listing:

- Admin can list the rows grouped by section and division and open one to edit.

Success Criteria, Row fields:

- Editable fields are the section, subsection, division, year, rank, both player names, the score, the note, the event date, the event name, the location, and the display position.

Success Criteria, Validation (enforced at the write; a save that fails any check is rejected with a clear message and the submitted values preserved):

- The section, subsection, and division are non-empty.
- The score and the rank are each empty or a whole number.
- The display position is a unique whole number.

Success Criteria, Row identity:

- Each record carries a stable surrogate identifier plus created and updated timestamps, and the write path keys on that identifier. The display position is a separate mutable field controlling presentation only, so reordering a record leaves its identity, its audit trail, and any edit target untouched.

Audit:

- Every add, edit, and remove of a row appends one audit_entries row recording the admin actor, timestamp, a freestyle-namespaced action type (for example `freestyle.consecutive_record.updated`), and the row's stable identifier.

### A_Moderate_Freestyle_Trick_Tip

Access: Only admins can moderate freestyle trick tips, on behalf of the platform's freestyle curator identity. Non-admin authenticated members receive 403; unauthenticated visitors receive 302 to login. Moderating a tip id that has no row returns 404.

Story: As an admin, I can moderate the legacy-imported freestyle trick tips, editing the text, hiding or unhiding a tip, and resolving an unresolved tip to a canonical trick, with an audit trail, so that the community advice shown on trick pages stays accurate once the live database is the source of truth for it.

Success Criteria, Listing:

- Admin can list tips filtered by status and by trick, and open one to moderate.

Success Criteria, Moderation actions:

- Admin can edit a tip's text.
- Admin can hide a tip and unhide it, moving its status between published and hidden.
- Admin can resolve an unresolved tip by re-pointing it to a canonical trick and publishing it.

Success Criteria, Editable versus read-only:

- Editable fields are the tip text, the status (published, hidden, or unresolved), the trick the tip attaches to, and the display order.
- The tip id, the legacy provenance identifiers and timestamps, the source, and the loaded-at value are read-only.

Success Criteria, Validation (enforced at the write; a save that fails any check is rejected with a clear message and the submitted values preserved):

- The tip text is non-empty and passes the standard text sanitization.
- The status is published, hidden, or one of the four unresolved classifications the column carries: unresolved freestyle, unresolved frontier, unresolved ambiguous, and future net. Moderation writes published and hidden; the unresolved classifications arrive with the content.
- A published tip attaches to an existing published canonical trick.

Success Criteria, Scope:

- This story moderates existing legacy-imported tips only. It does not add a member-facing tip-submission flow; a member submit feature, if ever wanted, is a separate story.

Audit:

- Every edit, hide, unhide, and resolve of a tip appends one audit_entries row recording the admin actor, timestamp, a freestyle-namespaced action type (for example `freestyle.trick_tip.updated`), and the tip id, parallel to A_Moderate_Media and A_Moderate_News_Item.

### A_Create_News_Item

<< V2 SCOPE >> Ships with the news feed in version two; not part of the v1 launch.

Access: Only admins can manually create a news item.

Story: As an admin, I can manually author a news item so that I can publish announcements not auto-generated by system events.

Success Criteria:

- Admin can create a news item with: title (required, max 200 chars), body text (required, Markdown-safe), optional linked entity reference (event ID, club ID, vote ID, or none), and publish date (defaults to now).
- Created news item is immediately visible in the news feed (or at the specified publish date if future-dated).
- Creation is audit-logged with admin ID, timestamp, and news item ID.
- Manually created news items can be edited or deleted via A_Moderate_News_Item.

### A_Moderate_News_Item

<< V2 SCOPE >> Ships with the news feed in version two; not part of the v1 launch.

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

Access: Only admins can archive a club or mark it defunct. A co-leader can park a club but never archive one.

Story: As an admin, I can mark a club defunct/archived and notify members so that directories stay accurate. Archiving may be used for a club that has no co-leader (for example, a lingering “Needs Leader” item) when the club is confirmed defunct; a leaderless club is not archived merely for lacking a co-leader, since that state is tolerated per §5.1.

Success Criteria:

- Sets status: "archived" in club data.
- Archiving is refused while the club still has a current member or co-leader. Only a member's own leave ends an affiliation, so archiving a club they still hold would leave them attached to something they can neither open nor leave, holding one of their two club slots. A club that looks defunct but still has people is demoted to inactive instead, which keeps it listed and lets any member who joins or claims it revive it.
- Preserves club data for 7 years per retention policy.
- Records an audit log entry.

## 7.4 Vote Management

<< V2 SCOPE >> Voting and elections are version-two scope. The stories in this section are
design intent for that build and are not part of the v1 launch.

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
- Admin selects the vote's bylaws validity rule, which fixes the thresholds the system checks at tally time: `membership_resolution` (adoption requires at least 10% of the eligible members to participate and a majority of the ballots cast), `bylaws_amendment` (the same 10% participation floor with a two-thirds affirmative share of the ballots cast), or `none` for a vote the bylaws thresholds do not bind. The rule is a configuration choice per vote, not a system constraint derived from vote type, and it is locked when the vote opens alongside the option set and the eligibility snapshot.
- Admin defines eligibility rules using member attributes and flags (Tier status, HoF, BAP, Board flags) or an explicit inclusion list. The eligibility rule set also includes `voting_members_of_group(group_id)`: when this rule is configured, eligible voters are members where `group_member_affiliations.group_id = group_id AND is_current = 1 AND is_voting = 1`, evaluated and snapshotted at vote-open time. The voting marker is what enfranchises, not membership: a roster can carry a director whose seat is filled but not yet seated, and that seat does not vote. Eligibility predicates can be combined (for example: Tier 2 AND `voting_members_of_group(finance_committee)`).
- System validates: date ordering, required fields, and that eligibility rules are internally consistent.
- System generates a unique vote ID and audit-log record of creation.
- For HoF elections, any member can submit nominations during the nomination window, but to be included in the ballot, the nominated candidates must provide an affidavit that explains their qualifications, basically their footbag career achievements. This information will be included as part of the vote’s background materials.
- Eligibility for candidates/options is enforced by the vote’s configured rules.
- At ballot open, the set of options is locked.
- Eligibility Changes: Members cannot gain or lose eligibility after vote opens, ensuring fairness.
- Eligibility is evaluated and snapshotted at the moment the vote transitions to `open` status. Eligible members at vote-open time are written as rows into `vote_eligibility_snapshot`. Members retain voting rights for the full voting window even if their tier, flags, or group membership change while the vote is open.
- Group-scoped votes follow the same encryption, receipt-token, decrypt-audit, and tally rules as all other votes; there is no lightweight or non-encrypted variant.
- If the referenced group in a `voting_members_of_group` rule is archived after the vote opens but before the vote closes, the open vote continues to completion using the frozen snapshot; the system creates an admin notification but does not cancel the vote automatically.
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
- The system computes the bylaws validity check for the vote's configured validity rule and displays it beside the tally: the eligible-member count taken from the vote's eligibility snapshot, the number of ballots cast, the participation share against the 10% floor, and the affirmative share against the majority or two-thirds threshold, each marked met or not met. A vote whose validity rule is `none` displays the participation figures with no threshold verdict.
- The computed figures and the met/not-met outcome are recorded in the TALLY_VOTE_COMPLETE audit entry with the tally. The check is informational: it never blocks publication and never changes member roles or flags, and formally certifying the vote and acting on its outcome remain Board and secretary steps outside the system.
- Tallying is permitted only when vote.status equals 'closed' AND current server timestamp exceeds vote.close_datetime. The system enforces both conditions to prevent early result access.
- Audit records TALLY_VOTE_START event containing admin_id, vote_id, and start timestamp when tally operation begins. Individual decrypted ballots are never logged or stored in plaintext. The system aggregates vote totals in memory and discards individual ballot contents immediately after counting. Audit records TALLY_VOTE_COMPLETE event containing admin_id, vote_id, aggregate result summary (totals only, not individual votes), and completion timestamp.
- Data Export / vote participation records: for each vote the member participated in, the export includes vote title, vote ID, and submission timestamp. The raw receipt token is not included in the export. Members who need to verify their ballot must use the receipt token from their original email.
- After HoF election results are published (or the vote is canceled), the cycle's nomination rows are closed out, so candidacy stays scoped to its own nomination year and the next cycle starts clean.

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

Access: Only Admins can send email to general mailing lists from the platform. Event Organizer email is scoped to an organizer's own event participants and is handled via `EO_Email_Participants`, not via this story. Exception: the IFPA announce list (announce@footbag.org) may be sent to by any Tier 2 or Tier 3 member, as defined in M_Send_Announce_Email. Member sending to a group is handled via `M_Email_Group`, not via this story; admins retain the ability to send to a group's associated `MailingList` via this story for exceptional platform-level notifications.

Story: As an admin, I can send announcements to a platform-configured mailing list so that I communicate with the community.

Success Criteria:

- Admin composes email and selects target list (newsletter, announcements, board-updates, and group-backed lists in exceptional cases).
- Organization-wide announce list is retained; only Admins may send to general mailing lists through this story. Exception: the IFPA announce list (announce@footbag.org) may be sent to by any Tier 2 or Tier 3 member via M_Send_Announce_Email; the Admin-only rule applies to all other mailing lists managed through this story.
- Member sending to a group is the responsibility of `M_Email_Group`, including the `restricted_sending` and `subject_prefix` behaviors. An admin send via this story to a group-backed `MailingList` bypasses `restricted_sending` and is intended for critical platform notifications that must reach the group. Such a send lands in the group's record like any other message, as a new thread with no parent, readable on the group page per `M_Read_Group_Discussion`, so the record shows everything the group was sent and by whom. Such admin sends are audit-logged with admin ID, group ID, list ID, subject, recipient count, and timestamp.
- System enumerates recipients from MailingListSubscription records for the chosen MailingList, applying subscription status.
- Sends to all subscribed members via outbox pattern.
- Email delivery respects bounce list.
- All sends logged to audit trail.
- Every bulk email to a subscription-backed list carries the one-click unsubscribe headers, per `M_Unsubscribe_One_Click`. A group-backed list carries none: membership of the group is what puts the member on it, so the message tells the reader how to leave the group on the site instead.
- Delivery status visible: senders see sent, bounced, and suppressed counts.
- Each mailing list has a configurable outbound alias/from-identity (e.g., directors@…, sanctioning@…). This can be set to no-reply, a special case.
- Each sent mailing list email is archived (subject/body/sender/list/timestamp/recipient count) and browseable by admins.
- Email body is plain text (no HTML).
- No approval workflow is required; controls are permissions, audit logging, the one-click unsubscribe headers, and rate limits where applicable.

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
- `MailingList` records support two behavior fields: `subject_prefix` (string, max 32 chars, default empty; when non-empty, prepended to outgoing subjects in the form `[prefix] subject`); and `restricted_sending` (bool, default false for general lists and default true for group lists; when true, only the configured allowed-sender population may compose). On a general list both are the admin's. On a group-backed list the admin sets their initial values when enabling the group's mail and the group's owner maintains them thereafter, per `GO_Configure_Email_Settings`; enabling and disabling the mail itself stays the admin's.
- A `MailingList` record is either subscription-backed or group-backed. A subscription-backed list takes its recipients from its `MailingListSubscription` rows, which members manage through `M_Manage_Email_Subscriptions`. A group-backed list names a group and takes its recipients from that group's current roster when the send fans out; its subscription rows record deliverability state (bounced, complained, suppressed) and the roster remains the single record of membership.
- Group-backed `MailingList` records are excluded from the member-facing `M_Manage_Email_Subscriptions` view, and their sends carry no unsubscribe control: membership of the group is what puts a member on the list, so the member leaves the group to stop receiving it, and every group message says so in its own text.
- A group-backed `MailingList` sends from a no-reply from-identity, which is not admin-configurable. A group has no address of its own and takes no inbound mail, so a reachable reply address would send part of the group's record somewhere the group cannot read it. Replies are composed on the group page, per `M_Email_Group`.
- When an Admin enables email on a group via `A_Create_Group` or `A_Edit_Group_Properties`, the system creates the associated group-backed `MailingList` naming that group.
- When an Admin disables email on a group, the associated `MailingList` is archived per the existing archive semantics and accepts no further sends.

## 7.6 System Configuration

### A_View_Stripe_Config_And_Payments

Access: Only admins can view Stripe configuration and payment details.

Story: As an administrator, I can view a Stripe configuration and payments dashboard that shows test/live mode, webhook health, API key age, and recent payment volumes by category, so that I can quickly confirm that payments infrastructure is healthy and decide when to investigate deeper using the detailed payments and reconciliation views.

Success Criteria:

- The admin Stripe dashboard clearly shows whether the system is currently in test or live mode and when this mode was last changed.
- The dashboard shows webhook health, including the timestamp of the last successful webhook and counts of failures over a recent window (for example the last 24 hours), with obvious warning states when webhooks are failing or have been silent for too long.
- The dashboard shows which mode the loaded payment credential is actually in, test or live, taken from the credential the running process holds rather than from configuration, so a half-applied arming change is visible rather than silent. It shows no other key information: no identifier, no fragment of the key, and no age. Key rotation and its cadence are System Administrator responsibilities, tracked against the provider's own key records and the operator rotation runbook, not surfaced to application administrators who cannot act on them.
- The dashboard summarizes recent payment volume, broken down by category (donations, membership fees, event registrations) for a configurable time window (for example last 30 days), including both count and total amount, counting live-mode rows only and stating how many rows were set aside.
- From this dashboard, admins can navigate directly to the “All Payments” view and the “Reconciliation Issues” view described in A_Reconcile_Payments for deeper inspection.
- The dashboard is read-only and offers no state-changing control. It links to the “All Payments” and “Reconciliation Issues” views for deeper inspection, and to the payment provider's own event log for the per-delivery detail of a failed webhook. Halting live payments and rotating keys are System Administrator actions run by script, not application-administrator buttons: the payments pause flag has no application write path, and disarming payments requires the provider's webhook endpoint be disabled first. Where the dashboard shows a warning state, it names the operator procedure that clears it.

### A_Configure_System_Parameters

Access: Only admins can configure system-wide parameters.

Story: As an admin, I can view and adjust key system parameters in one place so that policies remain consistent, small changes do not require code deployments, and system behavior matches IFPA’s current decisions. Note that some parameters must be configured by an AWS System Administrator instead.

Success Criteria:

- There is a single System Parameters admin view that shows all supported configuration settings grouped into clear sections (for example: Membership and Pricing, Donations and Payments, Email and Notifications, Data Retention and Cleanup, Grace Periods, System Health and Alarms, Session Timeout).
- All Administrator-configurable system parameters have normative default values defined in the Configurable Parameters subsection of this document. The initial database creation process must load those defaults into the corresponding tables. Defaults reflect IFPA rules where applicable, and otherwise reflect privacy, security, and legal-retention requirements.
- The Membership and Pricing section allows an admin to view and adjust: Tier 1 IFPA Member price (USD). Tier 2 IFPA Organizer Member price (USD).
- The Donations and Payments section shows the "Pause payments" emergency switch (default: off) read-only, alongside the operator procedure that changes it. When set, new membership purchases and donations are refused before any Stripe Checkout session is started, while existing payments and webhooks continue to process. An admin cannot toggle it: the application has no write path to the flag and none is planned, because halting live payments is a System Administrator action run by script. The same read-only treatment applies wherever this screen shows a flag the application does not own.
- The Email and Notifications section allows an admin to view and adjust: Maximum email retry attempts for the outbox / notification sender (default: 5 attempts with exponential backoff; after max attempts the item is moved to a dead-letter queue/folder visible to admins). Time between outbox scans / notification runs (configurable; default 30 seconds via `outbox_poll_interval_seconds`) for SYS_Send_Email. "Pause sending" emergency toggle (default: off) that stops the worker from sending new outbox items while keeping newly enqueued items pending. Days-before-event for registration reminder emails in M_Register_For_Event (default: 7 days before event start). Two administrator-configurable days-before-Active-Player-expiry reminder offsets (defaults: 30 and 7 days). Day-of Active Player expiry notification (T+0) is built in and not separately configurable.
- All parameters on this screen: Show current values and defaults, with short helper text explaining how each value is used (for example “Used by recurring donations job; do not set below X days without board approval”). Enforce safe ranges and validation so that admins cannot set obviously invalid values (for example negative days, zero retry count, or unparseable expressions). Are audit-logged when changed, including old value, new value, admin ID, and timestamp, and these changes appear in A_View_Audit_Logs / A_View_System_Health where appropriate.
- Changing any of these parameters does not require code deployment: the updated values are read from the SystemConfig data store and automatically picked up by the relevant jobs, flows, and admin views the next time they run.
- The Data Retention Configuration section allows an admin to view and adjust entity-specific retention periods, and states for each one what the period actually does, because "retention" means three different things across this screen and a single label for all of them misleads. The governing principle is that personal data ages out while the record does not:
  - **Anonymize** — the row is kept and its personal fields are cleared, so history and referential integrity survive: the member account deletion grace period, and payment record compliance retention. Both enforced by SYS_Cleanup_Soft_Deleted_Records.
  - **Delete** — the row is removed outright, used only where the row *is* the personal data and holds no lasting record value: the outbound-copy retention period, which removes a delivered message together with its recipient address and rendered body. The per-send broadcast archive row, which names no recipient, is preserved indefinitely instead.
  - **Hold** — an archive obligation stating how long the record must be *kept*, never a deletion schedule and never a countdown: audit log retention and ballot retention. Nothing in the live database is trimmed by either. Audit rows carry no personal data by construction (people are referenced by identifier and sensitive lookups are hashed), so there is nothing in them to age out, and deleting them would destroy the accountability trail they exist to be. Ballot content is encrypted, and destroying IFPA vote records is a governance decision rather than a maintenance one. The stated window is what the archival tier must hold, and the screen presents it that way.
- Admin can create a new dues schedule entry with: tier product (eg: Tier 1 IFPA Member), amount, currency, effectiveStartDate, and required reason (“official rule change”, “board decision”, etc.).
- Only one schedule entry per tier product may be active for a given effectiveStartDate.
- Price schedule changes are audit-logged with admin ID, old active price, new price, effectiveStartDate, reason, timestamp.
- Past entries are immutable/read-only (no edit/delete); admins can only supersede by adding a new entry.

### A_Manage_Email_Templates

Access: Only admins can view or edit email templates. An unauthenticated visitor is redirected to log in; an authenticated non-admin receives 403.

Story: As an admin, I can edit the wording of the emails the platform sends and turn an email type off, so that the platform's voice and its policy can change without a code deployment, while which emails exist and where they are sent from stays under engineering control.

Success Criteria:

- A list view shows every registered template with its key, subject, enabled state, PII classification, and when it was last changed.
- An edit view changes four things and nothing else: subject, body, enabled flag, and PII classification. Templates cannot be created or deleted through the interface. A template's existence, its merge fields, and the code site that sends it are code, so an interface that could create one would only produce a template nothing ever sends.
- Bodies are plain text carrying logic-less single-brace `{token}` merge fields. Validation refuses doubled braces, unbalanced or nested braces, a malformed token, and any token outside the set that variant declares. The token set must match the declared set exactly: an omitted required token sends a broken email, such as a verification message with no link, and an unknown token reaches the member as literal braces.
- Subject and body are both required, and bounded at 300 and 20000 characters.
- Disabling a template suppresses that email type at send time without deleting its content. The edit view warns before a disable takes effect, most strongly for a restricted template, because those are the emails a member cannot complete an action without.
- The PII classification (public, internal, confidential, restricted) is a property of the template rather than of any one message, and it bounds how much of a sent message an admin may read afterwards on the email log: public and internal bodies may be shown, a confidential body only behind a justification-logged reveal, and a restricted body never, because it holds a live credential link until the post-send scrub clears it.
- Every save appends exactly one audit entry in the same transaction as the update, so a wording change that committed always carries its record.
- Editing an unknown template key is a 404.
- Template content is seeded from committed sidecars before go-live; from go-live the database is the sole source, per the curator content source-of-truth model.

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
- Revoking the admin role raises the administrator-loss recruitment alert in the same transaction, per SYS_Detect_Admin_Loss.

### A_Bootstrap_First_Admin

Access: In development and staging, a register-time email allowlist; in production, any signed-in member holding the operator-provisioned single-shot token.

Story: As the platform operator, I can bootstrap the first administrator account, so that a fresh deployment (or one that has lost every admin) reaches the governed steady state where A_Manage_Admin_Role takes over.

Success Criteria:

- Development and staging: an environment allowlist (`FOOTBAG_DEV_INITIAL_ADMIN_EMAILS`) grants the admin role at registration. A production process configured with the allowlist refuses to start, and the deploy pipeline refuses to write the value onto a production host, so the mechanism cannot exist in production.
- Production: an operator provisions a single-shot token in the platform's parameter store; a signed-in member submitting the matching token receives the admin role, the Tier 2 invariant grant, and an audit row, in one transaction.
- The claim fires only while no admin exists; once an admin is present the path grants nothing. Every failure shape (absent token, mismatch, malformed, already closed) returns the same non-revealing result, and the claim is rate-limited per IP and per member.
- The token parameter is deleted after a successful grant; the same path is the break-glass recovery after total admin loss.
- Steady-state admin grants and revocations remain owned by A_Manage_Admin_Role.

## 7.7 Configurable Parameters

Seed these defaults into the database-backed configuration store during initial database creation. Admins may change values only within validated ranges; all changes must be audit-logged. Story text may reference these defaults but must not redefine them. IFPA-derived values reflect the IFPA Memberships document (authoritative source). For membership pricing, the keys below are `system_config.config_key` literals.

### Membership Pricing / Dues (IFPA-derived)

- `tier1_price_cents = 1000` (Tier 1 IFPA Member dues; integer cents; valid `> 0`)
- `tier2_price_cents = 5000` (Tier 2 IFPA Organizer Member dues; integer cents; valid `> 0`)

### Donations and Payments

- `payments_paused = 0` (read-only guard: when set, the platform refuses new membership purchases and donations before any provider call is made. The application has no write path to this flag and none is planned. Stopping payments during an incident is a System Administrator action rather than an application-administrator control: the fast stop is the operator pause script, which sets this flag in seconds and deliberately lets money already in flight settle, and disarming payments is the heavier stop for when the provider integration itself is the problem. See the System Administrator stories. DB literal `0/1`)
- `donation_rate_limit_per_hour = 20` (maximum donation checkout attempts per member per hour)
- `reconciliation_window_days = 7` (lookback window the nightly reconciliation pass compares)
- `reconciliation_grace_minutes = 30` (age a record must reach before the reconciliation pass judges it; minimum 1)

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
- `outbox_sending_lease_seconds = 600 seconds` (lease before a stranded sending outbox row is reaped back to pending for retry)
- `outbox_retry_base_seconds = 60 seconds` (base interval for the exponential backoff applied after a definitive send failure)
- `outbox_throttle_retry_seconds = 120 seconds` (delay applied when the mail provider throttles, which does not consume a retry attempt)
- `outbox_batch_limit = 10` (messages the outbox worker sends in one polling pass, both streams together)
- `outbox_bulk_batch_limit = 5` (most of one polling pass bulk mail may take. Transactional mail fills each pass first, so a bulk run can never delay a password reset behind it; this caps how fast the bulk run itself goes)
- `bounce_rate_alarm_threshold_per_10k = 500` (bulk sending stops at or above this bounce rate, in ten-thousandths of messages sent, so 500 is five per cent, the rate at which the mail provider places an account under review. Transactional mail is unaffected)
- `complaint_rate_alarm_threshold_per_10k = 25` (bulk sending stops at or above this complaint rate, in ten-thousandths of messages sent, so 25 is a quarter of one per cent. The provider places an account under review at a tenth of one per cent and may pause sending at half of one per cent, so this sits between the two: late enough that a small list's first complaint does not stop a run, early enough to act well before sending is paused)
- `bulk_halt_min_sent_in_window = 50` (messages that must have been sent inside the health window before those two rates are judged at all, so one bounce against an idle sender cannot stop a run)
- `bulk_send_paused = 0` (read-only on this screen, like the outbox and payments switches. Stops the bulk stream only: a send can be called off while verification, password reset and receipt mail keeps going out, so an operator never has to reach for the whole-outbox pause to stop a newsletter. Unlike the automatic feedback halt, it does not clear itself. Set by operator script, never from the browser. DB literal `0/1`)
- `email_outbox_paused = 0` (read-only on this screen, like the payments switch: the outbox worker halts on it and loses no queued rows, so a pause is recoverable in a way that disarming the sender is not. It is set by operator script, the sibling of the payments pause, never from the browser. DB literal `0/1`)
- `event_registration_reminder_days = 7 days`

### Auth / Security Tokens

- `email_verify_expiry_hours = 24 hours`
- `password_reset_expiry_hours = 1 hour`
- `token_cleanup_threshold_days = 7 days`
- `data_export_link_expiry_hours = 72` (hours before a personal data export download link expires)
- `login_rate_limit_max_attempts = 10` (maximum failed login attempts within the window before the account is locked)
- `login_rate_limit_window_minutes = 15` (sliding window in minutes for counting failed attempts)
- `login_cooldown_minutes = 30` (lockout duration after threshold is exceeded)
- `register_rate_limit_max_attempts = 10` (maximum registration attempts per source IP within the window)
- `register_rate_limit_window_minutes = 15` (sliding window in minutes for counting registration attempts)
- `login_account_rate_limit_max_attempts = 30` (maximum failed login attempts against a single account across all IPs within the window, before further attempts are rate-limited; caps distributed credential-stuffing of one account)
- `login_account_rate_limit_window_minutes = 60` (sliding window in minutes for counting failed login attempts against a single account across all IPs)
- `password_reset_rate_limit_max_attempts = 5` (maximum password reset requests per email address within the window before requests are silently rate-limited)
- `password_reset_rate_limit_window_minutes = 60` (sliding window in minutes for counting password reset requests per email)
- `jwt_expiry_hours = 24` (lifetime of the main site session JWT; governs archive access expiry since no separate archive session is issued)
- `photo_upload_rate_limit_per_hour = 10` (maximum photo uploads per member per hour)
- `avatar_upload_rate_limit_per_hour = 10` (maximum avatar uploads per member per hour)
- `video_submission_rate_limit_per_hour = 5` (maximum video link submissions per member per hour)
- `media_flag_rate_limit_per_hour = 10` (maximum media flags per member per hour to prevent abuse)
- `curator_write_rate_limit_per_hour = 60` (maximum curated-media writes per curator per hour)
- `group_email_rate_limit_per_hour = 30` (maximum messages one member may post to one group per hour; an abuse ceiling, set well above what a live debate needs)
- `announce_send_rate_limit_per_day = 2` (maximum community announcements one organizer member may send per day)
- `media_edit_rate_limit_per_hour = 15` (maximum edits to a member's own media per hour)
- `gallery_write_rate_limit_per_hour = 30` (maximum gallery creates, renames and deletes per member per hour)
- `profile_edit_rate_limit_per_hour = 20` (maximum profile edits per member per hour)
- `purchase_tier_rate_limit_per_hour = 20` (maximum tier-purchase attempts per member per hour)
- `password_change_rate_limit_max_attempts = 10` (maximum authenticated password-change attempts per member per window)
- `password_change_rate_limit_window_minutes = 15` (sliding window in minutes for counting password-change attempts per member)
- `verify_resend_rate_limit_max_attempts = 3` (maximum verify-email resend requests per email address per window)
- `verify_resend_rate_limit_window_minutes = 60` (sliding window in minutes for counting verify-email resend requests per email)
- `account_claim_expiry_hours = 24` (legacy account claim token TTL in hours; per `M_Claim_Legacy_Account`)
- `legacy_claim_init_rate_limit_max_per_member = 5` (maximum legacy-claim initiate attempts per requesting member within the window)
- `legacy_claim_init_rate_limit_max_per_target = 3` (maximum claim emails sent for one target legacy account within the window; enforced silently so probing cannot detect the cap)
- `legacy_claim_init_rate_limit_max_per_ip = 10` (maximum legacy-claim initiate attempts per source IP within the window; enforced silently)
- `legacy_claim_init_rate_limit_window_minutes = 60` (sliding window in minutes for counting legacy-claim initiate attempts)
- `hp_claim_rate_limit_max_per_member = 5` (maximum historical-person claim confirmations per member within the window)
- `hp_claim_rate_limit_max_per_ip = 10` (maximum historical-person claim confirmations per IP address within the window)
- `hp_claim_rate_limit_window_minutes = 60` (sliding window in minutes for counting historical-person claim confirmations)
- `mailbox_link_rate_limit_max_per_member = 5` (maximum declared-old-email mailbox-link requests per member per window)
- `mailbox_link_rate_limit_max_per_target = 3` (maximum mailbox-link requests aimed at any one legacy mailbox per window)
- `mailbox_link_rate_limit_max_per_ip = 10` (maximum mailbox-link requests per IP per window)
- `mailbox_link_rate_limit_window_minutes = 60` (sliding window in minutes for counting mailbox-link requests)
- `declared_anchor_rate_limit_max_per_member = 10` (maximum declared former surnames and old emails a member may add per window)
- `declared_anchor_rate_limit_window_minutes = 60` (sliding window in minutes for counting declared-anchor additions)
- `link_help_request_rate_limit_max_per_member = 3` (maximum identity link-help requests a member may raise per window)
- `link_help_request_rate_limit_window_minutes = 1440` (sliding window in minutes for counting link-help requests)
- `auto_link_staged_expiry_days = 365` (days a staged automatic-link candidate stays open before it expires unactioned)
- `bootstrap_claim_rate_limit_max_per_member = 5` (maximum first-administrator bootstrap claim attempts per member per window)
- `bootstrap_claim_rate_limit_max_per_ip = 5` (maximum bootstrap claim attempts per IP per window)
- `bootstrap_claim_rate_limit_window_minutes = 60` (sliding window in minutes for counting bootstrap claim attempts)
- `member_search_rate_limit_max_per_member = 30` (maximum member searches per member per window)
- `member_search_rate_limit_max_per_ip = 60` (maximum member searches per IP per window)
- `member_search_rate_limit_window_minutes = 1` (sliding window in minutes for counting member searches)

### Retention / Cleanup

- `member_cleanup_grace_days = 90 days` (aligns with `M_Delete_Account` and `SYS_Cleanup_Soft_Deleted_Records`)
- `deceased_cleanup_grace_days = 30 days` (grace period before contact data is cleared from a deceased member record, per `A_Mark_Member_Deceased`; allows correction of erroneous deceased flags)
- `payment_retention_days = 2555 days` (ANONYMIZE; minimum 7 years, do not reduce below minimum). Past this window a payment row keeps its financial record and has its identifying fields cleared.
- `audit_retention_days = 2555 days` (HOLD, not a deletion schedule). States how long the audit record must be kept; nothing trims `audit_entries`, which is append-only, immutable by trigger, and carries no personal data by construction. The archival tier is what honours this window.
- `ballot_retention_days = 2555 days` (HOLD, not a deletion schedule; governance/audit defensibility baseline). States how long ballots must be kept; nothing deletes them, because destroying IFPA vote records is a governance decision rather than a maintenance one.
- `outbox_retention_days = 90 days` (age at which a per-recipient outbound copy is deleted, per `SYS_Cleanup_Soft_Deleted_Records`: measured from `sent_at` for a delivered copy and from the last attempt for a dead-lettered one; the per-send broadcast archive is retained indefinitely and is not governed by this value)
- `reconciliation_expiry_days = 90 days`
- `reconciliation_summary_interval_days = 30` (cadence in days for the automated reconciliation digest, sent to the IFPA treasurer contact address rather than to admin-alerts, because the person answerable for the money needs it whether or not they hold a platform account at all and should not have to take the rest of the admin alert traffic to get it; valid `>= 1`)
- `admin_queue_digest_interval_days = 1` (cadence in days for the admin work-queue digest of open routine items sent to each admin)
- `admin_queue_stale_escalation_days = 3` (days an unclaimed routine work-queue item may stay open before a one-time escalation email to all admins)
- `admin_inactivity_alert_days = 180 days` (days without a sign-in before an administrator is surfaced for recruitment follow-up, per `SYS_Detect_Admin_Loss`; valid `>= 1`)
- `work_queue_resolve_rate_limit_per_hour = 120` (maximum work-queue resolutions per admin per hour)
- `primary_snapshot_version_days = 30` (number of days of point-in-time snapshot versions retained in the primary S3 backup bucket; governs the S3 versioning lifecycle setting)
- `cross_region_backup_retention_days = 90` (Object Lock retention window for backup objects in the cross-region disaster-recovery bucket)
- `continuous_backup_interval_minutes = 5` (interval in minutes between continuous SQLite backup runs)
- `system_health_window_hours = 24` (the recent window, in hours, that the system-health view aggregates outbound-email and scheduled-job counts over, per `A_View_System_Health`; valid `1`–`8760`)

## 7.8 Monitoring and Audit

### A_View_Dashboard

Access: Only admin users can view the admin dashboard.

Story: As an admin, I can view a consolidated dashboard Work Queue, an ordered list of items generated by the system so that I can quickly see what needs my attention.

Success Criteria:

- Dashboard shows a summarized Work Queue panel with details such as: pending event approvals, flagged media, election tasks (if any), payment reconciliation discrepancies, recurring donation failures, club without a leader, event without an organizer, email outbox failures/dead-letter items, any active unacknowledged alarms (acknowledged alarms are visible in A_Acknowledge_Alarm view but not counted in the dashboard summary), vote management.
- This dashboard does NOT show information that requires AWS console access (which is instead intended for the System Administrator role).
- Each count links to the corresponding detailed queue or screen (for example, event approval queue, moderation queue, payment reconciliation view).
- Items are grouped by category (Events, Media, Membership, Payments, Elections, System, Club Leadership) with clear labels.
- Dashboard highlights any categories with urgent items (for example, failed backups, alarmed cost thresholds, many failed payments, email outbox dead-letter growth) using a simple visual indicator.
- Admin sees only data they are permitted to act on; no member personal data beyond what existing admin stories allow.
- Dashboard view is read-only; all state changes happen in the underlying queues and flows already defined in other admin stories.

### A_Manage_Work_Queue

Access: Only admins can read the admin work queue or act on anything in it.

Story: As an administrator, I can see every open task the platform has raised, act on each one from the card that raises it, say when I am handling something, and set aside what I cannot advance yet, so that the queue is a shared and current picture of what needs a person rather than a list nobody can tell the state of.

Success Criteria:

- Every task type is declared in one place: its display label, its queue category, the entity types a row of that type may point at, whether it is urgent, how its evidence renders, and the ordered actions an administrator may take on it. A task type with no declaration cannot be enqueued, so an item can never reach the queue with no way to close it.
- Each action declares its own wording, whether it takes a note and whether that note is required, its own decision vocabulary where it has one, any further fields it needs, the audit event it writes where the queue writes one, and whether the member is told. A decision is validated only against the vocabulary of the action being taken, so one family's decisions can never be recorded against another's.
- Every card reads the same way: what the task is, who or what it concerns, the evidence, who is holding it, then the actions. An administrator who learns one card can work every type.
- An administrator can claim an open item to say they are handling it, which drops it from every other administrator's digest. A claim is a coordination signal and not a lock: it expires on the same measure the queue uses for an item going stale, after which the item returns to every digest and can be claimed again, and the card still names who held it last so the next administrator can ask rather than repeat the work.
- Each administrator is emailed a periodic digest of the open routine items on a configured cadence. An item left open, unclaimed and unresolved past the stale threshold escalates once with a single email to the administrators' alert list. An urgent task type is in neither, because it emailed every administrator when it was raised.
- An administrator can park an item they cannot advance yet, with a reason. A parked item leaves the working queue, every digest and the escalation sweep, and is listed separately with who parked it and why. Parking carries no deadline and no expiry: the item returns when the member answers a question on it, or when any administrator takes it back. Its status stays open throughout, so the duplicate probe that stops a second item being raised for the same matter, and both close paths, still see it.
- Parking is offered only on the task types whose declaration allows it. A matter where the member is waiting for an answer is answered, not set aside.
- Non-admin authenticated users receive 403 from the queue and from every action on it; unauthenticated traffic is redirected to login.

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

- The health view is built only from data the platform records itself. Infrastructure health — processor, memory, storage, backup runs, origin availability, and spend against budget — is monitored outside the application and reaches an admin as an alarm under A_Acknowledge_Alarm, not as a card here. The application queries no infrastructure metric or billing service.
- No direct links to AWS consoles (including CloudWatch), CLI tooling, or infrastructure controls are exposed in the Application Administrator UI.
- Health view shows at least: Email delivery status, as bounce and complaint rates over a configurable recent window, counted by recipient rather than by notification and expressed against what was sent in that same window, with a dash rather than a rate when nothing was sent. Email outbox status: what was sent is counted over the window, because that is a volume figure, while everything waiting or in trouble (pending, sending, failed, dead-lettered, and held for manual review) is counted over all time, because a message stuck since before the window opened is exactly what this view exists to surface; plus whether “pause sending” is currently enabled. Every scheduled job with its last outcome, the age of its last success, and its runs and failures in the window, where a run the platform reaped after a crash counts as a failure. The number of alarms no admin has acknowledged.
- Behind the aggregate outbox figures, admins can open a per-message outbound-email log: one row per message showing recipient, template, and delivery status (pending, sent, failed, or dead-lettered). Where a message has a body, it is shown as the underlying template with its data-merge fields left clearly unpopulated, so the log conveys what was sent without exposing the recipient's rendered personal data. The log is read-only.

### A_View_Audit_Logs

Access: Only admins can view detailed audit logs.

Story: As an admin, I can view and filter audit logs and periodic summaries so that I maintain oversight of key actions and investigate issues.

Success Criteria:

- Audit log view lists entries with at least: timestamp, actor (admin, system, or member), action type, affected entity (such as member, event, media, payment, election), and a short description or reason where available.
- Entries are sorted by timestamp, newest first by default.
- Admin can filter logs by: date range (from/to); topic/category (for example: membership changes, pricing changes, elections, content moderation, payments, system alarms, configuration changes); actor type (admin vs system vs member); a specific member (matching rows where that member is the actor or the affected entity); and action type. A self-action filter surfaces rows where the acting admin is the affected member.
- Filtering uses the structured filters above; the app does not provide free-text search over reason or metadata content, which is done with an external tool when needed.
- Audit coverage includes at least: membership tier changes, pricing updates, event sanction approvals, media takedown decisions, freestyle content edits (trick rows, aliases, sources, and modifier links), election operations (create, publish, decrypt), admin role changes, alarm acknowledgments, and system cleanup or reconciliation processes.
- Monthly summary view shows counts per category (for example: number of tier changes, number of event approvals, number of takedowns) to support lightweight reporting.
- Logs retain limited identifiers necessary for traceability (IDs, not email addresses), consistent with privacy rules in Global Behaviors and Technical Requirements.
- All audit log data is read-only; no UI allows editing or deleting existing entries.
- Reading or exporting the audit log is itself recorded as an audit entry (`action_type` `audit.viewed` or `audit.exported`, category `audit`, naming the admin and the filter target). These audit-access entries are excluded from the default view to avoid self-noise and surfaced only on request.
- The filtered view exports to CSV and JSON for incident-response handoff, preserving the ids-not-email-addresses guarantee, and the export is audit-logged.

### A_Acknowledge_Alarm

Access: Only admins can acknowledge platform alarms and document responses.

Story: As an admin, I can acknowledge AWS alarms so that I record incident handling.

Success Criteria:

- Alarm dashboard with acknowledge action.
- Acknowledgment recorded in audit log.
- Alarms include at least: Abnormally high email bounce or complaint rates. Backup failures or missed runs. Approaching or exceeding monthly cost thresholds. Processor, memory, or storage pressure on the host. Loss of origin availability.
- When an alarm is acknowledged, the system records: Who acknowledged it. When it was acknowledged. An optional note describing actions taken.
- Platform alarms reach the application over a signed notification webhook: the notification service posts each alarm state change to a dedicated endpoint authenticated by a shared secret carried in the subscription URL, by verification of the payload signature, and by the publishing topic matching the one the platform expects. A signature alone proves only that some topic in some account signed the payload, so all three are required and a feed with no expected topic configured refuses every delivery. Each notification, including a subscription confirmation, is processed exactly once by claiming its message identifier. Undelivered notifications are held in a dead-letter queue rather than discarded, because the sender retries an endpoint only briefly before dropping the message.
- A state change into alarm is recorded as an active alarm naming the alarm and the reason given; a state change into insufficient-data is recorded the same way at warning severity; a state change back to normal clears the most recent recorded alarm of that name. A redelivered notification leaves the record as it stands.
- An acknowledged alarm stays on record as acknowledged, clears when the platform reports that alarm back to normal, and a later recurrence of the same alarm is raised afresh for the admins to see.

## 7.9 Group Management

### A_Create_Group

Access: Only Admins can create groups, regardless of type. Members may request group creation via `M_Contact_IFPA_Admin` using the "Group creation request" category. The admin reviews the request through `A_Resolve_Contact_IFPA_Admin_Request` and then configures the group through this story if approved.

Story: As an Admin, I can create a group with all configurable properties and assign its initial owner so that I provision IFPA governance, working, and social groups.

Success Criteria:

- Form includes: name (required, max 80 chars, not required to be globally unique); slug (required, unique, the group's URL identity); description (long-form text); type (enum: `group`, `committee`, `board`, `panel`, `fellows`); official (bool, default false); policy (enum: `public`, `private`, default `private`); restrict_membership (bool, default true); email_enabled (bool, default false); state (enum: `active`, `inactive`, `archived`, default `active`); parent_group_id (optional, must reference an existing non-archived group; subcommittee nesting depth is unlimited); initial owner member ID (required, must be a Tier 1+ member).
- At most one group may carry `type='board'`. Creating a second is rejected with a specific message naming the existing one. Creating a board group confers nothing on anybody by itself: the roster follows standing an administrator has set, per `A_Grant_HoF_BAP_Board_Status`.
- If `email_enabled=true`, the system creates the associated group-backed `MailingList` naming the new group, sends it from a no-reply identity, and applies admin-set initial values for `subject_prefix` and `restricted_sending`, which the group's owner maintains thereafter. The list's recipients are the group's members, so it needs no seeding.
- This story provisions new platform groups only. Legacy IFPA `@ifpa.footbag.org` list addresses are dispositioned separately as part of the legacy email transition, and no group reproduces one: a platform group has no address of its own, because the platform receives no inbound email. Group mail is composed on the group page and distributed via SES.
- The initial owner receives an email notification with the group name, type, and owner responsibilities.
- Admin sees a clear success message and a link to the newly created group's page.
- Validation errors (e.g., invalid parent_group_id, initial owner not Tier 1+) are surfaced with specific messages and the form preserves user input.
- Creation is audit-logged with admin ID, group ID, all property values, initial owner ID, timestamp.

### A_Edit_Group_Properties

Access: Only Admins can edit admin-controlled group properties.

Story: As an Admin, I can edit admin-controlled group properties so that I can adjust governance settings, rename groups, toggle the official flag, change visibility, enable or disable email, change membership restriction, and reparent subcommittees.

Success Criteria:

- Admin can edit: name, slug, type, official, policy (public/private), restrict_membership, email_enabled, state, parent_group_id. Changing `type` to `board` is rejected while another board group exists.
- Admin cannot edit owner-editable fields (description, member-facing notes) via this story; those are managed in `GO_Edit_Group`. An Admin who is also a group owner can edit both surfaces via their respective routes.
- Enabling email on a previously disabled group creates the associated group-backed `MailingList`, whose recipients are the group's current members and whose from-identity is no-reply.
- Disabling email on a previously enabled group archives the associated `MailingList`.
- Setting `state='inactive'` hides the group from `M_Browse_Groups_Directory` but preserves member access, its discussion, and its mail. Setting `state='active'` restores directory visibility. `archived` is not set here; archiving is `A_Archive_Group`, which carries the roster and list consequences.
- Changing `restrict_membership` from false to true does not remove existing members but blocks future self-joins via `M_Join_Group`.
- Changing `parent_group_id` does not move members, ballots, or email; the change is navigational only.
- Renaming the group preserves the existing member set, ballots, mailing list, and audit history.
- All edits are audit-logged with admin ID, group ID, fields changed, old values, new values, timestamp.

### A_Manage_Group_Roster

Access: Only Admins. This story owns every roster row on a `type='board'` group, and the governance fields on any group's rows. Ordinary membership of every other group is managed by that group's owners via `GO_Manage_Members`.

Story: As an Admin, I maintain the board's roster as the platform's record of who sits on it, in what office, by what authority, for what term, and with what vote, so that the site's badges, its ballots, and its published board list all follow one record.

Success Criteria:

- Admin can add a member to the roster, setting `role`, `office`, `is_voting`, `seat_basis` (`elected` or `appointed`), `seat_reference` (free text naming the election or the bylaw provision), `term_start`, and `display_order`. `term_end` is left empty while the member serves.
- A roster row on a `type='board'` group exists because an administrator set that member's board standing through `A_Grant_HoF_BAP_Board_Status`, which adds the row in the same transaction as the flag and the tier. The roster is not a second way to confer standing: an administrator managing this roster sets and clears the governance fields on a row, and adds or removes a director by setting or clearing their standing.
- Standing and voting are independent. A director with `is_voting=0` holds the flag, Tier 3, and the badge, and casts no ballot. The form states this where the marker is set, because a seat filled by appointment or awaiting its seating vote is the ordinary case rather than an error.
- Admin can end a membership: `is_current=0`, `term_end` stamped, the row and all its governance fields retained. On a board group this clears the flag and reverts the member to the underlying tier in the same transaction.
- Admin can correct any governance field on a current or ended row. A correction records old and new values.
- Ending the last membership carrying `is_voting=1` is allowed and raises no block: whether the board can act is a bylaws question the platform does not adjudicate. It is surfaced as a notice on the admin work queue so it is visible rather than silent.
- Validation: `term_end` may not precede `term_start`; `seat_reference` is required when `seat_basis` is set; a member may hold at most one current row per group.
- The roster reads the same everywhere it appears: the group page, the ballot eligibility in `A_Create_Vote`, and the group's mailing list all resolve from these rows rather than from a copy.
- Every action is audit-logged with admin ID, group ID, target member ID, fields changed, old and new values, and mandatory reason text on any removal.

### A_Reassign_Group_Owner

Access: Only Admins can reassign group ownership and remediate "Group Needs Owner" admin work-queue items. Ownership is a group-management role and is separate from board standing: granting it confers no tier and no badge, and on a board group the roster itself is managed in `A_Manage_Group_Roster`.

Story: As an Admin, I have full control over group owner rosters so that groups remain operable when leadership breaks down.

Success Criteria:

- Admin can assign a group owner from the Tier 1+ member base (audit-logged).
- Admin can demote a group owner or co-owner back to ordinary group member, or remove their affiliation entirely (audit-logged with mandatory reason text). On a board group, removing an affiliation carries the standing consequences specified in `A_Manage_Group_Roster`.
- Admin can change a member's role between owner and co-owner within a group, subject to the sole-owner-promotion-first invariant.
- Groups with zero owners are flagged "Group Needs Owner" and appear in an admin work queue.
- Admin can resolve a "Group Needs Owner" item by assigning a new owner via this story, or by archiving the group via `A_Archive_Group` if defunct.
- All admin owner-management actions are audit-logged with actor identity, timestamp, before and after values, and reason text.

### A_Archive_Group

Access: Only Admins can archive a group.

Story: As an Admin, I can archive a defunct group so that I can remove it from active operation while preserving historical record.

Success Criteria:

- Archiving sets the group's `state` to `archived`. Group records are never permanently deleted and do not use the soft-delete (`deleted_at`) pattern.
- Archived groups are excluded from `M_Browse_Groups_Directory` and from all email send flows. Their former members and Admins retain read access to the group page, its roster, and its discussion, which render read-only; the group stays listed in each former member's `M_View_My_Groups`. Nothing in an archived group is deleted or aged out.
- Each remaining `group_member_affiliations` row for the archived group has `is_current` set to 0 and `term_end` stamped with the archive date. Rows and their governance fields are preserved so historical affiliation is recoverable. Archiving a board group clears the board standing of every member still holding it, in the same transaction, which clears the flag and reverts each of them to their underlying tier per `A_Grant_HoF_BAP_Board_Status`.
- The associated `MailingList` (if any) is archived in the same transaction per the existing archive semantics.
- Subcommittees of the archived group (rows with `parent_group_id` pointing to the archived group) are not auto-archived; the Admin must archive them separately if appropriate. The `parent_group_id` reference remains valid for historical navigation, even though the parent is archived.
- Group-scoped active votes (per `A_Create_Vote` with `voting_members_of_group(group_id)` eligibility) are not canceled automatically; the system creates an admin notification recommending review via `A_Cancel_Vote`.
- Archive action is audit-logged with admin ID, group ID, reason, timestamp.

# 8. Background System Jobs

System jobs are not User Stories. Instead they represent automated processes that execute on schedules (a DevOps concern), or in response to system events (webhooks). All system job actions are logged so that they can be viewed via the admin dashboard. These jobs are required in order to ensure the success criteria for the User Stories given above are met.

### SYS_Check_Active_Player_Expiry

Access: This scheduled process runs under the system role.

Story: The system automatically checks Active Player expiry every day so that Tier 0 members' temporary Tier 1 benefits and Official IFPA Roster inclusion stay in sync with the IFPA membership rules.

Success Criteria:

- System runs a daily job that evaluates Active Player expiry dates for Tier 0 members, using two configured pre-expiry reminder offsets (for example T-30 and T-7), plus a built-in day-of expiry notification (T+0).
- For each Tier 0 Active Player with an upcoming expiry, the job determines whether a reminder is due today based on those configured offsets and whether a reminder for that offset has already been sent; if due, it enqueues an Active Player expiry reminder email via the notification outbox.
- Reminder emails describe Active Player expiry and ways to regain Active Player status (later qualifying event attendance, or a vouch from a Tier 2 or Tier 3 member). They do not describe the one-time first-club-join grant, which reaches only a member who has never previously been an Active Player and so can never apply to anyone receiving one of these reminders. They must not describe membership-tier expiry or renewal. Reminders are never sent more than once per day per member or more than once per configured offset.
- Reminders are not sent for members whose Active Player status has already been extended past the offset window, and the job respects member email preferences and unsubscribes for the relevant reminder category.
- Membership tiers are never downgraded by this job because membership tiers are lifetime.
- When a Tier 0 member's Active Player expiry date has passed, the member remains Tier 0 and Active Player status is marked expired or treated as no longer current. Expired Active Player status ends Tier 1 benefits and Official IFPA Roster inclusion.
- The job does not affect Tier 1, Tier 2, or Tier 3 members because Active Player applies only to Tier 0.
- Each Active Player expiry action writes an audit-log entry including member ID, previous Active Player expiry date, processing date, reason `active_player_expired`, and timestamp.
- All reminder sending and automatic Active Player expiry processing performed by this job are logged to CloudWatch (or equivalent monitoring), including counts and failure metrics.

### SYS_Batch_Auto_Link

Access: Operator-run cutover job under the system role.

Story: The system stages auto-link candidates for every unlinked member after a legacy data import, so that members who registered before their legacy data arrived get the same confirm-a-card claim experience as members who register after it.

Success Criteria:

- The job evaluates every member without a linked legacy account or historical person against the imported legacy data, using the same classifier and evidence rules as sign-in matching (per M_Claim_Legacy_Account).
- It only stages candidates for members to confirm later in the wizard's claim task: it mutates no live identity tables and sends no email.
- Re-running the job stages no duplicate candidate for the same member/target pair, and a candidate the member declined is not re-staged without new signal.
- Each staged candidate carries its staged audit event, and the run is recorded with its status and counts so an operator can see when it ran and what it did.

### SYS_Staged_Candidate_Expiry

Access: This scheduled process runs under the system role.

Story: The system expires stale staged auto-link candidates daily, so that a member who never acted on a suggested match is not confronted with it indefinitely while re-staging stays possible when the evidence still holds.

Success Criteria:

- A daily job resolves open staged candidates past the administrator-configurable expiry window (default 365 days, keyed by `auto_link_staged_expiry_days`) to expired, without member action.
- Each expiry writes an audit entry identifying the candidate and the member; no identity table is touched.
- The sweep is idempotent: re-running it produces no further state change for already-resolved candidates.
- If the candidate's anchors still match when staging next runs, the candidate may be staged again; expiry never blocks a future re-stage the way a decline does.

### SYS_Detect_Admin_Loss

Access: This scheduled process runs under the system role.

Story: The system notices when the platform loses an administrator and prompts the remaining administrators to recruit a replacement, so that administrative capacity is renewed by a deliberate decision rather than eroding until only the break-glass re-bootstrap path remains.

Success Criteria:

- An administrator counts as lost in any of these cases: their admin role is revoked; their member account is soft-deleted or marked deceased while they still hold the role; or they have not signed in within an administrator-configurable inactivity window (default 180 days, keyed by `admin_inactivity_alert_days`), measured from their last sign-in, or from account creation for an administrator who has yet to sign in.
- A revocation raises the alert immediately, in the same transaction as the role change. The other cases are found by a daily sweep, so a loss whose triggering action has no in-app surface is still caught.
- Each loss raises one open work-queue item in the system category, naming the lost administrator and the loss reason, and sends one email to the Admin mailing list asking the remaining administrators to recruit a new admin volunteer as soon as possible. The email carries the task type and the entity identifier, matching every other admin notification; the administrator's name and the loss reason are read on the queue card.
- The sweep is idempotent: once an item names that administrator, re-running it leaves that item as the single record, whether it is still open or has been dismissed. A dismissal settles the loss and keeps it settled, because the states the sweep reads outlive the alert. A sign-in after the dismissal starts the clock again, so an administrator who returns and is lost a second time is alerted afresh.
- Role changes stay deliberate human acts under A_Manage_Admin_Role. An inactivity finding is a prompt for the remaining administrators to act on, and the sweep's own writes are the queue item, its audit entry, and the notification.
- An administrator closes the item by dismissing it once a replacement is recruited or the loss is otherwise settled. The dismissal is audit-logged and is an internal record, so it emails no member.
- Each raise writes an audit entry identifying the lost administrator and the loss reason, and the run is recorded with its status and counts so an operator can see when it ran and what it did.

### SYS_Send_Email

Access: This scheduled polling process runs under the system role to send queued emails by polling the email outbox on a configurable interval (default: every 30 seconds via `outbox_poll_interval_seconds`). Only admins can view delivery logs.

Story: The system automatically sends transactional emails so that members stay informed of important events.

Success Criteria:

- System sends emails for: account registration, email verification, password reset, membership purchase or upgrade, Active Player grant/extension/expiry, payment receipt, event registration confirmation, club membership changes, co-organizer/co-leader additions, and other cases. As this is a flexible list, it is not necessary to hard-code all cases now.
- All emails are sent via SES with deliverability tracking. Transactional mail, which is what this story sends, carries no unsubscribe control: it answers an action the member took, and offering to switch it off would let a member turn off their own security mail. The one-click unsubscribe headers belong to bulk mail, per `A_Send_Mailing_List_Email`.
- Worker respects the admin Pause Sending toggle: when enabled, the worker does not attempt new sends, but enqueued items remain pending.
- Emails are sent only via the outbox pattern: request-time controllers enqueue outbox entries and never call SES directly; a background worker polls the outbox on a configurable interval (default: every 30 seconds), sends via SES, and records sent/failed status.
- Failed email deliveries are logged and retried up to 5 times with exponential backoff; after the maximum retry count the outbox item is moved to a dead-letter queue/folder for admin review and possible replay.
- Email templates are stored as plain text in the database and are editable by Administrators through the email-template editor (`A_Manage_Email_Templates`). Template changes are audit-logged. 
- Different mailing lists can have different from addresses configured and this job will use them. The special no-reply from address will be an option. Otherwise, all other reply addresses must go to a real inbox for a human to receive replies.
- All sent emails are logged to CloudWatch with template ID, member ID, outbox message ID, timestamp, and delivery result (do not log raw email addresses or full subject lines).

### SYS_Open_Vote

<< V2 SCOPE >> Ships with the voting subsystem in version two; not part of the v1 launch.

Access: This scheduled process runs under the system role.

Story: The system automatically opens votes at their configured open_datetime so that voting begins on schedule without manual admin action.

Success Criteria:

- System runs a job (at minimum hourly) that checks all votes in `draft` status with open_datetime <= now (UTC).
- For each such vote, the job transitions vote.status to `open` and writes eligibility snapshot rows to `vote_eligibility_snapshot` (same logic as A_Create_Vote).
- The system sends notification to all eligible members that the vote is now open (if configured).
- Each transition is audit-logged: vote_id, old status, new status, eligible member count, job run timestamp.
- An admin-alerts email is sent for each automatically opened vote.

### SYS_Close_Vote

<< V2 SCOPE >> Ships with the voting subsystem in version two; not part of the v1 launch.

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

- On payment_intent.succeeded: local payment record transitions to `completed`. Tier upgrade or event registration confirmation applied as appropriate. Receipt email enqueued to member. Audit-logged with payment_intent_id, amount, currency, and timestamp. The settled amount and currency on the event are compared with the local record: a disagreement does not stop the settlement or the grant, since the money moved and nothing is ever revoked automatically, but it raises the same amount-mismatch reconciliation issue and administrator work item the nightly pass would, at once rather than the next night, carrying both amounts.
- On payment_intent.payment_failed: the attempt is recorded on the payment's transition ledger and the record stays `pending`, so a later attempt in the same checkout session can still settle it. Failure notification email enqueued to member. Audit-logged.
- On checkout.session.expired: local payment record transitions to `canceled`, settling a checkout the buyer abandoned. Audit-logged.
- On charge.refunded: local payment record transitions to `refunded`. Audit-logged with Stripe charge ID, refund amount, currency, and timestamp. No automatic tier or registration changes are applied by the platform; any required access changes are handled manually by admins via A_Override_Member_Data using "payment issue resolution" as the reason.
- On refund.failed, or refund.updated carrying a failed or canceled status: the payment record does not move, since refunded is its end state. The failure is audit-logged with refund id, charge id, amount, currency and failure reason, shown on the payment's money history, and raised as an administrator work item, because the money is still in the account and must be returned another way at the provider. Idempotent per event id.
- All one-time payment webhook processing is idempotent via the stripe_events table (keyed on Stripe event_id), consistent with the global Payment Processing Guarantees.
- All events audit-logged with payment_intent_id, member_id, event type, old status, new status, and timestamp.

### SYS_Process_Recurring_Donations

Access: This event-driven process runs under the system role when Stripe sends subscription-related webhook events. Only admins can view logs and failure metrics. Recurring donation billing schedules are owned entirely by Stripe; the platform does not drive charges.

Story: The system handles Stripe Subscription webhook events for recurring donations so that local payment records, member-facing history, and admin reconciliation data are kept in sync with Stripe's billing activity.

Success Criteria:

- The platform does not run a scheduled cron job to initiate recurring donation charges. Stripe owns the annual billing cycle and all retry logic based on the Stripe Billing dunning configuration set by a System Administrator in the Stripe Dashboard.
- On invoice.paid or invoice.payment_succeeded for a donation subscription (the provider raises both for one settlement, and only invoice.paid reports an invoice marked paid out of band; the first to arrive books the charge and the second books nothing): the system creates a new local payment record (linked to the existing donation subscription record via stripeSubscriptionId), enqueues a receipt email to the member, and audit-logs the event with subscription_id, invoice_id, amount, and timestamp. An invoice that collected nothing is acknowledged with an audit entry and books no payment and sends no receipt, because no money moved.
- On invoice.payment_failed for a donation subscription: the system updates the local subscription status to past_due and enqueues a failure notification email to the member. No retry logic is implemented in the platform; Stripe's configured dunning schedule governs further retry attempts.
- On customer.subscription.deleted for a donation subscription (triggered when Stripe exhausts all retries, or when the member cancels via the platform): the system sets the local subscription status to canceled, enqueues a final notification email to the member and an admin alert, and audit-logs the cancellation with subscription_id and reason.
- On customer.subscription.updated (e.g., amount or status changes made in the Stripe Dashboard by a System Administrator): the system updates the local subscription record to reflect the new state and audit-logs the change.
- All subscription webhook processing is idempotent via the stripe_events table (keyed on Stripe event_id) consistent with the global Payment Processing Guarantees.
- All subscription lifecycle events are audit-logged with subscription_id, invoice_id (where applicable), member_id, event type, old status, new status, and timestamp.

### SYS_Reconcile_Payments_Nightly

Access: This nightly process runs under the system role to reconcile payments with external providers. Only admins can view its reports.

Story: The system automatically reconciles local payment records against Stripe every night so that discrepancies are detected promptly across both one-time payments and recurring donation subscriptions.

Success Criteria:

The system runs the job once per UTC day from the worker's daily loop, self-gated on the date of its last successful run, in three passes:

Pass 1; One-time payments: Compares local payment records (membership dues, event registrations, one-time donations) against Stripe PaymentIntent records for the reconciliation window. Discrepancies flagged: local records with no matching Stripe PaymentIntent, Stripe PaymentIntents with no matching local record, amount or status mismatches.

Pass 2; Recurring donation subscriptions: Compares local donation subscription records against Stripe Subscription objects and their associated Invoice records. Discrepancies flagged: active local subscriptions with no matching active Stripe Subscription, Stripe Subscriptions with no matching local record, local subscription status out of sync with Stripe status (e.g., local shows active but Stripe shows canceled or past_due), Invoice charges recorded in Stripe but missing as local payment records, and renewal charges recorded locally for a different amount or in a different currency than the invoice the provider actually collected.

Pass 3; Unexpected duplicates: Looks for the same member charged the same amount for the same purpose twice in quick succession. This is the one class the platform's own guarantees hide rather than prevent: each attempt mints its own payment id and its own checkout session, so two rows each match a provider settlement exactly and compare clean in every other pass. It is reported as a question rather than a fault, because a second gift minutes after the first is legitimate, and nothing is reversed automatically.

Amount discrepancy checks compare both the amount AND the currency field: a local record and a Stripe record for the same payment_intent_id that have matching amounts but different currency values MUST be flagged as a discrepancy. Reconciliation reports display amounts alongside currency codes.

Every pass compares only local records of the provider mode the loaded credential is in, because a live key cannot list test-mode objects and the reverse; rows of the other mode are set aside, counted, and reported with the run rather than raised as discrepancies, and rows whose mode was never recorded are compared.

Discrepancies from every pass are stored as durable reconciliation issues with status (Outstanding/Resolved), resolver, timestamps, and resolution notes; shown in admin dashboard; retained 90 days.

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
- Payment Record Cleanup (7-year compliance window, anonymize). This period satisfies financial compliance requirements while enabling GDPR data deletion. Enforced here: payment rows past the window keep the financial record and have their identifying fields cleared.
- Vote Ballot Preservation (7-year hold). Not a deletion schedule and not enforced by this job: the window states how long ballots must be held, and destroying IFPA vote records is a governance decision rather than an operator one.
- Audit Log Preservation (7-year hold). Not a deletion schedule and not enforced by this job. `audit_entries` is append-only and immutable by trigger, carries no personal data by construction, and is what an auditor or investigator reads long after the fact — so there is nothing in it to age out, and trimming it would remove the evidence exactly at the boundary where someone is most likely to want it. The window states what the archival tier must hold.
- Outbound Copy Cleanup (admin-configurable retention, default 90 days, parameter key: `outbox_retention_days`): an `outbox_emails` row is one message to one recipient, carrying that recipient's address and the rendered body. A delivered row is deleted once `outbox_retention_days` have passed since `sent_at`, the period being set by what the copy is for: bounce and complaint correlation and support questions about a specific delivery, both of which go stale within weeks. A dead-lettered row is deleted once the same period has passed since its last delivery attempt, because a failure no operator reviewed within a full retention window will not be reviewed later, and the recipient's address should not outlive the review. Rows still pending or retrying belong to the send worker, and a row parked for manual review is an unresolved question about whether a real person received the message; neither is removed by age.
- Broadcast Archive Preservation (indefinite): the per-send archive row for a mailing-list, event-participant, or announce send is retained indefinitely, holding the subject, body, sender, timestamp, and recipient count of what the platform broadcast in IFPA's name. The row names no recipient, so erasure has nothing in it to reach; the sender's member id is cleared when that member is erased, preserving the record while severing the person.
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
- The stats are stored in a format that can be read quickly by the hashtag index on the browse landing and any “popular tags” UI elements.
- If the job fails, existing stats remain in place and the failure is logged for later investigation.
- The system exposes basic metrics for the job (run time, success/failure) to operations/admins.

### SYS_Freestyle_Content_Source_Of_Truth_Cutover

Access: This source-of-truth behavior is a go-live cutover step run under the system role by the operator; only admins author freestyle content, before and after the cutover.

Story: The freestyle dictionary content switches its source of truth from the committed CSV inputs to the persistent production database at go-live, so that after cutover freestyle content is edited in the running application and the CSV rebuild retires from the production path, mirroring the curated-media source-of-truth model.

Success Criteria:

- Before go-live, the committed CSV inputs are the source of truth: an admin edits a committed CSV and reruns the freestyle rebuild, and git history is the audit trail.
- The freestyle rebuild refuses to run against any non-development database, with no bypass flag, so it never rewrites a live database; the one sanctioned final CSV rebuild runs on the pre-cutover database immediately before the switch.
- At the cutover the persistent production database becomes the single source of truth for freestyle content: the CSV rebuild retires from the production path, and the in-app curation surface (A_Edit_Freestyle_Trick) becomes the sole write path.
- Freestyle table rows survive a data-preserving deploy that does not run the rebuild.
- Recovery from a bad edit is a corrective in-app edit or a database restore; every in-app edit is recorded in the audit trail.
- Cutover tests pin the switch: freestyle rows survive a data-preserving deploy; the rebuild refuses a production database; and the in-app curation surface is the sole post-cutover write path.

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

### SYS_Cross_Region_Replication
Access: This is infrastructure, not an application process. No platform code runs it.

Story: Every backup snapshot and every media object is copied to a second region as it is written, so that losing the primary region does not lose the platform's data.

Success Criteria:

- Replication is continuous and native to the object store, not a scheduled job: each object is copied to its disaster-recovery bucket as it is written, delete markers included. No platform code participates, so there is no run to record and no job status to show.
- The disaster-recovery buckets are protected with Object Lock and lifecycle rules that enforce retention, with the lock window and the lifecycle window set to the same period, so an object expires at the moment it first becomes deletable.
- Retention defaults (admin-configurable): 90 days or less for general backup objects and snapshots; 7 years for audit logs.
- The cutover snapshot is written under a prefix the routine retention rule does not cover, so the one copy whose purpose is to outlive everything else is not aged out by routine retention.
- Replication failure and sustained replication backlog each raise an alarm, and the staleness of the disaster-recovery copy is itself watched, because that figure is the recovery point actually on offer during an incident. The object store does not retry a failed replication, so every such alarm names work an operator must do.
- Alarms reach an administrator under A_Acknowledge_Alarm rather than as a card on A_View_System_Health, which is built only from what the platform records itself and excludes infrastructure by design.
- Recovery objectives: the cross-region recovery point is replication lag, typically minutes; the cross-region recovery time is operator-paced against a rebuilt host. Primary recovery uses the frequent snapshot mechanism (see SYS_Continuous_Database_Backup).
- Replication proves copies were made and nothing more. That the copies restore is established by periodically restoring from them, including at least once from the disaster-recovery bucket rather than the primary. That the set of copies is complete is established by comparing the two buckets, because a replication rule never covers objects written before it existed and no alarm fires for an object replication was never asked to copy.

### SYS_Continuous_Database_Backup

Access: This process runs under the system role on a configurable interval (default: every 5 minutes; see `continuous_backup_interval_minutes`).

Story: The system continuously backs up the SQLite database to the primary S3 bucket so that recovery is possible with minimal data loss from common issues like corruption, bugs, or accidental deletion. This is the most frequently used recovery mechanism, and is separate from the continuous cross-region replication that copies those snapshots to a second region.

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

# 9. System Administrator Stories

System Administrator stories are not application User Stories, but instead they are DevOps actions performed by technical staff with access to the AWS console, CLI, and related operational tooling. This summary is not an exhaustive list, but it clarifies the boundary between what an Application Administrator (user-role) can do and what must be handled by a System Administrator (developer role) responsible for infrastructure provisioning, deployment operations, and ongoing platform maintenance. All System Administrator AWS actions are logged via CloudTrail.

The System Administrator role covers the operational work required to deploy, secure, and operate the platform in production. Responsibilities include provisioning and maintaining AWS infrastructure (e.g., Lightsail, S3, CloudFront, SES, IAM, Parameter Store/KMS) using infrastructure as code; managing environments and deployments (CI/CD, configuration, rollbacks); rotating and safeguarding secrets/keys and webhook credentials; configuring domains/DNS and TLS certificates; SQLite data storage (versioning, backups, restore testing, and configuration); configuring and monitoring scheduled/background jobs; setting up logging/metrics/alerts and cost controls; applying security updates and access reviews; and leading incident response and operational troubleshooting.

Halting live payments in an incident belongs here rather than to the Application Administrator, and there are two stops rather than one.

The fast stop is the payments-pause script, which sets the platform's runtime pause switch in seconds. New purchases and donations are refused immediately, before any eligibility check or provider call, while webhooks keep processing so money already in flight still settles and still grants what it paid for. Stopping that too would take a member's money and give them nothing. The switch is append-only in the configuration table, so every pause and resume stays on the record with the reason given. It is a System Administrator action rather than an application-administrator control: the application has no write path to that flag and none is planned.

The full stop is disarming, for when the provider integration itself is the problem: disable the Stripe webhook endpoint in the Dashboard, then run the arming script to dark, which rewrites the environment values file, applies Terraform and deploys. It swaps the live adapter out entirely, takes a few minutes, and the order matters — a dark host verifies webhook signatures against the stub secret, so an endpoint left enabled fails every delivery and the provider retries for days before disabling it itself. The same two-level arrangement applies to halting outbound mail.

**END OF User Stories DOCUMENT**