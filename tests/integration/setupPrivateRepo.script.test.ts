/**
 * scripts/setup_private_repo.sh — wiring a checkout to its companion.
 *
 * The companion-checkout root link, four values-file links, and three
 * secrets-file links. The read-only legacy clone is considered only when
 * `--legacy-repo` is passed. The secrets files are gitignored in the companion
 * checkout as well, so no clone carries them: an operator creates them, and a
 * developer's checkout lacks them by design, which must not stop the root link
 * every developer with access needs.
 * They were hand-typed `ln -s` commands in an onboarding document that wired
 * two of them and never mentioned the rest. Every way they go wrong is
 * silent: a missing values link fails at terraform with a message about
 * undeclared variables and nothing about a link; a link to a file the private
 * checkout does not carry looks healthy in `ls -l` and fails only when
 * terraform reads it; and a real values file sitting where a link belongs is
 * somebody's local edit that a careless `ln -sf` destroys without asking.
 *
 * What is pinned here is the whole decision surface, because the mutating path
 * creates nothing outside a throwaway directory and so can be driven in full:
 *
 *   - a correctly wired tree is left alone and says so;
 *   - a regular file where a link belongs stops the run rather than being
 *     replaced;
 *   - a link is never created to a target the companion checkout lacks;
 *   - a missing committed values file stops the run, while a missing
 *     operator-only secrets file is skipped and named;
 *   - an existing link pointing elsewhere is replaced rather than followed,
 *     which would otherwise bury the new link inside the old target;
 *   - the values links keep their relative form, so they are identical on every
 *     machine and only the root link is machine-specific;
 *   - nothing happens without a typed confirmation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  readlinkSync,
  lstatSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/setup_private_repo.sh');
const LIB = join(process.cwd(), 'scripts/lib');

const COMMITTED_LINKS = [
  ['terraform/staging/terraform.tfvars', 'staging.tfvars'],
  ['terraform/production/terraform.tfvars', 'production.tfvars'],
  ['terraform/shared/terraform.tfvars', 'shared.tfvars'],
  ['terraform/identity/terraform.tfvars', 'identity.tfvars'],
] as const;

const SECRETS_LINKS = [
  ['terraform/staging/secrets.auto.tfvars', 'staging.secrets.auto.tfvars'],
  ['terraform/production/secrets.auto.tfvars', 'production.secrets.auto.tfvars'],
  ['terraform/shared/secrets.auto.tfvars', 'shared.secrets.auto.tfvars'],
] as const;

const VALUES_LINKS = [...COMMITTED_LINKS, ...SECRETS_LINKS];

/** A companion checkout as a developer's clone has it: no secrets files. */
function removeSecretsFromCompanion() {
  for (const [, name] of SECRETS_LINKS) {
    rmSync(join(privateRepo, 'terraform', name));
  }
}

let root: string;
let fakeRepo: string;
let privateRepo: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'footbag-test-wiring-'));

  // A throwaway checkout carrying only what the script reaches for: its own
  // copy of the script, the shared libraries it sources, and one directory per
  // tree that takes a values file.
  fakeRepo = join(root, 'platform');
  mkdirSync(join(fakeRepo, 'scripts'), { recursive: true });
  spawnSync('cp', ['-r', LIB, join(fakeRepo, 'scripts', 'lib')], SPAWN_GUARD);
  spawnSync('cp', [SCRIPT, join(fakeRepo, 'scripts', 'setup_private_repo.sh')], SPAWN_GUARD);
  for (const [path] of VALUES_LINKS) {
    mkdirSync(join(fakeRepo, dirname(path)), { recursive: true });
  }

  // A companion checkout carrying every values file.
  privateRepo = join(root, 'ops');
  mkdirSync(join(privateRepo, 'terraform'), { recursive: true });
  for (const [, name] of VALUES_LINKS) {
    writeFileSync(join(privateRepo, 'terraform', name), `# ${name}\n`, 'utf-8');
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(args: string[]) {
  const res = spawnSync('bash', [join(fakeRepo, 'scripts', 'setup_private_repo.sh'), ...args], {
    cwd: fakeRepo,
    encoding: 'utf-8',
    input: '',
    env: { ...process.env },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** The ordinary successful invocation. */
function wire(extra: string[] = []) {
  return run(['--private-repo', '../ops', '--yes', ...extra]);
}

describe('setup_private_repo.sh — wiring an unwired tree', () => {
  it('creates every link and verifies each one resolves', () => {
    const r = wire();
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(fakeRepo, 'footbag_private_repo'))).toBe(true);
    for (const [path] of VALUES_LINKS) {
      const full = join(fakeRepo, path);
      expect(lstatSync(full).isSymbolicLink(), `${path} should be a symlink`).toBe(true);
      expect(existsSync(full), `${path} should resolve`).toBe(true);
    }
  });

  it('keeps the values links relative and routed through the root link', () => {
    // This is what makes them identical on every machine: only the root
    // link is machine-specific. An absolute target would wire one laptop.
    wire();
    for (const [path, name] of VALUES_LINKS) {
      expect(readlinkSync(join(fakeRepo, path))).toBe(
        `../../footbag_private_repo/terraform/${name}`,
      );
    }
  });

  it('is idempotent: a second run changes nothing and says so', () => {
    wire();
    const again = wire();
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toMatch(/Already wired/);
  });

  it('reuses the recorded checkout path when none is given', () => {
    // Re-running after setup should not require retyping a path the tree
    // already records.
    wire();
    const r = run(['--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Already wired/);
  });
});

describe('setup_private_repo.sh — what it refuses', () => {
  it('refuses to replace a real file with a link', () => {
    // Someone's own values file. Replacing it destroys an edit the script
    // knows nothing about.
    const victim = join(fakeRepo, 'terraform/staging/terraform.tfvars');
    writeFileSync(victim, 'operator_cidrs = ["203.0.113.4/32"]\n', 'utf-8');
    const r = wire();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/real file or directory sits where a link belongs/);
    expect(r.stderr).toMatch(/[Nn]othing has been changed/);
    // Untouched, and still a regular file.
    expect(lstatSync(victim).isFile()).toBe(true);
    expect(lstatSync(victim).isSymbolicLink()).toBe(false);
  });

  it('refuses to create links when the companion checkout lacks the files', () => {
    // A link to a missing target passes `ls -l` and fails at terraform.
    rmSync(join(privateRepo, 'terraform', 'shared.tfvars'));
    const r = wire();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not carry these files/);
    expect(r.stderr).toMatch(/shared\.tfvars/);
    expect(existsSync(join(fakeRepo, 'terraform/shared/terraform.tfvars'))).toBe(false);
  });

  it('refuses when no path is given and the standard sibling is absent', () => {
    // A link to a checkout that is not there points at nothing.
    const r = run(['--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/no companion checkout at the standard place/);
    expect(existsSync(join(fakeRepo, 'footbag_private_repo'))).toBe(false);
  });

  it('wires the standard sibling checkout when no path is given', () => {
    // The harness settings name ../footbag-ops; a fresh setup must land there.
    renameSync(privateRepo, join(root, 'footbag-ops'));
    const r = run(['--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(readlinkSync(join(fakeRepo, 'footbag_private_repo'))).toBe('../footbag-ops');
  });

  it('refuses a checkout path that is not a directory', () => {
    const r = run(['--private-repo', '../nowhere', '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not a directory/);
  });

  it('changes nothing without a confirmation it has no terminal to take', () => {
    const r = run(['--private-repo', '../ops']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no terminal to confirm on/);
    expect(existsSync(join(fakeRepo, 'footbag_private_repo'))).toBe(false);
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });
});

describe('setup_private_repo.sh — a checkout without the operator-only secrets files', () => {
  it('wires the root link and every values link, and skips each secrets link by name', () => {
    removeSecretsFromCompanion();
    const r = wire();
    expect(r.status, r.stderr).toBe(0);
    expect(readlinkSync(join(fakeRepo, 'footbag_private_repo'))).toBe('../ops');
    for (const [path] of COMMITTED_LINKS) {
      expect(existsSync(join(fakeRepo, path)), `${path} should resolve`).toBe(true);
    }
    for (const [path, name] of SECRETS_LINKS) {
      expect(existsSync(join(fakeRepo, path)), `${path} must not be created`).toBe(false);
      expect(r.stdout).toContain(`skip     ${path} (operator-only; terraform/${name} is not in this checkout)`);
    }
  });

  it('reports the skipped secrets links as clean under --check, and says it skipped them', () => {
    removeSecretsFromCompanion();
    wire();
    const r = run(['--check']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/3 operator-only secrets link\(s\) skipped/);
  });

  it('still refuses a missing committed values file when the secrets are also absent', () => {
    removeSecretsFromCompanion();
    rmSync(join(privateRepo, 'terraform', 'identity.tfvars'));
    const r = wire();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not carry these files/);
    expect(r.stderr).toMatch(/identity\.tfvars/);
    expect(r.stderr).not.toMatch(/secrets\.auto\.tfvars/);
    expect(existsSync(join(fakeRepo, 'footbag_private_repo'))).toBe(false);
  });

  it('does not skip a secrets link that already exists, so a dangling one is still refused', () => {
    // Skipping is for a file this machine never had; a link already pointing at
    // a file that has gone is a broken link, and passing over it would leave it.
    rmSync(join(privateRepo, 'terraform', 'staging.secrets.auto.tfvars'));
    symlinkSync(
      '../../footbag_private_repo/terraform/staging.secrets.auto.tfvars',
      join(fakeRepo, 'terraform/staging/secrets.auto.tfvars'),
    );
    const r = wire();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/staging\.secrets\.auto\.tfvars/);
  });

  it('links the shared tree’s secrets file when the checkout carries it', () => {
    const r = wire();
    expect(r.status, r.stderr).toBe(0);
    expect(readlinkSync(join(fakeRepo, 'terraform/shared/secrets.auto.tfvars'))).toBe(
      '../../footbag_private_repo/terraform/shared.secrets.auto.tfvars',
    );
  });
});

describe('setup_private_repo.sh — repairing a wrong link', () => {
  it('replaces a link pointing elsewhere instead of following it', () => {
    // `ln -sf` without -n follows an existing link to a directory and creates
    // the new link INSIDE it, which leaves the original wrong and adds a
    // second wrong one somewhere surprising.
    const decoy = join(root, 'decoy');
    mkdirSync(decoy, { recursive: true });
    symlinkSync('../decoy', join(fakeRepo, 'footbag_private_repo'));

    const r = wire();
    expect(r.status, r.stderr).toBe(0);
    expect(readlinkSync(join(fakeRepo, 'footbag_private_repo'))).toBe('../ops');
    expect(existsSync(join(decoy, 'footbag_private_repo'))).toBe(false);
  });

  it('rebuilds a link whose target has gone away', () => {
    symlinkSync('../../footbag_private_repo/terraform/staging.tfvars', join(fakeRepo, 'terraform/staging/terraform.tfvars'));
    // The root link does not exist yet, so the values link dangles.
    expect(existsSync(join(fakeRepo, 'terraform/staging/terraform.tfvars'))).toBe(false);
    const r = wire();
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(fakeRepo, 'terraform/staging/terraform.tfvars'))).toBe(true);
  });
});

describe('setup_private_repo.sh — the read-only report', () => {
  it('reports an unwired tree as needing attention, and changes nothing', () => {
    const r = run(['--private-repo', '../ops', '--check']);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/create/);
    expect(existsSync(join(fakeRepo, 'footbag_private_repo'))).toBe(false);
  });

  it('reports a wired tree as clean', () => {
    wire();
    const r = run(['--check']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/links are wired and resolve/);
  });

  it('takes no confirmation, so it is safe to run anywhere', () => {
    const r = run(['--private-repo', '../ops', '--check']);
    expect(r.stderr).not.toMatch(/no terminal to confirm on/);
  });
});
