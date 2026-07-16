"""Synthetic-image tests for the gallery thumbnail regenerator.

Covers the pairing-to-destination mapping, the legacy 100x150 fit-within
aspect behavior, EXIF orientation applied before the resize with metadata
stripped from the output, PNG/JPEG inputs and transparency flattening, refusal
to overwrite an existing thumbnail, absent or malformed database metadata,
corrupt source input, dry-run writing nothing, and byte-deterministic repeated
execution.

This suite needs Pillow. It is written to run two ways, because no single
project virtualenv currently carries both Pillow and pytest: under pytest it
skips cleanly where Pillow is absent (the pipeline venv); under a Pillow
interpreter without pytest it runs its own checks via __main__.
    python legacy_data/tests/test_regenerate_gallery_thumbnails.py
"""
import importlib.util
import os
import sys
import tempfile
from pathlib import Path

try:
    import pytest
    pytest.importorskip("PIL")
except ImportError:
    pytest = None

from PIL import Image

_GEN = Path(__file__).resolve().parent.parent / "scripts" / "regenerate_gallery_thumbnails.py"
_spec = importlib.util.spec_from_file_location("thumbgen", str(_GEN))
gen = importlib.util.module_from_spec(_spec)
sys.modules["thumbgen"] = gen
_spec.loader.exec_module(gen)

BASE = "http://www.footbag.org/media"


# ── helpers ──────────────────────────────────────────────────────────────────

def _scratch():
    return tempfile.mkdtemp(prefix="footbag-thumbtest-")


def _dump(rows):
    """Build a minimal `images` INSERT. rows: (rid, is_local, file, thumb, tw, th)."""
    tuples = []
    for rid, isl, lf, lt, tw, th in rows:
        vals = [str(rid), "'pid'", "1", "'set'", str(isl), f"'{lf}'", f"'{lt}'",
                str(tw), str(th), "''", "1", "'photo'", "'jpg'"]
        tuples.append("(" + ",".join(vals) + ")")
    return "INSERT INTO `images` VALUES " + ",".join(tuples) + ";\n"


def _write_dump(tmp, rows):
    p = os.path.join(tmp, "gallery.sql")
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(_dump(rows))
    return p


def _write_image(tmp, url, size, color=(30, 90, 160), mode="RGB",
                 exif_orientation=None, fmt=None):
    path = gen.mirror_path(tmp, url)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.new(mode, size, color)
    save_kw = {}
    if exif_orientation is not None:
        ex = im.getexif()
        ex[274] = exif_orientation
        save_kw["exif"] = ex.tobytes()
    fmt = fmt or ("PNG" if path.lower().endswith(".png") else "JPEG")
    im.save(path, fmt, **save_kw)
    return path


def _one(tmp, file_url, thumb_url, tw=0, th=0):
    return _write_dump(tmp, [(1, 1, file_url, thumb_url, tw, th)])


# ── 1. pairing and destination path ──────────────────────────────────────────

def test_pairing_and_destination_path():
    tmp = _scratch()
    f = f"{BASE}/5/photo.jpg"
    t = f"{BASE}/.thumb/5/photo.jpg"
    _write_image(tmp, f, (400, 300))
    rep = gen.run(_one(tmp, f, t), tmp, apply=True)
    assert rep["counts"]["generated"] == 1
    dst = rep["generated"][0]["dst"]
    assert dst.endswith("www.footbag.org/media/.thumb/5/photo.jpg")
    assert os.path.isfile(dst)


# ── 2. legacy fit-within aspect behavior ─────────────────────────────────────

def test_fit_within_box_preserves_aspect():
    assert gen.compute_fit(400, 300) == (100, 75)     # landscape hits width
    assert gen.compute_fit(200, 200) == (100, 100)    # square
    assert gen.compute_fit(300, 400) == (100, 133)    # portrait, width-bound
    assert gen.compute_fit(100, 200) == (75, 150)     # portrait, height-bound
    assert gen.compute_fit(50, 50) == (100, 100)      # small source enlarges (legacy -scale)


# ── 3. EXIF orientation applied before resize, then stripped ─────────────────

def test_exif_orientation_applied_before_resize_and_stripped():
    tmp = _scratch()
    f = f"{BASE}/9/rot.jpg"
    t = f"{BASE}/.thumb/9/rot.jpg"
    # Stored 120x60 landscape with orientation=6 (display rotated to 60x120).
    _write_image(tmp, f, (120, 60), exif_orientation=6)
    rep = gen.run(_one(tmp, f, t), tmp, apply=True)
    # Upright dims drive the fit: compute_fit(60,120) == (75,150), not (100,50).
    assert rep["generated"][0]["result_dims"] == [75, 150]
    out = Image.open(rep["generated"][0]["dst"])
    assert out.size == (75, 150)
    assert 274 not in out.getexif()                    # orientation tag removed


# ── 4. PNG input and transparency flattening ─────────────────────────────────

def test_png_transparency_flattened_to_jpeg():
    tmp = _scratch()
    f = f"{BASE}/3/logo.png"
    t = f"{BASE}/.thumb/3/logo.png"     # legacy keeps the .png name; bytes are JPEG
    _write_image(tmp, f, (200, 200), color=(0, 0, 0, 0), mode="RGBA")
    rep = gen.run(_one(tmp, f, t), tmp, apply=True)
    assert rep["counts"]["generated"] == 1
    out = Image.open(rep["generated"][0]["dst"])
    assert out.format == "JPEG"        # JPEG bytes under the .png destination name
    assert out.mode == "RGB"           # alpha flattened away


# ── 5. never overwrite an existing thumbnail ─────────────────────────────────

def test_refuses_to_overwrite_existing_thumbnail():
    tmp = _scratch()
    f = f"{BASE}/2/a.jpg"
    t = f"{BASE}/.thumb/2/a.jpg"
    _write_image(tmp, f, (400, 300))
    dst = gen.mirror_path(tmp, t)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "wb") as fh:
        fh.write(b"ALREADY-A-THUMBNAIL")
    rep = gen.run(_one(tmp, f, t), tmp, apply=True)
    assert rep["counts"]["generated"] == 0
    assert dst in rep["existing"]
    with open(dst, "rb") as fh:
        assert fh.read() == b"ALREADY-A-THUMBNAIL"     # untouched


# ── 6. absent / malformed database metadata ──────────────────────────────────

def test_absent_db_dims_still_generates_and_is_flagged():
    tmp = _scratch()
    f = f"{BASE}/7/n.jpg"
    t = f"{BASE}/.thumb/7/n.jpg"
    _write_image(tmp, f, (400, 300))
    rep = gen.run(_one(tmp, f, t, tw=0, th=0), tmp, apply=True)   # dims absent (0)
    assert rep["counts"]["generated"] == 1
    assert rep["generated"][0]["db_dims_status"] == "absent"
    assert rep["counts"]["invalid_metadata"] == 1


def test_stale_db_dims_are_reported_as_mismatch_not_trusted():
    tmp = _scratch()
    f = f"{BASE}/7/m.jpg"
    t = f"{BASE}/.thumb/7/m.jpg"
    _write_image(tmp, f, (400, 300))
    rep = gen.run(_one(tmp, f, t, tw=999, th=999), tmp, apply=True)
    g = rep["generated"][0]
    assert g["result_dims"] == [100, 75]               # recomputed, not the stale 999x999
    assert g["db_dims_status"] == "mismatch"


def test_malformed_row_is_skipped_not_crashed():
    tmp = _scratch()
    # A truncated tuple (too few columns) must not abort the run.
    dump = os.path.join(tmp, "g.sql")
    with open(dump, "w") as fh:
        fh.write("INSERT INTO `images` VALUES (1,'pid',1);\n")
    rep = gen.run(dump, tmp, apply=True)
    assert rep["counts"]["generated"] == 0


# ── 7. corrupt image input ───────────────────────────────────────────────────

def test_corrupt_source_reported_undecodable_no_write():
    tmp = _scratch()
    f = f"{BASE}/8/broken.jpg"
    t = f"{BASE}/.thumb/8/broken.jpg"
    src = gen.mirror_path(tmp, f)
    os.makedirs(os.path.dirname(src), exist_ok=True)
    with open(src, "wb") as fh:
        fh.write(b"this is not an image")
    rep = gen.run(_one(tmp, f, t), tmp, apply=True)
    assert rep["counts"]["generated"] == 0
    assert rep["counts"]["undecodable"] == 1
    assert not os.path.exists(gen.mirror_path(tmp, t))


# ── 8. dry-run writes nothing ────────────────────────────────────────────────

def test_dry_run_reports_intended_writes_but_creates_nothing():
    tmp = _scratch()
    f = f"{BASE}/4/d.jpg"
    t = f"{BASE}/.thumb/4/d.jpg"
    _write_image(tmp, f, (400, 300))
    rep = gen.run(_one(tmp, f, t), tmp, apply=False)
    assert rep["counts"]["generated"] == 1             # intended
    assert rep["generated"][0]["written"] is False
    assert not os.path.exists(gen.mirror_path(tmp, t))  # nothing on disk


# ── 9. ambiguous duplicate destination is rejected ───────────────────────────

def test_ambiguous_duplicate_destination_rejected():
    tmp = _scratch()
    t = f"{BASE}/.thumb/6/dup.jpg"
    f1, f2 = f"{BASE}/6/a.jpg", f"{BASE}/6/b.jpg"
    _write_image(tmp, f1, (400, 300))
    _write_image(tmp, f2, (300, 400))
    dump = _write_dump(tmp, [(1, 1, f1, t, 0, 0), (2, 1, f2, t, 0, 0)])
    rep = gen.run(dump, tmp, apply=True)
    assert rep["counts"]["generated"] == 0
    assert rep["counts"]["ambiguous"] == 1
    assert not os.path.exists(gen.mirror_path(tmp, t))  # did not guess a row


# ── 10. deterministic, idempotent repeated execution ─────────────────────────

def test_output_is_byte_deterministic():
    tmp = _scratch()
    f = f"{BASE}/1/det.jpg"
    t1, t2 = f"{BASE}/.thumb/1/det.jpg", f"{BASE}/.thumb/1b/det.jpg"
    _write_image(tmp, f, (640, 480))
    gen.run(_one(tmp, f, t1), tmp, apply=True)
    gen.run(_one(tmp, f, t2), tmp, apply=True)
    with open(gen.mirror_path(tmp, t1), "rb") as a, open(gen.mirror_path(tmp, t2), "rb") as b:
        assert a.read() == b.read()


def test_repeated_run_is_a_no_op():
    tmp = _scratch()
    f = f"{BASE}/1/idem.jpg"
    t = f"{BASE}/.thumb/1/idem.jpg"
    _write_image(tmp, f, (400, 300))
    dump = _one(tmp, f, t)
    first = gen.run(dump, tmp, apply=True)
    second = gen.run(dump, tmp, apply=True)
    assert first["counts"]["generated"] == 1
    assert second["counts"]["generated"] == 0
    assert second["counts"]["existing"] == 1


if __name__ == "__main__":
    fns = [(n, o) for n, o in sorted(globals().items())
           if n.startswith("test_") and callable(o)]
    failures = 0
    for name, fn in fns:
        try:
            fn()
            print(f"  PASS {name}")
        except Exception as exc:
            failures += 1
            print(f"  FAIL {name}: {exc.__class__.__name__}: {exc}")
    print(f"\n{len(fns) - failures}/{len(fns)} passed")
    sys.exit(1 if failures else 0)
