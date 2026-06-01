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

export default defineConfig({
  test: {
    testTimeout: 15_000,
    ...(ramBound ? { pool: 'forks' as const, poolOptions: { forks: { maxForks: memForkCap } } } : {}),
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
