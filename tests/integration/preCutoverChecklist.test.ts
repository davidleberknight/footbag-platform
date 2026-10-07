/**
 * Integration tests for scripts/pre-cutover-checklist.sh and its sister
 * validation gate scripts. Exercises both the green-path orchestration
 * (all gates PASS → exit 0; summary block shows the expected GATE: lines)
 * and a fault-injection red path (empty name_variants → G11 FAIL → exit
 * non-zero, summary highlights the failed gate).
 *
 * AWS-touching steps run in --mock-aws so the suite is hermetic; the
 * smoke / e2e suites are skipped via --skip-tests so the orchestrator
 * test does not re-invoke them transitively.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import {
  insertAuditEntry,
  insertClub,
  insertClubBootstrapLeader,
  insertHistoricalPerson,
  insertLegacyClubCandidate,
  insertLegacyMember,
  insertNameVariant,
  insertTag,
} from '../fixtures/factories';
import { requireToolInCI } from '../fixtures/toolAvailability';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// The gate scripts the orchestrator runs query the database with sqlite3 and
// parse JSON with jq. Without them every gate fails for a reason that has
// nothing to do with the orchestrator; in CI a missing tool fails outright.
const TOOLS_PRESENT = requireToolInCI('sqlite3', '-version') && requireToolInCI('jq', '--version');
const SCHEMA_SQL = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-precutover-'));
}

function buildFixtureDb(dbPath: string, opts: { withNameVariants?: boolean } = {}): void {
  const db = new BetterSqlite3(dbPath);
  // The schema commits each of its ~460 statements separately and the seed rows
  // below add hundreds more, so the default durability costs a disk flush per
  // statement and seconds per test. A throwaway fixture has nothing to survive,
  // and the gates under test read this database as the single file it stays.
  db.pragma('synchronous = OFF');
  db.exec(SCHEMA_SQL);

  // Minimum legacy_members fixture: real_name + country + import_source +
  // honor flag + a derived paid-tier flag so G1-G6 pass (the honors gate
  // requires the paid-tier derivation to have populated).
  for (let i = 1; i <= 5; i++) {
    insertLegacyMember(db, {
      legacy_member_id: `legmem-${i}`,
      legacy_user_id: `legacy-user-${i}`,
      legacy_email: `legacy${i}@example.com`,
      real_name: `Player ${i}`,
      display_name: `Player ${i}`,
      city: 'TestCity',
      region: null,
      country: 'US',
      bio: '',
      is_hof: i === 1 ? 1 : 0,  // honors-only fallback signal on row 1
      is_bap: i === 2 ? 1 : 0,
      legacy_ever_paid_tier2: i === 1 ? 1 : 0,  // paid-tier derivation signal
      legacy_ever_paid_tier1_lifetime: i === 3 ? 1 : 0,
      import_source: 'mirror',
    });
  }

  // Minimum legacy_club_candidates fixture for G7.
  insertLegacyClubCandidate(db, {
    id: 'lcc-1', legacy_club_key: 'test_club_a', display_name: 'Test Club A',
    classification: 'pre_populate', confidence_score: 0.9,
  });
  insertLegacyClubCandidate(db, {
    id: 'lcc-2', legacy_club_key: 'test_club_b', display_name: 'Test Club B',
    classification: 'pre_populate', confidence_score: 0.6,
  });

  // Minimum club_bootstrap_leaders fixture for G8. Requires a clubs row
  // (FK club_id) and a tags row (FK hashtag_tag_id on clubs).
  insertTag(db, {
    id: 'tag-club-1', tag_normalized: '#test_club', tag_display: '#test_club',
    standard_type: 'club',
  });
  insertClub(db, {
    id: 'club-1', hashtag_tag_id: 'tag-club-1', name: 'Test Club',
    description: '', city: 'Testville', country: 'US', status: 'active',
  });
  // lcc-1 maps to the bootstrapped club (after the clubs FK target exists)
  // so the leader-coverage gate sees a covered pre-populate club; lcc-2
  // stays unmapped (defers to leadership path 2).
  db.prepare(`UPDATE legacy_club_candidates SET mapped_club_id = 'club-1' WHERE id = 'lcc-1'`).run();
  insertClubBootstrapLeader(db, {
    id: 'cbl-1', club_id: 'club-1', legacy_member_id: 'legmem-1',
    role: 'leader', status: 'provisional', confidence_score: 0.85,
  });

  // The permanent showcase event tag + Footbag Hacky historical person the
  // SHOWCASE-PRESENCE gate requires to be present before cutover.
  insertTag(db, {
    id: 'tag-beaver',
    tag_normalized: '#event_2025_beaver_open',
    tag_display: '#event_2025_beaver_open',
    standard_type: 'event',
  });
  insertHistoricalPerson(db, {
    person_id: 'hp-footbag-hacky', person_name: 'Footbag Hacky', country: null,
  });

  // Optional name_variants seed (omit for the red-path test to fail G11).
  if (opts.withNameVariants !== false) {
    for (let i = 1; i <= 260; i++) {
      insertNameVariant(db, {
        canonical_normalized: `canonical ${i}`,
        variant_normalized: `variant ${i}`,
        source: 'mirror_mined',
      });
    }
  }

  db.close();
}

function runChecklist(
  dbPath: string,
  snapshotDir: string,
  args: string[] = [],
  envOverrides: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  // The payments-boot gate reads a deploy env file; a live-mode fixture
  // beside the test DB satisfies it.
  const envFile = path.join(path.dirname(dbPath), 'deploy-env');
  fs.writeFileSync(envFile, 'PAYMENT_ADAPTER=live\nSTRIPE_WEBHOOK_SECRET=whsec_fixture\n');

  // The certificate-transparency gate queries the public logs over the network,
  // and without a stub this suite's verdict is whatever those logs say today:
  // it failed here on a real name outside the served set, and minutes later
  // failed differently because the logs could not be reached at all. Neither
  // outcome says anything about the orchestrator, which is this suite's subject.
  // The gate's own behaviour against real log shapes is covered by its own
  // suite; here the answer only has to be deterministic and in the served set.
  const curlStub = path.join(path.dirname(dbPath), 'curl-stub.sh');
  fs.writeFileSync(
    curlStub,
    '#!/usr/bin/env bash\n' +
      // The contracted shape the gate consumes, which is `jq -r '.[] | .name_value'`.
      `printf '%s' '[{"name_value":"footbag.org"},{"name_value":"www.footbag.org"}]'\n`,
  );
  fs.chmodSync(curlStub, 0o755);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FOOTBAG_DB_PATH:                  dbPath,
    FOOTBAG_SNAPSHOT_DIR:             snapshotDir,
    FOOTBAG_ENV_FILE:                 envFile,
    FOOTBAG_CURL_BIN:                 curlStub,
    // Local rehearsal: the snapshot step's cross-region DR upload is
    // explicitly skipped (a real cutover run sets FOOTBAG_DR_BUCKET).
    FOOTBAG_SNAPSHOT_LOCAL_ONLY:      '1',
    FOOTBAG_PRECUTOVER_MOCK_AWS:      '1',
    FOOTBAG_PRECUTOVER_SKIP_TESTS:    '1',
    FOOTBAG_NAME_VARIANTS_MIN:        '250',
    // The fixture DB carries no club-only persons; the G12 floor is a
    // real-data gate, zeroed for the orchestrator-shape test.
    FOOTBAG_CLUB_ONLY_PERSONS_MIN:    '0',

    FOOTBAG_BOOTSTRAP_LEADER_MIN:     '1',
    ...envOverrides,
  };
  const result = spawnSync('bash', ['scripts/pre-cutover-checklist.sh', ...args], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe.runIf(TOOLS_PRESENT)('pre-cutover checklist orchestrator', () => {
  let workDir: string;
  let dbPath: string;
  let snapshotDir: string;

  beforeEach(() => {
    workDir = tempDir();
    dbPath = path.join(workDir, 'fixture.db');
    snapshotDir = path.join(workDir, 'snapshots');
  });

  afterEach(() => {
    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('green path: every gate PASS, exit 0, summary lists each gate', () => {
    buildFixtureDb(dbPath);
    const r = runChecklist(dbPath, snapshotDir);
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0);
    for (const label of ['SNAPSHOT', 'G1', 'G7', 'G8', 'G11', 'DEV-ADMIN-AUDIT', 'SHOWCASE-PRESENCE', 'PAYMENTS-BOOT']) {
      expect(r.stdout).toMatch(new RegExp(`GATE: ${label}[^\\n]*PASS`));
    }
    // A gate that inspected nothing must not report the word a gate that looked
    // reports. All three mock gates are in that position: the DNS gate makes no
    // query, the QC gate opens no image, and the certificate gate reads no log.
    // Saying PASS and disclaiming it in the same line puts the disclaimer where
    // nobody reads it twice.
    expect(r.stdout).toMatch(/GATE: DNS-TTL SKIPPED: mock mode/);
    expect(r.stdout).toMatch(/GATE: QC-ABSENCE SKIPPED: mock mode/);
    expect(r.stdout).toMatch(/GATE: CERT-TRANSPARENCY SKIPPED: mock mode/);
    expect(r.stdout).not.toMatch(/GATE: DNS-TTL[^\n]*PASS/);
    expect(r.stdout).not.toMatch(/GATE: QC-ABSENCE[^\n]*PASS/);
    expect(r.stdout).not.toMatch(/GATE: CERT-TRANSPARENCY[^\n]*PASS/);
    // And the summary has to carry that up, or the distinction dies one line
    // before the operator reads it. This run also skips the smoke, e2e and
    // outbox steps, so the count is of every gate that did no work, not only
    // the two mocked ones.
    expect(r.stdout).not.toMatch(/READY: all gates PASS/);
    expect(r.stdout).toMatch(/READY WITH GAPS: gates PASS, but \d+ did no work/);
    // The integration / smoke / e2e suites report SKIP under --skip-tests,
    // keeping this orchestrator test hermetic; assert the claim-safety step
    // is wired and properly skip-gated.
    expect(r.stdout).toMatch(/GATE: CLAIM-SAFETY SKIP/);
  });

  // The live outbox smoke runs only with mock mode off, and pipes the production
  // host's sudo password into a privileged session. Which file holds that
  // password is decided by the account the production alias connects as, never
  // by a path the operator names, so one person's run cannot go out under
  // another's credential with nothing to say so. Everything else these runs
  // would reach is stood in for: the alias resolves through a stub ssh that
  // only answers the configuration query, and the name-server and image tools
  // refuse, so the gates that need them fail on the spot instead of reaching
  // the network.
  describe('the live outbox smoke\'s credential', () => {
    function runOutboxGate(extraEnv: Record<string, string>) {
      buildFixtureDb(dbPath);
      const home = path.join(workDir, 'home');
      const bin = path.join(workDir, 'outbox-bin');
      fs.mkdirSync(path.join(home, 'AWS'), { recursive: true });
      fs.mkdirSync(bin, { recursive: true });
      const stub = (name: string, body: string) => {
        fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
        fs.chmodSync(path.join(bin, name), 0o755);
      };
      stub('ssh', 'for a in "$@"; do [[ "$a" == "-G" ]] && { printf "user footbag\\nhostname 203.0.113.10\\n"; exit 0; }; done\nexit 255');
      stub('dig', 'exit 9');
      stub('docker', 'exit 1');
      return runChecklist(dbPath, snapshotDir, [], {
        FOOTBAG_PRECUTOVER_MOCK_AWS: '0',
        FOOTBAG_PRECUTOVER_EMAIL_PROFILE: 'fixture-profile',
        HOME: home,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        ...extraEnv,
      });
    }

    it('refuses by name when the production account\'s credential file is missing', () => {
      const r = runOutboxGate({});
      expect(r.stdout).toMatch(/GATE: G10-OUTBOX FAIL: no usable production operator credential/);
      expect(r.stderr).toContain('~/AWS/AWS_OPERATOR_PRODUCTION.txt is missing or unreadable');
      expect(r.status).not.toBe(0);
    });

    it('ignores a credential file named by a variable', () => {
      // A readable file the operator pointed at by hand is exactly what the
      // rule must not reach for in place of the account's own.
      const stray = path.join(workDir, 'someone-elses-credential.txt');
      fs.writeFileSync(stray, 'not-this-password\n', { mode: 0o600 });
      const r = runOutboxGate({ FOOTBAG_PRECUTOVER_EMAIL_CREDFILE: stray });
      expect(r.stdout).toMatch(/GATE: G10-OUTBOX FAIL: no usable production operator credential/);
      expect(r.stderr).toContain('~/AWS/AWS_OPERATOR_PRODUCTION.txt is missing or unreadable');
    });

    it('sends nothing when the send is not confirmed on a terminal', () => {
      // The checklist hands the send script --yes, so its own typed confirmation
      // is the only thing standing between a captured run and real production mail.
      const home = path.join(workDir, 'home');
      fs.mkdirSync(path.join(home, 'AWS'), { recursive: true });
      fs.writeFileSync(path.join(home, 'AWS', 'AWS_OPERATOR_PRODUCTION.txt'), 'stub-sudo-pass\n', { mode: 0o600 });
      const r = runOutboxGate({});
      expect(r.stdout).toMatch(/GATE: G10-OUTBOX FAIL: not confirmed, so no mail was sent/);
      expect(r.stdout).not.toMatch(/--- G10-OUTBOX/);
      expect(r.status).not.toBe(0);
    });
  });

  it('red path: empty name_variants → G11 FAIL → exit non-zero, summary reports the failure', () => {
    buildFixtureDb(dbPath, { withNameVariants: false });
    const r = runChecklist(dbPath, snapshotDir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/GATE: G11 FAIL/);
    expect(r.stderr).toMatch(/BLOCKED: \d+ gate\(s\) FAIL/);
  });

  it('red path: showcase records missing → SHOWCASE-PRESENCE FAIL', () => {
    buildFixtureDb(dbPath);
    const db = new BetterSqlite3(dbPath);
    db.prepare(`DELETE FROM historical_persons WHERE person_name = 'Footbag Hacky'`).run();
    db.close();
    const r = runChecklist(dbPath, snapshotDir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/GATE: SHOWCASE-PRESENCE FAIL/);
    expect(r.stdout).toMatch(/Footbag Hacky rows: 0/);
  });

  it('red path: an email shared across accounts in a secondary column → G1 FAIL', () => {
    buildFixtureDb(dbPath);
    const db = new BetterSqlite3(dbPath);
    // legmem-1 carries legacy1@example.com as its primary; put the same
    // address (different case) on legmem-2's secondary column so the value
    // identifies two accounts across columns.
    db.prepare(
      `UPDATE legacy_members SET legacy_email2 = 'LEGACY1@example.com' WHERE legacy_member_id = 'legmem-2'`,
    ).run();
    db.close();
    const r = runChecklist(dbPath, snapshotDir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/GATE: G1 FAIL/);
    expect(r.stderr).toMatch(/BLOCKED: \d+ gate\(s\) FAIL/);
  });

  // Every data gate reads one database, and which one decides whether the report
  // is a readiness result or a rehearsal. The runbook said these gates certified
  // production while every one of them read the operator's own build, and
  // nothing in the output contradicted that reading.

  it('names the workstation as the subject when no target is given', () => {
    buildFixtureDb(dbPath);
    const r = runChecklist(dbPath, snapshotDir);
    // The output goes in the message for the same reason it does on the green
    // path above: a bare exit code here names no gate, and the orchestrator's
    // whole job is to say which one refused.
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/subject: this workstation's own build/);
    expect(r.stdout).toMatch(/NOT a deployed environment/);
    expect(r.stdout).toContain(dbPath);
  });

  it('refuses a target it does not know', () => {
    const r = runChecklist(dbPath, snapshotDir, ['--target', 'prod']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target must be 'staging' or 'production'/);
  });

  it('refuses --no-snapshot without a target, since there is no host to read', () => {
    const r = runChecklist(dbPath, snapshotDir, ['--no-snapshot']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--no-snapshot applies only with --target/);
  });

  it('refuses to label a mocked run with an environment name', () => {
    // The hazard is a rehearsal being pasted into a cutover log under a heading
    // that says production. Mock mode is how a run attests to nothing, so the
    // two must not combine.
    const r = runChecklist(dbPath, snapshotDir, ['--target', 'production']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/mutually exclusive/);
  });

  it('payments-boot skips with its reason when there is no env file to read', () => {
    // The gate reads a deploy env file, which lives on a host. Without a target
    // and without a file it used to FAIL, so a run counted a failure that said
    // nothing about the environment being certified. Looking at nothing is a
    // skip, and the reason has to name what was missing.
    buildFixtureDb(dbPath);
    const envFile = path.join(workDir, 'deploy-env');
    const r = runChecklist(dbPath, snapshotDir, [], { FOOTBAG_ENV_FILE: '' });
    expect(fs.existsSync(envFile)).toBe(true); // the harness wrote one; the run was told to ignore it
    expect(r.stdout).toMatch(/GATE: PAYMENTS-BOOT SKIP: no --target and no FOOTBAG_ENV_FILE/);
    expect(r.stdout).not.toMatch(/GATE: PAYMENTS-BOOT FAIL/);
    expect(r.status).toBe(0);
  });
});

// ── what a targeted run attests to ──────────────────────────────────────────
//
// A targeted run opens a privileged session to a real host, so these are read off
// the script rather than driven: the behaviour under test is which environment each
// leg is pointed at, and a test that could drive it would have to contact the host
// it is asserting about.

describe.runIf(TOOLS_PRESENT)('a targeted run points each leg at the environment it names', () => {
  const SOURCE = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'pre-cutover-checklist.sh'), 'utf8');

  it('fetches the host env file for the payments gate instead of reading a local one', () => {
    // Pointing the gate at a workstation stand-in is worse than failing: it
    // certifies a fixture under the target's heading. The host's own file comes
    // down over the same wire every other privileged step here uses.
    expect(SOURCE).toMatch(/host_env_fetch "\$\{SSH_ALIAS\}" "\$\{PAYMENTS_ENV_FILE\}"/);
    expect(SOURCE).toMatch(/env FOOTBAG_ENV_FILE="\$\{PAYMENTS_ENV_FILE\}" bash scripts\/validate-payments-boot\.sh/);
    // A failed fetch is a failed gate, not a silent pass on the local file.
    expect(SOURCE).toMatch(/PAYMENTS-BOOT FAIL: the \$\{TARGET\} host env file could not be read/);
  });

  it('shreds the fetched env file on every exit path', () => {
    // It holds the host's entire secret set, so it is shredded on the trap that
    // already removes the pulled database rather than left for whatever runs next.
    expect(SOURCE).toMatch(/trap cleanup_run_artifacts EXIT/);
    const cleanup = SOURCE.slice(SOURCE.indexOf('cleanup_run_artifacts() {'),
                                 SOURCE.indexOf('trap cleanup_run_artifacts EXIT'));
    expect(cleanup).toMatch(/shred -u/);
    expect(cleanup).toContain('PAYMENTS_ENV_DIR');
  });

  it('points the smoke suite at the named environment', () => {
    // Defect caught: a run against one environment certifying another under its
    // heading. The smoke runner takes the environment only as --target.
    expect(SOURCE).toMatch(/run_step "SMOKE" env -u SMOKE_TARGET_ENV npm run test:smoke -- --target "\$\{TARGET\}"/);
  });

  it('never points the browser suite at the named environment', () => {
    // The opposite case. It drives onboarding, password reset and admin write
    // flows, and the sign-in-capable accounts it creates would trip the guard
    // that refuses a rebuild above three of them, which would block the cutover
    // rebuild itself. Skipped with its reason rather than counted.
    const e2e = SOURCE.slice(SOURCE.indexOf('# The browser suite is the opposite case'),
                             SOURCE.indexOf('# 7. Dev-admin-shortcut audit'));
    expect(e2e).toMatch(/GATE: E2E SKIP: the browser suite drives write flows/);
    expect(e2e).not.toMatch(/E2E_BASE_URL|BASE_URL/);
    // And it still runs where it is safe: a workstation run keeps the gate.
    expect(e2e).toMatch(/run_step "E2E"\s+npm run test:e2e/);
  });
});

// ── the data gates of a targeted run, on the host ───────────────────────────
//
// Production member data never leaves AWS, so a targeted run sends the check
// scripts to the host and keeps only their verdicts. The host-facing function is
// cut out of the script and run against a stand-in host, because the rest of a
// targeted run reaches DNS, the network and AWS.

describe('a targeted run\'s data gates run on the host and bring back only verdicts', () => {
  const SOURCE = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'pre-cutover-checklist.sh'), 'utf8');
  const BLOCK = SOURCE.slice(
    SOURCE.indexOf('DATA_CHECKS=('),
    SOURCE.indexOf('if [[ -n "${TARGET}" ]]; then\n  if [[ -n "${HOST_SUBJECT}" ]]'),
  );
  const SNAPSHOT_BLOCK = SOURCE.slice(
    SOURCE.indexOf('  if [[ "${NO_SNAPSHOT}" -eq 1 ]]; then'),
    SOURCE.indexOf('\nfi\n\n# 2-5 and 7.'),
  );
  const LABELS = ['G1_6', 'CLUBS', 'LEADERS', 'VARIANTS', 'AUDIT', 'SHOWCASE'];
  let workDir: string;

  beforeEach(() => { workDir = tempDir(); });
  afterEach(() => { fs.rmSync(workDir, { recursive: true, force: true }); });

  /** Runs the host-facing function against a stand-in host answering `reply`. */
  function runHostGates(reply: string, prelude = '') {
    const binDir = path.join(workDir, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const stream = path.join(workDir, 'stream');
    const argv = path.join(workDir, 'argv');
    fs.writeFileSync(path.join(workDir, 'reply'), reply);
    fs.writeFileSync(path.join(binDir, 'ssh'), [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" > ${JSON.stringify(argv)}`,
      `cat > ${JSON.stringify(stream)}`,
      `cat ${JSON.stringify(path.join(workDir, 'reply'))}`,
    ].join('\n'));
    fs.chmodSync(path.join(binDir, 'ssh'), 0o755);
    const harness = [
      'set -uo pipefail',
      'results=(); fail=0; TARGET=production; SSH_ALIAS=footbag-production; HOST_SSH_OPTS=()',
      'SUDO_PASS=fixture-sudo-password; HOST_SUBJECT=live; SNAPSHOT_PATH=; SNAPSHOT_SHA256=',
      prelude,
      BLOCK,
      'run_host_data_gates',
      'for r in "${results[@]}"; do printf "RESULT %s\\n" "$r"; done',
      'echo "FAIL=${fail}"',
    ].join('\n');
    const res = spawnSync('bash', ['-c', harness], {
      cwd: REPO_ROOT,
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
    return {
      stdout: res.stdout ?? '',
      stream: fs.existsSync(stream) ? fs.readFileSync(stream, 'utf8') : '',
      argv: fs.existsSync(argv) ? fs.readFileSync(argv, 'utf8') : '',
    };
  }

  const CLEAN = [
    'GATE: G1 PASS: 0 collisions', 'GATE: G7 PASS: 2 candidates', 'GATE: G8 PASS: 1 rows',
    'GATE: G11 PASS: 300 rows', 'GATE: DEV-ADMIN-AUDIT PASS: exit 0', 'GATE: SHOWCASE-PRESENCE PASS: present',
    ...LABELS.map((l) => `DG_${l}_RC=0`),
  ].join('\n');

  it('passes a clean host reply through with no failure', () => {
    const r = runHostGates(`${CLEAN}\n`);
    expect(r.stdout).toMatch(/^FAIL=0$/m);
    expect(r.stdout).toMatch(/^RESULT GATE: G11 PASS: 300 rows$/m);
  });

  it('drops every host line that is not an allowlisted verdict, printing none of it', () => {
    // Defect caught: a member's name or address said by the host, by sudo or by a
    // check, relayed into the operator's terminal or the cutover log.
    const r = runHostGates(
      `${CLEAN}\nJane Doe jane.doe@example.com\nJane Doe\nGATE: NOT-A-GATE PASS: x\nGATE: G11 PASS\n` +
      'GATE: G11 PASS: sampled jane.doe@example.com\nGATE: G8 PASS: \u001b[31mred\u001b[0m\n',
    );
    expect(r.stdout).not.toContain('\u001b');
    expect(r.stdout).not.toContain('@');
    // A bare name carries no '@', so only the gate-shape match keeps it back.
    expect(r.stdout).not.toContain('Jane Doe');
    expect(r.stdout).not.toContain('NOT-A-GATE');
    expect(r.stdout).not.toMatch(/GATE: G11 PASS$/m);
    expect(r.stdout).toMatch(/^FAIL=0$/m);
  });

  it('fails a check the host reported no exit status for', () => {
    // Defect caught: a body that stopped part way reported as clean because the
    // lines it did print were all PASS.
    const r = runHostGates(CLEAN.replace('DG_LEADERS_RC=0\n', ''));
    expect(r.stdout).toMatch(/^RESULT GATE: G8 FAIL: the production host reported no result for this check$/m);
    expect(r.stdout).toMatch(/^FAIL=1$/m);
  });

  it('fails a check that exited non-zero after printing only PASS lines', () => {
    const r = runHostGates(CLEAN.replace('DG_G1_6_RC=0', 'DG_G1_6_RC=78'));
    expect(r.stdout).toMatch(/^RESULT GATE: G1-G6 FAIL: the check exited 78 on the host$/m);
    expect(r.stdout).toMatch(/^FAIL=1$/m);
  });

  it('counts a host FAIL line as a failure', () => {
    const r = runHostGates(CLEAN.replace('GATE: G8 PASS: 1 rows', 'GATE: G8 FAIL: 0 rows'));
    expect(r.stdout).toMatch(/^FAIL=1$/m);
  });

  it('sends the password first, then the subject, every check and the body, and nothing in argv', () => {
    // Defect caught: the password reaching a process list, or a check missing
    // from the stream so the host has nothing to run for it.
    const r = runHostGates(`${CLEAN}\n`);
    const lines = r.stream.split('\n');
    expect(lines[0]).toBe('fixture-sudo-password');
    expect(r.stream).toContain('DG_SUBJECT=live');
    for (const label of LABELS) expect(r.stream).toMatch(new RegExp(`^DG_${label}_B64=\\S+$`, 'm'));
    expect(r.stream).toContain('Root-side body of the pre-cutover checklist\'s data checks');
    expect(r.argv).not.toContain('fixture-sudo-password');
  });

  it('makes the snapshot the subject, and sends its path and checksum to the host', () => {
    // Defect caught: a snapshot run that silently reads the live database, or
    // that never tells the host which object to check and so fails every time.
    const snapshotBlock = SNAPSHOT_BLOCK;
    const sha = 'b'.repeat(64);
    const snapshotReply = [
      'manifest noise',
      'PRECUTOVER_SNAPSHOT_URI=s3://footbag-production-db-snapshots-dr/pre-flip/s1/s1.db.gz',
      'PRECUTOVER_SNAPSHOT_PATH=/srv/footbag/snapshots/s1.db.gz',
      `PRECUTOVER_SNAPSHOT_SHA256=${sha}`,
    ].join('\n');
    fs.writeFileSync(path.join(workDir, 'snapshot-reply'), snapshotReply);
    const r = runHostGates(`${CLEAN}\n`, [
      `remote_snapshot() { cat ${JSON.stringify(path.join(workDir, 'snapshot-reply'))}; }`,
      'NO_SNAPSHOT=0',
      snapshotBlock,
    ].join('\n'));

    expect(r.stdout).toMatch(/^RESULT GATE: SNAPSHOT PASS: production snapshot taken on the host/m);
    expect(r.stream).toContain('DG_SUBJECT=snapshot');
    expect(r.stream).toContain('DG_SNAPSHOT_PATH=/srv/footbag/snapshots/s1.db.gz');
    expect(r.stream).toContain(`DG_SNAPSHOT_SHA256=${sha}`);
  });

  it('with --no-snapshot takes no snapshot and makes the live database the subject', () => {
    // Defect caught: a pre-cutover-day check writing a rollback artifact into
    // the object-locked pre-flip prefix, or the data gates left with no subject
    // and failing, or reading something other than the live database.
    const called = path.join(workDir, 'snapshot-called');
    const r = runHostGates(`${CLEAN}\n`, [
      'HOST_SUBJECT=',
      `remote_snapshot() { touch ${JSON.stringify(called)}; }`,
      'NO_SNAPSHOT=1',
      SNAPSHOT_BLOCK,
    ].join('\n'));

    expect(fs.existsSync(called)).toBe(false);
    expect(r.stdout).toMatch(/^RESULT GATE: SNAPSHOT SKIP: --no-snapshot passed/m);
    expect(r.stream).toMatch(/^DG_SUBJECT=live$/m);
    expect(r.stdout).toMatch(/^FAIL=0$/m);
  });

  it.runIf(TOOLS_PRESENT)('parses the path and checksum out of a real snapshot manifest on the host', () => {
    // Defect caught: the host-side wrapper reading the archive's checksum, or no
    // path at all, so the data checks refuse or check the wrong object.
    const dbPath = path.join(workDir, 'fixture.db');
    buildFixtureDb(dbPath);
    const snapshots = path.join(workDir, 'snapshots');
    const manifestOut = spawnSync('bash', ['scripts/take-pre-cutover-snapshot.sh'], {
      cwd: REPO_ROOT,
      env: { ...process.env, FOOTBAG_DB_PATH: dbPath, FOOTBAG_SNAPSHOT_DIR: snapshots, FOOTBAG_SNAPSHOT_LOCAL_ONLY: '1' },
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
    expect(manifestOut.status, manifestOut.stderr).toBe(0);
    const manifest = JSON.parse(manifestOut.stdout) as { snapshot_path: string; sha256: string; archive_sha256: string };
    const wrapper = fs.readFileSync(path.join(REPO_ROOT, 'scripts/internal/take-pre-cutover-snapshot-remote.sh'), 'utf8');
    const parse = wrapper.slice(wrapper.indexOf('flat="$('));
    const res = spawnSync('bash', ['-c', `set -euo pipefail\n${parse}`], {
      env: { ...process.env, MANIFEST: manifestOut.stdout },
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain(`PRECUTOVER_SNAPSHOT_PATH=${manifest.snapshot_path}`);
    expect(res.stdout).toContain(`PRECUTOVER_SNAPSHOT_SHA256=${manifest.sha256}`);
    expect(manifest.sha256).not.toBe(manifest.archive_sha256);
  });

  it('opens the database read-only in every check that runs on the host', () => {
    // Defect caught: a check run as root against the live database opening it
    // for writing, which a sha comparison of the file cannot see.
    for (const script of [
      'validate-legacy-import-gates.sh', 'validate-club-candidates.sh', 'validate-bootstrap-leaders.sh',
      'validate-name-variants.sh', 'audit-dev-shortcuts.sh', 'validate-showcase-presence.sh',
    ]) {
      const calls = fs.readFileSync(path.join(REPO_ROOT, 'scripts', script), 'utf8').split('\n')
        .filter((l) => !l.trim().startsWith('#') && /\bsqlite3\s/.test(l));
      expect(calls.length, script).toBeGreaterThan(0);
      for (const call of calls) expect(call, `${script}: ${call.trim()}`).toContain('sqlite3 -readonly');
    }
  });

  it('never downloads a snapshot or any object from storage', () => {
    // Defect caught: a copy of the production member database reaching the
    // operator's workstation, which the governance of that data forbids.
    expect(SOURCE).not.toMatch(/s3 cp|s3api get-object|s3 sync/);
    expect(SOURCE).not.toContain('PULLED_DB');
  });

  it('never falls back to a local database under a target\'s heading when the snapshot failed', () => {
    const targeted = SOURCE.slice(
      SOURCE.indexOf('if [[ -n "${TARGET}" ]]; then\n  if [[ -n "${HOST_SUBJECT}" ]]'),
      SOURCE.indexOf('# 2. G1-G6: legacy import gates'),
    );
    expect(targeted).toContain('FAIL: no snapshot to check, so this gate read nothing');
    expect(targeted).not.toContain('run_step');
  });
});

describe.runIf(TOOLS_PRESENT)('gate scripts that had no red path of their own', () => {
  // A gate nothing has ever shown red proves only that it prints PASS. Each
  // case here puts the exact defect the gate exists to catch into a fixture
  // and requires the gate to catch it.
  let workDir: string;
  let dbPath: string;

  beforeEach(() => {
    workDir = tempDir();
    dbPath = path.join(workDir, 'fixture.db');
    buildFixtureDb(dbPath);
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  function runGate(script: string, extraEnv: Record<string, string> = {}) {
    return spawnSync('bash', [script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, FOOTBAG_DB_PATH: dbPath, ...extraEnv },
      ...SPAWN_GUARD,
    });
  }

  it('the club-candidates gate fails an empty candidate table', () => {
    const db = new BetterSqlite3(dbPath);
    db.prepare('DELETE FROM legacy_club_candidates').run();
    db.close();
    const r = runGate('scripts/validate-club-candidates.sh', {
      FOOTBAG_CLUB_ONLY_PERSONS_MIN: '0',
    });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/GATE: G7 FAIL: zero legacy_club_candidates rows/);
  });

  it('the bootstrap-leaders gate fails when no leader candidates exist', () => {
    const db = new BetterSqlite3(dbPath);
    db.prepare('DELETE FROM club_bootstrap_leaders').run();
    db.close();
    const r = runGate('scripts/validate-bootstrap-leaders.sh', {
      FOOTBAG_BOOTSTRAP_LEADER_MIN: '1',
    });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/GATE: G8 FAIL: 0 club_bootstrap_leaders rows/);
  });

  it('the dev-shortcut audit fails a database carrying a persona-harness row', () => {
    // A clean fixture passes first, so the red assertion below is about the
    // planted row and not about the fixture's shape.
    const clean = runGate('scripts/audit-dev-shortcuts.sh');
    expect(clean.status, clean.stdout + clean.stderr).toBe(0);
    expect(clean.stdout).toContain('OK: zero dev-shortcut rows present.');

    const db = new BetterSqlite3(dbPath);
    insertAuditEntry(db, {
      id: 'audit-leak-1',
      created_by: 'test',
      occurred_at: '2026-01-01T00:00:00.000Z',
      actor_type: 'system',
      action_type: 'testkit.persona_seed',
      entity_type: 'member',
      entity_id: 'member-x',
    });
    db.close();
    const r = runGate('scripts/audit-dev-shortcuts.sh');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/FAIL: 1 dev-shortcut row\(s\) detected/);
  });
});
