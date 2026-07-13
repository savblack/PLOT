import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // The mobile workspace is TypeScript/Expo with its own tsc typecheck (npm run
  // typecheck -w @plot/mobile); the web flat config does not apply to it.
  globalIgnores(['dist', '**/dist/**', '.claude', 'apps/website/.claude', 'supabase/.temp', 'node_modules', 'archive/', 'apps/mobile']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]', destructuredArrayIgnorePattern: '^[A-Z_]' }],
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'apps/web/playwright.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Vercel serverless / edge functions for the app (app.theplot.tv/api/*)
    files: ['apps/web/api/**/*.{js,jsx,mjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['apps/web/src/router.jsx', 'apps/web/src/App.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
