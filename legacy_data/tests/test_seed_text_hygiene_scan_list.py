"""Seed text hygiene: which committed seeds the gate actually reads.

The club-member seed carries about 2,400 display names and aliases typed by
people into the legacy database, which is where encoding damage concentrates.
If the gate stops reading that file, a regeneration that mangles those names
still reports PASS having never looked at them, and the damage reaches every
club roster a visitor opens.

The URL-verdicts seed holds URLs, timestamps and machine-written reasons, so
nothing a person typed; it stays out of the scan, and a planted value there must
not fail the gate.

All offline and synthetic: each case writes its own seed tree under pytest's
temporary directory.

Run from repo root:
    python -m pytest legacy_data/tests/test_seed_text_hygiene_scan_list.py -v
"""
import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = (Path(__file__).resolve().parent.parent
               / 'pipeline' / 'qc' / 'check_seed_text_hygiene.py')
spec = importlib.util.spec_from_file_location('check_seed_text_hygiene_scan_list', str(SCRIPT_PATH))
qc = importlib.util.module_from_spec(spec)
sys.modules['check_seed_text_hygiene_scan_list'] = qc
spec.loader.exec_module(qc)

CLEAN_CLUBS = 'legacy_club_key,name\n1005960946,Kiel Footbag Club\n'


def write_seed_tree(root: Path, club_members: str, verdicts: str | None = None) -> None:
    seed = root / 'seed'
    seed.mkdir()
    (seed / 'clubs.csv').write_text(CLEAN_CLUBS, encoding='utf-8')
    (seed / 'club_members.csv').write_text(club_members, encoding='utf-8')
    if verdicts is not None:
        (seed / 'clubs_url_verdicts.csv').write_text(verdicts, encoding='utf-8')


def run_gate(root: Path, monkeypatch) -> int:
    monkeypatch.setattr(sys, 'argv', ['check_seed_text_hygiene.py', '--seed-dir', str(root)])
    return qc.main()


def test_double_encoded_member_name_fails_the_gate(tmp_path, monkeypatch, capsys):
    # "Józef" read as Latin-1 and stored: the roster would show "JÃ³zef".
    write_seed_tree(tmp_path, (
        'legacy_club_key,mirror_member_id,display_name,alias\n'
        '1005960946,69571,JÃ³zef Nowak,Joe\n'
    ))
    assert run_gate(tmp_path, monkeypatch) == 1
    out = capsys.readouterr().out
    assert 'seed/club_members.csv  1005960946  display_name  [double-encoded]' in out


def test_undecoded_escape_in_alias_fails_the_gate(tmp_path, monkeypatch, capsys):
    write_seed_tree(tmp_path, (
        'legacy_club_key,mirror_member_id,display_name,alias\n'
        '1005960946,73535,Nis Petersen,Ma&#322;y\n'
    ))
    assert run_gate(tmp_path, monkeypatch) == 1
    assert 'seed/club_members.csv  1005960946  alias  [undecoded escape]' in capsys.readouterr().out


def test_clean_member_names_pass_including_real_non_ascii(tmp_path, monkeypatch, capsys):
    write_seed_tree(tmp_path, (
        'legacy_club_key,mirror_member_id,display_name,alias\n'
        '1005960946,69571,Józef Nowak,Аня\n'
    ))
    assert run_gate(tmp_path, monkeypatch) == 0
    assert 'seed/club_members.csv: scanned, 0 damaged value(s).' in capsys.readouterr().out


def test_url_verdicts_seed_is_not_scanned(tmp_path, monkeypatch, capsys):
    write_seed_tree(
        tmp_path,
        'legacy_club_key,mirror_member_id,display_name,alias\n1005960946,69571,Asmus Helms,Asm\n',
        verdicts='legacy_club_key,url,reason\n1005960946,http://example.org/,JÃ³zef\n',
    )
    assert run_gate(tmp_path, monkeypatch) == 0
    assert 'clubs_url_verdicts' not in capsys.readouterr().out
