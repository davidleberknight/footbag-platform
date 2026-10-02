/**
 * symbolicTrickPanels.ts
 *
 * Trick-page view-model shaping drawn from the observational symbolic-grammar
 * layer.
 *
 * Consumes:
 *   - symbolicGrammarService (the symbolic-grammar memberships)
 *
 * Produces:
 *   - SymbolicEducationCta[] — the "Educational" links from a trick page to the
 *     teaching page its symbolic-group membership points at
 *
 * Layer separation: never reads from canonical IFPA tables. Output carries an
 * explicit layerSource='observational' marker on every shape.
 */
import { symbolicGrammarService } from './symbolicGrammarService';

export interface SymbolicEducationCta {
  label:        string;   // "Walking-family progression" or "Spinning modifier educational page"
  href:         string;
  layerSource:  'observational';
}

// CTA inputs (label + href + the membership-based trigger condition).
const CTA_DEFINITIONS = [
  {
    triggerGroupId: 'butterfly-wing-topology',
    label:          'Walking-family progression',
    href:           '/freestyle/progression/walking-family',
  },
  {
    triggerGroupId: 'spinning-family',
    label:          'Spinning modifier educational page',
    href:           '/freestyle/modifier/spinning',
  },
  {
    triggerGroupId: 'whirl-rotational-topology',
    label:          'Spinning modifier educational page',
    href:           '/freestyle/modifier/spinning',
  },
] as const;

/**
 * Build trick-page educational CTAs from the trick's symbolic-group memberships.
 *
 * Multiple memberships may produce multiple CTAs; the result is de-duplicated
 * by href (montage, for example, belongs to BOTH spinning-family AND
 * whirl-rotational-topology — both fire the same spinning-modifier CTA, but
 * it's emitted once).
 *
 * Returns [] when the trick has no triggering memberships OR when the trick
 * slug equals the destination (avoid linking a trick page back to its own
 * surface).
 */
export function buildSymbolicEducationCtas(slug: string): SymbolicEducationCta[] {
  const memberships = symbolicGrammarService.getMembershipsForSlug(slug);
  const groupIds = new Set(memberships.map(m => m.symbolicGroupId));

  const ctas: SymbolicEducationCta[] = [];
  const seenHrefs = new Set<string>();
  for (const def of CTA_DEFINITIONS) {
    if (!groupIds.has(def.triggerGroupId)) continue;
    if (seenHrefs.has(def.href)) continue;
    seenHrefs.add(def.href);
    ctas.push({
      label:       def.label,
      href:        def.href,
      layerSource: 'observational',
    });
  }
  return ctas;
}
