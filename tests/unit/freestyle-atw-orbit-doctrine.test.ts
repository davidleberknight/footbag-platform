/**
 * Around the World is inward only (SAME IN); the outward, reverse circle is a
 * separate move, the orbit (SAME OUT). The curated trick corrections are the
 * source of truth for the trick-detail execution and learning copy loaded into
 * the database, so they must not tell learners that around-the-world travels in
 * either direction or that both directions are around-the-world. This guards the
 * source so the contradiction cannot return; the verbatim legacy footbag.org
 * descriptions under freestyle/inputs/*_snapshot.csv are historical evidence and
 * are intentionally left as-is elsewhere.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSV = join(process.cwd(), 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv');

function atwRow(field: string): string {
  const prefix = `around_the_world,${field},`;
  const line = readFileSync(CSV, 'utf8').split('\n').find((l) => l.startsWith(prefix));
  expect(line, `red_corrections row for around_the_world,${field}`).toBeDefined();
  return line as string;
}

describe('around-the-world / orbit direction doctrine in the curated corrections', () => {
  it('the execution summary is inward-only and names the outward circle as orbit', () => {
    const line = atwRow('execution_summary');
    expect(line).not.toContain('either inside-to-outside');
    expect(line).not.toContain('both of which score the same');
    expect(line).toContain('inward');
    expect(line).toContain('orbit');
  });

  it('the learning notes do not call both directions around-the-world', () => {
    const line = atwRow('learning_notes');
    expect(line).not.toContain('both directions');
    // Encouraging both legs and the separate outward orbit is fine.
    expect(line).toContain('orbit');
  });
});
