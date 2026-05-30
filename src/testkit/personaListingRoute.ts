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
  tier: string;
  role: 'admin' | 'member';
  coverage: string[];
  source: 'canonical' | '.local';
  switchHref: string;
}

function toRow(spec: PersonaSpec, source: PersonaListRow['source']): PersonaListRow {
  return {
    slug: spec.slug,
    tier: spec.tier,
    role: spec.isAdmin ? 'admin' : 'member',
    coverage: spec.coverageNotes,
    source,
    switchHref: `/dev/switch?as=${encodeURIComponent(spec.slug)}`,
  };
}

export function getDevPersonas(_req: Request, res: Response, next: NextFunction): void {
  try {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const personas: PersonaListRow[] = [
      ...CANONICAL_PERSONAS.map((p) => toRow(p, 'canonical')),
      ...loadLocalPersonas(repoRoot).map((p) => toRow(p, '.local')),
    ];
    res.render('dev/persona-listing', {
      seo: { title: 'Test personas' },
      page: { sectionKey: '', pageKey: 'dev_personas', title: 'Test personas' },
      personas,
      personaCount: personas.length,
    });
  } catch (err) {
    next(err);
  }
}
