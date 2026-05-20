import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 15_000,
    setupFiles: ['./tests/setup-env.ts'],
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
