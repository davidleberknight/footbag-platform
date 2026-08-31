/**
 * Measure every public browse family and write the family histogram's data.
 *
 * The chart's family bars used to be numbers somebody placed by hand after a
 * one-off study. That study left no tool behind, so the numbers could only ever
 * drift: each was a snapshot of a dictionary that had since grown, and nothing
 * anywhere noticed. This is that measurement made repeatable.
 *
 * It measures nothing of its own. The browse already computes what a family
 * contains, folding members up the family ancestor chain, applying the public
 * display-family mappings, honouring dual memberships, unioning an umbrella's
 * branches and filtering by ontology role. That calculation is the definition,
 * and this asks it rather than restating it: a second implementation of those
 * folds would be a second answer to the same question, and the chart would
 * eventually disagree with the browse it sits beside.
 *
 * Only the family bars come from here. The two terminal surfaces that head the
 * chart are landing counts, a different measurement with no live equivalent, and
 * they stay hand-authored alongside the entry chart.
 *
 * Deterministic: the same database yields the same bytes, so a regeneration that
 * changes nothing produces no diff, and the guard that re-runs it can compare
 * exactly rather than approximately.
 *
 * Usage:
 *   npx tsx freestyle/scripts/build_family_histogram_content.ts [--db path]
 */
import 'dotenv/config';
import path from 'node:path';
import { writeFileSync } from 'node:fs';

const OUT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname), '..', '..',
  'src', 'content', 'freestyleFamilyHistogram.ts',
);

interface FamilyRow { label: string; count: number }

/** A browse family group, as the index page shapes it. */
interface BrowseContent {
  familyGroups: { familySlug: string; familyName: string; cards: unknown[] }[];
  minorLineages: { slug: string; name: string; count: number }[];
}

function parseDbArg(): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--db');
  return i >= 0 ? argv[i + 1] : undefined;
}

function render(rows: readonly FamilyRow[], unmeasured: readonly string[]): string {
  const body = rows
    .map(r => `  { label: ${JSON.stringify(r.label)}, count: ${r.count} },`)
    .join('\n');
  const awaiting = unmeasured.length === 0
    ? '  // Every public browse family has a measured row.\n'
    : unmeasured.map(s => `  ${JSON.stringify(s)},\n`).join('');
  return `// freestyleFamilyHistogram.ts
// ============================
// GENERATED FILE — do not hand-edit.
// Regenerate: npx tsx freestyle/scripts/build_family_histogram_content.ts
//
// How large each public browse family is, measured from the family-membership
// calculation the dictionary browse itself renders: members folded up the family
// ancestor chain, public display-family mappings applied, dual memberships
// counted, an umbrella's branches unioned, and non-trick rows excluded. A family
// therefore counts its branches' tricks as well as its own, which is why a root
// stands above the sub-families nested under it.
//
// These are not the numbers of the original topology study, and no attempt is
// made to reproduce them: that study's corpus and procedure were not kept, so
// its figures cannot be recomputed. What is kept is its question. Every count
// here is a measurement of the dictionary as committed, and re-running this
// against unchanged inputs changes nothing.
//
// Sorted by count descending, then label, so the order is a property of the data
// rather than of the run.

/** One family bar: the public family label and its measured membership. */
export interface FamilyHistogramRow {
  label: string;
  count: number;
}

/** Every public browse family with a measured membership, largest first. */
export const FAMILY_HISTOGRAM_ROWS: readonly FamilyHistogramRow[] = [
${body}
];

/**
 * Public browse families this measurement produced no row for.
 *
 * A family renders on the browse only once it has more than two members, so one
 * below that floor has nothing to measure and is named here instead of dropped
 * silently. Nothing is drawn for it: a zero would read as a measurement.
 */
export const FAMILIES_WITHOUT_A_MEASURED_ROW: readonly string[] = [
${awaiting}];
`;
}

async function main(): Promise<number> {
  const db = parseDbArg();
  if (db) process.env.FOOTBAG_DB_PATH = path.resolve(db);

  const { freestyleService } = await import('../../src/services/freestyleService');
  const { PUBLIC_DISPLAY_FAMILIES } = await import('../../src/content/freestylePublicFamilies');

  const page = freestyleService.getFreestyleTricksIndexPage(undefined, 'family');
  const content = page.content as unknown as BrowseContent;

  // Both tiers, from the one surface that renders them: a Family Parent renders
  // as a full section whose cards are its members, a Minor Lineage as a counted
  // entry. Same membership map underneath.
  const measured = new Map<string, number>();
  for (const g of content.familyGroups) measured.set(g.familySlug, g.cards.length);
  for (const m of content.minorLineages) measured.set(m.slug, m.count);

  const roster = PUBLIC_DISPLAY_FAMILIES as readonly { slug: string; label: string }[];
  const rows: FamilyRow[] = [];
  const unmeasured: string[] = [];
  for (const family of roster) {
    const count = measured.get(family.slug);
    if (count === undefined) unmeasured.push(family.slug);
    else rows.push({ label: family.label, count });
  }

  rows.sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
  unmeasured.sort();

  writeFileSync(OUT, render(rows, unmeasured), 'utf-8');

  console.log(`Measured ${rows.length} of ${roster.length} public browse families.`);
  for (const r of rows) console.log(`  ${r.label.padEnd(20)} ${r.count}`);
  if (unmeasured.length > 0) {
    console.log(`\nBelow the browse's display floor, so unmeasured: ${unmeasured.join(', ')}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)}`);
  return 0;
}

main().then(code => process.exit(code)).catch((err: unknown) => {
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
