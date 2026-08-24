/**
 * The permission contract between the build context and the runtime image.
 *
 * Runtime stages drop to an unprivileged account, and COPY carries the build
 * context's permission bits into the layer unchanged. Git records only the
 * executable bit, so a file left owner-only on a build machine reads as clean,
 * produces no diff when its content is unchanged, survives review, and still
 * reaches the image unreadable. The request that renders it then fails on a file
 * that is present and correct in every checkout, and no fresh clone reproduces
 * it. Two gates hold the invariant from opposite sides, and both are covered
 * here: the images must normalize the modes they copy, and the working tree must
 * not carry a copied file the runtime account could not read.
 *
 * Both gates run against throwaway repositories rather than this one, so a case
 * can assert what an unreadable copied asset does without an unreadable copied
 * asset having to exist here. Each suite also runs its gate against this
 * repository, which is what keeps the fixtures honest about the real parse.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const READABLE_GATE = join(process.cwd(), 'scripts/ci/check_runtime_assets_readable.sh');
const HARDENING_GATE = join(process.cwd(), 'scripts/ci/check_dockerfile_hardening.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** A minimal two-stage Dockerfile in the shape the gates parse: a builder whose
 *  own copies must be ignored, a runtime stage that copies from the repository
 *  and from the builder, and an unprivileged account at the end. */
function dockerfile(opts: { runtimeCopies: string[]; normalize?: boolean }): string {
  return [
    'FROM node:22-alpine@sha256:aaaa AS builder',
    'WORKDIR /app',
    'COPY src ./src',
    '',
    'FROM node:22-alpine@sha256:aaaa AS runtime',
    'WORKDIR /app',
    ...opts.runtimeCopies.map(c => `COPY ${c}`),
    'COPY --from=builder /app/dist ./dist',
    ...(opts.normalize ? ['RUN chmod -R 644 .'] : []),
    'HEALTHCHECK CMD true',
    'USER node',
  ].join('\n');
}

/** Stands up a throwaway repository holding only what the gate reads, runs the
 *  gate inside it, and tears it down. The gates resolve their own root through
 *  git, so the fixture has to be a repository rather than a bare directory. */
function inFixtureRepo(
  gate: string,
  dockerfiles: Record<string, string>,
  files: Record<string, { body?: string; mode: number }>,
): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-assetperm-'));
  try {
    for (const [rel, contents] of Object.entries(dockerfiles)) {
      const full = join(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents, 'utf-8');
    }
    for (const [rel, spec] of Object.entries(files)) {
      const full = join(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, spec.body ?? 'x\n', 'utf-8');
      chmodSync(full, spec.mode);
    }
    const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf-8', ...SPAWN_GUARD });
    expect(init.status).toBe(0);

    const r = spawnSync('bash', [gate], { cwd: dir, encoding: 'utf-8', ...SPAWN_GUARD });
    return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const WEB_DF = 'docker/web/Dockerfile';

describe('check_runtime_assets_readable.sh', () => {
  it('passes when every copied file is readable by an account that does not own it', () => {
    const r = inFixtureRepo(
      READABLE_GATE,
      { [WEB_DF]: dockerfile({ runtimeCopies: ['src/views ./src/views'] }) },
      { 'src/views/page.hbs': { mode: 0o644 } },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/\[runtime-asset-perms\] pass/);
  });

  it('fails an owner-only copied file, naming the path and its mode', () => {
    const r = inFixtureRepo(
      READABLE_GATE,
      { [WEB_DF]: dockerfile({ runtimeCopies: ['src/views ./src/views'] }) },
      { 'src/views/page.hbs': { mode: 0o600 } },
    );
    expect(r.exitCode).toBe(1);
    // Naming both is what makes the failure actionable without a hunt.
    expect(r.stderr).toContain('src/views/page.hbs');
    expect(r.stderr).toContain('600');
  });

  it('fails a copied directory the runtime account could not search', () => {
    const dir = mkdtempSync(join(tmpdir(), 'footbag-test-assetperm-'));
    try {
      mkdirSync(join(dir, 'docker/web'), { recursive: true });
      writeFileSync(
        join(dir, WEB_DF),
        dockerfile({ runtimeCopies: ['src/views ./src/views'] }),
        'utf-8',
      );
      mkdirSync(join(dir, 'src/views/nested'), { recursive: true });
      writeFileSync(join(dir, 'src/views/nested/page.hbs'), 'x\n', 'utf-8');
      chmodSync(join(dir, 'src/views/nested'), 0o700);
      expect(spawnSync('git', ['init', '-q'], { cwd: dir, ...SPAWN_GUARD }).status).toBe(0);

      const r = spawnSync('bash', [READABLE_GATE], { cwd: dir, encoding: 'utf-8', ...SPAWN_GUARD });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('src/views/nested');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reaches a file nested below the copied root', () => {
    const r = inFixtureRepo(
      READABLE_GATE,
      { [WEB_DF]: dockerfile({ runtimeCopies: ['src/views ./src/views'] }) },
      { 'src/views/deeply/nested/page.hbs': { mode: 0o600 } },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('src/views/deeply/nested/page.hbs');
  });

  it('covers a copied root the Dockerfile adds later, with no second list to update', () => {
    // The roots are derived from the Dockerfile, so a directory nobody thought
    // to enumerate here is still checked.
    const r = inFixtureRepo(
      READABLE_GATE,
      { [WEB_DF]: dockerfile({ runtimeCopies: ['src/views ./src/views', 'ifpa ./ifpa'] }) },
      { 'src/views/page.hbs': { mode: 0o644 }, 'ifpa/rules.txt': { mode: 0o600 } },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('ifpa/rules.txt');
  });

  it('ignores the builder stage, whose copies never reach the shipped image', () => {
    const r = inFixtureRepo(
      READABLE_GATE,
      { [WEB_DF]: dockerfile({ runtimeCopies: ['src/views ./src/views'] }) },
      { 'src/views/page.hbs': { mode: 0o644 }, 'src/secret.ts': { mode: 0o600 } },
    );
    // `COPY src ./src` appears in the builder only, so an owner-only file under
    // src/ that the runtime stage never copies is not this gate's business.
    expect(r.exitCode).toBe(0);
  });

  it('ignores a copied path absent from the tree rather than failing on it', () => {
    const r = inFixtureRepo(
      READABLE_GATE,
      { [WEB_DF]: dockerfile({ runtimeCopies: ['src/views ./src/views', 'ifpa ./ifpa'] }) },
      { 'src/views/page.hbs': { mode: 0o644 } },
    );
    expect(r.exitCode).toBe(0);
  });

  it('passes against this repository', () => {
    const r = spawnSync('bash', [READABLE_GATE], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('check_dockerfile_hardening.sh: copied-asset mode normalization', () => {
  // The hardening gate accumulates every violation it finds rather than exiting
  // on the first, so a fixture carrying only a Dockerfile reports this rule
  // alongside unrelated ones. Asserting on the rule's own message keeps these
  // cases independent of what else the fixture does or does not satisfy.
  const NORMALIZE_NOTE = /never normalizes their modes/;

  it('rejects a runtime stage that copies repository paths without normalizing modes', () => {
    const r = inFixtureRepo(
      HARDENING_GATE,
      { [WEB_DF]: dockerfile({ runtimeCopies: ['src/views ./src/views'] }) },
      {},
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(NORMALIZE_NOTE);
    expect(r.stderr).toContain(WEB_DF);
  });

  it('accepts a runtime stage that normalizes modes after copying', () => {
    const r = inFixtureRepo(
      HARDENING_GATE,
      { [WEB_DF]: dockerfile({ runtimeCopies: ['src/views ./src/views'], normalize: true }) },
      {},
    );
    expect(r.stderr).not.toMatch(NORMALIZE_NOTE);
  });

  it('does not require normalization of a stage that copies only build artifacts', () => {
    const onlyFromBuilder = [
      'FROM node:22-alpine@sha256:aaaa AS builder',
      'WORKDIR /app',
      'COPY src ./src',
      '',
      'FROM node:22-alpine@sha256:aaaa AS runtime',
      'WORKDIR /app',
      'COPY --from=builder /app/dist ./dist',
      'HEALTHCHECK CMD true',
      'USER node',
    ].join('\n');
    const r = inFixtureRepo(HARDENING_GATE, { [WEB_DF]: onlyFromBuilder }, {});
    expect(r.stderr).not.toMatch(NORMALIZE_NOTE);
  });

  it('rejects normalization placed after the unprivileged account takes over', () => {
    const afterUser = [
      'FROM node:22-alpine@sha256:aaaa AS builder',
      'WORKDIR /app',
      'COPY src ./src',
      '',
      'FROM node:22-alpine@sha256:aaaa AS runtime',
      'WORKDIR /app',
      'COPY src/views ./src/views',
      'HEALTHCHECK CMD true',
      'USER node',
      'RUN chmod -R 644 .',
    ].join('\n');
    const r = inFixtureRepo(HARDENING_GATE, { [WEB_DF]: afterUser }, {});
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/after its USER line/);
  });

  it('passes against this repository', () => {
    const r = spawnSync('bash', [HARDENING_GATE], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(0);
  });
});
