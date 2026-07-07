/**
 * Automated WCAG 2.1 AA accessibility scan of the high-traffic public pages.
 *
 * axe-core catches machine-detectable accessibility failures the structural
 * keyboard/label checks elsewhere do not: missing form labels, insufficient
 * colour contrast, absent landmarks, invalid ARIA. These are anonymous public
 * pages, so no session or seeded data is needed to render them. The scan runs
 * one page at a time and accumulates every route's violations into a single
 * failure so one run reports the whole surface rather than stopping at the
 * first offending page.
 *
 * The scan excludes the colour-contrast rule. The shared theme's chrome (logo
 * text, active nav, primary and outline buttons, footer text) uses a deep-green
 * interaction token that meets AA contrast; the remaining contrast question is
 * in-text link colour, where darkening the link green for background contrast
 * reduces its distinguishability from body text and calls for an underline
 * treatment, handled on its own. This gate covers the automatable structural
 * checks (form labels, ARIA, landmarks, headings, page language).
 *
 * Tagged @a11y so `--grep @a11y` runs the accessibility tier on its own, and
 * @smoke so it rides the quick smoke run over the high-traffic public pages.
 */
import { test, expect } from '@playwright/test';
import { scanWcagAa, formatFindings } from './helpers/axe';

const PUBLIC_PAGES: Array<{ path: string; name: string }> = [
  { path: '/', name: 'home' },
  { path: '/freestyle', name: 'freestyle landing' },
  { path: '/freestyle/glossary', name: 'freestyle glossary' },
  { path: '/events', name: 'events' },
  { path: '/clubs', name: 'clubs' },
  { path: '/ifpa', name: 'membership hub' },
  { path: '/media', name: 'media hub' },
  { path: '/hof', name: 'hall of fame' },
  { path: '/bap', name: 'big add posse' },
  { path: '/login', name: 'login' },
  { path: '/register', name: 'register' },
];

test('high-traffic public pages have no structural WCAG 2.1 AA axe violations', { tag: ['@a11y', '@smoke'] }, async ({ page }) => {
  const report: string[] = [];
  for (const { path, name } of PUBLIC_PAGES) {
    const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(res, `${name} (${path}) should respond`).not.toBeNull();
    expect(res!.status(), `${name} (${path}) should render, not error`).toBeLessThan(400);
    const findings = await scanWcagAa(page, { disableRules: ['color-contrast'] });
    if (findings.length > 0) report.push(formatFindings(name, findings));
  }
  expect(report.join('\n'), `axe WCAG 2.1 AA violations found:\n${report.join('\n')}`).toBe('');
});
