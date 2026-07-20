"""Credential-source selection for the mirror crawler.

The member password must never be required in argv (visible in ps / shell
history). resolve_password() takes it from the FOOTBAG_MIRROR_PASSWORD
environment variable when set, else a positional value (deprecated, warned),
else a secure getpass prompt. These tests pin that precedence and prove the
password value is never emitted in a log message. No real credential is used;
the values below are throwaway test fixtures.

Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_credentials.py -v
"""
import importlib.util
import logging
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_credentials', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_credentials'] = mirror_script
spec.loader.exec_module(mirror_script)

ENV = mirror_script.PASSWORD_ENV_VAR
ENV_SECRET = 'env-fixture-secret'
CLI_SECRET = 'cli-fixture-secret'
PROMPT_SECRET = 'prompt-fixture-secret'


def test_env_variable_is_preferred_over_positional(monkeypatch, caplog):
    monkeypatch.setenv(ENV, ENV_SECRET)
    monkeypatch.setattr(mirror_script.getpass, 'getpass',
                        lambda *a, **k: pytest.fail('getpass must not be called when env is set'))
    with caplog.at_level(logging.WARNING):
        got = mirror_script.resolve_password(CLI_SECRET)
    assert got == ENV_SECRET
    # A redundant argv password is warned about, and neither secret value leaks
    # into the log text.
    assert any(ENV in r.getMessage() for r in caplog.records)
    assert not any(ENV_SECRET in r.getMessage() or CLI_SECRET in r.getMessage()
                   for r in caplog.records)


def test_env_variable_used_when_no_positional(monkeypatch):
    monkeypatch.setenv(ENV, ENV_SECRET)
    monkeypatch.setattr(mirror_script.getpass, 'getpass',
                        lambda *a, **k: pytest.fail('getpass must not be called when env is set'))
    assert mirror_script.resolve_password(None) == ENV_SECRET


def test_positional_used_with_deprecation_warning_when_env_absent(monkeypatch, caplog):
    monkeypatch.delenv(ENV, raising=False)
    with caplog.at_level(logging.WARNING):
        got = mirror_script.resolve_password(CLI_SECRET)
    assert got == CLI_SECRET
    msgs = ' '.join(r.getMessage() for r in caplog.records)
    assert 'DEPRECATED' in msgs and 'unsafe' in msgs.lower()
    assert CLI_SECRET not in msgs           # the value itself is never logged


def test_getpass_prompt_when_no_env_and_no_positional(monkeypatch):
    monkeypatch.delenv(ENV, raising=False)
    prompts = []
    monkeypatch.setattr(mirror_script.getpass, 'getpass',
                        lambda prompt='': (prompts.append(prompt), PROMPT_SECRET)[1])
    assert mirror_script.resolve_password(None) == PROMPT_SECRET
    assert prompts and 'password' in prompts[0].lower()


def test_empty_env_falls_through_to_positional(monkeypatch, caplog):
    # An empty env var is treated as unset, so a positional value is still usable.
    monkeypatch.setenv(ENV, '')
    with caplog.at_level(logging.WARNING):
        assert mirror_script.resolve_password(CLI_SECRET) == CLI_SECRET


def test_password_is_not_a_required_positional_argument(monkeypatch):
    # parse_args() must accept a username-only command line (password optional).
    monkeypatch.setattr(sys, 'argv', ['create_mirror_footbag_org.py', 'someuser'])
    args = mirror_script.parse_args()
    assert args.username == 'someuser'
    assert args.password is None
