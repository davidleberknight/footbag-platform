/**
 * GET /dev/personas — tester-facing catalog of every loadable persona.
 *
 * Lists the canonical catalog plus the optional per-developer .local extension
 * (the exact merge the seed runner seeds), each row carrying a Switch link to
 * /dev/switch?as=<slug>. This is the human entry point to the persona harness:
 * a tester opens the page, picks a persona, and clicks Switch to act as them.
 *
 * Permanent test scaffolding in src/testkit/. Reachability is governed entirely
 * by the env-gated /dev mount in app.ts (development + staging only); this
 * handler adds no auth of its own, mirroring /dev/switch. The slug-driven Switch
 * link is safe because /dev/switch itself 404s an unknown slug.
 */
import { Request, Response, NextFunction } from 'express';
import * as path from 'node:path';
import { CANONICAL_PERSONAS } from './canonicalPersonas';
import { loadLocalPersonas } from './personaSchemaValidator';
import type { PersonaSpec } from './personaFactory';

interface PersonaListRow {
  slug: string;
  tierLabel: string;
  /**
   * The authorization roles this persona actually holds. A single 'admin'-vs-
   * 'member' flag hid every resource-scoped role and standing flag; the catalog
   * is a coverage matrix only if a club leader reads as a club leader.
   */
  roles: string[];
  /** One sentence: what code path / gate this persona exists to exercise. */
  purpose: string;
  /** Adjacent-owner / unauthorized actor — the deny half of the matrix. */
  negative: boolean;
  coverage: string[];
  source: 'canonical' | '.local';
  switchHref: string;
}

interface PersonaGroup {
  dimension: string;
  personas: PersonaListRow[];
}

const UNGROUPED = 'Other';

const TIER_LABELS: Record<string, string> = {
  tier0: 'Tier 0',
  tier1: 'Tier 1',
  tier2: 'Tier 2',
  tier3: 'Tier 3',
};

/** The authorization roles a persona holds, beyond the bare tier ladder. */
function deriveRoles(spec: PersonaSpec): string[] {
  const roles: string[] = [];
  if (spec.isAdmin) roles.push('admin');
  if (spec.club?.role === 'leader' || spec.club?.leader) roles.push('club leader');
  if (spec.club?.role === 'co-leader') roles.push('club co-leader');
  if (spec.honors?.hof) roles.push('HoF');
  if (spec.honors?.bap) roles.push('BAP');
  if (spec.honors?.board) roles.push('IFPA Board');
  if (roles.length === 0) roles.push('member');
  return roles;
}

function toRow(spec: PersonaSpec, source: PersonaListRow['source']): PersonaListRow {
  return {
    slug: spec.slug,
    tierLabel: TIER_LABELS[spec.tier] ?? spec.tier,
    roles: deriveRoles(spec),
    purpose: spec.purpose ?? spec.coverageNotes[0] ?? '',
    negative: spec.negative ?? false,
    coverage: spec.coverageNotes,
    source,
    switchHref: `/dev/switch?as=${encodeURIComponent(spec.slug)}`,
  };
}

/** Group rows by authorization axis, preserving first-seen dimension order. */
function groupByDimension(specs: PersonaSpec[], rows: PersonaListRow[]): PersonaGroup[] {
  const groups: PersonaGroup[] = [];
  const index = new Map<string, PersonaGroup>();
  specs.forEach((spec, i) => {
    const dimension = spec.dimension ?? UNGROUPED;
    let group = index.get(dimension);
    if (!group) {
      group = { dimension, personas: [] };
      index.set(dimension, group);
      groups.push(group);
    }
    group.personas.push(rows[i]);
  });
  return groups;
}

export function getDevPersonas(_req: Request, res: Response, next: NextFunction): void {
  try {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const localPersonas = loadLocalPersonas(repoRoot);
    const specs: PersonaSpec[] = [...CANONICAL_PERSONAS, ...localPersonas];
    const sources: PersonaListRow['source'][] = [
      ...CANONICAL_PERSONAS.map(() => 'canonical' as const),
      ...localPersonas.map(() => '.local' as const),
    ];
    const rows = specs.map((spec, i) => toRow(spec, sources[i]));
    res.render('dev/persona-listing', {
      seo: { title: 'Test personas' },
      page: { sectionKey: '', pageKey: 'dev_personas', title: 'Test personas' },
      groups: groupByDimension(specs, rows),
      personaCount: rows.length,
    });
  } catch (err) {
    next(err);
  }
}
