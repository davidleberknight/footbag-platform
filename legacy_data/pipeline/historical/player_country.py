"""A historical player's country, from explicit evidence only.

A player's country is shown on their public page and carried into a member's
profile at claim, so it states the person's own country, never where their events
were held. In order:

  1. a curated decision in inputs/person_country_overrides.csv (a country, or a
     hold that leaves it unknown pending review);
  2. the country on the player's legacy account profile;
  3. the country written beside the player's own name on their result lines, when
     it is repeated: one country seen at least twice and nothing else, or one
     country in at least three quarters of three or more observations.

With none of these the country is unknown. An event's location is never evidence
of a player's nationality.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter


def _fold(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip(" .")


# Spellings, local names and codes seen on profiles and result lines, folded to
# lower case without accents, mapped to the country name the archive uses.
_COUNTRY_NAMES: dict[str, str] = {}
for _name, _spellings in {
    "United States": "united states|usa|u.s.a|united states of america|america",
    "Canada": "canada|can|ca",
    "Germany": "germany|deutschland|ger|deu|de",
    "Czech Republic": "czech republic|czechia|cz|cze|ceska republika|czech",
    "Finland": "finland|suomi|fin|fi",
    "Poland": "poland|polska|pol|pl",
    "Austria": "austria|osterreich|aut|at",
    "Switzerland": "switzerland|schweiz|suisse|sui|ch|che",
    "France": "france|fra|fr",
    "Spain": "spain|espana|esp|es|basque country|euskadi",
    "Slovakia": "slovakia|slovak republic|svk|sk",
    "Hungary": "hungary|hun|hu",
    "Denmark": "denmark|danmark|den|dk|dnk",
    "Sweden": "sweden|sverige|swe|se",
    "Belgium": "belgium|belgique|bel|be",
    "Bulgaria": "bulgaria|bul|bg",
    "Slovenia": "slovenia|slo|svn|si",
    "Estonia": "estonia|est|ee",
    "Russia": "russia|rus|ru",
    "Australia": "australia|aus|au",
    "New Zealand": "new zealand|nzl|nz",
    "Chile": "chile|chi|chl|cl",
    "Colombia": "colombia|col",
    "Venezuela": "venezuela|ven|ve",
    "Netherlands": "netherlands|the netherlands|holland|ned|nl",
    "United Kingdom": "united kingdom|uk|england|great britain|gbr|scotland|wales",
    "Italy": "italy|italia|ita|it",
    "Norway": "norway|norge|nor|no",
    "Japan": "japan|jpn|jp",
    "Mexico": "mexico|mex|mx",
    "Brazil": "brazil|brasil|bra|br",
    "Israel": "israel|isr",
    "Ireland": "ireland|irl|ie",
    "Portugal": "portugal|por|pt",
    "Argentina": "argentina|arg",
    "Peru": "peru|per|pe",
    "Ukraine": "ukraine|ukr|ua",
    "Latvia": "latvia|lat|lv",
    "Lithuania": "lithuania|ltu|lt",
    "Croatia": "croatia|cro|hr",
    "Serbia": "serbia|srb|rs",
    "South Korea": "south korea|korea|kor",
    "Taiwan": "taiwan|twn|tw",
    "China": "china|chn|cn",
    "Luxembourg": "luxembourg|lux",
}.items():
    for _s in _spellings.split("|"):
        _COUNTRY_NAMES[_s] = _name

# A two-letter code that is also a United States postal code ("DE", "CA", "IN")
# is a state as often as a country, so it is not evidence of either.
_US_STATE_CODES = frozenset(
    "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj "
    "nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc".split())


def country_name(text: str) -> str:
    """The archive's name for the country `text` spells, or "" when it names none."""
    t = _fold(text or "")
    if len(t) == 2 and t in _US_STATE_CODES:
        return ""
    return _COUNTRY_NAMES.get(t, "")


_LOCATION_BLOCK = re.compile(r"<dt>Location:</dt>(.*?)</dl>", re.S)
_DD = re.compile(r"<dd>(.*?)</dd>", re.S)
_TAG = re.compile(r"<[^>]+>")


def profile_country(page_html: str) -> tuple[str, str]:
    """(the country as the profile writes it, the archive's name for it) from a
    legacy member profile page, whose location block ends with the country."""
    m = _LOCATION_BLOCK.search(page_html or "")
    values = _DD.findall(m.group(1)) if m else []
    if not values:
        return "", ""
    raw = _TAG.sub("", values[-1]).strip()
    return raw, country_name(raw)


_PAREN = re.compile(r"\(([^()]{2,40})\)")


def entry_countries(entry_raw: str) -> set[str]:
    """Countries written beside one competitor on a result line: in parentheses
    ("Name (CZ)", "Name (Czech Republic)") or as the last comma part ("Name, Town,
    Finland")."""
    found = {c for t in _PAREN.findall(entry_raw or "") for c in [country_name(t)] if c}
    parts = (entry_raw or "").rsplit(",", 1)
    if len(parts) == 2 and country_name(parts[1]):
        found.add(country_name(parts[1]))
    return found


def repeated_result_country(observed: Counter) -> str:
    """The country a player's result lines repeat, or "" when they do not agree
    enough to state one."""
    total = sum(observed.values())
    if not total:
        return ""
    top, count = observed.most_common(1)[0]
    if len(observed) == 1 and total >= 2:
        return top
    if total >= 3 and count / total >= 0.75:
        return top
    return ""


HOLD = "hold"
CURATED_STATUSES = frozenset({"manual", "verified"})
IGNORED_STATUSES = frozenset({"review"})


def choose_country(curated: str | None, account: str, observed: Counter) -> str:
    """The player's country. `curated` is None with no curated decision, HOLD for a
    decision to leave the country unknown, or the curated country."""
    if curated is not None:
        return "" if curated == HOLD else curated
    return account or repeated_result_country(observed)
