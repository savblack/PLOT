import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    // @storybook/addon-vitest 10.6 sizes the page for each story's viewport
    // through `@vitest/browser/context`, which Vitest 5 no longer serves (its
    // browser API moved to `vitest/browser`). The addon swallows the failed
    // import, so every story silently ran at Vitest's 414px default instead
    // of the story's viewport or Storybook's 1200 x 900. Point the old name
    // at the new module until the addon catches up.
    alias: { '@vitest/browser/context': 'vitest/browser' },
  },
  test: {
    projects: [
      {
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
            tags: { include: ['interaction-test'] },
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
