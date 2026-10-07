/**
 * Composes the pure oracles into the per-page check a crawl runs on every 200
 * HTML page, so every crawl applies the same checks the same way.
 *
 * Markup validation is the one slow oracle, so it runs once per distinct body:
 * the same page served to several personas, or reached by several links, is
 * validated once and its result reused.
 */
import { createHash } from 'node:crypto';
import type { PageVisit } from './core';
import {
  type Canary,
  type Finding,
  type OracleName,
  authenticatedNoindexFinding,
  markupFindings,
  privacyLeakFindings,
  seoFindings,
  templateArtifactFindings,
  titleAndH1Findings,
} from './oracles';

export interface PageCheckOptions {
  canaries?: readonly Canary[];
  /** Skip markup validation; for sweeps that only need the cheap oracles. */
  skipMarkup?: boolean;
}

const markupCache = new Map<string, string[]>();

function cachedMarkup(body: string): string[] {
  const key = createHash('sha1').update(body).digest('hex');
  let hit = markupCache.get(key);
  if (!hit) {
    hit = markupFindings(body);
    markupCache.set(key, hit);
  }
  return hit;
}

/** Error responses: an error page must not claim a real page's address. */
export function errorPageChecks(visit: PageVisit): Finding[] {
  return seoFindings({ status: visit.res.status, html: visit.res.body, publicPage: false })
    .map((problem) => ({ persona: visit.persona.name, url: visit.url, via: visit.via, oracle: 'seo' as const, problem }));
}

export function pageChecks(opts: PageCheckOptions = {}): (visit: PageVisit) => Finding[] {
  return (visit) => {
    const { persona, url, via, res } = visit;
    const out: Finding[] = [];
    const add = (oracle: OracleName, problems: string[]) => {
      for (const problem of problems) out.push({ persona: persona.name, url, via, oracle, problem });
    };
    add('template-artifact', templateArtifactFindings(res.body));
    add('title-h1', titleAndH1Findings(res.body));
    add('seo', seoFindings({ status: res.status, html: res.body, publicPage: !persona.authenticated }));
    if (persona.authenticated) {
      const noindex = authenticatedNoindexFinding(res.headers, res.body);
      if (noindex) add('seo', [noindex]);
    }
    if (!opts.skipMarkup) add('markup', cachedMarkup(res.body));
    if (opts.canaries) {
      add('privacy', privacyLeakFindings(res.body, {
        memberId: persona.memberId,
        isAdmin: persona.isAdmin,
        authenticated: persona.authenticated,
        onboarded: persona.onboarded,
      }, opts.canaries));
    }
    return out;
  };
}
