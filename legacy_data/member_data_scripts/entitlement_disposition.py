"""Fail-closed entitlement dispositions for adjudicated merges (public; no PII).

When an adjudicated account merge carries a production-authority entitlement
(currently `legacy_is_admin`), the merged survivor must not silently inherit an
active grant. This module requires an explicit, human-recorded disposition for each
such merge, keyed to the merge's stable account set plus the same account-set
fingerprint the merge override uses. It preserves the raw entitlement value and its
source-account provenance in an audit record, and produces NO active production
grant: a `preserve_provenance_only` disposition sets effective admin authorization
to false while the historical fact stays visible.

It fails closed on a merge that carries a privileged entitlement without a
disposition, a stale fingerprint, changed membership, an unknown entitlement, an
unknown disposition, a duplicate decision, or a disposition attached to a merge
that is no longer approved. Merges that carry no privileged entitlement need no
disposition and are unaffected.

The disposition DATA lives in the controlled private input layer; this module, its
schema, and its tests carry only synthetic values.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

# Entitlements that confer production authority and therefore REQUIRE an explicit
# disposition when an adjudicated merge carries them.
PRIVILEGED_ENTITLEMENTS = ("legacy_is_admin",)

PRESERVE_PROVENANCE_ONLY = "preserve_provenance_only"
VALID_DISPOSITIONS = frozenset({PRESERVE_PROVENANCE_ONLY})

DISPOSITION_FIELDS = ("account_ids", "entitlement", "disposition", "fingerprint", "note")


class EntitlementDispositionError(Exception):
    """Any entitlement-disposition validation failure. The caller must abort."""


@dataclass(frozen=True)
class EntitlementDisposition:
    account_ids: frozenset[str]
    entitlement: str
    disposition: str
    fingerprint: str
    note: str


def parse_account_ids(raw: str) -> frozenset[str]:
    ids = frozenset(p.strip() for p in raw.split("|") if p.strip())
    if len(ids) < 2:
        raise EntitlementDispositionError(
            f"disposition account_ids must name at least two accounts: {raw!r}")
    return ids


def load_dispositions(path: Path | None) -> list[EntitlementDisposition]:
    """Read the entitlement-disposition CSV. Returns [] when no path is supplied or
    the file is absent. Malformed rows fail closed."""
    if path is None or not Path(path).exists():
        return []
    out: list[EntitlementDisposition] = []
    with Path(path).open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or set(DISPOSITION_FIELDS) - set(reader.fieldnames):
            raise EntitlementDispositionError(
                f"disposition header must contain {DISPOSITION_FIELDS}; got {reader.fieldnames!r}")
        for i, row in enumerate(reader, start=2):
            entitlement = (row.get("entitlement") or "").strip()
            if entitlement not in PRIVILEGED_ENTITLEMENTS:
                raise EntitlementDispositionError(f"line {i}: unknown entitlement {entitlement!r}")
            disposition = (row.get("disposition") or "").strip()
            if disposition not in VALID_DISPOSITIONS:
                raise EntitlementDispositionError(f"line {i}: unknown disposition {disposition!r}")
            fp = (row.get("fingerprint") or "").strip()
            if len(fp) != 64 or any(c not in "0123456789abcdef" for c in fp):
                raise EntitlementDispositionError(f"line {i}: malformed fingerprint {fp!r}")
            out.append(EntitlementDisposition(
                account_ids=parse_account_ids(row.get("account_ids") or ""),
                entitlement=entitlement,
                disposition=disposition,
                fingerprint=fp,
                note=(row.get("note") or "").strip(),
            ))
    return out


def validate_and_audit(privileged_merges: Iterable[dict],
                       dispositions: list[EntitlementDisposition]) -> list[dict]:
    """Match each privileged merge to its disposition and return the audit records.

    `privileged_merges` is one dict per (merge, privileged entitlement present):
    {account_ids: frozenset, fingerprint: str, entitlement: str, raw_value: str,
     source_accounts: [ids]}. Fails closed on every mismatch before returning.
    """
    priv_by_key: dict[tuple[frozenset[str], str], dict] = {}
    for p in privileged_merges:
        priv_by_key[(p["account_ids"], p["entitlement"])] = p

    seen: set[tuple[frozenset[str], str]] = set()
    matched: set[tuple[frozenset[str], str]] = set()
    audit: list[dict] = []
    for d in dispositions:
        key = (d.account_ids, d.entitlement)
        if key in seen:
            raise EntitlementDispositionError(
                f"duplicate disposition for {sorted(d.account_ids)} / {d.entitlement}")
        seen.add(key)
        p = priv_by_key.get(key)
        if p is None:
            raise EntitlementDispositionError(
                f"disposition for {sorted(d.account_ids)} / {d.entitlement} has no approved "
                "privileged merge (unapproved merge or changed membership)")
        if d.fingerprint != p["fingerprint"]:
            raise EntitlementDispositionError(
                f"stale fingerprint for disposition {sorted(d.account_ids)} / {d.entitlement}")
        matched.add(key)
        audit.append({
            "account_ids": sorted(d.account_ids),
            "entitlement": d.entitlement,
            "raw_value": p["raw_value"],                 # preserved, not erased
            "source_accounts": list(p["source_accounts"]),
            "disposition": d.disposition,
            # provenance stays visible; no active production grant is produced
            "effective_admin_authorization": (
                False if d.disposition == PRESERVE_PROVENANCE_ONLY else None),
        })

    for key, p in priv_by_key.items():
        if key not in matched:
            raise EntitlementDispositionError(
                f"approved merge {sorted(p['account_ids'])} carries {key[1]} without an "
                "explicit entitlement disposition")
    return audit
