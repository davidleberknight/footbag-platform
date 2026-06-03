#!/usr/bin/env python3
"""
ingest.py — extract allowlisted tables from a sealed raw dump into
provenance-stamped NDJSON, with a payload-free audit report.

ENGINE: a minimal, pure-Python mysqldump parser. Chosen for simple,
non-sensitive, single-table dumps (the news slice): no Docker, no server, and it
reads the dump bytes directly so charset handling is fully controlled. Robust
dump-dialect handling for sensitive or multi-table apps (e.g. members, where
columns must be dropped before any read) is a separate, heavier engine and is
deliberately NOT implemented here.

FLOW:
  1. verify raw/<app>/latest.sql sha256 against its sidecar (tamper check)
  2. allowlist: only tables listed in allowlist.yaml[app] may be processed; a
     dump containing ANY other table aborts the run
  3. denylist: denylisted columns are dropped before emit
  4. parse CREATE TABLE (column order + primary key) and INSERT value tuples
  5. charset repair per text field (latin1 -> utf-8 mojibake fix), recorded
  6. stamp provenance on every row, emit parsed/<app>/<table>.ndjson
  7. write a payload-free audit report to reports/

SAFETY BOUNDARIES:
  * Allowlist-only; a non-allowlisted table in the dump aborts the run.
  * Reads the sealed raw only; never writes raw/; never opens any live or
    production database.
  * --dry-run writes NO permanent output (parsed/ and reports/ untouched); it
    prints the audit summary and writes the parse report to a temp file.

Usage:
  python scripts/ingest.py --app news --dry-run
  python scripts/ingest.py --app news
"""

import argparse
import base64
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

try:
    import yaml
except ImportError:
    sys.exit("FATAL: PyYAML is required. Install with: pip install pyyaml")

ARCHIVE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(ARCHIVE_ROOT, "config")
RAW_DIR = os.path.join(ARCHIVE_ROOT, "raw")
PARSED_DIR = os.path.join(ARCHIVE_ROOT, "parsed")
REPORTS_DIR = os.path.join(ARCHIVE_ROOT, "reports")

SAMPLE_LIMIT = 5  # charset before/after samples kept per column, for review

# MySQL backslash escapes that appear in mysqldump string literals.
_UNESCAPE = {"0": "\0", "'": "'", '"': '"', "b": "\b", "n": "\n",
             "r": "\r", "t": "\t", "Z": "\x1a", "\\": "\\"}


def log(msg):
    print(f"[ingest] {msg}")


def load_yaml(name):
    path = os.path.join(CONFIG_DIR, name)
    if not os.path.exists(path):
        sys.exit(f"FATAL: missing config: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def resolve_tables(app, allowlist):
    """The explicit, wildcard-free table list for this app, or fail."""
    if app not in allowlist:
        sys.exit(f"FATAL: app '{app}' not in allowlist.yaml; refusing to extract.")
    tables = allowlist[app] or []
    if not tables:
        sys.exit(f"FATAL: allowlist.yaml[{app}] is empty; nothing permitted.")
    if any(t == "*" for t in tables):
        sys.exit("FATAL: wildcards are not permitted in the allowlist.")
    return tables


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_seal(app):
    """Confirm the sealed raw exists and matches its sha256 sidecar."""
    raw_path = os.path.join(RAW_DIR, app, "latest.sql")
    sha_path = raw_path + ".sha256"
    if not os.path.exists(raw_path) or not os.path.exists(sha_path):
        sys.exit(f"FATAL: sealed raw not found for app '{app}'. Run seal.py first.")
    expected = open(sha_path, encoding="utf-8").read().split()[0]
    actual = sha256_of(raw_path)
    if actual != expected:
        sys.exit(f"FATAL: sha256 mismatch on {raw_path}: sidecar={expected} actual={actual}")
    return raw_path, actual


# ── mysqldump structural parsing ─────────────────────────────────────────────
# The dump is read as latin1 so every source byte maps 1:1 to a character; this
# is lossless and lets charset repair work on the original bytes.

def parse_create_tables(text):
    """Return {table: {'columns': [...], 'pk': name|None}} from CREATE TABLE blocks."""
    tables = {}
    i = 0
    while True:
        m = text.find("CREATE TABLE `", i)
        if m == -1:
            break
        name_start = m + len("CREATE TABLE `")
        name_end = text.find("`", name_start)
        table = text[name_start:name_end]
        body_start = text.find("(", name_end)
        body_end = _matching_paren(text, body_start)
        body = text[body_start + 1:body_end]
        columns, pk, unique_single = [], None, []
        for line in body.splitlines():
            line = line.strip()
            up = line.upper()
            if line.startswith("`"):
                columns.append(line[1:line.find("`", 1)])
            elif up.startswith("PRIMARY KEY"):
                cols = _key_columns(line)
                if cols:
                    pk = cols[0]
            elif up.startswith("UNIQUE KEY"):
                cols = _key_columns(line)
                if len(cols) == 1:
                    unique_single.append(cols[0])
        # Narrow fallback: a table with no PRIMARY KEY (e.g. legacy `news`, which
        # declares UNIQUE KEY `idx_news` (`NewsID`)) uses its single-column UNIQUE
        # KEY as the row identifier, so _legacy_pk is still stamped.
        if pk is None and unique_single:
            pk = unique_single[0]
        tables[table] = {"columns": columns, "pk": pk}
        i = body_end
    return tables


def _key_columns(line):
    """Backtick-quoted column names inside a KEY definition's (...) clause."""
    lp, rp = line.find("("), line.rfind(")")
    if lp == -1 or rp == -1:
        return []
    return re.findall(r"`([^`]+)`", line[lp + 1:rp])


def _matching_paren(text, open_idx):
    """Index of the ')' matching the '(' at open_idx, ignoring quoted content."""
    depth, i, n = 0, open_idx, len(text)
    in_str = False
    while i < n:
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == "'":
                in_str = False
        elif c == "'":
            in_str = True
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("unbalanced parentheses in CREATE TABLE")


def iter_rows(text, table, ncols):
    """Yield (values, parsed_ok) for each INSERT value tuple of `table`.

    parsed_ok is False when a tuple's field count != ncols (a parse failure we
    surface rather than silently emit)."""
    marker = "INSERT INTO `%s` VALUES " % table
    pos = 0
    while True:
        start = text.find(marker, pos)
        if start == -1:
            break
        i = start + len(marker)
        n = len(text)
        while i < n and text[i] != ";":
            if text[i] != "(":
                i += 1
                continue
            i += 1  # past '('
            row = []
            while True:
                while i < n and text[i] in " \t\r\n":
                    i += 1
                if text[i] == "'":
                    val, i = _read_string(text, i)
                    row.append(val)
                else:
                    val, i = _read_bareword(text, i)
                    row.append(val)
                while i < n and text[i] in " \t\r\n":
                    i += 1
                if text[i] == ",":
                    i += 1
                    continue
                if text[i] == ")":
                    i += 1
                    break
            yield row, (len(row) == ncols)
            # skip separator up to the next tuple or end of statement
            while i < n and text[i] in " \t\r\n,":
                i += 1
        pos = i


def _read_string(text, i):
    """Parse a 'single-quoted' mysqldump literal starting at i (the opening quote)."""
    i += 1
    buf = []
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\":
            buf.append(_UNESCAPE.get(text[i + 1], text[i + 1]))
            i += 2
        elif c == "'":
            i += 1
            break
        else:
            buf.append(c)
            i += 1
    return "".join(buf), i


def _read_bareword(text, i):
    """Parse NULL / number tokens (terminated by ',' or ')')."""
    n = len(text)
    start = i
    while i < n and text[i] not in ",)":
        i += 1
    tok = text[start:i].strip()
    if tok == "NULL":
        return None, i
    try:
        return int(tok), i
    except ValueError:
        try:
            return float(tok), i
        except ValueError:
            return tok, i


# ── charset repair ───────────────────────────────────────────────────────────

def repair_charset(value):
    """Return (repaired_value, transform). Applies the standard latin1->utf-8
    mojibake fix when it yields valid UTF-8 different from the input."""
    if not isinstance(value, str):
        return value, None
    raw = value.encode("latin1")
    try:
        fixed = raw.decode("utf-8")
        if fixed != value:
            return fixed, "latin1->utf8"
    except UnicodeDecodeError:
        pass
    return value, "passthrough"


def b64(value):
    return base64.b64encode(value.encode("latin1")).decode("ascii")


# ── extraction ───────────────────────────────────────────────────────────────

def run(app, dry_run):
    allowlist = load_yaml("allowlist.yaml")
    denylist = load_yaml("denylist.yaml")
    sources = load_yaml("sources.yaml")
    permitted = resolve_tables(app, allowlist)
    raw_path, sha = verify_seal(app)
    dump_date = (sources.get(app) or {}).get("expected_dump_date", "")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    log(f"app={app}  dry_run={dry_run}")
    log(f"raw={raw_path}  sha256={sha}")

    text = open(raw_path, "r", encoding="latin1").read()
    tables_in_dump = parse_create_tables(text)

    # --- allowlist gate: refuse if the dump carries any non-permitted table ---
    extra = [t for t in tables_in_dump if t not in permitted]
    if extra:
        sys.exit(f"FATAL: dump contains non-allowlisted table(s) {extra}; "
                 f"allowlist[{app}]={permitted}. Refusing to extract.")

    table_reports, audit_tables, warnings = {}, [], []
    parsed_payloads = {}

    for table in permitted:
        if table not in tables_in_dump:
            warnings.append(f"allowlisted table '{table}' absent from dump")
            continue
        meta = tables_in_dump[table]
        denied = [c for c in (denylist.get(table) or []) if c != "*"]
        columns = [c for c in meta["columns"] if c not in denied]
        pk = meta["pk"]
        ncols = len(meta["columns"])  # tuples are positional over ALL columns

        transforms = {c: {"latin1->utf8": 0, "passthrough": 0} for c in columns}
        samples = {c: [] for c in columns}
        rows_out, tuples_seen, rows_built = [], 0, 0

        for values, ok in iter_rows(text, table, ncols):
            tuples_seen += 1
            if not ok:
                warnings.append(f"{table}: tuple with {len(values)} fields (expected {ncols}); skipped")
                continue
            full = dict(zip(meta["columns"], values))
            row = {}
            for c in columns:  # denylisted columns never enter the row
                v, tf = repair_charset(full[c])
                if tf:
                    transforms[c][tf] += 1
                    if tf == "latin1->utf8" and len(samples[c]) < SAMPLE_LIMIT:
                        samples[c].append({"before": full[c], "after": v, "raw_b64": b64(full[c])})
                row[c] = v
            row["_legacy_source"] = app
            row["_legacy_table"] = table
            row["_legacy_pk"] = full.get(pk) if pk else None
            row["_dump_sha256"] = sha
            row["_dump_date"] = dump_date
            row["_ingest_run_id"] = run_id
            rows_out.append(row)
            rows_built += 1

        parity = (tuples_seen == rows_built)
        parsed_payloads[table] = rows_out
        table_reports[table] = {
            "table": table, "columns": columns,
            "rows": rows_built, "tuples_seen": tuples_seen,
            "field_count_parity": parity,
            "charset_transforms": transforms,
            "samples": {c: s for c, s in samples.items() if s},
        }
        audit_tables.append({
            "table": table, "columns_extracted": columns,
            "denylist_columns_dropped": denied,
            "rows_in_dump": tuples_seen, "rows_emitted": rows_built,
        })
        log(f"table={table}  columns={len(columns)}  tuples={tuples_seen}  emitted={rows_built}  parity={parity}")

    audit = {
        "run_id": run_id, "app": app, "engine": "python-mysqldump-parser",
        "source": {"raw_path": raw_path, "dump_sha256": sha,
                   "byte_size": os.path.getsize(raw_path), "dump_date": dump_date},
        "allowlist_applied": permitted,
        "tables_in_dump": list(tables_in_dump.keys()),
        "tables": audit_tables,
        "row_count_parity": all(t["rows_in_dump"] == t["rows_emitted"] for t in audit_tables),
        "warnings": warnings, "dry_run": dry_run,
    }

    if dry_run:
        tmp = os.path.join(tempfile_dir(), f"{app}.parse_report.json")
        _write_json(tmp, table_reports)
        log("DRY RUN — no permanent output written.")
        log(f"parse report (temp): {tmp}")
        print(json.dumps(audit, indent=2))
        return

    out_dir = os.path.join(PARSED_DIR, app)
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(REPORTS_DIR, exist_ok=True)
    for table, rows in parsed_payloads.items():
        ndjson = os.path.join(out_dir, f"{table}.ndjson")
        with open(ndjson, "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        log(f"wrote {ndjson}  ({len(rows)} rows)")
    _write_json(os.path.join(out_dir, f"{app}.parse_report.json"), table_reports)
    audit_path = os.path.join(REPORTS_DIR, f"ingest_{app}_{run_id}.audit.json")
    _write_json(audit_path, audit)
    log(f"audit report: {audit_path}")


def tempfile_dir():
    import tempfile
    return tempfile.gettempdir()


def _write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Extract allowlisted tables from sealed raw.")
    parser.add_argument("--app", required=True, help="app key (e.g. news)")
    parser.add_argument("--dry-run", action="store_true",
                        help="produce the audit report for review without writing parsed output")
    args = parser.parse_args()
    run(args.app, args.dry_run)


if __name__ == "__main__":
    main()
