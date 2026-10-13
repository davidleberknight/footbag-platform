/**
 * Only the legacy refresh reads the legacy webmaster's repository.
 *
 * Everything downstream reads the vetted CSVs the refresh writes into the
 * private checkout, so a delivery reaches the member load, the crawl and the
 * builds only after the refresh accepted it and a maintainer reviewed its
 * findings. A second reader of the repository or its dumps skips that review.
 * This scan finds every file naming the repository, its symlinks, a dump file or
 * the old dump parser, and requires each to be a named entry below with its
 * reason. The mirror program carries no entry apart from retired files: it reads
 * only what the publish step writes for it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { REPO_ROOT, listFiles, scanSource } from '../fixtures/sourceTree';

const NEEDLES = [
  'footbag_legacy_repo',
  'footbag_legacy_repo_original_data',
  'FOOTBAG_LEGACY_REPO',
  'latest.sql',
  '_dump_parser',
];

const EXTS = ['.py', '.sh', '.ts', '.md', '.yaml', '.yml', '.toml', '.txt', '.mjs'];

// The source folders, named one by one so no machine-local tree beside them is
// read: the site mirror, the virtual environment and every pipeline output
// folder stay out because none is named.
const ROOTS = [
  'scripts', 'src', 'tests', 'docs', 'database', 'ops', 'docker', 'terraform',
  '.claude/agents', '.claude/hooks', '.claude/playwright', '.claude/rules', '.claude/skills',
  'freestyle/doctrine', 'freestyle/inputs', 'freestyle/loaders', 'freestyle/scripts',
  'freestyle/symbolic_grammar', 'freestyle/tools',
  'legacy_data/tests', 'legacy_data/pipeline', 'legacy_data/scripts', 'legacy_data/tools',
  'legacy_data/overrides', 'legacy_data/qc', 'legacy_data/legacy_repo_scripts',
  'legacy_data/runbooks', 'legacy_data/inputs', 'legacy_data/clubs/scripts',
  'legacy_data/membership/scripts', 'legacy_data/persons', 'legacy_data/event_results/scripts',
  'legacy_data/legacy_mirror/scripts', 'legacy_data/legacy_mirror/tests',
  'legacy_data/legacy_mirror/mirror_seeds',
];
const SHALLOW = [
  'legacy_data', 'legacy_data/legacy_mirror', 'legacy_data/member_data_scripts',
  'legacy_data/event_results', 'freestyle',
];
// Files at the checkout root: the operator entry points and tool configuration
// by extension, and the guard files that carry no extension or start with a dot.
const ROOT_FILE_PATTERN = /\.(sh|ts|mjs)$/;
const ROOT_FILES = ['.gitignore', '.gitleaks.toml', '.claude/settings.json'];

const ALLOWED: Record<string, string> = {
  'legacy_data/scripts/refresh_legacy_repo_data.py': 'the refresh, the one reader of the repository',
  'legacy_data/tests/test_refresh_legacy_repo_data.py': 'drives the refresh against a synthetic delivery',
  'legacy_data/tests/test_strict_dump_parser.py': "drives the refresh's strict dump reader on synthetic dumps",
  'legacy_data/scripts/publish_legacy_repo_data.py':
    "reads the refresh manifest, whose source column is the vetted dump's path; opens no dump",
  'legacy_data/tests/test_publish_legacy_repo_data.py': 'writes that manifest in its fixture',
  'scripts/setup_private_repo.sh': "wires the checkout's symlinks",
  'tests/integration/setupPrivateRepo.script.test.ts': 'drives the symlink wiring',
  'scripts/ci/test_hooks.sh': 'exercises the hooks that guard the legacy paths',
  '.gitignore': 'keeps the repository symlinks out of version control',
  '.gitleaks.toml': 'scopes the secret scan around the legacy paths',
  '.claude/settings.json': "denies agents' writes to the legacy paths",
  'docs/DESIGN_DECISIONS.md': 'describes the refresh',
  'docs/CLAUDE_CODE_GUIDE.md': 'describes the refresh',
  'legacy_data/CLAUDE.md': 'describes the refresh',
  'legacy_data/README.md': 'describes the refresh',
  'legacy_data/member_data_scripts/README.md': 'lists the retired dump readers as retired',
  'legacy_data/member_data_scripts/SMOKE_SIGNOFF.md': 'dated evidence of a past member load',
  'tests/unit/legacy-repo-readers.test.ts': 'this scan, which names what it looks for',
  'legacy_data/tests/test_run_legacy_members_wiring.py':
    'asserts the member load names none of them',
  // Retired: kept as the record of how earlier outputs were made; nothing runs them.
  'legacy_data/scripts/derive_vote_tallies.py': 'retired; publish derives the vote tallies',
  'legacy_data/scripts/extract_footbag_org_moves_metadata.py': 'retired; its output is frozen',
  'legacy_data/scripts/extract_legacy_estate.py': 'retired; the refresh writes the export',
  'legacy_data/tests/test_extract_legacy_estate.py': 'covers the retired estate extractor',
  'legacy_data/legacy_mirror/scripts/build_archive_seed_lists.py': 'retired; publish writes the seed lists',
  'legacy_data/legacy_mirror/tests/test_build_archive_seed_lists.py': 'covers the retired seed builder',
  'legacy_data/legacy_mirror/scripts/regenerate_gallery_thumbnails.py': 'retired; no longer part of the mirror',
  'legacy_data/legacy_repo_scripts/config/sources.yaml': 'retired forensic layer, dormant',
  'legacy_data/legacy_repo_scripts/scripts/ingest.py': 'retired forensic layer, dormant',
  'legacy_data/legacy_repo_scripts/scripts/seal.py': 'retired forensic layer, dormant',
  'legacy_data/member_data_scripts/extract_legacy_members.py':
    'retired; the member load reads the published member CSV',
  'legacy_data/member_data_scripts/extract_legacy_admins.py': 'retired; publish sets the admin flag',
  'legacy_data/member_data_scripts/_dump_parser.py': "retired with the member extractors",
  'legacy_data/tests/test_dump_parser.py': 'covers the retired dump parser',
};

interface Scope {
  root: string;
  roots: string[];
  shallow: string[];
  rootFiles: string[];
}

/** Repository-relative paths of every scanned file that names a needle. */
function referencing(scope: Scope): Set<string> {
  const hits = new Set<string>();
  for (const needle of NEEDLES) {
    for (const f of scanSource(needle, {
      roots: scope.roots, shallow: scope.shallow, exts: EXTS, root: scope.root,
    })) hits.add(f);
    for (const f of scope.rootFiles) {
      if (readFileSync(path.join(scope.root, f), 'utf8').includes(needle)) hits.add(f);
    }
  }
  return hits;
}

const REAL: Scope = {
  root: REPO_ROOT,
  roots: ROOTS,
  shallow: SHALLOW,
  rootFiles: [...listFiles('.', ROOT_FILE_PATTERN), ...ROOT_FILES],
};

describe('legacy repository readers', () => {
  // Defect caught: a new script reads the dump directly, so a delivery reaches
  // the member load or the crawl without the refresh's checks or the
  // maintainer's review of its findings.
  it('every file naming the legacy repository or a dump is a listed entry with its reason', () => {
    const hits = referencing(REAL);
    expect([...hits].filter((f) => !(f in ALLOWED)).sort()).toEqual([]);
  });

  // Defect caught: an entry outlives the reference it excused, and later
  // excuses a new reader added under the same name.
  it('every listed entry still names one', () => {
    const hits = referencing(REAL);
    expect(Object.keys(ALLOWED).filter((f) => !hits.has(f)).sort()).toEqual([]);
  });

  describe('the scan itself', () => {
    const scratch = createScratchDir('legacy-repo-readers');
    afterAll(() => removeScratch(scratch));

    // Defect caught: the scan stops looking inside a folder or a needle, and
    // the two cases above pass over a tree they never read.
    it('reports a planted reader and nothing else', () => {
      mkdirSync(path.join(scratch, 'scripts', 'nested'), { recursive: true });
      writeFileSync(path.join(scratch, 'scripts', 'nested', 'reader.py'),
        "DUMP = 'members/backups/latest.sql'\n");
      writeFileSync(path.join(scratch, 'scripts', 'clean.py'), "print('ok')\n");
      writeFileSync(path.join(scratch, '.gitignore'), '/footbag_legacy_repo\n');
      const hits = referencing({
        root: scratch, roots: ['scripts'], shallow: [], rootFiles: ['.gitignore'],
      });
      expect([...hits].sort()).toEqual(['.gitignore', 'scripts/nested/reader.py']);
    });
  });
});
