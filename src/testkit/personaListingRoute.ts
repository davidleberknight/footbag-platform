/**
 * GET /dev/personas — tester-facing catalog of every loadable persona.
 *
 * Lists the canonical persona catalog, each row carrying a Switch link to
 * /dev/switch?as=<slug>. This is the human entry point to the persona harness:
 * a tester opens the page, picks a persona, and clicks Switch to act as them.
 *
 * Permanent test scaffolding in src/testkit/. Reachability is governed entirely
 * by the env-gated /dev mount in app.ts (development + staging only); this
 * handler adds no auth of its own, mirroring /dev/switch. The slug-driven Switch
 * link is safe because /dev/switch itself 404s an unknown slug.
 */
import { Request, Response, NextFunction } from 'express';
import { auth } from '../db/db';
import { CANONICAL_PERSONAS } from './canonicalPersonas';
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
  /** Plain-words how a tester uses this persona and what to verify. */
  testingUsage: string;
  /** When set, the backing feature is not built yet (persona is greyed). */
  blockedBy?: string;
  /** Plain-English user story this persona traces to, shown beside a blocked persona. */
  userStory?: string;
  /**
   * A seeded member row exists and the feature is not blocked, so the persona is
   * real. A row that is not backed renders greyed.
   */
  backed: boolean;
  /**
   * The session lookup the switch route uses resolves this persona, so a Switch
   * link will succeed. A backed persona is still not switchable when its state
   * blocks login (unverified, deceased, soft-deleted): real, but no session.
   */
  switchable: boolean;
  /**
   * For a backed persona whose login is blocked (unverified, deceased,
   * soft-deleted), the /dev/login link that runs the real login attempt. Lets a
   * login-blocked persona be an exercisable link instead of a dead row.
   */
  loginHref?: string;
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
  if (spec.club?.role === 'co-leader' || spec.club?.leader) roles.push('club co-leader');
  if (spec.honors?.hof) roles.push('HoF');
  if (spec.honors?.bap) roles.push('BAP');
  if (spec.honors?.board) roles.push('IFPA Board');
  if (roles.length === 0) roles.push('member');
  return roles;
}

function toRow(
  spec: PersonaSpec,
  backed: boolean,
  switchable: boolean,
): PersonaListRow {
  return {
    slug: spec.slug,
    tierLabel: TIER_LABELS[spec.tier] ?? spec.tier,
    roles: deriveRoles(spec),
    purpose: spec.purpose ?? spec.coverageNotes[0] ?? '',
    negative: spec.negative ?? false,
    coverage: spec.coverageNotes,
    testingUsage: spec.testingUsage,
    ...(spec.blockedBy ? { blockedBy: spec.blockedBy } : {}),
    ...(spec.userStory ? { userStory: spec.userStory } : {}),
    backed,
    switchable,
    ...(backed && !switchable
      ? { loginHref: `/dev/login?as=${encodeURIComponent(spec.slug)}` }
      : {}),
    switchHref: spec.buildOnSwitch
      ? `/dev/build-switch?as=${encodeURIComponent(spec.slug)}`
      : `/dev/switch?as=${encodeURIComponent(spec.slug)}`,
  };
}

/**
 * A persona is backed when its feature is built (no blockedBy) and a member row
 * was seeded for its slug. The raw existence probe counts login-blocked and
 * soft-deleted personas as backed (they are real, just not switchable).
 */
function isPersonaBacked(spec: PersonaSpec): boolean {
  if (spec.blockedBy) return false;
  return Boolean(auth.personaMemberExistsBySlug.get(spec.slug));
}

/**
 * A persona is switchable when the session lookup the switch route runs resolves
 * it. Using that exact query as the oracle keeps the listing and the route in
 * lockstep: a Switch link appears only when /dev/switch will succeed, so the
 * listing never offers a link that 404s.
 */
function isPersonaSwitchable(spec: PersonaSpec): boolean {
  if (spec.blockedBy) return false;
  return Boolean(auth.findMemberForSessionBySlug.get(spec.slug));
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
    // A build-on-switch persona (DL) shows wherever /dev mounts (dev + staging,
    // never prod) and always offers a Switch, which builds it on first click;
    // other personas show a Switch only when seeded and switchable.
    const rows = CANONICAL_PERSONAS.map((spec) =>
      spec.buildOnSwitch
        ? toRow(spec, true, true)
        : toRow(spec, isPersonaBacked(spec), isPersonaSwitchable(spec)),
    );
    res.render('dev/persona-listing', {
      seo: { title: 'Test personas' },
      page: { sectionKey: '', pageKey: 'dev_personas', title: 'Test personas' },
      groups: groupByDimension(CANONICAL_PERSONAS, rows),
      personaCount: rows.length,
    });
  } catch (err) {
    next(err);
  }
}
