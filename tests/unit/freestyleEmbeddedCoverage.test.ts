/**
 * Drift guard + shape tests for the embedded-coverage bridge module.
 *
 * The curator-edit surface is the CSV manifest
 * (legacy_data/tools/trick_video_discovery/embedded_coverage.csv); the TS module
 * is its service-readable mirror. This guard fails the build if the two drift,
 * so an edit to either without the other is caught immediately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  EMBEDDED_COVERAGE,
  EMBEDDED_COVERAGE_BY_SLUG,
  type EmbeddedCoverageEdge,
} from '../../src/content/freestyleEmbeddedCoverage';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(
  HERE,
  '../../legacy_data/tools/trick_video_discovery/embedded_coverage.csv',
);

function parseCsv(): EmbeddedCoverageEdge[] {
  const lines = readFileSync(CSV_PATH, 'utf-8')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean);
  const [header, ...rows] = lines;
  expect(header).toBe('embedded_trick_slug,host_trick_slug,host_source_id,notes');
  // First three fields never contain commas (slugs / source id); the note may,
  // so it is the remainder joined back on comma.
  return rows.map((line) => {
    const [embeddedSlug, hostSlug, hostSourceId, ...noteParts] = line.split(',');
    return { embeddedSlug, hostSlug, hostSourceId, note: noteParts.join(',') };
  });
}

const key = (e: EmbeddedCoverageEdge) => `${e.embeddedSlug}|${e.hostSlug}`;
const sortByKey = (xs: readonly EmbeddedCoverageEdge[]) =>
  [...xs].sort((a, b) => key(a).localeCompare(key(b)));

describe('freestyleEmbeddedCoverage — drift guard vs CSV', () => {
  it('TS module mirrors embedded_coverage.csv row-for-row', () => {
    expect(sortByKey(EMBEDDED_COVERAGE)).toEqual(sortByKey(parseCsv()));
  });
});

describe('freestyleEmbeddedCoverage — shape invariants', () => {
  it('slugs are lowercase kebab, source + note non-empty', () => {
    for (const e of EMBEDDED_COVERAGE) {
      expect(e.embeddedSlug).toMatch(/^[a-z0-9-]+$/);
      expect(e.hostSlug).toMatch(/^[a-z0-9-]+$/);
      expect(e.hostSourceId.length).toBeGreaterThan(0);
      expect(e.note.length).toBeGreaterThan(0);
    }
  });

  it('no duplicate (embedded, host) pairs', () => {
    const keys = EMBEDDED_COVERAGE.map(key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('grouping indexes by embedded slug', () => {
    expect(EMBEDDED_COVERAGE_BY_SLUG['orbit']?.[0]?.hostSlug).toBe('around-the-world');
    expect(EMBEDDED_COVERAGE_BY_SLUG['illusion']?.[0]?.hostSlug).toBe('mirage');
  });
});
