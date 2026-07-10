import { SqliteDatabase, openDatabase } from './openDatabase';
import { config } from '../config/env';

/**
 * DATABASE MODULE
 *
 * This file owns:
 * - opening the single SQLite connection for application use at startup
 * - preparing the explicit statement groups needed by services
 * - exporting the shared transaction helper used by services
 * - providing the minimal database-readiness probe used as one readiness input
 *
 * This file does NOT own:
 * - HTTP/controller concerns
 * - request parsing or route validation
 * - business logic
 * - eventKey parsing or validation (belongs in services)
 * - result grouping or template/view shaping (belongs in services)
 * - archive page composition beyond returning flat rows
 * - readiness composition beyond the minimal DB probe
 * - backup/checkpoint orchestration
 * - a repository layer, ORM, or generic query-builder abstraction
 *
 * Currently supported route/use-case slice:
 * - GET /clubs
 * - GET /clubs/:countrySlug
 * - GET /clubs/club_:clubSlug
 * - GET /events
 * - GET /events/year/:year
 * - GET /events/:eventKey
 * - GET /freestyle
 * - GET /freestyle/about
 * - GET /freestyle/sets
 * - GET /freestyle/records
 * - GET /freestyle/leaders
 * - GET /freestyle/tricks/:slug
 * - GET /consecutive
 * - GET /history
 * - GET /history/:personId
 * - GET /members/:memberId
 * - GET /members/:memberId/edit + POST
 * - GET /health/live   (process-only; this file does not participate)
 * - GET /health/ready  (minimal DB-readiness input only)
 *
 * Architectural rules preserved here:
 * - Services call prepared statements exported by this module directly.
 * - There is no repository layer.
 * - There is no ORM.
 * - Event key parsing / validation belongs in services.
 * - Result grouping / display shaping belongs in services.
 * - Future expansion should add explicit statement groups rather than abstract
 *   frameworks or hidden data-access layers.
 */

const DB_FILENAME = config.dbPath;
const TRANSACTION_TIMEOUT_MS = 30_000;

import {
  PUBLIC_EVENT_DETAIL_VISIBLE_STATUSES,
  PUBLIC_UPCOMING_VISIBLE_STATUSES,
} from '../services/eventVisibility';
import { PUBLIC_FREESTYLE_RECORD_CONFIDENCES } from '../services/freestyleRecordVisibility';

const PUBLIC_EVENT_DETAIL_VISIBLE_STATUS_SQL = PUBLIC_EVENT_DETAIL_VISIBLE_STATUSES
  .map((status) => `'${status}'`)
  .join(', ');

const PUBLIC_UPCOMING_VISIBLE_STATUS_SQL = PUBLIC_UPCOMING_VISIBLE_STATUSES
  .map((status) => `'${status}'`)
  .join(', ');

const PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL = PUBLIC_FREESTYLE_RECORD_CONFIDENCES
  .map((c) => `'${c}'`)
  .join(', ');

const ARCHIVE_YEAR_SQL = `CAST(substr(e.start_date, 1, 4) AS INTEGER)`;

export interface PublicEventSummaryRow {
  event_id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  city: string;
  region: string | null;
  country: string;
  host_club: string | null;
  external_url: string | null;
  registration_deadline: string | null;
  capacity_limit: number | null;
  status: string;
  registration_status: string;
  published_at: string | null;
  hashtag_tag_id: string;
  tag_normalized: string;
  tag_display: string;
}

export interface PublicCompletedEventSummaryRow extends PublicEventSummaryRow {
  has_results: number;
}

export interface PublicArchiveYearRow {
  archive_year: number;
}

export interface PublicCompletedEventCountRow {
  completed_event_count: number;
}

export interface PublicEventDetailRow extends PublicEventSummaryRow {
  is_attendee_registration_open: number;
  is_tshirt_size_collected: number;
  sanction_status: string;
  payment_enabled: number;
  currency: string;
  competitor_fee_cents: number | null;
  attendee_fee_cents: number | null;
}

export interface PublicEventDisciplineRow {
  discipline_id: string;
  event_id: string;
  name: string;
  discipline_category: string;
  team_type: string;
  sort_order: number;
}

export interface PublicEventResultRow {
  event_id: string;
  result_entry_id: string;
  results_upload_id: string | null;
  discipline_id: string | null;
  discipline_name: string | null;
  discipline_category: string | null;
  team_type: string | null;
  discipline_sort_order: number | null;
  placement: number;
  score_text: string | null;
  participant_row_id: string;
  participant_order: number;
  member_id: string | null;
  participant_member_slug: string | null;
  participant_display_name: string;
  participant_historical_person_id: string | null;
}

export interface PublicPlayerRow {
  person_id: string;
  person_name: string;
  country: string | null;
  event_count: number | null;
  placement_count: number | null;
  bap_member: number;
  bap_nickname: string | null;
  bap_induction_year: number | null;
  hof_member: number;
  hof_induction_year: number | null;
}

export interface PublicPlayerResultRow {
  event_id: string;
  event_title: string;
  start_date: string;
  city: string;
  event_region: string | null;
  event_country: string;
  discipline_name: string | null;
  discipline_category: string | null;
  team_type: string | null;
  discipline_sort_order: number | null;
  placement: number;
  score_text: string | null;
  participant_order: number;
  participant_display_name: string;
  participant_person_id: string | null;
  participant_member_slug: string | null;
  event_tag_normalized: string;
}

export interface PlayerCareerStatRow {
  category:    string;
  events:      number;
  wins:        number;
  podiums:     number;
  appearances: number;
}

export interface PlayerPartnerRow {
  partner_person_id:   string;
  partner_name:        string;
  partner_country:     string | null;
  partner_member_slug: string | null;
  category:            string;
  appearances:         number;
  wins:                number;
  podiums:             number;
  first_year:          number | null;
  last_year:           number | null;
}

export interface HealthReadyRow {
  is_ready: number;
}

export interface PublicClubRow {
  club_id: string;
  name: string;
  description: string;
  city: string;
  region: string | null;
  country: string;
  external_url: string | null;
  status: 'active' | 'inactive';   // 'archived' is filtered out of clubs_open
  tag_normalized: string;
  tag_display: string;
}

export interface MemberCountRow {
  club_id: string;
  member_count: number;
}

export interface PublicClubMemberRow {
  person_id: string | null;
  person_name: string;
}

export const db: SqliteDatabase = openDatabase(DB_FILENAME);

// Idempotent additive column-ensure for databases built before alias_display
// existed. A fresh schema.sql already declares the column; an older on-disk DB
// gets it here on connection open, without a full rebuild. Additive and
// DEFAULT 1, so every existing alias row preserves its current (displayed)
// behavior. Guarded on presence so it is a no-op once the column exists and a
// no-op when the table is not yet created. alias_display gates public "Also
// called" display only; search and redirect ignore it.
function ensureAliasDisplayColumn(conn: SqliteDatabase): void {
  const cols = conn.prepare(`PRAGMA table_info(freestyle_trick_aliases)`).all() as { name: string }[];
  if (cols.length === 0) return;
  if (!cols.some(c => c.name === 'alias_display')) {
    conn.exec(`ALTER TABLE freestyle_trick_aliases ADD COLUMN alias_display INTEGER NOT NULL DEFAULT 1`);
  }
}
ensureAliasDisplayColumn(db);

// Graceful-shutdown hook: fold the WAL back into the main file and close the
// connection so the on-disk DB is consistent for the final host backup that
// runs after the container stops. Idempotent and best-effort; a failed
// checkpoint never blocks the close (the host backup script checkpoints again
// before its snapshot).
export function checkpointAndCloseDatabase(): void {
  if (!db.open) return;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // Swallow: a busy/locked checkpoint must not prevent a clean close.
  }
  db.close();
}

// Statement-group properties below are getters, not pre-compiled statements.
// Rule: db.prepare() is only ever called inside a getter or a function body,
// never at module top level. This decouples module load from schema readiness:
// importing this file against a not-yet-migrated database does not fail at
// import time. Each consumer call site (e.g. publicEvents.listUpcoming.all(...))
// reads the getter, which calls db.prepare(SQL) on demand and returns a
// Statement; the chained .all/.get/.run runs immediately. better-sqlite3's
// prepare is C-level and no statement is used in a hot loop. Validation that
// every SQL still parses against the current schema is covered by
// tests/unit/db-lazy-prepare.test.ts (test D).

export const publicEvents = {
  get listUpcoming() { return db.prepare(`
    SELECT
      e.id AS event_id,
      e.title,
      e.description,
      e.start_date,
      e.end_date,
      e.city,
      e.region,
      e.country,
      c.name AS host_club,
      e.external_url,
      e.registration_deadline,
      e.capacity_limit,
      e.status,
      e.registration_status,
      e.published_at,
      e.hashtag_tag_id,
      t.tag_normalized,
      t.tag_display
    FROM events AS e
    INNER JOIN tags AS t
      ON t.id = e.hashtag_tag_id
    LEFT JOIN clubs AS c
      ON c.id = e.host_club_id
    WHERE
      e.status IN (${PUBLIC_UPCOMING_VISIBLE_STATUS_SQL})
      AND e.start_date >= date(?)
      AND t.is_standard = 1
      AND t.standard_type = 'event'
    ORDER BY
      e.start_date ASC,
      e.end_date ASC,
      e.title COLLATE NOCASE ASC,
      e.id ASC
  `); },

  get listArchiveYears() { return db.prepare(`
    SELECT DISTINCT
      ${ARCHIVE_YEAR_SQL} AS archive_year
    FROM events AS e
    INNER JOIN tags AS t
      ON t.id = e.hashtag_tag_id
    WHERE
      e.status = 'completed'
      AND t.is_standard = 1
      AND t.standard_type = 'event'
    ORDER BY archive_year DESC
  `); },

  get countCompletedByYear() { return db.prepare(`
    SELECT
      COUNT(*) AS completed_event_count
    FROM events AS e
    INNER JOIN tags AS t
      ON t.id = e.hashtag_tag_id
    LEFT JOIN clubs AS c
      ON c.id = e.host_club_id
    WHERE
      e.status = 'completed'
      AND ${ARCHIVE_YEAR_SQL} = ?
      AND t.is_standard = 1
      AND t.standard_type = 'event'
  `); },

  get listCompletedByYear() { return db.prepare(`
    SELECT
      e.id AS event_id,
      e.title,
      e.description,
      e.start_date,
      e.end_date,
      e.city,
      e.region,
      e.country,
      c.name AS host_club,
      e.external_url,
      e.registration_deadline,
      e.capacity_limit,
      e.status,
      e.registration_status,
      e.published_at,
      e.hashtag_tag_id,
      t.tag_normalized,
      t.tag_display,
      EXISTS(
        SELECT 1
        FROM event_result_entries AS ere
        WHERE ere.event_id = e.id
        LIMIT 1
      ) AS has_results
    FROM events AS e
    INNER JOIN tags AS t
      ON t.id = e.hashtag_tag_id
    LEFT JOIN clubs AS c
      ON c.id = e.host_club_id
    WHERE
      e.status = 'completed'
      AND ${ARCHIVE_YEAR_SQL} = ?
      AND t.is_standard = 1
      AND t.standard_type = 'event'
    ORDER BY
      e.start_date ASC,
      e.end_date ASC,
      e.title COLLATE NOCASE ASC,
      e.id ASC
  `); },

  get getByStandardTag() { return db.prepare(`
    SELECT
      e.id AS event_id,
      e.title,
      e.description,
      e.start_date,
      e.end_date,
      e.city,
      e.region,
      e.country,
      c.name AS host_club,
      e.external_url,
      e.registration_deadline,
      e.capacity_limit,
      e.is_attendee_registration_open,
      e.is_tshirt_size_collected,
      e.status,
      e.registration_status,
      e.published_at,
      e.sanction_status,
      e.payment_enabled,
      e.currency,
      e.competitor_fee_cents,
      e.attendee_fee_cents,
      e.hashtag_tag_id,
      t.tag_normalized,
      t.tag_display
    FROM events AS e
    INNER JOIN tags AS t
      ON t.id = e.hashtag_tag_id
    LEFT JOIN clubs AS c
      ON c.id = e.host_club_id
    WHERE
      t.tag_normalized = ?
      AND t.is_standard = 1
      AND t.standard_type = 'event'
      AND e.status IN (${PUBLIC_EVENT_DETAIL_VISIBLE_STATUS_SQL})
  `); },

  get listDisciplinesByEventId() { return db.prepare(`
    SELECT
      ed.id AS discipline_id,
      ed.event_id,
      ed.name,
      ed.discipline_category,
      ed.team_type,
      ed.sort_order
    FROM events AS e
    INNER JOIN event_disciplines AS ed
      ON ed.event_id = e.id
    WHERE
      e.id = ?
      AND e.status IN (${PUBLIC_EVENT_DETAIL_VISIBLE_STATUS_SQL})
    ORDER BY
      ed.sort_order ASC,
      ed.name COLLATE NOCASE ASC,
      ed.id ASC
  `); },

  get listPublicResultRowsByEventId() { return db.prepare(`
    SELECT
      ere.event_id,
      ere.id AS result_entry_id,
      ere.results_upload_id,
      ere.discipline_id,
      ed.name AS discipline_name,
      ed.discipline_category,
      ed.team_type,
      ed.sort_order AS discipline_sort_order,
      ere.placement,
      ere.score_text,
      erp.id AS participant_row_id,
      erp.participant_order,
      erp.member_id,
      COALESCE(m_linked.slug, m_via_hp.slug) AS participant_member_slug,
      erp.display_name AS participant_display_name,
      erp.historical_person_id AS participant_historical_person_id
    FROM events AS e
    INNER JOIN event_result_entries AS ere
      ON ere.event_id = e.id
    LEFT JOIN event_disciplines AS ed
      ON ed.id = ere.discipline_id
    INNER JOIN event_result_entry_participants AS erp
      ON erp.result_entry_id = ere.id
    LEFT JOIN members AS m_linked
      ON m_linked.id = erp.member_id
      AND m_linked.deleted_at IS NULL
    LEFT JOIN members AS m_via_hp
      ON m_via_hp.historical_person_id = erp.historical_person_id
      AND m_via_hp.deleted_at IS NULL
    WHERE
      e.id = ?
      AND e.status IN (${PUBLIC_EVENT_DETAIL_VISIBLE_STATUS_SQL})
    ORDER BY
      CASE WHEN ere.discipline_id IS NULL THEN 0 ELSE 1 END ASC,
      COALESCE(ed.sort_order, 0) ASC,
      COALESCE(ed.name, '') COLLATE NOCASE ASC,
      ere.placement ASC,
      ere.id ASC,
      erp.participant_order ASC,
      erp.id ASC
  `); },
};

export interface HistoricalPersonSearchRow {
  person_id: string;
  person_name: string;
  country: string | null;
  hof_member: number;
  bap_member: number;
  linked_member_slug: string | null;
}

export const publicPlayers = {
  get searchByName() { return db.prepare(`
    SELECT
      hp.person_id,
      hp.person_name,
      hp.country,
      hp.hof_member,
      hp.bap_member,
      (SELECT m.slug
       FROM members_searchable AS m
       WHERE m.historical_person_id = hp.person_id
       LIMIT 1
      ) AS linked_member_slug
    FROM historical_persons AS hp
    WHERE hp.source_scope = 'CANONICAL'
      AND hp.person_name LIKE '%' || ? || '%' ESCAPE '\\'
    ORDER BY hp.person_name COLLATE NOCASE
    LIMIT ?
  `); },

  get getById() { return db.prepare(`
    SELECT
      hp.person_id,
      hp.person_name,
      hp.country,
      COUNT(DISTINCT ere.event_id)       AS event_count,
      COUNT(DISTINCT erp.result_entry_id) AS placement_count,
      hp.bap_member,
      hp.bap_nickname,
      hp.bap_induction_year,
      hp.hof_member,
      hp.hof_induction_year,
      hp.is_deceased
    FROM historical_persons AS hp
    LEFT JOIN event_result_entry_participants AS erp
      ON erp.historical_person_id = hp.person_id
    LEFT JOIN event_result_entries AS ere
      ON ere.id = erp.result_entry_id
    WHERE hp.person_id = ?
    GROUP BY
      hp.person_id, hp.person_name, hp.country,
      hp.bap_member, hp.bap_nickname, hp.bap_induction_year,
      hp.hof_member, hp.hof_induction_year, hp.is_deceased
  `); },

  get listResultsByPersonId() { return db.prepare(`
    SELECT
      e.id                        AS event_id,
      e.title                     AS event_title,
      e.start_date,
      e.city,
      e.region                    AS event_region,
      e.country                   AS event_country,
      t.tag_normalized            AS event_tag_normalized,
      ed.name                     AS discipline_name,
      ed.discipline_category,
      ed.team_type,
      ed.sort_order               AS discipline_sort_order,
      ere.placement,
      ere.score_text,
      erp_co.participant_order,
      erp_co.display_name         AS participant_display_name,
      erp_co.historical_person_id AS participant_person_id,
      COALESCE(m_co_linked.slug, m_co_via_hp.slug) AS participant_member_slug
    FROM event_result_entry_participants AS erp_me
    JOIN event_result_entries AS ere
      ON ere.id = erp_me.result_entry_id
    JOIN events AS e
      ON e.id = ere.event_id
    JOIN tags AS t
      ON t.id = e.hashtag_tag_id
    LEFT JOIN event_disciplines AS ed
      ON ed.id = ere.discipline_id
    JOIN event_result_entry_participants AS erp_co
      ON erp_co.result_entry_id = ere.id
    LEFT JOIN members AS m_co_linked
      ON m_co_linked.id = erp_co.member_id
      AND m_co_linked.deleted_at IS NULL
    LEFT JOIN members AS m_co_via_hp
      ON m_co_via_hp.historical_person_id = erp_co.historical_person_id
      AND m_co_via_hp.deleted_at IS NULL
    WHERE erp_me.historical_person_id = ?
    ORDER BY
      e.start_date DESC,
      COALESCE(ed.sort_order, 0) ASC,
      COALESCE(ed.name, '') COLLATE NOCASE ASC,
      ere.placement ASC,
      erp_co.participant_order ASC
  `); },
  get findLinkedMemberSlug() { return db.prepare(`
    SELECT m.slug, m.is_hof, m.is_bap
    FROM members AS m
    WHERE m.deleted_at IS NULL
      AND m.historical_person_id = ?
    LIMIT 1
  `); },

  get findLinkedPersonId() { return db.prepare(`
    SELECT erp.historical_person_id AS person_id
    FROM event_result_entry_participants AS erp
    WHERE erp.member_id = ?
      AND erp.historical_person_id IS NOT NULL
    LIMIT 1
  `); },

  get findLinkedPersonByLegacyId() { return db.prepare(`
    SELECT person_id
    FROM historical_persons
    WHERE legacy_member_id = ?
      AND source_scope = 'CANONICAL'
    LIMIT 1
  `); },

  /** Career stats by discipline category for a person. */
  get listCareerStatsByCategory() { return db.prepare(`
    SELECT
      ed.discipline_category AS category,
      COUNT(DISTINCT ere.event_id) AS events,
      SUM(CASE WHEN ere.placement = 1 AND erp.participant_order = 1 THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN ere.placement <= 3 AND erp.participant_order = 1 THEN 1 ELSE 0 END) AS podiums,
      COUNT(DISTINCT erp.result_entry_id) AS appearances
    FROM event_result_entry_participants erp
    JOIN event_result_entries ere ON ere.id = erp.result_entry_id
    JOIN event_disciplines ed ON ed.id = ere.discipline_id
    WHERE erp.historical_person_id = ?
    GROUP BY ed.discipline_category
    ORDER BY appearances DESC
  `); },

  /** Top partnerships (doubles) for a person across all disciplines. */
  get listTopPartnersByPersonId() { return db.prepare(`
    SELECT
      hp_partner.person_id   AS partner_person_id,
      hp_partner.person_name AS partner_name,
      hp_partner.country     AS partner_country,
      m_partner.slug         AS partner_member_slug,
      ed.discipline_category AS category,
      COUNT(DISTINCT erp_me.result_entry_id) AS appearances,
      SUM(CASE WHEN ere.placement = 1 THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN ere.placement <= 3 THEN 1 ELSE 0 END) AS podiums,
      MIN(CAST(SUBSTR(e.start_date, 1, 4) AS INTEGER)) AS first_year,
      MAX(CAST(SUBSTR(e.start_date, 1, 4) AS INTEGER)) AS last_year
    FROM event_result_entry_participants erp_me
    JOIN event_result_entries ere ON ere.id = erp_me.result_entry_id
    JOIN event_disciplines ed ON ed.id = ere.discipline_id
    JOIN events e ON e.id = ere.event_id
    JOIN event_result_entry_participants erp_partner
      ON erp_partner.result_entry_id = erp_me.result_entry_id
      AND erp_partner.id != erp_me.id
    JOIN historical_persons hp_partner ON hp_partner.person_id = erp_partner.historical_person_id
    LEFT JOIN members m_partner
      ON m_partner.historical_person_id = hp_partner.person_id
      AND m_partner.deleted_at IS NULL
    WHERE erp_me.historical_person_id = ?
      AND ed.team_type = 'doubles'
      AND hp_partner.person_name != 'Unknown'
    GROUP BY hp_partner.person_id, ed.discipline_category, m_partner.slug
    ORDER BY appearances DESC, wins DESC
    LIMIT 15
  `); },
};

export const clubs = {
  get findById() { return db.prepare(`
    SELECT id AS club_id, name, status FROM clubs WHERE id = ?
  `); },

  get findByIdWithHashtag() { return db.prepare(`
    SELECT c.id AS club_id, c.name, c.status, c.hashtag_tag_id,
           t.tag_normalized, t.tag_display
      FROM clubs c
      JOIN tags t ON t.id = c.hashtag_tag_id
     WHERE c.id = ?
  `); },

  get insertClub() { return db.prepare(`
    INSERT INTO clubs (
      id, created_at, created_by, updated_at, updated_by, version,
      name, description, city, region, country,
      hashtag_tag_id
    ) VALUES (?, ?, ?, ?, ?, 1,
              ?, ?, ?, ?, ?,
              ?)
  `); },

  get findByNameAndCountry() { return db.prepare(`
    SELECT c.id AS club_id, c.name, c.country,
           REPLACE(t.tag_normalized, '#', '') AS club_key
      FROM clubs AS c
      INNER JOIN tags AS t ON t.id = c.hashtag_tag_id
     WHERE c.name = ? COLLATE NOCASE AND c.country = ? COLLATE NOCASE
       AND c.status != 'archived'
     LIMIT 1
  `); },

  // Same-country club names for the create-club near-match warning. The
  // service compares normalized names in memory (the per-country set is
  // small), so this stays a flat read.
  get listNamesByCountryForDuplicateCheck() { return db.prepare(`
    SELECT c.name, c.city,
           REPLACE(t.tag_normalized, '#', '') AS club_key
      FROM clubs AS c
      INNER JOIN tags AS t ON t.id = c.hashtag_tag_id
     WHERE c.country = ? COLLATE NOCASE
       AND c.status != 'archived'
  `); },

  get updateStatus() { return db.prepare(`
    UPDATE clubs
       SET status = ?, updated_at = ?, updated_by = ?, version = version + 1
     WHERE id = ?
  `); },

  get listOpen() { return db.prepare(`
    SELECT
      c.id          AS club_id,
      c.name,
      c.description,
      c.city,
      c.region,
      c.country,
      -- A club URL renders publicly only once it has been verified at data-prep
      -- time (external_url_validated_at stamped) and not quarantined. The same
      -- hide-until-verified rule governs the gallery_external_links public read.
      CASE WHEN c.external_url_validated_at IS NOT NULL
            AND c.external_url_quarantine_reason IS NULL
           THEN c.external_url ELSE NULL END AS external_url,
      c.status,
      t.tag_normalized,
      t.tag_display
    FROM clubs_open AS c
    INNER JOIN tags AS t
      ON t.id = c.hashtag_tag_id
    WHERE
      t.is_standard = 1
      AND t.standard_type = 'club'
    ORDER BY
      c.country COLLATE NOCASE ASC,
      CASE WHEN c.region IS NULL OR c.region = '' THEN 1 ELSE 0 END ASC,
      c.region  COLLATE NOCASE ASC,
      c.city    COLLATE NOCASE ASC,
      c.name    COLLATE NOCASE ASC
  `); },

  // Active clubs only, for the public directory (index + country pages).
  // Inactive clubs are reachable by direct link via getByTagNormalized but do
  // not appear in the listings.
  get listActive() { return db.prepare(`
    SELECT
      c.id          AS club_id,
      c.name,
      c.description,
      c.city,
      c.region,
      c.country,
      CASE WHEN c.external_url_validated_at IS NOT NULL
            AND c.external_url_quarantine_reason IS NULL
           THEN c.external_url ELSE NULL END AS external_url,
      c.status,
      t.tag_normalized,
      t.tag_display
    FROM clubs_active AS c
    INNER JOIN tags AS t
      ON t.id = c.hashtag_tag_id
    WHERE
      t.is_standard = 1
      AND t.standard_type = 'club'
    ORDER BY
      c.country COLLATE NOCASE ASC,
      CASE WHEN c.region IS NULL OR c.region = '' THEN 1 ELSE 0 END ASC,
      c.region  COLLATE NOCASE ASC,
      c.city    COLLATE NOCASE ASC,
      c.name    COLLATE NOCASE ASC
  `); },

  get listOpenByCountry() { return db.prepare(`
    SELECT
      c.id          AS club_id,
      c.name,
      c.city,
      c.country,
      REPLACE(t.tag_normalized, '#', '') AS club_key
    FROM clubs_open AS c
    INNER JOIN tags AS t
      ON t.id = c.hashtag_tag_id
    WHERE c.country = ? COLLATE NOCASE
      AND t.is_standard = 1
      AND t.standard_type = 'club'
    ORDER BY c.name COLLATE NOCASE ASC
    LIMIT 10
  `); },

  // Per-country member count derived from legacy_person_club_affiliations.
  // Aggregates by legacy_club_candidates.country (not clubs.country) because
  // the candidate row owns the country attribution and the candidate→club
  // link (mapped_club_id) is only stamped for bootstrap-eligible candidates
  // in production. Counting via candidate country reflects the full mirror
  // participation surface regardless of which clubs have been promoted.
  // Zero-count countries are excluded — callers merge by country name.
  get listAffiliationCountsByCountry() { return db.prepare(`
    SELECT
      lcc.country         AS country,
      COUNT(lpca.id)      AS member_count
    FROM legacy_club_candidates AS lcc
    LEFT JOIN legacy_person_club_affiliations AS lpca
      ON lpca.legacy_club_candidate_id = lcc.id
    WHERE lcc.country IS NOT NULL AND lcc.country != ''
    GROUP BY lcc.country
    HAVING COUNT(lpca.id) > 0
  `); },

  get getByTagNormalized() { return db.prepare(`
    SELECT
      c.id          AS club_id,
      c.name,
      c.description,
      c.city,
      c.region,
      c.country,
      CASE WHEN c.external_url_validated_at IS NOT NULL
            AND c.external_url_quarantine_reason IS NULL
           THEN c.external_url ELSE NULL END AS external_url,
      c.status,
      t.tag_normalized,
      t.tag_display
    FROM clubs_open AS c
    INNER JOIN tags AS t
      ON t.id = c.hashtag_tag_id
    WHERE
      t.tag_normalized = ?
      AND t.is_standard = 1
      AND t.standard_type = 'club'
  `); },

  // Historical affiliations for a club's roster. Returns resolution_status so
  // the service can label 'pending' rows as unconfirmed-but-possible, never
  // laundered into current membership. A 'pending' row leaves the roster when
  // its member confirms or declines it in onboarding, or when an admin
  // de-lists club residue (which transitions it to 'former_only').
  // inferred_role lets the service also split out leaders and contacts.
  // member_slug joins through members_searchable so a confirmed affiliation
  // whose person has claimed a live, search-visible member account can link
  // to that member's profile; NULL for everyone else (the searchable view
  // keeps opted-out / unverified / purged profiles unlinkable).
  get listMembersByClubId() { return db.prepare(`
    SELECT
      lpca.historical_person_id AS person_id,
      COALESCE(hp.person_name, lpca.display_name) AS person_name,
      lpca.inferred_role AS inferred_role,
      lpca.resolution_status AS resolution_status,
      ms.slug AS member_slug,
      ms.gender AS member_gender,
      ms.show_gender AS member_show_gender,
      ms.city AS member_city,
      ms.country AS member_country,
      ms.is_hof AS member_is_hof,
      ms.is_bap AS member_is_bap,
      ms.is_board AS member_is_board,
      mtc.tier_status AS member_tier_status,
      mapc.is_active_player AS member_is_active_player
    FROM legacy_person_club_affiliations AS lpca
    INNER JOIN legacy_club_candidates AS lcc
      ON lcc.id = lpca.legacy_club_candidate_id
    LEFT JOIN historical_persons AS hp
      ON hp.person_id = lpca.historical_person_id
    LEFT JOIN members_searchable AS ms
      ON ms.historical_person_id = lpca.historical_person_id
    LEFT JOIN member_tier_current AS mtc
      ON mtc.member_id = ms.id
    LEFT JOIN member_active_player_current AS mapc
      ON mapc.member_id = ms.id
    WHERE
      lcc.mapped_club_id = ?
      AND lpca.resolution_status IN ('confirmed_current', 'promoted', 'pending')
    ORDER BY person_name ASC
  `); },

  // Bootstrap leaders for a club. LEFT JOINs historical_persons + legacy_members
  // so leaders without an HP row still surface (HP-less leaders fall back to
  // legacy_members.real_name; service-side COALESCE picks the displayName and
  // only sets personId when an HP row exists). Filters out 'superseded' and
  // 'rejected' leaders since they should not surface publicly. Sort: 'leader'
  // role before 'co-leader', alphabetical within role using the same COALESCE.
  get listBootstrapLeadersByClubId() { return db.prepare(`
    SELECT
      hp.person_id            AS person_id,
      hp.person_name          AS hp_person_name,
      lm.real_name            AS lm_real_name,
      lm.display_name         AS lm_display_name,
      cbl.role                AS role,
      cbl.status              AS status,
      cbl.imported_member_id  AS imported_member_id,
      cbl.claimed_member_id   AS claimed_member_id
    FROM club_bootstrap_leaders AS cbl
    LEFT JOIN historical_persons AS hp
      ON hp.legacy_member_id = cbl.legacy_member_id
    LEFT JOIN legacy_members AS lm
      ON lm.legacy_member_id = cbl.legacy_member_id
    WHERE
      cbl.club_id = ?
      AND cbl.status IN ('provisional', 'claimed')
    ORDER BY
      CASE cbl.role WHEN 'leader' THEN 0 ELSE 1 END,
      COALESCE(hp.person_name, NULLIF(lm.real_name, ''), NULLIF(lm.display_name, '')) COLLATE NOCASE
  `); },

  // Bulk variant for the country page leader summary. Returns one row per
  // (club, leader) pair, with club_id included for caller-side grouping.
  // Same LEFT JOIN + COALESCE shape as the per-club query.
  // Bounded set: total bootstrap leaders are O(80) today; if the table ever
  // exceeds ~1k rows this should grow a country-scoped join filter.
  // Bulk member-count query for the country page vitality signals + the
  // detail page club snapshot. Returns one row per (club_id, member_count)
  // for every open club that has at least one confirmed/promoted historical
  // affiliation. Counted scope mirrors listMembersByClubId so the count and
  // the auth-gated list agree. Clubs with zero matching affiliations are
  // simply absent from the result; service treats absence as count = 0.
  // Current: filters legacy affiliation status to mirror listMembersByClubId so the
  //          snapshot count and the auth-gated list agree during legacy coexistence.
  // Target: once legacy affiliation data is retired, count directly from members by
  //         mapped_club_id with no status filter.
  get listMemberCountsForAllClubs() { return db.prepare(`
    SELECT
      lcc.mapped_club_id AS club_id,
      COUNT(*)           AS member_count
    FROM legacy_person_club_affiliations AS lpca
    INNER JOIN legacy_club_candidates AS lcc
      ON lcc.id = lpca.legacy_club_candidate_id
    WHERE
      lpca.resolution_status IN ('confirmed_current', 'promoted', 'pending')
      AND lcc.mapped_club_id IS NOT NULL
    GROUP BY lcc.mapped_club_id
  `); },

  get listAllBootstrapLeaders() { return db.prepare(`
    SELECT
      cbl.club_id             AS club_id,
      hp.person_id            AS person_id,
      hp.person_name          AS hp_person_name,
      lm.real_name            AS lm_real_name,
      lm.display_name         AS lm_display_name,
      cbl.role                AS role,
      cbl.status              AS status,
      cbl.imported_member_id  AS imported_member_id,
      cbl.claimed_member_id   AS claimed_member_id
    FROM club_bootstrap_leaders AS cbl
    LEFT JOIN historical_persons AS hp
      ON hp.legacy_member_id = cbl.legacy_member_id
    LEFT JOIN legacy_members AS lm
      ON lm.legacy_member_id = cbl.legacy_member_id
    WHERE
      cbl.status IN ('provisional', 'claimed')
    ORDER BY
      cbl.club_id,
      CASE cbl.role WHEN 'leader' THEN 0 ELSE 1 END,
      COALESCE(hp.person_name, NULLIF(lm.real_name, ''), NULLIF(lm.display_name, '')) COLLATE NOCASE
  `); },

};

// ---------------------------------------------------------------------------
// legacyClubCandidates -- candidate-row reads scoped to the wizard's
// affiliation-confirm path. Public/QC reads for legacy_club_candidates live
// in the `clubs` group above.
// ---------------------------------------------------------------------------

export interface LegacyClubCandidateRow {
  id: string;
  legacy_club_key: string;
  display_name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  description: string | null;
  external_url: string | null;
  classification: 'pre_populate' | 'onboarding_visible' | 'dormant' | 'junk';
  mapped_club_id: string | null;
}

export const legacyClubCandidates = {
  get findById() { return db.prepare(`
    SELECT id, legacy_club_key, display_name, city, region, country,
           description, external_url, classification, mapped_club_id
      FROM legacy_club_candidates
     WHERE id = ?
  `); },

  // Candidates an admin can promote to a live clubs row. Junk is never
  // promotable; pre_populate rows are stamped by the pipeline at cutover,
  // so an unmapped candidate here is exactly the onboarding_visible /
  // dormant residue the cleanup queue offers a promote action for. A
  // non-NULL lifecycle_state is a terminal admin decision, so those rows
  // leave the queue for good.
  get listPromotableForQueue() { return db.prepare(`
    SELECT id, display_name, city, region, country, classification, created_at
      FROM legacy_club_candidates
     WHERE classification IN ('onboarding_visible', 'dormant')
       AND mapped_club_id IS NULL
       AND lifecycle_state IS NULL
     ORDER BY country COLLATE NOCASE ASC, display_name COLLATE NOCASE ASC
  `); },

  // Records a promotion. The mapped_club_id IS NULL guard makes the loser
  // of a concurrent promotion a zero-row no-op instead of an overwrite.
  get setMappedClubId() { return db.prepare(`
    UPDATE legacy_club_candidates
       SET mapped_club_id = ?, updated_at = ?, updated_by = ?, version = version + 1
     WHERE id = ? AND mapped_club_id IS NULL
  `); },

  // Junk-flagged candidates awaiting an admin verdict (confirm junk or
  // return to dormant for further evaluation). A confirmed row leaves the
  // queue via its lifecycle_state, never by deletion.
  get listJunkForQueue() { return db.prepare(`
    SELECT id, display_name, city, region, country, created_at
      FROM legacy_club_candidates
     WHERE classification = 'junk'
       AND mapped_club_id IS NULL
       AND lifecycle_state IS NULL
     ORDER BY country COLLATE NOCASE ASC, display_name COLLATE NOCASE ASC
  `); },

  // Candidate cleanup writes. Every guard re-checks the state the action
  // assumes, so a concurrent admin's earlier action turns this into a
  // zero-row no-op instead of a double transition.
  get demoteToDormant() { return db.prepare(`
    UPDATE legacy_club_candidates
       SET classification = 'dormant', updated_at = ?, updated_by = ?, version = version + 1
     WHERE id = ? AND classification = 'onboarding_visible'
       AND mapped_club_id IS NULL AND lifecycle_state IS NULL
  `); },

  get junkToDormant() { return db.prepare(`
    UPDATE legacy_club_candidates
       SET classification = 'dormant', updated_at = ?, updated_by = ?, version = version + 1
     WHERE id = ? AND classification = 'junk' AND lifecycle_state IS NULL
  `); },

  get archiveCandidate() { return db.prepare(`
    UPDATE legacy_club_candidates
       SET lifecycle_state = 'archived', updated_at = ?, updated_by = ?, version = version + 1
     WHERE id = ? AND classification IN ('onboarding_visible', 'dormant')
       AND mapped_club_id IS NULL AND lifecycle_state IS NULL
  `); },

  get confirmJunkCandidate() { return db.prepare(`
    UPDATE legacy_club_candidates
       SET lifecycle_state = 'junk_confirmed', updated_at = ?, updated_by = ?, version = version + 1
     WHERE id = ? AND classification = 'junk' AND lifecycle_state IS NULL
  `); },

  // Create-club duplicate check: same-country candidates the member could
  // be duplicating. Junk-classified rows never surface; mapped candidates
  // are already live clubs, which the clubs-table check covers.
  get listDuplicateCheckCandidatesByCountry() { return db.prepare(`
    SELECT display_name, city, region, country, classification
      FROM legacy_club_candidates
     WHERE country = ? COLLATE NOCASE
       AND classification IN ('onboarding_visible', 'dormant')
       AND mapped_club_id IS NULL
  `); },

  get findByMappedClubId() { return db.prepare(`
    SELECT id, classification, r1, r2, r3, r4
      FROM legacy_club_candidates
     WHERE mapped_club_id = ?
     LIMIT 1
  `); },

};

// ---------------------------------------------------------------------------
// legacyPersonClubAffiliations -- pending-affiliation reads + status
// transitions invoked by the wizard's club_affiliations membership path.
// Schema CHECK (lpca lines 3401-3404) enforces that 'confirmed_current'
// requires resolved_club_id IS NOT NULL; setResolutionStatusConfirmed stamps
// both atomically.
// ---------------------------------------------------------------------------

export interface LegacyPersonClubAffiliationRow {
  id: string;
  historical_person_id: string | null;
  legacy_member_id: string | null;
  legacy_club_candidate_id: string;
  inferred_role: 'member' | 'contact' | 'leader' | 'co-leader';
  confidence_score: number | null;
  resolution_status:
    | 'pending' | 'confirmed_current' | 'former_only' | 'not_mine'
    | 'needs_review' | 'promoted' | 'rejected' | 'superseded';
  resolved_club_id: string | null;
  display_name: string | null;
}

export interface WizardMembershipCardRow {
  candidate_id: string;
  affiliation_id: string;
  club_id: string | null;
  club_name: string;
  club_city: string;
  confidence_score: number | null;
  club_description: string | null;
  club_external_url: string | null;
}

export const legacyPersonClubAffiliations = {
  get findById() { return db.prepare(`
    SELECT id, historical_person_id, legacy_member_id, legacy_club_candidate_id,
           inferred_role, confidence_score, resolution_status, resolved_club_id,
           display_name
      FROM legacy_person_club_affiliations
     WHERE id = ?
  `); },

  // Pending affiliations for a legacy member, joined to the candidate row to
  // surface club metadata for the wizard card. Candidates without a
  // mapped_club_id surface from their own candidate fields; a member
  // confirmation promotes the candidate to a live clubs row before the
  // affiliation transition. The candidate's unvalidated external_url is
  // never surfaced (URL validation runs at promotion). Junk-classified
  // candidates never surface as wizard cards, mirroring the promotion-path
  // guard.
  get listPendingForLegacyMember() { return db.prepare(`
    SELECT
      lcc.id              AS candidate_id,
      lpca.id             AS affiliation_id,
      lcc.mapped_club_id  AS club_id,
      COALESCE(c.name, lcc.display_name)       AS club_name,
      COALESCE(c.city, lcc.city)               AS club_city,
      lpca.confidence_score AS confidence_score,
      COALESCE(c.description, lcc.description) AS club_description,
      c.external_url      AS club_external_url
      FROM legacy_person_club_affiliations AS lpca
      INNER JOIN legacy_club_candidates AS lcc
         ON lcc.id = lpca.legacy_club_candidate_id
      LEFT JOIN clubs AS c
         ON c.id = lcc.mapped_club_id
     WHERE lpca.legacy_member_id  = ?
       AND lpca.resolution_status = 'pending'
       AND lcc.classification != 'junk'
     ORDER BY COALESCE(c.city, lcc.city) COLLATE NOCASE ASC,
              COALESCE(c.name, lcc.display_name) COLLATE NOCASE ASC
  `); },

  // Any-status count of suggestions the wizard could ever have asked about:
  // distinguishes a member whose membership cards were all resolved (wrap-up
  // guidance renders) from one who never had any. Junk-candidate rows never
  // surface as cards, so they do not count as material.
  get countByLegacyMember() { return db.prepare(`
    SELECT COUNT(*) AS c
      FROM legacy_person_club_affiliations AS lpca
      INNER JOIN legacy_club_candidates AS lcc
         ON lcc.id = lpca.legacy_club_candidate_id
     WHERE lpca.legacy_member_id = ?
       AND lcc.classification != 'junk'
  `); },

  // Pending -> rejected transition for the 'decline' wizard branch. Guarded
  // by status='pending' so a concurrent transition (admin override, replay)
  // is a no-op rather than an overwrite.
  get setResolutionStatusRejected() { return db.prepare(`
    UPDATE legacy_person_club_affiliations
       SET resolution_status = 'rejected',
           updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by        = ?,
           version           = version + 1
     WHERE id                = ?
       AND resolution_status = 'pending'
  `); },

  // Pending -> confirmed_current transition for the 'confirm' / 'correct'
  // wizard branch. Stamps resolved_club_id in the same UPDATE so the schema
  // CHECK constraint (confirmed_current requires resolved_club_id) holds at
  // all times. Guarded by status='pending'.
  get setResolutionStatusConfirmed() { return db.prepare(`
    UPDATE legacy_person_club_affiliations
       SET resolution_status = 'confirmed_current',
           resolved_club_id  = ?,
           updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by        = ?,
           version           = version + 1
     WHERE id                = ?
       AND resolution_status = 'pending'
  `); },

  // Per-club summary of unconfirmed legacy residue: live clubs that still have
  // 'pending' affiliations. Returns the pending count and the oldest import
  // timestamp (MIN created_at) so the admin can see how long residue has sat
  // before de-listing it. Includes active clubs (the viability queue
  // deliberately never flags those); clubs with zero pending rows are absent.
  get listUnconfirmedResidueByClub() { return db.prepare(`
    SELECT
      lcc.mapped_club_id   AS club_id,
      c.name               AS club_name,
      c.city               AS club_city,
      c.region             AS club_region,
      c.country            AS club_country,
      c.status             AS club_status,
      COUNT(*)             AS pending_count,
      MIN(lpca.created_at) AS oldest_pending_at
    FROM legacy_person_club_affiliations AS lpca
    INNER JOIN legacy_club_candidates AS lcc
      ON lcc.id = lpca.legacy_club_candidate_id
    INNER JOIN clubs AS c
      ON c.id = lcc.mapped_club_id
    WHERE lpca.resolution_status = 'pending'
      AND lcc.mapped_club_id IS NOT NULL
    GROUP BY lcc.mapped_club_id, c.name, c.city, c.region, c.country, c.status
    ORDER BY oldest_pending_at ASC
  `); },

  // Candidate promotion carry-forward: when a candidate becomes a live club,
  // its imported 'pending' affiliations transition to 'promoted' with the new
  // club id stamped, so they render on the club roster without each member
  // walking the wizard. Guarded by resolution_status='pending' so rows a
  // member already resolved (confirmed, rejected, former-only) keep their
  // member-given answer.
  get setAllPromotedByCandidate() { return db.prepare(`
    UPDATE legacy_person_club_affiliations
       SET resolution_status = 'promoted',
           resolved_club_id  = ?,
           updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by        = ?,
           version           = version + 1
     WHERE legacy_club_candidate_id = ?
       AND resolution_status = 'pending'
  `); },

  // Promotion triggered by a member confirming their own affiliation card:
  // every other pending suggestion on the candidate carries forward to
  // 'promoted', while the confirming member's own row stays 'pending' so the
  // confirm transition that follows records the member's answer.
  get setAllPromotedByCandidateExcept() { return db.prepare(`
    UPDATE legacy_person_club_affiliations
       SET resolution_status = 'promoted',
           resolved_club_id  = ?,
           updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by        = ?,
           version           = version + 1
     WHERE legacy_club_candidate_id = ?
       AND resolution_status = 'pending'
       AND id != ?
  `); },

  // Admin de-list: terminalize a live club's unconfirmed residue. Flips every
  // 'pending' affiliation mapped to the club to 'former_only' (preserves the
  // historical fact while dropping the row from the current-roster filter).
  // Guarded by resolution_status='pending' so confirmed/declined rows are
  // never touched and the action is safe to re-run. Stamps updated_by /
  // updated_at / version per affected row for the audit trail; .run().changes
  // gives the number of rows de-listed.
  get delistResidueByClub() { return db.prepare(`
    UPDATE legacy_person_club_affiliations
       SET resolution_status = 'former_only',
           updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by        = ?,
           version           = version + 1
     WHERE resolution_status = 'pending'
       AND legacy_club_candidate_id IN (
         SELECT id FROM legacy_club_candidates WHERE mapped_club_id = ?
       )
  `); },
};

// ---------------------------------------------------------------------------
// clubBootstrapLeaders -- bootstrap leader status reads + transitions.
//
// Owned by MemberOnboardingService + ClubService. The 'rejected' and
// 'claimed' transitions fire from the wizard's club_affiliations branch.
// ---------------------------------------------------------------------------

export interface ClubBootstrapLeaderRow {
  id: string;
  club_id: string;
  legacy_member_id: string;
  role: 'leader' | 'co-leader';
  status: 'provisional' | 'claimed' | 'superseded' | 'rejected';
  imported_member_id: string | null;
  claimed_member_id: string | null;
  confidence_score: number | null;
  notes: string | null;
}

export interface WizardLeadershipCardRow {
  candidate_id: string;
  club_id: string;
  club_name: string;
  role: 'leader' | 'co-leader';
  club_description: string | null;
  club_external_url: string | null;
}

export const clubBootstrapLeaders = {
  get findById() { return db.prepare(`
    SELECT id, club_id, legacy_member_id, role, status,
           imported_member_id, claimed_member_id, confidence_score, notes
    FROM club_bootstrap_leaders
    WHERE id = ?
  `); },

  // Set status='rejected'. Used by the wizard's 'decline' branch.
  // Does not write claimed_member_id; the row remains eligible for other
  // activation paths (member-acceptance, admin appointment).
  get setStatusRejected() { return db.prepare(`
    UPDATE club_bootstrap_leaders
       SET status      = 'rejected',
           updated_at  = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by  = ?,
           version     = version + 1
     WHERE id = ?
       AND status = 'provisional'
  `); },

  // Set status='claimed', stamp claimed_member_id and claim_confirmed_at.
  // Used by the wizard's 'strong + confirm' branch.
  get setStatusClaimed() { return db.prepare(`
    UPDATE club_bootstrap_leaders
       SET status              = 'claimed',
           claimed_member_id   = ?,
           claim_confirmed_at  = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_at          = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by          = ?,
           version             = version + 1
     WHERE id = ?
       AND status = 'provisional'
  `); },

  // Provisional leadership candidates for a legacy member, joined to the
  // club to surface club metadata for the wizard card. Only 'provisional'
  // rows surface; claimed/rejected/superseded are filtered. Sorted by
  // club name to align with the membership-card ordering.
  get listProvisionalForLegacyMember() { return db.prepare(`
    SELECT
      cbl.id    AS candidate_id,
      cbl.club_id,
      c.name          AS club_name,
      cbl.role,
      c.description   AS club_description,
      c.external_url  AS club_external_url
      FROM club_bootstrap_leaders AS cbl
      INNER JOIN clubs AS c
         ON c.id = cbl.club_id
     WHERE cbl.legacy_member_id = ?
       AND cbl.status           = 'provisional'
     ORDER BY c.name COLLATE NOCASE ASC
  `); },

  // Any-status count: distinguishes a member whose leadership suggestions
  // were all resolved (wrap-up guidance renders) from one who never had any.
  get countByLegacyMember() { return db.prepare(`
    SELECT COUNT(*) AS c FROM club_bootstrap_leaders WHERE legacy_member_id = ?
  `); },
};

// ---------------------------------------------------------------------------
// clubBootstrapLeaderSignals -- per-signal evidence reads for the wizard
// classification path. Pre-computed by the legacy_data pipeline (script 05).
// ---------------------------------------------------------------------------

export interface ClubBootstrapLeaderSignalRow {
  signal_type: string;
  is_present: 0 | 1;
  signal_payload_json: string;
  source: string;
}

export const clubBootstrapLeaderSignals = {
  get listByBootstrapLeaderId() { return db.prepare(`
    SELECT signal_type, is_present, signal_payload_json, source
      FROM club_bootstrap_leader_signals
     WHERE bootstrap_leader_id = ?
  `); },
};

// ---------------------------------------------------------------------------
// clubLeaders + memberClubAffiliations -- writes invoked by
// ClubService.claimLeadership and ClubService.confirmAffiliation. Schema
// uniques enforce:
//   - club_leaders ux_one_club_leader_per_member (a member co-leads at most
//     one club), ux_club_leaders (a member appears at most once per club)
//   - member_club_affiliations UNIQUE(member_id, club_id),
//     ux_member_club_affiliations_one_primary (at most one primary)
//     Two-current-club cap: service-enforced (count-before-insert, max 2)
// SqliteError SQLITE_CONSTRAINT_UNIQUE on either is the conflict signal.
// ---------------------------------------------------------------------------

// Club content-validation loop rows: member-proposed description and
// external-URL replacements awaiting leader/contact/admin review.
export const clubContent = {
  get findClubContentForEdit() { return db.prepare(`
    SELECT id, description, external_url,
           external_url_validated_at, external_url_quarantine_reason
    FROM clubs WHERE id = ?
  `); },

  get updateClubDescription() { return db.prepare(`
    UPDATE clubs SET description = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  // URL must already be validated + normalized by externalUrlValidator at
  // the service boundary; this statement does no validation of its own.
  get updateClubExternalUrl() { return db.prepare(`
    UPDATE clubs SET external_url = ?, external_url_validated_at = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },
};

export const clubLeaders = {
  get insertClubLeader() { return db.prepare(`
    INSERT INTO club_leaders (
      id, created_at, created_by, updated_at, updated_by, version,
      club_id, member_id, role, added_at
    ) VALUES (?, ?, ?, ?, ?, 1,
              ?, ?, ?, ?)
  `); },

  // Total co-leader headcount for a club. Used by the volunteer/claim paths to
  // enforce the application-level 5-max cap.
  get countByClubId() { return db.prepare(`
    SELECT COUNT(*) AS c FROM club_leaders WHERE club_id = ?
  `); },

  // Does this member already co-lead any club? A member co-leads at most one
  // club (ux_one_club_leader_per_member), so this gates a second co-leadership.
  get memberCoLeadsAnyClub() { return db.prepare(`
    SELECT 1 AS x FROM club_leaders WHERE member_id = ? LIMIT 1
  `); },

  // Admin leadership remediation lookups.
  get findClubForAdminLeadership() { return db.prepare(`
    SELECT id, name, status FROM clubs WHERE id = ?
  `); },

  // A club is reachable through its co-leaders' member-visible contact emails;
  // a club with zero co-leaders has no platform-surfaced contact, so the single
  // "could use a leader" opportunity list keys solely off the absence of any
  // club_leaders row.
  get listClubsNeedingLeader() { return db.prepare(`
    SELECT c.id, c.name, c.city, c.country
    FROM clubs c
    WHERE c.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM club_leaders l WHERE l.club_id = c.id)
    ORDER BY c.name
  `); },

  get listLeadersWithNames() { return db.prepare(`
    SELECT l.member_id, l.role, l.added_at, m.display_name, m.slug
    FROM club_leaders l
    JOIN members m ON m.id = l.member_id
    WHERE l.club_id = ?
    ORDER BY l.role, m.display_name
  `); },

  // Current (claimed/assigned) leadership for the public club page. Carries
  // login_email because leader contact is member-visible by role: the page
  // shows it to authenticated viewers only.
  get listCurrentLeadersForClubPage() { return db.prepare(`
    SELECT l.member_id, l.role, m.display_name, m.login_email
    FROM club_leaders l
    JOIN members_active m ON m.id = l.member_id
    WHERE l.club_id = ?
    ORDER BY m.display_name COLLATE NOCASE
  `); },

  get listAffiliatedMembersForAdmin() { return db.prepare(`
    SELECT a.member_id, m.display_name, m.slug,
           EXISTS (SELECT 1 FROM club_leaders l WHERE l.club_id = a.club_id AND l.member_id = a.member_id) AS is_leader
    FROM member_club_affiliations a
    JOIN members_active m ON m.id = a.member_id
    WHERE a.club_id = ? AND a.is_current = 1
    ORDER BY m.display_name
  `); },

  // Current members of a club with contact email, for the admin "contact
  // members" action that invites them to volunteer to co-lead a leaderless club.
  get listCurrentMemberContactsForClub() { return db.prepare(`
    SELECT m.id, m.display_name, m.login_email
    FROM member_club_affiliations a
    JOIN members_active m ON m.id = a.member_id
    WHERE a.club_id = ? AND a.is_current = 1
    ORDER BY m.display_name COLLATE NOCASE
  `); },

  get findLeaderRow() { return db.prepare(`
    SELECT id, role FROM club_leaders WHERE club_id = ? AND member_id = ?
  `); },

  get deleteLeaderRow() { return db.prepare(`
    DELETE FROM club_leaders WHERE club_id = ? AND member_id = ?
  `); },

  // Resolving leadership for a bootstrapped club supersedes its remaining
  // provisional candidates.
  get supersedeProvisionalForClub() { return db.prepare(`
    UPDATE club_bootstrap_leaders
    SET status = 'superseded', updated_at = ?, updated_by = ?, version = version + 1
    WHERE club_id = ? AND status = 'provisional'
  `); },

  get findMemberByKeyForAdmin() { return db.prepare(`
    SELECT id, display_name, slug FROM members_active WHERE slug = ? OR id = ?
  `); },

  get findCurrentAffiliation() { return db.prepare(`
    SELECT id, is_current FROM member_club_affiliations WHERE member_id = ? AND club_id = ?
  `); },

  get insertAdminAffiliation() { return db.prepare(`
    INSERT INTO member_club_affiliations
      (id, created_at, created_by, updated_at, updated_by, member_id, club_id, is_current, is_primary, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 'admin')
  `); },

  get reactivateAffiliation() { return db.prepare(`
    UPDATE member_club_affiliations SET is_current = 1, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  get endAffiliation() { return db.prepare(`
    UPDATE member_club_affiliations SET is_current = 0, is_primary = 0, updated_at = ?, updated_by = ?, version = version + 1
    WHERE member_id = ? AND club_id = ? AND is_current = 1
  `); },

  get leaderClubNameForMember() { return db.prepare(`
    SELECT c.name AS club_name
      FROM club_leaders AS cl
      INNER JOIN clubs AS c ON c.id = cl.club_id
     WHERE cl.member_id = ?
     LIMIT 1
  `); },

  // Is this member already in this club's leadership (any role)? Idempotency probe.
  get memberInClubLeadership() { return db.prepare(`
    SELECT id, role FROM club_leaders WHERE club_id = ? AND member_id = ?
  `); },

  get removeByMemberAndClub() { return db.prepare(`
    DELETE FROM club_leaders WHERE member_id = ? AND club_id = ?
  `); },
};

export const memberClubAffiliations = {
  get insertAffiliation() { return db.prepare(`
    INSERT INTO member_club_affiliations (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, club_id, is_current, is_primary, is_contact, source
    ) VALUES (?, ?, ?, ?, ?, 1,
              ?, ?, 1, ?, 0, ?)
  `); },

  get countCurrentByMemberId() { return db.prepare(`
    SELECT COUNT(*) AS c
      FROM member_club_affiliations
     WHERE member_id = ? AND is_current = 1
  `); },

  get countCurrentByClubId() { return db.prepare(`
    SELECT COUNT(*) AS c
      FROM member_club_affiliations
     WHERE club_id = ? AND is_current = 1
  `); },

  get listCurrentWithClubName() { return db.prepare(`
    SELECT mca.id, mca.club_id, c.name AS club_name,
           REPLACE(t.tag_normalized, '#', '') AS club_key,
           c.status AS club_status, mca.is_primary
      FROM member_club_affiliations AS mca
      INNER JOIN clubs AS c ON c.id = mca.club_id
      INNER JOIN tags AS t ON t.id = c.hashtag_tag_id
     WHERE mca.member_id = ? AND mca.is_current = 1
     ORDER BY mca.is_primary DESC
  `); },

  get deactivate() { return db.prepare(`
    UPDATE member_club_affiliations
       SET is_current = 0, is_primary = 0,
           updated_at = ?, updated_by = ?, version = version + 1
     WHERE member_id = ? AND club_id = ? AND is_current = 1
  `); },

  // Rejoin after leave: the table-level UNIQUE(member_id, club_id) keeps
  // one row per pair for life, so a re-join reactivates the deactivated
  // row instead of inserting a new one.
  get reactivate() { return db.prepare(`
    UPDATE member_club_affiliations
       SET is_current = 1, is_primary = ?, source = 'member_self_service',
           updated_at = ?, updated_by = ?, version = version + 1
     WHERE member_id = ? AND club_id = ? AND is_current = 0
  `); },

  get swapPrimary() { return db.prepare(`
    UPDATE member_club_affiliations
       SET is_primary = CASE WHEN is_primary = 1 THEN 0 ELSE 1 END,
           updated_at = ?, updated_by = ?, version = version + 1
     WHERE member_id = ? AND is_current = 1
  `); },

  get findCurrentByMemberAndClub() { return db.prepare(`
    SELECT id, is_primary, version
      FROM member_club_affiliations
     WHERE member_id = ? AND club_id = ? AND is_current = 1
  `); },
};

export const memberLinks = {
  get listByMember() { return db.prepare(`
    SELECT id, label, url, validated_at, sort_order
      FROM member_links
     WHERE member_id = ?
     ORDER BY sort_order, created_at
  `); },

  get insert() { return db.prepare(`
    INSERT INTO member_links (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, label, url, validated_at, sort_order
    ) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'member',
              strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'member', 1,
              ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?)
  `); },

  get deleteAllForMember() { return db.prepare(`
    DELETE FROM member_links WHERE member_id = ?
  `); },
};

export const clubViabilitySignals = {
  get insertSignal() { return db.prepare(`
    INSERT INTO club_viability_signals (
      id, created_at, created_by,
      member_id, club_id, source_stage, activity_signal,
      source_entity_type, source_entity_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `); },

  // Counts feeding the G1-G4 viability gates. Signals are collected only
  // in the onboarding wizard; rows from the retired club-page poll channel
  // are excluded defensively. Counting is one vote per member: a member's
  // latest signal for the club wins, so duplicate rows from form re-posts
  // or changed answers never inflate the thresholds.
  get countWizardByClub() { return db.prepare(`
    WITH latest AS (
      SELECT member_id, activity_signal,
             ROW_NUMBER() OVER (
               PARTITION BY member_id
               ORDER BY created_at DESC, id DESC
             ) AS rn
      FROM club_viability_signals
      WHERE club_id = ? AND source_stage != 'club_detail'
    )
    SELECT
      SUM(CASE WHEN activity_signal = 'active' THEN 1 ELSE 0 END)          AS active_count,
      SUM(CASE WHEN activity_signal = 'not_active' THEN 1 ELSE 0 END)      AS not_active_count,
      SUM(CASE WHEN activity_signal = 'never_heard_of_it' THEN 1 ELSE 0 END) AS never_heard_count,
      SUM(CASE WHEN activity_signal = 'not_sure' THEN 1 ELSE 0 END)        AS not_sure_count,
      COUNT(*) AS total_count
    FROM latest
    WHERE rn = 1
  `); },

  get listClubsWithWizardSignals() { return db.prepare(`
    WITH latest AS (
      SELECT club_id, member_id, activity_signal,
             ROW_NUMBER() OVER (
               PARTITION BY club_id, member_id
               ORDER BY created_at DESC, id DESC
             ) AS rn
      FROM club_viability_signals
      WHERE source_stage != 'club_detail'
    )
    SELECT
      l.club_id,
      c.name          AS club_name,
      c.city          AS club_city,
      c.region        AS club_region,
      c.country       AS club_country,
      c.status        AS club_status,
      c.updated_at    AS club_updated_at,
      SUM(CASE WHEN l.activity_signal = 'active' THEN 1 ELSE 0 END)          AS active_count,
      SUM(CASE WHEN l.activity_signal = 'not_active' THEN 1 ELSE 0 END)      AS not_active_count,
      SUM(CASE WHEN l.activity_signal = 'never_heard_of_it' THEN 1 ELSE 0 END) AS never_heard_count,
      SUM(CASE WHEN l.activity_signal = 'not_sure' THEN 1 ELSE 0 END)        AS not_sure_count,
      COUNT(*) AS total_count
    FROM latest AS l
    INNER JOIN clubs AS c ON c.id = l.club_id
    WHERE l.rn = 1
    GROUP BY l.club_id
    ORDER BY not_active_count DESC, never_heard_count DESC
  `); },

  // Negative reporters for one club, one vote per member (latest signal
  // wins). Admin-queue use only: signal authorship is never exposed outside
  // admin surfaces. Negative reports are rare, so the queue item carries
  // the names inline.
  get listNegativeWizardReportersByClub() { return db.prepare(`
    WITH latest AS (
      SELECT member_id, activity_signal,
             ROW_NUMBER() OVER (
               PARTITION BY member_id
               ORDER BY created_at DESC, id DESC
             ) AS rn
      FROM club_viability_signals
      WHERE club_id = ? AND source_stage != 'club_detail'
    )
    SELECT m.display_name, l.activity_signal
    FROM latest AS l
    INNER JOIN members AS m ON m.id = l.member_id
    WHERE l.rn = 1 AND l.activity_signal IN ('not_active', 'never_heard_of_it')
    ORDER BY l.activity_signal, m.display_name COLLATE NOCASE
  `); },

  // Candidate-keyed rows: activity answers about club candidates that have
  // no live clubs row yet (club_id is NULL; the candidate id lives in
  // source_entity_id). These rows are invisible to the club gates above,
  // which filter on club_id. Counting mirrors the gates: one vote per
  // member, latest signal wins.
  get countCandidateFlags() { return db.prepare(`
    WITH latest AS (
      SELECT member_id, activity_signal,
             ROW_NUMBER() OVER (
               PARTITION BY member_id
               ORDER BY created_at DESC, id DESC
             ) AS rn
      FROM club_viability_signals
      WHERE club_id IS NULL
        AND source_entity_type = 'legacy_club_candidate'
        AND source_entity_id = ?
    )
    SELECT
      SUM(CASE WHEN activity_signal = 'active' THEN 1 ELSE 0 END)          AS active_count,
      SUM(CASE WHEN activity_signal = 'not_active' THEN 1 ELSE 0 END)      AS not_active_count,
      SUM(CASE WHEN activity_signal = 'never_heard_of_it' THEN 1 ELSE 0 END) AS never_heard_count,
      SUM(CASE WHEN activity_signal = 'not_sure' THEN 1 ELSE 0 END)        AS not_sure_count,
      COUNT(*) AS total_count
    FROM latest
    WHERE rn = 1
  `); },

  // Unpromoted, non-terminal candidates that carry wizard activity flags,
  // with per-candidate signal counts (one vote per member, latest wins).
  // Promoted candidates are excluded here AND their flag rows are stamped
  // with the club id at promotion time, so a vote never surfaces on both
  // the candidate-flag group and the club gates. Candidates whose only
  // latest votes are "not sure" stay hidden: not-sure records no activity
  // evidence, so there is nothing for an admin to judge.
  get listCandidatesWithFlags() { return db.prepare(`
    WITH latest AS (
      SELECT source_entity_id AS candidate_id, member_id, activity_signal,
             created_at,
             ROW_NUMBER() OVER (
               PARTITION BY source_entity_id, member_id
               ORDER BY created_at DESC, id DESC
             ) AS rn
      FROM club_viability_signals
      WHERE club_id IS NULL
        AND source_entity_type = 'legacy_club_candidate'
    )
    SELECT
      l.candidate_id,
      lcc.display_name,
      lcc.city,
      lcc.region,
      lcc.country,
      lcc.classification,
      MIN(l.created_at) AS oldest_flag_at,
      SUM(CASE WHEN l.activity_signal = 'active' THEN 1 ELSE 0 END)          AS active_count,
      SUM(CASE WHEN l.activity_signal = 'not_active' THEN 1 ELSE 0 END)      AS not_active_count,
      SUM(CASE WHEN l.activity_signal = 'never_heard_of_it' THEN 1 ELSE 0 END) AS never_heard_count,
      SUM(CASE WHEN l.activity_signal = 'not_sure' THEN 1 ELSE 0 END)        AS not_sure_count,
      COUNT(*) AS total_count
    FROM latest AS l
    INNER JOIN legacy_club_candidates AS lcc ON lcc.id = l.candidate_id
    WHERE l.rn = 1
      AND lcc.mapped_club_id IS NULL
      AND lcc.lifecycle_state IS NULL
    GROUP BY l.candidate_id
    HAVING SUM(CASE WHEN l.activity_signal != 'not_sure' THEN 1 ELSE 0 END) > 0
    ORDER BY not_active_count DESC, never_heard_count DESC
  `); },

  // Negative reporters for one candidate's flags, one vote per member
  // (latest signal wins). Admin-queue use only: signal authorship is never
  // exposed outside admin surfaces.
  get listNegativeCandidateReporters() { return db.prepare(`
    WITH latest AS (
      SELECT member_id, activity_signal,
             ROW_NUMBER() OVER (
               PARTITION BY member_id
               ORDER BY created_at DESC, id DESC
             ) AS rn
      FROM club_viability_signals
      WHERE club_id IS NULL
        AND source_entity_type = 'legacy_club_candidate'
        AND source_entity_id = ?
    )
    SELECT m.display_name, l.activity_signal
    FROM latest AS l
    INNER JOIN members AS m ON m.id = l.member_id
    WHERE l.rn = 1 AND l.activity_signal IN ('not_active', 'never_heard_of_it')
    ORDER BY l.activity_signal, m.display_name COLLATE NOCASE
  `); },

  // Promotion carry-forward: stamp the new live club id onto the
  // candidate's flag rows so those votes start feeding the club gates and
  // stop surfacing on the candidate-flag group. One-time stamp; the table
  // is otherwise append-only.
  get stampClubIdForCandidateFlags() { return db.prepare(`
    UPDATE club_viability_signals
       SET club_id = ?
     WHERE club_id IS NULL
       AND source_entity_type = 'legacy_club_candidate'
       AND source_entity_id = ?
  `); },

};

// ---------------------------------------------------------------------------
// Freestyle records, public read path
//
// Public filter contract (enforced here, not in service layer):
//   confidence IN (${PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL})
//   AND superseded_by IS NULL
//   AND (person_id IS NOT NULL OR display_name IS NOT NULL)
//
// Holder name: canonical person_name when person_id resolves; otherwise
// freestyle_records.display_name (raw player name from source CSV).
// ---------------------------------------------------------------------------
export interface FreestyleRecordRow {
  id: string;
  record_type: string;
  person_id: string | null;
  holder_name: string;
  holder_member_slug: string | null;
  trick_name: string | null;
  sort_name: string | null;
  adds_count: number | null;
  value_numeric: number;
  achieved_date: string | null;
  date_precision: string;
  confidence: string;
  video_url: string | null;
  video_timecode: string | null;
  notes: string | null;
  superseded_by?: string | null;
}

export const freestyleRecords = {
  get listPublic() { return db.prepare(`
    SELECT
      fr.id,
      fr.record_type,
      fr.person_id,
      COALESCE(hp.person_name, fr.display_name) AS holder_name,
      m.slug AS holder_member_slug,
      fr.trick_name,
      fr.sort_name,
      fr.adds_count,
      fr.value_numeric,
      fr.achieved_date,
      fr.date_precision,
      fr.confidence,
      fr.video_url,
      fr.video_timecode,
      fr.notes
    FROM freestyle_records AS fr
    LEFT JOIN historical_persons AS hp
      ON hp.person_id = fr.person_id
    LEFT JOIN members AS m
      ON m.historical_person_id = fr.person_id
      AND m.deleted_at IS NULL
    WHERE fr.confidence IN (${PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL})
      AND fr.superseded_by IS NULL
      AND (fr.person_id IS NOT NULL OR fr.display_name IS NOT NULL)
    ORDER BY fr.record_type ASC, fr.value_numeric DESC
  `); },

  get countPublicByType() { return db.prepare(`
    SELECT record_type, COUNT(*) AS n
    FROM freestyle_records
    WHERE confidence IN (${PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL})
      AND superseded_by IS NULL
      AND (person_id IS NOT NULL OR display_name IS NOT NULL)
    GROUP BY record_type
    ORDER BY record_type ASC
  `); },

  get listByPersonId() { return db.prepare(`
    SELECT
      fr.id,
      fr.record_type,
      fr.person_id,
      COALESCE(hp.person_name, fr.display_name) AS holder_name,
      m.slug AS holder_member_slug,
      fr.trick_name,
      fr.sort_name,
      fr.adds_count,
      fr.value_numeric,
      fr.achieved_date,
      fr.date_precision,
      fr.confidence,
      fr.video_url,
      fr.video_timecode,
      fr.notes
    FROM freestyle_records AS fr
    LEFT JOIN historical_persons AS hp
      ON hp.person_id = fr.person_id
    LEFT JOIN members AS m
      ON m.historical_person_id = fr.person_id
      AND m.deleted_at IS NULL
    WHERE fr.person_id = ?
      AND fr.confidence IN (${PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL})
      AND fr.superseded_by IS NULL
      AND (fr.person_id IS NOT NULL OR fr.display_name IS NOT NULL)
    ORDER BY fr.value_numeric DESC
  `); },

  get listLeaders() { return db.prepare(`
    SELECT
      fr.person_id,
      COALESCE(hp.person_name, fr.display_name) AS holder_name,
      MAX(m.slug)                                AS holder_member_slug,
      COUNT(*)                                   AS record_count,
      MAX(fr.value_numeric)                      AS top_value,
      MAX(CASE WHEN fr.value_numeric = (
            SELECT MAX(fr2.value_numeric)
            FROM freestyle_records fr2
            WHERE (fr2.person_id = fr.person_id OR (fr2.person_id IS NULL AND fr2.display_name = fr.display_name))
              AND fr2.confidence IN (${PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL})
              AND fr2.superseded_by IS NULL
          ) THEN fr.trick_name END)              AS top_trick
    FROM freestyle_records AS fr
    LEFT JOIN historical_persons AS hp
      ON hp.person_id = fr.person_id
    LEFT JOIN members AS m
      ON m.historical_person_id = fr.person_id
      AND m.deleted_at IS NULL
    WHERE fr.confidence IN (${PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL})
      AND fr.superseded_by IS NULL
      AND (fr.person_id IS NOT NULL OR fr.display_name IS NOT NULL)
    GROUP BY fr.person_id, fr.display_name
    ORDER BY record_count DESC, holder_name ASC
  `); },

  get listByTrickName() { return db.prepare(`
    SELECT
      fr.id,
      fr.record_type,
      fr.person_id,
      COALESCE(hp.person_name, fr.display_name) AS holder_name,
      m.slug AS holder_member_slug,
      fr.trick_name,
      fr.sort_name,
      fr.adds_count,
      fr.value_numeric,
      fr.achieved_date,
      fr.date_precision,
      fr.confidence,
      fr.video_url,
      fr.video_timecode,
      fr.notes
    FROM freestyle_records AS fr
    LEFT JOIN historical_persons AS hp
      ON hp.person_id = fr.person_id
    LEFT JOIN members AS m
      ON m.historical_person_id = fr.person_id
      AND m.deleted_at IS NULL
    WHERE fr.trick_name = ?
      AND fr.confidence IN (${PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL})
      AND fr.superseded_by IS NULL
      AND (fr.person_id IS NOT NULL OR fr.display_name IS NOT NULL)
    ORDER BY fr.value_numeric DESC
  `); },

  get listAllByTrickName() { return db.prepare(`
    SELECT
      fr.id,
      fr.record_type,
      fr.person_id,
      COALESCE(hp.person_name, fr.display_name) AS holder_name,
      m.slug AS holder_member_slug,
      fr.trick_name,
      fr.sort_name,
      fr.adds_count,
      fr.value_numeric,
      fr.achieved_date,
      fr.date_precision,
      fr.confidence,
      fr.video_url,
      fr.video_timecode,
      fr.notes,
      fr.superseded_by
    FROM freestyle_records AS fr
    LEFT JOIN historical_persons AS hp
      ON hp.person_id = fr.person_id
    LEFT JOIN members AS m
      ON m.historical_person_id = fr.person_id
      AND m.deleted_at IS NULL
    WHERE fr.trick_name = ?
      AND fr.confidence IN (${PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL})
      AND (fr.person_id IS NOT NULL OR fr.display_name IS NOT NULL)
    ORDER BY fr.value_numeric DESC
  `); },

  get listRecentPublic() { return db.prepare(`
    SELECT
      fr.id,
      fr.record_type,
      fr.person_id,
      COALESCE(hp.person_name, fr.display_name) AS holder_name,
      m.slug AS holder_member_slug,
      fr.trick_name,
      fr.sort_name,
      fr.adds_count,
      fr.value_numeric,
      fr.achieved_date,
      fr.date_precision,
      fr.confidence,
      fr.video_url,
      fr.video_timecode,
      fr.notes
    FROM freestyle_records AS fr
    LEFT JOIN historical_persons AS hp
      ON hp.person_id = fr.person_id
    LEFT JOIN members AS m
      ON m.historical_person_id = fr.person_id
      AND m.deleted_at IS NULL
    WHERE fr.confidence IN (${PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL})
      AND fr.superseded_by IS NULL
      AND fr.achieved_date IS NOT NULL
      AND (fr.person_id IS NOT NULL OR fr.display_name IS NOT NULL)
    ORDER BY fr.achieved_date DESC
    LIMIT 5
  `); },

  // Admin curation browse: every record regardless of confidence or superseded
  // state (an admin curates provisional, disputed, and retired rows the public
  // page hides), with the resolved holder name. Status-agnostic by design.
  get listForCuration() { return db.prepare(`
    SELECT
      fr.id,
      fr.record_type,
      COALESCE(hp.person_name, fr.display_name) AS holder_name,
      fr.trick_name,
      fr.value_numeric,
      fr.confidence,
      fr.superseded_by
    FROM freestyle_records AS fr
    LEFT JOIN historical_persons AS hp ON hp.person_id = fr.person_id
    ORDER BY fr.record_type ASC, fr.value_numeric DESC
  `); },

  // Admin curation edit page: the raw editable columns for one record, regardless
  // of confidence or superseded state.
  get getForCurationById() { return db.prepare(`
    SELECT id, record_type, person_id, display_name, trick_name, sort_name,
           adds_count, value_numeric, value_text, achieved_date, date_precision,
           source, confidence, video_url, video_timecode, notes, superseded_by
    FROM freestyle_records
    WHERE id = ?
  `); },

  // The record types actually present in the data. The admin edit form constrains
  // the record type to these (adding a new type is an add-new / design concern).
  get listDistinctRecordTypes() { return db.prepare(`
    SELECT DISTINCT record_type FROM freestyle_records
    WHERE record_type IS NOT NULL AND record_type <> ''
    ORDER BY record_type
  `); },

  // Admin curation scalar edit: update the editable columns of one record (id is
  // the identity key and stays fixed). Stamps updated_at.
  get updateForCuration() { return db.prepare(`
    UPDATE freestyle_records
    SET record_type = ?, person_id = ?, display_name = ?, trick_name = ?,
        sort_name = ?, adds_count = ?, value_numeric = ?, value_text = ?,
        achieved_date = ?, date_precision = ?, source = ?, confidence = ?,
        video_url = ?, video_timecode = ?, notes = ?, superseded_by = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `); },

  // Admin curation add: insert one new record. The service generates the id and
  // validates the same fields as an edit; created_at and updated_at are stamped.
  get insertForCuration() { return db.prepare(`
    INSERT INTO freestyle_records
      (id, record_type, person_id, display_name, trick_name, sort_name, adds_count,
       value_numeric, value_text, achieved_date, date_precision, source, confidence,
       video_url, video_timecode, notes, superseded_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `); },
};

// Historical-person existence and name lookup, used by freestyle-record curation
// to validate a linked person id and resolve its name for the audit trail.
export const historicalPersonLookup = {
  get personNameById() { return db.prepare(`
    SELECT person_name FROM historical_persons WHERE person_id = ?
  `); },
};

export interface FreestyleLeaderRow {
  person_id: string | null;
  holder_name: string;
  holder_member_slug: string | null;
  record_count: number;
  top_value: number;
  top_trick: string | null;
}

// ---------------------------------------------------------------------------
// freestyleTricks
//
// Canonical trick dictionary loaded by script 17 from tricks.csv (73 tricks).
// Slug = lowercase-hyphenated canonical name. aliases_json is a JSON array.
// trick_family: for compound/dex tricks = slug of base trick; for base tricks =
//   own slug; for modifiers = NULL.
// ---------------------------------------------------------------------------
export interface FreestyleTrickRow {
  slug:                 string;
  canonical_name:       string;
  adds:                 string | null;
  base_trick:           string | null;
  trick_family:         string | null;
  category:             string | null;
  description:          string | null;
  aliases_json:         string | null;
  notation:             string | null;
  // operational_notation lifted onto the base row type so getLandingPage and
  // getGlossaryPage can surface the atom-layer and compound-layer notation on
  // the core-tricks grid and the foundational tricks grid. Nullable; most rows
  // still have no operational notation populated.
  operational_notation: string | null;
  sort_order:           number;
}

// Extension of FreestyleTrickRow that also carries the parser notation-grammar
// columns plus the operational-notation column. Returned only by `getBySlug`
// (heavy parse JSON not loaded on grids; operational_notation is light but
// only the trick-detail page needs it). All seven extra fields are nullable.
export interface FreestyleTrickRowWithParse extends FreestyleTrickRow {
  jobs_notation_raw:           string | null;
  jobs_notation_normalized:    string | null;
  structural_parse_json:       string | null;
  computed_add_formula:        string | null;
  computed_adds:               number | null;
  add_formula_status:          string | null;
  operational_notation:        string | null;
  operational_notation_source: string | null;
  // Editorial prose columns.
  short_description:           string | null;
  execution_summary:           string | null;
  learning_notes:              string | null;
  prerequisite_notes:          string | null;
  pronunciation:               string | null;
}

// Extension of FreestyleTrickRow returned by listAllWithPending; carries the
// activity / review-status flags that drive the external-placeholder branch
// in the index view.
export interface FreestyleTrickRowWithStatus extends FreestyleTrickRow {
  is_active:     number;
  review_status: string;
  // operational_notation surfaced on the dictionary list so the By ADD view
  // can render role-tagged tokens via shapeOperationalNotationDisplay.
  // Nullable; many rows have no operational notation populated yet.
  operational_notation:        string | null;
  operational_notation_source: string | null;
}

export interface FreestyleTrickAliasRow {
  alias_text: string;
  trick_slug: string;
}

export interface FreestyleTrickModifierRow {
  slug:                 string;
  modifier_name:        string;
  add_bonus:            number;
  add_bonus_rotational: number;
  modifier_type:        string;
  notes:                string | null;
}

// Flat row from freestyleTrickModifiers.listTricksByModifier — one row per
// (modifier, trick) pair. Service groups by modifier_slug and joins each
// trick_slug back to the full FreestyleTrickRow loaded elsewhere.
export interface FreestyleTrickModifierLinkRow {
  modifier_slug:        string;
  modifier_name:        string;
  modifier_type:        string;
  add_bonus:            number;
  add_bonus_rotational: number;
  trick_slug:           string;
}

// Detailed row for the inverse direction — modifier-link rows for ONE trick,
// joined to the modifier table so a single fetch carries the modifier weight,
// type, and notes alongside the per-link apply order. Drives the editorial-
// decomposition view-model in the notation-grammar diagnostic surface.
export interface FreestyleTrickModifierLinkDetailRow {
  modifier_slug:        string;
  modifier_name:        string;
  modifier_type:        string;
  add_bonus:            number;
  add_bonus_rotational: number;
  modifier_notes:       string | null;
  apply_order:          number;
}

// Bare (trick, modifier, order) triple for the whole active dictionary, with no
// join to the modifier table. The structural-neighbors layer reconstructs each
// trick's operator multiset from these triples (a repeated modifier at distinct
// apply_order is repeated structure, e.g. double-spinning = spinning twice), so
// it needs every link in one fetch, ordered so multiplicity is preserved.
export interface FreestyleModifierLinkPairRow {
  trick_slug:    string;
  modifier_slug: string;
  apply_order:   number;
}

export const freestyleTricks = {
  get listAll() { return db.prepare(`
    SELECT slug, canonical_name, adds, base_trick, trick_family, category,
           description, aliases_json, notation, operational_notation, sort_order
    FROM freestyle_tricks
    WHERE is_active = 1
    ORDER BY sort_order ASC
  `); },

  // Same shape as listAll but includes pending/external rows (is_active = 0,
  // review_status = 'pending'). Used by the trick-dictionary index to render
  // external-only placeholders alongside canonical tricks. Active rows come
  // first, then pending ones, both sorted by sort_order within their group.
  get listAllWithPending() { return db.prepare(`
    SELECT slug, canonical_name, adds, base_trick, trick_family, category,
           description, aliases_json, notation, sort_order, is_active,
           review_status, operational_notation, operational_notation_source
    FROM freestyle_tricks
    WHERE is_active = 1
       OR (is_active = 0 AND review_status = 'pending')
    ORDER BY is_active DESC, sort_order ASC
  `); },

  // External / unadjudicated placeholders only (is_active = 0,
  // review_status = 'pending'), excluding modifier-category rows. These are kept
  // out of the canonical dictionary browse and surfaced on the Emerging
  // Vocabulary page instead.
  get listExternalPending() { return db.prepare(`
    SELECT slug, canonical_name, adds, base_trick, trick_family, category
    FROM freestyle_tricks
    WHERE is_active = 0 AND review_status = 'pending'
      AND category <> 'modifier'
    ORDER BY trick_family ASC, canonical_name ASC
  `); },

  get getBySlug() { return db.prepare(`
    SELECT slug, canonical_name, adds, base_trick, trick_family, category,
           description, aliases_json, notation, sort_order,
           jobs_notation_raw, jobs_notation_normalized,
           structural_parse_json, computed_add_formula,
           computed_adds, add_formula_status,
           operational_notation, operational_notation_source,
           short_description, execution_summary, learning_notes,
           prerequisite_notes, pronunciation
    FROM freestyle_tricks
    WHERE slug = ? AND is_active = 1
  `); },

  get listByFamily() { return db.prepare(`
    SELECT slug, canonical_name, adds, base_trick, trick_family, category,
           description, aliases_json, notation, sort_order
    FROM freestyle_tricks
    WHERE trick_family = ? AND is_active = 1
    ORDER BY sort_order ASC
  `); },

  // TT Series view needs to distinguish "trick exists but pending" from
  // "trick not in dictionary at all". listAll / getBySlug filter is_active=1
  // so pending rows are invisible to them; this getter exposes the row
  // including is_active so the TT view can render PENDING vs MISSING.
  get getAnyStatusBySlug() { return db.prepare(`
    SELECT slug, canonical_name, is_active
    FROM freestyle_tricks
    WHERE slug = ?
  `); },

  // Category for a slug regardless of is_active, so the trick-detail route can
  // redirect modifier / operator rows to their operator page before rendering.
  get categoryBySlug() { return db.prepare(`
    SELECT category FROM freestyle_tricks WHERE slug = ?
  `); },

  // Admin curation browse: every row regardless of is_active or review_status,
  // because an admin curates inactive and pending rows the public dictionary
  // hides. Status-agnostic by design (admin-only surface); search and status
  // filters are applied above db.ts in freestyleCurationService.
  get listForCuration() { return db.prepare(`
    SELECT slug, canonical_name, adds, trick_family, is_active, review_status
    FROM freestyle_tricks
    ORDER BY is_active DESC, canonical_name ASC
  `); },

  // Admin curation edit page: the editable scalar fields for one trick regardless
  // of status (admin edits inactive and pending rows too). Status-agnostic by
  // design (admin-only). `notation` is the movement (Jobs) notation and
  // `operational_notation` is the execution notation.
  get getForCurationBySlug() { return db.prepare(`
    SELECT slug, canonical_name, adds, notation, operational_notation,
           trick_family, base_trick, category, is_active, review_status
    FROM freestyle_tricks
    WHERE slug = ?
  `); },

  // The category values actually present in the data. The admin edit form offers
  // these plus a "none" option; the scalar-edit validation accepts them (the set
  // is broad and has no CHECK, so it is read from the data, not hardcoded).
  get listDistinctCategories() { return db.prepare(`
    SELECT DISTINCT category FROM freestyle_tricks
    WHERE category IS NOT NULL AND category <> ''
    ORDER BY category
  `); },

  // Admin curation scalar edit: update only the nine editable scalar fields of
  // one trick (slug is the identity key and stays fixed). Stamps updated_at.
  // Attached aliases, sources, and modifier links are untouched here.
  get updateScalars() { return db.prepare(`
    UPDATE freestyle_tricks
    SET canonical_name = ?, adds = ?, notation = ?, operational_notation = ?,
        trick_family = ?, base_trick = ?, category = ?, is_active = ?,
        review_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE slug = ?
  `); },
};

export interface FreestyleTrickSearchRow {
  slug: string;
  canonical_name: string;
  adds: string | null;
  category: string | null;
  aliases_json: string | null;
  matched_alias: string | null;
}

// Alias-aware substring search over active tricks. A trick matches on its
// canonical name, its slug (hyphens read as spaces so "double leg" finds
// double-leg-over), or any of its alias texts. Name/slug matches rank ahead of
// alias-only matches; the caller dedupes by slug (keeping the higher-ranked
// row) and trims to its display limit.
export function searchFreestyleTricksByText(query: string, limit: number): FreestyleTrickSearchRow[] {
  const escaped = query.replace(/[%_\\]/g, c => '\\' + c);
  const like = `%${escaped}%`;
  return db.prepare(`
    SELECT slug, canonical_name, adds, category, aliases_json,
           NULL AS matched_alias, sort_order, 0 AS match_rank
      FROM freestyle_tricks
     WHERE is_active = 1
       AND (category IS NULL OR category NOT IN ('modifier', 'operator'))
       AND (canonical_name LIKE ? ESCAPE '\\' OR REPLACE(slug, '-', ' ') LIKE ? ESCAPE '\\')
    UNION ALL
    SELECT t.slug, t.canonical_name, t.adds, t.category, t.aliases_json,
           a.alias_text AS matched_alias, t.sort_order, 1 AS match_rank
      FROM freestyle_trick_aliases a
      JOIN freestyle_tricks t ON t.slug = a.trick_slug AND t.is_active = 1
     WHERE (t.category IS NULL OR t.category NOT IN ('modifier', 'operator'))
       AND a.alias_text LIKE ? ESCAPE '\\'
     ORDER BY match_rank ASC, sort_order ASC
     LIMIT ?
  `).all(like, like, like, limit) as FreestyleTrickSearchRow[];
}

export const freestyleTrickAliases = {
  // alias_slug -> canonical trick_slug (single row or undefined). Used by the
  // TT Series view to resolve sidecar tags whose first non-meta tag is an
  // alias rather than a canonical slug (e.g., 'neck-catch' -> 'neck-stall').
  get getCanonicalForAlias() { return db.prepare(`
    SELECT a.trick_slug FROM freestyle_trick_aliases a
    JOIN freestyle_tricks t ON t.slug = a.trick_slug AND t.is_active = 1
    WHERE a.alias_slug = ?
  `); },

  // Count of nicknames public search can resolve: every alias whose target
  // trick is active. Search ignores the display gate but resolves only to an
  // active target, so this is the public-searchable nickname count surfaced in
  // the dictionary summary. It is a different population from the observational
  // alias-archive (documented names that fold to a trick) and from the display
  // set (alias_display = 1, the "Also called" line).
  get countSearchable() { return db.prepare(`
    SELECT COUNT(*) AS n
    FROM freestyle_trick_aliases a
    JOIN freestyle_tricks t ON t.slug = a.trick_slug AND t.is_active = 1
  `); },

  // All aliases for all tricks. Used by the index page to attach alias text
  // to each row in a single round trip; service groups by trick_slug.
  get listAll() { return db.prepare(`
    SELECT alias_text, trick_slug
    FROM freestyle_trick_aliases
    WHERE alias_display = 1
    ORDER BY trick_slug, alias_text COLLATE NOCASE
  `); },

  // The alias slugs for one canonical trick. Used to fold records whose
  // trick_name is spelled as an alias onto the canonical trick page.
  get getAliasSlugsForTrick() { return db.prepare(`
    SELECT alias_slug FROM freestyle_trick_aliases WHERE trick_slug = ?
  `); },

  // Display alias texts for one canonical trick, from the canonical alias table.
  // The trick-detail "Also known as" line reads these so it resolves aliases
  // identically to the browse listing (which reads the same table), instead of
  // the deprecated aliases_json column that drifts out of sync.
  get getAliasTextsForTrick() { return db.prepare(`
    SELECT alias_text FROM freestyle_trick_aliases WHERE trick_slug = ? AND alias_display = 1
    ORDER BY alias_text COLLATE NOCASE
  `); },

  // alias_slug -> canonical trick_slug for every alias, in one round trip. Lets
  // the browse-row media-coverage build fold a record whose trick_name slugifies
  // to an alias onto the canonical trick the rows are keyed by.
  get listAllAliasSlugs() { return db.prepare(`
    SELECT alias_slug, trick_slug FROM freestyle_trick_aliases
  `); },

  // Admin curation edit page: a trick's aliases with their slug, display text,
  // and type, for listing and per-row deletion.
  get listForCuration() { return db.prepare(`
    SELECT alias_slug, alias_text, alias_type
    FROM freestyle_trick_aliases
    WHERE trick_slug = ?
    ORDER BY alias_text COLLATE NOCASE
  `); },

  // One alias row by its slug (the global primary key). Used by the admin curation
  // service to detect a slug collision before an insert and to capture the row's
  // text and type for the deletion audit entry before it is removed.
  get getByAliasSlug() { return db.prepare(`
    SELECT alias_slug, alias_text, alias_type, trick_slug
    FROM freestyle_trick_aliases
    WHERE alias_slug = ?
  `); },

  // Admin curation: add one alias row for a trick. source_id and notes stay NULL
  // in this surface (the minimal alias row); alias_slug is the global primary key,
  // so the service checks for collisions before inserting. Stamps created_at.
  get insert() { return db.prepare(`
    INSERT INTO freestyle_trick_aliases
      (alias_slug, alias_text, trick_slug, alias_type, source_id, notes, created_at)
    VALUES (?, ?, ?, ?, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `); },

  // Admin curation: remove one alias, scoped to its trick so an edit page can
  // never delete another trick's alias by slug alone.
  get deleteForTrick() { return db.prepare(`
    DELETE FROM freestyle_trick_aliases WHERE alias_slug = ? AND trick_slug = ?
  `); },
};

// The source registry (a small shared set of provenance sources). The admin
// curation attach form offers these; this surface does not create new ones.
export const freestyleTrickSources = {
  get listAll() { return db.prepare(`
    SELECT id, source_label FROM freestyle_trick_sources
    ORDER BY source_label COLLATE NOCASE
  `); },
};

// Trick-to-source links, joined to the source registry. The admin curation edit
// page lists a trick's sources (with each link's assertions) and attaches or
// detaches links to the existing registry sources.
export const freestyleTrickSourceLinks = {
  get listForCuration() { return db.prepare(`
    SELECT l.source_id, s.source_label, s.source_type, s.source_url,
           l.external_url, l.asserted_adds
    FROM freestyle_trick_source_links l
    INNER JOIN freestyle_trick_sources s ON s.id = l.source_id
    WHERE l.trick_slug = ?
    ORDER BY s.source_label COLLATE NOCASE
  `); },

  // One link by its composite key, for the existence check before a detach and to
  // capture the link's fields for the deletion audit entry.
  get getLink() { return db.prepare(`
    SELECT trick_slug, source_id, external_url, asserted_adds
    FROM freestyle_trick_source_links
    WHERE trick_slug = ? AND source_id = ?
  `); },

  // Admin curation: attach one registry source to a trick. external_ref,
  // asserted_notation, asserted_category, and notes stay NULL in this surface;
  // the composite primary key (trick_slug, source_id) is checked before insert.
  get insert() { return db.prepare(`
    INSERT INTO freestyle_trick_source_links
      (trick_slug, source_id, external_ref, external_url,
       asserted_adds, asserted_notation, asserted_category, notes)
    VALUES (?, ?, NULL, ?, ?, NULL, NULL, NULL)
  `); },

  // Admin curation: detach one source link, scoped to its trick so an edit page
  // can never remove another trick's link by source id alone.
  get deleteForTrick() { return db.prepare(`
    DELETE FROM freestyle_trick_source_links WHERE trick_slug = ? AND source_id = ?
  `); },
};

export const freestyleTrickTips = {
  // Published legacy footbag.org Member Tips for one trick, in display order
  // (chronological by legacy creation). Community advice rendered behind a
  // compact control on the trick detail page; never canonical doctrine, and
  // never carries author names in v1.
  get listForTrick() { return db.prepare(`
    SELECT tip_text, created_at_legacy
    FROM freestyle_trick_tips
    WHERE trick_slug = ? AND status = 'published'
    ORDER BY display_order, id
  `); },
};

export const freestyleMediaLinks = {
  // Per-trick media-coverage rows joined to source_id. One row per
  // (trick_slug, source_id) pair (deduped). Drives the tier-aware media
  // chip on the trick-dictionary ADD view and the dictionary-index
  // media-coverage chip ('Tutorial available' / 'Demo only' / 'No video
  // yet'): the service classifies each trick as 'tutorial' (any
  // tutorial-tier source tagged), 'demo' (only demo-/record-tier), or
  // 'none' (no rows here at all).
  // Coverage comes from the curator-tagged channel: a media_items row
  // tagged with a trick's '#slug' tag is coverage for that trick, and
  // mi.source_id carries the tier the service classifies on.
  get listCoveredTrickSlugsWithSource() { return db.prepare(`
    SELECT DISTINCT
      ft.slug       AS slug,
      mi.source_id  AS source_id
    FROM media_items mi
    INNER JOIN media_tags mt ON mt.media_id = mi.id
    INNER JOIN tags t        ON t.id        = mt.tag_id
    INNER JOIN freestyle_tricks ft ON ('#' || ft.slug) = t.tag_normalized
    WHERE mi.source_id IS NOT NULL
      AND ft.is_active = 1
    UNION
    -- Media tagged with a trick's alias slug (e.g. a retired structural name
    -- folded onto its folk-named canonical) is coverage for that canonical.
    SELECT DISTINCT
      ft.slug       AS slug,
      mi.source_id  AS source_id
    FROM media_items mi
    INNER JOIN media_tags mt ON mt.media_id = mi.id
    INNER JOIN tags t        ON t.id        = mt.tag_id
    INNER JOIN freestyle_trick_aliases a ON ('#' || a.alias_slug) = t.tag_normalized
    INNER JOIN freestyle_tricks ft       ON ft.slug = a.trick_slug AND ft.is_active = 1
    WHERE mi.source_id IS NOT NULL
  `); },
};

export interface FreestyleMediaCoveredSourceRow {
  slug:      string;
  source_id: string;
}

export interface FreestyleModifierUsageRow {
  modifier_slug: string;
  modifier_name: string;
  modifier_type: string;
  trick_count:   number;
}

export const freestyleTrickModifiers = {
  get listAll() { return db.prepare(`
    SELECT slug, modifier_name, add_bonus, add_bonus_rotational, modifier_type, notes
    FROM freestyle_trick_modifiers
    ORDER BY modifier_type ASC, modifier_name ASC
  `); },

  get getBySlug() { return db.prepare(`
    SELECT slug, modifier_name, add_bonus, add_bonus_rotational, modifier_type, notes
    FROM freestyle_trick_modifiers
    WHERE slug = ?
  `); },

  // Modifier-grouped view of the trick dictionary. One row per
  // (modifier, trick) pair, ordered for service-side grouping. Excludes
  // pending tricks, modifier-category tricks (they're not display-tier),
  // and modifiers that have zero linked active tricks (filtered later in
  // the service when grouping). Drives /freestyle/tricks?view=sets.
  get listTricksByModifier() { return db.prepare(`
    SELECT
      m.slug                  AS modifier_slug,
      m.modifier_name         AS modifier_name,
      m.modifier_type         AS modifier_type,
      m.add_bonus             AS add_bonus,
      m.add_bonus_rotational  AS add_bonus_rotational,
      t.slug                  AS trick_slug
    FROM freestyle_trick_modifier_links l
    INNER JOIN freestyle_trick_modifiers m ON m.slug = l.modifier_slug
    INNER JOIN freestyle_tricks t          ON t.slug = l.trick_slug
    WHERE
      t.is_active = 1
      AND (t.category IS NULL OR t.category != 'modifier')
    ORDER BY
      CASE m.modifier_type
        WHEN 'set'  THEN 0
        WHEN 'body' THEN 1
        ELSE 2
      END,
      m.modifier_name COLLATE NOCASE,
      l.apply_order,
      t.canonical_name COLLATE NOCASE
  `); },

  // Inverse of listTricksByModifier — modifier-link rows for ONE trick. Used
  // by the editorial-decomposition view-model in the notation-grammar panel.
  // Joins to freestyle_trick_modifiers so a single fetch carries the modifier
  // weight, type, and notes alongside the per-link apply order.
  get listLinksByTrickSlug() { return db.prepare(`
    SELECT
      m.slug                  AS modifier_slug,
      m.modifier_name         AS modifier_name,
      m.modifier_type         AS modifier_type,
      m.add_bonus             AS add_bonus,
      m.add_bonus_rotational  AS add_bonus_rotational,
      m.notes                 AS modifier_notes,
      l.apply_order           AS apply_order
    FROM freestyle_trick_modifier_links l
    INNER JOIN freestyle_trick_modifiers m ON m.slug = l.modifier_slug
    WHERE l.trick_slug = ?
    ORDER BY l.apply_order ASC
  `); },

  // Every modifier link across the active dictionary, as bare
  // (trick, modifier, apply_order) triples. Ordered by trick then apply_order
  // so a consumer rebuilding each trick's operator multiset keeps repeated
  // modifiers (distinct apply_order) as distinct instances. Drives the
  // structural-neighbors adjacency layer, which keys on the multiset.
  get listAllModifierLinks() { return db.prepare(`
    SELECT l.trick_slug    AS trick_slug,
           l.modifier_slug AS modifier_slug,
           l.apply_order   AS apply_order
    FROM freestyle_trick_modifier_links l
    INNER JOIN freestyle_tricks t ON t.slug = l.trick_slug
    WHERE t.is_active = 1
    ORDER BY l.trick_slug, l.apply_order ASC
  `); },

  // Active canonical tricks that carry ONE modifier, lowest ADD first. Drives
  // the "common tricks" list on the data-driven modifier detail (stub) page.
  get listActiveTricksByModifierSlug() { return db.prepare(`
    SELECT t.slug, t.canonical_name, t.adds, t.trick_family
    FROM freestyle_trick_modifier_links l
    INNER JOIN freestyle_tricks t ON t.slug = l.trick_slug
    WHERE l.modifier_slug = ?
      AND t.is_active = 1
      AND (t.category IS NULL OR t.category != 'modifier')
    ORDER BY t.adds ASC, t.canonical_name COLLATE NOCASE
  `); },

  // Modifier usage across the active dictionary: how many canonical tricks
  // carry each modifier. Drives the live "most-used modifiers" vocabulary
  // table (dictionary frequency, not competitive-sequence frequency).
  get listModifierUsage() { return db.prepare(`
    SELECT
      m.slug          AS modifier_slug,
      m.modifier_name AS modifier_name,
      m.modifier_type AS modifier_type,
      COUNT(*)        AS trick_count
    FROM freestyle_trick_modifier_links l
    INNER JOIN freestyle_trick_modifiers m ON m.slug = l.modifier_slug
    INNER JOIN freestyle_tricks t          ON t.slug = l.trick_slug
    WHERE t.is_active = 1
      AND (t.category IS NULL OR t.category != 'modifier')
    GROUP BY m.slug
    ORDER BY trick_count DESC, m.modifier_name COLLATE NOCASE
    LIMIT 12
  `); },
};

// Trick-to-modifier composition links. The admin curation edit page attaches or
// detaches these; the read side (listLinksByTrickSlug) lives on the modifier
// registry group above. The primary key is the full triple, so the same modifier
// may recur at another apply order and the collision check is on all three parts.
export const freestyleTrickModifierLinks = {
  // One link by its full triple, for the existence check before an attach or a
  // detach and to confirm the target belongs to the trick.
  get getLink() { return db.prepare(`
    SELECT trick_slug, modifier_slug, apply_order
    FROM freestyle_trick_modifier_links
    WHERE trick_slug = ? AND modifier_slug = ? AND apply_order = ?
  `); },

  // Admin curation: attach one registry modifier to a trick at an apply order.
  get insert() { return db.prepare(`
    INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)
    VALUES (?, ?, ?)
  `); },

  // Admin curation: detach one modifier link, scoped to the full triple so an edit
  // page can never remove a different link by trick and modifier alone.
  get deleteForTrick() { return db.prepare(`
    DELETE FROM freestyle_trick_modifier_links
    WHERE trick_slug = ? AND modifier_slug = ? AND apply_order = ?
  `); },
};

// ---------------------------------------------------------------------------
// freestylePartnerships
//
// Freestyle doubles partnership data derived from canonical result tables.
// Filters to team_type='doubles' disciplines in the freestyle category,
// excluding trick contests, shred, circle, and timed events.
// ---------------------------------------------------------------------------

export interface FreestylePartnershipRow {
  person_id_a:      string;
  person_name_a:    string;
  country_a:        string | null;
  member_slug_a:    string | null;
  person_id_b:      string;
  person_name_b:    string;
  country_b:        string | null;
  member_slug_b:    string | null;
  appearance_count: number;
  win_count:        number;
  podium_count:     number;
  first_year:       number | null;
  last_year:        number | null;
}

export const freestylePartnerships = {
  /** Top freestyle doubles partnerships by appearances.
   *  Excludes trick/shred/circle contests and Unknown placeholders. */
  get listTopPartnerships() { return db.prepare(`
    SELECT
      CASE WHEN pa.person_id < pb.person_id THEN pa.person_id ELSE pb.person_id END AS person_id_a,
      CASE WHEN pa.person_id < pb.person_id THEN pa.person_name ELSE pb.person_name END AS person_name_a,
      CASE WHEN pa.person_id < pb.person_id THEN pa.country ELSE pb.country END AS country_a,
      CASE WHEN pa.person_id < pb.person_id THEN ma.slug ELSE mb.slug END AS member_slug_a,
      CASE WHEN pa.person_id < pb.person_id THEN pb.person_id ELSE pa.person_id END AS person_id_b,
      CASE WHEN pa.person_id < pb.person_id THEN pb.person_name ELSE pa.person_name END AS person_name_b,
      CASE WHEN pa.person_id < pb.person_id THEN pb.country ELSE pa.country END AS country_b,
      CASE WHEN pa.person_id < pb.person_id THEN mb.slug ELSE ma.slug END AS member_slug_b,
      COUNT(*)                                              AS appearance_count,
      SUM(CASE WHEN re.placement = 1 THEN 1 ELSE 0 END)   AS win_count,
      SUM(CASE WHEN re.placement <= 3 THEN 1 ELSE 0 END)  AS podium_count,
      MIN(CAST(SUBSTR(e.start_date, 1, 4) AS INTEGER))     AS first_year,
      MAX(CAST(SUBSTR(e.start_date, 1, 4) AS INTEGER))     AS last_year
    FROM event_result_entries re
    JOIN event_disciplines ed ON ed.id = re.discipline_id
    JOIN events e ON e.id = re.event_id
    JOIN event_result_entry_participants p1 ON p1.result_entry_id = re.id AND p1.participant_order = 1
    JOIN event_result_entry_participants p2 ON p2.result_entry_id = re.id AND p2.participant_order = 2
    JOIN historical_persons pa ON pa.person_id = p1.historical_person_id
    JOIN historical_persons pb ON pb.person_id = p2.historical_person_id
    LEFT JOIN members ma
      ON ma.historical_person_id = pa.person_id
      AND ma.deleted_at IS NULL
    LEFT JOIN members mb
      ON mb.historical_person_id = pb.person_id
      AND mb.deleted_at IS NULL
    WHERE ed.discipline_category = 'freestyle'
      AND ed.team_type = 'doubles'
      AND LOWER(ed.name) NOT LIKE '%sick%'
      AND LOWER(ed.name) NOT LIKE '%big trick%'
      AND LOWER(ed.name) NOT LIKE '%huge%'
      AND LOWER(ed.name) NOT LIKE '%combo%'
      AND LOWER(ed.name) NOT LIKE '%rewind%'
      AND LOWER(ed.name) NOT LIKE '%ironman%'
      AND LOWER(ed.name) NOT LIKE '%battle%'
      AND LOWER(ed.name) NOT LIKE '%circle%'
      AND LOWER(ed.name) NOT LIKE '%shred%'
      AND LOWER(ed.name) NOT LIKE '%30 second%'
      AND LOWER(ed.name) NOT LIKE '%timed consecutive%'
      AND LOWER(ed.name) NOT LIKE '%5-minute%'
      AND pa.person_name != 'Unknown'
      AND pb.person_name != 'Unknown'
      AND pa.person_id != pb.person_id
    GROUP BY person_id_a, person_id_b
    HAVING COUNT(*) >= 2
    ORDER BY appearance_count DESC, win_count DESC, last_year DESC
    LIMIT 50
  `); },
};

// ---------------------------------------------------------------------------
// freestyleCompetition
//
// Results-derived freestyle competition data. Queries canonical tables only
// no freestyle-domain tables are written; this is a read-only projection.
//
// Discipline filter: any discipline whose name contains 'freestyle', excluding
// doubles and team formats. This covers Open/Intermediate/Women's Singles
// Freestyle, Open Freestyle, Freestyle, etc.
//
// STATS FIREWALL: no evidence-class filtering needed here. These are canonical
// placement records, not enrichment data.
// ---------------------------------------------------------------------------
export interface FreestyleCompetitorRow {
  person_id:     string;
  person_name:   string;
  country:       string | null;
  member_slug:   string | null;
  golds:         number;
  silvers:       number;
  bronzes:       number;
  total_podiums: number;
}

export interface FreestyleEraRow {
  era:    string;
  events: number;
}

export interface FreestyleRecentEventRow {
  event_id:       string;
  event_title:    string;
  start_date:     string;
  city:           string;
  country:        string;
  tag_normalized: string;   // from tags.tag_normalized via events.hashtag_tag_id
}

export interface FreestyleMilestoneRow {
  person_id:     string;
  person_name:   string;
  country:       string | null;
  member_slug:   string | null;
  golds:         number;
  total_podiums: number;
}

export interface FreestyleCareerRow {
  person_id:   string;
  person_name: string;
  country:     string | null;
  member_slug: string | null;
  first_year:  number;
  last_year:   number;
  span:        number;
}

export interface FreestyleNationRow {
  country:     string;
  podiums:     number;
  competitors: number;
  golds:       number;
}

export interface FreestyleWorldChampionRow {
  person_id:    string;
  person_name:  string;
  country:      string | null;
  member_slug:  string | null;
  world_titles: number;
}

export interface FreestyleDecadeNationRow {
  decade:      string;
  country:     string;
  podiums:     number;
  competitors: number;
}

export interface FreestyleFormatEventRow {
  event_id: string;
  name:     string;   // lowercased discipline name
}

export const freestyleCompetition = {
  // Top freestyle singles competitors by gold medals, then total podiums
  get listTopCompetitors() { return db.prepare(`
    SELECT
      hp.person_id,
      hp.person_name,
      hp.country,
      MAX(m.slug)                                          AS member_slug,
      SUM(CASE WHEN ere.placement = 1 THEN 1 ELSE 0 END) AS golds,
      SUM(CASE WHEN ere.placement = 2 THEN 1 ELSE 0 END) AS silvers,
      SUM(CASE WHEN ere.placement = 3 THEN 1 ELSE 0 END) AS bronzes,
      COUNT(*)                                             AS total_podiums
    FROM event_result_entries ere
    JOIN event_disciplines ed ON ed.id = ere.discipline_id
    JOIN event_result_entry_participants erep ON erep.result_entry_id = ere.id
    JOIN historical_persons hp ON hp.person_id = erep.historical_person_id
    LEFT JOIN members m
      ON m.historical_person_id = hp.person_id
      AND m.deleted_at IS NULL
    WHERE (lower(ed.name) LIKE '%freestyle%'
           AND lower(ed.name) NOT LIKE '%doubles%'
           AND lower(ed.name) NOT LIKE '%team%')
      AND ere.placement BETWEEN 1 AND 3
    GROUP BY hp.person_id
    ORDER BY golds DESC, total_podiums DESC
    LIMIT 20
  `); },

  // Event counts per era (decade buckets)
  get listEventsByEra() { return db.prepare(`
    SELECT
      CASE
        WHEN substr(e.start_date,1,4) < '1990' THEN '1980s'
        WHEN substr(e.start_date,1,4) < '2000' THEN '1990s'
        WHEN substr(e.start_date,1,4) < '2010' THEN '2000s'
        WHEN substr(e.start_date,1,4) < '2020' THEN '2010s'
        ELSE '2020s'
      END AS era,
      COUNT(DISTINCT e.id) AS events
    FROM events e
    JOIN event_disciplines ed ON ed.event_id = e.id
    WHERE lower(ed.name) LIKE '%freestyle%'
      AND lower(ed.name) NOT LIKE '%doubles%'
      AND lower(ed.name) NOT LIKE '%team%'
    GROUP BY era
    ORDER BY era ASC
  `); },

  // 10 most recent freestyle events
  get listRecentEvents() { return db.prepare(`
    SELECT DISTINCT
      e.id         AS event_id,
      e.title      AS event_title,
      e.start_date,
      e.city,
      e.country,
      t.tag_normalized
    FROM events e
    JOIN tags t ON t.id = e.hashtag_tag_id
    JOIN event_disciplines ed ON ed.event_id = e.id
    WHERE lower(ed.name) LIKE '%freestyle%'
      AND lower(ed.name) NOT LIKE '%doubles%'
      AND lower(ed.name) NOT LIKE '%team%'
    ORDER BY e.start_date DESC
    LIMIT 10
  `); },

  // Per-person golds + total podiums (freestyle singles), top by podiums.
  // Drives the "most golds" and "most podiums" milestone buckets in-service.
  get listCompetitorMilestones() { return db.prepare(`
    SELECT
      hp.person_id,
      hp.person_name,
      hp.country,
      MAX(m.slug)                                         AS member_slug,
      SUM(CASE WHEN ere.placement = 1 THEN 1 ELSE 0 END)  AS golds,
      COUNT(*)                                            AS total_podiums
    FROM event_result_entries ere
    JOIN event_disciplines ed ON ed.id = ere.discipline_id
    JOIN event_result_entry_participants erep ON erep.result_entry_id = ere.id
    JOIN historical_persons hp ON hp.person_id = erep.historical_person_id
    LEFT JOIN members m ON m.historical_person_id = hp.person_id AND m.deleted_at IS NULL
    WHERE lower(ed.name) LIKE '%freestyle%'
      AND lower(ed.name) NOT LIKE '%doubles%'
      AND lower(ed.name) NOT LIKE '%team%'
      AND ere.placement BETWEEN 1 AND 3
    GROUP BY hp.person_id
    ORDER BY total_podiums DESC
    LIMIT 60
  `); },

  // Longest documented competitive spans (freestyle, any placement).
  get listLongestCareers() { return db.prepare(`
    SELECT
      hp.person_id,
      hp.person_name,
      hp.country,
      MAX(m.slug)                                                  AS member_slug,
      MIN(CAST(substr(e.start_date,1,4) AS INTEGER))               AS first_year,
      MAX(CAST(substr(e.start_date,1,4) AS INTEGER))               AS last_year,
      MAX(CAST(substr(e.start_date,1,4) AS INTEGER))
        - MIN(CAST(substr(e.start_date,1,4) AS INTEGER))           AS span
    FROM event_result_entries ere
    JOIN event_disciplines ed ON ed.id = ere.discipline_id
    JOIN events e ON e.id = ere.event_id
    JOIN event_result_entry_participants erep ON erep.result_entry_id = ere.id
    JOIN historical_persons hp ON hp.person_id = erep.historical_person_id
    LEFT JOIN members m ON m.historical_person_id = hp.person_id AND m.deleted_at IS NULL
    WHERE lower(ed.name) LIKE '%freestyle%'
      AND lower(ed.name) NOT LIKE '%doubles%'
      AND lower(ed.name) NOT LIKE '%team%'
    GROUP BY hp.person_id
    HAVING span > 0
    ORDER BY span DESC, last_year DESC
    LIMIT 10
  `); },

  // Podiums by medalist nationality (freestyle singles).
  get listNationPodiums() { return db.prepare(`
    SELECT
      hp.country                                          AS country,
      COUNT(*)                                            AS podiums,
      COUNT(DISTINCT hp.person_id)                        AS competitors,
      SUM(CASE WHEN ere.placement = 1 THEN 1 ELSE 0 END)  AS golds
    FROM event_result_entries ere
    JOIN event_disciplines ed ON ed.id = ere.discipline_id
    JOIN event_result_entry_participants erep ON erep.result_entry_id = ere.id
    JOIN historical_persons hp ON hp.person_id = erep.historical_person_id
    WHERE lower(ed.name) LIKE '%freestyle%'
      AND lower(ed.name) NOT LIKE '%doubles%'
      AND lower(ed.name) NOT LIKE '%team%'
      AND ere.placement BETWEEN 1 AND 3
      AND hp.country IS NOT NULL AND hp.country <> ''
    GROUP BY hp.country
    ORDER BY podiums DESC
    LIMIT 12
  `); },

  // Most freestyle-singles wins at events titled as World Championships.
  get listWorldChampions() { return db.prepare(`
    SELECT
      hp.person_id,
      hp.person_name,
      hp.country,
      MAX(m.slug)   AS member_slug,
      COUNT(*)      AS world_titles
    FROM event_result_entries ere
    JOIN event_disciplines ed ON ed.id = ere.discipline_id
    JOIN events e ON e.id = ere.event_id
    JOIN event_result_entry_participants erep ON erep.result_entry_id = ere.id
    JOIN historical_persons hp ON hp.person_id = erep.historical_person_id
    LEFT JOIN members m ON m.historical_person_id = hp.person_id AND m.deleted_at IS NULL
    WHERE lower(ed.name) LIKE '%freestyle%'
      AND lower(ed.name) NOT LIKE '%doubles%'
      AND lower(ed.name) NOT LIKE '%team%'
      AND ere.placement = 1
      AND lower(e.title) LIKE '%world%'
    GROUP BY hp.person_id
    ORDER BY world_titles DESC, hp.person_name ASC
    LIMIT 10
  `); },

  // Podiums by medalist nationality and decade (the geographic-shift view).
  get listPodiumsByDecadeNation() { return db.prepare(`
    SELECT
      (substr(e.start_date,1,3) || '0s')                  AS decade,
      hp.country                                          AS country,
      COUNT(*)                                            AS podiums,
      COUNT(DISTINCT hp.person_id)                        AS competitors
    FROM event_result_entries ere
    JOIN event_disciplines ed ON ed.id = ere.discipline_id
    JOIN events e ON e.id = ere.event_id
    JOIN event_result_entry_participants erep ON erep.result_entry_id = ere.id
    JOIN historical_persons hp ON hp.person_id = erep.historical_person_id
    WHERE lower(ed.name) LIKE '%freestyle%'
      AND lower(ed.name) NOT LIKE '%doubles%'
      AND lower(ed.name) NOT LIKE '%team%'
      AND ere.placement BETWEEN 1 AND 3
      AND hp.country IS NOT NULL AND hp.country <> ''
    GROUP BY decade, hp.country
    ORDER BY decade ASC, podiums DESC
  `); },

  // Distinct (event, discipline-name) rows for any competition-format keyword,
  // bucketed into formats in-service so prevalence stays live, not frozen.
  get listFormatDisciplineEvents() { return db.prepare(`
    SELECT DISTINCT ed.event_id AS event_id, lower(ed.name) AS name
    FROM event_disciplines ed
    WHERE lower(ed.name) LIKE '%routine%'
       OR lower(ed.name) LIKE '%shred%'
       OR lower(ed.name) LIKE '%sick%'
       OR lower(ed.name) LIKE '%best trick%'
       OR lower(ed.name) LIKE '%circle%'
       OR lower(ed.name) LIKE '%battle%'
       OR lower(ed.name) LIKE '%request%'
  `); },
};

// ---------------------------------------------------------------------------
// consecutiveKicksRecords
//
// WFA-sanctioned consecutive kicks records loaded from the curated CSV.
// Four sections: Official World Records, Highest Official Scores,
// World Record Progression, Milestone Firsts.
// ---------------------------------------------------------------------------
export interface ConsecutiveKicksRow {
  sort_order: number;
  section: string;
  subsection: string;
  division: string;
  year: string | null;
  rank: number | null;
  player_1: string | null;
  player_2: string | null;
  score: number | null;
  note: string | null;
  event_date: string | null;
  event_name: string | null;
  location: string | null;
}

export const consecutiveKicksRecords = {
  get listWorldRecords() { return db.prepare(`
    SELECT sort_order, section, subsection, division, year, rank,
           player_1, player_2, score, note, event_date, event_name, location
    FROM consecutive_kicks_records
    WHERE section = 'Official World Records'
    ORDER BY sort_order ASC
  `); },

  get listHighestScores() { return db.prepare(`
    SELECT sort_order, section, subsection, division, year, rank,
           player_1, player_2, score, note, event_date, event_name, location
    FROM consecutive_kicks_records
    WHERE section = 'Highest Official Scores'
    ORDER BY sort_order ASC
  `); },

  get listProgression() { return db.prepare(`
    SELECT sort_order, section, subsection, division, year, rank,
           player_1, player_2, score, note, event_date, event_name, location
    FROM consecutive_kicks_records
    WHERE section = 'World Record Progression'
    ORDER BY sort_order ASC
  `); },

  get listMilestones() { return db.prepare(`
    SELECT sort_order, section, subsection, division, year, rank,
           player_1, player_2, score, note, event_date, event_name, location
    FROM consecutive_kicks_records
    WHERE section = 'Milestone Firsts'
    ORDER BY sort_order ASC
  `); },

  get countBySection() { return db.prepare(`
    SELECT section, COUNT(*) AS n
    FROM consecutive_kicks_records
    GROUP BY section
    ORDER BY MIN(sort_order)
  `); },

  // Admin curation browse: every row with its stable id and display position,
  // ordered so the service can group by section and then division.
  get listAllForCuration() { return db.prepare(`
    SELECT id, sort_order, section, subsection, division, year, rank,
           player_1, player_2, score, note, event_date, event_name, location
    FROM consecutive_kicks_records
    ORDER BY section ASC, sort_order ASC
  `); },

  // Admin curation edit page: the editable fields of one row, keyed on the stable id.
  get getForCurationById() { return db.prepare(`
    SELECT id, sort_order, section, subsection, division, year, rank,
           player_1, player_2, score, note, event_date, event_name, location
    FROM consecutive_kicks_records
    WHERE id = ?
  `); },

  // The id of the row (if any) holding a given display position, so the service
  // can reject a duplicate sort_order inline before the write; the column's UNIQUE
  // constraint is the backstop.
  get getIdBySortOrder() { return db.prepare(`
    SELECT id FROM consecutive_kicks_records WHERE sort_order = ?
  `); },

  // Admin curation scalar edit: update the editable fields of one row (the id is
  // the identity key and stays fixed). Stamps updated_at.
  get updateForCuration() { return db.prepare(`
    UPDATE consecutive_kicks_records
    SET sort_order = ?, section = ?, subsection = ?, division = ?, year = ?,
        rank = ?, player_1 = ?, player_2 = ?, score = ?, note = ?,
        event_date = ?, event_name = ?, location = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `); },

  // Admin curation add: insert one new row. The service generates the id and
  // validates the same fields as an edit; created_at and updated_at are stamped.
  get insertForCuration() { return db.prepare(`
    INSERT INTO consecutive_kicks_records
      (id, sort_order, section, subsection, division, year, rank,
       player_1, player_2, score, note, event_date, event_name, location,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `); },

  // Admin curation remove: hard delete one row by its stable id.
  get deleteById() { return db.prepare(`
    DELETE FROM consecutive_kicks_records WHERE id = ?
  `); },
};

// ---------------------------------------------------------------------------
// netTeams
//
// Net domain enrichment layer, additive, never modifies canonical tables.
// Evidence class: canonical_only (the only class populated so far).
//
// STATISTICS FIREWALL: all appearance queries use the net_team_appearance_canonical
// view, which enforces evidence_class = 'canonical_only' at the DB layer.
// Never query net_team_appearance directly from this statement group.
//
// Consumed by /net/teams and /net/teams/:teamId (netService.getTeamsPage,
// getTeamDetailPage) and by the /net home notable-teams buckets.
// ---------------------------------------------------------------------------
export interface NetTeamSummaryRow {
  team_id:          string;
  person_id_a:      string;
  person_name_a:    string;
  country_a:        string | null;
  member_slug_a:    string | null;
  person_id_b:      string;
  person_name_b:    string;
  country_b:        string | null;
  member_slug_b:    string | null;
  first_year:       number | null;
  last_year:        number | null;
  appearance_count: number;
}

export interface NetTeamAppearanceRow {
  appearance_id:        string;
  event_id:             string;
  event_tag_normalized: string;       // #event_{year}_{slug} — used to build /events/ hrefs
  event_title:          string;
  event_city:           string;
  event_country:        string;
  start_date:           string;
  discipline_name:      string;
  canonical_group:      string | null;
  conflict_flag:        number;       // 0 or 1 — 1 = use raw discipline_name
  placement:            number;
  score_text:           string | null;
  event_year:           number;
}

export interface NetTeamStatsRow {
  team_id:          string;
  person_id_a:      string;
  person_name_a:    string;
  country_a:        string | null;
  member_slug_a:    string | null;
  person_id_b:      string;
  person_name_b:    string;
  country_b:        string | null;
  member_slug_b:    string | null;
  appearance_count: number;
  win_count:        number;
  podium_count:     number;
  first_year:       number | null;
  last_year:        number | null;
}

export interface NetDivisionOptionRow {
  canonical_group:  string;
  appearance_count: number;
}

export const netTeams = {
  // STATS FIREWALL: queries net_team_appearance_canonical view (canonical_only enforced at DB layer)

  get getById() { return db.prepare(`
    SELECT
      t.team_id,
      t.person_id_a,
      pa.person_name  AS person_name_a,
      pa.country      AS country_a,
      ma.slug         AS member_slug_a,
      t.person_id_b,
      pb.person_name  AS person_name_b,
      pb.country      AS country_b,
      mb.slug         AS member_slug_b,
      t.first_year,
      t.last_year,
      t.appearance_count
    FROM net_team t
    JOIN historical_persons pa ON pa.person_id = t.person_id_a
    JOIN historical_persons pb ON pb.person_id = t.person_id_b
    LEFT JOIN members ma
      ON ma.historical_person_id = pa.person_id
      AND ma.deleted_at IS NULL
    LEFT JOIN members mb
      ON mb.historical_person_id = pb.person_id
      AND mb.deleted_at IS NULL
    WHERE t.team_id = ?
  `); },

  get listAppearancesByTeamId() { return db.prepare(`
    SELECT
      a.id            AS appearance_id,
      a.event_id,
      t.tag_normalized AS event_tag_normalized,
      e.title         AS event_title,
      e.city          AS event_city,
      e.country       AS event_country,
      e.start_date,
      ed.name         AS discipline_name,
      dg.canonical_group,
      COALESCE(dg.conflict_flag, 0) AS conflict_flag,
      a.placement,
      a.score_text,
      a.event_year
    FROM net_team_appearance_canonical a
    JOIN events e           ON e.id  = a.event_id
    JOIN tags t             ON t.id  = e.hashtag_tag_id
    JOIN event_disciplines ed ON ed.id = a.discipline_id
    LEFT JOIN net_discipline_group dg ON dg.discipline_id = a.discipline_id
    WHERE a.team_id = ?
    ORDER BY a.event_year DESC, e.start_date DESC, a.placement ASC
  `); },

  /** All net teams (with ≥1 canonical appearance), sorted by appearance count desc.
   *  No HAVING threshold and no LIMIT: this is the single public entry for browsing
   *  all teams, with division/search filters handled via queryFilteredTeams. */
  get listAll() { return db.prepare(`
    SELECT
      t.team_id,
      t.person_id_a,
      pa.person_name  AS person_name_a,
      pa.country      AS country_a,
      MAX(ma.slug)    AS member_slug_a,
      t.person_id_b,
      pb.person_name  AS person_name_b,
      pb.country      AS country_b,
      MAX(mb.slug)    AS member_slug_b,
      COUNT(*)                                              AS appearance_count,
      SUM(CASE WHEN a.placement = 1 THEN 1 ELSE 0 END)    AS win_count,
      SUM(CASE WHEN a.placement <= 3 THEN 1 ELSE 0 END)   AS podium_count,
      MIN(a.event_year)                                     AS first_year,
      MAX(a.event_year)                                     AS last_year
    FROM net_team t
    JOIN historical_persons pa ON pa.person_id = t.person_id_a
    JOIN historical_persons pb ON pb.person_id = t.person_id_b
    JOIN net_team_appearance_canonical a ON a.team_id = t.team_id
    LEFT JOIN members ma
      ON ma.historical_person_id = pa.person_id
      AND ma.deleted_at IS NULL
    LEFT JOIN members mb
      ON mb.historical_person_id = pb.person_id
      AND mb.deleted_at IS NULL
    WHERE pa.person_name != 'Unknown' AND pb.person_name != 'Unknown'
    GROUP BY t.team_id
    ORDER BY appearance_count DESC, win_count DESC, last_year DESC, pa.person_name ASC
  `); },

  /** Division filter options, distinct canonical groups with appearance counts. */
  get listDivisionOptions() { return db.prepare(`
    SELECT dg.canonical_group, COUNT(DISTINCT a.id) AS appearance_count
    FROM net_discipline_group dg
    JOIN net_team_appearance_canonical a ON a.discipline_id = dg.discipline_id
    WHERE dg.conflict_flag = 0
    GROUP BY dg.canonical_group
    ORDER BY appearance_count DESC
  `); },

  /** Wider pool for notable-team buckets, top 100 with >=3 appearances. */
  get listNotablePool() { return db.prepare(`
    SELECT
      t.team_id,
      t.person_id_a,
      pa.person_name  AS person_name_a,
      pa.country      AS country_a,
      MAX(ma.slug)    AS member_slug_a,
      t.person_id_b,
      pb.person_name  AS person_name_b,
      pb.country      AS country_b,
      MAX(mb.slug)    AS member_slug_b,
      COUNT(*)                                              AS appearance_count,
      SUM(CASE WHEN a.placement = 1 THEN 1 ELSE 0 END)    AS win_count,
      SUM(CASE WHEN a.placement <= 3 THEN 1 ELSE 0 END)   AS podium_count,
      MIN(a.event_year)                                     AS first_year,
      MAX(a.event_year)                                     AS last_year
    FROM net_team t
    JOIN historical_persons pa ON pa.person_id = t.person_id_a
    JOIN historical_persons pb ON pb.person_id = t.person_id_b
    JOIN net_team_appearance_canonical a ON a.team_id = t.team_id
    LEFT JOIN members ma
      ON ma.historical_person_id = pa.person_id
      AND ma.deleted_at IS NULL
    LEFT JOIN members mb
      ON mb.historical_person_id = pb.person_id
      AND mb.deleted_at IS NULL
    WHERE pa.person_name != 'Unknown' AND pb.person_name != 'Unknown'
    GROUP BY t.team_id
    HAVING COUNT(*) >= 3
    ORDER BY appearance_count DESC
    LIMIT 100
  `); },
};

/**
 * Dynamic team query with optional division (canonical_group) and player-search
 * filters. Uses runtime db.prepare() for the optional JOIN clause.
 */
export function queryFilteredTeams(filters: {
  division?: string;
  search?: string;
}): NetTeamStatsRow[] {
  const joins: string[] = [];
  const conditions: string[] = [];
  const params: string[] = [];

  if (filters.division) {
    joins.push('JOIN net_discipline_group dg ON dg.discipline_id = a.discipline_id AND dg.canonical_group = ?');
    params.push(filters.division);
  }
  if (filters.search) {
    conditions.push("(pa.person_name LIKE ? OR pb.person_name LIKE ?)");
    const like = `%${filters.search}%`;
    params.push(like, like);
  }

  // Always exclude Unknown placeholder
  conditions.push("pa.person_name != 'Unknown'");
  conditions.push("pb.person_name != 'Unknown'");

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db.prepare(`
    SELECT
      t.team_id,
      t.person_id_a,
      pa.person_name  AS person_name_a,
      pa.country      AS country_a,
      MAX(ma.slug)    AS member_slug_a,
      t.person_id_b,
      pb.person_name  AS person_name_b,
      pb.country      AS country_b,
      MAX(mb.slug)    AS member_slug_b,
      COUNT(*)                                              AS appearance_count,
      SUM(CASE WHEN a.placement = 1 THEN 1 ELSE 0 END)    AS win_count,
      SUM(CASE WHEN a.placement <= 3 THEN 1 ELSE 0 END)   AS podium_count,
      MIN(a.event_year)                                     AS first_year,
      MAX(a.event_year)                                     AS last_year
    FROM net_team t
    JOIN historical_persons pa ON pa.person_id = t.person_id_a
    JOIN historical_persons pb ON pb.person_id = t.person_id_b
    JOIN net_team_appearance_canonical a ON a.team_id = t.team_id
    LEFT JOIN members ma
      ON ma.historical_person_id = pa.person_id
      AND ma.deleted_at IS NULL
    LEFT JOIN members mb
      ON mb.historical_person_id = pb.person_id
      AND mb.deleted_at IS NULL
    ${joins.join('\n    ')}
    ${where}
    GROUP BY t.team_id
    HAVING COUNT(*) >= 2
    ORDER BY appearance_count DESC, win_count DESC, last_year DESC, pa.person_name ASC
    LIMIT 50
  `).all(...params) as NetTeamStatsRow[];
}

// ---- QC-only (delete with pipeline-qc subsystem) ----
// ---------------------------------------------------------------------------
// netRecoverySignals
//
// Internal-only diagnostic queries for identity recovery.
// Detects stub persons (auto-generated, no real PT entry) by checking
// event_count IS NULL or 0. These are persons the seed builder created
// as placeholders for unresolved canonical participants.
// Route: /internal/net/recovery-signals
// ---------------------------------------------------------------------------

export interface RecoveryPartnerRepeatRow {
  known_player:      string;
  known_pid:         string;
  known_member_slug: string | null;
  stub_partner:      string;
  stub_pid:          string;
  co_count:          number;
  years:             string;
}

export interface RecoveryAbbreviationRow {
  stub_name:          string;
  stub_pid:           string;
  likely_match:       string;
  likely_pid:         string;
  likely_member_slug: string | null;
}

export interface RecoveryHighValueRow {
  person_name:  string;
  person_id:    string;
  appearances:  number;
  event_count:  number;
  years:        string;
}

export const netRecoverySignals = {
  /** Doubles entries where a known player is partnered with a stub person. */
  get listUnresolvedPartnerRepeats() { return db.prepare(`
    SELECT
      hp_known.person_name AS known_player,
      hp_known.person_id   AS known_pid,
      MAX(m_known.slug)    AS known_member_slug,
      hp_stub.person_name  AS stub_partner,
      hp_stub.person_id    AS stub_pid,
      COUNT(DISTINCT p_stub.result_entry_id) AS co_count,
      GROUP_CONCAT(DISTINCT SUBSTR(ev.start_date, 1, 4)) AS years
    FROM event_result_entry_participants p_known
    JOIN event_result_entry_participants p_stub
      ON p_stub.result_entry_id = p_known.result_entry_id
      AND p_stub.id != p_known.id
    JOIN historical_persons hp_known ON hp_known.person_id = p_known.historical_person_id
    JOIN historical_persons hp_stub  ON hp_stub.person_id  = p_stub.historical_person_id
    JOIN event_result_entries re ON re.id = p_known.result_entry_id
    JOIN event_disciplines ed   ON ed.id = re.discipline_id AND ed.team_type = 'doubles'
    JOIN events ev              ON ev.id = re.event_id
    LEFT JOIN members m_known
      ON m_known.historical_person_id = hp_known.person_id
      AND m_known.deleted_at IS NULL
    WHERE hp_known.event_count > 0
      AND (hp_stub.event_count IS NULL OR hp_stub.event_count = 0)
      AND hp_stub.person_name NOT IN ('[UNKNOWN PARTNER]', '__UNKNOWN_PARTNER__', '__NON_PERSON__', 'Unknown', '')
    GROUP BY hp_known.person_id, hp_stub.person_id
    ORDER BY co_count DESC
    LIMIT 30
  `); },

  /** Stub names that share a last name (4+ chars) with a known person.
   *  Initial+lastname abbreviation detection. */
  get listAbbreviationClusters() { return db.prepare(`
    SELECT
      hp_stub.person_name  AS stub_name,
      hp_stub.person_id    AS stub_pid,
      hp_known.person_name AS likely_match,
      hp_known.person_id   AS likely_pid,
      m_likely.slug        AS likely_member_slug
    FROM historical_persons hp_stub
    JOIN historical_persons hp_known
      ON LOWER(SUBSTR(hp_known.person_name,
                      INSTR(hp_known.person_name, ' ') + 1))
         = LOWER(SUBSTR(hp_stub.person_name,
                        INSTR(hp_stub.person_name, ' ') + 1))
    LEFT JOIN members m_likely
      ON m_likely.historical_person_id = hp_known.person_id
      AND m_likely.deleted_at IS NULL
    WHERE (hp_stub.event_count IS NULL OR hp_stub.event_count = 0)
      AND hp_known.event_count > 0
      AND hp_stub.person_name NOT IN ('[UNKNOWN PARTNER]', '__UNKNOWN_PARTNER__', '__NON_PERSON__', 'Unknown', '')
      AND INSTR(hp_stub.person_name, ' ') > 0
      AND INSTR(hp_known.person_name, ' ') > 0
      AND LENGTH(SUBSTR(hp_known.person_name,
                        INSTR(hp_known.person_name, ' ') + 1)) >= 4
      AND LENGTH(hp_stub.person_name) < LENGTH(hp_known.person_name)
      AND LOWER(SUBSTR(hp_known.person_name, 1, 1))
          = LOWER(SUBSTR(REPLACE(hp_stub.person_name, '.', ''), 1, 1))
    ORDER BY hp_stub.person_name, hp_known.person_name
  `); },

  /** Top stub persons by appearance count. */
  get listHighValueCandidates() { return db.prepare(`
    SELECT
      hp.person_name,
      hp.person_id,
      COUNT(DISTINCT p.result_entry_id) AS appearances,
      COUNT(DISTINCT re.event_id)       AS event_count,
      GROUP_CONCAT(DISTINCT SUBSTR(ev.start_date, 1, 4)) AS years
    FROM historical_persons hp
    JOIN event_result_entry_participants p ON p.historical_person_id = hp.person_id
    JOIN event_result_entries re           ON re.id = p.result_entry_id
    JOIN events ev                        ON ev.id = re.event_id
    WHERE (hp.event_count IS NULL OR hp.event_count = 0)
      AND hp.person_name NOT IN ('[UNKNOWN PARTNER]', '__UNKNOWN_PARTNER__', '__NON_PERSON__', 'Unknown', '')
    GROUP BY hp.person_id
    ORDER BY appearances DESC
    LIMIT 30
  `); },

  /** Total stub person count. */
  get countStubs() { return db.prepare(`
    SELECT COUNT(*) AS stub_count
    FROM historical_persons
    WHERE (event_count IS NULL OR event_count = 0)
      AND person_name NOT IN ('[UNKNOWN PARTNER]', '__UNKNOWN_PARTNER__', '__NON_PERSON__', 'Unknown', '')
  `); },
};

// ---- QC-only (delete with pipeline-qc subsystem) ----
// ---------------------------------------------------------------------------
// netRecoveryCandidates
//
// Internal-only: generates structured alias candidates from recovery signals.
// Route: /internal/net/recovery-candidates
// ---------------------------------------------------------------------------

export interface RecoveryCandidateAbbrevRow {
  stub_name:    string;
  stub_pid:     string;
  match_name:   string;
  match_pid:    string;
  match_count:  number;   // how many known persons share that last name + initial
  stub_appearances: number;
}

export interface RecoveryCandidateFreqRow {
  person_name:  string;
  person_id:    string;
  appearances:  number;
  event_count:  number;
  years:        string;
}

export const netRecoveryCandidates = {
  /** Unambiguous abbreviation candidates: stub shares last name + first initial
   *  with exactly ONE known person. */
  get listAbbreviationCandidates() { return db.prepare(`
    SELECT
      hp_stub.person_name  AS stub_name,
      hp_stub.person_id    AS stub_pid,
      hp_known.person_name AS match_name,
      hp_known.person_id   AS match_pid,
      (SELECT COUNT(DISTINCT p.result_entry_id)
       FROM event_result_entry_participants p
       WHERE p.historical_person_id = hp_stub.person_id) AS stub_appearances
    FROM historical_persons hp_stub
    JOIN historical_persons hp_known
      ON LOWER(SUBSTR(hp_known.person_name, INSTR(hp_known.person_name, ' ') + 1))
       = LOWER(SUBSTR(hp_stub.person_name, INSTR(hp_stub.person_name, ' ') + 1))
    WHERE (hp_stub.event_count IS NULL OR hp_stub.event_count = 0)
      AND hp_known.event_count > 0
      AND hp_stub.person_name NOT IN ('[UNKNOWN PARTNER]', '__UNKNOWN_PARTNER__', '__NON_PERSON__', 'Unknown', '')
      AND INSTR(hp_stub.person_name, ' ') > 0
      AND INSTR(hp_known.person_name, ' ') > 0
      AND LENGTH(SUBSTR(hp_known.person_name, INSTR(hp_known.person_name, ' ') + 1)) >= 4
      AND LENGTH(hp_stub.person_name) < LENGTH(hp_known.person_name)
      AND LOWER(SUBSTR(hp_known.person_name, 1, 1))
          = LOWER(SUBSTR(REPLACE(hp_stub.person_name, '.', ''), 1, 1))
      AND (SELECT COUNT(DISTINCT hp2.person_id)
           FROM historical_persons hp2
           WHERE hp2.event_count > 0
             AND LOWER(SUBSTR(hp2.person_name, INSTR(hp2.person_name, ' ') + 1))
               = LOWER(SUBSTR(hp_stub.person_name, INSTR(hp_stub.person_name, ' ') + 1))
             AND INSTR(hp2.person_name, ' ') > 0
             AND LENGTH(SUBSTR(hp2.person_name, INSTR(hp2.person_name, ' ') + 1)) >= 4
             AND LENGTH(hp_stub.person_name) < LENGTH(hp2.person_name)
             AND LOWER(SUBSTR(hp2.person_name, 1, 1))
                 = LOWER(SUBSTR(REPLACE(hp_stub.person_name, '.', ''), 1, 1))
          ) = 1
    ORDER BY stub_appearances DESC, hp_stub.person_name ASC
  `); },

  /** High-frequency stubs (>=3 appearances), likely real persons needing PT entries. */
  get listHighFrequencyStubs() { return db.prepare(`
    SELECT
      hp.person_name,
      hp.person_id,
      COUNT(DISTINCT p.result_entry_id) AS appearances,
      COUNT(DISTINCT re.event_id)       AS event_count,
      GROUP_CONCAT(DISTINCT SUBSTR(ev.start_date, 1, 4)) AS years
    FROM historical_persons hp
    JOIN event_result_entry_participants p ON p.historical_person_id = hp.person_id
    JOIN event_result_entries re           ON re.id = p.result_entry_id
    JOIN events ev                        ON ev.id = re.event_id
    WHERE (hp.event_count IS NULL OR hp.event_count = 0)
      AND hp.person_name NOT IN ('[UNKNOWN PARTNER]', '__UNKNOWN_PARTNER__', '__NON_PERSON__', 'Unknown', '')
    GROUP BY hp.person_id
    HAVING appearances >= 3
    ORDER BY appearances DESC
  `); },
};

// ---- QC-only (delete with pipeline-qc subsystem) ----
// ---------------------------------------------------------------------------
// netTeamCorrectionApproval
//
// Internal-only: operator approval for team anomaly corrections.
// Route: /internal/net/team-corrections
// ---------------------------------------------------------------------------

export const netTeamCorrectionApproval = {
  get upsertCandidate() { return db.prepare(`
    INSERT INTO net_team_correction_candidate
      (id, event_key, discipline_key, placement, original_display, anomaly_type,
       suggested_player_a, suggested_player_b, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(event_key, discipline_key, placement) DO UPDATE SET
      original_display   = excluded.original_display,
      anomaly_type       = excluded.anomaly_type,
      suggested_player_a = COALESCE(net_team_correction_candidate.suggested_player_a, excluded.suggested_player_a),
      suggested_player_b = COALESCE(net_team_correction_candidate.suggested_player_b, excluded.suggested_player_b)
  `); },

  get getById() { return db.prepare(`SELECT id FROM net_team_correction_candidate WHERE id = ?`); },

  get updateDecision() { return db.prepare(`
    UPDATE net_team_correction_candidate
    SET decision       = ?,
        suggested_player_a = ?,
        suggested_player_b = ?,
        decision_notes = ?,
        decided_by     = ?,
        decided_at     = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `); },

  get listAll() { return db.prepare(`
    SELECT id, event_key, discipline_key, placement, original_display, anomaly_type,
           suggested_player_a, suggested_player_b, decision, decision_notes
    FROM net_team_correction_candidate
    ORDER BY
      CASE decision WHEN 'approve' THEN 0 WHEN 'defer' THEN 1 ELSE 2 END,
      event_key, placement
  `); },

  get listApproved() { return db.prepare(`
    SELECT event_key, discipline_key, placement, original_display,
           suggested_player_a, suggested_player_b, anomaly_type, decision_notes
    FROM net_team_correction_candidate
    WHERE decision = 'approve'
      AND suggested_player_a IS NOT NULL AND suggested_player_a != ''
      AND suggested_player_b IS NOT NULL AND suggested_player_b != ''
    ORDER BY event_key, discipline_key, CAST(placement AS INTEGER)
  `); },
};

// ---------------------------------------------------------------------------
// netRecoveryApproval
//
// Internal-only: operator approval workflow for recovery alias candidates.
// Route: /internal/net/recovery-candidates
// ---------------------------------------------------------------------------

export interface RecoveryAliasCandidateRow {
  id:                     string;
  stub_name:              string;
  stub_person_id:         string;
  suggested_person_id:    string;
  suggested_person_name:  string;
  suggested_member_slug:  string | null;
  suggestion_type:        string;
  confidence:             string;
  appearance_count:       number;
  operator_decision:      string | null;
  operator_notes:         string | null;
  reviewed_by:            string | null;
  reviewed_at:            string | null;
}

export const netRecoveryApproval = {
  get listAll() { return db.prepare(`
    SELECT rac.id, rac.stub_name, rac.stub_person_id,
           rac.suggested_person_id, rac.suggested_person_name,
           m_sug.slug AS suggested_member_slug,
           rac.suggestion_type, rac.confidence, rac.appearance_count,
           rac.operator_decision, rac.operator_notes, rac.reviewed_by, rac.reviewed_at
    FROM net_recovery_alias_candidate rac
    LEFT JOIN members m_sug
      ON m_sug.historical_person_id = rac.suggested_person_id
      AND m_sug.deleted_at IS NULL
    ORDER BY rac.appearance_count DESC, rac.stub_name ASC
  `); },

  get getById() { return db.prepare(`
    SELECT id FROM net_recovery_alias_candidate WHERE id = ?
  `); },

  get upsertCandidate() { return db.prepare(`
    INSERT INTO net_recovery_alias_candidate
      (id, stub_name, stub_person_id, suggested_person_id, suggested_person_name,
       suggestion_type, confidence, appearance_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(id) DO UPDATE SET
      appearance_count = excluded.appearance_count,
      suggested_person_name = excluded.suggested_person_name
  `); },

  get updateDecision() { return db.prepare(`
    UPDATE net_recovery_alias_candidate
    SET operator_decision = ?,
        operator_notes    = ?,
        reviewed_by       = ?,
        reviewed_at       = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `); },

  get listApproved() { return db.prepare(`
    SELECT stub_name, suggested_person_id, suggested_person_name,
           suggestion_type, operator_notes
    FROM net_recovery_alias_candidate
    WHERE operator_decision = 'approve'
    ORDER BY stub_name ASC
  `); },
};

// ---------------------------------------------------------------------------
// netEvents
//
// Event-centric reads for the net domain enrichment layer.
//
// STATISTICS FIREWALL: all appearance queries use the net_team_appearance_canonical
// view, which enforces evidence_class = 'canonical_only' at the DB layer.
// Never query net_team_appearance directly from this statement group.
//
// QC hints surfaced to public pages (safe summaries only, never raw review queue rows):
//   has_multi_stage_hint        = event contains multi-stage bracket results
//   unknown_team_excluded_count = count of results where team could not be linked
//   discipline_review_count     = count of disciplines flagged for review
//
// Routes: /net/events  |  /net/events/:eventId
// ---------------------------------------------------------------------------
export interface NetEventSummaryRow {
  event_id:                    string;
  event_tag_normalized:        string;   // #event_{year}_{slug} — used to build /events/ hrefs
  event_title:                 string;
  start_date:                  string;
  city:                        string;
  country:                     string;
  event_year:                  number;
  appearance_count:            number;
  discipline_count:            number;
  team_count:                  number;
  has_multi_stage_hint:        number;   // 0 or 1
  unknown_team_excluded_count: number;
  discipline_review_count:     number;
}

export interface NetEventAppearanceRow {
  appearance_id:   string;
  team_id:         string;
  person_id_a:     string;
  person_name_a:   string;
  country_a:       string | null;
  member_slug_a:   string | null;
  person_id_b:     string;
  person_name_b:   string;
  country_b:       string | null;
  member_slug_b:   string | null;
  discipline_id:   string;
  discipline_name: string;
  canonical_group: string | null;
  conflict_flag:   number;
  placement:       number;
  score_text:      string | null;
  event_year:      number;
}

const EVENT_SUMMARY_SELECT = `
    SELECT
      e.id                            AS event_id,
      t.tag_normalized                AS event_tag_normalized,
      e.title                         AS event_title,
      e.start_date,
      e.city,
      e.country,
      CAST(SUBSTR(e.start_date, 1, 4) AS INTEGER) AS event_year,
      COUNT(a.id)                     AS appearance_count,
      COUNT(DISTINCT a.discipline_id) AS discipline_count,
      COUNT(DISTINCT a.team_id)       AS team_count,
      COALESCE((
        SELECT 1 FROM net_review_queue rq
        WHERE rq.event_id = e.id AND rq.reason_code = 'multi_stage_result' LIMIT 1
      ), 0) AS has_multi_stage_hint,
      (
        SELECT COUNT(*) FROM net_review_queue rq
        WHERE rq.event_id = e.id AND rq.reason_code = 'unknown_team'
      ) AS unknown_team_excluded_count,
      (
        SELECT COUNT(DISTINCT disc_id) FROM (
          SELECT a2.discipline_id AS disc_id
          FROM net_team_appearance_canonical a2
          JOIN net_discipline_group dg ON dg.discipline_id = a2.discipline_id
          WHERE a2.event_id = e.id AND dg.conflict_flag = 1
          UNION
          SELECT rq2.discipline_id AS disc_id
          FROM net_review_queue rq2
          WHERE rq2.event_id = e.id AND rq2.reason_code = 'discipline_team_type_mismatch'
            AND rq2.discipline_id IS NOT NULL
        )
      ) AS discipline_review_count
    FROM events e
    JOIN tags t                          ON t.id = e.hashtag_tag_id
    JOIN net_team_appearance_canonical a ON a.event_id = e.id
`;

export const netEvents = {
  // STATS FIREWALL: all appearance joins use net_team_appearance_canonical view.

  get listEvents() { return db.prepare(
    EVENT_SUMMARY_SELECT + `
    GROUP BY e.id
    ORDER BY e.start_date DESC, e.title ASC
  `); },

  get getEventSummary() { return db.prepare(
    EVENT_SUMMARY_SELECT + `
    WHERE e.id = ?
    GROUP BY e.id
  `); },

  get listAppearancesByEventId() { return db.prepare(`
    -- STATS FIREWALL: uses net_team_appearance_canonical view
    SELECT
      a.id              AS appearance_id,
      a.team_id,
      t.person_id_a,
      pa.person_name    AS person_name_a,
      pa.country        AS country_a,
      ma.slug           AS member_slug_a,
      t.person_id_b,
      pb.person_name    AS person_name_b,
      pb.country        AS country_b,
      mb.slug           AS member_slug_b,
      a.discipline_id,
      ed.name           AS discipline_name,
      dg.canonical_group,
      COALESCE(dg.conflict_flag, 0) AS conflict_flag,
      a.placement,
      a.score_text,
      a.event_year
    FROM net_team_appearance_canonical a
    JOIN net_team t           ON t.team_id    = a.team_id
    JOIN historical_persons pa ON pa.person_id = t.person_id_a
    JOIN historical_persons pb ON pb.person_id = t.person_id_b
    JOIN event_disciplines ed  ON ed.id        = a.discipline_id
    LEFT JOIN net_discipline_group dg ON dg.discipline_id = a.discipline_id
    LEFT JOIN members ma
      ON ma.historical_person_id = pa.person_id
      AND ma.deleted_at IS NULL
    LEFT JOIN members mb
      ON mb.historical_person_id = pb.person_id
      AND mb.deleted_at IS NULL
    WHERE a.event_id = ?
    ORDER BY ed.name ASC, a.placement ASC
  `); },
};

// ---------------------------------------------------------------------------
// netHome
//
// Summary queries for the /net landing page.
//
// STATISTICS FIREWALL: all queries use net_team_appearance_canonical.
// No inferred data, no rankings, no match-level reconstruction.
//
// Route: /net
// ---------------------------------------------------------------------------
export interface NetHomeTopTeamRow {
  team_id:          string;
  person_id_a:      string;
  person_name_a:    string;
  country_a:        string | null;
  person_id_b:      string;
  person_name_b:    string;
  country_b:        string | null;
  first_year:       number | null;
  last_year:        number | null;
  appearance_count: number;
  win_count:        number;
  podium_count:     number;
  best_placement:   number;
}

export interface NetHomeTopPlayerRow {
  person_id:        string;
  person_name:      string;
  country:          string | null;
  partner_count:    number;
  appearance_count: number;
}

export interface NetNotablePlayerRow {
  person_id:         string;
  person_name:       string;
  country:           string | null;
  member_slug:       string | null;
  total_appearances: number;
  total_wins:        number;
  total_podiums:     number;
  first_year:        number | null;
  last_year:         number | null;
  partner_count:     number;
}

export interface NetHomeRecentEventRow {
  event_id:             string;
  event_tag_normalized: string;   // #event_{year}_{slug} — used to build /events/ hrefs
  event_title:          string;
  start_date:           string;
  event_year:           number;
  appearance_count:     number;
  has_multi_stage_hint: number;   // 0 or 1
}

export interface NetHomeInterestingTeamRow {
  team_id:          string;
  person_id_a:      string;
  person_name_a:    string;
  country_a:        string | null;
  person_id_b:      string;
  person_name_b:    string;
  country_b:        string | null;
  first_year:       number | null;
  last_year:        number | null;
  appearance_count: number;
  year_span_length: number;
  win_count:        number;
  best_placement:   number;
}

export const netHome = {
  // STATS FIREWALL: all queries use net_team_appearance_canonical view.

  get getTopTeams() { return db.prepare(`
    SELECT
      t.team_id,
      t.person_id_a,
      pa.person_name  AS person_name_a,
      pa.country      AS country_a,
      t.person_id_b,
      pb.person_name  AS person_name_b,
      pb.country      AS country_b,
      t.first_year,
      t.last_year,
      t.appearance_count,
      SUM(CASE WHEN a.placement = 1 THEN 1 ELSE 0 END) AS win_count,
      SUM(CASE WHEN a.placement <= 3 THEN 1 ELSE 0 END) AS podium_count,
      MIN(a.placement) AS best_placement
    FROM net_team t
    JOIN historical_persons pa ON pa.person_id = t.person_id_a
    JOIN historical_persons pb ON pb.person_id = t.person_id_b
    JOIN net_team_appearance_canonical a ON a.team_id = t.team_id
    WHERE pa.person_name != 'Unknown' AND pb.person_name != 'Unknown'
    GROUP BY t.team_id
    ORDER BY t.appearance_count DESC, t.last_year DESC
    LIMIT 10
  `); },

  get getTopPlayersByPartners() { return db.prepare(`
    -- STATS FIREWALL: counts partners only from canonical appearances.
    -- Uses team_id count as partner proxy (each team = one unique partner).
    -- Avoids expensive self-join on net_team_member.
    SELECT
      hp.person_id,
      hp.person_name,
      hp.country,
      COUNT(DISTINCT nm.team_id) AS partner_count,
      COUNT(a.id)                AS appearance_count
    FROM historical_persons hp
    JOIN net_team_member nm ON nm.person_id = hp.person_id
    JOIN net_team_appearance_canonical a ON a.team_id = nm.team_id
    GROUP BY hp.person_id
    ORDER BY partner_count DESC, appearance_count DESC
    LIMIT 10
  `); },

  get getRecentEvents() { return db.prepare(`
    -- STATS FIREWALL: only events with canonical appearances
    SELECT
      e.id                                AS event_id,
      t.tag_normalized                    AS event_tag_normalized,
      e.title                             AS event_title,
      e.start_date,
      CAST(SUBSTR(e.start_date, 1, 4) AS INTEGER) AS event_year,
      COUNT(a.id)                         AS appearance_count,
      COALESCE((
        SELECT 1 FROM net_review_queue rq
        WHERE rq.event_id = e.id AND rq.reason_code = 'multi_stage_result' LIMIT 1
      ), 0) AS has_multi_stage_hint
    FROM events e
    JOIN tags t                          ON t.id = e.hashtag_tag_id
    JOIN net_team_appearance_canonical a ON a.event_id = e.id
    GROUP BY e.id
    ORDER BY e.start_date DESC
    LIMIT 10
  `); },

  get getInterestingTeams() { return db.prepare(`
    -- Long-career teams: ordered by year span, then wins.
    -- STATS FIREWALL: uses net_team_appearance_canonical view.
    SELECT
      t.team_id,
      t.person_id_a,
      pa.person_name  AS person_name_a,
      pa.country      AS country_a,
      t.person_id_b,
      pb.person_name  AS person_name_b,
      pb.country      AS country_b,
      t.first_year,
      t.last_year,
      t.appearance_count,
      COALESCE(t.last_year, 0) - COALESCE(t.first_year, 0) AS year_span_length,
      SUM(CASE WHEN a.placement = 1 THEN 1 ELSE 0 END) AS win_count,
      MIN(a.placement) AS best_placement
    FROM net_team t
    JOIN historical_persons pa ON pa.person_id = t.person_id_a
    JOIN historical_persons pb ON pb.person_id = t.person_id_b
    JOIN net_team_appearance_canonical a ON a.team_id = t.team_id
    WHERE t.first_year IS NOT NULL AND t.last_year IS NOT NULL
      AND pa.person_name != 'Unknown' AND pb.person_name != 'Unknown'
    GROUP BY t.team_id
    ORDER BY year_span_length DESC, win_count DESC, best_placement ASC
    LIMIT 10
  `); },

  /** Player aggregate pool for notable player buckets, top 100 by appearances. */
  get listNotablePlayerPool() { return db.prepare(`
    -- STATS FIREWALL: uses net_team_appearance_canonical view.
    -- Uses team_id count as partner proxy — avoids expensive self-join.
    SELECT
      hp.person_id,
      hp.person_name,
      hp.country,
      MAX(m.slug)                                            AS member_slug,
      COUNT(a.id)                                            AS total_appearances,
      SUM(CASE WHEN a.placement = 1 THEN 1 ELSE 0 END)     AS total_wins,
      SUM(CASE WHEN a.placement <= 3 THEN 1 ELSE 0 END)    AS total_podiums,
      MIN(a.event_year)                                      AS first_year,
      MAX(a.event_year)                                      AS last_year,
      COUNT(DISTINCT nm.team_id)                             AS partner_count
    FROM historical_persons hp
    JOIN net_team_member nm ON nm.person_id = hp.person_id
    JOIN net_team_appearance_canonical a ON a.team_id = nm.team_id
    LEFT JOIN members m
      ON m.historical_person_id = hp.person_id
      AND m.deleted_at IS NULL
    WHERE hp.person_name NOT IN ('Unknown', '__NON_PERSON__', '[UNKNOWN PARTNER]', '__UNKNOWN_PARTNER__')
    GROUP BY hp.person_id
    HAVING COUNT(a.id) >= 3
    ORDER BY total_appearances DESC
    LIMIT 100
  `); },
};

export const health = {
  get checkReady() { return db.prepare(`
    SELECT 1 AS is_ready
  `); },
};

// ---- QC-only (delete with pipeline-qc subsystem) ----
// ---------------------------------------------------------------------------
// netReview
//
// Internal / QC reads for the net enrichment review workflow.
// These queries are for operator review only; never exposed in public pages.
//
// Sources: net_review_queue, net_discipline_group, events, event_disciplines
// Route: GET /internal/net/review
// ---------------------------------------------------------------------------
export interface NetReviewSummaryRow {
  reason_code:       string | null;
  priority:          number;
  resolution_status: string;
  item_count:        number;
}

export interface NetReviewClassificationSummaryRow {
  classification: string;
  item_count:     number;
}

export interface NetReviewDecisionSummaryRow {
  decision_status: string;
  item_count:      number;
}

export interface NetReviewFixTypeSummaryRow {
  proposed_fix_type: string;
  item_count:        number;
}

export interface NetReviewTopEventRow {
  event_id:    string;
  event_title: string | null;
  item_count:  number;
}

export interface NetReviewTotalsRow {
  total:        number;
  classified:   number;
  decided:      number;
  unclassified: number;
}

export interface NetReviewItemRow {
  id:                string;
  item_type:         string;
  priority:          number;
  reason_code:       string | null;
  severity:          string;
  message:           string;
  event_id:          string | null;
  event_title:       string | null;
  discipline_id:     string | null;
  discipline_name:   string | null;
  review_stage:      string | null;
  resolution_status: string;
  imported_at:       string;
  // Classification metadata (all nullable)
  classification:             string | null;
  proposed_fix_type:          string | null;
  classification_confidence:  string | null;
  decision_status:            string | null;
  decision_notes:             string | null;
  classified_by:              string | null;
  classified_at:              string | null;
}

export interface NetReviewEventContextRow {
  event_id:   string;
  title:      string;
  start_date: string;
  city:       string;
  country:    string;
}

export interface NetReviewConflictDisciplineRow {
  discipline_id:   string;
  discipline_name: string;
  canonical_group: string;
  conflict_flag:   number;
  review_needed:   number;
  match_method:    string;
}

export interface NetReviewFilters {
  reason_code?:       string;
  priority?:          number;
  resolution_status?: string;
  event_id?:          string;
  classification?:    string;
  proposed_fix_type?: string;
  decision_status?:   string;
  limit?:             number;
  offset?:            number;
}

export const netReview = {
  get listReviewSummary() { return db.prepare(`
    SELECT reason_code, priority, resolution_status, COUNT(*) AS item_count
    FROM net_review_queue
    GROUP BY reason_code, priority, resolution_status
    ORDER BY priority ASC, reason_code ASC, resolution_status ASC
  `); },

  get getReviewEventContext() { return db.prepare(`
    SELECT id AS event_id, title, start_date, city, country
    FROM events WHERE id = ?
  `); },

  get listConflictDisciplines() { return db.prepare(`
    SELECT
      dg.discipline_id,
      ed.name   AS discipline_name,
      dg.canonical_group,
      dg.conflict_flag,
      dg.review_needed,
      dg.match_method
    FROM net_discipline_group dg
    JOIN event_disciplines ed ON ed.id = dg.discipline_id
    WHERE dg.conflict_flag = 1 OR dg.review_needed = 1
    ORDER BY dg.conflict_flag DESC, dg.review_needed DESC, ed.name ASC
  `); },

  get listClassificationSummary() { return db.prepare(`
    SELECT classification, COUNT(*) AS item_count
    FROM net_review_queue
    WHERE classification IS NOT NULL
    GROUP BY classification
    ORDER BY item_count DESC
  `); },

  get listDecisionSummary() { return db.prepare(`
    SELECT decision_status, COUNT(*) AS item_count
    FROM net_review_queue
    WHERE decision_status IS NOT NULL
    GROUP BY decision_status
    ORDER BY item_count DESC
  `); },

  get getReviewItemById() { return db.prepare(`
    SELECT id FROM net_review_queue WHERE id = ?
  `); },

  get listFixTypeSummary() { return db.prepare(`
    SELECT proposed_fix_type, COUNT(*) AS item_count
    FROM net_review_queue
    WHERE proposed_fix_type IS NOT NULL
    GROUP BY proposed_fix_type
    ORDER BY item_count DESC
  `); },

  get listActionableFixSummary() { return db.prepare(`
    SELECT proposed_fix_type, COUNT(*) AS item_count
    FROM net_review_queue
    WHERE decision_status IN ('fix_encoded', 'fix_active')
      AND proposed_fix_type IS NOT NULL
    GROUP BY proposed_fix_type
    ORDER BY item_count DESC
  `); },

  get listTopEventIssues() { return db.prepare(`
    SELECT rq.event_id, e.title AS event_title, COUNT(*) AS item_count
    FROM net_review_queue rq
    LEFT JOIN events e ON e.id = rq.event_id
    WHERE rq.event_id IS NOT NULL
    GROUP BY rq.event_id
    ORDER BY item_count DESC
    LIMIT 20
  `); },

  get countTotals() { return db.prepare(`
    SELECT
      COUNT(*)                                              AS total,
      COUNT(classification)                                 AS classified,
      COUNT(CASE WHEN decision_status IS NOT NULL THEN 1 END) AS decided,
      COUNT(CASE WHEN classification IS NULL THEN 1 END)   AS unclassified
    FROM net_review_queue
  `); },
};

/**
 * Dynamic query for review items with optional filtering.
 * Uses runtime db.prepare() since filter combinations are not enumerable.
 * Acceptable for a low-frequency internal review tool.
 */
// ---- QC-only (delete with pipeline-qc subsystem) ----
// ---------------------------------------------------------------------------
// netCandidates
//
// Internal / operator reads for the net candidate match review page.
// These queries are operator-only; never exposed in public pages.
// All rows have evidence_class = 'unresolved_candidate'.
// ---------------------------------------------------------------------------

export interface NetCandidateSummaryRow {
  review_status:    string;
  linked_count:     number;
  total_count:      number;
}

export interface NetCandidateSourceSummaryRow {
  source_file:            string;
  fragment_count:         number;
  candidate_count:        number;
  high_conf_count:        number;
  medium_conf_count:      number;
  low_conf_count:         number;
  linked_candidate_count: number;
}

export interface NetCandidateEventSummaryRow {
  event_id:               string | null;
  event_title:            string | null;
  candidate_count:        number;
  linked_candidate_count: number;
  avg_confidence:         number | null;
  year_hint:              number | null;
}

export interface NetCandidateYearSummaryRow {
  year_hint:              number | null;
  candidate_count:        number;
  linked_candidate_count: number;
  avg_confidence:         number | null;
}

export interface NetCandidateRow {
  candidate_id:        string;
  fragment_id:         string | null;
  event_id:            string | null;
  discipline_id:       string | null;
  player_a_raw_name:   string | null;
  player_b_raw_name:   string | null;
  player_a_person_id:  string | null;
  player_b_person_id:  string | null;
  raw_text:            string;
  extracted_score:     string | null;
  round_hint:          string | null;
  year_hint:           number | null;
  confidence_score:    number | null;
  review_status:       string;
  imported_at:         string;
  source_file:         string | null;
  event_title:         string | null;
  person_name_a:       string | null;
  person_name_b:       string | null;
  member_slug_a:       string | null;
  member_slug_b:       string | null;
}

export interface NetCandidateFilters {
  review_status?:  string;
  event_id?:       string;
  source_file?:    string;
  linked_only?:    boolean;
  min_confidence?: number;
  limit?:          number;
  offset?:         number;
}

export const netCandidates = {
  get listSummary() { return db.prepare(`
    SELECT
      review_status,
      SUM(CASE WHEN player_a_person_id IS NOT NULL AND player_b_person_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_count,
      COUNT(*) AS total_count
    FROM net_candidate_match
    GROUP BY review_status
    ORDER BY review_status ASC
  `); },
  get getTotalCount() { return db.prepare(`SELECT COUNT(*) AS cnt FROM net_candidate_match`); },
  get getTotalFragmentCount() { return db.prepare(`SELECT COUNT(*) AS cnt FROM net_raw_fragment`); },

  get listSummaryBySource() { return db.prepare(`
    SELECT
      f.source_file,
      COUNT(DISTINCT f.id) AS fragment_count,
      COUNT(c.candidate_id) AS candidate_count,
      SUM(CASE WHEN c.confidence_score >= 0.85 THEN 1 ELSE 0 END) AS high_conf_count,
      SUM(CASE WHEN c.confidence_score >= 0.70 AND c.confidence_score < 0.85 THEN 1 ELSE 0 END) AS medium_conf_count,
      SUM(CASE WHEN c.confidence_score IS NOT NULL AND c.confidence_score < 0.70 THEN 1 ELSE 0 END) AS low_conf_count,
      SUM(CASE WHEN c.player_a_person_id IS NOT NULL AND c.player_b_person_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_candidate_count
    FROM net_raw_fragment f
    LEFT JOIN net_candidate_match c ON c.fragment_id = f.id
    GROUP BY f.source_file
    ORDER BY candidate_count DESC, fragment_count DESC
  `); },

  get listSummaryByEvent() { return db.prepare(`
    SELECT
      c.event_id,
      e.title AS event_title,
      COUNT(*) AS candidate_count,
      SUM(CASE WHEN c.player_a_person_id IS NOT NULL AND c.player_b_person_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_candidate_count,
      AVG(c.confidence_score) AS avg_confidence,
      c.year_hint
    FROM net_candidate_match c
    LEFT JOIN events e ON e.id = c.event_id
    WHERE c.event_id IS NOT NULL
    GROUP BY c.event_id
    ORDER BY candidate_count DESC, c.event_id ASC
  `); },

  get listSummaryByYear() { return db.prepare(`
    SELECT
      c.year_hint,
      COUNT(*) AS candidate_count,
      SUM(CASE WHEN c.player_a_person_id IS NOT NULL AND c.player_b_person_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_candidate_count,
      AVG(c.confidence_score) AS avg_confidence
    FROM net_candidate_match c
    WHERE c.year_hint IS NOT NULL
    GROUP BY c.year_hint
    ORDER BY c.year_hint ASC
  `); },
};

/**
 * Dynamic candidate query, filter by review_status, event_id, linked_only.
 * Uses runtime db.prepare() since filter combinations are not enumerable.
 * Acceptable for a low-frequency internal review tool.
 */
export function queryCandidateItems(filters: NetCandidateFilters): NetCandidateRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.review_status) {
    conditions.push('c.review_status = ?');
    params.push(filters.review_status);
  }
  if (filters.event_id) {
    conditions.push('c.event_id = ?');
    params.push(filters.event_id);
  }
  if (filters.source_file) {
    conditions.push('f.source_file = ?');
    params.push(filters.source_file);
  }
  if (filters.linked_only) {
    conditions.push('c.player_a_person_id IS NOT NULL AND c.player_b_person_id IS NOT NULL');
  }
  if (filters.min_confidence !== undefined) {
    conditions.push('c.confidence_score >= ?');
    params.push(filters.min_confidence);
  }

  const where  = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit  = Math.min(filters.limit  ?? 50, 200);
  const offset = filters.offset ?? 0;
  params.push(limit, offset);

  return db.prepare(`
    SELECT
      c.candidate_id, c.fragment_id,
      c.event_id,       e.title        AS event_title,
      c.discipline_id,
      c.player_a_raw_name, c.player_b_raw_name,
      c.player_a_person_id, pa.person_name AS person_name_a,
      c.player_b_person_id, pb.person_name AS person_name_b,
      ma.slug AS member_slug_a,
      mb.slug AS member_slug_b,
      c.raw_text, c.extracted_score, c.round_hint, c.year_hint,
      c.confidence_score, c.review_status, c.imported_at,
      f.source_file
    FROM net_candidate_match c
    LEFT JOIN events            e   ON e.id            = c.event_id
    LEFT JOIN net_raw_fragment  f   ON f.id             = c.fragment_id
    LEFT JOIN historical_persons pa ON pa.person_id     = c.player_a_person_id
    LEFT JOIN historical_persons pb ON pb.person_id     = c.player_b_person_id
    LEFT JOIN members ma
      ON ma.historical_person_id = c.player_a_person_id
      AND ma.deleted_at IS NULL
    LEFT JOIN members mb
      ON mb.historical_person_id = c.player_b_person_id
      AND mb.deleted_at IS NULL
    ${where}
    ORDER BY c.confidence_score DESC, c.imported_at DESC
    LIMIT ? OFFSET ?
  `).all(...params) as NetCandidateRow[];
}

// ---- QC-only (delete with pipeline-qc subsystem) ----
// ---------------------------------------------------------------------------
// netCurated
//
// Internal / operator statements for the candidate → curated promotion workflow.
// evidence_class for net_curated_match rows is always 'curated_enrichment'.
// Both approvals and rejections are stored for a complete audit trail.
// ---------------------------------------------------------------------------

export interface NetCuratedDetailRow {
  candidate_id:        string;
  fragment_id:         string | null;
  event_id:            string | null;
  event_title:         string | null;
  discipline_id:       string | null;
  discipline_name:     string | null;
  player_a_raw_name:   string | null;
  player_b_raw_name:   string | null;
  player_a_person_id:  string | null;
  person_name_a:       string | null;
  member_slug_a:       string | null;
  player_b_person_id:  string | null;
  person_name_b:       string | null;
  member_slug_b:       string | null;
  raw_text:            string;
  extracted_score:     string | null;
  round_hint:          string | null;
  year_hint:           number | null;
  confidence_score:    number | null;
  review_status:       string;
  imported_at:         string;
  source_file:         string | null;
}

export interface NetCuratedMatchRow {
  curated_id:         string;
  candidate_id:       string;
  curated_status:     string;
  curator_note:       string | null;
  curated_at:         string;
  curated_by:         string;
}

export const netCurated = {
  get getCandidateById() { return db.prepare(`
    SELECT
      c.candidate_id, c.fragment_id,
      c.event_id,       e.title       AS event_title,
      c.discipline_id,  ed.name       AS discipline_name,
      c.player_a_raw_name, c.player_b_raw_name,
      c.player_a_person_id, pa.person_name AS person_name_a,
      c.player_b_person_id, pb.person_name AS person_name_b,
      ma.slug AS member_slug_a,
      mb.slug AS member_slug_b,
      c.raw_text, c.extracted_score, c.round_hint, c.year_hint,
      c.confidence_score, c.review_status, c.imported_at,
      f.source_file
    FROM net_candidate_match c
    LEFT JOIN events             e   ON e.id         = c.event_id
    LEFT JOIN event_disciplines  ed  ON ed.id        = c.discipline_id
    LEFT JOIN net_raw_fragment   f   ON f.id         = c.fragment_id
    LEFT JOIN historical_persons pa  ON pa.person_id = c.player_a_person_id
    LEFT JOIN historical_persons pb  ON pb.person_id = c.player_b_person_id
    LEFT JOIN members ma
      ON ma.historical_person_id = c.player_a_person_id
      AND ma.deleted_at IS NULL
    LEFT JOIN members mb
      ON mb.historical_person_id = c.player_b_person_id
      AND mb.deleted_at IS NULL
    WHERE c.candidate_id = ?
  `); },

  get getCuratedByCandidate() { return db.prepare(`
    SELECT curated_id, candidate_id, curated_status, curator_note, curated_at, curated_by
    FROM net_curated_match
    WHERE candidate_id = ?
  `); },

  get insertCuratedMatch() { return db.prepare(`
    INSERT INTO net_curated_match
      (curated_id, candidate_id, curated_status, evidence_class,
       event_id, discipline_id, player_a_person_id, player_b_person_id,
       extracted_score, raw_text, curator_note,
       curated_at, curated_by)
    VALUES (?, ?, ?, 'curated_enrichment', ?, ?, ?, ?, ?, ?, ?,
            strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?)
  `); },

  get updateCandidateStatus() { return db.prepare(`
    UPDATE net_candidate_match SET review_status = ? WHERE candidate_id = ?
  `); },
};

// ---- QC-only (delete with pipeline-qc subsystem) ----
// ---------------------------------------------------------------------------
// netCuratedBrowse
//
// Internal / operator queries for browsing the net_curated_match collection.
// Read-only. Never exposed on public pages.
// source_file and year_hint are sourced via net_candidate_match / net_raw_fragment
// because net_curated_match snapshots only the identity fields needed for audit.
// ---------------------------------------------------------------------------

export interface NetCuratedStatusSummaryRow {
  curated_status: string;
  item_count:     number;
}

export interface NetCuratedSourceSummaryRow {
  source_file:    string | null;
  curated_count:  number;
  approved_count: number;
  rejected_count: number;
}

export interface NetCuratedEventSummaryRow {
  event_id:       string;
  event_title:    string | null;
  curated_count:  number;
  approved_count: number;
  rejected_count: number;
}

export interface NetCuratedYearSummaryRow {
  year_hint:      number;
  curated_count:  number;
  approved_count: number;
  rejected_count: number;
}

export interface NetCuratedBrowseRow {
  curated_id:          string;
  candidate_id:        string;
  curated_status:      string;
  curator_note:        string | null;
  curated_by:          string;
  curated_at:          string;
  event_id:            string | null;
  event_title:         string | null;
  discipline_id:       string | null;
  discipline_name:     string | null;
  player_a_person_id:  string | null;
  person_name_a:       string | null;
  member_slug_a:       string | null;
  player_b_person_id:  string | null;
  person_name_b:       string | null;
  member_slug_b:       string | null;
  player_a_raw_name:   string | null;
  player_b_raw_name:   string | null;
  extracted_score:     string | null;
  raw_text:            string;
  round_hint:          string | null;
  year_hint:           number | null;
  source_file:         string | null;
}

export interface NetCuratedBrowseFilters {
  curated_status?: string;
  source_file?:    string;
  event_id?:       string;
  year_hint?:      number;
  linked_only?:    boolean;
  limit?:          number;
  offset?:         number;
}

export const netCuratedBrowse = {
  get getTotalCount() { return db.prepare(`SELECT COUNT(*) AS cnt FROM net_curated_match`); },

  get getLinkedCount() { return db.prepare(`
    SELECT COUNT(*) AS cnt FROM net_curated_match
    WHERE player_a_person_id IS NOT NULL AND player_b_person_id IS NOT NULL
  `); },

  get listStatusSummary() { return db.prepare(`
    SELECT curated_status, COUNT(*) AS item_count
    FROM net_curated_match
    GROUP BY curated_status
    ORDER BY curated_status ASC
  `); },

  get listBySource() { return db.prepare(`
    SELECT
      f.source_file,
      COUNT(*)                                                            AS curated_count,
      SUM(CASE WHEN cm.curated_status = 'approved' THEN 1 ELSE 0 END)   AS approved_count,
      SUM(CASE WHEN cm.curated_status = 'rejected' THEN 1 ELSE 0 END)   AS rejected_count
    FROM net_curated_match cm
    JOIN net_candidate_match  c ON c.candidate_id = cm.candidate_id
    LEFT JOIN net_raw_fragment f ON f.id          = c.fragment_id
    GROUP BY f.source_file
    ORDER BY curated_count DESC, f.source_file ASC
  `); },

  get listByEvent() { return db.prepare(`
    SELECT
      cm.event_id,
      e.title                                                             AS event_title,
      COUNT(*)                                                            AS curated_count,
      SUM(CASE WHEN cm.curated_status = 'approved' THEN 1 ELSE 0 END)   AS approved_count,
      SUM(CASE WHEN cm.curated_status = 'rejected' THEN 1 ELSE 0 END)   AS rejected_count
    FROM net_curated_match cm
    LEFT JOIN events e ON e.id = cm.event_id
    WHERE cm.event_id IS NOT NULL
    GROUP BY cm.event_id
    ORDER BY curated_count DESC, cm.event_id ASC
  `); },

  get listByYear() { return db.prepare(`
    SELECT
      c.year_hint,
      COUNT(*)                                                            AS curated_count,
      SUM(CASE WHEN cm.curated_status = 'approved' THEN 1 ELSE 0 END)   AS approved_count,
      SUM(CASE WHEN cm.curated_status = 'rejected' THEN 1 ELSE 0 END)   AS rejected_count
    FROM net_curated_match cm
    JOIN net_candidate_match c ON c.candidate_id = cm.candidate_id
    WHERE c.year_hint IS NOT NULL
    GROUP BY c.year_hint
    ORDER BY c.year_hint ASC
  `); },
};

/**
 * Dynamic curated-match browse query, filter by status, source, event, year, linked.
 * Uses runtime db.prepare() for filter flexibility on a low-frequency internal tool.
 */
export function queryCuratedItems(filters: NetCuratedBrowseFilters): NetCuratedBrowseRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.curated_status) {
    conditions.push('cm.curated_status = ?');
    params.push(filters.curated_status);
  }
  if (filters.event_id) {
    conditions.push('cm.event_id = ?');
    params.push(filters.event_id);
  }
  if (filters.source_file) {
    conditions.push('f.source_file = ?');
    params.push(filters.source_file);
  }
  if (filters.year_hint !== undefined) {
    conditions.push('c.year_hint = ?');
    params.push(filters.year_hint);
  }
  if (filters.linked_only) {
    conditions.push('cm.player_a_person_id IS NOT NULL AND cm.player_b_person_id IS NOT NULL');
  }

  const where  = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit  = Math.min(filters.limit  ?? 50, 200);
  const offset = filters.offset ?? 0;
  params.push(limit, offset);

  return db.prepare(`
    SELECT
      cm.curated_id, cm.candidate_id, cm.curated_status,
      cm.curator_note, cm.curated_by, cm.curated_at,
      cm.event_id,       e.title        AS event_title,
      cm.discipline_id,  ed.name        AS discipline_name,
      cm.player_a_person_id, pa.person_name AS person_name_a,
      cm.player_b_person_id, pb.person_name AS person_name_b,
      ma.slug AS member_slug_a,
      mb.slug AS member_slug_b,
      cm.extracted_score, cm.raw_text,
      c.player_a_raw_name, c.player_b_raw_name,
      c.round_hint, c.year_hint,
      f.source_file
    FROM net_curated_match cm
    JOIN  net_candidate_match  c   ON c.candidate_id  = cm.candidate_id
    LEFT JOIN events             e   ON e.id           = cm.event_id
    LEFT JOIN event_disciplines  ed  ON ed.id          = cm.discipline_id
    LEFT JOIN net_raw_fragment   f   ON f.id           = c.fragment_id
    LEFT JOIN historical_persons pa  ON pa.person_id   = cm.player_a_person_id
    LEFT JOIN historical_persons pb  ON pb.person_id   = cm.player_b_person_id
    LEFT JOIN members ma
      ON ma.historical_person_id = cm.player_a_person_id
      AND ma.deleted_at IS NULL
    LEFT JOIN members mb
      ON mb.historical_person_id = cm.player_b_person_id
      AND mb.deleted_at IS NULL
    ${where}
    ORDER BY cm.curated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params) as NetCuratedBrowseRow[];
}

export function queryReviewItems(filters: NetReviewFilters): NetReviewItemRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.reason_code) {
    conditions.push('rq.reason_code = ?');
    params.push(filters.reason_code);
  }
  if (filters.priority !== undefined) {
    conditions.push('rq.priority = ?');
    params.push(filters.priority);
  }
  if (filters.resolution_status) {
    conditions.push('rq.resolution_status = ?');
    params.push(filters.resolution_status);
  }
  if (filters.event_id) {
    conditions.push('rq.event_id = ?');
    params.push(filters.event_id);
  }
  if (filters.classification) {
    conditions.push('rq.classification = ?');
    params.push(filters.classification);
  }
  if (filters.proposed_fix_type) {
    conditions.push('rq.proposed_fix_type = ?');
    params.push(filters.proposed_fix_type);
  }
  if (filters.decision_status) {
    conditions.push('rq.decision_status = ?');
    params.push(filters.decision_status);
  }

  const where   = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit   = Math.min(filters.limit  ?? 50, 200);
  const offset  = filters.offset ?? 0;
  params.push(limit, offset);

  return db.prepare(`
    SELECT
      rq.id, rq.item_type, rq.priority, rq.reason_code, rq.severity, rq.message,
      rq.event_id,      e.title      AS event_title,
      rq.discipline_id, ed.name      AS discipline_name,
      rq.review_stage,  rq.resolution_status, rq.imported_at,
      rq.classification, rq.proposed_fix_type, rq.classification_confidence,
      rq.decision_status, rq.decision_notes, rq.classified_by, rq.classified_at
    FROM net_review_queue rq
    LEFT JOIN events            e   ON e.id   = rq.event_id
    LEFT JOIN event_disciplines ed  ON ed.id  = rq.discipline_id
    ${where}
    ORDER BY rq.priority ASC, rq.imported_at DESC
    LIMIT ? OFFSET ?
  `).all(...params) as NetReviewItemRow[];
}

/**
 * Partial UPDATE of classification fields on a net_review_queue row.
 * Only fields present in `fields` are updated. `classified_by` and
 * `classified_at` are always stamped. Uses runtime db.prepare() for
 * partial-update flexibility; acceptable for a low-frequency internal tool.
 * Returns true if the row existed and was modified.
 */
export function updateReviewClassification(
  id: string,
  fields: Partial<{
    classification:            string | null;
    proposed_fix_type:         string | null;
    classification_confidence: string | null;
  }>,
  classifiedBy: string,
): boolean {
  const sets: string[] = [
    'classified_by = ?',
    "classified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  ];
  const params: (string | null)[] = [classifiedBy];

  if (Object.prototype.hasOwnProperty.call(fields, 'classification')) {
    sets.push('classification = ?');
    params.push(fields.classification ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'proposed_fix_type')) {
    sets.push('proposed_fix_type = ?');
    params.push(fields.proposed_fix_type ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'classification_confidence')) {
    sets.push('classification_confidence = ?');
    params.push(fields.classification_confidence ?? null);
  }

  params.push(id);
  const result = db.prepare(
    `UPDATE net_review_queue SET ${sets.join(', ')} WHERE id = ?`,
  ).run(...params);
  return result.changes > 0;
}

/**
 * Partial UPDATE of decision fields on a net_review_queue row.
 * Only fields present in `fields` are updated. `classified_by` and
 * `classified_at` are always stamped.
 */
export function updateReviewDecisionFields(
  id: string,
  fields: Partial<{
    decision_status: string | null;
    decision_notes:  string | null;
  }>,
  classifiedBy: string,
): boolean {
  const sets: string[] = [
    'classified_by = ?',
    "classified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  ];
  const params: (string | null)[] = [classifiedBy];

  if (Object.prototype.hasOwnProperty.call(fields, 'decision_status')) {
    sets.push('decision_status = ?');
    params.push(fields.decision_status ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'decision_notes')) {
    sets.push('decision_notes = ?');
    params.push(fields.decision_notes ?? null);
  }

  params.push(id);
  const result = db.prepare(
    `UPDATE net_review_queue SET ${sets.join(', ')} WHERE id = ?`,
  ).run(...params);
  return result.changes > 0;
}

export interface MemberAuthRow {
  id: string;
  slug: string | null;
  display_name: string;
  password_hash: string;
  password_version: number;
  is_admin: number;
}

export interface MemberProfileRow {
  id: string;
  slug: string | null;
  display_name: string;
  bio: string;
  city: string | null;
  region: string | null;
  country: string | null;
  birth_date: string | null;
  phone: string | null;
  whatsapp: string | null;
  email_visibility: string;
  phone_visible: number;
  whatsapp_visible: number;
  searchable: number;
  gender: string | null;
  is_admin: number;
  is_hof: number;
  is_bap: number;
  is_board: number;
  first_competition_year: number | null;
  show_competitive_results: number;
  show_first_competition_year: number;
  show_gender: number;
  legacy_member_id: string | null;
  historical_person_id: string | null;
  login_email: string;
  avatar_thumb_key: string | null;
  avatar_media_id: string | null;
  historical_person_name: string | null;
  historical_first_year: number | null;
  historical_bap_nickname: string | null;
  historical_bap_induction_year: number | null;
  historical_hof_induction_year: number | null;
}

export interface MemberResultRow {
  event_id: string;
  event_title: string;
  start_date: string;
  city: string;
  event_region: string | null;
  event_country: string;
  event_tag_normalized: string;
  discipline_name: string | null;
  discipline_category: string | null;
  team_type: string | null;
  placement: number;
  score_text: string | null;
  participant_display_name: string;
  participant_person_id: string | null;
  participant_member_slug: string | null;
  participant_member_id: string | null;
}

export interface MemberSearchRow {
  slug: string;
  display_name: string;
  country: string | null;
  is_hof: number;
  is_bap: number;
  is_board: number;
  gender: string | null;
  show_gender: number;
}

export interface IdentityLinksRow {
  legacy_member_id:       string | null;
  legacy_claimed_at:      string | null;
  historical_person_id:   string | null;
  historical_person_name: string | null;
}

export const account = {
  get findMemberBySlug() { return db.prepare(`
    SELECT
      m.id,
      m.slug,
      m.display_name,
      m.bio,
      m.city,
      m.region,
      m.country,
      m.birth_date,
      m.phone,
      m.whatsapp,
      m.email_visibility,
      m.phone_visible,
      m.whatsapp_visible,
      m.searchable,
      m.gender,
      m.is_admin,
      m.is_hof,
      m.is_bap,
      m.is_board,
      m.first_competition_year,
      m.show_competitive_results,
      m.show_first_competition_year,
      m.show_gender,
      m.legacy_member_id,
      m.historical_person_id,
      m.login_email,
      mi.s3_key_thumb AS avatar_thumb_key,
      mi.id           AS avatar_media_id,
      hp.person_name AS historical_person_name,
      hp.first_year AS historical_first_year,
      hp.bap_nickname AS historical_bap_nickname,
      hp.bap_induction_year AS historical_bap_induction_year,
      hp.hof_induction_year AS historical_hof_induction_year
    FROM members_active AS m
    LEFT JOIN media_items AS mi
      ON mi.id = m.avatar_media_id
    LEFT JOIN historical_persons AS hp
      ON hp.person_id = m.historical_person_id
    WHERE m.slug = ?
      AND m.personal_data_purged_at IS NULL
  `); },

  get findMemberById() { return db.prepare(`
    SELECT
      m.id,
      m.slug,
      m.display_name,
      m.bio,
      m.city,
      m.region,
      m.country,
      m.phone,
      m.email_visibility,
      m.is_admin,
      m.is_hof,
      m.is_bap,
      mi.s3_key_thumb AS avatar_thumb_key,
      mi.id           AS avatar_media_id
    FROM members_active AS m
    LEFT JOIN media_items AS mi
      ON mi.id = m.avatar_media_id
    WHERE m.id = ?
      AND m.personal_data_purged_at IS NULL
  `); },

  get getIsAdmin() { return db.prepare(`
    SELECT is_admin FROM members_active
    WHERE id = ? AND personal_data_purged_at IS NULL
  `); },

  // Read just the legacy_member_id linkage for an authenticated member.
  // Used by the wizard's club_affiliations dispatcher to scope candidate
  // queries to the member's own legacy identity (F1 anti-enumeration:
  // candidates belonging to other members are unreachable at the query
  // layer). Returns null when the member has not yet completed legacy_claim
  // (legacy_member_id IS NULL).
  get findLegacyMemberIdById() { return db.prepare(`
    SELECT legacy_member_id
      FROM members_active
     WHERE id = ?
       AND personal_data_purged_at IS NULL
  `); },

  // Used by the onboarding wizard to decide whether the legacy_claim task is
  // already satisfied. Either link being non-null counts as "linked" because
  // the merge writes both together when the legacy row carries an HP back-link.
  get findLegacyAndHpIdsById() { return db.prepare(`
    SELECT legacy_member_id, historical_person_id
      FROM members_active
     WHERE id = ?
       AND personal_data_purged_at IS NULL
  `); },

  // Used by support-flow email replies: fetch the member's login email + slug
  // for resolution notifications. Excludes purged members.
  get findContactInfoById() { return db.prepare(`
    SELECT id, slug, display_name, login_email
    FROM members_active
    WHERE id = ? AND personal_data_purged_at IS NULL
  `); },

  // Recipient lookup for automated member notifications (tier change, honor
  // congratulation, vouch confirmation). Excludes the deceased so a posthumous
  // honor or an admin correction on a deceased member's record sends no mail to
  // an address no one reads, alongside the purged exclusion.
  get findNotificationContactById() { return db.prepare(`
    SELECT id, slug, display_name, login_email
    FROM members_active
    WHERE id = ? AND personal_data_purged_at IS NULL AND is_deceased = 0
  `); },

  get listAdminMemberIds() { return db.prepare(`
    SELECT id FROM members_active
    WHERE is_admin = 1
      AND personal_data_purged_at IS NULL
  `); },

  // Current admins for the admin-roles management page: id plus the fields the
  // page renders (display name and the profile slug), ordered for a stable list.
  get listAdminsForDisplay() { return db.prepare(`
    SELECT id, slug, display_name FROM members_active
    WHERE is_admin = 1
      AND personal_data_purged_at IS NULL
    ORDER BY display_name COLLATE NOCASE
  `); },

  // Resolve an admin-entered member key (slug or id) to an active member, for
  // admin tooling that names a target by either handle.
  get findActiveMemberByKey() { return db.prepare(`
    SELECT id, slug, display_name FROM members_active WHERE slug = ? OR id = ?
  `); },

  get findIdentityLinks() { return db.prepare(`
    SELECT
      m.legacy_member_id,
      lm.claimed_at  AS legacy_claimed_at,
      m.historical_person_id,
      hp.person_name AS historical_person_name
    FROM members_active AS m
    LEFT JOIN legacy_members AS lm
      ON lm.legacy_member_id = m.legacy_member_id
    LEFT JOIN historical_persons AS hp
      ON hp.person_id = m.historical_person_id
    WHERE m.id = ?
      AND m.personal_data_purged_at IS NULL
  `); },

  get listResultsByMemberId() { return db.prepare(`
    SELECT
      e.id                        AS event_id,
      e.title                     AS event_title,
      e.start_date,
      e.city,
      e.region                    AS event_region,
      e.country                   AS event_country,
      t.tag_normalized            AS event_tag_normalized,
      ed.name                     AS discipline_name,
      ed.discipline_category,
      ed.team_type,
      ere.placement,
      ere.score_text,
      erp_co.display_name         AS participant_display_name,
      erp_co.historical_person_id AS participant_person_id,
      COALESCE(m_co_linked.slug, m_co_via_hp.slug) AS participant_member_slug,
      erp_co.member_id            AS participant_member_id
    FROM event_result_entry_participants AS erp_me
    JOIN event_result_entries AS ere
      ON ere.id = erp_me.result_entry_id
    JOIN events AS e
      ON e.id = ere.event_id
    JOIN tags AS t
      ON t.id = e.hashtag_tag_id
    LEFT JOIN event_disciplines AS ed
      ON ed.id = ere.discipline_id
    JOIN event_result_entry_participants AS erp_co
      ON erp_co.result_entry_id = ere.id
    LEFT JOIN members AS m_co_linked
      ON m_co_linked.id = erp_co.member_id
      AND m_co_linked.deleted_at IS NULL
    LEFT JOIN members AS m_co_via_hp
      ON m_co_via_hp.historical_person_id = erp_co.historical_person_id
      AND m_co_via_hp.deleted_at IS NULL
    WHERE erp_me.member_id = ?
    ORDER BY
      e.start_date DESC,
      COALESCE(ed.sort_order, 0) ASC,
      COALESCE(ed.name, '') COLLATE NOCASE ASC,
      ere.placement ASC,
      erp_co.participant_order ASC
  `); },

  get listResultsByLegacyMemberId() { return db.prepare(`
    SELECT
      e.id                        AS event_id,
      e.title                     AS event_title,
      e.start_date,
      e.city,
      e.region                    AS event_region,
      e.country                   AS event_country,
      t.tag_normalized            AS event_tag_normalized,
      ed.name                     AS discipline_name,
      ed.discipline_category,
      ed.team_type,
      ere.placement,
      ere.score_text,
      erp_co.display_name         AS participant_display_name,
      erp_co.historical_person_id AS participant_person_id,
      COALESCE(m_co_linked.slug, m_co_via_hp.slug) AS participant_member_slug,
      erp_co.member_id            AS participant_member_id
    FROM event_result_entry_participants AS erp_me
    JOIN historical_persons AS hp
      ON hp.person_id = erp_me.historical_person_id
    JOIN event_result_entries AS ere
      ON ere.id = erp_me.result_entry_id
    JOIN events AS e
      ON e.id = ere.event_id
    JOIN tags AS t
      ON t.id = e.hashtag_tag_id
    LEFT JOIN event_disciplines AS ed
      ON ed.id = ere.discipline_id
    JOIN event_result_entry_participants AS erp_co
      ON erp_co.result_entry_id = ere.id
    LEFT JOIN members AS m_co_linked
      ON m_co_linked.id = erp_co.member_id
      AND m_co_linked.deleted_at IS NULL
    LEFT JOIN members AS m_co_via_hp
      ON m_co_via_hp.historical_person_id = erp_co.historical_person_id
      AND m_co_via_hp.deleted_at IS NULL
    WHERE hp.legacy_member_id = ?
    ORDER BY
      e.start_date DESC,
      COALESCE(ed.sort_order, 0) ASC,
      COALESCE(ed.name, '') COLLATE NOCASE ASC,
      ere.placement ASC,
      erp_co.participant_order ASC
  `); },

  get searchMembers() { return db.prepare(`
    SELECT slug, display_name, country, is_hof, is_bap, is_board, gender, show_gender
    FROM members_searchable
    WHERE display_name_normalized LIKE '%' || ? || '%' ESCAPE '\\'
    ORDER BY display_name_normalized
    LIMIT ?
  `); },

  get updateMemberProfile() { return db.prepare(`
    UPDATE members
    SET
      bio                        = ?,
      city                       = ?,
      region                     = ?,
      country                    = ?,
      phone                      = ?,
      whatsapp                   = ?,
      email_visibility           = ?,
      phone_visible              = ?,
      whatsapp_visible           = ?,
      searchable                 = ?,
      first_competition_year     = ?,
      show_competitive_results   = ?,
      show_first_competition_year = ?,
      show_gender                = ?,
      gender                     = COALESCE(?, gender),
      updated_at                 = ?,
      updated_by                 = 'member',
      version                    = version + 1
    WHERE id = ?
  `); },

  get findCompetitionFieldsByMemberId() { return db.prepare(`
    SELECT
      m.first_competition_year,
      m.show_competitive_results,
      hp.first_year AS historical_first_year
    FROM members_active AS m
    LEFT JOIN historical_persons AS hp
      ON hp.person_id = m.historical_person_id
    WHERE m.id = ?
      AND m.personal_data_purged_at IS NULL
  `); },


  get updateMemberPersonalDetails() { return db.prepare(`
    UPDATE members
    SET
      city                        = ?,
      region                      = ?,
      country                     = ?,
      birth_date                  = ?,
      gender                      = ?,
      first_competition_year      = ?,
      show_first_competition_year = ?,
      updated_at                  = ?,
      updated_by                  = 'onboarding_wizard',
      version                     = version + 1
    WHERE id = ?
  `); },

  get findPersonalDetails() { return db.prepare(`
    SELECT city, region, country, birth_date, gender,
           first_competition_year, show_first_competition_year,
           show_competitive_results
    FROM members_active WHERE id = ?
  `); },

  get updateMemberFirstCompetitionYear() { return db.prepare(`
    UPDATE members
    SET
      first_competition_year = ?,
      updated_at             = ?,
      updated_by             = 'onboarding_wizard',
      version                = version + 1
    WHERE id = ?
  `); },

  get updateMemberShowCompetitiveResults() { return db.prepare(`
    UPDATE members
    SET
      show_competitive_results = ?,
      updated_at               = ?,
      updated_by               = 'onboarding_wizard',
      version                  = version + 1
    WHERE id = ?
  `); },
};

export const registration = {
  get checkEmailExists() { return db.prepare(`
    SELECT 1 AS exists_flag
    FROM members
    WHERE login_email_normalized = ?
      AND personal_data_purged_at IS NULL
  `); },

  // The existing account behind a duplicate registration, so the "account
  // already exists" notice reaches the real registered address. Matches any
  // non-purged member (verified or not), the same set checkEmailExists gates.
  get findForDuplicateNotice() { return db.prepare(`
    SELECT id, login_email
    FROM members
    WHERE login_email_normalized = ?
      AND personal_data_purged_at IS NULL
    LIMIT 1
  `); },

  get checkSlugExists() { return db.prepare(`
    SELECT 1 AS exists_flag
    FROM members
    WHERE slug = ?
  `); },

  get insertMember() { return db.prepare(`
    INSERT INTO members (
      id, slug,
      login_email, login_email_normalized, email_verified_at,
      password_hash, password_changed_at,
      real_name, display_name, display_name_normalized,
      gender,
      searchable,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'registration', ?, 'registration', 1)
  `); },

  get setAdminFlagOnRegister() { return db.prepare(`
    UPDATE members
       SET is_admin   = 1,
           updated_at = ?,
           updated_by = 'register_admin_bootstrap',
           version    = version + 1
     WHERE id = ?
  `); },

  // Production bootstrap grant. The NOT EXISTS clause makes the grant the
  // single-shot gate: it fires only while no admin exists, so a second
  // concurrent claim finds an admin already present and changes zero rows.
  // This holds the single-admin-creation invariant in the database rather than
  // relying on the external SSM-token deletion winning the race.
  get grantFirstAdmin() { return db.prepare(`
    UPDATE members
       SET is_admin   = 1,
           updated_at = ?,
           updated_by = 'register_admin_bootstrap',
           version    = version + 1
     WHERE id = ?
       AND NOT EXISTS (SELECT 1 FROM members WHERE is_admin = 1)
  `); },
};

export const auth = {
  get findUnverifiedMemberByEmail() { return db.prepare(`
    SELECT m.id
    FROM members_active AS m
    WHERE m.login_email_normalized = ?
      AND m.email_verified_at IS NULL
      AND m.is_deceased = 0
  `); },

  get markEmailVerified() { return db.prepare(`
    UPDATE members
    SET email_verified_at = ?,
        updated_at        = ?,
        updated_by        = 'system',
        version           = version + 1
    WHERE id = ? AND email_verified_at IS NULL
  `); },

  get findMemberForSessionAfterVerify() { return db.prepare(`
    SELECT id, slug, login_email, real_name, password_version, is_admin, birth_date
    FROM members_active
    WHERE id = ?
      AND is_deceased = 0
  `); },

  get findMemberByEmail() { return db.prepare(`
    SELECT
      m.id,
      m.slug,
      m.display_name,
      m.password_hash,
      m.password_version,
      m.is_admin
    FROM members_active AS m
    WHERE
      m.login_email_normalized = ?
      AND m.email_verified_at IS NOT NULL
      AND m.is_deceased = 0
  `); },

  get findMemberForSession() { return db.prepare(`
    SELECT
      m.id,
      m.slug,
      m.display_name,
      m.password_version,
      m.is_admin
    FROM members_active AS m
    WHERE m.id = ?
      AND m.email_verified_at IS NOT NULL
      AND m.is_deceased = 0
  `); },

  // Look a member up by slug for session issuance. Returns the same row shape
  // as findMemberForSession. Used by the persona-switch route
  // (GET /dev/switch?as=<slug>), which mints a real session cookie for the
  // resolved member; the route mounts under FOOTBAG_ENV in {development, staging}.
  get findMemberForSessionBySlug() { return db.prepare(`
    SELECT
      m.id,
      m.slug,
      m.display_name,
      m.password_version,
      m.is_admin
    FROM members_active AS m
    WHERE m.slug = ?
      AND m.email_verified_at IS NOT NULL
      AND m.is_deceased = 0
  `); },

  // Dev persona harness only: a raw existence probe the /dev/personas listing
  // uses to grey out any persona that has no seeded member row. It hits the bare
  // members table (not members_active or the session lookup) on purpose: a
  // seeded persona still counts as backed even when its state blocks login or
  // search, so unverified, deceased, and soft-deleted personas read as real and
  // are not greyed, they are simply not switchable.
  get personaMemberExistsBySlug() { return db.prepare(`
    SELECT 1 FROM members WHERE slug = ?
  `); },

  // Dev persona harness only: the login email for a seeded persona, so the
  // /dev/login affordance can drive the real login path by email. Hits the bare
  // members table (not the session/login views) because the personas it serves
  // are deliberately login-blocked (unverified, deceased, soft-deleted) and
  // would be filtered out of those views.
  get personaLoginEmailBySlug() { return db.prepare(`
    SELECT login_email FROM members WHERE slug = ?
  `); },

  get updateMemberLastLogin() { return db.prepare(`
    UPDATE members
    SET
      last_login_at = ?,
      updated_at    = ?,
      updated_by    = 'system',
      version       = version + 1
    WHERE id = ?
  `); },

  get findMemberForPasswordChange() { return db.prepare(`
    SELECT id, password_hash, password_version
    FROM members_active
    WHERE id = ?
      AND is_deceased = 0
  `); },

  get updateMemberPassword() { return db.prepare(`
    UPDATE members
    SET
      password_hash         = ?,
      password_version      = password_version + 1,
      password_changed_at   = ?,
      updated_at            = ?,
      updated_by            = 'member',
      version               = version + 1
    WHERE id = ?
  `); },
};

export const systemConfig = {
  get getValueByKey() { return db.prepare(`
    SELECT value_json
    FROM system_config_current
    WHERE config_key = ?
  `); },
};

export interface OutboxRow {
  id: string;
  recipient_email: string | null;
  recipient_member_id: string | null;
  subject: string;
  body_text: string;
  from_identity: string | null;
  retry_count: number;
  idempotency_key: string | null;
}

export interface AccountTokenRow {
  id: string;
  member_id: string;
  target_legacy_member_id: string | null;
  target_audit_entry_id: string | null;
  target_anchor_id: string | null;
  token_type: string;
  expires_at: string;
  used_at: string | null;
}

export const accountTokens = {
  get insert() { return db.prepare(`
    INSERT INTO account_tokens (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, target_legacy_member_id, target_audit_entry_id, target_anchor_id, token_type,
      token_hash, token_hash_version,
      issued_at, expires_at
    ) VALUES (?, ?, 'system', ?, 'system', 1,
      ?, ?, ?, ?, ?,
      ?, 1,
      ?, ?)
  `); },

  get findByHash() { return db.prepare(`
    SELECT id, member_id, target_legacy_member_id, target_audit_entry_id, target_anchor_id,
           token_type, expires_at, used_at
    FROM account_tokens
    WHERE token_hash = ? AND token_type = ?
  `); },

  get consumeIfUnused() { return db.prepare(`
    UPDATE account_tokens
    SET used_at    = ?,
        updated_at = ?,
        updated_by = 'system',
        version    = version + 1
    WHERE id = ? AND used_at IS NULL
  `); },

  get consumeIfUnusedAndUnexpired() { return db.prepare(`
    UPDATE account_tokens
    SET used_at    = ?,
        updated_at = ?,
        updated_by = 'system',
        version    = version + 1
    WHERE id = ? AND used_at IS NULL AND expires_at > ?
  `); },
};

export const auditEntries = {
  get insert() { return db.prepare(`
    INSERT INTO audit_entries (
      id, created_at, created_by,
      occurred_at, actor_type, actor_member_id,
      action_type, entity_type, entity_id,
      category, reason_text, metadata_json
    ) VALUES (?, ?, 'system',
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?)
  `); },
};

// Read surface for the admin audit-log viewer. Filters are optional and
// dynamic, so the SQL is assembled per call (the project's dynamic-SQL-helper
// pattern) rather than as a fixed prepared statement.
export interface AuditLogFilters {
  memberId?: string | null;      // matches actor OR member-entity
  actionType?: string | null;
  category?: string | null;
  actorType?: string | null;
  fromDate?: string | null;      // occurred_at >= (inclusive)
  toDate?: string | null;        // occurred_at <= (inclusive)
  selfActionOnly?: boolean;      // actor is the affected member (self-dealing lens)
  includeAuditAccess?: boolean;  // include the viewer's own audit.viewed/exported rows
}

export interface AuditLogQueryRow {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_member_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string;
  category: string;
  reason_text: string | null;
  metadata_json: string;
  actor_display_name: string | null;
  actor_slug: string | null;
  entity_display_name: string | null;
  entity_slug: string | null;
}

function buildAuditLogWhere(f: AuditLogFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (f.memberId) {
    clauses.push("(a.actor_member_id = ? OR (a.entity_type = 'member' AND a.entity_id = ?))");
    params.push(f.memberId, f.memberId);
  }
  if (f.actionType) { clauses.push('a.action_type = ?'); params.push(f.actionType); }
  if (f.category)   { clauses.push('a.category = ?');    params.push(f.category); }
  if (f.actorType)  { clauses.push('a.actor_type = ?');  params.push(f.actorType); }
  if (f.fromDate)   { clauses.push('a.occurred_at >= ?'); params.push(f.fromDate); }
  if (f.toDate)     { clauses.push('a.occurred_at <= ?'); params.push(f.toDate); }
  if (f.selfActionOnly) {
    clauses.push("a.actor_member_id IS NOT NULL AND a.entity_type = 'member' AND a.actor_member_id = a.entity_id");
  }
  if (!f.includeAuditAccess) {
    clauses.push("a.action_type NOT IN ('audit.viewed', 'audit.exported')");
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function queryAuditLog(filters: AuditLogFilters, limit: number, offset: number): AuditLogQueryRow[] {
  const { sql, params } = buildAuditLogWhere(filters);
  return db.prepare(`
    SELECT
      a.id, a.occurred_at, a.actor_type, a.actor_member_id, a.action_type,
      a.entity_type, a.entity_id, a.category, a.reason_text, a.metadata_json,
      am.display_name AS actor_display_name, am.slug AS actor_slug,
      em.display_name AS entity_display_name, em.slug AS entity_slug
    FROM audit_entries a
    -- Join through members_active so a soft-deleted member resolves to no
    -- display name or slug: the viewer then shows their id with no profile
    -- link, rather than a /members/<slug> link that 404s for deleted accounts.
    LEFT JOIN members_active am ON am.id = a.actor_member_id
    LEFT JOIN members_active em ON em.id = a.entity_id AND a.entity_type = 'member'
    ${sql}
    ORDER BY a.occurred_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as AuditLogQueryRow[];
}

export function countAuditLog(filters: AuditLogFilters): number {
  const { sql, params } = buildAuditLogWhere(filters);
  const row = db.prepare(`SELECT COUNT(*) AS n FROM audit_entries a ${sql}`).get(...params) as { n: number };
  return row.n;
}

export function listAuditLogCategories(): string[] {
  const rows = db.prepare('SELECT DISTINCT category FROM audit_entries ORDER BY category').all() as Array<{ category: string }>;
  return rows.map((r) => r.category);
}

export interface OutboxLogFilters {
  recipient?: string | null;   // substring match on recipient_email
  templateKey?: string | null;
  status?: string | null;
}

export interface OutboxLogQueryRow {
  id: string;
  created_at: string;
  sent_at: string | null;
  recipient_email: string | null;
  recipient_member_id: string | null;
  mailing_list_id: string | null;
  subject: string;
  template_key: string | null;
  status: string;
  last_error: string | null;
  recipient_display_name: string | null;
  recipient_slug: string | null;
}

function buildOutboxLogWhere(f: OutboxLogFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (f.recipient)   { clauses.push("o.recipient_email LIKE '%' || ? || '%'"); params.push(f.recipient); }
  if (f.templateKey) { clauses.push('o.template_key = ?'); params.push(f.templateKey); }
  if (f.status)      { clauses.push('o.status = ?');       params.push(f.status); }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function queryOutboxLog(filters: OutboxLogFilters, limit: number, offset: number): OutboxLogQueryRow[] {
  const { sql, params } = buildOutboxLogWhere(filters);
  return db.prepare(`
    SELECT
      o.id, o.created_at, o.sent_at, o.recipient_email, o.recipient_member_id,
      o.mailing_list_id, o.subject, o.template_key, o.status, o.last_error,
      rm.display_name AS recipient_display_name, rm.slug AS recipient_slug
    FROM outbox_emails o
    -- Join through members_active so a soft-deleted recipient resolves to no
    -- slug: the viewer then shows the stored email with no profile link, rather
    -- than a /members/<slug> link that 404s for a deleted account.
    LEFT JOIN members_active rm ON rm.id = o.recipient_member_id
    ${sql}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as OutboxLogQueryRow[];
}

export function countOutboxLog(filters: OutboxLogFilters): number {
  const { sql, params } = buildOutboxLogWhere(filters);
  const row = db.prepare(`SELECT COUNT(*) AS n FROM outbox_emails o ${sql}`).get(...params) as { n: number };
  return row.n;
}

export const outbox = {
  // Operational depth probe: pending + sending rows are the deliverable
  // backlog; a growing count means the worker is down or SES is failing.
  get countBacklog() { return db.prepare(`
    SELECT COUNT(*) AS n FROM outbox_emails WHERE status IN ('pending','sending')
  `); },

  get insert() { return db.prepare(`
    INSERT INTO outbox_emails (
      id, created_at, created_by, updated_at, updated_by, version,
      idempotency_key,
      recipient_email, recipient_member_id, mailing_list_id,
      sender_member_id, from_identity,
      subject, body_text, template_key,
      status, retry_count, scheduled_for
    ) VALUES (?, ?, 'system', ?, 'system', 1,
      ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      'pending', 0, ?)
  `); },

  get selectPendingBatch() { return db.prepare(`
    SELECT id, recipient_email, recipient_member_id, subject, body_text,
           from_identity, retry_count, idempotency_key
    FROM outbox_emails
    WHERE status = 'pending'
      AND (scheduled_for IS NULL OR scheduled_for <= ?)
    ORDER BY created_at ASC
    LIMIT ?
  `); },

  get findByIdempotencyKey() { return db.prepare(`
    SELECT id FROM outbox_emails WHERE idempotency_key = ?
  `); },

  get markSending() { return db.prepare(`
    UPDATE outbox_emails
    SET status = 'sending',
        last_attempt_at = ?,
        updated_at = ?,
        updated_by = 'system',
        version = version + 1
    WHERE id = ? AND status = 'pending'
  `); },

  get markSent() { return db.prepare(`
    UPDATE outbox_emails
    SET status = 'sent',
        sent_at = ?,
        updated_at = ?,
        updated_by = 'system',
        body_text = NULL,
        version = version + 1
    WHERE id = ?
  `); },

  get markFailedRetry() { return db.prepare(`
    UPDATE outbox_emails
    SET status = 'pending',
        retry_count = retry_count + 1,
        last_error = ?,
        updated_at = ?,
        updated_by = 'system',
        version = version + 1
    WHERE id = ?
  `); },

  get markDeadLetter() { return db.prepare(`
    UPDATE outbox_emails
    SET status = 'dead_letter',
        retry_count = retry_count + 1,
        last_error = ?,
        updated_at = ?,
        updated_by = 'system',
        version = version + 1
    WHERE id = ?
  `); },

  // Crash recovery: a worker killed between markSending and markSent /
  // markFailedRetry leaves the row 'sending' forever, and selectPendingBatch
  // reads 'pending' only, so the email would silently never send. Rows whose
  // send attempt started before the lease threshold go back to 'pending'
  // with a retry bump so the next queue pass re-claims them.
  get reapStaleSending() { return db.prepare(`
    UPDATE outbox_emails
    SET status = 'pending',
        retry_count = retry_count + 1,
        last_error = 'stale_sending_reaped',
        updated_at = ?,
        updated_by = 'system',
        version = version + 1
    WHERE status = 'sending'
      AND last_attempt_at < ?
  `); },
};

// Sort enum for the admin curator media list view. The closed set + the
// per-key prepared-statement cache below make ORDER BY safe even though
// it cannot be SQL-parameter-bound. New sort modes get added here AND in
// the corresponding service-layer enum; never accept user-supplied
// fragments into ORDER BY.
export type CuratorListSort = 'date_desc' | 'date_asc' | 'type_asc' | 'caption_asc';

const ORDER_BY_BY_SORT: Record<CuratorListSort, string> = {
  date_desc:   'mi.uploaded_at DESC, mi.id DESC',
  date_asc:    'mi.uploaded_at ASC, mi.id ASC',
  type_asc:    "mi.media_type ASC, mi.uploaded_at DESC, mi.id DESC",
  caption_asc: "COALESCE(mi.caption, '') COLLATE NOCASE ASC, mi.uploaded_at DESC, mi.id DESC",
};

// Lazy caches — first access of a given sort key triggers the actual
// db.prepare() call inside listCuratorMediaSorted / ...ByTagSorted. No prepare
// runs at module load, so importing this module never compiles SQL against a
// not-yet-migrated schema.
const listCuratorMediaCache = new Map<CuratorListSort, ReturnType<typeof db.prepare>>();
const listCuratorMediaByTagCache = new Map<CuratorListSort, ReturnType<typeof db.prepare>>();

export const media = {
  get insertAvatarPhoto() { return db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px, source_filename
    ) VALUES (?, ?, 'member', ?, 'member', 1, ?, 'photo', 1, NULL, ?, ?, ?, ?, ?, ?)
  `); },

  get findSystemMemberId() { return db.prepare(`
    SELECT id FROM members WHERE is_system = 1
  `); },

  get insertCuratorPhoto() { return db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px,
      moderation_status, source_filename
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, 'photo', 0, ?, ?,
              ?, ?, ?, ?,
              'active', ?)
  `); },

  get insertCuratorVideo() { return db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url,
      width_px, height_px,
      moderation_status, source_filename
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, 'video', 0, ?, ?,
              's3', ?, NULL, ?,
              ?, ?,
              'active', ?)
  `); },

  // Curator URL-reference video (YouTube/Vimeo): no hosted bytes, so no
  // s3_key/width/height; carries the platform video id, the URL, the
  // (Vimeo-only) thumbnail, plus the curator provenance/clip-range columns
  // the seeder also writes. id is the deterministic (platform, video_url) id
  // (urlRefMediaId, identical to the Python seeder's _url_ref_media_id), so
  // INSERT OR REPLACE upserts the same row a later seeder run would, with no
  // duplicate. source_filename stays NULL (url-ref rows have no on-disk binary).
  get insertCuratorUrlReference() { return db.prepare(`
    INSERT OR REPLACE INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url,
      source_id, start_seconds, end_seconds,
      moderation_status, source_filename
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, 'video', 0, ?, ?,
              ?, ?, ?, ?,
              ?, ?, ?,
              'active', NULL)
  `); },

  // Member-uploaded photo: uploader is the member themselves (not the
  // system member). Mirrors insertCuratorPhoto but stamps created_by/
  // updated_by = 'member' and leaves is_avatar = 0 (avatars use
  // insertAvatarPhoto). Gallery membership is computed at request time
  // via tag-AND match against the gallery's criteria/exclude tag sets.
  get insertMemberPhoto() { return db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px,
      moderation_status, source_filename
    ) VALUES (?, ?, 'member', ?, 'member', 1,
              ?, 'photo', 0, ?, ?,
              ?, ?, ?, ?,
              'active', ?)
  `); },

  // Member-submitted video: a YouTube or Vimeo URL reference. The
  // platform never hosts member video bytes (per US M_Submit_Video);
  // video_platform is constrained to 'youtube'|'vimeo' here even though
  // the schema CHECK also allows 's3' (reserved for curator-transcoded
  // assets).
  get insertMemberVideo() { return db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url,
      moderation_status, source_filename
    ) VALUES (?, ?, 'member', ?, 'member', 1,
              ?, 'video', 0, ?, ?,
              ?, ?, ?, ?,
              'active', NULL)
  `); },

  get setMemberAvatar() { return db.prepare(`
    UPDATE members
    SET avatar_media_id = ?, updated_at = ?, updated_by = 'member', version = version + 1
    WHERE id = ?
  `); },

  get getExistingAvatarMediaId() { return db.prepare(`
    SELECT id, s3_key_thumb, s3_key_display
    FROM media_items
    WHERE uploader_member_id = ? AND is_avatar = 1
  `); },

  get deleteMediaItem() { return db.prepare(`
    DELETE FROM media_items WHERE id = ?
  `); },

  get countRecentAvatarUploads() { return db.prepare(`
    SELECT COUNT(*) AS upload_count
    FROM media_items
    WHERE uploader_member_id = ? AND is_avatar = 1 AND uploaded_at > ?
  `); },

  // Curator slot media: the FH-owned (system member) media item whose source
  // filename matches the given value. Used by landing-page render code to
  // find the canonical demo loop / headline photo / illustration for a slot.
  // Filename is the stable identity (tags are gallery membership, not
  // identity). The unique partial index ux_media_items_source_filename_per_uploader
  // guarantees at most one active row per (uploader, source_filename).
  get getCuratorMediaByFilename() { return db.prepare(`
    SELECT mi.id, mi.media_type, mi.video_platform, mi.video_id, mi.video_url,
           mi.thumbnail_url, mi.caption, mi.s3_key_thumb, mi.s3_key_display
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    WHERE mi.source_filename = ?
      AND m.is_system = 1
      AND mi.moderation_status = 'active'
    LIMIT 1
  `); },

  // Public curator gallery: paginated reverse-chrono list of all FH-owned
  // (system member) active media. Excludes avatars (is_avatar=1) defense-in-
  // depth, even though avatars cannot also be curator uploads under current
  // bootstrap.
  get listCuratorMedia() { return db.prepare(`
    SELECT mi.id, mi.media_type, mi.caption, mi.uploaded_at,
           mi.s3_key_thumb, mi.s3_key_display,
           mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
           mi.width_px, mi.height_px
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    WHERE m.is_system = 1
      AND mi.moderation_status = 'active'
      AND mi.is_avatar = 0
    ORDER BY mi.uploaded_at DESC, mi.id DESC
    LIMIT ? OFFSET ?
  `); },

  get countCuratorMedia() { return db.prepare(`
    SELECT COUNT(*) AS n
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    WHERE m.is_system = 1
      AND mi.moderation_status = 'active'
      AND mi.is_avatar = 0
  `); },

  // Trick detail "Reference Media" block: every active video media item
  // tagged with the trick's canonical slug hashtag (e.g. '#butterfly').
  // Returns most-recent first. The caller filters per their policy
  // (e.g. /freestyle/tricks/:slug includes TT items; the public gallery
  // grouping path excludes them). Always-on exclusion: items tagged
  // `#unavailable_embed` are filtered out.
  get listMediaByTrickTag() { return db.prepare(`
    SELECT mi.id, mi.video_id, mi.video_url, mi.thumbnail_url, mi.caption,
           mi.video_platform, mi.uploaded_at, mi.source_id,
           ms.source_name, ms.creator AS source_creator, ms.url AS source_url
    FROM media_items mi
    JOIN media_tags mt ON mt.media_id = mi.id
    LEFT JOIN media_sources ms ON ms.source_id = mi.source_id
    WHERE mt.tag_display = ?
      AND mi.media_type = 'video'
      AND mi.moderation_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM media_tags mtu
        JOIN tags tu ON tu.id = mtu.tag_id
        WHERE mtu.media_id = mi.id AND tu.tag_normalized = '#unavailable_embed'
      )
    ORDER BY mi.uploaded_at DESC, mi.id ASC
  `); },

  // Curator media lookup by id. Used by edit/delete paths to load existing
  // media for ownership check + S3-key resolution. Filters by FH ownership
  // defense-in-depth: this service only edits/deletes its own content.
  get getCuratorMediaItemById() { return db.prepare(`
    SELECT mi.id, mi.uploader_member_id, mi.media_type, mi.caption,
           mi.s3_key_thumb, mi.s3_key_display,
           mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
           mi.source_filename, mi.external_url
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    WHERE mi.id = ?
      AND m.is_system = 1
      AND mi.moderation_status = 'active'
  `); },

  // Caption-only update for curator media. Tags are rewritten via the
  // media_tags helpers (delete + reinsert in a transaction).
  get updateCuratorMediaCaption() { return db.prepare(`
    UPDATE media_items
    SET caption = ?, updated_at = ?, updated_by = 'admin-act-as', version = version + 1
    WHERE id = ?
  `); },

  // Member-uploaded media lookup, scoped by the requesting member id.
  // The owner-id filter is the gate: a row owned by anyone else returns
  // undefined, which controllers translate to 404 (anti-enumeration).
  // Excludes is_system rows so admin/FH-uploaded media is never reachable
  // through the member-self edit surface.
  get getMemberMediaItemById() { return db.prepare(`
    SELECT mi.id, mi.uploader_member_id, mi.media_type, mi.caption,
           mi.s3_key_thumb, mi.s3_key_display,
           mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
           mi.source_filename, mi.external_url, mi.is_avatar
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    WHERE mi.id = ?
      AND mi.uploader_member_id = ?
      AND m.is_system = 0
      AND mi.moderation_status = 'active'
  `); },

  // Single public media item by id for the standalone item viewer
  // (/media/item/:mediaId). Applies the same public-visibility filter as the
  // gallery queries (active, non-avatar, never #unavailable_embed) and returns
  // the CuratorGalleryRow shape so the media service reuses its tile shaping.
  // Any visible item resolves regardless of uploader, so a deep link or a
  // browse tile past the gallery render cap still opens its own page.
  get getPublicMediaItemById() { return db.prepare(`
    SELECT mi.id, mi.media_type, mi.caption, mi.uploaded_at,
           mi.s3_key_thumb, mi.s3_key_display,
           mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
           mi.width_px, mi.height_px
    FROM media_items mi
    WHERE mi.id = ?
      AND mi.moderation_status = 'active'
      AND mi.is_avatar = 0
      AND NOT EXISTS (
        SELECT 1 FROM media_tags mtu
        JOIN tags tu ON tu.id = mtu.tag_id
        WHERE mtu.media_id = mi.id AND tu.tag_normalized = '#unavailable_embed'
      )
  `); },

  // Member's own uploaded media, newest first, for the profile media grid.
  // Active, non-avatar, member-owned (is_system=0) rows only; the LIMIT caps
  // the profile preview. Returns the CuratorGalleryRow shape so the media
  // service can reuse its gallery-tile shaping.
  get listMemberUploadedMedia() { return db.prepare(`
    SELECT mi.id, mi.media_type, mi.caption, mi.uploaded_at,
           mi.s3_key_thumb, mi.s3_key_display,
           mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
           mi.width_px, mi.height_px
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    WHERE mi.uploader_member_id = ?
      AND m.is_system = 0
      AND mi.moderation_status = 'active'
      AND mi.is_avatar = 0
    ORDER BY mi.uploaded_at DESC, mi.id DESC
    LIMIT ?
  `); },

  // Caption-only update for member-self edits. Mirrors
  // updateCuratorMediaCaption but stamps updated_by='member-self'.
  get updateMemberMediaCaption() { return db.prepare(`
    UPDATE media_items
    SET caption = ?, updated_at = ?, updated_by = 'member-self', version = version + 1
    WHERE id = ? AND uploader_member_id = ?
  `); },

  // Tag-filtered curator media list. Joins through media_tags + tags to
  // filter by tag_normalized. Mirrors listCuratorMedia ordering.
  // Replaced by listCuratorMediaByTagSorted (sort-aware). Kept temporarily
  // for any caller that hasn't migrated; new callers use the sorted variant.
  get listCuratorMediaByTag() { return db.prepare(`
    SELECT mi.id, mi.media_type, mi.caption, mi.uploaded_at,
           mi.s3_key_thumb, mi.s3_key_display,
           mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
           mi.width_px, mi.height_px,
           mi.external_url
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    JOIN media_tags mt ON mt.media_id = mi.id
    JOIN tags t ON t.id = mt.tag_id
    WHERE m.is_system = 1
      AND mi.moderation_status = 'active'
      AND mi.is_avatar = 0
      AND t.tag_normalized = ?
    ORDER BY mi.uploaded_at DESC, mi.id DESC
    LIMIT ? OFFSET ?
  `); },

  // Sort-aware curator media list. The sort key picks the ORDER BY clause
  // from a closed whitelist; user-controlled input never reaches SQL. Each
  // (sort, hasTag) pair has its own prepared statement, cached after first
  // build. The closed-set guarantee plus better-sqlite3 prepared-statement
  // semantics keep this safe; do not extend the whitelist with raw user
  // input.
  listCuratorMediaSorted(sort: CuratorListSort) {
    const cached = listCuratorMediaCache.get(sort);
    if (cached) return cached;
    const stmt = db.prepare(`
      SELECT mi.id, mi.media_type, mi.caption, mi.uploaded_at,
             mi.s3_key_thumb, mi.s3_key_display,
             mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
             mi.width_px, mi.height_px,
             mi.external_url
      FROM media_items mi
      JOIN members m ON m.id = mi.uploader_member_id
      WHERE m.is_system = 1
        AND mi.moderation_status = 'active'
        AND mi.is_avatar = 0
      ORDER BY ${ORDER_BY_BY_SORT[sort]}
      LIMIT ? OFFSET ?
    `);
    listCuratorMediaCache.set(sort, stmt);
    return stmt;
  },

  listCuratorMediaByTagSorted(sort: CuratorListSort) {
    const cached = listCuratorMediaByTagCache.get(sort);
    if (cached) return cached;
    const stmt = db.prepare(`
      SELECT mi.id, mi.media_type, mi.caption, mi.uploaded_at,
             mi.s3_key_thumb, mi.s3_key_display,
             mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
             mi.width_px, mi.height_px,
             mi.external_url
      FROM media_items mi
      JOIN members m ON m.id = mi.uploader_member_id
      JOIN media_tags mt ON mt.media_id = mi.id
      JOIN tags t ON t.id = mt.tag_id
      WHERE m.is_system = 1
        AND mi.moderation_status = 'active'
        AND mi.is_avatar = 0
        AND t.tag_normalized = ?
      ORDER BY ${ORDER_BY_BY_SORT[sort]}
      LIMIT ? OFFSET ?
    `);
    listCuratorMediaByTagCache.set(sort, stmt);
    return stmt;
  },

  // Sets external_url and stamps validated_at. Service callers run this
  // inside the same transaction as the row INSERT for atomicity. URL must
  // already be validated + normalized by externalUrlValidator at the
  // service boundary; this statement does no validation of its own.
  get setMediaItemExternalUrl() { return db.prepare(`
    UPDATE media_items
       SET external_url = ?, external_url_validated_at = ?
     WHERE id = ? AND uploader_member_id = ?
  `); },

  get countCuratorMediaByTag() { return db.prepare(`
    SELECT COUNT(*) AS n
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    JOIN media_tags mt ON mt.media_id = mi.id
    JOIN tags t ON t.id = mt.tag_id
    WHERE m.is_system = 1
      AND mi.moderation_status = 'active'
      AND mi.is_avatar = 0
      AND t.tag_normalized = ?
  `); },

  // Named-gallery URL bookmarks: a member_galleries row anchors a stable
  // /media/<gallery_id> URL; its content is the tag-AND view defined by
  // member_gallery_tags (gallery built dynamically by tag matching). The
  // hub at /media lists FH-owned bookmarks. Item counts are computed in
  // the service layer via countGalleryItemsByCriteria so this query stays
  // simple.
  get listFhNamedGalleries() { return db.prepare(`
    SELECT g.id, g.name, g.description, g.sort_order
    FROM member_galleries g
    JOIN members m ON m.id = g.owner_member_id
    WHERE m.is_system = 1
    ORDER BY g.name
  `); },

  // Anti-enumeration: filter by FH ownership at the SQL level so a
  // member-owned gallery returns 404 rather than leaking existence.
  get getFhNamedGalleryById() { return db.prepare(`
    SELECT g.id, g.name, g.description, g.sort_order
    FROM member_galleries g
    JOIN members m ON m.id = g.owner_member_id
    WHERE g.id = ? AND m.is_system = 1
  `); },

  // Criteria-tag list for a named-gallery row, used to render the tag
  // pills on the gallery hero and the hub-card tags. Returned in
  // alphabetical order for deterministic rendering.
  get listFhNamedGalleryTags() { return db.prepare(`
    SELECT t.id, t.tag_display
    FROM member_gallery_tags mgt
    JOIN tags t ON t.id = mgt.tag_id
    WHERE mgt.gallery_id = ?
    ORDER BY t.tag_display
  `); },

  // Exclude-tag list for a named-gallery row. An item appears iff it
  // carries every criteria tag AND no exclude tag. Returned in
  // alphabetical order for deterministic rendering.
  get listFhNamedGalleryExcludeTags() { return db.prepare(`
    SELECT t.id, t.tag_display
    FROM member_gallery_exclude_tags mget
    JOIN tags t ON t.id = mget.tag_id
    WHERE mget.gallery_id = ?
    ORDER BY t.tag_display
  `); },

  // Admin gallery edit: UPDATE the metadata fields of an FH-owned
  // member_galleries row. Caller wraps in a transaction with the
  // matching tag-set rewrites.
  get updateMemberGalleryMetadata() { return db.prepare(`
    UPDATE member_galleries
    SET name = ?, description = ?, sort_order = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  // Admin gallery edit: replace a gallery's criteria-tag set.
  // DELETE-then-INSERT pattern; caller wraps in a transaction.
  get deleteAllMemberGalleryTags() { return db.prepare(`
    DELETE FROM member_gallery_tags WHERE gallery_id = ?
  `); },

  get insertMemberGalleryTag() { return db.prepare(`
    INSERT INTO member_gallery_tags (
      gallery_id, tag_id, created_at, created_by
    ) VALUES (?, ?, ?, ?)
  `); },

  // Admin gallery edit: replace a gallery's exclude-tag set.
  get deleteAllMemberGalleryExcludeTags() { return db.prepare(`
    DELETE FROM member_gallery_exclude_tags WHERE gallery_id = ?
  `); },

  get insertMemberGalleryExcludeTag() { return db.prepare(`
    INSERT INTO member_gallery_exclude_tags (
      gallery_id, tag_id, created_at, created_by
    ) VALUES (?, ?, ?, ?)
  `); },

  // Lookup a named gallery by id without filtering on owner. Returns
  // owner_member_id, the system-member flag, and the owner's display
  // identity so the service layer can render owner attribution and
  // dispatch on cohort (FH vs member-owned) for authorization and
  // post-commit sidecar I/O.
  get getNamedGalleryById() { return db.prepare(`
    SELECT g.id, g.name, g.description, g.sort_order,
           g.owner_member_id, m.is_system,
           m.display_name AS owner_display_name,
           m.slug         AS owner_slug
    FROM member_galleries g
    JOIN members m ON m.id = g.owner_member_id
    WHERE g.id = ?
  `); },

  // Public-hub listing across BOTH FH-owned and member-owned galleries
  // with owner attribution joined in. Sort FH first (system rows lead),
  // then by name. The hub uses this; the existing FH-only
  // `listFhNamedGalleries` is retained for any caller that needs to
  // filter to the curator cohort only.
  //
  // is_default = 1 rows (the auto-materialized per-member Personal
  // Gallery) are excluded: those are not deliberately-named bookmarks,
  // so they don't belong on the public hub. The Personal Gallery row
  // still exists and is still reachable at /media/<id> for sharing; it
  // just isn't advertised in the hub list.
  get listAllNamedGalleries() { return db.prepare(`
    SELECT g.id, g.name, g.description, g.sort_order,
           g.owner_member_id, m.is_system,
           m.display_name AS owner_display_name,
           m.slug         AS owner_slug
    FROM member_galleries g
    JOIN members m ON m.id = g.owner_member_id
    WHERE g.is_default = 0
    ORDER BY m.is_system DESC, g.name
  `); },

  // Member-owned named galleries (non-default, non-system) oldest first.
  // Powers the /media/member-galleries list page; the per-member auto-default
  // Personal Gallery (is_default=1) is excluded so the list shows only
  // deliberately-named galleries.
  get listMemberOwnedNamedGalleries() { return db.prepare(`
    SELECT g.id, g.name, g.description, g.created_at,
           m.slug AS owner_slug, m.display_name AS owner_display_name
    FROM member_galleries g
    JOIN members m ON m.id = g.owner_member_id
    WHERE g.is_default = 0 AND m.is_system = 0
    ORDER BY g.created_at ASC, g.id ASC
  `); },

  // Insert a new member_galleries row. Caller wraps in a transaction
  // with the matching tag-set inserts. UNIQUE(owner_member_id, name)
  // enforces per-owner name uniqueness; service layer maps the
  // SqliteError UNIQUE constraint failure to ConflictError.
  get insertMemberGallery() { return db.prepare(`
    INSERT INTO member_galleries (
      id, created_at, created_by, updated_at, updated_by, version,
      owner_member_id, name, description, sort_order
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `); },

  // Hard-delete a gallery row. Tag rows in member_gallery_tags and
  // member_gallery_exclude_tags cascade via ON DELETE CASCADE.
  get deleteMemberGalleryById() { return db.prepare(`
    DELETE FROM member_galleries WHERE id = ?
  `); },

  // List every gallery owned by a given member. Used by the member
  // profile "Galleries" surface and by tests asserting member-owned
  // gallery state.
  get listMemberGalleriesByOwner() { return db.prepare(`
    SELECT g.id, g.name, g.description, g.sort_order
    FROM member_galleries g
    WHERE g.owner_member_id = ?
    ORDER BY g.name
  `); },

  // A member's named galleries for the profile Media section: the galleries the
  // member deliberately created, excluding the auto-default Personal Gallery
  // (whose content the profile's "View all media" link already covers). Oldest
  // first, matching the public member-galleries list ordering.
  get listMemberNamedGalleriesByOwner() { return db.prepare(`
    SELECT g.id, g.name, g.description
    FROM member_galleries g
    WHERE g.owner_member_id = ? AND g.is_default = 0
    ORDER BY g.created_at ASC, g.id ASC
  `); },

  // Existence probe for the per-member default Personal Gallery, keyed
  // on (owner, name). Used by the upload service to make first-upload
  // gallery creation idempotent: if the row already exists we skip the
  // INSERT; if not, createGallery handles it. UNIQUE(owner_member_id,
  // name) is the underlying integrity guard.
  get findMemberGalleryByOwnerAndName() { return db.prepare(`
    SELECT id FROM member_galleries
    WHERE owner_member_id = ? AND name = ?
  `); },

  // Marks a gallery as the member's default Personal Gallery. Called
  // once per member, immediately after createGallery, so the row's
  // is_default flag matches the semantic role assigned by the upload
  // service. Standalone UPDATE rather than threading is_default
  // through createGallery keeps the existing FH/admin path untouched.
  get markMemberGalleryAsDefault() { return db.prepare(`
    UPDATE member_galleries
    SET is_default = 1, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  // ── gallery_external_links ────────────────────────────────────────────
  // Read in display order (sort_order ASC, then created_at). Caps are
  // enforced in the service layer (currently max 1 per gallery), so
  // db.ts stays a flat statement surface.
  // listGalleryExternalLinks is the admin/operator view: returns every row
  // including quarantine_reason for surfacing in the admin edit form.
  // listGalleryExternalLinksForPublic shows a row only once it has been verified
  // (validated_at stamped) and not quarantined, so public render paths never
  // serve an unverified or flagged URL. Verification happens at curator-sidecar
  // intake time, not at app boot.
  get listGalleryExternalLinks() { return db.prepare(`
    SELECT id, label, url, validated_at, quarantine_reason, sort_order
    FROM gallery_external_links
    WHERE gallery_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `); },

  get listGalleryExternalLinksForPublic() { return db.prepare(`
    SELECT id, label, url, validated_at, sort_order
    FROM gallery_external_links
    WHERE gallery_id = ?
      AND validated_at IS NOT NULL
      AND quarantine_reason IS NULL
    ORDER BY sort_order ASC, created_at ASC
  `); },

  get deleteGalleryExternalLinks() { return db.prepare(`
    DELETE FROM gallery_external_links WHERE gallery_id = ?
  `); },

  get insertGalleryExternalLink() { return db.prepare(`
    INSERT INTO gallery_external_links (
      id, created_at, created_by, updated_at, updated_by, version,
      gallery_id, label, url, validated_at, sort_order
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `); },
};

// Tag display + normalized values for a set of media ids in one round-trip.
// tag_normalized is needed alongside tag_display so the chip-rendering code
// can build per-tag URLs (/media/browse?tag=<normalized-without-#>) without a
// second round-trip. Built dynamically because better-sqlite3 has no
// array-binding for IN(). Mirrors the queryCuratedItems / queryFilteredTeams
// pattern.
export function queryCuratorMediaTags(
  mediaIds: string[],
): { media_id: string; tag_display: string; tag_normalized: string }[] {
  if (mediaIds.length === 0) return [];
  const placeholders = mediaIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT mt.media_id, mt.tag_display, t.tag_normalized
    FROM media_tags mt
    JOIN tags t ON t.id = mt.tag_id
    WHERE mt.media_id IN (${placeholders})
    ORDER BY mt.tag_display
  `).all(...mediaIds) as { media_id: string; tag_display: string; tag_normalized: string }[];
}

// Resolve a set of tag_normalized strings (with leading '#') to tag rows.
// Used by /media/browse to convert URL tag tokens into tag ids before
// running queryGalleryItemsByCriteria. Unknown normalized forms have no
// row and are silently dropped by the caller.
export function queryTagIdsByNormalized(
  normalizedForms: string[],
): { id: string; tag_normalized: string; tag_display: string }[] {
  if (normalizedForms.length === 0) return [];
  const placeholders = normalizedForms.map(() => '?').join(',');
  return db.prepare(`
    SELECT id, tag_normalized, tag_display
    FROM tags
    WHERE tag_normalized IN (${placeholders})
  `).all(...normalizedForms) as { id: string; tag_normalized: string; tag_display: string }[];
}

// Resolve the tag ids for a set/style search term: the given exact tag forms
// (e.g. #pixie, #set_pixie, #concept_pixie_sets), any underscore-delimited
// compound tag `#<term>_*` (e.g. #pixie_barrage), AND the trick tags of every
// trick that carries `<modifierSlug>` as a modifier (the ontology link, e.g.
// #pigbeater is a pixie trick by modifier even though its name has no "pixie").
// The underscore in the prefix is escaped so it matches a literal `_`. Used only
// by /media/browse search expansion; returns ids of tags that actually exist.
export function queryStyleTermTagIds(
  exactNormalized: string[],
  compoundPrefix: string,
  modifierSlug: string,
): string[] {
  const inClause = exactNormalized.length > 0
    ? `tag_normalized IN (${exactNormalized.map(() => '?').join(',')})`
    : '0';
  const rows = db.prepare(`
    SELECT id FROM tags
    WHERE ${inClause}
       OR tag_normalized LIKE ? ESCAPE '\\'
    UNION
    SELECT t.id FROM tags t
    JOIN freestyle_trick_modifier_links ml ON t.tag_normalized = '#' || ml.trick_slug
    WHERE ml.modifier_slug = ?
  `).all(...exactNormalized, `${compoundPrefix}\\_%`, modifierSlug) as { id: string }[];
  return rows.map((r) => r.id);
}

// Batch-resolve media tag bodies (a tag normalized to its slug form, no '#') to
// freestyle trick destinations: an exact `freestyle_tricks.slug`, or an
// `freestyle_trick_aliases.alias_slug` that points at one. Returns one row per
// input slug that resolves, with the canonical trick slug and display name.
// Exact slug wins over alias. Slugs that resolve to nothing are simply omitted
// (no broken links). Used by the media-card ontology cross-link resolver.
export function resolveTrickTags(
  slugs: string[],
): { matched: string; canonicalSlug: string; canonicalName: string }[] {
  if (slugs.length === 0) return [];
  const ph = slugs.map(() => '?').join(',');
  return db.prepare(`
    SELECT slug AS matched, slug AS canonicalSlug, canonical_name AS canonicalName
    FROM freestyle_tricks
    WHERE slug IN (${ph})
    UNION
    SELECT a.alias_slug AS matched, a.trick_slug AS canonicalSlug, ft.canonical_name AS canonicalName
    FROM freestyle_trick_aliases a
    JOIN freestyle_tricks ft ON ft.slug = a.trick_slug
    WHERE a.alias_slug IN (${ph})
      AND a.alias_slug NOT IN (SELECT slug FROM freestyle_tricks)
  `).all(...slugs, ...slugs) as { matched: string; canonicalSlug: string; canonicalName: string }[];
}

// Tag-AND-of-N gallery query. Items appear iff they carry every one of
// the given tag ids. Standard SQLite GROUP BY / HAVING COUNT(DISTINCT)
// pattern. Built dynamically because better-sqlite3 has no array-bind
// for IN(). Empty criteria → empty result (not "match everything"); the
// caller must treat zero-criteria galleries as empty per
// schema.sql:member_gallery_tags doc-comment.
export function queryGalleryItemsByCriteria(
  tagIds: string[],
  limit: number,
  offset: number,
  excludeTagIds: string[] = [],
): CuratorGalleryRow[] {
  if (tagIds.length === 0) return [];
  const placeholders = tagIds.map(() => '?').join(',');
  const excludeClause = excludeTagIds.length === 0
    ? ''
    : `AND NOT EXISTS (
         SELECT 1 FROM media_tags mtex
         WHERE mtex.media_id = mi.id
           AND mtex.tag_id IN (${excludeTagIds.map(() => '?').join(',')})
       )`;
  // Always-on exclusion: items tagged `#unavailable_embed` (curator-applied
  // when an upstream YouTube video is private/deleted/blocked) never appear
  // in public galleries. Curators remain able to find them via direct tag
  // search; admin tooling shows them in their own status. See
  // `tests/integration/freestyle.curated-media-availability.routes.test.ts`.
  return db.prepare(`
    SELECT mi.id, mi.media_type, mi.caption, mi.uploaded_at,
           mi.s3_key_thumb, mi.s3_key_display,
           mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
           mi.width_px, mi.height_px
    FROM media_items mi
    JOIN media_tags mt ON mt.media_id = mi.id
    WHERE mi.moderation_status = 'active'
      AND mi.is_avatar = 0
      AND mt.tag_id IN (${placeholders})
      ${excludeClause}
      AND NOT EXISTS (
        SELECT 1 FROM media_tags mtu
        JOIN tags tu ON tu.id = mtu.tag_id
        WHERE mtu.media_id = mi.id AND tu.tag_normalized = '#unavailable_embed'
      )
    GROUP BY mi.id
    HAVING COUNT(DISTINCT mt.tag_id) = ?
    ORDER BY mi.uploaded_at DESC, mi.id DESC
    LIMIT ? OFFSET ?
  `).all(...tagIds, ...excludeTagIds, tagIds.length, limit, offset) as CuratorGalleryRow[];
}

// OR-group variant of queryGalleryItemsByCriteria. Each inner array is an
// OR-group: an item must carry at least one tag from EVERY group (groups AND
// together, tags within a group OR). A single-tag group is identical to the flat
// AND match, so this is a strict generalization used only by /media/browse to
// let a search term also match its set-tag alias, without touching the AND-only
// callers (named galleries, clubs, events). Same visibility filters and ordering.
export function queryGalleryItemsByTagGroups(
  tagIdGroups: string[][],
  limit: number,
  offset: number,
  excludeTagIds: string[] = [],
): CuratorGalleryRow[] {
  const groups = tagIdGroups.filter((g) => g.length > 0);
  if (groups.length === 0) return [];
  const groupClauses = groups
    .map((g) => `AND EXISTS (SELECT 1 FROM media_tags mtg WHERE mtg.media_id = mi.id AND mtg.tag_id IN (${g.map(() => '?').join(',')}))`)
    .join('\n      ');
  const excludeClause = excludeTagIds.length === 0
    ? ''
    : `AND NOT EXISTS (SELECT 1 FROM media_tags mtex WHERE mtex.media_id = mi.id AND mtex.tag_id IN (${excludeTagIds.map(() => '?').join(',')}))`;
  return db.prepare(`
    SELECT mi.id, mi.media_type, mi.caption, mi.uploaded_at,
           mi.s3_key_thumb, mi.s3_key_display,
           mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
           mi.width_px, mi.height_px
    FROM media_items mi
    WHERE mi.moderation_status = 'active'
      AND mi.is_avatar = 0
      ${groupClauses}
      ${excludeClause}
      AND NOT EXISTS (
        SELECT 1 FROM media_tags mtu
        JOIN tags tu ON tu.id = mtu.tag_id
        WHERE mtu.media_id = mi.id AND tu.tag_normalized = '#unavailable_embed'
      )
    ORDER BY mi.uploaded_at DESC, mi.id DESC
    LIMIT ? OFFSET ?
  `).all(...groups.flat(), ...excludeTagIds, limit, offset) as CuratorGalleryRow[];
}

// Count counterpart to queryGalleryItemsByTagGroups (same OR-group AND match).
export function countGalleryItemsByTagGroups(
  tagIdGroups: string[][],
  excludeTagIds: string[] = [],
): number {
  const groups = tagIdGroups.filter((g) => g.length > 0);
  if (groups.length === 0) return 0;
  const groupClauses = groups
    .map((g) => `AND EXISTS (SELECT 1 FROM media_tags mtg WHERE mtg.media_id = mi.id AND mtg.tag_id IN (${g.map(() => '?').join(',')}))`)
    .join('\n      ');
  const excludeClause = excludeTagIds.length === 0
    ? ''
    : `AND NOT EXISTS (SELECT 1 FROM media_tags mtex WHERE mtex.media_id = mi.id AND mtex.tag_id IN (${excludeTagIds.map(() => '?').join(',')}))`;
  const row = db.prepare(`
    SELECT COUNT(*) AS n
    FROM media_items mi
    WHERE mi.moderation_status = 'active'
      AND mi.is_avatar = 0
      ${groupClauses}
      ${excludeClause}
      AND NOT EXISTS (
        SELECT 1 FROM media_tags mtu
        JOIN tags tu ON tu.id = mtu.tag_id
        WHERE mtu.media_id = mi.id AND tu.tag_normalized = '#unavailable_embed'
      )
  `).get(...groups.flat(), ...excludeTagIds) as { n: number };
  return row.n;
}

// Recent member-authored community media, with no tag criterion, for the
// teaching empty state on a member's gallery page. Mirrors the public
// visibility filter of queryGalleryItemsByCriteria (active, non-avatar, never
// #unavailable_embed) but selects across the whole community and excludes
// system/curator uploads, so the examples are genuinely member-shared rather
// than seeded curator content. Empty mediaTypes → empty result.
export function queryRecentCommunityMedia(
  limit: number,
  mediaTypes: Array<'photo' | 'video'>,
): CuratorGalleryRow[] {
  if (mediaTypes.length === 0) return [];
  const typePlaceholders = mediaTypes.map(() => '?').join(',');
  return db.prepare(`
    SELECT mi.id, mi.media_type, mi.caption, mi.uploaded_at,
           mi.s3_key_thumb, mi.s3_key_display,
           mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
           mi.width_px, mi.height_px
    FROM media_items mi
    WHERE mi.moderation_status = 'active'
      AND mi.is_avatar = 0
      AND mi.media_type IN (${typePlaceholders})
      AND mi.uploader_member_id NOT IN (SELECT id FROM members WHERE is_system = 1)
      AND NOT EXISTS (
        SELECT 1 FROM media_tags mtu
        JOIN tags tu ON tu.id = mtu.tag_id
        WHERE mtu.media_id = mi.id AND tu.tag_normalized = '#unavailable_embed'
      )
    ORDER BY mi.uploaded_at DESC, mi.id DESC
    LIMIT ?
  `).all(...mediaTypes, limit) as CuratorGalleryRow[];
}

/**
 * Tag-AND-of-N gallery query for the grouped /media/<id> view. Items appear
 * grouped by their canonical trick tag. Ordering is controlled by the
 * gallery's `sort_order` column: 'upload_desc' (default), 'upload_asc',
 * 'caption_asc'. Callers pass an explicit LIMIT; nothing enforces a small
 * corpus, so an unbounded fetch on this public route would be a
 * resource-exhaustion vector once the corpus grows.
 */
export interface NamedGalleryGroupedRow extends CuratorGalleryRow {
  source_id: string | null;
}

// Upper bound for single-page gallery renders (public named gallery and the
// owner/admin edit grid). Services fetch cap+1 to detect overflow and show a
// truncation notice instead of fanning out an unbounded render.
export const GALLERY_ITEMS_QUERY_CAP = 100;

const GALLERY_ORDER_CLAUSE: Record<GallerySortOrder, string> = {
  upload_desc: 'mi.uploaded_at DESC, mi.id DESC',
  upload_asc:  'mi.uploaded_at ASC, mi.id ASC',
  caption_asc: 'mi.caption ASC, mi.id ASC',
};

export function queryGalleryItemsByCriteriaGrouped(
  tagIds: string[],
  sortOrder: GallerySortOrder = 'upload_desc',
  excludeTagIds: string[] = [],
  limit: number = GALLERY_ITEMS_QUERY_CAP + 1,
): NamedGalleryGroupedRow[] {
  if (tagIds.length === 0) return [];
  const placeholders = tagIds.map(() => '?').join(',');
  const orderBy = GALLERY_ORDER_CLAUSE[sortOrder];
  const excludeClause = excludeTagIds.length === 0
    ? ''
    : `AND NOT EXISTS (
         SELECT 1 FROM media_tags mtex
         WHERE mtex.media_id = mi.id
           AND mtex.tag_id IN (${excludeTagIds.map(() => '?').join(',')})
       )`;
  // Always-on exclusion: items tagged `#unavailable_embed` never appear in
  // public galleries. Same enforcement as `queryGalleryItemsByCriteria`.
  return db.prepare(`
    SELECT mi.id, mi.media_type, mi.caption, mi.uploaded_at,
           mi.s3_key_thumb, mi.s3_key_display,
           mi.video_platform, mi.video_id, mi.video_url, mi.thumbnail_url,
           mi.width_px, mi.height_px,
           mi.source_id
    FROM media_items mi
    JOIN media_tags mt ON mt.media_id = mi.id
    WHERE mi.moderation_status = 'active'
      AND mi.is_avatar = 0
      AND mt.tag_id IN (${placeholders})
      ${excludeClause}
      AND NOT EXISTS (
        SELECT 1 FROM media_tags mtu
        JOIN tags tu ON tu.id = mtu.tag_id
        WHERE mtu.media_id = mi.id AND tu.tag_normalized = '#unavailable_embed'
      )
    GROUP BY mi.id
    HAVING COUNT(DISTINCT mt.tag_id) = ?
    ORDER BY ${orderBy}
    LIMIT ?
  `).all(...tagIds, ...excludeTagIds, tagIds.length, limit) as NamedGalleryGroupedRow[];
}

// Returns slim display rows for the items currently matching a gallery's
// criteria/exclude tag set. Used by the gallery edit form's read-only
// "Items currently in this gallery" thumbnail grid. The grid never lets
// the user mutate item tags (per the no-conflation rule); detach happens
// on the item's own edit page.
export interface GalleryItemDisplayRow {
  id: string;
  media_type: 'photo' | 'video';
  caption: string | null;
  source_filename: string;
  s3_key_thumb: string | null;
  video_platform: string | null;
  video_id: string | null;
  thumbnail_url: string | null;
  // 1 when the item carries the #unavailable_embed tag, which public
  // gallery queries exclude; the owner/admin edit grid badges these so an
  // item visible here but missing publicly is explained.
  is_unavailable_embed: number;
}
export function listGalleryItemsForDisplay(
  tagIds: string[],
  excludeTagIds: string[] = [],
  limit: number = GALLERY_ITEMS_QUERY_CAP + 1,
): GalleryItemDisplayRow[] {
  if (tagIds.length === 0) return [];
  const placeholders = tagIds.map(() => '?').join(',');
  const excludeClause = excludeTagIds.length === 0
    ? ''
    : `AND NOT EXISTS (
         SELECT 1 FROM media_tags mtex
         WHERE mtex.media_id = mi.id
           AND mtex.tag_id IN (${excludeTagIds.map(() => '?').join(',')})
       )`;
  return db.prepare(`
    SELECT mi.id, mi.media_type, mi.caption, mi.source_filename,
           mi.s3_key_thumb, mi.video_platform, mi.video_id, mi.thumbnail_url,
           EXISTS (
             SELECT 1 FROM media_tags mtu
             JOIN tags tu ON tu.id = mtu.tag_id
             WHERE mtu.media_id = mi.id AND tu.tag_normalized = '#unavailable_embed'
           ) AS is_unavailable_embed
    FROM media_items mi
    JOIN media_tags mt ON mt.media_id = mi.id
    WHERE mi.moderation_status = 'active'
      AND mi.is_avatar = 0
      AND mt.tag_id IN (${placeholders})
      ${excludeClause}
    GROUP BY mi.id
    HAVING COUNT(DISTINCT mt.tag_id) = ?
    ORDER BY mi.uploaded_at DESC, mi.id DESC
    LIMIT ?
  `).all(...tagIds, ...excludeTagIds, tagIds.length, limit) as GalleryItemDisplayRow[];
}

export function countGalleryItemsByCriteria(
  tagIds: string[],
  excludeTagIds: string[] = [],
): number {
  if (tagIds.length === 0) return 0;
  const placeholders = tagIds.map(() => '?').join(',');
  const excludeClause = excludeTagIds.length === 0
    ? ''
    : `AND NOT EXISTS (
         SELECT 1 FROM media_tags mtex
         WHERE mtex.media_id = mi.id
           AND mtex.tag_id IN (${excludeTagIds.map(() => '?').join(',')})
       )`;
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT mi.id
      FROM media_items mi
      JOIN media_tags mt ON mt.media_id = mi.id
      WHERE mi.moderation_status = 'active'
        AND mi.is_avatar = 0
        AND mt.tag_id IN (${placeholders})
        ${excludeClause}
        AND NOT EXISTS (
          SELECT 1 FROM media_tags mtu
          JOIN tags tu ON tu.id = mtu.tag_id
          WHERE mtu.media_id = mi.id AND tu.tag_normalized = '#unavailable_embed'
        )
      GROUP BY mi.id
      HAVING COUNT(DISTINCT mt.tag_id) = ?
    )
  `).get(...tagIds, ...excludeTagIds, tagIds.length) as { n: number };
  return row.n;
}

// Tags that co-occur on the items matching the current criteria/exclude set,
// ranked by how many matching items carry them. Feeds the editable filter's
// suggestion row so a viewer narrows by tags that actually appear in the
// current result set rather than a static popular list. Drops tags already
// active (criteria or exclude), uploader markers (#by_*), and the always-hidden
// #unavailable_embed. Empty criteria → empty (the suggestion row only renders in
// results mode, which has at least one criterion).
export function queryCooccurringTags(
  tagIds: string[],
  excludeTagIds: string[],
  limit: number,
): { id: string; tag_normalized: string; tag_display: string; n: number }[] {
  if (tagIds.length === 0) return [];
  const placeholders = tagIds.map(() => '?').join(',');
  const excludeClause = excludeTagIds.length === 0
    ? ''
    : `AND NOT EXISTS (
         SELECT 1 FROM media_tags mtex
         WHERE mtex.media_id = mi.id
           AND mtex.tag_id IN (${excludeTagIds.map(() => '?').join(',')})
       )`;
  const activeIds = [...tagIds, ...excludeTagIds];
  const activePlaceholders = activeIds.map(() => '?').join(',');
  return db.prepare(`
    WITH matching AS (
      SELECT mi.id
      FROM media_items mi
      JOIN media_tags mt ON mt.media_id = mi.id
      WHERE mi.moderation_status = 'active'
        AND mi.is_avatar = 0
        AND mt.tag_id IN (${placeholders})
        ${excludeClause}
        AND NOT EXISTS (
          SELECT 1 FROM media_tags mtu
          JOIN tags tu ON tu.id = mtu.tag_id
          WHERE mtu.media_id = mi.id AND tu.tag_normalized = '#unavailable_embed'
        )
      GROUP BY mi.id
      HAVING COUNT(DISTINCT mt.tag_id) = ?
    )
    SELECT t.id, t.tag_normalized,
           MAX(mt.tag_display) AS tag_display,
           COUNT(DISTINCT mt.media_id) AS n
    FROM matching m
    JOIN media_tags mt ON mt.media_id = m.id
    JOIN tags t ON t.id = mt.tag_id
    WHERE t.id NOT IN (${activePlaceholders})
      AND substr(t.tag_normalized, 1, 4) <> '#by_'
      AND t.tag_normalized <> '#unavailable_embed'
    GROUP BY t.id
    -- Only tags that split the set are useful filters: drop any tag carried by
    -- every matching item (it would change nothing).
    HAVING COUNT(DISTINCT mt.media_id) < (SELECT COUNT(*) FROM matching)
    ORDER BY n DESC, t.tag_normalized ASC
    LIMIT ?
  `).all(
    ...tagIds, ...excludeTagIds, tagIds.length,
    ...activeIds, limit,
  ) as { id: string; tag_normalized: string; tag_display: string; n: number }[];
}

export function queryMemberDisplayNamesBySlugs(
  slugs: string[],
): { slug: string; display_name: string }[] {
  if (slugs.length === 0) return [];
  const placeholders = slugs.map(() => '?').join(',');
  return db.prepare(`
    SELECT slug, display_name
    FROM members_active
    WHERE slug IN (${placeholders})
      AND personal_data_purged_at IS NULL
  `).all(...slugs) as { slug: string; display_name: string }[];
}

export const mediaTags = {
  get findTagByNormalized() { return db.prepare(`
    SELECT id FROM tags WHERE tag_normalized = ?
  `); },

  get insertTag() { return db.prepare(`
    INSERT INTO tags (
      id, created_at, created_by, updated_at, updated_by, version,
      tag_normalized, tag_display,
      is_standard, standard_type
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, ?,
              0, NULL)
  `); },

  get insertStandardTag() { return db.prepare(`
    INSERT INTO tags (
      id, created_at, created_by, updated_at, updated_by, version,
      tag_normalized, tag_display,
      is_standard, standard_type
    ) VALUES (?, ?, ?, ?, ?, 1,
              ?, ?,
              1, ?)
  `); },

  get insertMediaTag() { return db.prepare(`
    INSERT INTO media_tags (
      id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, ?, ?)
  `); },

  // Replace a media item's tag set: delete-then-insert pattern for
  // editMedia. Caller wraps in a transaction with the matching reinsert.
  get deleteMediaTagsByMediaId() { return db.prepare(`
    DELETE FROM media_tags WHERE media_id = ?
  `); },

  // (media_id, tag_id) probe for idempotent tag application: callers
  // that may re-apply tags to media that already carry them (gallery
  // picker) skip the INSERT when this returns a row.
  get findMediaTag() { return db.prepare(`
    SELECT id FROM media_tags WHERE media_id = ? AND tag_id = ?
  `); },

  get updateTagDisplay() { return db.prepare(`
    UPDATE tags
       SET tag_normalized = ?,
           tag_display    = ?,
           updated_at     = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?
  `); },
};

// ── tag_stats (denormalized read cache for tag discovery) ────────────────────

export interface TagStatSourceRow {
  tag_id: string;
  usage_count: number;
  distinct_member_count: number;
  last_used_at: string | null;
}

export function queryTagStatsSource(): TagStatSourceRow[] {
  return db.prepare(`
    SELECT mt.tag_id,
           COUNT(*) AS usage_count,
           COUNT(DISTINCT mi.uploader_member_id) AS distinct_member_count,
           MAX(mi.uploaded_at) AS last_used_at
    FROM media_tags mt
    JOIN media_items mi ON mi.id = mt.media_id
    WHERE mi.moderation_status = 'active'
      AND mi.is_avatar = 0
    GROUP BY mt.tag_id
  `).all() as TagStatSourceRow[];
}

export interface PopularTagRow {
  tag_id: string;
  tag_normalized: string;
  tag_display: string;
  usage_count: number;
  distinct_member_count: number;
}

export interface StandardTagWithMediaRow {
  tag_id: string;
  tag_normalized: string;
  tag_display: string;
  standard_type: 'event' | 'club';
  usage_count: number;
}

export interface TagSuggestRow {
  tag_normalized: string;
  tag_display: string;
  usage_count: number | null;
}

export interface MemberTagRow {
  tag_normalized: string;
  tag_display: string;
}

export const tagStats = {
  get upsertTagStat() { return db.prepare(`
    INSERT INTO tag_stats (tag_id, usage_count, distinct_member_count, last_used_at, created_at, updated_at, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tag_id) DO UPDATE SET
      usage_count = excluded.usage_count,
      distinct_member_count = excluded.distinct_member_count,
      last_used_at = excluded.last_used_at,
      updated_at = excluded.updated_at,
      computed_at = excluded.computed_at
  `); },

  get deleteAll() { return db.prepare(`DELETE FROM tag_stats`); },

  get listTagIdsByMediaId() { return db.prepare(`
    SELECT tag_id FROM media_tags WHERE media_id = ?
  `); },

  get upsertIncrement() { return db.prepare(`
    INSERT INTO tag_stats (tag_id, usage_count, distinct_member_count, last_used_at, created_at, updated_at, computed_at)
    VALUES (?, 1, 1, ?, ?, ?, ?)
    ON CONFLICT(tag_id) DO UPDATE SET
      usage_count = tag_stats.usage_count + 1,
      last_used_at = excluded.last_used_at,
      updated_at = excluded.updated_at,
      computed_at = excluded.computed_at
  `); },

  get decrementUsageCount() { return db.prepare(`
    UPDATE tag_stats
       SET usage_count = usage_count - 1,
           updated_at = ?,
           computed_at = ?
     WHERE tag_id = ?
  `); },

  get deleteZeroUsage() { return db.prepare(`
    DELETE FROM tag_stats WHERE tag_id = ? AND usage_count <= 0
  `); },

  get recomputeDistinctMemberCountForTag() { return db.prepare(`
    UPDATE tag_stats
       SET distinct_member_count = (
             SELECT COUNT(DISTINCT mi.uploader_member_id)
               FROM media_tags mt
               JOIN media_items mi ON mi.id = mt.media_id
              WHERE mt.tag_id = ?
                AND mi.moderation_status = 'active'
                AND mi.is_avatar = 0
           ),
           updated_at = ?,
           computed_at = ?
     WHERE tag_id = ?
  `); },

  // Popular tags for media discovery: the most-used PUBLIC tags. A tag is public
  // when 2+ distinct members use it (community adoption) OR it appears on
  // curator/system-uploaded content (the published catalog is public even though
  // a single account owns it). A single non-system member's personal tags match
  // neither branch, so private personal tags never leak into discovery.
  get listPopularPublicTags() { return db.prepare(`
    SELECT ts.tag_id, t.tag_normalized, t.tag_display,
           ts.usage_count, ts.distinct_member_count
    FROM tag_stats ts
    JOIN tags t ON t.id = ts.tag_id
    WHERE t.tag_normalized NOT LIKE '#by_%'
      AND t.tag_normalized <> '#unavailable_embed'
      AND (
            ts.distinct_member_count >= 2
            OR EXISTS (
                 SELECT 1 FROM media_tags mt
                 JOIN media_items mi ON mi.id = mt.media_id
                 JOIN members m ON m.id = mi.uploader_member_id
                 WHERE mt.tag_id = ts.tag_id
                   AND mi.moderation_status = 'active'
                   AND mi.is_avatar = 0
                   AND m.is_system = 1
               )
          )
    ORDER BY ts.usage_count DESC, ts.distinct_member_count DESC
    LIMIT ?
  `); },

  // Real community-popular tags only: at least two distinct members share the
  // tag. This is the "people are uploading and tagging" signal that ranks ahead
  // of curated starter seeds in the suggestion surface.
  get listMemberCommunityPopularTags() { return db.prepare(`
    SELECT ts.tag_id, t.tag_normalized, t.tag_display,
           ts.usage_count, ts.distinct_member_count
    FROM tag_stats ts
    JOIN tags t ON t.id = ts.tag_id
    WHERE t.tag_normalized NOT LIKE '#by_%'
      AND t.tag_normalized <> '#unavailable_embed'
      AND ts.distinct_member_count >= 2
    ORDER BY ts.usage_count DESC, ts.distinct_member_count DESC
    LIMIT ?
  `); },

  // Curator-published tags that are not yet shared by two distinct members.
  // Public (they ride system-owned content) but they fill suggestion slots only
  // after real community tags and the curated starter seeds.
  get listCuratorPublishedPopularTags() { return db.prepare(`
    SELECT ts.tag_id, t.tag_normalized, t.tag_display,
           ts.usage_count, ts.distinct_member_count
    FROM tag_stats ts
    JOIN tags t ON t.id = ts.tag_id
    WHERE t.tag_normalized NOT LIKE '#by_%'
      AND t.tag_normalized <> '#unavailable_embed'
      AND ts.distinct_member_count < 2
      AND EXISTS (
            SELECT 1 FROM media_tags mt
            JOIN media_items mi ON mi.id = mt.media_id
            JOIN members m ON m.id = mi.uploader_member_id
            WHERE mt.tag_id = ts.tag_id
              AND mi.moderation_status = 'active'
              AND mi.is_avatar = 0
              AND m.is_system = 1
          )
    ORDER BY ts.usage_count DESC, ts.distinct_member_count DESC
    LIMIT ?
  `); },

  get listStandardTagsWithMedia() { return db.prepare(`
    SELECT t.id AS tag_id, t.tag_normalized, t.tag_display, t.standard_type,
           ts.usage_count
    FROM tags t
    JOIN tag_stats ts ON ts.tag_id = t.id
    WHERE t.is_standard = 1
      AND ts.usage_count > 0
    ORDER BY t.standard_type, t.tag_display
  `); },

  get listMemberClubTags() { return db.prepare(`
    SELECT t.tag_normalized, t.tag_display
    FROM member_club_affiliations mca
    JOIN clubs c ON c.id = mca.club_id
    JOIN tags t ON t.id = c.hashtag_tag_id
    WHERE mca.member_id = ? AND mca.is_current = 1
    ORDER BY mca.is_primary DESC
  `); },

  get listMemberParticipatedEventTags() { return db.prepare(`
    SELECT DISTINCT t.tag_normalized, t.tag_display
    FROM event_result_entry_participants erep
    JOIN event_result_entries ere ON ere.id = erep.result_entry_id
    JOIN events e ON e.id = ere.event_id
    JOIN tags t ON t.id = e.hashtag_tag_id
    WHERE erep.member_id = ?
      AND e.status IN ('published', 'completed')
    ORDER BY e.start_date DESC
    LIMIT ?
  `); },
};

// Tag autocomplete for /tags/suggest. Matches the bare term as a `#<term>%`
// prefix, and applies the same ontology expansion the /media/browse search uses:
// a set/style term also surfaces its set and concept tags (`#set_<term>`,
// `#concept_<term>_sets`) and the trick tags of every trick that carries `<term>`
// as a modifier (so typing "pixie" surfaces #set_pixie, #concept_pixie_sets, and
// modifier-carrying folk names like #pigbeater, none of which share the `#pixie`
// prefix). A term with no set/concept/modifier matches gains nothing from the
// extra branches, so ordinary prefix suggestions are unchanged.
export function suggestTagsForTerm(term: string, limit: number): TagSuggestRow[] {
  const escaped = term.replace(/[%_\\]/g, c => '\\' + c);
  const pattern = `#${escaped}%`;
  return db.prepare(`
    SELECT t.tag_normalized, t.tag_display,
           ts.usage_count
    FROM tags t
    LEFT JOIN tag_stats ts ON ts.tag_id = t.id
    WHERE (
        t.tag_normalized LIKE ? ESCAPE '\\'
        OR t.tag_normalized IN ('#set_' || ?, '#concept_' || ? || '_sets')
        OR t.id IN (
          SELECT t2.id FROM tags t2
          JOIN freestyle_trick_modifier_links ml ON t2.tag_normalized = '#' || ml.trick_slug
          WHERE ml.modifier_slug = ?
        )
      )
      AND t.tag_normalized NOT LIKE '#by_%'
      AND t.tag_normalized <> '#unavailable_embed'
    ORDER BY COALESCE(ts.distinct_member_count, 0) DESC,
             COALESCE(ts.usage_count, 0) DESC
    LIMIT ?
  `).all(pattern, term, term, term, limit) as TagSuggestRow[];
}

export interface MediaJobRow {
  id: string;
  kind: 'curator_video';
  state:
    | 'pending_upload'
    | 'pending_transcode'
    | 'processing'
    | 'succeeded'
    | 'failed'
    | 'abandoned';
  admin_member_id: string;
  source_video_key: string | null;
  source_poster_key: string | null;
  caption: string | null;
  tags: string;
  source_filename: string | null;
  media_id: string | null;
  retry_count: number;
  last_error: string | null;
  last_attempted_at: string | null;
  lease_expires_at: string | null;
  expires_at: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  version: number;
}

export const mediaJobs = {
  get insertPendingUpload() { return db.prepare(`
    INSERT INTO media_jobs (
      id, created_at, created_by, updated_at, updated_by, version,
      kind, state, admin_member_id,
      source_video_key, source_poster_key,
      caption, tags, source_filename,
      retry_count, expires_at
    ) VALUES (?, ?, ?, ?, ?, 1,
      ?, 'pending_upload', ?,
      ?, ?,
      ?, ?, ?,
      0, ?)
  `); },

  get findById() { return db.prepare(`
    SELECT * FROM media_jobs WHERE id = ?
  `); },

  get findByIdForAdmin() { return db.prepare(`
    SELECT * FROM media_jobs WHERE id = ? AND admin_member_id = ?
  `); },

  get markPendingTranscode() { return db.prepare(`
    UPDATE media_jobs
    SET state = 'pending_transcode',
        expires_at = NULL,
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE id = ? AND admin_member_id = ? AND state = 'pending_upload'
  `); },

  get claimForProcessing() { return db.prepare(`
    UPDATE media_jobs
    SET state = 'processing',
        last_attempted_at = ?,
        lease_expires_at = ?,
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE id = ? AND state = 'pending_transcode'
  `); },

  get markSucceeded() { return db.prepare(`
    UPDATE media_jobs
    SET state = 'succeeded',
        media_id = ?,
        lease_expires_at = NULL,
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE id = ? AND state = 'processing'
  `); },

  get markFailedRetry() { return db.prepare(`
    UPDATE media_jobs
    SET state = 'pending_transcode',
        retry_count = retry_count + 1,
        last_error = ?,
        last_attempted_at = NULL,
        lease_expires_at = NULL,
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE id = ? AND state = 'processing'
  `); },

  get markFailedTerminal() { return db.prepare(`
    UPDATE media_jobs
    SET state = 'failed',
        retry_count = retry_count + 1,
        last_error = ?,
        lease_expires_at = NULL,
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE id = ? AND state = 'processing'
  `); },

  get markAbandoned() { return db.prepare(`
    UPDATE media_jobs
    SET state = 'abandoned',
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE id = ? AND state = 'pending_upload'
  `); },

  get selectExpiredPendingUploads() { return db.prepare(`
    SELECT * FROM media_jobs
    WHERE state = 'pending_upload'
      AND expires_at IS NOT NULL
      AND expires_at <= ?
  `); },

  get selectOrphanedProcessing() { return db.prepare(`
    SELECT * FROM media_jobs
    WHERE state = 'processing'
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
  `); },

  get selectRetryEligiblePendingTranscode() { return db.prepare(`
    SELECT * FROM media_jobs
    WHERE state = 'pending_transcode'
      AND retry_count > 0
  `); },

  get resetOrphanedToTranscode() { return db.prepare(`
    UPDATE media_jobs
    SET state = 'pending_transcode',
        last_attempted_at = NULL,
        lease_expires_at = NULL,
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE id = ? AND state = 'processing'
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
  `); },
};

export interface CuratorSlotMediaRow {
  id: string;
  media_type: 'photo' | 'video';
  video_platform: 'youtube' | 'vimeo' | 's3' | null;
  video_id: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  s3_key_thumb: string | null;
  s3_key_display: string | null;
}

// Photo rows have s3_key_thumb / s3_key_display populated and the video_*
// columns NULL. Video rows are platform-shaped:
//   's3'      → video_id holds the S3 key for the bytes; thumbnail_url is a
//               /media/... URL to the seeded poster; video_url is NULL.
//   'youtube' → video_id holds the YouTube video id; video_url holds the full
//               youtube.com URL; thumbnail_url is NULL (the gallery service
//               derives https://i.ytimg.com/vi/{id}/hqdefault.jpg at render
//               time, since YouTube thumbnails are a deterministic function
//               of the video id).
//   'vimeo'   → video_id holds the Vimeo video id; video_url holds the full
//               vimeo.com URL; thumbnail_url holds the sidecar-supplied
//               i.vimeocdn.com poster URL (Vimeo thumbnails are NOT derivable
//               from the video id).
// Shaping must branch on media_type and, for videos, on video_platform.
export interface CuratorGalleryRow {
  id: string;
  media_type: 'photo' | 'video';
  caption: string | null;
  uploaded_at: string;
  s3_key_thumb: string | null;
  s3_key_display: string | null;
  video_platform: 'youtube' | 'vimeo' | 's3' | null;
  video_id: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  width_px: number | null;
  height_px: number | null;
}

export interface CuratorMediaCountRow {
  n: number;
}

// Row shapes for named-gallery URL bookmarks (member_galleries +
// member_gallery_tags). FH-owned rows back the public hub at /media; the
// criteria-tag list defines the tag-AND view rendered at /media/<id>.
export interface FhNamedGalleryRow {
  id: string;
  name: string;
  description: string;
  sort_order: 'upload_desc' | 'upload_asc' | 'caption_asc';
}

export type GallerySortOrder = FhNamedGalleryRow['sort_order'];

export interface FhNamedGalleryTagRow {
  id: string;
  tag_display: string;
}

export interface ExistingAvatarRow {
  id: string;
  s3_key_thumb: string;
  s3_key_display: string;
}

export interface AvatarUploadCountRow {
  upload_count: number;
}

// ── Legacy claim ────────────────────────────────────────────────────────────────

export interface AlreadyClaimedRow {
  legacy_member_id: string;
}

export interface HistoricalPersonClaimRow {
  person_id: string;
  person_name: string;
  aliases: string | null;
  legacy_member_id: string | null;
  country: string | null;
  hof_member: number;
  bap_member: number;
  hof_induction_year: number | null;
  bap_induction_year: number | null;
  first_year: number | null;
  is_deceased: number;
}

export const legacyClaim = {
  get findHistoricalPersonByLegacyId() { return db.prepare(`
    SELECT person_id, person_name, aliases, legacy_member_id, country,
           hof_member, bap_member, hof_induction_year, bap_induction_year, first_year, is_deceased
    FROM historical_persons
    WHERE legacy_member_id = ?
    LIMIT 1
  `); },

  get findHistoricalPersonById() { return db.prepare(`
    SELECT person_id, person_name, aliases, legacy_member_id, country,
           hof_member, bap_member, hof_induction_year, bap_induction_year, first_year, is_deceased
    FROM historical_persons
    WHERE person_id = ?
    LIMIT 1
  `); },

  get findHistoricalPersonByAlias() { return db.prepare(`
    SELECT person_id, person_name, aliases, legacy_member_id, country,
           hof_member, bap_member, hof_induction_year, bap_induction_year, first_year, is_deceased
    FROM historical_persons
    WHERE aliases LIKE '%' || ? || '%' ESCAPE '\\'
    LIMIT 1
  `); },

  get checkLegacyIdAlreadyClaimed() { return db.prepare(`
    SELECT id
    FROM members
    WHERE legacy_member_id = ?
      AND deleted_at IS NULL
    LIMIT 1
  `); },

  get checkAlreadyClaimed() { return db.prepare(`
    SELECT legacy_member_id
    FROM members
    WHERE id = ?
      AND legacy_member_id IS NOT NULL
  `); },

  get transferLegacyFields() { return db.prepare(`
    UPDATE members
    SET
      legacy_member_id = ?,
      legacy_user_id   = COALESCE(legacy_user_id, ?),
      legacy_email     = COALESCE(legacy_email, ?),
      bio              = CASE WHEN bio = '' THEN ? ELSE bio END,
      birth_date       = COALESCE(birth_date, ?),
      street_address   = COALESCE(street_address, ?),
      postal_code      = COALESCE(postal_code, ?),
      city             = CASE WHEN city IS NULL OR city = '' THEN ? ELSE city END,
      region           = CASE WHEN region IS NULL OR region = '' THEN ? ELSE region END,
      country          = CASE WHEN country IS NULL OR country = '' THEN ? ELSE country END,
      ifpa_join_date   = COALESCE(ifpa_join_date, ?),
      is_hof           = MAX(is_hof, ?),
      is_bap           = MAX(is_bap, ?),
      first_competition_year = COALESCE(first_competition_year, ?),
      updated_at       = ?,
      updated_by       = 'claim_merge',
      version          = version + 1
    WHERE id = ?
  `); },

  // Copies identity-defining fields from a linked historical_persons row into
  // the claiming members row. Called in the same transaction as
  // setMemberHistoricalPersonId so search / hero / profile surfaces reflect
  // the HP's country, HoF/BAP status, and induction years on the member row.
  // Fill-if-empty for free-text fields, OR semantics for boolean honors.
  get mergeHistoricalPersonFields() { return db.prepare(`
    UPDATE members
    SET
      country                = CASE WHEN country IS NULL OR country = '' THEN ? ELSE country END,
      is_hof                 = MAX(is_hof, ?),
      is_bap                 = MAX(is_bap, ?),
      hof_inducted_year      = COALESCE(hof_inducted_year, ?),
      first_competition_year = COALESCE(first_competition_year, ?),
      updated_at             = ?,
      updated_by             = 'claim_merge',
      version                = version + 1
    WHERE id = ?
  `); },

  // Used by the HP-only claim flow (scenarios D and E): check that no other
  // live member already owns this HP. The partial UNIQUE index on
  // members.historical_person_id ultimately enforces this at write time; this
  // read is for a friendly error rather than a raw constraint failure.
  // Latest completed-claim audit row for a member; the dispute revert binds
  // its forensic events to this id.
  get findLatestClaimAuditForMember() { return db.prepare(`
    SELECT id FROM audit_entries
    WHERE entity_type = 'member' AND entity_id = ?
      AND action_type IN ('claim.legacy_account', 'claim.historical_person')
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `); },

  get findMemberClaimingHp() { return db.prepare(`
    SELECT id, slug
    FROM members
    WHERE historical_person_id = ?
      AND deleted_at IS NULL
      AND personal_data_purged_at IS NULL
    LIMIT 1
  `); },

  // A deceased member keeps their historical-person link through the contact
  // scrub (the record goes on honoring their contributions), but the scrub sets
  // personal_data_purged_at, which findMemberClaimingHp filters out. This
  // companion lookup spots a deceased holder so the claim surfaces treat the
  // record as taken rather than offering it for re-claim by someone else.
  get findDeceasedMemberHoldingHp() { return db.prepare(`
    SELECT id
    FROM members
    WHERE historical_person_id = ?
      AND is_deceased = 1
    LIMIT 1
  `); },

  get checkMemberHasHp() { return db.prepare(`
    SELECT historical_person_id
    FROM members
    WHERE id = ?
      AND historical_person_id IS NOT NULL
  `); },

  // Read the identifying fields needed to evaluate a claim: the member's slug
  // (for post-claim redirect), real_name (for surname reconciliation against
  // the HP or legacy account), existing linkage state, and the verified-email
  // signal used by the email-equality fast path in initiateLegacyClaim.
  get findClaimingMember() { return db.prepare(`
    SELECT id, slug, real_name, legacy_member_id, historical_person_id,
           login_email_normalized, email_verified_at, birth_date, country
    FROM members
    WHERE id = ?
      AND deleted_at IS NULL
      AND personal_data_purged_at IS NULL
  `); },

  get listClubAffiliationsForPerson() { return db.prepare(`
    SELECT lcc.display_name
      FROM legacy_person_club_affiliations lpca
      JOIN legacy_club_candidates lcc
        ON lpca.legacy_club_candidate_id = lcc.id
     WHERE lpca.historical_person_id = ?
  `); },

  get listEventsAttendedByPerson() { return db.prepare(`
    SELECT DISTINCT e.title,
           CAST(substr(e.start_date, 1, 4) AS INTEGER) AS year
      FROM event_result_entry_participants erep
      JOIN event_result_entries ere ON erep.result_entry_id = ere.id
      JOIN events e ON ere.event_id = e.id
     WHERE erep.historical_person_id = ?
     ORDER BY year DESC
  `); },
};

// ── legacy_members ──────────────────────────────────────────────────────────
//
// Permanent archival table of old footbag.org user accounts. Claim marks
// (claimed_by_member_id + claimed_at) but does not delete the row; PII purge
// clears the claim fields so the legacy account becomes claimable again.
// ---------------------------------------------------------------------------
export interface LegacyMemberRow {
  legacy_member_id: string;
  legacy_user_id: string | null;
  legacy_email: string | null;
  legacy_email2: string | null;
  legacy_email3: string | null;
  real_name: string | null;
  display_name: string | null;
  display_name_normalized: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  bio: string | null;
  birth_date: string | null;
  street_address: string | null;
  postal_code: string | null;
  ifpa_join_date: string | null;
  first_competition_year: number | null;
  is_hof: number;
  is_bap: number;
  legacy_is_admin: number;
  legacy_ever_paid_tier2: number;
  legacy_ever_paid_tier1_lifetime: number;
  legacy_tier1_annual_active_at_cutover: number;
  import_source: string | null;
  imported_at: string;
  version: number;
  claimed_by_member_id: string | null;
  claimed_at: string | null;
}

export const legacyMembers = {
  get insert() { return db.prepare(`
    INSERT INTO legacy_members (
      legacy_member_id,
      legacy_user_id, legacy_email, legacy_email2, legacy_email3,
      real_name, display_name, display_name_normalized,
      city, region, country,
      bio, birth_date, street_address, postal_code,
      ifpa_join_date, first_competition_year,
      is_hof, is_bap, legacy_is_admin,
      import_source, imported_at,
      version
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
    )
  `); },

  // Returns every unclaimed legacy row matching the identifier (member id, user
  // id, or any of the three emails) so the service can detect ambiguity, e.g. a
  // duplicate email address across accounts. Legacy emails are stored lowercase
  // (the loader lowercases them at write) and the service lowercases the lookup
  // value, so the plain email indexes are used with an equality seek. A
  // COLLATE NOCASE predicate here would defeat those BINARY indexes and force a
  // full table scan per lookup, which is O(members x rows) at the cutover batch
  // auto-link.
  get findAllByIdentifier() { return db.prepare(`
    SELECT
      legacy_member_id,
      legacy_user_id, legacy_email, legacy_email2, legacy_email3,
      real_name, display_name,
      bio, birth_date, street_address, postal_code,
      city, region, country,
      ifpa_join_date, first_competition_year,
      is_hof, is_bap, legacy_is_admin,
      claimed_by_member_id, claimed_at
    FROM legacy_members
    WHERE claimed_by_member_id IS NULL
      AND (legacy_member_id = ? OR legacy_user_id = ?
           OR legacy_email = ?
           OR legacy_email2 = ?
           OR legacy_email3 = ?)
  `); },

  get findByLegacyMemberId() { return db.prepare(`
    SELECT
      legacy_member_id,
      legacy_user_id, legacy_email, legacy_email2, legacy_email3,
      real_name, display_name,
      bio, birth_date, street_address, postal_code,
      city, region, country,
      ifpa_join_date, first_competition_year,
      is_hof, is_bap, legacy_is_admin,
      legacy_ever_paid_tier2, legacy_ever_paid_tier1_lifetime, legacy_tier1_annual_active_at_cutover,
      claimed_by_member_id, claimed_at
    FROM legacy_members
    WHERE legacy_member_id = ?
  `); },

  get markClaimed() { return db.prepare(`
    UPDATE legacy_members
    SET
      claimed_by_member_id = ?,
      claimed_at           = ?,
      version              = version + 1
    WHERE legacy_member_id = ?
      AND claimed_by_member_id IS NULL
  `); },

  get clearClaim() { return db.prepare(`
    UPDATE legacy_members
    SET
      claimed_by_member_id = NULL,
      claimed_at           = NULL,
      version              = version + 1
    WHERE legacy_member_id = ?
  `); },

  // Clear members.legacy_member_id when reverting a silent auto-link.
  // Caller wraps in the same transaction as the legacy_members.clearClaim
  // call so the linkage state is mutually consistent at COMMIT time.
  get clearMemberLegacyLink() { return db.prepare(`
    UPDATE members
    SET
      legacy_member_id = NULL,
      updated_at       = ?,
      updated_by       = ?,
      version          = version + 1
    WHERE id = ?
  `); },

  // Clear members.historical_person_id when the HP back-link came from the
  // legacy claim being reverted. Direct-HP claims (HP without matching
  // legacy_member_id) are preserved by the caller's conditional check.
  get clearMemberHistoricalPersonId() { return db.prepare(`
    UPDATE members
    SET
      historical_person_id = NULL,
      updated_at           = ?,
      updated_by           = ?,
      version              = version + 1
    WHERE id = ?
  `); },

  // Undo the personal fields the claim merge copied from the claimed
  // legacy_members row when a claim is reverted, so a disputed or mistaken
  // link leaves none of the linked record's PII (birth date, address, bio,
  // join date) on the member row. The merge is fill-if-empty, so a field is
  // cleared only where it still equals the value copied from the legacy row
  // (passed as parameters); a value the member entered themselves is left
  // untouched. HoF/BAP honors are deliberately preserved -- the honor record
  // outlives the personal data.
  get scrubClaimedLegacyFields() { return db.prepare(`
    UPDATE members
    SET
      legacy_user_id         = CASE WHEN legacy_user_id = ? THEN NULL ELSE legacy_user_id END,
      legacy_email           = CASE WHEN legacy_email = ? THEN NULL ELSE legacy_email END,
      bio                    = CASE WHEN bio = ? THEN '' ELSE bio END,
      birth_date             = CASE WHEN birth_date = ? THEN NULL ELSE birth_date END,
      street_address         = CASE WHEN street_address = ? THEN NULL ELSE street_address END,
      postal_code            = CASE WHEN postal_code = ? THEN NULL ELSE postal_code END,
      city                   = CASE WHEN city = ? THEN NULL ELSE city END,
      region                 = CASE WHEN region = ? THEN NULL ELSE region END,
      country                = CASE WHEN country = ? THEN NULL ELSE country END,
      ifpa_join_date         = CASE WHEN ifpa_join_date = ? THEN NULL ELSE ifpa_join_date END,
      first_competition_year = CASE WHEN first_competition_year = ? THEN NULL ELSE first_competition_year END,
      updated_at             = ?,
      updated_by             = ?,
      version                = version + 1
    WHERE id = ?
  `); },

  // Drop the denormalized honor flags on a claim revert. members.is_hof /
  // is_bap / hof_inducted_year are only ever written by the claim merge (from
  // the claimed legacy row or its historical_persons record), so when a revert
  // leaves the member linked to no honored record the flags came from the
  // reverted claim and must go -- otherwise a reverted (often disputed) claim
  // strands a HoF/BAP badge, and the public profile visibility it confers, on a
  // member who no longer holds the honor. The caller skips this when a separate
  // historical-person link survives the revert and still backs the honor.
  get clearDerivedHonors() { return db.prepare(`
    UPDATE members
    SET
      is_hof            = 0,
      is_bap            = 0,
      hof_inducted_year = NULL,
      updated_at        = ?,
      updated_by        = ?,
      version           = version + 1
    WHERE id = ?
  `); },

  // Written as part of the claim transaction when the claimed legacy_members
  // row has a matching historical_persons.legacy_member_id. Sets the
  // derived member↔HP link.
  get setMemberHistoricalPersonId() { return db.prepare(`
    UPDATE members
    SET
      historical_person_id = ?,
      updated_at           = ?,
      updated_by           = 'claim_merge',
      version              = version + 1
    WHERE id = ?
      AND historical_person_id IS NULL
  `); },

  // Profile-settings listing: every legacy_members row claimed by a live
  // member. Today there is at most one per member (single-claim enforced
  // by the partial UNIQUE on members.legacy_member_id), but the listing
  // shape is preserved for forward-compat with admin-driven multi-claim
  // recovery flows.
  get listClaimedByMember() { return db.prepare(`
    SELECT legacy_member_id,
           COALESCE(display_name, real_name) AS display_name,
           claimed_at
    FROM legacy_members
    WHERE claimed_by_member_id = ?
    ORDER BY claimed_at ASC
  `); },
};

// ── autoLinkStagedCandidates ────────────────────────────────────────────────
//
// Migration-only staging surface for batch auto-link candidate matches.
// The staging pass inserts open rows without touching live tables; the
// onboarding wizard reads open rows for the signed-in member; resolution
// (confirmed / declined / expired) is terminal and recorded with a
// timestamp. The partial unique index makes re-staging the same open
// member/target pair a constraint hit, which the service treats as
// already-staged.
// ---------------------------------------------------------------------------
export interface AutoLinkStagedCandidateRow {
  id: string;
  member_id: string;
  legacy_member_id: string | null;
  historical_person_id: string | null;
  confidence: 'high' | 'medium';
  matched_anchors_json: string;
  proposed_evidence_strength: string;
  source_pass: 'batch' | 'sign_in' | 'registration' | 'cross_source';
  status: 'staged' | 'confirmed' | 'declined' | 'expired';
  resolved_at: string | null;
  expires_at: string | null;
}

export const autoLinkStagedCandidates = {
  get insertCandidate() { return db.prepare(`
    INSERT INTO auto_link_staged_candidates (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, legacy_member_id, historical_person_id,
      confidence, matched_anchors_json, proposed_evidence_strength,
      source_pass, status, resolved_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'staged', NULL, ?)
  `); },

  get listOpenByMember() { return db.prepare(`
    SELECT * FROM auto_link_staged_candidates
    WHERE member_id = ? AND status = 'staged'
    ORDER BY created_at ASC, id ASC
  `); },

  get listResolvedByMember() { return db.prepare(`
    SELECT * FROM auto_link_staged_candidates
    WHERE member_id = ? AND status != 'staged'
    ORDER BY created_at ASC, id ASC
  `); },

  get findOpenById() { return db.prepare(`
    SELECT * FROM auto_link_staged_candidates
    WHERE id = ? AND status = 'staged'
  `); },

  // Terminal transition; the status guard makes resolution race-safe
  // (changes=0 when another path already resolved the row).
  get resolveById() { return db.prepare(`
    UPDATE auto_link_staged_candidates
    SET status = ?, resolved_at = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND status = 'staged'
  `); },

  get listExpiredOpen() { return db.prepare(`
    SELECT * FROM auto_link_staged_candidates
    WHERE status = 'staged' AND expires_at IS NOT NULL AND expires_at <= ?
    ORDER BY expires_at ASC, id ASC
  `); },
};

// ---------------------------------------------------------------------------
// memberOnboarding
// ---------------------------------------------------------------------------
// Per-member onboarding-wizard task rows. Owned by MemberOnboardingService.

export interface MemberOnboardingTaskRow {
  id: string;
  member_id: string;
  task_type: string;
  state: string;
  completed_at: string | null;
}

export const memberOnboarding = {
  get insertTaskIfMissing() { return db.prepare(`
    INSERT OR IGNORE INTO member_onboarding_tasks (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, task_type, state
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'pending')
  `); },

  get listForMember() { return db.prepare(`
    SELECT id, member_id, task_type, state, completed_at
      FROM member_onboarding_tasks
     WHERE member_id = ?
  `); },

  get findByMemberAndType() { return db.prepare(`
    SELECT id, member_id, task_type, state, completed_at
      FROM member_onboarding_tasks
     WHERE member_id = ?
       AND task_type = ?
  `); },

  get updateState() { return db.prepare(`
    UPDATE member_onboarding_tasks
       SET state        = ?,
           completed_at = ?,
           updated_at   = ?,
           updated_by   = ?,
           version      = version + 1
     WHERE id = ?
  `); },

  // Dashboard widget read: returns the most recent detour-paused audit
  // metadata per task that is currently in 'in_progress_paused' state.
  // The LATEST audit row wins (ORDER BY occurred_at DESC LIMIT 1 inside
  // the subquery) so a member who paused, resumed, and re-paused sees
  // the most recent detour origin.
  get listForMemberWithDetourMeta() { return db.prepare(`
    SELECT
      t.id,
      t.member_id,
      t.task_type,
      t.state,
      t.completed_at,
      (
        SELECT a.metadata_json
          FROM audit_entries a
         WHERE a.entity_type = 'member_onboarding_task'
           AND a.entity_id   = t.id
           AND a.action_type = 'wizard.task.detour_paused'
         ORDER BY a.rowid DESC
         LIMIT 1
      ) AS detour_metadata_json
    FROM member_onboarding_tasks t
    WHERE t.member_id = ?
  `); },
};

// ── member_declared_anchors ────────────────────────────────────────────────
//
// Former surnames and old emails declared by members to broaden the identity
// matching surface for auto-link and legacy-claim flows.
// ---------------------------------------------------------------------------

export const declaredAnchors = {
  get insert() { return db.prepare(`
    INSERT INTO member_declared_anchors
      (id, created_at, created_by, updated_at, updated_by, member_id, anchor_type, anchor_value)
    VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, ?, ?)
  `); },

  get listByMember() { return db.prepare(`
    SELECT id, anchor_type, anchor_value, created_at, verified_via_link_click_at
      FROM member_declared_anchors
     WHERE member_id = ?
     ORDER BY anchor_type, anchor_value
  `); },

  get deleteById() { return db.prepare(`
    DELETE FROM member_declared_anchors WHERE id = ? AND member_id = ?
  `); },

  // Legacy-URL forwarding lookups: in-flight emails reference
  // /members/profile/<legacy id> and /clubs/<slug> for years after cutover.
  get findLiveMemberSlugByLegacyId() { return db.prepare(`
    SELECT slug FROM members_active
    WHERE legacy_member_id = ?
  `); },

  get findLegacyClubCandidateByKey() { return db.prepare(`
    SELECT legacy_club_key, mapped_club_id FROM legacy_club_candidates
    WHERE legacy_club_key = ?
  `); },

  // Conflict-prompt scan inputs: every claimed identity's display name, so
  // a new registrant's surname can be checked against records that are
  // already taken (same-name collision and impersonation detection).
  // Only the member's chosen public display_name is selected; the legacy
  // legal real_name must never surface to an unrelated registrant.
  get listClaimedLegacyForConflictScan() { return db.prepare(`
    SELECT legacy_member_id, display_name
    FROM legacy_members
    WHERE claimed_by_member_id IS NOT NULL
  `); },

  get listClaimedHpForConflictScan() { return db.prepare(`
    SELECT hp.person_id, hp.person_name
    FROM members m
    JOIN historical_persons hp ON hp.person_id = m.historical_person_id
    WHERE m.deleted_at IS NULL
  `); },

  get findByIdForMember() { return db.prepare(`
    SELECT id, member_id, anchor_type, anchor_value,
           verified_via_link_click_at, verification_token_id
    FROM member_declared_anchors
    WHERE id = ? AND member_id = ?
  `); },

  // Mailbox-control upgrade: stamps the click and the consumed token id.
  // The IS NULL guard makes re-consume attempts no-ops.
  get markVerifiedByLinkClick() { return db.prepare(`
    UPDATE member_declared_anchors
    SET verified_via_link_click_at = ?, verification_token_id = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND member_id = ? AND verified_via_link_click_at IS NULL
  `); },

  // PII purge clears every anchor the member declared; anchors are
  // member-asserted identity data with no archival value once the account's
  // personal data is erased.
  get deleteAllForMember() { return db.prepare(`
    DELETE FROM member_declared_anchors WHERE member_id = ?
  `); },
};

// ── memberPurge ─────────────────────────────────────────────────────────────
//
// Row-level PII erasure for a soft-deleted or deceased member whose grace
// period elapsed. Clears credentials and contact fields to NULL (satisfying
// the purged branch of the members credential CHECK), severs the legacy and
// historical-person links, anonymizes the identity placeholders, and stamps
// personal_data_purged_at. HoF/BAP rows keep display_name and bio (the honor
// record outlives the personal data); every other identity field clears the
// same way. The IS NULL guard makes a re-run a no-op.
export const memberPurge = {
  // The two erasure-state flags come from erasure_log, not from
  // personal_data_purged_at: both erasure shapes set that column (the
  // credential CHECK requires it whenever credentials are NULL), so only the
  // ledger can distinguish a contact-scrubbed row, which a full purge may
  // still upgrade, from a fully purged one.
  get readForPurge() { return db.prepare(`
    SELECT id, slug, is_hof, is_bap, is_deceased, legacy_member_id,
           historical_person_id, personal_data_purged_at,
           EXISTS (
             SELECT 1 FROM erasure_log el
             WHERE el.entity_type = 'member' AND el.entity_id = members.id
               AND el.erasure_kind = 'account_pii_purge'
           ) AS fully_purged,
           EXISTS (
             SELECT 1 FROM erasure_log el
             WHERE el.entity_type = 'member' AND el.entity_id = members.id
               AND el.erasure_kind = 'deceased_contact_scrub'
           ) AS contact_scrubbed
    FROM members
    WHERE id = ?
  `); },

  get purgeRow() { return db.prepare(`
    UPDATE members
    SET
      login_email             = NULL,
      login_email_normalized  = NULL,
      email_verified_at       = NULL,
      password_hash           = NULL,
      password_changed_at     = NULL,
      phone                   = NULL,
      whatsapp                = NULL,
      gender                  = NULL,
      birth_date              = NULL,
      street_address          = NULL,
      postal_code             = NULL,
      city                    = NULL,
      region                  = NULL,
      country                 = NULL,
      legacy_user_id          = NULL,
      legacy_email            = NULL,
      ifpa_join_date          = NULL,
      legacy_member_id        = NULL,
      historical_person_id    = NULL,
      stripe_customer_id      = NULL,
      bio                     = CASE WHEN ? = 1 THEN bio ELSE '' END,
      real_name               = ?,
      display_name            = CASE WHEN ? = 1 THEN display_name ELSE ? END,
      display_name_normalized = CASE WHEN ? = 1 THEN display_name_normalized ELSE ? END,
      slug                    = ?,
      personal_data_purged_at = ?,
      updated_at              = ?,
      updated_by              = ?,
      version                 = version + 1
    WHERE id = ? AND NOT EXISTS (
      SELECT 1 FROM erasure_log el
      WHERE el.entity_type = 'member' AND el.entity_id = members.id
        AND el.erasure_kind = 'account_pii_purge'
    )
  `); },

  // Deceased contact scrub: credentials, contact channels, private address
  // lines, demographics, and the legacy contact email go; identity, locale,
  // honors, and historical links stay so the record keeps honoring the
  // member's contributions. Declared anchors are deleted by the service in
  // the same transaction. Blocked once any erasure shape has been applied.
  get scrubDeceasedRow() { return db.prepare(`
    UPDATE members
    SET
      login_email             = NULL,
      login_email_normalized  = NULL,
      email_verified_at       = NULL,
      password_hash           = NULL,
      password_changed_at     = NULL,
      phone                   = NULL,
      whatsapp                = NULL,
      gender                  = NULL,
      birth_date              = NULL,
      street_address          = NULL,
      postal_code             = NULL,
      legacy_email            = NULL,
      personal_data_purged_at = ?,
      updated_at              = ?,
      updated_by              = ?,
      version                 = version + 1
    WHERE id = ? AND is_deceased = 1 AND NOT EXISTS (
      SELECT 1 FROM erasure_log el
      WHERE el.entity_type = 'member' AND el.entity_id = members.id
    )
  `); },

  // Scan eligibility. A member who is both deceased and soft-deleted belongs
  // to the deleted branch: a full purge supersedes the contact scrub.
  get listDeletedEligible() { return db.prepare(`
    SELECT id FROM members
    WHERE deleted_at IS NOT NULL
      AND is_system = 0
      AND deleted_at <= ?
      AND NOT EXISTS (
        SELECT 1 FROM erasure_log el
        WHERE el.entity_type = 'member' AND el.entity_id = members.id
          AND el.erasure_kind = 'account_pii_purge'
      )
    ORDER BY deleted_at
  `); },

  get listDeceasedEligible() { return db.prepare(`
    SELECT id FROM members
    WHERE is_deceased = 1
      AND deleted_at IS NULL
      AND is_system = 0
      AND deceased_at IS NOT NULL
      AND deceased_at <= ?
      AND NOT EXISTS (
        SELECT 1 FROM erasure_log el
        WHERE el.entity_type = 'member' AND el.entity_id = members.id
      )
    ORDER BY deceased_at
  `); },
};

// Append-only ledger of applied PII erasures. Restores from backup re-apply
// it before the restored data is reachable, and it is the authority on which
// erasure shapes a row has received.
export const erasureLog = {
  get insert() { return db.prepare(`
    INSERT INTO erasure_log (id, created_at, created_by, entity_type, entity_id, erasure_kind)
    VALUES (?, ?, ?, 'member', ?, ?)
  `); },

  get listForEntity() { return db.prepare(`
    SELECT id, created_at, created_by, entity_type, entity_id, erasure_kind
    FROM erasure_log
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at
  `); },
};

// ---- QC-only (delete with pipeline-qc subsystem) ----
// ---------------------------------------------------------------------------
// personsQc
// ---------------------------------------------------------------------------─────

export interface PersonsQcRow {
  person_id: string;
  person_name: string;
  aliases: string | null;
  source: string | null;
  source_scope: string | null;
  country: string | null;
  event_count: number;
  placement_count: number;
}

export const personsQc = {
  get listAll() { return db.prepare(`
    SELECT person_id, person_name, aliases, source, source_scope, country,
           event_count, placement_count
    FROM historical_persons
    ORDER BY person_name COLLATE NOCASE
  `); },
};

// Read-only auto-link candidate lookup. Rows in `name_variants` are loaded
// pre-normalized (NFKC+lower+trim+collapse), by contract of the loader.
// Symmetric table: a lookup must check both columns and return the opposite.
// `person_name` is stored unnormalized; the SQL uses `lower(trim(...))` as a
// safe approximation for current canonical data (NFC-composed, single-spaced).
export const nameVariants = {
  get findByEitherColumn() { return db.prepare(`
    SELECT canonical_normalized, variant_normalized
    FROM name_variants
    WHERE canonical_normalized = ? OR variant_normalized = ?
  `); },

  get findHistoricalPersonsByNormalizedName() { return db.prepare(`
    SELECT person_id, person_name
    FROM historical_persons
    WHERE lower(trim(person_name)) = ?
    ORDER BY person_id
  `); },

  get findGivenNameAlternates() { return db.prepare(`
    SELECT short_form_normalized, long_form_normalized
    FROM given_name_variants
    WHERE short_form_normalized = ? OR long_form_normalized = ?
  `); },
};

// ── Membership tier ledger (member_tier_grants / member_tier_current) ──
// Append-only ledger; UPDATE/DELETE blocked by triggers.

export interface MemberTierCurrentRow {
  member_id: string;
  tier_status: 'tier0' | 'tier1' | 'tier2' | 'tier3';
  underlying_tier_status: 'tier1' | 'tier2' | null;
}

export interface MemberTierGrantLatestRow {
  id: string;
  change_type: string;
  old_tier_status: string | null;
  new_tier_status: string;
  old_underlying_tier_status: 'tier1' | 'tier2' | null;
  new_underlying_tier_status: 'tier1' | 'tier2' | null;
  reason_code: string;
  related_payment_id: string | null;
  created_at: string;
}

export const memberTier = {
  get insertGrant() { return db.prepare(`
    INSERT INTO member_tier_grants (
      id, created_at, created_by,
      member_id, actor_member_id,
      change_type,
      old_tier_status, new_tier_status,
      old_underlying_tier_status, new_underlying_tier_status,
      reason_code, reason_text,
      related_payment_id
    ) VALUES (?, ?, 'system',
      ?, ?,
      ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?)
  `); },

  get getCurrent() { return db.prepare(`
    SELECT member_id, tier_status, underlying_tier_status
    FROM member_tier_current
    WHERE member_id = ?
  `); },

  // Most recent governance_set row for this member, used by removeGovernanceTier3
  // to read old_underlying_tier_status when writing the paired governance_removed row.
  get getLatestGovernanceSet() { return db.prepare(`
    SELECT id, change_type,
           old_tier_status, new_tier_status,
           old_underlying_tier_status, new_underlying_tier_status,
           reason_code, related_payment_id, created_at
    FROM member_tier_grants
    WHERE member_id = ? AND change_type = 'governance_set'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `); },

  // Latest grant excluding the legacy-claim marker, used by the auto-link
  // revert to restore the tier the member would hold without the legacy claim.
  // member_tier_current is last-write-wins, so the revert writes a fresh row
  // carrying this tier; a member whose only tier came from the legacy claim has
  // no such row and falls back to tier0.
  get getLatestNonLegacyClaimGrant() { return db.prepare(`
    SELECT new_tier_status, new_underlying_tier_status
    FROM member_tier_grants
    WHERE member_id = ?
      AND reason_code != 'legacy.claim_tier_grant'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `); },
};

// ── Active Player ledger (active_player_grants / member_active_player_current) ──
// Append-only ledger; UPDATE/DELETE blocked by triggers.

export interface MemberActivePlayerCurrentRow {
  member_id: string;
  is_active_player: 0 | 1;
  active_player_expires_at: string | null;
  latest_active_player_reason_code: string | null;
}

export interface ActivePlayerGrantLatestRow {
  id: string;
  change_type: 'grant' | 'extend' | 'expire' | 'end' | 'correct';
  old_active_player_expires_at: string | null;
  new_active_player_expires_at: string | null;
  reason_code: string;
  created_at: string;
}

export const activePlayer = {
  get insertGrant() { return db.prepare(`
    INSERT INTO active_player_grants (
      id, created_at, created_by,
      member_id, actor_member_id,
      change_type,
      old_active_player_expires_at, new_active_player_expires_at,
      reason_code, reason_text,
      related_event_id, related_registration_id,
      related_club_id, related_club_affiliation_id,
      related_vouch_id
    ) VALUES (?, ?, 'system',
      ?, ?,
      ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?)
  `); },

  get getCurrent() { return db.prepare(`
    SELECT member_id, is_active_player,
           active_player_expires_at, latest_active_player_reason_code
    FROM member_active_player_current
    WHERE member_id = ?
  `); },

  // Most recent AP ledger row for this member. Drives the no-shorten rule
  // (compare against new_active_player_expires_at) and the expiry crossing job
  // (skip when the latest row is already change_type='expire').
  get getLatestGrant() { return db.prepare(`
    SELECT id, change_type,
           old_active_player_expires_at, new_active_player_expires_at,
           reason_code, created_at
    FROM active_player_grants
    WHERE member_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `); },

  // Lifetime "ever been an Active Player" probe for the club-join one-time grant.
  // Returns 1 if any prior row of any change_type exists, 0 otherwise.
  get hasAnyPriorGrant() { return db.prepare(`
    SELECT EXISTS (
      SELECT 1 FROM active_player_grants WHERE member_id = ?
    ) AS exists_flag
  `); },

  // Auxiliary FK lookups for AP grant provenance. Kept here because the AP
  // service is currently the only consumer; promote to a dedicated
  // statement group if other services start reading these rows.
  get getRegistrationEventId() { return db.prepare(`
    SELECT event_id, member_id
    FROM registrations
    WHERE id = ?
  `); },

  get getClubAffiliationClubId() { return db.prepare(`
    SELECT club_id, member_id
    FROM member_club_affiliations
    WHERE id = ?
  `); },
};

export const activePlayerVouches = {
  get insertVouch() { return db.prepare(`
    INSERT INTO active_player_vouches (
      id, created_at, created_by,
      voucher_member_id, target_member_id,
      vouched_at, reason_text,
      old_active_player_expires_at, new_active_player_expires_at
    ) VALUES (?, ?, 'system',
      ?, ?,
      ?, ?,
      ?, ?)
  `); },

  // Counts vouches issued by a single voucher since the cutoff (inclusive),
  // for the per-voucher rate limit (vouch_rate_limit_max_per_hour /
  // vouch_rate_limit_window_minutes).
  get countByVoucherSince() { return db.prepare(`
    SELECT COUNT(*) AS n
    FROM active_player_vouches
    WHERE voucher_member_id = ? AND vouched_at >= ?
  `); },
};

export interface ActivePlayerExpiryCandidateRow {
  member_id:    string;
  expires_at:   string;
  login_email:  string | null;
  email_status: string;
}

// SES feedback loop: bounce and complaint notifications mark the member's
// email_status so transactional sends skip dead or complaining addresses.
export const sesFeedback = {
  // Escalation-only: 'bounced' applies to ok rows; 'complained' applies to
  // ok or bounced rows; 'suppressed' (admin-set) is never overwritten.
  get markBounced() { return db.prepare(`
    UPDATE members
    SET email_status = 'bounced', updated_at = ?, updated_by = 'ses_feedback', version = version + 1
    WHERE login_email_normalized = ? AND deleted_at IS NULL AND email_status = 'ok'
  `); },

  get markComplained() { return db.prepare(`
    UPDATE members
    SET email_status = 'complained', updated_at = ?, updated_by = 'ses_feedback', version = version + 1
    WHERE login_email_normalized = ? AND deleted_at IS NULL AND email_status IN ('ok','bounced')
  `); },
};

export const activePlayerExpiry = {
  // Candidate set for SYS_Check_Active_Player_Expiry: Tier 0 members whose
  // latest AP grant still carries a non-null expires_at and whose expiry is
  // not beyond the worker's forward window. Members with an expire/end
  // latest row drop out via the view (active_player_expires_at = NULL).
  get listCandidates() { return db.prepare(`
    SELECT v.member_id,
           v.active_player_expires_at AS expires_at,
           m.login_email,
           m.email_status
    FROM member_membership_status_current v
    JOIN members_active m ON m.id = v.member_id
    WHERE v.tier_status = 'tier0'
      AND v.active_player_expires_at IS NOT NULL
      AND v.active_player_expires_at <= ?
    ORDER BY v.active_player_expires_at ASC
  `); },

  // INSERT only; duplicate (member_id, expires_at, offset_label) raises
  // SQLITE_CONSTRAINT_UNIQUE, which the service treats as "already sent."
  get insertReminderSent() { return db.prepare(`
    INSERT INTO active_player_reminder_sent (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, expires_at, offset_label, sent_at
    ) VALUES (?, ?, 'system', ?, 'system', 1,
              ?, ?, ?, ?)
  `); },
};

export const mailingListSubscriptions = {
  get findStatus() { return db.prepare(`
    SELECT status
    FROM mailing_list_subscriptions
    WHERE mailing_list_id = ? AND member_id = ?
  `); },

  get insertSubscription() { return db.prepare(`
    INSERT INTO mailing_list_subscriptions (
      id, created_at, created_by, updated_at, updated_by, version,
      mailing_list_id, member_id, status, status_updated_at
    ) VALUES (?, ?, 'system', ?, 'system', 1,
              ?, ?, ?, ?)
  `); },

  // Active-subscriber lookup for mailing-list fan-out. Returns one row per
  // member with status='subscribed' on the given list, where the list itself
  // is active, the member's email is verified, and the address is deliverable
  // (email_status='ok'): enqueueing to an SES-bounced/complained address only
  // produces repeated rejections, dead-letter rows, and alarm noise.
  // Used by CommunicationService.enqueueMailingListEmail.
  get listActiveSubscribersBySlug() { return db.prepare(`
    SELECT
      s.member_id,
      m.login_email,
      s.mailing_list_id
    FROM mailing_list_subscriptions AS s
    INNER JOIN members_active AS m ON m.id = s.member_id
    INNER JOIN mailing_lists AS ml ON ml.slug = s.mailing_list_id
    WHERE s.mailing_list_id = ?
      AND s.status = 'subscribed'
      AND ml.status = 'active'
      AND m.email_verified_at IS NOT NULL
      AND m.email_status = 'ok'
  `); },

  // SES bounce/complaint feedback flips the subscriber's mailing-list rows so
  // status stays consistent with deliverability. Only currently-subscribed rows
  // are touched; admin-set 'unsubscribed'/'suppressed' states are never
  // overwritten. Keyed on login_email_normalized to match the SES feedback path.
  get markBouncedForEmail() { return db.prepare(`
    UPDATE mailing_list_subscriptions
    SET status = 'bounced', status_updated_at = ?,
        updated_at = ?, updated_by = 'ses_feedback', version = version + 1,
        bounce_detail = ?
    WHERE status = 'subscribed'
      AND member_id IN (SELECT id FROM members WHERE login_email_normalized = ? AND deleted_at IS NULL)
  `); },

  get markComplainedForEmail() { return db.prepare(`
    UPDATE mailing_list_subscriptions
    SET status = 'complained', status_updated_at = ?,
        updated_at = ?, updated_by = 'ses_feedback', version = version + 1,
        complaint_detail = ?
    WHERE status = 'subscribed'
      AND member_id IN (SELECT id FROM members WHERE login_email_normalized = ? AND deleted_at IS NULL)
  `); },

  // Idempotent subscribe used when a member is provisioned or granted the admin
  // role: a member with no prior row is inserted as subscribed; a member who was
  // previously unsubscribed, bounced, or complained is flipped back to
  // subscribed. The unique (mailing_list_id, member_id) pair drives the upsert.
  get upsertSubscribed() { return db.prepare(`
    INSERT INTO mailing_list_subscriptions (
      id, created_at, created_by, updated_at, updated_by, version,
      mailing_list_id, member_id, status, status_updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'subscribed', ?)
    ON CONFLICT(mailing_list_id, member_id) DO UPDATE SET
      status = 'subscribed',
      status_updated_at = excluded.status_updated_at,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by,
      version = version + 1
  `); },

  // Explicit unsubscribe from one list, leaving every other list this member is
  // on untouched (one row per list). A member with no row for this list is a
  // no-op (zero changes), so revoking a role whose subscription never existed is
  // safe. Distinct from the SES bounce/complaint flips, which the feedback path
  // keys on email.
  get setUnsubscribed() { return db.prepare(`
    UPDATE mailing_list_subscriptions
    SET status = 'unsubscribed', status_updated_at = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE mailing_list_id = ? AND member_id = ?
  `); },
};

// Steady-state admin-role flag write for the in-app grant/revoke action: an
// admin toggles another member's is_admin. The one-time bootstrap path has its
// own guarded single-shot write; this statement is the ongoing per-member toggle
// the membership-tiering service performs inside the grant/revoke transaction.
export const adminRole = {
  get setAdminFlag() { return db.prepare(`
    UPDATE members
    SET is_admin = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  get getIsAdmin() { return db.prepare(`
    SELECT is_admin FROM members_active WHERE id = ?
  `); },
};

export const workQueue = {
  get insertItem() { return db.prepare(`
    INSERT INTO work_queue_items (
      id, created_at, created_by, updated_at, updated_by, version,
      queue_category, task_type, entity_type, entity_id,
      status, priority, opened_at, reason_text, detail_text
    ) VALUES (?, ?, ?, ?, ?, 1,
      ?, ?, ?, ?,
      'open', ?, ?, ?, ?)
  `); },

  // Clear member-authored free text on account erasure: the operational copy of
  // a member's contact-request message lives here (not the append-only audit
  // ledger), so the PII purge and deceased contact scrub must redact it.
  // Erasure scrubs every work-queue row about the member, whatever the task
  // type: contact requests, link-help requests (member-authored identity
  // statements), and birth-date-conflict reviews (raw dates in detail_text)
  // all carry member personal data, and over-scrubbing at erasure is the
  // safe direction.
  get scrubTextForMember() { return db.prepare(`
    UPDATE work_queue_items
    SET reason_text = '(removed on account erasure)', detail_text = NULL,
        updated_at = ?, updated_by = 'operations_purge', version = version + 1
    WHERE entity_id = ? AND entity_type = 'member'
  `); },

  // De-dupe probe for the batch auto-link pass: skip emitting a second open
  // item for the same (task_type, entity) pair when one is already queued.
  get findOpenByEntity() { return db.prepare(`
    SELECT id FROM work_queue_items
    WHERE task_type = ? AND entity_type = ? AND entity_id = ? AND status = 'open'
    LIMIT 1
  `); },

  // Member-side rate limiter for contact-IFPA-admin requests: caps the number
  // of open items a single member can hold open at a time, across task_types.
  get countOpenForMember() { return db.prepare(`
    SELECT COUNT(*) AS c FROM work_queue_items
    WHERE entity_type = 'member' AND entity_id = ? AND status = 'open' AND task_type = ?
  `); },

  // Admin-side listing of open items, ordered by category then opened_at.
  get listOpenForAdmin() { return db.prepare(`
    SELECT id, created_at, opened_at, queue_category, task_type,
           entity_type, entity_id, priority, reason_text, detail_text
    FROM work_queue_items
    WHERE status = 'open'
    ORDER BY queue_category, opened_at
  `); },

  // Resolve an open item: transition to status=resolved with decision and note.
  get resolve() { return db.prepare(`
    UPDATE work_queue_items
    SET status = 'resolved',
        resolved_at = ?,
        resolved_by_member_id = ?,
        decision_label = ?,
        reason_text = ?,
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE id = ? AND status = 'open'
  `); },

  // Close an internal-review item (e.g. a birth-date-conflict flag) with no
  // member reply: transition to resolved without a decision label or a text
  // rewrite, leaving reason_text / detail_text intact for the audit trail.
  get closeReview() { return db.prepare(`
    UPDATE work_queue_items
    SET status = 'resolved',
        resolved_at = ?,
        resolved_by_member_id = ?,
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE id = ? AND status = 'open'
  `); },

  // Look up a single queue row by id (for resolve-flow validation).
  get findById() { return db.prepare(`
    SELECT id, queue_category, task_type, entity_type, entity_id, status,
           reason_text, opened_at
    FROM work_queue_items
    WHERE id = ?
  `); },
};

export const batchAutoLink = {
  // Tier 0 candidate set for the cutover batch auto-link pass. Excludes
  // already-linked members (either anchor present) and members without a
  // verifiable email (the classifier's anchor).
  get listCandidates() { return db.prepare(`
    SELECT m.id
    FROM members_active AS m
    JOIN member_tier_current AS mt ON mt.member_id = m.id
    WHERE mt.tier_status = 'tier0'
      AND m.legacy_member_id IS NULL
      AND m.historical_person_id IS NULL
      AND m.login_email IS NOT NULL
      AND m.email_verified_at IS NOT NULL
  `); },
};

export const systemJobRuns = {
  // Insert a new run row in the 'running' state. UPDATE-on-finish writes
  // status, finished_at, details_json, and last_error. The single-row
  // update keeps the audit chain on one row per execution.
  get insertRun() { return db.prepare(`
    INSERT INTO system_job_runs (
      id, created_at, created_by, updated_at, updated_by, version,
      job_name, started_at, status, details_json
    ) VALUES (?, ?, 'system', ?, 'system', 1,
              ?, ?, 'running', '{}')
  `); },

  get markSucceeded() { return db.prepare(`
    UPDATE system_job_runs
    SET status       = 'succeeded',
        finished_at  = ?,
        details_json = ?,
        updated_at   = ?,
        updated_by   = 'system',
        version      = version + 1
    WHERE id = ?
  `); },

  get markFailed() { return db.prepare(`
    UPDATE system_job_runs
    SET status       = 'failed',
        finished_at  = ?,
        last_error   = ?,
        updated_at   = ?,
        updated_by   = 'system',
        version      = version + 1
    WHERE id = ?
  `); },

  // Reaping for stale 'running' rows after a process kill / OOM. The
  // markSucceeded / markFailed UPDATEs only fire when the work callback
  // returns or throws cleanly; a SIGKILL leaves the row in 'running' state
  // forever. The next runBatchAutoLink (or any caller of this) sweeps stale
  // rows older than the threshold and marks them 'aborted' so admin tooling
  // sees an accurate picture.
  get reapStaleRunning() { return db.prepare(`
    UPDATE system_job_runs
    SET status       = 'aborted',
        finished_at  = ?,
        last_error   = 'stale_running_reaped',
        updated_at   = ?,
        updated_by   = 'system',
        version      = version + 1
    WHERE job_name = ?
      AND status = 'running'
      AND started_at < ?
  `); },
};

export interface OfficialRosterRow {
  member_id: string;
  display_name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  tier_status: 'tier0' | 'tier1' | 'tier2' | 'tier3';
  underlying_tier_status: 'tier1' | 'tier2' | null;
  is_active_player: 0 | 1;
  active_player_expires_at: string | null;
  is_hof: 0 | 1;
  is_bap: 0 | 1;
  is_board: 0 | 1;
}

export interface OfficialRosterExportRow extends OfficialRosterRow {
  login_email: string | null;
  email_visibility: 'private' | 'members';
}

export interface OfficialRosterSummaryRow {
  total: number;
  tier0_count: number;
  tier1_count: number;
  tier2_count: number;
  tier3_count: number;
  hof_count: number;
  bap_count: number;
  board_count: number;
  active_player_count: number;
}

export const officialRoster = {
  get selectAll() { return db.prepare(`
    SELECT member_id, display_name, city, region, country,
           tier_status, underlying_tier_status,
           is_active_player, active_player_expires_at,
           is_hof, is_bap, is_board
    FROM official_ifpa_roster_current
    ORDER BY display_name COLLATE NOCASE, member_id
  `); },

  // CSV-export read. Joins members so the export pipeline can apply the
  // email opt-in redaction (US A_View_Official_Roster_Reports: "email
  // (opt-in only)") at the service layer instead of in SQL.
  get selectAllForExport() { return db.prepare(`
    SELECT r.member_id, r.display_name, r.city, r.region, r.country,
           r.tier_status, r.underlying_tier_status,
           r.is_active_player, r.active_player_expires_at,
           r.is_hof, r.is_bap, r.is_board,
           m.login_email, m.email_visibility
    FROM official_ifpa_roster_current r
    JOIN members m ON m.id = r.member_id
    ORDER BY r.display_name COLLATE NOCASE, r.member_id
  `); },

  // Aggregate breakdown for A_View_Official_Roster_Reports dashboard.
  // Returns one row with totals by tier and honor flag.
  get summary() { return db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN tier_status = 'tier0' THEN 1 ELSE 0 END) AS tier0_count,
      SUM(CASE WHEN tier_status = 'tier1' THEN 1 ELSE 0 END) AS tier1_count,
      SUM(CASE WHEN tier_status = 'tier2' THEN 1 ELSE 0 END) AS tier2_count,
      SUM(CASE WHEN tier_status = 'tier3' THEN 1 ELSE 0 END) AS tier3_count,
      SUM(CASE WHEN is_hof   = 1 THEN 1 ELSE 0 END) AS hof_count,
      SUM(CASE WHEN is_bap   = 1 THEN 1 ELSE 0 END) AS bap_count,
      SUM(CASE WHEN is_board = 1 THEN 1 ELSE 0 END) AS board_count,
      SUM(CASE WHEN is_active_player = 1 THEN 1 ELSE 0 END) AS active_player_count
    FROM official_ifpa_roster_current
  `); },

  // "Total Registered Accounts" comparison count for the dashboard. Includes
  // Tier 0 members without current Active Player status, which are excluded
  // from the roster view itself. Excludes purged accounts.
  get totalRegisteredAccounts() { return db.prepare(`
    SELECT COUNT(*) AS n
    FROM members_active
    WHERE personal_data_purged_at IS NULL
  `); },

  // Display-name lookup for the CSV header comment ("Generated ... by <name>").
  get findDisplayNameById() { return db.prepare(`
    SELECT display_name FROM members WHERE id = ?
  `); },
};

export const clubCleanupResolutions = {
  get upsert() { return db.prepare(`
    INSERT INTO club_cleanup_resolutions
      (id, created_at, created_by, club_id, predicate_name, resolution, deferred_until, reason_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(club_id, predicate_name)
    DO UPDATE SET resolution = excluded.resolution,
                  deferred_until = excluded.deferred_until,
                  reason_text = excluded.reason_text,
                  created_at = excluded.created_at,
                  created_by = excluded.created_by
  `); },

  get findByClubAndPredicate() { return db.prepare(`
    SELECT id, resolution, deferred_until
    FROM club_cleanup_resolutions
    WHERE club_id = ? AND predicate_name = ?
  `); },

  // All resolution rows, including still-deferred ones: the service's
  // isResolved() owns the deferral-window check, so a future deferred_until
  // suppresses the queue item and an expired one lets it re-surface.
  // Filtering future deferrals out here would make deferral a no-op (the
  // service would see no row and treat the item as unresolved).
  get listAll() { return db.prepare(`
    SELECT club_id, predicate_name, resolution, deferred_until
    FROM club_cleanup_resolutions
  `); },
};

export const candidateCleanupResolutions = {
  get upsert() { return db.prepare(`
    INSERT INTO candidate_cleanup_resolutions
      (id, created_at, created_by, candidate_id, predicate_name, resolution,
       deferred_until, deferred_by_member_id, reason_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(candidate_id, predicate_name)
    DO UPDATE SET resolution = excluded.resolution,
                  deferred_until = excluded.deferred_until,
                  deferred_by_member_id = excluded.deferred_by_member_id,
                  reason_text = excluded.reason_text,
                  created_at = excluded.created_at,
                  created_by = excluded.created_by
  `); },

  // All candidate resolution rows, including still-deferred ones: the
  // service owns the deferral-window check, so a future deferred_until
  // suppresses the queue item and an expired one lets it re-surface with
  // the deferred-by annotation (hence the admin display-name join).
  get listAll() { return db.prepare(`
    SELECT ccr.candidate_id, ccr.predicate_name, ccr.resolution,
           ccr.deferred_until, ccr.reason_text,
           m.display_name AS deferred_by_name
    FROM candidate_cleanup_resolutions AS ccr
    LEFT JOIN members AS m ON m.id = ccr.deferred_by_member_id
  `); },
};

export const clubCleanupClaims = {
  // A re-claim (same item, any admin) refreshes the marker rather than
  // failing: the newest claimant is the one other admins should see.
  get upsertClaim() { return db.prepare(`
    INSERT INTO club_cleanup_claims
      (id, created_at, created_by, item_type, item_id, claimed_by_member_id, claimed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_type, item_id)
    DO UPDATE SET claimed_by_member_id = excluded.claimed_by_member_id,
                  claimed_at = excluded.claimed_at
  `); },

  get releaseClaim() { return db.prepare(`
    DELETE FROM club_cleanup_claims
    WHERE item_type = ? AND item_id = ?
  `); },

  // Active = claimed within the caller-supplied cutoff (30 minutes before
  // now); older markers are stale and simply stop rendering. Stale rows are
  // overwritten by the next claim, so no sweeper is needed.
  get listActiveClaims() { return db.prepare(`
    SELECT c.item_type, c.item_id, c.claimed_at,
           m.display_name AS claimed_by_name
    FROM club_cleanup_claims AS c
    INNER JOIN members AS m ON m.id = c.claimed_by_member_id
    WHERE c.claimed_at > ?
  `); },
};

export const clubCleanupPredicates = {
  get leaderlessActiveClubs() { return db.prepare(`
    SELECT c.id AS club_id, c.name AS club_name,
           c.city, c.region, c.country, c.status,
           c.updated_at AS last_updated
    FROM clubs AS c
    WHERE c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM club_leaders AS cl WHERE cl.club_id = c.id
      )
  `); },

  get staleProvisionalLeaders() { return db.prepare(`
    SELECT cbl.id AS bootstrap_leader_id,
           cbl.club_id, c.name AS club_name,
           c.city, c.region, c.country,
           cbl.role, cbl.created_at AS provisional_since
    FROM club_bootstrap_leaders AS cbl
    INNER JOIN clubs AS c ON c.id = cbl.club_id
    WHERE cbl.status = 'provisional'
    ORDER BY cbl.created_at ASC
  `); },
};

export const payments = {
  get insertPayment() { return db.prepare(`
    INSERT INTO payments (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, payment_type, amount_cents, currency,
      status, descriptor, purchased_tier_status, metadata_json,
      stripe_checkout_session_id, stripe_payment_intent_id
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `); },

  get updateStatus() { return db.prepare(`
    UPDATE payments
    SET status = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  get findById() { return db.prepare(`SELECT * FROM payments WHERE id = ?`); },

  get findBySessionId() { return db.prepare(`
    SELECT * FROM payments WHERE stripe_checkout_session_id = ?
  `); },

  get findByPaymentIntentId() { return db.prepare(`
    SELECT * FROM payments WHERE stripe_payment_intent_id = ?
  `); },

  // Backfills the intent id on a row inserted before Stripe created the
  // PaymentIntent (Stripe may defer intent creation until the buyer pays).
  // Guarded on IS NULL so a bound row is never re-pointed at another intent.
  get setPaymentIntentIdIfNull() { return db.prepare(`
    UPDATE payments
    SET stripe_payment_intent_id = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND stripe_payment_intent_id IS NULL
  `); },

  // Compliance cleanup: payments whose creation is older than the retention
  // window and still carry member-linking PII. member_id IS NOT NULL is the
  // not-yet-anonymized marker, so the scan is idempotent (anonymizing nulls it).
  get listComplianceExpired() { return db.prepare(`
    SELECT id FROM payments
    WHERE created_at <= ?
      AND member_id IS NOT NULL
    ORDER BY created_at
  `); },

  // Strips the personal/linking fields after the compliance retention window,
  // keeping the anonymized financial record (amount, type, currency, status,
  // date) for aggregate history and referential integrity.
  get anonymizeForCompliance() { return db.prepare(`
    UPDATE payments
    SET member_id                  = NULL,
        stripe_payment_intent_id   = NULL,
        stripe_checkout_session_id = NULL,
        stripe_customer_id         = NULL,
        stripe_subscription_id     = NULL,
        recurring_subscription_id  = NULL,
        donation_note              = NULL,
        metadata_json              = '{}',
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  get listByMember() { return db.prepare(`
    SELECT id, created_at, payment_type, amount_cents, currency,
           status, descriptor, purchased_tier_status
    FROM payments
    WHERE member_id = ?
    ORDER BY created_at DESC
  `); },
};

export const paymentStatusTransitions = {
  get insertTransition() { return db.prepare(`
    INSERT INTO payment_status_transitions (
      id, created_at, created_by,
      payment_id, stripe_event_id, event_type,
      from_status, to_status,
      transition_at, transition_reason_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `); },
};

export const stripeEvents = {
  // Idempotency primitive: PRIMARY KEY (event_id) makes INSERT OR IGNORE a
  // no-op on redelivery. Service code MUST insert first and short-circuit on
  // changes=0 to satisfy DD §6.1 webhook idempotency.
  get insertEventOrIgnore() { return db.prepare(`
    INSERT OR IGNORE INTO stripe_events
      (event_id, created_at, event_type, stripe_created, processed_at, processing_status, attempts)
    VALUES (?, ?, ?, ?, ?, 'processed', 1)
  `); },

  get markFailed() { return db.prepare(`
    UPDATE stripe_events
    SET processing_status = 'failed',
        attempts          = attempts + 1,
        last_error        = ?
    WHERE event_id = ?
  `); },

  get findByEventId() { return db.prepare(`
    SELECT * FROM stripe_events WHERE event_id = ?
  `); },
};

export const sesEvents = {
  // Idempotency primitive: PRIMARY KEY (message_id) makes INSERT OR IGNORE a
  // no-op on SNS redelivery. The feedback service inserts first inside its
  // transaction and short-circuits on changes=0, so a redelivered bounce or
  // complaint does not re-flip status or append duplicate audit rows.
  get insertEventOrIgnore() { return db.prepare(`
    INSERT OR IGNORE INTO ses_events
      (message_id, created_at, event_type, processed_at)
    VALUES (?, ?, ?, ?)
  `); },
};

// Symbolic-grammar observational layer (loaded by freestyle/loaders/26_load_symbolic_grammar.py).
// Each statement returns full rows keyed by column name; symbolicGrammarService
// maps them to its typed structures at read time.
export const symbolicGrammar = {
  get equivalenceClusters() { return db.prepare(`SELECT * FROM symbolic_equivalence_clusters`); },
  get groupMembership()     { return db.prepare(`SELECT * FROM symbolic_group_membership`); },
  get movementArchetypes()  { return db.prepare(`SELECT * FROM symbolic_movement_archetypes`); },
  get topologyGroups()      { return db.prepare(`SELECT * FROM symbolic_topology_groups`); },
  get modifierGroups()      { return db.prepare(`SELECT * FROM symbolic_modifier_groups`); },
  get glossaryCrosslinks()  { return db.prepare(`SELECT * FROM symbolic_glossary_crosslinks`); },
};

let helperTransactionOpen = false;

function rollbackHelperTransaction(): void {
  try {
    db.exec('ROLLBACK');
  } finally {
    helperTransactionOpen = false;
  }
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

export function transaction<T>(work: () => T, timeoutMs = TRANSACTION_TIMEOUT_MS): T {
  if (helperTransactionOpen) {
    throw new Error('Nested transactions are not supported by the db.ts transaction helper.');
  }

  const startedAt = Date.now();

  db.exec('BEGIN IMMEDIATE');
  helperTransactionOpen = true;

  try {
    const result = work();

    if (isThenable(result)) {
      rollbackHelperTransaction();
      throw new TypeError(
        'db.ts transaction callbacks must be synchronous and must not return a Promise.',
      );
    }

    if (Date.now() - startedAt > timeoutMs) {
      rollbackHelperTransaction();
      throw new Error(`SQLite transaction exceeded ${timeoutMs}ms timeout.`);
    }

    db.exec('COMMIT');
    helperTransactionOpen = false;

    return result;
  } catch (error) {
    if (helperTransactionOpen) {
      rollbackHelperTransaction();
    }

    throw error;
  }
}
