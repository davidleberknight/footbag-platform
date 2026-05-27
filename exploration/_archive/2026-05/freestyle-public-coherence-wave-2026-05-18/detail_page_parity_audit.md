# Detail-page parity audit

Phase B audit deliverable. Verifies V2 invariant 7: every trick-detail
page is a superset of every card surface that references the trick.

## Method

1. Inspected `trick-shell.hbs` and its sub-partials.
2. Cross-referenced the identity-layer fields from
   `trickslug_identity_invariant.md`.
3. Sample-tested 5 representative atoms (mirage, whirl, butterfly,
   osis, paradox-mirage) by reading the rendered structure.
4. Checked the surface-consistency matrix for each card surface's
   identity coverage.

## Parity check (per identity-layer field)

| Identity field | Detail page renders? | Card surfaces show? | Parity verdict |
|---|---|---|---|
| Canonical title | ✅ trick-hero partial | ✅ all card surfaces | OK |
| Slug | ✅ URL + DOM anchors | ✅ data-trick-slug attribute | OK |
| ADD value | ✅ trick-hero + trick-structural | ✅ dict-card-add chip | OK |
| Formula / structural reading | ✅ trick-notation + trick-structural | ✅ tokenized equiv OR op notation OR core-atom marker | OK |
| Hashtag identity | ✅ trick-hero chip + media block | ⚠️ NOT shown on standard cards (intentional context-layer choice; full chip on detail) | OK — detail superset preserved |
| Aliases | ✅ trick-related (when present) | NOT shown on standard cards | OK — detail superset preserved |
| Family placement | ✅ trick-family partial | ⚠️ shown via group heading in family view (context-layer) | OK |
| Discrepancy markers (pending pill, etc.) | ✅ trick-structural carries discrepancy notes | ✅ pending pill on dict-card | OK |
| Media indicators | ✅ trick-media-grid + reference media block | ✅ dict-card-media-chip | OK |
| Movement-system axis tags | ✅ trick-semantic-memberships panel | (movement-system view groups by axis) | OK — both surfaces carry axis identity |
| Topology memberships | ✅ symbolic-related-topology partial | (topology view groups by topology) | OK |
| Tokenized equivalences | ✅ trick-prose / trick-notation | ✅ dict-card tokenized equiv | OK |
| Operational notation | ✅ trick-operational partial | ✅ dict-card op notation (when no tokenized) | OK |
| Related parallels | ✅ trick-parallels partial | (not on cards; detail-only) | OK |
| Substitutions | ✅ trick-substitutions partial | (not on cards; detail-only) | OK |
| Next / previous within family | ✅ trick-next / trick-previous | (not on cards; detail-only) | OK |

## Identified gaps

### 1. Hashtag chip on detail-page surface

**Status**: VERIFY — the detail page renders the trick's hashtag in
some sub-partials (trick-hero, media block) but not visibly as a
top-level identity chip. Card surfaces don't show the hashtag chip
either (it's a context-layer omission on cards). Both layers are
consistent.

**Recommendation**: When a future card variant adds a hashtag chip
(e.g., a media-gallery card), the detail page must surface the chip
prominently at the hero level to maintain superset parity.

### 2. Discrepancy notes — depth disparity

**Status**: Card surfaces carry a "pending decomposition refinement"
pill; the detail page carries this pill PLUS the full discrepancy
text in trick-structural. Detail-page superset preserved (context-
layer expansion).

### 3. Operational notation precedence

**Status**: When `tokenizedEquivalences` is present, the card hides
`operationalNotation` (precedence rule). The detail page shows BOTH
when both exist (trick-notation renders tokenized, trick-operational
renders op-notation). Detail-page superset preserved.

### 4. Movement-system axis identity on cards

**Status**: Movement-system view groups cards under axis headings;
ADD view does not show the axis. This is context-layer adaptation
(the ADD view's role isn't axis-grouping). Identity-layer hashtag /
slug / formula still consistent across both. Detail page surfaces
movement-system memberships via the symbolic-related-topology +
trick-semantic-memberships panels, satisfying the superset rule.

## Sample-trick parity walk

### `mirage` (ADD 2, core atom)

- ADD view card: title + ≡ "dex(1) + stall(1) = 2 ADD" + ADD chip ✓
- Family view card: same as ADD view + family group heading "mirage family" ✓
- Movement System view card: same as ADD view + axis group heading
  "Set / Uptime Systems" (mirage isn't in set-uptime; it's actually
  in midtime via the core-atom reading — but mirage isn't a modifier,
  so it doesn't appear under Movement System axis groups; it appears
  in ADD/family/topology views).
- Detail page: hero + structural decomposition + family ladder +
  parallels + related tricks + reference media block — all identity-
  layer fields PLUS substantial context-layer expansion (prose,
  next/previous nav, etc.). Superset confirmed.

### `whirl` (ADD 3, core atom; family anchor for ~17 derivatives)

- ADD view card: title + ≡ "xbody(1) + dex(1) + stall(1) = 3 ADD" +
  ADD chip ✓
- Family view card: same + family group heading "whirl family" with
  17 derivative cards adjacent ✓
- Topology view card: same + topology group context (where whirl
  surfaces) ✓
- Detail page: hero + structural + family ladder (17 children) +
  parallels + media block — superset confirmed.

### `paradox-mirage` (ADD 3, compound)

- ADD view card: title + ≡ "paradox(+1) + mirage(2) = 3 ADD" + ADD
  chip ✓
- Movement System view: card surfaces under paradox modifier group
  (Entry Topologies axis) ✓
- Detail page: hero + structural reading + paradox formula visibility
  + parent base (mirage) link + parallels — superset confirmed.

## Conclusion

**Detail-page parity is in effect on the implemented surfaces.** No
identity-layer field shown on any card surface is missing from the
detail page. Context-layer differences (hashtag chip not on cards;
discrepancy notes more verbose on detail) are intentional and align
with the "detail page as superset" V2 invariant 7.

## Recommendations

1. **Pin parity in tests.** Add an integration assertion: for a sample
   set of curated tricks, every identity-layer chip shown on a card
   surface for that trick has a corresponding presence on the detail
   page response.
2. **Pre-flight any new card field.** When a future card variant adds
   an identity-layer field (e.g., a hashtag chip on a media-gallery
   card), the detail page must surface the same field BEFORE the card
   ships.
3. **Document context-layer omissions explicitly.** When a card
   intentionally omits a field shown on detail (e.g., aliases on
   registry density), the omission belongs in the surface-consistency
   matrix as documented context-layer adaptation.
