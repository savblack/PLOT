import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // The mobile workspace is TypeScript/Expo with its own tsc typecheck (npm run
  // typecheck -w @plot/mobile); the web flat config does not apply to it.
  // storybook-static is gitignored build output, but ESLint doesn't read
  // .gitignore — without this, `npm run check` fails locally for anyone who has
  // run a Storybook build, while passing in CI's clean checkout.
  globalIgnores(['dist', '**/dist/**', 'storybook-static', '**/storybook-static/**', '.claude', 'apps/website/.claude', 'supabase/.temp', 'node_modules', 'archive/', 'apps/mobile']),
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
    // Cloudflare Pages Functions (SSR routes) for the app (repo-root functions/)
    // and the marketing site (apps/website/functions/).
    files: ['functions/**/*.{js,mjs}', 'apps/website/functions/**/*.{js,mjs}'],
    languageOptions: {
      // HTMLRewriter is a Cloudflare Workers/Pages runtime global, not part of
      // any globals.* preset.
      globals: { ...globals.node, ...globals.browser, HTMLRewriter: 'readonly' },
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
