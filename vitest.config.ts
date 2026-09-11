import { defineConfig } from 'vitest/config';
import os from 'node:os';

// Vitest runs ~one worker per CPU, and each worker boots the whole app graph
// before its first assertion. On a box where cores far outnumber RAM (e.g. WSL2
// reporting 20 host cores against ~8 GB) the concurrent boots oversubscribe
// memory and stretch beforeAll hooks past their ceiling. Cap workers to memory
// ONLY when RAM is the bottleneck; CPU-balanced machines and CI keep vitest's
// default parallelism.
//
// Two separate reservations, because they scale differently and folding them
// together is what went wrong before. The per-worker budget is deliberately
// larger than a worker's own footprint, covering the page cache its SQLite
// databases run on. The system reservation is a flat subtraction taken off the
// top first: the operating system, the container daemon, an editor, a
// development server left running alongside, an agent session. That figure does
// not shrink when fewer workers run, so dividing it among workers hides it
// entirely.
//
// Dividing total memory by the per-worker budget alone claims the whole machine.
// On a box with 20 cores and 7.6 GB it authorised six workers against a 7.2 GB
// budget, leaving under 400 MB for everything else, and a full run was killed by
// the memory guard partway through whichever gate happened to be running when
// something else on the box grew. The shortfall is invisible where cores are the
// binding constraint, which is why it only ever bit the smallest machine.
const SYSTEM_RESERVE_GB = 2;
const WORKER_BUDGET_GB = 1.2;
const cpuCount = os.cpus().length;
const usableGb = Math.max(0, os.totalmem() / 1024 ** 3 - SYSTEM_RESERVE_GB);
const memWorkerCap = Math.max(1, Math.floor(usableGb / WORKER_BUDGET_GB));
const ramBound = memWorkerCap < cpuCount;
// A VM that is CPU- or disk-slow but RAM-adequate slips past the memory cap and
// runs full parallelism, so each worker's cold app-graph compile in beforeAll
// can blow the hook ceiling. VITEST_MAX_FORKS lets such a box throttle workers
// without editing config.
const envWorkerCap = process.env.VITEST_MAX_FORKS
  ? Math.max(1, parseInt(process.env.VITEST_MAX_FORKS, 10))
  : null;
const workerCap = envWorkerCap ?? (ramBound ? memWorkerCap : null);

export default defineConfig({
  test: {
    // Per-test ceiling with headroom for a slow or loaded box: the deploy
    // preflight runs the full suite while docker image builds compete for CPU,
    // so a tight limit turns load into spurious timeout failures.
    testTimeout: 30_000,
    // beforeAll hooks transpile and import the whole app graph on first run;
    // on a slow laptop that cold transform can exceed half a minute, so the
    // ceiling is generous enough that the import cost is never the failure.
    hookTimeout: 120_000,
    // Worker threads rather than child processes. A process pool has to manage
    // fork lifecycle itself, and a child that dies or never signals ready can
    // park the whole run with no test executing and no timeout to end it, which
    // reads as an eternally slow suite rather than a failure. Threads carry no
    // such lifecycle. Each worker still gets its own module registry, so the
    // per-file env isolation the integration suites rely on is unchanged.
    pool: 'threads' as const,
    ...(workerCap ? { maxWorkers: workerCap } : {}),
    setupFiles: ['./tests/setup-env.ts'],
    // Sweep stale `footbag-test-*` artifacts from os.tmpdir() at session
    // start and end. Per-test afterAll() handles the happy path; this hook
    // is the safety net for worker timeouts / OOM / SIGKILL / WAL-races
    // that leave per-test cleanup unrun. See tests/global-setup.ts.
    globalSetup: './tests/global-setup.ts',
    // Smoke (tests/smoke/) and e2e (tests/e2e/) are filtered out by the
    // `--exclude` flags on the `npm test` and `npm run test:coverage`
    // scripts in package.json. Putting them in the global config exclude
    // here would also block `npm run test:smoke` (which invokes vitest
    // with `tests/smoke/` as a positional filter), since config-level
    // exclude wins over the positional filter. Vitest's default `exclude`
    // is replaced when you set this field, so the standard defaults are
    // preserved below.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      // Isolated git worktrees under .claude/worktrees/ hold a frozen copy of
      // the tree; running their stale test files (e.g. fixtures that point at
      // since-moved paths) produces spurious failures in the main run.
      '**/.claude/worktrees/**',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './tests/coverage',
      include: ['src/**/*.ts'],
      // Entry-point files orchestrate boot but contain no testable logic
      // worth a dedicated suite; their callees are covered. Type-only
      // surfaces have no executable code.
      exclude: ['src/server.ts', 'src/worker.ts', 'src/imageWorker.ts', 'src/transcodeWorker.ts', 'src/types/**'],
      // A floor, not a target: each number sits about a point under measured
      // coverage so ordinary refactoring does not redden the build, while a
      // real drop still trips it. Raised deliberately when coverage improves;
      // never lowered to admit new code.
      thresholds: {
        statements: 90,
        branches: 81,
        functions: 94,
        lines: 91,
      },
    },
  },
});
