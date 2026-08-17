import { defineConfig } from 'vitest/config';
import os from 'node:os';

// Vitest runs ~one worker per CPU, and each worker boots the whole app graph
// before its first assertion. On a box where cores far outnumber RAM (e.g. WSL2
// reporting 20 host cores against ~8 GB) the concurrent boots oversubscribe
// memory and stretch beforeAll hooks past their ceiling. Cap workers to memory
// ONLY when RAM is the bottleneck; CPU-balanced machines and CI keep vitest's
// default parallelism.
//
// The reservation is per worker and deliberately larger than a worker's own
// footprint. It is the machine's budget divided by workers, so it also has to
// cover the operating system, the page cache the SQLite test databases run on,
// and a development server the developer left running alongside the suite. A
// figure tight enough to leave the box with no free memory buys parallelism
// with swap pressure and load-dependent flake, which costs more than the
// wall-clock it saves.
const cpuCount = os.cpus().length;
const memWorkerCap = Math.max(1, Math.floor(os.totalmem() / (1.2 * 1024 ** 3)));
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
