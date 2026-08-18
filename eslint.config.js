import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // storybook-static is gitignored build output, but ESLint doesn't read
  // .gitignore — without this, `npm run check` fails locally for anyone who has
  // run a Storybook build, while passing in CI's clean checkout.
  // apps/mobile is linted by its own TypeScript block below (it used to be
  // ignored wholesale); its native and Expo build dirs stay ignored.
  globalIgnores([
    'dist', '**/dist/**',
    'storybook-static', '**/storybook-static/**',
    '.claude', 'apps/website/.claude',
    'supabase/.temp', 'node_modules', 'archive/',
    'apps/mobile/ios/**', 'apps/mobile/android/**', 'apps/mobile/.expo/**',
    // Same story: `wrangler dev`/`pages dev` writes bundled worker JS under
    // .wrangler/tmp/, so running `npm run dev:website` once leaves lint errors
    // behind in generated code that nobody wrote.
    '.wrangler', '**/.wrangler/**',
  ]),
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
    // packages/core's tests run under `node --test`, unlike the browser/RN
    // source they cover — same reasoning as the scripts/** block above.
    files: ['packages/core/tests/**/*.js'],
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
  {
    // The Expo/React Native app. `tsc --noEmit` already covers types, so this
    // block is for the things types don't catch — hook rules, unused code,
    // accidental globals. Type-aware linting is deliberately not enabled: it
    // needs a project service and roughly triples lint time for little gain
    // on top of the existing typecheck.
    files: ['apps/mobile/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        // React Native injects these; they're not in any globals.* preset.
        __DEV__: 'readonly',
        ErrorUtils: 'readonly',
      },
    },
    rules: {
      // Base no-unused-vars doesn't understand TS type positions or
      // parameter properties — the TS-aware version replaces it. Same ignore
      // pattern as the web block for consistency.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^[A-Z_]',
        destructuredArrayIgnorePattern: '^[A-Z_]',
      }],

      // require() is how React Native loads bundled assets (fonts, images) —
      // Metro resolves them at build time and there is no ESM equivalent.
      '@typescript-eslint/no-require-imports': 'off',

      // Both of the below are ratcheted at 'warn' rather than 'error': they
      // are real signal, but each has a large pre-existing backlog that would
      // block CI on day one. Fix opportunistically; don't add new ones.

      // ~127 occurrences. Typing them properly is its own piece of work, not
      // something to bundle into enabling lint.
      '@typescript-eslint/no-explicit-any': 'warn',

      // ~34 occurrences, and mostly a false positive here: the rule targets
      // React DOM patterns, but the bulk of these are the standard RN
      // `useRef(new Animated.Value(x)).current` idiom, where reading .current
      // in render is exactly how the API is meant to be used. A minority are
      // genuine render-phase ref writes worth revisiting (see Turnstile.tsx).
      'react-hooks/refs': 'warn',

      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Mobile's Metro/Babel config is CommonJS Node, not app code.
    files: ['apps/mobile/*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
  },
  {
    // Storybook config is Node too, but ESM.
    files: ['apps/mobile/.storybook*/**/*.{js,ts}'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
])
