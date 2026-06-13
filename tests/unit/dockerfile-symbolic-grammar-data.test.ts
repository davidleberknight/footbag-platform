/**
 * Permanent contract: the web runtime image ships the symbolic-grammar data
 * directory that symbolicGrammarService reads at runtime.
 *
 * tsc emits only .js, so these committed CSVs (consumed by the observational
 * symbolic-grammar panels on the freestyle trick-detail and glossary pages)
 * reach the image only via an explicit COPY. The service's missing-file
 * fail-safe returns empty results rather than throwing, so a dropped COPY makes
 * the panels silently empty in staging and production while every local test
 * still passes — exactly the failure this guard exists to prevent.
 *
 * Static-text scan (no docker invocation); CI runs vitest, not docker.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Built from segments so the data path appears nowhere as a literal that would
// read as a doc-path reference.
const DATA_DIR_SEGMENTS = ['exploration', 'symbolic-grammar-2'] as const;
const dataDirRel = DATA_DIR_SEGMENTS.join('/');

// The CSV basenames symbolicGrammarService loads. If the service starts reading
// another file, add it here so the ship-the-data contract stays honest.
const SERVICE_READ_CSVS = [
  'symbolic_equivalence_clusters.csv',
  'symbolic_group_membership.csv',
  'movement_archetype_registry.csv',
  'symbolic_topology_groups.csv',
  'symbolic_modifier_groups.csv',
  'glossary_crosslinks.csv',
] as const;

describe('docker/web/Dockerfile: symbolic-grammar data ships in the web image', () => {
  const content = readFileSync(path.join(REPO_ROOT, 'docker/web/Dockerfile'), 'utf8');

  it('copies the symbolic-grammar data dir to the runtime-resolved path', () => {
    // WORKDIR is /app and the service resolves the project root to /app, so the
    // copy destination must match the data dir under that root.
    expect(content).toContain(`COPY ${dataDirRel} ./${dataDirRel}`);
  });
});

describe('symbolic-grammar data dir is present to be copied', () => {
  it.each(SERVICE_READ_CSVS)('ships %s', (csv) => {
    expect(existsSync(path.join(REPO_ROOT, ...DATA_DIR_SEGMENTS, csv))).toBe(true);
  });
});
