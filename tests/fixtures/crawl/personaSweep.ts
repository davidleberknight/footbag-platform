/**
 * The persona sweep: every catalog persona, signed in through the same switch a
 * tester uses, walked over the pages whose content depends on who is looking,
 * with the full page oracles.
 *
 * Each persona first renders a fixed set of probe pages (its own profile and
 * edit page, the section roots, the canary members' profiles, the wizard and
 * the admin home). Personas whose probe pages come back in a shape already
 * seen in this part (the same statuses and the same rendered targets, with the
 * persona's own slug factored out) add nothing new; every other persona then
 * walks a bounded sample of the pages those probes link to, so tier, honor,
 * club-role and onboarding-state surfaces are crawled rather than only loaded.
 * The sample is deliberately bounded and does not report reaching its bound:
 * the full crawls own exhaustive coverage, the sweep owns persona breadth.
 *
 * A persona whose account cannot hold a session (unverified, deceased, inside
 * or past the deletion grace period) must be refused by the switch; a persona
 * that should hold one and is refused is a finding. A persona blocked on an
 * unbuilt feature is not swept. The catalog is split across part files by position so vitest runs
 * the parts in parallel; the split is a load balance, not a shard of CI.
 */
import { createHash } from 'node:crypto';
import { CANONICAL_PERSONAS } from '../../../src/testkit/canonicalPersonas';
import type { PersonaSpec } from '../../../src/testkit/personaFactory';
import {
  crawl,
  extractTargets,
  switchTo,
  type CrawlPersona,
  type Fetcher,
} from './core';
import type { Canary, Finding } from './oracles';
import { errorPageChecks, pageChecks } from './pageChecks';
import { CRAWL_MEDIA_ITEM_ID, shouldSkip } from './seedCrawlFixture';

const ONBOARDING_TASKS = ['personal_details', 'legacy_claim', 'club_affiliations'] as const;

export function canHoldSession(p: PersonaSpec): boolean {
  return p.emailVerified !== false && !p.isDeceased && !p.deletionState;
}

export function isOnboarded(p: PersonaSpec): boolean {
  if (p.onboardingTasks === undefined) return true;
  return ONBOARDING_TASKS.every((t) => p.onboardingTasks?.[t] === 'completed');
}

/** This part's share of the catalog: every persona whose position falls to it. */
export function personasForPart(part: number, parts: number): PersonaSpec[] {
  return [...CANONICAL_PERSONAS]
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .filter((_, i) => i % parts === part);
}

// The media item page is probed directly because its own-item and reporting
// controls depend on who is looking, and a bounded walk need not reach it.
function probePages(slug: string, admin: boolean): string[] {
  return [
    '/', `/members/${slug}`, `/members/${slug}/edit`, '/members', '/clubs', '/events', '/media',
    '/freestyle', '/hof', '/records', '/members/canary_hidden', '/members/canary_shown',
    '/register/wizard/personal_details', '/legal', admin ? '/admin' : '/admin/bootstrap-claim',
    `/media/item/${CRAWL_MEDIA_ITEM_ID}`,
  ];
}

const PROBE_FOLLOW_PAGES = 60;

export interface SweepResult {
  findings: Finding[];
  swept: string[];
  deepened: string[];
}

export async function sweepPersonas(
  personas: readonly PersonaSpec[],
  fetcher: Fetcher,
  opts: { selfOrigin: string; canaries: readonly Canary[]; loggedErrorCount: () => number },
): Promise<SweepResult> {
  const findings: Finding[] = [];
  const swept: string[] = [];
  const deepened: string[] = [];
  const shapes = new Set<string>();
  for (const spec of personas) {
    // A blocked persona stands for a feature not built yet; only implemented
    // scope is swept.
    if (spec.blockedBy) continue;
    const cookie = await switchTo(fetcher, spec.slug);
    if (!canHoldSession(spec)) {
      if (cookie) {
        findings.push({ persona: spec.slug, url: `/dev/switch?as=${spec.slug}`, via: '(sweep)', oracle: 'shown-but-refused',
          problem: 'a persona whose account cannot hold a session was issued one' });
      }
      continue;
    }
    if (!cookie) {
      findings.push({ persona: spec.slug, url: `/dev/switch?as=${spec.slug}`, via: '(sweep)', oracle: 'shown-but-refused',
        problem: 'the persona switch refused a persona whose account can hold a session' });
      continue;
    }
    swept.push(spec.slug);
    const persona: CrawlPersona = {
      name: spec.slug, cookie, authenticated: true, onboarded: isOnboarded(spec),
      memberId: `member_persona_${spec.slug}`, isAdmin: Boolean(spec.isAdmin),
    };
    const seeds = probePages(spec.slug, Boolean(spec.isAdmin));
    const common = {
      persona, fetcher, seeds, shouldSkip, selfOrigin: opts.selfOrigin,
      loggedErrorCount: opts.loggedErrorCount, replayOpenRedirects: false,
      pageOracles: pageChecks({ canaries: opts.canaries }), errorPageOracles: errorPageChecks,
    };
    // The probes alone: a walk capped at the seed count visits exactly them.
    const probe = await crawl({ ...common, maxPages: seeds.length, reportBudget: false });
    findings.push(...probe.findings);

    const self = new RegExp(spec.slug.replace(/[^a-z0-9_]/g, ''), 'g');
    const shape = createHash('sha1').update(
      seeds.map((u) => {
        const visit = probe.pages.find((p) => p.url === u);
        const targets = visit ? extractTargets(visit.res.body, u) : { gets: [], posts: [], assets: [] };
        return `${u.replace(self, ':self')} ${probe.getStatus.get(u)} ${[...targets.gets, ...targets.posts].map((t) => t.replace(self, ':self')).sort().join(',')}`;
      }).join('\n'),
    ).digest('hex');
    if (shapes.has(shape)) continue;
    shapes.add(shape);
    deepened.push(spec.slug);

    const deep = await crawl({ ...common, maxPages: seeds.length + PROBE_FOLLOW_PAGES, reportBudget: false });
    // The probe pages were already judged above; keep only what the walk beyond them found.
    const probed = new Set(seeds);
    findings.push(...deep.findings.filter((f) => !(probed.has(f.url) && f.via === '(seed)')));
  }
  // The bounded walk re-renders the probe pages' forms, so one defect can be
  // reported by both passes; report it once.
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    const key = `${f.persona}|${f.oracle}|${f.url}|${f.problem}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { findings: unique, swept, deepened };
}
