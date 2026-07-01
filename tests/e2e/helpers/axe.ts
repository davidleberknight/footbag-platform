/**
 * axe-core WCAG 2.1 AA scanning helper for the Playwright suite.
 *
 * Wraps @axe-core/playwright so specs can scan a rendered page for
 * machine-detectable accessibility failures (missing form labels, insufficient
 * colour contrast, missing landmarks, invalid ARIA) and get a compact,
 * readable report. This complements the structural keyboard-reachability and
 * label-association checks: axe finds a different, automatable class of defect.
 */
import type { Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

// The four rule tags that together define WCAG 2.1 Level AA conformance in axe.
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export interface AxeFinding {
  id: string;
  impact: string | null;
  help: string;
  nodes: number;
  sampleTargets: string[];
}

/**
 * Run an axe WCAG 2.1 AA scan on the current page and return its violations.
 * `disableRules` turns off specific axe rules by id for scans that gate only a
 * subset of the standard (for example excluding a rule whose failures are a
 * separately-tracked design issue rather than a per-page markup defect).
 */
export async function scanWcagAa(
  page: Page,
  opts: { disableRules?: string[] } = {},
): Promise<AxeFinding[]> {
  let builder = new AxeBuilder({ page }).withTags(WCAG_AA_TAGS);
  if (opts.disableRules && opts.disableRules.length > 0) {
    builder = builder.disableRules(opts.disableRules);
  }
  const results = await builder.analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    nodes: v.nodes.length,
    sampleTargets: v.nodes.slice(0, 3).map((n) => n.target.map(String).join(' ')),
  }));
}

/** Render one route's findings as indented lines for an assertion message. */
export function formatFindings(routeLabel: string, findings: AxeFinding[]): string {
  return findings
    .map(
      (f) =>
        `  ${routeLabel} [${f.impact ?? 'n/a'}] ${f.id} (${f.nodes} node(s)): ${f.help}\n` +
        `    e.g. ${f.sampleTargets.join(' | ')}`,
    )
    .join('\n');
}
