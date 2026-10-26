/**
 * What a copy of the production database keeps of every table and column.
 *
 * Once production is live, every other database is a copy of it, made on the
 * production host from a snapshot by building a fresh database table by table
 * (design decision "Migrations and Non-production Databases with a Live
 * Production Database", DD §1.18). The copy keeps everything, member personal
 * data included, except what is a working key or a link to real money:
 * password hashes, one-time tokens, vote receipts and ballots, unsent mail, and
 * every payment-provider identifier. This register is the single statement of
 * that rule, table by table and column by column, for the copy to follow.
 *
 * There is no default. A table or column missing here is copied by nothing,
 * and a test fails until it is classified, so a new column cannot reach a copy
 * without someone deciding what a copy does with it.
 *
 * - keep: copied as it stands.
 * - drop: the column is cleared in the copy.
 * - rewrite: the copy writes a replacement value, or clears the value only on
 *   the rows the reason names, because clearing every row would break a
 *   constraint or discard what the copy is for.
 * - mask: replaced by a realistic stand-in. Available and unused: personal
 *   data is kept, because masking it would cost realism and upkeep for little
 *   protection beyond the access control on every copy.
 *
 * A table that is not copied at all says why, and its columns are not listed.
 */

export type CopyAction = 'keep' | 'drop' | 'rewrite' | 'mask';

export interface CopiedTable {
  readonly keep: readonly string[];
  readonly drop?: Readonly<Record<string, string>>;
  readonly rewrite?: Readonly<Record<string, string>>;
  readonly mask?: Readonly<Record<string, string>>;
}

export interface UncopiedTable {
  readonly notCopied: string;
}

export type TableClassification = CopiedTable | UncopiedTable;

export function isCopied(entry: TableClassification): entry is CopiedTable {
  return !('notCopied' in entry);
}

// Reasons, each stated once.
const STRIPE_ID =
  'a payment-provider identifier: in a copy it would link a test environment to real money';
const STRIPE_EVENT_LINK =
  'references a provider event, and the provider event ledger is not copied';
const STRIPE_JSON =
  'the JSON carries payment-provider identifiers under stripe_ keys; the copy removes those keys and keeps the rest';
const PAYMENT_TEXT =
  'on payment rows (a provider payout, dispute or charge) this names the provider object by its identifier; the copy clears it on those rows only';

export const COPY_COLUMN_REGISTER: Readonly<Record<string, TableClassification>> = {
  account_tokens: {
    notCopied: 'single-use credential hashes for sign-in, verification and reset links; no copy needs a working token',
  },
  active_player_grants: {
    keep: ['id', 'created_at', 'created_by', 'member_id', 'actor_member_id', 'change_type',
      'old_active_player_expires_at', 'new_active_player_expires_at', 'reason_code', 'reason_text',
      'related_event_id', 'related_registration_id', 'related_club_id', 'related_club_affiliation_id',
      'related_vouch_id'],
  },
  active_player_reminder_sent: {
    keep: ['id', 'created_at', 'created_by', 'member_id', 'expires_at', 'offset_label', 'sent_at'],
  },
  active_player_vouches: {
    keep: ['id', 'created_at', 'created_by', 'voucher_member_id', 'target_member_id', 'vouched_at',
      'reason_text', 'old_active_player_expires_at', 'new_active_player_expires_at'],
  },
  audit_entries: {
    keep: ['id', 'created_at', 'created_by', 'occurred_at', 'actor_type', 'actor_member_id',
      'action_type', 'entity_type', 'category', 'reason_text', 'data_origin'],
    rewrite: {
      entity_id: PAYMENT_TEXT,
      metadata_json: STRIPE_JSON,
    },
  },
  ballots: {
    notCopied: 'encrypted ballots and their receipt token hashes; a vote is secret and a receipt is a credential',
  },
  candidate_cleanup_resolutions: {
    keep: ['id', 'created_at', 'created_by', 'candidate_id', 'predicate_name', 'resolution',
      'parked_by_member_id', 'reason_text'],
  },
  club_bootstrap_leader_signals: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'bootstrap_leader_id', 'signal_type', 'signal_payload_json', 'is_present', 'source'],
  },
  club_bootstrap_leaders: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'club_id',
      'imported_member_id', 'claimed_member_id', 'legacy_member_id', 'role', 'confidence_score',
      'status', 'claim_confirmed_at', 'notes'],
  },
  club_cleanup_claims: {
    keep: ['id', 'created_at', 'created_by', 'item_type', 'item_id', 'claimed_by_member_id',
      'claimed_at'],
  },
  club_cleanup_resolutions: {
    keep: ['id', 'created_at', 'created_by', 'club_id', 'predicate_name', 'resolution',
      'parked_by_member_id', 'reason_text'],
  },
  club_insight_notes: {
    keep: ['id', 'created_at', 'created_by', 'member_id', 'club_id', 'source_stage', 'note_text',
      'source_entity_type', 'source_entity_id'],
  },
  club_leaders: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'club_id',
      'member_id', 'role', 'added_at'],
  },
  club_viability_signals: {
    keep: ['id', 'created_at', 'created_by', 'member_id', 'club_id', 'source_stage',
      'activity_signal', 'source_entity_type', 'source_entity_id'],
  },
  clubs: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'name',
      'description', 'city', 'region', 'country', 'external_url', 'external_url_validated_at',
      'external_url_quarantine_reason', 'status', 'hashtag_tag_id'],
  },
  consecutive_kicks_records: {
    keep: ['id', 'sort_order', 'section', 'subsection', 'discipline', 'year', 'rank', 'player_1',
      'player_2', 'score', 'note', 'event_date', 'event_name', 'location', 'created_at',
      'updated_at'],
  },
  email_archives: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'archive_type',
      'mailing_list_id', 'event_id', 'sender_member_id', 'from_identity', 'subject', 'body_text',
      'sent_at', 'recipient_count'],
  },
  email_templates: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'template_key',
      'subject_template', 'body_template', 'is_enabled', 'pii_classification', 'updated_by_label',
      'updated_at_label'],
  },
  erasure_log: {
    keep: ['id', 'created_at', 'created_by', 'entity_type', 'entity_id', 'erasure_kind'],
  },
  event_disciplines: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'event_id',
      'name', 'discipline_category', 'team_type', 'sort_order', 'is_aggregate_standing'],
  },
  event_organizers: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'event_id',
      'member_id', 'role', 'added_at'],
  },
  event_result_entries: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'event_id',
      'discipline_id', 'results_upload_id', 'placement', 'score_text'],
  },
  event_result_entry_participants: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'result_entry_id', 'participant_order', 'member_id', 'display_name', 'historical_person_id'],
  },
  event_results_uploads: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'event_id',
      'uploaded_by_member_id', 'uploaded_at', 'original_filename', 'notes'],
  },
  events: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'title',
      'description', 'start_date', 'end_date', 'city', 'region', 'country', 'host_club_id',
      'external_url', 'external_url_validated_at', 'registration_deadline',
      'is_attendee_registration_open', 'is_tshirt_size_collected', 'status', 'registration_status',
      'reg_opened_at', 'sanction_status', 'sanction_requested_at', 'sanction_requested_by_member_id',
      'sanction_justification', 'sanction_decided_at', 'sanction_decided_by_member_id',
      'sanction_decision_reason', 'payment_enabled', 'payment_enabled_at',
      'payment_enabled_by_member_id', 'currency', 'competitor_fee_cents', 'attendee_fee_cents',
      'canceled_at', 'cancel_reason', 'canceled_by_member_id', 'hashtag_tag_id'],
  },
  freestyle_ev_adjudications: {
    keep: ['candidate_id', 'sequence_no', 'created_at', 'created_by', 'updated_at', 'updated_by',
      'version', 'submitted_name', 'normalized_name', 'ev_state', 'final_disposition',
      'evidence_state', 'object_type', 'blocker_id', 'blocker_subtype', 'hold_kind',
      'matched_existing_object', 'match_type', 'note', 'source', 'confidence', 'owner',
      'proposed_formula', 'failure_class', 'residual_home', 'published_trick_slug',
      'authored_notation', 'notation_evidence_basis', 'notation_derivation_method',
      'notation_convention_id', 'notation_provenance_note', 'notation_authored_at',
      'notation_authored_by'],
  },
  freestyle_records: {
    keep: ['id', 'record_type', 'person_id', 'display_name', 'trick_name', 'sort_name',
      'adds_count', 'value_numeric', 'value_text', 'achieved_date', 'date_precision', 'source',
      'confidence', 'video_url', 'video_timecode', 'notes', 'superseded_by', 'created_at',
      'updated_at'],
  },
  freestyle_trick_aliases: {
    keep: ['alias_slug', 'alias_text', 'trick_slug', 'alias_type', 'alias_display', 'source_id',
      'provenance_note', 'display_reason', 'alias_origin_producer', 'created_at'],
  },
  freestyle_trick_modifier_links: {
    keep: ['trick_slug', 'modifier_slug', 'apply_order'],
  },
  freestyle_trick_modifiers: {
    keep: ['slug', 'modifier_name', 'add_bonus', 'add_bonus_rotational', 'modifier_type', 'notes',
      'loaded_at'],
  },
  freestyle_trick_source_links: {
    keep: ['trick_slug', 'source_id', 'external_ref', 'external_url', 'asserted_adds',
      'asserted_notation', 'asserted_category', 'notes'],
  },
  freestyle_trick_sources: {
    keep: ['id', 'source_type', 'source_label', 'source_url', 'retrieved_at', 'notes'],
  },
  freestyle_tricks: {
    keep: ['slug', 'canonical_name', 'adds', 'base_trick', 'trick_family', 'category',
      'description', 'aliases_json', 'notation', 'operational_notation',
      'operational_notation_source', 'review_status', 'is_core', 'is_active', 'sort_order',
      'loaded_at', 'updated_at', 'jobs_notation_raw', 'jobs_notation_normalized',
      'structural_parse_json', 'computed_add_formula', 'computed_adds', 'add_formula_status',
      'short_description', 'execution_summary', 'learning_notes', 'prerequisite_notes',
      'pronunciation', 'notation_evidence_basis', 'notation_derivation_method',
      'notation_convention_id', 'trick_origin_producer'],
  },
  gallery_external_links: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'gallery_id',
      'label', 'url', 'validated_at', 'quarantine_reason', 'sort_order'],
  },
  given_name_variants: {
    keep: ['short_form_normalized', 'long_form_normalized', 'created_at'],
  },
  historical_persons: {
    keep: ['person_id', 'person_name', 'aliases', 'legacy_member_id', 'country', 'first_year',
      'last_year', 'event_count', 'placement_count', 'bap_member', 'bap_nickname',
      'bap_induction_year', 'hof_member', 'hof_induction_year', 'is_deceased',
      'freestyle_sequences', 'freestyle_max_add', 'freestyle_unique_tricks',
      'freestyle_diversity_ratio', 'signature_trick_1', 'signature_trick_2', 'signature_trick_3',
      'notes', 'source', 'source_scope'],
  },
  hof_affidavits: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'nomination_id',
      'submitted_by_member_id', 'submitted_at', 'affidavit_text'],
  },
  hof_nominations: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'nomination_year', 'nominator_member_id', 'nominee_member_id', 'nomination_category',
      'nomination_text', 'status', 'decided_by_admin_member_id', 'decided_at', 'decision_reason',
      'vote_id', 'nominee_snapshot_name', 'nominee_snapshot_contact'],
  },
  legacy_club_candidates: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'legacy_club_key', 'display_name', 'city', 'region', 'country', 'description', 'external_url',
      'confidence_score', 'mapped_club_id', 'bootstrap_eligible', 'classification',
      'lifecycle_state', 'admin_promoted_at', 'contact_signal_substitute_applied',
      'last_hosted_year', 'max_affiliated_member_last_year', 'contact_member_last_year',
      'created_year', 'last_updated_year', 'unique_member_names', 'linkable_member_count',
      'ever_hosted'],
  },
  legacy_members: {
    keep: ['legacy_member_id', 'legacy_user_id', 'legacy_email', 'legacy_email2', 'legacy_email3',
      'real_name', 'display_name', 'display_name_normalized', 'city', 'region', 'country', 'bio',
      'birth_date', 'street_address', 'postal_code', 'ifpa_join_date', 'first_competition_year',
      'is_hof', 'is_bap', 'legacy_is_admin', 'legacy_ever_paid_tier2',
      'legacy_ever_paid_tier1_lifetime', 'legacy_tier1_annual_active_at_cutover',
      'legacy_was_board_at_cutover', 'import_source', 'imported_at', 'version',
      'claimed_by_member_id', 'claimed_at'],
  },
  legacy_person_club_affiliations: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'historical_person_id', 'legacy_member_id', 'legacy_club_candidate_id', 'inferred_role',
      'confidence_score', 'resolution_status', 'resolved_club_id', 'display_name', 'notes'],
  },
  mailing_list_subscriptions: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'mailing_list_id', 'member_id', 'status', 'status_updated_at', 'bounce_detail',
      'complaint_detail'],
  },
  mailing_lists: {
    keep: ['slug', 'updated_at', 'name', 'description', 'status', 'is_member_manageable',
      'from_identity', 'rules_text', 'subject_prefix', 'restricted_sending', 'recipient_source',
      'source_group_id'],
  },
  media_flags: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'media_id',
      'reporter_member_id', 'reason_code', 'reason_text', 'reported_at', 'status', 'resolved_at',
      'resolved_by_admin_member_id', 'resolution_label', 'resolution_reason'],
  },
  media_items: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'uploader_member_id', 'media_type', 'is_avatar', 'caption', 'uploaded_at', 's3_key_thumb',
      's3_key_display', 'width_px', 'height_px', 'video_platform', 'video_id', 'video_url',
      'thumbnail_url', 'mime_type', 'moderation_status', 'moderation_reason', 'source_filename',
      'source_sha256', 'source_id', 'start_seconds', 'end_seconds', 'external_url',
      'external_url_validated_at'],
  },
  media_jobs: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'kind', 'state',
      'admin_member_id', 'source_video_key', 'source_poster_key', 'caption', 'tags',
      'source_filename', 'media_id', 'retry_count', 'last_error', 'last_attempted_at',
      'lease_expires_at', 'expires_at'],
  },
  media_sources: {
    keep: ['source_id', 'source_name', 'source_type', 'url', 'creator'],
  },
  media_tags: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'media_id',
      'tag_id', 'tag_display'],
  },
  member_club_affiliations: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'member_id',
      'club_id', 'is_current', 'is_primary', 'source'],
  },
  member_declared_anchors: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'member_id',
      'anchor_type', 'anchor_value'],
  },
  member_galleries: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'owner_member_id', 'name', 'description', 'is_default', 'sort_order'],
  },
  member_gallery_exclude_tags: {
    keep: ['gallery_id', 'tag_id', 'created_at', 'created_by'],
  },
  member_gallery_tags: {
    keep: ['gallery_id', 'tag_id', 'created_at', 'created_by'],
  },
  member_links: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'member_id',
      'label', 'url', 'validated_at', 'sort_order'],
  },
  member_messages: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'recipient_member_id', 'sender_admin_member_id', 'work_queue_item_id', 'subject',
      'body_text', 'expected_answer_kind', 'status', 'outcome', 'note_text', 'sent_at',
      'answered_at'],
  },
  member_onboarding_tasks: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'member_id',
      'task_type', 'state', 'completed_at', 'birth_date_changes', 'last_attempt_opened_at',
      'answer_json'],
  },
  member_tier_grants: {
    keep: ['id', 'created_at', 'created_by', 'member_id', 'actor_member_id', 'change_type',
      'old_tier_status', 'new_tier_status', 'old_underlying_tier_status',
      'new_underlying_tier_status', 'reason_code', 'reason_text', 'related_payment_id'],
  },
  members: {
    keep: ['id', 'slug', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'deleted_at', 'deleted_by', 'login_email', 'login_email_normalized', 'email_verified_at',
      'email_status', 'password_hash_version', 'password_version', 'password_changed_at',
      'last_login_at', 'family_name', 'given_names', 'real_name', 'display_name',
      'display_name_normalized', 'bio', 'city', 'region', 'country', 'gender', 'phone', 'whatsapp',
      'email_visibility', 'phone_visible', 'whatsapp_visible', 'searchable', 'avatar_media_id',
      'is_admin', 'is_system', 'is_board', 'is_hof', 'hof_last_nominated_year',
      'hof_inducted_year', 'is_bap', 'bap_inducted_year', 'is_deceased', 'deceased_at',
      'deletion_requested_at', 'deletion_grace_expires_at', 'personal_data_purged_at',
      'first_competition_year', 'show_competitive_results', 'show_first_competition_year',
      'show_gender', 'legacy_member_id', 'legacy_user_id', 'legacy_email', 'ifpa_join_date',
      'birth_date', 'street_address', 'postal_code', 'legacy_is_admin', 'historical_person_id'],
    drop: {
      stripe_customer_id: STRIPE_ID,
    },
    rewrite: {
      password_hash:
        'a copied hash is a working credential; the copy writes a value that can never verify, because the credential constraint refuses an empty hash on a live account',
    },
  },
  name_variants: {
    keep: ['canonical_normalized', 'variant_normalized', 'source', 'created_at'],
  },
  net_discipline_group: {
    keep: ['discipline_id', 'canonical_group', 'match_method', 'review_needed', 'conflict_flag',
      'mapped_at', 'mapped_by'],
  },
  net_stat_policy: {
    keep: ['evidence_class', 'display_label', 'may_show_public', 'requires_disclaimer',
      'disclaimer_text', 'may_use_in_stats', 'created_at'],
  },
  net_team: {
    keep: ['team_id', 'person_id_a', 'person_id_b', 'first_year', 'last_year', 'appearance_count',
      'created_at', 'updated_at'],
  },
  net_team_appearance: {
    keep: ['id', 'team_id', 'event_id', 'discipline_id', 'result_entry_id', 'placement',
      'score_text', 'event_year', 'evidence_class', 'extracted_at'],
  },
  net_team_member: {
    keep: ['id', 'team_id', 'person_id', 'position'],
  },
  news_items: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'published_at',
      'news_type', 'title', 'body', 'entity_type', 'entity_id', 'is_public'],
  },
  outbox_emails: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'idempotency_key', 'recipient_member_id', 'mailing_list_id', 'sender_member_id',
      'from_identity', 'stream', 'subject', 'template_key', 'bypasses_suppression', 'status',
      'retry_count', 'last_error', 'last_attempt_at', 'sent_at', 'scheduled_for',
      'provider_message_id', 'reviewed_at', 'reviewed_by_member_id', 'review_note'],
    rewrite: {
      recipient_email:
        'an unsent row is not copied, so nothing in a copy can deliver it; sent rows keep their recipient',
      body_text:
        'an unsent row is not copied, and a sent body built from a template that carries a sign-in, verification, reset or claim link is cleared, because the link holds a plaintext token',
    },
  },
  payment_status_transitions: {
    keep: ['id', 'created_at', 'created_by', 'payment_id', 'event_type', 'from_status', 'to_status',
      'transition_at', 'transition_reason_text', 'correlation_key'],
    drop: {
      stripe_event_id: STRIPE_EVENT_LINK,
      stripe_payment_intent_id: STRIPE_ID,
      stripe_invoice_id: STRIPE_ID,
      stripe_subscription_id: STRIPE_ID,
    },
    rewrite: {
      metadata_json: STRIPE_JSON,
    },
  },
  payments: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'member_id',
      'payment_type', 'amount_cents', 'currency', 'status', 'descriptor',
      'last_stripe_event_created', 'provider_livemode', 'recurring_subscription_id',
      'donation_note', 'purchased_tier_status'],
    drop: {
      stripe_payment_intent_id: STRIPE_ID,
      stripe_checkout_session_id: STRIPE_ID,
      stripe_customer_id: STRIPE_ID,
      stripe_subscription_id: STRIPE_ID,
      stripe_invoice_id: STRIPE_ID,
    },
    rewrite: {
      metadata_json: STRIPE_JSON,
    },
  },
  reconciliation_issues: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'issue_type',
      'payment_id', 'subscription_record_id', 'status', 'resolved_at', 'resolved_by_member_id',
      'resolution_notes', 'expires_at'],
    drop: {
      stripe_payment_intent_id: STRIPE_ID,
      stripe_subscription_id: STRIPE_ID,
      stripe_invoice_id: STRIPE_ID,
    },
    rewrite: {
      details_json: STRIPE_JSON,
    },
  },
  recurring_donation_subscription_transitions: {
    keep: ['id', 'created_at', 'created_by', 'recurring_subscription_id', 'member_id',
      'event_type', 'lifecycle_event_code', 'old_status', 'new_status', 'occurred_at',
      'reason_text', 'correlation_key'],
    drop: {
      stripe_event_id: STRIPE_EVENT_LINK,
      stripe_invoice_id: STRIPE_ID,
    },
    rewrite: {
      stripe_subscription_id:
        'a payment-provider identifier the ledger requires on every row; the copy writes a placeholder that names no provider object',
      metadata_json: STRIPE_JSON,
    },
  },
  recurring_donation_subscriptions: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'member_id',
      'last_stripe_event_created', 'amount_cents', 'currency', 'billing_interval', 'started_at',
      'status_updated_at', 'is_cancel_at_period_end', 'cancel_requested_at', 'canceled_at',
      'donation_note', 'failure_count', 'metadata_json', 'provider_livemode'],
    drop: {
      stripe_customer_id: STRIPE_ID,
      stripe_subscription_id: STRIPE_ID,
      checkout_session_id: STRIPE_ID,
      last_stripe_event_id: STRIPE_EVENT_LINK,
    },
    rewrite: {
      status:
        'an active or past-due subscription must carry both provider identifiers, which the copy clears, so the copy writes those rows as canceled',
    },
  },
  registration_discipline_selections: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'registration_id', 'discipline_id', 'partner_member_id', 'partner_display_name'],
  },
  registrations: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'event_id',
      'member_id', 'registered_at', 'registration_type', 'status', 'cancel_reason', 'canceled_at',
      'tshirt_size', 'donation_amount_cents', 'payment_id', 'attended_at',
      'attended_marked_by_member_id'],
  },
  schema_migrations: {
    keep: ['filename', 'checksum', 'applied_at', 'applied_by'],
  },
  ses_events: {
    keep: ['message_id', 'created_at', 'event_type', 'processed_at', 'recipient_count',
      'mail_message_id', 'outbox_email_id'],
  },
  sns_alarm_events: {
    keep: ['message_id', 'created_at', 'alarm_name', 'processed_at'],
  },
  stripe_events: {
    notCopied: 'the ledger of provider webhook events is made of provider identifiers and nothing else',
  },
  stripe_webhook_failures: {
    keep: ['bucket_start', 'reason', 'failure_count', 'first_seen_at', 'last_seen_at',
      'last_event_type', 'expires_at'],
    drop: {
      last_event_id: STRIPE_ID,
    },
  },
  symbolic_equivalence_clusters: {
    keep: ['cluster_id', 'cluster_label', 'symbolic_normalization', 'member_trick_slugs',
      'ifpa_decomposition_variance', 'add_range', 'anchor_topology_group', 'notes',
      'review_status'],
  },
  symbolic_glossary_crosslinks: {
    keep: ['crosslink_id', 'term_a', 'term_b', 'relationship', 'cluster', 'source', 'notes',
      'educational_value'],
  },
  symbolic_modifier_groups: {
    keep: ['symbolic_group_id', 'display_name', 'classification_axis', 'description',
      'representative_examples', 'confidence_level', 'source_basis', 'review_status'],
  },
  symbolic_movement_archetypes: {
    keep: ['archetype_id', 'archetype_label', 'uptime_pattern', 'midtime_pattern',
      'downtime_pattern', 'anchor_topology_group', 'anchor_modifier_groups', 'member_examples',
      'min_adds', 'max_adds', 'educational_value', 'notes'],
  },
  symbolic_topology_groups: {
    keep: ['symbolic_group_id', 'display_name', 'classification_axis', 'description',
      'representative_examples', 'confidence_level', 'source_basis', 'review_status'],
  },
  system_alarm_events: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'alarm_type',
      'severity', 'raised_at', 'cleared_at', 'status', 'acknowledged_by_member_id',
      'acknowledged_at', 'acknowledgment_note', 'details_json'],
  },
  system_config: {
    keep: ['id', 'created_at', 'config_key', 'effective_start_at', 'reason_text',
      'changed_by_member_id'],
    rewrite: {
      value_json:
        'the in-database cutover marker is reset in the copy, so nothing on the copy behaves as though it were the live production database',
    },
  },
  system_job_runs: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'job_name',
      'started_at', 'finished_at', 'status', 'last_error'],
    rewrite: {
      details_json:
        'the payment reconciliation run records the issues it raised and resolved, provider identifiers included; the copy removes those identifiers',
    },
  },
  tag_stats: {
    keep: ['tag_id', 'usage_count', 'distinct_member_count', 'last_used_at', 'created_at',
      'updated_at', 'computed_at'],
  },
  tags: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'tag_normalized', 'tag_display', 'is_standard', 'standard_type', 'retired_at',
      'retired_by_member_id'],
  },
  vote_eligibility_snapshot: {
    notCopied: 'who was eligible for each vote is governance evidence that no copy needs',
  },
  vote_options: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'vote_id',
      'option_type', 'title', 'description', 'nominee_member_id', 'nomination_id', 'sort_order'],
  },
  vote_result_option_totals: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'vote_results_id', 'option_id', 'vote_count'],
  },
  vote_results: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'vote_id',
      'published_at', 'published_by_admin_member_id', 'summary_text', 'result_json'],
  },
  votes: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version', 'title',
      'description', 'vote_type', 'ballot_type', 'nomination_open_at', 'nomination_close_at',
      'vote_open_at', 'vote_close_at', 'options_visible_at', 'status', 'eligibility_rule_json',
      'background_text'],
  },
  work_queue_items: {
    keep: ['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version',
      'queue_category', 'task_type', 'entity_type', 'status', 'priority', 'opened_at',
      'resolved_at', 'resolved_by_member_id', 'decision_label', 'reason_text',
      'claimed_by_member_id', 'claimed_at', 'parked_at', 'parked_by_member_id', 'park_reason'],
    rewrite: {
      entity_id: PAYMENT_TEXT,
      detail_text: PAYMENT_TEXT,
    },
  },
};
