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

const REMOTE_SCRIPT_PATH = resolve(__dirname, '../../scripts/internal/deploy-code-remote.sh');

function remoteExecutableLines(): string[] {
  return readFileSync(REMOTE_SCRIPT_PATH, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line));
}

describe('deploy-code-remote.sh promotes the release without deleting the live database', () => {
  it('promotes with rsync --delete while excluding the live db, env, and media directories', () => {
    const code = remoteExecutableLines().join('\n');
    // The release tree the routine deploy ships carries no db/env/media directory,
    // so promoting it into the live directory with rsync --delete and no excludes
    // would delete the live database on the host. These excludes are the entire
    // DB-preservation mechanism for the routine deploy; without them a code-only
    // deploy silently wipes the source-of-truth database.
    expect(code).toMatch(/rsync\b[^\n]*--delete/);
    expect(code).toMatch(/--exclude=\/db\b/);
    expect(code).toMatch(/--exclude=\/env\b/);
    expect(code).toMatch(/--exclude=\/media\b/);
  });
});

describe('deploy-code-remote.sh pins the non-production adapters on every deploy', () => {
  it('forces the stub mail sender and the stub captcha together on a non-production host', () => {
    // Both are pinned for the same reason and in the same place: a live sender
    // on staging would put real mail in a real inbox, and a live captcha there
    // is a challenge a tester has no way to solve because staging is not wired
    // to serve one. The compose file defaults both, so the container behaves
    // correctly with either absent, but the host env file is what the
    // environment verifier reads and what an operator inspects; a value that is
    // only ever a default is a value nobody can see, and it reads as drift.
    const code = remoteExecutableLines().join('\n');
    const guard = code.slice(code.indexOf('FOOTBAG_ENV_VAL'));
    expect(guard).toMatch(/printf 'SES_ADAPTER=%s\\n' 'stub'/);
    expect(guard).toMatch(/printf 'CAPTCHA_ADAPTER=%s\\n' 'stub'/);
  });

  it('leaves production out of that reconciliation', () => {
    // Production derives its mail adapter from the arming switch, and its live
    // captcha is activation work with its own step. Forcing either here would
    // silently undo them on the next deploy.
    const code = remoteExecutableLines().join('\n');
    const captchaAt = code.indexOf("printf 'CAPTCHA_ADAPTER=%s");
    expect(captchaAt).toBeGreaterThan(-1);
    const guardAbove = code.slice(0, captchaAt);
    const lastCondition = guardAbove.lastIndexOf('FOOTBAG_ENV_VAL" == "staging"');
    expect(lastCondition).toBeGreaterThan(-1);
    expect(guardAbove.slice(lastCondition)).not.toMatch(/^fi$/m);
  });
});
