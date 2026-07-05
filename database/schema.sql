-- =============================================================================
-- Footbag.org: SQLite database schema
-- International Footbag Players Association (IFPA) platform
--
-- Required at every connection before any reads or writes:
--   PRAGMA foreign_keys = ON;
--
-- Initialize a fresh database:
--   sqlite3 footbag.db < schema.sql
--
-- All timestamps are stored as ISO-8601 UTC text: 'YYYY-MM-DDTHH:MM:SS.sssZ'
-- Views and triggers that compare timestamps use strftime('%Y-%m-%dT%H:%M:%fZ','now')
-- so that lexical ordering matches chronological ordering. Writers MUST use this
-- same format; mixing space-separated datetime() output breaks sort correctness.

PRAGMA foreign_keys = ON;

-- =============================================================================
-- SECTION 1: TAGS
-- =============================================================================

-- Globally unique hashtag registry used for media tagging and discovery.
-- Standard tags (#event_*, #club_*) are platform-managed identities that link
-- media, events, and clubs. Freeform tags are member-created. Tags are never
-- soft-deleted; uniqueness of tag_normalized is enforced globally (no WHERE clause).
-- Standard tags must not be hard-deleted (application-enforced; see APP-024):
-- the unique index cannot prevent normalized-form reuse if a row is removed.
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  tag_normalized TEXT NOT NULL,
  tag_display    TEXT NOT NULL,

  is_standard   INTEGER NOT NULL DEFAULT 0 CHECK (is_standard IN (0,1)),
  standard_type TEXT CHECK (standard_type IN ('event','club')),

  CHECK (tag_normalized = lower(tag_normalized)),
  CHECK (substr(tag_normalized,1,1) = '#')
);

CREATE UNIQUE INDEX ux_tags_normalized ON tags(tag_normalized);

-- =============================================================================
-- SECTION 2: CLUBS
-- =============================================================================

-- Registered footbag clubs with location, contact, and branding information.
-- Uses status-based archival (active/inactive/archived) instead of soft-delete.
-- Each club has a unique hashtag that serves as its canonical media-linking identity.
-- clubs_open excludes archived rows; clubs_active narrows that to active rows
-- for the public directory; clubs_all includes archived for admin queries.
CREATE TABLE clubs (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL,
  region      TEXT,
  country     TEXT NOT NULL,

  external_url              TEXT,
  external_url_validated_at TEXT,
  -- Non-NULL when the boot scan rejected the seeded URL (a Safe Browsing match
  -- or a post-write threat-list change). Public render hides the URL; the
  -- club-edit read still returns it so an operator can replace or remove it.
  external_url_quarantine_reason TEXT,

  -- ON DELETE SET NULL: deleting a media item detaches the club logo without
  -- requiring a before-delete trigger. The application stamps updated_at/updated_by
  -- on the club row when it deliberately removes a logo; the FK action handles
  -- the case where media is deleted directly (e.g., by the uploader or an admin).
  logo_media_id TEXT REFERENCES media_items(id) ON DELETE SET NULL,

  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  hashtag_tag_id TEXT NOT NULL REFERENCES tags(id)
);

-- clubs_open: active and inactive rows (excludes archived clubs)
CREATE VIEW clubs_open AS
  SELECT * FROM clubs WHERE status IN ('active', 'inactive');

-- clubs_active: active rows only. The public club directory lists active clubs;
-- inactive clubs stay reachable by direct link but drop out of the listings.
CREATE VIEW clubs_active AS
  SELECT * FROM clubs WHERE status = 'active';

-- clubs_all: all rows including archived; use for admin queries and audits
CREATE VIEW clubs_all AS
  SELECT * FROM clubs;

CREATE INDEX        idx_clubs_geo    ON clubs(country, region, city);
CREATE INDEX        idx_clubs_status ON clubs(status);
CREATE UNIQUE INDEX ux_clubs_hashtag ON clubs(hashtag_tag_id);

-- =============================================================================
-- SECTION 3: EVENTS
-- =============================================================================

-- Footbag events with lifecycle (draft → published → completed/canceled),
-- optional sanctioning workflow, payment configuration, and registration controls.
-- Events use hard-delete; published events with results are preserved by
-- application workflow constraints. Each event has a unique hashtag identity.
CREATE TABLE events (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  city        TEXT NOT NULL,
  region      TEXT,
  country     TEXT NOT NULL,
  host_club_id TEXT REFERENCES clubs(id),

  external_url              TEXT,
  external_url_validated_at TEXT,

  registration_deadline             TEXT,
  capacity_limit                    INTEGER,
  is_attendee_registration_open     INTEGER NOT NULL DEFAULT 0 CHECK (is_attendee_registration_open IN (0,1)),
  is_tshirt_size_collected          INTEGER NOT NULL DEFAULT 0 CHECK (is_tshirt_size_collected IN (0,1)),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','published','registration_full','closed','completed','canceled')),
  registration_status TEXT NOT NULL DEFAULT 'open' CHECK (registration_status IN ('open','closed')),
  published_at TEXT,

  sanction_status TEXT NOT NULL DEFAULT 'none'
    CHECK (sanction_status IN ('none','pending','approved','rejected')),
  sanction_requested_at           TEXT,
  sanction_requested_by_member_id TEXT REFERENCES members(id),
  sanction_justification          TEXT,
  sanction_decided_at             TEXT,
  sanction_decided_by_member_id   TEXT REFERENCES members(id),
  sanction_decision_reason        TEXT,

  payment_enabled              INTEGER NOT NULL DEFAULT 0 CHECK (payment_enabled IN (0,1)),
  payment_enabled_at           TEXT,
  payment_enabled_by_member_id TEXT REFERENCES members(id),

  currency             TEXT NOT NULL DEFAULT 'USD',
  competitor_fee_cents INTEGER,
  attendee_fee_cents   INTEGER,

  hashtag_tag_id TEXT NOT NULL REFERENCES tags(id)
);

CREATE INDEX        idx_events_start_date      ON events(start_date);
CREATE INDEX        idx_events_geo             ON events(country, region, city);
CREATE INDEX        idx_events_status          ON events(status);
CREATE UNIQUE INDEX ux_events_hashtag          ON events(hashtag_tag_id);
CREATE INDEX        idx_events_sanction_status ON events(sanction_status);
CREATE INDEX        idx_events_host_club       ON events(host_club_id);

-- Disciplines offered at a specific event (e.g., freestyle singles, net doubles).
-- Each discipline defines the participation format (singles/doubles/mixed_doubles)
-- used at registration time to enforce partner requirements.
-- No soft-delete: disciplines are hard-deleted when removed from a draft event.
CREATE TABLE event_disciplines (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  event_id            TEXT NOT NULL REFERENCES events(id),
  name                TEXT NOT NULL,
  discipline_category TEXT NOT NULL,
  team_type TEXT NOT NULL DEFAULT 'singles'
    CHECK (team_type IN ('singles', 'doubles', 'mixed_doubles')),
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- idx_event_disciplines_event dropped (left-prefix redundant with ux_event_discipline_name)
CREATE UNIQUE INDEX ux_event_discipline_name ON event_disciplines(event_id, name);

-- =============================================================================
-- SECTION 4: ACTIVE PLAYER VOUCHES
-- =============================================================================

-- Append-only ledger of vouch actions taken by Tier 2 or Tier 3 members for
-- Tier 0 members. A vouch grants or extends Active Player status only; it never
-- changes membership tier. Vouches against Tier 1, Tier 2, or Tier 3 targets are
-- a no-op at the application layer and must not produce a row here. Each row
-- points (via active_player_grants.related_vouch_id) to the resulting Active
-- Player ledger row when the vouch had effect. UPDATE and DELETE are blocked by
-- triggers. A DB CHECK prevents structurally malformed self-vouch rows.
CREATE TABLE active_player_vouches (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  voucher_member_id TEXT NOT NULL REFERENCES members(id),
  target_member_id  TEXT NOT NULL REFERENCES members(id),

  vouched_at  TEXT NOT NULL,
  reason_text TEXT,

  old_active_player_expires_at TEXT,
  new_active_player_expires_at TEXT,

  -- Structural integrity: a member cannot vouch for themselves.
  CHECK (voucher_member_id <> target_member_id)
);

CREATE TRIGGER trg_active_player_vouches_no_update
BEFORE UPDATE ON active_player_vouches
BEGIN
  SELECT RAISE(ABORT,
    'active_player_vouches is append-only: UPDATE not permitted');
END;

CREATE TRIGGER trg_active_player_vouches_no_delete
BEFORE DELETE ON active_player_vouches
BEGIN
  SELECT RAISE(ABORT,
    'active_player_vouches is append-only: DELETE not permitted');
END;

CREATE INDEX idx_active_player_vouches_target
  ON active_player_vouches(target_member_id, vouched_at);
CREATE INDEX idx_active_player_vouches_voucher
  ON active_player_vouches(voucher_member_id, vouched_at);

-- =============================================================================
-- SECTION 5: VOTES & ELECTIONS
-- =============================================================================

-- An election or issue vote. Captures the ballot type, timing windows
-- (nomination phase, voting phase, options visibility), eligibility rules,
-- and lifecycle status. DB CHECK constraints enforce ordering invariants
-- across nomination and voting windows to protect election integrity.
-- vote_eligibility_snapshot is frozen at vote-open time. Membership tier
-- changes (admin override, governance grant/removal) and Active Player changes
-- during an open vote do NOT revoke eligibility, because the snapshot is
-- authoritative.
-- options_visible_at: when set, options are visible before vote_open_at
-- (application enforces options_visible_at <= vote_open_at).
CREATE TABLE votes (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  vote_type   TEXT NOT NULL CHECK (vote_type IN ('election','issue')),
  ballot_type TEXT NOT NULL CHECK (ballot_type IN ('single_choice','multi_choice')),
  nomination_open_at  TEXT,
  nomination_close_at TEXT,
  vote_open_at        TEXT NOT NULL,
  vote_close_at       TEXT NOT NULL,
  options_visible_at  TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','open','closed','published','canceled')),

  eligibility_rule_json TEXT NOT NULL DEFAULT '{}',
  background_text       TEXT NOT NULL DEFAULT '',

  -- Vote window ordering invariants (election integrity; DB-enforced because
  -- multiple admin paths can write votes).
  CHECK (vote_open_at < vote_close_at),
  CHECK (
    nomination_open_at IS NULL OR nomination_close_at IS NULL
    OR nomination_open_at < nomination_close_at
  ),
  CHECK (
    nomination_close_at IS NULL
    OR nomination_close_at <= vote_open_at
  )
);

CREATE INDEX idx_votes_status     ON votes(status);
CREATE INDEX idx_votes_open_close ON votes(vote_open_at, vote_close_at);

-- Candidate or choice options available for a vote. Immutable once voting opens:
-- INSERT, UPDATE, and DELETE are blocked by triggers for any vote in status
-- open/closed/published/canceled, preventing retroactive changes to cast ballots.
CREATE TABLE vote_options (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  vote_id           TEXT NOT NULL REFERENCES votes(id),
  option_type       TEXT NOT NULL CHECK (option_type IN ('candidate','choice')),
  title             TEXT NOT NULL,
  description       TEXT,
  nominee_member_id TEXT REFERENCES members(id),
  nomination_id     TEXT REFERENCES hof_nominations(id),
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_vote_options_vote ON vote_options(vote_id);

-- vote_options immutability once voting opens.
-- Blocks INSERT, UPDATE, and DELETE on vote_options when the parent vote
-- has reached status 'open', 'closed', 'published', or 'canceled'.
-- Prevents retroactive option changes from corrupting cast ballots.
-- Kept in DB because election integrity requires this invariant regardless of
-- which code path (admin API, background job, direct SQL) touches the table.
CREATE TRIGGER trg_vote_options_lock_insert
BEFORE INSERT ON vote_options
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN (SELECT status FROM votes WHERE id = NEW.vote_id)
         IN ('open','closed','published','canceled')
    THEN RAISE(ABORT,
      'vote_options: cannot add options after voting has opened')
  END;
END;

CREATE TRIGGER trg_vote_options_lock_update
BEFORE UPDATE ON vote_options
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NEW.vote_id <> OLD.vote_id
    THEN RAISE(ABORT,
      'vote_options: vote_id is immutable after creation')
    WHEN (SELECT status FROM votes WHERE id = OLD.vote_id)
         IN ('open','closed','published','canceled')
    THEN RAISE(ABORT,
      'vote_options: cannot modify options after voting has opened')
  END;
END;

CREATE TRIGGER trg_vote_options_lock_delete
BEFORE DELETE ON vote_options
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN (SELECT status FROM votes WHERE id = OLD.vote_id)
         IN ('open','closed','published','canceled')
    THEN RAISE(ABORT,
      'vote_options: cannot delete options after voting has opened')
  END;
END;

-- Eligibility snapshot frozen at vote-open time: one row per member per vote,
-- recording whether the member was eligible when voting opened. Immutable after
-- insert; UPDATE and DELETE are blocked by triggers to protect election integrity.
-- Tier changes after vote-open do not alter this snapshot.
CREATE TABLE vote_eligibility_snapshot (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  vote_id       TEXT NOT NULL REFERENCES votes(id),
  member_id     TEXT NOT NULL REFERENCES members(id),
  eligible      INTEGER NOT NULL CHECK (eligible IN (0,1)),
  reason_code   TEXT,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(vote_id, member_id)
);

CREATE INDEX idx_vote_eligibility_vote ON vote_eligibility_snapshot(vote_id);

CREATE TRIGGER trg_vote_eligibility_no_update
BEFORE UPDATE ON vote_eligibility_snapshot
BEGIN
  SELECT RAISE(ABORT, 'vote_eligibility_snapshot is immutable; frozen at vote open time');
END;

CREATE TRIGGER trg_vote_eligibility_no_delete
BEFORE DELETE ON vote_eligibility_snapshot
BEGIN
  SELECT RAISE(ABORT, 'vote_eligibility_snapshot is immutable; rows may not be deleted');
END;

-- Cast ballots: one row per member per vote, immutable after insert.
-- Each ballot is AES-256-GCM envelope-encrypted with a per-ballot KMS data key.
-- Voter identity (voter_member_id) is stored as plaintext alongside the encrypted
-- ballot. This is intentional: participation fact is not hidden, only content is.
-- UPDATE and DELETE are blocked by triggers to prevent tampering.
CREATE TABLE ballots (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  vote_id         TEXT NOT NULL REFERENCES votes(id),
  -- voter_member_id: plaintext participation metadata (intentional).
  -- ballots is NOT anonymous-ballot storage. Voter identity is co-located
  -- with the encrypted ballot by design. Ballot content confidentiality is provided
  -- by AES-256-GCM encryption; participation fact (who voted) is not hidden.
  voter_member_id TEXT NOT NULL REFERENCES members(id),
  cast_at         TEXT NOT NULL,

  receipt_token_hash         TEXT NOT NULL,
  receipt_token_hash_version INTEGER NOT NULL DEFAULT 1,

  -- AES-256-GCM envelope encryption per ballot.
  -- Each ballot uses a fresh data key from KMS (GenerateDataKey).
  -- All four fields are required to decrypt a ballot during tally operations.
  encrypted_ballot_b64   TEXT NOT NULL,
  encrypted_data_key_b64 TEXT NOT NULL,
  kms_key_id             TEXT NOT NULL,
  encryption_version     INTEGER NOT NULL DEFAULT 1,
  -- AES-GCM nonce (IV), base64-encoded. Required for decryption.
  ballot_nonce_b64       TEXT NOT NULL,
  -- AES-GCM authentication tag, base64-encoded. Required for integrity verification.
  ballot_auth_tag_b64    TEXT NOT NULL,

  UNIQUE(vote_id, voter_member_id),
  UNIQUE(vote_id, receipt_token_hash)
);

CREATE TRIGGER trg_ballots_no_update
BEFORE UPDATE ON ballots
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'ballots is immutable: UPDATE not permitted');
END;

CREATE TRIGGER trg_ballots_no_delete
BEFORE DELETE ON ballots
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'ballots is immutable: DELETE not permitted');
END;

CREATE INDEX idx_ballots_vote  ON ballots(vote_id);
CREATE INDEX idx_ballots_voter ON ballots(voter_member_id);

-- Tally outcome record for a completed vote: one row per vote, written when
-- the tally is finalized and published. Stores publication metadata, a summary,
-- and optionally a full result_json blob. Normalized per-option counts are in
-- vote_result_option_totals; both representations may coexist.
CREATE TABLE vote_results (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  vote_id                      TEXT NOT NULL UNIQUE REFERENCES votes(id),
  published_at                 TEXT,
  published_by_admin_member_id TEXT REFERENCES members(id),
  summary_text                 TEXT,

  -- Optional single-blob JSON tally result per vote.
  -- Complementary to the normalized vote_result_option_totals rows;
  -- the application may populate both or only the normalized form.
  result_json TEXT
);

-- Normalized per-option vote counts for a tally result.
-- One row per option per vote result, complementing the optional result_json
-- blob in vote_results with a structured, queryable breakdown.
CREATE TABLE vote_result_option_totals (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  vote_results_id TEXT NOT NULL REFERENCES vote_results(id),
  option_id       TEXT NOT NULL REFERENCES vote_options(id),
  vote_count      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(vote_results_id, option_id)
);

CREATE INDEX idx_vote_totals_results ON vote_result_option_totals(vote_results_id);

-- =============================================================================
-- SECTION 6: HALL OF FAME
-- =============================================================================

-- Hall of Fame nominations submitted by members each year.
-- vote_id links a nomination to the associated HoF election vote (NULL for
-- legacy nominations that predate the platform). Snapshot fields capture the
-- nominee's name and contact at submission time, ensuring records remain
-- complete even if the member's profile is later changed or GDPR-purged.
-- UNIQUE(nomination_year, nominee_member_id) prevents duplicate nominations per year.
CREATE TABLE hof_nominations (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  nomination_year     INTEGER NOT NULL,
  nominator_member_id TEXT NOT NULL REFERENCES members(id),
  nominee_member_id   TEXT NOT NULL REFERENCES members(id),
  nomination_category TEXT NOT NULL CHECK (nomination_category IN ('player','contributor')),
  nomination_text     TEXT,
  status TEXT NOT NULL DEFAULT 'pending_admin_approval'
    CHECK (status IN ('pending_admin_approval','approved','rejected','withdrawn')),
  decided_by_admin_member_id TEXT REFERENCES members(id),
  decided_at      TEXT,
  decision_reason TEXT,

  vote_id TEXT REFERENCES votes(id),

  -- Snapshot fields: capture nominee identity at submission time.
  -- nominee_member_id provides the FK for platform members but their profile
  -- data (name, contact) can change or be GDPR-purged after nomination.
  -- nominee_snapshot_name is required on new rows (NOT NULL).
  -- For legacy pre-platform rows inserted during data migration, populate
  -- nominee_snapshot_name from the member's real_name at import time.
  -- nominee_snapshot_contact is free text (email, phone, or other); nullable
  -- because some legacy nominees may have no contact record.
  nominee_snapshot_name    TEXT NOT NULL,
  nominee_snapshot_contact TEXT,

  UNIQUE(nomination_year, nominee_member_id)
);

CREATE INDEX idx_hof_nominations_status  ON hof_nominations(status);
CREATE INDEX idx_hof_nominations_year    ON hof_nominations(nomination_year);
CREATE INDEX idx_hof_nominations_nominee ON hof_nominations(nominee_member_id);

-- Supporting affidavit submitted for a Hall of Fame nomination.
-- One affidavit per nomination (UNIQUE on nomination_id). Stores the full
-- affidavit text and submission metadata.
CREATE TABLE hof_affidavits (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  nomination_id          TEXT NOT NULL UNIQUE REFERENCES hof_nominations(id),
  submitted_by_member_id TEXT NOT NULL REFERENCES members(id),
  submitted_at           TEXT NOT NULL,
  affidavit_text         TEXT NOT NULL
);

-- =============================================================================
-- SECTION 7: NEWS
-- =============================================================================

-- Platform news feed items: auto-generated by primary entity workflows (event
-- published, results posted, club created/archived, HoF/BAP grant, vote results)
-- and manually authored admin announcements. Hard-delete only; no soft-delete.
-- entity_type/entity_id link an item to its source entity where applicable.
CREATE TABLE news_items (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  published_at TEXT NOT NULL,
  news_type    TEXT NOT NULL
    -- 'club_archived' fires when an admin archives a club (A_Archive_Club).
    CHECK (news_type IN ('event_published','event_results','club_created','club_archived',
                         'member_honor','vote_results','announcement','system')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  entity_type TEXT,
  entity_id   TEXT,
  is_public   INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0,1))
);

CREATE INDEX idx_news_published_at ON news_items(published_at);

-- =============================================================================
-- SECTION 8: MAILING LISTS & EMAIL
-- =============================================================================

-- Named mailing lists used for broadcasts, newsletters, and system alerts.
-- slug is the natural primary key and the stable reference used by outbox_emails,
-- email_archives, and mailing_list_subscriptions. is_member_manageable controls
-- whether members can self-subscribe/unsubscribe. Seven core lists are seeded
-- at initialization (admin-alerts, all-members, newsletter, board-announcements,
-- event-notifications, technical-updates, active-player-reminders); see Section 23.
CREATE TABLE mailing_lists (
  slug       TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,

  name              TEXT NOT NULL UNIQUE,
  description       TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  is_member_manageable INTEGER NOT NULL DEFAULT 1 CHECK (is_member_manageable IN (0,1)),
  from_identity     TEXT,
  rules_text        TEXT
);

-- Transactional email send queue (outbox pattern). All outbound emails are written
-- here first; a background worker picks up pending rows, delivers them, and updates
-- status. Supports retry with dead-lettering and an admin pause toggle.
-- body_text for voting confirmation emails contains a plaintext receipt token that
-- MUST be scrubbed by the sender worker after successful delivery (see APP-019).
-- At least one of recipient_email, recipient_member_id, or mailing_list_id
-- must be non-NULL (enforced by CHECK below).
CREATE TABLE outbox_emails (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  idempotency_key TEXT,

  recipient_email     TEXT,
  recipient_member_id TEXT REFERENCES members(id),
  mailing_list_id     TEXT REFERENCES mailing_lists(slug),

  sender_member_id TEXT REFERENCES members(id),
  from_identity    TEXT,

  subject   TEXT NOT NULL,
  body_text TEXT,
  -- Identifies the registered template that produced this row (stamped by the
  -- email compose service); the admin viewer reads it for type and PII class.
  template_key TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','failed','dead_letter')),
  retry_count     INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  last_attempt_at TEXT,
  sent_at         TEXT,
  scheduled_for   TEXT,

  CHECK (
    recipient_email     IS NOT NULL
    OR recipient_member_id IS NOT NULL
    OR mailing_list_id     IS NOT NULL
  )
);

CREATE INDEX        idx_outbox_status     ON outbox_emails(status);
CREATE INDEX        idx_outbox_scheduled  ON outbox_emails(status, scheduled_for);
CREATE UNIQUE INDEX ux_outbox_idempotency
  ON outbox_emails(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Archive record of bulk email sends (mailing list blasts, event participant
-- emails, announcements). One row per bulk send, capturing sender, subject,
-- body, recipient count, and a reference to the originating list or event.
-- Not a delivery log; records intent and content of each broadcast.
CREATE TABLE email_archives (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  archive_type    TEXT NOT NULL
    CHECK (archive_type IN ('mailing_list','event_participants','announce')),
  mailing_list_id TEXT REFERENCES mailing_lists(slug),
  event_id        TEXT REFERENCES events(id),

  sender_member_id TEXT REFERENCES members(id),
  from_identity    TEXT,
  subject          TEXT NOT NULL,
  body_text        TEXT NOT NULL,
  sent_at          TEXT NOT NULL,
  recipient_count  INTEGER NOT NULL DEFAULT 0,

  CHECK (archive_type <> 'mailing_list'       OR mailing_list_id IS NOT NULL),
  CHECK (archive_type <> 'event_participants' OR event_id IS NOT NULL)
);

CREATE INDEX idx_email_archives_sent  ON email_archives(sent_at);
CREATE INDEX idx_email_archives_event ON email_archives(event_id);

-- Admin-editable email subject and body templates keyed by template_key.
-- The email_templates_enabled view exposes only enabled templates. Disabled templates
-- suppress the corresponding automated email type without deleting the content.
CREATE TABLE email_templates (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  template_key     TEXT NOT NULL UNIQUE,
  subject_template TEXT NOT NULL,
  body_template    TEXT NOT NULL,
  is_enabled       INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  -- Drives how much of a sent message the admin email viewer may reveal:
  -- public/internal bodies show freely, confidential bodies behind a logged
  -- reveal, restricted (token-bearing) bodies never. The compose-service code
  -- registry is the runtime source; this column is the editable override.
  pii_classification TEXT NOT NULL DEFAULT 'confidential'
    CHECK (pii_classification IN ('public','internal','confidential','restricted')),
  updated_by_label TEXT,
  updated_at_label TEXT
);

-- email_templates_enabled: only templates with is_enabled = 1.
-- Setting is_enabled = 0 suppresses the template from automated email flows
-- without deleting the content.
CREATE VIEW email_templates_enabled AS
  SELECT * FROM email_templates WHERE is_enabled = 1;

-- =============================================================================
-- SECTION 9: ADMIN OPERATIONS
-- =============================================================================

-- Admin task queue for items requiring human review or decision across all
-- platform domains (events, media, membership, payments, elections, system).
-- Each item is categorized by queue_category and task_type, linked to an entity,
-- and resolved or dismissed by an admin. A notification is sent to the
-- admin-alerts mailing list when any item is enqueued.
CREATE TABLE work_queue_items (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  queue_category TEXT NOT NULL
    CHECK (queue_category IN ('events','media','membership','payments','elections','system','club_leadership')),
  task_type   TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,

  status   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  priority INTEGER NOT NULL DEFAULT 0,
  opened_at             TEXT NOT NULL,
  resolved_at           TEXT,
  resolved_by_member_id TEXT REFERENCES members(id),
  decision_label        TEXT,
  reason_text           TEXT,
  -- Full member-authored free text for the request (e.g. a contact request),
  -- kept out of the append-only audit ledger so account erasure can clear it.
  -- Scrubbed on PII purge and the deceased contact scrub.
  detail_text           TEXT
);

CREATE INDEX idx_work_queue_status ON work_queue_items(status, queue_category);
CREATE INDEX idx_work_queue_entity ON work_queue_items(entity_type, entity_id);

-- Platform-wide runtime configuration: append-only effective-dated rows.
-- One row per (config_key, effective_start_at) pair. The current effective
-- value for a key is the row with the latest effective_start_at <= now.
-- All rows are immutable once inserted; UPDATE and DELETE are blocked by triggers.
-- Seeded with all required defaults at initialization (see Section 23).
-- Keys with no seed row resolve to a built-in code default at read time (configReader); they do not error.
--
-- Actor attribution: changed_by_member_id is a typed FK to members (admins only).
-- System-seeded rows at initialization use NULL with a documented reason_text
-- explaining the system origin.
--
-- Pricing keys: tier1_price_cents, tier2_price_cents (stored as integer cents,
--   not USD decimals).
CREATE TABLE system_config (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,

  config_key         TEXT NOT NULL,
  value_json         TEXT NOT NULL,
  effective_start_at TEXT NOT NULL,
  reason_text        TEXT NOT NULL,

  -- Typed FK: only admins (or NULL for system-seeded rows) may author config changes.
  changed_by_member_id TEXT REFERENCES members(id),

  UNIQUE (config_key, effective_start_at)
);

-- Immutability: all rows are permanent once inserted.
CREATE TRIGGER trg_system_config_no_update
BEFORE UPDATE ON system_config
BEGIN
  SELECT RAISE(ABORT, 'system_config is append-only: UPDATE not permitted');
END;

CREATE TRIGGER trg_system_config_no_delete
BEFORE DELETE ON system_config
BEGIN
  SELECT RAISE(ABORT, 'system_config is append-only: DELETE not permitted');
END;

CREATE INDEX idx_system_config_actor
  ON system_config(changed_by_member_id)
  WHERE changed_by_member_id IS NOT NULL;

-- system_config_current: the current effective value per config_key.
-- Returns the row with the latest effective_start_at <= now for each key.
-- This is the authoritative read surface for all runtime config lookups.
-- Use this view for all application reads; never query system_config directly
-- unless building admin history UIs or audit reports.
CREATE VIEW system_config_current AS
SELECT s.*
FROM system_config s
WHERE s.effective_start_at = (
  SELECT MAX(s2.effective_start_at)
  FROM system_config s2
  WHERE s2.config_key = s.config_key
    AND s2.effective_start_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

-- Privacy-safe, append-only audit ledger. Records who did what to which entity
-- and when, with structured metadata. IP addresses and user-agent strings are
-- NEVER stored. UPDATE and DELETE are blocked by triggers; rows are permanent.
-- Actor context uses actor_type + actor_member_id (NULL for system actors).
CREATE TABLE audit_entries (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  occurred_at     TEXT NOT NULL,
  actor_type      TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('system','member','admin')),
  actor_member_id TEXT REFERENCES members(id),
  action_type     TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'general',
  reason_text     TEXT,
  metadata_json   TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_audit_occurred_at ON audit_entries(occurred_at);
CREATE INDEX idx_audit_category    ON audit_entries(category);
CREATE INDEX idx_audit_actor_member
  ON audit_entries(actor_member_id)
  WHERE actor_member_id IS NOT NULL;

CREATE TRIGGER trg_audit_no_update
BEFORE UPDATE ON audit_entries
BEGIN
  SELECT RAISE(ABORT, 'audit_entries is immutable; use append only');
END;

CREATE TRIGGER trg_audit_no_delete
BEFORE DELETE ON audit_entries
BEGIN
  SELECT RAISE(ABORT, 'audit_entries is immutable; rows may not be deleted');
END;

-- Append-only ledger of PII erasures. Each row records that an erasure shape
-- was applied to an entity, so a restore from backup can re-apply every
-- erasure before the restored data becomes reachable; an erasure can never be
-- silently undone by routine recovery. Also the authority on which erasure
-- shapes a member row has received: a deceased contact scrub and a full
-- account purge both set members.personal_data_purged_at (the credential
-- CHECK requires it), so the kind discriminator lives here, and a scrubbed
-- row can still be upgraded to a full purge later.
CREATE TABLE erasure_log (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  entity_type  TEXT NOT NULL CHECK (entity_type = 'member'),
  entity_id    TEXT NOT NULL,
  erasure_kind TEXT NOT NULL
    CHECK (erasure_kind IN ('account_pii_purge','deceased_contact_scrub')),

  UNIQUE (entity_type, entity_id, erasure_kind)
);

CREATE TRIGGER trg_erasure_log_no_update
BEFORE UPDATE ON erasure_log
BEGIN
  SELECT RAISE(ABORT, 'erasure_log is immutable; use append only');
END;

CREATE TRIGGER trg_erasure_log_no_delete
BEFORE DELETE ON erasure_log
BEGIN
  SELECT RAISE(ABORT, 'erasure_log is immutable; rows may not be deleted');
END;

-- Execution history for background/scheduled system jobs.
-- Each row records one job run: start time, finish time, outcome, and any
-- error detail. Used for operational monitoring and alerting.
CREATE TABLE system_job_runs (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  job_name    TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','aborted')),
  details_json TEXT NOT NULL DEFAULT '{}',
  last_error   TEXT
);

CREATE INDEX idx_job_runs_job_name ON system_job_runs(job_name, started_at);

-- Infrastructure and operational alarms raised by the platform.
-- Each alarm has a severity level, a lifecycle (active → acknowledged/cleared),
-- and optional admin acknowledgment notes. Used for operational incident tracking.
CREATE TABLE system_alarm_events (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  alarm_type TEXT NOT NULL,
  severity   TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  raised_at  TEXT NOT NULL,
  cleared_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cleared','acknowledged')),
  acknowledged_by_member_id TEXT REFERENCES members(id),
  acknowledged_at           TEXT,
  acknowledgment_note       TEXT,
  details_json              TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_alarm_status ON system_alarm_events(status, severity);

-- =============================================================================
-- SECTION 10: PAYMENTS
-- =============================================================================
-- Table ordering: recurring_donation_subscriptions is defined first because
-- payments.recurring_subscription_id references it.
--
-- stripe_events: Stripe webhook idempotency store; prevents duplicate
--   processing of redelivered events. Not an audit substitute.
-- recurring_donation_subscriptions: current-state mirror of each Stripe
--   Subscription. Updated on every relevant webhook event.
-- recurring_donation_subscription_transitions: append-only subscription
--   lifecycle audit ledger. UPDATE and DELETE blocked by triggers.
-- payments: Stripe-backed payment record for donations, membership dues,
--   and event registrations. Uses 'succeeded' (not 'completed') to align with
--   Stripe payment_intent vocabulary.
-- payment_status_transitions: append-only payment status-change audit ledger.
--   Application MUST write a transition row in the same transaction as every
--   payments.status change.
--
-- Payment state machine (enforced by DB trigger trg_payments_status_monotonicity):
--   pending → succeeded | failed | canceled
--   succeeded → refunded
--   Same-status no-ops are allowed (idempotent webhook redelivery).
--   No backward transitions are permitted.
--   The trigger lives in the DB because multiple independent code paths (webhook
--   handler, admin tools, refund worker) can mutate payments.status, and a
--   DB guard prevents silent backward transitions regardless of which path runs.

-- Stripe webhook event idempotency store. One row per received Stripe event_id,
-- preventing duplicate processing on redelivery. Tracks processing outcome
-- (processed/failed) and retry count. Not a substitute for transition audit tables.
CREATE TABLE stripe_events (
  event_id          TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  -- Stripe event creation time as ISO-8601 UTC text (converted from Stripe Unix epoch at write time).
  -- Use strftime('%Y-%m-%dT%H:%M:%fZ', stripe_event.created, 'unixepoch') when writing.
  stripe_created    TEXT NOT NULL,
  processed_at      TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'processed'
    CHECK (processing_status IN ('processed','failed')),
  -- Number of processing attempts for this event. Incremented on each retry.
  attempts  INTEGER NOT NULL DEFAULT 1,
  last_error TEXT
);

CREATE INDEX idx_stripe_events_created ON stripe_events(stripe_created);

-- SES bounce/complaint webhook idempotency store, parallel to stripe_events.
-- One row per inbound SNS messageId, preventing duplicate processing on SNS
-- redelivery. The handler claims the messageId (INSERT OR IGNORE) inside the
-- feedback transaction and short-circuits when the row already exists, so a
-- redelivered bounce/complaint does not re-flip status or append duplicate
-- audit rows. Append-only idempotency record; not a substitute for the
-- audit_entries ledger that records each processed notification.
CREATE TABLE ses_events (
  message_id   TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- RECURRING DONATION SUBSCRIPTIONS
-- Current-state mirror of a member's recurring donation subscription in Stripe.
-- One row per active-or-historical subscription; updated on each relevant
-- webhook event. Lifecycle history is in the transitions table below.
-- ---------------------------------------------------------------------------

CREATE TABLE recurring_donation_subscriptions (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  member_id TEXT NOT NULL REFERENCES members(id),

  stripe_customer_id     TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL,
  last_stripe_event_id   TEXT REFERENCES stripe_events(event_id),

  -- Current state; updated on each relevant webhook event
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled')),
  amount_cents     INTEGER NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('yearly')),
  started_at        TEXT NOT NULL,
  status_updated_at TEXT NOT NULL,

  is_cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (is_cancel_at_period_end IN (0,1)),
  cancel_requested_at     TEXT,
  canceled_at             TEXT,

  donation_comment TEXT,
  failure_count    INTEGER NOT NULL DEFAULT 0,
  metadata_json    TEXT NOT NULL DEFAULT '{}',

  CHECK (canceled_at IS NULL OR status = 'canceled'),
  CHECK (cancel_requested_at IS NULL OR is_cancel_at_period_end = 1)
);

CREATE UNIQUE INDEX ux_recurring_subs_stripe  ON recurring_donation_subscriptions(stripe_subscription_id);
CREATE INDEX        idx_recurring_subs_member ON recurring_donation_subscriptions(member_id);
CREATE INDEX        idx_recurring_subs_status ON recurring_donation_subscriptions(status);

-- recurring_donation_subscriptions_active: non-canceled subscriptions.
-- Named explicitly so that the WHERE clause is visible in the view name.
-- Use the table directly to query canceled rows.
CREATE VIEW recurring_donation_subscriptions_active AS
  SELECT * FROM recurring_donation_subscriptions
  WHERE status <> 'canceled';

-- ---------------------------------------------------------------------------
-- RECURRING DONATION SUBSCRIPTION TRANSITIONS
-- Append-only audit ledger of every subscription lifecycle event (activation,
-- charges, cancellations, updates). One row per event per subscription.
-- UPDATE and DELETE are blocked by triggers.
-- ---------------------------------------------------------------------------

CREATE TABLE recurring_donation_subscription_transitions (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  recurring_subscription_id TEXT NOT NULL
    REFERENCES recurring_donation_subscriptions(id),

  -- Denormalized for audit queries without joins
  member_id TEXT NOT NULL REFERENCES members(id),

  stripe_event_id        TEXT REFERENCES stripe_events(event_id),
  stripe_subscription_id TEXT NOT NULL,
  stripe_invoice_id      TEXT,

  -- Raw Stripe event type, e.g. 'customer.subscription.created'
  event_type TEXT NOT NULL,

  -- App-controlled semantic code. Values: 'activated','charge_succeeded',
  -- 'charge_failed','cancel_requested','canceled','updated'.
  lifecycle_event_code TEXT NOT NULL
    CHECK (lifecycle_event_code IN (
      'activated','charge_succeeded','charge_failed',
      'cancel_requested','canceled','updated'
    )),

  old_status TEXT CHECK (old_status IN ('active','past_due','canceled')),
  new_status TEXT CHECK (new_status IN ('active','past_due','canceled')),
  occurred_at     TEXT NOT NULL,
  reason_text     TEXT,
  correlation_key TEXT,
  metadata_json   TEXT NOT NULL DEFAULT '{}'
);

CREATE TRIGGER trg_recurring_sub_transitions_no_update
BEFORE UPDATE ON recurring_donation_subscription_transitions
BEGIN
  SELECT RAISE(ABORT,
    'recurring_donation_subscription_transitions is append-only: UPDATE not permitted');
END;

CREATE TRIGGER trg_recurring_sub_transitions_no_delete
BEFORE DELETE ON recurring_donation_subscription_transitions
BEGIN
  SELECT RAISE(ABORT,
    'recurring_donation_subscription_transitions is append-only: DELETE not permitted');
END;

CREATE INDEX idx_recurring_sub_trans_subscription
  ON recurring_donation_subscription_transitions(recurring_subscription_id, occurred_at);
CREATE INDEX idx_recurring_sub_trans_member
  ON recurring_donation_subscription_transitions(member_id, occurred_at);
CREATE INDEX idx_recurring_sub_trans_stripe_event
  ON recurring_donation_subscription_transitions(stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- PAYMENTS
-- Stripe-backed payment record for donations, membership dues, and event
-- registrations. recurring_donation_subscriptions must be defined above.
-- ---------------------------------------------------------------------------

-- One row per Stripe payment transaction. Covers one-time donations, membership
-- dues purchases, and event registration fees. Status transitions are enforced
-- by trg_payments_status_monotonicity (forward-only; no backward transitions).
-- 'succeeded' is used in place of the functional term "completed" to align with
-- Stripe payment_intent vocabulary. State machine: pending -> succeeded|failed|canceled;
-- succeeded -> refunded.
CREATE TABLE payments (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  member_id TEXT REFERENCES members(id),

  payment_type TEXT NOT NULL
    CHECK (payment_type IN ('donation','membership','event_registration')),
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',

  -- Status vocabulary: 'succeeded' maps to what the US calls "completed".
  -- This aligns with Stripe payment_intent status vocabulary.
  -- State machine: pending → succeeded|failed|canceled; succeeded → refunded.
  -- Enforced by trg_payments_status_monotonicity (see below).
  status TEXT NOT NULL
    CHECK (status IN ('pending','succeeded','failed','canceled','refunded')),
  descriptor TEXT NOT NULL,

  stripe_payment_intent_id   TEXT UNIQUE,
  stripe_checkout_session_id TEXT,
  stripe_customer_id         TEXT,
  stripe_subscription_id     TEXT,
  -- ISO-8601 UTC text (converted from Stripe Unix epoch at write time; see SCH-06).
  last_stripe_event_created  TEXT,

  -- Non-null only for per-cycle charges against a recurring donation subscription.
  -- App discipline: set both this FK and stripe_subscription_id for such payments.
  recurring_subscription_id TEXT
    REFERENCES recurring_donation_subscriptions(id),

  -- Inlined donation detail (NULL for non-donation payments)
  donation_note         TEXT,

  -- Inlined membership detail (NULL for non-membership payments)
  purchased_tier_status TEXT
    CHECK (purchased_tier_status IN ('tier1','tier2')),

  metadata_json TEXT NOT NULL DEFAULT '{}',

  CHECK (payment_type <> 'membership' OR purchased_tier_status IS NOT NULL),
  CHECK (recurring_subscription_id IS NULL OR payment_type = 'donation')
);

CREATE INDEX idx_payments_member  ON payments(member_id);
CREATE INDEX idx_payments_created ON payments(created_at);
CREATE INDEX idx_payments_type    ON payments(payment_type);
CREATE INDEX idx_payments_recurring_subscription
  ON payments(recurring_subscription_id)
  WHERE recurring_subscription_id IS NOT NULL;

-- At most one in-flight membership purchase per member: a concurrent
-- double-submit fails at insert rather than risking two pending rows that
-- could both complete and double-grant the tier.
CREATE UNIQUE INDEX ux_payments_one_pending_membership
  ON payments(member_id)
  WHERE status = 'pending' AND payment_type = 'membership';

-- Payment status monotonicity guard.
-- Enforces: pending → succeeded|failed|canceled; succeeded → refunded.
-- Same-status no-ops are allowed (idempotent Stripe webhook redelivery).
-- Kept in the DB because webhook handler, admin tools, and refund worker all
-- mutate payments.status independently; the DB guard is the last line of
-- defence against silent backward transitions.
CREATE TRIGGER trg_payments_status_monotonicity
BEFORE UPDATE OF status ON payments
BEGIN
  SELECT CASE
    WHEN OLD.status = NEW.status THEN NULL
    WHEN OLD.status = 'pending'
      AND NEW.status IN ('succeeded','failed','canceled') THEN NULL
    WHEN OLD.status = 'succeeded'
      AND NEW.status = 'refunded' THEN NULL
    ELSE RAISE(ABORT,
      'payments.status transition not permitted; see allowed state machine in data model')
  END;
END;

-- ---------------------------------------------------------------------------
-- PAYMENT STATUS TRANSITIONS
-- Append-only audit ledger of every payment status change.
-- UPDATE and DELETE are blocked by triggers.
-- The application MUST insert a transition row in the same transaction as every
-- payments.status change (see APP-003).
-- ---------------------------------------------------------------------------

CREATE TABLE payment_status_transitions (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  payment_id TEXT NOT NULL REFERENCES payments(id),

  stripe_event_id          TEXT REFERENCES stripe_events(event_id),
  stripe_payment_intent_id TEXT,
  stripe_invoice_id        TEXT,
  stripe_subscription_id   TEXT,

  event_type TEXT NOT NULL,

  from_status TEXT
    CHECK (from_status IN ('pending','succeeded','failed','canceled','refunded')),
  to_status TEXT NOT NULL
    CHECK (to_status IN ('pending','succeeded','failed','canceled','refunded')),
  transition_at        TEXT NOT NULL,
  transition_reason_text TEXT,

  correlation_key TEXT,
  metadata_json   TEXT NOT NULL DEFAULT '{}'
);

CREATE TRIGGER trg_payment_transitions_no_update
BEFORE UPDATE ON payment_status_transitions
BEGIN
  SELECT RAISE(ABORT,
    'payment_status_transitions is append-only: UPDATE not permitted');
END;

CREATE TRIGGER trg_payment_transitions_no_delete
BEFORE DELETE ON payment_status_transitions
BEGIN
  SELECT RAISE(ABORT,
    'payment_status_transitions is append-only: DELETE not permitted');
END;

CREATE INDEX idx_payment_transitions_payment
  ON payment_status_transitions(payment_id, transition_at);
CREATE INDEX idx_payment_transitions_stripe_event
  ON payment_status_transitions(stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
CREATE INDEX idx_payment_transitions_intent
  ON payment_status_transitions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX idx_payment_transitions_invoice
  ON payment_status_transitions(stripe_invoice_id, stripe_subscription_id)
  WHERE stripe_invoice_id IS NOT NULL;

-- Payment reconciliation flags raised when a Stripe event cannot be matched
-- to an expected payment record. Tracks outstanding and resolved discrepancies
-- for admin review. expires_at is computed at INSERT (created_at + reconciliation_expiry_days);
-- resolved rows are purged by cleanup job after expiry.
CREATE TABLE reconciliation_issues (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  issue_type               TEXT NOT NULL,
  payment_id               TEXT REFERENCES payments(id),
  stripe_payment_intent_id TEXT,
  stripe_subscription_id   TEXT,
  status TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding','resolved')),
  details_json             TEXT NOT NULL DEFAULT '{}',
  resolved_at              TEXT,
  resolved_by_member_id    TEXT REFERENCES members(id),
  resolution_notes         TEXT,
  expires_at               TEXT
);

CREATE INDEX idx_recon_status ON reconciliation_issues(status);

-- =============================================================================
-- SECTION 11: MEMBERSHIP PRICING (stored in system_config)
-- =============================================================================
-- Membership pricing is stored as config keys in system_config:
--   tier1_price_cents   (integer cents, e.g., 1000 = $10.00)
--   tier2_price_cents   (integer cents, e.g., 5000 = $50.00)
-- Values are stored as integer cents consistent with all payment tables.
-- UI layers convert cents to USD for display.
-- Like all config, pricing is changed by inserting a new row with a new
-- effective_start_at. Past rows are immutable.

-- =============================================================================
-- SECTION 12: MEMBER TIER GRANTS
-- =============================================================================
-- Append-only ledger of lifetime membership tier changes only. Each row is a
-- full before/after snapshot: old_* columns capture state before the change;
-- new_* columns capture state after. The view member_tier_current reads the
-- latest row's new_* values as the authoritative current tier. UPDATE and
-- DELETE are blocked by triggers.
--
-- This ledger MUST NOT carry Active Player, event-attendance, vouch, or
-- club-join provenance; those write to active_player_grants instead. The only
-- source FK retained here is related_payment_id (purchase-origin grants).
--
-- change_type values:
--   grant              new lifetime tier awarded (purchase, HoF/BAP grant, legacy claim)
--   revoke             lifetime tier removed by admin (does not run on refund; see APP-006)
--   correct            admin correction of an erroneous prior row
--   governance_set     Tier 3 governance status assigned; new_underlying_tier_status captures
--                      the underlying tier the member returns to when governance ends
--   governance_removed Tier 3 governance status removed; new_tier_status reverts to
--                      old_underlying_tier_status (which must be set on this row)
--
-- Underlying tier (old_/new_underlying_tier_status) is the membership tier a
-- Tier 3 member returns to when governance ends. It is only ever 'tier1' or
-- 'tier2' (Tier 0 → Tier 3 sets underlying to Tier 1; Tier 0 is never an
-- underlying tier).
--
-- reason_code is a namespaced free-text vocabulary (no DB CHECK; extensible
-- without migration). Documented values:
--   purchase.tier1               Tier 1 IFPA Member purchase
--   purchase.tier2               Tier 2 IFPA Organizer Member purchase
--   honor.hof_tier2_grant        Hall of Fame induction grants Tier 2
--   honor.bap_tier2_grant        Big Add Posse induction grants Tier 2
--   governance.tier3_set         Tier 3 governance assigned
--   governance.tier3_removed     Tier 3 governance removed (reverts to underlying tier)
--   admin.override               Admin manual change (correction, exceptional remediation)
--   admin.correction             Admin correction of a prior data error
--   legacy.claim_tier_grant      Legacy migration claim resolved to a tier assignment
--
-- UPDATE and DELETE are blocked by triggers.

CREATE TABLE member_tier_grants (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  member_id       TEXT NOT NULL REFERENCES members(id),
  actor_member_id TEXT REFERENCES members(id),

  change_type TEXT NOT NULL
    CHECK (change_type IN ('grant','revoke','correct','governance_set','governance_removed')),

  old_tier_status TEXT
    CHECK (old_tier_status IS NULL OR old_tier_status IN ('tier0','tier1','tier2','tier3')),
  new_tier_status TEXT NOT NULL
    CHECK (new_tier_status IN ('tier0','tier1','tier2','tier3')),

  -- Underlying tier is the lifetime tier a Tier 3 governance member returns to
  -- when governance ends. Restricted to 'tier1' or 'tier2' (never tier0/tier3).
  old_underlying_tier_status TEXT
    CHECK (old_underlying_tier_status IS NULL OR old_underlying_tier_status IN ('tier1','tier2')),
  new_underlying_tier_status TEXT
    CHECK (new_underlying_tier_status IS NULL OR new_underlying_tier_status IN ('tier1','tier2')),

  reason_code TEXT NOT NULL,
  reason_text TEXT,

  related_payment_id TEXT REFERENCES payments(id),

  -- governance_set rows must capture the underlying tier so a later
  -- governance_removed row can revert correctly.
  CHECK (
    change_type <> 'governance_set'
    OR new_underlying_tier_status IS NOT NULL
  ),
  -- governance_removed rows must reference the underlying tier being
  -- reverted to.
  CHECK (
    change_type <> 'governance_removed'
    OR old_underlying_tier_status IS NOT NULL
  )
);

CREATE TRIGGER trg_tier_grants_no_update
BEFORE UPDATE ON member_tier_grants
BEGIN
  SELECT RAISE(ABORT,
    'member_tier_grants is append-only: UPDATE not permitted');
END;

CREATE TRIGGER trg_tier_grants_no_delete
BEFORE DELETE ON member_tier_grants
BEGIN
  SELECT RAISE(ABORT,
    'member_tier_grants is append-only: DELETE not permitted');
END;

CREATE INDEX idx_tier_grants_member_type
  ON member_tier_grants(member_id, change_type);
CREATE INDEX idx_tier_grants_payment
  ON member_tier_grants(related_payment_id)
  WHERE related_payment_id IS NOT NULL;
-- Performance: supports the latest_ledger NOT EXISTS correlated subquery in
-- member_tier_current (latest row per member lookup).
CREATE INDEX idx_tier_grants_member_created_id
  ON member_tier_grants(member_id, created_at, id);
CREATE INDEX idx_tier_grants_created
  ON member_tier_grants(created_at);

-- =============================================================================
-- SECTION 12B: ACTIVE PLAYER GRANTS
-- =============================================================================
-- Append-only ledger of Active Player lifecycle changes for Tier 0 members.
-- Active Player is a temporary status that gives a Tier 0 member Tier 1
-- benefits while current. It does not change membership tier. Each row is a
-- full before/after snapshot of Active Player expiry. UPDATE and DELETE are
-- blocked by triggers.
--
-- change_type values:
--   grant     new Active Player period from event attendance, vouch, or one-time club-join
--   extend    Active Player extended by a later qualifying source (no-shorten rule applies)
--   expire    daily expiry job marks Active Player as expired (system-driven)
--   end       Active Player ended because the member became Tier 1, Tier 2, or Tier 3
--   correct   admin correction of an Active Player row
--
-- Source linkage (all nullable) records provenance. At most one of
-- related_registration_id, related_club_affiliation_id, related_vouch_id may
-- be non-NULL on any given row (the others are NULL). related_event_id may
-- accompany related_registration_id for convenience/reporting; rely on
-- related_registration_id as the primary attendance provenance.
--
-- reason_code is a namespaced free-text vocabulary. Documented values:
--   official_event_attendance                Marked-attended at an officially registered event
--   tier2_vouch_active_player                Tier 2 or Tier 3 member vouch
--   club_join_one_time_active_player_grant   First-club-join one-time grant for never-AP Tier 0
--   active_player_expired                    SYS_Check_Active_Player_Expiry expiry write
--   membership_upgrade_ended_active_player   Buyer reached Tier 1 or Tier 2; AP ends
--   tier3_grant_ended_active_player          Tier 0 AP became Tier 3; AP ends
--   admin.override                           Admin manual grant or change
--   admin.correction                         Admin correction of a prior data error
--
-- Idempotency guards:
--   ux_active_player_grants_registration_once  one official_event_attendance grant per registration
--   ux_active_player_grants_vouch_once         one grant per vouch action
--   ux_active_player_club_join_once            one club-join grant per member (lifetime)

CREATE TABLE active_player_grants (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  member_id       TEXT NOT NULL REFERENCES members(id),
  actor_member_id TEXT REFERENCES members(id),

  change_type TEXT NOT NULL
    CHECK (change_type IN ('grant','extend','expire','end','correct')),

  old_active_player_expires_at TEXT,
  new_active_player_expires_at TEXT,

  reason_code TEXT NOT NULL,
  reason_text TEXT,

  related_event_id            TEXT REFERENCES events(id),
  related_registration_id     TEXT REFERENCES registrations(id),
  related_club_id             TEXT REFERENCES clubs(id),
  related_club_affiliation_id TEXT REFERENCES member_club_affiliations(id),
  related_vouch_id            TEXT REFERENCES active_player_vouches(id),

  -- At most one of registration / club-affiliation / vouch may be non-NULL
  -- (structural provenance guard; app is primary validator of pathway consistency).
  CHECK (
    (CASE WHEN related_registration_id     IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN related_club_affiliation_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN related_vouch_id            IS NOT NULL THEN 1 ELSE 0 END)
    <= 1
  )
);

CREATE TRIGGER trg_active_player_grants_no_update
BEFORE UPDATE ON active_player_grants
BEGIN
  SELECT RAISE(ABORT,
    'active_player_grants is append-only: UPDATE not permitted');
END;

CREATE TRIGGER trg_active_player_grants_no_delete
BEFORE DELETE ON active_player_grants
BEGIN
  SELECT RAISE(ABORT,
    'active_player_grants is append-only: DELETE not permitted');
END;

CREATE INDEX idx_active_player_grants_member_created
  ON active_player_grants(member_id, created_at, id);
CREATE INDEX idx_active_player_grants_registration
  ON active_player_grants(related_registration_id)
  WHERE related_registration_id IS NOT NULL;
CREATE INDEX idx_active_player_grants_vouch
  ON active_player_grants(related_vouch_id)
  WHERE related_vouch_id IS NOT NULL;
CREATE INDEX idx_active_player_grants_club_affiliation
  ON active_player_grants(related_club_affiliation_id)
  WHERE related_club_affiliation_id IS NOT NULL;

-- Idempotency: one official_event_attendance grant per registration.
CREATE UNIQUE INDEX ux_active_player_grants_registration_once
  ON active_player_grants(related_registration_id)
  WHERE related_registration_id IS NOT NULL
    AND reason_code = 'official_event_attendance';

-- Idempotency: one grant row per vouch action.
CREATE UNIQUE INDEX ux_active_player_grants_vouch_once
  ON active_player_grants(related_vouch_id)
  WHERE related_vouch_id IS NOT NULL;

-- Idempotency: one lifetime club-join grant per member. The service must
-- additionally verify the member has never previously been an Active Player
-- (no prior grant rows of any kind), since the rule is "never previously
-- Active Player," not just "never used the club grant."
CREATE UNIQUE INDEX ux_active_player_club_join_once
  ON active_player_grants(member_id)
  WHERE reason_code = 'club_join_one_time_active_player_grant';

-- ---------------------------------------------------------------------------
-- active_player_reminder_sent: per-member, per-expiry, per-offset dedup table
-- for the SYS_Check_Active_Player_Expiry daily worker. One row written each
-- time the worker enqueues a reminder email; a repeat run within the same
-- offset window is a no-op. expires_at is the AP grant's
-- new_active_player_expires_at at send time, so a renewal (fresh grant row
-- with a later expires_at) generates a fresh reminder cycle automatically:
-- the (member_id, expires_at, offset_label) key has not been used yet.
-- offset_label values: 'days_1' / 'days_2' for the configured pre-expiry
-- offsets in system_config; 'day_of' for the built-in T+0 reminder.
-- ---------------------------------------------------------------------------
CREATE TABLE active_player_reminder_sent (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  member_id    TEXT NOT NULL REFERENCES members(id) ON DELETE NO ACTION,
  expires_at   TEXT NOT NULL,
  offset_label TEXT NOT NULL
    CHECK (offset_label IN ('days_1','days_2','day_of')),
  sent_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_active_player_reminder_sent
  ON active_player_reminder_sent(member_id, expires_at, offset_label);

CREATE INDEX idx_active_player_reminder_sent_member
  ON active_player_reminder_sent(member_id);

-- Append-only enforcement. The table is a dedup ledger (one row per
-- enqueued reminder, keyed by (member_id, expires_at, offset_label)); any
-- UPDATE or DELETE silently breaks dedup and risks double-sending the
-- member a reminder. Triggers match the pattern at lines 214-227 for
-- active_player_vouches.
CREATE TRIGGER trg_active_player_reminder_sent_no_update
BEFORE UPDATE ON active_player_reminder_sent
BEGIN
  SELECT RAISE(ABORT, 'active_player_reminder_sent rows are immutable (append-only dedup ledger)');
END;

CREATE TRIGGER trg_active_player_reminder_sent_no_delete
BEFORE DELETE ON active_player_reminder_sent
BEGIN
  SELECT RAISE(ABORT, 'active_player_reminder_sent rows are immutable (append-only dedup ledger)');
END;

-- =============================================================================
-- SECTION 13: MEMBER TIER CURRENT VIEW
-- =============================================================================
-- Computed view: derives the current lifetime membership tier for every member
-- from the latest member_tier_grants snapshot row. Membership tiers do not
-- expire; there is no in-view expiry logic and no purchase overlay. Active
-- Player status is a separate concept tracked by member_active_player_current.
-- This is the authoritative read model for membership tier data.
--
-- Output columns:
--   member_id
--   tier_status              one of 'tier0', 'tier1', 'tier2', 'tier3'
--   underlying_tier_status   for Tier 3 governance members, the membership tier
--                            they revert to when governance ends. NULL otherwise.
--
-- Members with no ledger entry default to 'tier0' with NULL underlying tier.

CREATE VIEW member_tier_current AS
WITH latest_ledger AS (
  -- Most recent ledger row per member (latest created_at; id breaks ties).
  SELECT g.*
  FROM member_tier_grants g
  WHERE NOT EXISTS (
    SELECT 1
    FROM member_tier_grants g2
    WHERE g2.member_id = g.member_id
      AND (
        g2.created_at > g.created_at
        OR (g2.created_at = g.created_at AND g2.id > g.id)
      )
  )
)
SELECT
  m.id AS member_id,
  COALESCE(l.new_tier_status, 'tier0') AS tier_status,
  l.new_underlying_tier_status         AS underlying_tier_status
FROM members m
LEFT JOIN latest_ledger l ON l.member_id = m.id;

-- =============================================================================
-- SECTION 13B: MEMBER ACTIVE PLAYER CURRENT VIEW
-- =============================================================================
-- Computed view: derives the current Active Player state for every member from
-- the latest active_player_grants snapshot row plus the member's current
-- membership tier. Active Player applies only to Tier 0 members; for Tier 1+
-- members this view returns is_active_player = 0 even if old AP ledger rows
-- exist (a downgrade back to Tier 0 would resurrect AP from the ledger only if
-- the prior expiry is still in the future).
--
-- Output columns:
--   member_id
--   is_active_player                  1 iff tier_status = 'tier0' AND
--                                     latest AP expiry is in the future
--   active_player_expires_at          latest AP expiry for Tier 0 members; NULL
--                                     for Tier 1+
--   latest_active_player_reason_code  reason_code from the latest AP ledger row
--                                     (informational; useful for display)

CREATE VIEW member_active_player_current AS
WITH latest_ap AS (
  -- Most recent AP ledger row per member (latest created_at; id breaks ties).
  SELECT g.*
  FROM active_player_grants g
  WHERE NOT EXISTS (
    SELECT 1
    FROM active_player_grants g2
    WHERE g2.member_id = g.member_id
      AND (
        g2.created_at > g.created_at
        OR (g2.created_at = g.created_at AND g2.id > g.id)
      )
  )
)
SELECT
  m.id AS member_id,
  CASE
    WHEN mt.tier_status = 'tier0'
     AND l.new_active_player_expires_at IS NOT NULL
     AND l.new_active_player_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
    THEN 1
    ELSE 0
  END AS is_active_player,
  CASE
    WHEN mt.tier_status = 'tier0' THEN l.new_active_player_expires_at
    ELSE NULL
  END AS active_player_expires_at,
  l.reason_code AS latest_active_player_reason_code
FROM members m
JOIN member_tier_current mt ON mt.member_id = m.id
LEFT JOIN latest_ap l        ON l.member_id  = m.id;

-- =============================================================================
-- SECTION 13C: MEMBER MEMBERSHIP STATUS CURRENT VIEW
-- =============================================================================
-- Combined authorization/read model. Single source of truth for the two
-- application gates the platform cares about:
--
--   has_tier1_benefits        feature-gate shorthand for "Tier 1 IFPA Member or
--                             above, OR Tier 0 with current Active Player."
--   is_official_roster_member governance/reporting set: "Tier 1, Tier 2, Tier 3,
--                             or Tier 0 with current Active Player."
--
-- Under current IFPA rules these two predicates are byte-identical. They are
-- retained as separate columns because user stories distinguish the two
-- concepts ("Tier 1 benefits" is the feature-gate label; "Official IFPA Roster"
-- is the governance/reporting label) and they may diverge under a future rule.
-- Do NOT collapse them into one column.

CREATE VIEW member_membership_status_current AS
SELECT
  m.id                       AS member_id,
  mt.tier_status             AS tier_status,
  mt.underlying_tier_status  AS underlying_tier_status,
  ap.is_active_player        AS is_active_player,
  ap.active_player_expires_at AS active_player_expires_at,
  CASE
    WHEN mt.tier_status IN ('tier1','tier2','tier3') THEN 1
    WHEN mt.tier_status = 'tier0' AND ap.is_active_player = 1 THEN 1
    ELSE 0
  END AS has_tier1_benefits,
  CASE
    WHEN mt.tier_status IN ('tier1','tier2','tier3') THEN 1
    WHEN mt.tier_status = 'tier0' AND ap.is_active_player = 1 THEN 1
    ELSE 0
  END AS is_official_roster_member
FROM members m
JOIN member_tier_current mt          ON mt.member_id = m.id
LEFT JOIN member_active_player_current ap ON ap.member_id = m.id;

-- =============================================================================
-- SECTION 13D: OFFICIAL IFPA ROSTER CURRENT VIEW
-- =============================================================================
-- Operational roster surface for A_View_Official_Roster_Reports. Includes:
--   - Tier 1, Tier 2, Tier 3 members
--   - Tier 0 members with current Active Player status
-- Excludes:
--   - Soft-deleted members (via members_active)
--   - Deceased members (operational roster; HoF/BAP memorial visibility is
--     handled separately at the profile layer)
--   - Tier 0 members without current Active Player status
--
-- This view is not public. Service-layer access is restricted to admin and
-- admin-provisioned Tier 2/Tier 3 organizers only; all access and exports must be
-- audit-logged via audit_entries.

CREATE VIEW official_ifpa_roster_current AS
SELECT
  m.id                        AS member_id,
  m.display_name              AS display_name,
  m.city                      AS city,
  m.region                    AS region,
  m.country                   AS country,
  s.tier_status               AS tier_status,
  s.underlying_tier_status    AS underlying_tier_status,
  s.is_active_player          AS is_active_player,
  s.active_player_expires_at  AS active_player_expires_at,
  m.is_hof                    AS is_hof,
  m.is_bap                    AS is_bap,
  m.is_board                  AS is_board
FROM members_active m
JOIN member_membership_status_current s ON s.member_id = m.id
WHERE s.is_official_roster_member = 1
  AND m.is_deceased = 0;

-- =============================================================================
-- SECTION 14: MEMBERS & AUTHENTICATION
-- =============================================================================
-- Core member record: identity, credentials, profile, privacy controls, tier
-- cache, governance/honor flags, and GDPR PII-purge support.
--
-- password_version: session/JWT invalidation counter. INCREMENT on every
--   password reset or change. All JWTs embedding an older value are invalid.
--   NOT the same as password_hash_version (algorithm tracking only).
-- password_hash_version: hash algorithm/format version. INCREMENT only when
--   the hashing algorithm changes. MUST NOT be used for session invalidation.
-- stripe_customer_id: member-level canonical Stripe Customer identity. Set when
--   a recurring donation is first created. payments.stripe_customer_id is
--   a per-payment snapshot and is not the canonical customer ID.
--
-- login_email, login_email_normalized, password_hash, password_changed_at are
-- nullable to support GDPR/PII purge. A CHECK enforces they are non-NULL for
-- all un-purged members and NULL once personal_data_purged_at is set.
--
-- avatar_media_id: ON DELETE SET NULL ensures that deleting a media item
-- automatically detaches it as the member's avatar without requiring a trigger.

-- Member account: credentials, profile, privacy settings, governance
-- flags (is_admin, is_board, is_hof, is_bap, is_deceased), and GDPR lifecycle.
-- Soft-delete (deleted_at); PII purge nullifies credential and contact fields.
CREATE TABLE members (
  id         TEXT PRIMARY KEY,
  slug       TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  deleted_by TEXT,

  login_email            TEXT,
  login_email_normalized TEXT,
  email_verified_at      TEXT,
  email_status           TEXT NOT NULL DEFAULT 'ok'
    CHECK (email_status IN ('ok','bounced','complained','suppressed')),

  password_hash         TEXT,
  password_hash_version INTEGER NOT NULL DEFAULT 1,
  password_version      INTEGER NOT NULL DEFAULT 1,
  password_changed_at   TEXT,
  last_login_at         TEXT,

  real_name               TEXT NOT NULL,
  display_name            TEXT NOT NULL,
  display_name_normalized TEXT NOT NULL,
  bio                     TEXT NOT NULL DEFAULT '',
  city                    TEXT,
  region                  TEXT,
  country                 TEXT,
  gender                  TEXT CHECK (gender IN ('male', 'female', 'undisclosed')),
  phone                   TEXT,
  whatsapp                TEXT,

  email_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (email_visibility IN ('private','members')),
  phone_visible    INTEGER NOT NULL DEFAULT 0 CHECK (phone_visible IN (0,1)),
  whatsapp_visible INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_visible IN (0,1)),
  searchable INTEGER NOT NULL DEFAULT 1 CHECK (searchable IN (0,1)),

  -- ON DELETE SET NULL: see section header comment.
  avatar_media_id TEXT REFERENCES media_items(id) ON DELETE SET NULL,

  is_admin    INTEGER NOT NULL DEFAULT 0 CHECK (is_admin    IN (0,1)),
  -- Single unauthenticatable system member (Footbag Hacky). Single-row enforced
  -- by partial UNIQUE index below; alive-without-credentials enforced by the
  -- third branch on the credential CHECK.
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system   IN (0,1)),
  is_board    INTEGER NOT NULL DEFAULT 0 CHECK (is_board    IN (0,1)),
  is_hof      INTEGER NOT NULL DEFAULT 0 CHECK (is_hof      IN (0,1)),
  -- Most recent Hall of Fame nomination year (nullable; application-managed).
  hof_last_nominated_year INTEGER,
  -- Hall of Fame induction year (nullable; set when is_hof becomes 1).
  -- Named `hof_inducted_year` here (past participle: the member was inducted) and
  -- `hof_induction_year` on `historical_persons` (noun form: the archival HP's
  -- induction-year attribute). The merge in db.ts copies HP.hof_induction_year
  -- onto members.hof_inducted_year at claim time. Intentional naming asymmetry.
  hof_inducted_year       INTEGER,
  is_bap      INTEGER NOT NULL DEFAULT 0 CHECK (is_bap      IN (0,1)),
  is_deceased INTEGER NOT NULL DEFAULT 0 CHECK (is_deceased IN (0,1)),
  deceased_at   TEXT,
  deceased_note TEXT,

  stripe_customer_id TEXT,

  deletion_requested_at     TEXT,
  deletion_grace_expires_at TEXT,
  personal_data_purged_at   TEXT,

  first_competition_year INTEGER,
  show_competitive_results INTEGER NOT NULL DEFAULT 1 CHECK (show_competitive_results IN (0,1)),
  show_first_competition_year INTEGER NOT NULL DEFAULT 0 CHECK (show_first_competition_year IN (0,1)),
  show_gender INTEGER NOT NULL DEFAULT 0 CHECK (show_gender IN (0,1)),

  legacy_member_id TEXT REFERENCES legacy_members(legacy_member_id) ON DELETE NO ACTION,
  legacy_user_id   TEXT,
  legacy_email     TEXT,
  ifpa_join_date   TEXT,
  birth_date       TEXT,
  street_address   TEXT,
  postal_code      TEXT,
  legacy_is_admin  INTEGER NOT NULL DEFAULT 0 CHECK (legacy_is_admin IN (0,1)),

  -- Direct FK to the archival historical-person identity this member claims.
  -- NULL = no HP claim. Written at claim time (legacy-account claim that resolves
  -- to a matching HP, or direct HP claim for a competitor with no legacy account).
  -- Partial UNIQUE index below enforces at most one member per HP.
  historical_person_id TEXT REFERENCES historical_persons(person_id) ON DELETE NO ACTION,

  -- Three-branch credential-state invariant:
  -- (1) live non-system account: is_system=0, all credentials present, not purged
  -- (2) purged non-system row: is_system=0, all credentials NULL, personal_data_purged_at set
  -- (3) system-member account: is_system=1, all credentials NULL, not purged
  -- The is_system gate on branches 1 and 2 ensures a system row can only
  -- match branch 3 (no live-shape or purged-shape system rows).
  -- Pre-credential placeholder rows live in legacy_members, not members.
  CHECK (
    (
      is_system = 0
      AND personal_data_purged_at IS NULL
      AND login_email            IS NOT NULL
      AND login_email_normalized IS NOT NULL
      AND password_hash          IS NOT NULL
      AND password_changed_at    IS NOT NULL
    )
    OR
    (
      is_system = 0
      AND personal_data_purged_at IS NOT NULL
      AND login_email            IS NULL
      AND login_email_normalized IS NULL
      AND password_hash          IS NULL
      AND password_changed_at    IS NULL
    )
    OR
    (
      is_system = 1
      AND personal_data_purged_at IS NULL
      AND login_email            IS NULL
      AND login_email_normalized IS NULL
      AND password_hash          IS NULL
      AND password_changed_at    IS NULL
    )
  )
);

CREATE UNIQUE INDEX ux_members_system
  ON members(is_system)
  WHERE is_system = 1;
CREATE UNIQUE INDEX ux_members_stripe_customer
  ON members(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX ux_members_email
  ON members(login_email_normalized)
  WHERE personal_data_purged_at IS NULL
    AND login_email_normalized IS NOT NULL;
CREATE INDEX idx_members_display_name ON members(display_name_normalized);
CREATE UNIQUE INDEX ux_members_slug
  ON members(slug)
  WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX ux_members_legacy_id
  ON members(legacy_member_id)
  WHERE legacy_member_id IS NOT NULL;
-- Provisional unique indexes for legacy migration fields; validated at test load.
-- Replace with non-unique indexes + ambiguity handling if uniqueness fails validation.
CREATE UNIQUE INDEX ux_members_legacy_email
  ON members(legacy_email)
  WHERE legacy_email IS NOT NULL;
CREATE UNIQUE INDEX ux_members_legacy_user_id
  ON members(legacy_user_id)
  WHERE legacy_user_id IS NOT NULL;
-- At most one member per historical person (partial: only enforces when set).
-- Excludes soft-deleted and purged rows so a previously-claiming-then-purged member
-- does not block a future claim of the same HP.
CREATE UNIQUE INDEX ux_members_historical_person_id
  ON members(historical_person_id)
  WHERE historical_person_id IS NOT NULL
    AND deleted_at IS NULL
    AND personal_data_purged_at IS NULL;

-- Non-unique lookup index for JOIN predicates of the form
-- `members.historical_person_id = <hp>.person_id AND members.deleted_at IS NULL`.
-- The unique index above can't serve this predicate because its partial
-- condition also requires personal_data_purged_at IS NULL, which JOIN
-- predicates don't include.
CREATE INDEX idx_members_historical_person_id
  ON members(historical_person_id)
  WHERE historical_person_id IS NOT NULL;

-- members_active: active rows (excludes soft-deleted accounts)
CREATE VIEW members_active AS
  SELECT * FROM members WHERE deleted_at IS NULL;

-- members_all: all rows including soft-deleted; use for admin queries
CREATE VIEW members_all AS
  SELECT * FROM members;

-- members_searchable: the ONLY view that should be queried by the member search
-- endpoint. Filters five conditions that must exclude a member from search:
-- soft-deleted, deceased, opted-out (searchable=0), PII-purged, and unverified
-- (email_verified_at IS NULL). The last condition is the primary enforcement
-- preventing imported placeholder rows from appearing in search results;
-- searchable=0 is defense-in-depth. Do not add extra WHERE clauses on top of
-- members or the bare table.
CREATE VIEW members_searchable AS
  SELECT * FROM members
  WHERE deleted_at IS NULL
    AND is_deceased = 0
    AND searchable = 1
    AND personal_data_purged_at IS NULL
    AND email_verified_at IS NOT NULL;

-- =============================================================================
-- SECTION 15: MEMBER LINKS
-- =============================================================================

-- External profile URLs for a member (e.g., personal website, social media).
-- Maximum 3 per member (application-enforced; see APP-008). URLs are validated
-- by the application before insertion.
CREATE TABLE member_links (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  member_id    TEXT NOT NULL REFERENCES members(id),
  label        TEXT NOT NULL,
  url          TEXT NOT NULL,
  validated_at TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_member_links_member ON member_links(member_id);

-- =============================================================================
-- SECTION 16: REGISTRATIONS & EVENT RESULTS
-- =============================================================================

-- Discipline selections for a competitor registration: which disciplines a
-- competitor has entered, and partner info for doubles/mixed_doubles disciplines.
-- One row per (registration, discipline) pair.
CREATE TABLE registration_discipline_selections (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  registration_id      TEXT NOT NULL REFERENCES registrations(id),
  discipline_id        TEXT NOT NULL REFERENCES event_disciplines(id),
  partner_member_id    TEXT REFERENCES members(id),
  partner_display_name TEXT,
  UNIQUE(registration_id, discipline_id)
);

CREATE INDEX idx_reg_sel_registration ON registration_discipline_selections(registration_id);
CREATE INDEX idx_reg_sel_discipline   ON registration_discipline_selections(discipline_id);

-- Metadata record for a results file uploaded to an event by an organizer.
-- Tracks who uploaded, when, and from what file. Individual placement rows
-- are in event_result_entries.
CREATE TABLE event_results_uploads (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  event_id              TEXT NOT NULL REFERENCES events(id),
  uploaded_by_member_id TEXT NOT NULL REFERENCES members(id),
  uploaded_at           TEXT NOT NULL,
  original_filename     TEXT,
  notes                 TEXT
);

CREATE INDEX idx_results_uploads_event ON event_results_uploads(event_id);

-- One placement row per (event, discipline, placement) combination.
-- discipline_id is nullable (NULL = discipline-agnostic / general ranking).
-- A partial unique index prevents duplicate general placements where discipline_id IS NULL,
-- because SQLite treats NULLs as distinct in standard UNIQUE constraints.
CREATE TABLE event_result_entries (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  event_id          TEXT NOT NULL REFERENCES events(id),
  -- NULL = discipline-agnostic (general ranking)
  discipline_id     TEXT REFERENCES event_disciplines(id),
  results_upload_id TEXT REFERENCES event_results_uploads(id),

  placement  INTEGER NOT NULL,
  score_text TEXT,

  UNIQUE(event_id, discipline_id, placement)
);

CREATE INDEX idx_result_entries_event      ON event_result_entries(event_id);
CREATE INDEX idx_result_entries_discipline ON event_result_entries(discipline_id);
-- SQLite treats NULLs as distinct in UNIQUE constraints, so
-- UNIQUE(event_id, discipline_id, placement) does not prevent duplicate
-- general placements when discipline_id IS NULL. This partial index fills that gap.
CREATE UNIQUE INDEX ux_result_entries_general_placement
  ON event_result_entries(event_id, placement)
  WHERE discipline_id IS NULL;

-- Registry of historical competitive players imported from the legacy dataset.
-- Populated by the data pipeline (08_load_mvfp_seed_full_to_sqlite.py).
-- event_count IS NULL indicates a minimal stub record auto-assigned by the pipeline.
CREATE TABLE historical_persons (
  person_id            TEXT PRIMARY KEY,
  person_name          TEXT NOT NULL,
  aliases              TEXT,
  legacy_member_id     TEXT REFERENCES legacy_members(legacy_member_id) ON DELETE NO ACTION,
  country              TEXT,
  first_year           INTEGER,
  last_year            INTEGER,
  event_count          INTEGER,
  placement_count      INTEGER,
  bap_member           INTEGER NOT NULL DEFAULT 0,
  bap_nickname         TEXT,
  bap_induction_year   INTEGER,
  hof_member         INTEGER NOT NULL DEFAULT 0,
  hof_induction_year INTEGER,
  is_deceased        INTEGER NOT NULL DEFAULT 0 CHECK (is_deceased IN (0,1)),
  freestyle_sequences      INTEGER,
  freestyle_max_add        REAL,
  freestyle_unique_tricks  INTEGER,
  freestyle_diversity_ratio REAL,
  signature_trick_1    TEXT,
  signature_trick_2    TEXT,
  signature_trick_3    TEXT,
  notes                TEXT,
  source               TEXT,
  source_scope         TEXT
);

CREATE UNIQUE INDEX ux_historical_persons_legacy_member_id
  ON historical_persons(legacy_member_id)
  WHERE legacy_member_id IS NOT NULL;

-- Participants (members or named non-members) for a single result entry.
-- Supports singles (1 row) and team formats (2 rows). member_id is nullable
-- for non-platform participants; display_name is always required.
-- historical_person_id links to the legacy player registry when known.
CREATE TABLE event_result_entry_participants (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  result_entry_id      TEXT NOT NULL REFERENCES event_result_entries(id),
  participant_order    INTEGER NOT NULL,
  member_id            TEXT REFERENCES members(id),
  display_name         TEXT NOT NULL,
  historical_person_id TEXT REFERENCES historical_persons(person_id),
  UNIQUE(result_entry_id, participant_order)
);

CREATE INDEX idx_result_participants_entry  ON event_result_entry_participants(result_entry_id);
CREATE INDEX idx_result_participants_member ON event_result_entry_participants(member_id);
CREATE INDEX idx_result_participants_person ON event_result_entry_participants(historical_person_id);

-- =============================================================================
-- SECTION 17: MEDIA & GALLERIES
-- =============================================================================
-- Photos and video links uploaded by members, organized into galleries.
-- Photo binaries are stored in object storage (S3); the DB stores metadata and
-- S3 keys only. Hard-delete only for both media_items and member_galleries.
--
-- Referential cleanup on delete is handled declaratively:
--   members.avatar_media_id  REFERENCES media_items(id) ON DELETE SET NULL
--   clubs.logo_media_id      REFERENCES media_items(id) ON DELETE SET NULL
--
-- Gallery membership is computed at request time by tag-AND match against
-- member_gallery_tags / member_gallery_exclude_tags. Deleting a gallery
-- removes the gallery row and its tag-set rows; member-uploaded media
-- survive the delete and remain reachable via tag-based galleries.
--
-- media_tags and media_flags cascade-delete on media_id.
-- gallery_external_links cascade-deletes on gallery_id.

-- Photo and video media items uploaded by members. Photo fields (s3_key_thumb,
-- s3_key_display) are required for photos; video fields (video_platform, video_id,
-- video_url) are required for videos. Avatars are always photos and are never
-- gallery-assigned (enforced by CHECK constraints).
-- Source registry for curator reference media (DVDs, websites, channels).
-- Provenance attribution for media_items: e.g. tt1, tt_youtube, anz_trikz.
CREATE TABLE media_sources (
  source_id    TEXT PRIMARY KEY,
  source_name  TEXT NOT NULL,
  source_type  TEXT NOT NULL,                   -- 'dvd' | 'website' | 'youtube' | 'vimeo' | 'database' (no CHECK; broad)
  url          TEXT,
  creator      TEXT
);

CREATE TABLE media_items (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  uploader_member_id TEXT NOT NULL REFERENCES members(id),

  media_type TEXT NOT NULL CHECK (media_type IN ('photo','video')),
  is_avatar  INTEGER NOT NULL DEFAULT 0 CHECK (is_avatar IN (0,1)),
  caption    TEXT,
  uploaded_at TEXT NOT NULL,

  -- Photo fields (required when media_type = 'photo')
  s3_key_thumb   TEXT,
  s3_key_display TEXT,
  width_px       INTEGER,
  height_px      INTEGER,

  -- Video fields (required when media_type = 'video')
  video_platform TEXT CHECK (video_platform IN ('youtube','vimeo','s3')),
  video_id       TEXT,
  video_url      TEXT,
  thumbnail_url  TEXT,

  moderation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active','removed_by_admin')),
  moderation_reason TEXT,

  -- Source filename of the uploaded asset. Captured at upload time
  -- (req.file.originalname for member/curator uploads) or set by the
  -- curator seeder from the manifest entry (photo_source / video_source).
  -- Among system-member-owned active rows, this is the stable identifier
  -- used by landing-page services to find a curator slot photo or video
  -- (see ux_media_items_curator_filename).
  source_filename TEXT,

  -- Curator-reference-media provenance + clip range; populated by the
  -- curator seeder from /curated/{category}/*.meta.json sidecars. NULL on
  -- member-uploaded rows.
  source_id      TEXT REFERENCES media_sources(source_id),
  start_seconds  INTEGER,
  end_seconds    INTEGER,

  -- Optional per-item external URL (e.g. link to original creator page,
  -- source article, related event). User-supplied; validated at the service
  -- boundary (scheme allowlist, length cap, SSRF and SafeBrowsing checks).
  -- validated_at stamps acceptance time so re-validation can be scheduled.
  external_url              TEXT,
  external_url_validated_at TEXT,

  CHECK (media_type <> 'photo'
    OR (s3_key_thumb IS NOT NULL AND s3_key_display IS NOT NULL)),
  CHECK (media_type <> 'video'
    OR (video_platform IS NOT NULL AND video_id IS NOT NULL
        AND (video_url IS NOT NULL OR video_platform = 's3'))),
  -- Avatar integrity: avatars must be photos.
  CHECK (is_avatar = 0 OR media_type = 'photo'),
  -- Clip-range integrity: when both bounds are set, start must precede end;
  -- negative bounds are rejected. NULL bounds are valid (full asset).
  CHECK (start_seconds IS NULL OR start_seconds >= 0),
  CHECK (end_seconds   IS NULL OR end_seconds   >= 0),
  CHECK (start_seconds IS NULL OR end_seconds IS NULL OR start_seconds < end_seconds)
);

-- Named collections of media items owned by a member. Each member may have
-- one default gallery and any number of named galleries. Hard-delete only.
-- Deleting a gallery removes only the gallery row and its own tag-criteria and
-- external-link rows (ON DELETE CASCADE); the media items it displayed survive,
-- because a gallery is a saved tag-query, not a container of media.
CREATE TABLE member_galleries (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  owner_member_id TEXT NOT NULL REFERENCES members(id),
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  is_default      INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),

  -- Item ordering on /media/{gallery_id}. 'upload_desc' (default) preserves
  -- legacy behavior; 'upload_asc' and 'caption_asc' enable ordered series
  -- (e.g. tutorial collections numbered in captions). Editable via the admin
  -- curator gallery UX.
  sort_order      TEXT NOT NULL DEFAULT 'upload_desc'
                  CHECK (sort_order IN ('upload_desc','upload_asc','caption_asc')),

  -- Hard-delete frees the name immediately, so no partial UNIQUE needed.
  UNIQUE(owner_member_id, name)
);

-- Tag criteria for a named-gallery URL bookmark. The set of tag rows
-- linked to a gallery_id is the AND-criteria for that bookmark: an item
-- matches the bookmark iff it carries every linked tag (per
-- USER_STORIES.md §V_View_Gallery "Gallery built dynamically based on
-- tag matching"). Empty set = bookmark with no criteria; renders empty.
-- Cascade-delete with the parent member_galleries row. tag_id is a
-- foreign key into the existing tags table; the same tags surface that
-- backs media_tags.
CREATE TABLE member_gallery_tags (
  gallery_id TEXT NOT NULL REFERENCES member_galleries(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (gallery_id, tag_id)
);

-- Tags that EXCLUDE an item from the gallery. An item appears iff it
-- carries every tag in member_gallery_tags AND none of the tags in
-- member_gallery_exclude_tags. Use case: "all curated freestyle tricks
-- EXCEPT the dedicated Tricks-of-the-Trade subset, which has its own
-- gallery and would otherwise appear in both."
-- Cascade-deleted with the parent member_galleries row.
CREATE TABLE member_gallery_exclude_tags (
  gallery_id TEXT NOT NULL REFERENCES member_galleries(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (gallery_id, tag_id)
);

-- External URLs associated with a gallery (e.g., links to off-platform albums).
-- Cascade-deleted when the parent gallery is deleted.
CREATE TABLE gallery_external_links (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  -- CASCADE: gallery hard-delete removes all its external links.
  gallery_id TEXT NOT NULL REFERENCES member_galleries(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  validated_at TEXT,
  -- Non-NULL when the runtime boot scan rejected the URL (Safe Browsing match
  -- or post-write threat-list change). Public render skips quarantined rows;
  -- admin UI surfaces them with a warning + remove control. Operator clears
  -- the row by replacing the URL or deleting the link.
  quarantine_reason TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX        idx_media_uploader          ON media_items(uploader_member_id);
CREATE INDEX        idx_media_moderation        ON media_items(moderation_status) WHERE moderation_status = 'active';
CREATE UNIQUE INDEX ux_media_avatar_per_member  ON media_items(uploader_member_id) WHERE is_avatar = 1;
-- Curator slot identity: among an uploader's active rows, the source filename
-- is unique. Landing-page services query system-owned rows by source_filename
-- to find the canonical asset for a slot (e.g. demo loop, headline photo).
-- Member-uploaded rows are also constrained to one active row per filename
-- per uploader, which prevents accidental duplicate uploads.
CREATE UNIQUE INDEX ux_media_items_source_filename_per_uploader
  ON media_items(uploader_member_id, source_filename)
  WHERE source_filename IS NOT NULL
    AND moderation_status = 'active';
CREATE UNIQUE INDEX ux_galleries_default_per_member ON member_galleries(owner_member_id) WHERE is_default = 1;
CREATE INDEX        idx_galleries_owner         ON member_galleries(owner_member_id);
CREATE INDEX        idx_gallery_links_gallery   ON gallery_external_links(gallery_id);

-- Lifecycle row for the admin curator video upload path (DD §6.8). The browser
-- PUTs source bytes directly to S3 under a pending/ prefix, then POSTs to
-- /admin/curator/upload/finalize. Finalize verifies both source keys exist and
-- inserts a media_jobs row in 'pending_transcode' state, then HTTP-pushes the
-- row id to the image worker over the internal docker network. The worker
-- claims the row (state -> 'processing'), runs ffmpeg, writes final S3 keys,
-- inserts the corresponding media_items row, deletes the pending sources, and
-- marks the job 'succeeded' (or 'failed' on terminal failure). The worker
-- HTTP-pushes each state transition back to the web container, which fans out
-- to any SSE-connected admin status pages. No polling at any tier; the only
-- scan of this table is a one-shot recovery sweep on worker boot for rows
-- stuck in 'processing' beyond their lease (state -> 'pending_transcode').
CREATE TABLE media_jobs (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  -- Discriminator. Only 'curator_video' exists today; other kinds may share
  -- this table later if other media paths move off the synchronous request
  -- chain (e.g. curator_photo for very large stills).
  kind TEXT NOT NULL CHECK (kind IN ('curator_video')),

  state TEXT NOT NULL
    CHECK (state IN ('pending_upload','pending_transcode','processing','succeeded','failed','abandoned')),

  -- The admin who initiated the job. Used for status-page authorization
  -- (anti-enumeration: another admin gets 404, not 403) and audit trail.
  admin_member_id TEXT NOT NULL REFERENCES members(id),

  -- S3 keys under the configured pending/ prefix. Both populated at sign-time;
  -- both verified to exist at finalize-time; both deleted by the worker on
  -- success. Defensive S3 lifecycle rule on the pending/ prefix expires any
  -- orphans after 24h regardless of row state.
  source_video_key  TEXT,
  source_poster_key TEXT,

  -- Form fields captured at finalize-time and forwarded into the media_items
  -- row on success. tags is a single space-separated string matching the form
  -- submission shape; the worker parses before insert.
  caption          TEXT,
  tags             TEXT NOT NULL DEFAULT '',
  source_filename  TEXT,

  -- Set when the job reaches 'succeeded'. ON DELETE SET NULL preserves the
  -- audit row if the resulting media_items row is later deleted.
  media_id TEXT REFERENCES media_items(id) ON DELETE SET NULL,

  -- Failure metadata. last_error is overwritten on each attempt. retry_count
  -- increments only on retryable failures; reaching MEDIA_JOB_MAX_RETRIES
  -- transitions the job to 'failed' (terminal).
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,

  -- Worker dispatch lease. Set when the worker claims the row (state ->
  -- 'processing'). Boot-time recovery uses lease_expires_at to distinguish a
  -- freshly-claimed row from one orphaned by a worker crash.
  last_attempted_at TEXT,
  lease_expires_at  TEXT,

  -- TTL for pending_upload rows whose browser never POSTed /finalize. A web
  -- cleanup step on next admin visit (or a startup reconciliation) maps
  -- expired pending_upload rows to 'abandoned'.
  expires_at TEXT,

  CHECK (state <> 'succeeded' OR media_id IS NOT NULL)
);

CREATE INDEX idx_media_jobs_state          ON media_jobs(state, created_at);
CREATE INDEX idx_media_jobs_admin          ON media_jobs(admin_member_id, created_at);
CREATE INDEX idx_media_jobs_lease_recovery ON media_jobs(lease_expires_at)
  WHERE state = 'processing';

-- =============================================================================
-- SECTION 18: CLUBS & EVENTS — LEADERS, ORGANIZERS, ROSTER ACCESS, REGISTRATIONS
-- =============================================================================

-- Club leadership assignments: a flat set of equal co-leaders per club (max 5
-- total; application-enforced). There is no head-leader role; every row is
-- role='co-leader'.
-- Uniqueness invariants (DB-enforced):
--   ux_one_club_leader_per_member → a member co-leads at most one club
--   ux_club_leaders               → a member appears at most once per club
-- Max-5 cap is application-enforced; the application MUST reject inserts and
-- club_id reassignments that would exceed 5 total rows per club.
CREATE TABLE club_leaders (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  club_id    TEXT NOT NULL REFERENCES clubs(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  role TEXT NOT NULL DEFAULT 'co-leader' CHECK (role IN ('co-leader')),
  added_at TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_club_leaders               ON club_leaders(club_id, member_id);
-- idx_club_leaders_club dropped (left-prefix redundant with ux_club_leaders)
-- idx_club_leaders_member dropped (left-prefix redundant with the member_id unique below)
CREATE UNIQUE INDEX ux_one_club_leader_per_member  ON club_leaders(member_id);

-- Event organizer assignments: one organizer and up to 4 co-organizers per event
-- (max 5 total; application-enforced). DB enforces that only one member holds
-- role='organizer' per event and that a member appears at most once per event.
-- Uniqueness invariants (DB-enforced):
--   ux_one_organizer_per_event  → only one member may hold role='organizer' per event
--   ux_event_organizers         → a member appears at most once per event
-- Max-5 cap is application-enforced; the application MUST reject inserts and
-- event_id reassignments that would exceed 5 total rows per event.
CREATE TABLE event_organizers (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  event_id   TEXT NOT NULL REFERENCES events(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  role TEXT NOT NULL DEFAULT 'organizer' CHECK (role IN ('organizer','co-organizer')),
  added_at TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_event_organizers        ON event_organizers(event_id, member_id);
-- idx_event_organizers_event dropped (left-prefix redundant with ux_event_organizers)
CREATE UNIQUE INDEX ux_one_organizer_per_event ON event_organizers(event_id) WHERE role = 'organizer';

-- Member registration for an event (competitor or attendee/supporter).
-- Tracks registration type, payment, status lifecycle, and optional attendance
-- confirmation. One registration per member per event (DB-enforced by UNIQUE index).
CREATE TABLE registrations (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  event_id   TEXT NOT NULL REFERENCES events(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  registered_at  TEXT NOT NULL,
  registration_type TEXT NOT NULL
    CHECK (registration_type IN ('competitor','attendee_supporter')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','canceled','rejected')),
  tshirt_size           TEXT,
  donation_amount_cents INTEGER,
  payment_id            TEXT REFERENCES payments(id),
  attended_at           TEXT,
  attended_marked_by_member_id TEXT REFERENCES members(id)
);

CREATE UNIQUE INDEX ux_registrations
  ON registrations(event_id, member_id);
CREATE UNIQUE INDEX ux_registrations_payment
  ON registrations(payment_id)
  WHERE payment_id IS NOT NULL;
-- idx_registrations_event dropped (left-prefix redundant with ux_registrations)
CREATE INDEX idx_registrations_member   ON registrations(member_id);
CREATE INDEX idx_registrations_status   ON registrations(event_id, status);
CREATE INDEX idx_registrations_attended
  ON registrations(event_id, attended_at)
  WHERE attended_at IS NOT NULL;

-- =============================================================================
-- SECTION 19: ACCOUNT TOKENS
-- =============================================================================

-- Short-lived security tokens for email verification, password reset, and
-- personal data export requests. Token plaintext is never persisted; only
-- the SHA-256 hash is stored. Multiple outstanding tokens per member per type
-- are allowed (single-use via used_at; validity requires used_at IS NULL AND now < expires_at).
-- A background cleanup job deletes expired or consumed tokens older than the
-- configured threshold (token_cleanup_threshold_days).
CREATE TABLE account_tokens (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  member_id  TEXT NOT NULL REFERENCES members(id),
  -- target_legacy_member_id: for account_claim tokens only; the legacy_members
  -- row being claimed. Under the three-table identity redesign (DD §2.4),
  -- claim targets are legacy_members rows, not members. legacy_members rows
  -- are never deleted in normal flow, so ON DELETE NO ACTION.
  target_legacy_member_id TEXT REFERENCES legacy_members(legacy_member_id) ON DELETE NO ACTION,
  -- target_audit_entry_id: binds a token to the audit_entries row of the
  -- action the token authorizes acting upon (for example a claim a dispute
  -- token may revert). NULL for token types with no audit binding.
  target_audit_entry_id TEXT REFERENCES audit_entries(id) ON DELETE NO ACTION,
  -- target_anchor_id: for mailbox_link tokens; the declared old-email
  -- anchor whose mailbox control the click proves.
  target_anchor_id TEXT REFERENCES member_declared_anchors(id) ON DELETE NO ACTION,
  -- token_type maps to the token "purpose" concept.
  token_type TEXT NOT NULL
    CHECK (token_type IN ('email_verify','password_reset','data_export','account_claim','mailbox_link')),
  token_hash         TEXT NOT NULL,
  token_hash_version INTEGER NOT NULL DEFAULT 1,
  issued_at  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  -- used_at: set when the token is consumed (single-use); NULL = not yet consumed.
  used_at    TEXT
);

-- Index strategy: a UNIQUE index on token_hash alone (globally unique per hash)
-- covers the token-validation lookup, and a separate non-unique index on
-- (member_id, token_type) covers per-member token listing. Multiple outstanding
-- tokens per member per type are allowed; the per-member index is non-unique.
CREATE INDEX        idx_account_tokens_active  ON account_tokens(member_id, token_type);
CREATE UNIQUE INDEX ux_account_tokens_hash     ON account_tokens(token_hash);
CREATE INDEX        idx_account_tokens_member  ON account_tokens(member_id);
-- Index on expires_at for background cleanup job (purges expired/consumed tokens).
CREATE INDEX        idx_account_tokens_expires ON account_tokens(expires_at);
CREATE INDEX        idx_account_tokens_target_legacy_member ON account_tokens(target_legacy_member_id)
  WHERE target_legacy_member_id IS NOT NULL;

-- =============================================================================
-- SECTION 20: MAILING LIST SUBSCRIPTIONS
-- =============================================================================

-- Member subscription status for each mailing list. One row per member per list.
-- Tracks subscription lifecycle including bounces, complaints, and suppressions.
-- Admin role changes affect admin-alerts subscription as a transactional side effect.
CREATE TABLE mailing_list_subscriptions (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  mailing_list_id TEXT NOT NULL REFERENCES mailing_lists(slug),
  member_id       TEXT NOT NULL REFERENCES members(id),
  status TEXT NOT NULL DEFAULT 'subscribed'
    CHECK (status IN ('subscribed','unsubscribed','bounced','complained','suppressed')),
  status_updated_at TEXT NOT NULL,
  bounce_detail     TEXT,
  complaint_detail  TEXT
);

CREATE UNIQUE INDEX ux_mailing_list_subscriptions ON mailing_list_subscriptions(mailing_list_id, member_id);
CREATE INDEX        idx_mls_list_status            ON mailing_list_subscriptions(mailing_list_id, status);
CREATE INDEX        idx_mls_member                 ON mailing_list_subscriptions(member_id);

-- =============================================================================
-- SECTION 21: MEDIA FLAGS & TAGS
-- =============================================================================

-- Member-submitted content reports against a media item, routed to admin for
-- review. One flag per (media, reporter) pair. Cascade-deleted when the media
-- item is hard-deleted. Resolved flags record the admin's resolution label and reason.
CREATE TABLE media_flags (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  media_id           TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  reporter_member_id TEXT NOT NULL REFERENCES members(id),
  reason_text        TEXT,
  reported_at        TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_at                 TEXT,
  resolved_by_admin_member_id TEXT REFERENCES members(id),
  resolution_label            TEXT,
  resolution_reason           TEXT
);

CREATE UNIQUE INDEX ux_media_flags        ON media_flags(media_id, reporter_member_id);
-- idx_media_flags_media dropped (left-prefix redundant with ux_media_flags)
CREATE INDEX        idx_media_flags_status ON media_flags(status) WHERE status = 'open';

-- Tag applications linking a media item to a tag for discovery and organization.
-- One row per (media, tag) pair. Cascade-deleted when the media item is hard-deleted.
-- tag_display is denormalized at insert time from tags.tag_display.
CREATE TABLE media_tags (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  media_id    TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES tags(id),
  tag_display TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_media_tags        ON media_tags(media_id, tag_id);
-- idx_media_tags_media dropped (left-prefix redundant with ux_media_tags)
CREATE INDEX        idx_media_tags_tag   ON media_tags(tag_id);

-- =============================================================================
-- SECTION 22: TAG STATS CACHE
-- =============================================================================
-- Denormalized read cache for tag discovery and browsing on the public /tags page.
-- One row per tag, tracking usage_count, distinct_member_count, and last_used_at.
-- distinct_member_count drives the "community tag" threshold (≥2 distinct members).
-- computed_at records the last recomputation. Fully recomputable from source tables;
-- a background job upserts rows. The application owns recomputation cadence.
-- No id or version column: always fully recomputed by background job upsert;
-- no optimistic concurrency needed.
CREATE TABLE tag_stats (
  tag_id TEXT PRIMARY KEY REFERENCES tags(id),

  usage_count           INTEGER NOT NULL DEFAULT 0,
  distinct_member_count INTEGER NOT NULL DEFAULT 0,
  last_used_at          TEXT,

  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  computed_at TEXT NOT NULL
);

-- =============================================================================
-- SECTION 23: REQUIRED SEED DATA
-- =============================================================================
-- These INSERTs are part of schema initialization. A fresh database running
-- this file will have all mandatory defaults in place.
--
-- IMPORTANT — membership pricing defaults: the pricing key values below are placeholders
-- (values in integer cents). Update before going live by calling setConfigValue() through
-- AdminGovernanceService to insert a new row with the correct effective_start_at and values.
--
-- Seed rows use INSERT OR IGNORE, so the seed INSERT statements below are
-- idempotent when re-applied. However, the full schema file is NOT rerunnable on
-- an existing database because CREATE TABLE/VIEW/INDEX/TRIGGER statements are
-- unguarded (no IF NOT EXISTS). system_config seed IDs are stable strings (not
-- UUIDs) so INSERT OR IGNORE seed re-runs remain idempotent without UUID generation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- MAILING LISTS
-- Seven core lists required for platform operation:
--   admin-alerts            : system notifications to admins; is_member_manageable=0
--   all-members             : opt-outable broadcast list; is_member_manageable=1
--   newsletter              : editorial newsletter; is_member_manageable=1
--   board-announcements     : board communications; is_member_manageable=1
--   event-notifications     : event updates; is_member_manageable=1
--   technical-updates       : platform/technical notices; is_member_manageable=1
--   active-player-reminders : Active Player expiry reminders; is_member_manageable=1
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO mailing_lists
  (updated_at, slug, name, description, status, is_member_manageable)
VALUES
  (
   '2000-01-01T00:00:00.000Z',
   'admin-alerts', 'Admin Alerts',
   'System notifications sent to all platform administrators. Not member-manageable.',
   'active', 0
  ),

  (
   '2000-01-01T00:00:00.000Z',
   'all-members', 'All Members',
   'Platform-wide broadcast list. Members may unsubscribe.',
   'active', 1
  ),

  (
   '2000-01-01T00:00:00.000Z',
   'newsletter', 'Newsletter',
   'Editorial newsletter. Members may subscribe or unsubscribe.',
   'active', 1
  ),

  (
   '2000-01-01T00:00:00.000Z',
   'board-announcements', 'Board Announcements',
   'Communications from the board of directors. Members may subscribe or unsubscribe.',
   'active', 1
  ),

  (
   '2000-01-01T00:00:00.000Z',
   'event-notifications', 'Event Notifications',
   'Event updates and announcements. Members may subscribe or unsubscribe.',
   'active', 1
  ),

  (
   '2000-01-01T00:00:00.000Z',
   'technical-updates', 'Technical Updates',
   'Platform and technical notices. Members may subscribe or unsubscribe.',
   'active', 1
  ),

  (
   '2000-01-01T00:00:00.000Z',
   'active-player-reminders', 'Active Player Reminders',
   'Reminders sent before and on the day your Active Player status expires. Members may unsubscribe.',
   'active', 1
  );

-- ---------------------------------------------------------------------------
-- SYSTEM CONFIG
-- All operational defaults and pricing. One row per config key, using the
-- platform-epoch effective_start_at of '2000-01-01T00:00:00.000Z'.
-- changed_by_member_id is NULL for all system-seeded rows (no admin actor at init).
-- Seed INSERTs below are idempotent via INSERT OR IGNORE on stable string IDs; the full schema file is not rerunnable on an existing DB.
--
-- Key reference:
--   ballot_retention_days           Ballot retention window before policy cleanup allowed
--   audit_retention_days            Audit log retention window
--   reconciliation_expiry_days      Resolved reconciliation issue TTL
--   email_outbox_paused             0=outbox worker draining, 1=paused (admin toggle)
--   payments_paused                 0=membership purchases open, 1=paused (admin kill-switch)
--   event_registration_reminder_days Days before event start to send registration reminder
--   member_cleanup_grace_days       Grace days after soft-delete before PII purge job runs
--   payment_retention_days          Payment record compliance retention window
--   password_reset_expiry_hours     Password reset token TTL (hours)
--   email_verify_expiry_hours       Email verification token TTL (hours)
--   active_player_duration_days            Active Player grant duration (IFPA-rule-derived)
--   active_player_expiry_reminder_days_1   First Active Player expiry reminder offset (days)
--   active_player_expiry_reminder_days_2   Second Active Player expiry reminder offset (days)
--   active_player_expiry_check_interval_seconds   Worker tick interval for the AP expiry sweep (seconds)
--   vouch_rate_limit_max_per_hour          Max vouch submissions per voucher per window
--   vouch_rate_limit_window_minutes        Sliding window (minutes) for vouch rate limiting
--   outbox_max_retry_attempts       Max email retries before dead-letter queue
--   outbox_poll_interval_seconds    Outbox worker polling interval (seconds)
--   token_cleanup_threshold_days    Age threshold (days) for expired/consumed token cleanup
--   deceased_cleanup_grace_days     Grace period (days) before PII removal after marked deceased
--   data_export_link_expiry_hours   Hours before a data export download link expires
--   account_claim_expiry_hours      Legacy account claim token TTL (hours)
--   login_rate_limit_max_attempts   Max failed login attempts before account lockout
--   login_rate_limit_window_minutes Sliding window (minutes) for failed login counting
--   login_cooldown_minutes          Lockout duration (minutes) after rate-limit exceeded
--   login_account_rate_limit_max_attempts    Max login attempts per account across all IPs per window (distributed credential-stuffing cap)
--   login_account_rate_limit_window_minutes  Sliding window (minutes) for the per-account login cap
--   password_reset_rate_limit_max_attempts  Max password reset requests per window
--   password_reset_rate_limit_window_minutes Window for password reset rate limiting
--   password_change_rate_limit_max_attempts  Max authenticated password-change attempts per window
--   password_change_rate_limit_window_minutes Window for password-change rate limiting
--   verify_resend_rate_limit_max_attempts  Max verify-email resend requests per email per window
--   verify_resend_rate_limit_window_minutes Window for verify-email resend rate limiting
--   legacy_claim_init_rate_limit_max_per_member  Max legacy-claim initiate attempts per requesting member per window
--   legacy_claim_init_rate_limit_max_per_target  Max legacy-claim emails per target legacy_member_id per window (silent)
--   legacy_claim_init_rate_limit_max_per_ip      Max legacy-claim initiate attempts per source IP per window (silent)
--   legacy_claim_init_rate_limit_window_minutes  Sliding window for legacy-claim initiate rate limiting
--   hp_claim_rate_limit_max_per_member  Max direct historical-person claim confirms per member per window
--   hp_claim_rate_limit_max_per_ip      Max direct historical-person claim confirms per source IP per window
--   hp_claim_rate_limit_window_minutes  Sliding window for direct historical-person claim rate limiting
--   jwt_expiry_hours                Main site session JWT lifetime (hours)
--   photo_upload_rate_limit_per_hour Max photo uploads per member per hour
--   video_submission_rate_limit_per_hour Max video submissions per member per hour
--   media_flag_rate_limit_per_hour  Max media flags per member per hour
--   profile_edit_rate_limit_per_hour Max profile edits per member per hour
--   purchase_tier_rate_limit_per_hour Max tier-purchase attempts per member per hour
--   reconciliation_summary_interval_days Cadence for reconciliation digest email
--   primary_snapshot_version_days   S3 versioning retention for primary bucket
--   cross_region_backup_retention_days Object Lock retention for DR bucket
--   continuous_backup_interval_minutes Interval between SQLite backup runs
-- Pricing keys:
--   tier1_price_cents               Tier 1 IFPA Member dues (integer cents; $10.00 = 1000)
--   tier2_price_cents               Tier 2 IFPA Organizer Member dues (integer cents; $50.00 = 5000)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO system_config
  (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
VALUES
  (
   'seed-ballot-retention-days',
   '2000-01-01T00:00:00.000Z',
   'ballot_retention_days', '2555',
   '2000-01-01T00:00:00.000Z',
   'Ballot retention window (~7 years).',
   NULL
  ),

  (
   'seed-audit-retention-days',
   '2000-01-01T00:00:00.000Z',
   'audit_retention_days', '2555',
   '2000-01-01T00:00:00.000Z',
   'Audit log retention window (~7 years).',
   NULL
  ),

  (
   'seed-reconciliation-expiry-days',
   '2000-01-01T00:00:00.000Z',
   'reconciliation_expiry_days', '90',
   '2000-01-01T00:00:00.000Z',
   'Resolved reconciliation issues expire after 90 days.',
   NULL
  ),

  (
   'seed-event-registration-reminder-days',
   '2000-01-01T00:00:00.000Z',
   'event_registration_reminder_days', '7',
   '2000-01-01T00:00:00.000Z',
   'Days before event start to send registration reminder email (default: 7 days).',
   NULL
  ),

  (
   'seed-member-cleanup-grace-days',
   '2000-01-01T00:00:00.000Z',
   'member_cleanup_grace_days', '90',
   '2000-01-01T00:00:00.000Z',
   'Grace period (days) before PII purge runs after member soft-delete (default: 90 days).',
   NULL
  ),

  (
   'seed-payment-retention-days',
   '2000-01-01T00:00:00.000Z',
   'payment_retention_days', '2555',
   '2000-01-01T00:00:00.000Z',
   'Payment record compliance retention window (~7 years).',
   NULL
  ),

  (
   'seed-password-reset-expiry-hours',
   '2000-01-01T00:00:00.000Z',
   'password_reset_expiry_hours', '1',
   '2000-01-01T00:00:00.000Z',
   'Password reset token TTL in hours (default: 1 hour).',
   NULL
  ),

  (
   'seed-email-verify-expiry-hours',
   '2000-01-01T00:00:00.000Z',
   'email_verify_expiry_hours', '24',
   '2000-01-01T00:00:00.000Z',
   'Email verification token TTL in hours (default: 24 hours).',
   NULL
  ),

  (
   'seed-outbox-max-retry-attempts',
   '2000-01-01T00:00:00.000Z',
   'outbox_max_retry_attempts', '5',
   '2000-01-01T00:00:00.000Z',
   'Maximum email send retry attempts before moving to dead-letter queue (default: 5).',
   NULL
  ),

  (
   'seed-outbox-poll-interval-seconds',
   '2000-01-01T00:00:00.000Z',
   'outbox_poll_interval_seconds', '30',
   '2000-01-01T00:00:00.000Z',
   'Outbox worker polling interval in seconds (default: 30).',
   NULL
  ),

  (
   'seed-outbox-sending-lease-seconds',
   '2000-01-01T00:00:00.000Z',
   'outbox_sending_lease_seconds', '600',
   '2000-01-01T00:00:00.000Z',
   'Lease (seconds) before a stranded sending row is reaped back to pending (default: 600).',
   NULL
  ),

  (
   'seed-email-outbox-paused',
   '2000-01-01T00:00:00.000Z',
   'email_outbox_paused', '0',
   '2000-01-01T00:00:00.000Z',
   'Admin pause toggle for the transactional email outbox worker (0 = draining, 1 = paused).',
   NULL
  ),

  (
   'seed-payments-paused',
   '2000-01-01T00:00:00.000Z',
   'payments_paused', '0',
   '2000-01-01T00:00:00.000Z',
   'Admin kill-switch for membership purchases (0 = open, 1 = paused).',
   NULL
  ),

  (
   'seed-token-cleanup-threshold-days',
   '2000-01-01T00:00:00.000Z',
   'token_cleanup_threshold_days', '7',
   '2000-01-01T00:00:00.000Z',
   'Age threshold in days for cleanup job to purge expired or consumed account tokens (default: 7).',
   NULL
  ),

  (
   'seed-deceased-cleanup-grace-days',
   '2000-01-01T00:00:00.000Z',
   'deceased_cleanup_grace_days', '30',
   '2000-01-01T00:00:00.000Z',
   'Grace period in days before PII removal runs after member is marked deceased (default: 30 days).',
   NULL
  );

-- ---------------------------------------------------------------------------
-- SYSTEM CONFIG — ADDITIONAL KEYS
-- Auth/security tokens, rate limits, backup retention.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO system_config
  (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
VALUES
  (
   'seed-data-export-link-expiry-hours',
   '2000-01-01T00:00:00.000Z',
   'data_export_link_expiry_hours', '72',
   '2000-01-01T00:00:00.000Z',
   'Hours before a personal data export download link expires (default: 72).',
   NULL
  ),

  (
   'seed-account-claim-expiry-hours',
   '2000-01-01T00:00:00.000Z',
   'account_claim_expiry_hours', '24',
   '2000-01-01T00:00:00.000Z',
   'Legacy account claim token TTL in hours (default: 24 hours).',
   NULL
  ),

  (
   'seed-login-rate-limit-max-attempts',
   '2000-01-01T00:00:00.000Z',
   'login_rate_limit_max_attempts', '10',
   '2000-01-01T00:00:00.000Z',
   'Max failed login attempts within the window before account lockout (default: 10).',
   NULL
  ),

  (
   'seed-login-rate-limit-window-minutes',
   '2000-01-01T00:00:00.000Z',
   'login_rate_limit_window_minutes', '15',
   '2000-01-01T00:00:00.000Z',
   'Sliding window in minutes for counting failed login attempts (default: 15).',
   NULL
  ),

  (
   'seed-login-cooldown-minutes',
   '2000-01-01T00:00:00.000Z',
   'login_cooldown_minutes', '30',
   '2000-01-01T00:00:00.000Z',
   'Lockout duration in minutes after login rate-limit threshold exceeded (default: 30).',
   NULL
  ),

  (
   'seed-login-account-rate-limit-max-attempts',
   '2000-01-01T00:00:00.000Z',
   'login_account_rate_limit_max_attempts', '30',
   '2000-01-01T00:00:00.000Z',
   'Max login attempts per account across all source IPs within the window, capping distributed credential-stuffing of one account (default: 30).',
   NULL
  ),

  (
   'seed-login-account-rate-limit-window-minutes',
   '2000-01-01T00:00:00.000Z',
   'login_account_rate_limit_window_minutes', '60',
   '2000-01-01T00:00:00.000Z',
   'Sliding window in minutes for the per-account login cap (default: 60).',
   NULL
  ),

  (
   'seed-password-reset-rate-limit-max-attempts',
   '2000-01-01T00:00:00.000Z',
   'password_reset_rate_limit_max_attempts', '5',
   '2000-01-01T00:00:00.000Z',
   'Max password reset requests per email per window before silent rate-limiting (default: 5).',
   NULL
  ),

  (
   'seed-password-reset-rate-limit-window-minutes',
   '2000-01-01T00:00:00.000Z',
   'password_reset_rate_limit_window_minutes', '60',
   '2000-01-01T00:00:00.000Z',
   'Sliding window in minutes for counting password reset requests per email (default: 60).',
   NULL
  ),

  (
   'seed-password-change-rate-limit-max-attempts',
   '2000-01-01T00:00:00.000Z',
   'password_change_rate_limit_max_attempts', '10',
   '2000-01-01T00:00:00.000Z',
   'Max authenticated password-change attempts per member per window (default: 10).',
   NULL
  ),

  (
   'seed-password-change-rate-limit-window-minutes',
   '2000-01-01T00:00:00.000Z',
   'password_change_rate_limit_window_minutes', '15',
   '2000-01-01T00:00:00.000Z',
   'Sliding window in minutes for counting password-change attempts per member (default: 15).',
   NULL
  ),

  (
   'seed-verify-resend-rate-limit-max-attempts',
   '2000-01-01T00:00:00.000Z',
   'verify_resend_rate_limit_max_attempts', '3',
   '2000-01-01T00:00:00.000Z',
   'Max verify-email resend requests per email per window before silent rate-limiting (default: 3).',
   NULL
  ),

  (
   'seed-verify-resend-rate-limit-window-minutes',
   '2000-01-01T00:00:00.000Z',
   'verify_resend_rate_limit_window_minutes', '60',
   '2000-01-01T00:00:00.000Z',
   'Sliding window in minutes for counting verify-email resend requests per email (default: 60).',
   NULL
  ),

  (
   'seed-legacy-claim-init-rate-limit-max-per-member',
   '2000-01-01T00:00:00.000Z',
   'legacy_claim_init_rate_limit_max_per_member', '5',
   '2000-01-01T00:00:00.000Z',
   'Max legacy-claim initiate attempts per requesting member per window (default: 5).',
   NULL
  ),

  (
   'seed-legacy-claim-init-rate-limit-max-per-target',
   '2000-01-01T00:00:00.000Z',
   'legacy_claim_init_rate_limit_max_per_target', '3',
   '2000-01-01T00:00:00.000Z',
   'Max legacy-claim emails sent to one target legacy_member_id per window (default: 3); silent outcome on cap.',
   NULL
  ),

  (
   'seed-legacy-claim-init-rate-limit-max-per-ip',
   '2000-01-01T00:00:00.000Z',
   'legacy_claim_init_rate_limit_max_per_ip', '10',
   '2000-01-01T00:00:00.000Z',
   'Max legacy-claim initiate attempts per source IP per window (default: 10); silent outcome on cap.',
   NULL
  ),

  (
   'seed-legacy-claim-init-rate-limit-window-minutes',
   '2000-01-01T00:00:00.000Z',
   'legacy_claim_init_rate_limit_window_minutes', '60',
   '2000-01-01T00:00:00.000Z',
   'Sliding window in minutes for legacy-claim initiate rate limiting (default: 60).',
   NULL
  ),

  (
   'seed-hp-claim-rate-limit-max-per-member',
   '2000-01-01T00:00:00.000Z',
   'hp_claim_rate_limit_max_per_member', '5',
   '2000-01-01T00:00:00.000Z',
   'Max direct historical-person claim confirms per requesting member per window (default: 5).',
   NULL
  ),

  (
   'seed-hp-claim-rate-limit-max-per-ip',
   '2000-01-01T00:00:00.000Z',
   'hp_claim_rate_limit_max_per_ip', '10',
   '2000-01-01T00:00:00.000Z',
   'Max direct historical-person claim confirms per source IP per window (default: 10).',
   NULL
  ),

  (
   'seed-hp-claim-rate-limit-window-minutes',
   '2000-01-01T00:00:00.000Z',
   'hp_claim_rate_limit_window_minutes', '60',
   '2000-01-01T00:00:00.000Z',
   'Sliding window in minutes for direct historical-person claim rate limiting (default: 60).',
   NULL
  ),

  (
   'seed-jwt-expiry-hours',
   '2000-01-01T00:00:00.000Z',
   'jwt_expiry_hours', '24',
   '2000-01-01T00:00:00.000Z',
   'Main site session JWT lifetime in hours; also governs legacy archive access expiry (default: 24).',
   NULL
  ),

  (
   'seed-photo-upload-rate-limit-per-hour',
   '2000-01-01T00:00:00.000Z',
   'photo_upload_rate_limit_per_hour', '10',
   '2000-01-01T00:00:00.000Z',
   'Max photo uploads per member per hour (default: 10).',
   NULL
  ),

  (
   'seed-profile-edit-rate-limit-per-hour',
   '2000-01-01T00:00:00.000Z',
   'profile_edit_rate_limit_per_hour', '20',
   '2000-01-01T00:00:00.000Z',
   'Max profile edits per member per hour (default: 20).',
   NULL
  ),

  (
   'seed-purchase-tier-rate-limit-per-hour',
   '2000-01-01T00:00:00.000Z',
   'purchase_tier_rate_limit_per_hour', '20',
   '2000-01-01T00:00:00.000Z',
   'Max tier-purchase attempts per member per hour (default: 20).',
   NULL
  ),

  (
   'seed-video-submission-rate-limit-per-hour',
   '2000-01-01T00:00:00.000Z',
   'video_submission_rate_limit_per_hour', '5',
   '2000-01-01T00:00:00.000Z',
   'Max video link submissions per member per hour (default: 5).',
   NULL
  ),

  (
   'seed-media-flag-rate-limit-per-hour',
   '2000-01-01T00:00:00.000Z',
   'media_flag_rate_limit_per_hour', '10',
   '2000-01-01T00:00:00.000Z',
   'Max media flags per member per hour (admin-configurable; default: 10).',
   NULL
  ),

  (
   'seed-reconciliation-summary-interval-days',
   '2000-01-01T00:00:00.000Z',
   'reconciliation_summary_interval_days', '7',
   '2000-01-01T00:00:00.000Z',
   'Cadence in days for automated reconciliation digest email to admins (default: 7).',
   NULL
  ),

  (
   'seed-primary-snapshot-version-days',
   '2000-01-01T00:00:00.000Z',
   'primary_snapshot_version_days', '30',
   '2000-01-01T00:00:00.000Z',
   'S3 versioning retention window in days for primary backup bucket (default: 30).',
   NULL
  ),

  (
   'seed-cross-region-backup-retention-days',
   '2000-01-01T00:00:00.000Z',
   'cross_region_backup_retention_days', '90',
   '2000-01-01T00:00:00.000Z',
   'Object Lock retention window in days for cross-region disaster-recovery S3 bucket (default: 90).',
   NULL
  ),

  (
   'seed-continuous-backup-interval-minutes',
   '2000-01-01T00:00:00.000Z',
   'continuous_backup_interval_minutes', '5',
   '2000-01-01T00:00:00.000Z',
   'Interval in minutes between continuous SQLite backup runs (default: 5).',
   NULL
  );

-- ---------------------------------------------------------------------------
-- SYSTEM CONFIG — MEMBERSHIP PRICING KEYS
-- Stored as integer cents consistent with all payment tables.
-- IMPORTANT: Values below are IFPA defaults; update before launch by calling
-- setConfigValue() through AdminGovernanceService with appropriate effective_start_at.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO system_config
  (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
VALUES
  (
   'seed-tier1-price',
   '2000-01-01T00:00:00.000Z',
   'tier1_price_cents', '1000',
   '2000-01-01T00:00:00.000Z',
   'Tier 1 IFPA Member dues: $10.00 USD (IFPA default; stored as integer cents).',
   NULL
  ),

  (
   'seed-tier2-price',
   '2000-01-01T00:00:00.000Z',
   'tier2_price_cents', '5000',
   '2000-01-01T00:00:00.000Z',
   'Tier 2 IFPA Organizer Member dues: $50.00 USD (IFPA default; stored as integer cents).',
   NULL
  );

-- ---------------------------------------------------------------------------
-- SYSTEM CONFIG — ACTIVE PLAYER KEYS
-- Active Player is a temporary status for Tier 0 members. Duration and reminder
-- offsets follow the IFPA Membership Rules (730-day grant; 30-day and 7-day
-- pre-expiry reminder defaults; the day-of expiry notification is built in and
-- not separately configurable).
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO system_config
  (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
VALUES
  (
   'seed-active-player-duration-days',
   '2000-01-01T00:00:00.000Z',
   'active_player_duration_days', '730',
   '2000-01-01T00:00:00.000Z',
   'Active Player duration in days from qualifying event attendance, vouch, or one-time club-join grant.',
   NULL
  ),

  (
   'seed-active-player-expiry-reminder-days-1',
   '2000-01-01T00:00:00.000Z',
   'active_player_expiry_reminder_days_1', '30',
   '2000-01-01T00:00:00.000Z',
   'First Active Player expiry reminder offset in days before expiry (default: 30 days).',
   NULL
  ),

  (
   'seed-active-player-expiry-reminder-days-2',
   '2000-01-01T00:00:00.000Z',
   'active_player_expiry_reminder_days_2', '7',
   '2000-01-01T00:00:00.000Z',
   'Second Active Player expiry reminder offset in days before expiry (default: 7 days).',
   NULL
  ),

  (
   'seed-active-player-expiry-check-interval-seconds',
   '2000-01-01T00:00:00.000Z',
   'active_player_expiry_check_interval_seconds', '86400',
   '2000-01-01T00:00:00.000Z',
   'Worker tick interval for the AP expiry sweep, in seconds (default: 86400 = 24h).',
   NULL
  );

-- ---------------------------------------------------------------------------
-- SYSTEM CONFIG — VOUCH RATE-LIMIT KEYS
-- Per US §M_Vouch_For_Active_Player vouching submissions are rate-limited per
-- voucher to prevent abuse. Defaults are conservative; admins may tune via
-- AdminGovernanceService.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO system_config
  (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
VALUES
  (
   'seed-vouch-rate-limit-max-per-hour',
   '2000-01-01T00:00:00.000Z',
   'vouch_rate_limit_max_per_hour', '5',
   '2000-01-01T00:00:00.000Z',
   'Max vouch submissions per voucher per window (default: 5).',
   NULL
  ),

  (
   'seed-vouch-rate-limit-window-minutes',
   '2000-01-01T00:00:00.000Z',
   'vouch_rate_limit_window_minutes', '60',
   '2000-01-01T00:00:00.000Z',
   'Sliding window in minutes for counting vouch submissions per voucher (default: 60).',
   NULL
  );

-- =============================================================================
-- SECTION 24: LEGACY DATA MIGRATION TABLES
-- =============================================================================

-- Permanent operational table: live club membership for members.
-- Written at legacy claim time, by admin, or by member self-service. Never dropped.
CREATE TABLE member_club_affiliations (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  member_id  TEXT NOT NULL REFERENCES members(id),
  club_id    TEXT NOT NULL REFERENCES clubs(id),
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0,1)),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  is_contact INTEGER NOT NULL DEFAULT 0 CHECK (is_contact IN (0,1)),
  source     TEXT NOT NULL DEFAULT 'legacy_claim'
    CHECK (source IN ('legacy_claim','admin','member_self_service')),

  UNIQUE(member_id, club_id)
);

CREATE INDEX idx_member_club_affiliations_member ON member_club_affiliations(member_id);
CREATE INDEX idx_member_club_affiliations_club   ON member_club_affiliations(club_id);
-- Two-current-club cap: at most two is_current=1 rows per member.
-- Service-enforced (ClubService count-before-insert, matching the
-- 5-leader-cap pattern). Partial unique index was dropped because
-- SQLite partial unique indexes only enforce N=1.
-- Primary club: at most one is_primary=1 row per member among current affiliations.
CREATE UNIQUE INDEX ux_member_club_affiliations_one_primary
  ON member_club_affiliations(member_id)
  WHERE is_primary = 1 AND is_current = 1;

-- Crowdsource club-viability signals collected on the onboarding wizard's
-- own-affiliation cards and (future) from club-detail and dashboard
-- surfaces. Append-only: one row per member per club per source stage. The
-- crowdsource_club_viability predicate (A_Periodic_Club_Cleanup) aggregates
-- these rows at evaluation time; "not_sure" responses contribute no signal
-- to any gate.
-- A row is either club-keyed (club_id set; feeds the viability gates) or
-- candidate-keyed (club_id NULL; an activity answer about a club candidate
-- that has no live clubs row yet, surfaced on the admin cleanup queue's
-- candidate-flag group). Promoting the candidate stamps club_id onto its
-- candidate-keyed rows, moving them from the second class to the first, so
-- a vote is never counted on both surfaces.
CREATE TABLE club_viability_signals (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  member_id TEXT NOT NULL REFERENCES members(id),
  club_id   TEXT REFERENCES clubs(id),

  source_stage TEXT NOT NULL
    CHECK (source_stage IN (
      'stage1a_contact','stage1b_affiliated',
      'club_detail','dashboard'
    )),

  activity_signal TEXT NOT NULL
    CHECK (activity_signal IN ('active','not_active','not_sure','never_heard_of_it')),

  source_entity_type TEXT,
  source_entity_id   TEXT,

  CHECK (
    club_id IS NOT NULL
    OR (source_entity_type = 'legacy_club_candidate' AND source_entity_id IS NOT NULL)
  )
);

CREATE INDEX idx_club_viability_signals_club   ON club_viability_signals(club_id);
CREATE INDEX idx_club_viability_signals_member ON club_viability_signals(member_id);

-- Admin cleanup queue resolution tracking. One row per club per predicate
-- resolution. Prevents resolved/deferred items from reappearing in the queue.
-- Deferred items have a deferred_until timestamp; they reappear after expiry.
CREATE TABLE club_cleanup_resolutions (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  club_id        TEXT NOT NULL REFERENCES clubs(id),
  predicate_name TEXT NOT NULL,
  resolution     TEXT NOT NULL
    CHECK (resolution IN ('dismissed','deferred','demoted','archived')),
  deferred_until TEXT,
  reason_text    TEXT,

  UNIQUE(club_id, predicate_name)
);

CREATE INDEX idx_club_cleanup_resolutions_club ON club_cleanup_resolutions(club_id);

-- Candidate-keyed cleanup resolutions: defer windows and terminal flag
-- dismissals for unpromoted legacy_club_candidates in the admin cleanup
-- queue. Mirrors club_cleanup_resolutions (which is keyed to live clubs and
-- cannot hold candidate rows). One row per candidate per queue-item type
-- (predicate_name), so a defer on a candidate's wizard-flag item never
-- hides its promotable item, and vice versa. deferred_by_member_id powers
-- the "previously deferred by Admin X" annotation when an expired defer
-- re-surfaces.
CREATE TABLE candidate_cleanup_resolutions (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  candidate_id   TEXT NOT NULL REFERENCES legacy_club_candidates(id),
  predicate_name TEXT NOT NULL,
  resolution     TEXT NOT NULL
    CHECK (resolution IN ('deferred','dismissed')),
  deferred_until TEXT,
  deferred_by_member_id TEXT REFERENCES members(id),
  reason_text    TEXT,

  UNIQUE(candidate_id, predicate_name)
);

CREATE INDEX idx_candidate_cleanup_resolutions_candidate
  ON candidate_cleanup_resolutions(candidate_id);

-- Concurrent-admin coordination markers for the cleanup queue. A claim is a
-- visible "claimed by Admin X at time T" hint to other admins, never a lock:
-- it does not block anyone, auto-releases when the item is resolved, and
-- goes stale after 30 minutes (staleness is evaluated in the read query;
-- there is no background process). One claim per item; a re-claim refreshes
-- the marker.
CREATE TABLE club_cleanup_claims (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,

  item_type  TEXT NOT NULL CHECK (item_type IN ('club','candidate')),
  item_id    TEXT NOT NULL,
  claimed_by_member_id TEXT NOT NULL REFERENCES members(id),
  claimed_at TEXT NOT NULL,

  UNIQUE(item_type, item_id)
);

-- Permanent operational table: per-member onboarding-wizard task state.
-- One row per (member_id, task_type). Owned by MemberOnboardingService.
-- Rows persist for the life of the member; completed tasks remain in place
-- so the dashboard widget knows what is outstanding versus done.
CREATE TABLE member_onboarding_tasks (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  member_id    TEXT NOT NULL REFERENCES members(id),
  task_type    TEXT NOT NULL
    CHECK (task_type IN ('personal_details','legacy_claim','club_affiliations')),
  state        TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','in_progress_paused','skipped','completed','not_applicable')),
  completed_at TEXT,

  UNIQUE(member_id, task_type)
);

CREATE INDEX idx_member_onboarding_tasks_member ON member_onboarding_tasks(member_id);

CREATE TABLE member_declared_anchors (
  id           TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  member_id    TEXT NOT NULL REFERENCES members(id),
  anchor_type  TEXT NOT NULL CHECK (anchor_type IN ('former_surname','old_email')),
  anchor_value TEXT NOT NULL,
  -- Mailbox-control round-trip: set when the member clicked a confirmation
  -- link delivered to this declared old email while signed in, upgrading
  -- claims matched through this anchor to the hard-evidence tier.
  verified_via_link_click_at TEXT,
  verification_token_id      TEXT,
  UNIQUE(member_id, anchor_type, anchor_value)
);
CREATE INDEX idx_member_declared_anchors_member ON member_declared_anchors(member_id);

-- Permanent archival table: one row per imported legacy account from the old
-- footbag.org mirror or Steve Goldberg's data dump. Identified by the legacy
-- site's user-account id (legacy_member_id), which is also the external
-- namespace pointer carried by members.legacy_member_id and
-- historical_persons.legacy_member_id. Rows are never deleted. Claim marks
-- (sets claimed_by_member_id + claimed_at) but does not remove the row; PII
-- purge of the claiming member clears both claim fields so the legacy account
-- becomes claimable again. See DD §2.4.
--
-- Tier mapping at claim time: legacy honors (is_hof, is_bap) and any other
-- evidence from the legacy record are evaluated by claim-time service logic,
-- which writes a single member_tier_grants row with reason_code
-- 'legacy.claim_tier_grant'. No permanent legacy-tier columns are retained on
-- this table; the canonical lifetime tier lives in member_tier_grants.
CREATE TABLE legacy_members (
  legacy_member_id TEXT PRIMARY KEY,

  -- Legacy identifiers from the old-site namespace
  legacy_user_id   TEXT,
  -- A legacy account could hold up to three email addresses (a primary plus two
  -- secondary). A claimant's login email and each declared old email match
  -- against all three, so someone who reaches the platform under a secondary
  -- address still links to their legacy record.
  legacy_email     TEXT,
  legacy_email2    TEXT,
  legacy_email3    TEXT,

  -- Profile snapshot from mirror/dump (immutable post-import)
  real_name                TEXT,
  display_name             TEXT,
  display_name_normalized  TEXT,
  city                     TEXT,
  region                   TEXT,
  country                  TEXT,
  bio                      TEXT,
  birth_date               TEXT,
  street_address           TEXT,
  postal_code              TEXT,
  ifpa_join_date           TEXT,
  first_competition_year   INTEGER,

  -- Honor flags from mirror/dump
  is_hof          INTEGER NOT NULL DEFAULT 0 CHECK (is_hof IN (0,1)),
  is_bap          INTEGER NOT NULL DEFAULT 0 CHECK (is_bap IN (0,1)),
  legacy_is_admin INTEGER NOT NULL DEFAULT 0 CHECK (legacy_is_admin IN (0,1)),

  -- Paid-history evidence from the legacy IFPA membership/payment record, read by
  -- the claim-time tier grant. The loader populates them; default 0 means the
  -- account holds no such paid standing (one with only honors grants on honors).
  legacy_ever_paid_tier2 INTEGER NOT NULL DEFAULT 0 CHECK (legacy_ever_paid_tier2 IN (0,1)),
  legacy_ever_paid_tier1_lifetime INTEGER NOT NULL DEFAULT 0 CHECK (legacy_ever_paid_tier1_lifetime IN (0,1)),
  legacy_tier1_annual_active_at_cutover INTEGER NOT NULL DEFAULT 0 CHECK (legacy_tier1_annual_active_at_cutover IN (0,1)),

  -- Import audit
  import_source TEXT,                 -- 'mirror' | 'legacy_site_data' | 'system_fixture' (platform-seeded stub) | null pre-integration
  imported_at   TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,

  -- Claim state (set on M_Claim_Legacy_Account completion, cleared on PII purge)
  claimed_by_member_id TEXT REFERENCES members(id) ON DELETE NO ACTION,
  claimed_at           TEXT,

  -- Claim invariant: both NULL, or both set
  CHECK (
    (claimed_by_member_id IS NULL     AND claimed_at IS NULL) OR
    (claimed_by_member_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

-- At most one live member can own a given legacy account.
CREATE UNIQUE INDEX ux_legacy_members_claimed_by
  ON legacy_members(claimed_by_member_id)
  WHERE claimed_by_member_id IS NOT NULL;

-- Claim-flow lookup indexes: claim resolution matches by legacy_email (and its
-- two secondary columns), legacy_user_id, and claimed_by_member_id.
-- The email columns are non-unique: one address may legitimately appear as the
-- primary on one account and a secondary on another, and cross-account email
-- uniqueness (an address must not identify two different legacy accounts) is
-- guaranteed a-priori by the legacy-data validation gate before matching runs,
-- not by the DB. A still-colliding address is the match-time ambiguity backstop:
-- the claim lookup returns multiple rows and surfaces no auto candidate.
CREATE INDEX idx_legacy_members_legacy_email
  ON legacy_members(legacy_email)
  WHERE legacy_email IS NOT NULL;
CREATE INDEX idx_legacy_members_legacy_email2
  ON legacy_members(legacy_email2)
  WHERE legacy_email2 IS NOT NULL;
CREATE INDEX idx_legacy_members_legacy_email3
  ON legacy_members(legacy_email3)
  WHERE legacy_email3 IS NOT NULL;
CREATE UNIQUE INDEX ux_legacy_members_legacy_user_id
  ON legacy_members(legacy_user_id)
  WHERE legacy_user_id IS NOT NULL;

-- Migration-only staging table: batch auto-link candidate matches. The batch
-- pass (and future registration-time passes) stage candidates here without
-- mutating live tables or sending mail; the onboarding wizard reads open rows
-- and the member confirms or declines. Confirmation runs the ordinary claim
-- transaction; nothing applies without member action. May be dropped after
-- every staged row reaches a terminal state (confirmed, declined, expired).
CREATE TABLE auto_link_staged_candidates (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  member_id            TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  legacy_member_id     TEXT REFERENCES legacy_members(legacy_member_id) ON DELETE NO ACTION,
  historical_person_id TEXT REFERENCES historical_persons(person_id) ON DELETE NO ACTION,
  confidence           TEXT NOT NULL CHECK (confidence IN ('high','medium')),
  -- Anchors that produced the match (modern email, name variant, etc.),
  -- as a JSON array of strings; feeds the wizard card's provenance label
  -- and the staged/confirmed audit metadata.
  matched_anchors_json TEXT NOT NULL DEFAULT '[]',
  -- Evidence-strength tag a confirmation of this candidate will carry on
  -- its claim audit row.
  proposed_evidence_strength TEXT NOT NULL
    CHECK (proposed_evidence_strength IN
      ('declared_anchor_only','currently_controls_modern_email_matching_legacy',
       'mailbox_control_via_link_click','admin_vetted_evidence')),
  -- 'cross_source' rows are post-confirm offers for the member's OTHER
  -- identity source (§7 cross-source candidate detection); they share the
  -- stage/confirm/decline/expire lifecycle but emit the cross-source audit
  -- event family.
  source_pass TEXT NOT NULL CHECK (source_pass IN ('batch','sign_in','registration','cross_source')),
  status      TEXT NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged','confirmed','declined','expired')),
  resolved_at TEXT,
  expires_at  TEXT,

  -- A candidate names at least one target source.
  CHECK (legacy_member_id IS NOT NULL OR historical_person_id IS NOT NULL),
  -- Open rows are exactly the unresolved ones.
  CHECK ((status = 'staged') = (resolved_at IS NULL))
);

-- Re-running the staging pass must not duplicate an open candidate for the
-- same member/target pair. COALESCE folds the nullable target columns so
-- SQLite's NULLs-are-distinct UNIQUE semantics cannot admit duplicates.
CREATE UNIQUE INDEX ux_auto_link_staged_open
  ON auto_link_staged_candidates(
    member_id,
    COALESCE(legacy_member_id, ''),
    COALESCE(historical_person_id, '')
  )
  WHERE status = 'staged';
CREATE INDEX idx_auto_link_staged_member_open
  ON auto_link_staged_candidates(member_id)
  WHERE status = 'staged';
CREATE INDEX idx_auto_link_staged_expiry
  ON auto_link_staged_candidates(expires_at)
  WHERE status = 'staged' AND expires_at IS NOT NULL;

-- Migration-only staging table: normalized mirror-derived club identities.
-- May be dropped once all bootstrap decisions are finalized and no staging
-- review is pending.
CREATE TABLE legacy_club_candidates (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  legacy_club_key  TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  city             TEXT,
  region           TEXT,
  country          TEXT,
  -- Live-content carry-forward: published onto the clubs row when the
  -- candidate is promoted (description as-is; external_url only after it
  -- passes URL verification). NULL until the enrichment loader supplies
  -- them from the mirror extraction.
  description      TEXT,
  external_url     TEXT,
  confidence_score REAL,
  mapped_club_id   TEXT REFERENCES clubs(id),
  bootstrap_eligible INTEGER NOT NULL DEFAULT 0 CHECK (bootstrap_eligible IN (0,1)),
  classification     TEXT NOT NULL CHECK (classification IN ('pre_populate','onboarding_visible','dormant','junk')),
  -- Terminal cleanup lifecycle, carried on the candidate row itself so that
  -- "every non-junk candidate has reached a terminal state" (the condition
  -- for retiring this table) is checkable from the rows alone. NULL while
  -- the candidate is still live in the admin cleanup queue.
  lifecycle_state    TEXT CHECK (lifecycle_state IN ('archived','junk_confirmed')),

  -- Classification evidence: one 0/1 flag per named classifier rule
  -- (r1-r10), the substitute-contact marker, and the raw rule inputs
  -- below. Persisted so an admin can audit a candidate's classification
  -- rationale without re-running the classifier.
  r1  INTEGER NOT NULL DEFAULT 0 CHECK (r1  IN (0,1)),
  r2  INTEGER NOT NULL DEFAULT 0 CHECK (r2  IN (0,1)),
  r3  INTEGER NOT NULL DEFAULT 0 CHECK (r3  IN (0,1)),
  r4  INTEGER NOT NULL DEFAULT 0 CHECK (r4  IN (0,1)),
  r5  INTEGER NOT NULL DEFAULT 0 CHECK (r5  IN (0,1)),
  r6  INTEGER NOT NULL DEFAULT 0 CHECK (r6  IN (0,1)),
  r7  INTEGER NOT NULL DEFAULT 0 CHECK (r7  IN (0,1)),
  r8  INTEGER NOT NULL DEFAULT 0 CHECK (r8  IN (0,1)),
  r9  INTEGER NOT NULL DEFAULT 0 CHECK (r9  IN (0,1)),
  r10 INTEGER NOT NULL DEFAULT 0 CHECK (r10 IN (0,1)),
  contact_signal_substitute_applied INTEGER NOT NULL DEFAULT 0
    CHECK (contact_signal_substitute_applied IN (0,1)),

  -- Rule inputs (years and counts). NULL when the underlying mirror data is absent.
  last_hosted_year                INTEGER,
  max_affiliated_member_last_year INTEGER,
  contact_member_last_year        INTEGER,
  created_year                    INTEGER,
  last_updated_year               INTEGER,
  unique_member_names             INTEGER,
  linkable_member_count           INTEGER,
  ever_hosted INTEGER NOT NULL DEFAULT 0 CHECK (ever_hosted IN (0,1))
);

CREATE UNIQUE INDEX ux_legacy_club_candidates_key
  ON legacy_club_candidates(legacy_club_key);
CREATE INDEX idx_legacy_club_candidates_mapped
  ON legacy_club_candidates(mapped_club_id)
  WHERE mapped_club_id IS NOT NULL;

-- Migration-only staging table: mirror-derived scored person-to-club affiliation suggestions.
-- At least one of historical_person_id or legacy_member_id must be non-NULL.
-- Uniqueness enforced via two partial indexes (not a single UNIQUE) because SQLite
-- treats NULLs as distinct in UNIQUE constraints, which would allow duplicate rows
-- when historical_person_id IS NULL.
-- May be dropped once all affiliation suggestions are resolved.
CREATE TABLE legacy_person_club_affiliations (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  historical_person_id     TEXT REFERENCES historical_persons(person_id),
  legacy_member_id         TEXT REFERENCES legacy_members(legacy_member_id) ON DELETE NO ACTION,
  legacy_club_candidate_id TEXT NOT NULL REFERENCES legacy_club_candidates(id),
  inferred_role            TEXT NOT NULL
    CHECK (inferred_role IN ('member','contact','leader','co-leader')),
  confidence_score         REAL,
  resolution_status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (resolution_status IN (
      'pending','confirmed_current','former_only','not_mine',
      'needs_review','promoted','rejected','superseded'
    )),
  resolved_club_id TEXT REFERENCES clubs(id),
  display_name     TEXT,
  notes            TEXT,

  CHECK(historical_person_id IS NOT NULL OR legacy_member_id IS NOT NULL),
  -- Wizard contract: a row marked 'confirmed_current' MUST carry a
  -- resolved_club_id pointing at the live clubs row. The onboarding wizard
  -- transitions rows from 'pending' to 'confirmed_current' and stamps
  -- resolved_club_id in the same UPDATE (ClubService.confirmAffiliation).
  -- Leadership promotion is the separate ClubService.claimLeadership path
  -- against club_bootstrap_leaders. This CHECK locks the contract at the
  -- schema layer so a future wizard bug can't leave a half-promoted row.
  CHECK (
    resolution_status != 'confirmed_current'
    OR resolved_club_id IS NOT NULL
  )
);

CREATE INDEX idx_legacy_person_club_affiliations_member
  ON legacy_person_club_affiliations(legacy_member_id)
  WHERE legacy_member_id IS NOT NULL;
CREATE INDEX idx_legacy_person_club_affiliations_person
  ON legacy_person_club_affiliations(historical_person_id)
  WHERE historical_person_id IS NOT NULL;
CREATE INDEX idx_legacy_person_club_affiliations_resolution
  ON legacy_person_club_affiliations(resolution_status);
-- Uniqueness by historical_person_id when known.
CREATE UNIQUE INDEX ux_lpca_by_person
  ON legacy_person_club_affiliations(historical_person_id, legacy_club_candidate_id, inferred_role)
  WHERE historical_person_id IS NOT NULL;
-- Uniqueness by legacy_member_id whenever legacy_member_id is present.
-- The original WHERE clause also required historical_person_id IS NULL, which
-- left a gap when both columns were set: ux_lpca_by_person enforced
-- (person, candidate, role) uniqueness but allowed two rows with the same
-- (legacy_member, candidate, role) provided their historical_person_id values
-- differed. Dropping the historical_person_id-IS-NULL clause closes the gap.
CREATE UNIQUE INDEX ux_lpca_by_member
  ON legacy_person_club_affiliations(legacy_member_id, legacy_club_candidate_id, inferred_role)
  WHERE legacy_member_id IS NOT NULL;

-- Operational table (migration-origin): provisional legacy leadership for bootstrapped clubs.
-- Does not grant live club-management permissions.
-- legacy_member_id is NOT NULL: it is the stable identifier that survives deletion of the
-- imported placeholder row after a successful claim.
-- imported_member_id is ON DELETE SET NULL for the same reason.
-- May be dropped only after all rows reach a terminal state (claimed, superseded, rejected).
CREATE TABLE club_bootstrap_leaders (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  club_id            TEXT NOT NULL REFERENCES clubs(id),
  imported_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  claimed_member_id  TEXT REFERENCES members(id),
  legacy_member_id   TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('leader','co-leader')),
  confidence_score   REAL,
  status             TEXT NOT NULL DEFAULT 'provisional'
    CHECK (status IN ('provisional','claimed','superseded','rejected')),
  claim_confirmed_at TEXT,
  notes              TEXT,

  UNIQUE(club_id, legacy_member_id, role)
);

CREATE INDEX idx_club_bootstrap_leaders_club   ON club_bootstrap_leaders(club_id);
CREATE INDEX idx_club_bootstrap_leaders_member ON club_bootstrap_leaders(imported_member_id);
CREATE INDEX idx_club_bootstrap_leaders_status ON club_bootstrap_leaders(status);

-- Per-signal evidence rows backing the combination-gate classification of
-- club bootstrap leaders. One row per (bootstrap_leader_id, signal_type).
-- Structural signals participate in the strong/weak/none gates; modifiers
-- are context-only (wizard display + admin sort) and never change the
-- classification.
CREATE TABLE club_bootstrap_leader_signals (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,

  bootstrap_leader_id TEXT NOT NULL REFERENCES club_bootstrap_leaders(id) ON DELETE CASCADE,
  signal_type         TEXT NOT NULL CHECK (signal_type IN (
    'listed_contact','affiliation','hosting','roster','mirror_text',
    'tier_signal','recent_activity','geographic_alignment'
  )),
  signal_payload_json TEXT NOT NULL,
  is_present          INTEGER NOT NULL CHECK (is_present IN (0,1)),
  source              TEXT NOT NULL,

  UNIQUE(bootstrap_leader_id, signal_type)
);

CREATE INDEX idx_club_bootstrap_leader_signals_leader
  ON club_bootstrap_leader_signals(bootstrap_leader_id);

-- =============================================================================
-- NAME-MATCHING UTILITIES (permanent, not migration-only)
-- =============================================================================

-- name_variants
--
-- Name-equivalence pairs that support auto-link matching at claim and
-- registration time. Seeded at migration from mirror-mined pairs (~290 known
-- variants in the legacy HTML). Remains live post-cutover so admins and
-- members may record additional equivalences as they surface.
--
-- Relation semantics: symmetric. Storing ('robert', 'bob') means the two
-- forms are treated as the same name for matching purposes; lookups must
-- check both columns. Do not insert both directions (enforced by the
-- PRIMARY KEY plus the self-pair CHECK).
--
-- Normalization: every inserted value and every lookup input is normalized
-- by the application to NFKC + lowercase + whitespace-collapse + trim before
-- it reaches this table. The table stores only the normalized forms.
--
-- Not prefixed `legacy_*`: this is a permanent name-matching utility, not
-- migration-only staging. Compare with `legacy_club_candidates`, which
-- resolves into `clubs` at State 2 and is archival thereafter. Name variants
-- have no resolution step; the pairs themselves are the permanent artifact.
CREATE TABLE name_variants (
  canonical_normalized TEXT NOT NULL,
  variant_normalized   TEXT NOT NULL,
  source               TEXT NOT NULL DEFAULT 'mirror_mined'
                         CHECK (source IN ('mirror_mined', 'admin_added', 'member_submitted')),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  PRIMARY KEY (canonical_normalized, variant_normalized),
  CHECK (canonical_normalized <> variant_normalized),
  CHECK (length(canonical_normalized) > 0),
  CHECK (length(variant_normalized)   > 0)
);

CREATE INDEX idx_name_variants_variant ON name_variants(variant_normalized);

-- Generic given-name shortenings (Dave/David, Mike/Michael, etc.).
-- Distinct from name_variants: these are not person-specific aliases but
-- universal first-name equivalences applied at matching time.
-- Curated source: inputs/curated/given_name_variants.csv.
CREATE TABLE given_name_variants (
  short_form_normalized TEXT NOT NULL,
  long_form_normalized  TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  PRIMARY KEY (short_form_normalized, long_form_normalized),
  CHECK (short_form_normalized <> long_form_normalized),
  CHECK (length(short_form_normalized) > 0),
  CHECK (length(long_form_normalized)  > 0)
);

-- =============================================================================
-- FREESTYLE DOMAIN LAYER
-- Additive tables. No existing tables are modified.
-- Canonical results remain authoritative for placements.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- freestyle_records
--
-- Verified or probable per-trick best performances, sourced from the passback
-- records pipeline. Each row is a current record for a specific trick.
--
-- record_type values (passback source):
--   trick_consecutive       — best consecutive completions of the trick
--   trick_consecutive_dex   — best consecutive completions, dex variant
--   trick_consecutive_juggle — best consecutive juggle variant
--
-- confidence → public visibility:
--   verified    — fully public
--   probable    — visible with disclaimer (passback 'medium' maps here)
--   provisional — not surfaced publicly (passback 'low' maps here)
--   disputed    — not surfaced publicly
--
-- person_id is nullable: unresolved players use display_name only.
-- CHECK enforces at least one of person_id or display_name is present.
-- ---------------------------------------------------------------------------
CREATE TABLE freestyle_records (
  id              TEXT PRIMARY KEY,
  record_type     TEXT NOT NULL,
  person_id       TEXT REFERENCES historical_persons(person_id),
  display_name    TEXT,
  trick_name      TEXT,    -- common trick name (e.g. "Alpine Blurry Whirl")
  sort_name       TEXT,    -- canonical structured name (e.g. "Stepping Whirl (op) (ducking)")
  adds_count      INTEGER, -- number of adds on the trick; NULL if not applicable
  value_numeric   REAL,
  value_text      TEXT,
  achieved_date   TEXT,    -- ISO date YYYY-MM-DD (may be approximate; see date_precision)
  date_precision  TEXT NOT NULL DEFAULT 'day'
    CHECK (date_precision IN ('day', 'month', 'year', 'approximate')),
  source          TEXT NOT NULL,
  confidence      TEXT NOT NULL
    CHECK (confidence IN ('verified', 'probable', 'provisional', 'disputed')),
  video_url       TEXT,
  video_timecode  TEXT,    -- e.g. "1:43" timestamp within the video
  notes           TEXT,
  superseded_by   TEXT REFERENCES freestyle_records(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (person_id IS NOT NULL OR display_name IS NOT NULL)
);

CREATE INDEX idx_freestyle_records_person
  ON freestyle_records(person_id);
CREATE INDEX idx_freestyle_records_type_confidence
  ON freestyle_records(record_type, confidence);

-- =============================================================================
-- CONSECUTIVE KICKS DOMAIN LAYER
-- Additive tables. No existing tables are modified.
-- Source: legacy_data/inputs/curated/records/consecutives_records.csv
-- =============================================================================

-- ---------------------------------------------------------------------------
-- consecutive_kicks_records
--
-- WFA-sanctioned consecutive kicks records. Covers four sections:
--   Official World Records   — 12 current WFA world records with event details
--   Highest Official Scores  — elite ranked lists (20000+ clubs, timed top-10)
--   World Record Progression — full progression history per division
--   Milestone Firsts         — first player to reach milestone kick counts
--
-- sort_order is the primary key, derived from the source CSV and encodes
-- section+subsection ordering (100s=Singles 20K+, 200s=Timed, 300s=Doubles,
-- 400s=Official WR, 500s–1200s=Progression, 1300s=Milestones).
-- ---------------------------------------------------------------------------
CREATE TABLE consecutive_kicks_records (
  sort_order  INTEGER PRIMARY KEY,
  section     TEXT NOT NULL,    -- Highest Official Scores | Official World Records | World Record Progression | Milestone Firsts
  subsection  TEXT NOT NULL,
  division    TEXT NOT NULL,    -- Open Singles | Women's Singles | Open Doubles | Women's Doubles | etc.
  year        TEXT,             -- year of record (progression rows only)
  rank        INTEGER,          -- rank within subsection (ranked-list rows only)
  player_1    TEXT,
  player_2    TEXT,
  score       INTEGER,          -- kicks count (NULL for some milestone-firsts rows without score)
  note        TEXT,
  event_date  TEXT,             -- ISO or raw text from source
  event_name  TEXT,
  location    TEXT
);

CREATE INDEX idx_consecutive_kicks_section
  ON consecutive_kicks_records(section, sort_order);

-- =============================================================================
-- NET DOMAIN LAYER  (additive — canonical tables are never modified)
-- Evidence classes: canonical_only | curated_enrichment | inferred_partial | unresolved_candidate
-- STATISTICS FIREWALL: service layer enforces evidence_class = 'canonical_only' for all
--   user-facing stats. inferred_partial is never exposed in phase 1 routes.
--   DB-level guard: use net_team_appearance_canonical view instead of the table directly.
-- =============================================================================

-- Policy registry (populated by script 12, queried by service layer for disclaimers)
CREATE TABLE net_stat_policy (
  evidence_class      TEXT PRIMARY KEY
    CHECK (evidence_class IN ('canonical_only','curated_enrichment','inferred_partial','unresolved_candidate')),
  display_label       TEXT NOT NULL,
  may_show_public     INTEGER NOT NULL CHECK (may_show_public IN (0,1)),
  requires_disclaimer INTEGER NOT NULL CHECK (requires_disclaimer IN (0,1)),
  disclaimer_text     TEXT,
  may_use_in_stats    INTEGER NOT NULL CHECK (may_use_in_stats IN (0,1)),
  created_at          TEXT NOT NULL
);

-- Canonical group mapping for net disciplines (~50 name variants → 13 groups)
-- SAFETY: conflict_flag=1 means this discipline matched multiple patterns ambiguously.
-- These rows MUST be reviewed before their canonical_group is trusted.
-- This table never overrides canonical event_disciplines data — it only annotates gaps.
CREATE TABLE net_discipline_group (
  discipline_id   TEXT PRIMARY KEY REFERENCES event_disciplines(id),
  canonical_group TEXT NOT NULL,   -- open_doubles | mixed_doubles | womens_doubles |
                                   -- intermediate_doubles | novice_doubles | masters_doubles |
                                   -- other_doubles | open_singles | womens_singles |
                                   -- intermediate_singles | novice_singles | masters_singles |
                                   -- other_singles | uncategorized
  match_method    TEXT NOT NULL CHECK (match_method IN ('exact','pattern','fallback')),
  review_needed   INTEGER NOT NULL DEFAULT 0 CHECK (review_needed IN (0,1)),
  conflict_flag   INTEGER NOT NULL DEFAULT 0 CHECK (conflict_flag IN (0,1)),
                                   -- 1 = matched multiple patterns; canonical_group is best guess only
  mapped_at       TEXT NOT NULL,
  mapped_by       TEXT NOT NULL
);
CREATE INDEX idx_net_discipline_group_group    ON net_discipline_group(canonical_group);
CREATE INDEX idx_net_discipline_group_conflict ON net_discipline_group(conflict_flag);

-- Stable doubles team entity (sorted person_id pair)
-- team_id = UUID5(NAMESPACE, f"{person_id_a}|{person_id_b}")
-- NAMESPACE = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')  ← fixed constant in script 13
-- person_id_a is always lexicographically < person_id_b  (CHECK enforced)
-- NOTE: team_instance (same pair reforming after a multi-year gap) is NOT modeled here.
--   If needed in a future phase, add a team_instance table referencing net_team.
CREATE TABLE net_team (
  team_id          TEXT PRIMARY KEY,
  person_id_a      TEXT NOT NULL REFERENCES historical_persons(person_id),
  person_id_b      TEXT NOT NULL REFERENCES historical_persons(person_id),
  first_year       INTEGER,
  last_year        INTEGER,
  appearance_count INTEGER NOT NULL DEFAULT 0,  -- count(distinct event_id, discipline_id), not raw entries
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  CHECK (person_id_a < person_id_b),
  UNIQUE (person_id_a, person_id_b)
);
CREATE INDEX idx_net_team_person_a ON net_team(person_id_a);
CREATE INDEX idx_net_team_person_b ON net_team(person_id_b);

-- Explicit membership (2 rows per team; enables person→teams index)
CREATE TABLE net_team_member (
  id        TEXT PRIMARY KEY,
  team_id   TEXT NOT NULL REFERENCES net_team(team_id),
  person_id TEXT NOT NULL REFERENCES historical_persons(person_id),
  position  TEXT NOT NULL CHECK (position IN ('a','b')),
  UNIQUE (team_id, person_id)
);
CREATE INDEX idx_net_team_member_person ON net_team_member(person_id);
CREATE INDEX idx_net_team_member_team   ON net_team_member(team_id);

-- One row per (team × event_discipline); denormalized placement cache
-- appearance_count on net_team = count(distinct event_id, discipline_id) across these rows.
-- STATISTICS FIREWALL: query via net_team_appearance_canonical view, not this table directly.
CREATE TABLE net_team_appearance (
  id              TEXT PRIMARY KEY,
  team_id         TEXT NOT NULL REFERENCES net_team(team_id),
  event_id        TEXT NOT NULL REFERENCES events(id),
  discipline_id   TEXT NOT NULL REFERENCES event_disciplines(id),
  result_entry_id TEXT NOT NULL REFERENCES event_result_entries(id),
  placement       INTEGER NOT NULL,
  score_text      TEXT,
  event_year      INTEGER NOT NULL,
  evidence_class  TEXT NOT NULL DEFAULT 'canonical_only'
    CHECK (evidence_class IN ('canonical_only','curated_enrichment','inferred_partial','unresolved_candidate')),
  extracted_at    TEXT NOT NULL,
  UNIQUE (team_id, result_entry_id),
  UNIQUE (team_id, event_id, discipline_id)   -- prevents duplicate ingestion and malformed joins
);
CREATE INDEX idx_net_team_appearance_team  ON net_team_appearance(team_id);
CREATE INDEX idx_net_team_appearance_event ON net_team_appearance(event_id);
CREATE INDEX idx_net_team_appearance_year  ON net_team_appearance(event_year);
-- Perf-only index for the net_team_appearance_canonical view filter and
-- every downstream query that reads the canonical-only subset. Without
-- this, SQLite rebuilds an automatic partial covering index on
-- evidence_class for every call, and the /net home page's notable-pool
-- + notable-player-pool aggregations dominate page render time (>11s
-- in dev measurement 2026-05-17). No row semantics; pure read perf.
CREATE INDEX IF NOT EXISTS idx_net_team_appearance_evidence_class
  ON net_team_appearance(evidence_class);

-- Defensive view: enforces evidence_class = 'canonical_only' at the DB layer.
-- db.ts queries MUST use this view instead of net_team_appearance directly.
-- Protects against future dev mistakes and ad-hoc SQL bypassing the service layer.
CREATE VIEW net_team_appearance_canonical AS
  SELECT * FROM net_team_appearance WHERE evidence_class = 'canonical_only';

-- net_relative_performance: DEFERRED. Not in phase 1.
-- Placement-derived pairwise ordering is inferred_partial evidence and cannot be
-- displayed without risk of being misread as match outcomes. Re-evaluate in phase 2 only
-- after a curator review workflow exists. Table intentionally NOT created here.

-- QC items and quarantined events for manual review
-- priority: 1=critical data conflict, 2=discipline ambiguity,
--           3=structural issue, 4=low-priority cleanup
CREATE TABLE net_review_queue (
  id                TEXT PRIMARY KEY,
  source_file       TEXT NOT NULL,
  item_type         TEXT NOT NULL CHECK (item_type IN ('quarantine_event','qc_issue')),
  priority          INTEGER NOT NULL DEFAULT 3
    CHECK (priority IN (1,2,3,4)),
  event_id          TEXT,
  discipline_id     TEXT,
  check_id          TEXT,
  severity          TEXT NOT NULL,
  reason_code       TEXT,
  message           TEXT NOT NULL,
  raw_context       TEXT,        -- JSON blob (opaque QC metadata — never queried structurally)
  review_stage      TEXT,
  resolution_status TEXT NOT NULL DEFAULT 'open'
    CHECK (resolution_status IN ('open','resolved','wont_fix','escalated')),
  resolution_notes  TEXT,
  resolved_by       TEXT,
  resolved_at       TEXT,
  imported_at       TEXT NOT NULL,
  -- Classification metadata (all nullable; populated by curator or remediation workflow)
  -- classification valid values: retag_team_type | split_merged_discipline |
  --   quarantine_non_results_block | parser_improvement | unresolved
  classification            TEXT,
  -- proposed_fix_type mirrors fix_type values in canonical_discipline_fixes.csv
  proposed_fix_type         TEXT,
  -- classification_confidence valid values: confirmed | tentative
  classification_confidence TEXT,
  -- decision_status valid values: fix_encoded | fix_active | deferred | wont_fix
  decision_status           TEXT,
  decision_notes            TEXT,
  classified_by             TEXT,
  classified_at             TEXT   -- ISO-8601 timestamp
);
CREATE INDEX idx_net_review_event          ON net_review_queue(event_id);
CREATE INDEX idx_net_review_status         ON net_review_queue(resolution_status);
CREATE INDEX idx_net_review_priority       ON net_review_queue(priority);
CREATE INDEX idx_net_review_classification ON net_review_queue(classification);
CREATE INDEX idx_net_review_decision       ON net_review_queue(decision_status);

-- Phase 2 stub: raw text fragments from unstructured sources (OLD_RESULTS.txt etc.)
CREATE TABLE net_raw_fragment (
  id             TEXT PRIMARY KEY,
  source_file    TEXT NOT NULL,
  source_line    INTEGER,
  raw_text       TEXT NOT NULL,
  fragment_type  TEXT NOT NULL
    CHECK (fragment_type IN ('match_result','bracket_line','placement_block')),
  event_hint     TEXT,
  year_hint      INTEGER,
  parse_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (parse_status IN ('pending','parsed','unparseable','skipped')),
  imported_at    TEXT NOT NULL
);

-- Phase 2 stub: extracted match candidates from noise/unstructured sources.
-- Populated by script 16 (phase 2). Created now so schema is stable.
-- evidence_class is always 'unresolved_candidate' until manually curated.
-- Extraction guard: a candidate is only inserted when BOTH conditions hold:
--   1. Two distinct player/team names detected in the fragment
--   2. A numeric score OR explicit win/loss verb (defeated, def., bt, beat, lost to) present
CREATE TABLE net_candidate_match (
  candidate_id         TEXT PRIMARY KEY,
  fragment_id          TEXT REFERENCES net_raw_fragment(id),
  event_id             TEXT,                        -- nullable: linked after disambiguation
  discipline_id        TEXT,                        -- nullable: linked after disambiguation
  player_a_raw_name    TEXT,                        -- extracted name before person linking
  player_b_raw_name    TEXT,                        -- extracted name before person linking
  player_a_person_id   TEXT,                        -- nullable: linked after name resolution
  player_b_person_id   TEXT,                        -- nullable: for doubles
  raw_text             TEXT NOT NULL,
  extracted_score      TEXT,                        -- raw score string, not normalized
  round_hint           TEXT,                        -- 'final','semi','quarter','pool', etc.
  year_hint            INTEGER,
  confidence_score     REAL CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  evidence_class       TEXT NOT NULL DEFAULT 'unresolved_candidate'
    CHECK (evidence_class = 'unresolved_candidate'),
  review_status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','accepted','rejected','needs_info')),
  imported_at          TEXT NOT NULL
);
CREATE INDEX idx_net_candidate_event  ON net_candidate_match(event_id);
CREATE INDEX idx_net_candidate_status ON net_candidate_match(review_status);

-- Promoted / rejected candidates — full audit trail of curator decisions.
-- evidence_class is always 'curated_enrichment'.
-- UNIQUE(candidate_id) prevents double-promotion at the DB level.
-- Both approvals and rejections are stored; curated_status distinguishes them.
-- Key fields from the candidate are snapshotted here for audit continuity
-- even if the source candidate row is later modified.
CREATE TABLE net_curated_match (
  curated_id          TEXT PRIMARY KEY,
  candidate_id        TEXT NOT NULL REFERENCES net_candidate_match(candidate_id),
  curated_status      TEXT NOT NULL
    CHECK (curated_status IN ('approved', 'rejected')),
  evidence_class      TEXT NOT NULL DEFAULT 'curated_enrichment'
    CHECK (evidence_class = 'curated_enrichment'),
  event_id            TEXT,
  discipline_id       TEXT,
  player_a_person_id  TEXT,
  player_b_person_id  TEXT,
  extracted_score     TEXT,
  raw_text            TEXT NOT NULL,
  curator_note        TEXT,
  curated_at          TEXT NOT NULL,
  curated_by          TEXT NOT NULL,
  UNIQUE (candidate_id)
);
CREATE INDEX idx_net_curated_candidate ON net_curated_match(candidate_id);
CREATE INDEX idx_net_curated_status    ON net_curated_match(curated_status);

-- =============================================================================
-- FREESTYLE TRICK DICTIONARY
-- Loaded by legacy_data/event_results/scripts/17_load_trick_dictionary.py
-- Source: legacy_data/inputs/noise/tricks.csv (74 tricks)
-- Keyed on slug (lowercase-underscore canonical name); separate from freestyle_records.
-- =============================================================================

CREATE TABLE freestyle_tricks (
  slug            TEXT PRIMARY KEY,                -- e.g. 'blurry_whirl'
  canonical_name  TEXT NOT NULL,                   -- e.g. 'blurry whirl'
  adds            TEXT,                            -- numeric ADD value or 'modifier'
  base_trick      TEXT,                            -- immediate base trick name (may equal canonical_name)
  trick_family    TEXT,                            -- family grouping slug (= base_trick for compounds, self for base tricks)
  category        TEXT,                            -- 'dex' | 'body' | 'set' | 'compound' | 'modifier' (no CHECK; broad/inclusive)
  description     TEXT,                            -- from notes column in tricks.csv
  aliases_json    TEXT,                            -- JSON array of alias strings; DEPRECATED — see freestyle_trick_aliases
  notation        TEXT,                            -- Jobs notation (semantic), opaque text from sources
  operational_notation TEXT,                       -- Set-arc operational notation (execution mechanics; FootbagMoves-style). Independent of `notation` (semantic Jobs notation). Curator-authored or curator-reviewed FM-derived. NEVER read by parser; NEVER overrides editorial truth. Renders in the trick-detail "Set notation (operational)" section when populated.
  operational_notation_source TEXT,                -- Free-form curator-authored provenance/citation for operational_notation. Renders as a muted italic line beneath the notation block. Supports three real states (FM curator-reviewed / IFPA-authored / FM alternative-reading) plus ontology-conflict transparency notes (e.g. blur "Blurry Mirage" vs IFPA "Stepping Paradox Mirage"). Omitted entirely from the page when null. NEVER read by parser; presentation-layer only.
  review_status   TEXT NOT NULL DEFAULT 'curated', -- v2.1: 'curated' | 'scraped' | 'expert_reviewed' | 'pending' (no CHECK)
  is_core         INTEGER NOT NULL DEFAULT 0,      -- v2.1: 1 for irreducible dex/body/set primitives only (not modifiers)
  is_active       INTEGER NOT NULL DEFAULT 1,      -- v2.1: 0 hides from public listings (used for review_status='pending' rows)
  sort_order      INTEGER NOT NULL DEFAULT 0,      -- load order from source CSV
  loaded_at       TEXT NOT NULL,
  updated_at      TEXT,                            -- v2.1: populated by loaders on row update; nullable on first insert

  -- ── Notation grammar ─────────────────────────────────────────────────────
  --
  -- Raw Jobs notation is preserved exactly as documented (historical
  -- evidence). The structured-parse columns are PARALLEL metadata derived
  -- from canonical_name + jobs_notation_raw; they are filled by a future
  -- parser and used for ADD-derivation QC and visualization.
  --
  -- Asserted `adds` above remains authoritative for editorial truth.
  -- Computed values below are diagnostic only; status field tracks how
  -- the computed value relates to the asserted one.
  --
  -- All six are nullable; existing rows load unchanged.
  jobs_notation_raw         TEXT,                  -- canonical raw Jobs notation; never mutated. Backfill source = current `notation` column.
  jobs_notation_normalized  TEXT,                  -- whitespace-collapsed / case-standardized form for diff + QC. Derived; regenerable from jobs_notation_raw.
  structural_parse_json     TEXT,                  -- JSON: {core_family, set, rotation, modifier, dex_structure, delay_surface, ...}. Per PROPOSAL §2.
  computed_add_formula      TEXT,                  -- human-readable ADD derivation, e.g. 'spinning(+1 rot) + whirl(3) = 4'. NULL when unresolved.
  computed_adds             INTEGER,               -- numeric ADD when derivable. NULL otherwise. Diagnostic only — does NOT override `adds` above.
  add_formula_status        TEXT,                  -- 'exact_modifier_derived' | 'exact_self_atom' | 'approximate' | 'unresolved' | 'policy_dependent' (no CHECK; see PROPOSAL §7.2 + PHASE_2_5_REFINEMENTS §2)

  -- ── UX3 editorial prose + featured-media columns ─────────────────────────
  -- Curator-authored editorial prose backing the universal-shell template
  -- (src/views/freestyle/trick-shell.hbs) UX2-tier rendering. Service-layer
  -- shaping pre-splits prose paragraphs and exposes them via
  -- FreestyleTrickContent.ux2Pilot. All columns nullable; section render gates
  -- on column presence so sparse rows continue to render cleanly. Replaces the
  -- prior service-layer UX2_PILOT_RAW constant.
  short_description    TEXT,                       -- one-sentence elevator pitch rendered in the hero
  execution_summary    TEXT,                       -- plain-English mechanics; multi-paragraph (split by service on \n\n)
  learning_notes       TEXT,                       -- gotchas + progression tips; multi-paragraph
  prerequisite_notes   TEXT,                       -- prereq prose; falls back to "Previous Tricks" anchor when absent
  -- Phonetic respelling for tricks with non-obvious pronunciation (e.g. guay =
  -- "gwhy"). Nullable; rendered as a compact fact chip when present. Recovered
  -- from the legacy footbag.org moves2 Pronunciation field, then curator-expanded.
  pronunciation        TEXT
);

CREATE INDEX idx_freestyle_tricks_category      ON freestyle_tricks(category);
CREATE INDEX idx_freestyle_tricks_adds          ON freestyle_tricks(adds);
CREATE INDEX idx_freestyle_tricks_family        ON freestyle_tricks(trick_family);
CREATE INDEX idx_freestyle_tricks_is_active     ON freestyle_tricks(is_active);
CREATE INDEX idx_freestyle_tricks_review_status ON freestyle_tricks(review_status);

-- Modifier reference table — loaded from trick_modifiers.csv (21 rows).
-- Each modifier applies a flat ADD bonus to any base trick. The
-- add_bonus_rotational column is currently set equal to add_bonus for every
-- modifier; the historical rotational-base differential is retired.
-- NOT a duplicate of freestyle_tricks modifier rows — this table carries the ADD rules.
CREATE TABLE freestyle_trick_modifiers (
  slug                  TEXT PRIMARY KEY,          -- e.g. 'blurry'
  modifier_name         TEXT NOT NULL,             -- e.g. 'blurry'
  add_bonus             INTEGER NOT NULL,          -- ADD this modifier adds to a base trick
  add_bonus_rotational  INTEGER NOT NULL,          -- historical rotational column; currently equal to add_bonus for every modifier
  modifier_type         TEXT NOT NULL,             -- 'body' | 'set' | 'rotational-qualifier' (no CHECK; v2.1 expanded for Gyro)
  notes                 TEXT,
  loaded_at             TEXT NOT NULL
);

-- =============================================================================
-- TRICK DICTIONARY v2.1 — provenance, aliases, relations, composition
-- Loaded by scripts 17 (curated), 19 (Red expert review), 20 (footbag.org scrape).
-- =============================================================================

-- v2.1: Source registry. Every loaded trick row is attributed to one or more
-- sources via freestyle_trick_source_links. Examples:
--   'curated-v1'              — original tricks.csv
--   'red-husted-2026-04-20'   — domain expert review email
--   'footbag-org-2026-04'     — scraped from footbag.org/newmoves/list
CREATE TABLE freestyle_trick_sources (
  id            TEXT PRIMARY KEY,
  source_type   TEXT NOT NULL,                     -- 'curated' | 'scraped' | 'expert' | 'imported' (no CHECK)
  source_label  TEXT NOT NULL,                     -- human description
  source_url    TEXT,                              -- when scraped/imported
  retrieved_at  TEXT NOT NULL,
  notes         TEXT
);

-- v2.1: Many-to-many trick↔source. Captures per-source assertions that may
-- diverge from canonical (asserted_adds vs freestyle_tricks.adds). Canonical
-- is authoritative; this table preserves the disagreement for QC and audit.
-- The QC script pipeline/qc/check_trick_source_disagreements.py emits a CSV
-- of all rows where asserted_* differs from canonical.
CREATE TABLE freestyle_trick_source_links (
  trick_slug         TEXT NOT NULL REFERENCES freestyle_tricks(slug),
  source_id          TEXT NOT NULL REFERENCES freestyle_trick_sources(id),
  external_ref       TEXT,                         -- e.g. footbag.org showmove_id, magazine page
  external_url       TEXT,                         -- e.g. http://footbag.org/newmoves/showmove/27
  asserted_adds      INTEGER,                      -- what THIS source claims; NULL = agrees with canonical
  asserted_notation  TEXT,                         -- what THIS source uses; NULL = agrees with canonical
  asserted_category  TEXT,                         -- what THIS source claims; NULL = agrees with canonical
  notes              TEXT,
  PRIMARY KEY (trick_slug, source_id)
);
CREATE INDEX idx_freestyle_trick_source_links_source ON freestyle_trick_source_links(source_id);

-- v2.1: First-class alias table. Replaces the aliases_json column on
-- freestyle_tricks (the column is retained during migration for backwards
-- compat; new code reads this table). alias_type distinguishes:
--   'common'        — established alternate name (Sidewalk, Tombstone)
--   'abbreviation'  — short form (BW, p-whirl)
--   'historical'    — renamed-from name (toe blur → quantum)
--   'notation'      — notation-form alias (XBD/B)
CREATE TABLE freestyle_trick_aliases (
  alias_slug   TEXT PRIMARY KEY,                   -- normalized alias key, e.g. 'bw'
  alias_text   TEXT NOT NULL,                      -- display form, e.g. 'BW'
  trick_slug   TEXT NOT NULL REFERENCES freestyle_tricks(slug),
  alias_type   TEXT NOT NULL,                      -- 'common' | 'abbreviation' | 'historical' | 'notation' (no CHECK)
  source_id    TEXT REFERENCES freestyle_trick_sources(id),
  notes        TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_freestyle_trick_aliases_trick ON freestyle_trick_aliases(trick_slug);

-- v2.1: Composition links — which modifiers are baked into a trick's canonical
-- form. Example: 'spinning paradox mirage' → mirage (base) + paradox (order=1)
-- + spinning (order=2). Apply order matters because conventional naming is
-- ordered. ADD math validation against these links is DEFERRED — the loader
-- populates them but does not yet enforce sum(modifier bonuses) + base.adds
-- == trick.adds.
CREATE TABLE freestyle_trick_modifier_links (
  trick_slug    TEXT NOT NULL REFERENCES freestyle_tricks(slug),
  modifier_slug TEXT NOT NULL REFERENCES freestyle_trick_modifiers(slug),
  apply_order   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (trick_slug, modifier_slug, apply_order)
);
CREATE INDEX idx_freestyle_trick_modifier_links_modifier ON freestyle_trick_modifier_links(modifier_slug);

-- v2.1: Trick-to-trick relations distinct from base/family/aliases. Used when
-- two distinct canonical entries refer to the same physical trick OR carry
-- meaningful historical/derivative relationships:
--   'equivalent_to'  — same physical trick, both names well-established (Vortex ⇄ Gyro Drifter)
--   'renamed_from'   — newer name supersedes older (Quantum ← Toe Blur)
--   'variant_of'     — minor execution variant
--   'derivative_of'  — non-base derivation that doesn't fit base_trick
CREATE TABLE freestyle_trick_relations (
  from_trick_slug  TEXT NOT NULL REFERENCES freestyle_tricks(slug),
  to_trick_slug    TEXT NOT NULL REFERENCES freestyle_tricks(slug),
  relation_type    TEXT NOT NULL,                  -- 'equivalent_to' | 'renamed_from' | 'variant_of' | 'derivative_of' (no CHECK)
  notes            TEXT,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (from_trick_slug, to_trick_slug, relation_type)
);
CREATE INDEX idx_freestyle_trick_relations_to ON freestyle_trick_relations(to_trick_slug);

-- Legacy footbag.org "Member Tips" — community technique advice recovered from
-- the legacy moves2.movehints table. This is community guidance, NOT canonical
-- doctrine: tips are display-only and never feed descriptions, notation, ADDs,
-- family membership, parser output, or first-class eligibility. Author member
-- names are intentionally NOT stored in v1. Loaded by loader 27 from the
-- committed freestyle/inputs/footbag_org_member_tips.ndjson (DELETE+INSERT).
--
-- A freestyle tip whose legacy trick name does not yet map to a canonical slug
-- is still preserved here with status='unresolved' under a stable slug of the
-- form 'unresolved:<kebab-legacy-name>' (e.g. 'unresolved:clipper-set-illusion').
-- These rows have no freestyle_tricks row yet, so trick_slug carries NO foreign
-- key; only status='published' rows reach public trick pages. When the canonical
-- trick is later authored, remap the unresolved slug to the final slug.
CREATE TABLE freestyle_trick_tips (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  trick_slug          TEXT NOT NULL,                 -- canonical freestyle_tricks.slug (published) OR 'unresolved:<name>' (unresolved). No FK: unresolved slugs intentionally have no trick row.
  legacy_hint_id      INTEGER,                       -- movehints.HintID (provenance, dedupe key)
  legacy_move_id      INTEGER,                       -- movehints.MoveID (provenance)
  tip_text            TEXT NOT NULL,                 -- sanitized, normalized community advice
  created_at_legacy   INTEGER,                       -- movehints.HintCreated (unix seconds)
  modified_at_legacy  INTEGER,                       -- movehints.HintModified (unix seconds)
  display_order       INTEGER NOT NULL DEFAULT 0,    -- chronological by legacy creation
  status              TEXT NOT NULL DEFAULT 'published',  -- 'published' | 'unresolved' | 'hidden' (no CHECK)
  source              TEXT NOT NULL DEFAULT 'footbag_org_moves2',
  loaded_at           TEXT NOT NULL
);
CREATE INDEX idx_freestyle_trick_tips_trick
  ON freestyle_trick_tips(trick_slug, status, display_order);

-- Recovery alias candidates — operator-reviewed identity recovery workflow.
-- Populated from recovery signal analysis; operator marks approve/reject/defer.
-- Approved rows are exported to overrides/person_aliases.csv via pipeline script.
CREATE TABLE net_recovery_alias_candidate (
  id                    TEXT PRIMARY KEY,
  stub_name             TEXT NOT NULL,
  stub_person_id        TEXT NOT NULL,
  suggested_person_id   TEXT NOT NULL,
  suggested_person_name TEXT NOT NULL,
  suggestion_type       TEXT NOT NULL,     -- abbreviation | partner_cooccurrence | frequency
  confidence            TEXT NOT NULL,     -- high | medium | low
  appearance_count      INTEGER NOT NULL DEFAULT 0,
  operator_decision     TEXT,              -- approve | reject | defer
  operator_notes        TEXT,
  reviewed_by           TEXT,
  reviewed_at           TEXT,              -- ISO-8601 timestamp
  created_at            TEXT NOT NULL
);
CREATE INDEX idx_net_recovery_decision ON net_recovery_alias_candidate(operator_decision);

-- Team correction candidates — operator-reviewed anomaly fixes.
-- Populated from anomaly worklist; operator marks approve/reject/defer.
-- Approved rows are exported to inputs/team_corrections.csv via pipeline script.
CREATE TABLE net_team_correction_candidate (
  id                  TEXT PRIMARY KEY,
  event_key           TEXT NOT NULL,
  discipline_key      TEXT NOT NULL,
  placement           TEXT NOT NULL,
  original_display    TEXT NOT NULL,
  anomaly_type        TEXT NOT NULL,
  suggested_player_a  TEXT,
  suggested_player_b  TEXT,
  decision            TEXT,   -- approve | reject | defer
  decision_notes      TEXT,
  decided_by          TEXT,
  decided_at          TEXT,
  created_at          TEXT NOT NULL,
  UNIQUE(event_key, discipline_key, placement)
);
CREATE INDEX idx_net_tc_decision ON net_team_correction_candidate(decision);

-- =============================================================================
-- Symbolic-grammar observational layer.
-- Pipeline-loaded (DELETE+INSERT) from the committed symbolic-grammar CSVs by
-- freestyle/loaders/26_load_symbolic_grammar.py; symbolicGrammarService reads
-- these at runtime instead of the CSV files. All columns are TEXT (the service
-- treats every value as a string and parses numerics at read time).
-- =============================================================================
CREATE TABLE symbolic_equivalence_clusters (
  cluster_id                  TEXT PRIMARY KEY,
  cluster_label               TEXT,
  symbolic_normalization      TEXT,
  member_trick_slugs          TEXT,
  ifpa_decomposition_variance TEXT,
  add_range                   TEXT,
  anchor_topology_group       TEXT,
  notes                       TEXT,
  review_status               TEXT
);

CREATE TABLE symbolic_group_membership (
  trick_slug        TEXT,
  symbolic_group_id TEXT,
  membership_reason TEXT,
  confidence        TEXT,
  source            TEXT
);
CREATE INDEX idx_sgm_trick ON symbolic_group_membership(trick_slug);
CREATE INDEX idx_sgm_group ON symbolic_group_membership(symbolic_group_id);

CREATE TABLE symbolic_movement_archetypes (
  archetype_id          TEXT PRIMARY KEY,
  archetype_label       TEXT,
  uptime_pattern        TEXT,
  midtime_pattern       TEXT,
  downtime_pattern      TEXT,
  anchor_topology_group TEXT,
  anchor_modifier_groups TEXT,
  member_examples       TEXT,
  min_adds              TEXT,
  max_adds              TEXT,
  educational_value     TEXT,
  notes                 TEXT
);

CREATE TABLE symbolic_topology_groups (
  symbolic_group_id      TEXT PRIMARY KEY,
  display_name           TEXT,
  classification_axis    TEXT,
  description            TEXT,
  representative_examples TEXT,
  confidence_level       TEXT,
  source_basis           TEXT,
  review_status          TEXT
);

CREATE TABLE symbolic_modifier_groups (
  symbolic_group_id      TEXT PRIMARY KEY,
  display_name           TEXT,
  classification_axis    TEXT,
  description            TEXT,
  representative_examples TEXT,
  confidence_level       TEXT,
  source_basis           TEXT,
  review_status          TEXT
);

CREATE TABLE symbolic_glossary_crosslinks (
  crosslink_id     TEXT PRIMARY KEY,
  term_a           TEXT,
  term_b           TEXT,
  relationship     TEXT,
  cluster          TEXT,
  source           TEXT,
  notes            TEXT,
  educational_value TEXT
);

-- =============================================================================
-- END OF SCHEMA v0.1
-- =============================================================================
