// Deterministic lint gate for application code. Deliberately narrow: the
// convention gate (scripts/ci/assert_conventions.sh) owns the structural
// rules; this config covers only the defect classes a grep cannot catch
// reliably:
//   - console.* in app code (bypasses the structured logger and therefore
//     the CloudWatch pipeline and the test logger.error guard)
//   - unused variables/imports
//   - loose equality
// Scope is src/ TypeScript only. Browser scripts in src/public/js have no
// logger to route through, and tests are governed by the testing rules.
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'legacy_data/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    // Operator-facing CLI surfaces write to stdout by design, and the logger
    // itself needs console as its bootstrap fallback; everything else routes
    // through the structured logger.
    files: ['src/dev-bootstrap/**/*.ts', 'src/testkit/**/*.ts', 'src/config/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // The freestyle surface is excluded from this gate for now, mirroring the
    // freestyle exclusions in the template-class-vocabulary test and the
    // font check in scripts/ci/assert_conventions.sh; its dead-code cleanup
    // rides the freestyle-pages-fixes list. Prune this exclusion when that
    // surface is cleaned.
    files: ['src/services/freestyleService.ts'],
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },
];
