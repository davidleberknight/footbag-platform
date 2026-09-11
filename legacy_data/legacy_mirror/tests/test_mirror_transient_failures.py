"""The transient-failure record, in create_mirror_footbag_org.py.

A URL is marked visited before its fetch, and a fetch exhausted on a TRANSIENT
failure (503, timeout, DNS) deliberately records no failed_urls entry so the
dead-link pass never acts on a hiccup. Together those made a run that silently
never read N pages end looking identical to one that read everything - the
freeze-window revisit could not be proved complete. The residue is now held in
mirror_state.transient_failures, survives the progress file, clears on a later
successful fetch or a revisit, and is written out as transient_failures.txt at
the end of every crawl: the completeness proof is that file saying nothing is
owed.

An address the site answers with a server fault twice, in separate runs either
side of a targeted revisit, leaves that record for failed_urls instead. Without
that it is re-owed forever and the manifest can never empty, so the proof stops
proving anything. The bar is two SERVER faults: a transport failure says nothing
about the far end and neither settles an address nor counts towards settling
one, and being listed for a revisit is not evidence of anything at all, since
most listed addresses are healthy pages re-read for a sanitizer change.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_transient_failures.py -v
"""
import importlib.util
import logging
import os
import sys
import tempfile
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'

# All four crawl-state paths are read at import from FOOTBAG_MIRROR_STATE_DIR,
# so relocating them has to happen before the module exists. Done here, this
# module instance cannot name the live mirror tree, progress file, log or robots
# cache at all, whatever any fixture below does. The variable is put back at
# once so importing this file cannot move any other test module's paths.
_STATE_DIR = tempfile.mkdtemp(prefix='footbag-test-mirror-state-')
_PRIOR_STATE_DIR = os.environ.get('FOOTBAG_MIRROR_STATE_DIR')
os.environ['FOOTBAG_MIRROR_STATE_DIR'] = _STATE_DIR
try:
    spec = importlib.util.spec_from_file_location('mirror_script_transient', str(SCRIPT_PATH))
    mirror_script = importlib.util.module_from_spec(spec)
    sys.modules['mirror_script_transient'] = mirror_script
    spec.loader.exec_module(mirror_script)
finally:
    if _PRIOR_STATE_DIR is None:
        os.environ.pop('FOOTBAG_MIRROR_STATE_DIR', None)
    else:
        os.environ['FOOTBAG_MIRROR_STATE_DIR'] = _PRIOR_STATE_DIR

for _name in ('MIRROR_DIR', 'PROGRESS_FILE', 'LOG_FILE', 'ROBOTS_CACHE_FILE'):
    _value = getattr(mirror_script, _name)
    assert _value.startswith(_STATE_DIR), f'{_name} was not relocated: {_value}'

BASE = mirror_script.BASE_URL
URL_A = mirror_script.normalize_url(BASE + '/rules/chapter/30')
URL_B = mirror_script.normalize_url(BASE + '/news/list_2024')
URL_C = mirror_script.normalize_url(BASE + '/faq/show/12')


@pytest.fixture
def state(tmp_path, monkeypatch):
    # All four crawl-state paths together, never a subset: the crawler has four
    # and any one left pointing at the real tree is a real file a test can
    # destroy.
    mirror_dir = tmp_path / 'mirror_footbag_org'
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(mirror_dir))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE',
                        str(tmp_path / 'mirror_progress.json'))
    monkeypatch.setattr(mirror_script, 'LOG_FILE', str(tmp_path / 'mirror.log'))
    monkeypatch.setattr(mirror_script, 'ROBOTS_CACHE_FILE',
                        str(tmp_path / 'robots_cache.json'))
    st = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', st)
    (mirror_dir / 'www.footbag.org').mkdir(parents=True)
    return st


def test_the_record_survives_the_progress_file(state):
    state.transient_failures = {URL_A, URL_B}
    state.save_progress()
    reloaded = mirror_script.MirrorState()
    assert reloaded.load_progress()
    assert reloaded.transient_failures == {URL_A, URL_B}


def test_a_full_revisit_wipes_the_slate(state):
    # --revisit-all clears the visited record so every page is read again; the
    # owed list starts over with it, and the final run's residue is the truth.
    state.visited.add(URL_A)
    state.transient_failures.add(URL_A)
    mirror_script.clear_for_revisit()
    assert state.transient_failures == set()


def test_a_targeted_revisit_clears_only_the_listed_urls(state):
    state.visited.update({URL_A, URL_B})
    state.transient_failures.update({URL_A, URL_B})
    mirror_script.clear_for_revisit([URL_A])
    assert state.transient_failures == {URL_B}


def test_the_manifest_names_every_owed_url(state):
    state.transient_failures = {URL_B, URL_A}
    path = Path(mirror_script.save_transient_failures())
    body = path.read_text(encoding='utf-8')
    assert 'Total: 2' in body
    assert URL_A in body and URL_B in body


def test_an_empty_manifest_is_still_written(state):
    # An absent file and a run that owed nothing must not look the same: the
    # empty manifest IS the completeness proof.
    path = Path(mirror_script.save_transient_failures())
    assert path.is_file()
    assert 'Total: 0' in path.read_text(encoding='utf-8')


# ---------------------------------------------------------------------------
# The recorded cause, and what a repeat of it settles


def owe_on_server_fault(state, url):
    """Put an address in the state an earlier run leaves after a 5xx give-up."""
    state.transient_failures.add(url)
    state.transient_http_faults.add(url)


def owe_on_transport_failure(state, url):
    """The same, for a give-up where nothing was heard back at all."""
    state.transient_failures.add(url)


def test_the_recorded_cause_survives_the_progress_file(state):
    # The promotion decision is made a run later than the failure it rests on,
    # so the cause is only useful if it outlives the run that observed it.
    owe_on_server_fault(state, URL_A)
    owe_on_transport_failure(state, URL_B)
    state.save_progress()
    reloaded = mirror_script.MirrorState()
    assert reloaded.load_progress()
    assert reloaded.transient_http_faults == {URL_A}
    assert reloaded.transient_failures == {URL_A, URL_B}


def test_a_progress_file_without_the_cause_reads_as_no_faults(state):
    # A capture written before the cause was recorded must not have faults
    # invented for it: nothing is settled until the site answers under a run
    # that keeps this record.
    state.save_progress()
    path = Path(mirror_script.PROGRESS_FILE)
    import json
    data = json.loads(path.read_text(encoding='utf-8'))
    data['transient_failures'] = [URL_A]
    del data['transient_http_faults']
    path.write_text(json.dumps(data), encoding='utf-8')

    reloaded = mirror_script.MirrorState()
    assert reloaded.load_progress()
    assert reloaded.transient_failures == {URL_A}
    assert reloaded.transient_http_faults == set()


def test_being_listed_for_a_revisit_is_not_evidence_of_a_prior_failure(state):
    # The built-in revisit list is healthy content pages re-read for a sanitizer
    # change. One bad minute on the site while that list runs must not settle
    # any of them as permanently failed.
    state.visited.add(URL_A)
    mirror_script.clear_for_revisit([URL_A])
    assert state.revisit_second_chance == set()
    assert not mirror_script.is_standing_server_fault(URL_A, 'retryable_http')


def test_a_targeted_revisit_records_a_second_chance_only_for_an_owed_fault(state):
    owe_on_server_fault(state, URL_A)
    state.visited.update({URL_A, URL_B})
    mirror_script.clear_for_revisit([URL_A, URL_B])
    assert URL_A in state.revisit_second_chance
    assert URL_B not in state.revisit_second_chance


def test_a_full_revisit_grants_no_second_chance(state):
    # Re-reading the whole capture is not a second chance for a named address:
    # every page is being read again, so nothing there is evidence about one.
    owe_on_server_fault(state, URL_A)
    state.visited.add(URL_A)
    mirror_script.clear_for_revisit()
    assert state.revisit_second_chance == set()
    assert state.transient_http_faults == set()


def test_the_second_chance_is_not_persisted(state):
    # It records what this run was asked to do, not anything about the capture.
    # A later run that is not a targeted revisit must not inherit the judgement.
    owe_on_server_fault(state, URL_A)
    mirror_script.clear_for_revisit([URL_A])
    state.save_progress()
    reloaded = mirror_script.MirrorState()
    assert reloaded.load_progress()
    assert reloaded.revisit_second_chance == set()


def test_a_second_server_fault_on_an_owed_address_settles_it(state):
    owe_on_server_fault(state, URL_A)
    mirror_script.clear_for_revisit([URL_A])
    assert mirror_script.is_standing_server_fault(URL_A, 'retryable_http')


def test_a_prior_transport_failure_does_not_count_as_a_server_fault(state):
    # One unknown plus one server fault is one server fault. Nothing was heard
    # back the first time, which is as likely to be this end of the connection
    # as the far end, so the address starts again from a single fault.
    owe_on_transport_failure(state, URL_A)
    mirror_script.clear_for_revisit([URL_A])
    assert state.revisit_second_chance == set()
    assert not mirror_script.is_standing_server_fault(URL_A, 'retryable_http')


def test_a_transport_failure_now_settles_nothing_either(state):
    owe_on_server_fault(state, URL_A)
    mirror_script.clear_for_revisit([URL_A])
    assert not mirror_script.is_standing_server_fault(URL_A, 'retryable_transport')


def test_a_permanent_status_is_not_reclassified_by_this_rule(state):
    # 404 and friends already take the permanent path on their own evidence.
    owe_on_server_fault(state, URL_A)
    mirror_script.clear_for_revisit([URL_A])
    assert not mirror_script.is_standing_server_fault(URL_A, 'permanent_http')


# ---------------------------------------------------------------------------
# The whole path through fetch(), so the wiring is proved and not just the rule


class _ServerFaultResponse:
    """Shaped like the response requests hands back when the site 5xxs."""

    def __init__(self, url):
        self.url = url
        self.headers = {}

    def raise_for_status(self):
        err = mirror_script.requests.exceptions.HTTPError('500 Server Error')

        class _Resp:
            status_code = 500

        err.response = _Resp()
        raise err


class _ServerFaultSession:
    def get(self, url, **kwargs):
        return _ServerFaultResponse(url)


@pytest.fixture
def always_500(monkeypatch):
    monkeypatch.setattr(mirror_script, 'session_for',
                        lambda url, www_session=None: _ServerFaultSession())
    monkeypatch.setattr(mirror_script, 'polite_wait', lambda url: None)


def test_a_second_server_fault_after_a_revisit_is_failed_not_owed(state, always_500):
    owe_on_server_fault(state, URL_A)
    mirror_script.clear_for_revisit([URL_A])

    assert mirror_script.fetch(URL_A) == (None, None)
    assert URL_A in state.failed_urls
    assert URL_A not in state.transient_failures
    assert URL_A not in state.transient_http_faults
    assert state.stats['revisit_failures_made_permanent'] == 1


def test_a_first_server_fault_is_owed_with_its_cause_recorded(state, always_500):
    # The ordinary first encounter: the transient record is exactly what stops
    # the dead-link pass acting on a server that may well answer next time.
    assert mirror_script.fetch(URL_B) == (None, None)
    assert URL_B in state.transient_failures
    assert URL_B in state.transient_http_faults
    assert URL_B not in state.failed_urls
    assert state.stats['revisit_failures_made_permanent'] == 0


def test_a_server_fault_after_a_transport_give_up_is_still_only_owed(state, always_500):
    # The case the two-server-fault bar exists for: a bad local network wrote
    # the first record, so this is the site's FIRST word on the address.
    owe_on_transport_failure(state, URL_C)
    mirror_script.clear_for_revisit([URL_C])

    assert mirror_script.fetch(URL_C) == (None, None)
    assert URL_C in state.transient_failures
    assert URL_C in state.transient_http_faults
    assert URL_C not in state.failed_urls
    assert state.stats['revisit_failures_made_permanent'] == 0


def test_a_page_that_serves_on_revisit_is_owed_nothing(state, monkeypatch):
    # Success clears the owed record and the fault standing against it, so a
    # recovered address carries nothing into the next run.
    class _Ok:
        url = URL_A
        status_code = 200
        headers = {'Content-Type': 'text/html'}
        content = b'<html><body>ok</body></html>'

        def raise_for_status(self):
            return None

        def close(self):
            return None

    monkeypatch.setattr(mirror_script, 'session_for',
                        lambda url, www_session=None: type('S', (), {
                            'get': lambda self, u, **kw: _Ok()})())
    monkeypatch.setattr(mirror_script, 'polite_wait', lambda url: None)
    owe_on_server_fault(state, URL_A)
    mirror_script.clear_for_revisit([URL_A])

    resp, final = mirror_script.fetch(URL_A)

    assert resp is not None and final == URL_A
    assert URL_A not in state.transient_failures
    assert URL_A not in state.transient_http_faults
    assert URL_A not in state.failed_urls


# ---------------------------------------------------------------------------
# A redirect loop settles on its own evidence
#
# Nothing is lost in transit: the site answers every time, and what it answers
# is another redirect, until the client gives up. One observation is the site
# fully describing its behaviour, so this never goes near the two-fault rule for
# ambiguous evidence, and it is never owed. Retrying only walks the same ring
# again at real cost to the site.


class _LoopingSession:
    """Answers every request by raising the loop the client gives up on."""

    def __init__(self, counter):
        self.counter = counter

    def get(self, url, **kwargs):
        self.counter.append(url)
        raise mirror_script.requests.exceptions.TooManyRedirects(
            'Exceeded 30 redirects.')


@pytest.fixture
def always_loops(monkeypatch):
    calls = []
    monkeypatch.setattr(mirror_script, 'session_for',
                        lambda url, www_session=None: _LoopingSession(calls))
    monkeypatch.setattr(mirror_script, 'polite_wait', lambda url: None)
    return calls


def test_a_redirect_loop_is_failed_on_first_sight(state, always_loops):
    assert mirror_script.fetch(URL_A) == (None, None)
    assert URL_A in state.failed_urls
    assert URL_A not in state.transient_failures
    assert URL_A not in state.transient_http_faults
    assert state.stats['redirect_loops_settled'] == 1


def test_a_redirect_loop_is_not_retried(state, always_loops):
    # The ring costs the site a full walk every time it is entered, and the
    # second walk cannot answer differently from the first.
    mirror_script.fetch(URL_A)
    assert len(always_loops) == 1


def test_a_redirect_loop_clears_an_address_that_was_already_owed(state, always_loops):
    # Failed and outstanding at once would leave the manifest asking for a pass
    # that can no longer change anything.
    owe_on_transport_failure(state, URL_A)
    owe_on_server_fault(state, URL_B)

    mirror_script.fetch(URL_A)
    mirror_script.fetch(URL_B)

    assert state.transient_failures == set()
    assert state.transient_http_faults == set()
    assert {URL_A, URL_B} <= state.failed_urls


def test_a_redirect_loop_does_not_go_through_the_two_fault_rule(state):
    owe_on_server_fault(state, URL_A)
    mirror_script.clear_for_revisit([URL_A])
    assert not mirror_script.is_standing_server_fault(URL_A, 'permanent_redirect_loop')


def test_the_swallowed_exception_type_reaches_the_log(state, monkeypatch, caplog):
    # Every transport cause otherwise reads as "Network error", which is why a
    # deterministic site behaviour could be re-listed for revisit run after run
    # with nothing in the log to tell an operator to stop.
    class _Refusing:
        def get(self, url, **kwargs):
            raise mirror_script.requests.exceptions.ConnectionError(
                'Connection aborted')

    monkeypatch.setattr(mirror_script, 'session_for',
                        lambda url, www_session=None: _Refusing())
    monkeypatch.setattr(mirror_script, 'polite_wait', lambda url: None)
    monkeypatch.setattr(mirror_script.time, 'sleep', lambda seconds: None)
    with caplog.at_level(logging.INFO):
        mirror_script.fetch(URL_A)

    assert 'ConnectionError' in caplog.text
    assert URL_A in state.transient_failures
