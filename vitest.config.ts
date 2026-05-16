import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 15_000,
    setupFiles: ['./tests/setup-env.ts'],
    // Smoke tests hit real staging AWS (gated behind RUN_STAGING_SMOKE=1) and
    // e2e specs use @playwright/test (a separate runner). Both are excluded
    // here so any vitest invocation (npm test, npm run test:coverage, or a
    // bare `npx vitest run`) skips them. The npm scripts no longer need to
    // duplicate this exclusion. Vitest's default `exclude` is replaced when
    // you set this field, so the standard defaults are preserved below.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'tests/smoke/**',
      'tests/e2e/**',
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
