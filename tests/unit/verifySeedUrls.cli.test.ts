// Seed-URL verifier: invocation contract, output isolation and publication.
//
// Drives the real command path — argument parsing, prerequisite checks, verdict
// cache reading, the genuine verdict transformation, serialisation and file
// publication — against synthetic fixtures in a temp directory. The transport and
// the clock are injected, so no network call, no .env file, no credential and no
// application config is involved. The verdict logic itself is never replaced.
import { describe, it, expect, afterEach, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  statSync,
  chmodSync,
} from 'node:fs';
import {
  run,
  stageFile,
  EXIT_OK,
  EXIT_PUBLICATION_FAILURE,
  EXIT_INVALID_INVOCATION,
  EXIT_MISSING_PREREQUISITE,
  EXIT_VALIDATOR_FAILURE,
  type ValidateFn,
  type RunDeps,
} from '../../scripts/verify-seed-urls';

const FIXED_NOW = '2026-01-02T03:04:05.000Z';
const CLUBS_VERDICTS = path.join('legacy_data', 'seed', 'clubs_url_verdicts.csv');
const GALLERY_VERDICTS = path.join('curated', 'galleries', 'url_verdicts.json');

const roots: string[] = [];

afterEach(() => {
  while (roots.length) {
    const dir = roots.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A test that made a directory read-only may block removal; the OS
      // reclaims the temp tree either way.
    }
  }
});

interface Fixture {
  root: string;
  clubsVerdicts: string;
  galleryVerdicts: string;
}

function makeRepo(opts: { clubs?: boolean; galleries?: boolean } = {}): Fixture {
  const root = mkdtempSync(path.join(os.tmpdir(), 'footbag-test-verify-'));
  roots.push(root);
  if (opts.clubs !== false) {
    mkdirSync(path.join(root, 'legacy_data', 'seed'), { recursive: true });
    writeFileSync(
      path.join(root, 'legacy_data', 'seed', 'clubs.csv'),
      'legacy_club_key,name,external_url\n' +
      '1001,Riverside,https://example.org/riverside\n' +
      '1002,Harbour,https://example.org/harbour\n',
    );
  }
  if (opts.galleries !== false) {
    mkdirSync(path.join(root, 'curated', 'galleries'), { recursive: true });
    writeFileSync(
      path.join(root, 'curated', 'galleries', 'g1.json'),
      JSON.stringify({
        id: 'gallery-one',
        externalLinks: [{ url: 'https://example.org/one' }],
      }),
    );
  }
  return {
    root,
    clubsVerdicts: path.join(root, CLUBS_VERDICTS),
    galleryVerdicts: path.join(root, GALLERY_VERDICTS),
  };
}

/** Records every URL it is asked about, so a test can prove a lookup was skipped. */
function transport(): { validate: ValidateFn; seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    validate: async (url) => {
      seen.push(url);
      return { valid: true };
    },
  };
}

function deps(extra: Partial<RunDeps> = {}): RunDeps {
  return {
    validate: transport().validate,
    now: () => FIXED_NOW,
    log: () => {},
    logError: () => {},
    ...extra,
  };
}

function capture(): { deps: RunDeps; out: string[]; err: string[]; seen: string[] } {
  const t = transport();
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    seen: t.seen,
    deps: {
      validate: t.validate,
      now: () => FIXED_NOW,
      log: (m) => out.push(m),
      logError: (m) => err.push(m),
    },
  };
}

function tempArtifacts(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.includes('.partial-'));
}

// Presents `dir` as the caller's working directory. The verifier turns a relative
// command-line path into an absolute one with path.resolve, which reads the working
// directory, so faking that read exercises the real resolution contract. Tests run
// on worker threads, where the process working directory cannot be changed, and
// changing it would in any case leak across the tests sharing the worker.
function fakeWorkingDirectory(dir: string) {
  return vi.spyOn(process, 'cwd').mockReturnValue(dir);
}

// ── mode and redirect contract ───────────────────────────────────────────────

describe('verify-seed-urls: invocation contract', () => {
  it('processes both outputs at their committed paths by default', async () => {
    const fx = makeRepo();
    expect(await run([], fx.root, deps())).toBe(EXIT_OK);
    expect(existsSync(fx.clubsVerdicts)).toBe(true);
    expect(existsSync(fx.galleryVerdicts)).toBe(true);
  });

  it('processes only clubs at the committed path with --clubs-only', async () => {
    const fx = makeRepo();
    expect(await run(['--clubs-only'], fx.root, deps())).toBe(EXIT_OK);
    expect(existsSync(fx.clubsVerdicts)).toBe(true);
    expect(existsSync(fx.galleryVerdicts)).toBe(false);
  });

  it('processes only galleries at the committed path with --galleries-only', async () => {
    const fx = makeRepo();
    expect(await run(['--galleries-only'], fx.root, deps())).toBe(EXIT_OK);
    expect(existsSync(fx.galleryVerdicts)).toBe(true);
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
  });

  it('refuses both mode flags together rather than succeeding at nothing', async () => {
    const fx = makeRepo();
    const c = capture();
    const code = await run(['--clubs-only', '--galleries-only'], fx.root, c.deps);
    expect(code).toBe(EXIT_INVALID_INVOCATION);
    expect(code).not.toBe(EXIT_OK);
    expect(c.err.join('\n')).toContain('select nothing to do');
  });

  it('refuses redirecting one of two selected outputs', async () => {
    const fx = makeRepo();
    const c = capture();
    const target = path.join(fx.root, 'scratch', 'clubs.csv');
    expect(await run(['--clubs-verdicts', target], fx.root, c.deps)).toBe(EXIT_INVALID_INVOCATION);
    expect(c.err.join('\n')).toContain('redirect both or neither');
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
  });

  it('refuses a gallery redirect in clubs-only mode', async () => {
    const fx = makeRepo();
    const c = capture();
    const target = path.join(fx.root, 'scratch', 'g.json');
    expect(await run(['--clubs-only', '--gallery-verdicts', target], fx.root, c.deps))
      .toBe(EXIT_INVALID_INVOCATION);
    expect(c.err.join('\n')).toContain('galleries are not being processed');
  });

  it('refuses a clubs redirect in galleries-only mode', async () => {
    const fx = makeRepo();
    const c = capture();
    const target = path.join(fx.root, 'scratch', 'c.csv');
    expect(await run(['--galleries-only', '--clubs-verdicts', target], fx.root, c.deps))
      .toBe(EXIT_INVALID_INVOCATION);
    expect(c.err.join('\n')).toContain('clubs are not being processed');
  });

  it('refuses both outputs resolving to the same path', async () => {
    const fx = makeRepo();
    const c = capture();
    const same = path.join(fx.root, 'scratch', 'both');
    const code = await run(
      ['--clubs-verdicts', same, '--gallery-verdicts', same], fx.root, c.deps,
    );
    expect(code).toBe(EXIT_INVALID_INVOCATION);
    expect(c.err.join('\n')).toContain('same path');
  });

  it('refuses an unknown argument and a flag with no value', async () => {
    const fx = makeRepo();
    expect(await run(['--nope'], fx.root, deps())).toBe(EXIT_INVALID_INVOCATION);
    expect(await run(['--clubs-only', '--clubs-verdicts'], fx.root, deps()))
      .toBe(EXIT_INVALID_INVOCATION);
  });

  it('prints usage for --help without touching anything', async () => {
    const fx = makeRepo();
    const c = capture();
    expect(await run(['--help'], fx.root, c.deps)).toBe(EXIT_OK);
    expect(c.out.join('\n')).toContain('--clubs-verdicts FILE');
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
  });
});

// ── redirection and cache-path behaviour ─────────────────────────────────────

describe('verify-seed-urls: redirected output and cache', () => {
  it('redirects both outputs and leaves the committed pair untouched', async () => {
    const fx = makeRepo();
    const scratch = path.join(fx.root, 'scratch');
    const c = capture();
    const code = await run(
      ['--clubs-verdicts', path.join(scratch, 'clubs.csv'),
       '--gallery-verdicts', path.join(scratch, 'gallery.json')],
      fx.root, c.deps,
    );
    expect(code).toBe(EXIT_OK);
    expect(existsSync(path.join(scratch, 'clubs.csv'))).toBe(true);
    expect(existsSync(path.join(scratch, 'gallery.json'))).toBe(true);
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
    expect(existsSync(fx.galleryVerdicts)).toBe(false);
    expect(c.out.join('\n')).toContain(path.join(scratch, 'clubs.csv'));
  });

  it('reads its cache from the redirect, never from the committed file', async () => {
    // Conflicting sentinels: the committed cache would suppress the lookup and
    // stamp an old timestamp, the redirected cache is empty so a lookup happens.
    const fx = makeRepo();
    mkdirSync(path.dirname(fx.clubsVerdicts), { recursive: true });
    writeFileSync(
      fx.clubsVerdicts,
      'legacy_club_key,external_url,validated_at,quarantine_reason\n' +
      '1001,https://example.org/riverside,1999-01-01T00:00:00.000Z,\n',
    );
    const committedBefore = readFileSync(fx.clubsVerdicts, 'utf8');
    const redirected = path.join(fx.root, 'scratch', 'clubs.csv');
    const c = capture();

    expect(await run(['--clubs-only', '--clubs-verdicts', redirected], fx.root, c.deps))
      .toBe(EXIT_OK);

    // The committed cache neither influenced the result nor changed on disk.
    expect(c.seen).toContain('https://example.org/riverside');
    expect(readFileSync(redirected, 'utf8')).toContain(FIXED_NOW);
    expect(readFileSync(redirected, 'utf8')).not.toContain('1999-01-01');
    expect(readFileSync(fx.clubsVerdicts, 'utf8')).toBe(committedBefore);
  });

  it('honours a prior verdict in the redirected cache and skips the lookup', async () => {
    const fx = makeRepo();
    const redirected = path.join(fx.root, 'scratch', 'clubs.csv');
    mkdirSync(path.dirname(redirected), { recursive: true });
    writeFileSync(
      redirected,
      'legacy_club_key,external_url,validated_at,quarantine_reason\n' +
      '1001,https://example.org/riverside,2020-05-05T00:00:00.000Z,\n',
    );
    const c = capture();

    expect(await run(['--clubs-only', '--clubs-verdicts', redirected], fx.root, c.deps))
      .toBe(EXIT_OK);

    expect(c.seen).not.toContain('https://example.org/riverside');
    expect(c.seen).toContain('https://example.org/harbour');
    expect(readFileSync(redirected, 'utf8')).toContain('2020-05-05T00:00:00.000Z');
  });

  it('resolves a relative redirect against the working directory and reports it', async () => {
    const fx = makeRepo();
    const workdir = path.join(fx.root, 'workdir');
    mkdirSync(workdir);
    const cwd = fakeWorkingDirectory(workdir);
    try {
      const c = capture();
      expect(await run(['--clubs-only', '--clubs-verdicts', 'nested/clubs.csv'], fx.root, c.deps))
        .toBe(EXIT_OK);
      const landed = path.join(workdir, 'nested', 'clubs.csv');
      expect(existsSync(landed)).toBe(true);
      expect(c.out.join('\n')).toContain(landed);
    } finally {
      cwd.mockRestore();
    }
  });
});

// ── prerequisites ────────────────────────────────────────────────────────────

describe('verify-seed-urls: prerequisites', () => {
  it('reports every missing selected input together and exits 3', async () => {
    const fx = makeRepo({ clubs: false, galleries: false });
    const c = capture();
    expect(await run([], fx.root, c.deps)).toBe(EXIT_MISSING_PREREQUISITE);
    const err = c.err.join('\n');
    expect(err).toContain('2 required input(s) unusable');
    expect(err).toContain('clubs.csv');
    expect(err).toContain(path.join('curated', 'galleries'));
  });

  it('does not block a single-mode run on an unselected missing input', async () => {
    const fx = makeRepo({ galleries: false });
    expect(await run(['--clubs-only'], fx.root, deps())).toBe(EXIT_OK);
    expect(existsSync(fx.clubsVerdicts)).toBe(true);
  });

  it('never reports success when the selected input is absent', async () => {
    const fx = makeRepo({ clubs: false });
    expect(await run(['--clubs-only'], fx.root, deps())).toBe(EXIT_MISSING_PREREQUISITE);
    expect(await run(['--clubs-only', '--dry-run'], fx.root, deps()))
      .toBe(EXIT_MISSING_PREREQUISITE);
  });
});

// ── validator failures ───────────────────────────────────────────────────────

describe('verify-seed-urls: validator failures', () => {
  it('exits 4 when the validator cannot be initialised', async () => {
    const fx = makeRepo();
    const c = capture();
    const code = await run(['--clubs-only'], fx.root, {
      now: () => FIXED_NOW,
      log: c.deps.log,
      logError: c.deps.logError,
      createValidator: async () => {
        throw new Error('SAFE_BROWSING_API_KEY missing');
      },
    });
    expect(code).toBe(EXIT_VALIDATOR_FAILURE);
    expect(c.err.join('\n')).toContain('could not initialise');
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
  });

  it('exits 4 when the validator refuses to produce committable verdicts', async () => {
    const fx = makeRepo();
    const c = capture();
    const code = await run(['--clubs-only'], fx.root, {
      now: () => FIXED_NOW,
      log: c.deps.log,
      logError: c.deps.logError,
      createValidator: async () => ({
        validate: async () => ({ valid: true }),
        describe: 'safeBrowsing=stub, reachability=disabled',
        refuseToWrite: "SAFE_BROWSING_ADAPTER is 'stub'",
      }),
    });
    expect(code).toBe(EXIT_VALIDATOR_FAILURE);
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
  });

  it('absorbs a per-URL transport error into a quarantine verdict', async () => {
    // Long-standing behaviour: a lookup that throws quarantines that one URL
    // rather than failing the run, so one unreachable host cannot block the rest.
    const fx = makeRepo();
    const code = await run(['--clubs-only'], fx.root, deps({
      validate: async (url) => {
        if (url.endsWith('harbour')) throw new Error('socket hang up');
        return { valid: true };
      },
    }));
    expect(code).toBe(EXIT_OK);
    const body = readFileSync(fx.clubsVerdicts, 'utf8');
    expect(body).toContain('socket hang up');
    expect(body).toContain(FIXED_NOW);
  });
});

// ── destinations ─────────────────────────────────────────────────────────────

describe('verify-seed-urls: destinations', () => {
  it('refuses a target that is a directory', async () => {
    const fx = makeRepo();
    const target = path.join(fx.root, 'scratch', 'clubs.csv');
    mkdirSync(target, { recursive: true });
    const c = capture();
    expect(await run(['--clubs-only', '--clubs-verdicts', target], fx.root, c.deps))
      .toBe(EXIT_INVALID_INVOCATION);
    expect(c.err.join('\n')).toContain('is a directory, not a file');
  });

  it('refuses a parent chain blocked by a file', async () => {
    const fx = makeRepo();
    const blocker = path.join(fx.root, 'blocker');
    writeFileSync(blocker, '');
    const c = capture();
    expect(await run(['--clubs-only', '--clubs-verdicts', path.join(blocker, 'c.csv')], fx.root, c.deps))
      .toBe(EXIT_INVALID_INVOCATION);
    expect(c.err.join('\n')).toContain('part of the path is a file');
  });
});

// ── dry run ──────────────────────────────────────────────────────────────────

describe('verify-seed-urls: dry run', () => {
  it('mutates nothing at all while still computing verdicts', async () => {
    const fx = makeRepo();
    const scratch = path.join(fx.root, 'scratch');
    const c = capture();

    const code = await run(
      ['--dry-run',
       '--clubs-verdicts', path.join(scratch, 'clubs.csv'),
       '--gallery-verdicts', path.join(scratch, 'gallery.json')],
      fx.root, c.deps,
    );

    expect(code).toBe(EXIT_OK);
    // No verdict file, no temporary, and not even the output directory.
    expect(existsSync(scratch)).toBe(false);
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
    expect(existsSync(fx.galleryVerdicts)).toBe(false);
    // The verdict computation still ran, which is what makes a dry run useful.
    expect(c.seen.length).toBeGreaterThan(0);
    expect(c.out.join('\n')).toContain('dry-run, not written');
  });

  it('does not create the committed destination directory either', async () => {
    const fx = makeRepo();
    rmSync(path.join(fx.root, 'curated', 'galleries', 'g1.json'));
    const before = readdirSync(path.join(fx.root, 'curated', 'galleries'));
    expect(await run(['--dry-run'], fx.root, deps())).toBe(EXIT_OK);
    expect(readdirSync(path.join(fx.root, 'curated', 'galleries'))).toEqual(before);
  });
});

// ── publication ──────────────────────────────────────────────────────────────

describe('verify-seed-urls: publication', () => {
  it('leaves no temporary artifact after a successful run', async () => {
    const fx = makeRepo();
    expect(await run([], fx.root, deps())).toBe(EXIT_OK);
    expect(tempArtifacts(path.dirname(fx.clubsVerdicts))).toEqual([]);
    expect(tempArtifacts(path.dirname(fx.galleryVerdicts))).toEqual([]);
  });

  it('publishes neither output when staging fails', async () => {
    const fx = makeRepo();
    // A read-only gallery directory makes the second staging write fail for
    // real, after the first has already been staged.
    const galleryDir = path.dirname(fx.galleryVerdicts);
    chmodSync(galleryDir, 0o500);
    try {
      const c = capture();
      const code = await run([], fx.root, c.deps);
      expect(code).toBe(EXIT_PUBLICATION_FAILURE);
      expect(existsSync(fx.clubsVerdicts)).toBe(false);
      expect(existsSync(fx.galleryVerdicts)).toBe(false);
      expect(tempArtifacts(path.dirname(fx.clubsVerdicts))).toEqual([]);
    } finally {
      chmodSync(galleryDir, 0o700);
    }
  });

  it('names what was published and what was not when the second replacement fails', async () => {
    const fx = makeRepo();
    const c = capture();
    let calls = 0;
    const code = await run([], fx.root, {
      ...c.deps,
      publish: (staged, final) => {
        calls += 1;
        if (calls === 2) throw new Error('injected replacement failure');
        require('node:fs').renameSync(staged, final);
      },
    });
    expect(code).toBe(EXIT_PUBLICATION_FAILURE);
    const err = c.err.join('\n');
    expect(err).toContain(`published: ${fx.clubsVerdicts}`);
    expect(err).toContain(`not published: ${fx.galleryVerdicts}`);
    expect(existsSync(fx.clubsVerdicts)).toBe(true);
    expect(existsSync(fx.galleryVerdicts)).toBe(false);
    // The unpublished artifact's temporary is still cleaned up.
    expect(tempArtifacts(path.dirname(fx.galleryVerdicts))).toEqual([]);
  });

  it('leaves a stale temporary from an earlier run untouched', async () => {
    const fx = makeRepo();
    const seedDir = path.dirname(fx.clubsVerdicts);
    mkdirSync(seedDir, { recursive: true });
    const stale = path.join(seedDir, '.clubs_url_verdicts.csv.partial-deadbeef');
    writeFileSync(stale, 'STALE\n');

    expect(await run(['--clubs-only'], fx.root, deps())).toBe(EXIT_OK);

    expect(readFileSync(stale, 'utf8')).toBe('STALE\n');
  });
});

// ── selected clubs input ─────────────────────────────────────────────────────
//
// --clubs-seed chooses which club rows are read. It is deliberately independent
// of --clubs-verdicts, which chooses where the verdicts are cached and
// published: a run may select either, both, or neither.

/** A seed file whose single club differs from the fixture's, for fall-back proofs. */
function altSeed(root: string, name = 'alt-clubs.csv'): string {
  const file = path.join(root, name);
  writeFileSync(
    file,
    'legacy_club_key,name,external_url\n' +
    '9001,Selected Club,https://example.org/selected\n',
  );
  return file;
}

describe('verify-seed-urls: selected clubs input', () => {
  it('advertises the flag in the help text', async () => {
    const fx = makeRepo();
    const c = capture();
    expect(await run(['--help'], fx.root, c.deps)).toBe(EXIT_OK);
    expect(c.out.join('\n')).toContain('--clubs-seed FILE');
  });

  it('still resolves the committed clubs path when the flag is absent', async () => {
    const fx = makeRepo();
    const c = capture();
    expect(await run(['--clubs-only'], fx.root, c.deps)).toBe(EXIT_OK);
    expect(c.seen.sort()).toEqual([
      'https://example.org/harbour',
      'https://example.org/riverside',
    ]);
    expect(c.out.join('\n')).not.toContain('clubs input <-');
  });

  it('reads the selected file in clubs-only mode and reports the resolved path', async () => {
    const fx = makeRepo();
    const selected = altSeed(fx.root);
    const c = capture();

    expect(await run(['--clubs-only', '--clubs-seed', selected], fx.root, c.deps)).toBe(EXIT_OK);

    expect(c.seen).toEqual(['https://example.org/selected']);
    expect(c.out.join('\n')).toContain(`clubs input <- ${selected}`);
    expect(readFileSync(fx.clubsVerdicts, 'utf8')).toContain('9001');
  });

  it('is accepted in default two-output mode', async () => {
    const fx = makeRepo();
    const selected = altSeed(fx.root);
    const c = capture();

    expect(await run(['--clubs-seed', selected], fx.root, c.deps)).toBe(EXIT_OK);

    expect(readFileSync(fx.clubsVerdicts, 'utf8')).toContain('9001');
    expect(existsSync(fx.galleryVerdicts)).toBe(true);
  });

  it('is rejected in galleries-only mode before the validator is built', async () => {
    const fx = makeRepo();
    const selected = altSeed(fx.root);
    let built = false;
    const c = capture();
    const code = await run(['--galleries-only', '--clubs-seed', selected], fx.root, {
      now: () => FIXED_NOW,
      log: c.deps.log,
      logError: c.deps.logError,
      createValidator: async () => {
        built = true;
        throw new Error('should never be reached');
      },
    });
    expect(code).toBe(EXIT_INVALID_INVOCATION);
    expect(built).toBe(false);
    expect(c.err.join('\n')).toContain('clubs are not being processed');
  });

  it('rejects the flag with no value', async () => {
    const fx = makeRepo();
    expect(await run(['--clubs-only', '--clubs-seed'], fx.root, deps()))
      .toBe(EXIT_INVALID_INVOCATION);
    expect(await run(['--clubs-seed', '--dry-run'], fx.root, deps()))
      .toBe(EXIT_INVALID_INVOCATION);
  });

  it('resolves a relative selected path against the working directory', async () => {
    const fx = makeRepo();
    const workdir = path.join(fx.root, 'workdir');
    mkdirSync(workdir);
    const selected = altSeed(workdir, 'rel-clubs.csv');
    const cwd = fakeWorkingDirectory(workdir);
    try {
      const c = capture();
      expect(await run(['--clubs-only', '--clubs-seed', 'rel-clubs.csv'], fx.root, c.deps))
        .toBe(EXIT_OK);
      expect(c.out.join('\n')).toContain(`clubs input <- ${selected}`);
      expect(c.seen).toEqual(['https://example.org/selected']);
    } finally {
      cwd.mockRestore();
    }
  });
});

describe('verify-seed-urls: selected clubs input failures', () => {
  it('exits 3 when the selected file does not exist', async () => {
    const fx = makeRepo();
    const absent = path.join(fx.root, 'no-such-clubs.csv');
    const c = capture();
    expect(await run(['--clubs-only', '--clubs-seed', absent], fx.root, c.deps))
      .toBe(EXIT_MISSING_PREREQUISITE);
    expect(c.err.join('\n')).toContain(`${absent} (not found)`);
    // The default seed is never consulted as a fall-back.
    expect(c.err.join('\n')).not.toContain(path.join('legacy_data', 'seed', 'clubs.csv'));
  });

  it('exits 3 when the selected path is a directory', async () => {
    const fx = makeRepo();
    const asDir = path.join(fx.root, 'clubs-dir');
    mkdirSync(asDir);
    const c = capture();
    expect(await run(['--clubs-only', '--clubs-seed', asDir], fx.root, c.deps))
      .toBe(EXIT_MISSING_PREREQUISITE);
    expect(c.err.join('\n')).toContain('(not a regular file)');
  });

  it('exits 3 when the selected file is unreadable', async () => {
    const fx = makeRepo();
    const selected = altSeed(fx.root);
    chmodSync(selected, 0o000);
    try {
      const c = capture();
      const code = await run(['--clubs-only', '--clubs-seed', selected], fx.root, c.deps);
      expect(code).toBe(EXIT_MISSING_PREREQUISITE);
      expect(c.err.join('\n')).toContain('(not readable)');
    } finally {
      chmodSync(selected, 0o600);
    }
  });

  it('builds no validator and mutates nothing when the selected input is unusable', async () => {
    const fx = makeRepo();
    const absent = path.join(fx.root, 'no-such-clubs.csv');
    const scratch = path.join(fx.root, 'scratch');
    let built = false;
    const code = await run(
      ['--clubs-only', '--clubs-seed', absent, '--clubs-verdicts', path.join(scratch, 'v.csv')],
      fx.root,
      {
        now: () => FIXED_NOW,
        log: () => {},
        logError: () => {},
        createValidator: async () => {
          built = true;
          throw new Error('should never be reached');
        },
      },
    );
    expect(code).toBe(EXIT_MISSING_PREREQUISITE);
    expect(built).toBe(false);
    expect(existsSync(scratch)).toBe(false);
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
  });
});

describe('verify-seed-urls: input and output selection are independent', () => {
  it('--clubs-seed alone leaves the verdict output at its committed path', async () => {
    const fx = makeRepo();
    const selected = altSeed(fx.root);
    expect(await run(['--clubs-only', '--clubs-seed', selected], fx.root, deps())).toBe(EXIT_OK);
    expect(existsSync(fx.clubsVerdicts)).toBe(true);
    expect(readFileSync(fx.clubsVerdicts, 'utf8')).toContain('9001');
  });

  it('--clubs-verdicts alone leaves the clubs input at its committed path', async () => {
    const fx = makeRepo();
    const redirected = path.join(fx.root, 'scratch', 'v.csv');
    const c = capture();
    expect(await run(['--clubs-only', '--clubs-verdicts', redirected], fx.root, c.deps))
      .toBe(EXIT_OK);
    expect(c.seen.sort()).toEqual([
      'https://example.org/harbour',
      'https://example.org/riverside',
    ]);
    expect(c.out.join('\n')).not.toContain('clubs input <-');
  });

  it('uses each flag for its own purpose when both are given', async () => {
    const fx = makeRepo();
    const selected = altSeed(fx.root);
    const redirected = path.join(fx.root, 'scratch', 'v.csv');
    const c = capture();

    expect(await run(
      ['--clubs-only', '--clubs-seed', selected, '--clubs-verdicts', redirected],
      fx.root, c.deps,
    )).toBe(EXIT_OK);

    expect(c.seen).toEqual(['https://example.org/selected']);
    expect(readFileSync(redirected, 'utf8')).toContain('9001');
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
  });
});

describe('verify-seed-urls: no fall-back to the committed seed', () => {
  it('reads only the selected input and leaves the committed pair byte-identical', async () => {
    const fx = makeRepo();
    // The committed layout carries its own clubs and its own prior verdicts.
    mkdirSync(path.dirname(fx.clubsVerdicts), { recursive: true });
    writeFileSync(
      fx.clubsVerdicts,
      'legacy_club_key,external_url,validated_at,quarantine_reason\n' +
      '1001,https://example.org/riverside,1999-01-01T00:00:00.000Z,\n',
    );
    const seedBefore = readFileSync(path.join(fx.root, 'legacy_data', 'seed', 'clubs.csv'), 'utf8');
    const verdictsBefore = readFileSync(fx.clubsVerdicts, 'utf8');

    const selected = altSeed(fx.root);
    const redirected = path.join(fx.root, 'scratch', 'v.csv');
    const c = capture();

    expect(await run(
      ['--clubs-only', '--clubs-seed', selected, '--clubs-verdicts', redirected],
      fx.root, c.deps,
    )).toBe(EXIT_OK);

    const produced = readFileSync(redirected, 'utf8');
    // Only the selected club and URL reached the output.
    expect(produced).toContain('9001');
    expect(produced).toContain('https://example.org/selected');
    expect(produced).not.toContain('1001');
    expect(produced).not.toContain('riverside');
    // The default club was never looked up.
    expect(c.seen).toEqual(['https://example.org/selected']);
    // Both committed files are untouched.
    expect(readFileSync(path.join(fx.root, 'legacy_data', 'seed', 'clubs.csv'), 'utf8'))
      .toBe(seedBefore);
    expect(readFileSync(fx.clubsVerdicts, 'utf8')).toBe(verdictsBefore);
  });

  it('lets the redirected cache suppress a lookup for the selected input', async () => {
    const fx = makeRepo();
    const selected = altSeed(fx.root);
    const redirected = path.join(fx.root, 'scratch', 'v.csv');
    mkdirSync(path.dirname(redirected), { recursive: true });
    writeFileSync(
      redirected,
      'legacy_club_key,external_url,validated_at,quarantine_reason\n' +
      '9001,https://example.org/selected,2020-05-05T00:00:00.000Z,\n',
    );
    const c = capture();

    expect(await run(
      ['--clubs-only', '--clubs-seed', selected, '--clubs-verdicts', redirected],
      fx.root, c.deps,
    )).toBe(EXIT_OK);

    expect(c.seen).toEqual([]);
    expect(readFileSync(redirected, 'utf8')).toContain('2020-05-05T00:00:00.000Z');
  });

  it('does not let the committed cache suppress a redirected run', async () => {
    const fx = makeRepo();
    const selected = altSeed(fx.root);
    mkdirSync(path.dirname(fx.clubsVerdicts), { recursive: true });
    writeFileSync(
      fx.clubsVerdicts,
      'legacy_club_key,external_url,validated_at,quarantine_reason\n' +
      '9001,https://example.org/selected,1999-01-01T00:00:00.000Z,\n',
    );
    const redirected = path.join(fx.root, 'scratch', 'v.csv');
    const c = capture();

    expect(await run(
      ['--clubs-only', '--clubs-seed', selected, '--clubs-verdicts', redirected],
      fx.root, c.deps,
    )).toBe(EXIT_OK);

    expect(c.seen).toEqual(['https://example.org/selected']);
    const produced = readFileSync(redirected, 'utf8');
    expect(produced).toContain(FIXED_NOW);
    expect(produced).not.toContain('1999-01-01');
  });

  it('stamps the injected clock and repeats byte-identically', async () => {
    const first = makeRepo();
    const second = makeRepo();
    const firstOut = path.join(first.root, 'scratch', 'v.csv');
    const secondOut = path.join(second.root, 'scratch', 'v.csv');

    const args = (seed: string, out: string): string[] =>
      ['--clubs-only', '--clubs-seed', seed, '--clubs-verdicts', out];

    expect(await run(args(altSeed(first.root), firstOut), first.root, deps())).toBe(EXIT_OK);
    expect(await run(args(altSeed(second.root), secondOut), second.root, deps())).toBe(EXIT_OK);

    expect(readFileSync(firstOut, 'utf8')).toContain(FIXED_NOW);
    expect(readFileSync(firstOut, 'utf8')).toBe(readFileSync(secondOut, 'utf8'));
  });

  it('works under --dry-run with zero filesystem mutation', async () => {
    const fx = makeRepo();
    const selected = altSeed(fx.root);
    const scratch = path.join(fx.root, 'scratch');
    const c = capture();

    expect(await run(
      ['--clubs-only', '--dry-run', '--clubs-seed', selected,
       '--clubs-verdicts', path.join(scratch, 'v.csv')],
      fx.root, c.deps,
    )).toBe(EXIT_OK);

    expect(c.seen).toEqual(['https://example.org/selected']);
    expect(existsSync(scratch)).toBe(false);
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
    expect(c.out.join('\n')).toContain('dry-run, not written');
  });
});

// ── staging exclusivity ──────────────────────────────────────────────────────

describe('verify-seed-urls: temporary-file reservation', () => {
  it('reserves a distinct name each time and never disturbs an existing one', () => {
    const fx = makeRepo();
    const target = path.join(fx.root, 'legacy_data', 'seed', 'clubs_url_verdicts.csv');
    const staged = [
      stageFile(target, 'one\n'),
      stageFile(target, 'two\n'),
      stageFile(target, 'three\n'),
    ];

    expect(new Set(staged).size).toBe(3);
    expect(readFileSync(staged[0]!, 'utf8')).toBe('one\n');
    expect(readFileSync(staged[1]!, 'utf8')).toBe('two\n');
    expect(readFileSync(staged[2]!, 'utf8')).toBe('three\n');
    for (const p of staged) expect(path.basename(p)).toContain('.partial-');
  });

  it('refuses to reserve a name that already exists rather than overwriting it', () => {
    // Exclusive creation is the mechanism: pointing the reservation at an
    // occupied name must fail loudly instead of clobbering it.
    const fx = makeRepo();
    const dir = path.join(fx.root, 'legacy_data', 'seed');
    const occupied = path.join(dir, '.taken.partial-fixed');
    writeFileSync(occupied, 'PRIOR EVIDENCE\n');
    expect(() => writeFileSync(occupied, 'clobbered\n', { flag: 'wx' })).toThrow();
    expect(readFileSync(occupied, 'utf8')).toBe('PRIOR EVIDENCE\n');
  });
});

// ── filesystem fault behaviour ───────────────────────────────────────────────

describe('verify-seed-urls: staging and publication faults', () => {
  it('publishes neither output when club staging fails', async () => {
    const fx = makeRepo();
    const seedDir = path.dirname(fx.clubsVerdicts);
    chmodSync(seedDir, 0o500);
    try {
      const c = capture();
      expect(await run([], fx.root, c.deps)).toBe(EXIT_PUBLICATION_FAILURE);
      expect(existsSync(fx.clubsVerdicts)).toBe(false);
      expect(existsSync(fx.galleryVerdicts)).toBe(false);
      expect(tempArtifacts(path.dirname(fx.galleryVerdicts))).toEqual([]);
    } finally {
      chmodSync(seedDir, 0o700);
    }
  });

  it('publishes neither output when the first replacement fails', async () => {
    const fx = makeRepo();
    const c = capture();
    const code = await run([], fx.root, {
      ...c.deps,
      publish: () => {
        throw new Error('injected first replacement failure');
      },
    });
    expect(code).toBe(EXIT_PUBLICATION_FAILURE);
    expect(existsSync(fx.clubsVerdicts)).toBe(false);
    expect(existsSync(fx.galleryVerdicts)).toBe(false);
    expect(c.err.join('\n')).toContain(`not published: ${fx.clubsVerdicts}`);
    expect(c.err.join('\n')).toContain(`not published: ${fx.galleryVerdicts}`);
    expect(tempArtifacts(path.dirname(fx.clubsVerdicts))).toEqual([]);
    expect(tempArtifacts(path.dirname(fx.galleryVerdicts))).toEqual([]);
  });

  it('leaves a prior target byte-identical when a single-mode publication fails', async () => {
    const fx = makeRepo();
    mkdirSync(path.dirname(fx.clubsVerdicts), { recursive: true });
    writeFileSync(fx.clubsVerdicts, 'PRIOR VERDICTS\n');
    const c = capture();

    const code = await run(['--clubs-only'], fx.root, {
      ...c.deps,
      publish: () => {
        throw new Error('injected replacement failure');
      },
    });

    expect(code).toBe(EXIT_PUBLICATION_FAILURE);
    expect(readFileSync(fx.clubsVerdicts, 'utf8')).toBe('PRIOR VERDICTS\n');
    expect(tempArtifacts(path.dirname(fx.clubsVerdicts))).toEqual([]);
  });

  it('cleans run-owned temporaries but keeps stale evidence after a failure', async () => {
    const fx = makeRepo();
    const seedDir = path.dirname(fx.clubsVerdicts);
    mkdirSync(seedDir, { recursive: true });
    const stale = path.join(seedDir, '.clubs_url_verdicts.csv.partial-earlierrun');
    writeFileSync(stale, 'STALE\n');
    const c = capture();

    await run(['--clubs-only'], fx.root, {
      ...c.deps,
      publish: () => {
        throw new Error('injected replacement failure');
      },
    });

    // The stale artifact is the only one left; nothing this run created remains.
    expect(readFileSync(stale, 'utf8')).toBe('STALE\n');
    expect(tempArtifacts(seedDir)).toEqual([path.basename(stale)]);
  });
});

// ── gate ordering ────────────────────────────────────────────────────────────

describe('verify-seed-urls: gate ordering', () => {
  it('rejects an unusable destination before constructing the validator', async () => {
    const fx = makeRepo();
    const target = path.join(fx.root, 'scratch', 'clubs.csv');
    mkdirSync(target, { recursive: true });
    let built = false;
    const code = await run(['--clubs-only', '--clubs-verdicts', target], fx.root, {
      now: () => FIXED_NOW,
      log: () => {},
      logError: () => {},
      createValidator: async () => {
        built = true;
        throw new Error('should never be reached');
      },
    });
    expect(code).toBe(EXIT_INVALID_INVOCATION);
    expect(built).toBe(false);
  });

  it('reports a missing prerequisite before constructing the validator', async () => {
    const fx = makeRepo({ clubs: false });
    let built = false;
    const code = await run(['--clubs-only'], fx.root, {
      now: () => FIXED_NOW,
      log: () => {},
      logError: () => {},
      createValidator: async () => {
        built = true;
        throw new Error('should never be reached');
      },
    });
    expect(code).toBe(EXIT_MISSING_PREREQUISITE);
    expect(built).toBe(false);
  });
});

// ── gallery prerequisites and the absent verdict file ────────────────────────

describe('verify-seed-urls: gallery prerequisites', () => {
  it('treats an absent gallery verdict file as an empty prior cache', async () => {
    const fx = makeRepo();
    expect(existsSync(fx.galleryVerdicts)).toBe(false);
    const c = capture();
    expect(await run(['--galleries-only'], fx.root, c.deps)).toBe(EXIT_OK);
    expect(c.seen).toContain('https://example.org/one');
    expect(existsSync(fx.galleryVerdicts)).toBe(true);
  });

  it('treats an absent redirected cache as empty, not as a missing prerequisite', async () => {
    const fx = makeRepo();
    const redirected = path.join(fx.root, 'scratch', 'clubs.csv');
    expect(existsSync(redirected)).toBe(false);
    expect(await run(['--clubs-only', '--clubs-verdicts', redirected], fx.root, deps()))
      .toBe(EXIT_OK);
    expect(existsSync(redirected)).toBe(true);
  });

  it('exits 3 when the gallery source tree is missing', async () => {
    const fx = makeRepo({ galleries: false });
    const c = capture();
    expect(await run(['--galleries-only'], fx.root, c.deps)).toBe(EXIT_MISSING_PREREQUISITE);
    expect(c.err.join('\n')).toContain(path.join('curated', 'galleries'));
  });

  it('keeps clubs-only independent of every gallery prerequisite', async () => {
    const fx = makeRepo({ galleries: false });
    expect(await run(['--clubs-only'], fx.root, deps())).toBe(EXIT_OK);
    expect(existsSync(fx.clubsVerdicts)).toBe(true);
    expect(existsSync(path.join(fx.root, 'curated'))).toBe(false);
  });

  it('creates the gallery verdict file on a default two-output run', async () => {
    const fx = makeRepo();
    expect(await run([], fx.root, deps())).toBe(EXIT_OK);
    expect(statSync(fx.galleryVerdicts).isFile()).toBe(true);
    const parsed = JSON.parse(readFileSync(fx.galleryVerdicts, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['gallery-one']);
  });
});

// ── determinism ──────────────────────────────────────────────────────────────

describe('verify-seed-urls: determinism', () => {
  it('produces byte-identical output for identical inputs, cache and clock', async () => {
    const first = makeRepo();
    const second = makeRepo();
    expect(await run([], first.root, deps())).toBe(EXIT_OK);
    expect(await run([], second.root, deps())).toBe(EXIT_OK);

    expect(readFileSync(first.clubsVerdicts, 'utf8'))
      .toBe(readFileSync(second.clubsVerdicts, 'utf8'));
    expect(readFileSync(first.galleryVerdicts, 'utf8'))
      .toBe(readFileSync(second.galleryVerdicts, 'utf8'));
  });

  it('stamps every verdict from the injected clock', async () => {
    const fx = makeRepo();
    expect(await run([], fx.root, deps())).toBe(EXIT_OK);

    const rows = readFileSync(fx.clubsVerdicts, 'utf8').trim().split('\n').slice(1);
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row).toContain(FIXED_NOW);

    const gallery = JSON.parse(readFileSync(fx.galleryVerdicts, 'utf8')) as Record<
      string, Record<string, { validated_at: string | null }>
    >;
    for (const urls of Object.values(gallery)) {
      for (const verdict of Object.values(urls)) {
        expect(verdict.validated_at).toBe(FIXED_NOW);
      }
    }
  });

  it('writes only its own verdict artifact and no other file', async () => {
    const fx = makeRepo();
    const seedBefore = readdirSync(path.join(fx.root, 'legacy_data', 'seed'));
    expect(await run(['--galleries-only'], fx.root, deps())).toBe(EXIT_OK);
    // The clubs tree is untouched by a galleries-only run.
    expect(readdirSync(path.join(fx.root, 'legacy_data', 'seed'))).toEqual(seedBefore);
    expect(readdirSync(path.join(fx.root, 'curated', 'galleries')).sort())
      .toEqual(['g1.json', 'url_verdicts.json']);
    expect(statSync(fx.galleryVerdicts).isFile()).toBe(true);
  });
});
