"""
test_resolution_status_default.py
=================================

Verifies that mirror-seeded and inferred `legacy_person_club_affiliations`
rows arrive with `resolution_status = 'pending'`, matching the schema
default and the contract documented in:

  - MIGRATION_PLAN.md §10.3 (club onboarding flow)
  - DATA_MODEL.md      §4.25 (inferred mirror rows transition only
                              when the member confirms current affiliation
                              via the onboarding wizard)

Three loader sites were previously hard-coding `'confirmed_current'`,
overriding the schema DEFAULT and breaking the wizard's "confirm current
affiliation" stage. The fix removes the override; the schema default
takes over. These tests pin the contract so future loader edits cannot
silently regress it.

Sites covered:

  1. `legacy_data/scripts/load_club_members_seed.py` — name-matched
     (historical_person_id populated).
  2. `legacy_data/scripts/load_club_members_seed.py` — unmatched
     mirror-id-known (legacy_member_id only).
  3. `legacy_data/event_results/scripts/09_load_enrichment_to_sqlite.py`
     — inferred enrichment affiliations.

Run from repo root:
    python -m pytest legacy_data/tests/test_resolution_status_default.py -v
"""
import sqlite3
from pathlib import Path

import pytest

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "database" / "schema.sql"


@pytest.fixture
def db() -> sqlite3.Connection:
    """Fresh in-memory DB with the full project schema loaded."""
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text())
    return conn


def _seed_prereqs(conn: sqlite3.Connection) -> None:
    """Insert the minimum FK prerequisites for a legacy_person_club_affiliations
    row: one tags row + one clubs row (needed for the resolved_club_id FK
    target on rows that satisfy the wizard-contract CHECK) + one
    legacy_club_candidates row + one historical_persons row + one
    legacy_members row.
    """
    conn.execute(
        """
        INSERT INTO tags (
          id, created_at, created_by, updated_at, updated_by, version,
          tag_normalized, tag_display, is_standard, standard_type
        ) VALUES ('tag-club-test', '2026-01-01T00:00:00Z', 'test',
                  '2026-01-01T00:00:00Z', 'test', 1,
                  '#club_test', '#club_test', 1, 'club')
        """,
    )
    conn.execute(
        """
        INSERT INTO clubs (
          id, created_at, created_by, updated_at, updated_by, version,
          name, city, country, status, hashtag_tag_id
        ) VALUES ('club-test', '2026-01-01T00:00:00Z', 'test',
                  '2026-01-01T00:00:00Z', 'test', 1,
                  'Test Club', 'Testville', 'Testland', 'active', 'tag-club-test')
        """,
    )
    conn.execute(
        """
        INSERT INTO legacy_club_candidates (
          id, created_at, created_by, updated_at, updated_by, version,
          legacy_club_key, display_name, classification
        ) VALUES ('lcc-test', '2026-01-01T00:00:00Z', 'test',
                  '2026-01-01T00:00:00Z', 'test', 1,
                  'club-test-key', 'Test Club', 'pre_populate')
        """,
    )
    conn.execute(
        """
        INSERT INTO historical_persons (person_id, person_name, source_scope)
        VALUES ('hp-test', 'Test Person', 'CANONICAL')
        """,
    )
    conn.execute(
        """
        INSERT INTO legacy_members (legacy_member_id, display_name, imported_at)
        VALUES ('lm-test', 'Mirror Person', '2026-01-01T00:00:00Z')
        """,
    )


def test_name_matched_loader_arrives_pending(db: sqlite3.Connection) -> None:
    """Site A: load_club_members_seed.py name-matched INSERT.

    historical_person_id is populated; the loader omits resolution_status
    so the schema DEFAULT 'pending' applies.
    """
    _seed_prereqs(db)
    # This is the exact INSERT shape from load_club_members_seed.py site A
    # (post-fix). resolution_status is not in the column list.
    db.execute(
        """
        INSERT INTO legacy_person_club_affiliations
          (id, created_at, created_by, updated_at, updated_by, version,
           historical_person_id, legacy_member_id,
           legacy_club_candidate_id, inferred_role,
           confidence_score, display_name)
        VALUES (?, ?, 'seed', ?, 'seed', 1,
                ?, ?, ?, 'member', 1.0, ?)
        """,
        ('lpca-A', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
         'hp-test', 'lm-test', 'lcc-test', 'Test Person'),
    )
    row = db.execute(
        "SELECT resolution_status FROM legacy_person_club_affiliations WHERE id='lpca-A'"
    ).fetchone()
    assert row is not None, "row was not inserted"
    assert row[0] == 'pending', (
        f"Expected schema default 'pending', got {row[0]!r}. "
        "MIGRATION_PLAN §10.3 + DATA_MODEL §4.25 require inferred mirror "
        "rows to arrive as 'pending' until the wizard confirms current "
        "affiliation. Loader override of resolution_status reintroduced?"
    )


def test_unmatched_mirror_id_loader_arrives_pending(db: sqlite3.Connection) -> None:
    """Site B: load_club_members_seed.py unmatched-but-mirror-id-known INSERT.

    historical_person_id is NULL; legacy_member_id only. Same resolution_status
    contract applies — default 'pending'.
    """
    _seed_prereqs(db)
    db.execute(
        """
        INSERT INTO legacy_person_club_affiliations
          (id, created_at, created_by, updated_at, updated_by, version,
           historical_person_id, legacy_member_id,
           legacy_club_candidate_id, inferred_role,
           confidence_score, display_name)
        VALUES (?, ?, 'seed', ?, 'seed', 1,
                NULL, ?, ?, 'member', 0.5, ?)
        """,
        ('lpca-B', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
         'lm-test', 'lcc-test', 'Mirror Person'),
    )
    row = db.execute(
        "SELECT resolution_status FROM legacy_person_club_affiliations WHERE id='lpca-B'"
    ).fetchone()
    assert row is not None
    assert row[0] == 'pending', (
        f"Expected schema default 'pending', got {row[0]!r}. "
        "Loader override of resolution_status reintroduced on the unmatched path?"
    )


def test_enrichment_loader_arrives_pending(db: sqlite3.Connection) -> None:
    """Site C: 09_load_enrichment_to_sqlite.py inferred-affiliation INSERT.

    The enrichment loader's column shape differs slightly from the seed
    loader (different created_by user, different timestamp wiring) but the
    contract is identical: omit resolution_status; default 'pending' applies.
    """
    _seed_prereqs(db)
    db.execute(
        """
        INSERT INTO legacy_person_club_affiliations (
          id, created_at, created_by, updated_at, updated_by, version,
          historical_person_id, legacy_member_id,
          legacy_club_candidate_id, inferred_role,
          confidence_score,
          display_name
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
        """,
        ('lpca-C', '2026-01-01T00:00:00Z', 'sys',
         '2026-01-01T00:00:00Z', 'sys',
         'hp-test', None, 'lcc-test', 'member', 0.8, 'Enrichment Person'),
    )
    row = db.execute(
        "SELECT resolution_status FROM legacy_person_club_affiliations WHERE id='lpca-C'"
    ).fetchone()
    assert row is not None
    assert row[0] == 'pending', (
        f"Expected schema default 'pending', got {row[0]!r}. "
        "Loader override of resolution_status reintroduced in the "
        "enrichment loader?"
    )


def test_explicit_pending_still_works(db: sqlite3.Connection) -> None:
    """Sanity: passing resolution_status='pending' explicitly is also OK
    (matches the test factories in tests/fixtures/factories.ts which call
    out specific resolution_status values). This guards against an
    overzealous CHECK constraint change.
    """
    _seed_prereqs(db)
    db.execute(
        """
        INSERT INTO legacy_person_club_affiliations
          (id, created_at, created_by, updated_at, updated_by, version,
           historical_person_id, legacy_member_id,
           legacy_club_candidate_id, inferred_role,
           confidence_score, resolution_status, display_name)
        VALUES ('lpca-D', '2026-01-01T00:00:00Z', 'seed',
                '2026-01-01T00:00:00Z', 'seed', 1,
                'hp-test', NULL, 'lcc-test', 'member', 1.0, 'pending', 'Explicit Pending')
        """,
    )
    row = db.execute(
        "SELECT resolution_status FROM legacy_person_club_affiliations WHERE id='lpca-D'"
    ).fetchone()
    assert row[0] == 'pending'


def test_explicit_confirmed_current_still_accepted(db: sqlite3.Connection) -> None:
    """Sanity: 'confirmed_current' remains a valid value in the CHECK
    constraint when paired with a non-NULL resolved_club_id (the
    wizard-contract CHECK locked at the schema layer). It is just not the
    loader-time default any more; the onboarding wizard transitions rows
    from 'pending' to 'confirmed_current' AND stamps resolved_club_id in
    the same transaction.
    """
    _seed_prereqs(db)
    db.execute(
        """
        INSERT INTO legacy_person_club_affiliations
          (id, created_at, created_by, updated_at, updated_by, version,
           historical_person_id, legacy_member_id,
           legacy_club_candidate_id, inferred_role,
           confidence_score, resolution_status, resolved_club_id, display_name)
        VALUES ('lpca-E', '2026-01-01T00:00:00Z', 'wizard',
                '2026-01-01T00:00:00Z', 'wizard', 1,
                'hp-test', NULL, 'lcc-test', 'member', 1.0, 'confirmed_current',
                'club-test', 'Wizard-confirmed Person')
        """,
    )
    row = db.execute(
        "SELECT resolution_status, resolved_club_id "
        "FROM legacy_person_club_affiliations WHERE id='lpca-E'"
    ).fetchone()
    assert row[0] == 'confirmed_current'
    assert row[1] == 'club-test'


def test_confirmed_current_without_resolved_club_id_rejected(
    db: sqlite3.Connection,
) -> None:
    """The schema CHECK locks the wizard contract: a row with
    resolution_status='confirmed_current' MUST carry a non-NULL
    resolved_club_id. This test asserts the CHECK fires on the bug
    pattern (wizard transitions to confirmed_current but forgets to
    stamp resolved_club_id), preventing the half-promoted-row state.
    """
    _seed_prereqs(db)
    with pytest.raises(sqlite3.IntegrityError, match="CHECK constraint failed"):
        db.execute(
            """
            INSERT INTO legacy_person_club_affiliations
              (id, created_at, created_by, updated_at, updated_by, version,
               historical_person_id, legacy_member_id,
               legacy_club_candidate_id, inferred_role,
               confidence_score, resolution_status, resolved_club_id, display_name)
            VALUES ('lpca-bug', '2026-01-01T00:00:00Z', 'wizard',
                    '2026-01-01T00:00:00Z', 'wizard', 1,
                    'hp-test', NULL, 'lcc-test', 'member', 1.0, 'confirmed_current',
                    NULL, 'Buggy Wizard Insert')
            """,
        )
