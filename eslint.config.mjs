// Deterministic lint gate for application code. Deliberately narrow: the
// convention gate (scripts/ci/assert_conventions.sh) owns the structural
// rules; this config covers only the defect classes a grep cannot catch
// reliably:
//   - console.* in app code (bypasses the structured logger and therefore
//     the CloudWatch pipeline and the test logger.error guard)
//   - unused variables/imports
//   - loose equality
//   - code built from strings at run time (eval, implied eval, new Function),
//     which would run whatever text reached it
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
      // Declared so no-implied-eval can see a string handed to a timer.
      globals: { setTimeout: 'readonly', setInterval: 'readonly', setImmediate: 'readonly' },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
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
];
