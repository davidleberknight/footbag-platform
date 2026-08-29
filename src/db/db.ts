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
  status: string;
  registration_status: string;
  reg_opened_at: string | null;
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
      e.status,
      e.registration_status,
      e.reg_opened_at,
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
      e.status,
      e.registration_status,
      e.reg_opened_at,
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
      e.is_attendee_registration_open,
      e.is_tshirt_size_collected,
      e.status,
      e.registration_status,
      e.reg_opened_at,
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

  // Every historical person with a public detail page, for the sitemap. Scoped
  // to CANONICAL exactly as the search and detail reads are: a non-canonical
  // row has no page to point a crawler at. Ordered by id so the sitemap is
  // stable between builds rather than reshuffling on every regeneration.
  get listAllCanonicalIds() { return db.prepare(`
    SELECT person_id
    FROM historical_persons
    WHERE source_scope = 'CANONICAL'
    ORDER BY person_id
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
      -- Fixture exclusion, both markers, so a fixture is never emitted to the
      -- public sitemap: the reserved 'club-test-' internal id (authoritative) and
      -- the reserved '#club_test_' tag namespace.
      AND c.id NOT LIKE 'club-test-%'
      AND t.tag_normalized NOT LIKE '#club\\_test\\_%' ESCAPE '\\'
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
      -- Test-fixture clubs are written into the real clubs table at runtime (the
      -- persona seed). They must never reach the public directory. Both markers
      -- are excluded: the reserved 'club-test-' internal id is the authoritative
      -- fixture identity (a persona club can carry an ordinary public tag, which a
      -- tag-only guard missed), and the reserved '#club_test_' tag namespace is the
      -- second independent marker. The detail lookup (getByTagNormalized) does NOT
      -- apply these, so a fixture's page stays reachable by direct link.
      AND c.id NOT LIKE 'club-test-%'
      AND t.tag_normalized NOT LIKE '#club\\_test\\_%' ESCAPE '\\'
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

  // Per-country member count for the clubs index tiles. Two populations, in
  // one shape a person can only appear in once per country.
  //
  // The imported roster aggregates by legacy_club_candidates.country (not
  // clubs.country) because the candidate row owns the country attribution and
  // the candidate→club link (mapped_club_id) is only stamped for
  // bootstrap-eligible candidates in production. Counting via candidate country
  // reflects the full mirror participation surface regardless of which clubs
  // have been promoted. It counts the same statuses every other membership read
  // counts, so a row a member declined, an admin de-listed, or a later answer
  // superseded stops being counted the moment it is resolved; without that
  // filter the tile could only ever rise, however much cleanup happened.
  //
  // Members who joined on the platform aggregate by their club's own country,
  // which is the only country attribution such a club has.
  //
  // Zero-count countries are excluded — callers merge by country name.
  get listAffiliationCountsByCountry() { return db.prepare(`
    SELECT country, COUNT(*) AS member_count
    FROM (
      SELECT
        lcc.country                              AS country,
        COALESCE(m.id, 'legacy_row:' || lpca.id) AS person_key
      FROM legacy_club_candidates AS lcc
      INNER JOIN legacy_person_club_affiliations AS lpca
        ON lpca.legacy_club_candidate_id = lcc.id
      LEFT JOIN members_active AS m
        ON m.historical_person_id = lpca.historical_person_id
      WHERE
        lcc.country IS NOT NULL AND lcc.country != ''
        AND lpca.resolution_status IN ('confirmed_current', 'promoted', 'pending')

      UNION

      SELECT
        c.country AS country,
        m2.id     AS person_key
      FROM member_club_affiliations AS mca
      INNER JOIN clubs AS c
        ON c.id = mca.club_id
      INNER JOIN members_active AS m2
        ON m2.id = mca.member_id
      WHERE
        mca.is_current = 1
        AND c.country IS NOT NULL AND c.country != ''
    )
    GROUP BY country
    HAVING COUNT(*) > 0
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
      ms.id AS member_id,
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

  // Members who joined this club on the platform, which the legacy query above
  // can never see: it reads the imported roster, and every live path
  // (joinClub, createClub, claimLeadership, the wizard confirm, the admin
  // assign) writes member_club_affiliations instead. A club created here has no
  // legacy candidate at all, so without this its roster could only ever be
  // empty. Identity comes from members_active, matching the live leader list on
  // the same page; the searchable view supplies the profile link and the
  // member-visible decorations, so a member who opted out of member search is
  // named but not linked, exactly as an unclaimed legacy person is.
  get listLiveMembersByClubId() { return db.prepare(`
    SELECT
      m.historical_person_id AS person_id,
      m.id                   AS member_id,
      m.display_name         AS person_name,
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
    FROM member_club_affiliations AS mca
    INNER JOIN members_active AS m
      ON m.id = mca.member_id
    LEFT JOIN members_searchable AS ms
      ON ms.id = m.id
    LEFT JOIN member_tier_current AS mtc
      ON mtc.member_id = m.id
    LEFT JOIN member_active_player_current AS mapc
      ON mapc.member_id = m.id
    WHERE
      mca.club_id = ?
      AND mca.is_current = 1
      -- A member the platform has recorded as deceased leaves the roster, which
      -- the deceased story requires. The affiliation row itself stays, so their
      -- club history remains part of the archive the same story preserves; this
      -- removes them from the club as it stands today, not from its record.
      AND m.is_deceased = 0
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
  // detail page club snapshot. Returns one row per (club_id, member_count).
  // Counted scope mirrors the roster the club page shows, which is the
  // imported roster and the members who joined here, so the count and the
  // auth-gated list agree. A person counts once even when they hold both an
  // imported row and a live affiliation to the same club: the UNION dedupes on
  // their member id, and an imported row with no live account falls back to
  // its own row id, which can never collide with one. Clubs with no members
  // are simply absent; the service treats absence as count = 0.
  get listMemberCountsForAllClubs() { return db.prepare(`
    SELECT club_id, COUNT(*) AS member_count
    FROM (
      SELECT
        lcc.mapped_club_id                      AS club_id,
        COALESCE(m.id, 'legacy_row:' || lpca.id) AS person_key
      FROM legacy_person_club_affiliations AS lpca
      INNER JOIN legacy_club_candidates AS lcc
        ON lcc.id = lpca.legacy_club_candidate_id
      LEFT JOIN members_active AS m
        ON m.historical_person_id = lpca.historical_person_id
      WHERE
        lpca.resolution_status IN ('confirmed_current', 'promoted', 'pending')
        AND lcc.mapped_club_id IS NOT NULL

      UNION

      SELECT
        mca.club_id AS club_id,
        m2.id       AS person_key
      FROM member_club_affiliations AS mca
      INNER JOIN members_active AS m2
        ON m2.id = mca.member_id
      WHERE mca.is_current = 1
    )
    GROUP BY club_id
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
  lifecycle_state: string | null;
}

export const legacyClubCandidates = {
  get findById() { return db.prepare(`
    SELECT id, legacy_club_key, display_name, city, region, country,
           description, external_url, classification, mapped_club_id,
           lifecycle_state
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

  // Stamps the admin's own decision that this club is real, run in the same
  // transaction as the promotion it records. The IS NULL guard keeps the first
  // admin's moment rather than the latest writer's.
  get setAdminPromotedAt() { return db.prepare(`
    UPDATE legacy_club_candidates
       SET admin_promoted_at = ?, updated_at = ?, updated_by = ?, version = version + 1
     WHERE id = ? AND admin_promoted_at IS NULL
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
    SELECT classification
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
  // Nullable on both sides of the COALESCE: an unmapped candidate has no clubs
  // row to fall back to, and the candidate's own city and country are optional
  // because the mirror did not always record them.
  club_city: string | null;
  club_region: string | null;
  club_country: string | null;
  confidence_score: number | null;
  inferred_role: 'member' | 'contact' | 'leader' | 'co-leader';
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

  // Pending affiliations for a member's identity anchors, joined to the
  // candidate row to surface club metadata for the wizard card. A member's
  // claimed identity is the pair (legacy_member_id, historical_person_id) and
  // an affiliation row may be anchored on either, so the filter matches a row
  // when EITHER anchor equals the member's own same-kind anchor; the explicit
  // NOT NULL guards keep a member's absent anchor from ever matching a row's
  // absent anchor. Candidates without a mapped_club_id surface from their own
  // candidate fields; a member confirmation promotes the candidate to a live
  // clubs row before the affiliation transition. The candidate's unvalidated
  // external_url is never surfaced (URL validation runs at promotion).
  // Junk-classified candidates never surface as wizard cards, mirroring the
  // promotion-path guard.
  // Params: legacyMemberId, legacyMemberId, historicalPersonId, historicalPersonId.
  get listPendingForMemberAnchors() { return db.prepare(`
    SELECT
      lcc.id              AS candidate_id,
      lpca.id             AS affiliation_id,
      lcc.mapped_club_id  AS club_id,
      COALESCE(c.name, lcc.display_name)       AS club_name,
      COALESCE(c.city, lcc.city)               AS club_city,
      COALESCE(c.region, lcc.region)           AS club_region,
      COALESCE(c.country, lcc.country)         AS club_country,
      lpca.confidence_score AS confidence_score,
      lpca.inferred_role  AS inferred_role,
      COALESCE(c.description, lcc.description) AS club_description,
      c.external_url      AS club_external_url
      FROM legacy_person_club_affiliations AS lpca
      INNER JOIN legacy_club_candidates AS lcc
         ON lcc.id = lpca.legacy_club_candidate_id
      LEFT JOIN clubs AS c
         ON c.id = lcc.mapped_club_id
     WHERE ((? IS NOT NULL AND lpca.legacy_member_id = ?)
         OR (? IS NOT NULL AND lpca.historical_person_id = ?))
       AND lpca.resolution_status = 'pending'
       AND lcc.classification != 'junk'
       AND lcc.lifecycle_state IS NULL
     ORDER BY COALESCE(c.city, lcc.city) COLLATE NOCASE ASC,
              COALESCE(c.name, lcc.display_name) COLLATE NOCASE ASC
  `); },

  // Any-status count of suggestions the wizard could ever have asked about:
  // distinguishes a member whose membership cards were all resolved (wrap-up
  // guidance renders) from one who never had any. Anchored the same way as
  // listPendingForMemberAnchors (either identity anchor matches, with NOT NULL
  // guards) so the material check can never disagree with what renders.
  // Junk-candidate rows never surface as cards, so they do not count as
  // material.
  // Params: legacyMemberId, legacyMemberId, historicalPersonId, historicalPersonId.
  get countByMemberAnchors() { return db.prepare(`
    SELECT COUNT(*) AS c
      FROM legacy_person_club_affiliations AS lpca
      INNER JOIN legacy_club_candidates AS lcc
         ON lcc.id = lpca.legacy_club_candidate_id
     WHERE ((? IS NOT NULL AND lpca.legacy_member_id = ?)
         OR (? IS NOT NULL AND lpca.historical_person_id = ?))
       AND lcc.classification != 'junk'
       AND lcc.lifecycle_state IS NULL
  `); },

  // Pending -> superseded for a member's membership suggestions about one
  // club, keyed by either identity anchor. A confirmed leadership claim
  // already writes the affiliation and collects the club's activity signal,
  // so a still-open membership card for the same club would ask the member
  // about that club a second time; superseding it closes the duplicate
  // question while preserving the row as history. A declined leadership
  // claim runs no supersede, so the membership question then surfaces
  // normally. resolved_club_id is stamped so the superseding club is
  // readable off the row.
  // Params: clubId, updatedBy, legacyMemberId x2, historicalPersonId x2, clubId.
  get supersedePendingForClubAndAnchors() { return db.prepare(`
    UPDATE legacy_person_club_affiliations
       SET resolution_status = 'superseded',
           resolved_club_id  = ?,
           updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by        = ?,
           version           = version + 1
     WHERE resolution_status = 'pending'
       AND ((? IS NOT NULL AND legacy_member_id = ?)
         OR (? IS NOT NULL AND historical_person_id = ?))
       AND legacy_club_candidate_id IN (
         SELECT id FROM legacy_club_candidates WHERE mapped_club_id = ?
       )
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

  // Cap-hit confirm: the member said Yes but already holds two current clubs,
  // so the Yes is recorded as former membership rather than a current one.
  // Preserves the historical fact, resolves the card, and never blocks
  // onboarding on a slot the member cannot free mid-wizard. Guarded by
  // status='pending' like the sibling transitions.
  get setResolutionStatusFormerOnly() { return db.prepare(`
    UPDATE legacy_person_club_affiliations
       SET resolution_status = 'former_only',
           resolved_club_id  = ?,
           updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by        = ?,
           version           = version + 1
     WHERE id                = ?
       AND resolution_status = 'pending'
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

  // Leaving a club retires the imported row the member once confirmed, the
  // same way the admin de-list retires an unconfirmed one: 'former_only' keeps
  // the historical fact that they were in the club and drops them from the
  // current-roster filter. Without it a member who leaves stays on the club's
  // roster permanently, since the de-list above only ever touches 'pending'
  // rows and nothing else can reach a confirmed one. Matched through the
  // member's own historical person, which is the only link between a live
  // member and their imported affiliation.
  get delistConfirmedForMemberClub() { return db.prepare(`
    UPDATE legacy_person_club_affiliations
       SET resolution_status = 'former_only',
           updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_by        = ?,
           version           = version + 1
     WHERE resolution_status = 'confirmed_current'
       AND resolved_club_id  = ?
       AND historical_person_id IN (
         SELECT historical_person_id FROM members
          WHERE id = ? AND historical_person_id IS NOT NULL
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
  club_city: string | null;
  club_country: string | null;
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
      c.city          AS club_city,
      c.country       AS club_country,
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

// The club fields a co-leader edits directly. There is no suggestion or review
// queue behind these: a co-leader is an authoritative editor of their own club,
// and every other member reports an inaccuracy to them out of band.
export const clubContent = {
  get findClubContentForEdit() { return db.prepare(`
    SELECT id, name, description, city, region, country, external_url,
           external_url_validated_at, external_url_quarantine_reason
    FROM clubs WHERE id = ?
  `); },

  // The whole leader-editable field set in one write, so one edit is one
  // version bump whatever it touched. The service passes the current value
  // back for any field the submission left alone.
  get updateClubProfile() { return db.prepare(`
    UPDATE clubs SET name = ?, description = ?, city = ?, region = ?, country = ?,
        updated_at = ?, updated_by = ?, version = version + 1
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
    SELECT COUNT(*) AS c FROM club_leaders_current WHERE club_id = ?
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
      AND NOT EXISTS (SELECT 1 FROM club_leaders_current l WHERE l.club_id = c.id)
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
  // login_email and the WhatsApp pair because leader contact is member-visible
  // by role: the page shows them to authenticated viewers only, and the
  // WhatsApp number additionally only where that co-leader opted in.
  get listCurrentLeadersForClubPage() { return db.prepare(`
    SELECT l.member_id, l.role, m.display_name, m.login_email,
           m.whatsapp, m.whatsapp_visible
    FROM club_leaders_current l
    JOIN members_active m ON m.id = l.member_id
    WHERE l.club_id = ?
    ORDER BY m.display_name COLLATE NOCASE
  `); },

  // Bulk variant of the per-club leader read, for the country page's club
  // cards. Without it that page counts bootstrap leaders alone, so every club
  // created on the platform reads "No known leaders yet" while its own detail
  // page names the co-leader who created it.
  get listCurrentLeadersForAllClubs() { return db.prepare(`
    SELECT l.club_id, l.member_id, l.role, m.display_name
    FROM club_leaders_current l
    JOIN members_active m ON m.id = l.member_id
    ORDER BY m.display_name COLLATE NOCASE
  `); },

  get listAffiliatedMembersForAdmin() { return db.prepare(`
    SELECT a.member_id, m.display_name, m.slug,
           EXISTS (SELECT 1 FROM club_leaders_current l WHERE l.club_id = a.club_id AND l.member_id = a.member_id) AS is_leader
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

  // A member an administrator can appoint as co-leader. Excludes a member
  // recorded as deceased: appointing one puts a row in the leadership table that
  // the current-leadership view will not see, so the club stays on the
  // needs-leader list while that member's single co-leadership slot is occupied
  // by somebody who cannot act.
  get findMemberByKeyForAdmin() { return db.prepare(`
    SELECT id, display_name, slug FROM members_active
    WHERE (slug = ? OR id = ?) AND is_deceased = 0
  `); },

  get findCurrentAffiliation() { return db.prepare(`
    SELECT id, is_current FROM member_club_affiliations WHERE member_id = ? AND club_id = ?
  `); },

  // The primary flag is bound, not literal: a member holding a current
  // affiliation holds exactly one primary, so a member with no other club must
  // come out of this insert primary. The caller computes the flag.
  get insertAdminAffiliation() { return db.prepare(`
    INSERT INTO member_club_affiliations
      (id, created_at, created_by, updated_at, updated_by, member_id, club_id, is_current, is_primary, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'admin')
  `); },

  // Reactivation restores the primary flag for the same reason: ending an
  // affiliation clears it, so a rejoin must set it from the caller's count.
  get reactivateAffiliation() { return db.prepare(`
    UPDATE member_club_affiliations SET is_current = 1, is_primary = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  get endAffiliation() { return db.prepare(`
    UPDATE member_club_affiliations SET is_current = 0, is_primary = 0, updated_at = ?, updated_by = ?, version = version + 1
    WHERE member_id = ? AND club_id = ? AND is_current = 1
  `); },

  get leaderClubNameForMember() { return db.prepare(`
    SELECT c.name AS club_name
      FROM club_leaders_current AS cl
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

  // The people a club currently has, live rows only. Archiving is refused while
  // this is non-zero: a club somebody still belongs to is not a club to retire,
  // and nothing but the member's own leave can end an affiliation, so an
  // archive would strand them on a club they cannot reach or leave.
  get countCurrentPeopleForClub() { return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM member_club_affiliations
        WHERE club_id = ? AND is_current = 1) AS member_count,
      -- Deliberately the raw table, unlike the viability and needs-leader reads.
      -- This one guards archiving, and archiving a club whose leadership row
      -- still exists would strand that row pointing at an archived club. The
      -- demote path removes the row first, so counting rows rather than people
      -- able to act is the right question here.
      (SELECT COUNT(*) FROM club_leaders WHERE club_id = ?) AS leader_count
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

  // Sets one current affiliation primary. swapPrimary flips both rows and so
  // cannot serve a member left holding a single affiliation.
  get setPrimary() { return db.prepare(`
    UPDATE member_club_affiliations
       SET is_primary = 1, updated_at = ?, updated_by = ?, version = version + 1
     WHERE member_id = ? AND club_id = ? AND is_current = 1
  `); },

  // The swap runs as clear-then-set, never as one flip of both rows. SQLite
  // checks a partial unique index per row as an UPDATE walks the table, and
  // ux_member_club_affiliations_one_primary allows one primary per member, so a
  // single statement flipping both rows fails whenever the row it visits first
  // is the one being promoted: two rows hold is_primary = 1 mid-statement. The
  // caller runs both inside one transaction, so no moment with no primary is
  // ever observable.
  get clearPrimary() { return db.prepare(`
    UPDATE member_club_affiliations
       SET is_primary = 0, updated_at = ?, updated_by = ?, version = version + 1
     WHERE member_id = ? AND is_current = 1 AND is_primary = 1
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
  // in the onboarding wizard, so the filter names the wizard stages
  // explicitly, and the schema admits only the two answers the wizard's
  // activity question offers. Counting is one vote per member: a member's
  // latest signal for the club wins, so duplicate rows from form re-posts or
  // changed answers never inflate the thresholds.
  get countWizardByClub() { return db.prepare(`
    WITH latest AS (
      SELECT member_id, activity_signal,
             ROW_NUMBER() OVER (
               PARTITION BY member_id
               ORDER BY created_at DESC, id DESC
             ) AS rn
      FROM club_viability_signals
      WHERE club_id = ? AND source_stage IN ('stage1a_contact', 'stage1b_affiliated')
    )
    SELECT
      SUM(CASE WHEN activity_signal = 'active' THEN 1 ELSE 0 END)          AS active_count,
      SUM(CASE WHEN activity_signal = 'not_active' THEN 1 ELSE 0 END)      AS not_active_count,
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
      WHERE source_stage IN ('stage1a_contact', 'stage1b_affiliated')
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
      COUNT(*) AS total_count
    FROM latest AS l
    INNER JOIN clubs AS c ON c.id = l.club_id
    WHERE l.rn = 1
    GROUP BY l.club_id
    ORDER BY not_active_count DESC
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
      WHERE club_id = ? AND source_stage IN ('stage1a_contact', 'stage1b_affiliated')
    )
    SELECT m.display_name, l.activity_signal
    FROM latest AS l
    INNER JOIN members AS m ON m.id = l.member_id
    WHERE l.rn = 1 AND l.activity_signal = 'not_active'
    ORDER BY m.display_name COLLATE NOCASE
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
      COUNT(*) AS total_count
    FROM latest
    WHERE rn = 1
  `); },

  // Unpromoted, non-terminal candidates that carry wizard activity flags,
  // with per-candidate signal counts (one vote per member, latest wins).
  // Promoted candidates are excluded here AND their flag rows are stamped
  // with the club id at promotion time, so a vote never surfaces on both
  // the candidate-flag group and the club gates.
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
      COUNT(*) AS total_count
    FROM latest AS l
    INNER JOIN legacy_club_candidates AS lcc ON lcc.id = l.candidate_id
    WHERE l.rn = 1
      AND lcc.mapped_club_id IS NULL
      AND lcc.lifecycle_state IS NULL
    GROUP BY l.candidate_id
    ORDER BY not_active_count DESC
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
    WHERE l.rn = 1 AND l.activity_signal = 'not_active'
    ORDER BY m.display_name COLLATE NOCASE
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

// ── clubInsightNotes ────────────────────────────────────────────────────────
//
// Free-text club knowledge a member offers in the onboarding wizard's club
// step, alongside the two fixed answers. Read by the admin cleanup queue only.
// A note may name no club at all (the member writing about clubs in their
// area), so the by-club and by-area reads are separate statements rather than
// one filter.
export const clubInsightNotes = {
  get insertNote() { return db.prepare(`
    INSERT INTO club_insight_notes (
      id, created_at, created_by,
      member_id, club_id, source_stage, note_text,
      source_entity_type, source_entity_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `); },

  // Notes attached to one live club, newest first, with their author for the
  // admin surface. A purged note (note_text NULL) is not evidence any more
  // and drops out here.
  get listByClub() { return db.prepare(`
    SELECT n.id, n.created_at, n.note_text, n.source_stage,
           m.display_name AS author_display_name
    FROM club_insight_notes AS n
    INNER JOIN members AS m ON m.id = n.member_id
    WHERE n.club_id = ? AND n.note_text IS NOT NULL
    ORDER BY n.created_at DESC, n.id DESC
  `); },

  // Notes attached to a candidate that has no live clubs row yet.
  get listByCandidate() { return db.prepare(`
    SELECT n.id, n.created_at, n.note_text, n.source_stage,
           m.display_name AS author_display_name
    FROM club_insight_notes AS n
    INNER JOIN members AS m ON m.id = n.member_id
    WHERE n.club_id IS NULL
      AND n.source_entity_type = 'legacy_club_candidate'
      AND n.source_entity_id = ?
      AND n.note_text IS NOT NULL
    ORDER BY n.created_at DESC, n.id DESC
  `); },

  // Unkeyed notes: the member wrote about their area rather than about one
  // club. Grouped with the author's own location so an admin can read them
  // against the region they concern.
  get listUnkeyed() { return db.prepare(`
    SELECT n.id, n.created_at, n.note_text,
           m.display_name AS author_display_name,
           m.city   AS author_city,
           m.region AS author_region,
           m.country AS author_country
    FROM club_insight_notes AS n
    INNER JOIN members AS m ON m.id = n.member_id
    WHERE n.club_id IS NULL
      AND n.source_entity_id IS NULL
      AND n.note_text IS NOT NULL
    ORDER BY n.created_at DESC, n.id DESC
  `); },

  // Promotion carry-forward, mirroring the activity signals: a note left
  // against a candidate follows that candidate onto its live club row.
  get stampClubIdForCandidateNotes() { return db.prepare(`
    UPDATE club_insight_notes
       SET club_id = ?
     WHERE club_id IS NULL
       AND source_entity_type = 'legacy_club_candidate'
       AND source_entity_id = ?
  `); },

  // Has this member left a note yet? Drives the ask-once rule in the wizard.
  get countForMember() { return db.prepare(`
    SELECT COUNT(*) AS c FROM club_insight_notes WHERE member_id = ?
  `); },

  // Erasure: the member's authored text goes, the row stays. Used by both the
  // account purge and the deceased contact scrub.
  get clearNotesForMember() { return db.prepare(`
    UPDATE club_insight_notes
       SET note_text = NULL
     WHERE member_id = ? AND note_text IS NOT NULL
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
    ORDER BY fr.record_type ASC,
             LOWER(COALESCE(fr.trick_name, fr.sort_name, '')) ASC,
             fr.value_numeric DESC
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

  // Every public record row (current and superseded), across all tricks. Same
  // public gating as listAllByTrickName minus the single-trick_name filter, so a
  // trick-detail page can aggregate its records by canonical + alias slugs rather
  // than by one exact spelling.
  get listAllPublic() { return db.prepare(`
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
    WHERE fr.confidence IN (${PUBLIC_FREESTYLE_RECORD_CONFIDENCE_SQL})
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

  // Category and active flag for a slug regardless of is_active, so the
  // trick-detail route can redirect modifier / operator rows to their operator
  // page, and let an active canonical trick always win its own URL even when an
  // alias row shadows the slug.
  get categoryBySlug() { return db.prepare(`
    SELECT category, is_active FROM freestyle_tricks WHERE slug = ?
  `); },

  // Every db-tracked trick slug, any status. The Emerging Vocabulary surface
  // excludes an observational candidate whose name is already a database trick
  // (published, held, or pending) at request time, so an in-app edit takes
  // effect immediately against the CSV-only generated universe.
  get listAllSlugs() { return db.prepare(`
    SELECT slug FROM freestyle_tricks
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
           trick_family, base_trick, category, is_active, sort_order,
           review_status,
           description, short_description, execution_summary, learning_notes,
           prerequisite_notes, pronunciation, operational_notation_source
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

  // Admin curation scalar edit: update the editable row fields of one trick,
  // the structural fields plus the editorial prose fields (slug is the identity
  // key and stays fixed). The browse sort position is included because the content
  // pipeline that used to set it stops running at the source-of-truth cutover, so
  // this is its only remaining write path. Stamps updated_at. Attached aliases,
  // sources, and modifier links are untouched here.
  //
  // is_core is deliberately absent. Nothing in the application reads it, so a
  // curator setting it changed nothing a reader saw; the column stays in the
  // schema, written only by the dictionary loaders, and this statement leaves it
  // alone rather than zeroing every marked row on the first save.
  get updateScalars() { return db.prepare(`
    UPDATE freestyle_tricks
    SET canonical_name = ?, adds = ?, notation = ?, operational_notation = ?,
        trick_family = ?, base_trick = ?, category = ?, is_active = ?,
        sort_order = ?,
        review_status = ?, description = ?, short_description = ?,
        execution_summary = ?, learning_notes = ?, prerequisite_notes = ?,
        pronunciation = ?, operational_notation_source = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE slug = ?
  `); },

  // Drop the notation parse derived for this row. The parse fields are a function
  // of the notation the parse was taken from and of the asserted ADD it was
  // compared against; when a curation edit changes either, the stored parse
  // describes notation the row no longer carries. Clearing them leaves the row in
  // the same state as a trick whose notation has never been parsed, which the
  // public grammar panel already handles by not rendering, rather than leaving a
  // panel that confidently describes the previous notation.
  get clearDerivedParse() { return db.prepare(`
    UPDATE freestyle_tricks
    SET structural_parse_json = NULL, computed_add_formula = NULL,
        computed_adds = NULL, add_formula_status = NULL
    WHERE slug = ?
  `); },
};

// The Emerging Vocabulary adjudication record: one durable ruling per
// observational name. Publication is the one moment the application writes to
// it, so these are the only statements over the table.
export interface FreestyleEvAdjudicationRow {
  candidate_id: string;
  submitted_name: string;
  normalized_name: string;
  ev_state: string;
  final_disposition: string;
  matched_existing_object: string;
  match_type: string;
  published_trick_slug: string | null;
}

export const freestyleEvAdjudications = {
  // The ruling already bound to this trick row. The link is the durable
  // statement that the two are about the same name, so it is looked up first.
  get getByTrickSlug() { return db.prepare(`
    SELECT candidate_id, submitted_name, normalized_name, ev_state,
           final_disposition, matched_existing_object, match_type,
           published_trick_slug
    FROM freestyle_ev_adjudications
    WHERE published_trick_slug = ?
  `); },

  // The ruling for a name that carries no link yet: a name adjudicated before
  // its trick row existed, or one entered after the ledger stopped being
  // written. normalized_name is unique, so this returns at most one row.
  get getByNormalizedName() { return db.prepare(`
    SELECT candidate_id, submitted_name, normalized_name, ev_state,
           final_disposition, matched_existing_object, match_type,
           published_trick_slug
    FROM freestyle_ev_adjudications
    WHERE normalized_name = ?
  `); },

  // The notation-authoring backlog: rulings whose identity and difficulty are
  // settled and whose movement is not, waiting for a curator to author it.
  //
  // Derived, never flagged. A ruling qualifies when its evidence does not
  // already carry the movement (a source's own notation, footage, authoritative
  // prose, or a structure the platform can derive), when it is still open, when
  // a curator decision rather than a doctrine question is what gates it, and
  // when nobody has authored a notation for it yet. Operator composition gives
  // the difficulty and generally not the movement, which is why arithmetic
  // certainty never puts a row on this list.
  //
  // This counts rulings. The public projection counts identities, collapsing
  // lexical variants of one name, so the two totals differ by design in the same
  // way the ledger's row count and the corpus row count do.
  get listNotationBacklog() { return db.prepare(`
    SELECT candidate_id, submitted_name, normalized_name, ev_state, evidence_state,
           object_type, blocker_id, blocker_subtype, owner, source, confidence,
           matched_existing_object, match_type, proposed_formula, residual_home,
           note, published_trick_slug
    FROM freestyle_ev_adjudications
    WHERE authored_notation IS NULL
      AND final_disposition = 'C'
      AND evidence_state NOT IN
          ('exact-notation', 'verified-footage', 'authoritative-prose', 'derivable-notation')
      AND blocker_id LIKE 'D%'
    ORDER BY blocker_id ASC, submitted_name ASC
  `); },

  // One ruling, for the authoring form and for the save that follows it. Carries
  // the settled facts the form displays beside the notation field, and the
  // authoring fields as they stand, so a save can record what it replaced.
  get getForAuthoring() { return db.prepare(`
    SELECT candidate_id, submitted_name, normalized_name, ev_state, final_disposition,
           evidence_state, object_type, blocker_id, blocker_subtype, owner, source,
           confidence, matched_existing_object, match_type, proposed_formula,
           residual_home, note, published_trick_slug, version,
           authored_notation, notation_evidence_basis, notation_derivation_method,
           notation_convention_id, notation_provenance_note,
           notation_authored_at, notation_authored_by
    FROM freestyle_ev_adjudications
    WHERE candidate_id = ?
  `); },

  // The drafts: rulings whose movement has been authored and whose canonical row
  // has not been created. Without this view a saved draft would leave the backlog
  // and appear nowhere, which is a good way to lose a curator's work.
  get listAuthoredDrafts() { return db.prepare(`
    SELECT candidate_id, submitted_name, normalized_name, blocker_id, owner,
           authored_notation, notation_evidence_basis, notation_derivation_method,
           notation_convention_id, notation_provenance_note,
           notation_authored_at, notation_authored_by, published_trick_slug
    FROM freestyle_ev_adjudications
    WHERE authored_notation IS NOT NULL
      AND final_disposition = 'C'
    ORDER BY notation_authored_at DESC, submitted_name ASC
  `); },

  // The authoring write. Touches the notation and its provenance and nothing
  // else: the ruling's own decision, its blocker, its owner and its history are
  // not this surface's business.
  get saveAuthoredNotation() { return db.prepare(`
    UPDATE freestyle_ev_adjudications
    SET authored_notation          = ?,
        notation_evidence_basis    = ?,
        notation_derivation_method = ?,
        notation_convention_id     = ?,
        notation_provenance_note   = ?,
        notation_authored_at       = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        notation_authored_by       = ?,
        updated_at                 = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_by                 = ?,
        version                    = version + 1
    WHERE candidate_id = ?
  `); },

  // Publication, applied to the ruling. The name becomes canonical, the
  // disposition transitions to resolved, and the trick row it resolved to is
  // recorded on both the durable match field and the link. Nothing else on the
  // row is touched: the note, source, confidence, blocker and owner are the
  // history of how the name got here and outlive the resolution.
  get resolveOnPublication() { return db.prepare(`
    UPDATE freestyle_ev_adjudications
    SET ev_state = 'canonical',
        hold_kind = 'canonical',
        match_type = 'promoted-canonical',
        final_disposition = 'A',
        matched_existing_object = ?,
        published_trick_slug = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_by = ?,
        version = version + 1
    WHERE candidate_id = ?
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
// canonical name, its slug, or any of its alias texts. The caller passes the
// query twice: as typed, for the name and alias arms, and folded to the
// canonical underscore form, for the slug arm. Folding is what lets "double leg
// over" find double_leg_over, and it keeps working when the visitor pastes the
// underscore form instead. Name/slug matches rank ahead of alias-only matches;
// the caller dedupes by slug (keeping the higher-ranked row) and trims to its
// display limit.
//
// Search resolves ANY alias to its trick (a misspelling or an abbreviation still
// finds the move), but the "also called" hint the caller renders is populated
// only from display-eligible aliases (alias_display = 1). A match on a
// search-only alias — a misspelling, an internal abbreviation — still returns
// the trick but carries no alias text, so a misspelled or internal form is never
// shown back to the visitor as an alternate name.
export function searchFreestyleTricksByText(
  query: string,
  slugQuery: string,
  limit: number,
): FreestyleTrickSearchRow[] {
  const escapeLike = (s: string) => s.replace(/[%_\\]/g, c => '\\' + c);
  const like = `%${escapeLike(query)}%`;
  const slugLike = `%${escapeLike(slugQuery)}%`;
  return db.prepare(`
    SELECT slug, canonical_name, adds, category, aliases_json,
           NULL AS matched_alias, sort_order, 0 AS match_rank
      FROM freestyle_tricks
     WHERE is_active = 1
       AND (category IS NULL OR category NOT IN ('modifier', 'operator'))
       AND (canonical_name LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')
    UNION ALL
    SELECT t.slug, t.canonical_name, t.adds, t.category, t.aliases_json,
           CASE WHEN a.alias_display = 1 THEN a.alias_text ELSE NULL END AS matched_alias,
           t.sort_order, 1 AS match_rank
      FROM freestyle_trick_aliases a
      JOIN freestyle_tricks t ON t.slug = a.trick_slug AND t.is_active = 1
     WHERE (t.category IS NULL OR t.category NOT IN ('modifier', 'operator'))
       AND a.alias_text LIKE ? ESCAPE '\\'
     ORDER BY match_rank ASC, sort_order ASC
     LIMIT ?
  `).all(like, slugLike, like, limit) as FreestyleTrickSearchRow[];
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

  // Every trick slug the alias table holds a row for, whatever the display
  // gate says. Read alongside listAll so a caller can tell "this trick has no
  // aliases recorded" from "this trick's aliases are all curated out of
  // display": the first may fall back to the deprecated aliases_json column,
  // the second must not, or curation would be undone by the fallback.
  get listTrickSlugsWithAnyAlias() { return db.prepare(`
    SELECT DISTINCT trick_slug FROM freestyle_trick_aliases
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
  // type, and public-display state, for listing, per-row editing and per-row
  // deletion.
  get listForCuration() { return db.prepare(`
    SELECT alias_slug, alias_text, alias_type, alias_display, notes
    FROM freestyle_trick_aliases
    WHERE trick_slug = ?
    ORDER BY alias_text COLLATE NOCASE
  `); },

  // One alias row by its slug (the global primary key). Used by the admin curation
  // service to detect a slug collision before an insert and to capture the row's
  // text, type and display state for the audit entry before a change is applied.
  get getByAliasSlug() { return db.prepare(`
    SELECT alias_slug, alias_text, alias_type, alias_display, trick_slug, notes
    FROM freestyle_trick_aliases
    WHERE alias_slug = ?
  `); },

  // Admin curation: add one alias row for a trick. alias_display is written
  // explicitly rather than taking the column default, so the class a curator picks
  // decides whether the alias reaches a reader. source_id and notes stay NULL in
  // this surface (the minimal alias row); alias_slug is the global primary key, so
  // the service checks for collisions before inserting. Stamps created_at.
  get insert() { return db.prepare(`
    INSERT INTO freestyle_trick_aliases
      (alias_slug, alias_text, trick_slug, alias_type, alias_display, source_id, notes, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `); },

  // Admin curation: set an existing alias's semantic class, its public-display
  // state, and the reason for any divergence between them. Scoped to the trick so
  // an edit page can never retype another trick's alias by slug alone.
  //
  // The reason travels in the same statement as the two fields it explains, so a
  // published exception and the note saying why it exists can never be written
  // apart or half-applied.
  get updateClassForTrick() { return db.prepare(`
    UPDATE freestyle_trick_aliases
    SET alias_type = ?, alias_display = ?, notes = ?
    WHERE alias_slug = ? AND trick_slug = ?
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
  // Full rows for the admin provenance-source registry surface.
  get listForCuration() { return db.prepare(`
    SELECT id, source_type, source_label, source_url, retrieved_at, notes
    FROM freestyle_trick_sources
    ORDER BY id COLLATE NOCASE
  `); },
  get getById() { return db.prepare(`
    SELECT id, source_type, source_label, source_url, retrieved_at, notes
    FROM freestyle_trick_sources WHERE id = ?
  `); },
  // Create one registry source. The id is the curator-supplied permanent primary
  // key; the write and its audit entry commit in one transaction at the service.
  get insert() { return db.prepare(`
    INSERT INTO freestyle_trick_sources (id, source_type, source_label, source_url, retrieved_at, notes)
    VALUES (?, ?, ?, ?, ?, ?)
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

  // Admin moderation reads: every tip regardless of status, so a curator can
  // find, edit, hide, restore, and remap the imported tips. The public read
  // above stays filtered to published; these never reach a public route.
  get getByIdForModeration() { return db.prepare(`
    SELECT id, trick_slug, tip_text, status, display_order, created_at_legacy
    FROM freestyle_trick_tips
    WHERE id = ?
  `); },
  get listForModeration() { return db.prepare(`
    SELECT id, trick_slug, tip_text, status, display_order, created_at_legacy
    FROM freestyle_trick_tips
    ORDER BY status, trick_slug, display_order, id
  `); },
  // Free-text moderation search over the advice text and the (canonical or
  // unresolved:<name>) slug. Both bind the same LIKE pattern.
  // Free-text moderation search over the advice and the slug. Separators are
  // interchangeable on the slug side: an unresolved tip is keyed on a kebab-cased
  // placeholder ("unresolved:pogo-op-whirling-swirl") that no curator would type
  // from memory, so "whirling swirl" and "whirling_swirl" have to reach it as
  // readily as the hyphenated form. Both the stored slug and the needle collapse
  // to a single separator before matching. The advice side matches literally,
  // since prose is what the curator actually read.
  get searchForModeration() { return db.prepare(`
    SELECT id, trick_slug, tip_text, status, display_order, created_at_legacy
    FROM freestyle_trick_tips
    WHERE tip_text LIKE ?
       OR REPLACE(REPLACE(REPLACE(trick_slug, '-', ' '), '_', ' '), ':', ' ') LIKE ?
    ORDER BY status, trick_slug, display_order, id
  `); },

  // Admin moderation writes, each paired with one audit entry in a transaction.
  get updateText()   { return db.prepare(`UPDATE freestyle_trick_tips SET tip_text = ? WHERE id = ?`); },
  get updateStatus() { return db.prepare(`UPDATE freestyle_trick_tips SET status = ? WHERE id = ?`); },
  // Remap points the tip at an active canonical trick; the row becomes published
  // in the same write. The original slug is preserved as provenance in the audit
  // entry, so overwriting trick_slug here loses no history.
  get remap()        { return db.prepare(`UPDATE freestyle_trick_tips SET trick_slug = ?, status = 'published' WHERE id = ?`); },
  // Display order decides the sequence tips render in on a trick page, ahead of
  // the id tiebreak both list statements above already apply. The import seeds it
  // from the legacy chronology; this is its only write path once the live
  // database is the source of truth.
  get updateDisplayOrder() { return db.prepare(`UPDATE freestyle_trick_tips SET display_order = ? WHERE id = ?`); },
};

export const freestyleMediaLinks = {
  // Per-trick media-coverage rows joined to source_id. One row per
  // (trick_slug, source_id) pair (deduped). A media row tagged with a
  // trick's '#slug' tag is coverage for that trick; mi.source_id carries
  // the tier the service classifies the chip on, and is NULL for a
  // member-uploaded clip, which is coverage exactly as a curator-published
  // clip is. Reading the linkable-video view rather than the bare table is
  // what keeps this answer identical to the trick detail page's.
  // media_tag is the tag the clip actually carries, which is the canonical
  // slug tag on the first arm and an alias slug tag on the second. The
  // gallery filters on one literal token and never expands aliases, so a
  // link built from the canonical slug of an alias-only-tagged trick lands
  // on an empty gallery; the caller picks a tag from here that resolves.
  get listCoveredTrickSlugsWithSource() { return db.prepare(`
    SELECT DISTINCT
      ft.slug          AS slug,
      mi.source_id     AS source_id,
      t.tag_normalized AS media_tag
    FROM media_items_linkable_video mi
    INNER JOIN media_tags mt ON mt.media_id = mi.id
    INNER JOIN tags t        ON t.id        = mt.tag_id
    INNER JOIN freestyle_tricks ft ON ('#' || ft.slug) = t.tag_normalized
    WHERE ft.is_active = 1
    UNION
    -- Media tagged with a trick's alias slug (e.g. a retired structural name
    -- folded onto its folk-named canonical) is coverage for that canonical.
    SELECT DISTINCT
      ft.slug          AS slug,
      mi.source_id     AS source_id,
      t.tag_normalized AS media_tag
    FROM media_items_linkable_video mi
    INNER JOIN media_tags mt ON mt.media_id = mi.id
    INNER JOIN tags t        ON t.id        = mt.tag_id
    INNER JOIN freestyle_trick_aliases a ON ('#' || a.alias_slug) = t.tag_normalized
    INNER JOIN freestyle_tricks ft       ON ft.slug = a.trick_slug AND ft.is_active = 1
  `); },
};

export interface FreestyleMediaCoveredSourceRow {
  slug:      string;
  // NULL for a member-uploaded clip: the source registry names curated
  // channels and series, and a member's own clip belongs to none of them.
  source_id: string | null;
  // The '#'-prefixed normalized tag the clip carries: the trick's canonical
  // slug tag, or one of its alias slug tags.
  media_tag: string;
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
  // the service when grouping). Drives /freestyle/tricks?view=modifier.
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

export interface NetDisciplineOptionRow {
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
   *  all teams, with discipline/search filters handled via queryFilteredTeams. */
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

  /** One page of listAll (same universe and order) for server-side pagination of
   *  the unfiltered directory, which is otherwise several thousand rows. */
  get listAllPaged() { return db.prepare(`
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
    LIMIT ? OFFSET ?
  `); },

  /** Total unique-team universe for the unfiltered directory (drives page count). */
  get countAll() { return db.prepare(`
    SELECT COUNT(*) AS total FROM (
      SELECT t.team_id
      FROM net_team t
      JOIN historical_persons pa ON pa.person_id = t.person_id_a
      JOIN historical_persons pb ON pb.person_id = t.person_id_b
      JOIN net_team_appearance_canonical a ON a.team_id = t.team_id
      WHERE pa.person_name != 'Unknown' AND pb.person_name != 'Unknown'
      GROUP BY t.team_id
    )
  `); },

  /** Discipline filter options, distinct canonical groups with appearance counts. */
  get listDisciplineOptions() { return db.prepare(`
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
 * Shared filter clauses for the optional discipline (canonical_group) and
 * player-search filters, so the paginated fetch and the count query filter the
 * identical universe. The 'Unknown' placeholder is always excluded.
 */
function buildFilteredTeamsClauses(filters: { discipline?: string; search?: string }): {
  joins: string; where: string; params: string[];
} {
  const joins: string[] = [];
  const conditions: string[] = [];
  const params: string[] = [];

  if (filters.discipline) {
    joins.push('JOIN net_discipline_group dg ON dg.discipline_id = a.discipline_id AND dg.canonical_group = ?');
    params.push(filters.discipline);
  }
  if (filters.search) {
    conditions.push("(pa.person_name LIKE ? OR pb.person_name LIKE ?)");
    const like = `%${filters.search}%`;
    params.push(like, like);
  }
  conditions.push("pa.person_name != 'Unknown'");
  conditions.push("pb.person_name != 'Unknown'");

  return { joins: joins.join('\n    '), where: `WHERE ${conditions.join(' AND ')}`, params };
}

/**
 * One page of teams matching the optional discipline / player-search filter, in the
 * same order and universe as the unfiltered directory. No HAVING or fixed LIMIT:
 * pagination (LIMIT ? OFFSET ?) governs how many rows render, so a filter can
 * never dump thousands of rows at once. Uses runtime db.prepare() for the
 * optional JOIN clause.
 */
export function queryFilteredTeams(
  filters: { discipline?: string; search?: string },
  limit: number,
  offset: number,
): NetTeamStatsRow[] {
  const { joins, where, params } = buildFilteredTeamsClauses(filters);
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
    ${joins}
    ${where}
    GROUP BY t.team_id
    ORDER BY appearance_count DESC, win_count DESC, last_year DESC, pa.person_name ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as NetTeamStatsRow[];
}

/** Total unique teams matching the same filter, for the filtered page count. */
export function countFilteredTeams(filters: { discipline?: string; search?: string }): number {
  const { joins, where, params } = buildFilteredTeamsClauses(filters);
  const row = db.prepare(`
    SELECT COUNT(*) AS total FROM (
      SELECT t.team_id
      FROM net_team t
      JOIN historical_persons pa ON pa.person_id = t.person_id_a
      JOIN historical_persons pb ON pb.person_id = t.person_id_b
      JOIN net_team_appearance_canonical a ON a.team_id = t.team_id
      ${joins}
      ${where}
      GROUP BY t.team_id
    )
  `).get(...params) as { total: number };
  return row.total;
}

// ---------------------------------------------------------------------------
// netEvents
//
// Event-centric reads for the net domain enrichment layer.
//
// STATISTICS FIREWALL: all appearance queries use the net_team_appearance_canonical
// view, which enforces evidence_class = 'canonical_only' at the DB layer.
// Never query net_team_appearance directly from this statement group.
//
// discipline_review_count = disciplines at this event whose canonical-group match was
// ambiguous (net_discipline_group.conflict_flag = 1), so the stored grouping is a best
// guess. Public pages surface only that the ambiguity exists, never the annotation rows.
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
      (
        SELECT COUNT(DISTINCT a2.discipline_id)
        FROM net_team_appearance_canonical a2
        JOIN net_discipline_group dg ON dg.discipline_id = a2.discipline_id
        WHERE a2.event_id = e.id AND dg.conflict_flag = 1
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
      COUNT(a.id)                         AS appearance_count
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
  tier_status: string | null;
  is_active_player: number | null;
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

  // Deliverability of the exact mailbox an outbox enqueue is about to write
  // to. Address-keyed rather than member-keyed, because bounce and complaint
  // state is a property of the mailbox, and some flows deliberately write to
  // an address that is not the recipient member's login email.
  get emailStatusByNormalizedLoginEmail() { return db.prepare(`
    SELECT id, email_status
    FROM members_active
    WHERE login_email_normalized = ?
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

  // The recorded name parts, for the surname gate. Reads members rather than a
  // visibility view because the gate runs for members in every account state,
  // including one being disputed.
  get findNamePartsById() { return db.prepare(`
    SELECT family_name, given_names, real_name FROM members WHERE id = ?
  `); },

  // The whole member row an administrator's member record renders, plus the
  // names its correction rewrites. Reads the bare members table rather than a
  // visibility view: the record exists to reach members the member-facing views
  // exclude by design, including opted-out, deceased, and soft-deleted accounts.
  get findMemberForAdminRecord() { return db.prepare(`
    SELECT id, slug, created_at,
           login_email, email_verified_at, email_status, last_login_at,
           family_name, given_names, real_name, display_name,
           city, region, country, gender, birth_date, phone, whatsapp,
           searchable, is_admin, is_system, is_board, is_hof, is_bap,
           is_deceased, deceased_at,
           deleted_at, deletion_grace_expires_at, personal_data_purged_at,
           legacy_member_id, historical_person_id, ifpa_join_date
    FROM members
    WHERE id = ?
  `); },

  // Move a member's profile URL. Separate from the name write above, because
  // the two are separate corrections and a slug carries derived copies a name
  // does not.
  get updateMemberSlug() { return db.prepare(`
    UPDATE members
    SET slug       = ?,
        updated_at = ?,
        updated_by = ?,
        version    = version + 1
    WHERE id = ?
  `); },

  // The member's uploader tag, which every upload of theirs carries and every
  // gallery of theirs keys its criteria on.
  get findUploaderTag() { return db.prepare(`
    SELECT id, tag_normalized FROM tags WHERE tag_normalized = ?
  `); },

  // Rename that tag in place, keeping its id. Every media_tags and
  // member_gallery_tags row references the tag by id, so all of them follow
  // this one write and nothing needs re-pointing.
  get renameUploaderTag() { return db.prepare(`
    UPDATE tags
    SET tag_normalized = ?, tag_display = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  // media_tags keeps its own copy of the tag text for display, which the rename
  // above would otherwise leave reading the member's old address.
  get refreshMediaTagDisplay() { return db.prepare(`
    UPDATE media_tags
    SET tag_display = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE tag_id = ?
  `); },

  // Rewrite the recorded legal name and the display name together. The profile
  // slug is deliberately absent: correcting it is its own action, above.
  get updateMemberNames() { return db.prepare(`
    UPDATE members
    SET family_name             = ?,
        given_names             = ?,
        real_name               = ?,
        display_name            = ?,
        display_name_normalized = ?,
        updated_at              = ?,
        updated_by              = ?,
        version                 = version + 1
    WHERE id = ?
  `); },

  // Resolve an admin's free-text member handle to member ids for the payments
  // search: an exact id, slug, or login email, or a display-name fragment. Reads
  // the full members table rather than a visibility view because it is an
  // admin-only surface and a payment can belong to a since-departed member.
  // Params: (idOrSlug, idOrSlug, normalizedEmail, escapedNameFragment, limit).
  get findMemberIdsForAdminSearch() { return db.prepare(`
    SELECT id FROM members
    WHERE id = ?
       OR slug = ?
       OR login_email_normalized = ?
       OR display_name_normalized LIKE '%' || ? || '%' ESCAPE '\\'
    ORDER BY display_name_normalized
    LIMIT ?
  `); },

  get findIdentityLinks() { return db.prepare(`
    SELECT
      m.legacy_member_id,
      lm.claimed_at  AS legacy_claimed_at,
      m.historical_person_id,
      hp.person_name AS historical_person_name
    -- Reads every member, not only live ones. A soft-deleted account is one of
    -- the states the administrator member record exists to reach, and its
    -- identity links are part of what an administrator opens that record to see.
    -- An erased account has no links left to show, which the purge condition
    -- below keeps true rather than assumed.
    FROM members AS m
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

  /**
   * The same member-profile result rows, reached by the claimed historical
   * person rather than by an old-site account.
   *
   * A member who claimed an archival identity that never had an account has no
   * legacy_member_id to look up, so the account-keyed statement above cannot
   * find them and their profile renders empty while the archive holds their
   * results. This is that statement with one predicate changed: it keys on the
   * participant's person directly, which also makes the join to
   * historical_persons unnecessary, since nothing but that filter used it.
   *
   * Column set and ordering are identical on purpose. The profile's grouping
   * consumes MemberResultRow, and a second shape here would mean a second shape
   * to keep in step every time the first one moves.
   *
   * Deliberately not the public player-page statement, which filters on the same
   * predicate but carries a different column set: it adds the discipline sort
   * order and the participant order and omits the co-competitor's member id,
   * which is what links a teammate to their profile here.
   */
  get listResultsByPersonAnchor() { return db.prepare(`
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
    WHERE erp_me.historical_person_id = ?
    ORDER BY
      e.start_date DESC,
      COALESCE(ed.sort_order, 0) ASC,
      COALESCE(ed.name, '') COLLATE NOCASE ASC,
      ere.placement ASC,
      erp_co.participant_order ASC
  `); },

  get searchMembers() { return db.prepare(`
    SELECT m.slug, m.display_name, m.country, m.is_hof, m.is_bap, m.is_board,
           m.gender, m.show_gender,
           s.tier_status, s.is_active_player
    FROM members_searchable m
    LEFT JOIN member_membership_status_current s ON s.member_id = m.id
    WHERE m.display_name_normalized LIKE '%' || ? || '%' ESCAPE '\\'
    ORDER BY m.display_name_normalized
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
      birth_date                 = ?,
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

  // The date on its own, for a surface that offers it back for correction
  // without loading the whole profile around it.
  get findBirthDateById() { return db.prepare(`
    SELECT birth_date FROM members WHERE id = ?
  `); },

  // The date on its own, for the answer a member gives to an administrator's
  // question about it. The profile update rewrites every editable field and
  // would need values for all of them; this one carries only what was asked.
  get updateMemberBirthDate() { return db.prepare(`
    UPDATE members
    SET birth_date = ?,
        updated_at = ?,
        updated_by = 'member',
        version    = version + 1
    WHERE id = ?
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
      family_name, given_names, real_name, display_name, display_name_normalized,
      gender,
      searchable,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'registration', ?, 'registration', 1)
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
  //
  // "An admin exists" means one who can actually sign in and act. Nothing ever
  // clears the flag except another admin's revoke, so a sole administrator who
  // dies or deletes their account leaves the row behind carrying is_admin = 1,
  // and reading the bare table would wedge the break-glass path shut in exactly
  // the total-admin-loss case it exists for, with the deliberately
  // non-revealing failure giving the operator nothing to go on.
  get grantFirstAdmin() { return db.prepare(`
    UPDATE members
       SET is_admin   = 1,
           updated_at = ?,
           updated_by = 'register_admin_bootstrap',
           version    = version + 1
     WHERE id = ?
       AND NOT EXISTS (
         SELECT 1 FROM members_active WHERE is_admin = 1 AND is_deceased = 0
       )
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
      AND password_version = ?
  `); },
};

export const systemConfig = {
  get getValueByKey() { return db.prepare(`
    SELECT value_json
    FROM system_config_current
    WHERE config_key = ?
  `); },

  // The current row with the moment it took effect, for a reader that needs
  // to say since when a value has held, not only what it is.
  get getCurrentRowByKey() { return db.prepare(`
    SELECT value_json, effective_start_at
    FROM system_config_current
    WHERE config_key = ?
  `); },

  // Appends a row; the table is append-only by trigger, so this is the only
  // write shape it has. A null author is a system observation rather than an
  // administrator's decision.
  get insert() { return db.prepare(`
    INSERT INTO system_config (
      id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `); },
};

export interface OutboxRow {
  id: string;
  recipient_email: string | null;
  recipient_member_id: string | null;
  subject: string;
  body_text: string;
  from_identity: string | null;
  // Set on a copy that belongs to a list send; the archive and the admin
  // surfaces read it to say which list a message went out on.
  mailing_list_id: string | null;
  // Which sending reputation the message is charged against, decided by the
  // audience at enqueue rather than inferred here.
  stream: 'transactional' | 'bulk';
  retry_count: number;
  idempotency_key: string | null;
  // Whether the drain sends this message even to a mailbox that has since
  // bounced or complained. Carried on the row because the fact is decided at
  // enqueue and the suppression gate runs again at send.
  bypasses_suppression: number;
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
      category, reason_text, metadata_json,
      data_origin
    ) VALUES (?, ?, 'system',
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?)
  `); },

  // Every claim this member has attempted, for the evidence block an
  // administrator adjudicates a disputed or doubtful link from. The ledger is
  // the only place the outcome of a past attempt survives: the claim itself may
  // have been reverted, and a refused one wrote no other row at all.
  //
  // Newest first, because a dispute is almost always about the most recent
  // attempt, and capped because a queue card is a summary rather than a history.
  get listClaimEvidenceForMember() { return db.prepare(`
    SELECT occurred_at, action_type, metadata_json, data_origin
    FROM audit_entries
    WHERE entity_type = 'member'
      AND entity_id = ?
      AND action_type IN (
        'claim.legacy_account',
        'claim.historical_person',
        'claim.historical_person_blocked'
      )
    ORDER BY occurred_at DESC, id DESC
    LIMIT 10
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
  data_origin: string;
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
      a.data_origin,
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

export interface AuditLogSummaryRow {
  month: string;    // 'YYYY-MM'
  category: string;
  n: number;
}

/**
 * Counts per category per calendar month, for the periodic-summary view. Takes
 * the same filters as the list so the summary is the filtered view aggregated
 * rather than a second, differently-scoped question.
 *
 * Months come from the stored UTC timestamp with no conversion, matching every
 * other figure the platform reports; a month boundary is therefore the UTC one.
 */
export function summarizeAuditLogByMonthAndCategory(filters: AuditLogFilters): AuditLogSummaryRow[] {
  const { sql, params } = buildAuditLogWhere(filters);
  return db.prepare(`
    SELECT strftime('%Y-%m', a.occurred_at) AS month, a.category AS category, COUNT(*) AS n
    FROM audit_entries a
    ${sql}
    GROUP BY month, a.category
    ORDER BY month DESC, a.category
  `).all(...params) as AuditLogSummaryRow[];
}

export function countAuditLog(filters: AuditLogFilters): number {
  const { sql, params } = buildAuditLogWhere(filters);
  const row = db.prepare(`SELECT COUNT(*) AS n FROM audit_entries a ${sql}`).get(...params) as { n: number };
  return row.n;
}

// The categories in use, for the audit-log filter dropdown. Read on each render:
// the one caller is an administrator page, the distinct scan walks an indexed
// column, and a held copy would have to be invalidated by anything that writes a
// new namespace, which is every audit append in the codebase.
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

export interface EmailTemplateRow {
  id: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  version: number;
  template_key: string;
  subject_template: string;
  body_template: string;
  is_enabled: number;
  pii_classification: string;
}

// Reads target the bare table, not the email_templates_enabled view: the
// render path must distinguish a disabled row (suppress the send) from a
// missing row (a seed invariant violation), and the admin editor and the
// email-log template preview must see disabled rows too.
export const emailTemplates = {
  get getByKey() { return db.prepare(`
    SELECT id, created_at, updated_at, updated_by, version,
           template_key, subject_template, body_template, is_enabled, pii_classification
    FROM email_templates WHERE template_key = ?
  `); },

  get listAll() { return db.prepare(`
    SELECT id, created_at, updated_at, updated_by, version,
           template_key, subject_template, body_template, is_enabled, pii_classification
    FROM email_templates ORDER BY template_key
  `); },

  get updateByKey() { return db.prepare(`
    UPDATE email_templates
    SET subject_template = ?, body_template = ?, is_enabled = ?, pii_classification = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE template_key = ?
  `); },
};

export const outbox = {
  // Operational depth probe: pending + sending rows are the deliverable
  // backlog; a growing count means the worker is down or SES is failing.
  get countBacklog() { return db.prepare(`
    SELECT COUNT(*) AS n FROM outbox_emails WHERE status IN ('pending','sending')
  `); },

  // Outbound-email shape, one row per status present, for the admin health view.
  // Grouped rather than one count per status so a new status added to the CHECK
  // constraint shows up without a new statement.
  //
  // Two statements, because the window means different things to the two halves.
  // What was SENT is a volume figure and belongs in the window. What is waiting
  // or in trouble is a backlog figure counted over all time: a message pending
  // since before the window is exactly what the page exists to surface, and
  // windowing it reports an idle queue during the outage it should be shouting
  // about.
  get countSentInWindow() { return db.prepare(`
    SELECT COUNT(*) AS n
    FROM outbox_emails
    WHERE status = 'sent' AND sent_at >= ?
  `); },

  get countByUnsentStatus() { return db.prepare(`
    SELECT status, COUNT(*) AS n
    FROM outbox_emails
    WHERE status <> 'sent'
    GROUP BY status
  `); },

  // The age of the oldest message still waiting to go out. A queue with items in
  // it is normal operation; one whose oldest item predates the window is not.
  get oldestPendingAt() { return db.prepare(`
    SELECT MIN(created_at) AS oldest
    FROM outbox_emails
    WHERE status IN ('pending','sending')
  `); },

  // Dead-lettered messages over all time, not the window: a message that
  // exhausted its retries still needs an operator's attention next week, and a
  // windowed count would quietly drop it off the page once it aged out.
  get countDeadLetterAllTime() { return db.prepare(`
    SELECT COUNT(*) AS n FROM outbox_emails WHERE status = 'dead_letter'
  `); },

  // Retention cleanup: a delivered copy is one message to one recipient,
  // carrying that recipient's address and the rendered body, and it is kept
  // only as long as bounce correlation and delivery questions can still use
  // it.
  get deleteSentBefore() { return db.prepare(`
    DELETE FROM outbox_emails
    WHERE status = 'sent' AND sent_at IS NOT NULL AND sent_at < ?
  `); },

  // A dead-lettered row exhausted its retries and is an operator's to review,
  // but a message nobody acted on for a whole retention window is not going to
  // be sent now, and holding its recipient address forever buys nothing. Aged
  // on last attempt, falling back to row age for a row that never recorded one.
  // Pending and failed rows are live work the drain still owns, and a
  // manual_review row is an unresolved question about whether a real person
  // received a message, so neither ages out.
  get deleteDeadLetterBefore() { return db.prepare(`
    DELETE FROM outbox_emails
    WHERE status = 'dead_letter'
      AND COALESCE(last_attempt_at, updated_at, created_at) < ?
  `); },

  get insert() { return db.prepare(`
    INSERT INTO outbox_emails (
      id, created_at, created_by, updated_at, updated_by, version,
      idempotency_key,
      recipient_email, recipient_member_id, mailing_list_id,
      sender_member_id, from_identity, stream,
      subject, body_text, template_key,
      bypasses_suppression,
      status, retry_count, scheduled_for
    ) VALUES (?, ?, 'system', ?, 'system', 1,
      ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?,
      'pending', 0, ?)
  `); },

  get selectPendingBatchByStream() { return db.prepare(`
    SELECT id, recipient_email, recipient_member_id, subject, body_text,
           from_identity, mailing_list_id, stream, retry_count, idempotency_key,
           bypasses_suppression
    FROM outbox_emails
    WHERE status = 'pending'
      AND stream = ?
      AND (scheduled_for IS NULL OR scheduled_for <= ?)
    ORDER BY created_at ASC
    LIMIT ?
  `); },

  get countPendingByStream() { return db.prepare(`
    SELECT stream, COUNT(*) AS n
    FROM outbox_emails
    WHERE status = 'pending'
    GROUP BY stream
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

  // A failed attempt goes back to 'pending' with a scheduled_for delay so
  // retries back off instead of burning the whole attempt budget in one
  // burst against a provider that is refusing everything.
  get markFailedRetry() { return db.prepare(`
    UPDATE outbox_emails
    SET status = 'pending',
        retry_count = retry_count + 1,
        last_error = ?,
        scheduled_for = ?,
        updated_at = ?,
        updated_by = 'system',
        version = version + 1
    WHERE id = ?
  `); },

  // Provider throttling and quota exhaustion are pressure, not a verdict on
  // this email: the row waits out the delay WITHOUT consuming one of its
  // limited attempts, so a send burst cannot dead-letter real mail.
  get markThrottledRetry() { return db.prepare(`
    UPDATE outbox_emails
    SET status = 'pending',
        last_error = ?,
        scheduled_for = ?,
        updated_at = ?,
        updated_by = 'system',
        version = version + 1
    WHERE id = ?
  `); },

  // An ambiguous outcome (the provider may or may not have delivered) must
  // not silently auto-retry: SES has no idempotency token, so a retry can
  // deliver the same email twice. The row parks for an admin to resolve.
  get markManualReview() { return db.prepare(`
    UPDATE outbox_emails
    SET status = 'manual_review',
        last_error = ?,
        updated_at = ?,
        updated_by = 'system',
        version = version + 1
    WHERE id = ?
  `); },

  // Dead-letter is the one terminal ending with no resend behind it, so the
  // body goes the same way it does on a successful send: a rendered body can
  // hold a live reset or verification token, and a dead-lettered row would
  // otherwise keep it indefinitely. The manual-review endings deliberately
  // keep theirs, because that status exists for an operator to read the
  // message and decide whether to resend it.
  // Withheld at send because the recipient's mailbox stopped accepting mail
  // after the message was queued. It is a dead letter rather than a failure:
  // nothing was attempted, no retry could succeed, and the reason belongs on
  // the row where an administrator reviewing the queue will read it. The body
  // is cleared as on any terminal outcome, so a message that will never be
  // delivered does not sit in backups carrying its contents.
  get markSuppressedAtSend() { return db.prepare(`
    UPDATE outbox_emails
    SET status = 'dead_letter',
        last_error = ?,
        body_text = NULL,
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
        body_text = NULL,
        updated_at = ?,
        updated_by = 'system',
        version = version + 1
    WHERE id = ?
  `); },

  // Crash recovery: a worker killed between markSending and markSent leaves
  // the row 'sending' forever, and the pending selects read 'pending' only.
  // A stranded row's true outcome is unknowable (the crash may have happened
  // after a successful provider send), so it parks for manual review rather
  // than silently retrying into a possible duplicate delivery.
  get reapStaleSending() { return db.prepare(`
    UPDATE outbox_emails
    SET status = 'manual_review',
        last_error = 'stale_sending_reaped',
        updated_at = ?,
        updated_by = 'system',
        version = version + 1
    WHERE status = 'sending'
      AND last_attempt_at < ?
  `); },

  // Erasure reach. An outbox row is addressed personal data in its own right:
  // the address, the rendered body, and the subject, which several registered
  // templates fill with the member's own name. The subject column is NOT NULL,
  // so it takes a caller-supplied placeholder rather than a null. The member
  // link is what survives, which is also what keeps the table's
  // at-least-one-addressing-column CHECK satisfied.
  //
  // The WHERE guard makes a re-run a no-op, so the caller's row count is the
  // number of rows this erasure actually changed.
  // A row still waiting to go out is also settled here. Blanking its address
  // while leaving it pending hands the sender an unsendable message that fails
  // every attempt until it dead-letters, lighting the operator's attention badge
  // over an erasure that worked exactly as intended. The drain reads only
  // 'pending', so 'failed' is terminal and honest: the message never went out and
  // never will.
  get scrubForMember() { return db.prepare(`
    UPDATE outbox_emails
    SET recipient_email = NULL,
        body_text       = NULL,
        subject         = ?,
        status          = CASE WHEN status IN ('pending','sending') THEN 'failed' ELSE status END,
        last_error      = CASE WHEN status IN ('pending','sending')
                            THEN 'recipient erased before delivery' ELSE last_error END,
        updated_at      = ?,
        updated_by      = 'system',
        version         = version + 1
    WHERE recipient_member_id = ?
      AND (recipient_email IS NOT NULL OR body_text IS NOT NULL OR subject <> ?)
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
      s3_key_thumb, s3_key_display, width_px, height_px, source_filename, mime_type
    ) VALUES (?, ?, 'member', ?, 'member', 1, ?, 'photo', 1, NULL, ?, ?, ?, ?, ?, ?, ?)
  `); },

  get findSystemMemberId() { return db.prepare(`
    SELECT id FROM members WHERE is_system = 1
  `); },

  get insertCuratorPhoto() { return db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      s3_key_thumb, s3_key_display, width_px, height_px,
      moderation_status, source_filename, mime_type
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, 'photo', 0, ?, ?,
              ?, ?, ?, ?,
              'active', ?, ?)
  `); },

  get insertCuratorVideo() { return db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url,
      width_px, height_px,
      moderation_status, source_filename, mime_type
    ) VALUES (?, ?, 'admin-act-as', ?, 'admin-act-as', 1,
              ?, 'video', 0, ?, ?,
              's3', ?, NULL, ?,
              ?, ?,
              'active', ?, ?)
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
      moderation_status, source_filename, mime_type
    ) VALUES (?, ?, 'member', ?, 'member', 1,
              ?, 'photo', 0, ?, ?,
              ?, ?, ?, ?,
              'active', ?, ?)
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

  // Trick detail "Reference Media" block: every watchable video media item
  // tagged with the trick's canonical slug hashtag (e.g. '#butterfly').
  // Returns most-recent first. The caller filters per their policy
  // (e.g. /freestyle/tricks/:slug includes TT items; the public gallery
  // grouping path excludes them). Reading the linkable-video view is what
  // keeps this answer identical to the dictionary browse rows'.
  // The tag is identified through tags.tag_normalized, the same column the
  // browse coverage query matches on. media_tags.tag_display is a
  // denormalized copy carrying whatever form the curator typed, and only
  // tag_normalized is constrained to the lowercase '#'-prefixed form, so
  // matching on the display copy lets one oddly-cased tag make this read and
  // the browse read disagree with nothing to signal it.
  get listMediaByTrickTag() { return db.prepare(`
    SELECT mi.id, mi.video_id, mi.video_url, mi.thumbnail_url, mi.caption,
           mi.video_platform, mi.uploaded_at, mi.source_id,
           ms.source_name, ms.creator AS source_creator, ms.url AS source_url
    FROM media_items_linkable_video mi
    JOIN media_tags mt ON mt.media_id = mi.id
    JOIN tags t ON t.id = mt.tag_id
    LEFT JOIN media_sources ms ON ms.source_id = mi.source_id
    WHERE t.tag_normalized = ?
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
  // post-commit sidecar I/O. is_default marks the auto-materialized
  // per-member Personal Gallery, whose name and criteria the service
  // layer refuses to change and whose row it refuses to delete.
  get getNamedGalleryById() { return db.prepare(`
    SELECT g.id, g.name, g.description, g.sort_order, g.is_default,
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
    SELECT g.id, g.name, g.description, g.sort_order, g.is_default
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
// Exact slug wins over alias. Only active tricks resolve, matching every other
// public trick read: an inactive or unresolved slug is omitted so a media card
// never renders a chip whose trick-detail link would 404. Used by the media-card
// ontology cross-link resolver.
export function resolveTrickTags(
  slugs: string[],
): { matched: string; canonicalSlug: string; canonicalName: string }[] {
  if (slugs.length === 0) return [];
  const ph = slugs.map(() => '?').join(',');
  return db.prepare(`
    SELECT slug AS matched, slug AS canonicalSlug, canonical_name AS canonicalName
    FROM freestyle_tricks
    WHERE slug IN (${ph})
      AND is_active = 1
    UNION
    SELECT a.alias_slug AS matched, a.trick_slug AS canonicalSlug, ft.canonical_name AS canonicalName
    FROM freestyle_trick_aliases a
    JOIN freestyle_tricks ft ON ft.slug = a.trick_slug
    WHERE a.alias_slug IN (${ph})
      AND a.alias_slug NOT IN (SELECT slug FROM freestyle_tricks)
      AND ft.is_active = 1
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

export interface MemberByTagRow {
  slug: string;
  display_name: string;
  tier_status: string | null;
  is_active_player: number | null;
  is_hof: number;
  is_bap: number;
  is_board: number;
}

export function queryMemberDisplayNamesBySlugs(slugs: string[]): MemberByTagRow[] {
  if (slugs.length === 0) return [];
  const placeholders = slugs.map(() => '?').join(',');
  return db.prepare(`
    SELECT m.slug, m.display_name, m.is_hof, m.is_bap, m.is_board,
           s.tier_status, s.is_active_player
    FROM members_active m
    LEFT JOIN member_membership_status_current s ON s.member_id = m.id
    WHERE m.slug IN (${placeholders})
      AND m.personal_data_purged_at IS NULL
  `).all(...slugs) as MemberByTagRow[];
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

/** A tag carrying media, without the community-threshold column. */
export interface TagWithUsageRow {
  tag_id: string;
  tag_normalized: string;
  tag_display: string;
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

  // The All Tags half of the public browse page: community tags only, so a tag
  // one member uses many times stays personal and off the page, and the curated
  // catalog's single-uploader tags do not fill an alphabetical index. Unbounded
  // by design; the community-tag threshold is the only limit the page has.
  get listCommunityTagsAlphabetical() { return db.prepare(`
    SELECT ts.tag_id, t.tag_normalized, t.tag_display,
           ts.usage_count, ts.distinct_member_count
    FROM tag_stats ts
    JOIN tags t ON t.id = ts.tag_id
    WHERE t.tag_normalized NOT LIKE '#by_%'
      AND t.tag_normalized <> '#unavailable_embed'
      AND ts.distinct_member_count >= 2
    ORDER BY t.tag_normalized ASC
  `); },

  // Event hashtags that carry media, newest first. The event tag embeds its own
  // year (#event_{year}_{slug}), so a descending sort on the normalized form
  // orders by year without joining the events table; ordering within a year is
  // by slug and carries no recency meaning.
  get listRecentEventTagsWithMedia() { return db.prepare(`
    SELECT t.id AS tag_id, t.tag_normalized, t.tag_display, ts.usage_count
    FROM tags t
    JOIN tag_stats ts ON ts.tag_id = t.id
    WHERE t.is_standard = 1
      AND t.standard_type = 'event'
      AND ts.usage_count > 0
    ORDER BY t.tag_normalized DESC
    LIMIT ?
  `); },

  // The tutorial hashtag, returned only when it carries media, so the page
  // links it as a gallery rather than showing a dead token.
  get findTutorialTagWithMedia() { return db.prepare(`
    SELECT ts.tag_id, t.tag_normalized, t.tag_display, ts.usage_count
    FROM tag_stats ts
    JOIN tags t ON t.id = ts.tag_id
    WHERE t.tag_normalized = '#tutorial'
      AND ts.usage_count > 0
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
      AND e.status IN ('reg_open', 'completed')
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

  get selectOrphanedProcessing() { return db.prepare(`
    SELECT * FROM media_jobs
    WHERE state = 'processing'
      AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
  `); },

  get selectDispatchablePendingTranscode() { return db.prepare(`
    SELECT * FROM media_jobs
    WHERE state = 'pending_transcode'
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

  // Street address and postal code are deliberately NOT copied here. Nothing
  // on the platform reads them off a member row: there is no edit surface, no
  // page renders them, and the Official IFPA Roster does not show them. Personal data
  // is not retained without a stated purpose, so they stay in the archival
  // legacy snapshot, which is where the historical record belongs. The purge
  // and revert-scrub statements still clear both columns, because rows claimed
  // before this change carry values.
  get transferLegacyFields() { return db.prepare(`
    UPDATE members
    SET
      legacy_member_id = ?,
      legacy_user_id   = COALESCE(legacy_user_id, ?),
      legacy_email     = COALESCE(legacy_email, ?),
      bio              = CASE WHEN bio = '' THEN ? ELSE bio END,
      birth_date       = COALESCE(birth_date, ?),
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

  // Re-assert the curated historical record's values over values the legacy
  // dump left on the member row in an EARLIER transaction.
  //
  // Curated data outranks the dump, but both merge statements fill only empty
  // columns, so write order settles precedence within one claim and nothing
  // settles it across two: a member who claims their legacy account first and
  // the curated record later would keep the dump's country and first year
  // forever, because the second merge finds those columns already filled.
  //
  // A column moves only when it still holds exactly what the legacy transfer
  // wrote, which is the same equality test the claim revert uses so that a
  // value the member typed themselves is never touched. `IS` rather than `=`
  // so a NULL on either side compares correctly; a curated value of NULL means
  // the record says nothing and leaves the column alone.
  get reassertCuratedOverLegacyFields() { return db.prepare(`
    UPDATE members
    SET
      country = CASE
        WHEN ? IS NOT NULL AND country IS ? THEN ?
        ELSE country END,
      first_competition_year = CASE
        WHEN ? IS NOT NULL AND first_competition_year IS ? THEN ?
        ELSE first_competition_year END,
      updated_at = ?,
      updated_by = 'claim_merge',
      version    = version + 1
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
  // The honor flags come with the row because a revert decides, per honor,
  // whether the flag the member carries came from the claim being reverted; a
  // flag they never held is not something a revert can clear.
  get findClaimingMember() { return db.prepare(`
    SELECT id, slug, real_name, legacy_member_id, historical_person_id,
           login_email_normalized, email_verified_at, birth_date, country,
           is_hof, is_bap
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

  // Drop the honor flags a claim merge derived, on a claim revert. When a revert
  // leaves the member linked to no honored record, flags that came from the
  // reverted claim must go -- otherwise a reverted (often disputed) claim
  // strands a HoF/BAP badge, and the public profile visibility it confers, on a
  // member who no longer holds the honor. The caller skips this in the two cases
  // where the honor did not come from the reverted claim: a separate
  // historical-person link that survives the revert and still backs it, and an
  // administrator's own honor grant, which stands on its own ledger row.
  // Decided per honor, because the two are independent: a member can hold one
  // by an administrator's grant and the other from the reverted claim, and
  // clearing both because one of them qualifies strands the other exactly the
  // way this statement exists to prevent.
  // Params: (clearHof, clearHof, clearBap, clearBap, updatedAt, updatedBy, memberId).
  get clearDerivedHonors() { return db.prepare(`
    UPDATE members
    SET
      is_hof            = CASE WHEN ? = 1 THEN 0 ELSE is_hof END,
      hof_inducted_year = CASE WHEN ? = 1 THEN NULL ELSE hof_inducted_year END,
      is_bap            = CASE WHEN ? = 1 THEN 0 ELSE is_bap END,
      bap_inducted_year = CASE WHEN ? = 1 THEN NULL ELSE bap_inducted_year END,
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

  // Administrator's lookup over the old accounts nobody holds, by exact id or
  // username, or by part of the name or an email address. The member-facing
  // paths match on an exact identifier only, which is right for a member
  // proving an account is theirs and useless to an administrator who has been
  // asked to find one. Claimed rows are excluded because there is nothing left
  // to decide about them and their holder is reachable from the member lookup.
  //
  // Admin-only, and read behind the admin route gate: identity resolution is
  // internal, and these rows carry a person's legal name and date of birth.
  get searchUnclaimedForAdmin() { return db.prepare(`
    SELECT legacy_member_id, legacy_user_id, real_name, display_name,
           birth_date, city, region, country,
           ifpa_join_date, first_competition_year, is_hof, is_bap
    FROM legacy_members
    WHERE claimed_by_member_id IS NULL
      AND (
        legacy_member_id = ?
        OR legacy_user_id = ?
        OR LOWER(COALESCE(real_name, '')) LIKE '%' || ? || '%' ESCAPE '\\'
        OR LOWER(COALESCE(display_name, '')) LIKE '%' || ? || '%' ESCAPE '\\'
        OR LOWER(COALESCE(legacy_email, '')) = ?
        OR LOWER(COALESCE(legacy_email2, '')) = ?
        OR LOWER(COALESCE(legacy_email3, '')) = ?
      )
    ORDER BY COALESCE(display_name, real_name) COLLATE NOCASE
    LIMIT ?
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

  // Put a completed task back in front of the member. The caller decides when
  // that is warranted; this only performs it, and only on a task that is
  // currently completed, so re-running it cannot disturb one already pending.
  get reopenCompletedTask() { return db.prepare(`
    UPDATE member_onboarding_tasks
       SET state        = 'pending',
           completed_at = NULL,
           updated_at   = ?,
           updated_by   = ?,
           version      = version + 1
     WHERE member_id = ?
       AND task_type  = ?
       AND state      = 'completed'
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
      -- The recorded name parts go with the rest of the legal name; the
      -- anonymized stub keeps only the placeholder written into real_name.
      family_name             = NULL,
      given_names             = NULL,
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

  // Honor-grant duplicate guard: one row per (member, honor reason_code) is the
  // block condition for the admin honor-grant surface. HoF and BAP use distinct
  // reason codes, so a member may hold one of each.
  // Does the member hold this honor right now? A grant counts unless a later
  // removal row withdraws it. The ledger is append-only, so a grant made in
  // error stays visible as history; what decides the current answer is whether
  // the newest of the two rows is the grant or the withdrawal.
  // Params: (memberId, grantReasonCode, memberId, removalReasonCode).
  get hasHonorGrant() { return db.prepare(`
    SELECT 1 FROM member_tier_grants AS g
    WHERE g.member_id = ? AND g.reason_code = ?
      AND NOT EXISTS (
        SELECT 1 FROM member_tier_grants AS r
        WHERE r.member_id = ?
          AND r.reason_code = ?
          AND (r.created_at > g.created_at
               OR (r.created_at = g.created_at AND r.id > g.id))
      )
    LIMIT 1
  `); },

  // Recent honor grants for the admin surface's accountability list, sourced
  // from the audit trail (the HoF/BAP grant actions), newest first.
  get listRecentHonorGrants() { return db.prepare(`
    SELECT a.occurred_at, a.action_type, a.actor_member_id,
           a.entity_id AS member_id, m.display_name, m.slug, a.data_origin
    FROM audit_entries a
    LEFT JOIN members m ON m.id = a.entity_id
    WHERE a.action_type IN ('tier.hof_grant', 'tier.bap_grant')
    ORDER BY a.occurred_at DESC, a.id DESC
    LIMIT ?
  `); },

  // Who currently holds an honor, and who currently sits on the board. The
  // honor-grants page offers to take a grant back and to take a director off the
  // board, each keyed on a member id typed in by hand, and its only listing was
  // a recency feed of grants made: a page that removes a director could not
  // answer who the directors are. Live members only, since a soft-deleted or
  // erased account is not a current holder of anything.
  get listCurrentHofHolders() { return db.prepare(`
    SELECT id, display_name, slug, hof_inducted_year AS inducted_year
    FROM members_active
    WHERE is_hof = 1
    ORDER BY display_name COLLATE NOCASE
  `); },

  get listCurrentBapHolders() { return db.prepare(`
    SELECT id, display_name, slug, bap_inducted_year AS inducted_year
    FROM members_active
    WHERE is_bap = 1
    ORDER BY display_name COLLATE NOCASE
  `); },

  get listCurrentBoardMembers() { return db.prepare(`
    SELECT id, display_name, slug
    FROM members_active
    WHERE is_board = 1
    ORDER BY display_name COLLATE NOCASE
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

  // Set the badge and its induction year alongside an administrator's honor
  // grant, in the same transaction as the tier row. Without this a member
  // inducted today receives Tier 2 and a congratulations email, shows no badge
  // on any surface, and is missing from the roster counts for that honor.
  // Params: (isHof, hofYear, isBap, bapYear, updatedAt, updatedBy, memberId).
  get applyGrantedHonor() { return db.prepare(`
    UPDATE members
    SET
      is_hof            = MAX(is_hof, ?),
      hof_inducted_year = COALESCE(?, hof_inducted_year),
      is_bap            = MAX(is_bap, ?),
      bap_inducted_year = COALESCE(?, bap_inducted_year),
      updated_at        = ?,
      updated_by        = ?,
      version           = version + 1
    WHERE id = ?
  `); },

  // Take back one honor granted in error, leaving the other alone. The year
  // goes with the badge, because a year without the honor it dates means
  // nothing. Params: (clearHof, clearHof, clearBap, clearBap, updatedAt, updatedBy, memberId).
  get clearGrantedHonor() { return db.prepare(`
    UPDATE members
    SET
      is_hof            = CASE WHEN ? = 1 THEN 0 ELSE is_hof END,
      hof_inducted_year = CASE WHEN ? = 1 THEN NULL ELSE hof_inducted_year END,
      is_bap            = CASE WHEN ? = 1 THEN 0 ELSE is_bap END,
      bap_inducted_year = CASE WHEN ? = 1 THEN NULL ELSE bap_inducted_year END,
      updated_at        = ?,
      updated_by        = ?,
      version           = version + 1
    WHERE id = ?
  `); },

  // Everything that decides whether a member holds an honor and where it came
  // from: the badge they carry, and whether a linked historical record backs it.
  // The honor ledger alone is not enough, because a claim merge sets the badge
  // from the claimed record and writes no ledger row at all.
  get getHonorState() { return db.prepare(`
    SELECT m.is_hof, m.is_bap, m.historical_person_id,
           hp.hof_member AS record_hof, hp.bap_member AS record_bap
    FROM members AS m
    LEFT JOIN historical_persons AS hp ON hp.person_id = m.historical_person_id
    WHERE m.id = ?
  `); },

  // The honor grant row itself, for a correction that takes the honor back. The
  // ledger is append-only, so this deletes nothing: it finds the row whose
  // reason code names the honor, and the caller writes the reversing entry.
  get findHonorGrant() { return db.prepare(`
    SELECT id, created_at FROM member_tier_grants
    WHERE member_id = ? AND reason_code = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `); },

  // Set or clear the board flag alongside the governance tier row, so the badge
  // the roster, the profile and member search all read agrees with the tier.
  // Params: (isBoard, updatedAt, updatedBy, memberId).
  get setBoardFlag() { return db.prepare(`
    UPDATE members
    SET is_board   = ?,
        updated_at = ?,
        updated_by = ?,
        version    = version + 1
    WHERE id = ?
  `); },
};

// ── Active Player ledger (active_player_grants / member_active_player_current) ──
// Append-only ledger; UPDATE/DELETE blocked by triggers.

export interface MemberActivePlayerCurrentRow {
  member_id: string;
  is_active_player: 0 | 1;
  active_player_expires_at: string | null;
  /** Runs to, or last ran to. Survives a processed expiry; see the view. */
  active_player_last_expires_at: string | null;
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
           active_player_expires_at, active_player_last_expires_at,
           latest_active_player_reason_code
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

  // One-click unsubscribe: the member is not signed in, so this writes the one
  // row the signed token names and nothing else. Only a currently-subscribed
  // row moves; a bounced, complained or admin-suppressed row keeps the state an
  // operator or the provider put it in, and an already-unsubscribed row is
  // left alone so the action stays idempotent when a mail client fires twice.
  get markUnsubscribed() { return db.prepare(`
    UPDATE mailing_list_subscriptions
    SET status = 'unsubscribed', status_updated_at = ?,
        updated_at = ?, updated_by = 'one_click_unsubscribe', version = version + 1
    WHERE mailing_list_id = ? AND member_id = ? AND status = 'subscribed'
  `); },

  // A list's own row, read by the send path to learn where the list's
  // recipients come from before it resolves them.
  get getListBySlug() { return db.prepare(`
    SELECT slug, status, recipient_source, source_group_id, from_identity,
           is_member_manageable
    FROM mailing_lists WHERE slug = ?
  `); },

  // Active-subscriber lookup for the subscription-backed audience. Returns one
  // row per member with status='subscribed' on the given list, where the list
  // itself is active, the member's email is verified, and the address is
  // deliverable (email_status='ok'): enqueueing to an SES-bounced/complained
  // address only produces repeated rejections, dead-letter rows, and alarm
  // noise. Every audience resolver applies the same three filters, so no
  // audience can reach a mailbox another one would have skipped.
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

  // The event-participant audience: the members holding a confirmed
  // registration for one event, with the same verified-and-deliverable filters
  // the subscription resolver applies, so no audience reaches a mailbox another
  // one would have skipped. Pending and canceled registrations are not
  // participants. An event send is keyed to its event rather than to a list,
  // which is the same shape the broadcast archive already requires of it.
  get listConfirmedParticipantRecipients() { return db.prepare(`
    SELECT
      r.member_id,
      m.login_email
    FROM registrations AS r
    INNER JOIN members_active AS m ON m.id = r.member_id
    WHERE r.event_id = ?
      AND r.status = 'confirmed'
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

  // The lists a member may manage for themselves, each carrying whatever status
  // that member currently holds on it. Archived lists and group-backed lists are
  // excluded: an archived list is no longer offered, and being in the group is
  // what puts a member on a group-backed one, so there is no choice to show.
  // The LEFT JOIN keeps a list the member has no row for at all, which is every
  // list until they act on it.
  get listMemberManageableForMember() { return db.prepare(`
    SELECT
      ml.slug, ml.name, ml.description,
      s.status AS subscription_status,
      s.status_updated_at
    FROM mailing_lists AS ml
    LEFT JOIN mailing_list_subscriptions AS s
      ON s.mailing_list_id = ml.slug AND s.member_id = ?
    WHERE ml.status = 'active'
      AND ml.is_member_manageable = 1
      AND ml.recipient_source = 'subscription'
    ORDER BY ml.name
  `); },

  // The member subscribing themselves. A row an administrator suppressed is left
  // alone: that state is an operational decision made about this address, and a
  // member clearing it from their own screen would overturn it silently. A row
  // already subscribed is left alone too, so re-choosing the state it already
  // holds reports zero changes rather than a write the member did not make.
  get memberSubscribe() { return db.prepare(`
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
    WHERE mailing_list_subscriptions.status NOT IN ('suppressed', 'subscribed')
  `); },

  // The member withdrawing themselves, leaving a suppressed row as it stands for
  // the same reason, and an already-withdrawn row for the no-op reason. A member
  // with no row for the list is already not on it, so the update matches nothing
  // and the action is a no-op there too.
  get memberUnsubscribe() { return db.prepare(`
    UPDATE mailing_list_subscriptions
    SET status = 'unsubscribed', status_updated_at = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE mailing_list_id = ? AND member_id = ?
      AND status NOT IN ('suppressed', 'unsubscribed')
  `); },
};

export interface MailingListRow {
  slug: string;
  updated_at: string;
  name: string;
  description: string;
  status: string;
  is_member_manageable: number;
  from_identity: string | null;
  rules_text: string | null;
  subject_prefix: string;
  restricted_sending: number;
  recipient_source: string;
  source_group_id: string | null;
}

/** A list row carrying its subscriber counts, one column per subscription status. */
export interface MailingListWithCountsRow extends MailingListRow {
  subscribed_count: number;
  unsubscribed_count: number;
  bounced_count: number;
  complained_count: number;
  suppressed_count: number;
  total_count: number;
}

// Administration of the lists themselves, as distinct from the subscription
// rows above and from the send path that reads them. Every statement here backs
// an admin surface; the send path never uses them.
export const mailingLists = {
  // The admin index. One row per list with its subscriber counts by status, so
  // the page needs a single statement rather than a count query per list. The
  // LEFT JOIN keeps a list with no subscribers at all, which every newly
  // created list is.
  get listWithCounts() { return db.prepare(`
    SELECT
      ml.slug, ml.updated_at, ml.name, ml.description, ml.status,
      ml.is_member_manageable, ml.from_identity, ml.rules_text,
      ml.subject_prefix, ml.restricted_sending,
      ml.recipient_source, ml.source_group_id,
      COALESCE(SUM(CASE WHEN s.status = 'subscribed'   THEN 1 ELSE 0 END), 0) AS subscribed_count,
      COALESCE(SUM(CASE WHEN s.status = 'unsubscribed' THEN 1 ELSE 0 END), 0) AS unsubscribed_count,
      COALESCE(SUM(CASE WHEN s.status = 'bounced'      THEN 1 ELSE 0 END), 0) AS bounced_count,
      COALESCE(SUM(CASE WHEN s.status = 'complained'   THEN 1 ELSE 0 END), 0) AS complained_count,
      COALESCE(SUM(CASE WHEN s.status = 'suppressed'   THEN 1 ELSE 0 END), 0) AS suppressed_count,
      COUNT(s.id) AS total_count
    FROM mailing_lists AS ml
    LEFT JOIN mailing_list_subscriptions AS s ON s.mailing_list_id = ml.slug
    GROUP BY ml.slug
    ORDER BY ml.status, ml.name
  `); },

  // One list with the same counts, for its detail page.
  get getWithCounts() { return db.prepare(`
    SELECT
      ml.slug, ml.updated_at, ml.name, ml.description, ml.status,
      ml.is_member_manageable, ml.from_identity, ml.rules_text,
      ml.subject_prefix, ml.restricted_sending,
      ml.recipient_source, ml.source_group_id,
      COALESCE(SUM(CASE WHEN s.status = 'subscribed'   THEN 1 ELSE 0 END), 0) AS subscribed_count,
      COALESCE(SUM(CASE WHEN s.status = 'unsubscribed' THEN 1 ELSE 0 END), 0) AS unsubscribed_count,
      COALESCE(SUM(CASE WHEN s.status = 'bounced'      THEN 1 ELSE 0 END), 0) AS bounced_count,
      COALESCE(SUM(CASE WHEN s.status = 'complained'   THEN 1 ELSE 0 END), 0) AS complained_count,
      COALESCE(SUM(CASE WHEN s.status = 'suppressed'   THEN 1 ELSE 0 END), 0) AS suppressed_count,
      COUNT(s.id) AS total_count
    FROM mailing_lists AS ml
    LEFT JOIN mailing_list_subscriptions AS s ON s.mailing_list_id = ml.slug
    WHERE ml.slug = ?
    GROUP BY ml.slug
  `); },

  // The bare row, for the edit form and for the existence checks the write
  // paths make before they touch anything.
  get getBySlug() { return db.prepare(`
    SELECT slug, updated_at, name, description, status,
           is_member_manageable, from_identity, rules_text,
           subject_prefix, restricted_sending,
           recipient_source, source_group_id
    FROM mailing_lists WHERE slug = ?
  `); },

  // Administrator-created lists are subscription-backed. A group-backed list is
  // created by the groups build when an administrator enables a group's mail,
  // never from the list surfaces, which is why this statement names no group.
  get insertList() { return db.prepare(`
    INSERT INTO mailing_lists (
      slug, updated_at, name, description, status,
      is_member_manageable, from_identity, subject_prefix, restricted_sending,
      recipient_source, source_group_id
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 0, 'subscription', NULL)
  `); },

  // The editable fields. slug is the stable reference every subscription,
  // outbox row and archive row holds, so it is never rewritten; status moves
  // only through the archive statement below.
  get updateList() { return db.prepare(`
    UPDATE mailing_lists
    SET name = ?, description = ?, is_member_manageable = ?,
        from_identity = ?, subject_prefix = ?, restricted_sending = ?,
        updated_at = ?
    WHERE slug = ?
  `); },

  // Archiving keeps every subscription and every historical send: the list
  // stops appearing in the member subscription screen and in new send flows,
  // and nothing else about it changes. Guarded on the current status so a
  // second archive of the same list reports zero changes rather than writing a
  // second audit row for a state that did not move.
  get archiveList() { return db.prepare(`
    UPDATE mailing_lists
    SET status = 'archived', updated_at = ?
    WHERE slug = ? AND status = 'active'
  `); },

  // The exceptional manual adjustment an administrator makes on a member's
  // behalf, most often to release an address the provider marked bounced once
  // the member has fixed it. Distinct from the member's own writes and from the
  // provider feedback flips, and stamped with the acting administrator so the
  // row itself says an administrator moved it.
  get adminSetSubscriptionStatus() { return db.prepare(`
    UPDATE mailing_list_subscriptions
    SET status = ?, status_updated_at = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE mailing_list_id = ? AND member_id = ?
  `); },
};

export interface EmailArchiveRow {
  id: string;
  created_at: string;
  archive_type: string;
  mailing_list_id: string | null;
  event_id: string | null;
  sender_member_id: string | null;
  from_identity: string | null;
  subject: string;
  body_text: string;
  sent_at: string;
  recipient_count: number;
}

// The record of what the platform said in IFPA's name: one row per broadcast,
// naming no recipient. The per-recipient copies live in outbox_emails and age
// out on their own retention window; these rows are kept indefinitely.
export const emailArchives = {
  get insertArchive() { return db.prepare(`
    INSERT INTO email_archives (
      id, created_at, created_by, updated_at, updated_by, version,
      archive_type, mailing_list_id, event_id,
      sender_member_id, from_identity, subject, body_text, sent_at, recipient_count
    ) VALUES (?, ?, ?, ?, ?, 1,
              ?, ?, NULL,
              ?, ?, ?, ?, ?, ?)
  `); },

  // Newest first, which is the order an administrator reads a send history in.
  // The list name is joined in so the index reads as words rather than slugs.
  get listRecent() { return db.prepare(`
    SELECT
      a.id, a.created_at, a.archive_type, a.mailing_list_id, a.event_id,
      a.sender_member_id, a.from_identity, a.subject, a.body_text,
      a.sent_at, a.recipient_count,
      ml.name AS mailing_list_name
    FROM email_archives AS a
    LEFT JOIN mailing_lists AS ml ON ml.slug = a.mailing_list_id
    ORDER BY a.sent_at DESC, a.id DESC
    LIMIT ?
  `); },

  get getById() { return db.prepare(`
    SELECT
      a.id, a.created_at, a.archive_type, a.mailing_list_id, a.event_id,
      a.sender_member_id, a.from_identity, a.subject, a.body_text,
      a.sent_at, a.recipient_count,
      ml.name AS mailing_list_name
    FROM email_archives AS a
    LEFT JOIN mailing_lists AS ml ON ml.slug = a.mailing_list_id
    WHERE a.id = ?
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

  // Administrators who can no longer serve while still holding the role: the
  // account is gone (soft-deleted), the person is gone (deceased), or the
  // sign-in has lapsed past the caller's cutoff. Reads members_all rather than
  // members_active precisely because a soft-deleted administrator is one of the
  // cases being looked for, and members_active would hide it. An administrator
  // who has never signed in is measured from account creation, so a fresh grant
  // is not reported the day it is made.
  get listLostAdministrators() { return db.prepare(`
    SELECT id, deleted_at, is_deceased, last_login_at, created_at
    FROM members_all
    WHERE is_admin = 1
      AND (
        deleted_at IS NOT NULL
        OR is_deceased = 1
        OR COALESCE(last_login_at, created_at) < ?
      )
    ORDER BY id
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
  // type: contact requests and link-help requests (member-authored identity
  // statements) both carry member personal data, and over-scrubbing at erasure
  // is the safe direction.
  get scrubTextForMember() { return db.prepare(`
    UPDATE work_queue_items
    SET reason_text = '(removed on account erasure)', detail_text = NULL,
        updated_at = ?, updated_by = 'operations_purge', version = version + 1
    WHERE entity_id = ? AND entity_type = 'member'
  `); },

  // Replace the structured payload on an open item. A member who re-files a
  // link-help request collapses onto the row they already have, so the row must
  // take the newer statement: the payload also carries the records a dispute is
  // about, which later bounds an administrator's revert, and a discarded update
  // leaves that binding describing a conflict set that has moved on.
  get updateOpenPayload() { return db.prepare(`
    UPDATE work_queue_items
    SET reason_text = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND status = 'open'
  `); },

  // De-dupe probe for the batch auto-link pass: skip emitting a second open
  // item for the same (task_type, entity) pair when one is already queued.
  get findOpenByEntity() { return db.prepare(`
    SELECT id FROM work_queue_items
    WHERE task_type = ? AND entity_type = ? AND entity_id = ? AND status = 'open'
    LIMIT 1
  `); },

  // Latest item of a task type for one member, with that member's last sign-in,
  // for callers whose re-raise guard must survive the item being closed. An
  // open item means the matter is already queued; a closed one means an
  // administrator settled it, and settling must stick even while the condition
  // that triggered it persists. The sign-in timestamp is what distinguishes a
  // settled matter from a genuinely new one: a member who signed in after the
  // item was closed and then met the condition again has lapsed afresh. Joins
  // members_all rather than members_active because a soft-deleted member is one
  // of the states a caller may be alerting on, and the join is LEFT so an item
  // whose member row is gone still reports the item.
  get findLatestMemberItemWithLastLogin() { return db.prepare(`
    SELECT wq.status, wq.resolved_at, m.last_login_at
    FROM work_queue_items AS wq
    LEFT JOIN members_all AS m ON m.id = wq.entity_id
    WHERE wq.task_type = ? AND wq.entity_type = 'member' AND wq.entity_id = ?
    ORDER BY wq.opened_at DESC
    LIMIT 1
  `); },

  // Member-side rate limiter for contact-IFPA-admin requests: caps the number
  // of open items a single member can hold open at a time, across task_types.
  get countOpenForMember() { return db.prepare(`
    SELECT COUNT(*) AS c FROM work_queue_items
    WHERE entity_type = 'member' AND entity_id = ? AND status = 'open' AND task_type = ?
  `); },

  // Admin-side listing of open items, ordered by category then opened_at. The
  // LEFT JOIN resolves the claiming admin's display name for the queue view.
  get listOpenForAdmin() { return db.prepare(`
    SELECT wq.id, wq.created_at, wq.opened_at, wq.queue_category, wq.task_type,
           wq.entity_type, wq.entity_id, wq.priority, wq.reason_text, wq.detail_text,
           wq.claimed_by_member_id, wq.claimed_at, cm.display_name AS claimed_by_name
    FROM work_queue_items AS wq
    LEFT JOIN members AS cm ON cm.id = wq.claimed_by_member_id
    WHERE wq.status = 'open' AND wq.parked_at IS NULL
    ORDER BY wq.queue_category, wq.opened_at
  `); },

  // The parked half of the open queue: items an administrator set aside, newest
  // park first, with who parked each and why. Listed apart from the working
  // queue so a parked item is visible rather than lost, and never mixed into the
  // counts an administrator reads as work waiting on them.
  get listParkedForAdmin() { return db.prepare(`
    SELECT wq.id, wq.opened_at, wq.queue_category, wq.task_type,
           wq.entity_type, wq.entity_id, wq.reason_text, wq.detail_text,
           wq.parked_at, wq.park_reason, pm.display_name AS parked_by_name
    FROM work_queue_items AS wq
    LEFT JOIN members AS pm ON pm.id = wq.parked_by_member_id
    WHERE wq.status = 'open' AND wq.parked_at IS NOT NULL
    ORDER BY wq.parked_at DESC
  `); },

  // Park an open, unparked item. Parking twice is a no-op rather than a second
  // park under a new name, so the reason on the row is the one that took it out
  // of the queue. The claim is released with it: the item is nobody's while it
  // waits, and whoever takes it back picks it up fresh.
  // Params: (nowIso, adminId, reason, nowIso, adminId, itemId).
  get parkItem() { return db.prepare(`
    UPDATE work_queue_items
    SET parked_at = ?, parked_by_member_id = ?, park_reason = ?,
        claimed_by_member_id = NULL, claimed_at = NULL,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND status = 'open' AND parked_at IS NULL
  `); },

  // Return a parked item to the working queue, whether an administrator asked
  // for it or the member's answer arrived. Clearing the reason with it keeps the
  // row from carrying a park that no longer holds.
  // Params: (nowIso, actorId, itemId).
  get unparkItem() { return db.prepare(`
    UPDATE work_queue_items
    SET parked_at = NULL, parked_by_member_id = NULL, park_reason = NULL,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND status = 'open' AND parked_at IS NOT NULL
  `); },

  // Claim an open item: stamp the claiming admin. A claim is a coordination
  // signal with a shelf life, not a lock, so an item whose claim has gone stale
  // is claimable again; otherwise one admin claiming and walking away would
  // silence the item for everyone forever. Two admins claiming at once still
  // resolve to exactly one winner, because the loser changes zero rows.
  // Params: (adminId, nowIso, nowIso, adminId, itemId, staleCutoffIso).
  get claimItem() { return db.prepare(`
    UPDATE work_queue_items
    SET claimed_by_member_id = ?, claimed_at = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND status = 'open'
      AND (claimed_by_member_id IS NULL OR claimed_at < ?)
  `); },

  // All open items with their claim state, for building each administrator's
  // digest. The service filters out the urgent task types (they are emailed per
  // event) and, per administrator, the items another administrator holds a live
  // claim on; `claimed_at` is returned so a stale claim stops suppressing.
  get listOpenForDigest() { return db.prepare(`
    SELECT id, queue_category, task_type, entity_id, opened_at, claimed_by_member_id, claimed_at
    FROM work_queue_items
    WHERE status = 'open' AND parked_at IS NULL
    ORDER BY opened_at
  `); },

  // Open items older than the stale cutoff and not under a live claim, for the
  // one-time escalation email. An item whose claim has itself gone stale is
  // eligible again, so a forgotten claim cannot suppress escalation forever.
  // The service filters out urgent task types and relies on the per-item outbox
  // idempotency key so each item escalates only once.
  // Params: (openedBeforeIso, claimStaleBeforeIso).
  // An item nobody has picked up and nobody has closed, for the escalation that
  // tells administrators a matter is being neglected.
  //
  // An item waiting on a member's answer is not neglected, and reporting it that
  // way sends an alert about work no administrator can advance while the card on
  // screen says the opposite. The wait is derived from the message row rather
  // than stored as a status, because a fourth status would hide the item from
  // the de-duplication probe and from both close paths.
  get listStaleForEscalation() { return db.prepare(`
    SELECT w.id, w.task_type, w.entity_id, w.opened_at
    FROM work_queue_items w
    WHERE w.status = 'open' AND w.parked_at IS NULL AND w.opened_at < ?
      AND (w.claimed_by_member_id IS NULL OR w.claimed_at < ?)
      AND NOT EXISTS (
        SELECT 1 FROM member_messages m
        WHERE m.work_queue_item_id = w.id AND m.status = 'sent'
      )
    ORDER BY w.opened_at
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

  // Close an internal-review item (e.g. a low-confidence auto-link match) that
  // has no member reply and carries no decision label. It lands in 'dismissed' rather
  // than 'resolved' because nothing was acted on: an administrator read the flag
  // and ruled it settled, which is a different outcome from a request that was
  // carried out, and the two stay distinguishable afterwards.
  //
  // The admin's dismissal note lands in reason_text, which erasure scrubs,
  // rather than in the append-only ledger: the note is free text written about a
  // member, and the ledger is exempt from the PII purge.
  get closeReview() { return db.prepare(`
    UPDATE work_queue_items
    SET status = 'dismissed',
        resolved_at = ?,
        resolved_by_member_id = ?,
        reason_text = ?,
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE id = ? AND status = 'open'
  `); },

  // Look up a single queue row by id (for resolve-flow validation).
  get findById() { return db.prepare(`
    SELECT id, queue_category, task_type, entity_type, entity_id, status,
           reason_text, opened_at, parked_at
    FROM work_queue_items
    WHERE id = ?
  `); },

  // Close the open queue twin of a domain record that is resolved on its own
  // page. A reconciliation discrepancy has two representations, the issue row
  // and this queue card; resolving the issue closes the card in the same
  // transaction so the two never drift apart. Addressed by entity rather than
  // by id because the resolver holds the domain id, not the queue id.
  get resolveOpenByEntity() { return db.prepare(`
    UPDATE work_queue_items
    SET status = 'resolved',
        resolved_at = ?,
        resolved_by_member_id = ?,
        decision_label = ?,
        reason_text = ?,
        updated_at = ?,
        updated_by = ?,
        version = version + 1
    WHERE task_type = ? AND entity_type = ? AND entity_id = ? AND status = 'open'
  `); },
};

// ── memberMessages ──────────────────────────────────────────────────────────
//
// An administrator's direct question to one member and the member's answer,
// always anchored to the work-queue item that raised it. Text columns hold
// owner-and-admin private content and are cleared by both erasure shapes.
export const memberMessages = {
  // Who, if anyone, a question on this item could be put to. A question needs a
  // living recipient who can open the page it is read on, so the deceased are
  // excluded here rather than relying on the cleanup pass: that pass runs daily
  // and only after a grace period, so a member marked deceased keeps an account
  // and a working mailbox for days, and nothing else would stop a question and
  // a nudge email reaching them.
  get findQuestionRecipient() { return db.prepare(`
    SELECT id, is_deceased
    FROM members_active
    WHERE id = ? AND personal_data_purged_at IS NULL
  `); },
  get insert() { return db.prepare(`
    INSERT INTO member_messages (
      id, created_at, created_by, updated_at, updated_by, version,
      recipient_member_id, sender_admin_member_id, work_queue_item_id,
      subject, body_text, expected_answer_kind, status, sent_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'sent', ?)
  `); },

  // The member's own outstanding questions, newest first. Body and note come
  // back with the row: this is the owner-only surface, the one place the
  // private text is allowed to be read.
  get listUnansweredForMember() { return db.prepare(`
    SELECT id, subject, body_text, expected_answer_kind, sent_at
    FROM member_messages
    WHERE recipient_member_id = ? AND status = 'sent'
    ORDER BY sent_at DESC, id
  `); },

  get countUnansweredForMember() { return db.prepare(`
    SELECT COUNT(*) AS c FROM member_messages
    WHERE recipient_member_id = ? AND status = 'sent'
  `); },

  // Ownership is part of the lookup rather than a check afterwards, so a
  // message id belonging to someone else simply does not resolve.
  get findUnansweredForMember() { return db.prepare(`
    SELECT id, recipient_member_id, work_queue_item_id, expected_answer_kind
    FROM member_messages
    WHERE id = ? AND recipient_member_id = ? AND status = 'sent'
  `); },

  // Guarded on the current status so two submitted answers cannot both land;
  // the second reports zero changes and is refused.
  get recordAnswer() { return db.prepare(`
    UPDATE member_messages
    SET status = 'answered', outcome = ?, note_text = ?, answered_at = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND status = 'sent'
  `); },

  // What the administrator sees on the queue card: whether a question is
  // outstanding, and how the answered one came back.
  get listForQueueItem() { return db.prepare(`
    SELECT id, subject, body_text, expected_answer_kind, status, outcome,
           note_text, sent_at, answered_at
    FROM member_messages
    WHERE work_queue_item_id = ?
    ORDER BY sent_at, id
  `); },

  get findUnansweredForQueueItem() { return db.prepare(`
    SELECT id, sent_at FROM member_messages
    WHERE work_queue_item_id = ? AND status = 'sent'
    LIMIT 1
  `); },

  // Both erasure shapes clear every free-text column on every message addressed
  // to the member, answered or not, while the rows stay so the queue item's
  // trail keeps its shape.
  get scrubTextForMember() { return db.prepare(`
    UPDATE member_messages
    SET subject = NULL, body_text = NULL, note_text = NULL,
        updated_at = ?, updated_by = 'operations_purge', version = version + 1
    WHERE recipient_member_id = ?
  `); },
};

// Marking a member deceased, and the records that have to follow it. The flag
// itself is affirmative-only: its presence records a person recognized as
// deceased, its absence asserts nothing.
export const deceasedMarking = {
  get markMember() { return db.prepare(`
    UPDATE members
    SET is_deceased   = 1,
        deceased_at   = ?,
        deceased_note = ?,
        updated_at    = ?,
        updated_by    = ?,
        version       = version + 1
    WHERE id = ? AND is_deceased = 0
  `); },

  // Reversal inside the grace period, for a marking made in error. Guarded to
  // rows still carrying the flag, so a repeat is a no-op rather than a second
  // write.
  get revertMember() { return db.prepare(`
    UPDATE members
    SET is_deceased   = 0,
        deceased_at   = NULL,
        deceased_note = NULL,
        updated_at    = ?,
        updated_by    = ?,
        version       = version + 1
    WHERE id = ? AND is_deceased = 1
  `); },

  get setHistoricalPersonDeceased() { return db.prepare(`
    UPDATE historical_persons SET is_deceased = ? WHERE person_id = ?
  `); },

  // The record, plus whoever holds it. A soft-deleted claimant counts: their
  // account can still be restored, so the record is not free to be marked
  // independently of them.
  get findHistoricalPerson() { return db.prepare(`
    SELECT hp.person_id, hp.person_name, hp.is_deceased,
           m.id AS claimed_by_member_id, m.display_name AS claimed_by_display_name
    FROM historical_persons AS hp
    LEFT JOIN members AS m ON m.historical_person_id = hp.person_id
    WHERE hp.person_id = ?
  `); },

  // Historical records an administrator can mark, found by exact id or by part
  // of the name. The claimed-by column tells the administrator which records
  // are already somebody's account, because those are marked through the member
  // record instead and the flag would otherwise be set in two places. A
  // soft-deleted claimant still counts as holding the record: their account can
  // be restored, and the record is not free to be marked independently of them.
  // Params: (personId, escapedNameFragment, limit).
  get searchHistoricalPersons() { return db.prepare(`
    SELECT hp.person_id, hp.person_name, hp.country, hp.first_year, hp.last_year,
           hp.is_deceased,
           m.id AS claimed_by_member_id, m.display_name AS claimed_by_display_name
    FROM historical_persons AS hp
    LEFT JOIN members AS m
      ON m.historical_person_id = hp.person_id
    WHERE hp.person_id = ?
       OR LOWER(hp.person_name) LIKE '%' || ? || '%' ESCAPE '\\'
    ORDER BY hp.person_name COLLATE NOCASE
    LIMIT ?
  `); },

  // Withdraw the member from events that have not happened yet. A completed
  // event keeps its registration, because it is part of the historical record
  // this marking exists to preserve.
  get cancelUpcomingRegistrations() { return db.prepare(`
    UPDATE registrations
    SET status        = 'canceled',
        cancel_reason = ?,
        canceled_at   = ?,
        updated_at    = ?,
        updated_by    = ?,
        version       = version + 1
    WHERE member_id = ?
      AND status IN ('pending', 'confirmed')
      AND event_id IN (SELECT id FROM events WHERE start_date >= ?)
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
  // forever. The next run of that same job sweeps its stale rows older than the
  // threshold and marks them 'aborted', so admin tooling sees an accurate
  // picture rather than a job that appears to be running still.
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

  // Most recent successful finish time for a job name, so an interval-gated
  // scheduled pass (e.g. the admin work-queue digest) can skip a tick when the
  // configured cadence has not yet elapsed since its last successful run.
  get lastSuccessAt() { return db.prepare(`
    SELECT MAX(finished_at) AS last_success
    FROM system_job_runs
    WHERE job_name = ? AND status = 'succeeded'
  `); },

  // One row per job the platform has ever run, for the admin health view. The
  // last-success time is deliberately unwindowed: a job that has not run at all
  // during the window is the most alarming case there is, and a windowed query
  // would report it as absent rather than as stale. The two counts are windowed,
  // because "failed twice today" and "failed twice last year" are different
  // facts. A reaped run counts as a failure alongside an ordinary one, matching
  // how the run-history table badges it: two tables on one page must not
  // disagree about whether the same run went wrong. The first two parameters
  // are the window start, bound twice.
  get summarizeByJob() { return db.prepare(`
    SELECT r.job_name,
           MAX(r.started_at) AS last_started_at,
           MAX(CASE WHEN r.status = 'succeeded' THEN r.finished_at END) AS last_success_at,
           SUM(CASE WHEN r.started_at >= ? THEN 1 ELSE 0 END) AS runs_in_window,
           SUM(CASE WHEN r.started_at >= ? AND r.status IN ('failed','aborted') THEN 1 ELSE 0 END) AS failures_in_window,
           (SELECT s.status FROM system_job_runs AS s
             WHERE s.job_name = r.job_name
             ORDER BY s.started_at DESC LIMIT 1) AS last_status
    FROM system_job_runs AS r
    GROUP BY r.job_name
    ORDER BY r.job_name
  `); },

  // Newest runs across every job, bounded by the caller, for the run-history
  // table beneath the per-job summary.
  get listRecentRuns() { return db.prepare(`
    SELECT id, job_name, started_at, finished_at, status, last_error
    FROM system_job_runs
    ORDER BY started_at DESC
    LIMIT ?
  `); },

  // One job's runs newest first, with the result each returned, for a surface
  // that reads the result back as the record of that run: the payment
  // reconciliation's daily report lives in details_json and nowhere else.
  get listRunsByJob() { return db.prepare(`
    SELECT id, job_name, started_at, finished_at, status, details_json, last_error
    FROM system_job_runs
    WHERE job_name = ?
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `); },

  get countRunsByJob() { return db.prepare(`
    SELECT COUNT(*) AS c FROM system_job_runs WHERE job_name = ?
  `); },

  get findRunById() { return db.prepare(`
    SELECT id, job_name, started_at, finished_at, status, details_json, last_error
    FROM system_job_runs
    WHERE id = ?
  `); },

  // The most recent successful run and its result, so a later reader can say
  // what the last pass actually compared rather than only when it ran.
  get lastSucceededRun() { return db.prepare(`
    SELECT id, started_at, finished_at, details_json
    FROM system_job_runs
    WHERE job_name = ? AND status = 'succeeded'
    ORDER BY finished_at DESC
    LIMIT 1
  `); },
};

export const systemAlarms = {
  // Idempotency primitive for inbound alarm notifications, matching ses_events:
  // PRIMARY KEY (message_id) makes this a no-op on redelivery, and the ingest
  // service claims first inside its transaction and short-circuits on changes=0.
  get claimMessageOrIgnore() { return db.prepare(`
    INSERT OR IGNORE INTO sns_alarm_events
      (message_id, created_at, alarm_name, processed_at)
    VALUES (?, ?, ?, ?)
  `); },

  get insertAlarm() { return db.prepare(`
    INSERT INTO system_alarm_events (
      id, created_at, created_by, updated_at, updated_by, version,
      alarm_type, severity, raised_at, status, details_json
    ) VALUES (?, ?, 'system', ?, 'system', 1,
              ?, ?, ?, 'active', ?)
  `); },

  // The alarm a clear or an acknowledgment applies to: the newest row for that
  // name that has not been cleared. An acknowledged row is still eligible,
  // because acknowledging records that an admin is handling the incident and
  // the condition itself is what clears it.
  //
  // Ordered on the platform's own created_at, never on the raise time, which is
  // taken from the notification payload: a future-dated raise would otherwise
  // sort above every later row and absorb the clears meant for them.
  get findLatestUncleared() { return db.prepare(`
    SELECT id, alarm_type, severity, raised_at, status
    FROM system_alarm_events
    WHERE alarm_type = ? AND cleared_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `); },

  // Refresh the uncleared alarm of a name that fires again before it clears.
  // The monitoring source is a state machine with one state per alarm, so the
  // platform holds at most one uncleared row per name: inserting a second leaves
  // the earlier one active forever, because a return to normal clears one row
  // and no further notification is ever sent for the other.
  get refreshUncleared() { return db.prepare(`
    UPDATE system_alarm_events
    SET severity     = ?,
        raised_at    = ?,
        details_json = ?,
        updated_at   = ?,
        updated_by   = 'system',
        version      = version + 1
    WHERE id = ?
  `); },

  get markCleared() { return db.prepare(`
    UPDATE system_alarm_events
    SET status     = 'cleared',
        cleared_at = ?,
        updated_at = ?,
        updated_by = 'system',
        version    = version + 1
    WHERE id = ?
  `); },

  // Acknowledgment is one-shot: the WHERE clause admits only a row still in the
  // active state, so a second submission of the same form reports no change
  // instead of overwriting the first admin's name and note.
  get markAcknowledged() { return db.prepare(`
    UPDATE system_alarm_events
    SET status                    = 'acknowledged',
        acknowledged_by_member_id = ?,
        acknowledged_at           = ?,
        acknowledgment_note       = ?,
        updated_at                = ?,
        updated_by                = ?,
        version                   = version + 1
    WHERE id = ? AND status = 'active'
  `); },

  get findById() { return db.prepare(`
    SELECT id, alarm_type, severity, raised_at, cleared_at, status,
           acknowledged_by_member_id, acknowledged_at, acknowledgment_note, details_json
    FROM system_alarm_events
    WHERE id = ?
  `); },

  // Newest alarms first, bounded by the caller, joined to the acknowledging
  // admin so the page can name them without a second read.
  get listRecent() { return db.prepare(`
    SELECT a.id, a.alarm_type, a.severity, a.raised_at, a.cleared_at, a.status,
           a.acknowledged_at, a.acknowledgment_note, a.details_json,
           m.display_name AS acknowledged_by_name,
           m.slug         AS acknowledged_by_slug
    FROM system_alarm_events AS a
    LEFT JOIN members_all AS m ON m.id = a.acknowledged_by_member_id
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `); },

  // Total recorded alarms, so the page can say whether more exist beyond the
  // one it is showing and offer a way to reach them.
  get countAll() { return db.prepare(`
    SELECT COUNT(*) AS n FROM system_alarm_events
  `); },

  // The dashboard badge counts what nobody has picked up yet; an acknowledged
  // alarm is someone's open incident rather than an unattended one.
  get countActiveUnacknowledged() { return db.prepare(`
    SELECT COUNT(*) AS n FROM system_alarm_events WHERE status = 'active'
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
  slug: string | null;
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
  // The roster read. Joins members so the service can apply the email opt-in
  // redaction (US A_View_Official_Roster_Reports: "email (opt-in only)") at
  // the service layer instead of in SQL; the raw address never leaves the
  // service, which returns the redacted field.
  get selectAll() { return db.prepare(`
    SELECT r.member_id, r.display_name, r.city, r.region, r.country,
           r.tier_status, r.underlying_tier_status,
           r.is_active_player, r.active_player_expires_at,
           r.is_hof, r.is_bap, r.is_board,
           m.slug, m.login_email, m.email_visibility
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
};

export const clubCleanupResolutions = {
  get upsert() { return db.prepare(`
    INSERT INTO club_cleanup_resolutions
      (id, created_at, created_by, club_id, predicate_name, resolution,
       parked_by_member_id, reason_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(club_id, predicate_name)
    DO UPDATE SET resolution = excluded.resolution,
                  parked_by_member_id = excluded.parked_by_member_id,
                  reason_text = excluded.reason_text,
                  created_at = excluded.created_at,
                  created_by = excluded.created_by
  `); },

  get findByClubAndPredicate() { return db.prepare(`
    SELECT id, resolution
    FROM club_cleanup_resolutions
    WHERE club_id = ? AND predicate_name = ?
  `); },

  // Every resolution row, parked ones included: the service decides what a row
  // means. A parked row keeps the item out of the working queue and into the
  // parked listing, and created_at is what lets it come back on its own, since
  // the service compares the park's moment against the newest evidence for that
  // club. The reason and the parker's name ride along so the parked listing can
  // say who parked it and why; before this they were written and never read.
  get listAll() { return db.prepare(`
    SELECT r.club_id, r.predicate_name, r.resolution,
           r.created_at, r.reason_text,
           m.display_name AS parked_by_name
    FROM club_cleanup_resolutions AS r
    LEFT JOIN members AS m ON m.id = r.parked_by_member_id
  `); },
};

export const candidateCleanupResolutions = {
  get upsert() { return db.prepare(`
    INSERT INTO candidate_cleanup_resolutions
      (id, created_at, created_by, candidate_id, predicate_name, resolution,
       parked_by_member_id, reason_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(candidate_id, predicate_name)
    DO UPDATE SET resolution = excluded.resolution,
                  parked_by_member_id = excluded.parked_by_member_id,
                  reason_text = excluded.reason_text,
                  created_at = excluded.created_at,
                  created_by = excluded.created_by
  `); },

  // All candidate resolution rows, parked ones included: the service decides
  // what a row means. The admin display-name join is what lets a parked
  // candidate say who parked it.
  get listAll() { return db.prepare(`
    SELECT ccr.candidate_id, ccr.predicate_name, ccr.resolution,
           ccr.created_at, ccr.reason_text,
           m.display_name AS parked_by_name
    FROM candidate_cleanup_resolutions AS ccr
    LEFT JOIN members AS m ON m.id = ccr.parked_by_member_id
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
        SELECT 1 FROM club_leaders_current AS cl WHERE cl.club_id = c.id
      )
  `); },

  // Joins clubs_open so an archived club never enters this queue group: archiving
  // is a terminal decision, and demoting a lingering provisional row on an
  // archived club would move it back to inactive and undo that decision.
  get staleProvisionalLeaders() { return db.prepare(`
    SELECT cbl.id AS bootstrap_leader_id,
           cbl.club_id, c.name AS club_name,
           c.city, c.region, c.country, c.status AS club_status,
           cbl.role, cbl.created_at AS provisional_since
    FROM club_bootstrap_leaders AS cbl
    INNER JOIN clubs_open AS c ON c.id = cbl.club_id
    WHERE cbl.status = 'provisional'
    ORDER BY cbl.created_at ASC
  `); },
};

// One row per live club carrying every piece of evidence a viability verdict
// weighs, so the verdict is one read rather than a query per club per signal.
//
// Two families sit side by side here. Member votes and insight notes are what
// the crowd tells us, counted one vote per member with the latest answer
// winning. The rest is operational: what the club has actually done, drawn
// from live rows (current members, co-leaders, events it hosted, results those
// events produced, a verified website, a real description) and from the
// mirror-derived evidence the import pipeline computed. That second family
// matters because roughly a third of clubs can never receive a member vote at
// all, and until now none of it was read by anything.
//
// newest_evidence_at is what lets a parked item return without a timer: it is
// the most recent moment any member said anything about this club, so the
// service can compare it against when the club was parked.
// Both parameters are the same club id, or both null for the whole set. One
// club's verdict is asked for on its own often enough that scanning every club
// to find it is the wrong shape, and the alternative, a second copy of this
// whole query, would drift from it.
export const clubEvidence = {
  get listByClub() { return db.prepare(`
    SELECT
      c.id     AS club_id,
      c.name   AS club_name,
      c.city, c.region, c.country, c.status,
      c.updated_at AS club_updated_at,
      c.description IS NOT NULL AND length(trim(c.description)) > 0 AS has_description,
      c.external_url IS NOT NULL                                   AS has_external_url,
      c.external_url_validated_at IS NOT NULL                      AS url_verified,

      -- Leadership that can still act. A leader who has died or deleted their
      -- account is not evidence the club is alive, which is what this count
      -- feeds; the raw table would keep such a club out of every demotion
      -- verdict indefinitely.
      (SELECT COUNT(*) FROM club_leaders_current AS cl WHERE cl.club_id = c.id) AS leader_count,
      (SELECT COUNT(*) FROM member_club_affiliations AS mca
         WHERE mca.club_id = c.id AND mca.is_current = 1)               AS current_member_count,
      (SELECT COUNT(*) FROM events AS e WHERE e.host_club_id = c.id)    AS hosted_event_count,
      (SELECT COUNT(*) FROM event_result_entries AS ere
         INNER JOIN events AS e2 ON e2.id = ere.event_id
         WHERE e2.host_club_id = c.id)                                  AS result_entry_count,
      (SELECT COUNT(*) FROM legacy_person_club_affiliations AS lpca
         INNER JOIN legacy_club_candidates AS lcc2
                 ON lcc2.id = lpca.legacy_club_candidate_id
         WHERE lcc2.mapped_club_id = c.id
           AND lpca.resolution_status = 'pending')                      AS pending_residue_count,
      (SELECT COUNT(*) FROM club_insight_notes AS cin
         WHERE cin.club_id = c.id AND cin.note_text IS NOT NULL)        AS insight_note_count,

      -- A club can carry more than one legacy record, because the dump holds
      -- junk and half-empty records that resolve onto a real club alongside its
      -- good one. A junk record says nothing about the club it landed on, so
      -- the legacy facts are aggregated across every record that resolved here
      -- and the classification is exposed as one flag per kind rather than as a
      -- single value. Reading whichever record the query happened to meet first
      -- would let a throwaway row speak for a real club.
      COUNT(lcc.id)                                                    AS candidate_row_count,
      MAX(lcc.admin_promoted_at IS NOT NULL)                           AS any_admin_promoted,
      MAX(lcc.classification = 'pre_populate')                         AS any_pre_populate,
      MAX(lcc.classification = 'onboarding_visible')                   AS any_onboarding_visible,
      MAX(COALESCE(lcc.ever_hosted, 0))                                AS ever_hosted,
      MAX(lcc.last_hosted_year)                                        AS last_hosted_year,
      MAX(lcc.max_affiliated_member_last_year)                         AS max_affiliated_member_last_year,
      MAX(lcc.unique_member_names)                                     AS unique_member_names,
      MAX(lcc.linkable_member_count)                                   AS linkable_member_count,

      (SELECT COUNT(*) FROM (
         SELECT s.member_id, s.activity_signal,
                ROW_NUMBER() OVER (
                  PARTITION BY s.member_id ORDER BY s.created_at DESC, s.id DESC
                ) AS rn
         FROM club_viability_signals AS s
         WHERE s.club_id = c.id
       ) WHERE rn = 1 AND activity_signal = 'active')                   AS active_votes,
      (SELECT COUNT(*) FROM (
         SELECT s.member_id, s.activity_signal,
                ROW_NUMBER() OVER (
                  PARTITION BY s.member_id ORDER BY s.created_at DESC, s.id DESC
                ) AS rn
         FROM club_viability_signals AS s
         WHERE s.club_id = c.id
       ) WHERE rn = 1 AND activity_signal = 'not_active')               AS inactive_votes,

      (SELECT MAX(t.at) FROM (
         SELECT MAX(s.created_at) AS at FROM club_viability_signals AS s WHERE s.club_id = c.id
         UNION ALL
         SELECT MAX(n.created_at) AS at FROM club_insight_notes AS n
          WHERE n.club_id = c.id AND n.note_text IS NOT NULL
       ) AS t)                                                          AS newest_evidence_at

    FROM clubs AS c
    LEFT JOIN legacy_club_candidates AS lcc ON lcc.mapped_club_id = c.id
    WHERE c.status IN ('active', 'inactive')
      AND (? IS NULL OR c.id = ?)
    GROUP BY c.id
  `); },
};

// The candidate-side twin of clubEvidence's newest_evidence_at. An unpromoted
// candidate has no clubs row, so what a member said about it is keyed to the
// candidate itself rather than to a club. Only candidates something was said
// about appear here; an absent row means no evidence at all, which is the same
// answer as a null. A note whose text an account purge erased carries nothing a
// reviewer could act on, so it is not evidence and never returns a parked item
// to the working queue.
export const candidateEvidence = {
  get newestByCandidate() { return db.prepare(`
    SELECT source_entity_id AS candidate_id, MAX(at) AS newest_evidence_at
      FROM (
        SELECT s.source_entity_id, s.created_at AS at
          FROM club_viability_signals AS s
         WHERE s.source_entity_type = 'legacy_club_candidate'
           AND s.source_entity_id IS NOT NULL
        UNION ALL
        SELECT n.source_entity_id, n.created_at AS at
          FROM club_insight_notes AS n
         WHERE n.source_entity_type = 'legacy_club_candidate'
           AND n.source_entity_id IS NOT NULL
           AND n.note_text IS NOT NULL
      )
     GROUP BY source_entity_id
  `); },
};

// Member fields the payment flows read and write: the honor flags that supply a
// blank donation's default note, and the member-level Stripe Customer identity a
// recurring donation establishes.
export const memberBilling = {
  get findDonorProfile() { return db.prepare(`
    SELECT id, slug, login_email, real_name, is_hof, is_bap, stripe_customer_id
    FROM members_active
    WHERE id = ?
      AND is_deceased = 0
  `); },

  // Guarded on IS NULL so the first recurring donation establishes the member's
  // canonical Stripe Customer and a later subscription never re-points it.
  get setStripeCustomerIdIfNull() { return db.prepare(`
    UPDATE members
    SET stripe_customer_id = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND stripe_customer_id IS NULL
  `); },
};

export const payments = {
  get insertPayment() { return db.prepare(`
    INSERT INTO payments (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, payment_type, amount_cents, currency,
      status, descriptor, purchased_tier_status, metadata_json,
      stripe_checkout_session_id, stripe_payment_intent_id, provider_livemode
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `); },

  get updateStatus() { return db.prepare(`
    UPDATE payments
    SET status = ?, updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  // Status change plus the provider event's own creation time. Recording the
  // latter is what lets a later handler recognise an out-of-order delivery: the
  // provider does not guarantee order, so an older event can arrive after a
  // newer one and would otherwise be applied on top of it.
  get updateStatusWithEventTime() { return db.prepare(`
    UPDATE payments
    SET status = ?, last_stripe_event_created = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  get findById() { return db.prepare(`SELECT * FROM payments WHERE id = ?`); },

  get findBySessionId() { return db.prepare(`
    SELECT * FROM payments WHERE stripe_checkout_session_id = ?
  `); },

  get findByPaymentIntentId() { return db.prepare(`
    SELECT * FROM payments WHERE stripe_payment_intent_id = ?
  `); },

  get findByStripeInvoiceId() { return db.prepare(`
    SELECT * FROM payments WHERE stripe_invoice_id = ?
  `); },

  // A later payment event against an invoice already recorded restates the
  // amount paid so far rather than reporting a fresh charge, so the recorded
  // amount moves to the restated one. Status is untouched: the money already
  // settled and the transition ledger records status changes only.
  get updateChargeAmountWithEventTime() { return db.prepare(`
    UPDATE payments
    SET amount_cents = ?, last_stripe_event_created = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
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
  // date) for aggregate history and referential integrity. A donation
  // descriptor embeds the donor's free-text note, so it is reset to a neutral
  // constant; membership and event descriptors carry no personal data and stay
  // meaningful for aggregate history, so they are left intact.
  get anonymizeForCompliance() { return db.prepare(`
    UPDATE payments
    SET member_id                  = NULL,
        stripe_payment_intent_id   = NULL,
        stripe_checkout_session_id = NULL,
        stripe_customer_id         = NULL,
        stripe_subscription_id     = NULL,
        stripe_invoice_id          = NULL,
        recurring_subscription_id  = NULL,
        donation_note              = NULL,
        descriptor                 = CASE WHEN payment_type = 'donation' THEN 'Donation' ELSE descriptor END,
        metadata_json              = '{}',
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  get listByMember() { return db.prepare(`
    SELECT id, created_at, payment_type, amount_cents, currency,
           status, descriptor, purchased_tier_status,
           donation_note, recurring_subscription_id
    FROM payments
    WHERE member_id = ?
    ORDER BY created_at DESC
  `); },

  // Every payment created inside the reconciliation window, with the provider
  // references the comparison matches on. Anonymised rows are excluded: their
  // provider references were deliberately cleared at the retention boundary, so
  // they would otherwise read as a ledger mismatch forever.
  get listForReconciliation() { return db.prepare(`
    SELECT id, member_id, payment_type, amount_cents, currency, status,
           stripe_payment_intent_id, stripe_subscription_id, stripe_invoice_id,
           recurring_subscription_id, created_at, provider_livemode
    FROM payments
    WHERE created_at >= ? AND created_at < ?
      AND member_id IS NOT NULL
    ORDER BY created_at
  `); },

  // One-time donation. Distinct from insertPayment because a donation carries the
  // member's note and never carries a purchased tier.
  get insertDonationPayment() { return db.prepare(`
    INSERT INTO payments (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, payment_type, amount_cents, currency,
      status, descriptor, donation_note, metadata_json,
      stripe_checkout_session_id, stripe_payment_intent_id, provider_livemode
    ) VALUES (?, ?, ?, ?, ?, 1, ?, 'donation', ?, ?, 'pending', ?, ?, '{}', ?, ?, ?)
  `); },

  // One annual charge against a recurring donation subscription. Both the FK and
  // the raw Stripe subscription id are set, which is the app discipline the
  // payments table documents for subscription-linked rows. Inserted as pending so
  // the succeeded transition writes a status-transition row like every other
  // status change. The invoice id is a column rather than metadata because it is
  // the row's identity against the provider and is matched on by reconciliation.
  get insertSubscriptionChargePayment() { return db.prepare(`
    INSERT INTO payments (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, payment_type, amount_cents, currency,
      status, descriptor, donation_note, metadata_json,
      stripe_customer_id, stripe_subscription_id, stripe_invoice_id,
      recurring_subscription_id, provider_livemode
    ) VALUES (?, ?, ?, ?, ?, 1, ?, 'donation', ?, ?, 'pending', ?, ?, '{}', ?, ?, ?, ?, ?)
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

  // Variant for a subscription-linked charge, which correlates on the invoice and
  // subscription ids rather than a payment intent.
  get insertSubscriptionTransition() { return db.prepare(`
    INSERT INTO payment_status_transitions (
      id, created_at, created_by,
      payment_id, stripe_event_id, stripe_invoice_id, stripe_subscription_id,
      event_type, from_status, to_status,
      transition_at, transition_reason_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `); },
};

export const recurringDonationSubscriptions = {
  get insertSubscription() { return db.prepare(`
    INSERT INTO recurring_donation_subscriptions (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, stripe_customer_id, stripe_subscription_id, last_stripe_event_id,
      status, amount_cents, currency, billing_interval,
      started_at, status_updated_at, donation_comment, provider_livemode
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'active', ?, ?, 'yearly', ?, ?, ?, ?)
  `); },

  // Written when checkout opens, before the member is redirected, so an
  // abandoned recurring gift leaves a trace. Neither provider identifier
  // exists yet; the checkout session is the only handle the row has.
  get insertPendingSubscription() { return db.prepare(`
    INSERT INTO recurring_donation_subscriptions (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, stripe_customer_id, checkout_session_id,
      status, amount_cents, currency, billing_interval,
      started_at, status_updated_at, donation_comment
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'incomplete', ?, ?, 'yearly', ?, ?, ?)
  `); },

  // Promotes the row the checkout opened once the provider confirms the
  // subscription. Guarded on the current status so a redelivered created-event
  // cannot re-promote a row that has since moved on, and so the promotion of a
  // row that was already confirmed reports no change rather than silently
  // rewriting live state.
  get promoteFromCheckout() { return db.prepare(`
    UPDATE recurring_donation_subscriptions
    SET status = 'active',
        stripe_subscription_id = ?,
        stripe_customer_id = ?,
        last_stripe_event_id = ?,
        provider_livemode = ?,
        started_at = ?,
        status_updated_at = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND status = 'incomplete'
  `); },

  // Closes out a checkout that expired without completing. Guarded the same
  // way: only an unconfirmed row can be abandoned.
  get markIncompleteAbandoned() { return db.prepare(`
    UPDATE recurring_donation_subscriptions
    SET status = 'canceled',
        canceled_at = ?,
        status_updated_at = ?,
        last_stripe_event_id = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND status = 'incomplete'
  `); },

  get findById() { return db.prepare(`
    SELECT * FROM recurring_donation_subscriptions WHERE id = ?
  `); },

  get findByStripeSubscriptionId() { return db.prepare(`
    SELECT * FROM recurring_donation_subscriptions WHERE stripe_subscription_id = ?
  `); },

  get findByCheckoutSessionId() { return db.prepare(`
    SELECT * FROM recurring_donation_subscriptions WHERE checkout_session_id = ?
  `); },

  // An unconfirmed row older than the cutoff means the provider confirmed a
  // subscription we never heard about, or the member abandoned the page and
  // the expiry event never arrived. Either way it needs a human look: the
  // first case is a live subscription charging a card with no local record.
  get listStaleIncomplete() { return db.prepare(`
    SELECT * FROM recurring_donation_subscriptions
    WHERE status = 'incomplete' AND created_at < ?
    ORDER BY created_at
  `); },

  // Member-facing history lists canceled subscriptions too, so this reads the
  // base table rather than the active view. Unconfirmed rows are excluded: a
  // checkout the member walked away from is not a donation they made.
  get listByMember() { return db.prepare(`
    SELECT * FROM recurring_donation_subscriptions
    WHERE member_id = ? AND status <> 'incomplete'
    ORDER BY started_at DESC
  `); },

  get listActive() { return db.prepare(`
    SELECT * FROM recurring_donation_subscriptions_active
    ORDER BY started_at
  `); },

  // A member-requested cancellation takes effect at the period end, so the status
  // stays put and only the cancel-intent fields move. Stripe drives the status to
  // canceled later, via customer.subscription.deleted.
  //
  // The IS-NOT-ALREADY-REQUESTED guard makes the write itself decide the race:
  // two simultaneous submits both pass a service-level check read before the
  // provider call, and only the one whose UPDATE reports a changed row may append
  // to a ledger that documents one row per action.
  get markCancelRequested() { return db.prepare(`
    UPDATE recurring_donation_subscriptions
    SET is_cancel_at_period_end = 1,
        cancel_requested_at = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND is_cancel_at_period_end = 0
  `); },

  get updateStatus() { return db.prepare(`
    UPDATE recurring_donation_subscriptions
    SET status = ?, status_updated_at = ?, last_stripe_event_id = ?,
        last_stripe_event_created = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  // Every mirrored subscription's provider id, whatever its status. The invoice
  // reconciliation pass needs the canceled ones too: the platform deliberately
  // books a charge that settles after a donation ended, because the money moved
  // either way, so an invoice against a canceled subscription is one this
  // platform should be holding a payment row for. Reading only the active view
  // here made a paid invoice on an ended donation invisible to both passes.
  get listAllStripeIds() { return db.prepare(`
    SELECT stripe_subscription_id
    FROM recurring_donation_subscriptions
    WHERE stripe_subscription_id IS NOT NULL
  `); },

  // Advances the out-of-order watermark without moving the status, for an event
  // that was applied but changed nothing: a charge settling on a subscription
  // already active. Without this the row keeps an older watermark and a
  // redelivered failure from earlier in the same billing cycle reads as fresh.
  //
  // The comparison is in the WHERE clause so the write itself is monotonic: an
  // event older than the one already recorded changes no row, whichever order
  // the provider delivers them in.
  get advanceEventWatermark() { return db.prepare(`
    UPDATE recurring_donation_subscriptions
    SET last_stripe_event_id = ?, last_stripe_event_created = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
      AND (last_stripe_event_created IS NULL OR last_stripe_event_created < ?)
  `); },

  // A failed charge both moves the status and advances the failure counter, so
  // the two never drift apart across retries.
  get markPastDue() { return db.prepare(`
    UPDATE recurring_donation_subscriptions
    SET status = 'past_due', status_updated_at = ?, last_stripe_event_id = ?,
        last_stripe_event_created = ?,
        failure_count = failure_count + 1,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  get markCanceled() { return db.prepare(`
    UPDATE recurring_donation_subscriptions
    SET status = 'canceled', canceled_at = ?, status_updated_at = ?,
        last_stripe_event_id = ?, last_stripe_event_created = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },

  // An administrator can change the amount or status in the Stripe Dashboard;
  // customer.subscription.updated mirrors whatever Stripe now reports.
  get updateAmountAndStatus() { return db.prepare(`
    UPDATE recurring_donation_subscriptions
    SET amount_cents = ?, status = ?, status_updated_at = ?, last_stripe_event_id = ?,
        last_stripe_event_created = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ?
  `); },
};

export const reconciliationIssues = {
  // OR IGNORE against the partial unique index on the outstanding discrepancy
  // keys: the insert itself is the idempotency check, so two overlapping
  // reconciliation runs cannot both raise the same issue. `changes` tells the
  // caller whether it won the insert and should therefore raise the audit row
  // and the work-queue item.
  get insertIssueIfAbsent() { return db.prepare(`
    INSERT OR IGNORE INTO reconciliation_issues (
      id, created_at, created_by, updated_at, updated_by, version,
      issue_type, payment_id, stripe_payment_intent_id, stripe_subscription_id,
      stripe_invoice_id, subscription_record_id, status, details_json, expires_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'outstanding', ?, ?)
  `); },

  get findById() { return db.prepare(`
    SELECT * FROM reconciliation_issues WHERE id = ?
  `); },

  get resolveIssue() { return db.prepare(`
    UPDATE reconciliation_issues
    SET status = 'resolved',
        resolved_at = ?, resolved_by_member_id = ?, resolution_notes = ?,
        updated_at = ?, updated_by = ?, version = version + 1
    WHERE id = ? AND status = 'outstanding'
  `); },

  get listOutstanding() { return db.prepare(`
    SELECT * FROM reconciliation_issues
    WHERE status = 'outstanding'
    ORDER BY created_at DESC
  `); },

  // Oldest first, because the figure the reader wants from an exceptions queue
  // is how long the worst one has been waiting, and a newest-first list buries
  // it on the last page.
  get listOutstandingOldestFirst() { return db.prepare(`
    SELECT * FROM reconciliation_issues
    WHERE status = 'outstanding'
    ORDER BY created_at ASC
  `); },

  // What was settled since the last digest, and by whom. The requirement asks
  // the summary to carry recently resolved issues as well as open ones: for the
  // reader answerable for the money, seeing that a question was answered, by a
  // named person, on a date, is the segregation-of-duties half of the report.
  get listResolvedSince() { return db.prepare(`
    SELECT i.*, m.slug AS resolved_by_slug
    FROM reconciliation_issues i
    LEFT JOIN members m ON m.id = i.resolved_by_member_id
    WHERE i.status = 'resolved' AND i.resolved_at >= ?
    ORDER BY i.resolved_at DESC
  `); },

  get countOutstanding() { return db.prepare(`
    SELECT COUNT(*) AS c FROM reconciliation_issues WHERE status = 'outstanding'
  `); },

  // Resolved rows past their retention window are cleared by the cleanup pass;
  // an outstanding row is never purged, however old, because it still needs an
  // administrator's decision.
  get deleteExpiredResolved() { return db.prepare(`
    DELETE FROM reconciliation_issues
    WHERE status = 'resolved' AND expires_at IS NOT NULL AND expires_at <= ?
  `); },
};

/** Admin All Payments listing. The filter set is open-ended, so the SQL is
 *  assembled per call rather than kept as one prepared statement with a dozen
 *  always-bound placeholders. */
export interface AdminPaymentFilters {
  paymentType?: string;
  status?: string;
  /** The member ids an admin's member-search handle resolved to. An empty array
   *  means the handle matched no member and the search returns nothing, distinct
   *  from `undefined`, which means no member filter was applied. */
  memberIds?: string[];
  reference?: string;
  createdFrom?: string;
  createdTo?: string;
  /** The event a registration fee was taken for. A payment reaches its event
   *  through the registration that references it; payments stay denormalised. */
  eventId?: string;
}

/** The registration a payment settles, and through it the event. LEFT because
 *  only a registration fee has one: a donation or a membership joins to nothing
 *  and must still appear in the list. The partial unique index on
 *  `registrations.payment_id` is what keeps this join one-to-at-most-one, so it
 *  cannot multiply a payment into several rows. */
const ADMIN_PAYMENT_EVENT_JOIN = `
  LEFT JOIN registrations reg ON reg.payment_id = p.id
  LEFT JOIN events ev ON ev.id = reg.event_id
  LEFT JOIN tags evt ON evt.id = ev.hashtag_tag_id
`;

/**
 * Sort keys the All Payments view offers, mapped to the SQL that orders by them.
 * A whitelist rather than interpolated input: the sort key arrives in the query
 * string, and ORDER BY cannot be parameterised, so an unknown key falls back to
 * the default instead of reaching the statement.
 *
 * Every ordering ends in `p.rowid` so the sequence is total. Without it, rows
 * tying on the chosen column order arbitrarily between calls, and a tie
 * spanning a page boundary can show the same payment on two pages while another
 * never appears at all.
 */
const ADMIN_PAYMENT_SORTS: Record<string, string> = {
  date_desc: 'p.created_at DESC, p.rowid DESC',
  date_asc: 'p.created_at ASC, p.rowid ASC',
  type_desc: 'p.payment_type DESC, p.created_at DESC, p.rowid DESC',
  type_asc: 'p.payment_type ASC, p.created_at DESC, p.rowid DESC',
  amount_desc: 'p.amount_cents DESC, p.created_at DESC, p.rowid DESC',
  amount_asc: 'p.amount_cents ASC, p.created_at DESC, p.rowid DESC',
  status_desc: 'p.status DESC, p.created_at DESC, p.rowid DESC',
  status_asc: 'p.status ASC, p.created_at DESC, p.rowid DESC',
  // A payment with no member sorts last either way rather than leading the
  // ascending page with a block of nulls an administrator has to scroll past.
  member_desc: 'm.slug IS NULL, m.slug DESC, p.created_at DESC, p.rowid DESC',
  member_asc: 'm.slug IS NULL, m.slug ASC, p.created_at DESC, p.rowid DESC',
  event_desc: 'ev.title IS NULL, ev.title DESC, p.created_at DESC, p.rowid DESC',
  event_asc: 'ev.title IS NULL, ev.title ASC, p.created_at DESC, p.rowid DESC',
  // Ordered on the same value the column displays, which falls back through the
  // provider identifiers to the payment's own id. Sorting on the raw intent
  // alone would scatter every renewal and every unstarted checkout, the two
  // cases that have no intent, into one indistinguishable block.
  reference_desc:
    'COALESCE(p.stripe_payment_intent_id, p.stripe_subscription_id, p.id) DESC, p.rowid DESC',
  reference_asc:
    'COALESCE(p.stripe_payment_intent_id, p.stripe_subscription_id, p.id) ASC, p.rowid ASC',
};

export const ADMIN_PAYMENT_DEFAULT_SORT = 'date_desc';

/** Resolves a caller-supplied sort key to its ORDER BY clause, falling back to
 *  the default for anything not on the whitelist. */
export function adminPaymentOrderBy(sort: string | undefined): string {
  return ADMIN_PAYMENT_SORTS[sort ?? ''] ?? ADMIN_PAYMENT_SORTS[ADMIN_PAYMENT_DEFAULT_SORT];
}

export function isAdminPaymentSort(sort: string): boolean {
  return Object.prototype.hasOwnProperty.call(ADMIN_PAYMENT_SORTS, sort);
}

function buildAdminPaymentClauses(f: AdminPaymentFilters): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (f.paymentType) { clauses.push('p.payment_type = ?'); params.push(f.paymentType); }
  if (f.status) { clauses.push('p.status = ?'); params.push(f.status); }
  if (f.memberIds) {
    if (f.memberIds.length === 0) {
      // A member handle that resolved to nobody returns no payments rather than
      // silently dropping the filter and listing every member's.
      clauses.push('1 = 0');
    } else {
      clauses.push(`p.member_id IN (${f.memberIds.map(() => '?').join(', ')})`);
      params.push(...f.memberIds);
    }
  }
  if (f.createdFrom) { clauses.push('p.created_at >= ?'); params.push(f.createdFrom); }
  if (f.createdTo) { clauses.push('p.created_at < ?'); params.push(f.createdTo); }
  if (f.eventId) { clauses.push('reg.event_id = ?'); params.push(f.eventId); }
  if (f.reference) {
    clauses.push(
      '(p.id = ? OR p.stripe_payment_intent_id = ? OR p.stripe_checkout_session_id = ? OR p.stripe_subscription_id = ? OR p.stripe_invoice_id = ?)',
    );
    params.push(f.reference, f.reference, f.reference, f.reference, f.reference);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function queryAdminPayments(
  filters: AdminPaymentFilters,
  limit: number,
  offset: number,
  sort?: string,
): Record<string, unknown>[] {
  const { where, params } = buildAdminPaymentClauses(filters);
  return db.prepare(`
    SELECT p.*, m.slug AS member_slug,
           ev.id AS event_id, ev.title AS event_title, evt.tag_normalized AS event_tag
    FROM payments p
    LEFT JOIN members m ON m.id = p.member_id
    ${ADMIN_PAYMENT_EVENT_JOIN}
    ${where}
    ORDER BY ${adminPaymentOrderBy(sort)}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Record<string, unknown>[];
}

/** The events that actually have payments against them, for the list's event
 *  filter. Derived from the payments themselves rather than the whole event
 *  catalogue, so the filter never offers an option that returns nothing. */
export function listAdminPaymentEventOptions(): Record<string, unknown>[] {
  return db.prepare(`
    SELECT DISTINCT ev.id AS event_id, ev.title AS event_title, ev.start_date AS start_date
    FROM payments p
    INNER JOIN registrations reg ON reg.payment_id = p.id
    INNER JOIN events ev ON ev.id = reg.event_id
    ORDER BY ev.start_date DESC, ev.title ASC
  `).all() as Record<string, unknown>[];
}

/** Admin payment detail by primary key. Distinct from the reference filter,
 *  which matches several provider-id columns and would resolve a value that
 *  collides with another row's provider id to the wrong payment. */
export function findAdminPaymentById(paymentId: string): Record<string, unknown> | undefined {
  return db.prepare(`
    SELECT p.*, m.slug AS member_slug,
           ev.id AS event_id, ev.title AS event_title, evt.tag_normalized AS event_tag
    FROM payments p
    LEFT JOIN members m ON m.id = p.member_id
    ${ADMIN_PAYMENT_EVENT_JOIN}
    WHERE p.id = ?
  `).get(paymentId) as Record<string, unknown> | undefined;
}

export function countAdminPayments(filters: AdminPaymentFilters): number {
  const { where, params } = buildAdminPaymentClauses(filters);
  // Carries the same joins as the listing even though it selects no column from
  // them: the event filter's clause names the registration, and a count built
  // over a narrower FROM would disagree with the rows the page then shows.
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM payments p
    LEFT JOIN members m ON m.id = p.member_id
    ${ADMIN_PAYMENT_EVENT_JOIN}
    ${where}
  `).get(...params) as { total: number };
  return row.total;
}

export function queryReconciliationIssues(
  status: 'outstanding' | 'resolved' | null,
  limit: number,
  offset: number,
  // Newest first suits someone checking what just came in; oldest first is what
  // the person answerable for the money needs, because the figure that matters
  // on an exceptions queue is how long the worst one has been waiting. An order
  // cannot be parameterised into a prepared statement, so this is a boolean the
  // caller has already narrowed rather than a string reaching the SQL.
  oldestFirst = false,
): Record<string, unknown>[] {
  const where = status ? 'WHERE r.status = ?' : '';
  const params = status ? [status] : [];
  const order = oldestFirst
    ? 'ORDER BY r.created_at ASC, r.rowid ASC'
    : 'ORDER BY r.created_at DESC, r.rowid DESC';
  return db.prepare(`
    SELECT r.*, m.slug AS resolved_by_slug
    FROM reconciliation_issues r
    LEFT JOIN members m ON m.id = r.resolved_by_member_id
    ${where}
    ${order}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Record<string, unknown>[];
}

/** The moment the oldest unresolved discrepancy was raised, or null when there
 *  are none. One figure, so the page can lead with how long the longest-waiting
 *  money question has been open rather than making someone page to the end of
 *  the list to find out. */
export function oldestOutstandingReconciliationIssueAt(): string | null {
  const row = db.prepare(`
    SELECT MIN(created_at) AS oldest FROM reconciliation_issues
    WHERE status = 'outstanding'
  `).get() as { oldest: string | null };
  return row.oldest;
}

export function countReconciliationIssues(status: 'outstanding' | 'resolved' | null): number {
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const row = db.prepare(`
    SELECT COUNT(*) AS total FROM reconciliation_issues ${where}
  `).get(...params) as { total: number };
  return row.total;
}

export const recurringDonationSubscriptionTransitions = {
  get insertTransition() { return db.prepare(`
    INSERT INTO recurring_donation_subscription_transitions (
      id, created_at, created_by,
      recurring_subscription_id, member_id,
      stripe_event_id, stripe_subscription_id, stripe_invoice_id,
      event_type, lifecycle_event_code,
      old_status, new_status, occurred_at, reason_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `); },

  get listBySubscription() { return db.prepare(`
    SELECT * FROM recurring_donation_subscription_transitions
    WHERE recurring_subscription_id = ?
    ORDER BY occurred_at
  `); },
};

export const memberPaymentObligations = {
  // The most recent membership purchase this member started that did not
  // settle, and which they still have nothing to show for. Bounded to one row
  // because the member needs a way back in, not a list of past attempts.
  //
  // `status = 'failed'` is the settled failure: a declined attempt inside a
  // live checkout leaves the row pending on purpose, because the buyer may
  // still try another card on the provider's page, and surfacing that as an
  // obligation would nag someone who is mid-purchase.
  get lastFailedMembershipPurchase() { return db.prepare(`
    SELECT id, created_at, purchased_tier_status, amount_cents, currency
    FROM payments
    WHERE member_id = ?
      AND payment_type = 'membership'
      AND status = 'failed'
      AND purchased_tier_status IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `); },

  // A recurring donation the provider could not collect on. Past due rather
  // than canceled: the provider is still retrying on its own dunning schedule,
  // so this clears itself when it collects or gives up, and the member is told
  // rather than asked to act.
  get pastDueRecurringDonation() { return db.prepare(`
    SELECT id, amount_cents, currency, failure_count
    FROM recurring_donation_subscriptions
    WHERE member_id = ? AND status = 'past_due'
    ORDER BY status_updated_at DESC
    LIMIT 1
  `); },
};

export const paymentMoneyHistory = {
  // Everything that moved money on a payment after it settled, for the admin
  // detail page.
  //
  // A partial refund, a dispute and a failed payout never touch the payment row
  // by design: the status machine is monotonic and only a full refund reaches
  // the terminal state. The audit ledger is therefore the only place that
  // history exists, and without it the detail page shows a settled payment at
  // its full original amount with nothing to say money went back.
  //
  // Two arms because these events key on different entities. A refund is
  // recorded against the payment itself; a dispute is recorded against the
  // provider's dispute object and names the payment only in its metadata, so it
  // is reached by the intent id instead. UNION rather than OR so each arm can
  // use its own index.
  get forPayment() { return db.prepare(`
    SELECT occurred_at, action_type, reason_text, metadata_json
    FROM audit_entries
    WHERE entity_type = 'payment' AND entity_id = ?
      AND action_type IN (
        'payment.refunded', 'payment.partially_refunded', 'payment.canceled',
        'payment.refund_not_returned'
      )
    UNION ALL
    SELECT occurred_at, action_type, reason_text, metadata_json
    FROM audit_entries
    WHERE category = 'payment'
      AND action_type IN (
        'payment.dispute_opened', 'payment.dispute_updated', 'payment.dispute_closed',
        'payment.dispute_funds_withdrawn', 'payment.dispute_funds_reinstated',
        'payment.payout_rejected'
      )
      AND json_extract(metadata_json, '$.stripe_payment_intent_id') = ?
    ORDER BY occurred_at ASC
  `); },
};

export const paymentPeriodTotals = {
  // Settled money over an arbitrary range, grouped by what it was for and by
  // its currency. The health page's rolling window answers "is anything moving
  // right now"; this answers "what did we take in July", which is the figure a
  // month-end or a year-end actually needs.
  //
  // A fully refunded payment counts here, not just a succeeded one. The money
  // genuinely arrived and then genuinely went back, so it belongs in both the
  // received column and the returned column. Counting the refund without the
  // receipt would drive the net figure below zero and report the organization
  // as having paid out money it never took.
  get grossByTypeInRange() { return db.prepare(`
    SELECT payment_type, currency,
           COUNT(*)          AS n,
           SUM(amount_cents) AS total_cents
    FROM payments
    WHERE status IN ('succeeded', 'refunded')
      AND created_at >= ? AND created_at < ?
      -- Real money only. Production is proven with the provider in test mode
      -- before it goes live, so rehearsal charges sit in this same table; a
      -- total that swept them in would overstate what the organization
      -- actually took. A row predating this column reads NULL and is excluded
      -- for the same reason it is never badged as real: it cannot be shown to
      -- be real money. The excluded rows are counted separately so the
      -- exclusion is disclosed rather than silent.
      AND provider_livemode = 1
    GROUP BY payment_type, currency
    ORDER BY payment_type, currency
  `); },

  // What the totals above left out, so the report can say so on its face. A
  // reader who is told the figure covers real money only, and how many rows
  // that set aside, can act on it; one shown a silently reduced total cannot.
  get excludedFromTotalsInRange() { return db.prepare(`
    SELECT CASE WHEN provider_livemode IS NULL THEN 'unknown' ELSE 'test' END AS mode,
           COUNT(*) AS n
    FROM payments
    WHERE status IN ('succeeded', 'refunded')
      AND created_at >= ? AND created_at < ?
      AND (provider_livemode IS NULL OR provider_livemode = 0)
    GROUP BY mode
  `); },

  // One row per payment in the range that had money returned or contested,
  // flat, for the service to aggregate. Deliberately not summed here: the
  // provider reports a cumulative refunded figure per charge, so a partial
  // refund followed by a full one produces two audit rows describing overlapping
  // money, and adding them would overstate what went back. Deciding that is a
  // business rule and belongs above this layer.
  get refundFactsInRange() { return db.prepare(`
    SELECT p.id, p.payment_type, p.currency, p.amount_cents,
           a.action_type,
           json_extract(a.metadata_json, '$.refunded_amount_cents') AS refunded_amount_cents
    FROM audit_entries a
    JOIN payments p ON p.id = a.entity_id
    WHERE a.entity_type = 'payment'
      AND a.action_type IN ('payment.refunded', 'payment.partially_refunded')
      AND p.created_at >= ? AND p.created_at < ?
      -- Matches the gross query's real-money filter. Netting a rehearsal
      -- refund against real gross would understate revenue as surely as
      -- counting a rehearsal charge would overstate it.
      AND p.provider_livemode = 1
  `); },
};

export const paymentVolume = {
  // Settled money over a window, grouped by what it was for and by its
  // currency. Currency is part of the grouping, never a label beside a summed
  // number: adding two currencies together produces a figure that is true of
  // neither.
  get byTypeSince() { return db.prepare(`
    SELECT payment_type, currency,
           COUNT(*)          AS n,
           SUM(amount_cents) AS total_cents
    FROM payments
    WHERE status = 'succeeded' AND created_at >= ?
      -- Real money only, for the same reason the period totals count only
      -- live rows: a rehearsal charge on the health page reads as revenue.
      AND provider_livemode = 1
    GROUP BY payment_type, currency
    ORDER BY payment_type, currency
  `); },

  // What the window's volume left out, so the page can say so on its face.
  get excludedSince() { return db.prepare(`
    SELECT CASE WHEN provider_livemode IS NULL THEN 'unknown' ELSE 'test' END AS mode,
           COUNT(*) AS n
    FROM payments
    WHERE status = 'succeeded' AND created_at >= ?
      AND (provider_livemode IS NULL OR provider_livemode = 0)
    GROUP BY mode
  `); },
};

export const stripeEvents = {
  // Idempotency primitive: PRIMARY KEY (event_id) makes INSERT OR IGNORE a
  // no-op on redelivery. A mutating handler claims the id INSIDE the same
  // transaction as the state change it guards and short-circuits on changes=0,
  // so a processing failure rolls the claim back and the provider's redelivery
  // re-runs the whole unit cleanly. A no-op path (a duplicate, or an event type
  // with no handler) records the id outside any transaction, for the
  // received-event trail.
  get insertEventOrIgnore() { return db.prepare(`
    INSERT OR IGNORE INTO stripe_events
      (event_id, created_at, event_type, stripe_created, processed_at)
    VALUES (?, ?, ?, ?, ?)
  `); },

  get findByEventId() { return db.prepare(`
    SELECT * FROM stripe_events WHERE event_id = ?
  `); },

  // The most recent delivery this platform actually processed. The admin health
  // view reads it to answer "are webhooks arriving at all", which a failure
  // count cannot: an endpoint the provider has disabled produces no failures
  // and no successes, and silence is the symptom.
  get lastProcessedAt() { return db.prepare(`
    SELECT MAX(processed_at) AS last_processed_at FROM stripe_events
  `); },
};

export const stripeWebhookFailures = {
  // Increment-in-place, so the row count is bounded by the clock rather than by
  // whatever is POSTing at the public endpoint. ON CONFLICT keys on the
  // (bucket_start, reason) primary key: the first rejection in a bucket inserts
  // it, every later one adds to it.
  get recordFailure() { return db.prepare(`
    INSERT INTO stripe_webhook_failures
      (bucket_start, reason, failure_count, first_seen_at, last_seen_at,
       last_event_type, last_event_id, expires_at)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(bucket_start, reason) DO UPDATE SET
      failure_count   = failure_count + 1,
      last_seen_at    = excluded.last_seen_at,
      -- Keeps the last identified delivery rather than blanking it: a later
      -- unparseable rejection in the same bucket should not erase the event id
      -- an earlier one managed to state.
      last_event_type = COALESCE(excluded.last_event_type, last_event_type),
      last_event_id   = COALESCE(excluded.last_event_id, last_event_id)
  `); },

  // One row per reason over the window, so a reason with no failures reads as
  // absent and the service can render it as zero rather than omitting it.
  //
  // The event id comes from a correlated subquery rather than MAX(), because
  // MAX() over an id column returns the alphabetically greatest one and a
  // provider event id is random, not ordered. Taken as a second aggregate it
  // would also be free to come from a different bucket than MAX(last_seen_at),
  // and the two are rendered side by side as though they describe one delivery.
  // Ordering by last_seen_at and skipping rows that never carried an id gives
  // the id of the most recent identified failure, which is the one an
  // administrator would look up.
  //
  // The window start binds twice: once for the outer scan and once inside the
  // subquery, which cannot see the outer WHERE.
  get countsInWindow() { return db.prepare(`
    SELECT f.reason,
           SUM(f.failure_count) AS n,
           MAX(f.last_seen_at)  AS last_seen_at,
           (SELECT g.last_event_id
              FROM stripe_webhook_failures g
             WHERE g.reason = f.reason
               AND g.bucket_start >= ?
               AND g.last_event_id IS NOT NULL
             ORDER BY g.last_seen_at DESC
             LIMIT 1)          AS last_event_id
    FROM stripe_webhook_failures f
    WHERE f.bucket_start >= ?
    GROUP BY f.reason
  `); },

  get deleteExpired() { return db.prepare(`
    DELETE FROM stripe_webhook_failures WHERE expires_at <= ?
  `); },
};

export const sesEvents = {
  // Idempotency primitive: PRIMARY KEY (message_id) makes INSERT OR IGNORE a
  // no-op on SNS redelivery. The feedback service inserts first inside its
  // transaction and short-circuits on changes=0, so a redelivered bounce or
  // complaint does not re-flip status or append duplicate audit rows.
  get insertEventOrIgnore() { return db.prepare(`
    INSERT OR IGNORE INTO ses_events
      (message_id, created_at, event_type, processed_at, recipient_count)
    VALUES (?, ?, ?, ?, ?)
  `); },

  // Feedback volume over a recent window, one row per notification type, so the
  // health view can express bounces and complaints as a share of what was sent
  // in the same window. Summed over recipients rather than counted over rows:
  // the idempotency claim guarantees one row per processed notification, and one
  // notification can name several bounced addresses, so counting rows reports
  // fewer bounces than actually happened.
  get countByTypeSince() { return db.prepare(`
    SELECT event_type, SUM(recipient_count) AS n
    FROM ses_events
    WHERE created_at >= ?
    GROUP BY event_type
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
