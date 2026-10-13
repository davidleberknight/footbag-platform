// Redirected club production chain, end to end into a scratch directory.
//
// Each producer has been proved isolated on its own. This proves they compose:
// that the three real command-line entry points hand their output to each other
// through one scratch seed directory, and that the committed legacy_data/seed/
// tree is not touched at any point.
//
// Stages 1 and 2 run as real subprocesses. Stage 3 runs through the verifier's
// real argument parsing, prerequisite checks, cache reading, verdict
// computation, serialisation, staging and publication, with the validator and
// the clock injected so no network call and no environment contract is involved.
// Nothing is mocked and no stage is bypassed.
//
// The mirror is entirely synthetic. The production mirror, the legacy dump, the
// database and the network are never reached.
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  statSync,
  lstatSync,
  copyFileSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { run, EXIT_OK, EXIT_MISSING_PREREQUISITE } from '../../scripts/verify-seed-urls';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS = path.join(REPO_ROOT, 'legacy_data', 'scripts');

const FIXED_NOW = '2026-03-04T05:06:07.000Z';

// A club whose page the legacy site still served: it reaches every stage.
const KEPT_KEY = '2001';
const KEPT_URL = 'https://example.org/riverside-mirror';
const MEMBER_NAME = 'Ada Lovelace';
const MEMBER_ID = '77001';
// A club the site no longer served: the capture holds its roster but no club
// page, so it is not in the club seed and its roster must not reach the member
// seed either.
const GONE_KEY = '2002';
const GONE_MEMBER_NAME = 'Grace Hopper';
const GONE_MEMBER_ID = '77002';

const roots: string[] = [];

// The stages below are the real extractors, which parse the mirror's saved HTML
// with BeautifulSoup, so this suite runs them under an interpreter that carries
// the pipeline's dependencies. The pipeline's own entry points take those from a
// virtual environment beside the legacy data, so resolve it the same way they
// do; a host that installs the requirements into the interpreter on the path
// instead, as the continuous-integration runner does, is served by the fallback.
function resolvePython(): string {
  const legacy = path.join(REPO_ROOT, 'legacy_data');
  for (const candidate of [process.env.VENV_DIR, '.venv', 'footbag_venv', 'venv']) {
    if (!candidate) continue;
    const bin = path.resolve(legacy, candidate, 'bin', 'python');
    if (existsSync(bin)) return bin;
  }
  return 'python3';
}

const PYTHON = resolvePython();

// Proving the dependency once, before any stage runs, turns an environment gap
// into a single sentence naming the fix; without it every stage dies at its
// import line and the suite reports only mismatched exit statuses, which
// describe the symptom and not the cause.
beforeAll(() => {
  const probe = spawnSync(PYTHON, ['-c', 'import bs4'], {
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  if (probe.status !== 0) {
    throw new Error(
      'This suite runs the legacy club extractors as real subprocesses, and they ' +
      'need BeautifulSoup importable by the interpreter that runs them, which ' +
      `resolved here to ${PYTHON}. Build the pipeline's virtual environment ` +
      'with: bash legacy_data/run_pipeline.sh venv (run_dev.sh does this too). ' +
      'The probe reported: ' +
      `${(probe.stderr ?? '').trim() || probe.error?.message || 'interpreter not runnable'}`,
    );
  }
});

afterEach(() => {
  while (roots.length) {
    const dir = roots.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A test that made a directory read-only can block removal; the OS
      // reclaims the temp tree regardless.
    }
  }
});

// ── committed-tree fingerprinting ────────────────────────────────────────────

interface Entry {
  type: 'file' | 'dir' | 'other';
  size: number;
  sha256: string | null;
}

/**
 * Recursive fingerprint: path, type, size, and content hash.
 *
 * Modification time was in here and is deliberately out. The claim this guard
 * makes is that the script under test did not change the committed trees, and
 * content answers that. Modification time answers a different question, "did
 * anything at all touch these files", which a checkout, a rebase, a formatter
 * or an editor saving over an unchanged buffer all answer yes to while the
 * content is identical. That turned an invariant about the script into one
 * about everything else happening on the machine. The case it gives up is a
 * rewrite that restores byte-identical content, which is not a loss worth
 * having: nothing downstream can tell that apart from no write at all.
 */
function fingerprint(root: string): Record<string, Entry> {
  const out: Record<string, Entry> = {};
  if (!existsSync(root)) return out;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const rel = path.relative(root, full);
      const st = lstatSync(full);
      if (st.isDirectory()) {
        out[rel] = { type: 'dir', size: 0, sha256: null };
        walk(full);
      } else if (st.isFile()) {
        out[rel] = {
          type: 'file',
          size: st.size,
          sha256: createHash('sha256').update(readFileSync(full)).digest('hex'),
        };
      } else {
        out[rel] = { type: 'other', size: 0, sha256: null };
      }
    }
  };
  walk(root);
  return out;
}

const COMMITTED_SEED = path.join(REPO_ROOT, 'legacy_data', 'seed');
const COMMITTED_GALLERIES = path.join(REPO_ROOT, 'curated', 'galleries');
const COMMITTED_GALLERY_VERDICTS = path.join(COMMITTED_GALLERIES, 'url_verdicts.json');

interface CommittedState {
  seed: Record<string, Entry>;
  galleries: Record<string, Entry>;
  galleryVerdictsPresent: boolean;
}

function committedState(): CommittedState {
  return {
    seed: fingerprint(COMMITTED_SEED),
    galleries: fingerprint(COMMITTED_GALLERIES),
    galleryVerdictsPresent: existsSync(COMMITTED_GALLERY_VERDICTS),
  };
}

/** Compares by value, so an added, removed, changed or retyped path all fail. */
function expectCommittedUnchanged(before: CommittedState, after: CommittedState): void {
  expect(Object.keys(after.seed).sort()).toEqual(Object.keys(before.seed).sort());
  expect(after.seed).toEqual(before.seed);
  expect(Object.keys(after.galleries).sort()).toEqual(Object.keys(before.galleries).sort());
  expect(after.galleries).toEqual(before.galleries);
  expect(after.galleryVerdictsPresent).toBe(before.galleryVerdictsPresent);
}

// ── synthetic fixtures ───────────────────────────────────────────────────────

function clubPage(name: string, url: string): string {
  return `<html><body>
<h1 class="clubsShowName">${name}</h1>
<div class="clubsLocationHeader">Springfield, Illinois, United States</div>
<div class="clubsContacts"><a href="/members/profile/4242/">Contact</a></div>
<div class="clubsURL"><a href="${url}">site</a></div>
<div id="ClubsWelcome">All levels welcome.</div>
<div id="MainModified">Created Sun Jan 15 10:16:52 2012; last update Mon Jan 16 11:17:53 2012.</div>
</body></html>
`;
}

function membersPage(name: string, id: string): string {
  return `<html><body>
<table class="membersSearchResultsTable">
<tr><td class="memberName">${name}</td>
    <td class="memberAlias"><a href="/members/profile/${id}/">alias</a></td></tr>
</table>
</body></html>
`;
}

interface Chain {
  root: string;
  scriptsDir: string;
  scratchSeed: string;
  clubsCsv: string;
  membersCsv: string;
  verdictsCsv: string;
}

function makeChain(): Chain {
  const root = mkdtempSync(path.join(os.tmpdir(), 'footbag-test-chain-'));
  roots.push(root);

  const scriptsDir = path.join(root, 'legacy_data', 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  for (const name of [
    'extract_clubs.py',
    'extract_club_members.py',
    'club_curation.py',
    'extractor_output.py',
  ]) {
    copyFileSync(path.join(SCRIPTS, name), path.join(scriptsDir, name));
  }

  const clubs = path.join(root, 'footbag_legacy_mirror', 'www.footbag.org', 'clubs');
  const keptShow = path.join(clubs, 'show', KEPT_KEY);
  mkdirSync(keptShow, { recursive: true });
  writeFileSync(path.join(keptShow, 'index.html'), clubPage('Riverside Footbag Club', KEPT_URL));
  // The club the site no longer served has a show directory with no club page.
  mkdirSync(path.join(clubs, 'show', GONE_KEY), { recursive: true });
  for (const [key, name, id] of [
    [KEPT_KEY, MEMBER_NAME, MEMBER_ID],
    [GONE_KEY, GONE_MEMBER_NAME, GONE_MEMBER_ID],
  ] as const) {
    const roster = path.join(clubs, `ClubID_${key}`, 'showmembers');
    mkdirSync(roster, { recursive: true });
    writeFileSync(path.join(roster, 'index.html'), membersPage(name, id));
  }

  // One scratch seed directory for all three generated outputs, deliberately not
  // shaped like the repository layout.
  const scratchSeed = path.join(root, 'scratch-seed');
  mkdirSync(scratchSeed, { recursive: true });

  return {
    root,
    scriptsDir,
    scratchSeed,
    clubsCsv: path.join(scratchSeed, 'clubs.csv'),
    membersCsv: path.join(scratchSeed, 'club_members.csv'),
    verdictsCsv: path.join(scratchSeed, 'clubs_url_verdicts.csv'),
  };
}

// ── stage drivers ────────────────────────────────────────────────────────────

interface StageResult {
  status: number;
  stdout: string;
  stderr: string;
}

// spawnSync rather than execFileSync so stderr comes back on every path: a stage
// that dies before it can print anything of its own, on a missing interpreter or
// an unimportable module, is diagnosed from the traceback it did produce rather
// than from a bare exit status.
function python(script: string, args: string[], cwd: string): StageResult {
  const r = spawnSync(PYTHON, [script, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    ...SPAWN_GUARD,
  });
  // A signal kill reports a null status. Naming the signal keeps the guard's own
  // kill legible as a kill, rather than surfacing as an unexplained null.
  if (r.status === null) {
    return {
      status: -1,
      stdout: r.stdout ?? '',
      stderr: `${r.stderr ?? ''}\nkilled by signal ${r.signal ?? 'unknown'}`,
    };
  }
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Records which stages were invoked, so a test can prove later ones did not run. */
interface ChainRun {
  invoked: string[];
  results: Record<string, StageResult>;
  validated: string[];
  verifierExit: number | null;
  /** clubs.csv as each stage left it, so intermediate state can be asserted. */
  snapshots: Record<string, string>;
  /** Whether stage 3 ever reached for the real validator factory. */
  validatorBuilt: boolean;
}

async function runChain(
  chain: Chain,
  opts: { beforeStage?: (name: string) => void } = {},
): Promise<ChainRun> {
  const out: ChainRun = {
    invoked: [], results: {}, validated: [], verifierExit: null, snapshots: {},
    validatorBuilt: false,
  };

  const stage = (name: string, script: string, args: string[]): boolean => {
    opts.beforeStage?.(name);
    out.invoked.push(name);
    const result = python(path.join(chain.scriptsDir, script), args, chain.root);
    out.results[name] = result;
    if (existsSync(chain.clubsCsv)) {
      out.snapshots[name] = readFileSync(chain.clubsCsv, 'utf8');
    }
    // A failed stage stops the chain, so a later stage can never mask an
    // earlier failure and the invocation ledger records exactly what ran.
    return result.status === 0;
  };

  if (!stage('extract_clubs', 'extract_clubs.py', ['--out-dir', chain.scratchSeed])) {
    return out;
  }
  // The member extractor filters its rows to the clubs the club seed contains,
  // so it is pointed at the clubs.csv this chain has just produced rather than
  // the committed one. Both sides of the chain then describe one club universe,
  // which is the property the whole redirected run exists to check.
  if (!stage('extract_club_members', 'extract_club_members.py',
             ['--out-dir', chain.scratchSeed, '--clubs-csv', chain.clubsCsv])) {
    return out;
  }

  opts.beforeStage?.('verify');
  out.invoked.push('verify');
  out.verifierExit = await run(
    ['--clubs-only', '--clubs-seed', chain.clubsCsv, '--clubs-verdicts', chain.verdictsCsv],
    chain.root,
    {
      validate: async (url) => {
        out.validated.push(url);
        return { valid: true };
      },
      // Present only so a test can prove it was never reached; an injected
      // `validate` short-circuits ahead of it on every successful path.
      createValidator: async () => {
        out.validatorBuilt = true;
        throw new Error('the real validator must never be constructed here');
      },
      now: () => FIXED_NOW,
      log: () => {},
      logError: () => {},
    },
  );
  return out;
}

function scratchLeftovers(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(
    (f) => f.includes('.partial-') || f.includes('.recovery-') || f.endsWith('.tmp'),
  );
}

// ── the chain ────────────────────────────────────────────────────────────────

describe('redirected club production chain', () => {
  it('runs all three stages into one scratch directory and touches no committed path', async () => {
    const before = committedState();
    const chain = makeChain();

    const result = await runChain(chain);

    // Stage 1: the club seed holds the served club and not the one whose page
    // is gone.
    expect(result.results.extract_clubs!.status, result.results.extract_clubs!.stderr).toBe(0);
    expect(result.results.extract_clubs!.stdout).toContain('GENERATED');
    const clubsCsv = result.snapshots.extract_clubs!;
    expect(clubsCsv).toContain(KEPT_KEY);
    expect(clubsCsv).toContain(KEPT_URL);
    expect(clubsCsv).not.toContain(GONE_KEY);

    // Stage 2: the served club's roster is kept, and the gone club's roster is
    // left out because the club seed does not hold its club.
    expect(
      result.results.extract_club_members!.status,
      result.results.extract_club_members!.stderr,
    ).toBe(0);
    expect(result.results.extract_club_members!.stdout).toContain('GENERATED');
    const members = readFileSync(chain.membersCsv, 'utf8');
    expect(members).toContain(KEPT_KEY);
    expect(members).toContain(MEMBER_NAME);
    expect(members).toContain(MEMBER_ID);
    expect(members).not.toContain(GONE_KEY);
    expect(members).not.toContain(GONE_MEMBER_NAME);
    expect(members).not.toContain(GONE_MEMBER_ID);

    // Stage 3: verified the URLs of the seed the chain produced.
    expect(result.verifierExit).toBe(EXIT_OK);
    // The injected transport handled every lookup; the real validator, and with
    // it any environment or network dependency, was never constructed.
    expect(result.validatorBuilt).toBe(false);
    expect(result.validated).toEqual([KEPT_URL]);
    const verdicts = readFileSync(chain.verdictsCsv, 'utf8');
    expect(verdicts).toContain(KEPT_URL);
    expect(verdicts).toContain(FIXED_NOW);

    // All three outputs landed in the one scratch directory and nowhere else.
    expect(readdirSync(chain.scratchSeed).sort())
      .toEqual(['club_members.csv', 'clubs.csv', 'clubs_url_verdicts.csv']);
    expect(scratchLeftovers(chain.scratchSeed)).toEqual([]);

    expectCommittedUnchanged(before, committedState());
  });

  it('produces byte-identical output from equivalent clean fixtures', async () => {
    const first = makeChain();
    const second = makeChain();

    // Two independent trees, each starting empty, so nothing can be inherited
    // from the other run or from a prior verdict cache.
    expect(first.root).not.toBe(second.root);
    expect(readdirSync(first.scratchSeed)).toEqual([]);
    expect(readdirSync(second.scratchSeed)).toEqual([]);

    expect((await runChain(first)).verifierExit).toBe(EXIT_OK);
    expect((await runChain(second)).verifierExit).toBe(EXIT_OK);

    for (const name of ['clubs.csv', 'club_members.csv', 'clubs_url_verdicts.csv']) {
      expect(readFileSync(path.join(first.scratchSeed, name), 'utf8'))
        .toBe(readFileSync(path.join(second.scratchSeed, name), 'utf8'));
    }
  });
});

// ── failure sequencing ───────────────────────────────────────────────────────

describe('redirected club chain: failure sequencing', () => {
  it('regenerates over an existing output newer than the extractor', async () => {
    const before = committedState();
    const chain = makeChain();
    // An output that looks fresh must still be replaced, or the seed would stop
    // following the mirror once the script is older than its output.
    writeFileSync(chain.clubsCsv, 'STALE\n');
    const future = Date.now() / 1000 + 10_000;
    const touched = spawnSync(
      PYTHON,
      [
        '-c',
        `import os,sys; os.utime(sys.argv[1], (${future}, ${future}))`,
        chain.clubsCsv,
      ],
      { encoding: 'utf8', ...SPAWN_GUARD },
    );
    expect(touched.status, touched.stderr).toBe(0);

    const regenerated = python(
      path.join(chain.scriptsDir, 'extract_clubs.py'),
      ['--out-dir', chain.scratchSeed],
      chain.root,
    );

    expect(regenerated.status, regenerated.stderr).toBe(0);
    const written = readFileSync(chain.clubsCsv, 'utf8');
    expect(written).not.toBe('STALE\n');
    expect(written).toContain(KEPT_KEY);
    expectCommittedUnchanged(before, committedState());
  });

  it('does not run later stages when stage 1 fails', async () => {
    const before = committedState();
    const chain = makeChain();
    // Remove the mirror so the extractor cannot run.
    rmSync(path.join(chain.root, 'footbag_legacy_mirror'), { recursive: true, force: true });

    const result = await runChain(chain);

    expect(result.results.extract_clubs!.status, result.results.extract_clubs!.stderr).toBe(1);
    // The status alone does not prove the intended path: an extractor that died
    // for any other reason, an unimportable module among them, also exits 1. The
    // refusal this test is about announces itself, so assert on the announcement.
    expect(result.results.extract_clubs!.stderr).toContain('mirror not found');
    expect(result.invoked).toEqual(['extract_clubs']);
    expect(result.verifierExit).toBeNull();
    expect(existsSync(chain.clubsCsv)).toBe(false);
    expectCommittedUnchanged(before, committedState());
  });

  it('does not run stage 3 when stage 2 fails', async () => {
    const before = committedState();
    const chain = makeChain();
    let result: ChainRun;
    try {
      // The scratch directory becomes read-only just before the member
      // extractor, so stage 2 fails for real while stage 1 succeeds.
      result = await runChain(chain, {
        beforeStage: (name) => {
          if (name === 'extract_club_members') chmodSync(chain.scratchSeed, 0o500);
        },
      });
    } finally {
      chmodSync(chain.scratchSeed, 0o700);
    }

    expect(result.results.extract_clubs!.status, result.results.extract_clubs!.stderr).toBe(0);
    expect(
      result.results.extract_club_members!.status,
      result.results.extract_club_members!.stdout,
    ).not.toBe(0);
    // The invocation ledger is the proof, not the absence of a file.
    expect(result.invoked).toEqual(['extract_clubs', 'extract_club_members']);
    expect(result.verifierExit).toBeNull();
    expect(existsSync(chain.membersCsv)).toBe(false);
    expect(existsSync(chain.verdictsCsv)).toBe(false);
    expectCommittedUnchanged(before, committedState());
  });

  it('exits 3 when the verifier is pointed at a clubs file the chain never produced', async () => {
    const before = committedState();
    const chain = makeChain();
    const absent = path.join(chain.scratchSeed, 'never-produced.csv');
    const validated: string[] = [];
    let validatorBuilt = false;

    const code = await run(
      ['--clubs-only', '--clubs-seed', absent, '--clubs-verdicts', chain.verdictsCsv],
      chain.root,
      {
        // No injected `validate`, so the real factory is the only route to a
        // validator; it must never be reached.
        createValidator: async () => {
          validatorBuilt = true;
          throw new Error('the real validator must never be constructed here');
        },
        now: () => FIXED_NOW,
        log: () => {},
        logError: () => {},
      },
    );

    expect(code).toBe(EXIT_MISSING_PREREQUISITE);
    expect(validatorBuilt).toBe(false);
    expect(validated).toEqual([]);
    expect(existsSync(chain.verdictsCsv)).toBe(false);
    expect(scratchLeftovers(chain.scratchSeed)).toEqual([]);
    expectCommittedUnchanged(before, committedState());
  });
});
