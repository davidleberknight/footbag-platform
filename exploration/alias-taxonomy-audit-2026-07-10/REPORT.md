# Alias / name-layer audit and taxonomy policy

Read-only audit of the freestyle alias/name layer. No alias, code, or dictionary
changes. Row-level proposals in `ALIAS_ROWS_PROPOSED.csv`.

## Name universe today

- Active canonical tricks: 921 (911 non-modifier); inactive: 40.
- Explicit alias rows (`freestyle_trick_aliases`): 381, every one typed `common`
  (the `alias_type` field is unused). 374 point to active tricks, 7 to inactive.
- Display ("Also called"), redirect, and search all read the one alias table; the
  deprecated `aliases_json` fallback carries zero unique names (252 tricks have it,
  all also have table aliases, so the fallback never fires).
- The resolver/generator knows ~71 name equivalences the table does not, so live
  redirect/search/display miss them.

## Approved alias-type policy (semantic class + display gate)

`alias_type` names the semantic class; a new `alias_display` boolean gates public
"Also called" display, defaulting true to preserve current behavior.

| type | Also called | redirect | search | trick-page list |
|---|---|---|---|---|
| common | yes | yes | yes | Also called |
| historical | only if `alias_display` | yes | yes | Deep Dive, with provenance |
| technical | only if `alias_display` | yes | yes | abbreviations expander |
| structural | only if `alias_display` and a real name | yes | yes | Deep Dive, beside decomposition |
| typo | never | yes | yes | none |
| suppressed | never | only to an active target | internal | none |
| positional | no row unless an equivalence ruling exists (then display false) | | | |
| ambiguous | no row until curator review | | | |

Suppressed-to-inactive must not public-redirect or public-search to a non-public
trick page.

## Phase 2 disposition of the 381 rows (refined heuristic)

- structural 160, common 147, historical 30, technical 27, suppressed 11, typo 6.
- Intentional hides proposed: 27 technical + 6 typo + 11 suppressed = 44 rows to
  `alias_display=false`; the rest stay displayed under default-preserve.
- Isolated rows: `front`, `back`, `no plant while` (generic/notation junk aliased
  to inactive tricks; delete), and the Infinity cluster (`infinity`, `far
  butterfly`, `double infinity`, `infinity swirl`; handled per the settled V1
  ruling: Far Butterfly retired into Butterfly, Infinity display-suppressed).
- structural/common/historical display decisions stay curator judgment under
  default-preserve; any later hiding is a display-curation pass, not mechanical.

The ~71 resolver-revealed new alias candidates are NOT promoted here; existing
alias-table taxonomy and safety come first.
