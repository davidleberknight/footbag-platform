"""Suite-wide network denial for the mirror tests.

Every test here runs against local fixtures. The crawler and the group-file
recovery both reach the live site through requests, and the recovery runs as
its own process, which no in-process stub of the crawler's fetch can reach. So
the denial is made where every process inherits it: the environment. requests
honours the proxy variables, so each request, in this process or a child, goes
to a local port nothing listens on and fails at once, and a test that would
have reached the live site fails instead of passing on the site's answer.
"""
import pytest

_DEAD_PROXY = 'http://127.0.0.1:9'


@pytest.fixture(autouse=True)
def _no_live_site(monkeypatch):
    for name in ('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
                 'ALL_PROXY', 'all_proxy'):
        monkeypatch.setenv(name, _DEAD_PROXY)
    # A test serving fixtures from a local server still reaches it directly.
    for name in ('NO_PROXY', 'no_proxy'):
        monkeypatch.setenv(name, 'localhost,127.0.0.1')
