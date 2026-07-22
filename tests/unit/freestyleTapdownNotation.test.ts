import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Tapdown is losslessly decomposable as tapping + butterfly, both settled
 * components, so its JOB notation takes decomposition form under the default
 * rule rather than the survivor name. This pins the notation to TAPPING BUTTERFLY
 * and guards that only the label changed: the ADD, base, family, category, and
 * operational notation are the tapping-butterfly identity as before.
 */

const root = process.cwd();
const snapshot = JSON.parse(
  fs.readFileSync(path.join(root, 'tests', 'fixtures', 'freestyleDictionarySnapshot.json'), 'utf8'),
) as { tricks: Array<Record<string, string | null>> };

const tapdown = snapshot.tricks.find(t => t.slug === 'tapdown');

describe('tapdown JOB notation', () => {
  it('is TAPPING BUTTERFLY (decomposition form)', () => {
    expect(tapdown?.notation).toBe('TAPPING BUTTERFLY');
  });

  it('leaves the tapping-butterfly identity fields unchanged', () => {
    expect(tapdown?.adds).toBe('4');
    expect(tapdown?.base_trick).toBe('butterfly');
    expect(tapdown?.trick_family).toBe('butterfly');
    expect(tapdown?.category).toBe('compound');
    expect(tapdown?.operational_notation).toBe('TOE > OP OUT [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
  });
});
