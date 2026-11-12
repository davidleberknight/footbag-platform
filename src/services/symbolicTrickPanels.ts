/**
 * symbolicTrickPanels.ts
 *
 * Trick-page view-model shaping for the "Educational" links: from a trick page to
 * the teaching page its structure points at.
 *
 * Consumes:
 *   - the trick's own base trick and modifier links, as the trick page already
 *     loads them
 *   - the family-page resolver, so a link to a family page appears only while
 *     that family has a page
 *
 * Produces:
 *   - SymbolicEducationCta[] — the "Educational" links for one trick
 *
 * Each link is decided from the trick's structured fields when the page renders,
 * never from a stored grouping: a trick published or edited in the application
 * gets the right links at once, with nothing to regenerate. Every trigger reads a
 * column or a link row, never the trick's name.
 *
 * Layer separation: the links are teaching pointers, not a classification. Output
 * carries an explicit layerSource='observational' marker on every shape.
 */

export interface SymbolicEducationCta {
  label:        string;   // "Butterfly family: how the walking tricks branch" or "Spinning modifier educational page"
  href:         string;
  layerSource:  'observational';
}

/** The structural facts the links are decided from. */
export interface SymbolicEducationInput {
  slug:          string;
  baseTrick:     string | null;
  modifierSlugs: readonly string[];
  /** A family's page link, or null when the family has no page. */
  familyPageHrefOf: (familySlug: string) => string | null;
}

// A trick with no recorded base is its own base, so the butterfly and the whirl
// themselves earn the links their descendants do.
function effectiveBase(t: SymbolicEducationInput): string {
  return t.baseTrick || t.slug;
}

// Each link and the structural condition that earns it. A trick built on the
// butterfly is part of the walking family; one built on the whirl, or carrying
// the spinning modifier, belongs with the spinning modifier's teaching page.
const CTA_DEFINITIONS: readonly {
  label:   string;
  href:    (trick: SymbolicEducationInput) => string | null;
  applies: (trick: SymbolicEducationInput) => boolean;
}[] = [
  {
    label:   'Butterfly family: how the walking tricks branch',
    href:    (t) => t.familyPageHrefOf('butterfly'),
    applies: (t) => effectiveBase(t) === 'butterfly',
  },
  {
    label:   'Spinning modifier educational page',
    href:    () => '/freestyle/modifier/spinning',
    applies: (t) => t.modifierSlugs.includes('spinning'),
  },
  {
    label:   'Spinning modifier educational page',
    href:    () => '/freestyle/modifier/spinning',
    applies: (t) => effectiveBase(t) === 'whirl',
  },
];

/**
 * Build a trick page's educational links from the trick's base trick and
 * modifier links.
 *
 * Several conditions may hold at once; the result is de-duplicated by href, so a
 * whirl-based trick that also carries the spinning modifier gets the spinning
 * link once. A link whose page does not exist is left out. Returns [] when no
 * condition holds.
 */
export function buildSymbolicEducationCtas(trick: SymbolicEducationInput): SymbolicEducationCta[] {
  const ctas: SymbolicEducationCta[] = [];
  const seenHrefs = new Set<string>();
  for (const def of CTA_DEFINITIONS) {
    if (!def.applies(trick)) continue;
    const href = def.href(trick);
    if (href === null || seenHrefs.has(href)) continue;
    seenHrefs.add(href);
    ctas.push({
      label:       def.label,
      href,
      layerSource: 'observational',
    });
  }
  return ctas;
}
