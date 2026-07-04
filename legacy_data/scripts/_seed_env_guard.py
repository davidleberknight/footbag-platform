"""Shared production/staging refusal guard for the dev-seed loaders.

The mirror-derived dev-seed loaders in this directory (load_legacy_members_seed.py,
load_clubs_seed.py) populate a LOCAL development database only. They must never write
to a deployed target. This mirrors the guard in
legacy_data/member_data_scripts/load_legacy_export.py and the reset-local-db.sh SEC-DB01
guard: positive environment/path checks, no force flag.
"""
import os
import sys


def refuse_if_deployed_target(db_path: str) -> None:
    """Abort before any read or write when the target looks like a deployed environment.

    Trips on NODE_ENV=production, FOOTBAG_ENV in {production, staging}, or a database
    path under /srv/footbag/. Call this immediately after argument parsing so the refusal
    happens before any file is opened.
    """
    node_env = os.environ.get("NODE_ENV", "")
    footbag_env = os.environ.get("FOOTBAG_ENV", "")
    if (
        node_env == "production"
        or footbag_env in ("production", "staging")
        or os.path.abspath(db_path).startswith("/srv/footbag/")
    ):
        print(
            "refusing to seed: dev-seed loaders are local-only and never run against "
            "production or staging. Guard tripped by "
            f"NODE_ENV={node_env!r} / FOOTBAG_ENV={footbag_env!r} / --db={db_path!r}.",
            file=sys.stderr,
        )
        sys.exit(1)
