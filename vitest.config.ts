import { defineConfig } from 'vitest/config';
import os from 'node:os';

// Vitest's default forks pool runs ~one worker per CPU. On a box where cores
// far outnumber RAM (e.g. WSL2 reporting 20 host cores against ~8 GB), each
// fork boots the full app (~270ms module eval) and the concurrent boots
// oversubscribe memory, stretching beforeAll hooks past the 10s ceiling. Cap
// forks to memory ONLY when RAM is the bottleneck; CPU-balanced machines and CI
// keep vitest's default parallelism. ~0.8 GB/fork covers app boot +
// better-sqlite3 + node heap with headroom.
const cpuCount = os.cpus().length;
const memForkCap = Math.max(1, Math.floor(os.totalmem() / (0.8 * 1024 ** 3)));
const ramBound = memForkCap < cpuCount;
// A VM that is CPU- or disk-slow but RAM-adequate slips past the memory cap and
// runs full parallelism, so each worker's cold app-graph compile in beforeAll
// can blow the hook ceiling. VITEST_MAX_FORKS lets such a box throttle workers
// without editing config.
const envForkCap = process.env.VITEST_MAX_FORKS
  ? Math.max(1, parseInt(process.env.VITEST_MAX_FORKS, 10))
  : null;
const forkCap = envForkCap ?? (ramBound ? memForkCap : null);

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
    ...(forkCap ? { pool: 'forks' as const, maxWorkers: forkCap } : {}),
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
      thresholds: {
        statements: 95,
        branches: 76,
        functions: 93,
        lines: 95,
      },
    },
  },
});
