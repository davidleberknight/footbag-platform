/**
 * symbolicGlossaryPanels.ts
 *
 * Connective-tissue panels for the freestyle glossary page. Per UX-SHIP-1
 * Phase 7 (Task E). Each panel surfaces:
 *   - a short coach-tone definition
 *   - 4-6 related pilot-tier tricks (from symbolic_group_membership)
 *   - 1-2 related symbolic groups
 *   - a brief notation/operator hint
 *   - an optional deep-link to a modifier-family page (Phase 6: only spinning)
 *
 * Phase 7 panels (6): paradox / symposium / ducking / spinning / whirl / pixie.
 *
 * Design philosophy: this is a SUPPORTING SURFACE inside the glossary — not
 * a query-result list. Definitions are coach-tone; panel size is small;
 * member lists are capped at 6. The panel's job is to point the reader to
 * the next surface (modifier-family page, trick page, progression), not to
 * be the definitive reference for the term.
 */
import type { FreestyleTrickRow } from '../db/db';
import { symbolicGrammarService } from './symbolicGrammarService';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface GlossaryRelatedTrick {
  slug:          string;
  canonicalName: string;
  adds:          string | null;
  detailHref:    string;
}

export interface GlossaryRelatedSymbolicGroup {
  groupId:     string;
  displayName: string;
  axis:        string;
}

export interface GlossaryConnectivePanel {
  term:                  string;   // 'paradox'
  anchorId:              string;   // 'glossary-panel-paradox'
  displayName:           string;   // 'Paradox'
  shortDefinition:       string;   // coach-tone
  symbolicGroupId:       string;
  relatedTricks:         GlossaryRelatedTrick[];
  relatedSymbolicGroups: GlossaryRelatedSymbolicGroup[];
  notationHint:          string;
  modifierFamilyHref:    string | null;   // null when no /freestyle/modifier/:slug page exists
  layerSource:           'observational';
}

// ─────────────────────────────────────────────────────────────────────────
// Authored content — 6 terms (Phase 7 pilot scope)
// ─────────────────────────────────────────────────────────────────────────

interface PanelInput {
  term:                 string;
  displayName:          string;
  shortDefinition:      string;
  symbolicGroupId:      string;
  relatedSymbolicGroups: Array<{ groupId: string; displayLabel?: string }>;
  notationHint:         string;
  hasModifierFamilyPage: boolean;
}

const PANEL_INPUTS: PanelInput[] = [
  {
    term:             'paradox',
    displayName:      'Paradox',
    shortDefinition:
      'A body modifier where the kicking leg pivots under the bag from a cross-body set. The hip leads; the dex follows along the pivot.',
    symbolicGroupId:  'paradox-family',
    relatedSymbolicGroups: [
      { groupId: 'symposium-family' },
      { groupId: 'spinning-family' },
    ],
    notationHint:
      'Canonical formula: <code>PDX &rarr; CLIP &gt; OP IN [DEX]</code> &mdash; clipper set, then a far in-out dex. Always paired with a cross-body set source.',
    hasModifierFamilyPage: false,
  },
  {
    term:             'symposium',
    displayName:      'Symposium',
    shortDefinition:
      'A no-plant body discipline: the support leg stays off the ground during the modified beat. The active leg works while the other foot is in the air.',
    symbolicGroupId:  'symposium-family',
    relatedSymbolicGroups: [
      { groupId: 'paradox-family' },
      { groupId: 'spinning-family' },
    ],
    notationHint:
      'In operational notation: `(no plant while)` pre-state on the next beat. Related family: symple (foot returns midway) and muted (no plant at all).',
    hasModifierFamilyPage: false,
  },
  {
    term:             'ducking',
    displayName:      'Ducking',
    shortDefinition:
      'A head dip toward the bag, allowing the bag to pass around the neck. Part of a four-variant head-motion family: ducking, diving, weaving, zulu.',
    symbolicGroupId:  'ducking-family',
    relatedSymbolicGroups: [
      { groupId: 'diving-family' },
      { groupId: 'spinning-family' },
    ],
    notationHint:
      'In operational notation: `Duck (BOD)` beat. Direction pre-states `(back)` or `(front)` orient the duck.',
    hasModifierFamilyPage: false,
  },
  {
    term:             'spinning',
    displayName:      'Spinning',
    shortDefinition:
      'A full-body rotation that carries through the dex moment. The body turns completely around during the kick rather than chasing the bag afterward.',
    symbolicGroupId:  'spinning-family',
    relatedSymbolicGroups: [
      { groupId: 'paradox-family' },
      { groupId: 'symposium-family' },
    ],
    notationHint:
      'In operational notation: `(BOD)` flag on the spin beat with `(back)` or `(front)` pre-state.',
    hasModifierFamilyPage: true,
  },
  {
    term:             'whirl',
    displayName:      'Whirl',
    shortDefinition:
      'A rotational base trick: the body turns through the dex along the whirl arc. The largest family in the dictionary; many compounds inherit its rotational shape.',
    symbolicGroupId:  'whirl-rotational-topology',
    relatedSymbolicGroups: [
      { groupId: 'swirl-rotational-topology' },
      { groupId: 'torque-rotational-topology' },
    ],
    notationHint:
      'In operational notation: `Front Whirl` or `Back Whirl` as a rotational dex variant on the whirl base.',
    hasModifierFamilyPage: false,
  },
  {
    term:             'pixie',
    displayName:      'Pixie',
    shortDefinition:
      'A set modifier that tightens the dex moment. The foot path through the kick is shorter and more enclosed; the bag arc compresses.',
    symbolicGroupId:  'pixie-family',
    relatedSymbolicGroups: [
      { groupId: 'quantum-family' },
      { groupId: 'atomic-family' },
    ],
    notationHint:
      'In operational notation: appears as a named modifier token (e.g., `Pixie Mirage` = Smear, `Pixie Butterfly` = Dimwalk).',
    hasModifierFamilyPage: false,
  },
];

const MAX_RELATED_TRICKS = 6;

// ─────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build all 6 connective glossary panels.
 *
 * Returns an empty array when staging CSVs are missing (fail-graceful);
 * individual panels may omit related-tricks lists if the group has no
 * pilot-tier members in the dict.
 */
export function buildGlossaryConnectivePanels(
  allDictRows: readonly FreestyleTrickRow[],
): GlossaryConnectivePanel[] {
  const pilotRows = new Map<string, FreestyleTrickRow>();
  for (const row of allDictRows) {
    if (row.category === 'modifier') continue;       // modifier-stub exclusion
    pilotRows.set(row.slug, row);
  }

  return PANEL_INPUTS.map(input => {
    // Resolve related tricks via group membership
    const memberships = symbolicGrammarService.getMembersOfGroup(input.symbolicGroupId);
    const relatedTricks: GlossaryRelatedTrick[] = [];
    const seenSlugs = new Set<string>();
    for (const m of memberships) {
      if (seenSlugs.has(m.trickSlug)) continue;
      seenSlugs.add(m.trickSlug);
      const dictRow = pilotRows.get(m.trickSlug);
      if (!dictRow) continue;
      relatedTricks.push({
        slug:          dictRow.slug,
        canonicalName: dictRow.canonical_name,
        adds:          dictRow.adds,
        detailHref:    `/freestyle/tricks/${dictRow.slug}`,
      });
      if (relatedTricks.length >= MAX_RELATED_TRICKS) break;
    }

    // Resolve related symbolic groups — pull display name from registry
    const relatedSymbolicGroups: GlossaryRelatedSymbolicGroup[] = [];
    for (const rg of input.relatedSymbolicGroups) {
      const modGroup = symbolicGrammarService.getModifierGroup(rg.groupId);
      const topoGroup = symbolicGrammarService.getTopologyGroup(rg.groupId);
      const def = modGroup ?? topoGroup;
      if (!def) continue;
      relatedSymbolicGroups.push({
        groupId:     def.symbolicGroupId,
        displayName: rg.displayLabel ?? def.displayName,
        axis:        def.classificationAxis,
      });
    }

    return {
      term:                  input.term,
      anchorId:              `glossary-panel-${input.term}`,
      displayName:           input.displayName,
      shortDefinition:       input.shortDefinition,
      symbolicGroupId:       input.symbolicGroupId,
      relatedTricks,
      relatedSymbolicGroups,
      notationHint:          input.notationHint,
      modifierFamilyHref:    input.hasModifierFamilyPage ? `/freestyle/modifier/${input.term}` : null,
      layerSource:           'observational',
    };
  });
}
