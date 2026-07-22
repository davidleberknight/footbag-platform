import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Fusion, Cold Fusion, and ID are Paradon-chassis Down compounds whose one added
 * outward dexterity is same-side, established by footbag.org move 167's mixed
 * OP OUT > OP OUT > SAME OUT sequence. An earlier all-OP-OUT operational form was
 * an unsupported atomic-butterfly analogy; this locks the corrected forms, guards
 * that Fusion's operational notation agrees with its semantic JOB notation, and
 * pins the bracket-count / ADD agreement.
 */

const root = process.cwd();
const snapshot = JSON.parse(
  fs.readFileSync(path.join(root, 'tests', 'fixtures', 'freestyleDictionarySnapshot.json'), 'utf8'),
) as { tricks: Array<Record<string, string | null>> };

const bySlug = new Map(snapshot.tricks.map(t => [t.slug, t]));
const bracketCount = (n: string) => (n.match(/\[[A-Z]+\]/g) ?? []).length;

const EXPECTED: Record<string, { op: string; adds: string }> = {
  fusion: {
    op: 'TOE > OP OUT [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    adds: '5',
  },
  cold_fusion: {
    op: 'TOE > OP OUT [PDX] [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    adds: '6',
  },
  id: {
    op: 'TOE > OP OUT [DEX] > DUCK [BOD] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    adds: '6',
  },
};

describe('Fusion-family added dexterity is SAME OUT', () => {
  for (const [slug, { op, adds }] of Object.entries(EXPECTED)) {
    it(`${slug} operational notation carries the SAME OUT added dex`, () => {
      const row = bySlug.get(slug);
      expect(row?.operational_notation).toBe(op);
      expect(row?.adds).toBe(adds);
      expect(bracketCount(op)).toBe(Number(adds));
    });
  }

  it('Fusion operational notation agrees with its semantic JOB notation', () => {
    const fusion = bySlug.get('fusion');
    expect(fusion?.notation).toBe('TOE > OP OUT [DEX] > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(fusion?.notation).toBe(fusion?.operational_notation);
  });
});
