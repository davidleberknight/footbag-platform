import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

/**
 * Source-grep regression: the production tiering service must never emit
 * a `dev_admin_seed.*` reason code. The `dev_admin_seed.admin_tier2`
 * marker (and any future `dev_admin_seed.*` namespace) is reserved for
 * src/dev-bootstrap/seed.ts and is filtered out of audit / ledger
 * / stats queries by exact match.
 *
 * This test catches a copy-paste regression where someone inlines a
 * dev-admin-seed-only constant into the canonical service.
 * Source-string assertion only; no DB or runtime needed.
 */
describe('membershipTieringService source — dev-admin-seed marker regression', () => {
  const sourcePath = path.resolve(
    __dirname,
    '..',
    '..',
    'src',
    'services',
    'membershipTieringService.ts',
  );

  it('contains no string literal beginning with the dev_admin_seed. namespace', () => {
    const source = readFileSync(sourcePath, 'utf8');
    // Match any quote variant (', ", `) followed by `dev_admin_seed.` and then word chars.
    const offenders = source.match(/['"`]dev_admin_seed\.[a-z_0-9]+/gi) ?? [];
    expect(offenders).toEqual([]);
  });
});
