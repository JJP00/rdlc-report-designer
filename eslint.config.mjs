// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/.turbo/**',
      'apps/back/release/**',
      'apps/back/test-results/**',
      'apps/back/playwright-report/**',
      'fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Ficheros JS sueltos (scripts, configs): entorno Node.
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Guiones de QA que se evalúan dentro del renderer (page.evaluate):
    // usan `window`/`document` del navegador aunque se lancen desde Node.
    files: ['apps/back/scripts/bench.mjs', 'apps/back/tmp-*.mjs'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // Renderer (React): reglas de hooks.
    // Nota: el preset `recommended` de v7 incluye las reglas del React Compiler
    // (set-state-in-effect, refs, immutability...), que hoy marcan patrones
    // válidos de la app. Se activarán por fases; de momento, las dos clásicas.
    files: ['apps/front/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
