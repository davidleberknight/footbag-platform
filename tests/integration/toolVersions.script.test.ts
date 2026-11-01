/**
 * The one tool-version list and the reader every installer shares.
 *
 * Every installer refuses a pin that is still a placeholder or whose digest is
 * not a digest, before it changes anything, so a half-filled entry stops the
 * install instead of letting it fetch whatever the publisher serves that day.
 * The committed list itself carries no placeholder and no malformed digest, so
 * a bump that moved a version without its checksum fails here rather than on a
 * host.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const READER = join(process.cwd(), 'scripts/lib/tool-versions.sh');
const LIST = join(process.cwd(), 'ops/tool-versions.env');
const DIGEST = 'a'.repeat(64);

function pinsOk(keys: string[], list?: string): { status: number; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.FOOTBAG_TOOL_VERSIONS;
  if (list) env.FOOTBAG_TOOL_VERSIONS = list;
  const res = spawnSync('bash', ['-c', `source "$1"; shift; tool_pins_ok "$@"`, 'reader', READER, ...keys], {
    env, encoding: 'utf8', ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stderr: res.stderr ?? '' };
}

function standIn(lines: string[]): string {
  const dir = createScratchDir('tool-versions');
  const p = join(dir, 'tool-versions.env');
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

describe('the shared tool-version reader', () => {
  // Defect caught: a SHA3-256 pin holding a truncated or pasted-wrong value
  // passed the reader, so an installer verified the download against garbage
  // and either refused every run with no hint why or skipped the check.
  it('refuses a malformed SHA3-256 digest and accepts a well-formed one', () => {
    const bad = standIn(['TOOL_URL=https://example.test/t.zip', 'TOOL_SHA3_256=abc123']);
    const good = standIn(['TOOL_URL=https://example.test/t.zip', `TOOL_SHA3_256=${DIGEST}`]);

    const refused = pinsOk(['TOOL_URL', 'TOOL_SHA3_256'], bad);
    const accepted = pinsOk(['TOOL_URL', 'TOOL_SHA3_256'], good);

    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/TOOL_SHA3_256 .* is not a digest/);
    expect(accepted.status).toBe(0);
  });

  // Defect caught: an installer pointed at a stand-in list installed pins the
  // estate does not carry and said nothing, so a stubbed run read as proof.
  it('says on stderr when a stand-in list is in use', () => {
    const list = standIn([`TOOL_SHA256=${DIGEST}`]);

    expect(pinsOk(['TOOL_SHA256'], list).stderr).toContain('FOOTBAG_TOOL_VERSIONS');
    expect(pinsOk(['DOCKER_PACKAGE']).stderr).not.toContain('FOOTBAG_TOOL_VERSIONS');
  });
});

describe('the committed tool-version list', () => {
  // Defect caught: a pin moved with its checksum left behind, or an entry added
  // as a placeholder and never filled, reached a host bootstrap or a workstation
  // setup and stopped it there instead of in the suite.
  it('holds a real value for every key and a well-formed digest for every checksum', () => {
    const keys = readFileSync(LIST, 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => l.split('=')[0]);
    expect(keys.length).toBeGreaterThan(0);

    const res = pinsOk(keys);

    expect(res.stderr).toBe('');
    expect(res.status).toBe(0);
  });
});
