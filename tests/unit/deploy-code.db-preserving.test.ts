/**
 * The code-only deploy never touches the database.
 *
 * After cutover the live database is the source of truth for freestyle content,
 * and the code-only deploy script is the routine deploy path, so live content
 * edits survive a deploy precisely because that script ships code and images
 * only. This suite pins the transport half of that contract by inspecting the
 * script: its rsync is an include-allowlist that never ships the database
 * directory, and it never invokes the database rebuild tooling. The runtime half
 * (nothing at boot or during public reads rewrites the freestyle tables) is
 * pinned by the freestyle content runtime-readonly integration suite.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCRIPT_PATH = resolve(__dirname, '../../scripts/deploy-code.sh');

// The script's executable lines: comment lines dropped, so prose mentioning the
// database (the header's "always preserves" note) does not trip the assertions.
function executableLines(): string[] {
  return readFileSync(SCRIPT_PATH, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line));
}

describe('deploy-code.sh preserves the host database', () => {
  it('never references the database file, its env path, or the database directory in executable lines', () => {
    const code = executableLines().join('\n');
    expect(code).not.toMatch(/footbag\.db/);
    expect(code).not.toMatch(/FOOTBAG_DB_PATH/);
    expect(code).not.toMatch(/database\//);
    expect(code).not.toMatch(/\bsqlite3\b/);
  });

  it('never invokes the rebuild tooling', () => {
    const code = executableLines().join('\n');
    expect(code).not.toMatch(/run_freestyle\.sh/);
    expect(code).not.toMatch(/deploy-local-data\.sh/);
    expect(code).not.toMatch(/reset-local-db\.sh/);
    expect(code).not.toMatch(/deploy-rebuild\.sh/);
  });

  it('ships files through an include-allowlist that excludes everything else', () => {
    const code = executableLines().join('\n');
    // The rsync allowlist posture: a catch-all exclude, and no include that could
    // admit the database directory.
    expect(code).toMatch(/--exclude='\*'/);
    expect(code).not.toMatch(/--include='?\/?database/);
  });
});
